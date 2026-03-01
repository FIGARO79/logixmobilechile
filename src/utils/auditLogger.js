import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Audit Logger: Guarda eventos críticos localmente para trazabilidad.
 * 
 * @param {string} user Usuario que realiza la acción.
 * @param {string} action Acción realizada (ej. LOGIN, PICKING, SLOT_MOVE).
 * @param {object} details Información extra relevante.
 */
const logAudit = async (user, action, details = {}) => {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            user,
            action,
            details,
        };

        // Recuperar logs existentes (mantenemos los últimos 100)
        const existingLogsStr = await AsyncStorage.getItem('audit_logs');
        const existingLogs = existingLogsStr ? JSON.parse(existingLogsStr) : [];
        
        const updatedLogs = [logEntry, ...existingLogs].slice(0, 100);
        
        await AsyncStorage.setItem('audit_logs', JSON.stringify(updatedLogs));
        
        console.log(`[AUDIT] ${timestamp} | ${user} | ${action}`, details);
    } catch (error) {
        console.error('Error guardando log de auditoría:', error);
    }
};

const getAuditLogs = async () => {
    try {
        const logsStr = await AsyncStorage.getItem('audit_logs');
        return logsStr ? JSON.parse(logsStr) : [];
    } catch (e) {
        return [];
    }
};

const clearAuditLogs = async () => {
    await AsyncStorage.removeItem('audit_logs');
};

export { logAudit, getAuditLogs, clearAuditLogs };
