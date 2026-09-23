import { randomUUID } from 'node:crypto';
import { createLogger } from '../logging/logger.js';

/**
 * Bus de eventos in-process tipado (ADR-007, `docs/architecture/events-jobs.md`).
 *
 * - **Tipado**: `emit<K extends keyof ERPEventMap>(name, payload)` — prohibido
 *   emitir strings arbitrarios: el catálogo es contrato y falla en compilación.
 * - **Transporte in-process** (monolito): los handlers se invocan en orden de
 *   registro, síncronos/awaited; `emit` SIEMPRE resuelve (un handler en fallo
 *   se AISLA: se captura y se loguea, nunca rompe la operación de negocio —
 *   el evento se emite después del commit del estado).
 * - **Consumidores idempotentes** por `eventId` (cada emisión genera uno nuevo).
 * - **Diferido con honestidad**: el outbox transaccional (`eventsOutbox`), la
 *   cola de jobs (`jobs`) y el modo `deferred` de ADR-007 NO están implementados
 *   (diseño en FASE 1, implementación en Core quedó PARTIAL) → esta fase monta
 *   SOLO el bus in-process; ver `docs/api/workflows.md` (riesgos).
 */

/** Catálogo inicial de eventos (events-jobs.md §1). */
export interface ERPEventMap {
  readonly CustomerCreated: {
    readonly customerId: string;
    readonly tenantId: string;
  };
  readonly SalesOrderCreated: {
    readonly orderId: string;
    readonly customerId: string;
    readonly total: number;
  };
  readonly PaymentReceived: {
    readonly paymentId: string;
    readonly invoiceId: string | null;
    readonly amount: number;
  };
  readonly StockLow: {
    readonly productId: string;
    readonly warehouseId: string;
    readonly available: number;
  };
  readonly InvoiceApproved: {
    readonly invoiceId: string;
    readonly approvedBy: string;
  };
  readonly PurchaseReceived: {
    readonly receiptId: string;
    readonly poId: string;
  };
  readonly WorkflowCompleted: {
    readonly workflowInstanceId: string;
    readonly outcome: 'approved' | 'rejected' | 'skipped';
  };
}

export type ERPEventName = keyof ERPEventMap;

/** Sobre-encabezado de toda emisión: `eventId` + `occurredAt` (ADR-007). */
export interface BusEvent<K extends ERPEventName = ERPEventName> {
  readonly eventId: string;
  readonly name: K;
  readonly payload: ERPEventMap[K];
  readonly occurredAt: Date;
}

export type EventHandler<K extends ERPEventName> = (event: BusEvent<K>) => void | Promise<void>;

/** Manejador erasure interno: `emit` solo lo invoca con el payload de SU nombre. */
type InternalHandler = (event: BusEvent) => void | Promise<void>;

export interface EventBusOptions {
  readonly onError?: ((error: unknown, event: BusEvent) => void) | undefined;
}

export interface EventBus {
  /** Suscribe un handler; devuelve la función de baja (idempotente). */
  on<K extends ERPEventName>(name: K, handler: EventHandler<K>): () => void;
  /** Emite tras el commit; espera a los handlers y aísla sus fallos. */
  emit<K extends ERPEventName>(name: K, payload: ERPEventMap[K]): Promise<void>;
}

const errorLogger = createLogger('error');

function defaultOnError(error: unknown, event: BusEvent): void {
  errorLogger.error(
    { err: error, eventId: event.eventId, event: event.name },
    'event handler failed',
  );
}

/**
 * Fábrica con `onError` inyectable (tests). La instancia por defecto
 * (`eventBus`) loguea los fallos de handler con nivel `error`.
 */
export function createEventBus(options: EventBusOptions = {}): EventBus {
  const onError = options.onError ?? defaultOnError;
  const handlers = new Map<ERPEventName, InternalHandler[]>();

  function remove(name: ERPEventName, handler: InternalHandler): void {
    const list = handlers.get(name);
    if (list === undefined) {
      return;
    }
    const index = list.indexOf(handler);
    if (index >= 0) {
      list.splice(index, 1);
    }
  }

  return {
    on(name, handler) {
      const internal = handler as unknown as InternalHandler;
      const list = handlers.get(name) ?? [];
      list.push(internal);
      handlers.set(name, list);
      return () => remove(name, internal);
    },

    async emit(name, payload) {
      const list = handlers.get(name);
      if (list === undefined || list.length === 0) {
        return;
      }
      const event: BusEvent<ERPEventName> = {
        eventId: randomUUID(),
        name,
        payload,
        occurredAt: new Date(),
      };
      // Copia: un handler puede darse de baja a sí mismo durante la emisión.
      for (const handler of [...list]) {
        try {
          await handler(event);
        } catch (error) {
          onError(error, event);
        }
      }
    },
  };
}

/** Instancia única del bus (la composition root no interviene: import directo). */
export const eventBus = createEventBus();
