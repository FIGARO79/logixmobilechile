import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    Alert,
    PermissionsAndroid,
    Platform
} from 'react-native';
import { Camera } from 'react-native-camera-kit';

const ScannerModal = ({ visible, onScan, onClose }) => {
    const [hasPermission, setHasPermission] = useState(null);
    const cameraRef = useRef(null);

    const requestPermission = async () => {
        if (Platform.OS === 'android') {
            try {
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
            requestPermission().then(setHasPermission);
        }
    }, [visible]);

    const handleBarCodeRead = (event) => {
        const code = event.nativeEvent?.codeStringValue || event.codeStringValue;
        if (code) {
            onScan(code);
        }
    };

    if (!visible) return null;

    if (hasPermission === false) {
        Alert.alert(
            'Permiso Denegado',
            'Se necesita acceso a la cámara para escanear códigos.',
            [{ text: 'OK', onPress: onClose }]
        );
        return null;
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
});

export default ScannerModal;
