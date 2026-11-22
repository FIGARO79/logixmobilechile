import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
    ScrollView,
    ListRenderItem,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import client from '../api/client';
import ScannerModal from '../components/ScannerModal';
import AuditScannerModal, { type AuditOrderItem } from '../components/AuditScannerModal';
import MeasurementScannerModal, { type MeasurementDimensions } from '../components/MeasurementScannerModal';
import useDataWedge from '../hooks/useDataWedge';
import { parseBarcode } from '../utils/barcodeParser';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import fluent from '../theme/fluent';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Picking'>;

type SortOptionId =
    | 'date_desc'
    | 'date_asc'
    | 'customer_asc'
    | 'customer_desc'
    | 'order_asc'
    | 'order_desc';

interface SortOption {
    id: SortOptionId;
    label: string;
    shortLabel: string;
    icon: string;
}

interface RecentOrder {
    order_number: string;
    despatch_number?: string | null;
    customer_name?: string | null;
    print_date?: string | null;
    total_lines?: number;
    is_audited?: boolean;
}

interface OrderApiRow {
    'Customer Name'?: string;
    'Customer Code'?: string;
    'Item Code': string;
    'Item Description'?: string;
    'Order Line': string | number;
    Qty?: string | number;
}

interface PickingOrderItem extends AuditOrderItem {
    code: string;
    description: string;
    order_line: string | number;
    qty_req: number;
    qty_scan: number;
    difference: number;
}

interface PackageItemSummary {
    code: string;
    order_line: string;
    qty: number;
    description?: string;
}

type PackageAssignments = Record<string, Record<number, number>>;
type PackageDimensionsMap = Record<number, MeasurementDimensions>;

const SORT_OPTIONS: SortOption[] = [
    { id: 'date_desc', label: 'Fecha: Más recientes', shortLabel: 'Fecha Reciente', icon: 'calendar-arrow-down' },
    { id: 'date_asc', label: 'Fecha: Más antiguas', shortLabel: 'Fecha Antigua', icon: 'calendar-arrow-up' },
    { id: 'customer_asc', label: 'Cliente: A → Z', shortLabel: 'Cliente A-Z', icon: 'sort-alphabetical-ascending' },
    { id: 'customer_desc', label: 'Cliente: Z → A', shortLabel: 'Cliente Z-A', icon: 'sort-alphabetical-descending' },
    { id: 'order_asc', label: 'Nº Orden: Menor a Mayor', shortLabel: 'Orden Asc', icon: 'sort-numeric-ascending' },
    { id: 'order_desc', label: 'Nº Orden: Mayor a Menor', shortLabel: 'Orden Desc', icon: 'sort-numeric-descending' },
];

const PickingScreen: React.FC<Props> = ({ navigation }) => {
    // Load Order State
    const [orderNumber, setOrderNumber] = useState('');
    const [despatchNumber, setDespatchNumber] = useState('');
    const [loadingOrder, setLoadingOrder] = useState(false);
    const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);
    const [sortBy, setSortBy] = useState<SortOptionId>('date_desc');
    const [showSortModal, setShowSortModal] = useState(false);

    // Active Audit State
    const [auditActive, setAuditActive] = useState(false);
    const [customerCode, setCustomerCode] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [orderItems, setOrderItems] = useState<PickingOrderItem[]>([]);

    // Package Management State
    const [currentPackage, setCurrentPackage] = useState(1);
    const [packageAssignments, setPackageAssignments] = useState<PackageAssignments>({}); // { "itemCode:orderLine": { packageNum: qty } }
    const [packageDimensions, setPackageDimensions] = useState<PackageDimensionsMap>({}); // { packageNum: {length, width, height} }

    // Scanning & Modals
    const [auditScannerOpen, setAuditScannerOpen] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [measurementScannerOpen, setMeasurementScannerOpen] = useState(false);
    const [showPackagesModal, setShowPackagesModal] = useState(false);
    const [showDiffModal, setShowDiffModal] = useState(false);
    const [showQtyModal, setShowQtyModal] = useState(false);
    const [showReviewModal, setShowReviewModal] = useState(false);
    const [selectedItem, setSelectedItem] = useState<PickingOrderItem | null>(null);
    const [tempQty, setTempQty] = useState('1');
    const [packagesCount, setPackagesCount] = useState('');
    const [manualCode, setManualCode] = useState('');
    const [saving, setSaving] = useState(false);

    const loadRecentOrders = useCallback(async () => {
        try {
            const res = await client.get<RecentOrder[]>('/api/picking/tracking');
            const data = res.data || [];
            const filtered = data.filter(o =>
                o.order_number &&
                o.order_number !== 'None' &&
                o.order_number !== 'null' &&
                String(o.order_number).trim() !== '',
            );
            setRecentOrders(filtered);
        } catch (e) {
            console.error('Error loading recent orders:', e);
        }
    }, []);

    // Load recent orders on mount
    useEffect(() => {
        loadRecentOrders();
    }, [loadRecentOrders]);

    const sortedRecentOrders = useMemo(() => {
        if (!recentOrders || recentOrders.length === 0) return [];
        return [...recentOrders].sort((a, b) => {
            switch (sortBy) {
                case 'date_asc': {
                    const dateA = a.print_date ? new Date(String(a.print_date).replace(/-/g, '/')).getTime() : 0;
                    const dateB = b.print_date ? new Date(String(b.print_date).replace(/-/g, '/')).getTime() : 0;
                    if (!isNaN(dateA) && !isNaN(dateB) && dateA !== dateB) {
                        return dateA - dateB;
                    }
                    return String(a.print_date || '').localeCompare(String(b.print_date || ''));
                }
                case 'date_desc': {
                    const dateA = a.print_date ? new Date(String(a.print_date).replace(/-/g, '/')).getTime() : 0;
                    const dateB = b.print_date ? new Date(String(b.print_date).replace(/-/g, '/')).getTime() : 0;
                    if (!isNaN(dateA) && !isNaN(dateB) && dateA !== dateB) {
                        return dateB - dateA;
                    }
                    return String(b.print_date || '').localeCompare(String(a.print_date || ''));
                }
                case 'customer_asc': {
                    const custA = (a.customer_name || '').trim().toLowerCase();
                    const custB = (b.customer_name || '').trim().toLowerCase();
                    return custA.localeCompare(custB);
                }
                case 'customer_desc': {
                    const custA = (a.customer_name || '').trim().toLowerCase();
                    const custB = (b.customer_name || '').trim().toLowerCase();
                    return custB.localeCompare(custA);
                }
                case 'order_asc': {
                    const ordA = String(a.order_number || '');
                    const ordB = String(b.order_number || '');
                    return ordA.localeCompare(ordB, undefined, { numeric: true });
                }
                case 'order_desc': {
                    const ordA = String(a.order_number || '');
                    const ordB = String(b.order_number || '');
                    return ordB.localeCompare(ordA, undefined, { numeric: true });
                }
                default:
                    return 0;
            }
        });
    }, [recentOrders, sortBy]);

    const fetchOrderData = useCallback(async () => {
        setLoadingOrder(true);
        try {
            const res = await client.get<OrderApiRow[]>(`/api/picking/order/${orderNumber}/${despatchNumber}`);
            const data = res.data;

            if (data && data.length > 0) {
                setCustomerName(data[0]['Customer Name'] || '');
                setCustomerCode(data[0]['Customer Code'] || '');
                const items: PickingOrderItem[] = data.map(row => {
                    const qtyReq = parseInt(String(row.Qty || '0'), 10);
                    return {
                        code: row['Item Code'],
                        description: row['Item Description'] || '',
                        order_line: row['Order Line'],
                        qty_req: qtyReq,
                        qty_scan: 0,
                        difference: -qtyReq,
                    };
                });
                setOrderItems(items);
                setPackageAssignments({});
                setPackageDimensions({});
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
    }, [orderNumber, despatchNumber]);

    const handleLoadOrder = async () => {
        if (!orderNumber || !despatchNumber) {
            Alert.alert('Error', 'Ingrese Order y Despatch Number');
            return;
        }

        const recentInfo = recentOrders.find(
            o => o.order_number === orderNumber && o.despatch_number === despatchNumber,
        );

        if (recentInfo?.is_audited) {
            Alert.alert(
                'Pedido Auditado',
                'Este pedido ya ha sido auditado anteriormente. ¿Desea auditarlo de nuevo?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Auditar de nuevo', onPress: () => fetchOrderData() },
                ],
            );
        } else {
            fetchOrderData();
        }
    };

    const handleReset = useCallback(() => {
        setAuditActive(false);
        setOrderItems([]);
        setPackageAssignments({});
        setPackageDimensions({});
        setCurrentPackage(1);
        setOrderNumber('');
        setDespatchNumber('');
        setCustomerName('');
        setCustomerCode('');
        setPackagesCount('');
        loadRecentOrders();
    }, [loadRecentOrders]);

    // Manage navigation header for active audit
    useEffect(() => {
        if (auditActive) {
            navigation.setOptions({
                headerRight: () => (
                    <TouchableOpacity onPress={handleReset} style={{ marginRight: 10 }}>
                        <Text style={{ color: '#dc2626', fontWeight: 'bold' }}>Cerrar</Text>
                    </TouchableOpacity>
                ),
            });
        } else {
            navigation.setOptions({
                headerRight: undefined,
            });
        }
    }, [auditActive, navigation, handleReset]);

    const updateItemQuantity = useCallback((itemCode: string, qtyToAdd: number) => {
        if (qtyToAdd === 0) return;

        let remaining = qtyToAdd;
        const lineIndices = orderItems.reduce<number[]>((acc, item, idx) => {
            if (item.code === itemCode) acc.push(idx);
            return acc;
        }, []);

        if (lineIndices.length === 0) return;

        const updatedItems = orderItems.map(i => ({ ...i }));
        const assignmentsToUpdate: Array<{ key: string; qty: number }> = [];

        if (remaining > 0) {
            for (const idx of lineIndices) {
                if (remaining <= 0) break;
                const line = updatedItems[idx];
                const space = line.qty_req - line.qty_scan;
                if (space > 0) {
                    const toAdd = Math.min(space, remaining);
                    line.qty_scan += toAdd;
                    remaining -= toAdd;
                    assignmentsToUpdate.push({ key: `${line.code}:${line.order_line}`, qty: toAdd });
                }
            }
            if (remaining > 0) {
                const line = updatedItems[lineIndices[0]];
                line.qty_scan += remaining;
                assignmentsToUpdate.push({ key: `${line.code}:${line.order_line}`, qty: remaining });
            }
        } else {
            let toRemove = Math.abs(remaining);
            for (const idx of lineIndices) {
                if (toRemove <= 0) break;
                const line = updatedItems[idx];
                const excess = Math.max(0, line.qty_scan - line.qty_req);
                if (excess > 0) {
                    const canRemove = Math.min(excess, toRemove);
                    line.qty_scan -= canRemove;
                    toRemove -= canRemove;
                    assignmentsToUpdate.push({ key: `${line.code}:${line.order_line}`, qty: -canRemove });
                }
            }
            for (const idx of [...lineIndices].reverse()) {
                if (toRemove <= 0) break;
                const line = updatedItems[idx];
                const canRemove = Math.min(line.qty_scan, toRemove);
                line.qty_scan -= canRemove;
                toRemove -= canRemove;
                assignmentsToUpdate.push({ key: `${line.code}:${line.order_line}`, qty: -canRemove });
            }
        }

        for (const idx of lineIndices) {
            updatedItems[idx].difference = updatedItems[idx].qty_scan - updatedItems[idx].qty_req;
        }

        setOrderItems(updatedItems);

        setPackageAssignments(prev => {
            const newAssignments: PackageAssignments = { ...prev };
            const pkgNum = currentPackage;

            assignmentsToUpdate.forEach(({ key, qty }) => {
                if (!newAssignments[key]) {
                    newAssignments[key] = {};
                } else {
                    newAssignments[key] = { ...newAssignments[key] };
                }
                const currentVal = newAssignments[key][pkgNum] || 0;
                newAssignments[key][pkgNum] = Math.max(0, currentVal + qty);
                if (newAssignments[key][pkgNum] === 0) {
                    delete newAssignments[key][pkgNum];
                }
                if (Object.keys(newAssignments[key]).length === 0) {
                    delete newAssignments[key];
                }
            });
            return newAssignments;
        });
    }, [orderItems, currentPackage]);

    const handleScan = useCallback((code: string) => {
        if (!code || typeof code !== 'string') return;

        const parsed = parseBarcode(code);
        const cleanCode = (parsed?.itemCode || code).trim().toUpperCase();
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
                const firstLine = orderItems.find(i => i.code === cleanCode) || null;
                setSelectedItem(firstLine);
                setTempQty('1');
                setShowQtyModal(true);
                Vibration.vibrate(50);
            }
        } else {
            Vibration.vibrate([0, 200, 100, 200]);
            Alert.alert(
                '✗ Ítem Incorrecto',
                `El ítem escaneado [${cleanCode}] NO pertenece al pedido actual [${orderNumber}].`,
            );
        }
    }, [orderItems, auditScannerOpen, orderNumber, updateItemQuantity]);

    // Integración de escaneo por hardware (Zebra)
    useDataWedge(handleScan);

    const handleManualQty = (code: string, totalQty: number) => {
        const lines = orderItems.filter(i => i.code === code);
        if (!lines.length) return;

        // Calcular el total escaneado actual en todas las líneas del ítem
        const currentTotalScanned = lines.reduce((sum, l) => sum + l.qty_scan, 0);
        const diffToAdd = totalQty - currentTotalScanned;

        if (diffToAdd !== 0) {
            updateItemQuantity(code, diffToAdd);
        }
    };

    const confirmQuantity = () => {
        if (!selectedItem) return;
        const qtyToAdd = parseInt(tempQty, 10);
        if (isNaN(qtyToAdd) || qtyToAdd <= 0) {
            Alert.alert('Error', 'Ingrese una cantidad válida');
            return;
        }

        const itemCode = selectedItem.code;
        updateItemQuantity(itemCode, qtyToAdd);

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

    const handleConfirmDimensions = (dims: MeasurementDimensions) => {
        setPackageDimensions(prev => ({
            ...prev,
            [currentPackage]: dims,
        }));
        setMeasurementScannerOpen(false);
        Alert.alert('Éxito', `Dimensiones para Bulto ${currentPackage} guardadas.`);
    };

    const handleFinalize = () => {
        const hasDifferences = orderItems.some(i => i.qty_scan !== i.qty_req);
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
                customer_code: customerCode,
                status: orderItems.some(i => i.qty_scan !== i.qty_req) ? 'Con Diferencia' : 'Completo',
                items: orderItems.map(i => ({
                    code: i.code,
                    description: i.description,
                    order_line: i.order_line,
                    qty_req: i.qty_req,
                    qty_scan: i.qty_scan,
                })),
                packages: parseInt(packagesCount || '0', 10),
                packages_assignment: packageAssignments,
                packages_dimensions: Object.entries(packageDimensions).map(([num, dims]) => ({
                    package_number: parseInt(num, 10),
                    ...dims,
                })),
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

    const getItemStyle = (item: PickingOrderItem) => {
        if (item.qty_scan === item.qty_req && item.qty_scan > 0) return styles.itemComplete;
        if (item.qty_scan > item.qty_req) return styles.itemOver;
        return null;
    };

    const getDiffStyle = (diff: number) => {
        if (diff === 0) return styles.diffOk;
        return styles.diffBad;
    };

    const itemsComplete = orderItems.filter(i => i.qty_scan === i.qty_req && i.qty_scan > 0).length;

    const nextPackage = () => setCurrentPackage(prev => prev + 1);
    const prevPackage = () => setCurrentPackage(prev => Math.max(1, prev - 1));

    const getItemsInCurrentPackage = (): PackageItemSummary[] => {
        const list: PackageItemSummary[] = [];
        Object.entries(packageAssignments).forEach(([compositeKey, pkgs]) => {
            const qty = pkgs[currentPackage] || 0;
            if (qty > 0) {
                const [code, orderLine] = compositeKey.split(':');
                const item = orderItems.find(i => i.code === code && String(i.order_line) === orderLine);
                list.push({
                    code,
                    order_line: orderLine,
                    qty,
                    description: item?.description,
                });
            }
        });
        return list;
    };

    const renderItem: ListRenderItem<PickingOrderItem> = ({ item }) => (
        <View style={[styles.itemCard, getItemStyle(item)]}>
            <View style={styles.itemHeader}>
                <View style={styles.itemInfo}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text selectable style={styles.itemCode}>{item.code}</Text>
                        {item.order_line ? (
                            <Text style={styles.orderLineLabel}>Línea {item.order_line}</Text>
                        ) : null}
                    </View>
                    <Text selectable style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
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
                {packageAssignments[`${item.code}:${item.order_line}`] && (
                    <View style={styles.itemPackageInfo}>
                        <Icon name="package-variant" size={14} color="#666" />
                        <Text style={styles.itemPackageText}>
                            {Object.entries(packageAssignments[`${item.code}:${item.order_line}`]).map(([p, q]) => `B${p}: ${q}`).join(' | ')}
                        </Text>
                    </View>
                )}
            </View>
        </View>
    );

    const formatValue = (val: string | null | undefined, fallback = ''): string => {
        if (!val || val === 'None' || val === 'null') return fallback;
        return val;
    };

    const renderRecentOrder: ListRenderItem<RecentOrder> = ({ item }) => (
        <TouchableOpacity
            style={[styles.recentCard, item.is_audited && styles.recentCardAudited]}
            onPress={() => {
                setOrderNumber(formatValue(item.order_number));
                setDespatchNumber(formatValue(item.despatch_number, '00'));
            }}
        >
            <View style={styles.recentHeader}>
                <Text style={[styles.recentOrderNum, item.is_audited && styles.recentOrderNumAudited]}>
                    {formatValue(item.order_number, 'S/N')}
                </Text>
                <View style={styles.recentDespatch}>
                    <Text style={styles.recentDespatchText}>{formatValue(item.despatch_number, '00')}</Text>
                </View>
                <View style={[styles.recentLinesBadge, item.is_audited && styles.recentLinesBadgeAudited]}>
                    <Text style={styles.recentLinesText}>{item.total_lines} líneas</Text>
                </View>
            </View>
            <Text style={styles.recentCustomer} numberOfLines={1}>{formatValue(item.customer_name, 'Sin cliente')}</Text>
            <Text style={styles.recentDate}>{formatValue(item.print_date)}</Text>
        </TouchableOpacity>
    );

    if (auditActive) {
        const pkgItems = getItemsInCurrentPackage();
        const pkgHasDims = !!packageDimensions[currentPackage];

        return (
            <SafeAreaView style={styles.container} edges={['right', 'bottom', 'left']}>
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                    style={styles.flex}
                >
                    <View style={styles.packageBar}>
                        <TouchableOpacity onPress={prevPackage} style={styles.pkgNavButton}>
                            <Icon name="chevron-left" size={28} color={fluent.colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.pkgDisplay, pkgHasDims && styles.pkgDisplayWithDims]}
                            onPress={() => setShowReviewModal(true)}
                        >
                            <Icon name={pkgHasDims ? 'package-variant' : 'package-variant-closed'} size={20} color={pkgHasDims ? fluent.colors.success : fluent.colors.primary} />
                            <Text style={[styles.pkgDisplayText, pkgHasDims && styles.pkgDisplayTextWithDims]}>BULTO {currentPackage}</Text>
                            <View style={[styles.pkgItemCount, pkgHasDims && styles.pkgItemCountWithDims]}>
                                <Text style={styles.pkgItemCountText}>{pkgItems.length} ítems</Text>
                            </View>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setMeasurementScannerOpen(true)} style={styles.pkgMeasureButton}>
                            <Icon name="ruler" size={24} color={fluent.colors.primary} />
                            <Text style={styles.pkgMeasureText}>MEDIR</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={nextPackage} style={styles.pkgNavButton}>
                            <Icon name="plus-circle-outline" size={28} color={fluent.colors.primary} />
                        </TouchableOpacity>
                    </View>

                    <View style={styles.searchBarSection}>
                        <View style={styles.searchBar}>
                            <TouchableOpacity
                                style={styles.scanIconButton}
                                onPress={() => setAuditScannerOpen(true)}
                            >
                                <Icon name="barcode-scan" size={22} color={fluent.colors.neutralPrimary} />
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

                    <View style={styles.progressBar}>
                        <Text style={styles.progressText}>
                            Progreso: {itemsComplete}/{orderItems.length} líneas completadas
                        </Text>
                    </View>

                    <FlatList
                        data={orderItems}
                        renderItem={renderItem}
                        keyExtractor={(item, index) => `${item.code}-${index}`}
                        contentContainerStyle={styles.listContent}
                    />

                    <View style={styles.footer}>
                        <TouchableOpacity
                            style={styles.finalizeButton}
                            onPress={handleFinalize}
                        >
                            <Text style={styles.finalizeButtonText}>Finalizar y Guardar</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>

                <AuditScannerModal
                    visible={auditScannerOpen}
                    orderItems={orderItems}
                    currentPackage={currentPackage}
                    onScan={handleScan}
                    onManualQty={handleManualQty}
                    onClose={() => setAuditScannerOpen(false)}
                />

                <ScannerModal
                    visible={scannerOpen}
                    onScan={handleScan}
                    onClose={() => setScannerOpen(false)}
                />

                <MeasurementScannerModal
                    visible={measurementScannerOpen}
                    packageNumber={currentPackage}
                    onConfirm={handleConfirmDimensions}
                    onClose={() => setMeasurementScannerOpen(false)}
                />

                <Modal visible={showReviewModal} transparent animationType="slide" onRequestClose={() => setShowReviewModal(false)}>
                    <View style={styles.modalOverlay}>
                        <View style={[styles.modalContent, { maxHeight: '80%' }]}>
                            <View style={styles.modalHeaderRow}>
                                <Icon name="package-variant-closed" size={24} color="#1e293b" />
                                <Text style={styles.modalTitle}>Contenido del Bulto {currentPackage}</Text>
                            </View>

                            {pkgHasDims && (
                                <View style={styles.dimensionsReview}>
                                    <Text style={styles.dimTitle}>Dimensiones Capturadas:</Text>
                                    <Text style={styles.dimValue}>
                                        {packageDimensions[currentPackage].length}x
                                        {packageDimensions[currentPackage].width}x
                                        {packageDimensions[currentPackage].height} cm
                                    </Text>
                                </View>
                            )}

                            <ScrollView style={styles.reviewList}>
                                {pkgItems.length === 0 ? (
                                    <Text style={styles.emptyReviewText}>Este bulto está vacío</Text>
                                ) : (
                                    pkgItems.map((it, idx) => (
                                        <View key={idx} style={styles.reviewItem}>
                                            <View style={{ flex: 1 }}>
                                                <Text selectable style={styles.reviewItemCode}>{it.code}</Text>
                                                <Text selectable style={styles.reviewItemDesc} numberOfLines={1}>{it.description}</Text>
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

                <Modal visible={showQtyModal} transparent animationType="fade" onRequestClose={() => {
                    setShowQtyModal(false);
                    setSelectedItem(null);
                }}>
                    <View style={styles.modalOverlay}>
                        <View style={styles.modalContent}>
                            <View style={styles.qtyModalHeader}>
                                <Icon name="package-variant-closed" size={24} color={fluent.colors.primary} />
                                <Text style={styles.qtyModalBadge}>Asignando al Bulto {currentPackage}</Text>
                            </View>
                            <View style={styles.modalHeaderRow}>
                                <Icon name="numeric" size={24} color="#1e293b" />
                                <Text style={styles.modalTitle}>Ingresar Cantidad</Text>
                            </View>
                            <View style={styles.selectedItemBox}>
                                <Text selectable style={styles.selectedItemCode}>{selectedItem?.code}</Text>
                                <Text selectable style={styles.selectedItemDesc} numberOfLines={1}>{selectedItem?.description}</Text>
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

                <Modal visible={showDiffModal} transparent animationType="fade" onRequestClose={() => setShowDiffModal(false)}>
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

                <Modal visible={showPackagesModal} transparent animationType="fade" onRequestClose={() => setShowPackagesModal(false)}>
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

    return (
        <SafeAreaView style={styles.container} edges={['right', 'bottom', 'left']}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.flex}
            >
                <View style={styles.formCard}>
                    <View style={styles.inputRow}>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>Order Number</Text>
                            <TextInput
                                style={styles.input}
                                value={orderNumber}
                                onChangeText={setOrderNumber}
                                placeholder=""
                                autoCapitalize="characters"
                            />
                        </View>
                        <View style={styles.inputGroup}>
                            <Text style={styles.inputLabel}>/Despatch</Text>
                            <TextInput
                                style={styles.input}
                                value={despatchNumber}
                                onChangeText={setDespatchNumber}
                                placeholder=""
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
                    <View style={styles.recentSectionHeader}>
                        <Text style={styles.recentTitle}>Pedidos Recientes</Text>
                        <View style={styles.recentActionsRow}>
                            <TouchableOpacity
                                style={styles.sortButton}
                                onPress={() => setShowSortModal(true)}
                            >
                                <Icon name="sort-variant" size={16} color={fluent.colors.primary} />
                                <Text style={styles.sortButtonText}>
                                    {SORT_OPTIONS.find(o => o.id === sortBy)?.shortLabel || 'Ordenar'}
                                </Text>
                                <Icon name="chevron-down" size={14} color={fluent.colors.primary} />
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={loadRecentOrders}
                                style={styles.refreshIconButton}
                            >
                                <Icon name="refresh" size={18} color={fluent.colors.primary} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <FlatList
                        data={sortedRecentOrders}
                        renderItem={renderRecentOrder}
                        keyExtractor={(item, index) => `${item.order_number}-${index}`}
                        contentContainerStyle={styles.recentList}
                        ListEmptyComponent={
                            <Text style={styles.emptyText}>No hay pedidos recientes</Text>
                        }
                    />
                </View>

                {/* Modal de Organización / Ordenamiento */}
                <Modal
                    visible={showSortModal}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setShowSortModal(false)}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setShowSortModal(false)}
                    >
                        <View style={styles.sortModalCard}>
                            <View style={styles.sortModalHeader}>
                                <View style={styles.sortModalHeaderTitleRow}>
                                    <Icon name="sort-variant" size={20} color={fluent.colors.neutralPrimary} />
                                    <Text style={styles.sortModalTitle}>Organizar Pedidos</Text>
                                </View>
                                <TouchableOpacity
                                    onPress={() => setShowSortModal(false)}
                                    style={styles.sortModalCloseBtn}
                                >
                                    <Icon name="close" size={20} color={fluent.colors.neutralSecondary} />
                                </TouchableOpacity>
                            </View>

                            <View style={styles.sortOptionsList}>
                                {SORT_OPTIONS.map((opt) => {
                                    const isSelected = sortBy === opt.id;
                                    return (
                                        <TouchableOpacity
                                            key={opt.id}
                                            style={[
                                                styles.sortOptionItem,
                                                isSelected && styles.sortOptionItemSelected,
                                            ]}
                                            onPress={() => {
                                                setSortBy(opt.id);
                                                setShowSortModal(false);
                                                Vibration.vibrate(30);
                                            }}
                                        >
                                            <View style={styles.sortOptionLeft}>
                                                <Icon
                                                    name={opt.icon}
                                                    size={20}
                                                    color={isSelected ? fluent.colors.primary : fluent.colors.neutralSecondary}
                                                />
                                                <Text
                                                    style={[
                                                        styles.sortOptionLabel,
                                                        isSelected && styles.sortOptionLabelSelected,
                                                    ]}
                                                >
                                                    {opt.label}
                                                </Text>
                                            </View>
                                            {isSelected && (
                                                <Icon name="check" size={18} color={fluent.colors.primary} />
                                            )}
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    </TouchableOpacity>
                </Modal>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: fluent.colors.pageBg },
    flex: { flex: 1 },
    formCard: { backgroundColor: fluent.colors.cardBg, margin: 12, padding: 16, borderRadius: fluent.radius.sm, borderWidth: 1, borderColor: fluent.colors.neutralLight, ...fluent.shadows.card },
    inputRow: { flexDirection: 'row', gap: 12, marginBottom: 14 },
    inputGroup: { flex: 1 },
    inputLabel: { fontSize: 11, fontWeight: '600', color: fluent.colors.neutralPrimary, marginBottom: 6 },
    input: { backgroundColor: fluent.colors.white, borderWidth: 1, borderColor: fluent.borders.color, borderRadius: fluent.radius.xs, padding: 10, fontSize: 15, color: fluent.colors.neutralPrimary, fontWeight: '600' },
    loadButton: { backgroundColor: fluent.colors.primary, padding: 13, borderRadius: fluent.radius.xs, alignItems: 'center', ...fluent.shadows.card },
    loadButtonText: { color: fluent.colors.white, fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
    recentSection: { flex: 1, paddingHorizontal: 12 },
    recentSectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 10,
        marginTop: 4,
    },
    recentTitle: { fontSize: 15, fontWeight: '600', color: fluent.colors.neutralPrimary },
    recentActionsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sortButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fluent.colors.neutralLighter,
        paddingVertical: 5,
        paddingHorizontal: 8,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        gap: 4,
    },
    sortButtonText: {
        fontSize: 12,
        fontWeight: '600',
        color: fluent.colors.primary,
    },
    refreshIconButton: {
        padding: 5,
        backgroundColor: fluent.colors.neutralLighter,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        alignItems: 'center',
        justifyContent: 'center',
    },
    recentList: { paddingBottom: 20 },
    recentCard: { backgroundColor: fluent.colors.cardBg, padding: 14, borderRadius: fluent.radius.sm, marginBottom: 8, borderWidth: 1, borderColor: fluent.colors.neutralLight, ...fluent.shadows.card },
    recentCardAudited: { backgroundColor: fluent.colors.neutralLighter, borderColor: fluent.borders.color },
    recentHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, justifyContent: 'space-between' },
    recentOrderNum: { fontSize: 16, fontWeight: '700', color: fluent.colors.primaryDarker },
    recentOrderNumAudited: { color: fluent.colors.neutralSecondary },
    recentDespatch: { backgroundColor: fluent.colors.neutralLighter, paddingHorizontal: 8, paddingVertical: 2, borderRadius: fluent.radius.xs, marginLeft: 8 },
    recentDespatchText: { fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: fluent.colors.neutralSecondary },
    recentLinesBadge: { backgroundColor: fluent.colors.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: fluent.radius.xs },
    recentLinesBadgeAudited: { backgroundColor: fluent.colors.neutralTertiaryAlt },
    recentLinesText: { color: fluent.colors.white, fontSize: 10, fontWeight: 'bold' },
    recentCustomer: { fontSize: 13, color: fluent.colors.neutralPrimary, fontWeight: '500', marginBottom: 4 },
    recentDate: { fontSize: 11, color: fluent.colors.neutralTertiary, textAlign: 'right' },
    emptyText: { textAlign: 'center', color: fluent.colors.neutralSecondary, padding: 20 },
    packageBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: fluent.colors.white, paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: fluent.colors.neutralLight },
    pkgNavButton: { padding: 4 },
    pkgDisplay: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: fluent.colors.primaryLighterAlt, marginHorizontal: 10, paddingVertical: 7, borderRadius: fluent.radius.xs, borderWidth: 1, borderColor: fluent.colors.primaryLight, gap: 8 },
    pkgDisplayWithDims: { backgroundColor: fluent.colors.successLight, borderColor: fluent.colors.successBorder },
    pkgDisplayText: { fontSize: 14, fontWeight: '700', color: fluent.colors.primaryDarker },
    pkgDisplayTextWithDims: { color: fluent.colors.success },
    pkgItemCount: { backgroundColor: fluent.colors.primary, paddingHorizontal: 7, paddingVertical: 2, borderRadius: fluent.radius.xs },
    pkgItemCountWithDims: { backgroundColor: fluent.colors.success },
    pkgItemCountText: { color: fluent.colors.white, fontSize: 10, fontWeight: 'bold' },
    pkgMeasureButton: { alignItems: 'center', justifyContent: 'center', marginLeft: 6 },
    pkgMeasureText: { fontSize: 8, fontWeight: 'bold', color: fluent.colors.primary, marginTop: -2 },
    searchBarSection: { padding: 12, backgroundColor: fluent.colors.white },
    searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: fluent.colors.neutralLighterAlt, borderRadius: fluent.radius.sm, paddingHorizontal: 8, height: 50, borderWidth: 1, borderColor: fluent.borders.color },
    scanIconButton: { width: 68, height: 38, borderRadius: fluent.radius.xs, backgroundColor: fluent.colors.neutralLighter, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: fluent.borders.color },
    scanIconText: { fontSize: 9, color: fluent.colors.neutralPrimary, fontWeight: '700', marginTop: -2 },
    searchBarInput: { flex: 1, fontSize: 15, color: fluent.colors.neutralPrimary, paddingHorizontal: 10, height: '100%', fontWeight: '600' },
    searchConfirmButton: { width: 38, height: 38, borderRadius: fluent.radius.xs, backgroundColor: fluent.colors.primary, alignItems: 'center', justifyContent: 'center' },
    searchConfirmButtonDisabled: { backgroundColor: fluent.colors.neutralTertiaryAlt },
    progressBar: { backgroundColor: fluent.colors.neutralLighterAlt, paddingVertical: 6, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: fluent.colors.neutralLight },
    progressText: { fontSize: 12, color: fluent.colors.neutralSecondary, textAlign: 'center' },
    listContent: { padding: 12, paddingBottom: 100 },
    itemCard: { backgroundColor: fluent.colors.cardBg, borderRadius: fluent.radius.sm, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: fluent.colors.neutralLight, ...fluent.shadows.card },
    itemComplete: { backgroundColor: fluent.colors.successLight, borderColor: fluent.colors.successBorder },
    itemOver: { backgroundColor: fluent.colors.errorLight, borderColor: fluent.colors.errorBorder },
    itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
    itemInfo: { flex: 1, marginRight: 10 },
    itemCode: { fontSize: 15, fontWeight: '700', color: fluent.colors.primaryDarker },
    orderLineLabel: { fontSize: 10, color: fluent.colors.neutralSecondary, fontWeight: '600', backgroundColor: fluent.colors.neutralLighter, paddingHorizontal: 6, paddingVertical: 2, borderRadius: fluent.radius.xs },
    itemDesc: { fontSize: 12, color: fluent.colors.neutralSecondary, marginTop: 2 },
    diffBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: fluent.radius.xs },
    diffOk: { backgroundColor: fluent.colors.successLight },
    diffBad: { backgroundColor: fluent.colors.errorLight },
    diffText: { fontSize: 11, fontWeight: 'bold', color: fluent.colors.neutralPrimary },
    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    qtyBox: { minWidth: 65 },
    qtyLabel: { fontSize: 9, color: fluent.colors.neutralSecondary, textTransform: 'uppercase', marginBottom: 2, fontWeight: '600' },
    qtyValue: { fontSize: 16, fontWeight: 'bold', color: fluent.colors.neutralPrimary },
    qtyScanned: { color: fluent.colors.primary },
    itemPackageInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: fluent.colors.neutralLighter, paddingHorizontal: 8, paddingVertical: 4, borderRadius: fluent.radius.xs, gap: 4 },
    itemPackageText: { fontSize: 10, color: fluent.colors.neutralPrimary, fontWeight: '500' },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: fluent.colors.white, borderTopWidth: 1, borderTopColor: fluent.colors.neutralLight, padding: 14 },
    finalizeButton: { backgroundColor: fluent.colors.primary, padding: 14, borderRadius: fluent.radius.xs, alignItems: 'center', ...fluent.shadows.card },
    finalizeButtonText: { color: fluent.colors.white, fontSize: 15, fontWeight: '600' },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: fluent.colors.cardBg, borderRadius: fluent.radius.sm, padding: 20, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: fluent.colors.neutralLight, ...fluent.shadows.elevated },
    modalHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    modalTitle: { fontSize: 16, fontWeight: '700', color: fluent.colors.neutralPrimary },
    modalText: { fontSize: 13, color: fluent.colors.neutralSecondary, marginBottom: 14 },
    modalButtons: { flexDirection: 'row', gap: 10 },
    modalButton: { flex: 1, padding: 12, borderRadius: fluent.radius.xs, alignItems: 'center' },
    modalButtonSecondary: { backgroundColor: fluent.colors.neutralLighter, borderWidth: 1, borderColor: fluent.borders.color },
    modalButtonPrimary: { backgroundColor: fluent.colors.primary },
    modalButtonWarning: { backgroundColor: fluent.colors.warningText },
    modalButtonTextSecondary: { color: fluent.colors.neutralPrimary, fontWeight: '600', fontSize: 13 },
    modalButtonTextPrimary: { color: fluent.colors.white, fontWeight: '600', fontSize: 13 },
    qtyModalHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 8 },
    qtyModalBadge: { fontSize: 13, fontWeight: '600', color: fluent.colors.primaryDarker, backgroundColor: fluent.colors.primaryLighterAlt, paddingHorizontal: 10, paddingVertical: 4, borderRadius: fluent.radius.xs },
    selectedItemBox: { backgroundColor: fluent.colors.neutralLighterAlt, padding: 12, borderRadius: fluent.radius.xs, borderWidth: 1, borderColor: fluent.borders.color, marginBottom: 14 },
    selectedItemCode: { fontSize: 15, fontWeight: '700', color: fluent.colors.primaryDarker },
    selectedItemDesc: { fontSize: 11, color: fluent.colors.neutralSecondary, marginTop: 2 },
    packagesInput: { backgroundColor: fluent.colors.white, borderWidth: 1.5, borderColor: fluent.colors.primary, borderRadius: fluent.radius.xs, padding: 10, fontSize: 22, textAlign: 'center', color: fluent.colors.neutralPrimary, marginBottom: 18, fontWeight: 'bold' },
    reviewList: { marginTop: 8 },
    reviewItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: fluent.colors.neutralLight },
    reviewItemCode: { fontSize: 13, fontWeight: '700', color: fluent.colors.neutralPrimary },
    reviewItemDesc: { fontSize: 11, color: fluent.colors.neutralSecondary },
    reviewItemQty: { fontSize: 15, fontWeight: '700', color: fluent.colors.primary, marginLeft: 10 },
    emptyReviewText: { textAlign: 'center', color: fluent.colors.neutralSecondary, padding: 20, fontStyle: 'italic' },
    dimensionsReview: { backgroundColor: fluent.colors.neutralLighterAlt, padding: 10, borderRadius: fluent.radius.xs, marginBottom: 12, borderLeftWidth: 3, borderLeftColor: fluent.colors.primary },
    dimTitle: { fontSize: 10, fontWeight: '600', color: fluent.colors.neutralSecondary, textTransform: 'uppercase' },
    dimValue: { fontSize: 14, fontWeight: '700', color: fluent.colors.neutralPrimary, marginTop: 2 },
    sortModalCard: {
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        padding: 16,
        width: '100%',
        maxWidth: 340,
        borderWidth: 1,
        borderColor: fluent.colors.neutralLight,
        ...fluent.shadows.elevated,
    },
    sortModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: fluent.colors.neutralLight,
    },
    sortModalHeaderTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    sortModalTitle: {
        fontSize: 15,
        fontWeight: '700',
        color: fluent.colors.neutralPrimary,
    },
    sortModalCloseBtn: {
        padding: 4,
    },
    sortOptionsList: {
        gap: 6,
    },
    sortOptionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: fluent.radius.xs,
        backgroundColor: fluent.colors.neutralLighterAlt,
        borderWidth: 1,
        borderColor: 'transparent',
    },
    sortOptionItemSelected: {
        backgroundColor: fluent.colors.primaryLighterAlt,
        borderColor: fluent.colors.primaryLight,
    },
    sortOptionLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    sortOptionLabel: {
        fontSize: 13,
        color: fluent.colors.neutralPrimary,
        fontWeight: '500',
    },
    sortOptionLabelSelected: {
        color: fluent.colors.primaryDarker,
        fontWeight: '700',
    },
});

export default PickingScreen;
