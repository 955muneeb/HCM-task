import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosError } from 'axios';

export interface HcmBalanceRecord {
  employeeId: string;
  locationId: string;
  balanceDays: number;
}

export interface HcmRequestPayload {
  employeeId: string;
  locationId: string;
  daysRequested: number;
  startDate: string;
  endDate: string;
  requestType: 'DEDUCT' | 'REVERSE';
}

export interface HcmRequestResult {
  success: boolean;
  referenceId?: string;
  isServerError?: boolean; // Indicates if HCM returned a 5xx error (treat as unreachable)
  errorCode?: string;
  errorMessage?: string;
}

@Injectable()
export class HcmService {
  private readonly logger  = new Logger(HcmService.name);
  private readonly client: AxiosInstance;
  private readonly retryAttempts: number;
  private readonly retryDelayMs: number;

  constructor(private readonly config: ConfigService) {
    this.retryAttempts = config.get<number>('HCM_RETRY_ATTEMPTS', 3);
    this.retryDelayMs  = config.get<number>('HCM_RETRY_DELAY_MS', 1000);

    this.client = axios.create({
      baseURL: config.get<string>('HCM_BASE_URL', 'http://localhost:4000'),
      timeout: config.get<number>('HCM_TIMEOUT_MS', 10000),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.get<string>('HCM_API_KEY', ''),
      },
    });
  }

  // Fetch a single employee+location balance from HCM
  async fetchBalance(employeeId: string, locationId: string): Promise<HcmBalanceRecord> {
    return this.withRetry(async () => {
      const response = await this.client.get('/api/balances', {
        params: { employeeId, locationId },
      });
      const data = response.data;

      // Defensive: validate the response has the expected fields
      if (data?.balanceDays === undefined || data?.balanceDays === null) {
        throw new Error(`HCM returned unexpected balance response: ${JSON.stringify(data)}`);
      }

      return {
        employeeId: data.employeeId || employeeId,
        locationId: data.locationId || locationId,
        balanceDays: Number(data.balanceDays),
      };
    }, `fetchBalance(${employeeId}, ${locationId})`);
  }

  // Submit a time-off deduction or reversal to HCM
  async submitRequest(payload: HcmRequestPayload): Promise<HcmRequestResult> {
    return this.withRetry(async () => {
      try {
        const response = await this.client.post('/api/requests', payload);
        const data = response.data;

        // Defensive: treat missing referenceId as a soft failure
        if (!data?.referenceId) {
          this.logger.warn(`HCM returned success but no referenceId for ${payload.employeeId}`);
        }

        return { success: true, referenceId: data?.referenceId };
      } catch (err: any) {
        // HCM returned an error response — parse it defensively
        const status = err?.response?.status;
        const body   = err?.response?.data || {};

        this.logger.warn(
          `HCM rejected request for ${payload.employeeId}: status=${status}, body=${JSON.stringify(body)}`,
        );

        return {
          success: false,
          isServerError: status && status >= 500, // Flag server errors for caller
          errorCode:    body?.errorCode    || `HCM_ERROR_${status || 'UNKNOWN'}`,
          errorMessage: body?.errorMessage || body?.message || 'HCM rejected the request',
        };
      }
    }, `submitRequest(${payload.employeeId})`);
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async withRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        const isNetworkErr = !err?.response; // No response = network/timeout error

        if (!isNetworkErr || attempt === this.retryAttempts) {
          // Application-level error or last retry — stop retrying
          break;
        }

        const delay = this.retryDelayMs * Math.pow(2, attempt - 1); // Exponential backoff
        this.logger.warn(`HCM call [${context}] attempt ${attempt} failed. Retrying in ${delay}ms...`);
        await this.sleep(delay);
      }
    }

    this.logger.error(`HCM call [${context}] failed after ${this.retryAttempts} attempts: ${lastError.message}`);
    throw new ServiceUnavailableException(`HCM is unavailable. ${lastError.message}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
