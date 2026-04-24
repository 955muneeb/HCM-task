import { Repository } from 'typeorm';
import { TimeOffRequest, RequestStatus } from './entities/time-off-request.entity';
import { BalancesService } from '../balances/balances.service';
import { HcmService } from '../hcm/hcm.service';
import { CreateRequestDto, RejectRequestDto } from './dto/request.dto';
export declare class RequestsService {
    private readonly requestRepo;
    private readonly balancesService;
    private readonly hcmService;
    private readonly logger;
    constructor(requestRepo: Repository<TimeOffRequest>, balancesService: BalancesService, hcmService: HcmService);
    createRequest(dto: CreateRequestDto): Promise<TimeOffRequest>;
    getRequest(id: number): Promise<TimeOffRequest>;
    listRequests(employeeId: string, status?: RequestStatus): Promise<TimeOffRequest[]>;
    approveRequest(id: number): Promise<TimeOffRequest>;
    rejectRequest(id: number, dto: RejectRequestDto): Promise<TimeOffRequest>;
    cancelRequest(id: number): Promise<TimeOffRequest>;
    private getPendingDays;
    private checkOverlap;
}
