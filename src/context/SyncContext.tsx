import React, {
    createContext,
    useState,
    useEffect,
    useCallback,
    ReactNode,
} from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { getQueueSize, processQueue } from '../utils/syncManager';
import eventEmitter, { EVENTS } from '../utils/events';

export interface SyncContextValue {
    pendingCount: number;
    isSyncing: boolean;
    isConnected: boolean;
    refreshPendingCount: () => Promise<void>;
    syncNow: () => Promise<void>;
}

export const SyncContext = createContext<SyncContextValue>(
    {} as SyncContextValue
);

interface SyncProviderProps {
    children: ReactNode;
}

export const SyncProvider: React.FC<SyncProviderProps> = ({ children }) => {
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing, setIsSyncing] = useState(false);
    const [isConnected, setIsConnected] = useState(true);

    const refreshPendingCount = useCallback(async () => {
        const size = await getQueueSize();
        setPendingCount(size);
    }, []);

    const syncNow = useCallback(async () => {
        const state = await NetInfo.fetch();
        if (!state.isConnected) {
            await refreshPendingCount();
            return;
        }
        const size = await getQueueSize();
        if (size === 0) {
            setPendingCount(0);
            return;
        }
        setIsSyncing(true);
        try {
            await processQueue();
        } finally {
            await refreshPendingCount();
            setIsSyncing(false);
        }
    }, [refreshPendingCount]);

    useEffect(() => {
        // 1. Cargar conteo inicial y sincronizar si hay red
        refreshPendingCount();

        // 2. Escuchar eventos internos para refrescar el conteo
        eventEmitter.on(EVENTS.SYNC_NEEDED, refreshPendingCount);
        eventEmitter.on(EVENTS.SYNC_COMPLETED, refreshPendingCount);

        // 3. Escuchar cambios de red
        const unsubscribe = NetInfo.addEventListener((state) => {
            const connected = Boolean(state.isConnected);
            setIsConnected(connected);
            if (connected) {
                // Pequeña espera para que la interfaz de red y DNS terminen de levantarse tras modo avión
                setTimeout(() => {
                    syncNow();
                }, 1200);
            }
        });

        // 4. Reintentar al volver a primer plano
        const appStateSub = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                syncNow();
            }
        });

        // 5. Reintento periódico si quedaron elementos pendientes con red
        const interval = setInterval(() => {
            syncNow();
        }, 20000);

        return () => {
            eventEmitter.off(EVENTS.SYNC_NEEDED, refreshPendingCount);
            eventEmitter.off(EVENTS.SYNC_COMPLETED, refreshPendingCount);
            if (unsubscribe) unsubscribe();
            appStateSub.remove();
            if (interval) clearInterval(interval);
        };
    }, [refreshPendingCount, syncNow]);

    return (
        <SyncContext.Provider
            value={{
                pendingCount,
                isSyncing,
                isConnected,
                refreshPendingCount,
                syncNow,
            }}
        >
            {children}
        </SyncContext.Provider>
    );
};
