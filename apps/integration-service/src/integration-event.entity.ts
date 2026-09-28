import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { EventStatus, OperationStep } from './operation.types';

@Entity({ name: 'integration_events' })
export class IntegrationEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'operation_id', type: 'varchar', length: 64 })
  operationId!: string;

  @Column({ type: 'integer' })
  attempt!: number;

  @Column({ type: 'varchar', length: 40 })
  step!: OperationStep;

  @Column({ type: 'varchar', length: 16 })
  status!: EventStatus;

  @Column({ type: 'text' })
  message!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
