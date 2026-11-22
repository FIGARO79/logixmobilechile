import React, { createContext, useState, useEffect, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAxiosError } from 'axios';
import ReactNativeBiometrics, { BiometryType } from 'react-native-biometrics';
import client from '../api/client';
import { logAudit } from '../utils/auditLogger';

export interface UserInfo {
    username: string;
    permissions?: string;
    role?: string;
    id?: number;
    [key: string]: unknown;
}

export interface AuthContextValue {
    login: (username: string, password: string) => Promise<Record<string, unknown>>;
    biometricLogin: () => Promise<boolean>;
    logout: () => Promise<void>;
    isLoading: boolean;
    userInfo: UserInfo | null;
    splashLoading: boolean;
    isBiometricAvailable: boolean;
    isBiometricEnabled: boolean;
    biometryType: BiometryType | null;
}

export const AuthContext = createContext<AuthContextValue>(
    {} as AuthContextValue
);

const rnBiometrics = new ReactNativeBiometrics();

/**
 * Polyfill de Base64 para React Native (reemplaza btoa/atob)
 */
const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
const btoaPolyfill = (input = ''): string => {
    const str = input;
    let output = '';
    for (
        let block = 0, charCode: number, i = 0, map = chars;
        str.charAt(i | 0) || ((map = '='), i % 1);
        output += map.charAt(63 & (block >> (8 - (i % 1) * 8)))
    ) {
        charCode = str.charCodeAt((i += 3 / 4));
        if (charCode > 0xff) {
            throw new Error(
                "'btoa' failed: The string to be encoded contains characters outside of the Latin1 range."
            );
        }
        block = (block << 8) | charCode;
    }
    return output;
};

const atobPolyfill = (input = ''): string => {
    const str = input.replace(/=+$/, '');
    let output = '';
    if (str.length % 4 === 1) {
        throw new Error(
            "'atob' failed: The string to be decoded is not correctly encoded."
        );
    }
    for (
        let bc = 0, bs = 0, buffer: string | number, i = 0;
        (buffer = str.charAt(i++));
        ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
            ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
            : 0
    ) {
        buffer = chars.indexOf(buffer);
    }
    return output;
};

const encode = (str: string): string =>
    btoaPolyfill(unescape(encodeURIComponent(str)));
const decode = (str: string): string =>
    decodeURIComponent(escape(atobPolyfill(str)));

const STORAGE_KEYS = {
    USER: 'user',
    BIO_USER: 'bio_cred_u',
    BIO_PASS: 'bio_cred_p',
    BIO_ENABLED: 'bio_enabled',
} as const;

interface AuthProviderProps {
    children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
    const [splashLoading, setSplashLoading] = useState(true);
    const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);
    const [isBiometricEnabled, setIsBiometricEnabled] = useState(false);
    const [biometryType, setBiometryType] = useState<BiometryType | null>(null);

    const checkBiometrics = async (): Promise<void> => {
        try {
            const { available, biometryType: type } =
                await rnBiometrics.isSensorAvailable();
            if (available) {
                setIsBiometricAvailable(true);
                setBiometryType(type ?? null);
                const enabled = await AsyncStorage.getItem(
                    STORAGE_KEYS.BIO_ENABLED
                );
                setIsBiometricEnabled(enabled === 'true');
            }
        } catch (error) {
            console.error('Error checking biometrics:', error);
        }
    };

    useEffect(() => {
        checkBiometrics();
    }, []);

    /**
     * Guarda las credenciales ofuscadas para uso biométrico futuro.
     * Solo se llama tras un login manual exitoso.
     */
    const saveBiometricCredentials = async (
        username: string,
        password: string
    ): Promise<void> => {
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

    const login = async (
        username: string,
        password: string
    ): Promise<Record<string, unknown>> => {
        setIsLoading(true);
        try {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);

            const response = await client.post<{
                user?: UserInfo;
                [key: string]: unknown;
            }>('/api/login', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const data = response.data;

            if (data.user) {
                setUserInfo(data.user);
                await AsyncStorage.setItem(
                    STORAGE_KEYS.USER,
                    JSON.stringify(data.user)
                );
                // Guardar credenciales para login biométrico futuro
                await saveBiometricCredentials(username, password);
                await logAudit(username, 'LOGIN_SUCCESS', { method: 'manual' });
            }

            setIsLoading(false);
            return data;
        } catch (error) {
            setIsLoading(false);
            let msg = 'Error de conexión con el servidor';

            if (isAxiosError(error)) {
                const errData = error.response?.data as
                    | { error?: string; detail?: string }
                    | undefined;

                if (error.code === 'ECONNABORTED') {
                    msg =
                        'La conexión está tardando demasiado. Verifica tu señal o reintenta.';
                } else if (error.response) {
                    if (error.response.status === 429) {
                        msg =
                            'Demasiados intentos. Por favor, espera un minuto antes de reintentar.';
                    } else if (error.response.status === 401) {
                        msg = 'Usuario o contraseña incorrectos.';
                    } else if (error.response.status === 403) {
                        msg =
                            errData?.error ||
                            'Tu cuenta está pendiente de aprobación o no tienes permisos.';
                    } else {
                        msg =
                            errData?.error ||
                            errData?.detail ||
                            'Error en el servidor';
                    }
                } else if (error.message.includes('Network Error')) {
                    msg =
                        'No se pudo contactar con el servidor. Revisa tu conexión a internet o el estado del servidor.';
                }
            }

            await logAudit(username || 'unknown', 'LOGIN_FAILED', {
                error: msg,
            });
            throw new Error(msg);
        }
    };

    const biometricLogin = async (): Promise<boolean> => {
        try {
            // 1. Verificar que hay credenciales guardadas
            const [encodedUser, encodedPass] = await AsyncStorage.multiGet([
                STORAGE_KEYS.BIO_USER,
                STORAGE_KEYS.BIO_PASS,
            ]);
            const storedUser = encodedUser[1];
            const storedPass = encodedPass[1];

            if (!storedUser || !storedPass) {
                throw new Error(
                    'No hay credenciales registradas. Inicia sesión manualmente una vez para habilitar la biometría.'
                );
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

            const response = await client.post<{
                user?: UserInfo;
                [key: string]: unknown;
            }>('/api/login', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            const data = response.data;

            if (data.user) {
                setUserInfo(data.user);
                await AsyncStorage.setItem(
                    STORAGE_KEYS.USER,
                    JSON.stringify(data.user)
                );
                await logAudit(username, 'LOGIN_SUCCESS', {
                    method: 'biometric',
                });
                setIsLoading(false);
                return true;
            }

            setIsLoading(false);
            return false;
        } catch (error) {
            setIsLoading(false);
            // Si las credenciales ya no son válidas en el servidor, deshabilitar biometría
            if (
                isAxiosError(error) &&
                (error.response?.status === 401 || error.response?.status === 403)
            ) {
                await AsyncStorage.multiRemove([
                    STORAGE_KEYS.BIO_USER,
                    STORAGE_KEYS.BIO_PASS,
                    STORAGE_KEYS.BIO_ENABLED,
                ]);
                setIsBiometricEnabled(false);
                throw new Error(
                    'Tu contraseña cambió o tu cuenta fue desactivada. Por favor inicia sesión manualmente.'
                );
            }
            const errMessage =
                error instanceof Error ? error.message : String(error);
            await logAudit('unknown', 'BIOMETRIC_FAILED', {
                error: errMessage,
            });
            throw error;
        }
    };

    const logout = async (): Promise<void> => {
        setIsLoading(true);
        const username = userInfo?.username || 'unknown';
        try {
            await client.post('/api/logout').catch(() => {});
        } catch {
            // Ignorar error de red al cerrar sesión
        }

        setUserInfo(null);
        // Solo borramos la sesión activa, NO las credenciales biométricas,
        // para que el próximo acceso pueda usar huella/face sin re-ingresar contraseña.
        await AsyncStorage.removeItem(STORAGE_KEYS.USER);
        await logAudit(username, 'LOGOUT');
        setIsLoading(false);
    };

    const isLoggedIn = async (): Promise<void> => {
        try {
            setSplashLoading(true);
            const user = await AsyncStorage.getItem(STORAGE_KEYS.USER);
            if (user) {
                setUserInfo(JSON.parse(user) as UserInfo);
            }
            setSplashLoading(false);
        } catch {
            setSplashLoading(false);
        }
    };

    useEffect(() => {
        isLoggedIn();
    }, []);

    return (
        <AuthContext.Provider
            value={{
                login,
                biometricLogin,
                logout,
                isLoading,
                userInfo,
                splashLoading,
                isBiometricAvailable,
                isBiometricEnabled,
                biometryType,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};
