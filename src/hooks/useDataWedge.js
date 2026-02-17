import { useEffect, useRef } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';

/**
 * Hook to listen for Zebra DataWedge broadcast intents.
 * Optimized for low latency in industrial environments.
 * 
 * @param {Function} onScan Callback function when a code is scanned.
 */
const useDataWedge = (onScan) => {
  const onScanRef = useRef(onScan);

  // Update the ref whenever onScan changes without re-triggering useEffect
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;

    // Listen for the event emitted from MainActivity.kt
    const subscription = DeviceEventEmitter.addListener('datawedge_broadcast_intent', (event) => {
      if (event && event.code) {
        // Execute the callback stored in ref
        onScanRef.current(event.code);
      }
    });

    return () => {
      subscription.remove();
    };
  }, []); // Only subscribe once on mount
};

export default useDataWedge;
