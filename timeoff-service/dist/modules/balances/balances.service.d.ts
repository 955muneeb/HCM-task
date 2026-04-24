import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { LeaveBalance } from './entities/leave-balance.entity';
import { SyncLog, SyncType } from '../sync/entities/sync-log.entity';
import { HcmService, HcmBalanceRecord } from '../hcm/hcm.service';
export declare class BalancesService {
    private readonly balanceRepo;
    private readonly syncLogRepo;
    private readonly hcmService;
    private readonly config;
    private readonly dataSource;
    private readonly logger;
    constructor(balanceRepo: Repository<LeaveBalance>, syncLogRepo: Repository<SyncLog>, hcmService: HcmService, config: ConfigService, dataSource: DataSource);
    getBalance(employeeId: string, locationId: string): Promise<{
        balance: LeaveBalance;
        stale: boolean;
        refreshed: boolean;
    }>;
    syncRealtime(employeeId: string, locationId: string): Promise<LeaveBalance>;
    processBatchSync(records: HcmBalanceRecord[]): Promise<{
        processed: number;
        errors: number;
    }>;
    upsertFromHcm(data: HcmBalanceRecord, syncType: SyncType): Promise<LeaveBalance>;
    deductBalance(employeeId: string, locationId: string, days: number): Promise<LeaveBalance>;
    restoreBalance(employeeId: string, locationId: string, days: number): Promise<LeaveBalance>;
    private isStale;
}
