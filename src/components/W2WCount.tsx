import React, {
    useState,
    useRef,
    useEffect,
    useCallback,
    useContext,
} from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    FlatList,
    Vibration,
    Modal,
    AppState,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAxiosError } from 'axios';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import client from '../api/client';
import { SyncContext } from '../context/SyncContext';
import { getPendingW2WKeys, queueRequest } from '../utils/syncManager';
import eventEmitter, { EVENTS } from '../utils/events';
import ScannerModal from './ScannerModal';
import useDataWedge from '../hooks/useDataWedge';
import { parseBarcode } from '../utils/barcodeParser';
import fluent from '../theme/fluent';
import type { RootStackParamList } from '../navigation/AppNavigator';

interface W2WSession {
    id?: number;
    session_id?: number;
    user_username?: string;
    stockroom?: string;
}

interface W2WStockroomsResponse {
    stockrooms?: string[];
    all_stockrooms?: string[];
    assigned_stockrooms?: string[];
    stages_by_stockroom?: Record<string, number>;
}

interface W2WItemData {
    item_code: string;
    description?: string;
    bin_location?: string;
    system_qty?: number;
    in_master?: boolean;
    is_recounted?: boolean;
    counted_qty_in_stage?: number;
}

interface RecentW2WCount {
    id: number;
    item_code: string;
    counted_location: string;
    counted_qty: number;
    description: string;
    time: string;
    offline?: boolean;
}

interface CachedW2WState {
    stage: number;
    activeSession: W2WSession | null;
    activeSessionId: number | null;
}

interface CountedItemRecord {
    item_code: string;
    counted_location: string;
    counted_qty: number;
    description: string;
    bin_location_system: string;
    timestamp: string;
    session_id: number | null;
    stage?: number;
}

interface DuplicateCountPrompt {
    item_code: string;
    counted_location: string;
    previous_qty: number;
    description: string;
    bin_location_system: string;
}

export interface W2WCountProps {
    navigation?: NativeStackNavigationProp<RootStackParamList, 'W2W'>;
}

const W2W_STOCKROOM_KEY = 'w2w_stockroom';
const W2W_STOCKROOMS_LIST_KEY = 'w2w_available_stockrooms';
const MASTER_CHUNK_SIZE = 1000;
const getMasterCacheKey = (stk: string) => `w2w_items_master_${stk}`;
const getMasterChunksCountKey = (stk: string) => `w2w_items_master_${stk}_chunks`;
const getMasterChunkKey = (stk: string, idx: number) =>
    `w2w_items_master_${stk}_chunk_${idx}`;
const getMasterExtraKey = (stk: string) => `w2w_items_master_${stk}_extra`;
const getStateCacheKey = (stk: string) => `w2w_session_stage_${stk}`;
const getCountedMapKey = (stk: string) => `w2w_counted_map_${stk}`;
const getRecentCountsKey = (stk: string) => `w2w_recent_counts_${stk}`;
const buildCountKey = (loc: string, code: string) =>
    `${loc.trim().toUpperCase()}::${code.trim().toUpperCase()}`;

async function saveMasterCatalogChunked(
    stk: string,
    catalogMap: Record<string, W2WItemData>
): Promise<void> {
    const entries = Object.entries(catalogMap);
    const chunkCount = Math.ceil(entries.length / MASTER_CHUNK_SIZE);
    const pairs: [string, string][] = [
        [getMasterChunksCountKey(stk), String(chunkCount)],
    ];
    for (let i = 0; i < chunkCount; i++) {
        const sliceObj = Object.fromEntries(
            entries.slice(i * MASTER_CHUNK_SIZE, (i + 1) * MASTER_CHUNK_SIZE)
        );
        pairs.push([getMasterChunkKey(stk, i), JSON.stringify(sliceObj)]);
    }
    await AsyncStorage.multiSet(pairs);
    // Eliminar clave antigua monolítica para evitar CursorWindow en Android
    await AsyncStorage.removeItem(getMasterCacheKey(stk)).catch(() => {});
}

async function loadMasterCatalogChunked(
    stk: string
): Promise<Record<string, W2WItemData>> {
    const countStr = await AsyncStorage.getItem(getMasterChunksCountKey(stk));
    const merged: Record<string, W2WItemData> = {};

    if (countStr) {
        const count = parseInt(countStr, 10) || 0;
        if (count > 0) {
            const keys = Array.from({ length: count }, (_, i) =>
                getMasterChunkKey(stk, i)
            );
            const rows = await AsyncStorage.multiGet(keys);
            for (const [, val] of rows) {
                if (val) {
                    Object.assign(
                        merged,
                        JSON.parse(val) as Record<string, W2WItemData>
                    );
                }
            }
        }
    } else {
        try {
            const legacy = await AsyncStorage.getItem(getMasterCacheKey(stk));
            if (legacy) {
                Object.assign(
                    merged,
                    JSON.parse(legacy) as Record<string, W2WItemData>
                );
            }
        } catch {
            // Si la clave antigua excede 2MB (CursorWindow), eliminarla
            await AsyncStorage.removeItem(getMasterCacheKey(stk)).catch(
                () => {}
            );
        }
    }

    try {
        const extraStr = await AsyncStorage.getItem(getMasterExtraKey(stk));
        if (extraStr) {
            Object.assign(
                merged,
                JSON.parse(extraStr) as Record<string, W2WItemData>
            );
        }
    } catch {
        // Ignorar si extra falla
    }

    return merged;
}

export const W2WCount: React.FC<W2WCountProps> = ({ navigation }) => {
    const { isConnected } = useContext(SyncContext);
    const isConnectedRef = useRef(isConnected);
    isConnectedRef.current = isConnected;

    // Stockroom & Stage & Session Info
    const [stockroom, setStockroom] = useState<string>('01');
    const [availableStockrooms, setAvailableStockrooms] = useState<string[]>([
        '01',
    ]);
    const [stagesByStockroom, setStagesByStockroom] = useState<
        Record<string, number>
    >({});
    const [loadingStockrooms, setLoadingStockrooms] = useState(false);
    const [stockroomModalOpen, setStockroomModalOpen] = useState(false);
    const [hasConfirmedStockroom, setHasConfirmedStockroom] = useState(false);
    const [stage, setStage] = useState(1); // 1: Conteo Gral, 2: Reconteo, 3: Conciliación
    const [activeSession, setActiveSession] = useState<W2WSession | null>(null);
    const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [loadingSession, setLoadingSession] = useState(false);

    // Local Master Cache (in-memory mirror of AsyncStorage for instant lookup)
    const [masterCatalog, setMasterCatalog] = useState<
        Record<string, W2WItemData>
    >({});
    const [syncingMaster, setSyncingMaster] = useState(false);

    // Form Capture State
    const [countedLocation, setCountedLocation] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [description, setDescription] = useState('');
    const [binSys, setBinSys] = useState('');
    const [countedQty, setCountedQty] = useState('');
    const [itemData, setItemData] = useState<W2WItemData | null>(null);
    const [loadingItem, setLoadingItem] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [recentCounts, setRecentCounts] = useState<RecentW2WCount[]>([]);
    const [countedItemsMap, setCountedItemsMap] = useState<
        Record<string, CountedItemRecord>
    >({});
    const countedItemsMapRef = useRef<Record<string, CountedItemRecord>>({});
    countedItemsMapRef.current = countedItemsMap;

    // Duplicate (BIN + SKU) Detection & Correction Modals
    const [duplicatePrompt, setDuplicatePrompt] =
        useState<DuplicateCountPrompt | null>(null);
    const [correctionModalData, setCorrectionModalData] =
        useState<DuplicateCountPrompt | null>(null);
    const [correctionQty, setCorrectionQty] = useState('');

    // Stage >= 2 Recounts List
    const [recountItems, setRecountItems] = useState<W2WItemData[]>([]);
    const [loadingRecounts, setLoadingRecounts] = useState(false);
    const [recountFilterTab, setRecountFilterTab] = useState<'pending' | 'all'>(
        'pending'
    );
    const [recountSearch, setRecountSearch] = useState('');
    const [recountModalItem, setRecountModalItem] =
        useState<W2WItemData | null>(null);
    const [recountModalLoc, setRecountModalLoc] = useState('');
    const [recountModalQty, setRecountModalQty] = useState('');

    // Hardware & Camera Scanner
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState<'location' | 'item' | null>(
        null
    );

    // Refs
    const locationInputRef = useRef<TextInput | null>(null);
    const itemInputRef = useRef<TextInput | null>(null);
    const qtyInputRef = useRef<TextInput | null>(null);
    const stageRef = useRef(stage);
    const activeSessionRef = useRef(activeSession);
    const activeSessionIdRef = useRef(activeSessionId);
    const phaseAlertShownRef = useRef(false);

    stageRef.current = stage;
    activeSessionRef.current = activeSession;
    activeSessionIdRef.current = activeSessionId;

    // Persist local session/stage snapshot
    const persistLocalState = useCallback(
        async (
            stk: string,
            nextStage: number,
            nextSession: W2WSession | null,
            nextSessionId: number | null
        ) => {
            try {
                const snapshot: CachedW2WState = {
                    stage: nextStage,
                    activeSession: nextSession,
                    activeSessionId: nextSessionId,
                };
                await AsyncStorage.setItem(
                    getStateCacheKey(stk),
                    JSON.stringify(snapshot)
                );
            } catch (e) {
                console.warn('[W2W Cache] Error guardando estado local:', e);
            }
        },
        []
    );

    // Persist local counted items map & recent counts
    const recordLocalCount = useCallback(
        (
            stk: string,
            record: CountedItemRecord,
            offline: boolean
        ) => {
            const key = buildCountKey(
                record.counted_location,
                record.item_code
            );
            const nextMap = {
                ...countedItemsMapRef.current,
                [key]: record,
            };
            countedItemsMapRef.current = nextMap;
            setCountedItemsMap(nextMap);
            AsyncStorage.setItem(
                getCountedMapKey(stk),
                JSON.stringify(nextMap)
            ).catch(() => {});

            const timeLabel = new Date().toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
            });
            setRecentCounts((prev) => {
                const filtered = prev.filter(
                    (c) =>
                        !(
                            c.item_code.trim().toUpperCase() ===
                                record.item_code &&
                            c.counted_location.trim().toUpperCase() ===
                                record.counted_location
                        )
                );
                const nextRecent: RecentW2WCount[] = [
                    {
                        id: Date.now(),
                        item_code: record.item_code,
                        counted_location: record.counted_location,
                        counted_qty: record.counted_qty,
                        description: record.description || 'N/A',
                        time: timeLabel,
                        offline,
                    },
                    ...filtered.slice(0, 9),
                ];
                AsyncStorage.setItem(
                    getRecentCountsKey(stk),
                    JSON.stringify(nextRecent)
                ).catch(() => {});
                return nextRecent;
            });
        },
        []
    );

    const findPreviousCount = useCallback(
        (loc: string, code: string): CountedItemRecord | null => {
            const key = buildCountKey(loc, code);
            const existing = countedItemsMapRef.current[key];
            if (!existing) return null;
            if (
                stageRef.current > 0 &&
                existing.stage &&
                existing.stage !== stageRef.current
            ) {
                return null;
            }
            return existing;
        },
        []
    );

    // Load cached master & state for current stockroom
    const loadLocalCacheForStockroom = useCallback(async (stk: string) => {
        try {
            const [catalog, stateStr, countedMapStr, recentStr] =
                await Promise.all([
                    loadMasterCatalogChunked(stk),
                    AsyncStorage.getItem(getStateCacheKey(stk)),
                    AsyncStorage.getItem(getCountedMapKey(stk)),
                    AsyncStorage.getItem(getRecentCountsKey(stk)),
                ]);

            setMasterCatalog(catalog);

            let restoredStage = stageRef.current;
            if (stateStr) {
                const parsedState = JSON.parse(stateStr) as CachedW2WState;
                if (typeof parsedState.stage === 'number') {
                    restoredStage = parsedState.stage;
                    stageRef.current = parsedState.stage;
                    setStage(parsedState.stage);
                }
                if (parsedState.activeSession) {
                    activeSessionRef.current = parsedState.activeSession;
                    activeSessionIdRef.current = parsedState.activeSessionId;
                    setActiveSession(parsedState.activeSession);
                    setActiveSessionId(parsedState.activeSessionId);
                }
            }

            const restoredMap: Record<string, CountedItemRecord> = {};
            if (countedMapStr) {
                const parsedMap = JSON.parse(countedMapStr) as Record<
                    string,
                    CountedItemRecord
                >;
                for (const [k, v] of Object.entries(parsedMap)) {
                    if (
                        restoredStage === 0 ||
                        !v.stage ||
                        v.stage === restoredStage
                    ) {
                        restoredMap[k] = v;
                    }
                }
            }

            if (recentStr) {
                const parsedRecent = JSON.parse(recentStr) as RecentW2WCount[];
                const pendingKeys = await getPendingW2WKeys(stk);
                const reconciled = parsedRecent.map((item) => {
                    const key = buildCountKey(
                        item.counted_location,
                        item.item_code
                    );
                    if (!restoredMap[key]) {
                        restoredMap[key] = {
                            item_code: item.item_code.trim().toUpperCase(),
                            counted_location: item.counted_location
                                .trim()
                                .toUpperCase(),
                            counted_qty: item.counted_qty,
                            description: item.description || 'N/A',
                            bin_location_system: 'N/A',
                            timestamp: new Date().toISOString(),
                            session_id: activeSessionIdRef.current,
                            stage: restoredStage,
                        };
                    }
                    if (!item.offline) return item;
                    return pendingKeys.has(key)
                        ? item
                        : { ...item, offline: false };
                });
                setRecentCounts(reconciled);
            } else {
                setRecentCounts([]);
            }

            countedItemsMapRef.current = restoredMap;
            setCountedItemsMap(restoredMap);
        } catch (e) {
            console.warn('[W2W Cache] Error leyendo caché local:', e);
        }
    }, []);

    // Download full master catalog for offline lookup
    const syncMasterCatalog = useCallback(async (stk: string) => {
        if (!isConnectedRef.current) {
            console.log(
                '[W2W Cache] Sin red: conservando catálogo local guardado.'
            );
            return;
        }
        setSyncingMaster(true);
        try {
            // Endpoint recomendado en FastAPI: devuelve array o diccionario de ítems de la bodega
            const res = await client.get<
                W2WItemData[] | { items?: W2WItemData[] }
            >('/api/w2w/items_master', {
                params: { stockroom: stk },
                timeout: 25000,
            });

            const rawList = Array.isArray(res.data)
                ? res.data
                : res.data?.items || [];

            if (rawList.length > 0) {
                const catalogMap: Record<string, W2WItemData> = {};
                for (const item of rawList) {
                    if (item.item_code) {
                        const key = item.item_code.trim().toUpperCase();
                        catalogMap[key] = {
                            item_code: key,
                            description: item.description,
                            bin_location: item.bin_location,
                            system_qty: item.system_qty,
                            in_master: true,
                        };
                    }
                }
                setMasterCatalog(catalogMap);
                await saveMasterCatalogChunked(stk, catalogMap);
                console.log(
                    `[W2W Cache] Maestro sincronizado (${Object.keys(catalogMap).length} ítems)`
                );
            }
        } catch {
            // Si no hay red o el endpoint aún no existe, conserva la caché existente sin mostrar error
            console.log(
                '[W2W Cache] Usando catálogo local previamente guardado.'
            );
        } finally {
            setSyncingMaster(false);
        }
    }, []);

    // Upsert single item into local master cache
    const cacheSingleMasterItem = useCallback(
        async (stk: string, item: W2WItemData) => {
            if (!item.item_code || item.in_master === false) return;
            const key = item.item_code.trim().toUpperCase();
            const entry: W2WItemData = {
                item_code: key,
                description: item.description,
                bin_location: item.bin_location,
                system_qty: item.system_qty,
                in_master: true,
            };
            setMasterCatalog((prev) => ({ ...prev, [key]: entry }));
            try {
                const extraStr = await AsyncStorage.getItem(
                    getMasterExtraKey(stk)
                );
                const extraMap: Record<string, W2WItemData> = extraStr
                    ? (JSON.parse(extraStr) as Record<string, W2WItemData>)
                    : {};
                extraMap[key] = entry;
                await AsyncStorage.setItem(
                    getMasterExtraKey(stk),
                    JSON.stringify(extraMap)
                );
            } catch {
                // Ignorar error de escritura en caché extra
            }
        },
        []
    );

    // Fetch available stockrooms & stages
    const fetchStockrooms = useCallback(async () => {
        if (!isConnectedRef.current) {
            const cachedList = await AsyncStorage.getItem(
                W2W_STOCKROOMS_LIST_KEY
            ).catch(() => null);
            if (cachedList) {
                setAvailableStockrooms(JSON.parse(cachedList) as string[]);
            }
            return;
        }
        setLoadingStockrooms(true);
        try {
            const res = await client.get<W2WStockroomsResponse>(
                '/api/w2w/stockrooms'
            );
            const data = res.data;
            if (!data) return;

            if (
                Array.isArray(data.stockrooms) &&
                data.stockrooms.length > 0
            ) {
                const list = data.stockrooms;
                setAvailableStockrooms(list);
                setStockroom((prev) => (list.includes(prev) ? prev : list[0]));
                AsyncStorage.setItem(
                    W2W_STOCKROOMS_LIST_KEY,
                    JSON.stringify(list)
                ).catch(() => {});
            }
            if (
                data.stages_by_stockroom &&
                typeof data.stages_by_stockroom === 'object'
            ) {
                setStagesByStockroom(data.stages_by_stockroom);
            }
        } catch (e) {
            console.warn('Error al obtener bodegas W2W (modo offline):', e);
            const cachedList = await AsyncStorage.getItem(
                W2W_STOCKROOMS_LIST_KEY
            ).catch(() => null);
            if (cachedList) {
                setAvailableStockrooms(JSON.parse(cachedList) as string[]);
            }
        } finally {
            setLoadingStockrooms(false);
        }
    }, []);

    // Fetch Active Session for User & Stockroom
    const fetchActiveSession =
        useCallback(async (): Promise<W2WSession | null> => {
            if (!isConnectedRef.current) {
                console.log(
                    '[W2W Offline] Sin red; manteniendo sesión en caché.'
                );
                return activeSessionRef.current;
            }
            setLoadingSession(true);
            try {
                const res = await client.get<W2WSession>(
                    '/api/sessions/active',
                    { params: { stockroom } }
                );
                if (
                    !res.data ||
                    typeof res.data !== 'object' ||
                    Array.isArray(res.data)
                ) {
                    // Respuesta no válida (ej. portal cautivo HTML): mantener sesión local
                    return activeSessionRef.current;
                }
                if (res.data.id || res.data.session_id) {
                    const sId = res.data.id || res.data.session_id || null;
                    activeSessionRef.current = res.data;
                    activeSessionIdRef.current = sId;
                    setActiveSession(res.data);
                    setActiveSessionId(sId);
                    persistLocalState(stockroom, stageRef.current, res.data, sId);
                    return res.data;
                } else {
                    activeSessionRef.current = null;
                    activeSessionIdRef.current = null;
                    setActiveSession(null);
                    setActiveSessionId(null);
                    persistLocalState(stockroom, stageRef.current, null, null);
                    return null;
                }
            } catch (e) {
                // Ante cualquier fallo de red, timeout, 5xx o sesión HTTP vencida (401/403),
                // conservamos la sesión local en caché para no interrumpir el conteo offline.
                console.log(
                    '[W2W Offline] No se pudo validar sesión en servidor; manteniendo sesión en caché.',
                    isAxiosError(e) ? e.response?.status || e.message : e
                );
                return activeSessionRef.current;
            } finally {
                setLoadingSession(false);
            }
        }, [stockroom, persistLocalState]);

    // Fetch Stage Info
    const fetchSummary = useCallback(async () => {
        if (!isConnectedRef.current) {
            return;
        }
        setLoadingSummary(true);
        try {
            const res = await client.get<{
                stage?: number | null;
                stages_by_stockroom?: Record<string, number>;
            }>('/api/admin/inventory/summary', { params: { stockroom } });
            if (
                res.data &&
                typeof res.data === 'object' &&
                !Array.isArray(res.data)
            ) {
                const nextStage =
                    res.data.stage !== undefined && res.data.stage !== null
                        ? Number(res.data.stage)
                        : 0;
                stageRef.current = nextStage;
                setStage(nextStage);
                persistLocalState(
                    stockroom,
                    nextStage,
                    activeSessionRef.current,
                    activeSessionIdRef.current
                );
                if (
                    res.data.stages_by_stockroom &&
                    typeof res.data.stages_by_stockroom === 'object'
                ) {
                    setStagesByStockroom(res.data.stages_by_stockroom);
                }
            }
        } catch (e) {
            if (isAxiosError(e) && !e.response) {
                console.log(
                    '[W2W Offline] Sin red al verificar etapa; usando etapa local.'
                );
            } else {
                console.error('Error al obtener estado de inventario W2W:', e);
            }
        } finally {
            setLoadingSummary(false);
        }
    }, [stockroom, persistLocalState]);

    // Fetch Stage >= 2 Recount List (filtered by assigned aisles on backend, sorted by bin location)
    const fetchRecounts = useCallback(async () => {
        setLoadingRecounts(true);
        try {
            const res = await client.get<{ items?: W2WItemData[] }>(
                '/api/recount_list/active',
                { params: { stockroom } }
            );
            if (res.data && res.data.items) {
                const sorted = [...res.data.items].sort((a, b) => {
                    const recA = Boolean(a.is_recounted);
                    const recB = Boolean(b.is_recounted);
                    if (recA !== recB) return recA ? 1 : -1;
                    const locA = (a.bin_location || '').trim().toUpperCase();
                    const locB = (b.bin_location || '').trim().toUpperCase();
                    const emptyA = !locA || locA === 'N/A';
                    const emptyB = !locB || locB === 'N/A';
                    if (emptyA !== emptyB) return emptyA ? 1 : -1;
                    const cmp = locA.localeCompare(locB, undefined, {
                        numeric: true,
                        sensitivity: 'base',
                    });
                    if (cmp !== 0) return cmp;
                    return (a.item_code || '').localeCompare(
                        b.item_code || ''
                    );
                });
                setRecountItems(sorted);
            } else {
                setRecountItems([]);
            }
        } catch (e) {
            console.warn('Error al cargar lista de reconteos:', e);
        } finally {
            setLoadingRecounts(false);
        }
    }, [stockroom]);

    // Start New Count Session
    const handleStartSession = async (): Promise<W2WSession | null> => {
        setLoadingSession(true);
        try {
            const res = await client.post<W2WSession>(
                '/api/sessions/start',
                null,
                { params: { stockroom } }
            );
            if (res.data && (res.data.id || res.data.session_id)) {
                const sId = res.data.id || res.data.session_id || null;
                setActiveSession(res.data);
                setActiveSessionId(sId);
                persistLocalState(stockroom, stage, res.data, sId);
                Vibration.vibrate(70);
                Alert.alert(
                    'Éxito',
                    `Sesión #${sId} de inventario iniciada en Bodega ${stockroom}.`
                );
                fetchSummary();
                return res.data;
            }
            return null;
        } catch (e) {
            console.error('Error al iniciar sesión:', e);
            const msg =
                isAxiosError(e) && !e.response
                    ? 'Sin conexión a internet. Debes iniciar sesión con red antes de entrar a zonas sin cobertura.'
                    : isAxiosError(e)
                      ? (e.response?.data as { detail?: string } | undefined)
                            ?.detail ||
                        'No se pudo iniciar la sesión de inventario.'
                      : 'No se pudo iniciar la sesión de inventario.';
            Alert.alert('Error', msg);
            return null;
        } finally {
            setLoadingSession(false);
        }
    };

    // Close Count Session
    const handleCloseSession = () => {
        const sId =
            activeSessionId || activeSession?.id || activeSession?.session_id;
        if (!sId) return;

        Alert.alert(
            'Cerrar Sesión',
            `¿Estás seguro de que deseas cerrar la sesión #${sId}?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Cerrar Sesión',
                    style: 'destructive',
                    onPress: async () => {
                        setLoadingSession(true);
                        try {
                            const res = await client.post<{ message?: string }>(
                                `/api/sessions/${sId}/close`
                            );
                            setActiveSession(null);
                            setActiveSessionId(null);
                            persistLocalState(stockroom, stage, null, null);
                            Vibration.vibrate(70);
                            Alert.alert(
                                'Éxito',
                                res.data?.message ||
                                    `Sesión #${sId} cerrada correctamente.`
                            );
                            fetchSummary();
                        } catch (e) {
                            console.error('Error al cerrar sesión:', e);
                            const msg = isAxiosError(e)
                                ? (
                                      e.response?.data as
                                          | { detail?: string }
                                          | undefined
                                  )?.detail ||
                                  'No se pudo cerrar la sesión de inventario.'
                                : 'No se pudo cerrar la sesión de inventario.';
                            Alert.alert('Error', msg);
                        } finally {
                            setLoadingSession(false);
                        }
                    },
                },
            ]
        );
    };

    const handleSelectStockroom = useCallback(
        (nextStockroom: string) => {
            setStockroomModalOpen(false);
            phaseAlertShownRef.current = false;
            setHasConfirmedStockroom(true);
            if (nextStockroom === stockroom) {
                return;
            }
            setStockroom(nextStockroom);
            setItemCode('');
            setDescription('');
            setBinSys('');
            setItemData(null);
            setCountedQty('');
            setRecountItems([]);
            setRecountSearch('');
            setRecountFilterTab('pending');
            setRecountModalItem(null);
            AsyncStorage.setItem(W2W_STOCKROOM_KEY, nextStockroom).catch(
                () => {}
            );
        },
        [stockroom]
    );

    useEffect(() => {
        let mounted = true;
        AsyncStorage.getItem(W2W_STOCKROOM_KEY)
            .then((saved) => {
                if (mounted && saved) {
                    setStockroom(saved);
                }
            })
            .catch(() => {})
            .finally(() => {
                if (mounted) {
                    fetchStockrooms();
                }
            });
        return () => {
            mounted = false;
        };
    }, [fetchStockrooms]);

    useEffect(() => {
        if (!hasConfirmedStockroom) return;
        loadLocalCacheForStockroom(stockroom).then(() => {
            fetchSummary();
            fetchActiveSession();
            syncMasterCatalog(stockroom);
        });
    }, [
        hasConfirmedStockroom,
        stockroom,
        loadLocalCacheForStockroom,
        fetchSummary,
        fetchActiveSession,
        syncMasterCatalog,
    ]);

    useEffect(() => {
        if (hasConfirmedStockroom && stage >= 2) {
            fetchRecounts();
        }
    }, [hasConfirmedStockroom, stage, fetchRecounts]);

    // Monitorear si la fase o sesión fue cerrada/cambiada en el servidor
    const checkServerPhaseChange = useCallback(async () => {
        if (!hasConfirmedStockroom || stageRef.current <= 0) return;
        if (phaseAlertShownRef.current) return;
        if (!isConnectedRef.current) return;

        try {
            const [summaryRes, sessionRes] = await Promise.all([
                client.get<{ stage?: number | null }>(
                    '/api/admin/inventory/summary',
                    { params: { stockroom }, timeout: 5000 }
                ),
                client.get<W2WSession>('/api/sessions/active', {
                    params: { stockroom },
                    timeout: 5000,
                }),
            ]);

            if (
                !summaryRes.data ||
                typeof summaryRes.data !== 'object' ||
                Array.isArray(summaryRes.data) ||
                !sessionRes.data ||
                typeof sessionRes.data !== 'object' ||
                Array.isArray(sessionRes.data)
            ) {
                return;
            }

            const prevStage = stageRef.current;
            const nextStage =
                summaryRes.data?.stage !== undefined &&
                summaryRes.data?.stage !== null
                    ? Number(summaryRes.data.stage)
                    : 0;
            const hadSession = activeSessionRef.current !== null;
            const hasServerSession = Boolean(
                sessionRes.data &&
                    (sessionRes.data.id || sessionRes.data.session_id)
            );

            const stageChanged = prevStage > 0 && nextStage !== prevStage;
            const sessionClosedRemotely = hadSession && !hasServerSession;

            if (stageChanged || sessionClosedRemotely) {
                phaseAlertShownRef.current = true;
                setScannerOpen(false);
                setRecountModalItem(null);
                setRecountSearch('');
                setRecountItems([]);
                setStage(nextStage);
                setActiveSession(null);
                setActiveSessionId(null);
                setItemCode('');
                setDescription('');
                setBinSys('');
                setItemData(null);
                setCountedQty('');
                // Si el inventario finalizó (Fase 0), regresar a selección de bodega;
                // si avanzó a otra fase (>= 1), quedarse en la bodega en la pantalla de Iniciar Sesión de la nueva fase.
                if (nextStage === 0) {
                    setHasConfirmedStockroom(false);
                }
                persistLocalState(stockroom, nextStage, null, null);
                fetchStockrooms();
                Vibration.vibrate([0, 150, 80, 150]);

                const message =
                    nextStage === 0
                        ? `La fase de inventario en la Bodega ${stockroom} ha finalizado en el servidor.`
                        : stageChanged
                          ? `La Bodega ${stockroom} cambió a Fase ${nextStage}. Inicia sesión para continuar en la nueva fase.`
                          : `La sesión de conteo en la Bodega ${stockroom} fue cerrada en el servidor.`;

                Alert.alert('Fase Finalizada', message, [
                    {
                        text: 'Aceptar',
                        onPress: () => {
                            phaseAlertShownRef.current = false;
                        },
                    },
                ]);
            }
        } catch {
            // Si no hay red (modo offline), no interrumpir al usuario
        }
    }, [hasConfirmedStockroom, stockroom, persistLocalState, fetchStockrooms]);

    useEffect(() => {
        if (!hasConfirmedStockroom) return;

        const handleSyncCompleted = async () => {
            const pendingKeys = await getPendingW2WKeys(stockroom);
            setRecentCounts((prev) => {
                let changed = false;
                const next = prev.map((item) => {
                    if (!item.offline) return item;
                    const key = buildCountKey(
                        item.counted_location,
                        item.item_code
                    );
                    if (!pendingKeys.has(key)) {
                        changed = true;
                        return { ...item, offline: false };
                    }
                    return item;
                });
                if (changed) {
                    AsyncStorage.setItem(
                        getRecentCountsKey(stockroom),
                        JSON.stringify(next)
                    ).catch(() => {});
                }
                return changed ? next : prev;
            });
            fetchSummary();
            if (stageRef.current >= 2) {
                fetchRecounts();
            }
        };

        eventEmitter.on(EVENTS.SYNC_COMPLETED, handleSyncCompleted);
        return () => {
            eventEmitter.off(EVENTS.SYNC_COMPLETED, handleSyncCompleted);
        };
    }, [hasConfirmedStockroom, stockroom, fetchSummary, fetchRecounts]);

    useEffect(() => {
        if (!hasConfirmedStockroom || stage <= 0) return;

        const interval = setInterval(() => {
            checkServerPhaseChange();
        }, 10000);

        const appStateSub = AppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                checkServerPhaseChange();
            }
        });

        return () => {
            clearInterval(interval);
            appStateSub.remove();
        };
    }, [hasConfirmedStockroom, stage, checkServerPhaseChange]);

    // Handle Item Search (Online first, fallback to local master cache)
    const handleSearchItem = async (
        codeToSearch?: string,
        options?: { skipFocusQty?: boolean }
    ) => {
        const rawCode = (codeToSearch || itemCode || '').trim();
        if (!rawCode) return;
        const parsed = parseBarcode(rawCode);
        const code = (parsed.itemCode || rawCode).trim().toUpperCase();
        if (!code) return;
        setItemCode(code);

        setLoadingItem(true);
        let shouldFocusQty = false;
        let resolvedCode = code;
        let resolvedDesc = 'N/A';
        let resolvedBinSys = 'N/A';

        try {
            if (!isConnectedRef.current) {
                throw new Error('OFFLINE_MODE');
            }
            const res = await client.get<W2WItemData>(
                `/api/get_item_for_counting/${encodeURIComponent(code)}`,
                { params: { stockroom }, timeout: 5000 }
            );
            if (res.data) {
                resolvedCode = res.data.item_code || code;
                resolvedDesc = res.data.description || 'N/A';
                resolvedBinSys = res.data.bin_location || 'N/A';
                setItemCode(resolvedCode);
                setDescription(resolvedDesc);
                setBinSys(resolvedBinSys);
                setItemData(res.data);
                cacheSingleMasterItem(stockroom, res.data);
                Vibration.vibrate(70);
                shouldFocusQty = true;
            }
        } catch (e) {
            // Buscar primero en el maestro cacheado localmente antes de declarar hallazgo
            const cachedItem = masterCatalog[code];
            if (cachedItem) {
                resolvedCode = cachedItem.item_code;
                resolvedDesc = cachedItem.description || 'N/A';
                resolvedBinSys = cachedItem.bin_location || 'N/A';
                setItemCode(resolvedCode);
                setDescription(resolvedDesc);
                setBinSys(resolvedBinSys);
                setItemData({ ...cachedItem, in_master: true });
                Vibration.vibrate(70);
                shouldFocusQty = true;
            } else {
                const isNetworkDrop =
                    !isConnectedRef.current || (isAxiosError(e) && !e.response);
                Vibration.vibrate([0, 150, 100, 150]);
                if (!isNetworkDrop) {
                    Alert.alert(
                        'Aviso',
                        'Ítem no hallado en catálogo local. Admitido como hallazgo W2W.'
                    );
                }
                const fallbackDesc = isNetworkDrop
                    ? 'SIN RED (VERIFICAR AL SINCRONIZAR)'
                    : 'HALLAZGO (SIN REGISTRO EN MAESTRO)';
                resolvedDesc = fallbackDesc;
                resolvedBinSys = 'N/A';
                setItemData({
                    item_code: code,
                    description: fallbackDesc,
                    bin_location: 'N/A',
                    system_qty: 0,
                    in_master: false,
                });
                setDescription(fallbackDesc);
                setBinSys('N/A');
                shouldFocusQty = true;
            }
        } finally {
            setLoadingItem(false);
            const locClean = countedLocation.trim().toUpperCase();
            const existing = locClean
                ? findPreviousCount(locClean, resolvedCode)
                : null;
            if (existing) {
                shouldFocusQty = false;
                Vibration.vibrate([0, 80, 50, 80]);
                setDuplicatePrompt({
                    item_code: resolvedCode,
                    counted_location: locClean,
                    previous_qty: existing.counted_qty,
                    description: resolvedDesc,
                    bin_location_system: resolvedBinSys,
                });
            }
            if (shouldFocusQty && !options?.skipFocusQty) {
                setTimeout(() => {
                    qtyInputRef.current?.focus();
                }, 100);
            }
        }
    };

    // Handle Recount Search / Scan (Stage >= 2): auto-open modal on SKU or single-item BIN match
    const handleRecountSearchSubmit = (rawInput?: string) => {
        const raw = (rawInput ?? recountSearch).trim();
        if (!raw) return;
        const parsed = parseBarcode(raw);
        const parsedSku = (parsed.itemCode || raw).trim().toUpperCase();
        const parsedSkuNoZeros = parsedSku.replace(/^0+/, '');
        const rawClean = raw.toUpperCase();

        const matchesSku = (itemCodeVal?: string) => {
            const code = (itemCodeVal || '').trim().toUpperCase();
            if (!code) return false;
            return (
                code === parsedSku ||
                (parsedSkuNoZeros.length > 0 &&
                    code.replace(/^0+/, '') === parsedSkuNoZeros)
            );
        };

        const skuMatch =
            recountItems.find(
                (it) => !it.is_recounted && matchesSku(it.item_code)
            ) || recountItems.find((it) => matchesSku(it.item_code));

        if (skuMatch) {
            Vibration.vibrate(70);
            setRecountSearch('');
            openRecountModal(skuMatch);
            return;
        }

        const binPendingMatches = recountItems.filter(
            (it) =>
                !it.is_recounted &&
                (it.bin_location || '').trim().toUpperCase() === rawClean
        );
        if (binPendingMatches.length === 1) {
            Vibration.vibrate(70);
            setRecountSearch('');
            openRecountModal(binPendingMatches[0]);
            return;
        }

        const binAnyMatches =
            binPendingMatches.length > 0
                ? binPendingMatches
                : recountItems.filter(
                      (it) =>
                          (it.bin_location || '').trim().toUpperCase() ===
                          rawClean
                  );
        if (binAnyMatches.length > 0) {
            Vibration.vibrate(70);
            setRecountSearch(rawClean);
            return;
        }

        // Si hay un único ítem pendiente que coincide parcialmente, abrir su modal
        const partialPending = recountItems.filter(
            (it) =>
                !it.is_recounted &&
                ((it.item_code || '').toUpperCase().includes(parsedSku) ||
                    (it.bin_location || '').toUpperCase().includes(rawClean))
        );
        if (partialPending.length === 1) {
            Vibration.vibrate(70);
            setRecountSearch('');
            openRecountModal(partialPending[0]);
            return;
        }

        setRecountSearch(parsedSku);
    };

    // Handle Hardware & Camera Scan Result
    const handleScanResult = (scannedCode: string) => {
        setScannerOpen(false);
        if (!hasConfirmedStockroom || stage === 0 || !activeSession) return;
        if (!scannedCode) return;

        if (stage >= 2) {
            if (recountModalItem) {
                setRecountModalLoc(scannedCode.trim().toUpperCase());
                Vibration.vibrate(70);
            } else {
                handleRecountSearchSubmit(scannedCode);
            }
            setScanTarget(null);
            return;
        }

        const parsed = parseBarcode(scannedCode);
        const clean = (parsed.itemCode || scannedCode).trim().toUpperCase();

        if (scanTarget === 'location' || (!countedLocation && !scanTarget)) {
            setCountedLocation(scannedCode.trim().toUpperCase());
            Vibration.vibrate(70);
            setTimeout(() => itemInputRef.current?.focus(), 150);
        } else {
            setItemCode(clean);
            handleSearchItem(clean);
        }
        setScanTarget(null);
    };

    // Zebra / Datalogic Hardware Scanner Listener
    useDataWedge((code) => handleScanResult(code));

    // Save W2W Physical Count (Supports instant offline queueing)
    const handleSaveCount = async () => {
        const locClean = countedLocation.trim().toUpperCase();
        const codeClean = itemCode.trim().toUpperCase();
        const qtyNum = parseInt(countedQty, 10);

        if (!locClean) {
            Alert.alert(
                'Validación',
                'Por favor ingrese la ubicación física contada.'
            );
            locationInputRef.current?.focus();
            return;
        }

        if (!codeClean) {
            Alert.alert(
                'Validación',
                'Por favor escanee o ingrese el SKU del producto.'
            );
            itemInputRef.current?.focus();
            return;
        }

        if (isNaN(qtyNum) || qtyNum < 0) {
            Alert.alert(
                'Validación',
                'Ingrese una cantidad entera válida (>= 0).'
            );
            qtyInputRef.current?.focus();
            return;
        }

        // Verificar si la llave (BIN + item_code) ya tiene un conteo previo
        const existingCount = findPreviousCount(locClean, codeClean);
        if (existingCount) {
            Vibration.vibrate([0, 80, 50, 80]);
            setDuplicatePrompt({
                item_code: codeClean,
                counted_location: locClean,
                previous_qty: existingCount.counted_qty,
                description:
                    description || existingCount.description || 'N/A',
                bin_location_system:
                    binSys || existingCount.bin_location_system || 'N/A',
            });
            return;
        }

        // Verificar sesión activa antes de guardar (usa caché local si no hay red)
        let currentSessionId = activeSessionId || activeSessionIdRef.current;
        if (!currentSessionId) {
            const active = await fetchActiveSession();
            if (active && (active.id || active.session_id)) {
                currentSessionId = active.id || active.session_id || null;
            }
        }

        if (!currentSessionId) {
            Alert.alert(
                'Sin Sesión Activa',
                'No tienes una sesión de inventario activa. ¿Deseas iniciar una nueva sesión ahora?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Iniciar Sesión',
                        onPress: () => handleStartSession(),
                    },
                ]
            );
            return;
        }

        setIsSaving(true);
        const nowIso = new Date().toISOString();
        const payload = {
            session_id: currentSessionId,
            stockroom: stockroom || '01',
            item_code: codeClean,
            counted_qty: qtyNum,
            counted_location: locClean,
            description: description || 'N/A',
            bin_location_system: binSys || 'N/A',
            timestamp: nowIso,
        };

        const countRecord: CountedItemRecord = {
            item_code: codeClean,
            counted_location: locClean,
            counted_qty: qtyNum,
            description: description || 'N/A',
            bin_location_system: binSys || 'N/A',
            timestamp: nowIso,
            session_id: currentSessionId,
            stage: stageRef.current,
        };

        const resetFormAfterSave = () => {
            setItemCode('');
            setDescription('');
            setBinSys('');
            setItemData(null);
            setCountedQty('');
            setTimeout(() => itemInputRef.current?.focus(), 150);
        };

        // Guardado instantáneo en cola offline cuando no hay red
        if (!isConnectedRef.current) {
            try {
                await queueRequest('/api/w2w/save_count', 'post', payload);
                eventEmitter.emit(EVENTS.SYNC_NEEDED);
                Vibration.vibrate([0, 80, 40, 80]);
                recordLocalCount(stockroom || '01', countRecord, true);
                resetFormAfterSave();
            } finally {
                setIsSaving(false);
            }
            return;
        }

        try {
            const res = await client.post('/api/w2w/save_count', payload);
            if (res.status === 200 || res.status === 201) {
                Vibration.vibrate([0, 100, 50, 100]);
                recordLocalCount(stockroom || '01', countRecord, false);
                resetFormAfterSave();
                fetchSummary();
                if (stage >= 2) fetchRecounts();
            }
        } catch (e) {
            // Si no hubo respuesta del servidor, client.ts ya encoló el POST en offline_sync_queue
            if (isAxiosError(e) && !e.response) {
                Vibration.vibrate([0, 80, 40, 80]);
                recordLocalCount(stockroom || '01', countRecord, true);
                resetFormAfterSave();
                return;
            }

            console.error('Error guardando conteo W2W:', e);
            Vibration.vibrate([0, 200, 100, 200]);
            const msg = isAxiosError(e)
                ? (e.response?.data as { detail?: string } | undefined)
                      ?.detail || 'No se pudo registrar el conteo W2W.'
                : 'No se pudo registrar el conteo W2W.';
            if (
                msg.includes('sesión') ||
                msg.includes('cerrada') ||
                msg.includes('existe')
            ) {
                fetchActiveSession();
            }
            Alert.alert('Error al Guardar', msg);
        } finally {
            setIsSaving(false);
        }
    };

    // Confirm Overwrite Correction from Modal 2
    const handleConfirmCorrection = async () => {
        if (!correctionModalData) return;
        const newQty = parseInt(correctionQty, 10);
        if (isNaN(newQty) || newQty < 0) {
            Alert.alert(
                'Validación',
                'Ingrese una cantidad entera válida (>= 0).'
            );
            return;
        }

        const currentSessionId = activeSessionId || activeSessionIdRef.current;
        if (!currentSessionId) {
            Alert.alert(
                'Sin Sesión Activa',
                'No tienes una sesión de inventario activa.'
            );
            return;
        }

        setIsSaving(true);
        const nowIso = new Date().toISOString();
        const { item_code, counted_location, description: desc, bin_location_system } =
            correctionModalData;

        const payload = {
            session_id: currentSessionId,
            stockroom: stockroom || '01',
            item_code,
            counted_qty: newQty,
            counted_location,
            description: desc || 'N/A',
            bin_location_system: bin_location_system || 'N/A',
            timestamp: nowIso,
        };

        const countRecord: CountedItemRecord = {
            item_code,
            counted_location,
            counted_qty: newQty,
            description: desc || 'N/A',
            bin_location_system: bin_location_system || 'N/A',
            timestamp: nowIso,
            session_id: currentSessionId,
            stage: stageRef.current,
        };

        const finishCorrection = () => {
            setCorrectionModalData(null);
            setCorrectionQty('');
            setItemCode('');
            setDescription('');
            setBinSys('');
            setItemData(null);
            setCountedQty('');
            setTimeout(() => itemInputRef.current?.focus(), 150);
        };

        if (!isConnectedRef.current) {
            try {
                await queueRequest('/api/w2w/save_count', 'post', payload);
                eventEmitter.emit(EVENTS.SYNC_NEEDED);
                Vibration.vibrate([0, 80, 40, 80]);
                recordLocalCount(stockroom || '01', countRecord, true);
                finishCorrection();
            } finally {
                setIsSaving(false);
            }
            return;
        }

        try {
            const res = await client.post('/api/w2w/save_count', payload);
            if (res.status === 200 || res.status === 201) {
                Vibration.vibrate([0, 100, 50, 100]);
                recordLocalCount(stockroom || '01', countRecord, false);
                finishCorrection();
                fetchSummary();
                if (stage >= 2) fetchRecounts();
            }
        } catch (e) {
            if (isAxiosError(e) && !e.response) {
                Vibration.vibrate([0, 80, 40, 80]);
                recordLocalCount(stockroom || '01', countRecord, true);
                finishCorrection();
                return;
            }
            const msg = isAxiosError(e)
                ? (e.response?.data as { detail?: string } | undefined)
                      ?.detail || 'No se pudo actualizar el conteo.'
                : 'No se pudo actualizar el conteo.';
            Alert.alert('Error al Corregir', msg);
        } finally {
            setIsSaving(false);
        }
    };

    // Open Recount Capture Modal (Stage >= 2)
    const openRecountModal = (item: W2WItemData) => {
        setRecountModalItem(item);
        setRecountModalLoc(
            item.bin_location && item.bin_location !== 'N/A'
                ? item.bin_location
                : ''
        );
        setRecountModalQty('');
    };

    // Save Recount from Modal (Stage >= 2, supports offline queueing)
    const handleSaveRecountModal = async () => {
        if (!recountModalItem) return;
        const locClean = recountModalLoc.trim().toUpperCase();
        const qtyNum = parseInt(recountModalQty, 10);

        if (!locClean) {
            Alert.alert('Validación', 'Ingrese la ubicación física.');
            return;
        }
        if (isNaN(qtyNum) || qtyNum < 0) {
            Alert.alert(
                'Validación',
                'Ingrese una cantidad entera válida (>= 0).'
            );
            return;
        }

        const currentSessionId = activeSessionId || activeSessionIdRef.current;
        if (!currentSessionId) {
            Alert.alert('Sin Sesión', 'Inicie una sesión de inventario.');
            return;
        }

        setIsSaving(true);
        const codeClean = recountModalItem.item_code.trim().toUpperCase();
        const payload = {
            session_id: currentSessionId,
            stockroom: stockroom || '01',
            item_code: codeClean,
            counted_qty: qtyNum,
            counted_location: locClean,
            description: recountModalItem.description || 'N/A',
            bin_location_system: recountModalItem.bin_location || 'N/A',
            timestamp: new Date().toISOString(),
        };

        if (!isConnectedRef.current) {
            try {
                await queueRequest('/api/w2w/save_count', 'post', payload);
                eventEmitter.emit(EVENTS.SYNC_NEEDED);
                Vibration.vibrate([0, 80, 40, 80]);
                setRecountItems((prev) =>
                    prev.map((it) =>
                        it.item_code === codeClean
                            ? {
                                  ...it,
                                  is_recounted: true,
                                  counted_qty_in_stage: qtyNum,
                              }
                            : it
                    )
                );
                setRecountModalItem(null);
            } finally {
                setIsSaving(false);
            }
            return;
        }

        try {
            const res = await client.post('/api/w2w/save_count', payload);
            if (res.status === 200 || res.status === 201) {
                Vibration.vibrate([0, 100, 50, 100]);
                setRecountItems((prev) =>
                    prev.map((it) =>
                        it.item_code === codeClean
                            ? {
                                  ...it,
                                  is_recounted: true,
                                  counted_qty_in_stage: qtyNum,
                              }
                            : it
                    )
                );
                setRecountModalItem(null);
                fetchSummary();
                fetchRecounts();
            }
        } catch (e) {
            if (isAxiosError(e) && !e.response) {
                Vibration.vibrate([0, 80, 40, 80]);
                setRecountItems((prev) =>
                    prev.map((it) =>
                        it.item_code === codeClean
                            ? {
                                  ...it,
                                  is_recounted: true,
                                  counted_qty_in_stage: qtyNum,
                              }
                            : it
                    )
                );
                setRecountModalItem(null);
                return;
            }
            const msg = isAxiosError(e)
                ? (e.response?.data as { detail?: string } | undefined)
                      ?.detail || 'No se pudo guardar el reconteo.'
                : 'No se pudo guardar el reconteo.';
            Alert.alert('Error al Guardar', msg);
        } finally {
            setIsSaving(false);
        }
    };

    const getStageBadgeInfo = (stg: number) => {
        switch (stg) {
            case 1:
                return {
                    label: 'ETAPA 1: CONTEO',
                    badgeStyle: styles.badgeStage1,
                    textStyle: styles.badgeTextStage1,
                };
            case 2:
                return {
                    label: 'ETAPA 2: RECONTEO',
                    badgeStyle: styles.badgeStage2,
                    textStyle: styles.badgeTextStage2,
                };
            case 3:
                return {
                    label: 'ETAPA 3: CONCILIACIÓN',
                    badgeStyle: styles.badgeStage3,
                    textStyle: styles.badgeTextStage3,
                };
            case 0:
            default:
                return {
                    label: 'INACTIVO / SIN ETAPA',
                    badgeStyle: styles.badgeStage0,
                    textStyle: styles.badgeTextStage0,
                };
        }
    };

    const stageInfo = getStageBadgeInfo(stage);
    const recountedTotalCount = recountItems.filter((it) => it.is_recounted).length;
    const pendingTotalCount = recountItems.length - recountedTotalCount;
    const recountSearchClean = recountSearch.trim().toUpperCase();
    const filteredRecountItems = recountItems.filter((it) => {
        if (recountFilterTab === 'pending' && it.is_recounted) return false;
        if (!recountSearchClean) return true;
        return (
            (it.item_code || '').toUpperCase().includes(recountSearchClean) ||
            (it.bin_location || '')
                .toUpperCase()
                .includes(recountSearchClean) ||
            (it.description || '').toUpperCase().includes(recountSearchClean)
        );
    });

    if (!hasConfirmedStockroom) {
        return (
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.container}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.stockroomGateCard}>
                        <View style={styles.stockroomGateHeader}>
                            <View style={styles.stockroomGateIconWrap}>
                                <Icon
                                    name="warehouse"
                                    size={26}
                                    color={fluent.colors.primary}
                                />
                            </View>
                            <View style={styles.flexOne}>
                                <Text style={styles.stockroomGateTitle}>
                                    SELECCIONAR BODEGA W2W
                                </Text>
                                <Text style={styles.stockroomGateSubtitle}>
                                    Elige la bodega donde vas a contar antes de
                                    habilitar el formulario de ingreso.
                                </Text>
                            </View>
                        </View>

                        <View style={styles.stockroomGateToolbar}>
                            <Text style={styles.stockroomGateCount}>
                                {availableStockrooms.length} bodega(s)
                                disponible(s)
                            </Text>
                            <TouchableOpacity
                                style={styles.stockroomRefreshBtn}
                                onPress={fetchStockrooms}
                                disabled={loadingStockrooms}
                            >
                                {loadingStockrooms ? (
                                    <ActivityIndicator
                                        size="small"
                                        color={fluent.colors.primary}
                                    />
                                ) : (
                                    <>
                                        <Icon
                                            name="refresh"
                                            size={15}
                                            color={fluent.colors.primary}
                                        />
                                        <Text
                                            style={
                                                styles.stockroomRefreshText
                                            }
                                        >
                                            Actualizar
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Lista de bodegas */}
                        {loadingStockrooms &&
                        availableStockrooms.length === 0 ? (
                            <ActivityIndicator
                                size="large"
                                color={fluent.colors.primary}
                                style={styles.recountLoader}
                            />
                        ) : availableStockrooms.length === 0 ? (
                            <View style={styles.stockroomEmptyBox}>
                                <Icon
                                    name="store-search-outline"
                                    size={32}
                                    color={fluent.colors.neutralTertiary}
                                />
                                <Text style={styles.stockroomEmptyText}>
                                    No hay bodegas disponibles.
                                </Text>
                            </View>
                        ) : (
                            <View style={styles.stockroomGateList}>
                                {availableStockrooms.map((stk) => {
                                    const isLastUsed = stk === stockroom;
                                    const stg = stagesByStockroom[stk];
                                    const stgLabel =
                                        stg === undefined
                                            ? ''
                                            : stg === 0
                                              ? 'Sin iniciar'
                                              : `Fase ${stg}`;
                                    return (
                                        <TouchableOpacity
                                            key={stk}
                                            style={[
                                                styles.modalOption,
                                                isLastUsed &&
                                                    styles.modalOptionSelected,
                                            ]}
                                            onPress={() =>
                                                handleSelectStockroom(stk)
                                            }
                                            activeOpacity={0.7}
                                        >
                                            <View
                                                style={
                                                    styles.modalOptionTextWrap
                                                }
                                            >
                                                <View
                                                    style={
                                                        styles.stockroomOptionRow
                                                    }
                                                >
                                                    <Text
                                                        style={[
                                                            styles.modalOptionTitle,
                                                            isLastUsed &&
                                                                styles.modalOptionTitleSelected,
                                                        ]}
                                                    >
                                                        Bodega {stk}
                                                    </Text>
                                                    {isLastUsed && (
                                                        <View
                                                            style={
                                                                styles.lastUsedBadge
                                                            }
                                                        >
                                                            <Text
                                                                style={
                                                                    styles.lastUsedBadgeText
                                                                }
                                                            >
                                                                Última usada
                                                            </Text>
                                                        </View>
                                                    )}
                                                </View>
                                                {stgLabel !== '' && (
                                                    <Text
                                                        style={[
                                                            styles.modalOptionSub,
                                                            stg === 0
                                                                ? styles.modalOptionSubInactive
                                                                : styles.modalOptionSubActive,
                                                        ]}
                                                    >
                                                        {stgLabel}
                                                    </Text>
                                                )}
                                            </View>
                                            <Icon
                                                name="chevron-right"
                                                size={22}
                                                color={fluent.colors.primary}
                                            />
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <View style={styles.headerWrapper}>
                {/* Header Banner Active Stage (Compacto) */}
                <View style={styles.stageHeader}>
                    <View style={styles.stageTitleRow}>
                        <Icon name="warehouse" size={17} color="#0284c7" />
                        <Text style={styles.stageTitleText} numberOfLines={1}>
                            INVENTARIO W2W
                        </Text>
                        <View style={styles.stockroomPill}>
                            <Text style={styles.stockroomPillText}>
                                BOD {stockroom}
                            </Text>
                        </View>
                        <View style={[styles.badge, stageInfo.badgeStyle]}>
                            <Text
                                style={[styles.badgeText, stageInfo.textStyle]}
                            >
                                {stageInfo.label}
                            </Text>
                        </View>
                    </View>

                    {/* Fila compacta: Catálogo offline + Sesión activa */}
                    <View style={styles.headerMetaRow}>
                        <View style={styles.cacheStatusInline}>
                            <Icon
                                name={
                                    syncingMaster
                                        ? 'cloud-sync-outline'
                                        : 'database-check-outline'
                                }
                                size={13}
                                color={fluent.colors.neutralSecondary}
                            />
                            <Text style={styles.cacheStatusText}>
                                {syncingMaster
                                    ? 'Sincronizando...'
                                    : 'Catálogo offline'}
                            </Text>
                            <TouchableOpacity
                                onPress={() => syncMasterCatalog(stockroom)}
                                disabled={syncingMaster}
                            >
                                <Text style={styles.cacheSyncLink}>
                                    Actualizar
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {stage > 0 && activeSession && (
                            <TouchableOpacity
                                style={styles.sessionCompactPill}
                                onPress={handleCloseSession}
                                disabled={loadingSession}
                                activeOpacity={0.7}
                            >
                                <View style={styles.sessionStatusDot} />
                                <Text style={styles.sessionCompactText}>
                                    #{activeSession.id || activeSession.session_id}
                                </Text>
                                {loadingSession ? (
                                    <ActivityIndicator
                                        size="small"
                                        color="#065f46"
                                        style={styles.sessionSpinner}
                                    />
                                ) : (
                                    <Icon
                                        name="close-circle-outline"
                                        size={13}
                                        color="#065f46"
                                    />
                                )}
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>

                {stage >= 2 && activeSession ? (
                    <View style={styles.recountScreenCard}>
                        <View style={styles.recountScreenHeader}>
                            <View style={styles.flexOne}>
                                <Text style={styles.recountScreenTitle}>
                                    Lista de Ítems a Recontar — Fase 0{stage}
                                </Text>
                                <Text style={styles.recountScreenSub}>
                                    {recountedTotalCount} de{' '}
                                    {recountItems.length} recontados (
                                    {pendingTotalCount} pendientes)
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={fetchRecounts}
                                disabled={loadingRecounts}
                                style={styles.recountRefreshBtn}
                            >
                                {loadingRecounts ? (
                                    <ActivityIndicator
                                        size="small"
                                        color={fluent.colors.primary}
                                    />
                                ) : (
                                    <Icon
                                        name="refresh"
                                        size={18}
                                        color={fluent.colors.primary}
                                    />
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Buscador SKU o Ubicación */}
                        <View style={styles.recountSearchRow}>
                            <View style={styles.recountSearchBox}>
                                <Icon
                                    name="magnify"
                                    size={17}
                                    color={fluent.colors.neutralSecondary}
                                />
                                <TextInput
                                    style={styles.recountSearchInput}
                                    value={recountSearch}
                                    onChangeText={setRecountSearch}
                                    onSubmitEditing={(e) =>
                                        handleRecountSearchSubmit(
                                            e.nativeEvent.text
                                        )
                                    }
                                    returnKeyType="search"
                                    placeholder="Escanear o buscar SKU / Ubicación..."
                                    placeholderTextColor={
                                        fluent.colors.neutralTertiary
                                    }
                                    autoCapitalize="characters"
                                    autoCorrect={false}
                                />
                                {recountSearch.length > 0 && (
                                    <TouchableOpacity
                                        onPress={() => setRecountSearch('')}
                                    >
                                        <Icon
                                            name="close-circle"
                                            size={17}
                                            color={
                                                fluent.colors.neutralTertiary
                                            }
                                        />
                                    </TouchableOpacity>
                                )}
                            </View>
                            <TouchableOpacity
                                style={styles.recountScanBtn}
                                onPress={() => {
                                    setScanTarget('item');
                                    setScannerOpen(true);
                                }}
                                activeOpacity={0.7}
                            >
                                <Icon
                                    name="barcode-scan"
                                    size={26}
                                    color={fluent.colors.primary}
                                />
                            </TouchableOpacity>
                        </View>

                        {/* Tabs Pendientes / Todos */}
                        <View style={styles.recountTabsRow}>
                            <TouchableOpacity
                                style={[
                                    styles.recountTabBtn,
                                    recountFilterTab === 'pending' &&
                                        styles.recountTabBtnActive,
                                ]}
                                onPress={() => setRecountFilterTab('pending')}
                            >
                                <Text
                                    style={[
                                        styles.recountTabText,
                                        recountFilterTab === 'pending' &&
                                            styles.recountTabTextActive,
                                    ]}
                                >
                                    Pendientes ({pendingTotalCount})
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.recountTabBtn,
                                    recountFilterTab === 'all' &&
                                        styles.recountTabBtnActive,
                                ]}
                                onPress={() => setRecountFilterTab('all')}
                            >
                                <Text
                                    style={[
                                        styles.recountTabText,
                                        recountFilterTab === 'all' &&
                                            styles.recountTabTextActive,
                                    ]}
                                >
                                    Todos ({recountItems.length})
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <FlatList
                            data={filteredRecountItems}
                            keyExtractor={(item, idx) =>
                                `${item.item_code}_${idx}`
                            }
                            style={styles.recountFlatList}
                            keyboardShouldPersistTaps="handled"
                            initialNumToRender={20}
                            maxToRenderPerBatch={20}
                            windowSize={5}
                            ListEmptyComponent={
                                loadingRecounts ? (
                                    <ActivityIndicator
                                        size="small"
                                        color={fluent.colors.primary}
                                        style={styles.recountLoader}
                                    />
                                ) : (
                                    <Text style={styles.emptyRecountText}>
                                        No hay ítems para mostrar en sus
                                        pasillos asignados.
                                    </Text>
                                )
                            }
                            renderItem={({ item }) => (
                                <View style={styles.recountTableRow}>
                                    <View style={styles.flexOne}>
                                        <View style={styles.recountTopLine}>
                                            <Text
                                                selectable
                                                style={styles.recountSku}
                                            >
                                                {item.item_code}
                                            </Text>
                                            <View style={styles.recountBinBadge}>
                                                <Text
                                                    selectable
                                                    style={
                                                        styles.recountBinText
                                                    }
                                                >
                                                    {item.bin_location || 'N/A'}
                                                </Text>
                                            </View>
                                            <View
                                                style={[
                                                    styles.recountStatusBadge,
                                                    item.is_recounted
                                                        ? styles.recountStatusDone
                                                        : styles.recountStatusPending,
                                                ]}
                                            >
                                                <Text
                                                    style={[
                                                        styles.recountStatusText,
                                                        item.is_recounted
                                                            ? styles.recountStatusTextDone
                                                            : styles.recountStatusTextPending,
                                                    ]}
                                                >
                                                    {item.is_recounted
                                                        ? 'RECONTADO'
                                                        : 'PENDIENTE'}
                                                </Text>
                                            </View>
                                        </View>
                                        <Text
                                            style={styles.recountDesc}
                                            numberOfLines={1}
                                        >
                                            {item.description || 'N/A'}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        style={styles.recountActionBtn}
                                        onPress={() => openRecountModal(item)}
                                    >
                                        <Text
                                            style={styles.recountActionBtnText}
                                        >
                                            RECONTAR
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        />
                    </View>
                ) : (
                    <ScrollView
                        contentContainerStyle={styles.scrollContent}
                        keyboardShouldPersistTaps="handled"
                    >
                        {stage === 0 ? (
                    <View style={styles.inactiveCard}>
                        <View style={styles.inactiveIconCircle}>
                            <Icon
                                name="warehouse-off"
                                size={48}
                                color="#64748b"
                            />
                        </View>
                        <Text style={styles.inactiveTitle}>
                            Sin Inventario Activo en Bodega {stockroom}
                        </Text>
                        <Text style={styles.inactiveDesc}>
                            Actualmente no hay ninguna etapa de inventario
                            Wall-to-Wall iniciada para la Bodega {stockroom}.
                            Puedes cambiar de bodega arriba o pedir al
                            administrador que active la Etapa 1 en Admin
                            Inventory.
                        </Text>
                        <View style={styles.inactiveActions}>
                            <TouchableOpacity
                                style={styles.verifyBtn}
                                onPress={() => {
                                    fetchStockrooms();
                                    fetchSummary();
                                }}
                                disabled={loadingSummary}
                            >
                                {loadingSummary ? (
                                    <ActivityIndicator
                                        size="small"
                                        color="#0284c7"
                                    />
                                ) : (
                                    <>
                                        <Icon
                                            name="refresh"
                                            size={18}
                                            color="#0284c7"
                                        />
                                        <Text style={styles.verifyBtnText}>
                                            VERIFICAR SERVIDOR
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.backBtn}
                                onPress={() => setHasConfirmedStockroom(false)}
                            >
                                <Icon
                                    name="swap-horizontal"
                                    size={18}
                                    color="#64748b"
                                />
                                <Text style={styles.backBtnText}>
                                    SELECCIONAR OTRA BODEGA
                                </Text>
                            </TouchableOpacity>
                            {navigation && (
                                <TouchableOpacity
                                    style={styles.backBtn}
                                    onPress={() => navigation.goBack()}
                                >
                                    <Icon
                                        name="arrow-left"
                                        size={18}
                                        color="#64748b"
                                    />
                                    <Text style={styles.backBtnText}>
                                        VOLVER AL DASHBOARD
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                ) : !activeSession ? (
                    <View style={styles.inactiveCard}>
                        <View style={styles.startSessionIconCircle}>
                            <Icon
                                name="play-circle-outline"
                                size={48}
                                color={fluent.colors.primary}
                            />
                        </View>
                        <Text style={styles.inactiveTitle}>
                            Iniciar Sesión — Bodega {stockroom}
                        </Text>
                        <Text style={styles.inactiveDesc}>
                            Inicia una sesión de inventario en la Bodega{' '}
                            {stockroom} para habilitar el formulario de captura
                            física.
                        </Text>
                        <View style={styles.inactiveActions}>
                            <TouchableOpacity
                                style={styles.startSessionMainBtn}
                                onPress={handleStartSession}
                                disabled={loadingSession}
                            >
                                {loadingSession ? (
                                    <ActivityIndicator
                                        size="small"
                                        color={fluent.colors.white}
                                    />
                                ) : (
                                    <>
                                        <Icon
                                            name="play"
                                            size={18}
                                            color={fluent.colors.white}
                                        />
                                        <Text
                                            style={
                                                styles.startSessionMainBtnText
                                            }
                                        >
                                            INICIAR SESIÓN (BODEGA {stockroom})
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.backBtn}
                                onPress={() => setHasConfirmedStockroom(false)}
                                disabled={loadingSession}
                            >
                                <Icon
                                    name="swap-horizontal"
                                    size={18}
                                    color="#64748b"
                                />
                                <Text style={styles.backBtnText}>
                                    CAMBIAR DE BODEGA
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                ) : (
                    <>
                        {/* Formulario de Captura Físico W2W */}
                        <View style={styles.card}>
                            {/* 1. Ubicación Física (BIN) */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>
                                    1. UBICACIÓN FÍSICA (BIN) *
                                </Text>
                                <View style={styles.inputRow}>
                                    <TextInput
                                        ref={locationInputRef}
                                        style={styles.inputBin}
                                        value={countedLocation}
                                        onChangeText={(val) =>
                                            setCountedLocation(
                                                val.toUpperCase()
                                            )
                                        }
                                        placeholder=""
                                        autoCapitalize="characters"
                                        onSubmitEditing={() =>
                                            itemInputRef.current?.focus()
                                        }
                                    />
                                    <TouchableOpacity
                                        style={styles.scanIconButton}
                                        onPress={() => {
                                            setScanTarget('location');
                                            setScannerOpen(true);
                                        }}
                                    >
                                        <Icon
                                            name="barcode-scan"
                                            size={24}
                                            color={fluent.colors.neutralPrimary}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* 2. Código de Producto (SKU / EAN) */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>
                                    2. CÓDIGO PRODUCTO (SKU / EAN) *
                                </Text>
                                <View style={styles.inputRow}>
                                    <TextInput
                                        ref={itemInputRef}
                                        style={styles.inputSku}
                                        value={itemCode}
                                        onChangeText={(val) =>
                                            setItemCode(val.toUpperCase())
                                        }
                                        placeholder="Escanee o ingrese SKU"
                                        autoCapitalize="characters"
                                        onSubmitEditing={() =>
                                            handleSearchItem()
                                        }
                                    />
                                    <TouchableOpacity
                                        style={styles.searchBtn}
                                        onPress={() => handleSearchItem()}
                                        disabled={loadingItem}
                                    >
                                        {loadingItem ? (
                                            <ActivityIndicator
                                                size="small"
                                                color="#fff"
                                            />
                                        ) : (
                                            <Icon
                                                name="magnify"
                                                size={22}
                                                color="#fff"
                                            />
                                        )}
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.scanIconButton}
                                        onPress={() => {
                                            setScanTarget('item');
                                            setScannerOpen(true);
                                        }}
                                    >
                                        <Icon
                                            name="barcode-scan"
                                            size={24}
                                            color={fluent.colors.neutralPrimary}
                                        />
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Ficha de Información del Ítem */}
                            {itemData && (
                                <View style={styles.itemInfoCard}>
                                    <View style={styles.itemInfoRow}>
                                        <Text
                                            selectable
                                            style={styles.itemInfoCode}
                                        >
                                            {itemData.item_code}
                                        </Text>
                                        <View
                                            style={[
                                                styles.itemTag,
                                                itemData.in_master !== false
                                                    ? styles.tagMaster
                                                    : styles.tagFound,
                                            ]}
                                        >
                                            <Text style={styles.tagText}>
                                                {itemData.in_master !== false
                                                    ? 'CATALOGADO'
                                                    : 'HALLAZGO'}
                                            </Text>
                                        </View>
                                    </View>
                                    <Text
                                        style={styles.itemInfoDesc}
                                        numberOfLines={2}
                                    >
                                        {description}
                                    </Text>
                                    <View style={styles.itemMetaRow}>
                                        <Text style={styles.itemMetaText}>
                                            BIN Sistema:{' '}
                                            <Text style={styles.metaBold}>
                                                {binSys}
                                            </Text>
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* 3. Cantidad Contada */}
                            <View style={styles.inputGroup}>
                                <Text style={styles.label}>
                                    3. CANTIDAD FÍSICA CONTADA *
                                </Text>
                                <View style={styles.qtyContainer}>
                                    <TextInput
                                        ref={qtyInputRef}
                                        style={styles.inputQty}
                                        value={countedQty}
                                        onChangeText={setCountedQty}
                                        onFocus={() => {
                                            const raw = itemCode.trim();
                                            if (!raw || loadingItem) return;
                                            const parsed = parseBarcode(raw);
                                            const normalized = (
                                                parsed.itemCode || raw
                                            )
                                                .trim()
                                                .toUpperCase();
                                            if (
                                                normalized &&
                                                (!itemData ||
                                                    itemData.item_code
                                                        .trim()
                                                        .toUpperCase() !==
                                                        normalized)
                                            ) {
                                                handleSearchItem(raw, {
                                                    skipFocusQty: true,
                                                });
                                            }
                                        }}
                                        placeholder="0"
                                        keyboardType="number-pad"
                                        selectTextOnFocus={true}
                                        returnKeyType="done"
                                        onSubmitEditing={handleSaveCount}
                                    />
                                </View>
                            </View>

                            {/* Botón de Enviar Conteo W2W */}
                            <TouchableOpacity
                                style={[
                                    styles.saveButton,
                                    isSaving && styles.saveButtonDisabled,
                                ]}
                                onPress={handleSaveCount}
                                disabled={isSaving}
                            >
                                {isSaving ? (
                                    <ActivityIndicator
                                        size="small"
                                        color="#fff"
                                    />
                                ) : (
                                    <>
                                        <Icon
                                            name="check-circle-outline"
                                            size={22}
                                            color="#fff"
                                        />
                                        <Text style={styles.saveButtonText}>
                                            REGISTRAR CONTEO W2W
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>

                        {/* Historial Reciente de la Sesión Móvil */}
                        {recentCounts.length > 0 && (
                            <View style={styles.historyCard}>
                                <Text style={styles.historyTitle}>
                                    Últimos Registros Guardados (
                                    {recentCounts.length})
                                </Text>
                                {recentCounts.map((c) => (
                                    <View key={c.id} style={styles.historyRow}>
                                        <View style={styles.flexOne}>
                                            <View
                                                style={styles.historySkuRow}
                                            >
                                                <Text
                                                    selectable
                                                    style={styles.historySku}
                                                >
                                                    {c.item_code}
                                                </Text>
                                                <View
                                                    style={
                                                        styles.historyLocationBadge
                                                    }
                                                >
                                                    <Text
                                                        selectable
                                                        style={
                                                            styles.historyLocationText
                                                        }
                                                    >
                                                        {c.counted_location}
                                                    </Text>
                                                </View>
                                                {c.offline && (
                                                    <View
                                                        style={
                                                            styles.offlineBadge
                                                        }
                                                    >
                                                        <Text
                                                            style={
                                                                styles.offlineBadgeText
                                                            }
                                                        >
                                                            COLA OFFLINE
                                                        </Text>
                                                    </View>
                                                )}
                                            </View>
                                            <Text
                                                style={styles.historyDesc}
                                                numberOfLines={1}
                                            >
                                                {c.description}
                                            </Text>
                                        </View>
                                        <View style={styles.alignEnd}>
                                            <Text style={styles.historyQty}>
                                                {c.counted_qty} uds
                                            </Text>
                                            <Text style={styles.historyTime}>
                                                {c.time}
                                            </Text>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}
                    </>
                )}
                    </ScrollView>
                )}

            {/* Modal de Captura de Reconteo (Etapa >= 2) */}
            <Modal
                visible={recountModalItem !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setRecountModalItem(null)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text selectable style={styles.modalTitle}>
                                Recontar — {recountModalItem?.item_code}
                            </Text>
                            <TouchableOpacity
                                onPress={() => setRecountModalItem(null)}
                            >
                                <Icon
                                    name="close"
                                    size={20}
                                    color={fluent.colors.neutralSecondary}
                                />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.recountModalDesc} numberOfLines={2}>
                            {recountModalItem?.description || 'N/A'}
                        </Text>
                        <Text style={styles.label}>UBICACIÓN FÍSICA (BIN) *</Text>
                        <TextInput
                            style={styles.recountModalInput}
                            value={recountModalLoc}
                            onChangeText={(v) =>
                                setRecountModalLoc(v.toUpperCase())
                            }
                            autoCapitalize="characters"
                            placeholder="Ej. A01-01"
                        />
                        <Text style={styles.label}>CANTIDAD CONTADA *</Text>
                        <TextInput
                            style={styles.recountModalInput}
                            value={recountModalQty}
                            onChangeText={setRecountModalQty}
                            keyboardType="numeric"
                            placeholder="0"
                            autoFocus
                            onSubmitEditing={handleSaveRecountModal}
                        />
                        <TouchableOpacity
                            style={[
                                styles.saveButton,
                                isSaving && styles.saveButtonDisabled,
                            ]}
                            onPress={handleSaveRecountModal}
                            disabled={isSaving}
                        >
                            {isSaving ? (
                                <ActivityIndicator
                                    size="small"
                                    color="#fff"
                                />
                            ) : (
                                <Text style={styles.saveButtonText}>
                                    GUARDAR RECONTEO
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* Selector de Bodega Modal */}
            <Modal
                visible={stockroomModalOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setStockroomModalOpen(false)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>
                                Seleccionar Bodega (Stockroom)
                            </Text>
                            <TouchableOpacity
                                onPress={() => setStockroomModalOpen(false)}
                                hitSlop={{
                                    top: 10,
                                    bottom: 10,
                                    left: 10,
                                    right: 10,
                                }}
                            >
                                <Icon
                                    name="close"
                                    size={20}
                                    color={fluent.colors.neutralSecondary}
                                />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.modalList}>
                            {availableStockrooms.map((stk) => {
                                const isSelected = stk === stockroom;
                                const stg = stagesByStockroom[stk];
                                const stgLabel =
                                    stg === undefined
                                        ? ''
                                        : stg === 0
                                          ? 'Sin iniciar'
                                          : `Fase ${stg}`;
                                return (
                                    <TouchableOpacity
                                        key={stk}
                                        style={[
                                            styles.modalOption,
                                            isSelected &&
                                                styles.modalOptionSelected,
                                        ]}
                                        onPress={() =>
                                            handleSelectStockroom(stk)
                                        }
                                        activeOpacity={0.7}
                                    >
                                        <View
                                            style={styles.modalOptionTextWrap}
                                        >
                                            <Text
                                                style={[
                                                    styles.modalOptionTitle,
                                                    isSelected &&
                                                        styles.modalOptionTitleSelected,
                                                ]}
                                            >
                                                Bodega {stk}
                                            </Text>
                                            {stgLabel !== '' && (
                                                <Text
                                                    style={[
                                                        styles.modalOptionSub,
                                                        stg === 0
                                                            ? styles.modalOptionSubInactive
                                                            : styles.modalOptionSubActive,
                                                    ]}
                                                >
                                                    {stgLabel}
                                                </Text>
                                            )}
                                        </View>
                                        {isSelected && (
                                            <Icon
                                                name="check-circle"
                                                size={20}
                                                color={fluent.colors.primary}
                                            />
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Modal 1: Aviso de Conteo Previo Duplicado (BIN + SKU) */}
            <Modal
                visible={duplicatePrompt !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setDuplicatePrompt(null)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <View style={styles.dupHeaderLeft}>
                                <Icon
                                    name="alert-circle-outline"
                                    size={22}
                                    color="#b45309"
                                />
                                <Text style={styles.modalTitle}>
                                    Conteo Previo Detectado
                                </Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => setDuplicatePrompt(null)}
                            >
                                <Icon
                                    name="close"
                                    size={20}
                                    color={fluent.colors.neutralSecondary}
                                />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.dupBodyText}>
                            El ítem{' '}
                            <Text style={styles.metaBold}>
                                {duplicatePrompt?.item_code}
                            </Text>{' '}
                            ya tiene un conteo previo en la ubicación{' '}
                            <Text style={styles.metaBold}>
                                {duplicatePrompt?.counted_location}
                            </Text>
                            .
                        </Text>
                        <View style={styles.dupPrevBox}>
                            <Text style={styles.dupPrevLabel}>
                                Cantidad digitada anteriormente:
                            </Text>
                            <Text style={styles.dupPrevValue}>
                                {duplicatePrompt?.previous_qty} uds
                            </Text>
                        </View>
                        <Text style={styles.dupQuestionText}>
                            ¿Deseas corregir la cantidad digitada anteriormente?
                        </Text>
                        <View style={styles.dupActionsRow}>
                            <TouchableOpacity
                                style={styles.dupCancelBtn}
                                onPress={() => setDuplicatePrompt(null)}
                            >
                                <Text style={styles.dupCancelBtnText}>
                                    Cancelar
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={styles.dupConfirmBtn}
                                onPress={() => {
                                    if (!duplicatePrompt) return;
                                    const data = duplicatePrompt;
                                    setDuplicatePrompt(null);
                                    setCorrectionQty(String(data.previous_qty));
                                    setCorrectionModalData(data);
                                }}
                            >
                                <Text style={styles.dupConfirmBtnText}>
                                    Corregir
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Modal 2: Corregir y Sobrescribir Cantidad Total */}
            <Modal
                visible={correctionModalData !== null}
                transparent
                animationType="fade"
                onRequestClose={() => setCorrectionModalData(null)}
            >
                <View style={styles.modalBackdrop}>
                    <View style={styles.modalCard}>
                        <View style={styles.modalHeader}>
                            <Text selectable style={styles.modalTitle}>
                                Corregir Conteo —{' '}
                                {correctionModalData?.item_code}
                            </Text>
                            <TouchableOpacity
                                onPress={() => setCorrectionModalData(null)}
                            >
                                <Icon
                                    name="close"
                                    size={20}
                                    color={fluent.colors.neutralSecondary}
                                />
                            </TouchableOpacity>
                        </View>
                        <Text style={styles.recountModalDesc} numberOfLines={2}>
                            Ubicación: {correctionModalData?.counted_location} •{' '}
                            {correctionModalData?.description || 'N/A'}
                        </Text>
                        <View style={styles.dupPrevBox}>
                            <Text style={styles.dupPrevLabel}>
                                Cantidad anterior:
                            </Text>
                            <Text style={styles.dupPrevValue}>
                                {correctionModalData?.previous_qty} uds
                            </Text>
                        </View>
                        <Text style={styles.label}>
                            NUEVA CANTIDAD TOTAL (SOBRESCRIBIR) *
                        </Text>
                        <TextInput
                            style={styles.recountModalInput}
                            value={correctionQty}
                            onChangeText={setCorrectionQty}
                            keyboardType="number-pad"
                            placeholder="0"
                            selectTextOnFocus
                            autoFocus
                            onSubmitEditing={handleConfirmCorrection}
                        />
                        <View style={styles.dupActionsRow}>
                            <TouchableOpacity
                                style={styles.dupCancelBtn}
                                onPress={() => setCorrectionModalData(null)}
                                disabled={isSaving}
                            >
                                <Text style={styles.dupCancelBtnText}>
                                    Cancelar
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[
                                    styles.dupConfirmBtn,
                                    isSaving && styles.saveButtonDisabled,
                                ]}
                                onPress={handleConfirmCorrection}
                                disabled={isSaving}
                            >
                                {isSaving ? (
                                    <ActivityIndicator
                                        size="small"
                                        color="#fff"
                                    />
                                ) : (
                                    <Text style={styles.dupConfirmBtnText}>
                                        Sobrescribir Total
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Scanner Camera Modal */}
            <ScannerModal
                visible={scannerOpen}
                onScan={handleScanResult}
                onClose={() => setScannerOpen(false)}
            />
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: fluent.colors.pageBg,
    },
    flexOne: { flex: 1 },
    alignEnd: { alignItems: 'flex-end' },
    sessionSpinner: { marginLeft: 6 },
    recountBannerBody: { flex: 1, marginLeft: 8 },
    recountLoader: { padding: 12 },
    historySkuRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    scrollContent: {
        padding: 10,
        paddingBottom: 24,
    },
    inactiveCard: {
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        padding: 24,
        marginTop: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        ...fluent.shadows.card,
    },
    inactiveIconCircle: {
        width: 72,
        height: 72,
        borderRadius: 36,
        backgroundColor: fluent.colors.neutralLighter,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 16,
    },
    inactiveTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
        marginBottom: 8,
        textAlign: 'center',
    },
    inactiveDesc: {
        fontSize: 13,
        color: fluent.colors.neutralSecondary,
        textAlign: 'center',
        lineHeight: 18,
        marginBottom: 20,
    },
    inactiveActions: {
        width: '100%',
        gap: 10,
    },
    verifyBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: fluent.colors.primaryLighterAlt,
        paddingVertical: 12,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.colors.primaryLight,
    },
    verifyBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: fluent.colors.primary,
    },
    backBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: fluent.colors.neutralLighter,
        paddingVertical: 12,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
    },
    backBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: fluent.colors.neutralSecondary,
    },
    stageHeader: {
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        paddingHorizontal: 10,
        paddingVertical: 8,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        ...fluent.shadows.card,
    },
    stageTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    stageTitleText: {
        fontSize: 13,
        fontWeight: '700',
        color: fluent.colors.neutralPrimary,
        letterSpacing: 0.2,
        flex: 1,
    },
    stockroomPill: {
        backgroundColor: fluent.colors.primaryLighterAlt,
        borderWidth: 1,
        borderColor: fluent.colors.primaryLight,
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 7,
        paddingVertical: 2,
    },
    stockroomPillText: {
        fontSize: 11,
        fontWeight: '700',
        color: fluent.colors.primaryDarker,
    },
    headerMetaRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 6,
        paddingTop: 5,
        borderTopWidth: 1,
        borderTopColor: fluent.colors.neutralLighter,
        gap: 8,
    },
    cacheStatusInline: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        flex: 1,
    },
    cacheStatusText: {
        fontSize: 11,
        color: fluent.colors.neutralSecondary,
    },
    cacheSyncLink: {
        fontSize: 11,
        fontWeight: '600',
        color: fluent.colors.primary,
    },
    sessionCompactPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        backgroundColor: '#ecfdf5',
        borderWidth: 1,
        borderColor: '#a7f3d0',
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 7,
        paddingVertical: 2,
    },
    sessionCompactText: {
        fontSize: 11,
        fontWeight: '700',
        color: '#065f46',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: fluent.radius.xs,
    },
    badgeStage0: {
        backgroundColor: fluent.colors.neutralLighter,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
    },
    badgeStage1: {
        backgroundColor: fluent.colors.primaryLighterAlt,
        borderWidth: 1,
        borderColor: fluent.colors.primaryLight,
    },
    badgeStage2: {
        backgroundColor: fluent.colors.warningLight,
        borderWidth: 1,
        borderColor: fluent.colors.warningBorder,
    },
    badgeStage3: {
        backgroundColor: fluent.colors.successLight,
        borderWidth: 1,
        borderColor: fluent.colors.successBorder,
    },
    badgeText: { fontSize: 10, fontWeight: '600' },
    badgeTextStage0: { color: fluent.colors.neutralSecondary },
    badgeTextStage1: { color: fluent.colors.primaryDarker },
    badgeTextStage2: { color: fluent.colors.warningText },
    badgeTextStage3: { color: fluent.colors.success },
    recountBanner: {
        backgroundColor: fluent.colors.warningLight,
        borderWidth: 1,
        borderColor: fluent.colors.warningBorder,
        borderRadius: fluent.radius.sm,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
    },
    recountBannerTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    recountBannerSub: {
        fontSize: 11,
        color: fluent.colors.warningText,
    },
    recountListContainer: {
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        borderWidth: 1,
        borderColor: fluent.colors.warningBorder,
        padding: 8,
        marginBottom: 12,
    },
    emptyRecountText: {
        fontSize: 12,
        color: fluent.colors.warningText,
        textAlign: 'center',
        padding: 10,
    },
    recountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderBottomWidth: 1,
        borderBottomColor: fluent.colors.neutralLight,
    },
    recountSku: {
        fontSize: 13,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    recountDesc: {
        fontSize: 11,
        color: fluent.colors.neutralSecondary,
    },
    recountBinBadge: {
        backgroundColor: fluent.colors.warningLight,
        borderWidth: 1,
        borderColor: fluent.colors.warningBorder,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: fluent.radius.xs,
    },
    recountBinText: {
        fontSize: 11,
        fontWeight: '600',
        color: fluent.colors.warningText,
    },
    card: {
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        padding: 16,
        borderWidth: 1,
        borderColor: fluent.colors.neutralLight,
        ...fluent.shadows.card,
    },
    inputGroup: {
        marginBottom: 14,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
        marginBottom: 6,
        letterSpacing: 0.2,
    },
    inputRow: {
        flexDirection: 'row',
        gap: 8,
    },
    inputBin: {
        flex: 1,
        backgroundColor: fluent.colors.white,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 15,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    inputSku: {
        flex: 1,
        backgroundColor: fluent.colors.white,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 12,
        paddingVertical: 9,
        fontSize: 15,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    scanIconButton: {
        padding: 9,
        backgroundColor: fluent.colors.neutralLighter,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchBtn: {
        backgroundColor: fluent.colors.primary,
        paddingHorizontal: 14,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: fluent.radius.xs,
    },
    itemInfoCard: {
        backgroundColor: fluent.colors.infoLight,
        borderWidth: 1,
        borderColor: fluent.colors.infoBorder,
        borderRadius: fluent.radius.sm,
        padding: 12,
        marginBottom: 14,
    },
    itemInfoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 4,
    },
    itemInfoCode: {
        fontSize: 14,
        fontWeight: '700',
        color: fluent.colors.primaryDarker,
    },
    itemTag: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: fluent.radius.xs,
    },
    tagMaster: { backgroundColor: fluent.colors.successLight },
    tagFound: { backgroundColor: fluent.colors.warningLight },
    tagText: {
        fontSize: 9,
        fontWeight: 'bold',
        color: fluent.colors.success,
    },
    itemInfoDesc: {
        fontSize: 12,
        color: fluent.colors.neutralPrimary,
        fontWeight: '500',
        marginBottom: 6,
    },
    itemMetaRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: fluent.colors.primaryLight,
        paddingTop: 6,
    },
    itemMetaText: {
        fontSize: 11,
        color: fluent.colors.primaryDark,
    },
    metaBold: {
        fontWeight: 'bold',
    },
    qtyContainer: {
        gap: 10,
    },
    inputQty: {
        backgroundColor: fluent.colors.white,
        borderWidth: 2,
        borderColor: fluent.colors.primary,
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 16,
        paddingVertical: 10,
        fontSize: 22,
        fontWeight: 'bold',
        color: fluent.colors.neutralPrimary,
        textAlign: 'center',
    },
    saveButton: {
        backgroundColor: fluent.colors.primary,
        paddingVertical: 13,
        borderRadius: fluent.radius.xs,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
        marginTop: 6,
        ...fluent.shadows.card,
    },
    saveButtonDisabled: {
        backgroundColor: fluent.colors.neutralTertiaryAlt,
    },
    saveButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: fluent.colors.white,
        letterSpacing: 0.3,
    },
    historyCard: {
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        padding: 14,
        marginTop: 14,
        borderWidth: 1,
        borderColor: fluent.colors.neutralLight,
        ...fluent.shadows.card,
    },
    historyTitle: {
        fontSize: 12,
        fontWeight: '600',
        color: fluent.colors.neutralSecondary,
        marginBottom: 10,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    historyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: fluent.colors.neutralLight,
    },
    historySku: {
        fontSize: 13,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    historyLocationBadge: {
        backgroundColor: fluent.colors.primaryLighter,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: fluent.radius.xs,
    },
    historyLocationText: {
        fontSize: 10,
        fontWeight: '600',
        color: fluent.colors.primaryDark,
    },
    offlineBadge: {
        backgroundColor: fluent.colors.warningLight,
        borderWidth: 1,
        borderColor: fluent.colors.warningBorder,
        paddingHorizontal: 5,
        paddingVertical: 1,
        borderRadius: fluent.radius.xs,
    },
    offlineBadgeText: {
        fontSize: 9,
        fontWeight: '700',
        color: fluent.colors.warningText,
    },
    historyDesc: {
        fontSize: 11,
        color: fluent.colors.neutralSecondary,
        marginTop: 2,
    },
    historyQty: {
        fontSize: 14,
        fontWeight: '700',
        color: fluent.colors.primary,
    },
    historyTime: {
        fontSize: 10,
        color: fluent.colors.neutralTertiary,
    },
    sessionActiveBadgeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fluent.colors.successLight,
        borderWidth: 1,
        borderColor: fluent.colors.successLight,
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginTop: 8,
        alignSelf: 'flex-start',
    },
    sessionStatusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: fluent.colors.success,
        marginRight: 6,
    },
    sessionActiveText: {
        fontSize: 12,
        fontWeight: '600',
        color: fluent.colors.success,
    },
    sessionClosePill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#d1fae5',
        borderWidth: 1,
        borderColor: '#a7f3d0',
        borderRadius: 4,
        paddingHorizontal: 5,
        paddingVertical: 2,
        marginLeft: 8,
    },
    sessionClosePillText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#065f46',
        marginLeft: 2,
    },
    sessionWarningRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fluent.colors.warningLight,
        borderWidth: 1,
        borderColor: fluent.colors.warningBorder,
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginTop: 8,
        justifyContent: 'space-between',
    },
    sessionWarningText: {
        fontSize: 12,
        fontWeight: '600',
        color: fluent.colors.warningText,
        marginLeft: 4,
        flex: 1,
    },
    startSessionSmallBtn: {
        backgroundColor: fluent.colors.primary,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: fluent.radius.xs,
        marginLeft: 8,
    },
    startSessionSmallBtnText: {
        fontSize: 11,
        fontWeight: '600',
        color: fluent.colors.white,
    },
    stockroomSelectorBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: fluent.radius.xs,
        backgroundColor: fluent.colors.neutralLighter,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
    },
    stockroomSelectorLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    stockroomSelectorLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: fluent.colors.neutralSecondary,
    },
    stockroomSelectorValue: {
        fontSize: 13,
        fontWeight: '700',
        color: fluent.colors.neutralPrimary,
    },
    stockroomSelectorRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    stockroomChangeText: {
        fontSize: 12,
        fontWeight: '600',
        color: fluent.colors.primary,
    },
    modalBackdrop: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalCard: {
        width: '100%',
        maxWidth: 380,
        maxHeight: '70%',
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        padding: 16,
        ...fluent.shadows.card,
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingBottom: 12,
        borderBottomWidth: 1,
        borderBottomColor: fluent.colors.neutralQuaternary,
        marginBottom: 8,
    },
    modalTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    modalList: {
        maxHeight: 320,
    },
    modalOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 11,
        paddingHorizontal: 12,
        borderRadius: fluent.radius.xs,
        marginBottom: 6,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        backgroundColor: fluent.colors.white,
    },
    modalOptionSelected: {
        borderColor: fluent.colors.primary,
        backgroundColor: fluent.colors.primaryLighterAlt,
    },
    modalOptionTextWrap: {
        flex: 1,
        gap: 2,
    },
    modalOptionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    modalOptionTitleSelected: {
        color: fluent.colors.primary,
    },
    modalOptionSub: {
        fontSize: 11,
        fontWeight: '500',
    },
    modalOptionSubActive: {
        color: '#065f46',
    },
    modalOptionSubInactive: {
        color: fluent.colors.neutralSecondary,
    },
    stockroomGateCard: {
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        padding: 16,
        ...fluent.shadows.card,
    },
    stockroomGateHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 14,
    },
    stockroomGateIconWrap: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: fluent.colors.primaryLighterAlt,
        alignItems: 'center',
        justifyContent: 'center',
    },
    stockroomGateTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: fluent.colors.neutralPrimary,
    },
    stockroomGateSubtitle: {
        fontSize: 12,
        color: fluent.colors.neutralSecondary,
        marginTop: 2,
    },
    stockroomFilterBox: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fluent.colors.white,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 10,
        height: 42,
        gap: 8,
    },
    stockroomFilterInput: {
        flex: 1,
        fontSize: 14,
        color: fluent.colors.neutralPrimary,
        paddingVertical: 0,
    },
    stockroomGateToolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 10,
        marginBottom: 10,
    },
    stockroomGateCount: {
        fontSize: 12,
        fontWeight: '600',
        color: fluent.colors.neutralSecondary,
    },
    stockroomRefreshBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 4,
        paddingHorizontal: 8,
    },
    stockroomRefreshText: {
        fontSize: 12,
        fontWeight: '600',
        color: fluent.colors.primary,
    },
    stockroomGateList: {
        gap: 2,
    },
    stockroomOptionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    lastUsedBadge: {
        backgroundColor: fluent.colors.primaryLighter,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    lastUsedBadgeText: {
        fontSize: 10,
        fontWeight: '700',
        color: fluent.colors.primary,
    },
    stockroomEmptyBox: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 28,
        gap: 8,
    },
    stockroomEmptyText: {
        fontSize: 13,
        color: fluent.colors.neutralSecondary,
    },
    startSessionIconCircle: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: fluent.colors.primaryLighterAlt,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 14,
    },
    startSessionMainBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: fluent.colors.primary,
        paddingVertical: 12,
        paddingHorizontal: 18,
        borderRadius: fluent.radius.xs,
    },
    startSessionMainBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: fluent.colors.white,
    },
    recountScreenCard: {
        flex: 1,
        marginHorizontal: 10,
        marginBottom: 10,
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        padding: 12,
        ...fluent.shadows.card,
    },
    headerWrapper: {
        paddingHorizontal: 10,
        paddingTop: 10,
    },
    recountScreenHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    recountScreenTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: fluent.colors.neutralPrimary,
    },
    recountScreenSub: {
        fontSize: 11,
        color: fluent.colors.neutralSecondary,
        marginTop: 2,
    },
    recountRefreshBtn: {
        padding: 6,
    },
    recountSearchRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    recountSearchBox: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fluent.colors.white,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 10,
        height: 42,
        gap: 6,
    },
    recountScanBtn: {
        width: 48,
        height: 42,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.colors.primaryLight,
        backgroundColor: fluent.colors.primaryLighterAlt,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recountSearchInput: {
        flex: 1,
        fontSize: 13,
        color: fluent.colors.neutralPrimary,
        paddingVertical: 0,
    },
    recountTabsRow: {
        flexDirection: 'row',
        gap: 8,
        marginBottom: 10,
    },
    recountTabBtn: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        backgroundColor: fluent.colors.white,
    },
    recountTabBtnActive: {
        backgroundColor: fluent.colors.primary,
        borderColor: fluent.colors.primary,
    },
    recountTabText: {
        fontSize: 12,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    recountTabTextActive: {
        color: fluent.colors.white,
    },
    recountFlatList: {
        flex: 1,
    },
    recountTableRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 9,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: fluent.colors.neutralLighter,
        gap: 8,
    },
    recountTopLine: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 2,
    },
    recountStatusBadge: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    recountStatusPending: {
        backgroundColor: '#fef3c7',
    },
    recountStatusDone: {
        backgroundColor: '#dcfce7',
    },
    recountStatusText: {
        fontSize: 9,
        fontWeight: '700',
    },
    recountStatusTextPending: {
        color: '#92400e',
    },
    recountStatusTextDone: {
        color: '#166534',
    },
    recountActionBtn: {
        backgroundColor: fluent.colors.primary,
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: fluent.radius.xs,
    },
    recountActionBtnText: {
        fontSize: 11,
        fontWeight: '700',
        color: fluent.colors.white,
    },
    recountModalDesc: {
        fontSize: 12,
        color: fluent.colors.neutralSecondary,
        marginBottom: 12,
    },
    recountModalInput: {
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 10,
        height: 42,
        fontSize: 14,
        color: fluent.colors.neutralPrimary,
        backgroundColor: fluent.colors.white,
        marginBottom: 12,
    },
    dupHeaderLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    dupBodyText: {
        fontSize: 13,
        color: fluent.colors.neutralPrimary,
        lineHeight: 19,
        marginBottom: 10,
    },
    dupPrevBox: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#fef3c7',
        borderWidth: 1,
        borderColor: '#fcd34d',
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 12,
    },
    dupPrevLabel: {
        fontSize: 12,
        color: '#92400e',
        fontWeight: '600',
    },
    dupPrevValue: {
        fontSize: 14,
        color: '#78350f',
        fontWeight: '700',
    },
    dupQuestionText: {
        fontSize: 13,
        color: fluent.colors.neutralSecondary,
        marginBottom: 14,
    },
    dupActionsRow: {
        flexDirection: 'row',
        gap: 10,
    },
    dupCancelBtn: {
        flex: 1,
        paddingVertical: 11,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        backgroundColor: fluent.colors.neutralLighter,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dupCancelBtnText: {
        fontSize: 13,
        fontWeight: '600',
        color: fluent.colors.neutralSecondary,
    },
    dupConfirmBtn: {
        flex: 1,
        paddingVertical: 11,
        borderRadius: fluent.radius.xs,
        backgroundColor: fluent.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    dupConfirmBtnText: {
        fontSize: 13,
        fontWeight: '700',
        color: fluent.colors.white,
    },
});

export default W2WCount;
