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

  const [beforeData, beforeEventsData, beforeStatsData] = await Promise.all([
    request(INTEGRATION_URL, `/operations/${OPERATION_ID}`),
    request(INTEGRATION_URL, `/operations/${OPERATION_ID}/events`),
    request(EXTERNAL_API_URL, '/admin/stats'),
  ]);
  const before = readOperation(beforeData);
  const beforeEvents = readEvents(beforeEventsData);
  const beforeStats = readStats(beforeStatsData);

  assert(before.id === OPERATION_ID, `La operación no es ${OPERATION_ID}.`);
  assert(before.orderNumber === ORDER_NUMBER, `La orden no es #${ORDER_NUMBER}.`);
  assert(before.status === 'FAILED_RETRYABLE', 'Ejecuta npm run demo:start antes del retry.');
  assert(before.currentStep === 'CONFIRM_EXTERNAL_TRANSACTION', 'La operación no quedó en confirmación.');
  assert(before.attemptCount === 1, 'El retry debe comenzar tras el intento 1.');
  assert(before.externalTransactionId === EXTERNAL_TRANSACTION_ID, 'Falta la transacción externa existente.');
  assertEvents(beforeEvents, 1, [
    ['VALIDATE', 'SUCCESS'],
    ['CREATE_EXTERNAL_TRANSACTION', 'SUCCESS'],
    ['CONFIRM_EXTERNAL_TRANSACTION', 'FAILED'],
  ]);
  assert(beforeEvents.every((event) => event.attempt === 1), 'Hay eventos inesperados antes del retry.');
  assert(beforeStats.createCalls === 1, 'Antes del retry debe existir exactamente una creación externa.');
  assert(beforeStats.confirmCalls === 1, 'Antes del retry debe existir exactamente una confirmación.');

  await request(EXTERNAL_API_URL, '/admin/mode', 'PUT', {
    create: 'SUCCESS',
    confirm: 'SUCCESS',
  });
  await request(INTEGRATION_URL, `/operations/${OPERATION_ID}/retry`, 'POST');

  const [afterData, afterEventsData, afterStatsData] = await Promise.all([
    request(INTEGRATION_URL, `/operations/${OPERATION_ID}`),
    request(INTEGRATION_URL, `/operations/${OPERATION_ID}/events`),
    request(EXTERNAL_API_URL, '/admin/stats'),
  ]);
  const after = readOperation(afterData);
  const afterEvents = readEvents(afterEventsData);
  const afterStats = readStats(afterStatsData);

  assert(after.status === 'FINISHED', 'La operación no terminó.');
  assert(after.currentStep === 'FINISHED', 'El último paso no es FINISHED.');
  assert(after.attemptCount === 2, 'El retry no incrementó el intento a 2.');
  assert(
    after.externalTransactionId === before.externalTransactionId &&
      after.externalTransactionId === EXTERNAL_TRANSACTION_ID,
    'La transacción externa cambió durante el retry.',
  );
  assertEvents(afterEvents, 1, [
    ['VALIDATE', 'SUCCESS'],
    ['CREATE_EXTERNAL_TRANSACTION', 'SUCCESS'],
    ['CONFIRM_EXTERNAL_TRANSACTION', 'FAILED'],
  ]);
  assertEvents(afterEvents, 2, [
    ['CONFIRM_EXTERNAL_TRANSACTION', 'SUCCESS'],
    ['UPDATE_INTERNAL_DATABASE', 'SUCCESS'],
    ['FINISHED', 'SUCCESS'],
  ]);
  assert(afterEvents.length === 6, 'La historia tiene eventos inesperados.');
  assert(afterStats.createCalls === beforeStats.createCalls, 'Se volvió a crear la transacción externa.');
  assert(afterStats.createCalls === 1, 'La API externa debe registrar una sola creación.');
  assert(afterStats.confirmCalls === 2, 'La confirmación no se ejecutó en ambos intentos.');

  console.log(`${RULE}\nReprocesando ORDEN #${ORDER_NUMBER}\n${RULE}\n`);
  console.log(`Transacción existente:\n${before.externalTransactionId}\n`);
  console.log('↳ Continuando desde:\n  Confirmar transacción\n');
  console.log('✓ Confirmar transacción\n');
  console.log('✓ Actualizar sistema\n');
  console.log('✓ Finalizar operación\n');
  console.log(`${RULE}\nORDEN #${ORDER_NUMBER} FINALIZADA\n${RULE}\n`);
  console.log(`Intentos:      ${after.attemptCount}`);
  console.log(`Transacción:   ${after.externalTransactionId}`);
}

run(main, 'demo:retry');
