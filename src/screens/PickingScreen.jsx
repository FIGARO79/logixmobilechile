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
    Modal,
    KeyboardAvoidingView,
    Platform,
    Vibration
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

const PickingScreen = ({ navigation }) => {
    // Load Order State
    const [orderNumber, setOrderNumber] = useState('');
    const [despatchNumber, setDespatchNumber] = useState('');
    const [loadingOrder, setLoadingOrder] = useState(false);
    const [recentOrders, setRecentOrders] = useState([]);

    // Active Audit State
    const [auditActive, setAuditActive] = useState(false);
    const [customerName, setCustomerName] = useState('');
    const [orderItems, setOrderItems] = useState([]);

    // Scanning & Modals
    const [scannerOpen, setScannerOpen] = useState(false);
    const [showPackagesModal, setShowPackagesModal] = useState(false);
    const [showDiffModal, setShowDiffModal] = useState(false);
    const [packagesCount, setPackagesCount] = useState('');
    const [saving, setSaving] = useState(false);

    const itemInputRef = useRef(null);

    // Load recent orders on mount
    useEffect(() => {
        loadRecentOrders();
    }, []);

    const loadRecentOrders = async () => {
        try {
            const res = await client.get('/api/picking/tracking');
            setRecentOrders(res.data);
        } catch (e) {
            console.error('Error loading recent orders:', e);
        }
    };

    const handleLoadOrder = async () => {
        if (!orderNumber || !despatchNumber) {
            Alert.alert('Error', 'Ingrese Order y Despatch Number');
            return;
        }

        setLoadingOrder(true);
        try {
            const res = await client.get(`/api/picking/order/${orderNumber}/${despatchNumber}`);
            const data = res.data;

            if (data && data.length > 0) {
                setCustomerName(data[0]['Customer Name'] || '');
                const items = data.map(row => ({
                    code: row['Item Code'],
                    description: row['Item Description'],
                    order_line: row['Order Line'],
                    qty_req: parseInt(row['Qty'] || 0),
                    qty_scan: 0,
                    difference: 0
                }));
                setOrderItems(items);
                setAuditActive(true);
            } else {
                Alert.alert('Error', 'Pedido vacío o no encontrado');
            }
        } catch (err) {
            console.error('Error loading order:', err);
            Alert.alert('Error', 'Pedido no encontrado');
        } finally {
            setLoadingOrder(false);
        }
    };

    const handleReset = () => {
        setAuditActive(false);
        setOrderItems([]);
        setOrderNumber('');
        setDespatchNumber('');
        setCustomerName('');
        setPackagesCount('');
        loadRecentOrders();
    };

    const handleScan = (code) => {
        setScannerOpen(false);
        const cleanCode = code.trim().toUpperCase();
        if (!cleanCode) return;

        // Find item - prioritize incomplete items
        let itemIndex = orderItems.findIndex(i => i.code === cleanCode && i.qty_scan < i.qty_req);
        if (itemIndex === -1) {
            itemIndex = orderItems.findIndex(i => i.code === cleanCode);
        }

        if (itemIndex > -1) {
            const newItems = [...orderItems];
            const item = newItems[itemIndex];
            item.qty_scan += 1;
            item.difference = item.qty_scan - item.qty_req;
            setOrderItems(newItems);

            if (item.qty_scan <= item.qty_req) {
                // Success feedback
                Vibration.vibrate(50);
                Alert.alert('✓ Leído', item.code);
            } else {
                // Over-scan warning
                Vibration.vibrate([0, 100, 50, 100]);
                Alert.alert('⚠️ Exceso', `${item.code} - Cantidad excedida`);
            }
        } else {
            // Item not in order
            Vibration.vibrate([0, 200, 100, 200]);
            Alert.alert('✗ No encontrado', `Item NO pertenece al pedido: ${cleanCode}`);
        }
    };

    const handleFinalize = () => {
        const hasDifferences = orderItems.some(i => i.qty_scan !== i.qty_req);
        if (hasDifferences) {
            setShowDiffModal(true);
        } else {
            setShowPackagesModal(true);
        }
    };

    const handleContinueWithDiff = () => {
        setShowDiffModal(false);
        setShowPackagesModal(true);
    };

    const submitAudit = async () => {
        setSaving(true);
        try {
            const payload = {
                order_number: orderNumber,
                despatch_number: despatchNumber,
                customer_name: customerName,
                status: orderItems.some(i => i.qty_scan !== i.qty_req) ? 'Con Diferencia' : 'Completo',
                items: orderItems.map(i => ({
                    code: i.code,
                    description: i.description,
                    order_line: i.order_line,
                    qty_req: i.qty_req,
                    qty_scan: i.qty_scan
                })),
                packages: parseInt(packagesCount || 0),
                packages_assignment: {}
            };

            await client.post('/api/save_picking_audit', payload);
            Alert.alert('Éxito', 'Auditoría guardada correctamente');
            setShowPackagesModal(false);
            handleReset();
        } catch (err) {
            console.error('Error saving audit:', err);
            Alert.alert('Error', 'No se pudo guardar la auditoría');
        } finally {
            setSaving(false);
        }
    };

    const getItemStyle = (item) => {
        if (item.qty_scan === item.qty_req && item.qty_scan > 0) {
            return styles.itemComplete;
        }
        if (item.qty_scan > item.qty_req) {
            return styles.itemOver;
        }
        return null;
    };

    const getDiffStyle = (diff) => {
        if (diff === 0) return styles.diffOk;
        return styles.diffBad;
    };

    const totalScanned = orderItems.reduce((acc, i) => acc + i.qty_scan, 0);
    const totalRequired = orderItems.reduce((acc, i) => acc + i.qty_req, 0);
    const itemsComplete = orderItems.filter(i => i.qty_scan === i.qty_req && i.qty_scan > 0).length;

    const renderItem = ({ item }) => (
        <View style={[styles.itemCard, getItemStyle(item)]}>
            <View style={styles.itemHeader}>
                <View style={styles.itemInfo}>
                    <Text style={styles.itemCode}>{item.code}</Text>
                    <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
                </View>
                <View style={[styles.diffBadge, getDiffStyle(item.difference)]}>
                    <Text style={styles.diffText}>
                        {item.difference > 0 ? `+${item.difference}` : item.difference === 0 && item.qty_scan > 0 ? 'OK' : item.difference}
                    </Text>
                </View>
            </View>
            <View style={styles.qtyRow}>
                <View style={styles.qtyBox}>
                    <Text style={styles.qtyLabel}>Requerido</Text>
                    <Text style={styles.qtyValue}>{item.qty_req}</Text>
                </View>
                <View style={styles.qtyBox}>
                    <Text style={styles.qtyLabel}>Escaneado</Text>
                    <Text style={[styles.qtyValue, styles.qtyScanned]}>{item.qty_scan}</Text>
                </View>
            </View>
        </View>
    );

    const renderRecentOrder = ({ item }) => (
        <TouchableOpacity
            style={styles.recentCard}
            onPress={() => {
                setOrderNumber(item.order_number);
                setDespatchNumber(item.despatch_number);
            }}
        >
            <View style={styles.recentHeader}>
                <Text style={styles.recentOrderNum}>{item.order_number}</Text>
                <View style={styles.recentDespatch}>
                    <Text style={styles.recentDespatchText}>{item.despatch_number}</Text>
                </View>
                <View style={styles.recentLinesBadge}>
                    <Text style={styles.recentLinesText}>{item.total_lines} líneas</Text>
                </View>
            </View>
            <Text style={styles.recentCustomer} numberOfLines={1}>{item.customer_name}</Text>
            <Text style={styles.recentDate}>{item.print_date}</Text>
        </TouchableOpacity>
    );

    // Active Audit View
    if (auditActive) {
        return (
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.flex}
                >
                    {/* Header */}
                    <View style={styles.auditHeader}>
                        <View style={styles.auditInfo}>
                            <Text style={styles.auditTitle}>Auditoría en Curso</Text>
                            <Text style={styles.auditOrder}>
                                Orden: <Text style={styles.auditOrderNum}>{orderNumber} / {despatchNumber}</Text>
                            </Text>
                            <Text style={styles.auditCustomer}>Cliente: {customerName}</Text>
                        </View>
                        <TouchableOpacity onPress={handleReset} style={styles.cancelButton}>
                            <Text style={styles.cancelButtonText}>Cancelar</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Scanner Button */}
                    <View style={styles.scanSection}>
                        <TouchableOpacity
                            style={styles.bigScanButton}
                            onPress={() => setScannerOpen(true)}
                        >
                            <QrIcon size={28} color="#fff" />
                            <Text style={styles.bigScanText}>Escanear Item</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Progress */}
                    <View style={styles.progressBar}>
                        <Text style={styles.progressText}>
                            Items: {itemsComplete}/{orderItems.length} |
                            Unidades: {totalScanned}/{totalRequired}
                        </Text>
                    </View>

                    {/* Items List */}
                    <FlatList
                        data={orderItems}
                        renderItem={renderItem}
                        keyExtractor={(item, index) => `${item.code}-${index}`}
                        contentContainerStyle={styles.listContent}
                    />

                    {/* Footer */}
                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.finalizeButton}
                            onPress={handleFinalize}
                        >
                            <Text style={styles.finalizeButtonText}>Finalizar Auditoría</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>

                {/* Scanner Modal */}
                <ScannerModal
                    visible={scannerOpen}
                    onScan={handleScan}
                    onClose={() => setScannerOpen(false)}
                />

                {/* Differences Alert Modal */}
                <Modal visible={showDiffModal} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>⚠️ Diferencias Detectadas</Text>
                            <Text style={styles.modalText}>
                                Hay ítems con diferencias. ¿Desea finalizar de todas formas?
                            </Text>
                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonSecondary]}
                                    onPress={() => setShowDiffModal(false)}
                                >
                                    <Text style={styles.modalButtonTextSecondary}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonWarning]}
                                    onPress={handleContinueWithDiff}
                                >
                                    <Text style={styles.modalButtonTextPrimary}>Sí, Continuar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Packages Modal */}
                <Modal visible={showPackagesModal} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>📦 Cantidad de Bultos</Text>
                            <Text style={styles.modalText}>Ingrese el total de paquetes:</Text>
                            <TextInput
                                style={styles.packagesInput}
                                value={packagesCount}
                                onChangeText={setPackagesCount}
                                keyboardType="numeric"
                                placeholder="0"
                                autoFocus
                            />
                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonSecondary]}
                                    onPress={() => setShowPackagesModal(false)}
                                >
                                    <Text style={styles.modalButtonTextSecondary}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonPrimary]}
                                    onPress={submitAudit}
                                    disabled={saving}
                                >
                                    {saving ? (
                                        <ActivityIndicator color="#fff" size="small" />
                                    ) : (
                                        <Text style={styles.modalButtonTextPrimary}>Guardar</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
        );
    }

    // Load Order View
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
                    <Text style={styles.title}>Auditoría de Picking</Text>
                </View>

                {/* Load Order Form */}
                <View style={styles.formCard}>
                    <View style={styles.inputRow}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Order Number</Text>
                            <TextInput
                                style={styles.input}
                                value={orderNumber}
                                onChangeText={setOrderNumber}
                                placeholder="Ej: 0043785"
                                autoCapitalize="characters"
                            />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Despatch</Text>
                            <TextInput
                                style={styles.input}
                                value={despatchNumber}
                                onChangeText={setDespatchNumber}
                                placeholder="Ej: 00"
                                autoCapitalize="characters"
                            />
                        </View>
                    </View>

                    <TouchableOpacity
                        style={styles.loadButton}
                        onPress={handleLoadOrder}
                        disabled={loadingOrder}
                    >
                        {loadingOrder ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.loadButtonText}>Comenzar Auditoría</Text>
                        )}
                    </TouchableOpacity>
                </View>

                {/* Recent Orders */}
                <View style={styles.recentSection}>
                    <View style={styles.recentHeader}>
                        <Text style={styles.recentTitle}>Pedidos Recientes</Text>
                        <TouchableOpacity onPress={loadRecentOrders}>
                            <Text style={styles.refreshText}>Actualizar</Text>
                        </TouchableOpacity>
                    </View>

                    <FlatList
                        data={recentOrders}
                        renderItem={renderRecentOrder}
                        keyExtractor={(item, index) => `${item.order_number}-${index}`}
                        contentContainerStyle={styles.recentList}
                        ListEmptyComponent={
                            <Text style={styles.emptyText}>No hay pedidos recientes</Text>
                        }
                    />
                </View>
            </KeyboardAvoidingView>
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
    inputRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
    },
    inputGroup: {
        flex: 1,
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
    loadButton: {
        backgroundColor: '#0854a0',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    loadButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    recentSection: {
        flex: 1,
        paddingHorizontal: 12,
    },
    recentTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    refreshText: {
        color: '#0854a0',
        fontSize: 14,
    },
    recentList: {
        paddingBottom: 20,
    },
    recentCard: {
        backgroundColor: '#e8f4fc',
        padding: 14,
        borderRadius: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#cce4f6',
    },
    recentHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 6,
        justifyContent: 'space-between',
    },
    recentOrderNum: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#0854a0',
    },
    recentDespatch: {
        backgroundColor: '#fff',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginLeft: 8,
    },
    recentDespatchText: {
        fontSize: 12,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
        color: '#666',
    },
    recentLinesBadge: {
        backgroundColor: '#0854a0',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    recentLinesText: {
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
    },
    recentCustomer: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
        marginBottom: 4,
    },
    recentDate: {
        fontSize: 11,
        color: '#888',
        textAlign: 'right',
    },
    emptyText: {
        textAlign: 'center',
        color: '#888',
        padding: 20,
    },
    // Audit View Styles
    auditHeader: {
        backgroundColor: '#fff',
        padding: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    auditInfo: {
        flex: 1,
    },
    auditTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2c3e50',
        marginBottom: 4,
    },
    auditOrder: {
        fontSize: 14,
        color: '#666',
    },
    auditOrderNum: {
        fontWeight: 'bold',
        color: '#333',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    auditCustomer: {
        fontSize: 14,
        color: '#666',
    },
    cancelButton: {
        backgroundColor: '#f0f0f0',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
    },
    cancelButtonText: {
        color: '#666',
        fontSize: 12,
    },
    scanSection: {
        padding: 12,
    },
    bigScanButton: {
        backgroundColor: '#354a5f',
        padding: 20,
        borderRadius: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
    },
    bigScanText: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
    },
    progressBar: {
        backgroundColor: '#e8f4fc',
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderTopWidth: 1,
        borderBottomWidth: 1,
        borderColor: '#cce4f6',
    },
    progressText: {
        fontSize: 13,
        color: '#0854a0',
        fontWeight: '600',
        textAlign: 'center',
    },
    listContent: {
        padding: 12,
        paddingBottom: 100,
    },
    itemCard: {
        backgroundColor: '#fff',
        borderRadius: 10,
        padding: 14,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    itemComplete: {
        backgroundColor: '#f0fdf4',
        borderColor: '#86efac',
    },
    itemOver: {
        backgroundColor: '#fef2f2',
        borderColor: '#fca5a5',
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    itemInfo: {
        flex: 1,
        marginRight: 10,
    },
    itemCode: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#0854a0',
    },
    itemDesc: {
        fontSize: 12,
        color: '#666',
        marginTop: 2,
    },
    diffBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    diffOk: {
        backgroundColor: '#dcfce7',
    },
    diffBad: {
        backgroundColor: '#fee2e2',
    },
    diffText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#333',
    },
    qtyRow: {
        flexDirection: 'row',
        gap: 16,
    },
    qtyBox: {
        flex: 1,
    },
    qtyLabel: {
        fontSize: 10,
        color: '#888',
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    qtyValue: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#333',
    },
    qtyScanned: {
        color: '#0854a0',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        padding: 16,
    },
    finalizeButton: {
        backgroundColor: '#16a34a',
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
    },
    finalizeButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    // Modals
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        maxWidth: 340,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
        marginBottom: 12,
        textAlign: 'center',
    },
    modalText: {
        fontSize: 14,
        color: '#666',
        marginBottom: 16,
        textAlign: 'center',
    },
    packagesInput: {
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 16,
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 12,
    },
    modalButton: {
        flex: 1,
        padding: 14,
        borderRadius: 8,
        alignItems: 'center',
    },
    modalButtonSecondary: {
        backgroundColor: '#f0f0f0',
    },
    modalButtonPrimary: {
        backgroundColor: '#0854a0',
    },
    modalButtonWarning: {
        backgroundColor: '#f59e0b',
    },
    modalButtonTextSecondary: {
        color: '#666',
        fontWeight: '600',
    },
    modalButtonTextPrimary: {
        color: '#fff',
        fontWeight: 'bold',
    },
});

export default PickingScreen;
