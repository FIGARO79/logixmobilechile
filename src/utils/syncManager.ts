import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { isAxiosError } from 'axios';
import client from '../api/client';
import eventEmitter, { EVENTS } from './events';

const QUEUE_KEY = 'offline_sync_queue';
let isProcessingQueue = false;

export interface QueuedRequest {
    id: string;
    url: string;
    method: string;
    data: unknown;
    timestamp: string;
}

interface W2WQueuedPayload {
    session_id?: number | null;
    stockroom?: string;
    item_code?: string;
    counted_location?: string;
    counted_qty?: number;
    [key: string]: unknown;
}

/**
 * Añade una petición a la cola de sincronización offline.
 * Para conteos W2W (/api/w2w/save_count), si ya existe un conteo pendiente
 * para la misma llave (session_id, stockroom, counted_location, item_code),
 * sobrescribe su cantidad y timestamp en lugar de duplicar la petición.
 */
export const queueRequest = async (
    url: string,
    method: string,
    data: unknown
): Promise<void> => {
    try {
        const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
        const queue: QueuedRequest[] = queueStr ? JSON.parse(queueStr) : [];

        if (
            url.includes('/api/w2w/save_count') &&
            method.toLowerCase() === 'post' &&
            data &&
            typeof data === 'object'
        ) {
            const incoming = data as W2WQueuedPayload;
            const inLoc = String(incoming.counted_location || '')
                .trim()
                .toUpperCase();
            const inCode = String(incoming.item_code || '')
                .trim()
                .toUpperCase();
            const inStk = String(incoming.stockroom || '').trim();

            const existingIdx = queue.findIndex((req) => {
                if (
                    !req.url.includes('/api/w2w/save_count') ||
                    req.method.toLowerCase() !== 'post' ||
                    !req.data ||
                    typeof req.data !== 'object'
                ) {
                    return false;
                }
                const prev = req.data as W2WQueuedPayload;
                return (
                    prev.session_id === incoming.session_id &&
                    String(prev.stockroom || '').trim() === inStk &&
                    String(prev.counted_location || '')
                        .trim()
                        .toUpperCase() === inLoc &&
                    String(prev.item_code || '')
                        .trim()
                        .toUpperCase() === inCode
                );
            });

            if (existingIdx !== -1) {
                const updatedQueue = [...queue];
                updatedQueue[existingIdx] = {
                    ...updatedQueue[existingIdx],
                    data,
                    timestamp: new Date().toISOString(),
                };
                await AsyncStorage.setItem(
                    QUEUE_KEY,
                    JSON.stringify(updatedQueue)
                );
                console.log(
                    `[Offline Queue] Conteo W2W actualizado en cola: ${inLoc} / ${inCode} -> ${incoming.counted_qty}`
                );
                return;
            }
        }

        const newRequest: QueuedRequest = {
            id: Date.now().toString(),
            url,
            method,
            data,
            timestamp: new Date().toISOString(),
        };

        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, newRequest]));
        console.log(`[Offline Queue] Petición añadida: ${method.toUpperCase()} ${url}`);
    } catch (e) {
        console.error('Error al encolar petición offline:', e);
    }
};

/**
 * Obtiene el número de peticiones pendientes en la cola.
 */
export const getQueueSize = async (): Promise<number> => {
    try {
        const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
        if (!queueStr) return 0;
        const queue: QueuedRequest[] = JSON.parse(queueStr);
        return queue.length;
    } catch {
        return 0;
    }
};

/**
 * Devuelve el conjunto de llaves "BIN::SKU" de conteos W2W que siguen pendientes en cola.
 */
export const getPendingW2WKeys = async (
    stockroom?: string
): Promise<Set<string>> => {
    const keys = new Set<string>();
    try {
        const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
        if (!queueStr) return keys;
        const queue: QueuedRequest[] = JSON.parse(queueStr);
        for (const req of queue) {
            if (
                req.url.includes('/api/w2w/save_count') &&
                req.data &&
                typeof req.data === 'object'
            ) {
                const payload = req.data as W2WQueuedPayload;
                if (
                    stockroom &&
                    String(payload.stockroom || '').trim() !== stockroom.trim()
                ) {
                    continue;
                }
                const loc = String(payload.counted_location || '')
                    .trim()
                    .toUpperCase();
                const code = String(payload.item_code || '')
                    .trim()
                    .toUpperCase();
                if (loc && code) {
                    keys.add(`${loc}::${code}`);
                }
            }
        }
    } catch {
        // Ignorar error de lectura
    }
    return keys;
};

/**
 * Procesa todas las peticiones en la cola.
 */
export const processQueue = async (): Promise<void> => {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    try {
        const state = await NetInfo.fetch();
        if (!state.isConnected) return;

        const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
        if (!queueStr) return;

        const queue: QueuedRequest[] = JSON.parse(queueStr);
        if (queue.length === 0) return;

        console.log(`[Offline Sync] Sincronizando ${queue.length} peticiones...`);

        const remainingQueue: QueuedRequest[] = [];

        for (const request of queue) {
            try {
                await client({
                    url: request.url,
                    method: request.method,
                    data: request.data,
                    // Si el dato es un FormData (común en este proyecto), axios lo maneja.
                    headers:
                        request.data instanceof FormData
                            ? { 'Content-Type': 'multipart/form-data' }
                            : {},
                });
                console.log(
                    `[Offline Sync] Éxito: ${request.method.toUpperCase()} ${request.url}`
                );
            } catch (error) {
                // Conservar peticiones si la sesión expiró (401), fallo CSRF (403) o rate limit (429)
                // para no perder conteos offline; descartar solo errores de validación 4xx definitivos.
                if (
                    isAxiosError(error) &&
                    error.response &&
                    error.response.status >= 400 &&
                    error.response.status < 500 &&
                    error.response.status !== 401 &&
                    error.response.status !== 403 &&
                    error.response.status !== 429
                ) {
                    console.error(
                        `[Offline Sync] Error crítico (${error.response.status}) en ${request.url}. Descartando petición.`
                    );
                    continue; // No la añadimos a remainingQueue
                }

                if (isAxiosError(error) && error.response && error.response.status >= 500) {
                    console.error(
                        `[Offline Sync] Error del servidor (500) en ${request.url}:`,
                        error.response.data
                    );
                }
                console.error(
                    `[Offline Sync] Error temporal en ${request.url}, manteniendo en cola.`
                );
                remainingQueue.push(request);
            }
        }

        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remainingQueue));
        eventEmitter.emit(EVENTS.SYNC_COMPLETED);
        eventEmitter.emit(EVENTS.SYNC_NEEDED);
    } catch (e) {
        console.error('Error procesando la cola de sincronización:', e);
    } finally {
        isProcessingQueue = false;
    }
};

/**
 * Hook de ejemplo para inicializar el escucha de red (debe llamarse en App.tsx o un provider global).
 */
export const startSyncListener = (): (() => void) => {
    return NetInfo.addEventListener((state) => {
        if (state.isConnected) {
            processQueue();
        }
    });
};
