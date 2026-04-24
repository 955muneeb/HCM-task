"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TestModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const test_controller_1 = require("./test.controller");
const test_service_1 = require("./test.service");
const leave_balance_entity_1 = require("../balances/entities/leave-balance.entity");
const time_off_request_entity_1 = require("../requests/entities/time-off-request.entity");
const sync_log_entity_1 = require("../sync/entities/sync-log.entity");
let TestModule = class TestModule {
};
exports.TestModule = TestModule;
exports.TestModule = TestModule = __decorate([
    (0, common_1.Module)({
        imports: [typeorm_1.TypeOrmModule.forFeature([leave_balance_entity_1.LeaveBalance, time_off_request_entity_1.TimeOffRequest, sync_log_entity_1.SyncLog])],
        controllers: [test_controller_1.TestController],
        providers: [test_service_1.TestService],
        exports: [test_service_1.TestService],
    })
], TestModule);
//# sourceMappingURL=test.module.js.map