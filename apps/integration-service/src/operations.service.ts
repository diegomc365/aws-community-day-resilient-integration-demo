import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ExternalApiClient, ExternalApiError } from './external-api.client';
import { IntegrationEvent } from './integration-event.entity';
import { IntegrationOperation } from './integration-operation.entity';
import { EventStatus, OperationStatus, OperationStep } from './operation.types';

@Injectable()
export class OperationsService {
  constructor(
    @InjectRepository(IntegrationOperation)
    private readonly operations: Repository<IntegrationOperation>,
    @InjectRepository(IntegrationEvent)
    private readonly events: Repository<IntegrationEvent>,
    private readonly externalApi: ExternalApiClient,
  ) {}

  async create(input: { id?: string; orderNumber?: string }): Promise<IntegrationOperation> {
    if (!input.id?.trim() || !input.orderNumber?.trim()) {
      throw new BadRequestException({ code: 'INVALID_OPERATION', message: 'id and orderNumber are required' });
    }
    if (await this.operations.findOneBy({ id: input.id })) {
      throw new ConflictException({ code: 'OPERATION_ALREADY_EXISTS', message: 'Operation already exists' });
    }
    return this.operations.save(this.operations.create({
      id: input.id,
      orderNumber: input.orderNumber,
      status: OperationStatus.PENDING,
      currentStep: OperationStep.VALIDATE,
      attemptCount: 0,
      externalTransactionId: null,
      lastErrorCode: null,
      lastErrorMessage: null,
      internalUpdatedAt: null,
    }));
  }

  async get(id: string): Promise<IntegrationOperation> {
    const operation = await this.operations.findOneBy({ id });
    if (!operation) throw new NotFoundException({ code: 'OPERATION_NOT_FOUND', message: 'Operation not found' });
    return operation;
  }

  async getEvents(id: string): Promise<IntegrationEvent[]> {
    await this.get(id);
    return this.events.find({ where: { operationId: id }, order: { id: 'ASC' } });
  }

  async process(id: string): Promise<IntegrationOperation> {
    return this.run(id, OperationStatus.PENDING);
  }

  async retry(id: string): Promise<IntegrationOperation> {
    return this.run(id, OperationStatus.FAILED_RETRYABLE);
  }

  async resetDemo(): Promise<{ status: string }> {
    await this.events.delete({ operationId: 'OP-001' });
    await this.operations.delete({ id: 'OP-001' });
    return { status: 'ok' };
  }

  private async run(id: string, expected: OperationStatus): Promise<IntegrationOperation> {
    const operation = await this.get(id);
    if (operation.status !== expected) {
      if (expected === OperationStatus.FAILED_RETRYABLE) {
        throw new ConflictException({ code: 'OPERATION_NOT_RETRYABLE', message: 'Operation cannot be retried' });
      }
      throw new ConflictException({ code: 'OPERATION_NOT_PENDING', message: 'Only pending operations can be processed' });
    }

    operation.status = OperationStatus.PROCESSING;
    operation.attemptCount += 1;
    operation.lastErrorCode = null;
    operation.lastErrorMessage = null;
    await this.operations.save(operation);

    try {
      while (operation.status === OperationStatus.PROCESSING) {
        switch (operation.currentStep) {
          case OperationStep.VALIDATE:
            await this.advance(operation, OperationStep.VALIDATE, OperationStep.CREATE_EXTERNAL_TRANSACTION, 'Order validated');
            break;
          case OperationStep.CREATE_EXTERNAL_TRANSACTION:
            // The persisted transaction ID is the minimal idempotency guard for this demo.
            if (operation.externalTransactionId === null) {
              operation.externalTransactionId = await this.externalApi.createTransaction(operation.orderNumber);
              await this.operations.save(operation);
            }
            await this.advance(operation, OperationStep.CREATE_EXTERNAL_TRANSACTION, OperationStep.CONFIRM_EXTERNAL_TRANSACTION, `External transaction ${operation.externalTransactionId} available`);
            break;
          case OperationStep.CONFIRM_EXTERNAL_TRANSACTION:
            if (!operation.externalTransactionId) {
              throw new Error('Cannot confirm without an external transaction ID');
            }
            await this.externalApi.confirmTransaction(operation.externalTransactionId);
            await this.advance(operation, OperationStep.CONFIRM_EXTERNAL_TRANSACTION, OperationStep.UPDATE_INTERNAL_DATABASE, 'External transaction confirmed');
            break;
          case OperationStep.UPDATE_INTERNAL_DATABASE:
            operation.internalUpdatedAt = new Date();
            await this.advance(operation, OperationStep.UPDATE_INTERNAL_DATABASE, OperationStep.FINISHED, 'Internal record updated');
            break;
          case OperationStep.FINISHED:
            operation.status = OperationStatus.FINISHED;
            await this.operations.save(operation);
            await this.recordEvent(operation, OperationStep.FINISHED, EventStatus.SUCCESS, 'Operation finished');
            break;
        }
      }
    } catch (error) {
      if (!(error instanceof ExternalApiError)) throw error;
      operation.status = error.statusCode >= 500 || error.statusCode === 0
        ? OperationStatus.FAILED_RETRYABLE
        : OperationStatus.FAILED_BUSINESS;
      operation.lastErrorCode = error.code;
      operation.lastErrorMessage = error.message;
      await this.operations.save(operation);
      await this.recordEvent(operation, operation.currentStep, EventStatus.FAILED, error.message);
    }
    return operation;
  }

  private async advance(
    operation: IntegrationOperation,
    completedStep: OperationStep,
    nextStep: OperationStep,
    message: string,
  ): Promise<void> {
    operation.currentStep = nextStep;
    await this.operations.save(operation);
    await this.recordEvent(operation, completedStep, EventStatus.SUCCESS, message);
  }

  private async recordEvent(
    operation: IntegrationOperation,
    step: OperationStep,
    status: EventStatus,
    message: string,
  ): Promise<void> {
    await this.events.save(this.events.create({
      operationId: operation.id,
      attempt: operation.attemptCount,
      step,
      status,
      message,
    }));
  }
}
