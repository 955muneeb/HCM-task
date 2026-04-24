import { SyncService } from './sync.service';
export declare class SyncController {
    private readonly syncService;
    constructor(syncService: SyncService);
    getLogs(limit: number): Promise<import("./entities/sync-log.entity").SyncLog[]>;
    getLogsByEmployee(employeeId: string): Promise<import("./entities/sync-log.entity").SyncLog[]>;
}
