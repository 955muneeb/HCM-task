export declare enum RequestStatus {
    PENDING = "PENDING",
    HCM_SUBMITTED = "HCM_SUBMITTED",
    AWAITING_APPROVAL = "AWAITING_APPROVAL",
    APPROVED = "APPROVED",
    REJECTED = "REJECTED",
    CANCELLED = "CANCELLED",
    FAILED = "FAILED"
}
export declare class TimeOffRequest {
    id: number;
    employeeId: string;
    locationId: string;
    daysRequested: number;
    startDate: string;
    endDate: string;
    status: RequestStatus;
    hcmReferenceId: string;
    notes: string;
    createdAt: Date;
    updatedAt: Date;
}
