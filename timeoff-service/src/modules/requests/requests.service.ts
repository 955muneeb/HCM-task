import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Not } from 'typeorm';
import { TimeOffRequest, RequestStatus } from './entities/time-off-request.entity';
import { BalancesService } from '../balances/balances.service';
import { HcmService } from '../hcm/hcm.service';
import { CreateRequestDto, RejectRequestDto } from './dto/request.dto';

@Injectable()
export class RequestsService {
  private readonly logger = new Logger(RequestsService.name);

  constructor(
    @InjectRepository(TimeOffRequest)
    private readonly requestRepo: Repository<TimeOffRequest>,
    private readonly balancesService: BalancesService,
    private readonly hcmService: HcmService,
  ) {}

  // ── Submit new request ─────────────────────────────────────────────────
  async createRequest(dto: CreateRequestDto): Promise<TimeOffRequest> {
    // 1. Validate dates
    if (new Date(dto.startDate) > new Date(dto.endDate)) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    // 2. Check for overlapping requests (PENDING or AWAITING_APPROVAL)
    await this.checkOverlap(dto.employeeId, dto.locationId, dto.startDate, dto.endDate);

    // 3. Defensive: get local balance (triggers HCM refresh if stale)
    const { balance } = await this.balancesService.getBalance(dto.employeeId, dto.locationId);

    // 4. Account for already-committed pending days
    const pendingDays = await this.getPendingDays(dto.employeeId, dto.locationId);
    const effectiveBalance = balance.balanceDays - pendingDays;

    if (effectiveBalance < dto.daysRequested) {
      throw new UnprocessableEntityException({
        error: 'INSUFFICIENT_BALANCE',
        availableDays: effectiveBalance,
        requestedDays: dto.daysRequested,
        message: `Insufficient balance. Available: ${effectiveBalance} days (including ${pendingDays} pending), Requested: ${dto.daysRequested} days`,
      });
    }

    // 5. Save request as PENDING first
    const request = this.requestRepo.create({
      ...dto,
      status: RequestStatus.PENDING,
    });
    const saved = await this.requestRepo.save(request);

    // 6. Submit to HCM
    try {
      const hcmResult = await this.hcmService.submitRequest({
        employeeId:    dto.employeeId,
        locationId:    dto.locationId,
        daysRequested: dto.daysRequested,
        startDate:     dto.startDate,
        endDate:       dto.endDate,
        requestType:   'DEDUCT',
      });

      // Check if HCM returned a server error (treat as unreachable)
      if (hcmResult.isServerError) {
        this.logger.warn(
          `HCM server error for request ${saved.id}: ${hcmResult.errorCode}. Leaving as PENDING for retry`,
        );
        saved.status = RequestStatus.PENDING;
      } else if (hcmResult.success) {
        saved.status          = RequestStatus.AWAITING_APPROVAL;
        saved.hcmReferenceId  = hcmResult.referenceId;

        // Post-write verification: re-fetch balance to confirm HCM applied the deduction
        try {
          await this.balancesService.syncRealtime(dto.employeeId, dto.locationId);
        } catch {
          this.logger.warn(`Post-write verification failed for request ${saved.id}; continuing`);
        }
      } else {
        saved.status = RequestStatus.FAILED;
        this.logger.warn(
          `HCM rejected request ${saved.id}: ${hcmResult.errorCode} - ${hcmResult.errorMessage}`,
        );
        // Fail with HCM's reason
        await this.requestRepo.save(saved);
        throw new UnprocessableEntityException({
          error: hcmResult.errorCode || 'HCM_REJECTED',
          message: hcmResult.errorMessage || 'HCM rejected the request',
        });
      }
    } catch (err: any) {
      if (err?.status === 422 || err?.status === 400) throw err;

      // HCM is unreachable — leave as PENDING for retry
      this.logger.error(`HCM unreachable for request ${saved.id}: ${err.message}`);
      saved.status = RequestStatus.PENDING;
    }

    return this.requestRepo.save(saved);
  }

  // ── Get single request ─────────────────────────────────────────────────
  async getRequest(id: number): Promise<TimeOffRequest> {
    const request = await this.requestRepo.findOne({ where: { id } });
    if (!request) throw new NotFoundException(`Request ${id} not found`);
    return request;
  }

  // ── List requests for an employee ──────────────────────────────────────
  async listRequests(employeeId: string, status?: RequestStatus): Promise<TimeOffRequest[]> {
    const where: any = { employeeId };
    if (status) where.status = status;
    return this.requestRepo.find({ where, order: { createdAt: 'DESC' } });
  }

  // ── Manager approves ───────────────────────────────────────────────────
  async approveRequest(id: number): Promise<TimeOffRequest> {
    const request = await this.getRequest(id);

    if (request.status !== RequestStatus.AWAITING_APPROVAL) {
      throw new BadRequestException(
        `Cannot approve request in status: ${request.status}. Must be AWAITING_APPROVAL`,
      );
    }

    request.status = RequestStatus.APPROVED;
    const saved = await this.requestRepo.save(request);
    this.logger.log(`Request ${id} approved by manager`);
    return saved;
  }

  // ── Manager rejects ────────────────────────────────────────────────────
  async rejectRequest(id: number, dto: RejectRequestDto): Promise<TimeOffRequest> {
    const request = await this.getRequest(id);

    if (request.status !== RequestStatus.AWAITING_APPROVAL) {
      throw new BadRequestException(
        `Cannot reject request in status: ${request.status}. Must be AWAITING_APPROVAL`,
      );
    }

    // Reverse the deduction in HCM
    try {
      await this.hcmService.submitRequest({
        employeeId:    request.employeeId,
        locationId:    request.locationId,
        daysRequested: request.daysRequested,
        startDate:     request.startDate,
        endDate:       request.endDate,
        requestType:   'REVERSE',
      });
    } catch (err: any) {
      this.logger.error(`HCM reversal failed for rejected request ${id}: ${err.message}`);
      // Continue anyway — sync will reconcile the balance later
    }

    // Refresh local balance after reversal
    try {
      await this.balancesService.syncRealtime(request.employeeId, request.locationId);
    } catch { /* non-critical */ }

    request.status = RequestStatus.REJECTED;
    if (dto?.reason) request.notes = dto.reason;
    return this.requestRepo.save(request);
  }

  // ── Employee cancels ───────────────────────────────────────────────────
  async cancelRequest(id: number): Promise<TimeOffRequest> {
    const request = await this.getRequest(id);

    const cancellableStatuses = [RequestStatus.PENDING, RequestStatus.AWAITING_APPROVAL];
    if (!cancellableStatuses.includes(request.status)) {
      throw new BadRequestException(
        `Cannot cancel request in status: ${request.status}`,
      );
    }

    // If HCM was already notified (AWAITING_APPROVAL), we must reverse there too
    if (request.status === RequestStatus.AWAITING_APPROVAL) {
      try {
        await this.hcmService.submitRequest({
          employeeId:    request.employeeId,
          locationId:    request.locationId,
          daysRequested: request.daysRequested,
          startDate:     request.startDate,
          endDate:       request.endDate,
          requestType:   'REVERSE',
        });
        await this.balancesService.syncRealtime(request.employeeId, request.locationId);
      } catch (err: any) {
        this.logger.error(`HCM reversal failed for cancelled request ${id}: ${err.message}`);
      }
    }

    request.status = RequestStatus.CANCELLED;
    return this.requestRepo.save(request);
  }

  // ── Helpers ────────────────────────────────────────────────────────────

  // Sum of days in PENDING or AWAITING_APPROVAL state for this employee+location
  private async getPendingDays(employeeId: string, locationId: string): Promise<number> {
    const pending = await this.requestRepo.find({
      where: {
        employeeId,
        locationId,
        status: In([RequestStatus.PENDING, RequestStatus.AWAITING_APPROVAL]),
      },
    });
    return pending.reduce((sum, r) => sum + r.daysRequested, 0);
  }

  // Check for date overlap with existing active requests
  private async checkOverlap(
    employeeId: string,
    locationId: string,
    startDate: string,
    endDate: string,
    excludeId?: number,
  ): Promise<void> {
    const activeStatuses = [
      RequestStatus.PENDING,
      RequestStatus.AWAITING_APPROVAL,
      RequestStatus.APPROVED,
    ];

    const existing = await this.requestRepo.find({
      where: {
        employeeId,
        locationId,
        status: In(activeStatuses),
      },
    });

    const start = new Date(startDate);
    const end   = new Date(endDate);

    for (const req of existing) {
      if (excludeId && req.id === excludeId) continue;
      const rStart = new Date(req.startDate);
      const rEnd   = new Date(req.endDate);
      // Overlap: not (end < rStart || start > rEnd)
      if (!(end < rStart || start > rEnd)) {
        throw new ConflictException(
          `Date range overlaps with existing request #${req.id} (${req.startDate} to ${req.endDate}, status: ${req.status})`,
        );
      }
    }
  }
}
