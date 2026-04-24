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
var WebhooksController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhooksController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const balances_service_1 = require("../balances/balances.service");
const sync_log_entity_1 = require("../sync/entities/sync-log.entity");
const crypto = require("crypto");
let WebhooksController = WebhooksController_1 = class WebhooksController {
    constructor(balancesService, config) {
        this.balancesService = balancesService;
        this.config = config;
        this.logger = new common_1.Logger(WebhooksController_1.name);
    }
    async handleBalanceUpdate(payload, signature, timestamp) {
        this.validateSignature(payload, signature, timestamp);
        this.logger.log(`HCM webhook received: ${payload.eventType} for ${payload.employeeId}/${payload.locationId} ` +
            `-> ${payload.balanceDays} days (reason: ${payload.reason || 'N/A'})`);
        if (payload.balanceDays === undefined || payload.balanceDays === null) {
            this.logger.warn('Webhook payload missing balanceDays — ignoring');
            return { message: 'Ignored: missing balanceDays' };
        }
        const updated = await this.balancesService.upsertFromHcm({
            employeeId: payload.employeeId,
            locationId: payload.locationId,
            balanceDays: payload.balanceDays,
        }, sync_log_entity_1.SyncType.WEBHOOK);
        return {
            message: 'Balance updated from HCM webhook',
            employeeId: updated.employeeId,
            locationId: updated.locationId,
            balanceDays: updated.balanceDays,
        };
    }
    validateSignature(payload, signature, timestamp) {
        const secret = this.config.get('HCM_WEBHOOK_SECRET', '');
        if (!secret || secret === 'mock-webhook-hmac-secret')
            return;
        if (!signature) {
            throw new common_1.UnauthorizedException('Missing x-hcm-signature header');
        }
        const body = JSON.stringify(payload);
        const message = `${timestamp || ''}.${body}`;
        const expected = crypto
            .createHmac('sha256', secret)
            .update(message)
            .digest('hex');
        if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
            throw new common_1.UnauthorizedException('Invalid HCM webhook signature');
        }
    }
};
exports.WebhooksController = WebhooksController;
__decorate([
    (0, common_1.Post)('hcm/balance-update'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Body)()),
    __param(1, (0, common_1.Headers)('x-hcm-signature')),
    __param(2, (0, common_1.Headers)('x-hcm-timestamp')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "handleBalanceUpdate", null);
exports.WebhooksController = WebhooksController = WebhooksController_1 = __decorate([
    (0, common_1.Controller)('webhooks'),
    __metadata("design:paramtypes", [balances_service_1.BalancesService,
        config_1.ConfigService])
], WebhooksController);
//# sourceMappingURL=webhooks.controller.js.map