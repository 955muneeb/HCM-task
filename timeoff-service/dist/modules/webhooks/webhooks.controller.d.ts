import { ConfigService } from '@nestjs/config';
import { BalancesService } from '../balances/balances.service';
interface HcmWebhookPayload {
    eventType: string;
    employeeId: string;
    locationId: string;
    balanceDays: number;
    reason?: string;
    timestamp?: string;
}
export declare class WebhooksController {
    private readonly balancesService;
    private readonly config;
    private readonly logger;
    constructor(balancesService: BalancesService, config: ConfigService);
    handleBalanceUpdate(payload: HcmWebhookPayload, signature: string, timestamp: string): Promise<{
        message: string;
        employeeId?: undefined;
        locationId?: undefined;
        balanceDays?: undefined;
    } | {
        message: string;
        employeeId: string;
        locationId: string;
        balanceDays: number;
    }>;
    private validateSignature;
}
export {};
