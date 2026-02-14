import { useEffect } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';

/**
 * Hook to listen for Zebra DataWedge broadcast intents.
 * 
 * @param {Function} onScan Callback function when a code is scanned.
 */
const useDataWedge = (onScan) => {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // Listen for the event emitted from MainActivity.kt
    const subscription = DeviceEventEmitter.addListener('datawedge_broadcast_intent', (event) => {
      if (event && event.code) {
        console.log('[DEBUG] DataWedge Code received:', event.code);
        onScan(event.code);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [onScan]);
};

export default useDataWedge;
