export declare enum SyncType {
    REALTIME = "REALTIME",
    BATCH = "BATCH",
    MANUAL = "MANUAL",
    WEBHOOK = "WEBHOOK"
}
export declare enum SyncStatus {
    SUCCESS = "SUCCESS",
    FAILURE = "FAILURE",
    PARTIAL = "PARTIAL"
}
export declare class SyncLog {
    id: number;
    syncType: SyncType;
    employeeId: string;
    locationId: string;
    status: SyncStatus;
    recordsProcessed: number;
    errorDetails: string;
    syncedAt: Date;
}
