// Implementación ligera de EventEmitter para React Native (reemplaza el módulo 'events' de Node)

type EventCallback = (...args: unknown[]) => void;

class EventEmitter {
    private listeners: Record<string, EventCallback[]>;

    constructor() {
        this.listeners = {};
    }

    on(event: string, callback: EventCallback): void {
        if (!this.listeners[event]) {
            this.listeners[event] = [];
        }
        this.listeners[event].push(callback);
    }

    off(event: string, callback: EventCallback): void {
        if (!this.listeners[event]) {
            return;
        }
        this.listeners[event] = this.listeners[event].filter((cb) => cb !== callback);
    }

    emit(event: string, ...args: unknown[]): void {
        if (!this.listeners[event]) {
            return;
        }
        this.listeners[event].forEach((callback) => callback(...args));
    }
}

const eventEmitter = new EventEmitter();

export const EVENTS = {
    SYNC_NEEDED: 'sync_needed',
} as const;

export default eventEmitter;
