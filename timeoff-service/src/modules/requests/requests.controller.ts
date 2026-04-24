import {
  Controller, Post, Get, Patch, Param, Body, Query,
  HttpCode, HttpStatus, ParseIntPipe,
} from '@nestjs/common';
import { RequestsService } from './requests.service';
import { CreateRequestDto, RejectRequestDto } from './dto/request.dto';
import { RequestStatus } from './entities/time-off-request.entity';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  /**
   * POST /requests
   * Submit a new time-off request.
   * Validates locally then forwards to HCM for confirmation.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateRequestDto) {
    return this.requestsService.createRequest(dto);
  }

  /**
   * GET /requests/:id
   * Get the current status of a single request.
   */
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.requestsService.getRequest(id);
  }

  /**
   * GET /requests?employeeId=EMP-001&status=PENDING
   * List all requests for an employee, optionally filtered by status.
   */
  @Get()
  async findAll(
    @Query('employeeId') employeeId: string,
    @Query('status') status?: RequestStatus,
  ) {
    if (!employeeId) {
      return { message: 'employeeId query param is required', data: [] };
    }
    return this.requestsService.listRequests(employeeId, status);
  }

  /**
   * PATCH /requests/:id/approve
   * Manager approves a request that is AWAITING_APPROVAL.
   */
  @Patch(':id/approve')
  async approve(@Param('id', ParseIntPipe) id: number) {
    return this.requestsService.approveRequest(id);
  }

  /**
   * PATCH /requests/:id/reject
   * Manager rejects a request. HCM reversal is triggered automatically.
   */
  @Patch(':id/reject')
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectRequestDto,
  ) {
    return this.requestsService.rejectRequest(id, dto);
  }

  /**
   * PATCH /requests/:id/cancel
   * Employee cancels their own pending/awaiting request.
   */
  @Patch(':id/cancel')
  async cancel(@Param('id', ParseIntPipe) id: number) {
    return this.requestsService.cancelRequest(id);
  }
}
