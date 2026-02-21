import React, { useState, useEffect, useRef } from 'react';
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
    useCameraPermission
} from 'react-native-vision-camera';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const ScannerModal = ({ visible, onScan, onClose }) => {
    const { hasPermission, requestPermission } = useCameraPermission();
    const [isFlashOn, setIsFlashOn] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const cameraRef = useRef(null);
    const device = useCameraDevice('back');
    const lastScanTime = useRef(0);
    const animValue = useRef(new Animated.Value(0)).current;

    // Animación de barrido del láser
    useEffect(() => {
        if (visible && isActive) {
            const startAnimation = () => {
                animValue.setValue(0);
                Animated.loop(
                    Animated.sequence([
                        Animated.timing(animValue, {
                            toValue: 1,
                            duration: 2000,
                            easing: Easing.inOut(Easing.quad),
                            useNativeDriver: true,
                        }),
                        Animated.timing(animValue, {
                            toValue: 0,
                            duration: 2000,
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
    }, [visible, isActive, animValue]);

    // Activar/desactivar la cámara según la visibilidad del modal
    useEffect(() => {
        if (visible) {
            if (!hasPermission) {
                requestPermission();
            }
            setIsActive(true);
            setIsFlashOn(false);
        } else {
            setIsActive(false);
        }
    }, [visible, hasPermission, requestPermission]);

    const translateY = animValue.interpolate({
        inputRange: [0, 1],
        outputRange: [-85, 85], // Mover dentro del cuadro de 180px de alto
    });

    const codeScanner = useCodeScanner({
        codeTypes: ['code-128', 'ean-13', 'qr', 'code-39', 'upc-a'],
        onCodeScanned: (codes) => {
            const currentTime = Date.now();
            if (currentTime - lastScanTime.current < 1500) return;

            if (codes && codes.length > 0 && codes[0].value) {
                lastScanTime.current = currentTime;
                console.log('[DEBUG] Code detected (Vision):', codes[0].value);
                Vibration.vibrate(100);
                onScan(codes[0].value);
            }
        },
    });

    const toggleFlash = () => {
        setIsFlashOn((prev) => !prev);
    };

    if (!visible) return null;

    if (!hasPermission) {
        return (
            <Modal visible={visible} transparent animationType="fade">
                <View style={[styles.container, styles.loadingContainer]}>
                    <ActivityIndicator size="large" color="#0854a0" />
                    <Text style={styles.loadingText}>Solicitando permisos...</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeButtonOverlay}>
                        <Text style={styles.closeText}>Cancelar</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        );
    }

    if (!device) {
        return (
            <Modal visible={visible} transparent>
                <View style={[styles.container, styles.loadingContainer]}>
                    <Text style={styles.loadingText}>No se detectó cámara trasera</Text>
                    <TouchableOpacity onPress={onClose} style={styles.closeButtonOverlay}>
                        <Text style={styles.closeText}>Cerrar</Text>
                    </TouchableOpacity>
                </View>
            </Modal>
        );
    }

    return (
        <Modal
            visible={visible}
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Text style={styles.closeText}>✕ Cerrar</Text>
                    </TouchableOpacity>
                    <Text style={styles.title}>Escaneo de Alta Precisión</Text>
                    <TouchableOpacity onPress={toggleFlash} style={styles.flashButton}>
                        <Icon
                            name={isFlashOn ? "flash" : "flash-off"}
                            size={26}
                            color={isFlashOn ? "#FFD700" : "#fff"}
                        />
                    </TouchableOpacity>
                </View>

                {/* Camera View */}
                <View style={styles.cameraContainer}>
                    <Camera
                        ref={cameraRef}
                        style={StyleSheet.absoluteFill}
                        device={device}
                        isActive={isActive}
                        codeScanner={codeScanner}
                        torch={isFlashOn ? 'on' : 'off'}
                        enableZoomGesture={true}
                        format={device.formats[0]} 
                        pixelFormat="yuv" 
                    />

                    {/* Professional Overlay */}
                    <View style={styles.overlay}>
                        <View style={styles.scanTarget}>
                            <View style={[styles.corner, styles.topLeft]} />
                            <View style={[styles.corner, styles.topRight]} />
                            <View style={[styles.corner, styles.bottomLeft]} />
                            <View style={[styles.corner, styles.bottomRight]} />
                            <Animated.View style={[
                                styles.laserLine, 
                                { transform: [{ translateY }] }
                            ]} />
                        </View>
                        <View style={styles.hintContainer}>
                            <Text style={styles.scanHint}>Apunta al código para lectura rápida</Text>
                            <Text style={styles.zoomHint}>Usa dos dedos para hacer zoom</Text>
                        </View>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 16,
        paddingTop: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
    },
    closeButton: {
        paddingVertical: 5,
        paddingHorizontal: 10,
    },
    closeText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    title: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    flashButton: {
        padding: 5,
    },
    cameraContainer: {
        flex: 1,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#fff',
        marginTop: 15,
        fontSize: 16,
    },
    closeButtonOverlay: {
        marginTop: 30,
        padding: 15,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 8,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanTarget: {
        width: 280,
        height: 180,
        justifyContent: 'center',
        alignItems: 'center',
    },
    corner: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderColor: '#0070d2',
    },
    topLeft: {
        top: 0,
        left: 0,
        borderTopWidth: 4,
        borderLeftWidth: 4,
        borderTopLeftRadius: 10,
    },
    topRight: {
        top: 0,
        right: 0,
        borderTopWidth: 4,
        borderRightWidth: 4,
        borderTopRightRadius: 10,
    },
    bottomLeft: {
        bottom: 0,
        left: 0,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderBottomLeftRadius: 10,
    },
    bottomRight: {
        bottom: 0,
        right: 0,
        borderBottomWidth: 4,
        borderRightWidth: 4,
        borderBottomRightRadius: 10,
    },
    laserLine: {
        width: '90%',
        height: 2,
        backgroundColor: '#ff0000',
        shadowColor: '#ff0000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 5,
        elevation: 5,
    },
    hintContainer: {
        marginTop: 40,
        alignItems: 'center',
    },
    scanHint: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        overflow: 'hidden',
    },
    zoomHint: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        marginTop: 10,
    },
});

export default ScannerModal;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000',
    },
    header: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 16,
        paddingTop: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        zIndex: 10,
    },
    closeButton: {
        paddingVertical: 5,
        paddingHorizontal: 10,
    },
    closeText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '500',
    },
    title: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    flashButton: {
        padding: 5,
    },
    cameraContainer: {
        flex: 1,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#fff',
        marginTop: 15,
        fontSize: 16,
    },
    closeButtonOverlay: {
        marginTop: 30,
        padding: 15,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 8,
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanTarget: {
        width: 280,
        height: 180,
        justifyContent: 'center',
        alignItems: 'center',
    },
    corner: {
        position: 'absolute',
        width: 30,
        height: 30,
        borderColor: '#0070d2',
    },
    topLeft: {
        top: 0,
        left: 0,
        borderTopWidth: 4,
        borderLeftWidth: 4,
        borderTopLeftRadius: 10,
    },
    topRight: {
        top: 0,
        right: 0,
        borderTopWidth: 4,
        borderRightWidth: 4,
        borderTopRightRadius: 10,
    },
    bottomLeft: {
        bottom: 0,
        left: 0,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
        borderBottomLeftRadius: 10,
    },
    bottomRight: {
        bottom: 0,
        right: 0,
        borderBottomWidth: 4,
        borderRightWidth: 4,
        borderBottomRightRadius: 10,
    },
    laserLine: {
        width: '90%',
        height: 2,
        backgroundColor: 'rgba(255, 0, 0, 0.5)',
        shadowColor: '#ff0000',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 1,
        shadowRadius: 5,
    },
    hintContainer: {
        marginTop: 40,
        alignItems: 'center',
    },
    scanHint: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '500',
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        overflow: 'hidden',
    },
    zoomHint: {
        color: 'rgba(255,255,255,0.6)',
        fontSize: 12,
        marginTop: 10,
    },
});

export default ScannerModal;
