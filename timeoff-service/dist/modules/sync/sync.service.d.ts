import { Repository } from 'typeorm';
import { SyncLog } from './entities/sync-log.entity';
export declare class SyncService {
    private readonly syncLogRepo;
    constructor(syncLogRepo: Repository<SyncLog>);
    getRecentLogs(limit?: number): Promise<SyncLog[]>;
    getLogsByEmployee(employeeId: string): Promise<SyncLog[]>;
}
