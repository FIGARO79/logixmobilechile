import React, { useState, useRef, useEffect, useCallback } from 'react';
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
    Vibration,
} from 'react-native';
import { isAxiosError } from 'axios';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import client from '../api/client';
import ScannerModal from './ScannerModal';
import useDataWedge from '../hooks/useDataWedge';
import { ParsedBarcode } from '../utils/barcodeParser';
import fluent from '../theme/fluent';
import type { RootStackParamList } from '../navigation/AppNavigator';

interface W2WSession {
    id?: number;
    session_id?: number;
    user_username?: string;
}

interface W2WItemData {
    item_code: string;
    description?: string;
    bin_location?: string;
    system_qty?: number;
    in_master?: boolean;
}

interface RecentW2WCount {
    id: number;
    item_code: string;
    counted_location: string;
    counted_qty: number;
    description: string;
    time: string;
}

export interface W2WCountProps {
    navigation?: NativeStackNavigationProp<RootStackParamList, 'W2W'>;
}

const W2WCount: React.FC<W2WCountProps> = ({ navigation }) => {
    // Stage & Session Info
    const [stage, setStage] = useState(1); // 1: Conteo Gral, 2: Reconteo, 3: Conciliación
    const [activeSession, setActiveSession] = useState<W2WSession | null>(null);
    const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
    const [loadingSummary, setLoadingSummary] = useState(false);
    const [loadingSession, setLoadingSession] = useState(false);

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

    // Stage 2 Recounts List
    const [recountItems, setRecountItems] = useState<W2WItemData[]>([]);
    const [loadingRecounts, setLoadingRecounts] = useState(false);
    const [showRecountList, setShowRecountList] = useState(false);

    // Hardware & Camera Scanner
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState<'location' | 'item' | null>(
        null
    );

    // Refs
    const locationInputRef = useRef<TextInput | null>(null);
    const itemInputRef = useRef<TextInput | null>(null);
    const qtyInputRef = useRef<TextInput | null>(null);

    // Fetch Active Session for User
    const fetchActiveSession =
        useCallback(async (): Promise<W2WSession | null> => {
            setLoadingSession(true);
            try {
                const res = await client.get<W2WSession>('/api/sessions/active');
                if (res.data && (res.data.id || res.data.session_id)) {
                    const sId = res.data.id || res.data.session_id || null;
                    setActiveSession(res.data);
                    setActiveSessionId(sId);
                    return res.data;
                } else {
                    setActiveSession(null);
                    setActiveSessionId(null);
                    return null;
                }
            } catch (e) {
                console.error('Error al obtener sesión activa:', e);
                setActiveSession(null);
                setActiveSessionId(null);
                return null;
            } finally {
                setLoadingSession(false);
            }
        }, []);

    // Fetch Stage Info
    const fetchSummary = useCallback(async () => {
        setLoadingSummary(true);
        try {
            const res = await client.get<{ stage?: number | null }>(
                '/api/admin/inventory/summary'
            );
            if (res.data) {
                setStage(
                    res.data.stage !== undefined && res.data.stage !== null
                        ? Number(res.data.stage)
                        : 0
                );
            }
        } catch (e) {
            console.error('Error al obtener estado de inventario W2W:', e);
        } finally {
            setLoadingSummary(false);
        }
    }, []);

    // Fetch Stage 2 Recount List
    const fetchRecounts = useCallback(async () => {
        setLoadingRecounts(true);
        try {
            const res = await client.get<{ items?: W2WItemData[] }>(
                '/api/recount_list/active'
            );
            if (res.data && res.data.items) {
                setRecountItems(res.data.items);
            }
        } catch (e) {
            console.error('Error al cargar lista de reconteos:', e);
        } finally {
            setLoadingRecounts(false);
        }
    }, []);

    // Start New Count Session
    const handleStartSession = async (): Promise<W2WSession | null> => {
        setLoadingSession(true);
        try {
            const res = await client.post<W2WSession>('/api/sessions/start');
            if (res.data && (res.data.id || res.data.session_id)) {
                const sId = res.data.id || res.data.session_id || null;
                setActiveSession(res.data);
                setActiveSessionId(sId);
                Vibration.vibrate(70);
                Alert.alert(
                    'Éxito',
                    `Sesión #${sId} de inventario iniciada correctamente.`
                );
                fetchSummary();
                return res.data;
            }
            return null;
        } catch (e) {
            console.error('Error al iniciar sesión:', e);
            const msg = isAxiosError(e)
                ? (e.response?.data as { detail?: string } | undefined)
                      ?.detail || 'No se pudo iniciar la sesión de inventario.'
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

    useEffect(() => {
        fetchSummary();
        fetchActiveSession();
    }, [fetchSummary, fetchActiveSession]);

    useEffect(() => {
        if (stage === 2) {
            fetchRecounts();
        }
    }, [stage, fetchRecounts]);

    // Handle Item Search
    const handleSearchItem = async (codeToSearch?: string) => {
        const code = (codeToSearch || itemCode || '').trim().toUpperCase();
        if (!code) return;

        setLoadingItem(true);
        let shouldFocusQty = false;
        try {
            const res = await client.get<W2WItemData>(
                `/api/get_item_for_counting/${encodeURIComponent(code)}`
            );
            if (res.data) {
                setItemCode(res.data.item_code);
                setDescription(res.data.description || 'N/A');
                setBinSys(res.data.bin_location || 'N/A');
                setItemData(res.data);
                Vibration.vibrate(70);
                shouldFocusQty = true;
            }
        } catch (e) {
            console.error('Error buscando artículo:', e);
            Vibration.vibrate([0, 150, 100, 150]);
            Alert.alert(
                'Aviso',
                'Ítem no hallado en catálogo local. Admitido como hallazgo W2W.'
            );
            setItemData({
                item_code: code,
                description: 'HALLAZGO (SIN REGISTRO EN MAESTRO)',
                bin_location: 'N/A',
                system_qty: 0,
                in_master: false,
            });
            setDescription('HALLAZGO (SIN REGISTRO EN MAESTRO)');
            setBinSys('N/A');
            shouldFocusQty = true;
        } finally {
            setLoadingItem(false);
            if (shouldFocusQty) {
                setTimeout(() => {
                    qtyInputRef.current?.focus();
                }, 100);
            }
        }
    };

    // Handle Hardware & Camera Scan Result
    const handleScanResult = (
        scannedCode: string,
        parsedData?: ParsedBarcode
    ) => {
        setScannerOpen(false);
        if (!scannedCode) return;
        const clean = scannedCode.trim().toUpperCase();

        if (scanTarget === 'location' || (!countedLocation && !scanTarget)) {
            setCountedLocation(clean);
            Vibration.vibrate(70);
            setTimeout(() => itemInputRef.current?.focus(), 150);
        } else {
            setItemCode(clean);
            handleSearchItem(clean);
            if (parsedData?.quantity) {
                setCountedQty(String(parsedData.quantity));
            }
        }
        setScanTarget(null);
    };

    // Zebra DataWedge Hardware Scanner Listener
    useDataWedge((code, parsed) => handleScanResult(code, parsed));

    // Save W2W Physical Count
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

        // Verificar sesión activa antes de guardar
        let currentSessionId = activeSessionId;
        if (!currentSessionId) {
            const active = await fetchActiveSession();
            if (active && (active.id || active.session_id)) {
                currentSessionId = active.id || active.session_id || null;
            }
        }

        if (!currentSessionId) {
            Alert.alert(
                'Sin Sesión Activa',
                'No tienes una sesión de inventario activa en el servidor. ¿Deseas iniciar una nueva sesión ahora?',
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
        const payload = {
            session_id: currentSessionId,
            item_code: codeClean,
            counted_qty: qtyNum,
            counted_location: locClean,
            description: description || 'N/A',
            bin_location_system: binSys || 'N/A',
            timestamp: new Date().toISOString(),
        };

        try {
            const res = await client.post('/api/w2w/save_count', payload);
            if (res.status === 200 || res.status === 201) {
                Vibration.vibrate([0, 100, 50, 100]);

                // Add to recent list
                setRecentCounts((prev) => [
                    {
                        id: Date.now(),
                        item_code: codeClean,
                        counted_location: locClean,
                        counted_qty: qtyNum,
                        description: description || 'N/A',
                        time: new Date().toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                        }),
                    },
                    ...prev.slice(0, 9),
                ]);

                // Reset product & quantity while keeping BIN for fast consecutive scanning
                setItemCode('');
                setDescription('');
                setBinSys('');
                setItemData(null);
                setCountedQty('');
                setTimeout(() => itemInputRef.current?.focus(), 150);

                fetchSummary();
                if (stage === 2) fetchRecounts();
            }
        } catch (e) {
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

    // Select Recount Item (Stage 2)
    const selectRecountItem = (item: W2WItemData) => {
        if (item.bin_location && item.bin_location !== 'N/A') {
            setCountedLocation(item.bin_location);
        }
        setItemCode(item.item_code);
        handleSearchItem(item.item_code);
        setShowRecountList(false);
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

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                {/* Header Banner Active Stage */}
                <View style={styles.stageHeader}>
                    <View style={styles.stageTitleRow}>
                        <Icon name="warehouse" size={22} color="#0284c7" />
                        <Text style={styles.stageTitleText}>
                            INVENTARIO W2W
                        </Text>
                        <View style={[styles.badge, stageInfo.badgeStyle]}>
                            <Text
                                style={[styles.badgeText, stageInfo.textStyle]}
                            >
                                {stageInfo.label}
                            </Text>
                        </View>
                    </View>

                    {/* Estado de la Sesión de Conteo */}
                    {stage > 0 &&
                        (activeSession ? (
                            <TouchableOpacity
                                style={styles.sessionActiveBadgeRow}
                                onPress={handleCloseSession}
                                disabled={loadingSession}
                                activeOpacity={0.7}
                            >
                                <View style={styles.sessionStatusDot} />
                                <Text style={styles.sessionActiveText}>
                                    Sesión #
                                    {activeSession.id ||
                                        activeSession.session_id}{' '}
                                    activa
                                    {activeSession.user_username
                                        ? ` • ${activeSession.user_username}`
                                        : ''}
                                </Text>
                                {loadingSession ? (
                                    <ActivityIndicator
                                        size="small"
                                        color="#065f46"
                                        style={styles.sessionSpinner}
                                    />
                                ) : (
                                    <View style={styles.sessionClosePill}>
                                        <Icon
                                            name="close"
                                            size={12}
                                            color="#065f46"
                                        />
                                        <Text
                                            style={styles.sessionClosePillText}
                                        >
                                            Cerrar
                                        </Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.sessionWarningRow}>
                                <Icon
                                    name="alert-circle-outline"
                                    size={18}
                                    color="#d97706"
                                />
                                <Text style={styles.sessionWarningText}>
                                    Sin sesión de inventario activa
                                </Text>
                                <TouchableOpacity
                                    style={styles.startSessionSmallBtn}
                                    onPress={handleStartSession}
                                    disabled={loadingSession}
                                >
                                    {loadingSession ? (
                                        <ActivityIndicator
                                            size="small"
                                            color="#fff"
                                        />
                                    ) : (
                                        <Text
                                            style={
                                                styles.startSessionSmallBtnText
                                            }
                                        >
                                            INICIAR SESIÓN
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        ))}
                </View>

                {/* Banner de alerta para Reconteos (Etapa 2) */}
                {stage === 2 && (
                    <TouchableOpacity
                        style={styles.recountBanner}
                        onPress={() => setShowRecountList(!showRecountList)}
                    >
                        <Icon
                            name="clipboard-alert-outline"
                            size={22}
                            color="#b45309"
                        />
                        <View style={styles.recountBannerBody}>
                            <Text style={styles.recountBannerTitle}>
                                Reconteos Pendientes ({recountItems.length})
                            </Text>
                            <Text style={styles.recountBannerSub}>
                                Toca para ver la lista de SKUs a verificar en
                                Etapa 2
                            </Text>
                        </View>
                        <Icon
                            name={
                                showRecountList ? 'chevron-up' : 'chevron-down'
                            }
                            size={24}
                            color="#b45309"
                        />
                    </TouchableOpacity>
                )}

                {/* Lista Desplegable de Reconteos (Etapa 2) */}
                {stage === 2 && showRecountList && (
                    <View style={styles.recountListContainer}>
                        {loadingRecounts ? (
                            <ActivityIndicator
                                size="small"
                                color="#b45309"
                                style={styles.recountLoader}
                            />
                        ) : recountItems.length === 0 ? (
                            <Text style={styles.emptyRecountText}>
                                No hay reconteos pendientes en su zona.
                            </Text>
                        ) : (
                            recountItems.slice(0, 15).map((r, idx) => (
                                <TouchableOpacity
                                    key={idx}
                                    style={styles.recountRow}
                                    onPress={() => selectRecountItem(r)}
                                >
                                    <View style={styles.flexOne}>
                                        <Text style={styles.recountSku}>
                                            {r.item_code}
                                        </Text>
                                        <Text
                                            style={styles.recountDesc}
                                            numberOfLines={1}
                                        >
                                            {r.description}
                                        </Text>
                                    </View>
                                    <View style={styles.recountBinBadge}>
                                        <Text style={styles.recountBinText}>
                                            {r.bin_location || 'N/A'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            ))
                        )}
                    </View>
                )}

                {/* Si no hay etapa activa (stage === 0), mostramos la pantalla de bloqueo */}
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
                            Sin Inventario W2W Activo
                        </Text>
                        <Text style={styles.inactiveDesc}>
                            Actualmente no hay ninguna etapa de inventario
                            Wall-to-Wall iniciada desde el servidor. El
                            administrador debe activar la Etapa 1 en la
                            plataforma web para habilitar el conteo físico.
                        </Text>
                        <View style={styles.inactiveActions}>
                            <TouchableOpacity
                                style={styles.verifyBtn}
                                onPress={fetchSummary}
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
                                        <Text selectable style={styles.itemInfoCode}>
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
                                                <Text selectable style={styles.historySku}>
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
        padding: 12,
        paddingBottom: 30,
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
        padding: 14,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        ...fluent.shadows.card,
    },
    stageTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    stageTitleText: {
        fontSize: 14,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
        letterSpacing: 0.3,
        flex: 1,
        marginLeft: 8,
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
});

export default W2WCount;
