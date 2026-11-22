import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    FlatList,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Vibration,
    ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import client from '../api/client';
import ScannerModal from '../components/ScannerModal';
import useDataWedge from '../hooks/useDataWedge';
import { parseBarcode } from '../utils/barcodeParser';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import fluent from '../theme/fluent';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Inbound'>;

interface InboundItemData {
    itemCode: string;
    description?: string;
    itemType?: string;
    binLocation?: string;
    defaultQtyGrn?: number;
    xdockTotal?: number;
    xdockPending?: number;
    suggestedBin?: string;
    is_ai_prediction?: boolean;
    error?: string;
}

interface InboundLog {
    id: number;
    importReference: string;
    waybill: string;
    itemCode: string;
    itemDescription?: string;
    relocatedBin?: string;
    binLocation?: string;
    qtyReceived: number;
    difference?: number;
}

interface LookupReferenceResponse {
    import_ref?: string;
    waybill?: string;
}

const InboundScreen: React.FC<Props> = () => {
    // Form State
    const [importRef, setImportRef] = useState('');
    const [waybill, setWaybill] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [quantity, setQuantity] = useState('');
    const [relocatedBin, setRelocatedBin] = useState('');

    // Data State
    const [itemData, setItemData] = useState<InboundItemData | null>(null);
    const [logs, setLogs] = useState<InboundLog[]>([]);
    const [allLogs, setAllLogs] = useState<InboundLog[]>([]); // Cache de todos los logs para lazy load local
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editId, setEditId] = useState<number | null>(null);

    // UI & Pagination State
    const [scannerOpen, setScannerOpen] = useState(false);
    const [logsExpanded, setLogsExpanded] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const LIMIT = 20;

    const importRefInputRef = useRef<TextInput | null>(null);
    const waybillRef = useRef<TextInput | null>(null);
    const quantityRef = useRef<TextInput | null>(null);
    const itemCodeRef = useRef<TextInput | null>(null);

    const loadLogs = useCallback(async (reset = false) => {
        if (logsLoading || (!hasMore && !reset)) return;

        setLogsLoading(true);
        try {
            let dataToUse = allLogs;
            let currentOffset = reset ? 0 : offset;

            // Si es reset o no tenemos datos, consultamos al servidor
            if (reset || allLogs.length === 0) {
                const res = await client.get<InboundLog[]>('/api/get_logs');
                dataToUse = Array.isArray(res.data) ? res.data : [];
                setAllLogs(dataToUse);
                currentOffset = 0;
            }

            // Lazy load local: tomamos solo el siguiente bloque
            const nextBatch = dataToUse.slice(currentOffset, currentOffset + LIMIT);

            if (reset) {
                setLogs(nextBatch);
                setOffset(LIMIT);
                setHasMore(dataToUse.length > LIMIT);
            } else {
                setLogs(prev => [...prev, ...nextBatch]);
                setOffset(prev => prev + LIMIT);
                setHasMore(dataToUse.length > currentOffset + LIMIT);
            }
        } catch (e) {
            console.error('Error loading logs', e);
        } finally {
            setLogsLoading(false);
        }
    }, [allLogs, hasMore, logsLoading, offset]);

    useEffect(() => {
        loadLogs(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Solo al montar

    const handleLookupReference = async (type: 'waybill' | 'import_ref', value: string) => {
        if (!value || editId) return;
        try {
            const params = type === 'waybill' ? `waybill=${encodeURIComponent(value)}` : `import_ref=${encodeURIComponent(value)}`;
            const res = await client.get<LookupReferenceResponse>(`/api/inbound/lookup_reference?${params}`);
            const data = res.data;
            if (type === 'waybill') {
                if (data.import_ref) setImportRef(data.import_ref);
                if (data.waybill && !waybill) setWaybill(data.waybill);
            } else {
                if (data.waybill) setWaybill(data.waybill);
                if (data.import_ref && !importRef) setImportRef(data.import_ref);
            }
        } catch (e) {
            console.error('Error lookup', e);
        }
    };

    const toggleLogs = () => {
        const nextState = !logsExpanded;
        setLogsExpanded(nextState);
        if (nextState && logs.length === 0) {
            loadLogs(true);
        }
    };

    const findItem = useCallback(async (code: string = itemCode) => {
        if (!code || !importRef) {
            Vibration.vibrate([0, 100, 50, 100]);
            Alert.alert('Faltan Datos', 'Ingrese Import Reference e Item Code');
            return;
        }

        setLoading(true);
        try {
            const res = await client.get<InboundItemData>(`/api/find_item/${encodeURIComponent(code)}/${encodeURIComponent(importRef)}`);
            const data = res.data;

            if (data.error) {
                Vibration.vibrate([0, 200, 100, 200]);
                Alert.alert('Error', data.error);
                setItemData(null);
            } else {
                Vibration.vibrate(100);
                setItemData(data);
                if (!editId) setQuantity('');
                setTimeout(() => quantityRef.current?.focus(), 300);
            }
        } catch {
            Vibration.vibrate([0, 200, 100, 200]);
            Alert.alert('✗ Error', 'Ítem no encontrado en esta referencia.');
            setItemData(null);
        } finally {
            setLoading(false);
        }
    }, [itemCode, importRef, editId]);

    const handleScan = useCallback((code: string) => {
        setScannerOpen(false);
        const parsed = parseBarcode(code);
        const upperCode = (parsed?.itemCode || code).trim().toUpperCase();
        setItemCode(upperCode);
        if (importRef) {
            findItem(upperCode);
        }
    }, [importRef, findItem]);

    // Integración de escaneo por hardware (Zebra)
    useDataWedge(handleScan);

    const resetForm = () => {
        setEditId(null);
        setItemCode('');
        setQuantity('');
        setRelocatedBin('');
        setItemData(null);
    };

    const handleSaveLog = async () => {
        if (!itemData) return;
        const parsedQty = parseInt(quantity, 10);
        if (!quantity || Number.isNaN(parsedQty) || parsedQty < 1) {
            Alert.alert('Error', 'Ingrese una cantidad válida');
            return;
        }

        setSaving(true);
        try {
            if (editId) {
                await client.put(`/api/update_log/${editId}`, {
                    waybill: waybill.toUpperCase(),
                    qtyReceived: parsedQty,
                    relocatedBin: relocatedBin.toUpperCase(),
                });
            } else {
                await client.post('/api/add_log', {
                    importReference: importRef.toUpperCase(),
                    waybill: waybill.toUpperCase(),
                    itemCode: itemData.itemCode,
                    quantity: parsedQty,
                    relocatedBin: relocatedBin.toUpperCase(),
                });
            }
            Vibration.vibrate(100);
            loadLogs(true);
            resetForm();
            Alert.alert('Éxito', editId ? 'Registro actualizado' : 'Registro añadido');
        } catch {
            Vibration.vibrate([0, 200, 100, 200]);
            Alert.alert('Error', 'No se pudo guardar el registro');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id: number) => {
        Alert.alert('Confirmar', '¿Eliminar registro?', [
            { text: 'Cancelar', style: 'cancel' },
            {
                text: 'Eliminar',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await client.delete(`/api/delete_log/${id}`);
                        Vibration.vibrate(50);
                        loadLogs(true);
                    } catch {
                        Alert.alert('Error', 'No se pudo eliminar');
                    }
                },
            },
        ]);
    };

    const startEdit = async (log: InboundLog) => {
        setEditId(log.id);
        setImportRef(log.importReference);
        setWaybill(log.waybill);
        setItemCode(log.itemCode);
        setQuantity(String(log.qtyReceived));
        setRelocatedBin(log.relocatedBin || '');

        try {
            const res = await client.get<InboundItemData>(`/api/find_item/${encodeURIComponent(log.itemCode)}/${encodeURIComponent(log.importReference)}`);
            setItemData(res.data);
            Vibration.vibrate(50);
        } catch {}
    };

    const renderLog: ListRenderItem<InboundLog> = ({ item }) => {
        const logDiff = item.difference || 0;
        return (
            <View style={styles.logCard}>
                <View style={styles.logHeader}>
                    <View style={styles.logInfo}>
                        <Text selectable style={styles.logItemCode}>{item.itemCode}</Text>
                        <Text selectable style={styles.logDescription} numberOfLines={1}>{item.itemDescription}</Text>
                    </View>
                    <View style={styles.logActions}>
                        <TouchableOpacity onPress={() => startEdit(item)} style={styles.actionButton}>
                            <Icon name="pencil" size={20} color="#0854a0" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionButton}>
                            <Icon name="delete" size={20} color="#b91c1c" />
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.logDetails}>
                    <View style={[styles.logDetail, { flex: 1.2 }]}>
                        <Text style={styles.logLabel}>REF</Text>
                        <Text selectable style={styles.logValue} numberOfLines={1} ellipsizeMode="tail">{item.importReference || '-'}</Text>
                    </View>
                    <View style={[styles.logDetail, { flex: 1.2 }]}>
                        <Text style={styles.logLabel}>WB</Text>
                        <Text selectable style={styles.logValue} numberOfLines={1} ellipsizeMode="tail">{item.waybill || '-'}</Text>
                    </View>
                    <View style={[styles.logDetail, { flex: 1.2 }]}>
                        <Text style={styles.logLabel}>BIN</Text>
                        <Text selectable style={styles.logValue} numberOfLines={1} ellipsizeMode="tail">{item.relocatedBin || item.binLocation || '-'}</Text>
                    </View>
                    <View style={[styles.logDetail, { flex: 0.8, alignItems: 'center' }]}>
                        <Text style={styles.logLabel}>QTY</Text>
                        <Text style={styles.logValueBold}>{item.qtyReceived}</Text>
                    </View>
                    <View style={[styles.logDetail, { flex: 0.8, alignItems: 'flex-end' }]}>
                        <Text style={styles.logLabel}>DIF</Text>
                        <Text style={[styles.logValueBold, logDiff < 0 && styles.diffNegative, logDiff > 0 && styles.diffPositive]}>
                            {logDiff > 0 ? `+${logDiff}` : logDiff}
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container} edges={['right', 'bottom', 'left']}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>

                {/* Formulario Fijo */}
                <View style={styles.formCard}>
                    <View style={styles.row}>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.inputLabel}>Import Reference</Text>
                            <TextInput
                                ref={importRefInputRef}
                                style={[styles.input, Boolean(editId) && styles.inputDisabled, styles.monoText]}
                                value={importRef}
                                onChangeText={t => setImportRef(t.toUpperCase())}
                                onBlur={() => handleLookupReference('import_ref', importRef)}
                                onSubmitEditing={() => {
                                    handleLookupReference('import_ref', importRef);
                                    waybillRef.current?.focus();
                                }}
                                returnKeyType="next"
                                placeholder=""
                                editable={!editId}
                                keyboardType="numeric"
                                blurOnSubmit={false}
                            />
                        </View>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.inputLabel}>Waybill</Text>
                            <TextInput
                                ref={waybillRef}
                                style={[styles.input, styles.monoText]}
                                value={waybill}
                                onChangeText={t => setWaybill(t.toUpperCase())}
                                onBlur={() => handleLookupReference('waybill', waybill)}
                                onSubmitEditing={() => {
                                    handleLookupReference('waybill', waybill);
                                    itemCodeRef.current?.focus();
                                }}
                                returnKeyType="next"
                                placeholder=""
                                blurOnSubmit={false}
                                keyboardType="default"
                                autoCapitalize="characters"
                            />
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.inputLabel}>Item Code</Text>
                        <View style={styles.row}>
                            <TextInput
                                ref={itemCodeRef}
                                style={[styles.input, { flex: 1 }, Boolean(editId) && styles.inputDisabled, styles.monoText]}
                                value={itemCode}
                                onChangeText={t => setItemCode(t.toUpperCase())}
                                placeholder=""
                                editable={!editId}
                                onSubmitEditing={() => findItem()}
                                blurOnSubmit={false}
                                keyboardType="default"
                                autoCapitalize="characters"
                            />
                            {!editId && (
                                <>
                                    <TouchableOpacity style={styles.scanIconButton} onPress={() => setScannerOpen(true)}>
                                        <Icon name="barcode-scan" size={24} color={fluent.colors.neutralPrimary} />
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[styles.iconButton, styles.searchButton]} onPress={() => findItem()} disabled={loading}>
                                        {loading ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="magnify" size={24} color="#fff" />}
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>

                    {itemData && (
                        <View style={styles.itemDetailsCompact}>
                            <Text selectable style={styles.itemDescriptionSmall} numberOfLines={1}>{itemData.description}</Text>

                            {/* Fila 1: Información Técnica */}
                            <View style={styles.rowTight}>
                                <View style={styles.detailBoxSmall}><Text style={styles.detailLabelTiny}>ABC</Text><Text style={styles.detailValueSmall}>{itemData.itemType || '-'}</Text></View>
                                <View style={styles.detailBoxSmall}><Text style={styles.detailLabelTiny}>UBICACIÓN</Text><Text selectable style={[styles.detailValueSmall, styles.monoText]}>{itemData.binLocation || '-'}</Text></View>
                            </View>

                            {/* Fila 2: Alertas y Sugerencias (Solo si existen) */}
                            {((itemData.xdockTotal ?? 0) > 0 || Boolean(itemData.suggestedBin)) && (
                                <View style={[styles.rowTight, { marginTop: 6 }]}>
                                    {(itemData.xdockTotal ?? 0) > 0 && (
                                        <View style={[styles.xdockBadge, (itemData.xdockPending ?? 0) > 0 && styles.xdockBadgePending]}>
                                            <Icon
                                                name={(itemData.xdockPending ?? 0) > 0 ? 'truck-fast' : 'truck-check'}
                                                size={16}
                                                color={(itemData.xdockPending ?? 0) > 0 ? '#b91c1c' : '#15803d'}
                                            />
                                            <Text style={[styles.xdockTextTiny, (itemData.xdockPending ?? 0) > 0 && styles.xdockTextPendingTiny]}>
                                                XDOCK: {itemData.xdockPending ?? 0}/{itemData.xdockTotal ?? 0}
                                            </Text>
                                        </View>
                                    )}

                                    {itemData.suggestedBin && (
                                        <TouchableOpacity
                                            style={[
                                                styles.suggestionBadge,
                                                itemData.is_ai_prediction && styles.suggestionBadgeAI,
                                            ]}
                                            onPress={() => {
                                                if (itemData.suggestedBin) {
                                                    setRelocatedBin(itemData.suggestedBin);
                                                    Vibration.vibrate(50);
                                                }
                                            }}
                                        >
                                            <Icon
                                                name={itemData.is_ai_prediction ? 'robot' : 'auto-fix'}
                                                size={16}
                                                color={itemData.is_ai_prediction ? '#1d4ed8' : '#15803d'}
                                            />
                                            <Text style={[
                                                styles.suggestionBadgeText,
                                                itemData.is_ai_prediction && styles.suggestionBadgeTextAI,
                                            ]}>
                                                {itemData.is_ai_prediction ? 'IA' : 'SLOT'}: {itemData.suggestedBin}
                                            </Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}
                        </View>
                    )}

                    <View style={styles.row}>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.inputLabel}>Qty Received</Text>
                            <TextInput ref={quantityRef} style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="0" blurOnSubmit={false} />
                        </View>
                        <View style={[styles.inputGroup, { flex: 1 }]}>
                            <Text style={styles.inputLabel}>Relocate Bin (Opc.)</Text>
                            <TextInput style={[styles.input, styles.monoText]} value={relocatedBin} onChangeText={t => setRelocatedBin(t.toUpperCase())} placeholder="" blurOnSubmit={false} />
                        </View>
                    </View>

                    <View style={styles.row}>
                        <TouchableOpacity style={[styles.saveButton, !itemData && styles.buttonDisabled]} onPress={handleSaveLog} disabled={saving || !itemData}>
                            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>{editId ? 'Guardar Cambios' : 'Añadir Registro'}</Text>}
                        </TouchableOpacity>
                        {editId && <TouchableOpacity style={styles.cancelButton} onPress={resetForm}><Text style={styles.cancelButtonText}>Cancelar</Text></TouchableOpacity>}
                    </View>

                    <View style={styles.divider} />

                    <TouchableOpacity style={styles.logsToggle} onPress={toggleLogs}>
                        <View style={styles.rowCentered}>
                            <Icon name={logsExpanded ? 'chevron-down' : 'chevron-right'} size={24} color="#333" />
                            <Text style={styles.logsSectionTitle}>Últimos Registros {logs.length > 0 ? `(${logs.length})` : ''}</Text>
                        </View>
                        {logsExpanded && (
                            <TouchableOpacity onPress={() => loadLogs(true)}>
                                <Icon name="refresh" size={20} color="#0854a0" />
                            </TouchableOpacity>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Lista de Registros con scroll independiente */}
                <FlatList
                    data={logsExpanded ? logs : []}
                    renderItem={renderLog}
                    keyExtractor={(item, index) => item?.id?.toString() || index.toString()}
                    onEndReached={() => logsExpanded && hasMore && loadLogs()}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={logsLoading && logsExpanded ? <ActivityIndicator style={{ margin: 20 }} color="#0854a0" /> : null}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                    style={styles.flex} // Asegura que la lista ocupe el espacio restante y permita scroll
                />
            </KeyboardAvoidingView>
            <ScannerModal visible={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    flex: { flex: 1 },
    header: {
        paddingHorizontal: 16,
        paddingVertical: 4,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    backButton: {
        paddingVertical: 8,
        paddingRight: 12,
    },
    backText: { color: fluent.colors.primary, fontSize: 14, fontWeight: '600' },
    title: { fontSize: 18, fontWeight: '600', color: fluent.colors.neutralPrimary },
    listContent: { paddingBottom: 40 },
    formCard: { backgroundColor: fluent.colors.cardBg, margin: 8, padding: 14, borderRadius: fluent.radius.sm, borderWidth: 1, borderColor: fluent.colors.neutralLight, ...fluent.shadows.card },
    row: { flexDirection: 'row', gap: 10, marginBottom: 8 },
    rowCentered: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    inputGroup: { marginBottom: 8 },
    inputLabel: { fontSize: 11, fontWeight: '600', color: fluent.colors.neutralPrimary, marginBottom: 4 },
    input: { height: 44, backgroundColor: fluent.colors.white, borderWidth: 1, borderColor: fluent.borders.color, borderRadius: fluent.radius.xs, paddingHorizontal: 10, fontSize: 16, color: fluent.colors.neutralPrimary, fontWeight: '600' },
    inputDisabled: { backgroundColor: fluent.colors.neutralLighter, color: fluent.colors.neutralSecondary },
    monoText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    scanIconButton: {
        backgroundColor: fluent.colors.neutralLighter,
        width: 44,
        height: 44,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        alignItems: 'center',
        justifyContent: 'center',
    },
    iconButton: { backgroundColor: fluent.colors.neutralPrimary, width: 44, height: 44, borderRadius: fluent.radius.xs, alignItems: 'center', justifyContent: 'center' },
    searchButton: { backgroundColor: fluent.colors.primary },
    itemDetailsCompact: {
        backgroundColor: fluent.colors.neutralLighterAlt,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: fluent.radius.sm,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        ...fluent.shadows.card,
    },
    rowItemInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    rowTight: {
        flexDirection: 'row',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 8,
        marginTop: 6,
    },
    rowCenteredTight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    itemDescriptionSmall: {
        fontSize: 14,
        fontWeight: '700',
        color: fluent.colors.neutralPrimary,
        flexShrink: 1,
        lineHeight: 18,
    },
    detailBoxSmall: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: fluent.colors.white,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.colors.neutralLight,
    },
    detailLabelTiny: {
        fontSize: 9,
        fontWeight: 'bold',
        color: fluent.colors.neutralSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.3,
    },
    detailValueSmall: {
        fontSize: 12,
        fontWeight: '700',
        color: fluent.colors.neutralPrimary,
    },
    xdockBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fluent.colors.errorLight,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: fluent.radius.xs,
        gap: 6,
        borderWidth: 1,
        borderColor: fluent.colors.errorBorder,
    },
    xdockBadgePending: {
        backgroundColor: fluent.colors.errorLight,
        borderColor: fluent.colors.errorBorder,
    },
    xdockTextTiny: {
        fontSize: 11,
        fontWeight: 'bold',
        color: fluent.colors.error,
    },
    xdockTextPendingTiny: {
        color: fluent.colors.error,
    },
    suggestionBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fluent.colors.successLight,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: fluent.radius.xs,
        gap: 6,
        borderWidth: 1,
        borderColor: fluent.colors.successLight,
    },
    suggestionBadgeAI: {
        backgroundColor: fluent.colors.primaryLighterAlt,
        borderColor: fluent.colors.primaryLight,
    },
    suggestionBadgeText: {
        fontSize: 11,
        fontWeight: 'bold',
        color: fluent.colors.success,
    },
    suggestionBadgeTextAI: {
        color: fluent.colors.primary,
    },
    suggestionBox: {
        backgroundColor: fluent.colors.successLight,
        padding: 8,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.colors.successLight,
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 90,
    },
    suggestionBoxAI: {
        backgroundColor: fluent.colors.primaryLighterAlt,
        borderColor: fluent.colors.primaryLight,
    },
    suggestionLabel: { fontSize: 9, fontWeight: 'bold', color: fluent.colors.success, textTransform: 'uppercase', marginBottom: 2 },
    suggestionLabelAI: { color: fluent.colors.primary },
    suggestionValue: { fontSize: 14, fontWeight: 'bold', color: fluent.colors.neutralPrimary },
    suggestionHint: { fontSize: 7, color: fluent.colors.neutralSecondary, marginTop: 2, fontStyle: 'italic' },
    detailBox: { flex: 1 },
    detailLabel: { fontSize: 10, color: fluent.colors.neutralSecondary, textTransform: 'uppercase' },
    detailValue: { fontSize: 13, fontWeight: '600', color: fluent.colors.neutralPrimary },
    summaryBox: { flexDirection: 'row', backgroundColor: fluent.colors.neutralLighterAlt, padding: 12, borderRadius: fluent.radius.xs, marginBottom: 14, borderWidth: 1, borderColor: fluent.colors.neutralLight },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryLabel: { fontSize: 10, color: fluent.colors.neutralSecondary, textTransform: 'uppercase', marginBottom: 4 },
    summaryValue: { fontSize: 18, fontWeight: 'bold', color: fluent.colors.neutralPrimary },
    summaryValueBold: { fontWeight: 'bold' },
    diffNegative: { color: fluent.colors.error },
    diffPositive: { color: fluent.colors.primary },
    saveButton: { flex: 1, backgroundColor: fluent.colors.primary, padding: 14, borderRadius: fluent.radius.xs, alignItems: 'center', ...fluent.shadows.card },
    buttonDisabled: { backgroundColor: fluent.colors.neutralTertiaryAlt },
    saveButtonText: { color: fluent.colors.white, fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
    cancelButton: { backgroundColor: fluent.colors.neutralLighter, padding: 14, borderRadius: fluent.radius.xs, alignItems: 'center', paddingHorizontal: 20, marginLeft: 8, borderWidth: 1, borderColor: fluent.borders.color },
    cancelButtonText: { color: fluent.colors.neutralPrimary, fontSize: 14, fontWeight: '600' },
    divider: { height: 1, backgroundColor: fluent.colors.neutralLight, marginVertical: 14 },
    logsToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    logsSectionTitle: { fontSize: 15, fontWeight: '600', color: fluent.colors.neutralPrimary },
    logCard: { backgroundColor: fluent.colors.cardBg, borderRadius: fluent.radius.sm, padding: 12, marginHorizontal: 8, marginBottom: 8, borderWidth: 1, borderColor: fluent.colors.neutralLight, ...fluent.shadows.card },
    logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
    logInfo: { flex: 1, paddingRight: 8 },
    logItemCode: { fontSize: 13, fontWeight: '700', color: fluent.colors.primaryDarker, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    logDescription: { fontSize: 11, color: fluent.colors.neutralSecondary },
    logActions: { flexDirection: 'row', gap: 10 },
    actionButton: { padding: 6, backgroundColor: fluent.colors.neutralLighter, borderRadius: fluent.radius.xs, borderWidth: 1, borderColor: fluent.borders.color },
    logDetails: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6, gap: 4 },
    logDetail: { minWidth: 35 },
    logLabel: { fontSize: 9, color: fluent.colors.neutralSecondary },
    logValue: { fontSize: 11, color: fluent.colors.neutralPrimary, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    logValueBold: { fontSize: 12, fontWeight: '700', color: fluent.colors.neutralPrimary },
});

export default InboundScreen;
