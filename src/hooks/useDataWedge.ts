import { useEffect, useRef } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import { parseBarcode, ParsedBarcode } from '../utils/barcodeParser';

export type DataWedgeScanCallback = (
    itemCode: string,
    parsed: ParsedBarcode
) => void;

interface DataWedgeIntentEvent {
    code?: string;
}

/**
 * Hook to listen for Zebra DataWedge broadcast intents.
 * Optimized for low latency in industrial environments.
 *
 * @param onScan Callback function when a code is scanned.
 */
const useDataWedge = (onScan: DataWedgeScanCallback): void => {
    const onScanRef = useRef<DataWedgeScanCallback>(onScan);

    // Update the ref whenever onScan changes without re-triggering useEffect
    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    useEffect(() => {
        if (Platform.OS !== 'android') return;

        // Listen for the event emitted from MainActivity.kt
        const subscription = DeviceEventEmitter.addListener(
            'datawedge_broadcast_intent',
            (event: DataWedgeIntentEvent | undefined) => {
                if (event && event.code) {
                    const parsed = parseBarcode(event.code);
                    // Execute the callback stored in ref with itemCode and parsed data object
                    onScanRef.current(parsed.itemCode, parsed);
                }
            }
        );

        return () => {
            subscription.remove();
        };
    }, []); // Only subscribe once on mount
};

export default useDataWedge;
