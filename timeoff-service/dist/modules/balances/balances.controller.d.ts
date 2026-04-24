import { Response } from 'express';
import { BalancesService } from './balances.service';
import { SyncBalanceDto, BatchSyncItemDto } from './dto/balance.dto';
export declare class BalancesController {
    private readonly balancesService;
    constructor(balancesService: BalancesService);
    getBalance(employeeId: string, locationId: string, res: Response): Promise<Response<any, Record<string, any>>>;
    syncRealtime(dto: SyncBalanceDto): Promise<{
        message: string;
        balanceDays: number;
        lastSyncedAt: Date;
    }>;
    syncBatch(body: {
        records: BatchSyncItemDto[];
    }): Promise<{
        message: string;
        processed: number;
        errors: number;
    }>;
}
