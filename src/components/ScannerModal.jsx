import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
    Vibration,
    Animated,
    Easing
} from 'react-native';
import {
    Camera,
    useCameraDevice,
    useCodeScanner,
    useCameraPermission,
    useCameraFormat
} from 'react-native-vision-camera';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const ScannerModal = ({ visible, onScan, onClose }) => {
    const { hasPermission, requestPermission } = useCameraPermission();
    const [isFlashOn, setIsFlashOn] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const cameraRef = useRef(null);

    // Buscar dispositivo de cámara trasera
    const device = useCameraDevice('back');

    // Seleccionar el mejor formato para escaneo (priorizar resolución 1080p o 720p para velocidad)
    const format = useCameraFormat(device, [
        { videoResolution: { width: 1920, height: 1080 } },
        { videoResolution: { width: 1280, height: 720 } },
        { fps: 30 }
    ]);

    const lastScanTime = useRef(0);
    const animValue = useRef(new Animated.Value(0)).current;

    // Animación del láser
    useEffect(() => {
        if (visible && isActive) {
            const startAnimation = () => {
                animValue.setValue(0);
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(animValue, {
                            toValue: 1,
                            duration: 1800,
                            easing: Easing.inOut(Easing.quad),
                            useNativeDriver: true,
                        }),
                        Animated.timing(animValue, {
                            toValue: 0,
                            duration: 1800,
                            easing: Easing.inOut(Easing.quad),
                            useNativeDriver: true,
                        }),
                    ])
                ).start();
            };
            startAnimation();
        } else {
            animValue.stopAnimation();
        }
    }, [visible, isActive]);

    // Gestión de permisos y estado activo
    useEffect(() => {
        let timeout;
        if (visible) {
            console.log('[Scanner] Intentando activar cámara...');
            if (!hasPermission) {
                requestPermission().then(granted => {
                    console.log('[Scanner] Permiso otorgado:', granted);
                });
            }
            // Retraso para evitar parpadeo o bloqueo al abrir el modal
            timeout = setTimeout(() => setIsActive(true), 500);
        } else {
            setIsActive(false);
            setIsFlashOn(false);
        }
        return () => clearTimeout(timeout);
    }, [visible, hasPermission]);

    const translateY = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: [-90, 90],
    });

    const codeScanner = useCodeScanner({
        codeTypes: ['code-128', 'ean-13', 'qr', 'code-39', 'upc-a'],
        onCodeScanned: (codes) => {
            const now = Date.now();
            if (now - lastScanTime.current < 2000) return;

            if (codes.length > 0 && codes[0].value) {
                lastScanTime.current = now;
                console.log('[Scanner] Lectura exitosa:', codes[0].value);
                Vibration.vibrate(100);
                onScan(codes[0].value);
            }
        },
    });

    if (!visible) return null;

    if (!hasPermission || !device) {
        return (
            <Modal visible={visible} transparent>
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#0070d2" />
                    <Text style={styles.loadingText}>
                        {!device ? 'Buscando hardware de cámara...' : 'Solicitando acceso a la cámara...'}
                    </Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
                        <Text style={styles.closeBtnText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        );
    }

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={styles.container}>
                {/* Header con Controles */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                        <Icon name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>LOGIX SCANNER</Text>
                    <TouchableOpacity
                        onPress={() => setIsFlashOn(!isFlashOn)}
                        style={styles.iconBtn}
                    >
                        <Icon
                            name={isFlashOn ? "flash" : "flash-off"}
                            size={28}
                            color={isFlashOn ? "#FFD700" : "#fff"}
                        />
                    </TouchableOpacity>
                </View>

                {/* Vista de Cámara */}
                <View style={styles.cameraWrapper}>
                    <Camera
                        ref={cameraRef}
                        style={StyleSheet.absoluteFill}
                        device={device}
                        isActive={isActive}
                        codeScanner={codeScanner}
                        format={format}
                        torch={isFlashOn ? 'on' : 'off'}
                        enableZoomGesture={true}
                        pixelFormat="yuv"
                        lowLightBoost={device.supportsLowLightBoost}
                    />

                    {/* Guía Visual */}
                    <View style={styles.overlay}>
                        <View style={styles.targetFrame}>
                            <View style={[styles.border, styles.borderTL]} />
                            <View style={[styles.border, styles.borderTR]} />
                            <View style={[styles.border, styles.borderBL]} />
                            <View style={[styles.border, styles.borderBR]} />

                            <Animated.View style={[
                                styles.laser,
                                { transform: [{ translateY }] }
                            ]} />
                        </View>

                        <View style={styles.infoBox}>
                            <Text style={styles.infoText}>Enfoque el código de barras</Text>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 50,
        paddingBottom: 20,
        paddingHorizontal: 20,
        backgroundColor: 'rgba(0,0,0,0.95)',
        zIndex: 10
    },
    headerTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
    iconBtn: { width: 45, height: 45, justifyContent: 'center', alignItems: 'center' },
    cameraWrapper: { flex: 1 },
    loadingContainer: {
        flex: 1,
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 30
    },
    loadingText: { color: '#fff', marginTop: 20, textAlign: 'center', fontSize: 15 },
    closeBtn: { marginTop: 30, padding: 15, backgroundColor: '#333', borderRadius: 10 },
    closeBtnText: { color: '#fff', fontWeight: 'bold' },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center'
    },
    targetFrame: {
        width: 300,
        height: 200,
        justifyContent: 'center',
        alignItems: 'center'
    },
    border: { position: 'absolute', width: 40, height: 40, borderColor: '#0070d2' },
    borderTL: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 15 },
    borderTR: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 15 },
    borderBL: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 15 },
    borderBR: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 15 },
    laser: {
        width: '94%',
        height: 2,
        backgroundColor: '#ff3b30',
        shadowColor: '#ff3b30',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 8,
        elevation: 8
    },
    infoBox: { marginTop: 60, backgroundColor: 'rgba(0,112,210,0.9)', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
    infoText: { color: '#fff', fontWeight: 'bold', fontSize: 14 }
});

export default ScannerModal;
