import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TestController } from './test.controller';
import { TestService } from './test.service';
import { LeaveBalance } from '../balances/entities/leave-balance.entity';
import { TimeOffRequest } from '../requests/entities/time-off-request.entity';
import { SyncLog } from '../sync/entities/sync-log.entity';

@Module({
  imports: [TypeOrmModule.forFeature([LeaveBalance, TimeOffRequest, SyncLog])],
  controllers: [TestController],
  providers: [TestService],
  exports: [TestService],
})
export class TestModule {}
