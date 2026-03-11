import React, { useContext, useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Vibration } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const LoginScreen = () => {
    const { login, biometricLogin, isLoading, isBiometricAvailable, isBiometricEnabled, biometryType } = useContext(AuthContext);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [error, setError] = useState('');

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
            setError(e.message || 'Error al iniciar sesión. Verifica tus credenciales.');
        }
    };

    const handleBiometricLogin = async () => {
        setError('');
        try {
            await biometricLogin();
        } catch (e) {
            setError(e.message);
        }
    };

    const biometricIcon = biometryType === 'FaceID' ? 'face-recognition' : 'fingerprint';
    const biometricLabel = biometryType === 'FaceID' ? 'Face ID' : 'Huella digital';

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
                    <TouchableOpacity style={styles.biometricBanner} onPress={handleBiometricLogin} disabled={isLoading}>
                        <Icon name={biometricIcon} size={22} color="#0070d2" />
                        <Text style={styles.biometricBannerText}>
                            Toca para entrar con {biometricLabel}
                        </Text>
                        <Icon name="chevron-right" size={20} color="#0070d2" />
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
                            onPress={() => setIsPasswordVisible(!isPasswordVisible)}
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
                        style={[styles.button, isLoading && styles.buttonDisabled, { flex: 1 }]}
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
                            style={[styles.biometricButton, !isBiometricEnabled && styles.biometricButtonDisabled]}
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
                        Inicia sesión una vez para activar el acceso con {biometricLabel}
                    </Text>
                )}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f5f5',
        justifyContent: 'center',
    },
    content: {
        padding: 24,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: '#2c3e50',
        marginBottom: 28,
        textAlign: 'center',
    },
    biometricBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e8f4fc',
        borderWidth: 1,
        borderColor: '#bee3f8',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginBottom: 20,
        gap: 10,
    },
    biometricBannerText: {
        flex: 1,
        color: '#0070d2',
        fontSize: 15,
        fontWeight: '600',
    },
    inputContainer: {
        marginBottom: 20,
    },
    label: {
        fontSize: 16,
        color: '#444',
        marginBottom: 8,
        fontWeight: '500',
    },
    input: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
        padding: 16,
        fontSize: 16,
        color: '#000',
    },
    passwordContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 8,
    },
    passwordInput: {
        flex: 1,
        padding: 16,
        fontSize: 16,
        color: '#000',
    },
    eyeIcon: {
        padding: 12,
        paddingRight: 16,
    },
    actionsContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 20,
        gap: 12,
    },
    button: {
        backgroundColor: '#0070d2',
        padding: 20,
        borderRadius: 8,
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    biometricButton: {
        backgroundColor: '#fff',
        padding: 14,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#0070d2',
        alignItems: 'center',
        justifyContent: 'center',
    },
    biometricButtonDisabled: {
        borderColor: '#ddd',
        backgroundColor: '#fafafa',
    },
    buttonDisabled: {
        opacity: 0.7,
    },
    buttonText: {
        color: '#fff',
        fontSize: 20,
        fontWeight: 'bold',
    },
    biometricHint: {
        marginTop: 16,
        textAlign: 'center',
        color: '#999',
        fontSize: 13,
    },
    errorContainer: {
        backgroundColor: '#fee2e2',
        borderWidth: 1,
        borderColor: '#f87171',
        padding: 12,
        borderRadius: 6,
        marginBottom: 20,
    },
    errorText: {
        color: '#b91c1c',
        textAlign: 'center',
        fontWeight: '500',
    },
});

export default LoginScreen;
