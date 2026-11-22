import AsyncStorage from '@react-native-async-storage/async-storage';

export interface AuditLogEntry {
    timestamp: string;
    user: string;
    action: string;
    details: Record<string, unknown>;
}

/**
 * Audit Logger: Guarda eventos críticos localmente para trazabilidad.
 *
 * @param user Usuario que realiza la acción.
 * @param action Acción realizada (ej. LOGIN, PICKING, SLOT_MOVE).
 * @param details Información extra relevante.
 */
const logAudit = async (
    user: string,
    action: string,
    details: Record<string, unknown> = {}
): Promise<void> => {
    try {
        const timestamp = new Date().toISOString();
        const logEntry: AuditLogEntry = {
            timestamp,
            user,
            action,
            details,
        };

        // Recuperar logs existentes (mantenemos los últimos 100)
        const existingLogsStr = await AsyncStorage.getItem('audit_logs');
        const existingLogs: AuditLogEntry[] = existingLogsStr
            ? JSON.parse(existingLogsStr)
            : [];

        const updatedLogs = [logEntry, ...existingLogs].slice(0, 100);

        await AsyncStorage.setItem('audit_logs', JSON.stringify(updatedLogs));

        console.log(`[AUDIT] ${timestamp} | ${user} | ${action}`, details);
    } catch (error) {
        console.error('Error guardando log de auditoría:', error);
    }
};

const getAuditLogs = async (): Promise<AuditLogEntry[]> => {
    try {
        const logsStr = await AsyncStorage.getItem('audit_logs');
        return logsStr ? JSON.parse(logsStr) : [];
    } catch {
        return [];
    }
};

const clearAuditLogs = async (): Promise<void> => {
    await AsyncStorage.removeItem('audit_logs');
};

export { logAudit, getAuditLogs, clearAuditLogs };
