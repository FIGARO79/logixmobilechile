import React, { createContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import client from '../api/client';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [userToken, setUserToken] = useState(null);
    const [userInfo, setUserInfo] = useState(null);
    const [splashLoading, setSplashLoading] = useState(true);

    const login = async (username, password) => {
        setIsLoading(true);
        try {
            // Backend expects FormData for login
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
            } else {
                // Fallback if structure is different, though we saw data.user in Login.jsx
                if (data.msg === "Login Successful") {
                    // Handle case where user object might be missing or different
                    // But based on Login.jsx it expects data.user
                }
            }

            setIsLoading(false);
            return data;
        } catch (error) {
            // console.error('Login error', error);
            setIsLoading(false);
            // Throw to let the screen handle the error message display
            const msg = error.response?.data?.error || error.message;
            throw new Error(msg);
        }
    };

    const logout = async () => {
        setIsLoading(true);
        try {
            // Optional: call backend logout
            // await client.post('/api/logout'); 
        } catch (e) {
            // console.log(e);
        }

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
            // console.log(`isLogged in error ${e}`);
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
