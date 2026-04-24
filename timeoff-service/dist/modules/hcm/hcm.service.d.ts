import { ConfigService } from '@nestjs/config';
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
    isServerError?: boolean;
    errorCode?: string;
    errorMessage?: string;
}
export declare class HcmService {
    private readonly config;
    private readonly logger;
    private readonly client;
    private readonly retryAttempts;
    private readonly retryDelayMs;
    constructor(config: ConfigService);
    fetchBalance(employeeId: string, locationId: string): Promise<HcmBalanceRecord>;
    submitRequest(payload: HcmRequestPayload): Promise<HcmRequestResult>;
    private withRetry;
    private sleep;
}
