/**
 * Authentication Routes
 * Login, logout, profile, user management
 */
import express from 'express';
import AuthSystem from './auth-system';
import AuthMiddleware from './auth-middleware';
import CEOAuditLogger from './audit-logger';
import { LoginAnomalyMonitor, LoginRiskAssessment } from '../security/loginAnomalyMonitor';
export interface AuthRouteDeps {
    /** When provided, anomalous logins are written to the audit trail. */
    auditLogger?: CEOAuditLogger;
    /** When provided, each login attempt is scored for anomalies. */
    anomalyMonitor?: LoginAnomalyMonitor;
}
/**
 * Score a login attempt for anomalies, record it into the monitor's history,
 * and — when the risk is medium/high — write an audit event. Pure and
 * dependency-injected so it can be unit-tested without an HTTP server.
 *
 * Returns the assessment, or null if no monitor was wired.
 */
export declare function processLoginAttempt(attempt: {
    username: string;
    ipAddress: string;
    deviceId: string;
    location?: string;
    outcome: 'success' | 'failure';
    /** Which auth step this attempt is — distinguishes login vs 2FA in the audit trail. */
    stage?: 'login' | '2fa';
}, deps: AuthRouteDeps): LoginRiskAssessment | null;
/** Result of a route-level guard check. */
export interface GuardResult {
    allowed: boolean;
    status?: number;
    error?: string;
}
/**
 * Guard for DELETE /api/auth/sessions/:sessionId — a CEO must not revoke the
 * session backing the current request (that's self-lockout; use logout).
 */
export declare function checkSessionRevocation(targetSessionId: string, currentSessionId?: string): GuardResult;
/**
 * Guard for POST /api/auth/sessions/revoke-user — validate the username,
 * require the user to exist (consistent 404, no silent enumeration), and block
 * a CEO from revoking ALL of their own sessions (self-lockout).
 */
export declare function checkRevokeUser(username: unknown, currentUsername: string, userExists: boolean): GuardResult;
export declare function setupAuthRoutes(app: express.Express, authSystem: AuthSystem, authMiddleware: AuthMiddleware, deps?: AuthRouteDeps): void;
export default setupAuthRoutes;
//# sourceMappingURL=auth-routes.d.ts.map