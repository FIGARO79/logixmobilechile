import React, { useContext, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { AuthContext } from '../context/AuthContext';
import { SafeAreaView } from 'react-native-safe-area-context';

const DashboardScreen = ({ navigation }) => {
    const { logout, userInfo } = useContext(AuthContext);

    const allModules = [
        { id: 'inbound', title: 'Inbound', desc: 'Gestión de Entradas', screen: 'Inbound', permission: 'inbound' },
        { id: 'counts', title: 'Conteos', desc: 'Inventario Cíclico', screen: 'Counts', permission: 'counts' },
        { id: 'picking', title: 'Picking', desc: 'Auditoría de Picking', screen: 'Picking', permission: 'picking' },
        { id: 'stock', title: 'Stock', desc: 'Consulta de Inventario', screen: 'Stock', permission: 'stock' },
    ];

    const availableModules = useMemo(() => {
        if (!userInfo) return [];
        if (userInfo.username === 'admin') return allModules;
        const userPerms = userInfo.permissions ? userInfo.permissions.split(',') : [];
        return allModules.filter(module => !module.permission || userPerms.includes(module.permission));
    }, [userInfo]);

    const handleModulePress = (module) => {
        if (module.screen) {
            navigation.navigate(module.screen);
        } else {
            Alert.alert('En Desarrollo', `El módulo "${module.title}" estará disponible pronto.`);
        }
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.welcomeLabel}>Bienvenido,</Text>
                    <Text style={styles.welcomeName}>{userInfo?.username || 'Usuario'}</Text>
                </View>
                <TouchableOpacity onPress={logout} style={styles.logoutButton}>
                    <Text style={styles.logoutText}>Salir</Text>
                </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.grid}>
                {availableModules.length > 0 ? (
                    availableModules.map((module) => (
                        <TouchableOpacity
                            key={module.id}
                            style={styles.card}
                            onPress={() => handleModulePress(module)}
                        >
                            <Text style={styles.cardTitle}>{module.title}</Text>
                            <Text style={styles.cardDesc}>{module.desc}</Text>
                        </TouchableOpacity>
                    ))
                ) : (
                    <View style={styles.noAccessContainer}>
                        <Text style={styles.noAccessText}>
                            No tienes permisos asignados para ningún módulo móvil.
                            Contacta con tu administrador.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#eee',
        marginBottom: 10,
    },
    welcomeLabel: {
        fontSize: 14,
        color: '#666',
        marginBottom: 4,
    },
    welcomeName: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2c3e50',
    },
    logoutButton: {
        paddingVertical: 12,
        paddingHorizontal: 16,
        backgroundColor: '#fee2e2',
        borderRadius: 8,
    },
    logoutText: {
        color: '#dc2626',
        fontSize: 16,
        fontWeight: 'bold',
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 12,
    },
    card: {
        backgroundColor: '#fff',
        width: '45%',
        margin: '2.5%',
        padding: 20,
        borderRadius: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 150,
        borderWidth: 1,
        borderColor: '#f0f0f0',
    },
    cardTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#0070d2',
    },
    cardDesc: {
        fontSize: 14,
        color: '#7f8c8d',
        textAlign: 'center',
    },
    noAccessContainer: {
        width: '100%',
        padding: 40,
        alignItems: 'center',
    },
    noAccessText: {
        textAlign: 'center',
        fontSize: 16,
        color: '#e11d48',
        lineHeight: 24,
    }
});

export default DashboardScreen;