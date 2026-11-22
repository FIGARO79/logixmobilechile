import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Modal,
    ActivityIndicator,
    Vibration,
    Dimensions,
    Image,
    PanResponder,
} from 'react-native';
import {
    Camera,
    useCameraDevice,
    useCodeScanner,
    useCameraPermission,
} from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
    accelerometer,
    setUpdateIntervalForType,
    SensorTypes,
} from 'react-native-sensors';
import { map } from 'rxjs/operators';
import type { Subscription } from 'rxjs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import RNFS from 'react-native-fs';
import Svg, { Line } from 'react-native-svg';
import client from '../api/client';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

setUpdateIntervalForType(SensorTypes.accelerometer, 100);

const STATES = {
    SCANNING_QR: 'scanning_qr',
    QR_READY: 'qr_ready',
    CAPTURING: 'capturing',
    ADJUSTING: 'adjusting',
    PROCESSING: 'processing',
    RESULTS: 'results',
    ERROR: 'error',
} as const;

type FlowState = (typeof STATES)[keyof typeof STATES];
type PointKey = 'origin' | 'x' | 'y' | 'z';

interface Point2D {
    x: number;
    y: number;
}

type GizmoPoints = Record<PointKey, Point2D>;

interface MagnifierState {
    visible: boolean;
    x: number;
    y: number;
    pointKey: PointKey | null;
}

export interface MeasurementDimensions {
    length: number;
    width: number;
    height: number;
}

export interface MeasurementScannerModalProps {
    visible: boolean;
    onConfirm: (dims: MeasurementDimensions) => void;
    onClose: () => void;
    packageNumber: string | number;
}

const MeasurementScannerModal: React.FC<MeasurementScannerModalProps> = ({
    visible,
    onConfirm,
    onClose,
    packageNumber,
}) => {
    const insets = useSafeAreaInsets();
    const { hasPermission, requestPermission } = useCameraPermission();
    const device = useCameraDevice('back');
    const [isFlashOn, setIsFlashOn] = useState(false);
    const [isActive, setIsActive] = useState(false);
    const [flowState, setFlowState] = useState<FlowState>(STATES.SCANNING_QR);
    const [instruction, setInstruction] = useState('BUSCANDO QR DE REFERENCIA...');
    const [qrDetected, setQrDetected] = useState(false);
    const [qrSize, setQrSize] = useState(0);
    const [dimensions, setDimensions] = useState<MeasurementDimensions>({
        length: 0,
        width: 0,
        height: 0,
    });
    const [errorMsg, setErrorMsg] = useState('');
    const [capturedImage, setCapturedImage] = useState<string | null>(null);
    const [pitch, setPitch] = useState(0);
    const [isLevel, setIsLevel] = useState(false);
    const [magnifier, setMagnifier] = useState<MagnifierState>({
        visible: false,
        x: 0,
        y: 0,
        pointKey: null,
    });
    const [selectedPoint, setSelectedPoint] = useState<PointKey | null>(null);

    const [gizmoPoints, setGizmoPoints] = useState<GizmoPoints>({
        origin: { x: 50, y: 70 },
        x: { x: 80, y: 65 },
        y: { x: 20, y: 65 },
        z: { x: 50, y: 40 },
    });

    const cameraRef = useRef<Camera | null>(null);
    const sensorSubscription = useRef<Subscription | null>(null);
    const flowStateRef = useRef<FlowState>(flowState);

    useEffect(() => {
        flowStateRef.current = flowState;
    }, [flowState]);

    useEffect(() => {
        if (
            visible &&
            (flowState === STATES.SCANNING_QR || flowState === STATES.QR_READY)
        ) {
            sensorSubscription.current = accelerometer
                .pipe(
                    map(({ y, z }: { x: number; y: number; z: number }) => {
                        const radians = Math.atan2(y, z);
                        return Math.abs(Math.round(radians * (180 / Math.PI)));
                    })
                )
                .subscribe((deg: number) => {
                    setPitch(deg);
                    setIsLevel(deg >= 20 && deg <= 55);
                });
        } else {
            sensorSubscription.current?.unsubscribe();
        }
        return () => sensorSubscription.current?.unsubscribe();
    }, [visible, flowState]);

    const resetState = useCallback(() => {
        setFlowState(STATES.SCANNING_QR);
        setInstruction('BUSCANDO QR DE REFERENCIA...');
        setQrDetected(false);
        setQrSize(0);
        setDimensions({ length: 0, width: 0, height: 0 });
        setErrorMsg('');
        setCapturedImage(null);
        setSelectedPoint(null);
        setGizmoPoints({
            origin: { x: 50, y: 70 },
            x: { x: 80, y: 65 },
            y: { x: 20, y: 65 },
            z: { x: 50, y: 40 },
        });
    }, []);

    useEffect(() => {
        if (visible) {
            if (!hasPermission) requestPermission();
            const t = setTimeout(() => setIsActive(true), 500);
            resetState();
            return () => clearTimeout(t);
        } else {
            setIsActive(false);
        }
    }, [visible, hasPermission, requestPermission, resetState]);

    const codeScanner = useCodeScanner({
        codeTypes: ['qr'],
        onCodeScanned: (codes) => {
            if (
                flowStateRef.current !== STATES.SCANNING_QR &&
                flowStateRef.current !== STATES.QR_READY
            ) {
                return;
            }
            if (codes.length > 0) {
                const code = codes[0];
                const width = code.frame?.width || 0;

                if (flowStateRef.current === STATES.SCANNING_QR) {
                    setQrDetected(true);
                    setFlowState(STATES.QR_READY);
                }

                if (Math.abs(qrSize - width) > 10) {
                    setQrSize(width);
                    if (width > 0) {
                        if (width < 45) {
                            setInstruction(
                                'LEJOS — IDEAL PARA PALLETS (1.2M)'
                            );
                        } else if (width > 140) {
                            setInstruction('CERCA — ¡DEMASIADO CERCA!');
                        } else {
                            setInstruction('RANGO ÓPTIMO — ENCUADRE LA CAJA');
                        }
                    }
                }
            }
        },
    });

    const handleCapture = async () => {
        if (!cameraRef.current) return;
        setFlowState(STATES.CAPTURING);
        try {
            const photo = await cameraRef.current.takePhoto({
                flash: isFlashOn ? 'on' : 'off',
                enableShutterSound: true,
            });
            setCapturedImage(`file://${photo.path}`);
            setFlowState(STATES.ADJUSTING);
            setInstruction('AJUSTE LOS EJES SOBRE LA CAJA');
            Vibration.vibrate(50);
        } catch {
            setFlowState(STATES.ERROR);
            setErrorMsg('Error al capturar');
        }
    };

    const processMeasurement = async () => {
        if (!capturedImage) return;
        setFlowState(STATES.PROCESSING);
        try {
            const base64Image = await RNFS.readFile(
                capturedImage.replace('file://', ''),
                'base64'
            );
            const res = await client.post<
                MeasurementDimensions & { error?: string }
            >('/api/measure-v2', {
                image: base64Image,
                gizmo: gizmoPoints,
                camera_pitch: pitch,
            });
            if (res.data.error) {
                setFlowState(STATES.ERROR);
                setErrorMsg(res.data.error);
            } else {
                setDimensions(res.data);
                setFlowState(STATES.RESULTS);
            }
        } catch {
            setFlowState(STATES.ERROR);
            setErrorMsg('Error en el servidor');
        }
    };

    const areaTop = 60 + insets.top;
    const areaHeight = SCREEN_HEIGHT - areaTop - 180;

    const createPanResponder = (pointKey: PointKey) =>
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderGrant: (evt) => {
                const { pageX, pageY } = evt.nativeEvent;
                setMagnifier({ visible: true, x: pageX, y: pageY, pointKey });
                setSelectedPoint(pointKey);
            },
            onPanResponderMove: (evt) => {
                const { pageX, pageY } = evt.nativeEvent;
                setGizmoPoints((prev) => ({
                    ...prev,
                    [pointKey]: {
                        x: Math.max(
                            0,
                            Math.min(100, (pageX / SCREEN_WIDTH) * 100)
                        ),
                        y: Math.max(
                            0,
                            Math.min(
                                100,
                                ((pageY - areaTop) / areaHeight) * 100
                            )
                        ),
                    },
                }));
                setMagnifier({ visible: true, x: pageX, y: pageY, pointKey });
            },
            onPanResponderRelease: () =>
                setMagnifier((prev) => ({ ...prev, visible: false })),
        });

    const toPx = (pct: number, total: number): number => (pct * total) / 100;

    const formatValue = (val: number | undefined): string => {
        if (!val && val !== 0) return '---';
        const num = Math.round(val);
        if (num >= 100) {
            return `${(num / 100).toFixed(2)}M`;
        }
        return `${num}cm`;
    };

    const isCapturing =
        flowState === STATES.CAPTURING || flowState === STATES.PROCESSING;
    const isAdjusting = flowState === STATES.ADJUSTING;
    const showResults = flowState === STATES.RESULTS;
    const showError = flowState === STATES.ERROR;

    const pO = {
        x: toPx(gizmoPoints.origin.x, SCREEN_WIDTH),
        y: toPx(gizmoPoints.origin.y, areaHeight),
    };
    const pX = {
        x: toPx(gizmoPoints.x.x, SCREEN_WIDTH),
        y: toPx(gizmoPoints.x.y, areaHeight),
    };
    const pY = {
        x: toPx(gizmoPoints.y.x, SCREEN_WIDTH),
        y: toPx(gizmoPoints.y.y, areaHeight),
    };
    const pZ = {
        x: toPx(gizmoPoints.z.x, SCREEN_WIDTH),
        y: toPx(gizmoPoints.z.y, areaHeight),
    };

    const pXY = { x: pX.x + (pY.x - pO.x), y: pX.y + (pY.y - pO.y) };
    const pXZ = { x: pX.x + (pZ.x - pO.x), y: pX.y + (pZ.y - pO.y) };
    const pYZ = { x: pY.x + (pZ.x - pO.x), y: pY.y + (pZ.y - pO.y) };
    const pXYZ = { x: pXY.x + (pZ.x - pO.x), y: pXY.y + (pZ.y - pO.y) };

    if (!visible) return null;

    return (
        <Modal
            visible={visible}
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent={true}
        >
            <View style={styles.container}>
                <View
                    style={[
                        styles.header,
                        { paddingTop: insets.top + 5, paddingBottom: 10 },
                    ]}
                >
                    <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
                        <Icon name="close" size={28} color="#fff" />
                    </TouchableOpacity>
                    <View style={styles.headerInfo}>
                        <Text style={styles.headerTitle}>
                            ESCANER 3D — B{packageNumber}
                        </Text>
                        <Text
                            style={[
                                styles.headerSub,
                                isAdjusting && styles.headerSubAdjusting,
                            ]}
                        >
                            {instruction}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={() => setIsFlashOn(!isFlashOn)}
                        style={styles.iconBtn}
                    >
                        <Icon
                            name={isFlashOn ? 'flash' : 'flash-off'}
                            size={28}
                            color={isFlashOn ? '#FFD700' : '#fff'}
                        />
                    </TouchableOpacity>
                </View>

                <View style={styles.mainArea}>
                    {isAdjusting && capturedImage ? (
                        <View style={styles.adjustContainer}>
                            <Image
                                source={{ uri: capturedImage }}
                                style={styles.capturedPreview}
                                resizeMode="contain"
                            />
                            <Svg
                                style={StyleSheet.absoluteFill}
                                pointerEvents="none"
                            >
                                <Line
                                    x1={pO.x}
                                    y1={pO.y}
                                    x2={pX.x}
                                    y2={pX.y}
                                    stroke="#22c55e"
                                    strokeWidth="3"
                                />
                                <Line
                                    x1={pO.x}
                                    y1={pO.y}
                                    x2={pY.x}
                                    y2={pY.y}
                                    stroke="#3b82f6"
                                    strokeWidth="3"
                                />
                                <Line
                                    x1={pX.x}
                                    y1={pX.y}
                                    x2={pXY.x}
                                    y2={pXY.y}
                                    stroke="rgba(255,255,255,0.4)"
                                    strokeWidth="1"
                                    strokeDasharray="5,5"
                                />
                                <Line
                                    x1={pY.x}
                                    y1={pY.y}
                                    x2={pXY.x}
                                    y2={pXY.y}
                                    stroke="rgba(255,255,255,0.4)"
                                    strokeWidth="1"
                                    strokeDasharray="5,5"
                                />
                                <Line
                                    x1={pO.x}
                                    y1={pO.y}
                                    x2={pZ.x}
                                    y2={pZ.y}
                                    stroke="#ef4444"
                                    strokeWidth="3"
                                />
                                <Line
                                    x1={pX.x}
                                    y1={pX.y}
                                    x2={pXZ.x}
                                    y2={pXZ.y}
                                    stroke="rgba(255,255,255,0.4)"
                                    strokeWidth="1"
                                    strokeDasharray="5,5"
                                />
                                <Line
                                    x1={pY.x}
                                    y1={pY.y}
                                    x2={pYZ.x}
                                    y2={pYZ.y}
                                    stroke="rgba(255,255,255,0.4)"
                                    strokeWidth="1"
                                    strokeDasharray="5,5"
                                />
                                <Line
                                    x1={pXY.x}
                                    y1={pXY.y}
                                    x2={pXYZ.x}
                                    y2={pXYZ.y}
                                    stroke="rgba(255,255,255,0.4)"
                                    strokeWidth="1"
                                    strokeDasharray="5,5"
                                />
                                <Line
                                    x1={pZ.x}
                                    y1={pZ.y}
                                    x2={pXZ.x}
                                    y2={pXZ.y}
                                    stroke="#ef4444"
                                    strokeWidth="1"
                                    opacity={0.5}
                                />
                                <Line
                                    x1={pZ.x}
                                    y1={pZ.y}
                                    x2={pYZ.x}
                                    y2={pYZ.y}
                                    stroke="#ef4444"
                                    strokeWidth="1"
                                    opacity={0.5}
                                />
                                <Line
                                    x1={pXZ.x}
                                    y1={pXZ.y}
                                    x2={pXYZ.x}
                                    y2={pXYZ.y}
                                    stroke="#ef4444"
                                    strokeWidth="1"
                                    opacity={0.5}
                                />
                                <Line
                                    x1={pYZ.x}
                                    y1={pYZ.y}
                                    x2={pXYZ.x}
                                    y2={pXYZ.y}
                                    stroke="#ef4444"
                                    strokeWidth="1"
                                    opacity={0.5}
                                />
                            </Svg>

                            <View
                                style={[
                                    styles.gizmoPoint,
                                    {
                                        left: `${gizmoPoints.origin.x}%`,
                                        top: `${gizmoPoints.origin.y}%`,
                                        backgroundColor: '#fff',
                                        borderColor:
                                            selectedPoint === 'origin'
                                                ? '#fbbf24'
                                                : '#fff',
                                    },
                                ]}
                                {...createPanResponder('origin').panHandlers}
                            />
                            <View
                                style={[
                                    styles.gizmoPoint,
                                    {
                                        left: `${gizmoPoints.x.x}%`,
                                        top: `${gizmoPoints.x.y}%`,
                                        backgroundColor: '#22c55e',
                                        borderColor:
                                            selectedPoint === 'x'
                                                ? '#fbbf24'
                                                : '#fff',
                                    },
                                ]}
                                {...createPanResponder('x').panHandlers}
                            />
                            <View
                                style={[
                                    styles.gizmoPoint,
                                    {
                                        left: `${gizmoPoints.y.x}%`,
                                        top: `${gizmoPoints.y.y}%`,
                                        backgroundColor: '#3b82f6',
                                        borderColor:
                                            selectedPoint === 'y'
                                                ? '#fbbf24'
                                                : '#fff',
                                    },
                                ]}
                                {...createPanResponder('y').panHandlers}
                            />
                            <View
                                style={[
                                    styles.gizmoPoint,
                                    {
                                        left: `${gizmoPoints.z.x}%`,
                                        top: `${gizmoPoints.z.y}%`,
                                        backgroundColor: '#ef4444',
                                        borderColor:
                                            selectedPoint === 'z'
                                                ? '#fbbf24'
                                                : '#fff',
                                    },
                                ]}
                                {...createPanResponder('z').panHandlers}
                            />
                        </View>
                    ) : device ? (
                        <View style={styles.cameraWrapper}>
                            <Camera
                                ref={cameraRef}
                                style={StyleSheet.absoluteFill}
                                device={device}
                                isActive={isActive}
                                codeScanner={codeScanner}
                                photo={true}
                                torch={isFlashOn ? 'on' : 'off'}
                            />
                            <View style={styles.levelContainer}>
                                <View
                                    style={[
                                        styles.levelBar,
                                        {
                                            transform: [
                                                { rotate: `${pitch - 45}deg` },
                                            ],
                                        },
                                    ]}
                                >
                                    <View
                                        style={[
                                            styles.levelBubble,
                                            isLevel
                                                ? styles.levelGreen
                                                : styles.levelRed,
                                        ]}
                                    />
                                </View>
                                <Text style={styles.levelText}>{pitch}°</Text>
                                <View style={styles.distanceMeter}>
                                    <Icon
                                        name={
                                            qrSize < 45
                                                ? 'truck-delivery'
                                                : qrSize > 140
                                                  ? 'close-circle'
                                                  : 'check-decagram'
                                        }
                                        size={20}
                                        color={
                                            qrSize < 45
                                                ? '#3b82f6'
                                                : qrSize > 140
                                                  ? '#ef4444'
                                                  : '#22c55e'
                                        }
                                    />
                                    <Text
                                        style={[
                                            styles.distanceText,
                                            {
                                                color:
                                                    qrSize < 45
                                                        ? '#3b82f6'
                                                        : qrSize > 140
                                                          ? '#ef4444'
                                                          : '#22c55e',
                                            },
                                        ]}
                                    >
                                        {qrSize < 45
                                            ? 'PALLET'
                                            : qrSize > 140
                                              ? 'CERCA'
                                              : 'OK'}
                                    </Text>
                                </View>
                            </View>
                            <View
                                style={styles.overlay}
                                pointerEvents="box-none"
                            >
                                <View style={styles.qrBadge}>
                                    <Icon
                                        name={
                                            qrDetected
                                                ? 'check-circle'
                                                : 'qrcode-scan'
                                        }
                                        size={18}
                                        color={
                                            qrDetected ? '#22c55e' : '#f59e0b'
                                        }
                                    />
                                    <Text
                                        style={[
                                            styles.qrBadgeText,
                                            {
                                                color: qrDetected
                                                    ? '#22c55e'
                                                    : '#f59e0b',
                                            },
                                        ]}
                                    >
                                        {qrDetected
                                            ? 'QR LISTO'
                                            : 'BUSCANDO QR...'}
                                    </Text>
                                </View>
                                {qrDetected && !isCapturing && (
                                    <TouchableOpacity
                                        style={styles.shutterContainer}
                                        onPress={handleCapture}
                                    >
                                        <View
                                            style={[
                                                styles.shutterOuter,
                                                isLevel &&
                                                    styles.shutterOuterLevel,
                                            ]}
                                        >
                                            <View
                                                style={[
                                                    styles.shutterInner,
                                                    isLevel &&
                                                        styles.shutterInnerLevel,
                                                ]}
                                            />
                                        </View>
                                        <Text
                                            style={[
                                                styles.shutterText,
                                                isLevel &&
                                                    styles.shutterTextLevel,
                                            ]}
                                        >
                                            CAPTURAR
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </View>
                    ) : (
                        <View style={styles.loaderBox}>
                            <ActivityIndicator size="large" color="#06b6d4" />
                        </View>
                    )}
                </View>

                {magnifier.visible && capturedImage && magnifier.pointKey && (
                    <View
                        style={[
                            styles.magnifierRoot,
                            { top: areaTop + 20 },
                            magnifier.x < SCREEN_WIDTH / 2
                                ? styles.magnifierRight
                                : styles.magnifierLeft,
                        ]}
                    >
                        <View style={styles.magnifierBorder}>
                            <Image
                                source={{ uri: capturedImage }}
                                style={[
                                    styles.magnifierImage,
                                    {
                                        width: SCREEN_WIDTH * 2,
                                        height: areaHeight * 2,
                                        left: -magnifier.x * 2 + 75,
                                        top:
                                            -(magnifier.y - areaTop) * 2 + 75,
                                    },
                                ]}
                                resizeMode="contain"
                            />
                            <View style={styles.crosshairH} />
                            <View style={styles.crosshairV} />
                        </View>
                        <Text style={styles.magnifierLabel}>
                            {magnifier.pointKey.toUpperCase()}
                        </Text>
                    </View>
                )}

                <View style={styles.footer}>
                    {isCapturing ? (
                        <View style={styles.loaderBox}>
                            <ActivityIndicator size="large" color="#06b6d4" />
                            <Text style={styles.loaderText}>Procesando...</Text>
                        </View>
                    ) : isAdjusting ? (
                        <View style={styles.adjustFooter}>
                            <Text style={styles.adjustHint}>
                                Marque los vértices de la caja
                            </Text>
                            <View style={styles.buttonRow}>
                                <TouchableOpacity
                                    style={styles.btnSecondary}
                                    onPress={resetState}
                                >
                                    <Text style={styles.btnTextSecondary}>
                                        REPETIR
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.btnPrimary}
                                    onPress={processMeasurement}
                                >
                                    <Text style={styles.btnTextPrimary}>
                                        CALCULAR MEDIDAS
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : showResults ? (
                        <View style={styles.resultsContainer}>
                            <View style={styles.resultsRow}>
                                <View style={styles.resBox}>
                                    <Text style={styles.resLabel}>LARGO</Text>
                                    <Text style={styles.resValue}>
                                        {formatValue(dimensions.length)}
                                    </Text>
                                </View>
                                <View style={styles.resBox}>
                                    <Text style={styles.resLabel}>ANCHO</Text>
                                    <Text style={styles.resValue}>
                                        {formatValue(dimensions.width)}
                                    </Text>
                                </View>
                                <View style={styles.resBox}>
                                    <Text style={styles.resLabel}>ALTO</Text>
                                    <Text style={styles.resValue}>
                                        {formatValue(dimensions.height)}
                                    </Text>
                                </View>
                            </View>
                            <View style={styles.buttonRow}>
                                <TouchableOpacity
                                    style={styles.btnSecondary}
                                    onPress={resetState}
                                >
                                    <Text style={styles.btnTextSecondary}>
                                        REPETIR
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={styles.btnPrimary}
                                    onPress={() =>
                                        onConfirm({
                                            length: Math.round(
                                                dimensions.length
                                            ),
                                            width: Math.round(dimensions.width),
                                            height: Math.round(
                                                dimensions.height
                                            ),
                                        })
                                    }
                                >
                                    <Text style={styles.btnTextPrimary}>
                                        CONFIRMAR
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    ) : showError ? (
                        <View style={styles.errorBox}>
                            <Icon
                                name="alert-circle"
                                size={40}
                                color="#ef4444"
                            />
                            <Text style={styles.errorText}>{errorMsg}</Text>
                            <TouchableOpacity
                                style={styles.retryBtn}
                                onPress={resetState}
                            >
                                <Text style={styles.retryBtnText}>
                                    REINTENTAR
                                </Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <Text style={styles.footerHint}>
                            {isLevel
                                ? '¡Ángulo óptimo! Capture ahora'
                                : 'Apunte a la base y suba a 45°'}
                        </Text>
                    )}
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
        paddingHorizontal: 20,
        backgroundColor: '#0f172a',
        zIndex: 10,
        elevation: 5,
    },
    headerInfo: { flex: 1, alignItems: 'center' },
    headerTitle: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
    headerSub: {
        color: '#94a3b8',
        fontSize: 10,
        marginTop: 2,
        fontWeight: 'bold',
    },
    headerSubAdjusting: { color: '#fbbf24' },
    iconBtn: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    mainArea: { flex: 1, backgroundColor: '#1e293b' },
    cameraWrapper: { flex: 1 },
    adjustContainer: { flex: 1, backgroundColor: '#000' },
    capturedPreview: { ...StyleSheet.absoluteFillObject },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
    },
    levelContainer: {
        position: 'absolute',
        right: 20,
        top: '35%',
        alignItems: 'center',
        zIndex: 10,
    },
    levelBar: {
        width: 4,
        height: 100,
        backgroundColor: 'rgba(255,255,255,0.2)',
        borderRadius: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    levelBubble: { width: 12, height: 12, borderRadius: 6, position: 'absolute' },
    levelGreen: { backgroundColor: '#22c55e' },
    levelRed: { backgroundColor: '#ef4444' },
    levelText: {
        color: '#fff',
        fontSize: 10,
        marginTop: 10,
        fontWeight: 'bold',
    },
    distanceMeter: {
        marginTop: 20,
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
        padding: 5,
        borderRadius: 8,
        width: 60,
    },
    distanceText: { fontSize: 8, fontWeight: 'bold', marginTop: 2 },
    qrBadge: {
        position: 'absolute',
        top: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.7)',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 20,
        gap: 6,
    },
    qrBadgeText: { fontSize: 11, fontWeight: 'bold' },
    shutterContainer: {
        position: 'absolute',
        bottom: 30,
        alignItems: 'center',
    },
    shutterOuter: {
        width: 80,
        height: 80,
        borderRadius: 40,
        backgroundColor: 'rgba(255,255,255,0.3)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    shutterOuterLevel: { backgroundColor: 'rgba(34, 197, 94, 0.4)' },
    shutterInner: {
        width: 64,
        height: 64,
        borderRadius: 32,
        backgroundColor: '#fff',
        borderWidth: 2,
        borderColor: '#000',
    },
    shutterInnerLevel: { borderColor: '#22c55e' },
    shutterText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: 'bold',
        marginTop: 8,
    },
    shutterTextLevel: { color: '#22c55e' },
    gizmoPoint: {
        position: 'absolute',
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 3,
        borderColor: '#fff',
        marginLeft: -22,
        marginTop: -22,
        zIndex: 100,
    },
    magnifierRoot: {
        position: 'absolute',
        top: 120,
        zIndex: 1000,
        alignItems: 'center',
    },
    magnifierLeft: { left: 20 },
    magnifierRight: { right: 20 },
    magnifierBorder: {
        width: 150,
        height: 150,
        borderRadius: 75,
        borderWidth: 3,
        borderColor: '#fbbf24',
        backgroundColor: '#000',
        overflow: 'hidden',
    },
    magnifierImage: {
        width: SCREEN_WIDTH * 2,
        height: (SCREEN_HEIGHT - 280) * 2,
        position: 'absolute',
    },
    crosshairH: {
        position: 'absolute',
        top: 74,
        left: 65,
        width: 20,
        height: 2,
        backgroundColor: '#fbbf24',
    },
    crosshairV: {
        position: 'absolute',
        top: 65,
        left: 74,
        width: 2,
        height: 20,
        backgroundColor: '#fbbf24',
    },
    magnifierLabel: {
        color: '#fbbf24',
        fontWeight: 'bold',
        marginTop: 5,
        fontSize: 12,
    },
    footer: {
        height: 180,
        backgroundColor: '#0f172a',
        paddingHorizontal: 20,
        paddingTop: 15,
    },
    footerHint: { color: '#64748b', textAlign: 'center', fontSize: 12 },
    adjustFooter: { width: '100%' },
    adjustHint: {
        color: '#fbbf24',
        textAlign: 'center',
        fontSize: 12,
        marginBottom: 15,
        fontWeight: 'bold',
    },
    resultsContainer: { width: '100%' },
    resultsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 10,
        marginBottom: 15,
    },
    resBox: {
        flex: 1,
        backgroundColor: '#1e293b',
        padding: 10,
        borderRadius: 10,
        alignItems: 'center',
    },
    resLabel: {
        color: '#64748b',
        fontSize: 8,
        fontWeight: 'bold',
        marginBottom: 2,
    },
    resValue: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    buttonRow: { flexDirection: 'row', gap: 10 },
    btnPrimary: {
        flex: 1,
        height: 50,
        backgroundColor: '#16a34a',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnSecondary: {
        flex: 0.5,
        height: 50,
        backgroundColor: '#334155',
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    btnTextPrimary: { color: '#fff', fontWeight: 'bold' },
    btnTextSecondary: { color: '#94a3b8', fontWeight: 'bold' },
    loaderBox: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    loaderText: { color: '#06b6d4', marginTop: 8, fontWeight: 'bold' },
    errorBox: { alignItems: 'center', justifyContent: 'center', flex: 1 },
    errorText: { color: '#fff', textAlign: 'center', marginBottom: 10 },
    retryBtn: {
        backgroundColor: '#334155',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 8,
    },
    retryBtnText: { color: '#fff', fontWeight: 'bold' },
});

export default MeasurementScannerModal;
