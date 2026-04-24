import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export enum SyncType   { REALTIME = 'REALTIME', BATCH = 'BATCH', MANUAL = 'MANUAL', WEBHOOK = 'WEBHOOK' }
export enum SyncStatus { SUCCESS  = 'SUCCESS',  FAILURE = 'FAILURE', PARTIAL = 'PARTIAL' }

@Entity('sync_log')
export class SyncLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'sync_type' })
  syncType: SyncType;

  @Column({ name: 'employee_id', nullable: true })
  employeeId: string;

  @Column({ name: 'location_id', nullable: true })
  locationId: string;

  @Column({ name: 'status' })
  status: SyncStatus;

  @Column({ name: 'records_processed', default: 0 })
  recordsProcessed: number;

  @Column({ name: 'error_details', nullable: true, type: 'text' })
  errorDetails: string;

  @CreateDateColumn({ name: 'synced_at' })
  syncedAt: Date;
}
