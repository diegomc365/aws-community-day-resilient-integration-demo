export const OPERATION_ID = 'OP-001';
export const ORDER_NUMBER = '1001';
export const EXTERNAL_TRANSACTION_ID = 'EXT-78432';

export const INTEGRATION_URL =
  process.env.INTEGRATION_URL?.replace(/\/+$/, '') || 'http://localhost:3000';
export const EXTERNAL_API_URL =
  process.env.EXTERNAL_API_URL?.replace(/\/+$/, '') || 'http://localhost:3001';

export type Operation = {
  id: string;
  orderNumber: string;
  status: string;
  currentStep: string;
  attemptCount: number;
  externalTransactionId: string | null;
  lastErrorCode: string | null;
};

export type IntegrationEvent = {
  attempt: number;
  step: string;
  status: string;
};

export type ExternalStats = {
  createCalls: number;
  confirmCalls: number;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function textField(value: unknown, name: string): string {
  if (typeof value !== 'string') {
    throw new Error(`Respuesta inválida: falta ${name}.`);
  }
  return value;
}

function numberField(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`Respuesta inválida: falta ${name}.`);
  }
  return value;
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function errorDetail(body: unknown): string {
  if (!isRecord(body)) return '';
  const code = typeof body.code === 'string' ? body.code : '';
  const message =
    typeof body.message === 'string'
      ? body.message
      : Array.isArray(body.message)
        ? body.message.filter((item): item is string => typeof item === 'string').join(', ')
        : '';
  return [code, message].filter(Boolean).join(': ');
}

export async function request(
  baseUrl: string,
  path: string,
  method: 'GET' | 'POST' | 'PUT' = 'GET',
  body?: object,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error(`No se pudo conectar con ${baseUrl}. Comprueba docker compose ps.`);
  }

  const raw = await response.text();
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`${method} ${path} devolvió una respuesta inválida (HTTP ${response.status}).`);
  }

  if (!response.ok) {
    const detail = errorDetail(data);
    throw new Error(
      `${method} ${path} falló (HTTP ${response.status})${detail ? `: ${detail}` : '.'}`,
    );
  }
  return data;
}

export async function checkHealth(baseUrl: string, service: string): Promise<void> {
  const data = await request(baseUrl, '/health');
  assert(isRecord(data) && data.status === 'ok', `${service} no está listo.`);
}

export function readOperation(data: unknown): Operation {
  assert(isRecord(data), 'Respuesta inválida de la operación.');
  const externalTransactionId = data.externalTransactionId;
  const lastErrorCode = data.lastErrorCode;
  assert(
    externalTransactionId === null || typeof externalTransactionId === 'string',
    'Respuesta inválida: falta externalTransactionId.',
  );
  assert(
    lastErrorCode === null || typeof lastErrorCode === 'string',
    'Respuesta inválida: falta lastErrorCode.',
  );
  return {
    id: textField(data.id, 'id'),
    orderNumber: textField(data.orderNumber, 'orderNumber'),
    status: textField(data.status, 'status'),
    currentStep: textField(data.currentStep, 'currentStep'),
    attemptCount: numberField(data.attemptCount, 'attemptCount'),
    externalTransactionId,
    lastErrorCode,
  };
}

export function readEvents(data: unknown): IntegrationEvent[] {
  assert(Array.isArray(data), 'Respuesta inválida: falta la lista de eventos.');
  return data.map((item, index) => {
    assert(isRecord(item), `Evento ${index + 1} inválido.`);
    return {
      attempt: numberField(item.attempt, `evento ${index + 1}.attempt`),
      step: textField(item.step, `evento ${index + 1}.step`),
      status: textField(item.status, `evento ${index + 1}.status`),
    };
  });
}

export function readStats(data: unknown): ExternalStats {
  assert(isRecord(data), 'Respuesta inválida de estadísticas externas.');
  return {
    createCalls: numberField(data.createCalls, 'createCalls'),
    confirmCalls: numberField(data.confirmCalls, 'confirmCalls'),
  };
}

export function assertEvents(
  events: IntegrationEvent[],
  attempt: number,
  expected: Array<[step: string, status: string]>,
): void {
  const actual = events
    .filter((event) => event.attempt === attempt)
    .map((event) => `${event.step}/${event.status}`);
  const wanted = expected.map(([step, status]) => `${step}/${status}`);
  assert(
    actual.length === wanted.length && actual.every((event, index) => event === wanted[index]),
    `La trazabilidad del intento ${attempt} no coincide con el escenario esperado.`,
  );
}

export function run(main: () => Promise<void>, command: string): void {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`No se pudo completar ${command}: ${message}`);
    process.exitCode = 1;
  });
}

export const RULE = '────────────────────────────────────────';
