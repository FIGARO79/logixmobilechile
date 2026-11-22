import React, {
    createContext,
    useState,
    useEffect,
    useCallback,
    ReactNode,
} from 'react';
import NetInfo from '@react-native-community/netinfo';
import { getQueueSize, processQueue } from '../utils/syncManager';
import eventEmitter, { EVENTS } from '../utils/events';

export interface SyncContextValue {
    pendingCount: number;
    isSyncing: boolean;
    isConnected: boolean;
    refreshPendingCount: () => Promise<void>;
}

export const SyncContext = createContext<SyncContextValue>(
    {} as SyncContextValue
);

interface SyncProviderProps {
    children: ReactNode;
}

export const SyncProvider: React.FC<SyncProviderProps> = ({ children }) => {
    const [pendingCount, setPendingCount] = useState(0);
    const [isSyncing] = useState(false);
    const [isConnected, setIsConnected] = useState(true);

    const refreshPendingCount = useCallback(async () => {
        const size = await getQueueSize();
        setPendingCount(size);
    }, []);

    useEffect(() => {
        // 1. Cargar conteo inicial
        refreshPendingCount();

        // 2. Escuchar el evento interno para refrescar el conteo (ej. tras encolar algo)
        eventEmitter.on(EVENTS.SYNC_NEEDED, refreshPendingCount);

        // 3. Escuchar cambios de red
        const unsubscribe = NetInfo.addEventListener((state) => {
            const connected = Boolean(state.isConnected);
            setIsConnected(connected);
            if (connected) {
                processQueue();
                refreshPendingCount();
            }
        });

        const interval = setInterval(() => {
            refreshPendingCount();
        }, 60000);

        return () => {
            eventEmitter.off(EVENTS.SYNC_NEEDED, refreshPendingCount);
            if (unsubscribe) unsubscribe();
            if (interval) clearInterval(interval);
        };
    }, [refreshPendingCount]);

    return (
        <SyncContext.Provider
            value={{
                pendingCount,
                isSyncing,
                isConnected,
                refreshPendingCount,
            }}
        >
            {children}
        </SyncContext.Provider>
    );
};
