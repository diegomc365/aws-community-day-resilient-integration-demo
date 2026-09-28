# Especificación funcional de la demo

## Propósito y alcance

Esta demo enseña a recuperar una integración de varios pasos tras un fallo parcial sin repetir los pasos ya completados ni duplicar una transacción externa. Está diseñada para una presentación técnica de aproximadamente 30 minutos, con un segmento en vivo de hasta 4–5 minutos. Todo el escenario usa datos ficticios.

La ejecución principal requiere dos comandos: `npm run demo:start` y `npm run demo:retry`. No requiere Postman ni escribir solicitudes HTTP durante la presentación. No realiza un despliegue en AWS.

## Identificadores y pasos

| Concepto | Valor de la demo |
| --- | --- |
| Orden | `#1001` |
| Operación | `OP-001` |
| Transacción externa | `EXT-78432` |

| Paso | Significado para la audiencia |
| --- | --- |
| `VALIDATE` | Validar orden |
| `CREATE_EXTERNAL_TRANSACTION` | Crear transacción externa |
| `CONFIRM_EXTERNAL_TRANSACTION` | Confirmar transacción |
| `UPDATE_INTERNAL_DATABASE` | Actualizar sistema |
| `FINISHED` | Finalizar operación |

## Primera ejecución: `demo:start`

1. Comprobar que los servicios necesarios responden.
2. Limpiar el escenario previo para que el comando sea repetible.
3. Configurar la API externa: la creación responde con éxito y la confirmación devuelve un error transitorio.
4. Crear **OP-001** para la orden **#1001** e iniciar el procesamiento.
5. Registrar éxito de `VALIDATE`.
6. Registrar éxito de `CREATE_EXTERNAL_TRANSACTION`, guardar **EXT-78432** en la operación y persistir el evento.
7. Ejecutar `CONFIRM_EXTERNAL_TRANSACTION`. La API externa devuelve HTTP 500:

   ```json
   {
     "code": "EXTERNAL_API_UNAVAILABLE",
     "message": "External service temporarily unavailable"
   }
   ```

8. Detenerse sin retry automático. El estado persistido debe ser:

   ```json
   {
     "id": "OP-001",
     "orderNumber": "1001",
     "status": "FAILED_RETRYABLE",
     "currentStep": "CONFIRM_EXTERNAL_TRANSACTION",
     "attemptCount": 1,
     "externalTransactionId": "EXT-78432",
     "lastErrorCode": "EXTERNAL_API_UNAVAILABLE",
     "lastErrorMessage": "External service temporarily unavailable"
   }
   ```

Ejecutar `demo:start` otra vez debe reconstruir el mismo caso y producir el mismo estado. La salida de terminal debe mostrar los pasos en términos comprensibles para la audiencia, con poco ruido y sin depender del color.

## Segunda ejecución: `demo:retry`

1. Verificar que **OP-001** existe y está en `FAILED_RETRYABLE`.
2. Configurar la confirmación de la API externa en modo `SUCCESS`.
3. Solicitar el retry manual mediante `POST /operations/OP-001/retry`.
4. Incrementar `attemptCount` de `1` a `2` y recuperar el paso `CONFIRM_EXTERNAL_TRANSACTION` y el identificador **EXT-78432**.
5. Continuar con éxito `CONFIRM_EXTERNAL_TRANSACTION`, `UPDATE_INTERNAL_DATABASE` y `FINISHED`.
6. Conservar **EXT-78432** y terminar con `status = FINISHED`.

El paso `CREATE_EXTERNAL_TRANSACTION` no se ejecuta en el segundo intento. Su protección mínima consiste en comprobar el `externalTransactionId` persistido: si ya existe, no se crea otra transacción. Se debe verificar que la llamada externa `POST /transactions` ocurrió exactamente **una vez** en la secuencia `demo:start` + `demo:retry`. La confirmación puede llamarse nuevamente.

## Estados y transiciones

```text
PENDING → PROCESSING → FINISHED
                     ↘ FAILED_RETRYABLE → PROCESSING  (solo retry manual)
                     ↘ FAILED_BUSINESS
```

- `POST /operations/:id/process` solo acepta `PENDING`.
- `POST /operations/:id/retry` solo acepta `FAILED_RETRYABLE`.
- `FAILED_BUSINESS` no acepta retry.
- Las transiciones inválidas se rechazan claramente, preferentemente con HTTP 409.
- Una operación `FAILED_RETRYABLE` permanece detenida hasta una petición manual de retry. No hay scheduler, polling ni backoff.

## Errores

La clasificación es explícita y sencilla:

| Respuesta externa | Clase | Estado resultante |
| --- | --- | --- |
| HTTP 5xx, como `EXTERNAL_API_UNAVAILABLE` | Transitorio | `FAILED_RETRYABLE` |
| HTTP 422 con `ORDER_CLOSED` | Funcional | `FAILED_BUSINESS` |

El ejemplo de error funcional es:

```json
{
  "code": "ORDER_CLOSED",
  "message": "The operation cannot be processed"
}
```

Un retry sobre una operación `FAILED_BUSINESS` responde HTTP 409, con código `OPERATION_NOT_RETRYABLE` y mensaje `Operation cannot be retried`. Esto permite explicar por qué retry no es una solución para todos los errores.

## Datos persistidos y trazabilidad

`IntegrationOperation` conserva, como mínimo: `id`, `order_number`, `status`, `current_step`, `attempt_count`, `external_transaction_id`, `last_error_code`, `last_error_message`, `created_at` y `updated_at`.

`IntegrationEvent` conserva, como mínimo: `id`, `operation_id`, `attempt`, `step`, `status`, `message` y `created_at`. Su historial esperado para el caso principal es:

| Intento | Paso | Resultado |
| --- | --- | --- |
| 1 | `VALIDATE` | `SUCCESS` |
| 1 | `CREATE_EXTERNAL_TRANSACTION` | `SUCCESS` |
| 1 | `CONFIRM_EXTERNAL_TRANSACTION` | `FAILED` |
| 2 | `CONFIRM_EXTERNAL_TRANSACTION` | `SUCCESS` |
| 2 | `UPDATE_INTERNAL_DATABASE` | `SUCCESS` |
| 2 | `FINISHED` | `SUCCESS` |

La secuencia responde las preguntas de la charla: dónde falló, qué había terminado, qué se guardó y desde qué punto continuó.

## Contratos HTTP

**integration-service:** `POST /operations`, `POST /operations/:id/process`, `POST /operations/:id/retry`, `GET /operations/:id`, `GET /operations/:id/events` y `GET /health`.

**external-api:** `POST /transactions`, `POST /transactions/:id/confirm`, `PUT /admin/mode` y `GET /admin/mode`. El mock soporta `SUCCESS`, `TRANSIENT_ERROR` y `BUSINESS_ERROR`, con configuración independiente para creación y confirmación. En el caso principal, creación tiene éxito y solo confirmación falla. `POST /admin/reset` reinicia el mock al comenzar el escenario. `GET /admin/stats` permite comprobar las llamadas: al finalizar el retry debe informar `createCalls: 1`, `confirmCalls: 2` y `transactionsCreated: 1`.

## Límites deliberados

El proyecto consta de dos aplicaciones NestJS, PostgreSQL y Docker Compose, con TypeScript y npm workspaces. Se ejecuta por completo en local. La configuración de host, URL, puertos y credenciales locales procede de variables de entorno. El esquema se crea automáticamente para la demo. El `integration-service` se empaqueta como contenedor apto para un despliegue posterior en ECS Fargate.

El MVP no incluye interfaz gráfica, autenticación, mensajería, orquestadores, observabilidad distribuida, retries automáticos ni infraestructura AWS. El escenario evita datos de empresas, clientes u órdenes reales.
