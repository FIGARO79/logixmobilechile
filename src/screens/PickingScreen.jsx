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
    Vibration,
    ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import client from '../api/client';
import ScannerModal from '../components/ScannerModal';
import AuditScannerModal from '../components/AuditScannerModal';
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

    // Package Management State
    const [currentPackage, setCurrentPackage] = useState(1);
    const [packageAssignments, setPackageAssignments] = useState({}); // { itemCode: { packageNum: qty } }

    // Scanning & Modals
    const [auditScannerOpen, setAuditScannerOpen] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [showPackagesModal, setShowPackagesModal] = useState(false);
    const [showDiffModal, setShowDiffModal] = useState(false);
    const [showQtyModal, setShowQtyModal] = useState(false);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState(null);
    const [tempQty, setTempQty] = useState('1');
    const [packagesCount, setPackagesCount] = useState('');
    const [manualCode, setManualCode] = useState('');
    const [saving, setSaving] = useState(false);

    // Integración de escaneo por hardware (Zebra)
    useDataWedge(handleScan);

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

        // Check if already audited in recentOrders list
        const recentInfo = recentOrders.find(
            o => o.order_number === orderNumber && o.despatch_number === despatchNumber
        );

        if (recentInfo?.is_audited) {
            Alert.alert(
                'Pedido Auditado',
                'Este pedido ya ha sido auditado anteriormente. ¿Desea auditarlo de nuevo?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Auditar de nuevo', onPress: () => fetchOrderData() }
                ]
            );
        } else {
            fetchOrderData();
        }
    };

    const fetchOrderData = async () => {
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
                    qty_req: parseInt(row['Qty'] || 0, 10),
                    qty_scan: 0,
                    difference: -parseInt(row['Qty'] || 0, 10)
                }));
                setOrderItems(items);
                setPackageAssignments({});
                setCurrentPackage(1);
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
        setPackageAssignments({});
        setCurrentPackage(1);
        setOrderNumber('');
        setDespatchNumber('');
        setCustomerName('');
        setPackagesCount('');
        loadRecentOrders();
    };

    const handleScan = (code) => {
        if (!code || typeof code !== 'string') return;

        const cleanCode = code.trim().toUpperCase();
        if (!cleanCode) return;

        const exists = orderItems.some(i => i.code === cleanCode);

        if (exists) {
            // Si el modal de escaneo continuo está abierto, sumamos +1 automáticamente para agilidad
            if (auditScannerOpen) {
                updateItemQuantity(cleanCode, 1);
                Vibration.vibrate(50);
            } else {
                // Si es escaneo normal (desde el botón o DataWedge sin modal), preguntamos cantidad
                setScannerOpen(false);
                // Para el modal de cantidad mostramos solo la primera línea (referencia)
                const firstLine = orderItems.find(i => i.code === cleanCode);
                setSelectedItem(firstLine);
                setTempQty('1');
                setShowQtyModal(true);
                Vibration.vibrate(50);
            }
        } else {
            Vibration.vibrate([0, 200, 100, 200]);
            Alert.alert(
                '✗ Ítem Incorrecto',
                `El ítem escaneado [${cleanCode}] NO pertenece al pedido actual [${orderNumber}].`
            );
        }
    };

    const handleManualQty = (code, totalQty) => {
        const lines = orderItems.filter(i => i.code === code);
        if (!lines.length) return;

        // Calcular el total escaneado actual en todas las líneas del ítem
        const currentTotalScanned = lines.reduce((sum, l) => sum + l.qty_scan, 0);
        const diffToAdd = totalQty - currentTotalScanned;

        if (diffToAdd !== 0) {
            updateItemQuantity(code, diffToAdd);
        }
    };

    /**
     * Distribuye `qtyToAdd` entre todas las líneas del ítem con ese `itemCode`.
     * Si qtyToAdd > 0: llena las líneas en orden (primera incompleta primero).
     * Si qtyToAdd < 0: vacía desde la última línea hacia atrás.
     * El excedente (sobre qty_req total) se acumula en la primera línea.
     */
    const updateItemQuantity = (itemCode, qtyToAdd) => {
        setOrderItems(prev => {
            if (qtyToAdd === 0) return prev;

            const updated = prev.map(i => ({ ...i }));
            const lineIndices = updated.reduce((acc, item, idx) => {
                if (item.code === itemCode) acc.push(idx);
                return acc;
            }, []);

            if (lineIndices.length === 0) return prev;

            let remaining = qtyToAdd;

            if (remaining > 0) {
                // Distribuir de la primera a la última línea
                for (const idx of lineIndices) {
                    if (remaining <= 0) break;
                    const line = updated[idx];
                    const space = line.qty_req - line.qty_scan;
                    if (space > 0) {
                        const toAdd = Math.min(space, remaining);
                        line.qty_scan += toAdd;
                        remaining -= toAdd;
                    }
                }
                // Si todavía queda remanente (exceso sobre el total requerido),
                // acumularlo en la primera línea
                if (remaining > 0) {
                    updated[lineIndices[0]].qty_scan += remaining;
                }
            } else {
                // Fase 1: remover exceso (qty_scan > qty_req) primero, de primera a última línea.
                // Esto evita descuadrar líneas que ya estaban bien cuando se corrige un exceso.
                let toRemove = Math.abs(remaining);
                for (const idx of lineIndices) {
                    if (toRemove <= 0) break;
                    const line = updated[idx];
                    const excess = Math.max(0, line.qty_scan - line.qty_req);
                    if (excess > 0) {
                        const canRemove = Math.min(excess, toRemove);
                        line.qty_scan -= canRemove;
                        toRemove -= canRemove;
                    }
                }
                // Fase 2: si aún falta restar (reducción mayor al exceso), quitar de la última línea hacia la primera.
                for (const idx of [...lineIndices].reverse()) {
                    if (toRemove <= 0) break;
                    const line = updated[idx];
                    const canRemove = Math.min(line.qty_scan, toRemove);
                    line.qty_scan -= canRemove;
                    toRemove -= canRemove;
                }
            }

            // Recalcular difference en todas las líneas del ítem
            for (const idx of lineIndices) {
                updated[idx].difference = updated[idx].qty_scan - updated[idx].qty_req;
            }

            return updated;
        });

        // Actualizar asignaciones de bulto
        setPackageAssignments(prev => {
            const newAssignments = { ...prev };
            if (!newAssignments[itemCode]) {
                newAssignments[itemCode] = {};
            }
            const pkgKey = currentPackage.toString();
            const current = newAssignments[itemCode][pkgKey] || 0;
            const newVal = current + qtyToAdd;
            // Nunca dejar valor negativo en el bulto
            newAssignments[itemCode][pkgKey] = Math.max(0, newVal);
            return newAssignments;
        });
    };

    const confirmQuantity = () => {
        const qtyToAdd = parseInt(tempQty, 10);
        if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
            Alert.alert('Error', 'Ingrese una cantidad válida');
            return;
        }

        const itemCode = selectedItem.code;
        updateItemQuantity(itemCode, qtyToAdd);

        // Comprobar si el total escaneado excederá el total requerido en todas las líneas
        const totalReq = orderItems
            .filter(i => i.code === itemCode)
            .reduce((sum, i) => sum + i.qty_req, 0);
        const totalScan = orderItems
            .filter(i => i.code === itemCode)
            .reduce((sum, i) => sum + i.qty_scan, 0);
        if (totalScan + qtyToAdd > totalReq) {
            Vibration.vibrate([0, 100, 50, 100]);
        }

        setShowQtyModal(false);
        setSelectedItem(null);
        setTempQty('1');
    };

    const handleManualSubmit = () => {
        if (!manualCode.trim()) return;
        handleScan(manualCode);
        setManualCode('');
    };

    const handleFinalize = () => {
        const hasDifferences = orderItems.some(i => i.qty_scan !== i.qty_req);
        // Pre-fill packages count with the highest package number used
        let maxPkg = currentPackage;
        Object.values(packageAssignments).forEach(itemPkgs => {
            Object.keys(itemPkgs).forEach(p => {
                const pNum = parseInt(p, 10);
                if (pNum > maxPkg) maxPkg = pNum;
            });
        });
        setPackagesCount(maxPkg.toString());

        if (hasDifferences) {
            setShowDiffModal(true);
        } else {
            setShowPackagesModal(true);
        }
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
                packages: parseInt(packagesCount || 0, 10),
                packages_assignment: packageAssignments
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
        if (item.qty_scan === item.qty_req && item.qty_scan > 0) return styles.itemComplete;
        if (item.qty_scan > item.qty_req) return styles.itemOver;
        return null;
    };

    const getDiffStyle = (diff) => {
        if (diff === 0) return styles.diffOk;
        return styles.diffBad;
    };

    const totalScanned = orderItems.reduce((acc, i) => acc + i.qty_scan, 0);
    const totalRequired = orderItems.reduce((acc, i) => acc + i.qty_req, 0);
    const itemsComplete = orderItems.filter(i => i.qty_scan === i.qty_req && i.qty_scan > 0).length;

    // Package Helper Functions
    const nextPackage = () => setCurrentPackage(prev => prev + 1);
    const prevPackage = () => setCurrentPackage(prev => Math.max(1, prev - 1));

    const getItemsInCurrentPackage = () => {
        const pkgKey = currentPackage.toString();
        const list = [];
        Object.entries(packageAssignments).forEach(([code, pkgs]) => {
            if (pkgs[pkgKey] > 0) {
                const item = orderItems.find(i => i.code === code);
                list.push({ code, qty: pkgs[pkgKey], description: item?.description });
            }
        });
        return list;
    };

    const renderItem = ({ item }) => (
        <View style={[styles.itemCard, getItemStyle(item)]}>
            <View style={styles.itemHeader}>
                <View style={styles.itemInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={styles.itemCode}>{item.code}</Text>
                        {item.order_line ? (
                            <Text style={styles.orderLineLabel}>Línea {item.order_line}</Text>
                        ) : null}
                    </View>
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
                    <Text style={styles.qtyLabel}>Auditado</Text>
                    <Text style={[styles.qtyValue, styles.qtyScanned]}>{item.qty_scan}</Text>
                </View>
                {packageAssignments[item.code] && (
                    <View style={styles.itemPackageInfo}>
                        <Icon name="package-variant" size={14} color="#666" />
                        <Text style={styles.itemPackageText}>
                            {Object.entries(packageAssignments[item.code]).map(([p, q]) => `B${p}: ${q}`).join(' | ')}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );

    const renderRecentOrder = ({ item }) => (
        <TouchableOpacity
            style={[styles.recentCard, item.is_audited && styles.recentCardAudited]}
            onPress={() => {
                setOrderNumber(item.order_number);
                setDespatchNumber(item.despatch_number);
            }}
        >
            <View style={styles.recentHeader}>
                <Text style={[styles.recentOrderNum, item.is_audited && styles.recentOrderNumAudited]}>
                    {item.order_number}
                </Text>
                <View style={styles.recentDespatch}>
                    <Text style={styles.recentDespatchText}>{item.despatch_number}</Text>
                </View>
                <View style={[styles.recentLinesBadge, item.is_audited && styles.recentLinesBadgeAudited]}>
                    <Text style={styles.recentLinesText}>{item.total_lines} líneas</Text>
                </View>
            </View>
            <Text style={styles.recentCustomer} numberOfLines={1}>{item.customer_name}</Text>
            <Text style={styles.recentDate}>{item.print_date}</Text>
        </TouchableOpacity>
    );

    // Active Audit View
    if (auditActive) {
        const pkgItems = getItemsInCurrentPackage();
        return (
            <SafeAreaView style={styles.container}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.flex}
                >
                    {/* Header */}
                    <View style={styles.auditHeader}>
                        <View style={styles.auditInfo}>
                            <Text style={styles.auditTitle}>Auditoría: {orderNumber}</Text>
                            <Text style={styles.auditCustomer} numberOfLines={1}>{customerName}</Text>
                        </View>
                        <TouchableOpacity onPress={handleReset} style={styles.cancelButton}>
                            <Text style={styles.cancelButtonText}>Cerrar</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Package Selector Bar */}
                    <View style={styles.packageBar}>
                        <TouchableOpacity onPress={prevPackage} style={styles.pkgNavButton}>
                            <Icon name="chevron-left" size={28} color="#0854a0" />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.pkgDisplay}
                            onPress={() => setShowReviewModal(true)}
                        >
                            <Icon name="package-variant-closed" size={20} color="#0854a0" />
                            <Text style={styles.pkgDisplayText}>BULTO {currentPackage}</Text>
                            <View style={styles.pkgItemCount}>
                                <Text style={styles.pkgItemCountText}>{pkgItems.length} ítems</Text>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={nextPackage} style={styles.pkgNavButton}>
                            <Icon name="plus-circle-outline" size={28} color="#0854a0" />
                        </TouchableOpacity>
                    </View>

                    {/* consolidated Scan & Search Bar */}
                    <View style={styles.searchBarSection}>
                        <View style={styles.searchBar}>
                            <TouchableOpacity
                                style={styles.scanIconButton}
                                onPress={() => setAuditScannerOpen(true)}
                            >
                                <Icon name="camera-iris" size={28} color="#0854a0" />
                                <Text style={styles.scanIconText}>Auditar</Text>
                            </TouchableOpacity>

                            <TextInput
                                style={styles.searchBarInput}
                                value={manualCode}
                                onChangeText={setManualCode}
                                placeholder="Escanear o escribir..."
                                placeholderTextColor="#999"
                                autoCapitalize="characters"
                                onSubmitEditing={handleManualSubmit}
                                returnKeyType="search"
                            />

                            <TouchableOpacity
                                style={[styles.searchConfirmButton, !manualCode.trim() && styles.searchConfirmButtonDisabled]}
                                onPress={handleManualSubmit}
                                disabled={!manualCode.trim()}
                            >
                                <Icon name="magnify" size={24} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Progress */}
                    <View style={styles.progressBar}>
                        <Text style={styles.progressText}>
                            Progreso: {itemsComplete}/{orderItems.length} líneas completadas
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
                            <Text style={styles.finalizeButtonText}>Finalizar y Guardar</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>

                {/* Audit Scanner Modal (Continuous) */}
                <AuditScannerModal
                    visible={auditScannerOpen}
                    orderItems={orderItems}
                    currentPackage={currentPackage}
                    onScan={handleScan}
                    onManualQty={handleManualQty}
                    onClose={() => setAuditScannerOpen(false)}
                />

                {/* Scanner Modal (Single Scan) */}
                <ScannerModal
                    visible={scannerOpen}
                    onScan={handleScan}
                    onClose={() => setScannerOpen(false)}
                />

                {/* Package Review Modal */}
                <Modal visible={showReviewModal} transparent animationType="slide">
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                            <View style={styles.modalHeaderRow}>
                                <Icon name="package-variant-closed" size={24} color="#1e293b" />
                                <Text style={styles.modalTitle}>Contenido del Bulto {currentPackage}</Text>
                            </View>
                            <ScrollView style={styles.reviewList}>
                                {pkgItems.length === 0 ? (
                                    <Text style={styles.emptyReviewText}>Este bulto está vacío</Text>
                                ) : (
                                    pkgItems.map((it, idx) => (
                                        <View key={idx} style={styles.reviewItem}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.reviewItemCode}>{it.code}</Text>
                                                <Text style={styles.reviewItemDesc} numberOfLines={1}>{it.description}</Text>
                                            </View>
                                            <Text style={styles.reviewItemQty}>x{it.qty}</Text>
                                        </View>
                                    ))
                                )}
                            </ScrollView>
                            <TouchableOpacity
                                style={[styles.modalButton, styles.modalButtonPrimary, { marginTop: 20 }]}
                                onPress={() => setShowReviewModal(false)}
                            >
                                <Text style={styles.modalButtonTextPrimary}>Cerrar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>

                {/* Quantity Modal */}
                <Modal visible={showQtyModal} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.qtyModalHeader}>
                                <Icon name="package-variant-closed" size={24} color="#0854a0" />
                                <Text style={styles.qtyModalBadge}>Asignando al Bulto {currentPackage}</Text>
                            </View>
                            <View style={styles.modalHeaderRow}>
                                <Icon name="numeric" size={24} color="#1e293b" />
                                <Text style={styles.modalTitle}>Ingresar Cantidad</Text>
                            </View>
                            <View style={styles.selectedItemBox}>
                                <Text style={styles.selectedItemCode}>{selectedItem?.code}</Text>
                                <Text style={styles.selectedItemDesc} numberOfLines={1}>{selectedItem?.description}</Text>
                            </View>
                            <TextInput
                                style={styles.packagesInput}
                                value={tempQty}
                                onChangeText={setTempQty}
                                keyboardType="numeric"
                                placeholder="1"
                                autoFocus
                                selectTextOnFocus
                            />
                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonSecondary]}
                                    onPress={() => {
                                        setShowQtyModal(false);
                                        setSelectedItem(null);
                                    }}
                                >
                                    <Text style={styles.modalButtonTextSecondary}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonPrimary]}
                                    onPress={confirmQuantity}
                                >
                                    <Text style={styles.modalButtonTextPrimary}>Confirmar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Differences Alert Modal */}
                <Modal visible={showDiffModal} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeaderRow}>
                                <Icon name="alert-octagon" size={24} color="#b91c1c" />
                                <Text style={[styles.modalTitle, { color: '#b91c1c' }]}>Diferencias Detectadas</Text>
                            </View>
                            <Text style={styles.modalText}>
                                Hay ítems con cantidades incompletas o en exceso. ¿Desea finalizar de todas formas?
                            </Text>
                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonSecondary]}
                                    onPress={() => setShowDiffModal(false)}
                                >
                                    <Text style={styles.modalButtonTextSecondary}>Regresar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.modalButton, styles.modalButtonWarning]}
                                    onPress={() => {
                                        setShowDiffModal(false);
                                        setShowPackagesModal(true);
                                    }}
                                >
                                    <Text style={styles.modalButtonTextPrimary}>Sí, Continuar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Final Packages Count Modal */}
                <Modal visible={showPackagesModal} transparent animationType="fade">
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.modalHeaderRow}>
                                <Icon name="package-variant" size={24} color="#1e293b" />
                                <Text style={styles.modalTitle}>Confirmar Total de Bultos</Text>
                            </View>
                            <Text style={styles.modalText}>Se han detectado {packagesCount} bultos utilizados. Confirme el total:</Text>
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
                                        <Text style={styles.modalButtonTextPrimary}>Guardar Auditoría</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
        );
    }

    // Load Order View (Form unchanged)
    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.flex}
            >
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Text style={styles.backText}>← Regresar</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Auditoría de Picking</Text>
                </View>

                <View style={styles.formCard}>
                    <View style={styles.inputRow}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Order Number</Text>
                            <TextInput
                                style={styles.input}
                                value={orderNumber}
                                onChangeText={setOrderNumber}
                                placeholder="0043785"
                                autoCapitalize="characters"
                            />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Despatch</Text>
                            <TextInput
                                style={styles.input}
                                value={despatchNumber}
                                onChangeText={setDespatchNumber}
                                placeholder="00"
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
    recentCardAudited: {
        backgroundColor: '#f1f5f9',
        borderColor: '#e2e8f0',
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
    recentOrderNumAudited: {
        color: '#64748b',
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
    recentLinesBadgeAudited: {
        backgroundColor: '#94a3b8',
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
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    auditCustomer: {
        fontSize: 14,
        color: '#666',
        marginTop: 2,
    },
    cancelButton: {
        backgroundColor: '#fef2f2',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
    },
    cancelButtonText: {
        color: '#b91c1c',
        fontSize: 12,
        fontWeight: 'bold',
    },
    packageBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    pkgNavButton: {
        padding: 4,
    },
    pkgDisplay: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#e8f4fc',
        marginHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#0854a0',
        gap: 8,
    },
    pkgDisplayText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#0854a0',
    },
    pkgItemCount: {
        backgroundColor: '#0854a0',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
    },
    pkgItemCountText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
    },
    searchBarSection: {
        padding: 12,
        backgroundColor: '#fff',
    },
    searchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        borderRadius: 12,
        paddingHorizontal: 8,
        height: 56,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    scanIconButton: {
        width: 70,
        height: 44,
        borderRadius: 10,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#0854a0',
    },
    scanIconText: {
        fontSize: 10,
        color: '#0854a0',
        fontWeight: 'bold',
        marginTop: -2,
    },
    searchBarInput: {
        flex: 1,
        fontSize: 16,
        color: '#1e293b',
        paddingHorizontal: 12,
        height: '100%',
    },
    searchConfirmButton: {
        width: 44,
        height: 44,
        borderRadius: 10,
        backgroundColor: '#0854a0',
        alignItems: 'center',
        justifyContent: 'center',
    },
    searchConfirmButtonDisabled: {
        backgroundColor: '#94a3b8',
    },
    progressBar: {
        backgroundColor: '#f8fafc',
        paddingVertical: 6,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    progressText: {
        fontSize: 12,
        color: '#64748b',
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
    orderLineLabel: {
        fontSize: 11,
        color: '#94a3b8',
        fontWeight: '500',
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
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
        alignItems: 'center',
        gap: 16,
    },
    qtyBox: {
        minWidth: 70,
    },
    qtyLabel: {
        fontSize: 10,
        color: '#888',
        textTransform: 'uppercase',
        marginBottom: 2,
    },
    qtyValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#333',
    },
    qtyScanned: {
        color: '#0854a0',
    },
    itemCodeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
    },
    lineChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: 7,
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
        letterSpacing: 0.3,
    },
    lineChipTextPending: {
        color: '#0854a0',
    },
    lineChipTextComplete: {
        color: '#16a34a',
    },
    itemPackageInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 4,
    },
    itemPackageText: {
        fontSize: 10,
        color: '#475569',
        fontWeight: '500',
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
    qtyModalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 16,
        gap: 8,
    },
    qtyModalBadge: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#0854a0',
        backgroundColor: '#e8f4fc',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    selectedItemBox: {
        backgroundColor: '#f8fafc',
        padding: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        marginBottom: 16,
    },
    selectedItemCode: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#334155',
    },
    selectedItemDesc: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 2,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1e293b',
        marginBottom: 12,
    },
    modalText: {
        fontSize: 14,
        color: '#64748b',
        marginBottom: 16,
    },
    packagesInput: {
        backgroundColor: '#f1f5f9',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        borderRadius: 8,
        padding: 12,
        fontSize: 24,
        textAlign: 'center',
        color: '#1e293b',
        marginBottom: 20,
        fontWeight: 'bold',
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
        backgroundColor: '#f1f5f9',
    },
    modalButtonPrimary: {
        backgroundColor: '#0854a0',
    },
    modalButtonWarning: {
        backgroundColor: '#f59e0b',
    },
    modalButtonTextSecondary: {
        color: '#475569',
        fontWeight: '600',
    },
    modalButtonTextPrimary: {
        color: '#fff',
        fontWeight: 'bold',
    },
    // Review Modal Styles
    reviewList: {
        marginTop: 10,
    },
    reviewItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
    },
    reviewItemCode: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#333',
    },
    reviewItemDesc: {
        fontSize: 11,
        color: '#666',
    },
    reviewItemQty: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#0854a0',
        marginLeft: 10,
    },
    emptyReviewText: {
        textAlign: 'center',
        color: '#999',
        padding: 20,
        fontStyle: 'italic',
    },
});

export default PickingScreen;
