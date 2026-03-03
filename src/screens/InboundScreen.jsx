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
    Vibration
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import client from '../api/client';
import ScannerModal from '../components/ScannerModal';
import useDataWedge from '../hooks/useDataWedge';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

// Custom QR Icon component
const QrIcon = ({ size = 20, color = '#fff' }) => (
    <View style={{ width: size, height: size }}>
        <View style={{ position: 'absolute', top: 0, left: 0, width: size * 0.35, height: size * 0.35, borderWidth: 2, borderColor: color }} />
        <View style={{ position: 'absolute', top: 0, right: 0, width: size * 0.35, height: size * 0.35, borderWidth: 2, borderColor: color }} />
        <View style={{ position: 'absolute', bottom: 0, left: 0, width: size * 0.35, height: size * 0.35, borderWidth: 2, borderColor: color }} />
        <View style={{ position: 'absolute', top: size * 0.4, left: size * 0.4, width: size * 0.2, height: size * 0.2, backgroundColor: color }} />
        <View style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.25, height: size * 0.25, borderWidth: 1.5, borderColor: color }} />
    </View>
);

const InboundScreen = ({ navigation }) => {
    // Form State
    const [importRef, setImportRef] = useState('');
    const [waybill, setWaybill] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [quantity, setQuantity] = useState('');
    const [relocatedBin, setRelocatedBin] = useState('');

    // Data State
    const [itemData, setItemData] = useState(null);
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [editId, setEditId] = useState(null);

    // UI & Pagination State
    const [scannerOpen, setScannerOpen] = useState(false);
    const [logsExpanded, setLogsExpanded] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [offset, setOffset] = useState(0);
    const [hasMore, setHasMore] = useState(true);

    const LIMIT = 20;

    // Integración de escaneo por hardware (Zebra)
    useDataWedge(handleScan);

    const quantityRef = useRef(null);

    const loadLogs = async (reset = false) => {
        if (logsLoading || (!hasMore && !reset)) return;

        setLogsLoading(true);
        const newOffset = reset ? 0 : offset;

        try {
            const res = await client.get(`/api/get_logs?limit=${LIMIT}&offset=${newOffset}`);
            const newLogs = res.data;

            if (reset) {
                setLogs(newLogs);
            } else {
                setLogs(prev => [...prev, ...newLogs]);
            }

            setOffset(newOffset + LIMIT);
            setHasMore(newLogs.length === LIMIT);
        } catch (e) {
            console.error('Error loading logs:', e);
        } finally {
            setLogsLoading(false);
        }
    };

    const toggleLogs = () => {
        const nextState = !logsExpanded;
        setLogsExpanded(nextState);
        if (nextState && logs.length === 0) {
            loadLogs(true);
        }
    };

    const findItem = async (code = itemCode) => {
        if (!code || !importRef) {
            Vibration.vibrate([0, 100, 50, 100]);
            Alert.alert('Faltan Datos', 'Ingrese Import Reference e Item Code');
            return;
        }

        setLoading(true);
        try {
            const res = await client.get(`/api/find_item/${encodeURIComponent(code)}/${encodeURIComponent(importRef)}`);
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
        } catch (e) {
            Vibration.vibrate([0, 200, 100, 200]);
            Alert.alert('✗ Error', 'Ítem no encontrado en esta referencia.');
            setItemData(null);
        } finally {
            setLoading(false);
        }
    };

    const handleScan = useCallback((code) => {
        setScannerOpen(false);
        const upperCode = code.trim().toUpperCase();
        setItemCode(upperCode);
        if (importRef) {
            findItem(upperCode);
        }
    }, [importRef]);

    const handleSaveLog = async () => {
        if (!itemData) return;
        if (!quantity || parseInt(quantity) < 1) {
            Alert.alert('Error', 'Ingrese una cantidad válida');
            return;
        }

        setSaving(true);
        try {
            if (editId) {
                await client.put(`/api/update_log/${editId}`, {
                    waybill: waybill.toUpperCase(),
                    qtyReceived: parseInt(quantity),
                    relocatedBin: relocatedBin.toUpperCase()
                });
            } else {
                await client.post('/api/add_log', {
                    importReference: importRef.toUpperCase(),
                    waybill: waybill.toUpperCase(),
                    itemCode: itemData.itemCode,
                    quantity: parseInt(quantity),
                    relocatedBin: relocatedBin.toUpperCase()
                });
            }
            Vibration.vibrate(100);
            loadLogs(true);
            resetForm();
            Alert.alert('Éxito', editId ? 'Registro actualizado' : 'Registro añadido');
        } catch (e) {
            Vibration.vibrate([0, 200, 100, 200]);
            Alert.alert('Error', 'No se pudo guardar el registro');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
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
                    } catch (e) {
                        Alert.alert('Error', 'No se pudo eliminar');
                    }
                }
            }
        ]);
    };

    const startEdit = async (log) => {
        setEditId(log.id);
        setImportRef(log.importReference);
        setWaybill(log.waybill);
        setItemCode(log.itemCode);
        setQuantity(String(log.qtyReceived));
        setRelocatedBin(log.relocatedBin || '');
        
        try {
            const res = await client.get(`/api/find_item/${encodeURIComponent(log.itemCode)}/${encodeURIComponent(log.importReference)}`);
            setItemData(res.data);
            Vibration.vibrate(50);
        } catch (e) { console.error(e); }
    };

    const resetForm = () => {
        setEditId(null);
        setItemCode('');
        setQuantity('');
        setRelocatedBin('');
        setItemData(null);
    };

    const diff = itemData ? (parseInt(quantity || 0) - (itemData.defaultQtyGrn || 0)) : 0;

    const renderLog = ({ item }) => {
        const logDiff = item.difference || 0;
        return (
            <View style={styles.logCard}>
                <View style={styles.logHeader}>
                    <View style={styles.logInfo}>
                        <Text style={styles.logItemCode}>{item.itemCode}</Text>
                        <Text style={styles.logDescription} numberOfLines={1}>{item.itemDescription}</Text>
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
                    <View style={styles.logDetail}><Text style={styles.logLabel}>REF</Text><Text style={styles.logValue}>{item.importReference}</Text></View>
                    <View style={styles.logDetail}><Text style={styles.logLabel}>WB</Text><Text style={styles.logValue}>{item.waybill}</Text></View>
                    <View style={styles.logDetail}><Text style={styles.logLabel}>BIN</Text><Text style={styles.logValue}>{item.relocatedBin || item.binLocation}</Text></View>
                    <View style={styles.logDetail}><Text style={styles.logLabel}>QTY</Text><Text style={styles.logValueBold}>{item.qtyReceived}</Text></View>
                    <View style={styles.logDetail}>
                        <Text style={styles.logLabel}>DIF</Text>
                        <Text style={[styles.logValueBold, logDiff < 0 && styles.diffNegative, logDiff > 0 && styles.diffPositive]}>
                            {logDiff > 0 ? `+${diff}` : logDiff}
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}><Text style={styles.backText}>← Regresar</Text></TouchableOpacity>
                    <Text style={styles.title}>Inbound - Recepción</Text>
                </View>

                <FlatList
                    data={logsExpanded ? logs : []}
                    renderItem={renderLog}
                    keyExtractor={item => item.id.toString()}
                    ListHeaderComponent={
                        <View style={styles.formCard}>
                            <View style={styles.row}>
                                <View style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={styles.inputLabel}>Import Reference</Text>
                                    <TextInput
                                        style={[styles.input, editId && styles.inputDisabled, styles.monoText]}
                                        value={importRef}
                                        onChangeText={t => setImportRef(t.toUpperCase())}
                                        placeholder="I.R."
                                        editable={!editId}
                                        keyboardType="numeric"
                                        blurOnSubmit={false}
                                    />
                                </View>
                                <View style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={styles.inputLabel}>Waybill</Text>
                                    <TextInput
                                        style={[styles.input, styles.monoText]}
                                        value={waybill}
                                        onChangeText={t => setWaybill(t.toUpperCase())}
                                        placeholder="W.B."
                                        blurOnSubmit={false}
                                    />
                                </View>
                            </View>

                            <View style={styles.inputGroup}>
                                <Text style={styles.inputLabel}>Item Code</Text>
                                <View style={styles.row}>
                                    <TextInput
                                        style={[styles.input, { flex: 1 }, editId && styles.inputDisabled, styles.monoText]}
                                        value={itemCode}
                                        onChangeText={t => setItemCode(t.toUpperCase())}
                                        placeholder="Escanear o escribir"
                                        editable={!editId}
                                        onSubmitEditing={() => findItem()}
                                        blurOnSubmit={false}
                                    />
                                    {!editId && (
                                        <>
                                            <TouchableOpacity style={styles.iconButton} onPress={() => setScannerOpen(true)}>
                                                <QrIcon size={24} color="#fff" />
                                            </TouchableOpacity>
                                            <TouchableOpacity style={[styles.iconButton, styles.searchButton]} onPress={() => findItem()} disabled={loading}>
                                                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Icon name="magnify" size={24} color="#fff" />}
                                            </TouchableOpacity>
                                        </>
                                    )}
                                </View>
                            </View>

                            {itemData && (
                                <View style={styles.itemDetails}>
                                    <View style={styles.row}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.itemDescription}>{itemData.description}</Text>
                                            <View style={styles.row}>
                                                <View style={styles.detailBox}><Text style={styles.detailLabel}>ABC</Text><Text style={styles.detailValue}>{itemData.itemType || 'N/A'}</Text></View>
                                                <View style={styles.detailBox}><Text style={styles.detailLabel}>Actual</Text><Text style={[styles.detailValue, styles.monoText]}>{itemData.binLocation || 'N/A'}</Text></View>
                                                <View style={styles.detailBox}><Text style={styles.detailLabel}>Qty GRN</Text><Text style={styles.detailValue}>{itemData.defaultQtyGrn || 0}</Text></View>
                                            </View>
                                        </View>
                                        
                                        {/* Sugerencia de Slotting */}
                                        {itemData.suggestedBin && (
                                            <TouchableOpacity 
                                                style={styles.suggestionBox}
                                                onPress={() => {
                                                    setRelocatedBin(itemData.suggestedBin);
                                                    Vibration.vibrate(50);
                                                }}
                                            >
                                                <Text style={styles.suggestionLabel}>Slotting</Text>
                                                <View style={styles.rowCentered}>
                                                    <Icon name="auto-fix" size={20} color="#16a34a" />
                                                    <Text style={[styles.suggestionValue, styles.monoText]}>
                                                        {itemData.suggestedBin}
                                                    </Text>
                                                </View>
                                                <Text style={styles.suggestionHint}>Tap para usar</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                </View>
                            )}

                            <View style={styles.row}>
                                <View style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={styles.inputLabel}>Qty Received</Text>
                                    <TextInput ref={quantityRef} style={styles.input} value={quantity} onChangeText={setQuantity} keyboardType="numeric" placeholder="0" blurOnSubmit={false} />
                                </View>
                                <View style={[styles.inputGroup, { flex: 1 }]}>
                                    <Text style={styles.inputLabel}>Relocate Bin (Opc.)</Text>
                                    <TextInput style={[styles.input, styles.monoText]} value={relocatedBin} onChangeText={t => setRelocatedBin(t.toUpperCase())} placeholder="Nuevo bin" blurOnSubmit={false} />
                                </View>
                            </View>

                            {itemData && (
                                <View style={styles.summaryBox}>
                                    <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Recibido</Text><Text style={styles.summaryValue}>{quantity || 0}</Text></View>
                                    <View style={styles.summaryItem}><Text style={styles.summaryLabel}>Esperado</Text><Text style={styles.summaryValue}>{itemData.defaultQtyGrn || 0}</Text></View>
                                    <View style={styles.summaryItem}>
                                        <Text style={styles.summaryLabel}>Diferencia</Text>
                                        <Text style={[styles.summaryValue, styles.summaryValueBold, diff < 0 && styles.diffNegative, diff > 0 && styles.diffPositive]}>
                                            {diff > 0 ? `+${diff}` : diff}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            <View style={styles.row}>
                                <TouchableOpacity style={[styles.saveButton, !itemData && styles.buttonDisabled]} onPress={handleSaveLog} disabled={saving || !itemData}>
                                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveButtonText}>{editId ? 'Guardar Cambios' : 'Añadir Registro'}</Text>}
                                </TouchableOpacity>
                                {editId && <TouchableOpacity style={styles.cancelButton} onPress={resetForm}><Text style={styles.cancelButtonText}>Cancelar</Text></TouchableOpacity>}
                            </View>

                            <View style={styles.divider} />
                            
                            <TouchableOpacity style={styles.logsToggle} onPress={toggleLogs}>
                                <View style={styles.rowCentered}>
                                    <Icon name={logsExpanded ? "chevron-down" : "chevron-right"} size={24} color="#333" />
                                    <Text style={styles.logsSectionTitle}>Últimos Registros {logs.length > 0 ? `(${logs.length})` : ''}</Text>
                                </View>
                                {logsExpanded && (
                                    <TouchableOpacity onPress={() => loadLogs(true)}>
                                        <Icon name="refresh" size={20} color="#0854a0" />
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>
                        </View>
                    }
                    onEndReached={() => logsExpanded && hasMore && loadLogs()}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={logsLoading && logsExpanded ? <ActivityIndicator style={{ margin: 20 }} color="#0854a0" /> : null}
                    contentContainerStyle={styles.listContent}
                    keyboardShouldPersistTaps="handled"
                />
            </KeyboardAvoidingView>
            <ScannerModal visible={scannerOpen} onScan={handleScan} onClose={() => setScannerOpen(false)} />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8f9fa' },
    flex: { flex: 1 },
    header: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
    backButton: { paddingVertical: 10, paddingRight: 20, marginBottom: 8 },
    backText: { color: '#0854a0', fontSize: 16, fontWeight: '600' },
    title: { fontSize: 24, fontWeight: 'bold', color: '#2c3e50' },
    listContent: { paddingBottom: 40 },
    formCard: { backgroundColor: '#fff', margin: 12, padding: 16, borderRadius: 12, elevation: 3 },
    row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
    rowCentered: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    inputGroup: { marginBottom: 12 },
    inputLabel: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 6 },
    input: { backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 16, fontSize: 16, color: '#000' },
    inputDisabled: { backgroundColor: '#e9ecef', color: '#6c757d' },
    monoText: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    iconButton: { backgroundColor: '#354a5f', width: 56, height: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    searchButton: { backgroundColor: '#0854a0' },
    itemDetails: { backgroundColor: '#e8f4fc', padding: 12, borderRadius: 8, marginBottom: 12, borderWidth: 1, borderColor: '#cce4f6' },
    itemDescription: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 10, flexShrink: 1 },
    suggestionBox: {
        backgroundColor: '#f0fdf4',
        padding: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#bbf7d0',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: 100,
    },
    suggestionLabel: { fontSize: 10, fontWeight: 'bold', color: '#16a34a', textTransform: 'uppercase', marginBottom: 2 },
    suggestionValue: { fontSize: 16, fontWeight: 'bold', color: '#111' },
    suggestionHint: { fontSize: 8, color: '#16a34a', marginTop: 2, fontStyle: 'italic' },
    detailBox: { flex: 1 },
    detailLabel: { fontSize: 10, color: '#666', textTransform: 'uppercase' },
    detailValue: { fontSize: 14, fontWeight: '600', color: '#333' },
    summaryBox: { flexDirection: 'row', backgroundColor: '#f8f9fa', padding: 12, borderRadius: 8, marginBottom: 16, borderWidth: 1, borderColor: '#e0e0e0' },
    summaryItem: { flex: 1, alignItems: 'center' },
    summaryLabel: { fontSize: 10, color: '#666', textTransform: 'uppercase', marginBottom: 4 },
    summaryValue: { fontSize: 20, fontWeight: 'bold', color: '#333' },
    summaryValueBold: { fontWeight: 'bold' },
    diffNegative: { color: '#dc2626' },
    diffPositive: { color: '#2563eb' },
    saveButton: { flex: 1, backgroundColor: '#16a34a', padding: 18, borderRadius: 8, alignItems: 'center' },
    buttonDisabled: { backgroundColor: '#9ca3af' },
    saveButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
    cancelButton: { backgroundColor: '#f0f0f0', padding: 18, borderRadius: 8, alignItems: 'center', paddingHorizontal: 24, marginLeft: 8 },
    cancelButtonText: { color: '#666', fontSize: 16, fontWeight: '600' },
    divider: { height: 1, backgroundColor: '#eee', marginVertical: 16 },
    logsToggle: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    logsSectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#333' },
    logCard: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginHorizontal: 12, marginBottom: 8, borderWidth: 1, borderColor: '#e0e0e0', elevation: 1 },
    logHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    logItemCode: { fontSize: 14, fontWeight: 'bold', color: '#0854a0', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    logDescription: { fontSize: 11, color: '#666' },
    logActions: { flexDirection: 'row', gap: 12 },
    actionButton: { padding: 8, backgroundColor: '#f8fafc', borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' },
    logDetails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
    logDetail: { minWidth: 50 },
    logLabel: { fontSize: 9, color: '#888' },
    logValue: { fontSize: 12, color: '#333', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    logValueBold: { fontSize: 12, fontWeight: 'bold', color: '#333' },
});

export default InboundScreen;
