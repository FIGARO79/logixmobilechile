import React, { useContext } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
    View,
    ActivityIndicator,
    StyleSheet,
    TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AuthContext } from '../context/AuthContext';
import LoginScreen from '../screens/LoginScreen';
import DashboardScreen from '../screens/DashboardScreen';
import StockScreen from '../screens/StockScreen';
import SpotCheckScreen from '../screens/SpotCheckScreen';
import CountsScreen from '../screens/CountsScreen';
import W2WScreen from '../screens/W2WScreen';
import PickingScreen from '../screens/PickingScreen';
import InboundScreen from '../screens/InboundScreen';
import SyncStatusHeader from '../components/SyncStatusHeader';
import fluent from '../theme/fluent';

export type RootStackParamList = {
    Login: undefined;
    Dashboard: undefined;
    Stock: undefined;
    SpotCheck: undefined;
    Counts: { initialTab?: 'cyclic' | 'manual' } | undefined;
    W2W: undefined;
    Picking: undefined;
    Inbound: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const renderHeaderRight = (hasUser: boolean): React.ReactNode =>
    hasUser ? <SyncStatusHeader /> : null;

const AppNavigator: React.FC = () => {
    const { splashLoading, userInfo, logout } = useContext(AuthContext);

    if (splashLoading) {
        return (
            <View style={styles.splashContainer}>
                <ActivityIndicator size="large" color={fluent.colors.primary} />
            </View>
        );
    }

    const renderDashboardHeaderLeft = (): React.ReactNode => (
        <TouchableOpacity onPress={() => logout()} style={styles.logoutButton}>
            <Icon name="logout" size={22} color={fluent.colors.error} />
        </TouchableOpacity>
    );

    return (
        <NavigationContainer>
            <Stack.Navigator
                screenOptions={{
                    headerShown: Boolean(userInfo),
                    headerRight: () => renderHeaderRight(Boolean(userInfo)),
                    headerStyle: {
                        backgroundColor: fluent.colors.white,
                    },
                    headerTitleStyle: {
                        fontWeight: '600',
                        fontSize: 16,
                        color: fluent.colors.neutralPrimary,
                    },
                    headerTintColor: fluent.colors.primary,
                    headerShadowVisible: false,
                }}
            >
                {userInfo ? (
                    <>
                        <Stack.Screen
                            name="Dashboard"
                            component={DashboardScreen}
                            options={{
                                title: 'LogixMobile',
                                headerLeft: renderDashboardHeaderLeft,
                            }}
                        />
                        <Stack.Screen
                            name="Stock"
                            component={StockScreen}
                            options={{ title: 'Inventario' }}
                        />
                        <Stack.Screen
                            name="SpotCheck"
                            component={SpotCheckScreen}
                            options={{ title: 'Spot Check', headerShown: false }}
                        />
                        <Stack.Screen
                            name="Counts"
                            component={CountsScreen}
                            options={{ title: 'Conteos' }}
                        />
                        <Stack.Screen
                            name="W2W"
                            component={W2WScreen}
                            options={{ title: 'Conteo W2W' }}
                        />
                        <Stack.Screen
                            name="Picking"
                            component={PickingScreen}
                            options={{ title: 'Picking' }}
                        />
                        <Stack.Screen
                            name="Inbound"
                            component={InboundScreen}
                            options={{ title: 'Entradas' }}
                        />
                    </>
                ) : (
                    <Stack.Screen
                        name="Login"
                        component={LoginScreen}
                        options={{ headerShown: false }}
                    />
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
    logoutButton: {
        marginLeft: 0,
        paddingRight: 15,
    },
});

export default AppNavigator;
