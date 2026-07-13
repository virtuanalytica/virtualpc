/**
 * Employee Authentication System
 *
 * 5-role based access control:
 * - CEO (Full access, audit logging)
 * - CTO (Infrastructure, system config)
 * - Developer (Feature development, code)
 * - Artist (Visual design, assets)
 * - Tech Artist (Performance, shaders, optimization)
 */
import FieldCrypto from '../security/fieldCrypto';
export type UserRole = 'ceo' | 'cto' | 'developer' | 'artist' | 'tech_artist';
export interface User {
    id: string;
    username: string;
    email: string;
    role: UserRole;
    passwordHash: string;
    createdAt: Date;
    lastLogin?: Date;
    status: 'active' | 'inactive' | 'suspended';
    metadata?: Record<string, any>;
    /** TOTP secret in base32. Present even when 2FA is mid-setup. */
    totpSecret?: string;
    /** Once true, login requires a valid TOTP code in addition to password. */
    totpEnabled?: boolean;
}
export interface AuthToken {
    userId: string;
    username: string;
    role: UserRole;
    issuedAt: Date;
    expiresAt: Date;
    sessionId: string;
}
export interface LoginRequest {
    username: string;
    password: string;
    ipAddress?: string;
    deviceId?: string;
    location?: string;
}
export interface RolePermissions {
    canAccessDashboard: boolean;
    canManageUsers: boolean;
    canViewAuditLog: boolean;
    canModifyConfig: boolean;
    canExecuteCommands: boolean;
    canViewSensitiveData: boolean;
    canAssignTasks: boolean;
    canApproveDeployments: boolean;
    canAccessFinancials: boolean;
}
export declare const ROLE_PERMISSIONS: Record<UserRole, RolePermissions>;
export declare class AuthSystem {
    private users;
    private sessions;
    private loginAttempts;
    private twoFactorChallenges;
    /** When set, TOTP secrets are encrypted at rest (backlog 6.5.20). */
    private fieldCrypto?;
    /** When non-empty, CEO logins are only allowed from these IPs. */
    private ceoIpAllowlist;
    constructor(opts?: {
        fieldCrypto?: FieldCrypto;
        ceoIpAllowlist?: string[];
    });
    /** Store form of a TOTP secret: encrypted when field encryption is enabled. */
    private storeTotpSecret;
    /** Usable plaintext TOTP secret for a user (decrypts at-rest ciphertext). */
    private readTotpSecret;
    /**
     * Initialize default users (demo)
     */
    private initializeDefaultUsers;
    /**
     * Hash a password with scrypt and a fresh random salt.
     * Format: "scrypt$<salt-b64>$<hash-b64>" — self-contained, no external store.
     */
    private hashPassword;
    /**
     * Constant-time verify against a stored scrypt hash. Refuses any other format
     * so legacy base64 hashes from the previous demo implementation can't pass.
     */
    private verifyPassword;
    /**
     * Login user. If the account has 2FA enabled, the password check passes but
     * the response carries `requires2fa: true` plus a short-lived `challengeId`
     * that must be exchanged via verifyTwoFactor() before a session is issued.
     */
    login(request: LoginRequest): {
        success: boolean;
        token?: AuthToken;
        requires2fa?: boolean;
        challengeId?: string;
        error?: string;
    };
    /**
     * Exchange a 2FA challenge + TOTP code for a real session token.
     * Single-use: the challenge is consumed whether or not the code matches.
     */
    verifyTwoFactor(challengeId: string, code: string): {
        success: boolean;
        token?: AuthToken;
        error?: string;
        username?: string;
    };
    /**
     * Begin TOTP setup for a user: generate a secret and otpauth URI. The user
     * must call enableTotp() with a valid code generated from this secret to
     * actually arm 2FA. Calling setup again before enable rotates the secret.
     */
    setupTotp(userId: string): {
        success: boolean;
        secret?: string;
        uri?: string;
        error?: string;
    };
    /**
     * Confirm the authenticator app is wired up by verifying a code, then arm
     * 2FA on the account. Refuses if setupTotp() has not been called.
     */
    enableTotp(userId: string, code: string): {
        success: boolean;
        error?: string;
    };
    /**
     * Disarm 2FA. Requires both the current password (proves session ownership
     * isn't enough) and a valid TOTP code (proves the authenticator is still
     * present, defending against a stolen session that was kept open).
     */
    disableTotp(userId: string, password: string, code: string): {
        success: boolean;
        error?: string;
    };
    /**
     * Issue a fresh session token for a user. Internal helper shared by the
     * password-only and 2FA login paths.
     */
    private issueSession;
    /**
     * Record failed login attempt
     */
    private recordFailedAttempt;
    /**
     * Verify token
     */
    verifyToken(sessionId: string): AuthToken | null;
    /**
     * Logout user
     */
    logout(sessionId: string): void;
    /**
     * List active (non-expired) sessions with safe metadata for admin views
     * (backlog 6.5.14). Expired sessions are pruned as a side effect.
     */
    getActiveSessions(): Array<{
        sessionId: string;
        userId: string;
        username: string;
        role: UserRole;
        issuedAt: Date;
        expiresAt: Date;
    }>;
    /**
     * Admin: revoke a single session by id. Returns true if a session was
     * actually removed (false if the id was unknown / already gone).
     */
    revokeSession(sessionId: string): boolean;
    /**
     * Admin: revoke every active session for a username (e.g. on compromise).
     * Returns the number of sessions removed.
     */
    revokeUserSessions(username: string): number;
    /**
     * Get user by ID
     */
    getUser(userId: string): User | null;
    /**
     * Get user role permissions
     */
    getPermissions(role: UserRole): RolePermissions;
    /**
     * Check permission
     */
    hasPermission(role: UserRole, permission: keyof RolePermissions): boolean;
    /**
     * Get all users
     */
    getAllUsers(): User[];
    /**
     * Create user (admin only)
     */
    createUser(username: string, email: string, role: UserRole, password: string): {
        success: boolean;
        user?: User;
        error?: string;
    };
    /**
     * Role privilege levels for hierarchy enforcement. Higher = more privileged.
     * A user may manage (suspend/delete) targets of equal-or-lower privilege but
     * never one ranked above them — so a CTO cannot touch a CEO. The dangerous
     * equal-rank case (a CEO acting on another CEO) is bounded separately by the
     * last-active-CEO lockout guard below.
     */
    private static readonly PRIVILEGE;
    /** True if actorRole may manage targetRole (equal or higher privilege than the target). */
    canManage(actorRole: UserRole, targetRole: UserRole): boolean;
    /** Count active users holding a given role (used for lockout protection). */
    private countActiveByRole;
    /**
     * Change a user's status (active/inactive/suspended). Enforces role
     * hierarchy and, when deactivating, revokes that user's active sessions so a
     * suspended account can't keep using an existing token.
     */
    setUserStatus(actorRole: UserRole, userId: string, status: 'active' | 'inactive' | 'suspended'): {
        success: boolean;
        error?: string;
    };
    /**
     * Delete a user. Enforces role hierarchy, blocks deleting the last active
     * CEO, and revokes the user's sessions.
     */
    deleteUser(actorRole: UserRole, userId: string): {
        success: boolean;
        error?: string;
    };
    /**
     * Change password
     */
    changePassword(userId: string, oldPassword: string, newPassword: string): {
        success: boolean;
        error?: string;
    };
    /**
     * Get session statistics
     */
    getSessionStats(): Record<string, any>;
}
export default AuthSystem;
//# sourceMappingURL=auth-system.d.ts.map