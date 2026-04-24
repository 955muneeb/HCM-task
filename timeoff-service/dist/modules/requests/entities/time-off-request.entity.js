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
exports.TimeOffRequest = exports.RequestStatus = void 0;
const typeorm_1 = require("typeorm");
var RequestStatus;
(function (RequestStatus) {
    RequestStatus["PENDING"] = "PENDING";
    RequestStatus["HCM_SUBMITTED"] = "HCM_SUBMITTED";
    RequestStatus["AWAITING_APPROVAL"] = "AWAITING_APPROVAL";
    RequestStatus["APPROVED"] = "APPROVED";
    RequestStatus["REJECTED"] = "REJECTED";
    RequestStatus["CANCELLED"] = "CANCELLED";
    RequestStatus["FAILED"] = "FAILED";
})(RequestStatus || (exports.RequestStatus = RequestStatus = {}));
let TimeOffRequest = class TimeOffRequest {
};
exports.TimeOffRequest = TimeOffRequest;
__decorate([
    (0, typeorm_1.PrimaryGeneratedColumn)(),
    __metadata("design:type", Number)
], TimeOffRequest.prototype, "id", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'employee_id' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "employeeId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'location_id' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "locationId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'days_requested', type: 'real' }),
    __metadata("design:type", Number)
], TimeOffRequest.prototype, "daysRequested", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'start_date' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "startDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'end_date' }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "endDate", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'status', default: RequestStatus.PENDING }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "status", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'hcm_reference_id', nullable: true }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "hcmReferenceId", void 0);
__decorate([
    (0, typeorm_1.Column)({ name: 'notes', nullable: true }),
    __metadata("design:type", String)
], TimeOffRequest.prototype, "notes", void 0);
__decorate([
    (0, typeorm_1.CreateDateColumn)({ name: 'created_at' }),
    __metadata("design:type", Date)
], TimeOffRequest.prototype, "createdAt", void 0);
__decorate([
    (0, typeorm_1.UpdateDateColumn)({ name: 'updated_at' }),
    __metadata("design:type", Date)
], TimeOffRequest.prototype, "updatedAt", void 0);
exports.TimeOffRequest = TimeOffRequest = __decorate([
    (0, typeorm_1.Entity)('time_off_requests')
], TimeOffRequest);
//# sourceMappingURL=time-off-request.entity.js.map