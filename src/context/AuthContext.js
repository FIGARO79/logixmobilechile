import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';
import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';
import { logAudit } from '../utils/auditLogger';
import { startSyncListener } from '../utils/syncManager';

export const AuthContext = createContext();

const rnBiometrics = new ReactNativeBiometrics();

export const AuthProvider = ({ children }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [userInfo, setUserInfo] = useState(null);
    const [splashLoading, setSplashLoading] = useState(true);
    const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
    const [biometryType, setBiometryType] = useState(null);

    useEffect(() => {
        checkBiometrics();
        // Iniciar el listener de sincronización offline al montar la app
        startSyncListener();
    }, []);

    const checkBiometrics = async () => {
        try {
            const { available, biometryType } = await rnBiometrics.isSensorAvailable();
            if (available) {
                setIsBiometricAvailable(true);
                setBiometryType(biometryType);
            }
        } catch (error) {
            console.error('Error checking biometrics:', error);
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
                await AsyncStorage.setItem('user', JSON.stringify(data.user));
                // Guardar credenciales para login biométrico futuro (solo username por ahora)
                await AsyncStorage.setItem('last_username', username);
                
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
            const lastUser = await AsyncStorage.getItem('last_username');
            if (!lastUser) {
                throw new Error('No hay una sesión previa para usar biometría. Por favor inicia sesión manualmente una vez.');
            }

            const { success } = await rnBiometrics.simplePrompt({
                promptMessage: 'Confirma tu identidad para entrar a LogixMobile',
                cancelButtonText: 'Cancelar',
            });

            if (success) {
                setIsLoading(true);
                // En un entorno real, aquí usarías un refresh token o un secret guardado en el Keychain.
                // Por ahora, simulamos la restauración de la sesión del último usuario si existe en storage.
                const storedUser = await AsyncStorage.getItem('user');
                if (storedUser) {
                    const userData = JSON.parse(storedUser);
                    setUserInfo(userData);
                    await logAudit(userData.username, 'LOGIN_SUCCESS', { method: 'biometric' });
                    setIsLoading(false);
                    return true;
                } else {
                    throw new Error('Sesión expirada. Por favor inicia sesión manualmente.');
                }
            }
            return false;
        } catch (error) {
            setIsLoading(false);
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
        await AsyncStorage.removeItem('user');
        await logAudit(username, 'LOGOUT');
        setIsLoading(false);
    };

    const isLoggedIn = async () => {
        try {
            setSplashLoading(true);
            let user = await AsyncStorage.getItem('user');
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
            biometryType
        }}>
            {children}
        </AuthContext.Provider>
    );
};