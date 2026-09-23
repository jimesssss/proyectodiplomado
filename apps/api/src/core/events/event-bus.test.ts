/**
 * Bus de eventos in-process — ADR-007 (unitario, sin base de datos).
 */
import { describe, expect, it } from 'vitest';
import { createEventBus, eventBus, type BusEvent } from './event-bus.js';

describe('event bus: emisión tipada', () => {
  it('construye el sobre-encabezado (eventId, name, payload, occurredAt)', async () => {
    const bus = createEventBus();
    const seen: BusEvent<'WorkflowCompleted'>[] = [];
    bus.on('WorkflowCompleted', (event) => {
      seen.push(event);
    });

    await bus.emit('WorkflowCompleted', { workflowInstanceId: 'i1', outcome: 'approved' });

    expect(seen).toHaveLength(1);
    const [event] = seen;
    expect(event?.name).toBe('WorkflowCompleted');
    expect(event?.eventId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
    expect(event?.payload).toEqual({ workflowInstanceId: 'i1', outcome: 'approved' });
    expect(event?.occurredAt).toBeInstanceOf(Date);
  });

  it('sin handlers la emisión resuelve sin efectos', async () => {
    const bus = createEventBus();
    await expect(
      bus.emit('StockLow', { productId: 'p', warehouseId: 'w', available: 0 }),
    ).resolves.toBeUndefined();
  });

  it('no cruza eventos: un handler de X no recibe Y', async () => {
    const bus = createEventBus();
    let workflowCalls = 0;
    bus.on('WorkflowCompleted', () => {
      workflowCalls += 1;
    });
    await bus.emit('CustomerCreated', { customerId: 'c1', tenantId: 't1' });
    expect(workflowCalls).toBe(0);
  });
});

describe('event bus: suscriptores', () => {
  it('los handlers corren en orden de registro y la baja (off) los remueve', async () => {
    const bus = createEventBus();
    const order: string[] = [];
    bus.on('WorkflowCompleted', () => {
      order.push('first');
    });
    const offSecond = bus.on('WorkflowCompleted', () => {
      order.push('second');
    });

    await bus.emit('WorkflowCompleted', { workflowInstanceId: 'i1', outcome: 'rejected' });
    expect(order).toEqual(['first', 'second']);

    offSecond();
    await bus.emit('WorkflowCompleted', { workflowInstanceId: 'i2', outcome: 'approved' });
    expect(order).toEqual(['first', 'second', 'first']);
  });

  it('un fallo de handler se aísla: onError recibe (error, event) y SIGUE la cola', async () => {
    const errors: unknown[] = [];
    const events: BusEvent[] = [];
    const bus = createEventBus({
      onError: (error, event) => {
        errors.push(error);
        events.push(event);
      },
    });
    let ran = false;
    bus.on('WorkflowCompleted', () => {
      throw new Error('handler roto');
    });
    bus.on('WorkflowCompleted', async () => {
      ran = true;
    });

    await expect(
      bus.emit('WorkflowCompleted', { workflowInstanceId: 'i1', outcome: 'approved' }),
    ).resolves.toBeUndefined();
    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('handler roto');
    expect(events[0]?.name).toBe('WorkflowCompleted');
    expect(ran).toBe(true); // el fallo de UNO no corta a los demás
  });

  it('la instancia única existente expone la superficie del bus', () => {
    expect(typeof eventBus.on).toBe('function');
    expect(typeof eventBus.emit).toBe('function');
  });
});
