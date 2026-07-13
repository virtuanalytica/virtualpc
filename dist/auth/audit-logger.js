"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CEOAuditLogger = void 0;
const logger_1 = __importDefault(require("../utils/logger"));
class CEOAuditLogger {
    constructor() {
        this.events = [];
        this.maxEvents = 10000; // Keep last 10k events
        this.criticalEventCallbacks = [];
    }
    /**
     * Log audit event
     */
    logEvent(userId, username, role, eventType, ipAddress, deviceId, location, description, outcome, options) {
        const event = {
            id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp: new Date(),
            userId,
            username,
            role,
            eventType,
            severity: options?.severity || this.determineSeverity(eventType, outcome),
            ipAddress,
            deviceId,
            location,
            description,
            resource: options?.resource,
            action: options?.action,
            outcome,
            details: options?.details,
            durationMs: options?.durationMs
        };
        this.events.push(event);
        // Keep only last N events
        if (this.events.length > this.maxEvents) {
            this.events.shift();
        }
        // Alert on critical events
        if (event.severity === 'critical') {
            this.triggerCriticalAlert(event);
        }
        // Log to system
        const icon = event.severity === 'critical' ? '🚨' : event.severity === 'warning' ? '⚠️' : 'ℹ️';
        logger_1.default.info(`${icon} AUDIT: ${event.username} (${event.role}) - ${event.eventType} - ${event.outcome} ` +
            `[${event.ipAddress} / ${event.deviceId} / ${event.location}]`);
        return event;
    }
    /**
     * Determine severity based on event type and outcome
     */
    determineSeverity(eventType, outcome) {
        const criticalEvents = [
            'permission_escalation',
            'sensitive_data_access',
            'user_delete',
            'config_change',
            'invalid_access'
        ];
        if (outcome === 'failure' && ['permission_denied', 'invalid_access'].includes(eventType)) {
            return 'warning';
        }
        if (criticalEvents.includes(eventType)) {
            return 'critical';
        }
        return 'info';
    }
    /**
     * Trigger callback for critical events
     */
    triggerCriticalAlert(event) {
        this.criticalEventCallbacks.forEach(callback => {
            try {
                callback(event);
            }
            catch (error) {
                logger_1.default.error('Critical event callback failed:', error);
            }
        });
    }
    /**
     * Register callback for critical events
     */
    onCriticalEvent(callback) {
        this.criticalEventCallbacks.push(callback);
    }
    /**
     * Clamp a caller-supplied limit to a safe [1, maxEvents] integer. Guards the
     * slice(-limit) accessors against negative/NaN/oversized limits — a negative
     * limit would otherwise turn slice(-limit) into slice(+n) and bypass the cap.
     */
    clampLimit(limit) {
        return Math.max(1, Math.min(Math.floor(limit) || 1, this.maxEvents));
    }
    /**
     * Get events by user
     */
    getEventsByUser(username, limit = 100) {
        return this.events
            .filter(e => e.username === username)
            .slice(-this.clampLimit(limit));
    }
    /**
     * Get events by type
     */
    getEventsByType(eventType, limit = 100) {
        return this.events
            .filter(e => e.eventType === eventType)
            .slice(-this.clampLimit(limit));
    }
    /**
     * Get events by severity
     */
    getEventsBySeverity(severity, limit = 100) {
        return this.events
            .filter(e => e.severity === severity)
            .slice(-this.clampLimit(limit));
    }
    /**
     * Get events in time range
     */
    getEventsByTimeRange(startTime, endTime, limit = 1000) {
        return this.events
            .filter(e => e.timestamp >= startTime && e.timestamp <= endTime)
            .slice(-this.clampLimit(limit));
    }
    /**
     * Get events from IP address
     */
    getEventsByIP(ipAddress, limit = 100) {
        return this.events
            .filter(e => e.ipAddress === ipAddress)
            .slice(-this.clampLimit(limit));
    }
    /**
     * Get all events
     */
    getAllEvents(limit = 100) {
        return this.events.slice(-this.clampLimit(limit));
    }
    /**
     * Combined audit search: filter by any subset of criteria (AND semantics),
     * returning the most recent `limit` matches. Powers the CEO audit search UI
     * (username / IP / action / type / severity / outcome + date range).
     */
    search(filter = {}, limit = 100) {
        return this.events
            .filter(e => {
            if (filter.username && e.username !== filter.username)
                return false;
            if (filter.ipAddress && e.ipAddress !== filter.ipAddress)
                return false;
            if (filter.eventType && e.eventType !== filter.eventType)
                return false;
            if (filter.severity && e.severity !== filter.severity)
                return false;
            if (filter.outcome && e.outcome !== filter.outcome)
                return false;
            if (filter.action && e.action !== filter.action)
                return false;
            if (filter.startTime && e.timestamp < filter.startTime)
                return false;
            if (filter.endTime && e.timestamp > filter.endTime)
                return false;
            return true;
        })
            .slice(-this.clampLimit(limit));
    }
    /**
     * Get audit statistics
     */
    getStatistics() {
        const byType = {};
        const bySeverity = { info: 0, warning: 0, critical: 0 };
        const byUser = {};
        const byOutcome = { success: 0, failure: 0 };
        this.events.forEach(event => {
            byType[event.eventType] = (byType[event.eventType] || 0) + 1;
            bySeverity[event.severity]++;
            byUser[event.username] = (byUser[event.username] || 0) + 1;
            byOutcome[event.outcome]++;
        });
        // Get unique users and IPs
        const uniqueUsers = new Set(this.events.map(e => e.username)).size;
        const uniqueIPs = new Set(this.events.map(e => e.ipAddress)).size;
        // Get failed login attempts (brute force detection)
        const failedLogins = this.events.filter(e => e.eventType === 'login' && e.outcome === 'failure');
        const failedLoginsByIP = {};
        failedLogins.forEach(e => {
            failedLoginsByIP[e.ipAddress] = (failedLoginsByIP[e.ipAddress] || 0) + 1;
        });
        return {
            total_events: this.events.length,
            total_users: uniqueUsers,
            total_ips: uniqueIPs,
            by_type: byType,
            by_severity: bySeverity,
            by_user: byUser,
            by_outcome: byOutcome,
            failed_logins_by_ip: Object.entries(failedLoginsByIP)
                .filter(([, count]) => count >= 3)
                .map(([ip, count]) => ({ ip, count }))
                .sort((a, b) => b.count - a.count)
        };
    }
    /**
     * Export audit log (CSV)
     */
    exportAsCSV() {
        const headers = [
            'Timestamp',
            'User',
            'Role',
            'Event Type',
            'Severity',
            'IP Address',
            'Device ID',
            'Location',
            'Description',
            'Outcome',
            'Duration (ms)'
        ];
        const rows = this.events.map(e => [
            e.timestamp.toISOString(),
            e.username,
            e.role,
            e.eventType,
            e.severity,
            e.ipAddress,
            e.deviceId,
            e.location,
            e.description,
            e.outcome,
            e.durationMs || '-'
        ]);
        const csvContent = [
            headers.join(','),
            ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        return csvContent;
    }
    /**
     * Export audit log (JSON)
     */
    exportAsJSON() {
        return JSON.stringify(this.events, null, 2);
    }
    /**
     * Clear old events (older than N days)
     */
    clearOldEvents(daysOld) {
        const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
        const beforeCount = this.events.length;
        this.events = this.events.filter(e => e.timestamp > cutoffDate);
        const deleted = beforeCount - this.events.length;
        logger_1.default.info(`✓ Cleared ${deleted} audit events older than ${daysOld} days`);
        return deleted;
    }
    /**
     * Get audit health score (0-100)
     * Based on: low security events, failed logins, suspicious access
     */
    getSecurityScore() {
        let score = 100;
        // Penalize failed logins
        const failedLogins = this.events.filter(e => e.eventType === 'login' && e.outcome === 'failure').length;
        score -= Math.min(failedLogins * 2, 30);
        // Penalize permission denied events
        const permissionDenied = this.events.filter(e => e.eventType === 'permission_denied').length;
        score -= Math.min(permissionDenied, 10);
        // Penalize invalid access attempts
        const invalidAccess = this.events.filter(e => e.eventType === 'invalid_access').length;
        score -= Math.min(invalidAccess * 3, 30);
        // Bonus for sensitive data access logged properly
        const sensitiveAccess = this.events.filter(e => e.eventType === 'sensitive_data_access' && e.outcome === 'success').length;
        score += Math.min(sensitiveAccess * 0.5, 10);
        return Math.max(0, Math.min(100, score));
    }
}
exports.CEOAuditLogger = CEOAuditLogger;
exports.default = CEOAuditLogger;
//# sourceMappingURL=audit-logger.js.map