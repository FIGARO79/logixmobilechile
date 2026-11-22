import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import CyclicCount from '../components/CyclicCount';
import ManualCount from '../components/ManualCount';
import fluent from '../theme/fluent';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'Counts'>;

const CountsScreen: React.FC<Props> = ({ route }) => {
    const [activeTab, setActiveTab] = useState<'cyclic' | 'manual'>(
        route?.params?.initialTab || 'cyclic'
    );

    return (
        <SafeAreaView
            style={styles.container}
            edges={['right', 'bottom', 'left']}
        >
            <View style={styles.tabContainer}>
                <TouchableOpacity
                    style={[
                        styles.tab,
                        activeTab === 'cyclic' && styles.activeTab,
                    ]}
                    onPress={() => setActiveTab('cyclic')}
                >
                    <Text
                        style={[
                            styles.tabText,
                            activeTab === 'cyclic' && styles.activeTabText,
                        ]}
                    >
                        CÍCLICO
                    </Text>
                </TouchableOpacity>
                <TouchableOpacity
                    style={[
                        styles.tab,
                        activeTab === 'manual' && styles.activeTab,
                    ]}
                    onPress={() => setActiveTab('manual')}
                >
                    <Text
                        style={[
                            styles.tabText,
                            activeTab === 'manual' && styles.activeTabText,
                        ]}
                    >
                        MANUAL
                    </Text>
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                {activeTab === 'cyclic' && <CyclicCount />}
                {activeTab === 'manual' && <ManualCount />}
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: fluent.colors.pageBg,
    },
    tabContainer: {
        flexDirection: 'row',
        backgroundColor: fluent.colors.white,
        borderBottomWidth: 1,
        borderBottomColor: fluent.colors.neutralLight,
    },
    tab: {
        flex: 1,
        paddingVertical: 12,
        alignItems: 'center',
        borderBottomWidth: 2,
        borderBottomColor: 'transparent',
    },
    activeTab: {
        borderBottomColor: fluent.colors.primary,
    },
    tabText: {
        fontSize: 13,
        fontWeight: '600',
        color: fluent.colors.neutralSecondary,
        letterSpacing: 0.3,
    },
    activeTabText: {
        color: fluent.colors.primary,
    },
    content: {
        flex: 1,
    },
});

export default CountsScreen;
