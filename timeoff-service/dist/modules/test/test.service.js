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
exports.TestService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const leave_balance_entity_1 = require("../balances/entities/leave-balance.entity");
const time_off_request_entity_1 = require("../requests/entities/time-off-request.entity");
const sync_log_entity_1 = require("../sync/entities/sync-log.entity");
let TestService = class TestService {
    constructor(balanceRepo, requestRepo, syncLogRepo) {
        this.balanceRepo = balanceRepo;
        this.requestRepo = requestRepo;
        this.syncLogRepo = syncLogRepo;
    }
    async clearDatabase() {
        await this.requestRepo.createQueryBuilder().delete().from(time_off_request_entity_1.TimeOffRequest).execute();
        await this.syncLogRepo.createQueryBuilder().delete().from(sync_log_entity_1.SyncLog).execute();
        await this.balanceRepo.createQueryBuilder().delete().from(leave_balance_entity_1.LeaveBalance).execute();
    }
};
exports.TestService = TestService;
exports.TestService = TestService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(leave_balance_entity_1.LeaveBalance)),
    __param(1, (0, typeorm_1.InjectRepository)(time_off_request_entity_1.TimeOffRequest)),
    __param(2, (0, typeorm_1.InjectRepository)(sync_log_entity_1.SyncLog)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], TestService);
//# sourceMappingURL=test.service.js.map