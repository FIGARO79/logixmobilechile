import parseBarcode, { normalizeItemCode } from '../src/utils/barcodeParser';

describe('barcodeParser - LogixMobile', () => {
    test('Código simple EAN-13', () => {
        const result = parseBarcode('7701234567890');
        expect(result.itemCode).toBe('7701234567890');
        expect(result.isGS1).toBe(false);
        expect(result.isQR).toBe(false);
    });

    test('GTIN-14 con cero inicial recorta ceros a la izquierda', () => {
        const result = parseBarcode('00770123456789');
        expect(result.itemCode).toBe('770123456789');
    });

    test('Limpieza de Symbology Identifier (AIM Flags) de escáneres', () => {
        const result1 = parseBarcode(']Q3ITEM999');
        expect(result1.itemCode).toBe('ITEM999');

        const result2 = parseBarcode(']C1010770123456789010LOTE123');
        expect(result2.itemCode).toBe('7701234567890');
        expect(result2.lot).toBe('LOTE123');
        expect(result2.isGS1).toBe(true);
    });

    test('JSON QR con campos variados', () => {
        const jsonStr = JSON.stringify({
            sku: 'PART123',
            lote: 'BATCH-99',
            qty: 15,
            vencimiento: '261231'
        });
        const result = parseBarcode(jsonStr);
        expect(result.itemCode).toBe('PART123');
        expect(result.lot).toBe('BATCH-99');
        expect(result.quantity).toBe(15);
        expect(result.expirationDate).toBe('2026-12-31');
        expect(result.isQR).toBe(true);
    });

    test('GS1 Digital Link URL', () => {
        const url = 'https://id.gs1.org/01/07701234567890/10/LOTE_URL/17/251231';
        const result = parseBarcode(url);
        expect(result.itemCode).toBe('7701234567890');
        expect(result.lot).toBe('LOTE_URL');
        expect(result.expirationDate).toBe('2025-12-31');
        expect(result.isGS1).toBe(true);
        expect(result.isQR).toBe(true);
    });

    test('GS1 con paréntesis', () => {
        const code = '(01)07701234567890(10)LOTE_PAR(17)260630(21)SN100';
        const result = parseBarcode(code);
        expect(result.itemCode).toBe('7701234567890');
        expect(result.lot).toBe('LOTE_PAR');
        expect(result.expirationDate).toBe('2026-06-30');
        expect(result.serial).toBe('SN100');
        expect(result.isGS1).toBe(true);
    });

    test('QR delimitado por "#" con prefijo +Q y AIs de GS1', () => {
        const code = '+Q3240012345#10LOTE_HASH#21SN999#422CN';
        const result = parseBarcode(code);
        expect(result.itemCode).toBe('12345');
        expect(result.lot).toBe('LOTE_HASH');
        expect(result.serial).toBe('SN999');
        expect(result.countryOfOrigin).toBe('CN');
        expect(result.isGS1).toBe(true);
        expect(result.isQR).toBe(true);
    });

    test('Prueba específica de escaneo: +Q3240BG00648693#107300207855#21#422IT', () => {
        const code = '+Q3240BG00648693#107300207855#21#422IT';
        const result = parseBarcode(code);
        console.log('Resultado del parseo:', result);
        expect(result.itemCode).toBe('BG00648693');
        expect(result.lot).toBe('7300207855');
        expect(result.countryOfOrigin).toBe('IT');
        expect(result.serial).toBeUndefined();
    });

    test('QR delimitado por Pipes con Clave:Valor', () => {
        const code = 'SKU:PROD555|LOT:LOTE_PIPE|QTY:20';
        const result = parseBarcode(code);
        expect(result.itemCode).toBe('PROD555');
        expect(result.lot).toBe('LOTE_PIPE');
        expect(result.quantity).toBe(20);
        expect(result.isQR).toBe(true);
    });

    test('QR delimitado por Pipes posicional (sin Clave:Valor)', () => {
        const code = 'ITEM777|LOTE_POS|50';
        const result = parseBarcode(code);
        expect(result.itemCode).toBe('ITEM777');
        expect(result.lot).toBe('LOTE_POS');
        expect(result.quantity).toBe(50);
        expect(result.isQR).toBe(true);
    });

    test('GS1 Stream crudo 01 GTIN-14', () => {
        const code = '010770123456789010LOTE_STREAM\u001d17260515';
        const result = parseBarcode(code);
        expect(result.itemCode).toBe('7701234567890');
        expect(result.lot).toBe('LOTE_STREAM');
        expect(result.expirationDate).toBe('2026-05-15');
        expect(result.isGS1).toBe(true);
    });
});
