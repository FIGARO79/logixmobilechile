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
    Vibration,
    ListRenderItem,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { isAxiosError } from 'axios';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import client from '../api/client';
import ScannerModal from './ScannerModal';
import useDataWedge from '../hooks/useDataWedge';
import fluent from '../theme/fluent';

interface DailyCountItem {
    item_code: string;
    description?: string;
    bin_location?: string;
    system_qty?: number;
    physical_qty: string;
    abc_code?: string;
    status: 'pending' | 'counted' | 'saved' | string;
    is_difference?: boolean;
    additional_locations?: string;
    additional_bins?: string;
    aditionalBins?: string;
    additional_bin?: string;
    aditional_bins?: string;
}

interface CalendarIconProps {
    size?: number;
    color?: string;
}

// Calendar Icon component (Custom SVG-like)
const CalendarIcon: React.FC<CalendarIconProps> = ({
    size = 20,
    color = '#fff',
}) => (
    <View style={{ width: size, height: size }}>
        <View
            style={{
                position: 'absolute',
                top: size * 0.15,
                left: 0,
                right: 0,
                bottom: 0,
                borderWidth: 1.5,
                borderColor: color,
                borderRadius: 2,
            }}
        />
        <View
            style={{
                position: 'absolute',
                top: size * 0.15,
                left: 0,
                right: 0,
                height: size * 0.25,
                backgroundColor: color,
                borderTopLeftRadius: 2,
                borderTopRightRadius: 2,
            }}
        />
        <View
            style={{
                position: 'absolute',
                top: 0,
                left: size * 0.2,
                width: 2,
                height: size * 0.25,
                backgroundColor: color,
                borderRadius: 1,
            }}
        />
        <View
            style={{
                position: 'absolute',
                top: 0,
                right: size * 0.2,
                width: 2,
                height: size * 0.25,
                backgroundColor: color,
                borderRadius: 1,
            }}
        />
        <View
            style={{
                position: 'absolute',
                top: size * 0.55,
                left: size * 0.2,
                width: 3,
                height: 3,
                backgroundColor: color,
                borderRadius: 1,
            }}
        />
        <View
            style={{
                position: 'absolute',
                top: size * 0.55,
                left: size * 0.45,
                width: 3,
                height: 3,
                backgroundColor: color,
                borderRadius: 1,
            }}
        />
        <View
            style={{
                position: 'absolute',
                top: size * 0.55,
                right: size * 0.2,
                width: 3,
                height: 3,
                backgroundColor: color,
                borderRadius: 1,
            }}
        />
        <View
            style={{
                position: 'absolute',
                top: size * 0.75,
                left: size * 0.2,
                width: 3,
                height: 3,
                backgroundColor: color,
                borderRadius: 1,
            }}
        />
        <View
            style={{
                position: 'absolute',
                top: size * 0.75,
                left: size * 0.45,
                width: 3,
                height: 3,
                backgroundColor: color,
                borderRadius: 1,
            }}
        />
    </View>
);

const CyclicCount: React.FC = () => {
    const today = new Date().toISOString().split('T')[0];
    const [selectedDate, setSelectedDate] = useState(today);
    const [items, setItems] = useState<DailyCountItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [itemsWithDiffCount, setItemsWithDiffCount] = useState(0);
    const [isFilteringDifferences, setIsFilteringDifferences] = useState(false);
    const flatListRef = useRef<FlatList<DailyCountItem> | null>(null);
    const inputRefs = useRef<Record<number, TextInput | null>>({});

    function handleScan(code: string) {
        setScannerOpen(false);
        const cleanCode = code.trim().toUpperCase();

        // Feedback instantáneo
        Vibration.vibrate(70);

        setTimeout(() => {
            const index = items.findIndex(
                (i) => i.item_code?.toString().trim().toUpperCase() === cleanCode
            );

            if (index !== -1) {
                flatListRef.current?.scrollToIndex({
                    index,
                    animated: true,
                    viewPosition: 0.5,
                });
                setTimeout(() => {
                    inputRefs.current[index]?.focus();
                }, 300);
            } else {
                Vibration.vibrate([0, 150, 100, 150]);
                Alert.alert('No Encontrado', 'El ítem no está en la lista de hoy');
            }
        }, 0);
    }

    useDataWedge(handleScan);

    const fetchDailyItems = async (date: string) => {
        setLoading(true);
        setItems([]);
        setItemsWithDiffCount(0);
        try {
            const response = await client.get<{
                items?: DailyCountItem[];
                has_previous_counts?: boolean;
                previous_count?: number;
                items_with_diff_count?: number;
            }>(`/api/planner/execution/daily_items?date=${date}`);
            const data = response.data;
            const itemsList = data.items || [];

            const hasPrev = Boolean(data.has_previous_counts);
            const prevCount = data.previous_count || 0;
            const diffCount = data.items_with_diff_count || 0;

            setItemsWithDiffCount(diffCount);

            if (hasPrev) {
                const diffMsg =
                    diffCount > 0 ? `, ${diffCount} con diferencias` : '';
                Alert.alert(
                    '⚠️ Conteos Previos Registrados',
                    `La fecha seleccionada (${date}) ya cuenta con ${prevCount} conteo(s) previo(s) registrado(s)${diffMsg}.`
                );
            }

            const initializedItems: DailyCountItem[] = itemsList.map((item) => {
                const prevQty =
                    item.physical_qty !== undefined &&
                    item.physical_qty !== null
                        ? String(item.physical_qty)
                        : '';
                const isCounted =
                    item.status === 'saved' ||
                    item.status === 'counted' ||
                    prevQty !== '';
                return {
                    ...item,
                    physical_qty: prevQty,
                    status: isCounted ? item.status || 'saved' : 'pending',
                };
            });
            setItems(initializedItems);
        } catch (err) {
            console.error('Error loading items:', err);
            const errorMsg = isAxiosError(err)
                ? (
                      err.response?.data as
                          | { detail?: string; error?: string }
                          | undefined
                  )?.detail ||
                  (
                      err.response?.data as
                          | { detail?: string; error?: string }
                          | undefined
                  )?.error ||
                  'Error al cargar ítems'
                : 'Error al cargar ítems';
            Alert.alert('Error', errorMsg);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (selectedDate) {
            fetchDailyItems(selectedDate);
            setIsFilteringDifferences(false);
        }
    }, [selectedDate]);

    const fetchItemsWithDifferences = async () => {
        setLoading(true);
        try {
            const response = await client.get<{ items?: DailyCountItem[] }>(
                `/api/planner/execution/items_with_differences?date=${selectedDate}`
            );
            const data = response.data;
            const itemsList = data.items || [];
            const initializedItems: DailyCountItem[] = itemsList.map((item) => ({
                ...item,
                physical_qty: '',
                status: 'pending',
                is_difference: true,
            }));
            setItems(initializedItems);
            setIsFilteringDifferences(true);
        } catch (err) {
            console.error('Error loading differences:', err);
            Alert.alert('Error', 'No se pudieron cargar las diferencias');
        } finally {
            setLoading(false);
        }
    };

    const handleCountChange = (index: number, value: string) => {
        const newItems = [...items];
        newItems[index].physical_qty = value;
        newItems[index].status = value !== '' ? 'counted' : 'pending';
        setItems(newItems);
    };

    const executeSave = async () => {
        const countedItems = items.filter((item) => item.status === 'counted');
        setSaving(true);
        try {
            const payload = {
                date: selectedDate,
                items: countedItems.map((item) => ({
                    item_code: item.item_code,
                    description: item.description,
                    bin_location: item.bin_location || 'N/A',
                    system_qty: item.system_qty || 0,
                    physical_qty: parseInt(item.physical_qty, 10) || 0,
                    abc_code: item.abc_code,
                })),
            };
            await client.post('/api/planner/execution/save', payload);
            Alert.alert('Éxito', 'Conteos guardados correctamente');
            setItems(
                items.map((item) =>
                    item.status === 'counted'
                        ? { ...item, status: 'saved' }
                        : item
                )
            );
        } catch (err) {
            console.error('Save error:', err);
            Alert.alert('Error', 'No se pudieron guardar los conteos.');
        } finally {
            setSaving(false);
        }
    };

    const handleBulkSave = () => {
        const countedItems = items.filter((item) => item.status === 'counted');
        if (countedItems.length === 0) {
            Alert.alert('Aviso', 'No hay ítems para guardar');
            return;
        }
        Alert.alert('Confirmar', `¿Guardar ${countedItems.length} conteos?`, [
            { text: 'Cancelar', style: 'cancel' },
            { text: 'Guardar', onPress: executeSave },
        ]);
    };

    const countedCount = items.filter(
        (i) => i.status === 'counted' || i.status === 'saved'
    ).length;

    const getAbcBadgeStyle = (abc?: string) => {
        switch (abc) {
            case 'A':
                return { backgroundColor: '#fee2e2', color: '#b91c1c' };
            case 'B':
                return { backgroundColor: '#fef3c7', color: '#b45309' };
            case 'C':
                return { backgroundColor: '#dbeafe', color: '#1d4ed8' };
            default:
                return { backgroundColor: '#f3f4f6', color: '#6b7280' };
        }
    };

    const renderItem: ListRenderItem<DailyCountItem> = ({ item, index }) => {
        const abcStyle = getAbcBadgeStyle(item.abc_code);
        const isSaved = item.status === 'saved';
        const additionalBins =
            item.additional_locations ||
            item.additional_bins ||
            item.aditionalBins ||
            item.additional_bin ||
            item.aditional_bins ||
            '';

        return (
            <View
                style={[
                    styles.itemCard,
                    isSaved && styles.itemCardSaved,
                    item.is_difference && styles.itemCardDiff,
                ]}
            >
                <View style={styles.itemHeader}>
                    <View style={styles.itemInfo}>
                        <Text selectable style={styles.itemCode}>{item.item_code}</Text>
                        <Text selectable style={styles.itemDesc} numberOfLines={1}>
                            {item.description}
                        </Text>
                    </View>
                    <View
                        style={[
                            styles.abcBadge,
                            { backgroundColor: abcStyle.backgroundColor },
                        ]}
                    >
                        <Text
                            style={[styles.abcText, { color: abcStyle.color }]}
                        >
                            {item.abc_code}
                        </Text>
                    </View>
                </View>
                <View style={styles.itemRow}>
                    <View style={styles.locationSection}>
                        <Text style={styles.fieldLabel}>Ubicación</Text>
                        <View style={styles.locationBadge}>
                            <Text style={styles.locationText}>
                                {item.bin_location || 'N/A'}
                            </Text>
                        </View>
                    </View>
                    <View style={styles.qtySection}>
                        <Text style={styles.fieldLabel}>Cant. Física</Text>
                        <TextInput
                            ref={(el) => {
                                inputRefs.current[index] = el;
                            }}
                            style={[
                                styles.qtyInput,
                                isSaved && styles.qtyInputDisabled,
                                item.is_difference && styles.qtyInputDiff,
                            ]}
                            value={item.physical_qty}
                            onChangeText={(value) =>
                                handleCountChange(index, value)
                            }
                            keyboardType="numeric"
                            placeholder="0"
                            editable={!isSaved}
                            selectTextOnFocus={true}
                        />
                    </View>
                </View>
                {Boolean(additionalBins && additionalBins.trim()) && (
                    <View style={styles.additionalBinsContainer}>
                        <Text style={styles.fieldLabel}>
                            Ubicaciones Adicionales
                        </Text>
                        <View style={styles.additionalBinsRow}>
                            {additionalBins.split(',').map((bin, bIdx) =>
                                bin.trim() ? (
                                    <View
                                        key={bIdx}
                                        style={styles.additionalBinBadge}
                                    >
                                        <Text style={styles.additionalBinText}>
                                            {bin.trim()}
                                        </Text>
                                    </View>
                                ) : null
                            )}
                        </View>
                    </View>
                )}
                {isSaved && (
                    <View style={styles.savedBadge}>
                        <Icon name="check-circle" size={16} color="#16a34a" />
                        <Text style={styles.savedText}>Guardado</Text>
                    </View>
                )}
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.flex}
        >
            <View style={styles.controlsCard}>
                <TouchableOpacity
                    style={styles.dateButton}
                    onPress={() => setShowDatePicker(true)}
                >
                    <CalendarIcon size={20} color={fluent.colors.primary} />
                    <Text style={styles.dateText}>{selectedDate}</Text>
                </TouchableOpacity>
                {showDatePicker && (
                    <DateTimePicker
                        value={new Date(selectedDate + 'T12:00:00')}
                        mode="date"
                        display={
                            Platform.OS === 'ios' ? 'spinner' : 'calendar'
                        }
                        onChange={(_event, date) => {
                            setShowDatePicker(Platform.OS === 'ios');
                            if (date)
                                setSelectedDate(
                                    date.toISOString().split('T')[0]
                                );
                        }}
                    />
                )}
                <View style={styles.buttonRow}>
                    <TouchableOpacity
                        style={styles.refreshButton}
                        onPress={() => fetchDailyItems(selectedDate)}
                    >
                        <Text style={styles.buttonText}>
                            {isFilteringDifferences
                                ? 'Ver Todos'
                                : 'Actualizar'}
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.scanButton}
                        onPress={() => setScannerOpen(true)}
                    >
                        <Icon
                            name="barcode-scan"
                            size={20}
                            color={fluent.colors.white}
                        />
                        <Text style={styles.buttonText}>Escanear</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {itemsWithDiffCount > 0 && !isFilteringDifferences && (
                <TouchableOpacity
                    style={styles.diffBanner}
                    onPress={fetchItemsWithDifferences}
                >
                    <View style={styles.diffBannerIcon}>
                        <Icon
                            name="alert-circle"
                            size={24}
                            color={fluent.colors.warningText}
                        />
                    </View>
                    <View style={styles.diffBannerContent}>
                        <Text style={styles.diffBannerTitle}>
                            Diferencias Encontradas
                        </Text>
                        <Text style={styles.diffBannerText}>
                            Hay {itemsWithDiffCount} ítems con diferencias. Toca
                            para corregir.
                        </Text>
                    </View>
                    <Text style={styles.diffBannerAction}>CORREGIR →</Text>
                </TouchableOpacity>
            )}

            {loading ? (
                <View style={styles.loadingContainer}>
                    <ActivityIndicator
                        size="large"
                        color={fluent.colors.primary}
                    />
                    <Text style={styles.loadingText}>Cargando ítems...</Text>
                </View>
            ) : items.length === 0 ? (
                <View style={styles.emptyContainer}>
                    <Icon
                        name="clipboard-text-outline"
                        size={60}
                        color={fluent.colors.neutralTertiaryAlt}
                    />
                    <Text style={styles.emptyText}>
                        No hay ítems planificados para esta fecha.
                    </Text>
                </View>
            ) : (
                <>
                    <FlatList
                        ref={flatListRef}
                        data={items}
                        renderItem={renderItem}
                        keyExtractor={(item, index) =>
                            `${item.item_code}-${index}`
                        }
                        contentContainerStyle={styles.listContent}
                    />
                    <View style={styles.footer}>
                        <Text style={styles.counterText}>
                            Items contados:{' '}
                            <Text style={styles.counterBold}>
                                {countedCount}
                            </Text>{' '}
                            / {items.length}
                        </Text>
                        <TouchableOpacity
                            style={[
                                styles.saveButton,
                                countedCount === 0 && styles.saveButtonDisabled,
                            ]}
                            onPress={handleBulkSave}
                            disabled={saving || countedCount === 0}
                        >
                            {saving ? (
                                <ActivityIndicator color="#fff" size="small" />
                            ) : (
                                <Text style={styles.saveButtonText}>
                                    Guardar
                                </Text>
                            )}
                        </TouchableOpacity>
                    </View>
                </>
            )}
            <ScannerModal
                visible={scannerOpen}
                onScan={handleScan}
                onClose={() => setScannerOpen(false)}
            />
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    flex: { flex: 1 },
    controlsCard: {
        backgroundColor: fluent.colors.cardBg,
        margin: 12,
        padding: 14,
        borderRadius: fluent.radius.sm,
        borderWidth: 1,
        borderColor: fluent.colors.neutralLight,
        ...fluent.shadows.card,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fluent.colors.neutralLighterAlt,
        padding: 10,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        gap: 10,
        marginBottom: 12,
    },
    dateText: {
        fontSize: 15,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    buttonRow: { flexDirection: 'row', gap: 10 },
    refreshButton: {
        flex: 1,
        backgroundColor: fluent.colors.primary,
        padding: 11,
        borderRadius: fluent.radius.xs,
        alignItems: 'center',
        ...fluent.shadows.card,
    },
    scanButton: {
        flex: 1,
        backgroundColor: fluent.colors.neutralPrimary,
        padding: 11,
        borderRadius: fluent.radius.xs,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    buttonText: { color: fluent.colors.white, fontSize: 13, fontWeight: '600' },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: { marginTop: 12, color: fluent.colors.neutralSecondary },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        fontSize: 13,
        color: fluent.colors.neutralSecondary,
        textAlign: 'center',
        marginTop: 16,
    },
    listContent: { padding: 12, paddingBottom: 100 },
    itemCard: {
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: fluent.colors.neutralLight,
        ...fluent.shadows.card,
    },
    itemCardSaved: {
        backgroundColor: fluent.colors.successLight,
        borderColor: fluent.colors.successBorder,
    },
    itemCardDiff: { borderColor: fluent.colors.error, borderLeftWidth: 3 },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 10,
    },
    itemInfo: { flex: 1, marginRight: 10 },
    itemCode: {
        fontSize: 15,
        fontWeight: '700',
        color: fluent.colors.primaryDarker,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    itemDesc: {
        fontSize: 12,
        color: fluent.colors.neutralSecondary,
        marginTop: 2,
    },
    abcBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: fluent.radius.xs,
    },
    abcText: { fontSize: 11, fontWeight: 'bold' },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    locationSection: { flex: 1 },
    locationBadge: {
        backgroundColor: fluent.colors.neutralLighter,
        paddingHorizontal: 8,
        paddingVertical: 5,
        borderRadius: fluent.radius.xs,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: fluent.borders.color,
    },
    locationText: {
        fontSize: 12,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    qtySection: { alignItems: 'flex-end' },
    fieldLabel: {
        fontSize: 9,
        color: fluent.colors.neutralSecondary,
        textTransform: 'uppercase',
        marginBottom: 3,
        fontWeight: '600',
    },
    qtyInput: {
        width: 75,
        backgroundColor: fluent.colors.white,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        borderRadius: fluent.radius.xs,
        padding: 8,
        fontSize: 16,
        fontWeight: 'bold',
        textAlign: 'center',
        color: fluent.colors.neutralPrimary,
    },
    qtyInputDisabled: {
        backgroundColor: fluent.colors.neutralLighter,
        color: fluent.colors.neutralSecondary,
    },
    qtyInputDiff: {
        borderColor: fluent.colors.error,
        backgroundColor: fluent.colors.errorLight,
    },
    savedBadge: {
        marginTop: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-end',
        gap: 4,
    },
    savedText: { fontSize: 11, fontWeight: 'bold', color: fluent.colors.success },
    additionalBinsContainer: { marginTop: 6 },
    additionalBinsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 2,
    },
    additionalBinBadge: {
        backgroundColor: fluent.colors.neutralLighter,
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.borders.color,
    },
    additionalBinText: {
        color: fluent.colors.neutralSecondary,
        fontSize: 11,
        fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    diffBanner: {
        backgroundColor: fluent.colors.warningLight,
        marginHorizontal: 12,
        marginBottom: 12,
        padding: 12,
        borderRadius: fluent.radius.sm,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: fluent.colors.warningBorder,
    },
    diffBannerIcon: {
        width: 36,
        height: 36,
        borderRadius: fluent.radius.xs,
        backgroundColor: fluent.colors.white,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 10,
    },
    diffBannerContent: { flex: 1 },
    diffBannerTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: fluent.colors.warningText,
    },
    diffBannerText: { fontSize: 11, color: fluent.colors.neutralPrimary },
    diffBannerAction: {
        fontSize: 11,
        fontWeight: '700',
        color: fluent.colors.primary,
        marginLeft: 8,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: fluent.colors.white,
        borderTopWidth: 1,
        borderTopColor: fluent.colors.neutralLight,
        padding: 14,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    counterText: { fontSize: 13, color: fluent.colors.neutralPrimary },
    counterBold: { fontWeight: '700', color: fluent.colors.primary },
    saveButton: {
        backgroundColor: fluent.colors.primary,
        paddingHorizontal: 22,
        paddingVertical: 10,
        borderRadius: fluent.radius.xs,
        ...fluent.shadows.card,
    },
    saveButtonDisabled: { backgroundColor: fluent.colors.neutralTertiaryAlt },
    saveButtonText: {
        color: fluent.colors.white,
        fontSize: 13,
        fontWeight: '600',
    },
});

export default CyclicCount;
