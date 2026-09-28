import {
  assert,
  assertEvents,
  checkHealth,
  EXTERNAL_API_URL,
  EXTERNAL_TRANSACTION_ID,
  INTEGRATION_URL,
  OPERATION_ID,
  ORDER_NUMBER,
  readEvents,
  readOperation,
  readStats,
  request,
  RULE,
  run,
} from './demo-shared';

async function main(): Promise<void> {
  await Promise.all([
    checkHealth(INTEGRATION_URL, 'integration-service'),
    checkHealth(EXTERNAL_API_URL, 'external-api'),
  ]);

  await request(INTEGRATION_URL, '/admin/demo-reset', 'POST');
  await request(EXTERNAL_API_URL, '/admin/reset', 'POST');
  await request(EXTERNAL_API_URL, '/admin/mode', 'PUT', {
    create: 'SUCCESS',
    confirm: 'TRANSIENT_ERROR',
  });

  await request(INTEGRATION_URL, '/operations', 'POST', {
    id: OPERATION_ID,
    orderNumber: ORDER_NUMBER,
  });
  await request(INTEGRATION_URL, `/operations/${OPERATION_ID}/process`, 'POST');

  const [operationData, eventsData, statsData] = await Promise.all([
    request(INTEGRATION_URL, `/operations/${OPERATION_ID}`),
    request(INTEGRATION_URL, `/operations/${OPERATION_ID}/events`),
    request(EXTERNAL_API_URL, '/admin/stats'),
  ]);
  const operation = readOperation(operationData);
  const events = readEvents(eventsData);
  const stats = readStats(statsData);

  assert(operation.id === OPERATION_ID, `La operación no es ${OPERATION_ID}.`);
  assert(operation.orderNumber === ORDER_NUMBER, `La orden no es #${ORDER_NUMBER}.`);
  assert(operation.status === 'FAILED_RETRYABLE', 'La operación no quedó detenida para retry.');
  assert(
    operation.currentStep === 'CONFIRM_EXTERNAL_TRANSACTION',
    'El punto de continuación no es CONFIRM_EXTERNAL_TRANSACTION.',
  );
  assert(operation.attemptCount === 1, 'El primer intento no quedó registrado.');
  assert(
    operation.externalTransactionId === EXTERNAL_TRANSACTION_ID,
    `La transacción externa no es ${EXTERNAL_TRANSACTION_ID}.`,
  );
  assert(operation.lastErrorCode === 'EXTERNAL_API_UNAVAILABLE', 'No se registró el fallo transitorio.');
  assertEvents(events, 1, [
    ['VALIDATE', 'SUCCESS'],
    ['CREATE_EXTERNAL_TRANSACTION', 'SUCCESS'],
    ['CONFIRM_EXTERNAL_TRANSACTION', 'FAILED'],
  ]);
  assert(events.every((event) => event.attempt === 1), 'Hay eventos de un intento anterior.');
  assert(stats.createCalls === 1, 'La API externa no registró exactamente una creación.');
  assert(stats.confirmCalls === 1, 'La API externa no registró exactamente una confirmación.');

  console.log(`${RULE}\nProcesando ORDEN #${ORDER_NUMBER}\n${RULE}\n`);
  console.log('✓ Validar orden\n');
  console.log(`✓ Crear transacción externa\n  Transacción: ${operation.externalTransactionId}\n`);
  console.log('✗ Confirmar transacción\n  La API externa no está disponible\n');
  console.log(`${RULE}\nOPERACIÓN DETENIDA\n${RULE}\n`);
  console.log('Estado:       Falló — puede reintentarse');
  console.log('Último paso:  Confirmar transacción');
  console.log(`Intento:      ${operation.attemptCount}`);
  console.log(`Transacción:  ${operation.externalTransactionId}`);
}

run(main, 'demo:start');
