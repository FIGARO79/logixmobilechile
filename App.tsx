import React from 'react';
import { AuthProvider } from './src/context/AuthContext';
import { SyncProvider } from './src/context/SyncContext';
import AppNavigator from './src/navigation/AppNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const App = () => {
  return (
    <SafeAreaProvider>
      <SyncProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </SyncProvider>
    </SafeAreaProvider>
  );
};

export default App;
