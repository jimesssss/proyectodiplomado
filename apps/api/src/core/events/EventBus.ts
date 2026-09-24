/**
 * Event Bus for internal event handling
 */

export type EventHandler<T = unknown> = (event: T) => Promise<void> | void;

interface EventListener {
  handler: EventHandler;
  priority?: number;
}

export class EventBus {
  private listeners: Map<string, EventListener[]> = new Map();

  /**
   * Subscribe to an event
   */
  on<T = unknown>(eventName: string, handler: EventHandler<T>, priority = 0): () => void {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }

    const listeners = this.listeners.get(eventName)!;
    listeners.push({ handler, priority });
    listeners.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Return unsubscribe function
    return () => {
      const index = listeners.indexOf({ handler, priority });
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }

  /**
   * Subscribe to an event only once
   */
  once<T = unknown>(eventName: string, handler: EventHandler<T>): () => void {
    const wrappedHandler: EventHandler<T> = async (event: T) => {
      unsubscribe();
      await handler(event);
    };

    const unsubscribe = this.on(eventName, wrappedHandler);
    return unsubscribe;
  }

  /**
   * Emit an event
   */
  async emit<T = unknown>(eventName: string, event: T): Promise<void> {
    const listeners = this.listeners.get(eventName) || [];
    for (const listener of listeners) {
      try {
        await listener.handler(event);
      } catch (error) {
        // Log error but don't break the chain
        console.error(`Error in event handler for ${eventName}:`, error);
      }
    }
  }

  /**
   * Remove all listeners for an event
   */
  off(eventName: string): void {
    this.listeners.delete(eventName);
  }

  /**
   * Clear all listeners
   */
  clear(): void {
    this.listeners.clear();
  }
}

export const eventBus = new EventBus();
