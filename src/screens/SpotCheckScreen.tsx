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
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import client from '../api/client';
import ScannerModal from '../components/ScannerModal';
import useDataWedge from '../hooks/useDataWedge';
import fluent from '../theme/fluent';
import type { RootStackParamList } from '../navigation/AppNavigator';

interface SpotCheckItemData {
    item_code: string;
    description: string;
    system_bin: string;
    additional_locations: string;
}

interface RecentSpotCheck {
    id: string | number;
    item_code: string;
    bin_location: string;
    system_bin?: string;
    username?: string;
    quantity: number;
    timestamp: string;
}

type Props = NativeStackScreenProps<RootStackParamList, 'SpotCheck'>;

const SpotCheckScreen: React.FC<Props> = ({ navigation }) => {
    const [binLocation, setBinLocation] = useState('');
    const [itemCode, setItemCode] = useState('');
    const [itemData, setItemData] = useState<SpotCheckItemData | null>(null);
    const [quantity, setQuantity] = useState('');
    const [loading, setLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [recentChecks, setRecentChecks] = useState<RecentSpotCheck[]>([]);
    const [scannerOpen, setScannerOpen] = useState(false);
    const [scanTarget, setScanTarget] = useState<'bin' | 'item' | null>(null);

    const binRef = useRef<TextInput | null>(null);
    const itemRef = useRef<TextInput | null>(null);
    const qtyRef = useRef<TextInput | null>(null);

    const fetchRecentChecks = async () => {
        try {
            const res = await client.get<RecentSpotCheck[]>(
                '/api/spot_check/list'
            );
            if (res.data) {
                setRecentChecks(res.data.slice(0, 10));
            }
        } catch (e) {
            console.error('Error fetching recent spot checks:', e);
        }
    };

    useEffect(() => {
        fetchRecentChecks();
    }, []);

    const handleSearchItem = async (codeToSearch?: string) => {
        const code = (codeToSearch || itemCode || '').trim().toUpperCase();
        if (!code) return;

        setLoading(true);
        try {
            const res = await client.get<{
                item_code?: string;
                description?: string;
                system_bin?: string;
                bin_location?: string;
                binLocation?: string;
                additional_locations?: string;
                aditionalBins?: string;
            }>(`/api/spot_check/find/${encodeURIComponent(code)}`);
            let systemBin =
                res.data?.system_bin ||
                res.data?.bin_location ||
                res.data?.binLocation;
            let additionalLocs =
                res.data?.additional_locations || res.data?.aditionalBins;

            // Si no vinieron datos de ubicación desde spot_check, consultar API find_item
            if (!systemBin) {
                try {
                    const fullRes = await client.get<{
                        binLocation?: string;
                        bin_location?: string;
                        aditionalBins?: string;
                        additional_locations?: string;
                    }>(`/api/find_item/${encodeURIComponent(code)}/NA`);
                    if (fullRes.data) {
                        systemBin =
                            fullRes.data.binLocation ||
                            fullRes.data.bin_location;
                        additionalLocs =
                            fullRes.data.aditionalBins ||
                            fullRes.data.additional_locations;
                    }
                } catch (err) {
                    console.log('No se obtuvo info extra de ubicación:', err);
                }
            }

            if (res.data) {
                setItemData({
                    item_code: res.data.item_code || code,
                    description: res.data.description || 'SIN DESCRIPCIÓN',
                    system_bin: systemBin || 'N/A',
                    additional_locations: additionalLocs || '',
                });
                setItemCode(res.data.item_code || code);
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

    const getBinValidation = () => {
        if (!itemData) return null;

        const currentBin = (binLocation || '').trim().toUpperCase();
        const systemBin = (itemData.system_bin || '').trim().toUpperCase();
        const addBinsStr = (itemData.additional_locations || '').toUpperCase();
        const addBinsList = addBinsStr
            .split(',')
            .map((b) => b.trim())
            .filter(Boolean);

        if (!currentBin) {
            return {
                title: `Ubicación Asignada: ${systemBin || 'N/A'}`,
                subtext:
                    addBinsList.length > 0
                        ? `Ubicaciones adicionales: ${addBinsList.join(', ')}`
                        : 'Escanee o ingrese un BIN para validar',
                icon: 'map-marker-outline',
                bgColor: fluent.colors.neutralLighterAlt,
                borderColor: fluent.borders.color,
                textColor: fluent.colors.neutralPrimary,
                iconColor: fluent.colors.primary,
            };
        }

        if (systemBin && currentBin === systemBin) {
            return {
                title: '✓ Ubicación Correcta',
                subtext: `Corresponde a la ubicación principal (${systemBin}).`,
                icon: 'check-circle-outline',
                bgColor: fluent.colors.successLight,
                borderColor: fluent.colors.successBorder,
                textColor: fluent.colors.success,
                iconColor: fluent.colors.success,
            };
        }

        if (addBinsList.includes(currentBin)) {
            return {
                title: 'ℹ Ubicación Adicional Registrada',
                subtext: `Ubicación secundaria registrada. Principal: ${systemBin}.`,
                icon: 'information-outline',
                bgColor: fluent.colors.infoLight,
                borderColor: fluent.colors.infoBorder,
                textColor: fluent.colors.primaryDarker,
                iconColor: fluent.colors.info,
            };
        }

        return {
            title: '⚠️ Ubicación Diferente (En otra ubicación)',
            subtext: `Ubicación principal asignada: ${systemBin || 'N/A'}${
                addBinsList.length > 0
                    ? ` | Adicionales: ${addBinsList.join(', ')}`
                    : ''
            }`,
            icon: 'alert-circle-outline',
            bgColor: fluent.colors.warningLight,
            borderColor: fluent.colors.warningBorder,
            textColor: fluent.colors.warningText,
            iconColor: fluent.colors.warningText,
        };
    };

    const handleSave = async () => {
        if (!binLocation || !itemCode || !quantity || !itemData) {
            Alert.alert('Error', 'Complete todos los campos antes de registrar');
            return;
        }

        setIsSaving(true);
        try {
            await client.post('/api/spot_check/save', {
                bin_location: binLocation.toUpperCase(),
                system_bin: (itemData.system_bin || 'N/A').toUpperCase(),
                item_code: itemData.item_code,
                item_description: itemData.description,
                quantity: parseInt(quantity, 10),
            });

            Alert.alert('Éxito', 'Hallazgo registrado correctamente');
            setItemCode('');
            setItemData(null);
            setQuantity('');
            fetchRecentChecks();
            setTimeout(() => itemRef.current?.focus(), 150);
        } catch (e) {
            console.error(e);
            Alert.alert('Error', 'No se pudo registrar el hallazgo');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <SafeAreaView
            style={styles.container}
            edges={['right', 'bottom', 'left']}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={styles.flex}
            >
                <ScrollView
                    contentContainerStyle={styles.scrollContent}
                    keyboardShouldPersistTaps="handled"
                >
                    <View style={styles.header}>
                        <TouchableOpacity
                            onPress={() => navigation.goBack()}
                            style={styles.backButton}
                        >
                            <Icon
                                name="arrow-left"
                                size={24}
                                color="#0854a0"
                            />
                            <Text style={styles.backText}>Volver</Text>
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>
                            Auditoria de Bines
                        </Text>
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
                                    placeholder="BIN"
                                    autoCapitalize="characters"
                                    onSubmitEditing={() =>
                                        itemRef.current?.focus()
                                    }
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
                            <Text style={styles.label}>Artículo (SKU)</Text>
                            <View style={styles.inputRow}>
                                <TextInput
                                    ref={itemRef}
                                    style={styles.input}
                                    value={itemCode}
                                    onChangeText={(val) =>
                                        setItemCode(val.toUpperCase())
                                    }
                                    placeholder="SKU"
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
                            <Text style={styles.descriptionLabel}>
                                Descripción del Artículo
                            </Text>
                            <Text
                                style={styles.descriptionText}
                                numberOfLines={2}
                            >
                                {loading
                                    ? 'Buscando...'
                                    : itemData?.description || ''}
                            </Text>
                        </View>

                        {itemData &&
                            (() => {
                                const validation = getBinValidation();
                                if (!validation) return null;
                                return (
                                    <View
                                        style={[
                                            styles.validationBox,
                                            {
                                                backgroundColor:
                                                    validation.bgColor,
                                                borderColor:
                                                    validation.borderColor,
                                            },
                                        ]}
                                    >
                                        <View style={styles.validationHeader}>
                                            <Icon
                                                name={validation.icon}
                                                size={20}
                                                color={validation.iconColor}
                                            />
                                            <Text
                                                style={[
                                                    styles.validationTitle,
                                                    {
                                                        color: validation.textColor,
                                                    },
                                                ]}
                                            >
                                                {validation.title}
                                            </Text>
                                        </View>
                                        {validation.subtext ? (
                                            <Text
                                                style={[
                                                    styles.validationSubtext,
                                                    {
                                                        color: validation.textColor,
                                                    },
                                                ]}
                                            >
                                                {validation.subtext}
                                            </Text>
                                        ) : null}
                                    </View>
                                );
                            })()}

                        <View style={styles.inputGroup}>
                            <Text style={styles.label}>Cantidad</Text>
                            <View style={styles.qtyRow}>
                                <TextInput
                                    ref={qtyRef}
                                    style={[
                                        styles.input,
                                        styles.qtyInput,
                                        styles.qtyInputMargin,
                                    ]}
                                    value={quantity}
                                    onChangeText={setQuantity}
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
                                            REGISTRAR
                                        </Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>

                    <View style={styles.infoCard}>
                        <View style={styles.infoRow}>
                            <Icon
                                name="information-outline"
                                size={20}
                                color={fluent.colors.primary}
                            />
                            <Text style={styles.infoTitle}>
                                ¿Qué es el Spot Check?
                            </Text>
                        </View>
                        <Text style={styles.infoText}>
                            Utiliza esta función para registrar rápidamente
                            hallazgos de stock en cualquier ubicación, sin
                            necesidad de un plan de conteo previo.
                        </Text>
                    </View>

                    {recentChecks.length > 0 && (
                        <View style={styles.recentSection}>
                            <Text style={styles.recentTitle}>
                                HALLAZGOS RECIENTES
                            </Text>
                            {recentChecks.map((check) => {
                                const isMatch =
                                    Boolean(check.system_bin) &&
                                    check.system_bin !== 'N/A' &&
                                    check.bin_location === check.system_bin;
                                return (
                                    <View
                                        key={check.id}
                                        style={styles.checkItem}
                                    >
                                        <View style={styles.checkMain}>
                                            <Text selectable style={styles.checkCode}>
                                                {check.item_code}
                                            </Text>

                                            <View style={styles.binsRow}>
                                                <View
                                                    style={[
                                                        styles.binChip,
                                                        isMatch
                                                            ? styles.binChipMatch
                                                            : styles.binChipFound,
                                                    ]}
                                                >
                                                    <Text
                                                        style={
                                                            styles.binTagLabel
                                                        }
                                                    >
                                                        ENCONTRADO:
                                                    </Text>
                                                    <Text
                                                        selectable
                                                        style={
                                                            styles.binValueText
                                                        }
                                                    >
                                                        {check.bin_location}
                                                    </Text>
                                                </View>
                                                <View
                                                    style={
                                                        styles.binChipDefault
                                                    }
                                                >
                                                    <Text
                                                        style={
                                                            styles.binTagLabel
                                                        }
                                                    >
                                                        DEFAULT:
                                                    </Text>
                                                    <Text
                                                        style={
                                                            styles.binValueTextDefault
                                                        }
                                                    >
                                                        {check.system_bin ||
                                                            'N/A'}
                                                    </Text>
                                                </View>
                                            </View>

                                            <Text
                                                style={styles.checkUser}
                                                numberOfLines={1}
                                            >
                                                Por: {check.username}
                                            </Text>
                                        </View>
                                        <View style={styles.checkSecondary}>
                                            <Text style={styles.checkQty}>
                                                {check.quantity}
                                            </Text>
                                            <Text style={styles.checkTime}>
                                                {new Date(
                                                    check.timestamp
                                                ).toLocaleTimeString([], {
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                })}
                                            </Text>
                                        </View>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </ScrollView>
            </KeyboardAvoidingView>

            <ScannerModal
                visible={scannerOpen}
                onScan={handleScan}
                onClose={() => setScannerOpen(false)}
            />
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: fluent.colors.pageBg },
    flex: { flex: 1 },
    scrollContent: { padding: 14, paddingBottom: 40 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
    backButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginRight: 15,
    },
    backText: {
        fontSize: 14,
        color: fluent.colors.primary,
        fontWeight: '600',
        marginLeft: 4,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
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
    validationBox: {
        padding: 12,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        marginBottom: 14,
    },
    validationHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    validationTitle: { fontSize: 13, fontWeight: '600', flex: 1 },
    validationSubtext: { fontSize: 12, marginTop: 4, lineHeight: 16 },
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
    infoCard: {
        marginTop: 20,
        backgroundColor: fluent.colors.infoLight,
        borderRadius: fluent.radius.sm,
        padding: 14,
        borderWidth: 1,
        borderColor: fluent.colors.infoBorder,
    },
    infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    infoTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: fluent.colors.primaryDarker,
        marginLeft: 6,
    },
    infoText: {
        fontSize: 12,
        color: fluent.colors.neutralPrimary,
        lineHeight: 17,
    },
    recentSection: { marginTop: 20 },
    recentTitle: {
        fontSize: 11,
        fontWeight: '600',
        color: fluent.colors.neutralSecondary,
        marginBottom: 10,
        letterSpacing: 0.5,
    },
    checkItem: {
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
    checkMain: { flex: 1 },
    checkCode: {
        fontSize: 14,
        fontWeight: '600',
        color: fluent.colors.primaryDarker,
    },
    checkBin: {
        fontSize: 12,
        color: fluent.colors.neutralSecondary,
        marginTop: 2,
    },
    binsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
        marginTop: 4,
        marginBottom: 4,
    },
    binChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        gap: 4,
    },
    binChipFound: {
        backgroundColor: fluent.colors.warningLight,
        borderColor: fluent.colors.warningBorder,
    },
    binChipMatch: {
        backgroundColor: fluent.colors.successLight,
        borderColor: fluent.colors.successLight,
    },
    binChipDefault: {
        backgroundColor: fluent.colors.neutralLighter,
        borderColor: fluent.borders.color,
    },
    binTagLabel: {
        fontSize: 9,
        fontWeight: '600',
        color: fluent.colors.neutralSecondary,
    },
    binValueText: {
        fontSize: 11,
        fontWeight: '600',
        color: fluent.colors.warningText,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    binValueTextDefault: {
        fontSize: 11,
        fontWeight: '600',
        color: fluent.colors.neutralPrimary,
        fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    checkUser: {
        fontSize: 9,
        color: fluent.colors.neutralTertiary,
        marginTop: 2,
        textTransform: 'uppercase',
    },
    checkSecondary: { alignItems: 'flex-end' },
    checkQty: { fontSize: 16, fontWeight: '700', color: fluent.colors.primary },
    checkTime: {
        fontSize: 10,
        color: fluent.colors.neutralTertiary,
        marginTop: 2,
    },
});

export default SpotCheckScreen;
