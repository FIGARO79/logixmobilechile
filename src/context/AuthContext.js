import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [userInfo, setUserInfo] = useState(null);
    const [splashLoading, setSplashLoading] = useState(true);

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
            
            throw new Error(msg);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            await client.post('/api/logout').catch(() => {}); 
        } catch (e) {}

        setUserInfo(null);
        await AsyncStorage.removeItem('user');
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
        <AuthContext.Provider value={{ login, logout, isLoading, userInfo, splashLoading }}>
            {children}
        </AuthContext.Provider>
    );
};