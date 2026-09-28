import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { OperationStatus, OperationStep } from './operation.types';

@Entity({ name: 'integration_operations' })
export class IntegrationOperation {
  @PrimaryColumn({ type: 'varchar', length: 64 })
  id!: string;

  @Column({ name: 'order_number', type: 'varchar', length: 64 })
  orderNumber!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: OperationStatus;

  @Column({ name: 'current_step', type: 'varchar', length: 40 })
  currentStep!: OperationStep;

  @Column({ name: 'attempt_count', type: 'integer', default: 0 })
  attemptCount!: number;

  @Column({ name: 'external_transaction_id', type: 'varchar', length: 100, nullable: true })
  externalTransactionId!: string | null;

  @Column({ name: 'last_error_code', type: 'varchar', length: 100, nullable: true })
  lastErrorCode!: string | null;

  @Column({ name: 'last_error_message', type: 'text', nullable: true })
  lastErrorMessage!: string | null;

  @Column({ name: 'internal_updated_at', type: 'timestamptz', nullable: true })
  internalUpdatedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
