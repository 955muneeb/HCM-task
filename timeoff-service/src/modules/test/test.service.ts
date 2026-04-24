import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LeaveBalance } from '../balances/entities/leave-balance.entity';
import { TimeOffRequest } from '../requests/entities/time-off-request.entity';
import { SyncLog } from '../sync/entities/sync-log.entity';

@Injectable()
export class TestService {
  constructor(
    @InjectRepository(LeaveBalance)
    private readonly balanceRepo: Repository<LeaveBalance>,
    @InjectRepository(TimeOffRequest)
    private readonly requestRepo: Repository<TimeOffRequest>,
    @InjectRepository(SyncLog)
    private readonly syncLogRepo: Repository<SyncLog>,
  ) {}

  /**
   * Clear all tables in the database
   * Used for test isolation between test cases
   */
  async clearDatabase(): Promise<void> {
    // Delete in order of foreign key dependencies
    await this.requestRepo.createQueryBuilder().delete().from(TimeOffRequest).execute();
    await this.syncLogRepo.createQueryBuilder().delete().from(SyncLog).execute();
    await this.balanceRepo.createQueryBuilder().delete().from(LeaveBalance).execute();
  }
}
