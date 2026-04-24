import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum RequestStatus {
  PENDING            = 'PENDING',
  HCM_SUBMITTED      = 'HCM_SUBMITTED',
  AWAITING_APPROVAL  = 'AWAITING_APPROVAL',
  APPROVED           = 'APPROVED',
  REJECTED           = 'REJECTED',
  CANCELLED          = 'CANCELLED',
  FAILED             = 'FAILED',
}

@Entity('time_off_requests')
export class TimeOffRequest {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'location_id' })
  locationId: string;

  @Column({ name: 'days_requested', type: 'real' })
  daysRequested: number;

  @Column({ name: 'start_date' })
  startDate: string;

  @Column({ name: 'end_date' })
  endDate: string;

  @Column({ name: 'status', default: RequestStatus.PENDING })
  status: RequestStatus;

  @Column({ name: 'hcm_reference_id', nullable: true })
  hcmReferenceId: string;

  @Column({ name: 'notes', nullable: true })
  notes: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
