import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import ReactNativeBiometrics from 'react-native-biometrics';
import { logAudit } from '../utils/auditLogger';
import { startSyncListener } from '../utils/syncManager';

export const AuthContext = createContext();

const rnBiometrics = new ReactNativeBiometrics();

// Ofuscación simple usando btoa/atob (disponibles en Hermes/React Native).
const encode = (str) => btoa(unescape(encodeURIComponent(str)));
const decode = (str) => decodeURIComponent(escape(atob(str)));

const STORAGE_KEYS = {
    USER: 'user',
    BIO_USER: 'bio_cred_u',
    BIO_PASS: 'bio_cred_p',
    BIO_ENABLED: 'bio_enabled',
};

export const AuthProvider = ({ children }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [userInfo, setUserInfo] = useState(null);
    const [splashLoading, setSplashLoading] = useState(true);
    const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
    const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
    const [biometryType, setBiometryType] = useState(null);

    useEffect(() => {
        checkBiometrics();
        startSyncListener();
    }, []);

    const checkBiometrics = async () => {
        try {
            const { available, biometryType: type } = await rnBiometrics.isSensorAvailable();
            if (available) {
                setIsBiometricAvailable(true);
                setBiometryType(type);
                const enabled = await AsyncStorage.getItem(STORAGE_KEYS.BIO_ENABLED);
                setIsBiometricEnabled(enabled === 'true');
            }
        } catch (error) {
            console.error('Error checking biometrics:', error);
        }
    };

    /**
     * Guarda las credenciales ofuscadas para uso biométrico futuro.
     * Solo se llama tras un login manual exitoso.
     */
    const saveBiometricCredentials = async (username, password) => {
        try {
            await AsyncStorage.multiSet([
                [STORAGE_KEYS.BIO_USER, encode(username)],
                [STORAGE_KEYS.BIO_PASS, encode(password)],
                [STORAGE_KEYS.BIO_ENABLED, 'true'],
            ]);
            setIsBiometricEnabled(true);
        } catch (e) {
            console.warn('No se pudieron guardar credenciales biométricas:', e);
        }
    };

    const login = async (username, password) => {
        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);

            const response = await client.post('/api/login', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const data = response.data;

            if (data.user) {
                setUserInfo(data.user);
                await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
                // Guardar credenciales para login biométrico futuro
                await saveBiometricCredentials(username, password);
                await logAudit(username, 'LOGIN_SUCCESS', { method: 'manual' });
            }

            setIsLoading(false);
            return data;
        } catch (error) {
            setIsLoading(false);
            let msg = 'Error de conexión con el servidor';

            if (error.response) {
                if (error.response.status === 429) {
                    msg = 'Demasiados intentos. Por favor, espera un minuto antes de reintentar.';
                } else if (error.response.status === 401) {
                    msg = 'Usuario o contraseña incorrectos.';
                } else if (error.response.status === 403) {
                    msg = error.response.data?.error || 'Tu cuenta está pendiente de aprobación o no tienes permisos.';
                } else {
                    msg = error.response.data?.error || error.response.data?.detail || 'Error en el servidor';
                }
            }

            await logAudit(username || 'unknown', 'LOGIN_FAILED', { error: msg });
            throw new Error(msg);
        }
    };

    const biometricLogin = async () => {
        try {
            // 1. Verificar que hay credenciales guardadas
            const [encodedUser, encodedPass] = await AsyncStorage.multiGet([
                STORAGE_KEYS.BIO_USER,
                STORAGE_KEYS.BIO_PASS,
            ]);
            const storedUser = encodedUser[1];
            const storedPass = encodedPass[1];

            if (!storedUser || !storedPass) {
                throw new Error('No hay credenciales registradas. Inicia sesión manualmente una vez para habilitar la biometría.');
            }

            // 2. Solicitar autenticación biométrica al sistema operativo
            const { success } = await rnBiometrics.simplePrompt({
                promptMessage: 'Confirma tu identidad para entrar a LogixMobile',
                cancelButtonText: 'Cancelar',
            });

            if (!success) {
                return false;
            }

            // 3. Biometría exitosa → hacer login REAL al servidor con las credenciales guardadas
            setIsLoading(true);
            const username = decode(storedUser);
            const password = decode(storedPass);

            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);

            const response = await client.post('/api/login', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const data = response.data;

            if (data.user) {
                setUserInfo(data.user);
                await AsyncStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(data.user));
                await logAudit(username, 'LOGIN_SUCCESS', { method: 'biometric' });
                setIsLoading(false);
                return true;
            }

            setIsLoading(false);
            return false;
        } catch (error) {
            setIsLoading(false);
            // Si las credenciales ya no son válidas en el servidor, deshabilitar biometría
            if (error.response?.status === 401 || error.response?.status === 403) {
                await AsyncStorage.multiRemove([
                    STORAGE_KEYS.BIO_USER,
                    STORAGE_KEYS.BIO_PASS,
                    STORAGE_KEYS.BIO_ENABLED,
                ]);
                setIsBiometricEnabled(false);
                throw new Error('Tu contraseña cambió o tu cuenta fue desactivada. Por favor inicia sesión manualmente.');
            }
            await logAudit('unknown', 'BIOMETRIC_FAILED', { error: error.message });
            throw error;
        }
    };

    const logout = async () => {
        setIsLoading(true);
        const username = userInfo?.username || 'unknown';
        try {
            await client.post('/api/logout').catch(() => {});
        } catch (e) {}

        setUserInfo(null);
        // Solo borramos la sesión activa, NO las credenciales biométricas,
        // para que el próximo acceso pueda usar huella/face sin re-ingresar contraseña.
        await AsyncStorage.removeItem(STORAGE_KEYS.USER);
        await logAudit(username, 'LOGOUT');
        setIsLoading(false);
    };

    const isLoggedIn = async () => {
        try {
            setSplashLoading(true);
            const user = await AsyncStorage.getItem(STORAGE_KEYS.USER);
            if (user) {
                setUserInfo(JSON.parse(user));
            }
            setSplashLoading(false);
        } catch (e) {
            setSplashLoading(false);
        }
    };

    useEffect(() => {
        isLoggedIn();
    }, []);

    return (
        <AuthContext.Provider value={{
            login,
            biometricLogin,
            logout,
            isLoading,
            userInfo,
            splashLoading,
            isBiometricAvailable,
            isBiometricEnabled,
            biometryType,
        }}>
            {children}
        </AuthContext.Provider>
    );
};