/**
 * CEO Audit Logging System
 *
 * Comprehensive audit trail:
 * - Login/logout events
 * - Data access (sensitive, financial)
 * - Configuration changes
 * - User management (create, modify, delete)
 * - Command execution
 * - Permission escalations
 * - IP address, device ID, location
 * - Timestamp, duration, outcome
 */
export type AuditEventType = 'login' | 'logout' | 'data_access' | 'sensitive_data_access' | 'config_change' | 'user_create' | 'user_modify' | 'user_delete' | 'command_execute' | 'permission_escalation' | 'permission_denied' | 'invalid_access' | 'session_timeout' | 'password_change';
export type AuditEventSeverity = 'info' | 'warning' | 'critical';
export interface AuditEvent {
    id: string;
    timestamp: Date;
    userId: string;
    username: string;
    role: string;
    eventType: AuditEventType;
    severity: AuditEventSeverity;
    ipAddress: string;
    deviceId: string;
    location: string;
    description: string;
    resource?: string;
    action?: string;
    outcome: 'success' | 'failure';
    details?: Record<string, any>;
    durationMs?: number;
}
export declare class CEOAuditLogger {
    private events;
    private maxEvents;
    private criticalEventCallbacks;
    /**
     * Log audit event
     */
    logEvent(userId: string, username: string, role: string, eventType: AuditEventType, ipAddress: string, deviceId: string, location: string, description: string, outcome: 'success' | 'failure', options?: {
        severity?: AuditEventSeverity;
        resource?: string;
        action?: string;
        details?: Record<string, any>;
        durationMs?: number;
    }): AuditEvent;
    /**
     * Determine severity based on event type and outcome
     */
    private determineSeverity;
    /**
     * Trigger callback for critical events
     */
    private triggerCriticalAlert;
    /**
     * Register callback for critical events
     */
    onCriticalEvent(callback: (event: AuditEvent) => void): void;
    /**
     * Clamp a caller-supplied limit to a safe [1, maxEvents] integer. Guards the
     * slice(-limit) accessors against negative/NaN/oversized limits — a negative
     * limit would otherwise turn slice(-limit) into slice(+n) and bypass the cap.
     */
    private clampLimit;
    /**
     * Get events by user
     */
    getEventsByUser(username: string, limit?: number): AuditEvent[];
    /**
     * Get events by type
     */
    getEventsByType(eventType: AuditEventType, limit?: number): AuditEvent[];
    /**
     * Get events by severity
     */
    getEventsBySeverity(severity: AuditEventSeverity, limit?: number): AuditEvent[];
    /**
     * Get events in time range
     */
    getEventsByTimeRange(startTime: Date, endTime: Date, limit?: number): AuditEvent[];
    /**
     * Get events from IP address
     */
    getEventsByIP(ipAddress: string, limit?: number): AuditEvent[];
    /**
     * Get all events
     */
    getAllEvents(limit?: number): AuditEvent[];
    /**
     * Combined audit search: filter by any subset of criteria (AND semantics),
     * returning the most recent `limit` matches. Powers the CEO audit search UI
     * (username / IP / action / type / severity / outcome + date range).
     */
    search(filter?: {
        username?: string;
        ipAddress?: string;
        eventType?: AuditEventType;
        severity?: AuditEventSeverity;
        outcome?: 'success' | 'failure';
        action?: string;
        startTime?: Date;
        endTime?: Date;
    }, limit?: number): AuditEvent[];
    /**
     * Get audit statistics
     */
    getStatistics(): Record<string, any>;
    /**
     * Export audit log (CSV)
     */
    exportAsCSV(): string;
    /**
     * Export audit log (JSON)
     */
    exportAsJSON(): string;
    /**
     * Clear old events (older than N days)
     */
    clearOldEvents(daysOld: number): number;
    /**
     * Get audit health score (0-100)
     * Based on: low security events, failed logins, suspicious access
     */
    getSecurityScore(): number;
}
export default CEOAuditLogger;
//# sourceMappingURL=audit-logger.d.ts.map