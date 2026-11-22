/**
 * Utilidad avanzada para el parseo de códigos de barras GS1-128, códigos QR
 * (incluyendo JSON, GS1 Digital Link, delimitados por |, ;, \t, ASCII 29, y # con prefijo +Q)
 * y códigos de barras estándar (EAN-13, Code-128, Code-39, UPC, etc.)
 */

export interface ParsedBarcode {
    raw: string;
    itemCode: string;
    rawItemCode: string;
    lot?: string;
    lotNumber?: string;
    serial?: string;
    serialNumber?: string;
    quantity?: number;
    expirationDate?: string;
    countryOfOrigin?: string;
    isGS1: boolean;
    isQR: boolean;
    isMultiField: boolean;
    additionalData: Record<string, unknown>;
}

interface InternalParsedResult {
    isGS1?: boolean;
    isQR?: boolean;
    isMultiField: boolean;
    gtin?: string;
    rawItemCode?: string;
    itemCode?: string;
    lot?: string;
    serial?: string;
    quantity?: number;
    expirationDate?: string;
    countryOfOrigin?: string;
    additionalData: Record<string, unknown>;
}

interface GS1AISpec {
    ai: string;
    key: string;
    length: number | null;
    maxLength?: number;
    label: string;
}

/**
 * Elimina prefijos AIM Symbology Identifier (ISO/IEC 15424) de escáneres (ej. "]C1", "]e0", "]d2", "]Q3", "]Q")
 */
const cleanAIMFlag = (str: unknown): string => {
    if (!str) return '';
    return String(str)
        .replace(/^\][A-Za-z0-9]{1,2}/, '')
        .trim();
};

/**
 * Limpia y normaliza un código de ítem (elimina AIM flags y ceros de packaging en GTIN-14)
 *
 * IMPORTANTE: Solo elimina ceros iniciales cuando el código es un GTIN-14 válido
 * (exactamente 14 dígitos numéricos). Para cualquier otro código (ej. SKU "00072080"),
 * los ceros iniciales se preservan para coincidir con el código en la BD del WMS.
 */
export const normalizeItemCode = (code: unknown): string => {
    if (!code) return '';
    const str = cleanAIMFlag(code);

    // Solo eliminar ceros iniciales de packaging para GTIN-14 (exactamente 14 dígitos)
    // El GTIN-14 usa los primeros dígitos como indicador de packaging, no como parte del ítem
    if (/^\d{14}$/.test(str) && /^0+/.test(str)) {
        return str.replace(/^0+/, '') || '0';
    }
    return str;
};

/**
 * Formatea fechas GS1 YYMMDD a YYYY-MM-DD
 */
const formatGS1Date = (yymmdd: unknown): string | undefined => {
    if (!yymmdd || typeof yymmdd !== 'string') return undefined;
    const clean = yymmdd.trim();
    if (clean.length === 6 && /^\d{6}$/.test(clean)) {
        const yy = clean.substring(0, 2);
        const mm = clean.substring(2, 4);
        const dd = clean.substring(4, 6);
        return `20${yy}-${mm}-${dd}`;
    }
    return clean;
};

/**
 * Tabla de Identificadores de Aplicación (AIs) GS1 comunes.
 */
const GS1_AIS: GS1AISpec[] = [
    { ai: '01', key: 'gtin', length: 14, label: 'GTIN' },
    { ai: '02', key: 'contentGtin', length: 14, label: 'GTIN del Contenido' },
    { ai: '10', key: 'lot', length: null, maxLength: 20, label: 'Lote' },
    { ai: '11', key: 'prodDate', length: 6, label: 'Fecha Producción' },
    { ai: '13', key: 'packDate', length: 6, label: 'Fecha Empaque' },
    { ai: '15', key: 'bestBefore', length: 6, label: 'Consumo Preferente' },
    { ai: '17', key: 'expirationDate', length: 6, label: 'Fecha Vencimiento' },
    { ai: '21', key: 'serial', length: null, maxLength: 20, label: 'Serie' },
    { ai: '30', key: 'quantity', length: null, maxLength: 8, label: 'Cantidad' },
    { ai: '37', key: 'tradeQuantity', length: null, maxLength: 8, label: 'Cantidad Unidades' },
    { ai: '240', key: 'additionalItemCode', length: null, maxLength: 30, label: 'Código Adicional' },
    { ai: '400', key: 'customerOrder', length: null, maxLength: 30, label: 'Pedido Cliente' },
    { ai: '422', key: 'countryOfOrigin', length: 3, label: 'País de Origen' },
];

/**
 * Parsea una cadena de texto formateada con paréntesis GS1. Ej: (01)07701234567890(10)LOTE123(17)261231
 */
const parseGS1Parentheses = (rawStr: string): InternalParsedResult | null => {
    const parenRegex = /\((01|02|10|11|13|15|17|21|30|37|240|400|422)\)([^()]+)/g;
    const result: InternalParsedResult = {
        isGS1: false,
        isMultiField: false,
        additionalData: {},
    };
    let match: RegExpExecArray | null;

    while ((match = parenRegex.exec(rawStr)) !== null) {
        result.isGS1 = true;
        result.isMultiField = true;
        const ai = match[1];
        const val = match[2].trim();

        const spec = GS1_AIS.find((item) => item.ai === ai);
        if (spec) {
            if (spec.key === 'gtin' || spec.key === 'additionalItemCode') {
                result.rawItemCode = val;
                result.itemCode = normalizeItemCode(val);
                result.gtin = val;
            } else if (spec.key === 'lot') {
                result.lot = val;
            } else if (spec.key === 'serial') {
                result.serial = val;
            } else if (spec.key === 'expirationDate') {
                result.expirationDate = formatGS1Date(val);
            } else if (spec.key === 'quantity' || spec.key === 'tradeQuantity') {
                result.quantity = parseFloat(val) || undefined;
            } else if (spec.key === 'countryOfOrigin') {
                result.countryOfOrigin = val;
            }
            result.additionalData[spec.key] = val;
        } else {
            result.additionalData[`ai_${ai}`] = val;
        }
    }

    return result.isGS1 ? result : null;
};

/**
 * Parsea una cadena GS1 pura con o sin FNC1 (\u001d / \x1d). Ej: 010770123456789010LOTE123\x1d17251231
 */
const parseGS1Stream = (rawStr: string): InternalParsedResult | null => {
    const clean = cleanAIMFlag(rawStr);

    if (!clean.startsWith('01') || clean.length < 16) {
        return null;
    }

    const gtin = clean.substring(2, 16);
    if (!/^\d{14}$/.test(gtin)) {
        return null;
    }

    const result: InternalParsedResult = {
        isGS1: true,
        isMultiField: true,
        gtin,
        rawItemCode: gtin,
        itemCode: normalizeItemCode(gtin),
        additionalData: { gtin },
    };

    const remainder = clean.substring(16);
    const fnc1Char = '\u001d';
    const parts = remainder.split(new RegExp(`[${fnc1Char}\\x1d]`));

    for (const part of parts) {
        if (!part) continue;
        let pos = 0;
        while (pos < part.length) {
            let matched = false;
            for (const spec of GS1_AIS) {
                if (spec.ai !== '01' && part.startsWith(spec.ai, pos)) {
                    pos += spec.ai.length;
                    let val = '';
                    if (spec.length !== null) {
                        val = part.substring(pos, pos + spec.length);
                        pos += spec.length;
                    } else {
                        val = part.substring(pos);
                        pos = part.length;
                    }

                    if (val) {
                        if (spec.key === 'lot') result.lot = val;
                        else if (spec.key === 'serial') result.serial = val;
                        else if (spec.key === 'expirationDate') {
                            result.expirationDate = formatGS1Date(val);
                        } else if (spec.key === 'quantity') {
                            result.quantity = parseFloat(val) || undefined;
                        } else if (spec.key === 'countryOfOrigin') {
                            result.countryOfOrigin = val;
                        }
                        result.additionalData[spec.key] = val;
                    }
                    matched = true;
                    break;
                }
            }
            if (!matched) {
                pos++;
            }
        }
    }

    return result;
};

/**
 * Parsea un código QR estructurado (JSON, GS1 Digital Link URL, Delimitado por |, ;, \t, \n, ASCII 29, o #)
 */
const parseQRPayload = (rawStr: string): InternalParsedResult | null => {
    const trimmed = cleanAIMFlag(rawStr);

    // 1. Probar formato JSON
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
            const data = JSON.parse(trimmed) as Record<string, unknown>;
            const itemCodeRaw =
                data.sku ||
                data.item_code ||
                data.itemCode ||
                data.item ||
                data.code ||
                data.part_number ||
                data.pn ||
                data.gtin ||
                data.id;
            if (itemCodeRaw) {
                const itemCodeStr = String(itemCodeRaw).trim();
                const lotVal = data.lot || data.lote || data.batch || undefined;
                const serialVal = data.serial || data.sn || data.serie || undefined;
                const qtyVal = data.quantity || data.qty || data.cantidad || data.cant;
                const expVal =
                    data.expirationDate ||
                    data.expiration_date ||
                    data.exp ||
                    data.vencimiento ||
                    undefined;

                return {
                    isQR: true,
                    isMultiField: true,
                    rawItemCode: itemCodeStr,
                    itemCode: normalizeItemCode(itemCodeStr),
                    lot: lotVal ? String(lotVal) : undefined,
                    serial: serialVal ? String(serialVal) : undefined,
                    quantity: qtyVal !== undefined ? parseFloat(String(qtyVal)) : undefined,
                    expirationDate: expVal ? formatGS1Date(String(expVal)) : undefined,
                    additionalData: data,
                };
            }
        } catch {
            // Ignorar si no es JSON válido
        }
    }

    // 2. Probar formato GS1 Digital Link URL (ej: https://id.gs1.org/01/07701234567890/10/LOT123/17/261231)
    if (
        trimmed.startsWith('http://') ||
        trimmed.startsWith('https://') ||
        trimmed.includes('/01/')
    ) {
        try {
            const urlString = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
            const url = new URL(urlString);
            const pathname =
                (url as unknown as { pathname?: string }).pathname ??
                urlString.replace(/^https?:\/\/[^/]+/i, '').split(/[?#]/)[0];
            const pathParts = pathname.split('/').filter(Boolean);
            let gtinVal: string | null = null;
            let lotVal: string | null = null;
            let expVal: string | null = null;
            let serialVal: string | null = null;

            for (let i = 0; i < pathParts.length; i += 2) {
                const ai = pathParts[i];
                const val = pathParts[i + 1];
                if (!val) break;
                if (ai === '01') gtinVal = val;
                else if (ai === '10') lotVal = val;
                else if (ai === '17') expVal = val;
                else if (ai === '21') serialVal = val;
            }

            if (gtinVal) {
                return {
                    isQR: true,
                    isGS1: true,
                    isMultiField: true,
                    rawItemCode: gtinVal,
                    itemCode: normalizeItemCode(gtinVal),
                    lot: lotVal || undefined,
                    serial: serialVal || undefined,
                    expirationDate: expVal ? formatGS1Date(expVal) : undefined,
                    additionalData: {
                        gtin: gtinVal,
                        lot: lotVal,
                        serial: serialVal,
                        expirationDate: expVal,
                    },
                };
            }
        } catch {
            // Ignorar error de URL y continuar
        }
    }

    // 3. Probar formato delimitado por '#' con prefijo de proveedor/planta (+Q...) e identificadores GS1 (#10, #21, #422...)
    if (trimmed.includes('#')) {
        const parts = trimmed
            .split('#')
            .map((p) => p.trim())
            .filter(Boolean);
        if (parts.length > 0) {
            const seg0 = parts[0];
            const rawCode = seg0;
            let extractedItemCode = '';

            // Extraer el código de ítem / SKU eliminando los primeros 6 caracteres si empieza con '+' (ej: "+Q3240012345")
            if (seg0.startsWith('+')) {
                extractedItemCode =
                    seg0.length > 6 ? seg0.substring(6) : seg0.substring(1);
            } else {
                extractedItemCode = normalizeItemCode(seg0);
            }

            let lotVal: string | undefined;
            let serialVal: string | undefined;
            let countryVal: string | undefined;
            const addData: Record<string, unknown> = { rawSeg0: seg0 };

            for (let i = 1; i < parts.length; i++) {
                const part = parts[i];
                if (part.startsWith('10') && part.length > 2) {
                    lotVal = part.substring(2);
                    addData.lot = lotVal;
                } else if (part.startsWith('21')) {
                    serialVal = part.length > 2 ? part.substring(2) : undefined;
                    if (serialVal) addData.serial = serialVal;
                } else if (part.startsWith('422') && part.length > 3) {
                    countryVal = part.substring(3);
                    addData.countryOfOrigin = countryVal;
                } else if (!lotVal && part.length > 0) {
                    lotVal = part;
                    addData.lot = lotVal;
                }
            }

            if (extractedItemCode) {
                return {
                    isQR: true,
                    isGS1: true,
                    isMultiField: true,
                    rawItemCode: rawCode,
                    itemCode: normalizeItemCode(extractedItemCode),
                    lot: lotVal,
                    serial: serialVal,
                    countryOfOrigin: countryVal,
                    additionalData: addData,
                };
            }
        }
    }

    // 4. Probar formato delimitado por '|', ';', '\t', '\n' o ASCII 29 (\x1D) (ej: SKU123|LOTE456|10 o SKU:SKU123;LOT:LOTE456)
    const gsClean = trimmed.replace(/\x1D/g, '|');
    if (
        gsClean.includes('|') ||
        gsClean.includes(';') ||
        gsClean.includes('\t') ||
        gsClean.includes('\n')
    ) {
        const delimiter = gsClean.includes('|')
            ? '|'
            : gsClean.includes(';')
              ? ';'
              : gsClean.includes('\t')
                ? '\t'
                : '\n';
        const parts = gsClean
            .split(delimiter)
            .map((p) => p.trim())
            .filter(Boolean);

        if (parts.length > 1) {
            const parsedObj: {
                lot?: string;
                serial?: string;
                quantity?: number;
                expirationDate?: string;
                [key: string]: unknown;
            } = {};
            let extractedCode: string | null = null;
            let rawCode: string | null = null;

            // Intentar detectar pares Clave:Valor (ej: SKU:ITEM123 | LOT:LOTE99)
            for (const part of parts) {
                const kvMatch = part.match(
                    /^(SKU|ITEM|CODE|ITEM_CODE|GTIN|PN|P\/N|LOT|LOTE|BATCH|QTY|QUANTITY|CANT|EXP|SN|SERIAL|SERIE):\s*(.+)$/i
                );
                if (kvMatch) {
                    const keyUpper = kvMatch[1].toUpperCase();
                    const val = kvMatch[2].trim();

                    if (
                        [
                            'SKU',
                            'ITEM',
                            'CODE',
                            'ITEM_CODE',
                            'GTIN',
                            'PN',
                            'P/N',
                        ].includes(keyUpper)
                    ) {
                        rawCode = val;
                        extractedCode = normalizeItemCode(val);
                    } else if (['LOT', 'LOTE', 'BATCH'].includes(keyUpper)) {
                        parsedObj.lot = val;
                    } else if (['QTY', 'QUANTITY', 'CANT'].includes(keyUpper)) {
                        parsedObj.quantity = parseFloat(val) || undefined;
                    } else if (['SN', 'SERIAL', 'SERIE'].includes(keyUpper)) {
                        parsedObj.serial = val;
                    } else if (keyUpper === 'EXP') {
                        parsedObj.expirationDate = formatGS1Date(val);
                    }
                    parsedObj[keyUpper.toLowerCase()] = val;
                }
            }

            // Si no eran clave:valor, usar la asignación posicional (Pos 0: SKU, Pos 1: Lote, Pos 2: Cantidad)
            if (!extractedCode) {
                rawCode = parts[0];
                extractedCode = normalizeItemCode(parts[0]);
                if (parts[1]) parsedObj.lot = parts[1];
                if (parts[2] && !isNaN(parseFloat(parts[2]))) {
                    parsedObj.quantity = parseFloat(parts[2]);
                }
            }

            if (extractedCode) {
                return {
                    isQR: true,
                    isMultiField: true,
                    rawItemCode: rawCode || extractedCode,
                    itemCode: extractedCode,
                    lot: parsedObj.lot,
                    serial: parsedObj.serial,
                    quantity: parsedObj.quantity,
                    expirationDate: parsedObj.expirationDate,
                    additionalData: parsedObj,
                };
            }
        }
    }

    return null;
};

/**
 * Función principal para escanear y procesar cualquier código de barras o QR.
 *
 * @param rawInput Texto crudo recibido del escáner (DataWedge o Cámara).
 * @returns Objeto procesado con itemCode, rawItemCode, lot, serial, quantity, etc.
 */
export const parseBarcode = (rawInput: string | null | undefined): ParsedBarcode => {
    if (!rawInput) {
        return {
            raw: '',
            itemCode: '',
            rawItemCode: '',
            isGS1: false,
            isQR: false,
            isMultiField: false,
            additionalData: {},
        };
    }

    const rawStr = String(rawInput).trim();
    const cleanStr = cleanAIMFlag(rawStr);

    // 1. Probar parseo GS1 con paréntesis: (01)0770123...
    if (
        cleanStr.includes('(01)') ||
        (cleanStr.startsWith('(') && cleanStr.includes(')'))
    ) {
        const gs1Par = parseGS1Parentheses(cleanStr);
        if (gs1Par && gs1Par.itemCode) {
            return {
                raw: rawStr,
                itemCode: gs1Par.itemCode,
                rawItemCode: gs1Par.rawItemCode || gs1Par.itemCode,
                lot: gs1Par.lot,
                lotNumber: gs1Par.lot,
                serial: gs1Par.serial,
                serialNumber: gs1Par.serial,
                quantity: gs1Par.quantity,
                expirationDate: gs1Par.expirationDate,
                countryOfOrigin: gs1Par.countryOfOrigin,
                isGS1: true,
                isQR: false,
                isMultiField: true,
                additionalData: gs1Par.additionalData,
            };
        }
    }

    // 2. Probar parseo GS1 Stream / FNC1: 010770123456789010LOTE...
    if (
        cleanStr.startsWith('01') ||
        rawStr.startsWith(']C1') ||
        cleanStr.includes('\u001d') ||
        cleanStr.includes('\x1d')
    ) {
        const gs1Stream = parseGS1Stream(cleanStr);
        if (gs1Stream && gs1Stream.itemCode) {
            return {
                raw: rawStr,
                itemCode: gs1Stream.itemCode,
                rawItemCode: gs1Stream.rawItemCode || gs1Stream.itemCode,
                lot: gs1Stream.lot,
                lotNumber: gs1Stream.lot,
                serial: gs1Stream.serial,
                serialNumber: gs1Stream.serial,
                quantity: gs1Stream.quantity,
                expirationDate: gs1Stream.expirationDate,
                countryOfOrigin: gs1Stream.countryOfOrigin,
                isGS1: true,
                isQR: false,
                isMultiField: true,
                additionalData: gs1Stream.additionalData,
            };
        }
    }

    // 3. Probar parseo de Código QR estructurado (JSON, GS1 URL, Delimitado por |, ;, #, ASCII 29, etc.)
    const qrData = parseQRPayload(rawStr);
    if (qrData && qrData.itemCode) {
        return {
            raw: rawStr,
            itemCode: qrData.itemCode,
            rawItemCode: qrData.rawItemCode || qrData.itemCode,
            lot: qrData.lot,
            lotNumber: qrData.lot,
            serial: qrData.serial,
            serialNumber: qrData.serial,
            quantity: qrData.quantity,
            expirationDate: qrData.expirationDate,
            countryOfOrigin: qrData.countryOfOrigin,
            isGS1: !!qrData.isGS1,
            isQR: true,
            isMultiField: !!qrData.isMultiField,
            additionalData: qrData.additionalData || {},
        };
    }

    // 4. Fallback: Código de barras estándar o simple
    const cleanedCode = normalizeItemCode(cleanStr);
    return {
        raw: rawStr,
        itemCode: cleanedCode,
        rawItemCode: cleanStr,
        lot: undefined,
        lotNumber: undefined,
        serial: undefined,
        serialNumber: undefined,
        quantity: undefined,
        expirationDate: undefined,
        isGS1: false,
        isQR: false,
        isMultiField: false,
        additionalData: {},
    };
};

export default parseBarcode;
