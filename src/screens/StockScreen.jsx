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
        {/* Top-left square */}
        <View style={{ position: 'absolute', top: 0, left: 0, width: size * 0.35, height: size * 0.35, borderWidth: 2, borderColor: color }} />
        {/* Top-right square */}
        <View style={{ position: 'absolute', top: 0, right: 0, width: size * 0.35, height: size * 0.35, borderWidth: 2, borderColor: color }} />
        {/* Bottom-left square */}
        <View style={{ position: 'absolute', bottom: 0, left: 0, width: size * 0.35, height: size * 0.35, borderWidth: 2, borderColor: color }} />
        {/* Center dot */}
        <View style={{ position: 'absolute', top: size * 0.4, left: size * 0.4, width: size * 0.2, height: size * 0.2, backgroundColor: color }} />
        {/* Bottom-right small square */}
        <View style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.25, height: size * 0.25, borderWidth: 1.5, borderColor: color }} />
    </View>
);

const StockScreen = ({ navigation }) => {
    const [itemCode, setItemCode] = useState('');
    const [itemData, setItemData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [scannerOpen, setScannerOpen] = useState(false);

    // Integración de escaneo por hardware (Zebra)
    useDataWedge(handleScan);

    const executeSearch = async (code) => {
        const cleanCode = code?.toString().trim().toUpperCase();
        if (!cleanCode) {
            Alert.alert('Error', 'Ingresa un código de ítem');
            return;
        }

        setLoading(true);
        setError('');
        setItemData(null);

        try {
            // Se limpia el código de posibles espacios ocultos o caracteres de control
            const sanitizedCode = cleanCode.replace(/[\u0000-\u001F\u007F-\u009F]/g, "");
            const response = await client.get(`/api/find_item/${encodeURIComponent(sanitizedCode)}/NA`);
            
            if (response.data) {
                setItemData(response.data);
                setItemCode(''); // Clear input on success
                Vibration.vibrate(100);
            } else {
                throw new Error('No se recibieron datos del servidor');
            }
        } catch (err) {
            console.error('Search error:', err.response?.status, err.response?.data);
            Vibration.vibrate([0, 200, 100, 200]);
            
            let errorMsg = 'Ítem no encontrado';
            if (err.response?.status === 404) {
                errorMsg = `El ítem [${cleanCode}] no existe en el sistema.`;
            } else if (err.response?.data?.error || err.response?.data?.detail) {
                errorMsg = err.response.data.error || err.response.data.detail;
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

    const handleScan = (code) => {
        setScannerOpen(false);
        setItemCode(code);
        executeSearch(code);
    };

    const clearSearch = () => {
        setItemCode('');
        setItemData(null);
        setError('');
    };

    const hasStock = parseInt(itemData?.physicalQty || 0) > 0;

    return (
        <SafeAreaView style={styles.container}>
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.flex}
            >
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                        <Text style={styles.backText}>← Regresar</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Consulta de Stock</Text>
                </View>

                <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
                    {/* Search Card */}
                    <View style={styles.card}>
                        <View style={styles.cardHeaderRow}>
                            <Icon name="magnify" size={20} color="#333" />
                            <Text style={styles.cardHeader}>Búsqueda de Stock</Text>
                        </View>

                        <Text style={styles.label}>Código de Ítem</Text>
                        <TextInput
                            style={styles.input}
                            value={itemCode}
                            onChangeText={(text) => setItemCode(text.toUpperCase())}
                            placeholder="Ej: ABC123"
                            autoCapitalize="characters"
                            returnKeyType="search"
                            onSubmitEditing={handleSearch}
                        />

                        <View style={styles.buttonRow}>
                            <TouchableOpacity
                                style={[styles.button, styles.buttonScan]}
                                onPress={() => setScannerOpen(true)}
                            >
                                <QrIcon size={22} color="#fff" />
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.button, styles.buttonPrimary, styles.buttonFlex]}
                                onPress={handleSearch}
                                disabled={loading}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.buttonText}>Consultar</Text>
                                )}
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.button, styles.buttonSecondary]}
                                onPress={clearSearch}
                            >
                                <Text style={styles.buttonSecondaryText}>Limpiar</Text>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Results Card */}
                    {itemData && (
                        <View style={styles.card}>
                            <View style={styles.resultHeader}>
                                <View style={styles.itemCodeRow}>
                                    <Icon name="barcode-scan" size={22} color="#0854a0" />
                                    <Text style={styles.itemCode}>{itemData.itemCode}</Text>
                                </View>
                                <View style={[styles.badge, hasStock ? styles.badgeGreen : styles.badgeRed]}>
                                    <Text style={[styles.badgeText, hasStock ? styles.badgeTextGreen : styles.badgeTextRed]}>
                                        {hasStock ? 'EN STOCK' : 'SIN STOCK'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.field}>
                                <Text style={styles.fieldLabel}>Descripción</Text>
                                <Text style={styles.fieldValue}>{itemData.description || '-'}</Text>
                            </View>

                            <View style={styles.row}>
                                <View style={styles.fieldHalf}>
                                    <Text style={styles.fieldLabel}>Ubicación Principal</Text>
                                    <View style={styles.locationBadge}>
                                        <Text style={styles.locationText}>{itemData.binLocation || 'N/A'}</Text>
                                    </View>
                                </View>

                                <View style={styles.fieldHalf}>
                                    <Text style={styles.fieldLabel}>Stock Físico</Text>
                                    <View style={styles.qtyBadge}>
                                        <Text style={styles.qtyText}>{parseInt(itemData.physicalQty || 0)}</Text>
                                    </View>
                                </View>
                            </View>

                            {itemData.aditionalBins && (
                                <View style={styles.field}>
                                    <Text style={styles.fieldLabel}>Ubicaciones Adicionales</Text>
                                    <View style={styles.additionalBinsRow}>
                                        {itemData.aditionalBins.split(',').map((bin, index) => (
                                            bin.trim() ? (
                                                <View key={index} style={styles.additionalBinBadge}>
                                                    <Text style={styles.additionalBinText}>{bin.trim()}</Text>
                                                </View>
                                            ) : null
                                        ))}
                                    </View>
                                </View>
                            )}

                            <View style={styles.divider} />

                            <View style={styles.detailsGrid}>
                                <View style={styles.detailItem}>
                                    <Text style={styles.detailLabel}>Peso (kg)</Text>
                                    <Text style={styles.detailValue}>{itemData.weight || '-'}</Text>
                                </View>
                                <View style={styles.detailItem}>
                                    <Text style={styles.detailLabel}>Última Recepción</Text>
                                    <Text style={styles.detailValue}>{itemData.dateLastReceived || '-'}</Text>
                                </View>
                                <View style={styles.detailItem}>
                                    <Text style={styles.detailLabel}>ABC Code</Text>
                                    <Text style={styles.detailValue}>{itemData.itemType || '-'}</Text>
                                </View>
                                <View style={styles.detailItem}>
                                    <Text style={styles.detailLabel}>SIC Code</Text>
                                    <Text style={styles.detailValue}>{itemData.sicCode || '-'}</Text>
                                </View>
                                {itemData.supersededBy && (
                                    <View style={styles.detailItem}>
                                        <Text style={styles.detailLabel}>Reemplazado Por</Text>
                                        <Text style={styles.detailValue}>{itemData.supersededBy}</Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    {/* Empty State */}
                    {!itemData && !error && !loading && (
                        <View style={styles.emptyState}>
                            <Icon name="database-search" size={60} color="#e5e7eb" />
                            <Text style={styles.emptyText}>
                                Ingresa un código de ítem para consultar su disponibilidad y ubicación.
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
        paddingVertical: 10,
        paddingRight: 20,
        marginBottom: 8,
    },
    backText: {
        color: '#0070d2',
        fontSize: 16,
        fontWeight: '600',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    content: {
        flex: 1,
        padding: 16,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    cardHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 16,
    },
    cardHeader: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    label: {
        fontSize: 14,
        color: '#666',
        marginBottom: 6,
    },
    input: {
        backgroundColor: '#f5f5f5',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 16,
        fontSize: 16,
        marginBottom: 16,
        color: '#000',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 12,
    },
    button: {
        flex: 1,
        padding: 16,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonPrimary: {
        backgroundColor: '#0854a0',
    },
    buttonScan: {
        backgroundColor: '#354a5f',
        width: 60,
        flex: 0,
    },
    buttonFlex: {
        flex: 2,
    },
    buttonSecondary: {
        backgroundColor: '#f0f0f0',
        borderWidth: 1,
        borderColor: '#ddd',
    },
    buttonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    buttonSecondaryText: {
        color: '#666',
        fontSize: 16,
        fontWeight: '600',
    },
    resultHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 16,
    },
    itemCodeRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    itemCode: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#0854a0',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    badge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    badgeGreen: {
        backgroundColor: '#d1fae5',
    },
    badgeRed: {
        backgroundColor: '#fee2e2',
    },
    badgeText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    badgeTextGreen: {
        color: '#065f46',
    },
    badgeTextRed: {
        color: '#b91c1c',
    },
    field: {
        marginBottom: 16,
    },
    fieldLabel: {
        fontSize: 12,
        color: '#888',
        marginBottom: 4,
    },
    fieldValue: {
        fontSize: 16,
        color: '#333',
        fontWeight: '500',
    },
    row: {
        flexDirection: 'row',
        gap: 16,
        marginBottom: 16,
    },
    fieldHalf: {
        flex: 1,
    },
    locationBadge: {
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: '#d1d5db',
    },
    locationText: {
        color: '#333',
        fontSize: 16,
        fontWeight: 'bold',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    qtyBadge: {
        backgroundColor: '#e8f4fc',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 6,
        alignSelf: 'flex-start',
        borderWidth: 1,
        borderColor: '#0854a0',
    },
    qtyText: {
        color: '#0854a0',
        fontSize: 20,
        fontWeight: 'bold',
    },
    additionalBinsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    additionalBinBadge: {
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: '#cbd5e1',
    },
    additionalBinText: {
        color: '#475569',
        fontSize: 14,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    divider: {
        height: 1,
        backgroundColor: '#e0e0e0',
        marginVertical: 16,
    },
    detailsGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
    },
    detailItem: {
        width: '50%',
        marginBottom: 12,
    },
    detailLabel: {
        fontSize: 12,
        color: '#888',
    },
    detailValue: {
        fontSize: 14,
        color: '#333',
        fontWeight: '500',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 60,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
        paddingHorizontal: 40,
        marginTop: 16,
    },
});

export default StockScreen;
