import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { BalancesService } from '../../../src/modules/balances/balances.service';
import { LeaveBalance } from '../../../src/modules/balances/entities/leave-balance.entity';
import { SyncLog } from '../../../src/modules/sync/entities/sync-log.entity';
import { HcmService } from '../../../src/modules/hcm/hcm.service';
import { ConfigService } from '@nestjs/config';

// ── Mock factories ────────────────────────────────────────────────────────────
const mockBalance = (overrides = {}): LeaveBalance => ({
  id: 1,
  employeeId: 'EMP-001',
  locationId: 'LOC-UK',
  balanceDays: 10,
  lastSyncedAt: new Date(), // fresh
  version: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
} as LeaveBalance);

const makeRepo = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
});

const makeDataSource = () => ({
  transaction: jest.fn().mockImplementation(async (cb) => {
    const manager = {
      getRepository: jest.fn().mockReturnValue({
        findOne: jest.fn(),
        find: jest.fn(),
        create: jest.fn((data) => data),
        save: jest.fn((data) => ({ ...data, id: 1 })),
      }),
    };
    return cb(manager);
  }),
});

const makeHcm = () => ({
  fetchBalance: jest.fn(),
  submitRequest: jest.fn(),
});

const makeConfig = () => ({
  get: jest.fn().mockImplementation((key, def) => {
    if (key === 'BALANCE_STALE_THRESHOLD_MINUTES') return 5;
    return def;
  }),
});

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('BalancesService', () => {
  let service: BalancesService;
  let balanceRepo: ReturnType<typeof makeRepo>;
  let syncLogRepo: ReturnType<typeof makeRepo>;
  let hcmService: ReturnType<typeof makeHcm>;
  let dataSource: ReturnType<typeof makeDataSource>;

  beforeEach(async () => {
    balanceRepo = makeRepo();
    syncLogRepo = makeRepo();
    hcmService  = makeHcm();
    dataSource  = makeDataSource();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BalancesService,
        { provide: getRepositoryToken(LeaveBalance), useValue: balanceRepo },
        { provide: getRepositoryToken(SyncLog),      useValue: syncLogRepo },
        { provide: HcmService,    useValue: hcmService },
        { provide: ConfigService, useValue: makeConfig() },
        { provide: 'DataSource',  useValue: dataSource },
      ],
    }).compile();

    service = module.get<BalancesService>(BalancesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────────────────
  describe('getBalance', () => {
    it('returns cached balance when fresh (no HCM call)', async () => {
      const bal = mockBalance({ lastSyncedAt: new Date() });
      balanceRepo.findOne.mockResolvedValue(bal);

      const result = await service.getBalance('EMP-001', 'LOC-UK');

      expect(result.balance).toEqual(bal);
      expect(result.stale).toBe(false);
      expect(result.refreshed).toBe(false);
      expect(hcmService.fetchBalance).not.toHaveBeenCalled();
    });

    it('triggers HCM refresh when balance is stale', async () => {
      const staleDate = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
      const bal = mockBalance({ lastSyncedAt: staleDate });
      balanceRepo.findOne.mockResolvedValue(bal);
      hcmService.fetchBalance.mockResolvedValue({
        employeeId: 'EMP-001', locationId: 'LOC-UK', balanceDays: 12,
      });

      const result = await service.getBalance('EMP-001', 'LOC-UK');

      expect(hcmService.fetchBalance).toHaveBeenCalledWith('EMP-001', 'LOC-UK');
      expect(result.refreshed).toBe(true);
    });

    it('returns stale balance with stale=true when HCM is unreachable', async () => {
      const staleDate = new Date(Date.now() - 10 * 60 * 1000);
      const bal = mockBalance({ lastSyncedAt: staleDate });
      balanceRepo.findOne.mockResolvedValue(bal);
      hcmService.fetchBalance.mockRejectedValue(new Error('HCM timeout'));

      const result = await service.getBalance('EMP-001', 'LOC-UK');

      expect(result.stale).toBe(true);
      expect(result.refreshed).toBe(false);
      expect(result.balance).toEqual(bal);
    });

    it('seeds from HCM when no local balance exists', async () => {
      balanceRepo.findOne.mockResolvedValue(null);
      hcmService.fetchBalance.mockResolvedValue({
        employeeId: 'EMP-002', locationId: 'LOC-DE', balanceDays: 20,
      });

      const result = await service.getBalance('EMP-002', 'LOC-DE');

      expect(hcmService.fetchBalance).toHaveBeenCalledWith('EMP-002', 'LOC-DE');
      expect(result.refreshed).toBe(true);
    });

    it('throws NotFoundException when no local balance and HCM also fails', async () => {
      balanceRepo.findOne.mockResolvedValue(null);
      hcmService.fetchBalance.mockRejectedValue(new Error('Not found'));

      await expect(service.getBalance('EMP-999', 'LOC-XX')).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('processBatchSync', () => {
    it('processes all records and returns correct counts', async () => {
      syncLogRepo.create.mockImplementation((d) => d);
      syncLogRepo.save.mockResolvedValue({});

      const records = [
        { employeeId: 'EMP-001', locationId: 'LOC-UK', balanceDays: 10 },
        { employeeId: 'EMP-002', locationId: 'LOC-UK', balanceDays: 15 },
      ];

      const result = await service.processBatchSync(records);

      expect(result.processed).toBe(2);
      expect(result.errors).toBe(0);
    });

    it('is idempotent — processing same records twice gives same result', async () => {
      syncLogRepo.create.mockImplementation((d) => d);
      syncLogRepo.save.mockResolvedValue({});

      const records = [{ employeeId: 'EMP-001', locationId: 'LOC-UK', balanceDays: 10 }];

      const r1 = await service.processBatchSync(records);
      const r2 = await service.processBatchSync(records);

      expect(r1.processed).toBe(1);
      expect(r2.processed).toBe(1);
    });

    it('continues processing remaining records when one fails', async () => {
      syncLogRepo.create.mockImplementation((d) => d);
      syncLogRepo.save.mockResolvedValue({});

      // Make transaction throw on first record
      let callCount = 0;
      dataSource.transaction.mockImplementation(async (cb) => {
        callCount++;
        if (callCount === 1) throw new Error('DB error on first record');
        const manager = {
          getRepository: jest.fn().mockReturnValue({
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn((d) => d),
            save: jest.fn((d) => d),
          }),
        };
        return cb(manager);
      });

      const records = [
        { employeeId: 'EMP-BAD', locationId: 'LOC-UK', balanceDays: 10 },
        { employeeId: 'EMP-GOOD', locationId: 'LOC-UK', balanceDays: 15 },
      ];

      const result = await service.processBatchSync(records);

      expect(result.errors).toBe(1);
      expect(result.processed).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('deductBalance', () => {
    it('deducts days correctly from local balance', async () => {
      const repoMock = {
        findOne: jest.fn().mockResolvedValue(mockBalance({ balanceDays: 10 })),
        save: jest.fn().mockImplementation((b) => b),
      };
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: () => repoMock }),
      );

      const result = await service.deductBalance('EMP-001', 'LOC-UK', 3);
      expect(result.balanceDays).toBe(7);
    });

    it('throws ConflictException when balance is insufficient', async () => {
      const repoMock = {
        findOne: jest.fn().mockResolvedValue(mockBalance({ balanceDays: 2 })),
        save: jest.fn(),
      };
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: () => repoMock }),
      );

      await expect(service.deductBalance('EMP-001', 'LOC-UK', 5)).rejects.toThrow(ConflictException);
    });

    it('throws NotFoundException when balance record does not exist', async () => {
      const repoMock = {
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
      };
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: () => repoMock }),
      );

      await expect(service.deductBalance('EMP-999', 'LOC-UK', 1)).rejects.toThrow(NotFoundException);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('restoreBalance', () => {
    it('adds days back to local balance', async () => {
      const repoMock = {
        findOne: jest.fn().mockResolvedValue(mockBalance({ balanceDays: 7 })),
        save: jest.fn().mockImplementation((b) => b),
      };
      dataSource.transaction.mockImplementation(async (cb) =>
        cb({ getRepository: () => repoMock }),
      );

      const result = await service.restoreBalance('EMP-001', 'LOC-UK', 3);
      expect(result.balanceDays).toBe(10);
    });
  });
});
