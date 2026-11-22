import React, { useContext, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { SyncContext } from '../context/SyncContext';
import fluent from '../theme/fluent';

const SyncStatusHeader: React.FC = () => {
    const { pendingCount, isSyncing, isConnected } = useContext(SyncContext);
    const spinValue = useRef(new Animated.Value(0)).current;

    // Animación de rotación para cuando está sincronizando
    useEffect(() => {
        if (isSyncing) {
            Animated.loop(
                Animated.timing(spinValue, {
                    toValue: 1,
                    duration: 1500,
                    easing: Easing.linear,
                    useNativeDriver: true,
                })
            ).start();
        } else {
            spinValue.setValue(0);
        }
    }, [isSyncing, spinValue]);

    const spin = spinValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '360deg'],
    });

    if (!isConnected) {
        return (
            <View style={styles.container}>
                <Icon name="wifi-off" size={20} color={fluent.colors.error} />
                <Text style={[styles.text, { color: fluent.colors.error }]}>
                    Sin red
                </Text>
            </View>
        );
    }

    if (isSyncing) {
        return (
            <View style={styles.container}>
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <Icon name="sync" size={20} color={fluent.colors.info} />
                </Animated.View>
                <Text style={[styles.text, { color: fluent.colors.info }]}>
                    Enviando...
                </Text>
            </View>
        );
    }

    if (pendingCount > 0) {
        return (
            <View style={styles.container}>
                <View style={styles.badgeContainer}>
                    <Icon
                        name="cloud-upload-outline"
                        size={22}
                        color={fluent.colors.warningText}
                    />
                    <View style={styles.badge}>
                        <Text style={styles.badgeText}>{pendingCount}</Text>
                    </View>
                </View>
                <Text
                    style={[styles.text, { color: fluent.colors.warningText }]}
                >
                    Pendiente
                </Text>
            </View>
        );
    }

    // Estado ideal: Todo al día
    return (
        <View style={styles.container}>
            <Icon name="cloud-check" size={22} color={fluent.colors.success} />
            <Text style={[styles.text, { color: fluent.colors.success }]}>
                Al día
            </Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        gap: 6,
    },
    text: {
        fontSize: 12,
        fontWeight: '600',
    },
    badgeContainer: {
        position: 'relative',
    },
    badge: {
        position: 'absolute',
        top: -4,
        right: -6,
        backgroundColor: fluent.colors.error,
        borderRadius: fluent.radius.xs,
        minWidth: 16,
        height: 16,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 2,
    },
    badgeText: {
        color: fluent.colors.white,
        fontSize: 10,
        fontWeight: 'bold',
    },
});

export default SyncStatusHeader;
