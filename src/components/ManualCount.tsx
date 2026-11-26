import React, { useState, useRef, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    Vibration,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import client from '../api/client';
import ScannerModal from './ScannerModal';
import useDataWedge from '../hooks/useDataWedge';
import fluent from '../theme/fluent';

interface AuditItemData {
    item_code: string;
    description: string;
    system_qty: number;
    system_bin?: string;
    abc_code?: string;
}

interface RecentAuditRecord {
    id: string | number;
    item_code: string;
    bin_location: string;
    physical_qty: number;
    executed_date: string;
}

const ManualCount: React.FC = () => {
    const [binLocation, setBinLocation] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [itemData, setItemData] = useState<AuditItemData | null>(null);
    const [physicalQty, setPhysicalQty] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [recentAudits, setRecentAudits] = useState<RecentAuditRecord[]>([]);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState<'bin' | 'item' | null>(null);

    const binRef = useRef<TextInput | null>(null);
    const itemRef = useRef<TextInput | null>(null);
    const qtyRef = useRef<TextInput | null>(null);

    const fetchRecentAudits = async () => {
        try {
            const res = await client.get<RecentAuditRecord[]>(
                '/api/express_audit/recordings'
            );
            if (res.data) {
                setRecentAudits(res.data.slice(0, 10));
            }
        } catch (e) {
            console.error('Error fetching recent audits:', e);
        }
    };

    useEffect(() => {
        fetchRecentAudits();
    }, []);

    const handleSearchItem = async (codeToSearch?: string) => {
        const code = (codeToSearch || itemCode || '').trim().toUpperCase();
        if (!code) return;

        setLoading(true);
        try {
            const res = await client.get<AuditItemData>(
                `/api/express_audit/find/${encodeURIComponent(code)}`
            );
            if (res.data) {
                setItemData({
                    item_code: res.data.item_code,
                    description: res.data.description,
                    system_qty: res.data.system_qty,
                    system_bin: res.data.system_bin,
                    abc_code: res.data.abc_code,
                });
                setItemCode(res.data.item_code);
                Vibration.vibrate(70);
                setTimeout(() => qtyRef.current?.focus(), 150);
            }
        } catch (e) {
            console.error(e);
            Vibration.vibrate([0, 150, 100, 150]);
            Alert.alert('No Encontrado', 'El ítem no existe en el maestro');
            setItemData(null);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setItemCode('');
        setItemData(null);
        setPhysicalQty('');
        setTimeout(() => itemRef.current?.focus(), 150);
    };

    const resetAll = () => {
        setBinLocation('');
        resetForm();
        setTimeout(() => binRef.current?.focus(), 150);
    };

    const handleSave = async () => {
        if (!binLocation || !itemCode || !physicalQty || !itemData) {
            Alert.alert('Error', 'Complete todos los campos antes de guardar');
            return;
        }

        setIsSaving(true);
        try {
            await client.post('/api/express_audit/save', {
                item_code: itemData.item_code,
                item_description: itemData.description,
                bin_location: binLocation.toUpperCase(),
                system_qty: itemData.system_qty,
                physical_qty: parseInt(physicalQty, 10),
                abc_code: itemData.abc_code,
                executed_date: new Date().toISOString(),
            });

            Alert.alert('Éxito', 'Registro de auditoría guardado correctamente');
            resetForm();
            fetchRecentAudits();
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'No se pudo guardar la auditoría');
        } finally {
            setIsSaving(false);
        }
    };

    const handleScan = (code: string) => {
        setScannerOpen(false);
        const text = code.trim().toUpperCase();

        if (scanTarget === 'bin') {
            setBinLocation(text);
            Vibration.vibrate(70);
            setTimeout(() => itemRef.current?.focus(), 150);
        } else {
            setItemCode(text);
            handleSearchItem(text);
        }
        setScanTarget(null);
    };

    useDataWedge((code) => handleScan(code));

    const isBinMatch =
        Boolean(itemData && binLocation) &&
        binLocation.toUpperCase() === itemData?.system_bin?.toUpperCase();

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.flex}
        >
            <ScrollView
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Auditoría Libre</Text>
                    <TouchableOpacity
                        onPress={resetAll}
                        style={styles.resetButton}
                    >
                        <Text style={styles.resetText}>REINICIAR</Text>
                    </TouchableOpacity>
                </View>

                <View style={styles.card}>
                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Ubicación (BIN)</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                ref={binRef}
                                style={styles.input}
                                value={binLocation}
                                onChangeText={(val) =>
                                    setBinLocation(val.toUpperCase())
                                }
                                placeholder="Escanea o escribe BIN"
                                autoCapitalize="characters"
                                onSubmitEditing={() => itemRef.current?.focus()}
                            />
                            <TouchableOpacity
                                style={styles.scanIconButton}
                                onPress={() => {
                                    setScanTarget('bin');
                                    setScannerOpen(true);
                                }}
                            >
                                <Icon
                                    name="barcode-scan"
                                    size={24}
                                    color={fluent.colors.neutralPrimary}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Ítem / SKU</Text>
                        <View style={styles.inputRow}>
                            <TextInput
                                ref={itemRef}
                                style={styles.input}
                                value={itemCode}
                                onChangeText={(val) =>
                                    setItemCode(val.toUpperCase())
                                }
                                placeholder="Escanea o escribe SKU"
                                autoCapitalize="characters"
                                onSubmitEditing={() => handleSearchItem()}
                            />
                            <TouchableOpacity
                                style={styles.scanIconButton}
                                onPress={() => {
                                    setScanTarget('item');
                                    setScannerOpen(true);
                                }}
                            >
                                <Icon
                                    name="barcode-scan"
                                    size={24}
                                    color={fluent.colors.neutralPrimary}
                                />
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.descriptionBox}>
                        <Text style={styles.descriptionLabel}>Descripción</Text>
                        <Text style={styles.descriptionText} numberOfLines={2}>
                            {loading
                                ? 'Buscando...'
                                : itemData?.description ||
                                  '— ESPERANDO ENTRADA —'}
                        </Text>
                    </View>

                    <View style={styles.inputGroup}>
                        <Text style={styles.label}>Cant. Física</Text>
                        <View style={styles.qtyRow}>
                            <TextInput
                                ref={qtyRef}
                                style={[
                                    styles.input,
                                    styles.qtyInput,
                                    styles.qtyInputMargin,
                                ]}
                                value={physicalQty}
                                onChangeText={setPhysicalQty}
                                placeholder="0"
                                keyboardType="numeric"
                                onSubmitEditing={handleSave}
                            />
                            <TouchableOpacity
                                style={[
                                    styles.saveButton,
                                    (isSaving || !itemData) &&
                                        styles.saveButtonDisabled,
                                ]}
                                onPress={handleSave}
                                disabled={isSaving || !itemData}
                            >
                                {isSaving ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.saveButtonText}>
                                        CONFIRMAR
                                    </Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>

                    <View style={styles.divider} />

                    <Text style={styles.analysisLabel}>
                        ANÁLISIS DE INVENTARIO
                    </Text>
                    <View style={styles.analysisGrid}>
                        <View style={styles.analysisItem}>
                            <Text style={styles.analysisField}>Auditoría</Text>
                            <Text style={styles.analysisValue}>
                                {physicalQty || 0}
                            </Text>
                        </View>
                    </View>

                    {Boolean(itemData && binLocation) && (
                        <View
                            style={[
                                styles.binStatus,
                                isBinMatch
                                    ? styles.binMatch
                                    : styles.binMismatch,
                            ]}
                        >
                            <Icon
                                name={
                                    isBinMatch ? 'check-circle' : 'alert-circle'
                                }
                                size={20}
                                color={
                                    isBinMatch
                                        ? fluent.colors.success
                                        : fluent.colors.error
                                }
                            />
                            <View style={styles.binStatusTextContainer}>
                                <Text
                                    style={[
                                        styles.binStatusTitle,
                                        {
                                            color: isBinMatch
                                                ? fluent.colors.success
                                                : fluent.colors.error,
                                        },
                                    ]}
                                >
                                    {isBinMatch
                                        ? 'UBICACIÓN CORRECTA'
                                        : 'DISCREPANCIA DE UBICACIÓN'}
                                </Text>
                                {!isBinMatch && (
                                    <Text style={styles.binStatusSub}>
                                        SISTEMA INDICA:{' '}
                                        {itemData?.system_bin || 'NO DEFINIDA'}
                                    </Text>
                                )}
                            </View>
                        </View>
                    )}
                </View>

                {recentAudits.length > 0 && (
                    <View style={styles.recentSection}>
                        <Text style={styles.recentTitle}>
                            ÚLTIMOS REGISTROS
                        </Text>
                        {recentAudits.map((audit) => (
                            <View key={audit.id} style={styles.auditItem}>
                                <View style={styles.auditMain}>
                                    <Text selectable style={styles.auditCode}>
                                        {audit.item_code}
                                    </Text>
                                    <Text selectable style={styles.auditBin}>
                                        {audit.bin_location}
                                    </Text>
                                </View>
                                <View style={styles.auditSecondary}>
                                    <Text style={styles.auditQty}>
                                        {audit.physical_qty}
                                    </Text>
                                    <Text style={styles.auditTime}>
                                        {new Date(
                                            audit.executed_date
                                        ).toLocaleTimeString([], {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </Text>
                                </View>
                            </View>
                        ))}
                    </View>
                )}
            </ScrollView>

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
    scrollContent: { padding: 14, paddingBottom: 40 },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 14,
    },
    headerTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    resetButton: { padding: 4 },
    resetText: {
        fontSize: 11,
        fontWeight: '700',
        color: fluent.colors.error,
        letterSpacing: 0.5,
    },
    card: {
        backgroundColor: fluent.colors.cardBg,
        borderRadius: fluent.radius.sm,
        padding: 16,
        borderWidth: 1,
        borderColor: fluent.colors.neutralLight,
        ...fluent.shadows.card,
    },
    inputGroup: { marginBottom: 14 },
    label: {
        fontSize: 11,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
        marginBottom: 6,
        textTransform: 'uppercase',
        letterSpacing: 0.2,
    },
    inputRow: { flexDirection: 'row', alignItems: 'center' },
    input: {
        flex: 1,
        backgroundColor: fluent.colors.white,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        borderRadius: fluent.radius.xs,
        padding: 10,
        fontSize: 15,
        color: fluent.colors.neutralPrimary,
        fontWeight: '600',
    },
    scanIconButton: {
        padding: 9,
        marginLeft: 8,
        backgroundColor: fluent.colors.neutralLighter,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.borders.color,
    },
    descriptionBox: {
        backgroundColor: fluent.colors.neutralLighterAlt,
        padding: 12,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        marginBottom: 14,
    },
    descriptionLabel: {
        fontSize: 10,
        fontWeight: '600',
        color: fluent.colors.neutralSecondary,
        marginBottom: 4,
        textTransform: 'uppercase',
    },
    descriptionText: {
        fontSize: 14,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
    },
    qtyRow: { flexDirection: 'row', alignItems: 'center' },
    qtyInput: {
        textAlign: 'center',
        fontSize: 20,
        fontWeight: 'bold',
        borderColor: fluent.colors.primary,
        borderWidth: 1.5,
    },
    qtyInputMargin: { marginRight: 10 },
    saveButton: {
        backgroundColor: fluent.colors.primary,
        borderRadius: fluent.radius.xs,
        height: 46,
        paddingHorizontal: 20,
        justifyContent: 'center',
        alignItems: 'center',
        flex: 1,
        ...fluent.shadows.card,
    },
    saveButtonDisabled: { backgroundColor: fluent.colors.neutralTertiaryAlt },
    saveButtonText: {
        color: fluent.colors.white,
        fontSize: 13,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    divider: {
        height: 1,
        backgroundColor: fluent.colors.neutralLight,
        marginVertical: 16,
    },
    analysisLabel: {
        fontSize: 11,
        fontWeight: '600',
        color: fluent.colors.neutralSecondary,
        marginBottom: 10,
        textAlign: 'center',
        letterSpacing: 0.5,
    },
    analysisGrid: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        backgroundColor: fluent.colors.neutralLighterAlt,
        borderRadius: fluent.radius.xs,
        padding: 12,
    },
    analysisItem: { alignItems: 'center', flex: 1 },
    analysisField: {
        fontSize: 10,
        color: fluent.colors.neutralSecondary,
        marginBottom: 4,
        fontWeight: '500',
    },
    analysisValue: {
        fontSize: 16,
        fontWeight: '700',
        color: fluent.colors.neutralPrimary,
    },
    binStatus: {
        marginTop: 14,
        padding: 10,
        borderRadius: fluent.radius.xs,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
    },
    binMatch: {
        backgroundColor: fluent.colors.successLight,
        borderColor: fluent.colors.successLight,
    },
    binMismatch: {
        backgroundColor: fluent.colors.errorLight,
        borderColor: fluent.colors.errorBorder,
    },
    binStatusTextContainer: { marginLeft: 10 },
    binStatusTitle: { fontSize: 11, fontWeight: '700' },
    binStatusSub: {
        fontSize: 10,
        color: fluent.colors.error,
        marginTop: 2,
        fontWeight: '500',
    },
    recentSection: { marginTop: 20 },
    recentTitle: {
        fontSize: 11,
        fontWeight: '600',
        color: fluent.colors.neutralSecondary,
        marginBottom: 10,
        letterSpacing: 0.5,
    },
    auditItem: {
        flexDirection: 'row',
        backgroundColor: fluent.colors.cardBg,
        padding: 12,
        borderRadius: fluent.radius.sm,
        marginBottom: 8,
        borderWidth: 1,
        borderColor: fluent.colors.neutralLight,
        alignItems: 'center',
        justifyContent: 'space-between',
        ...fluent.shadows.card,
    },
    auditMain: { flex: 1 },
    auditCode: {
        fontSize: 14,
        fontWeight: '600',
        color: fluent.colors.primaryDarker,
    },
    auditBin: {
        fontSize: 12,
        color: fluent.colors.neutralSecondary,
        marginTop: 2,
    },
    auditSecondary: { alignItems: 'flex-end' },
    auditQty: { fontSize: 16, fontWeight: '700', color: fluent.colors.primary },
    auditTime: {
        fontSize: 10,
        color: fluent.colors.neutralTertiary,
        marginTop: 2,
    },
});

export default ManualCount;
