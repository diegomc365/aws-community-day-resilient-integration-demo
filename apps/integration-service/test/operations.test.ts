import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Repository } from 'typeorm';
import { ExternalApiError } from '../src/external-api.client';
import { IntegrationEvent } from '../src/integration-event.entity';
import { IntegrationOperation } from '../src/integration-operation.entity';
import { EventStatus, OperationStatus, OperationStep } from '../src/operation.types';
import { OperationsService } from '../src/operations.service';

class MemoryOperations {
  private rows = new Map<string, IntegrationOperation>();

  create(values: Partial<IntegrationOperation>): IntegrationOperation {
    return Object.assign(new IntegrationOperation(), values);
  }

  async save(row: IntegrationOperation): Promise<IntegrationOperation> {
    this.rows.set(row.id, Object.assign(new IntegrationOperation(), row));
    return row;
  }

  async findOneBy(where: { id: string }): Promise<IntegrationOperation | null> {
    const row = this.rows.get(where.id);
    return row ? Object.assign(new IntegrationOperation(), row) : null;
  }

  async delete(where: { id: string }): Promise<void> {
    this.rows.delete(where.id);
  }
}

class MemoryEvents {
  private rows: IntegrationEvent[] = [];
  private nextId = 1;

  create(values: Partial<IntegrationEvent>): IntegrationEvent {
    return Object.assign(new IntegrationEvent(), values);
  }

  async save(row: IntegrationEvent): Promise<IntegrationEvent> {
    row.id = this.nextId++;
    this.rows.push(Object.assign(new IntegrationEvent(), row));
    return row;
  }

  async find(query: { where: { operationId: string } }): Promise<IntegrationEvent[]> {
    return this.rows.filter((row) => row.operationId === query.where.operationId);
  }

  async delete(where: { operationId: string }): Promise<void> {
    this.rows = this.rows.filter((row) => row.operationId !== where.operationId);
  }
}

class FakeExternalApi {
  createCalls = 0;
  confirmCalls = 0;
  confirmMode: 'TRANSIENT_ERROR' | 'BUSINESS_ERROR' | 'SUCCESS' = 'TRANSIENT_ERROR';

  async createTransaction(): Promise<string> {
    this.createCalls++;
    return 'EXT-78432';
  }

  async confirmTransaction(): Promise<void> {
    this.confirmCalls++;
    if (this.confirmMode === 'TRANSIENT_ERROR') {
      throw new ExternalApiError(500, 'EXTERNAL_API_UNAVAILABLE', 'External service temporarily unavailable');
    }
    if (this.confirmMode === 'BUSINESS_ERROR') {
      throw new ExternalApiError(422, 'ORDER_CLOSED', 'The operation cannot be processed');
    }
  }
}

function fixture() {
  const operations = new MemoryOperations();
  const events = new MemoryEvents();
  const externalApi = new FakeExternalApi();
  const service = new OperationsService(
    operations as unknown as Repository<IntegrationOperation>,
    events as unknown as Repository<IntegrationEvent>,
    externalApi as never,
  );
  return { service, operations, externalApi };
}

async function createDemo(service: OperationsService) {
  return service.create({ id: 'OP-001', orderNumber: '1001' });
}

test('a pending operation persists the external ID and stops at a retryable confirm failure', async () => {
  const { service, externalApi } = fixture();
  const pending = await createDemo(service);
  assert.equal(pending.status, OperationStatus.PENDING);
  assert.equal(pending.attemptCount, 0);

  const failed = await service.process('OP-001');
  assert.equal(failed.status, OperationStatus.FAILED_RETRYABLE);
  assert.equal(failed.currentStep, OperationStep.CONFIRM_EXTERNAL_TRANSACTION);
  assert.equal(failed.attemptCount, 1);
  assert.equal(failed.externalTransactionId, 'EXT-78432');
  assert.equal(failed.lastErrorCode, 'EXTERNAL_API_UNAVAILABLE');
  assert.equal((await service.get('OP-001')).externalTransactionId, 'EXT-78432');
  assert.equal(externalApi.createCalls, 1);
  assert.equal(externalApi.confirmCalls, 1);
  assert.deepEqual(
    (await service.getEvents('OP-001')).map((event) => [event.attempt, event.step, event.status]),
    [
      [1, OperationStep.VALIDATE, EventStatus.SUCCESS],
      [1, OperationStep.CREATE_EXTERNAL_TRANSACTION, EventStatus.SUCCESS],
      [1, OperationStep.CONFIRM_EXTERNAL_TRANSACTION, EventStatus.FAILED],
    ],
  );
});

test('manual retry resumes confirm, creates no duplicate, and finishes on attempt two', async () => {
  const { service, externalApi } = fixture();
  await createDemo(service);
  await service.process('OP-001');
  externalApi.confirmMode = 'SUCCESS';

  const finished = await service.retry('OP-001');
  assert.equal(finished.status, OperationStatus.FINISHED);
  assert.equal(finished.currentStep, OperationStep.FINISHED);
  assert.equal(finished.attemptCount, 2);
  assert.equal(finished.externalTransactionId, 'EXT-78432');
  assert.ok(finished.internalUpdatedAt instanceof Date);
  assert.equal(externalApi.createCalls, 1, 'POST /transactions must be called only once across both attempts');
  assert.equal(externalApi.confirmCalls, 2);
  assert.deepEqual(
    (await service.getEvents('OP-001')).filter((event) => event.attempt === 2).map((event) => [event.step, event.status]),
    [
      [OperationStep.CONFIRM_EXTERNAL_TRANSACTION, EventStatus.SUCCESS],
      [OperationStep.UPDATE_INTERNAL_DATABASE, EventStatus.SUCCESS],
      [OperationStep.FINISHED, EventStatus.SUCCESS],
    ],
  );
  await assert.rejects(() => service.process('OP-001'), (error: any) => error.getStatus() === 409);
});

test('a business error stops the operation and retry returns conflict', async () => {
  const { service, externalApi } = fixture();
  externalApi.confirmMode = 'BUSINESS_ERROR';
  await createDemo(service);

  const failed = await service.process('OP-001');
  assert.equal(failed.status, OperationStatus.FAILED_BUSINESS);
  assert.equal(failed.currentStep, OperationStep.CONFIRM_EXTERNAL_TRANSACTION);
  assert.equal(failed.lastErrorCode, 'ORDER_CLOSED');
  await assert.rejects(
    () => service.retry('OP-001'),
    (error: any) => error.getStatus() === 409 && error.getResponse().code === 'OPERATION_NOT_RETRYABLE',
  );
  assert.equal(externalApi.confirmCalls, 1);
});

test('a stored external ID protects CREATE if execution reaches that step again', async () => {
  const { service, operations, externalApi } = fixture();
  await createDemo(service);
  const row = (await operations.findOneBy({ id: 'OP-001' }))!;
  row.currentStep = OperationStep.CREATE_EXTERNAL_TRANSACTION;
  row.externalTransactionId = 'EXT-78432';
  await operations.save(row);
  externalApi.confirmMode = 'SUCCESS';

  const finished = await service.process('OP-001');
  assert.equal(finished.status, OperationStatus.FINISHED);
  assert.equal(finished.externalTransactionId, 'EXT-78432');
  assert.equal(externalApi.createCalls, 0);
});

test('resetting the demo permits the same failed start again with no stale events', async () => {
  const { service, externalApi } = fixture();
  await createDemo(service);
  const first = await service.process('OP-001');
  const firstEvents = await service.getEvents('OP-001');

  await service.resetDemo();
  externalApi.createCalls = 0;
  externalApi.confirmCalls = 0;
  await createDemo(service);
  const second = await service.process('OP-001');
  const secondEvents = await service.getEvents('OP-001');

  assert.equal(second.status, first.status);
  assert.equal(second.currentStep, first.currentStep);
  assert.equal(second.externalTransactionId, first.externalTransactionId);
  assert.equal(second.attemptCount, 1);
  assert.equal(externalApi.createCalls, 1);
  assert.deepEqual(
    secondEvents.map((event) => [event.attempt, event.step, event.status]),
    firstEvents.map((event) => [event.attempt, event.step, event.status]),
  );
});
