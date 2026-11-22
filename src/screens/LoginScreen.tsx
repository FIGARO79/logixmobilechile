import React, { useContext, useState, useEffect } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Vibration,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AuthContext } from '../context/AuthContext';
import fluent from '../theme/fluent';

const LoginScreen: React.FC = () => {
    const {
        login,
        biometricLogin,
        isLoading,
        isBiometricAvailable,
        isBiometricEnabled,
        biometryType,
    } = useContext(AuthContext);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState('');

    const handleBiometricLogin = async () => {
        setError('');
        try {
            await biometricLogin();
        } catch (e) {
            setError(
                e instanceof Error
                    ? e.message
                    : 'Error de autenticación biométrica'
            );
        }
    };

    // Lanzar biometría automáticamente al abrir la pantalla si ya está habilitada
    useEffect(() => {
        if (isBiometricAvailable && isBiometricEnabled) {
            const timer = setTimeout(() => {
                handleBiometricLogin();
            }, 400); // Pequeño delay para que la pantalla termine de montar
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isBiometricAvailable, isBiometricEnabled]);

    const handleLogin = async () => {
        if (!username || !password) {
            Vibration.vibrate([0, 200, 100, 200]);
            setError('Por favor completa todos los campos');
            return;
        }
        setError('');
        try {
            await login(username, password);
        } catch (e) {
            Vibration.vibrate([0, 200, 100, 200]);
            setError(
                (e instanceof Error && e.message) ||
                    'Error al iniciar sesión. Verifica tus credenciales.'
            );
        }
    };

    const biometricIcon =
        biometryType === 'FaceID' ? 'face-recognition' : 'fingerprint';
    const biometricLabel =
        biometryType === 'FaceID' ? 'Face ID' : 'Huella digital';

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>Logix Mobile</Text>

                {error ? (
                    <View style={styles.errorContainer}>
                        <Text style={styles.errorText}>{error}</Text>
                    </View>
                ) : null}

                {/* Indicador de biometría activa */}
                {isBiometricAvailable && isBiometricEnabled && (
                    <TouchableOpacity
                        style={styles.biometricBanner}
                        onPress={handleBiometricLogin}
                        disabled={isLoading}
                    >
                        <Icon
                            name={biometricIcon}
                            size={22}
                            color={fluent.colors.primary}
                        />
                        <Text style={styles.biometricBannerText}>
                            Toca para entrar con {biometricLabel}
                        </Text>
                        <Icon
                            name="chevron-right"
                            size={20}
                            color={fluent.colors.primary}
                        />
                    </TouchableOpacity>
                )}

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Usuario</Text>
                    <TextInput
                        style={styles.input}
                        value={username}
                        onChangeText={setUsername}
                        placeholder="Ingresa tu usuario"
                        placeholderTextColor="#999"
                        autoCapitalize="none"
                    />
                </View>

                <View style={styles.inputContainer}>
                    <Text style={styles.label}>Contraseña</Text>
                    <View style={styles.passwordContainer}>
                        <TextInput
                            style={styles.passwordInput}
                            value={password}
                            onChangeText={setPassword}
                            placeholder="Ingresa tu contraseña"
                            placeholderTextColor="#999"
                            secureTextEntry={!isPasswordVisible}
                        />
                        <TouchableOpacity
                            style={styles.eyeIcon}
                            onPress={() =>
                                setIsPasswordVisible(!isPasswordVisible)
                            }
                        >
                            <Icon
                                name={isPasswordVisible ? 'eye-off' : 'eye'}
                                size={28}
                                color="#666"
                            />
                        </TouchableOpacity>
                    </View>
                </View>

                <View style={styles.actionsContainer}>
                    <TouchableOpacity
                        style={[
                            styles.button,
                            styles.flexOne,
                            isLoading && styles.buttonDisabled,
                        ]}
                        onPress={handleLogin}
                        disabled={isLoading}
                    >
                        {isLoading ? (
                            <ActivityIndicator color="#fff" />
                        ) : (
                            <Text style={styles.buttonText}>Entrar</Text>
                        )}
                    </TouchableOpacity>

                    {isBiometricAvailable && (
                        <TouchableOpacity
                            style={[
                                styles.biometricButton,
                                !isBiometricEnabled &&
                                    styles.biometricButtonDisabled,
                            ]}
                            onPress={handleBiometricLogin}
                            disabled={isLoading}
                        >
                            <Icon
                                name={biometricIcon}
                                size={32}
                                color={isBiometricEnabled ? '#0070d2' : '#bbb'}
                            />
                        </TouchableOpacity>
                    )}
                </View>

                {/* Hint cuando biometría aún no está configurada */}
                {isBiometricAvailable && !isBiometricEnabled && (
                    <Text style={styles.biometricHint}>
                        Inicia sesión una vez para activar el acceso con{' '}
                        {biometricLabel}
                    </Text>
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: fluent.colors.pageBg,
        justifyContent: 'center',
    },
    flexOne: { flex: 1 },
    content: {
        padding: 24,
    },
    title: {
        fontSize: 28,
        fontWeight: '700',
        color: fluent.colors.neutralPrimary,
        marginBottom: 28,
        textAlign: 'center',
        letterSpacing: 0.2,
    },
    biometricBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fluent.colors.infoLight,
        borderWidth: 1,
        borderColor: fluent.colors.infoBorder,
        borderRadius: fluent.radius.xs,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginBottom: 20,
        gap: 10,
    },
    biometricBannerText: {
        flex: 1,
        color: fluent.colors.primary,
        fontSize: 14,
        fontWeight: '600',
    },
    inputContainer: {
        marginBottom: 18,
    },
    label: {
        fontSize: 13,
        color: fluent.colors.neutralPrimary,
        marginBottom: 6,
        fontWeight: '600',
    },
    input: {
        backgroundColor: fluent.colors.white,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        borderRadius: fluent.radius.xs,
        padding: 14,
        fontSize: 15,
        color: fluent.colors.neutralPrimary,
    },
    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: fluent.colors.white,
        borderWidth: 1,
        borderColor: fluent.borders.color,
        borderRadius: fluent.radius.xs,
    },
    passwordInput: {
        flex: 1,
        padding: 14,
        fontSize: 15,
        color: fluent.colors.neutralPrimary,
    },
    eyeIcon: {
        padding: 12,
        paddingRight: 14,
    },
    actionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 16,
        gap: 12,
    },
    button: {
        backgroundColor: fluent.colors.primary,
        padding: 16,
        borderRadius: fluent.radius.xs,
        alignItems: 'center',
        ...fluent.shadows.card,
    },
    biometricButton: {
        backgroundColor: fluent.colors.white,
        padding: 12,
        borderRadius: fluent.radius.xs,
        borderWidth: 1,
        borderColor: fluent.colors.primary,
        alignItems: 'center',
        justifyContent: 'center',
    },
    biometricButtonDisabled: {
        borderColor: fluent.borders.color,
        backgroundColor: fluent.colors.neutralLighter,
    },
    buttonDisabled: {
        backgroundColor: fluent.colors.neutralTertiaryAlt,
    },
    buttonText: {
        color: fluent.colors.white,
        fontSize: 16,
        fontWeight: '600',
        letterSpacing: 0.3,
    },
    biometricHint: {
        marginTop: 16,
        textAlign: 'center',
        color: fluent.colors.neutralSecondary,
        fontSize: 12,
    },
    errorContainer: {
        backgroundColor: fluent.colors.errorLight,
        borderWidth: 1,
        borderColor: fluent.colors.errorBorder,
        padding: 12,
        borderRadius: fluent.radius.xs,
        marginBottom: 20,
    },
    errorText: {
        color: fluent.colors.error,
        textAlign: 'center',
        fontWeight: '600',
        fontSize: 13,
    },
});

export default LoginScreen;
