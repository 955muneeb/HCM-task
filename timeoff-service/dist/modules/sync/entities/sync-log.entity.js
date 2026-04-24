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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SyncLog = exports.SyncStatus = exports.SyncType = void 0;
const typeorm_1 = require("typeorm");
var SyncType;
(function (SyncType) {
    SyncType["REALTIME"] = "REALTIME";
    SyncType["BATCH"] = "BATCH";
    SyncType["MANUAL"] = "MANUAL";
    SyncType["WEBHOOK"] = "WEBHOOK";
})(SyncType || (exports.SyncType = SyncType = {}));
var SyncStatus;
(function (SyncStatus) {
    SyncStatus["SUCCESS"] = "SUCCESS";
    SyncStatus["FAILURE"] = "FAILURE";
    SyncStatus["PARTIAL"] = "PARTIAL";
})(SyncStatus || (exports.SyncStatus = SyncStatus = {}));
let SyncLog = class SyncLog {
};
exports.SyncLog = SyncLog;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], SyncLog.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'sync_type' }),
    __metadata("design:type", String)
], SyncLog.prototype, "syncType", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'employee_id', nullable: true }),
    __metadata("design:type", String)
], SyncLog.prototype, "employeeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'location_id', nullable: true }),
    __metadata("design:type", String)
], SyncLog.prototype, "locationId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'status' }),
    __metadata("design:type", String)
], SyncLog.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'records_processed', default: 0 }),
    __metadata("design:type", Number)
], SyncLog.prototype, "recordsProcessed", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'error_details', nullable: true, type: 'text' }),
    __metadata("design:type", String)
], SyncLog.prototype, "errorDetails", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'synced_at' }),
    __metadata("design:type", Date)
], SyncLog.prototype, "syncedAt", void 0);
exports.SyncLog = SyncLog = __decorate([
    (0, typeorm_1.Entity)('sync_log')
], SyncLog);
//# sourceMappingURL=sync-log.entity.js.map