import {
  Controller, Post, Body, Headers, HttpCode,
  HttpStatus, Logger, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BalancesService } from '../balances/balances.service';
import { SyncType } from '../sync/entities/sync-log.entity';
import * as crypto from 'crypto';

interface HcmWebhookPayload {
  eventType: string;
  employeeId: string;
  locationId: string;
  balanceDays: number;
  reason?: string;
  timestamp?: string;
}

@Controller('webhooks')
export class WebhooksController {
  private readonly logger = new Logger(WebhooksController.name);

  constructor(
    private readonly balancesService: BalancesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * POST /webhooks/hcm/balance-update
   * Receives push notifications from HCM when a balance changes outside ExampleHR.
   * Examples: work anniversary bonus, year-start accrual, manual HR correction.
   *
   * Security: validates HMAC-SHA256 signature in x-hcm-signature header.
   */
  @Post('hcm/balance-update')
  @HttpCode(HttpStatus.OK)
  async handleBalanceUpdate(
    @Body() payload: HcmWebhookPayload,
    @Headers('x-hcm-signature') signature: string,
    @Headers('x-hcm-timestamp') timestamp: string,
  ) {
    // Validate HMAC signature to prevent spoofed webhook calls
    this.validateSignature(payload, signature, timestamp);

    this.logger.log(
      `HCM webhook received: ${payload.eventType} for ${payload.employeeId}/${payload.locationId} ` +
      `-> ${payload.balanceDays} days (reason: ${payload.reason || 'N/A'})`,
    );

    if (payload.balanceDays === undefined || payload.balanceDays === null) {
      this.logger.warn('Webhook payload missing balanceDays — ignoring');
      return { message: 'Ignored: missing balanceDays' };
    }

    // Upsert the balance with the HCM value (HCM always wins)
    const updated = await this.balancesService.upsertFromHcm(
      {
        employeeId:  payload.employeeId,
        locationId:  payload.locationId,
        balanceDays: payload.balanceDays,
      },
      SyncType.WEBHOOK,
    );

    return {
      message: 'Balance updated from HCM webhook',
      employeeId:  updated.employeeId,
      locationId:  updated.locationId,
      balanceDays: updated.balanceDays,
    };
  }

  // ── HMAC signature validation ─────────────────────────────────────────
  private validateSignature(payload: any, signature: string, timestamp: string): void {
    const secret = this.config.get<string>('HCM_WEBHOOK_SECRET', '');

    // In test/dev with no secret configured, skip validation
    if (!secret || secret === 'mock-webhook-hmac-secret') return;

    if (!signature) {
      throw new UnauthorizedException('Missing x-hcm-signature header');
    }

    const body    = JSON.stringify(payload);
    const message = `${timestamp || ''}.${body}`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(message)
      .digest('hex');

    if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
      throw new UnauthorizedException('Invalid HCM webhook signature');
    }
  }
}
