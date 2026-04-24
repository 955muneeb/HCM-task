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
var RequestsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const time_off_request_entity_1 = require("./entities/time-off-request.entity");
const balances_service_1 = require("../balances/balances.service");
const hcm_service_1 = require("../hcm/hcm.service");
let RequestsService = RequestsService_1 = class RequestsService {
    constructor(requestRepo, balancesService, hcmService) {
        this.requestRepo = requestRepo;
        this.balancesService = balancesService;
        this.hcmService = hcmService;
        this.logger = new common_1.Logger(RequestsService_1.name);
    }
    async createRequest(dto) {
        if (new Date(dto.startDate) > new Date(dto.endDate)) {
            throw new common_1.BadRequestException('startDate must be on or before endDate');
        }
        await this.checkOverlap(dto.employeeId, dto.locationId, dto.startDate, dto.endDate);
        const { balance } = await this.balancesService.getBalance(dto.employeeId, dto.locationId);
        const pendingDays = await this.getPendingDays(dto.employeeId, dto.locationId);
        const effectiveBalance = balance.balanceDays - pendingDays;
        if (effectiveBalance < dto.daysRequested) {
            throw new common_1.UnprocessableEntityException({
                error: 'INSUFFICIENT_BALANCE',
                availableDays: effectiveBalance,
                requestedDays: dto.daysRequested,
                message: `Insufficient balance. Available: ${effectiveBalance} days (including ${pendingDays} pending), Requested: ${dto.daysRequested} days`,
            });
        }
        const request = this.requestRepo.create({
            ...dto,
            status: time_off_request_entity_1.RequestStatus.PENDING,
        });
        const saved = await this.requestRepo.save(request);
        try {
            const hcmResult = await this.hcmService.submitRequest({
                employeeId: dto.employeeId,
                locationId: dto.locationId,
                daysRequested: dto.daysRequested,
                startDate: dto.startDate,
                endDate: dto.endDate,
                requestType: 'DEDUCT',
            });
            if (hcmResult.isServerError) {
                this.logger.warn(`HCM server error for request ${saved.id}: ${hcmResult.errorCode}. Leaving as PENDING for retry`);
                saved.status = time_off_request_entity_1.RequestStatus.PENDING;
            }
            else if (hcmResult.success) {
                saved.status = time_off_request_entity_1.RequestStatus.AWAITING_APPROVAL;
                saved.hcmReferenceId = hcmResult.referenceId;
                try {
                    await this.balancesService.syncRealtime(dto.employeeId, dto.locationId);
                }
                catch {
                    this.logger.warn(`Post-write verification failed for request ${saved.id}; continuing`);
                }
            }
            else {
                saved.status = time_off_request_entity_1.RequestStatus.FAILED;
                this.logger.warn(`HCM rejected request ${saved.id}: ${hcmResult.errorCode} - ${hcmResult.errorMessage}`);
                await this.requestRepo.save(saved);
                throw new common_1.UnprocessableEntityException({
                    error: hcmResult.errorCode || 'HCM_REJECTED',
                    message: hcmResult.errorMessage || 'HCM rejected the request',
                });
            }
        }
        catch (err) {
            if (err?.status === 422 || err?.status === 400)
                throw err;
            this.logger.error(`HCM unreachable for request ${saved.id}: ${err.message}`);
            saved.status = time_off_request_entity_1.RequestStatus.PENDING;
        }
        return this.requestRepo.save(saved);
    }
    async getRequest(id) {
        const request = await this.requestRepo.findOne({ where: { id } });
        if (!request)
            throw new common_1.NotFoundException(`Request ${id} not found`);
        return request;
    }
    async listRequests(employeeId, status) {
        const where = { employeeId };
        if (status)
            where.status = status;
        return this.requestRepo.find({ where, order: { createdAt: 'DESC' } });
    }
    async approveRequest(id) {
        const request = await this.getRequest(id);
        if (request.status !== time_off_request_entity_1.RequestStatus.AWAITING_APPROVAL) {
            throw new common_1.BadRequestException(`Cannot approve request in status: ${request.status}. Must be AWAITING_APPROVAL`);
        }
        request.status = time_off_request_entity_1.RequestStatus.APPROVED;
        const saved = await this.requestRepo.save(request);
        this.logger.log(`Request ${id} approved by manager`);
        return saved;
    }
    async rejectRequest(id, dto) {
        const request = await this.getRequest(id);
        if (request.status !== time_off_request_entity_1.RequestStatus.AWAITING_APPROVAL) {
            throw new common_1.BadRequestException(`Cannot reject request in status: ${request.status}. Must be AWAITING_APPROVAL`);
        }
        try {
            await this.hcmService.submitRequest({
                employeeId: request.employeeId,
                locationId: request.locationId,
                daysRequested: request.daysRequested,
                startDate: request.startDate,
                endDate: request.endDate,
                requestType: 'REVERSE',
            });
        }
        catch (err) {
            this.logger.error(`HCM reversal failed for rejected request ${id}: ${err.message}`);
        }
        try {
            await this.balancesService.syncRealtime(request.employeeId, request.locationId);
        }
        catch { }
        request.status = time_off_request_entity_1.RequestStatus.REJECTED;
        if (dto?.reason)
            request.notes = dto.reason;
        return this.requestRepo.save(request);
    }
    async cancelRequest(id) {
        const request = await this.getRequest(id);
        const cancellableStatuses = [time_off_request_entity_1.RequestStatus.PENDING, time_off_request_entity_1.RequestStatus.AWAITING_APPROVAL];
        if (!cancellableStatuses.includes(request.status)) {
            throw new common_1.BadRequestException(`Cannot cancel request in status: ${request.status}`);
        }
        if (request.status === time_off_request_entity_1.RequestStatus.AWAITING_APPROVAL) {
            try {
                await this.hcmService.submitRequest({
                    employeeId: request.employeeId,
                    locationId: request.locationId,
                    daysRequested: request.daysRequested,
                    startDate: request.startDate,
                    endDate: request.endDate,
                    requestType: 'REVERSE',
                });
                await this.balancesService.syncRealtime(request.employeeId, request.locationId);
            }
            catch (err) {
                this.logger.error(`HCM reversal failed for cancelled request ${id}: ${err.message}`);
            }
        }
        request.status = time_off_request_entity_1.RequestStatus.CANCELLED;
        return this.requestRepo.save(request);
    }
    async getPendingDays(employeeId, locationId) {
        const pending = await this.requestRepo.find({
            where: {
                employeeId,
                locationId,
                status: (0, typeorm_2.In)([time_off_request_entity_1.RequestStatus.PENDING, time_off_request_entity_1.RequestStatus.AWAITING_APPROVAL]),
            },
        });
        return pending.reduce((sum, r) => sum + r.daysRequested, 0);
    }
    async checkOverlap(employeeId, locationId, startDate, endDate, excludeId) {
        const activeStatuses = [
            time_off_request_entity_1.RequestStatus.PENDING,
            time_off_request_entity_1.RequestStatus.AWAITING_APPROVAL,
            time_off_request_entity_1.RequestStatus.APPROVED,
        ];
        const existing = await this.requestRepo.find({
            where: {
                employeeId,
                locationId,
                status: (0, typeorm_2.In)(activeStatuses),
            },
        });
        const start = new Date(startDate);
        const end = new Date(endDate);
        for (const req of existing) {
            if (excludeId && req.id === excludeId)
                continue;
            const rStart = new Date(req.startDate);
            const rEnd = new Date(req.endDate);
            if (!(end < rStart || start > rEnd)) {
                throw new common_1.ConflictException(`Date range overlaps with existing request #${req.id} (${req.startDate} to ${req.endDate}, status: ${req.status})`);
            }
        }
    }
};
exports.RequestsService = RequestsService;
exports.RequestsService = RequestsService = RequestsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(time_off_request_entity_1.TimeOffRequest)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        balances_service_1.BalancesService,
        hcm_service_1.HcmService])
], RequestsService);
//# sourceMappingURL=requests.service.js.map