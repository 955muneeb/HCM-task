"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BalancesModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const balances_controller_1 = require("./balances.controller");
const balances_service_1 = require("./balances.service");
const leave_balance_entity_1 = require("./entities/leave-balance.entity");
const sync_log_entity_1 = require("../sync/entities/sync-log.entity");
const hcm_module_1 = require("../hcm/hcm.module");
let BalancesModule = class BalancesModule {
};
exports.BalancesModule = BalancesModule;
exports.BalancesModule = BalancesModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([leave_balance_entity_1.LeaveBalance, sync_log_entity_1.SyncLog]), hcm_module_1.HcmModule],
        controllers: [balances_controller_1.BalancesController],
        providers: [balances_service_1.BalancesService],
        exports: [balances_service_1.BalancesService],
    })
], BalancesModule);
//# sourceMappingURL=balances.module.js.map