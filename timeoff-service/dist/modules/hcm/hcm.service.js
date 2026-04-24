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
var HcmService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HcmService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = require("axios");
let HcmService = HcmService_1 = class HcmService {
    constructor(config) {
        this.config = config;
        this.logger = new common_1.Logger(HcmService_1.name);
        this.retryAttempts = config.get('HCM_RETRY_ATTEMPTS', 3);
        this.retryDelayMs = config.get('HCM_RETRY_DELAY_MS', 1000);
        this.client = axios_1.default.create({
            baseURL: config.get('HCM_BASE_URL', 'http://localhost:4000'),
            timeout: config.get('HCM_TIMEOUT_MS', 10000),
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': config.get('HCM_API_KEY', ''),
            },
        });
    }
    async fetchBalance(employeeId, locationId) {
        return this.withRetry(async () => {
            const response = await this.client.get('/api/balances', {
                params: { employeeId, locationId },
            });
            const data = response.data;
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
    async submitRequest(payload) {
        return this.withRetry(async () => {
            try {
                const response = await this.client.post('/api/requests', payload);
                const data = response.data;
                if (!data?.referenceId) {
                    this.logger.warn(`HCM returned success but no referenceId for ${payload.employeeId}`);
                }
                return { success: true, referenceId: data?.referenceId };
            }
            catch (err) {
                const status = err?.response?.status;
                const body = err?.response?.data || {};
                this.logger.warn(`HCM rejected request for ${payload.employeeId}: status=${status}, body=${JSON.stringify(body)}`);
                return {
                    success: false,
                    isServerError: status && status >= 500,
                    errorCode: body?.errorCode || `HCM_ERROR_${status || 'UNKNOWN'}`,
                    errorMessage: body?.errorMessage || body?.message || 'HCM rejected the request',
                };
            }
        }, `submitRequest(${payload.employeeId})`);
    }
    async withRetry(fn, context) {
        let lastError;
        for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
            try {
                return await fn();
            }
            catch (err) {
                lastError = err;
                const isNetworkErr = !err?.response;
                if (!isNetworkErr || attempt === this.retryAttempts) {
                    break;
                }
                const delay = this.retryDelayMs * Math.pow(2, attempt - 1);
                this.logger.warn(`HCM call [${context}] attempt ${attempt} failed. Retrying in ${delay}ms...`);
                await this.sleep(delay);
            }
        }
        this.logger.error(`HCM call [${context}] failed after ${this.retryAttempts} attempts: ${lastError.message}`);
        throw new common_1.ServiceUnavailableException(`HCM is unavailable. ${lastError.message}`);
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
};
exports.HcmService = HcmService;
exports.HcmService = HcmService = HcmService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], HcmService);
//# sourceMappingURL=hcm.service.js.map