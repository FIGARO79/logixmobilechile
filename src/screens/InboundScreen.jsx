import React, { useState, useEffect, useRef } from 'react';
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
    ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import client from '../api/client';
import ScannerModal from '../components/ScannerModal';

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

    // UI State
    const [scannerOpen, setScannerOpen] = useState(false);
    const [logsExpanded, setLogsExpanded] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);

    // Refs
    const quantityRef = useRef(null);

    // Load logs on demand when expanded
    useEffect(() => {
        if (logsExpanded && logs.length === 0) {
            loadLogs();
        }
    }, [logsExpanded]);

    const loadLogs = async () => {
        setLogsLoading(true);
        try {
            // Limit to 20 most recent logs for performance
            const res = await client.get('/api/get_logs?limit=20');
            setLogs(res.data);
        } catch (e) {
            console.error('Error loading logs:', e);
        } finally {
            setLogsLoading(false);
        }
    };

    const findItem = async (code = itemCode) => {
        if (!code || !importRef) {
            Alert.alert('Error', 'Ingrese Import Reference e Item Code');
            return;
        }

        setLoading(true);
        try {
            const res = await client.get(`/api/find_item/${encodeURIComponent(code)}/${encodeURIComponent(importRef)}`);
            const data = res.data;

            if (data.error) {
                Alert.alert('Error', data.error);
                setItemData(null);
            } else {
                setItemData(data);
                if (!editId) setQuantity('');
                setTimeout(() => quantityRef.current?.focus(), 300);
            }
        } catch (e) {
            Alert.alert('Error', 'Item no encontrado');
            setItemData(null);
        } finally {
            setLoading(false);
        }
    };

    const handleScan = (code) => {
        setScannerOpen(false);
        const upperCode = code.toUpperCase();
        setItemCode(upperCode);
        if (importRef) {
            setTimeout(() => findItem(upperCode), 200);
        }
    };

    const handleSaveLog = async () => {
        if (!itemData) {
            Alert.alert('Error', 'Busque un item primero');
            return;
        }
        if (!quantity || parseInt(quantity) < 1) {
            Alert.alert('Error', 'Ingrese cantidad válida');
            return;
        }

        setSaving(true);
        try {
            if (editId) {
                // Update existing log
                await client.put(`/api/update_log/${editId}`, {
                    waybill: waybill.toUpperCase(),
                    qtyReceived: parseInt(quantity),
                    relocatedBin: relocatedBin.toUpperCase()
                });
                Alert.alert('Éxito', 'Registro actualizado');
            } else {
                // Add new log
                await client.post('/api/add_log', {
                    importReference: importRef.toUpperCase(),
                    waybill: waybill.toUpperCase(),
                    itemCode: itemData.itemCode,
                    quantity: parseInt(quantity),
                    relocatedBin: relocatedBin.toUpperCase()
                });
                Alert.alert('Éxito', 'Registro añadido');
            }
            loadLogs();
            resetForm();
        } catch (e) {
            const errorMsg = e.response?.data?.detail || 'Error al guardar';
            Alert.alert('Error', errorMsg);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = (id) => {
        Alert.alert(
            'Confirmar',
            '¿Eliminar registro?',
            [
                { text: 'Cancelar', style: 'cancel' },
                {
                    text: 'Eliminar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await client.delete(`/api/delete_log/${id}`);
                            loadLogs();
                        } catch (e) {
                            Alert.alert('Error', 'No se pudo eliminar');
                        }
                    }
                }
            ]
        );
    };

    const startEdit = async (log) => {
        setEditId(log.id);
        setImportRef(log.importReference);
        setWaybill(log.waybill);
        setItemCode(log.itemCode);
        setQuantity(String(log.qtyReceived));
        setRelocatedBin(log.relocatedBin || '');

        // Fetch item details
        try {
            const res = await client.get(`/api/find_item/${encodeURIComponent(log.itemCode)}/${encodeURIComponent(log.importReference)}`);
            setItemData(res.data);
        } catch (e) {
            console.error(e);
        }
    };

    const resetForm = () => {
        setEditId(null);
        setItemCode('');
        setQuantity('');
        setRelocatedBin('');
        setItemData(null);
        // Keep Import Ref and Waybill for UX convenience
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
                            <Text style={styles.actionText}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDelete(item.id)} style={styles.actionButton}>
                            <Text style={styles.actionText}>🗑️</Text>
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={styles.logDetails}>
                    <View style={styles.logDetail}>
                        <Text style={styles.logLabel}>Ref</Text>
                        <Text style={styles.logValue}>{item.importReference}</Text>
                    </View>
                    <View style={styles.logDetail}>
                        <Text style={styles.logLabel}>WB</Text>
                        <Text style={styles.logValue}>{item.waybill}</Text>
                    </View>
                    <View style={styles.logDetail}>
                        <Text style={styles.logLabel}>Bin</Text>
                        <Text style={styles.logValue}>{item.relocatedBin || item.binLocation}</Text>
                    </View>
                    <View style={styles.logDetail}>
                        <Text style={styles.logLabel}>Qty</Text>
                        <Text style={styles.logValueBold}>{item.qtyReceived}</Text>
                    </View>
                    <View style={styles.logDetail}>
                        <Text style={styles.logLabel}>Dif</Text>
                        <Text style={[
                            styles.logValueBold,
                            logDiff < 0 && styles.diffNegative,
                            logDiff > 0 && styles.diffPositive
                        ]}>
                            {logDiff > 0 ? `+${logDiff}` : logDiff}
                        </Text>
                    </View>
                </View>
            </View>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.flex}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Text style={styles.backText}>← Regresar</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Inbound - Recepción</Text>
                </View>

                <ScrollView style={styles.scrollView} keyboardShouldPersistTaps="handled">
                    {/* Form Card */}
                    <View style={styles.formCard}>
                        {/* Import Ref & Waybill */}
                        <View style={styles.row}>
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.inputLabel}>Import Reference</Text>
                                <TextInput
                                    style={[styles.input, editId && styles.inputDisabled]}
                                    value={importRef}
                                    onChangeText={t => setImportRef(t.toUpperCase())}
                                    placeholder="I.R."
                                    editable={!editId}
                                    autoCapitalize="characters"
                                />
                            </View>
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.inputLabel}>Waybill</Text>
                                <TextInput
                                    style={styles.input}
                                    value={waybill}
                                    onChangeText={t => setWaybill(t.toUpperCase())}
                                    placeholder="W.B."
                                    autoCapitalize="characters"
                                />
                            </View>
                        </View>

                        {/* Item Code */}
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Item Code</Text>
                            <View style={styles.row}>
                                <TextInput
                                    style={[styles.input, { flex: 1 }, editId && styles.inputDisabled]}
                                    value={itemCode}
                                    onChangeText={t => setItemCode(t.toUpperCase())}
                                    placeholder="Escanear o escribir"
                                    editable={!editId}
                                    autoCapitalize="characters"
                                    onSubmitEditing={() => findItem()}
                                />
                                {!editId && (
                                    <>
                                        <TouchableOpacity
                                            style={styles.iconButton}
                                            onPress={() => setScannerOpen(true)}
                                        >
                                            <QrIcon size={18} color="#fff" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[styles.iconButton, styles.searchButton]}
                                            onPress={() => findItem()}
                                            disabled={loading}
                                        >
                                            {loading ? (
                                                <ActivityIndicator color="#fff" size="small" />
                                            ) : (
                                                <Text style={styles.searchIcon}>🔍</Text>
                                            )}
                                        </TouchableOpacity>
                                    </>
                                )}
                            </View>
                        </View>

                        {/* Item Details */}
                        {itemData && (
                            <View style={styles.itemDetails}>
                                <Text style={styles.itemDescription}>{itemData.description}</Text>
                                <View style={styles.row}>
                                    <View style={styles.detailBox}>
                                        <Text style={styles.detailLabel}>Bin Original</Text>
                                        <Text style={styles.detailValue}>{itemData.binLocation || 'N/A'}</Text>
                                    </View>
                                    <View style={styles.detailBox}>
                                        <Text style={styles.detailLabel}>ABC</Text>
                                        <Text style={styles.detailValue}>{itemData.itemType || 'N/A'}</Text>
                                    </View>
                                    <View style={styles.detailBox}>
                                        <Text style={styles.detailLabel}>Qty GRN</Text>
                                        <Text style={styles.detailValue}>{itemData.defaultQtyGrn || 0}</Text>
                                    </View>
                                </View>
                            </View>
                        )}

                        {/* Quantity & Bin */}
                        <View style={styles.row}>
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.inputLabel}>Qty Received</Text>
                                <TextInput
                                    ref={quantityRef}
                                    style={styles.input}
                                    value={quantity}
                                    onChangeText={setQuantity}
                                    keyboardType="numeric"
                                    placeholder="0"
                                />
                            </View>
                            <View style={[styles.inputGroup, { flex: 1 }]}>
                                <Text style={styles.inputLabel}>Relocate Bin (Opc.)</Text>
                                <TextInput
                                    style={styles.input}
                                    value={relocatedBin}
                                    onChangeText={t => setRelocatedBin(t.toUpperCase())}
                                    placeholder="Nuevo bin"
                                    autoCapitalize="characters"
                                />
                            </View>
                        </View>

                        {/* Quantity Summary */}
                        {itemData && (
                            <View style={styles.summaryBox}>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryLabel}>Recibido</Text>
                                    <Text style={styles.summaryValue}>{quantity || 0}</Text>
                                </View>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryLabel}>Esperado</Text>
                                    <Text style={styles.summaryValue}>{itemData.defaultQtyGrn || 0}</Text>
                                </View>
                                <View style={styles.summaryItem}>
                                    <Text style={styles.summaryLabel}>Diferencia</Text>
                                    <Text style={[
                                        styles.summaryValue,
                                        styles.summaryValueBold,
                                        diff < 0 && styles.diffNegative,
                                        diff > 0 && styles.diffPositive
                                    ]}>
                                        {diff > 0 ? `+${diff}` : diff}
                                    </Text>
                                </View>
                            </View>
                        )}

                        {/* Action Buttons */}
                        <View style={styles.row}>
                            <TouchableOpacity
                                style={[styles.saveButton, !itemData && styles.buttonDisabled]}
                                onPress={handleSaveLog}
                                disabled={saving || !itemData}
                            >
                                {saving ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.saveButtonText}>
                                        {editId ? 'Guardar Cambios' : 'Añadir Registro'}
                                    </Text>
                                )}
                            </TouchableOpacity>
                            {editId && (
                                <TouchableOpacity
                                    style={styles.cancelButton}
                                    onPress={resetForm}
                                >
                                    <Text style={styles.cancelButtonText}>Cancelar</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>

                    {/* Logs Section - Collapsible */}
                    <View style={styles.logsSection}>
                        <TouchableOpacity
                            style={styles.logsSectionHeader}
                            onPress={() => setLogsExpanded(!logsExpanded)}
                        >
                            <Text style={styles.logsSectionTitle}>
                                {logsExpanded ? '▼' : '▶'} Registros {logs.length > 0 ? `(${logs.length})` : ''}
                            </Text>
                            <TouchableOpacity onPress={loadLogs}>
                                <Text style={styles.refreshText}>Actualizar</Text>
                            </TouchableOpacity>
                        </TouchableOpacity>

                        {logsExpanded && (
                            <>
                                {logsLoading ? (
                                    <View style={styles.loadingLogs}>
                                        <ActivityIndicator size="small" color="#0854a0" />
                                        <Text style={styles.loadingText}>Cargando...</Text>
                                    </View>
                                ) : logs.length === 0 ? (
                                    <Text style={styles.emptyText}>No hay registros</Text>
                                ) : (
                                    logs.map((log) => (
                                        <View key={log.id}>
                                            {renderLog({ item: log })}
                                        </View>
                                    ))
                                )}
                            </>
                        )}
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            {/* Scanner Modal */}
            <ScannerModal
                visible={scannerOpen}
                onScan={handleScan}
                onClose={() => setScannerOpen(false)}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    flex: {
        flex: 1,
    },
    header: {
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    backButton: {
        marginBottom: 8,
    },
    backText: {
        color: '#0854a0',
        fontSize: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    scrollView: {
        flex: 1,
    },
    formCard: {
        backgroundColor: '#fff',
        margin: 12,
        padding: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    row: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 12,
    },
    inputGroup: {
        marginBottom: 12,
    },
    inputLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#666',
        marginBottom: 6,
    },
    input: {
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
    },
    inputDisabled: {
        backgroundColor: '#e9ecef',
        color: '#6c757d',
    },
    iconButton: {
        backgroundColor: '#354a5f',
        width: 46,
        height: 46,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchButton: {
        backgroundColor: '#0854a0',
    },
    searchIcon: {
        fontSize: 18,
    },
    itemDetails: {
        backgroundColor: '#e8f4fc',
        padding: 12,
        borderRadius: 8,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: '#cce4f6',
    },
    itemDescription: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
        marginBottom: 10,
    },
    detailBox: {
        flex: 1,
    },
    detailLabel: {
        fontSize: 10,
        color: '#666',
        textTransform: 'uppercase',
    },
    detailValue: {
        fontSize: 14,
        fontWeight: '600',
        color: '#333',
    },
    summaryBox: {
        flexDirection: 'row',
        backgroundColor: '#f8f9fa',
        padding: 12,
        borderRadius: 8,
        marginBottom: 16,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    summaryItem: {
        flex: 1,
        alignItems: 'center',
    },
    summaryLabel: {
        fontSize: 10,
        color: '#666',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    summaryValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    summaryValueBold: {
        fontWeight: 'bold',
    },
    diffNegative: {
        color: '#dc2626',
    },
    diffPositive: {
        color: '#2563eb',
    },
    saveButton: {
        flex: 1,
        backgroundColor: '#0854a0',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    buttonDisabled: {
        backgroundColor: '#9ca3af',
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    cancelButton: {
        backgroundColor: '#f0f0f0',
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    cancelButtonText: {
        color: '#666',
        fontSize: 16,
        fontWeight: '600',
    },
    logsSection: {
        paddingHorizontal: 12,
        paddingBottom: 40,
    },
    logsSectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    logsSectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    refreshText: {
        color: '#0854a0',
        fontSize: 14,
    },
    emptyText: {
        textAlign: 'center',
        color: '#888',
        padding: 20,
    },
    loadingLogs: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        gap: 8,
    },
    loadingText: {
        color: '#666',
        fontSize: 14,
    },
    logCard: {
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 12,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    logHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 8,
    },
    logInfo: {
        flex: 1,
    },
    logItemCode: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0854a0',
    },
    logDescription: {
        fontSize: 11,
        color: '#666',
    },
    logActions: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        padding: 4,
    },
    actionText: {
        fontSize: 16,
    },
    logDetails: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    logDetail: {
        minWidth: 50,
    },
    logLabel: {
        fontSize: 9,
        color: '#888',
        textTransform: 'uppercase',
    },
    logValue: {
        fontSize: 12,
        color: '#333',
    },
    logValueBold: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#333',
    },
});

export default InboundScreen;
