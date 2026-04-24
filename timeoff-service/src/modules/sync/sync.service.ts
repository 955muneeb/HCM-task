import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SyncLog } from './entities/sync-log.entity';

@Injectable()
export class SyncService {
  constructor(
    @InjectRepository(SyncLog)
    private readonly syncLogRepo: Repository<SyncLog>,
  ) {}

  async getRecentLogs(limit = 50): Promise<SyncLog[]> {
    return this.syncLogRepo.find({
      order: { syncedAt: 'DESC' },
      take: limit,
    });
  }

  async getLogsByEmployee(employeeId: string): Promise<SyncLog[]> {
    return this.syncLogRepo.find({
      where: { employeeId },
      order: { syncedAt: 'DESC' },
    });
  }
}
