import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import client from '../api/client';

const QUEUE_KEY = 'offline_sync_queue';

/**
 * Añade una petición a la cola de sincronización offline.
 * @param {string} url URL de la petición.
 * @param {string} method Método HTTP (POST, PUT, DELETE).
 * @param {object} data Cuerpo de la petición.
 */
export const queueRequest = async (url, method, data) => {
    try {
        const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
        const queue = queueStr ? JSON.parse(queueStr) : [];
        
        const newRequest = {
            id: Date.now().toString(),
            url,
            method,
            data,
            timestamp: new Date().toISOString()
        };
        
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify([...queue, newRequest]));
        console.log(`[Offline Queue] Petición añadida: ${method} ${url}`);
    } catch (e) {
        console.error('Error al encolar petición offline:', e);
    }
};

/**
 * Procesa todas las peticiones en la cola.
 */
export const processQueue = async () => {
    try {
        const state = await NetInfo.fetch();
        if (!state.isConnected) return;

        const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
        if (!queueStr) return;
        
        const queue = JSON.parse(queueStr);
        if (queue.length === 0) return;

        console.log(`[Offline Sync] Sincronizando ${queue.length} peticiones...`);
        
        const remainingQueue = [];

        for (const request of queue) {
            try {
                await client({
                    url: request.url,
                    method: request.method,
                    data: request.data
                });
                console.log(`[Offline Sync] Éxito: ${request.method} ${request.url}`);
            } catch (error) {
                console.error(`[Offline Sync] Error en ${request.method} ${request.url}, manteniendo en cola.`);
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
export const startSyncListener = () => {
    NetInfo.addEventListener(state => {
        if (state.isConnected) {
            processQueue();
        }
    });
};
