import { RequestsService } from './requests.service';
import { CreateRequestDto, RejectRequestDto } from './dto/request.dto';
import { RequestStatus } from './entities/time-off-request.entity';
export declare class RequestsController {
    private readonly requestsService;
    constructor(requestsService: RequestsService);
    create(dto: CreateRequestDto): Promise<import("./entities/time-off-request.entity").TimeOffRequest>;
    findOne(id: number): Promise<import("./entities/time-off-request.entity").TimeOffRequest>;
    findAll(employeeId: string, status?: RequestStatus): Promise<import("./entities/time-off-request.entity").TimeOffRequest[] | {
        message: string;
        data: any[];
    }>;
    approve(id: number): Promise<import("./entities/time-off-request.entity").TimeOffRequest>;
    reject(id: number, dto: RejectRequestDto): Promise<import("./entities/time-off-request.entity").TimeOffRequest>;
    cancel(id: number): Promise<import("./entities/time-off-request.entity").TimeOffRequest>;
}
