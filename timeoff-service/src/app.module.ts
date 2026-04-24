import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BalancesModule } from './modules/balances/balances.module';
import { RequestsModule } from './modules/requests/requests.module';
import { SyncModule } from './modules/sync/sync.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { HcmModule } from './modules/hcm/hcm.module';
import { TestModule } from './modules/test/test.module';
import { LeaveBalance } from './modules/balances/entities/leave-balance.entity';
import { TimeOffRequest } from './modules/requests/entities/time-off-request.entity';
import { SyncLog } from './modules/sync/entities/sync-log.entity';

@Module({
  imports: [
    // Load .env file globally
    ConfigModule.forRoot({ isGlobal: true }),

    // SQLite database via TypeORM
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'sqlite',
        database: config.get<string>('DB_PATH', './timeoff.sqlite'),
        entities: [LeaveBalance, TimeOffRequest, SyncLog],
        synchronize: true,   // Auto-create tables in dev/test (disable in prod)
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),

    HcmModule,
    BalancesModule,
    RequestsModule,
    SyncModule,
    WebhooksModule,
    TestModule, // Test-only endpoints
  ],
})
export class AppModule {}
