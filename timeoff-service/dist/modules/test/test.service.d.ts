import { Repository } from 'typeorm';
import { LeaveBalance } from '../balances/entities/leave-balance.entity';
import { TimeOffRequest } from '../requests/entities/time-off-request.entity';
import { SyncLog } from '../sync/entities/sync-log.entity';
export declare class TestService {
    private readonly balanceRepo;
    private readonly requestRepo;
    private readonly syncLogRepo;
    constructor(balanceRepo: Repository<LeaveBalance>, requestRepo: Repository<TimeOffRequest>, syncLogRepo: Repository<SyncLog>);
    clearDatabase(): Promise<void>;
}
