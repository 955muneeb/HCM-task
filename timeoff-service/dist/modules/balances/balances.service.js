"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BalancesService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalancesService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const config_1 = require("@nestjs/config");
const leave_balance_entity_1 = require("./entities/leave-balance.entity");
const sync_log_entity_1 = require("../sync/entities/sync-log.entity");
const hcm_service_1 = require("../hcm/hcm.service");
let BalancesService = BalancesService_1 = class BalancesService {
    constructor(balanceRepo, syncLogRepo, hcmService, config, dataSource) {
        this.balanceRepo = balanceRepo;
        this.syncLogRepo = syncLogRepo;
        this.hcmService = hcmService;
        this.config = config;
        this.dataSource = dataSource;
        this.logger = new common_1.Logger(BalancesService_1.name);
    }
    async getBalance(employeeId, locationId) {
        let balance = await this.balanceRepo.findOne({
            where: { employeeId, locationId },
        });
        if (!balance) {
            try {
                const hcmData = await this.hcmService.fetchBalance(employeeId, locationId);
                balance = await this.upsertFromHcm(hcmData, sync_log_entity_1.SyncType.REALTIME);
                return { balance, stale: false, refreshed: true };
            }
            catch {
                throw new common_1.NotFoundException(`No balance found for employee ${employeeId} at location ${locationId}`);
            }
        }
        const isStale = this.isStale(balance.lastSyncedAt);
        if (isStale) {
            try {
                const hcmData = await this.hcmService.fetchBalance(employeeId, locationId);
                balance = await this.upsertFromHcm(hcmData, sync_log_entity_1.SyncType.REALTIME);
                return { balance, stale: false, refreshed: true };
            }
            catch (err) {
                this.logger.warn(`HCM unavailable for balance refresh (${employeeId}, ${locationId}). Returning cached value.`);
                return { balance, stale: true, refreshed: false };
            }
        }
        return { balance, stale: false, refreshed: false };
    }
    async syncRealtime(employeeId, locationId) {
        const hcmData = await this.hcmService.fetchBalance(employeeId, locationId);
        return this.upsertFromHcm(hcmData, sync_log_entity_1.SyncType.MANUAL);
    }
    async processBatchSync(records) {
        let processed = 0;
        let errors = 0;
        const errorDetails = [];
        for (const record of records) {
            try {
                await this.upsertFromHcm(record, sync_log_entity_1.SyncType.BATCH);
                processed++;
            }
            catch (err) {
                errors++;
                errorDetails.push(`${record.employeeId}/${record.locationId}: ${err.message}`);
                this.logger.error(`Batch sync failed for ${record.employeeId}/${record.locationId}: ${err.message}`);
            }
        }
        const log = this.syncLogRepo.create({
            syncType: sync_log_entity_1.SyncType.BATCH,
            status: errors === 0 ? sync_log_entity_1.SyncStatus.SUCCESS : processed > 0 ? sync_log_entity_1.SyncStatus.PARTIAL : sync_log_entity_1.SyncStatus.FAILURE,
            recordsProcessed: processed,
            errorDetails: errorDetails.length > 0 ? JSON.stringify(errorDetails) : null,
        });
        await this.syncLogRepo.save(log);
        this.logger.log(`Batch sync complete: ${processed} processed, ${errors} errors`);
        return { processed, errors };
    }
    async upsertFromHcm(data, syncType) {
        return this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(leave_balance_entity_1.LeaveBalance);
            let balance = await repo.findOne({
                where: { employeeId: data.employeeId, locationId: data.locationId },
            });
            if (balance) {
                balance.balanceDays = data.balanceDays;
                balance.lastSyncedAt = new Date();
            }
            else {
                balance = repo.create({
                    employeeId: data.employeeId,
                    locationId: data.locationId,
                    balanceDays: data.balanceDays,
                    lastSyncedAt: new Date(),
                });
            }
            const saved = await repo.save(balance);
            if (syncType !== sync_log_entity_1.SyncType.BATCH) {
                const logRepo = manager.getRepository(sync_log_entity_1.SyncLog);
                await logRepo.save(logRepo.create({
                    syncType,
                    employeeId: data.employeeId,
                    locationId: data.locationId,
                    status: sync_log_entity_1.SyncStatus.SUCCESS,
                    recordsProcessed: 1,
                }));
            }
            return saved;
        });
    }
    async deductBalance(employeeId, locationId, days) {
        return this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(leave_balance_entity_1.LeaveBalance);
            const balance = await repo.findOne({
                where: { employeeId, locationId },
                lock: { mode: 'optimistic', version: undefined },
            });
            if (!balance) {
                throw new common_1.NotFoundException(`Balance not found for ${employeeId}/${locationId}`);
            }
            if (balance.balanceDays < days) {
                throw new common_1.ConflictException(`Insufficient balance: available=${balance.balanceDays}, requested=${days}`);
            }
            balance.balanceDays = parseFloat((balance.balanceDays - days).toFixed(4));
            return repo.save(balance);
        });
    }
    async restoreBalance(employeeId, locationId, days) {
        return this.dataSource.transaction(async (manager) => {
            const repo = manager.getRepository(leave_balance_entity_1.LeaveBalance);
            const balance = await repo.findOne({ where: { employeeId, locationId } });
            if (!balance) {
                throw new common_1.NotFoundException(`Balance not found for ${employeeId}/${locationId}`);
            }
            balance.balanceDays = parseFloat((balance.balanceDays + days).toFixed(4));
            return repo.save(balance);
        });
    }
    isStale(lastSyncedAt) {
        if (!lastSyncedAt)
            return true;
        const minutes = this.config.get('BALANCE_STALE_THRESHOLD_MINUTES', 5);
        const staleThresholdMs = minutes * 60 * 1000;
        return Date.now() - new Date(lastSyncedAt).getTime() > staleThresholdMs;
    }
};
exports.BalancesService = BalancesService;
exports.BalancesService = BalancesService = BalancesService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(leave_balance_entity_1.LeaveBalance)),
    __param(1, (0, typeorm_1.InjectRepository)(sync_log_entity_1.SyncLog)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        hcm_service_1.HcmService,
        config_1.ConfigService,
        typeorm_2.DataSource])
], BalancesService);
//# sourceMappingURL=balances.service.js.map