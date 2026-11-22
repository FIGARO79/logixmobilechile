import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import W2WCount from '../components/W2WCount';
import fluent from '../theme/fluent';
import type { RootStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<RootStackParamList, 'W2W'>;

const W2WScreen: React.FC<Props> = ({ navigation }) => {
    return (
        <SafeAreaView
            style={styles.container}
            edges={['right', 'bottom', 'left']}
        >
            <View style={styles.content}>
                <W2WCount navigation={navigation} />
            </View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: fluent.colors.pageBg,
    },
    content: {
        flex: 1,
    },
});

export default W2WScreen;
