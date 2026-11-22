import React, { useContext, useMemo } from 'react';
import {
    View,
    Text,
    TouchableOpacity,
    StyleSheet,
    ScrollView,
    Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { AuthContext } from '../context/AuthContext';
import fluent from '../theme/fluent';
import type { RootStackParamList } from '../navigation/AppNavigator';

type ScreenName = Exclude<keyof RootStackParamList, 'Login' | 'Dashboard'>;

interface DashboardModule {
    id: string;
    title: string;
    desc: string;
    screen: ScreenName;
    icon: string;
    params?: RootStackParamList[ScreenName];
    permission: string | string[];
}

const allModules: DashboardModule[] = [
    {
        id: 'inbound',
        title: 'Inbound',
        desc: 'Gestión de Entradas',
        screen: 'Inbound',
        icon: 'truck-delivery-outline',
        permission: 'inbound',
    },
    {
        id: 'counts',
        title: 'Conteos',
        desc: 'Cíclico y Manual',
        screen: 'Counts',
        icon: 'clipboard-check-outline',
        params: { initialTab: 'cyclic' },
        permission: 'counts',
    },
    {
        id: 'picking',
        title: 'Picking',
        desc: 'Auditoría de Picking',
        screen: 'Picking',
        icon: 'dolly',
        permission: 'picking',
    },
    {
        id: 'stock',
        title: 'Stock',
        desc: 'Consulta de Inventario',
        screen: 'Stock',
        icon: 'package-variant-closed',
        permission: 'stock',
    },
    {
        id: 'w2w',
        title: 'W2W',
        desc: 'Toma Físico Wall-to-Wall',
        screen: 'W2W',
        icon: 'warehouse',
        permission: ['w2w', 'stock', 'inventory', 'counts'],
    },
];

type Props = NativeStackScreenProps<RootStackParamList, 'Dashboard'>;

const DashboardScreen: React.FC<Props> = ({ navigation }) => {
    const { userInfo } = useContext(AuthContext);

    const availableModules = useMemo(() => {
        if (!userInfo) return allModules;

        if (
            userInfo.username === 'admin' ||
            userInfo.role === 'admin' ||
            userInfo.is_admin ||
            !userInfo.permissions
        ) {
            return allModules;
        }

        let userPerms: string[] = [];
        if (Array.isArray(userInfo.permissions)) {
            userPerms = userInfo.permissions.map((p) =>
                String(p).trim().toLowerCase()
            );
        } else if (typeof userInfo.permissions === 'string') {
            userPerms = userInfo.permissions
                .split(',')
                .map((p) => p.trim().toLowerCase());
        }

        if (
            userPerms.length === 0 ||
            userPerms.includes('*') ||
            userPerms.includes('all') ||
            userPerms.includes('admin')
        ) {
            return allModules;
        }

        const filtered = allModules.filter((module) => {
            if (!module.permission) return true;
            const perms = Array.isArray(module.permission)
                ? module.permission.map((p) => String(p).toLowerCase())
                : [String(module.permission).toLowerCase()];
            return perms.some((p) => userPerms.includes(p));
        });

        return filtered.length > 0 ? filtered : allModules;
    }, [userInfo]);

    const handleModulePress = (module: DashboardModule) => {
        if (module && module.screen) {
            if (module.screen === 'Counts') {
                navigation.navigate(
                    'Counts',
                    module.params as { initialTab?: 'cyclic' | 'manual' }
                );
            } else {
                navigation.navigate(module.screen);
            }
        } else {
            Alert.alert(
                'En Desarrollo',
                `El módulo "${module?.title || 'seleccionado'}" estará disponible pronto.`
            );
        }
    };

    return (
        <SafeAreaView
            style={styles.container}
            edges={['right', 'bottom', 'left']}
        >
            <ScrollView contentContainerStyle={styles.grid}>
                {availableModules.map((module) => (
                    <TouchableOpacity
                        key={module.id}
                        style={styles.card}
                        activeOpacity={0.7}
                        onPress={() => handleModulePress(module)}
                    >
                        <View style={styles.iconCircle}>
                            <Icon
                                name={module.icon || 'view-dashboard'}
                                size={28}
                                color={fluent.colors.primary}
                            />
                        </View>
                        <Text style={styles.cardTitle}>{module.title}</Text>
                        <Text style={styles.cardDesc}>{module.desc}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: fluent.colors.pageBg,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        padding: 10,
    },
    card: {
        backgroundColor: fluent.colors.cardBg,
        width: '46%',
        margin: '2%',
        paddingVertical: 18,
        paddingHorizontal: 12,
        borderRadius: fluent.radius.sm,
        borderWidth: 1,
        borderColor: fluent.colors.neutralQuaternary,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 140,
        ...fluent.shadows.card,
    },
    iconCircle: {
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: fluent.colors.primaryLighterAlt,
        borderWidth: 1,
        borderColor: fluent.colors.primaryLight,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 10,
    },
    cardTitle: {
        fontSize: 15,
        fontWeight: '600',
        marginBottom: 4,
        color: fluent.colors.neutralPrimary,
        letterSpacing: 0.2,
    },
    cardDesc: {
        fontSize: 12,
        color: fluent.colors.neutralSecondary,
        textAlign: 'center',
        lineHeight: 16,
    },
    noAccessContainer: {
        width: '100%',
        padding: 40,
        alignItems: 'center',
    },
    noAccessText: {
        textAlign: 'center',
        fontSize: 14,
        color: fluent.colors.error,
        lineHeight: 20,
    },
});

export default DashboardScreen;
