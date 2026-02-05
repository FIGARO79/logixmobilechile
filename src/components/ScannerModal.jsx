import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Alert,
    PermissionsAndroid,
    Platform,
    ActivityIndicator
} from 'react-native';
import { Camera } from 'react-native-camera-kit';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const ScannerModal = ({ visible, onScan, onClose }) => {
    const [hasPermission, setHasPermission] = useState(null);
    const [isFlashOn, setIsFlashOn] = useState(false);
    const cameraRef = useRef(null);

    const checkPermission = async () => {
        if (Platform.OS === 'android') {
            try {
                // First check if already granted to avoid unnecessary request dialog
                const check = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.CAMERA);
                if (check) return true;

                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.CAMERA,
                    {
                        title: 'Permiso de Cámara',
                        message: 'La app necesita acceso a la cámara para escanear códigos',
                        buttonNeutral: 'Después',
                        buttonNegative: 'Cancelar',
                        buttonPositive: 'OK',
                    },
                );
                return granted === PermissionsAndroid.RESULTS.GRANTED;
            } catch (err) {
                console.warn(err);
                return false;
            }
        }
        return true;
    };

    React.useEffect(() => {
        if (visible) {
            // Only check if we haven't already determined permission
            if (hasPermission === null) {
                checkPermission().then(setHasPermission);
            }
            setIsFlashOn(false); // Reset flash when modal opens
        }
    }, [visible]);

    const handleBarCodeRead = (event) => {
        const code = event.nativeEvent?.codeStringValue || event.codeStringValue;
        if (code) {
            onScan(code);
        }
    };

    const toggleFlash = () => {
        setIsFlashOn((prev) => !prev);
    };

    if (!visible) return null;

    if (hasPermission === null) {
        return (
            <Modal visible={visible} transparent animationType="none">
                <View style={[styles.container, styles.loadingContainer]}>
                    <ActivityIndicator size="large" color="#0070d2" />
                    <Text style={styles.loadingText}>Iniciando cámara...</Text>
                </View>
            </Modal>
        );
    }

    if (hasPermission === false) {
        Alert.alert(
            'Permiso Denegado',
            'Se necesita acceso a la cámara para escanear códigos.',
            [{ text: 'OK', onPress: onClose }]
        );
        return null; // Will close via alert callback essentially
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
                    <Text style={styles.title}>Escanear Código</Text>
                    <TouchableOpacity onPress={toggleFlash} style={styles.flashButton}>
                        <Icon
                            name={isFlashOn ? "flash" : "flash-off"}
                            size={24}
                            color={isFlashOn ? "#FFD700" : "#fff"}
                        />
                    </TouchableOpacity>
                </View>

                {/* Camera View */}
                <View style={styles.cameraContainer}>
                    {hasPermission && (
                        <Camera
                            ref={cameraRef}
                            style={styles.camera}
                            scanBarcode={true}
                            onReadCode={handleBarCodeRead}
                            showFrame={true}
                            laserColor="#0070d2"
                            frameColor="#0070d2"
                            torchMode={isFlashOn ? 'on' : 'off'}
                        />
                    )}

                    {/* Scan Frame Overlay */}
                    <View style={styles.overlay}>
                        <View style={styles.scanFrame}>
                            <View style={[styles.corner, styles.topLeft]} />
                            <View style={[styles.corner, styles.topRight]} />
                            <View style={[styles.corner, styles.bottomLeft]} />
                            <View style={[styles.corner, styles.bottomRight]} />
                        </View>
                    </View>

                    {/* Hint */}
                    <View style={styles.hintContainer}>
                        <Text style={styles.scanHint}>Apunta al código de barras o QR</Text>
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
        backgroundColor: '#1a1a1a',
        padding: 16,
        paddingTop: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between', // Changed to space-between
    },
    closeButton: {
        paddingRight: 16,
    },
    closeText: {
        color: '#fff',
        fontSize: 16,
    },
    title: {
        color: '#fff',
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center', // Added for better centering
        flex: 1, // Added to take up available space
    },
    flashButton: {
        paddingLeft: 16,
    },
    cameraContainer: {
        flex: 1,
        position: 'relative',
    },
    camera: {
        flex: 1,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    scanFrame: {
        width: 250,
        height: 250,
        position: 'relative',
    },
    corner: {
        position: 'absolute',
        width: 40,
        height: 40,
        borderColor: '#0070d2',
    },
    topLeft: {
        top: 0,
        left: 0,
        borderTopWidth: 4,
        borderLeftWidth: 4,
    },
    topRight: {
        top: 0,
        right: 0,
        borderTopWidth: 4,
        borderRightWidth: 4,
    },
    bottomLeft: {
        bottom: 0,
        left: 0,
        borderBottomWidth: 4,
        borderLeftWidth: 4,
    },
    bottomRight: {
        bottom: 0,
        right: 0,
        borderBottomWidth: 4,
        borderRightWidth: 4,
    },
    hintContainer: {
        position: 'absolute',
        bottom: 100,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    scanHint: {
        color: '#fff',
        fontSize: 14,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 4,
    },
    loadingContainer: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        color: '#fff',
        marginTop: 10,
        fontSize: 16,
    },
});

export default ScannerModal;
