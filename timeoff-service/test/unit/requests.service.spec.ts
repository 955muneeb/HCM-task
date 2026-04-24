import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
  ConflictException,
} from '@nestjs/common';
import { RequestsService } from '../../../src/modules/requests/requests.service';
import { TimeOffRequest, RequestStatus } from '../../../src/modules/requests/entities/time-off-request.entity';
import { BalancesService } from '../../../src/modules/balances/balances.service';
import { HcmService } from '../../../src/modules/hcm/hcm.service';

const mockRequest = (overrides = {}): TimeOffRequest => ({
  id: 1,
  employeeId: 'EMP-001',
  locationId: 'LOC-UK',
  daysRequested: 3,
  startDate: '2026-06-01',
  endDate: '2026-06-03',
  status: RequestStatus.AWAITING_APPROVAL,
  hcmReferenceId: 'HCM-REF-123',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as TimeOffRequest);

const makeRepo = () => ({
  findOne: jest.fn(),
  find:    jest.fn().mockResolvedValue([]),
  create:  jest.fn().mockImplementation((d) => d),
  save:    jest.fn().mockImplementation((d) => ({ ...d, id: d.id || 1 })),
});

const makeBalances = () => ({
  getBalance:    jest.fn().mockResolvedValue({ balance: { balanceDays: 10 }, stale: false }),
  syncRealtime:  jest.fn().mockResolvedValue({}),
  deductBalance: jest.fn(),
  restoreBalance: jest.fn(),
});

const makeHcm = () => ({
  fetchBalance:  jest.fn(),
  submitRequest: jest.fn().mockResolvedValue({ success: true, referenceId: 'HCM-REF-999' }),
});

describe('RequestsService', () => {
  let service: RequestsService;
  let repo: ReturnType<typeof makeRepo>;
  let balancesService: ReturnType<typeof makeBalances>;
  let hcmService: ReturnType<typeof makeHcm>;

  beforeEach(async () => {
    repo            = makeRepo();
    balancesService = makeBalances();
    hcmService      = makeHcm();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RequestsService,
        { provide: getRepositoryToken(TimeOffRequest), useValue: repo },
        { provide: BalancesService, useValue: balancesService },
        { provide: HcmService,      useValue: hcmService },
      ],
    }).compile();

    service = module.get<RequestsService>(RequestsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────────────────
  describe('createRequest', () => {
    const validDto = {
      employeeId: 'EMP-001',
      locationId: 'LOC-UK',
      daysRequested: 3,
      startDate: '2026-06-01',
      endDate: '2026-06-05',
    };

    it('creates a request successfully and returns AWAITING_APPROVAL', async () => {
      repo.save.mockImplementation((d) => ({ ...d, id: 42 }));

      const result = await service.createRequest(validDto);

      expect(hcmService.submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({ requestType: 'DEDUCT', employeeId: 'EMP-001' }),
      );
      expect(result.status).toBe(RequestStatus.AWAITING_APPROVAL);
      expect(result.hcmReferenceId).toBe('HCM-REF-999');
    });

    it('throws BadRequestException when endDate is before startDate', async () => {
      await expect(
        service.createRequest({ ...validDto, startDate: '2026-06-10', endDate: '2026-06-01' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws UnprocessableEntityException when balance is insufficient', async () => {
      balancesService.getBalance.mockResolvedValue({ balance: { balanceDays: 2 }, stale: false });

      await expect(service.createRequest({ ...validDto, daysRequested: 5 })).rejects.toThrow(
        UnprocessableEntityException,
      );
      expect(hcmService.submitRequest).not.toHaveBeenCalled();
    });

    it('accounts for pending days when checking balance', async () => {
      // 10 balance, but 8 days already pending
      balancesService.getBalance.mockResolvedValue({ balance: { balanceDays: 10 }, stale: false });
      repo.find.mockResolvedValue([
        mockRequest({ status: RequestStatus.PENDING, daysRequested: 8 }),
      ]);

      await expect(service.createRequest({ ...validDto, daysRequested: 3 })).rejects.toThrow(
        UnprocessableEntityException,
      );
    });

    it('saves request as PENDING when HCM is unavailable', async () => {
      hcmService.submitRequest.mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.createRequest(validDto);

      expect(result.status).toBe(RequestStatus.PENDING);
    });

    it('marks request as FAILED and throws when HCM explicitly rejects', async () => {
      hcmService.submitRequest.mockResolvedValue({
        success: false,
        errorCode: 'HCM_BALANCE_LOCKED',
        errorMessage: 'Balance is locked for this period',
      });

      await expect(service.createRequest(validDto)).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws ConflictException when dates overlap with an existing active request', async () => {
      // Return an existing APPROVED request that overlaps
      repo.find.mockResolvedValueOnce([]); // pending days check
      repo.find.mockResolvedValueOnce([   // overlap check
        mockRequest({ status: RequestStatus.APPROVED, startDate: '2026-06-03', endDate: '2026-06-08' }),
      ]);

      await expect(service.createRequest(validDto)).rejects.toThrow(ConflictException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('approveRequest', () => {
    it('approves a request in AWAITING_APPROVAL status', async () => {
      repo.findOne.mockResolvedValue(mockRequest({ status: RequestStatus.AWAITING_APPROVAL }));

      const result = await service.approveRequest(1);

      expect(result.status).toBe(RequestStatus.APPROVED);
    });

    it('throws BadRequestException when request is not in AWAITING_APPROVAL', async () => {
      repo.findOne.mockResolvedValue(mockRequest({ status: RequestStatus.APPROVED }));

      await expect(service.approveRequest(1)).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException for non-existent request', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.approveRequest(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('rejectRequest', () => {
    it('rejects request and triggers HCM reversal', async () => {
      repo.findOne.mockResolvedValue(mockRequest({ status: RequestStatus.AWAITING_APPROVAL }));
      hcmService.submitRequest.mockResolvedValue({ success: true, referenceId: 'REVERSAL-1' });

      const result = await service.rejectRequest(1, { reason: 'Understaffed that week' });

      expect(hcmService.submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({ requestType: 'REVERSE' }),
      );
      expect(result.status).toBe(RequestStatus.REJECTED);
    });

    it('still marks as REJECTED even if HCM reversal call fails', async () => {
      repo.findOne.mockResolvedValue(mockRequest({ status: RequestStatus.AWAITING_APPROVAL }));
      hcmService.submitRequest.mockRejectedValue(new Error('HCM down'));

      const result = await service.rejectRequest(1, {});

      // Should still complete locally — sync will reconcile
      expect(result.status).toBe(RequestStatus.REJECTED);
    });

    it('throws BadRequestException when request is not rejectable', async () => {
      repo.findOne.mockResolvedValue(mockRequest({ status: RequestStatus.APPROVED }));

      await expect(service.rejectRequest(1, {})).rejects.toThrow(BadRequestException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('cancelRequest', () => {
    it('cancels a PENDING request without calling HCM', async () => {
      repo.findOne.mockResolvedValue(mockRequest({ status: RequestStatus.PENDING }));

      const result = await service.cancelRequest(1);

      expect(hcmService.submitRequest).not.toHaveBeenCalled();
      expect(result.status).toBe(RequestStatus.CANCELLED);
    });

    it('cancels an AWAITING_APPROVAL request and triggers HCM reversal', async () => {
      repo.findOne.mockResolvedValue(mockRequest({ status: RequestStatus.AWAITING_APPROVAL }));
      hcmService.submitRequest.mockResolvedValue({ success: true });

      const result = await service.cancelRequest(1);

      expect(hcmService.submitRequest).toHaveBeenCalledWith(
        expect.objectContaining({ requestType: 'REVERSE' }),
      );
      expect(result.status).toBe(RequestStatus.CANCELLED);
    });

    it('throws BadRequestException when trying to cancel an APPROVED request', async () => {
      repo.findOne.mockResolvedValue(mockRequest({ status: RequestStatus.APPROVED }));

      await expect(service.cancelRequest(1)).rejects.toThrow(BadRequestException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('getRequest', () => {
    it('returns request when found', async () => {
      const req = mockRequest();
      repo.findOne.mockResolvedValue(req);

      const result = await service.getRequest(1);
      expect(result).toEqual(req);
    });

    it('throws NotFoundException when request does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getRequest(99)).rejects.toThrow(NotFoundException);
    });
  });
});
