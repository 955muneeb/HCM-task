export declare class CreateRequestDto {
    employeeId: string;
    locationId: string;
    daysRequested: number;
    startDate: string;
    endDate: string;
    notes?: string;
}
export declare class RejectRequestDto {
    reason?: string;
}
