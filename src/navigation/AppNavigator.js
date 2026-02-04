import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthContext } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import StockScreen from '../screens/StockScreen';
import CountsScreen from '../screens/CountsScreen';
import PickingScreen from '../screens/PickingScreen';
import InboundScreen from '../screens/InboundScreen';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

const Stack = createNativeStackNavigator();

const AppNavigator = () => {
    const { splashLoading, userInfo } = useContext(AuthContext);

    if (splashLoading) {
        return (
            <View style={styles.splashContainer}>
                <ActivityIndicator size="large" color="#0070d2" />
            </View>
        );
    }

    return (
        <NavigationContainer>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
                {userInfo ? (
                    <>
                        <Stack.Screen name="Dashboard" component={DashboardScreen} />
                        <Stack.Screen name="Stock" component={StockScreen} />
                        <Stack.Screen name="Counts" component={CountsScreen} />
                        <Stack.Screen name="Picking" component={PickingScreen} />
                        <Stack.Screen name="Inbound" component={InboundScreen} />
                    </>
                ) : (
                    <Stack.Screen name="Login" component={LoginScreen} />
                )}
            </Stack.Navigator>
        </NavigationContainer>
    );
};

const styles = StyleSheet.create({
    splashContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
});

export default AppNavigator;
