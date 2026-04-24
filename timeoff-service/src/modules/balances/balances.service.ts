import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { LeaveBalance } from './entities/leave-balance.entity';
import { SyncLog, SyncType, SyncStatus } from '../sync/entities/sync-log.entity';
import { HcmService, HcmBalanceRecord } from '../hcm/hcm.service';

@Injectable()
export class BalancesService {
  private readonly logger = new Logger(BalancesService.name);

  constructor(
    @InjectRepository(LeaveBalance)
    private readonly balanceRepo: Repository<LeaveBalance>,
    @InjectRepository(SyncLog)
    private readonly syncLogRepo: Repository<SyncLog>,
    private readonly hcmService: HcmService,
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
  ) {}

  // ── Get balance (with automatic staleness refresh) ─────────────────────
  async getBalance(employeeId: string, locationId: string): Promise<{
    balance: LeaveBalance;
    stale: boolean;
    refreshed: boolean;
  }> {
    let balance = await this.balanceRepo.findOne({
      where: { employeeId, locationId },
    });

    if (!balance) {
      // First time — try to fetch from HCM and seed locally
      try {
        const hcmData = await this.hcmService.fetchBalance(employeeId, locationId);
        balance = await this.upsertFromHcm(hcmData, SyncType.REALTIME);
        return { balance, stale: false, refreshed: true };
      } catch {
        throw new NotFoundException(
          `No balance found for employee ${employeeId} at location ${locationId}`,
        );
      }
    }

    // Check freshness
    const isStale = this.isStale(balance.lastSyncedAt);
    if (isStale) {
      try {
        const hcmData = await this.hcmService.fetchBalance(employeeId, locationId);
        balance = await this.upsertFromHcm(hcmData, SyncType.REALTIME);
        return { balance, stale: false, refreshed: true };
      } catch (err) {
        // HCM unavailable — return cached value with stale flag
        this.logger.warn(
          `HCM unavailable for balance refresh (${employeeId}, ${locationId}). Returning cached value.`,
        );
        return { balance, stale: true, refreshed: false };
      }
    }

    return { balance, stale: false, refreshed: false };
  }

  // ── Manual real-time sync for one employee+location ────────────────────
  async syncRealtime(employeeId: string, locationId: string): Promise<LeaveBalance> {
    const hcmData = await this.hcmService.fetchBalance(employeeId, locationId);
    return this.upsertFromHcm(hcmData, SyncType.MANUAL);
  }

  // ── Batch sync: receive full corpus from HCM ───────────────────────────
  async processBatchSync(records: HcmBalanceRecord[]): Promise<{
    processed: number;
    errors: number;
  }> {
    let processed = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Process each record in its own transaction for isolation
    for (const record of records) {
      try {
        await this.upsertFromHcm(record, SyncType.BATCH);
        processed++;
      } catch (err: any) {
        errors++;
        errorDetails.push(`${record.employeeId}/${record.locationId}: ${err.message}`);
        this.logger.error(`Batch sync failed for ${record.employeeId}/${record.locationId}: ${err.message}`);
      }
    }

    // Log the sync event
    const log = this.syncLogRepo.create({
      syncType: SyncType.BATCH,
      status: errors === 0 ? SyncStatus.SUCCESS : processed > 0 ? SyncStatus.PARTIAL : SyncStatus.FAILURE,
      recordsProcessed: processed,
      errorDetails: errorDetails.length > 0 ? JSON.stringify(errorDetails) : null,
    });
    await this.syncLogRepo.save(log);

    this.logger.log(`Batch sync complete: ${processed} processed, ${errors} errors`);
    return { processed, errors };
  }

  // ── Upsert a balance record from HCM (idempotent) ─────────────────────
  async upsertFromHcm(data: HcmBalanceRecord, syncType: SyncType): Promise<LeaveBalance> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveBalance);

      let balance = await repo.findOne({
        where: { employeeId: data.employeeId, locationId: data.locationId },
      });

      if (balance) {
        // HCM always wins — overwrite local value
        balance.balanceDays  = data.balanceDays;
        balance.lastSyncedAt = new Date();
      } else {
        balance = repo.create({
          employeeId:   data.employeeId,
          locationId:   data.locationId,
          balanceDays:  data.balanceDays,
          lastSyncedAt: new Date(),
        });
      }

      const saved = await repo.save(balance);

      // Log individual realtime/webhook syncs (not batch — logged separately)
      if (syncType !== SyncType.BATCH) {
        const logRepo = manager.getRepository(SyncLog);
        await logRepo.save(logRepo.create({
          syncType,
          employeeId:       data.employeeId,
          locationId:       data.locationId,
          status:           SyncStatus.SUCCESS,
          recordsProcessed: 1,
        }));
      }

      return saved;
    });
  }

  // ── Deduct days from local balance (called when HCM confirms request) ──
  async deductBalance(
    employeeId: string,
    locationId: string,
    days: number,
  ): Promise<LeaveBalance> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveBalance);

      const balance = await repo.findOne({
        where: { employeeId, locationId },
        lock: { mode: 'optimistic', version: undefined },
      });

      if (!balance) {
        throw new NotFoundException(`Balance not found for ${employeeId}/${locationId}`);
      }

      if (balance.balanceDays < days) {
        throw new ConflictException(
          `Insufficient balance: available=${balance.balanceDays}, requested=${days}`,
        );
      }

      balance.balanceDays = parseFloat((balance.balanceDays - days).toFixed(4));
      return repo.save(balance);
    });
  }

  // ── Restore days to local balance (reversal on reject/cancel) ──────────
  async restoreBalance(
    employeeId: string,
    locationId: string,
    days: number,
  ): Promise<LeaveBalance> {
    return this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(LeaveBalance);
      const balance = await repo.findOne({ where: { employeeId, locationId } });
      if (!balance) {
        throw new NotFoundException(`Balance not found for ${employeeId}/${locationId}`);
      }
      balance.balanceDays = parseFloat((balance.balanceDays + days).toFixed(4));
      return repo.save(balance);
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  private isStale(lastSyncedAt: Date | null): boolean {
    if (!lastSyncedAt) return true;
    // Read threshold at runtime to allow test manipulation
    const minutes = this.config.get<number>('BALANCE_STALE_THRESHOLD_MINUTES', 5);
    const staleThresholdMs = minutes * 60 * 1000;
    return Date.now() - new Date(lastSyncedAt).getTime() > staleThresholdMs;
  }
}
