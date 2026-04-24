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
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalancesController = void 0;
const common_1 = require("@nestjs/common");
const balances_service_1 = require("./balances.service");
const balance_dto_1 = require("./dto/balance.dto");
let BalancesController = class BalancesController {
    constructor(balancesService) {
        this.balancesService = balancesService;
    }
    async getBalance(employeeId, locationId, res) {
        const result = await this.balancesService.getBalance(employeeId, locationId);
        if (result.stale) {
            res.setHeader('X-Balance-Stale', 'true');
            res.setHeader('X-Balance-Warning', 'HCM unavailable; showing cached value');
        }
        if (result.refreshed) {
            res.setHeader('X-Balance-Refreshed', 'true');
        }
        return res.status(common_1.HttpStatus.OK).json({
            employeeId: result.balance.employeeId,
            locationId: result.balance.locationId,
            balanceDays: result.balance.balanceDays,
            lastSyncedAt: result.balance.lastSyncedAt,
        });
    }
    async syncRealtime(dto) {
        const balance = await this.balancesService.syncRealtime(dto.employeeId, dto.locationId);
        return {
            message: 'Real-time sync completed',
            balanceDays: balance.balanceDays,
            lastSyncedAt: balance.lastSyncedAt,
        };
    }
    async syncBatch(body) {
        const { records } = body;
        if (!records || !Array.isArray(records)) {
            return { message: 'No records provided', processed: 0, errors: 0 };
        }
        const result = await this.balancesService.processBatchSync(records);
        return { message: 'Batch sync completed', ...result };
    }
};
exports.BalancesController = BalancesController;
__decorate([
    (0, common_1.Get)(':employeeId/:locationId'),
    __param(0, (0, common_1.Param)('employeeId')),
    __param(1, (0, common_1.Param)('locationId')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], BalancesController.prototype, "getBalance", null);
__decorate([
    (0, common_1.Post)('sync/realtime'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [balance_dto_1.SyncBalanceDto]),
    __metadata("design:returntype", Promise)
], BalancesController.prototype, "syncRealtime", null);
__decorate([
    (0, common_1.Post)('sync/batch'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], BalancesController.prototype, "syncBatch", null);
exports.BalancesController = BalancesController = __decorate([
    (0, common_1.Controller)('balances'),
    __metadata("design:paramtypes", [balances_service_1.BalancesService])
], BalancesController);
//# sourceMappingURL=balances.controller.js.map