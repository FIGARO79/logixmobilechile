import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { isAxiosError } from 'axios';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import client from '../api/client';
import ScannerModal from '../components/ScannerModal';
import useDataWedge from '../hooks/useDataWedge';
import { parseBarcode } from '../utils/barcodeParser';
import fluent from '../theme/fluent';
import type { RootStackParamList } from '../navigation/AppNavigator';

interface StockItemData {
    itemCode: string;
    description?: string;
    binLocation?: string;
    physicalQty?: number | string;
    frozenQty?: number | string;
    frozen_qty?: number | string;
    frozen?: number | string;
    aditionalBins?: string;
    weight?: number | string;
    dateLastReceived?: string;
    itemType?: string;
    sicCode?: string;
    supersededBy?: string;
}

type Props = NativeStackScreenProps<RootStackParamList, 'Stock'>;

const StockScreen: React.FC<Props> = ({ navigation }) => {
    const [itemCode, setItemCode] = useState('');
    const [itemData, setItemData] = useState<StockItemData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);

    const executeSearch = async (code: string) => {
        const parsed = parseBarcode(code);
        const cleanCode = (parsed?.itemCode || code)
            ?.toString()
            .trim()
            .toUpperCase();
        if (!cleanCode) {
            Alert.alert('Error', 'Ingresa un código de ítem');
            return;
        }

        setLoading(true);
        setError('');
        setItemData(null);

        try {
            // Se limpia el código de posibles espacios ocultos o caracteres de control
            const sanitizedCode = cleanCode.replace(
                /[\u0000-\u001F\u007F-\u009F]/g,
                ''
            );
            const response = await client.get<StockItemData>(
                `/api/find_item/${encodeURIComponent(sanitizedCode)}/NA`
            );

            if (response.data) {
                setItemData(response.data);
                setItemCode(''); // Clear input on success
                Vibration.vibrate(100);
            } else {
                throw new Error('No se recibieron datos del servidor');
            }
        } catch (err) {
            if (isAxiosError(err)) {
                console.error(
                    'Search error:',
                    err.response?.status,
                    err.response?.data
                );
            } else {
                console.error('Search error:', err);
            }
            Vibration.vibrate([0, 200, 100, 200]);

            let errorMsg = 'Ítem no encontrado';
            if (isAxiosError(err)) {
                const errData = err.response?.data as
                    | { error?: string; detail?: string }
                    | undefined;
                if (err.response?.status === 404) {
                    errorMsg = `El ítem [${cleanCode}] no existe en el sistema.`;
                } else if (errData?.error || errData?.detail) {
                    errorMsg = errData.error || errData.detail || errorMsg;
                }
            }

            setError(errorMsg);
            Alert.alert('Sin Resultados', errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = () => {
        executeSearch(itemCode);
    };

    const handleScan = (code: string) => {
        setScannerOpen(false);
        setItemCode(code);
        executeSearch(code);
    };

    // Integración de escaneo por hardware (Zebra)
    useDataWedge(handleScan);

    const clearSearch = () => {
        setItemCode('');
        setItemData(null);
        setError('');
    };

    const hasStock = parseInt(String(itemData?.physicalQty ?? 0), 10) > 0;

    return (
        <SafeAreaView
            style={styles.container}
            edges={['right', 'bottom', 'left']}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                <ScrollView
                    style={styles.content}
                    keyboardShouldPersistTaps="handled"
                >
                    {/* Search Card */}
                    <View style={styles.card}>
                        <View style={styles.cardHeaderRow}>
                            <View style={styles.cardTitleGroup}>
                                <Icon
                                    name="magnify"
                                    size={20}
                                    color={fluent.colors.neutralPrimary}
                                />
                                <Text style={styles.cardHeader}>
                                    Búsqueda de Stock
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={styles.spotCheckButton}
                                onPress={() => navigation.navigate('SpotCheck')}
                            >
                                <Icon
                                    name="plus-circle-outline"
                                    size={16}
                                    color={fluent.colors.primary}
                                />
                                <Text style={styles.spotCheckButtonText}>
                                    SPOT CHECK
                                </Text>
                            </TouchableOpacity>
                        </View>

                        <Text style={styles.label}>Código de Ítem</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                style={styles.input}
                                value={itemCode}
                                onChangeText={(text) =>
                                    setItemCode(text.toUpperCase())
                                }
                                placeholder=""
                                autoCapitalize="characters"
                                returnKeyType="search"
                                onSubmitEditing={handleSearch}
                            />
                            <TouchableOpacity
                                style={styles.scanIconButton}
                                onPress={() => setScannerOpen(true)}
                            >
                                <Icon
                                    name="barcode-scan"
                                    size={24}
                                    color={fluent.colors.neutralPrimary}
                                />
                            </TouchableOpacity>
                        </View>

                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                style={[
                                    styles.button,
                                    styles.buttonPrimary,
                                    styles.buttonFlexConsult,
                                ]}
                                onPress={handleSearch}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator
                                        color="#fff"
                                        size="small"
                                    />
                                ) : (
                                    <Text
                                        style={styles.buttonText}
                                        numberOfLines={1}
                                    >
                                        Consultar
                                    </Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[
                                    styles.button,
                                    styles.buttonSecondary,
                                    styles.buttonFlexClear,
                                ]}
                                onPress={clearSearch}
                            >
                                <Text
                                    style={styles.buttonSecondaryText}
                                    numberOfLines={1}
                                >
                                    Limpiar
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Results Card */}
                    {itemData && (
                        <View style={styles.card}>
                            <View style={styles.resultHeader}>
                                <View style={styles.itemCodeRow}>
                                    <Icon
                                        name="barcode-scan"
                                        size={22}
                                        color={fluent.colors.primary}
                                    />
                                    <Text selectable style={styles.itemCode}>
                                        {itemData.itemCode}
                                    </Text>
                                </View>
                                <View
                                    style={[
                                        styles.badge,
                                        hasStock
                                            ? styles.badgeGreen
                                            : styles.badgeRed,
                                    ]}
                                >
                                    <Text
                                        style={[
                                            styles.badgeText,
                                            hasStock
                                                ? styles.badgeTextGreen
                                                : styles.badgeTextRed,
                                        ]}
                                    >
                                        {hasStock ? 'EN STOCK' : 'SIN STOCK'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.field}>
                                <Text style={styles.fieldLabel}>
                                    Descripción
                                </Text>
                                <Text selectable style={styles.fieldValue}>
                                    {itemData.description || '-'}
                                </Text>
                            </View>

                            {(() => {
                                const frozenQty = parseInt(
                                    String(
                                        itemData.frozenQty ??
                                            itemData.frozen_qty ??
                                            itemData.frozen ??
                                            0
                                    ),
                                    10
                                );
                                return (
                                    <>
                                        <View style={styles.row}>
                                            <View style={styles.fieldThird}>
                                                <Text
                                                    style={styles.fieldLabel}
                                                    numberOfLines={1}
                                                >
                                                    Ubicación
                                                </Text>
                                                <View
                                                    style={styles.locationBadge}
                                                >
                                                    <Text
                                                        selectable
                                                        style={
                                                            styles.locationText
                                                        }
                                                        numberOfLines={1}
                                                    >
                                                        {itemData.binLocation ||
                                                            'N/A'}
                                                    </Text>
                                                </View>
                                            </View>

                                            <View style={styles.fieldThird}>
                                                <Text
                                                    style={styles.fieldLabel}
                                                    numberOfLines={1}
                                                >
                                                    Stock Físico
                                                </Text>
                                                <View style={styles.qtyBadge}>
                                                    <Text
                                                        style={styles.qtyText}
                                                    >
                                                        {parseInt(
                                                            String(
                                                                itemData.physicalQty ??
                                                                    0
                                                            ),
                                                            10
                                                        )}
                                                    </Text>
                                                </View>
                                            </View>

                                            <View style={styles.fieldThird}>
                                                <Text
                                                    style={styles.fieldLabel}
                                                    numberOfLines={1}
                                                >
                                                    Cant. Frozen
                                                </Text>
                                                <View
                                                    style={[
                                                        styles.frozenBadge,
                                                        frozenQty > 0 &&
                                                            styles.frozenBadgeActive,
                                                    ]}
                                                >
                                                    <View
                                                        style={styles.frozenRow}
                                                    >
                                                        <Icon
                                                            name="snowflake"
                                                            size={14}
                                                            color={
                                                                frozenQty > 0
                                                                    ? fluent
                                                                          .colors
                                                                          .warningText
                                                                    : fluent
                                                                          .colors
                                                                          .primary
                                                            }
                                                        />
                                                        <Text
                                                            style={[
                                                                styles.frozenText,
                                                                frozenQty > 0 &&
                                                                    styles.frozenTextActive,
                                                            ]}
                                                        >
                                                            {frozenQty}
                                                        </Text>
                                                    </View>
                                                </View>
                                            </View>
                                        </View>

                                        {Boolean(itemData.aditionalBins) && (
                                            <View style={styles.field}>
                                                <Text style={styles.fieldLabel}>
                                                    Ubicaciones Adicionales
                                                </Text>
                                                <View
                                                    style={
                                                        styles.additionalBinsRow
                                                    }
                                                >
                                                    {itemData
                                                        .aditionalBins!.split(
                                                            ','
                                                        )
                                                        .map((bin, index) =>
                                                            bin.trim() ? (
                                                                <View
                                                                    key={index}
                                                                    style={
                                                                        styles.additionalBinBadge
                                                                    }
                                                                >
                                                                    <Text
                                                                        style={
                                                                            styles.additionalBinText
                                                                        }
                                                                    >
                                                                        {bin.trim()}
                                                                    </Text>
                                                                </View>
                                                            ) : null
                                                        )}
                                                </View>
                                            </View>
                                        )}

                                        <View style={styles.divider} />

                                        <View style={styles.detailsGrid}>
                                            <View style={styles.detailItem}>
                                                <Text
                                                    style={styles.detailLabel}
                                                >
                                                    Peso (kg)
                                                </Text>
                                                <Text
                                                    style={styles.detailValue}
                                                >
                                                    {itemData.weight || '-'}
                                                </Text>
                                            </View>
                                            <View style={styles.detailItem}>
                                                <Text
                                                    style={styles.detailLabel}
                                                >
                                                    Última Recepción
                                                </Text>
                                                <Text
                                                    style={styles.detailValue}
                                                >
                                                    {itemData.dateLastReceived ||
                                                        '-'}
                                                </Text>
                                            </View>
                                            <View style={styles.detailItem}>
                                                <Text
                                                    style={styles.detailLabel}
                                                >
                                                    ABC Code
                                                </Text>
                                                <Text
                                                    style={styles.detailValue}
                                                >
                                                    {itemData.itemType || '-'}
                                                </Text>
                                            </View>
                                            <View style={styles.detailItem}>
                                                <Text
                                                    style={styles.detailLabel}
                                                >
                                                    SIC Code
                                                </Text>
                                                <Text
                                                    style={styles.detailValue}
                                                >
                                                    {itemData.sicCode || '-'}
                                                </Text>
                                            </View>
                                            {Boolean(itemData.supersededBy) && (
                                                <View style={styles.detailItem}>
                                                    <Text
                                                        style={
                                                            styles.detailLabel
                                                        }
                                                    >
                                                        Reemplazado Por
                                                    </Text>
                                                    <Text
                                                        style={
                                                            styles.detailValue
                                                        }
                                                    >
                                                        {itemData.supersededBy}
                                                    </Text>
                                                </View>
                                            )}
                                        </View>
                                    </>
                                );
                            })()}
                        </View>
                    )}

                    {/* Empty State */}
                    {!itemData && !error && !loading && (
                        <View style={styles.emptyState}>
                            <Text style={styles.emptyText}>
                                Ingresa un código de ítem para consultar su
                                disponibilidad y ubicación.
                            </Text>
                        </View>
                    )}
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
        backgroundColor: fluent.colors.pageBg,
    },
    flex: {
        flex: 1,
    },
    content: {
        flex: 1,
        padding: 14,
    },
    card: {
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        padding: 16,
        marginBottom: 14,
        borderWidth: 1,
        borderColor: fluent.colors.neutralLight,
        ...fluent.shadows.card,
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
    },
    cardTitleGroup: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        flex: 1,
    },
    spotCheckButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fluent.colors.infoLight,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.colors.infoBorder,
        gap: 4,
    },
    spotCheckButtonText: {
        fontSize: 11,
        fontWeight: '600',
        color: fluent.colors.primary,
        letterSpacing: 0.3,
    },
    cardHeader: {
        fontSize: 15,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    label: {
        fontSize: 12,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
        marginBottom: 6,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 14,
    },
    input: {
        flex: 1,
        height: 44,
        backgroundColor: fluent.colors.white,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        borderRadius: fluent.radius.xs,
        paddingHorizontal: 12,
        fontSize: 15,
        color: fluent.colors.neutralPrimary,
        fontWeight: '600',
    },
    scanIconButton: {
        width: 44,
        height: 44,
        marginLeft: 8,
        backgroundColor: fluent.colors.neutralLighter,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 10,
    },
    button: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 8,
        borderRadius: fluent.radius.xs,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonPrimary: {
        backgroundColor: fluent.colors.primary,
    },
    buttonFlexConsult: {
        flex: 1.5,
    },
    buttonFlexClear: {
        flex: 1,
    },
    buttonSecondary: {
        backgroundColor: fluent.colors.neutralLighter,
        borderWidth: 1,
        borderColor: fluent.borders.color,
    },
    buttonText: {
        color: fluent.colors.white,
        fontSize: 14,
        fontWeight: '600',
    },
    buttonSecondaryText: {
        color: fluent.colors.neutralPrimary,
        fontSize: 14,
        fontWeight: '600',
    },
    resultHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    itemCodeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    itemCode: {
        fontSize: 18,
        fontWeight: '700',
        color: fluent.colors.primaryDarker,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    badge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: fluent.radius.xs,
    },
    badgeGreen: {
        backgroundColor: fluent.colors.successLight,
    },
    badgeRed: {
        backgroundColor: fluent.colors.errorLight,
    },
    badgeText: {
        fontSize: 11,
        fontWeight: '700',
    },
    badgeTextGreen: {
        color: fluent.colors.success,
    },
    badgeTextRed: {
        color: fluent.colors.error,
    },
    field: {
        marginBottom: 14,
    },
    fieldLabel: {
        fontSize: 11,
        color: fluent.colors.neutralSecondary,
        marginBottom: 4,
        fontWeight: '500',
    },
    fieldValue: {
        fontSize: 15,
        color: fluent.colors.neutralPrimary,
        fontWeight: '500',
    },
    row: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 14,
    },
    fieldHalf: {
        flex: 1,
    },
    fieldThird: {
        flex: 1,
        minWidth: 0,
    },
    locationBadge: {
        backgroundColor: fluent.colors.neutralLighter,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: fluent.radius.xs,
        alignSelf: 'stretch',
        borderWidth: 1,
        borderColor: fluent.borders.color,
        alignItems: 'center',
    },
    locationText: {
        color: fluent.colors.neutralPrimary,
        fontSize: 14,
        fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    qtyBadge: {
        backgroundColor: fluent.colors.primaryLighterAlt,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: fluent.radius.xs,
        alignSelf: 'stretch',
        borderWidth: 1,
        borderColor: fluent.colors.primaryLight,
        alignItems: 'center',
    },
    qtyText: {
        color: fluent.colors.primary,
        fontSize: 16,
        fontWeight: '700',
    },
    frozenBadge: {
        backgroundColor: fluent.colors.neutralLighter,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: fluent.radius.xs,
        alignSelf: 'stretch',
        borderWidth: 1,
        borderColor: fluent.borders.color,
        alignItems: 'center',
    },
    frozenBadgeActive: {
        backgroundColor: fluent.colors.warningLight,
        borderColor: fluent.colors.warningBorder,
    },
    frozenRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    frozenText: {
        color: fluent.colors.neutralPrimary,
        fontSize: 16,
        fontWeight: '700',
    },
    frozenTextActive: {
        color: fluent.colors.warningText,
    },
    additionalBinsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    additionalBinBadge: {
        backgroundColor: fluent.colors.neutralLighter,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.borders.color,
    },
    additionalBinText: {
        color: fluent.colors.neutralSecondary,
        fontSize: 13,
        fontWeight: '600',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    divider: {
        height: 1,
        backgroundColor: fluent.colors.neutralLight,
        marginVertical: 14,
    },
    detailsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    detailItem: {
        width: '50%',
        marginBottom: 10,
    },
    detailLabel: {
        fontSize: 11,
        color: fluent.colors.neutralSecondary,
    },
    detailValue: {
        fontSize: 13,
        color: fluent.colors.neutralPrimary,
        fontWeight: '600',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyText: {
        fontSize: 13,
        color: fluent.colors.neutralSecondary,
        textAlign: 'center',
        paddingHorizontal: 40,
        marginTop: 16,
    },
});

export default StockScreen;
