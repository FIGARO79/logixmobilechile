import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
    Vibration,
    FlatList,
    Dimensions,
    Platform,
    TextInput
} from 'react-native';
import {
    Camera,
    useCameraDevice,
    useCodeScanner,
    useCameraPermission,
    useCameraFormat
} from 'react-native-vision-camera';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const AuditScannerModal = ({ visible, orderItems, onScan, onManualQty, onClose, currentPackage }) => {
    const { hasPermission, requestPermission } = useCameraPermission();
    const [isFlashOn, setIsFlashOn] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [scannedHistory, setScannedHistory] = useState([]);

    // Estados para edición de cantidad
    const [editingItem, setEditingItem] = useState(null);
    const [manualQty, setManualQty] = useState('');
    const [showQtyInput, setShowQtyInput] = useState(false);

    const cameraRef = useRef(null);
    const lastScanTime = useRef(0);

    const device = useCameraDevice('back');
    const format = useCameraFormat(device, [
        { videoResolution: { width: 1280, height: 720 } },
        { fps: 30 }
    ]);

    useEffect(() => {
        let timeout;
        if (visible) {
            if (!hasPermission) requestPermission();
            timeout = setTimeout(() => setIsActive(true), 500);
            setScannedHistory([]);
        } else {
            setIsActive(false);
            setIsFlashOn(false);
        }
        return () => clearTimeout(timeout);
    }, [visible, hasPermission, requestPermission]);

    const codeScanner = useCodeScanner({
        codeTypes: ['code-128', 'ean-13', 'qr', 'code-39', 'upc-a'],
        onCodeScanned: (codes) => {
            const now = Date.now();
            if (now - lastScanTime.current < 1500) return;

            if (codes.length > 0 && codes[0].value) {
                const code = codes[0].value.trim().toUpperCase();
                lastScanTime.current = now;

                Vibration.vibrate(100);

                const item = orderItems.find(i => i.code === code);

                if (item) {
                    setScannedHistory(prev => {
                        const filtered = prev.filter(h => h.code !== code);
                        const newScan = {
                            id: now.toString(),
                            code,
                            description: item.description,
                            timestamp: new Date().toLocaleTimeString()
                        };
                        return [newScan, ...filtered];
                    });
                }

                onScan(code);
            }
        },
    });

    const handleOpenEdit = (item) => {
        setEditingItem(item);
        setManualQty('');
        setShowQtyInput(true);
    };

    const handleConfirmQty = () => {
        const qty = parseInt(manualQty);
        if (!isNaN(qty) && qty >= 0) {
            onManualQty(editingItem.code, qty);
            Vibration.vibrate(50);
        }
        setShowQtyInput(false);
        setEditingItem(null);
    };

    const renderScannedItem = ({ item }) => {
        const totalQtyScan = orderItems
            .filter(i => i.code === item.code)
            .reduce((sum, i) => sum + i.qty_scan, 0);
        const totalQtyReq = orderItems
            .filter(i => i.code === item.code)
            .reduce((sum, i) => sum + i.qty_req, 0);
        const isComplete = totalQtyScan >= totalQtyReq && totalQtyReq > 0;
        const isOver = totalQtyScan > totalQtyReq;

        // Datos de líneas múltiples
        const sameCodeLines = orderItems.filter(i => i.code === item.code);
        const totalLines = sameCodeLines.length;
        const isMultiLine = totalLines > 1;
        // Calcular cuántas líneas están completas
        const completedLines = sameCodeLines.filter(l => l.qty_scan >= l.qty_req && l.qty_req > 0).length;
        const allLinesComplete = completedLines === totalLines;

        return (
            <TouchableOpacity
                style={styles.historyItem}
                onPress={() => handleOpenEdit(item)}
                activeOpacity={0.7}
            >
                <View style={styles.historyInfo}>
                    <View style={styles.historyCodeRow}>
                        <Text style={styles.historyCode}>{item.code}</Text>
                        {isMultiLine && (
                            <View style={[
                                styles.lineChip,
                                allLinesComplete ? styles.lineChipComplete : styles.lineChipPending
                            ]}>
                                <Icon
                                    name={allLinesComplete ? 'check-circle' : 'format-list-bulleted'}
                                    size={10}
                                    color={allLinesComplete ? '#16a34a' : '#0854a0'}
                                />
                                <Text style={[
                                    styles.lineChipText,
                                    allLinesComplete ? styles.lineChipTextComplete : styles.lineChipTextPending
                                ]}>
                                    {completedLines}/{totalLines} L
                                </Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.historyDesc} numberOfLines={1}>{item.description}</Text>
                </View>
                <View style={styles.historyRight}>
                    <View style={[
                        styles.qtyBadge,
                        isOver ? styles.qtyBadgeOver : isComplete ? styles.qtyBadgeComplete : styles.qtyBadgePartial
                    ]}>
                        <Text style={[
                            styles.qtyBadgeText,
                            isOver ? styles.qtyBadgeTextOver : isComplete ? styles.qtyBadgeTextComplete : styles.qtyBadgeTextPartial
                        ]}>{totalQtyScan}</Text>
                    </View>
                    <View style={styles.editBadge}>
                        <Icon name="pencil" size={12} color="#0854a0" />
                        <Text style={styles.editText}>Editar Qty</Text>
                    </View>
                    <Text style={styles.historyTime}>{item.timestamp}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    if (!visible) return null;

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={styles.container}>
                {/* MITAD SUPERIOR: CAMARA */}
                <View style={styles.cameraContainer}>
                    {hasPermission && device ? (
                        <Camera
                            ref={cameraRef}
                            style={StyleSheet.absoluteFill}
                            device={device}
                            isActive={isActive}
                            codeScanner={codeScanner}
                            format={format}
                            torch={isFlashOn ? 'on' : 'off'}
                            pixelFormat="yuv"
                        />
                    ) : (
                        <View style={styles.loadingCamera}>
                            <ActivityIndicator size="large" color="#fff" />
                            <Text style={styles.loadingText}>Cargando cámara...</Text>
                        </View>
                    )}

                    <View style={styles.cameraOverlay}>
                        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                            <Icon name="close" size={28} color="#fff" />
                        </TouchableOpacity>

                        <View style={styles.packageBadge}>
                            <Text style={styles.packageBadgeText}>Bulto {currentPackage}</Text>
                        </View>

                        <TouchableOpacity
                            onPress={() => setIsFlashOn(!isFlashOn)}
                            style={styles.flashBtn}
                        >
                            <Icon
                                name={isFlashOn ? "flash" : "flash-off"}
                                size={24}
                                color={isFlashOn ? "#FFD700" : "#fff"}
                            />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.scannerGuide}>
                        <View style={styles.guideCornerTL} />
                        <View style={styles.guideCornerTR} />
                        <View style={styles.guideCornerBL} />
                        <View style={styles.guideCornerBR} />
                    </View>
                </View>

                {/* MITAD INFERIOR: LISTA DE ESCANEOS */}
                <View style={styles.listContainer}>
                    <View style={styles.listHeader}>
                        <Text style={styles.listTitle}>Ítems Escaneados</Text>
                        <Text style={styles.listCount}>
                            {orderItems.reduce((sum, i) => sum + i.qty_scan, 0)} lecturas
                        </Text>
                    </View>

                    <FlatList
                        data={scannedHistory}
                        renderItem={renderScannedItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.listContent}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Icon name="barcode-scan" size={48} color="#cbd5e1" />
                                <Text style={styles.emptyText}>Escanea códigos para comenzar</Text>
                                <Text style={styles.emptySubtext}>Toca un ítem de la lista para editar su cantidad</Text>
                            </View>
                        }
                    />
                </View>

                {/* SUB-MODAL: INPUT DE CANTIDAD MANUAL */}
                {showQtyInput && (
                    <View style={styles.qtyOverlay}>
                        <View style={styles.qtyDialog}>
                            <Text style={styles.qtyTitle}>Ingresar Cantidad</Text>
                            <Text style={styles.qtySubtitle}>{editingItem?.code}</Text>
                            <TextInput
                                style={styles.qtyInput}
                                value={manualQty}
                                onChangeText={setManualQty}
                                keyboardType="numeric"
                                autoFocus
                                placeholder="Cantidad"
                                placeholderTextColor="#94a3b8"
                                returnKeyType="done"
                                onSubmitEditing={handleConfirmQty}
                            />
                            <View style={styles.qtyButtons}>
                                <TouchableOpacity
                                    style={[styles.qtyBtn, styles.qtyBtnCancel]}
                                    onPress={() => setShowQtyInput(false)}
                                >
                                    <Text style={styles.qtyBtnTextCancel}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.qtyBtn, styles.qtyBtnConfirm]}
                                    onPress={handleConfirmQty}
                                >
                                    <Text style={styles.qtyBtnTextConfirm}>Confirmar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                )}
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    cameraContainer: {
        height: SCREEN_HEIGHT * 0.45,
        backgroundColor: '#000',
        overflow: 'hidden'
    },
    loadingCamera: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    loadingText: { color: '#fff', marginTop: 10 },
    cameraOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingTop: Platform.OS === 'ios' ? 50 : 20,
        paddingHorizontal: 20,
        zIndex: 10
    },
    closeBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    flashBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    packageBadge: {
        backgroundColor: '#0854a0',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#fff'
    },
    packageBadgeText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
    scannerGuide: {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: 250,
        height: 120,
        marginLeft: -125,
        marginTop: -60,
        borderWidth: 0,
    },
    guideCornerTL: { position: 'absolute', top: 0, left: 0, width: 20, height: 20, borderTopWidth: 3, borderLeftWidth: 3, borderColor: '#fff' },
    guideCornerTR: { position: 'absolute', top: 0, right: 0, width: 20, height: 20, borderTopWidth: 3, borderRightWidth: 3, borderColor: '#fff' },
    guideCornerBL: { position: 'absolute', bottom: 0, left: 0, width: 20, height: 20, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: '#fff' },
    guideCornerBR: { position: 'absolute', bottom: 0, right: 0, width: 20, height: 20, borderBottomWidth: 3, borderRightWidth: 3, borderColor: '#fff' },

    listContainer: {
        flex: 1,
        backgroundColor: '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        marginTop: -20,
        paddingTop: 10
    },
    listHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9'
    },
    listTitle: { fontSize: 16, fontWeight: 'bold', color: '#1e293b' },
    listCount: { fontSize: 14, color: '#64748b' },
    listContent: { padding: 10 },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
        padding: 12,
        borderRadius: 10,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0'
    },
    historyInfo: { flex: 1 },
    historyCodeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    historyCode: { fontSize: 14, fontWeight: 'bold', color: '#1e293b', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
    historyDesc: { fontSize: 11, color: '#64748b', marginTop: 2 },
    historyRight: { alignItems: 'flex-end', gap: 4 },
    historyTime: { fontSize: 10, color: '#94a3b8' },
    lineChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 10,
        borderWidth: 1,
    },
    lineChipPending: {
        backgroundColor: '#eff6ff',
        borderColor: '#bfdbfe',
    },
    lineChipComplete: {
        backgroundColor: '#dcfce7',
        borderColor: '#86efac',
    },
    lineChipText: {
        fontSize: 10,
        fontWeight: '700',
    },
    lineChipTextPending: { color: '#0854a0' },
    lineChipTextComplete: { color: '#16a34a' },
    qtyBadge: {
        minWidth: 32,
        height: 32,
        borderRadius: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 6,
    },
    qtyBadgePartial: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1' },
    qtyBadgeComplete: { backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' },
    qtyBadgeOver: { backgroundColor: '#fef3c7', borderWidth: 1, borderColor: '#fcd34d' },
    qtyBadgeText: { fontSize: 14, fontWeight: 'bold' },
    qtyBadgeTextPartial: { color: '#475569' },
    qtyBadgeTextComplete: { color: '#16a34a' },
    qtyBadgeTextOver: { color: '#d97706' },
    editBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e8f4fc',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
        gap: 3,
        borderWidth: 1,
        borderColor: '#cce4f6'
    },
    editText: { fontSize: 10, color: '#0854a0', fontWeight: 'bold' },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', padding: 40 },
    emptyText: { marginTop: 10, color: '#94a3b8', fontSize: 14, textAlign: 'center', fontWeight: 'bold' },
    emptySubtext: { marginTop: 5, color: '#94a3b8', fontSize: 12, textAlign: 'center' },

    qtyOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100
    },
    qtyDialog: {
        backgroundColor: '#fff',
        width: '80%',
        borderRadius: 15,
        padding: 20,
        alignItems: 'center',
        elevation: 10
    },
    qtyTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b' },
    qtySubtitle: { fontSize: 14, color: '#64748b', marginBottom: 15 },
    qtyInput: {
        backgroundColor: '#f1f5f9',
        width: '100%',
        borderRadius: 10,
        padding: 15,
        fontSize: 32,
        textAlign: 'center',
        color: '#1e293b',
        fontWeight: 'bold',
        marginBottom: 20
    },
    qtyButtons: { flexDirection: 'row', gap: 10 },
    qtyBtn: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
    qtyBtnCancel: { backgroundColor: '#f1f5f9' },
    qtyBtnConfirm: { backgroundColor: '#0854a0' },
    qtyBtnTextCancel: { color: '#475569', fontWeight: 'bold' },
    qtyBtnTextConfirm: { color: '#fff', fontWeight: 'bold' }
});

export default AuditScannerModal;
