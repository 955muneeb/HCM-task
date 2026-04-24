import {
  Controller, Get, Post, Param, Body, HttpCode, HttpStatus, Res,
} from '@nestjs/common';
import { Response } from 'express';
import { BalancesService } from './balances.service';
import { SyncBalanceDto, BatchSyncItemDto } from './dto/balance.dto';

@Controller('balances')
export class BalancesController {
  constructor(private readonly balancesService: BalancesService) {}

  /**
   * GET /balances/:employeeId/:locationId
   * Returns balance with automatic HCM freshness check.
   * Sets X-Balance-Stale: true header if HCM was unreachable and cached value is returned.
   */
  @Get(':employeeId/:locationId')
  async getBalance(
    @Param('employeeId') employeeId: string,
    @Param('locationId') locationId: string,
    @Res() res: Response,
  ) {
    const result = await this.balancesService.getBalance(employeeId, locationId);

    if (result.stale) {
      res.setHeader('X-Balance-Stale', 'true');
      res.setHeader('X-Balance-Warning', 'HCM unavailable; showing cached value');
    }
    if (result.refreshed) {
      res.setHeader('X-Balance-Refreshed', 'true');
    }

    return res.status(HttpStatus.OK).json({
      employeeId:   result.balance.employeeId,
      locationId:   result.balance.locationId,
      balanceDays:  result.balance.balanceDays,
      lastSyncedAt: result.balance.lastSyncedAt,
    });
  }

  /**
   * POST /balances/sync/realtime
   * Manually trigger a fresh real-time fetch from HCM for a specific employee+location.
   */
  @Post('sync/realtime')
  @HttpCode(HttpStatus.OK)
  async syncRealtime(@Body() dto: SyncBalanceDto) {
    const balance = await this.balancesService.syncRealtime(dto.employeeId, dto.locationId);
    return {
      message: 'Real-time sync completed',
      balanceDays: balance.balanceDays,
      lastSyncedAt: balance.lastSyncedAt,
    };
  }

  /**
   * POST /balances/sync/batch
   * Receives full balance corpus from HCM. Idempotent.
   */
  @Post('sync/batch')
  @HttpCode(HttpStatus.OK)
  async syncBatch(@Body() body: { records: BatchSyncItemDto[] }) {
    const { records } = body;
    if (!records || !Array.isArray(records)) {
      return { message: 'No records provided', processed: 0, errors: 0 };
    }
    const result = await this.balancesService.processBatchSync(records);
    return { message: 'Batch sync completed', ...result };
  }
}
