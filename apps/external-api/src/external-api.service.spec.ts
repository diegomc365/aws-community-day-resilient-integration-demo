import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpException } from '@nestjs/common';
import { ExternalApiService } from './external-api.service';

test('create succeeds while confirm can fail independently, then recover', () => {
  const externalApi = new ExternalApiService();
  externalApi.setModes({ confirm: 'TRANSIENT_ERROR' });

  assert.deepEqual(externalApi.createTransaction(), { id: 'EXT-78432' });
  assert.throws(
    () => externalApi.confirmTransaction('EXT-78432'),
    (error: unknown) =>
      error instanceof HttpException &&
      error.getStatus() === 500 &&
      (error.getResponse() as { code: string }).code === 'EXTERNAL_API_UNAVAILABLE',
  );
  assert.deepEqual(externalApi.getStats(), {
    createCalls: 1,
    confirmCalls: 1,
    transactionsCreated: 1,
  });

  externalApi.setModes({ confirm: 'SUCCESS' });
  assert.deepEqual(externalApi.confirmTransaction('EXT-78432'), {
    id: 'EXT-78432',
    status: 'CONFIRMED',
  });
  assert.deepEqual(externalApi.getStats(), {
    createCalls: 1,
    confirmCalls: 2,
    transactionsCreated: 1,
  });
});

test('business errors use 422 and reset restores a clean deterministic scenario', () => {
  const externalApi = new ExternalApiService();
  externalApi.setModes({ create: 'BUSINESS_ERROR' });
  assert.throws(
    () => externalApi.createTransaction(),
    (error: unknown) =>
      error instanceof HttpException &&
      error.getStatus() === 422 &&
      (error.getResponse() as { code: string }).code === 'ORDER_CLOSED',
  );
  assert.deepEqual(externalApi.getStats(), {
    createCalls: 1,
    confirmCalls: 0,
    transactionsCreated: 0,
  });

  externalApi.reset();
  assert.deepEqual(externalApi.getModes(), { create: 'SUCCESS', confirm: 'SUCCESS' });
  assert.deepEqual(externalApi.getStats(), {
    createCalls: 0,
    confirmCalls: 0,
    transactionsCreated: 0,
  });
  assert.deepEqual(externalApi.createTransaction(), { id: 'EXT-78432' });
});
