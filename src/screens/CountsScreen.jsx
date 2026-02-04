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
    Platform
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import DateTimePicker from '@react-native-community/datetimepicker';
import client from '../api/client';
import ScannerModal from '../components/ScannerModal';

// Calendar Icon component
const CalendarIcon = ({ size = 20, color = '#fff' }) => (
    <View style={{ width: size, height: size }}>
        {/* Calendar body */}
        <View style={{ position: 'absolute', top: size * 0.15, left: 0, right: 0, bottom: 0, borderWidth: 1.5, borderColor: color, borderRadius: 2 }} />
        {/* Calendar header */}
        <View style={{ position: 'absolute', top: size * 0.15, left: 0, right: 0, height: size * 0.25, backgroundColor: color, borderTopLeftRadius: 2, borderTopRightRadius: 2 }} />
        {/* Calendar hooks */}
        <View style={{ position: 'absolute', top: 0, left: size * 0.2, width: 2, height: size * 0.25, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ position: 'absolute', top: 0, right: size * 0.2, width: 2, height: size * 0.25, backgroundColor: color, borderRadius: 1 }} />
        {/* Calendar dots */}
        <View style={{ position: 'absolute', top: size * 0.55, left: size * 0.2, width: 3, height: 3, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ position: 'absolute', top: size * 0.55, left: size * 0.45, width: 3, height: 3, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ position: 'absolute', top: size * 0.55, right: size * 0.2, width: 3, height: 3, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ position: 'absolute', top: size * 0.75, left: size * 0.2, width: 3, height: 3, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ position: 'absolute', top: size * 0.75, left: size * 0.45, width: 3, height: 3, backgroundColor: color, borderRadius: 1 }} />
    </View>
);

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

const CountsScreen = ({ navigation }) => {
    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    const [selectedDate, setSelectedDate] = useState(today);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const flatListRef = useRef(null);

    // Load items when date changes
    useEffect(() => {
        if (selectedDate) {
            fetchDailyItems(selectedDate);
        }
    }, [selectedDate]);

    const fetchDailyItems = async (date) => {
        setLoading(true);
        setItems([]);
        try {
            const response = await client.get(`/api/planner/execution/daily_items?date=${date}`);
            const data = response.data;

            // Initialize each item with input state
            const initializedItems = data.map(item => ({
                ...item,
                physical_qty: '',
                status: 'pending', // pending, counted, saved
            }));
            setItems(initializedItems);
        } catch (err) {
            // console.error('Error loading items:', err);
            const errorMsg = err.response?.data?.detail || 'Error al cargar ítems';
            Alert.alert('Error', errorMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleCountChange = (index, value) => {
        const newItems = [...items];
        newItems[index].physical_qty = value;
        // Mark as counted if has a value
        if (value !== '') {
            newItems[index].status = 'counted';
        } else {
            newItems[index].status = 'pending';
        }
        setItems(newItems);
    };

    const handleScan = (code) => {
        setScannerOpen(false);
        const cleanCode = code.trim().toUpperCase();

        // Find item in list
        const index = items.findIndex(i => i.item_code === cleanCode);

        if (index !== -1) {
            Alert.alert('✓ Encontrado', `Item: ${cleanCode}`);
            // Scroll to item
            setTimeout(() => {
                flatListRef.current?.scrollToIndex({
                    index,
                    animated: true,
                    viewPosition: 0.5
                });
            }, 300);
        } else {
            Alert.alert('No Encontrado', 'El item no está en la lista de hoy');
        }
    };

    const handleBulkSave = async () => {
        // Filter items that have counts and are not saved
        const countedItems = items.filter(item => item.status === 'counted');

        if (countedItems.length === 0) {
            Alert.alert('Aviso', 'No hay items para guardar');
            return;
        }

        Alert.alert(
            'Confirmar',
            `¿Guardar ${countedItems.length} conteos?`,
            [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Guardar', onPress: executeSave }
            ]
        );
    };

    const executeSave = async () => {
        const countedItems = items.filter(item => item.status === 'counted');

        setSaving(true);
        try {
            const payload = {
                date: selectedDate,
                items: countedItems.map(item => ({
                    item_code: item.item_code,
                    description: item.description,
                    bin_location: item.bin_location || 'N/A',
                    system_qty: item.system_qty || 0,
                    physical_qty: parseInt(item.physical_qty) || 0,
                    abc_code: item.abc_code
                }))
            };

            await client.post('/api/planner/execution/save', payload);

            Alert.alert('Éxito', 'Conteos guardados correctamente');

            // Mark items as saved
            const newItems = items.map(item => {
                if (item.status === 'counted') {
                    return { ...item, status: 'saved' };
                }
                return item;
            });
            setItems(newItems);

        } catch (err) {
            // console.error('Error saving:', err);
            Alert.alert('Error', 'No se pudieron guardar los conteos');
        } finally {
            setSaving(false);
        }
    };

    const countedCount = items.filter(i => i.status === 'counted' || i.status === 'saved').length;

    const getAbcBadgeStyle = (abc) => {
        switch (abc) {
            case 'A': return { backgroundColor: '#fee2e2', color: '#b91c1c' };
            case 'B': return { backgroundColor: '#fef3c7', color: '#b45309' };
            case 'C': return { backgroundColor: '#dbeafe', color: '#1d4ed8' };
            default: return { backgroundColor: '#f3f4f6', color: '#6b7280' };
        }
    };

    const renderItem = ({ item, index }) => {
        const abcStyle = getAbcBadgeStyle(item.abc_code);
        const isSaved = item.status === 'saved';

        return (
            <View style={[styles.itemCard, isSaved && styles.itemCardSaved]}>
                <View style={styles.itemHeader}>
                    <View style={styles.itemInfo}>
                        <Text style={styles.itemCode}>{item.item_code}</Text>
                        <Text style={styles.itemDesc} numberOfLines={1}>{item.description}</Text>
                    </View>
                    <View style={[styles.abcBadge, { backgroundColor: abcStyle.backgroundColor }]}>
                        <Text style={[styles.abcText, { color: abcStyle.color }]}>{item.abc_code}</Text>
                    </View>
                </View>

                <View style={styles.itemRow}>
                    <View style={styles.locationSection}>
                        <Text style={styles.fieldLabel}>Ubicación</Text>
                        <View style={styles.locationBadge}>
                            <Text style={styles.locationText}>{item.bin_location || 'N/A'}</Text>
                        </View>
                        {item.additional_locations && (
                            <Text style={styles.additionalLocations}>+ {item.additional_locations}</Text>
                        )}
                    </View>

                    <View style={styles.qtySection}>
                        <Text style={styles.fieldLabel}>Cant. Física</Text>
                        <TextInput
                            style={[styles.qtyInput, isSaved && styles.qtyInputDisabled]}
                            value={item.physical_qty}
                            onChangeText={(value) => handleCountChange(index, value)}
                            keyboardType="numeric"
                            placeholder="0"
                            editable={!isSaved}
                        />
                    </View>
                </View>

                {isSaved && (
                    <View style={styles.savedBadge}>
                        <Text style={styles.savedText}>✓ Guardado</Text>
                    </View>
                )}
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
                    <Text style={styles.title}>Conteos Cíclicos</Text>
                </View>

                {/* Date & Controls */}
                <View style={styles.controlsCard}>
                    <View style={styles.dateRow}>
                        <TouchableOpacity
                            style={styles.dateButton}
                            onPress={() => setShowDatePicker(true)}
                        >
                            <CalendarIcon size={20} color="#5c6bc0" />
                            <Text style={styles.dateText}>{selectedDate}</Text>
                        </TouchableOpacity>
                    </View>

                    {showDatePicker && (
                        <DateTimePicker
                            value={new Date(selectedDate + 'T12:00:00')}
                            mode="date"
                            display={Platform.OS === 'ios' ? 'spinner' : 'calendar'}
                            onChange={(event, date) => {
                                setShowDatePicker(Platform.OS === 'ios');
                                if (date) {
                                    const formatted = date.toISOString().split('T')[0];
                                    setSelectedDate(formatted);
                                }
                            }}
                        />
                    )}

                    <View style={styles.buttonRow}>
                        <TouchableOpacity
                            style={styles.refreshButton}
                            onPress={() => fetchDailyItems(selectedDate)}
                        >
                            <Text style={styles.buttonText}>Actualizar</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={styles.scanButton}
                            onPress={() => setScannerOpen(true)}
                        >
                            <QrIcon size={20} color="#fff" />
                            <Text style={styles.buttonText}>Escanear</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Content */}
                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#0070d2" />
                        <Text style={styles.loadingText}>Cargando ítems...</Text>
                    </View>
                ) : items.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Text style={styles.emptyIcon}>📋</Text>
                        <Text style={styles.emptyText}>No hay ítems planificados para esta fecha.</Text>
                    </View>
                ) : (
                    <>
                        <FlatList
                            ref={flatListRef}
                            data={items}
                            renderItem={renderItem}
                            keyExtractor={(item, index) => `${item.item_code}-${index}`}
                            contentContainerStyle={styles.listContent}
                            onScrollToIndexFailed={() => { }}
                        />

                        {/* Footer */}
                        <View style={styles.footer}>
                            <Text style={styles.counterText}>
                                Items contados: <Text style={styles.counterBold}>{countedCount}</Text> / {items.length}
                            </Text>
                            <TouchableOpacity
                                style={[styles.saveButton, countedCount === 0 && styles.saveButtonDisabled]}
                                onPress={handleBulkSave}
                                disabled={saving || countedCount === 0}
                            >
                                {saving ? (
                                    <ActivityIndicator color="#fff" size="small" />
                                ) : (
                                    <Text style={styles.saveButtonText}>Guardar</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </>
                )}
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
        color: '#0070d2',
        fontSize: 16,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    controlsCard: {
        backgroundColor: '#fff',
        margin: 12,
        padding: 12,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    dateRow: {
        marginBottom: 12,
    },
    dateButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f0f1f7',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#d1d5db',
        gap: 10,
    },
    dateText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#333',
    },
    buttonRow: {
        flexDirection: 'row',
        gap: 10,
    },
    refreshButton: {
        flex: 1,
        backgroundColor: '#0854a0',
        padding: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    scanButton: {
        flex: 1,
        backgroundColor: '#354a5f',
        padding: 12,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
    },
    buttonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        marginTop: 12,
        color: '#666',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 16,
    },
    emptyText: {
        fontSize: 14,
        color: '#888',
        textAlign: 'center',
    },
    listContent: {
        padding: 12,
        paddingBottom: 100,
    },
    itemCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 14,
        marginBottom: 10,
        borderWidth: 1,
        borderColor: '#e0e0e0',
    },
    itemCardSaved: {
        backgroundColor: '#f0fdf4',
        borderColor: '#86efac',
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
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
    abcBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    abcText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    itemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    locationSection: {
        flex: 1,
    },
    qtySection: {
        alignItems: 'flex-end',
    },
    fieldLabel: {
        fontSize: 10,
        color: '#888',
        textTransform: 'uppercase',
        marginBottom: 4,
    },
    locationBadge: {
        backgroundColor: '#f3f4f6',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6,
        alignSelf: 'flex-start',
    },
    locationText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    additionalLocations: {
        fontSize: 10,
        color: '#888',
        marginTop: 4,
    },
    qtyInput: {
        width: 80,
        backgroundColor: '#f9fafb',
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 8,
        padding: 10,
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
    },
    qtyInputDisabled: {
        backgroundColor: '#e5e7eb',
        color: '#6b7280',
    },
    savedBadge: {
        marginTop: 10,
        alignItems: 'flex-end',
    },
    savedText: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#16a34a',
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    counterText: {
        fontSize: 14,
        color: '#333',
    },
    counterBold: {
        fontWeight: 'bold',
    },
    saveButton: {
        backgroundColor: '#16a34a',
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 8,
    },
    saveButtonDisabled: {
        backgroundColor: '#9ca3af',
    },
    saveButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: 'bold',
    },
});

export default CountsScreen;
