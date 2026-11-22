import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { isAxiosError } from 'axios';
import client from '../api/client';

const QUEUE_KEY = 'offline_sync_queue';

export interface QueuedRequest {
    id: string;
    url: string;
    method: string;
    data: unknown;
    timestamp: string;
}

/**
 * Añade una petición a la cola de sincronización offline.
 */
export const queueRequest = async (
    url: string,
    method: string,
    data: unknown
): Promise<void> => {
    try {
        const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
        const queue: QueuedRequest[] = queueStr ? JSON.parse(queueStr) : [];

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
 * Procesa todas las peticiones en la cola.
 */
export const processQueue = async (): Promise<void> => {
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
                // Si el servidor responde con un error de cliente (4xx), la petición probablemente es inválida
                // No debemos reintentarla eternamente. Solo reintentamos si no hay respuesta o es error 5xx.
                if (
                    isAxiosError(error) &&
                    error.response &&
                    error.response.status >= 400 &&
                    error.response.status < 500
                ) {
                    console.error(
                        `[Offline Sync] Error crítico (4xx) en ${request.url}. Descartando petición.`
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
    } catch (e) {
        console.error('Error procesando la cola de sincronización:', e);
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
