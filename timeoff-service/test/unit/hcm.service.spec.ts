import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { HcmService } from '../../../src/modules/hcm/hcm.service';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const makeConfig = () => ({
  get: jest.fn().mockImplementation((key: string, def: any) => {
    const vals: Record<string, any> = {
      HCM_BASE_URL:       'http://localhost:4000',
      HCM_API_KEY:        'test-key',
      HCM_TIMEOUT_MS:     5000,
      HCM_RETRY_ATTEMPTS: 2,
      HCM_RETRY_DELAY_MS: 10, // fast retries for tests
    };
    return vals[key] !== undefined ? vals[key] : def;
  }),
});

describe('HcmService', () => {
  let service: HcmService;
  let mockAxiosInstance: any;

  beforeEach(async () => {
    mockAxiosInstance = { get: jest.fn(), post: jest.fn() };
    mockedAxios.create = jest.fn().mockReturnValue(mockAxiosInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        HcmService,
        { provide: ConfigService, useValue: makeConfig() },
      ],
    }).compile();

    service = module.get<HcmService>(HcmService);
  });

  afterEach(() => jest.clearAllMocks());

  // ────────────────────────────────────────────────────────────────────────────
  describe('fetchBalance', () => {
    it('returns parsed balance record from HCM', async () => {
      mockAxiosInstance.get.mockResolvedValue({
        data: { employeeId: 'EMP-001', locationId: 'LOC-UK', balanceDays: 10 },
      });

      const result = await service.fetchBalance('EMP-001', 'LOC-UK');

      expect(result).toEqual({ employeeId: 'EMP-001', locationId: 'LOC-UK', balanceDays: 10 });
    });

    it('throws when HCM response is missing balanceDays', async () => {
      mockAxiosInstance.get.mockResolvedValue({ data: { employeeId: 'EMP-001' } });

      await expect(service.fetchBalance('EMP-001', 'LOC-UK')).rejects.toThrow();
    });

    it('retries on network error and eventually throws ServiceUnavailableException', async () => {
      const netErr = new Error('ECONNREFUSED');
      (netErr as any).response = undefined; // network error, no response
      mockAxiosInstance.get.mockRejectedValue(netErr);

      await expect(service.fetchBalance('EMP-001', 'LOC-UK')).rejects.toThrow(
        ServiceUnavailableException,
      );
      // Should have retried (2 attempts configured)
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
    });

    it('does NOT retry on application-level errors (4xx with response)', async () => {
      const appErr: any = new Error('Not found');
      appErr.response = { status: 404, data: { error: 'NOT_FOUND' } };
      mockAxiosInstance.get.mockRejectedValue(appErr);

      await expect(service.fetchBalance('EMP-999', 'LOC-XX')).rejects.toThrow();
      // Should NOT have retried — application error, not network error
      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  describe('submitRequest', () => {
    const payload = {
      employeeId: 'EMP-001',
      locationId: 'LOC-UK',
      daysRequested: 3,
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      requestType: 'DEDUCT' as const,
    };

    it('returns success result with referenceId', async () => {
      mockAxiosInstance.post.mockResolvedValue({
        data: { referenceId: 'HCM-REF-001', success: true },
      });

      const result = await service.submitRequest(payload);

      expect(result.success).toBe(true);
      expect(result.referenceId).toBe('HCM-REF-001');
    });

    it('returns success=false with errorCode when HCM returns 422', async () => {
      const hcmErr: any = new Error('HCM rejected');
      hcmErr.response = {
        status: 422,
        data: { errorCode: 'INSUFFICIENT_BALANCE', errorMessage: 'Not enough days' },
      };
      mockAxiosInstance.post.mockRejectedValue(hcmErr);

      const result = await service.submitRequest(payload);

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe('INSUFFICIENT_BALANCE');
    });

    it('handles missing referenceId gracefully (unreliable HCM response)', async () => {
      // HCM returns 200 but no referenceId — simulates unreliable behaviour
      mockAxiosInstance.post.mockResolvedValue({ data: { success: true } });

      const result = await service.submitRequest(payload);

      expect(result.success).toBe(true);
      expect(result.referenceId).toBeUndefined();
    });

    it('throws ServiceUnavailableException after all retries fail (network error)', async () => {
      const netErr = new Error('timeout');
      (netErr as any).response = undefined;
      mockAxiosInstance.post.mockRejectedValue(netErr);

      await expect(service.submitRequest(payload)).rejects.toThrow(ServiceUnavailableException);
    });
  });
});
