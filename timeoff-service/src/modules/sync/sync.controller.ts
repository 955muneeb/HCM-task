import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { SyncService } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly syncService: SyncService) {}

  @Get('logs')
  async getLogs(
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.syncService.getRecentLogs(limit);
  }

  @Get('logs/employee/:employeeId')
  async getLogsByEmployee(@Query('employeeId') employeeId: string) {
    return this.syncService.getLogsByEmployee(employeeId);
  }
}
