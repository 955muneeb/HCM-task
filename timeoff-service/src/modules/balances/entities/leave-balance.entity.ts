import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Unique,
  UpdateDateColumn,
  CreateDateColumn,
  VersionColumn,
} from 'typeorm';

@Entity('leave_balances')
@Unique(['employeeId', 'locationId'])
export class LeaveBalance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'employee_id' })
  employeeId: string;

  @Column({ name: 'location_id' })
  locationId: string;

  @Column({ name: 'balance_days', type: 'real', default: 0 })
  balanceDays: number;

  @Column({ name: 'last_synced_at', type: 'datetime', nullable: true })
  lastSyncedAt: Date;

  // Optimistic locking: prevents concurrent updates from corrupting balance
  @VersionColumn({ name: 'version', default: 0 })
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
