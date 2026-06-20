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

import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { generateSecret, verifyTotp, otpauthUri } from './totp';
import FieldCrypto from '../security/fieldCrypto';
import logger from '../utils/logger';

const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;
const PASSWORD_HASH_PREFIX = 'scrypt$';
const TWO_FA_CHALLENGE_TTL_MS = 5 * 60 * 1000;
const TWO_FA_ISSUER = 'VirtualPC';

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

interface TwoFactorChallenge {
  userId: string;
  expiresAt: Date;
  ipAddress?: string;
  deviceId?: string;
  location?: string;
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

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  ceo: {
    canAccessDashboard: true,
    canManageUsers: true,
    canViewAuditLog: true,
    canModifyConfig: true,
    canExecuteCommands: true,
    canViewSensitiveData: true,
    canAssignTasks: true,
    canApproveDeployments: true,
    canAccessFinancials: true
  },
  cto: {
    canAccessDashboard: true,
    canManageUsers: false,
    canViewAuditLog: true,
    canModifyConfig: true,
    canExecuteCommands: true,
    canViewSensitiveData: false,
    canAssignTasks: true,
    canApproveDeployments: true,
    canAccessFinancials: false
  },
  developer: {
    canAccessDashboard: true,
    canManageUsers: false,
    canViewAuditLog: false,
    canModifyConfig: false,
    canExecuteCommands: false,
    canViewSensitiveData: false,
    canAssignTasks: false,
    canApproveDeployments: false,
    canAccessFinancials: false
  },
  artist: {
    canAccessDashboard: true,
    canManageUsers: false,
    canViewAuditLog: false,
    canModifyConfig: false,
    canExecuteCommands: false,
    canViewSensitiveData: false,
    canAssignTasks: false,
    canApproveDeployments: false,
    canAccessFinancials: false
  },
  tech_artist: {
    canAccessDashboard: true,
    canManageUsers: false,
    canViewAuditLog: false,
    canModifyConfig: false,
    canExecuteCommands: false,
    canViewSensitiveData: false,
    canAssignTasks: false,
    canApproveDeployments: false,
    canAccessFinancials: false
  }
};

export class AuthSystem {
  private users: Map<string, User> = new Map();
  private sessions: Map<string, AuthToken> = new Map();
  private loginAttempts: Map<string, { count: number; lastAttempt: Date }> = new Map();
  private twoFactorChallenges: Map<string, TwoFactorChallenge> = new Map();
  /** When set, TOTP secrets are encrypted at rest (backlog 6.5.20). */
  private fieldCrypto?: FieldCrypto;
  /** When non-empty, CEO logins are only allowed from these IPs. */
  private ceoIpAllowlist: string[];

  constructor(opts?: { fieldCrypto?: FieldCrypto; ceoIpAllowlist?: string[] }) {
    // Explicit injection wins; otherwise auto-enable if FIELD_ENCRYPTION_KEY is set.
    this.fieldCrypto = opts?.fieldCrypto ?? (process.env.FIELD_ENCRYPTION_KEY ? FieldCrypto.fromEnv() : undefined);
    // CEO IP allowlist: injected, else CEO_IP_ALLOWLIST (comma-separated), else off.
    this.ceoIpAllowlist =
      opts?.ceoIpAllowlist ??
      (process.env.CEO_IP_ALLOWLIST || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    this.initializeDefaultUsers();
  }

  /** Store form of a TOTP secret: encrypted when field encryption is enabled. */
  private storeTotpSecret(secret: string): string {
    return this.fieldCrypto ? this.fieldCrypto.encrypt(secret) : secret;
  }

  /** Usable plaintext TOTP secret for a user (decrypts at-rest ciphertext). */
  private readTotpSecret(user: User): string | undefined {
    if (!user.totpSecret) return undefined;
    if (!this.fieldCrypto) return user.totpSecret;
    try {
      return this.fieldCrypto.decryptField(user.totpSecret) as string;
    } catch (error) {
      // Corrupted/undecryptable secret at rest: fail closed (treated as no
      // secret -> "Invalid 2FA state") rather than throwing a 500.
      logger.error('readTotpSecret: failed to decrypt stored TOTP secret', error);
      return undefined;
    }
  }

  /**
   * Initialize default users (demo)
   */
  private initializeDefaultUsers(): void {
    // The well-known demo passwords (ceo123, kai123, …) are an auth-bypass risk
    // in any real deployment. They are only used when explicitly allowed — the
    // test suite (NODE_ENV=test) or a local opt-in (ALLOW_DEMO_PASSWORDS=1).
    // Otherwise each seed user is provisioned from SEED_<ROLE>_PASSWORD, or a
    // strong random password that is surfaced once via the log so an operator
    // can capture and rotate it.
    const allowDemo =
      process.env.NODE_ENV === 'test' || process.env.ALLOW_DEMO_PASSWORDS === '1';
    const generated: Array<{ username: string; password: string }> = [];
    const seedPassword = (envKey: string, demo: string, username: string): string => {
      const fromEnv = process.env[envKey];
      if (fromEnv && fromEnv.length > 0) return fromEnv;
      if (allowDemo) return demo;
      const pw = randomBytes(12).toString('base64url');
      generated.push({ username, password: pw });
      return pw;
    };

    const defaults: User[] = [
      {
        id: 'user_ceo_001',
        username: 'ceo',
        email: 'ceo@virtualpc.local',
        role: 'ceo',
        passwordHash: this.hashPassword(seedPassword('SEED_CEO_PASSWORD', 'ceo123', 'ceo')),
        createdAt: new Date(),
        status: 'active'
      },
      {
        id: 'user_cto_001',
        username: 'kai',
        email: 'kai@virtualpc.local',
        role: 'cto',
        passwordHash: this.hashPassword(seedPassword('SEED_CTO_PASSWORD', 'kai123', 'kai')),
        createdAt: new Date(),
        status: 'active'
      },
      {
        id: 'user_dev_001',
        username: 'zip',
        email: 'zip@virtualpc.local',
        role: 'developer',
        passwordHash: this.hashPassword(seedPassword('SEED_DEV_PASSWORD', 'zip123', 'zip')),
        createdAt: new Date(),
        status: 'active'
      },
      {
        id: 'user_artist_001',
        username: 'mira',
        email: 'mira@virtualpc.local',
        role: 'artist',
        passwordHash: this.hashPassword(seedPassword('SEED_ARTIST_PASSWORD', 'mira123', 'mira')),
        createdAt: new Date(),
        status: 'active'
      },
      {
        id: 'user_tech_artist_001',
        username: 'luna',
        email: 'luna@virtualpc.local',
        role: 'tech_artist',
        passwordHash: this.hashPassword(seedPassword('SEED_TECH_ARTIST_PASSWORD', 'luna123', 'luna')),
        createdAt: new Date(),
        status: 'active'
      }
    ];

    defaults.forEach(user => {
      this.users.set(user.id, user);
    });

    if (generated.length > 0) {
      logger.warn(
        `🔐 Generated ${generated.length} random seed password(s). Set SEED_<ROLE>_PASSWORD (or ALLOW_DEMO_PASSWORDS=1 for local dev) to control these. Shown once:`
      );
      for (const g of generated) logger.warn(`   • ${g.username}: ${g.password}`);
      logger.warn('   Capture them now or rotate via the auth API — they are not logged again.');
    }
    logger.info(`✓ Auth system initialized with ${defaults.length} default users`);
  }

  /**
   * Hash a password with scrypt and a fresh random salt.
   * Format: "scrypt$<salt-b64>$<hash-b64>" — self-contained, no external store.
   */
  private hashPassword(password: string): string {
    const salt = randomBytes(SCRYPT_SALT_BYTES);
    const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
    return `${PASSWORD_HASH_PREFIX}${salt.toString('base64')}$${derived.toString('base64')}`;
  }

  /**
   * Constant-time verify against a stored scrypt hash. Refuses any other format
   * so legacy base64 hashes from the previous demo implementation can't pass.
   */
  private verifyPassword(password: string, stored: string): boolean {
    if (!stored.startsWith(PASSWORD_HASH_PREFIX)) return false;
    const [, saltB64, hashB64] = stored.split('$');
    if (!saltB64 || !hashB64) return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(hashB64, 'base64');
    if (expected.length !== SCRYPT_KEYLEN) return false;
    const derived = scryptSync(password, salt, SCRYPT_KEYLEN);
    return timingSafeEqual(derived, expected);
  }

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
  } {
    const { username, password, ipAddress, deviceId, location } = request;

    // Check brute force
    const attempts = this.loginAttempts.get(username) || { count: 0, lastAttempt: new Date(0) };
    if (attempts.count >= 5 && Date.now() - attempts.lastAttempt.getTime() < 900000) {
      logger.warn(`🚫 Brute force attempt for user: ${username} from ${ipAddress}`);
      return { success: false, error: 'Too many login attempts. Try again in 15 minutes.' };
    }

    // Find user
    const user = Array.from(this.users.values()).find(u => u.username === username);
    if (!user) {
      this.recordFailedAttempt(username);
      logger.warn(`❌ Login failed: user not found (${username})`);
      return { success: false, error: 'Invalid username or password' };
    }

    // Check password
    if (!this.verifyPassword(password, user.passwordHash)) {
      this.recordFailedAttempt(username);
      logger.warn(`❌ Login failed: invalid password (${username}) from ${ipAddress}`);
      return { success: false, error: 'Invalid username or password' };
    }

    // Check status
    if (user.status !== 'active') {
      logger.warn(`❌ Login failed: user inactive (${username})`);
      return { success: false, error: 'Account is not active' };
    }

    // Clear failed-attempt counter — password was correct.
    this.loginAttempts.delete(username);

    // CEO IP allowlist: even with valid credentials, a CEO may only sign in
    // from an approved network when an allowlist is configured. Checked after
    // password verification so the policy isn't revealed to wrong-password probes.
    if (user.role === 'ceo' && this.ceoIpAllowlist.length > 0 && !this.ceoIpAllowlist.includes(ipAddress || '')) {
      logger.warn(`🚫 CEO login from non-allowlisted IP: ${username} from ${ipAddress}`);
      return { success: false, error: 'Access denied from this network' };
    }

    // If 2FA is enabled, do not issue a session yet — return a challenge.
    if (user.totpEnabled && user.totpSecret) {
      const challengeId = `2fa_${Date.now()}_${randomBytes(12).toString('hex')}`;
      this.twoFactorChallenges.set(challengeId, {
        userId: user.id,
        expiresAt: new Date(Date.now() + TWO_FA_CHALLENGE_TTL_MS),
        ipAddress,
        deviceId,
        location,
      });
      logger.info(`🔐 2FA required: ${username} from ${ipAddress}`);
      return { success: false, requires2fa: true, challengeId };
    }

    return { success: true, token: this.issueSession(user) };
  }

  /**
   * Exchange a 2FA challenge + TOTP code for a real session token.
   * Single-use: the challenge is consumed whether or not the code matches.
   */
  verifyTwoFactor(
    challengeId: string,
    code: string
  ): { success: boolean; token?: AuthToken; error?: string; username?: string } {
    const challenge = this.twoFactorChallenges.get(challengeId);
    if (!challenge) {
      return { success: false, error: 'Invalid or expired 2FA challenge' };
    }
    // Always consume — prevents replay/brute-force on the challenge.
    this.twoFactorChallenges.delete(challengeId);

    if (new Date() > challenge.expiresAt) {
      return { success: false, error: 'Invalid or expired 2FA challenge' };
    }

    const user = this.users.get(challenge.userId);
    if (!user || !user.totpEnabled || !user.totpSecret) {
      return { success: false, error: 'Invalid 2FA state', username: user?.username };
    }

    const secret = this.readTotpSecret(user);
    // username is surfaced on both paths so the caller can feed the attempt to
    // anomaly monitoring even when the code is wrong (TOTP brute-force defence).
    if (!secret || !verifyTotp(secret, code)) {
      logger.warn(`❌ 2FA failed for ${user.username} from ${challenge.ipAddress}`);
      return { success: false, error: 'Invalid 2FA code', username: user.username };
    }

    logger.info(`✅ 2FA passed: ${user.username} from ${challenge.ipAddress} [${challenge.deviceId}]`);
    return { success: true, token: this.issueSession(user), username: user.username };
  }

  /**
   * Begin TOTP setup for a user: generate a secret and otpauth URI. The user
   * must call enableTotp() with a valid code generated from this secret to
   * actually arm 2FA. Calling setup again before enable rotates the secret.
   */
  setupTotp(userId: string): { success: boolean; secret?: string; uri?: string; error?: string } {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };

    const secret = generateSecret();
    user.totpSecret = this.storeTotpSecret(secret);
    user.totpEnabled = false;
    return {
      success: true,
      secret,
      uri: otpauthUri({ secretBase32: secret, issuer: TWO_FA_ISSUER, accountName: user.email }),
    };
  }

  /**
   * Confirm the authenticator app is wired up by verifying a code, then arm
   * 2FA on the account. Refuses if setupTotp() has not been called.
   */
  enableTotp(userId: string, code: string): { success: boolean; error?: string } {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };
    if (!user.totpSecret) return { success: false, error: 'Run setupTotp first' };
    if (!verifyTotp(this.readTotpSecret(user)!, code)) {
      return { success: false, error: 'Invalid 2FA code' };
    }
    user.totpEnabled = true;
    logger.info(`🔐 2FA enabled for ${user.username}`);
    return { success: true };
  }

  /**
   * Disarm 2FA. Requires both the current password (proves session ownership
   * isn't enough) and a valid TOTP code (proves the authenticator is still
   * present, defending against a stolen session that was kept open).
   */
  disableTotp(userId: string, password: string, code: string): { success: boolean; error?: string } {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };
    if (!this.verifyPassword(password, user.passwordHash)) {
      return { success: false, error: 'Password incorrect' };
    }
    if (!user.totpSecret || !verifyTotp(this.readTotpSecret(user)!, code)) {
      return { success: false, error: 'Invalid 2FA code' };
    }
    user.totpSecret = undefined;
    user.totpEnabled = false;
    logger.info(`🔓 2FA disabled for ${user.username}`);
    return { success: true };
  }

  /**
   * Issue a fresh session token for a user. Internal helper shared by the
   * password-only and 2FA login paths.
   */
  private issueSession(user: User): AuthToken {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const token: AuthToken = {
      userId: user.id,
      username: user.username,
      role: user.role,
      issuedAt: new Date(),
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      sessionId,
    };
    this.sessions.set(sessionId, token);
    user.lastLogin = new Date();
    logger.info(`✅ Session issued: ${user.username} (${user.role})`);
    return token;
  }

  /**
   * Record failed login attempt
   */
  private recordFailedAttempt(username: string): void {
    const attempts = this.loginAttempts.get(username) || { count: 0, lastAttempt: new Date() };
    attempts.count++;
    attempts.lastAttempt = new Date();
    this.loginAttempts.set(username, attempts);
  }

  /**
   * Verify token
   */
  verifyToken(sessionId: string): AuthToken | null {
    const token = this.sessions.get(sessionId);
    if (!token) return null;

    if (new Date() > token.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }

    return token;
  }

  /**
   * Logout user
   */
  logout(sessionId: string): void {
    this.sessions.delete(sessionId);
    logger.info(`✓ Logout: ${sessionId}`);
  }

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
  }> {
    const now = Date.now();
    const active: Array<{
      sessionId: string;
      userId: string;
      username: string;
      role: UserRole;
      issuedAt: Date;
      expiresAt: Date;
    }> = [];
    for (const [sessionId, token] of this.sessions.entries()) {
      if (token.expiresAt.getTime() <= now) {
        this.sessions.delete(sessionId); // prune expired
        continue;
      }
      active.push({
        sessionId,
        userId: token.userId,
        username: token.username,
        role: token.role,
        issuedAt: token.issuedAt,
        expiresAt: token.expiresAt,
      });
    }
    return active;
  }

  /**
   * Admin: revoke a single session by id. Returns true if a session was
   * actually removed (false if the id was unknown / already gone).
   */
  revokeSession(sessionId: string): boolean {
    const existed = this.sessions.delete(sessionId);
    if (existed) logger.info(`✓ Session revoked: ${sessionId}`);
    return existed;
  }

  /**
   * Admin: revoke every active session for a username (e.g. on compromise).
   * Returns the number of sessions removed.
   */
  revokeUserSessions(username: string): number {
    let removed = 0;
    for (const [sessionId, token] of this.sessions.entries()) {
      if (token.username === username) {
        this.sessions.delete(sessionId);
        removed++;
      }
    }
    if (removed) logger.info(`✓ Revoked ${removed} session(s) for user: ${username}`);
    return removed;
  }

  /**
   * Get user by ID
   */
  getUser(userId: string): User | null {
    return this.users.get(userId) || null;
  }

  /**
   * Get user role permissions
   */
  getPermissions(role: UserRole): RolePermissions {
    return ROLE_PERMISSIONS[role];
  }

  /**
   * Check permission
   */
  hasPermission(role: UserRole, permission: keyof RolePermissions): boolean {
    return ROLE_PERMISSIONS[role][permission];
  }

  /**
   * Get all users
   */
  getAllUsers(): User[] {
    return Array.from(this.users.values());
  }

  /**
   * Create user (admin only)
   */
  createUser(
    username: string,
    email: string,
    role: UserRole,
    password: string
  ): { success: boolean; user?: User; error?: string } {
    // Check username unique
    if (Array.from(this.users.values()).some(u => u.username === username)) {
      return { success: false, error: 'Username already exists' };
    }

    const user: User = {
      id: `user_${role}_${Date.now()}`,
      username,
      email,
      role,
      passwordHash: this.hashPassword(password),
      createdAt: new Date(),
      status: 'active'
    };

    this.users.set(user.id, user);
    logger.info(`✓ User created: ${username} (${role})`);

    return { success: true, user };
  }

  /**
   * Role privilege levels for hierarchy enforcement. Higher = more privileged.
   * A user may manage (suspend/delete) targets of equal-or-lower privilege but
   * never one ranked above them — so a CTO cannot touch a CEO. The dangerous
   * equal-rank case (a CEO acting on another CEO) is bounded separately by the
   * last-active-CEO lockout guard below.
   */
  private static readonly PRIVILEGE: Record<UserRole, number> = {
    ceo: 3,
    cto: 2,
    developer: 1,
    artist: 1,
    tech_artist: 1,
  };

  /** True if actorRole may manage targetRole (equal or higher privilege than the target). */
  canManage(actorRole: UserRole, targetRole: UserRole): boolean {
    return AuthSystem.PRIVILEGE[actorRole] >= AuthSystem.PRIVILEGE[targetRole];
  }

  /** Count active users holding a given role (used for lockout protection). */
  private countActiveByRole(role: UserRole): number {
    return Array.from(this.users.values()).filter(u => u.role === role && u.status === 'active').length;
  }

  /**
   * Change a user's status (active/inactive/suspended). Enforces role
   * hierarchy and, when deactivating, revokes that user's active sessions so a
   * suspended account can't keep using an existing token.
   */
  setUserStatus(
    actorRole: UserRole,
    userId: string,
    status: 'active' | 'inactive' | 'suspended'
  ): { success: boolean; error?: string } {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };
    if (!this.canManage(actorRole, user.role)) {
      return { success: false, error: 'Insufficient privilege to manage this user' };
    }
    // Don't allow deactivating the last active CEO (lockout protection).
    if (user.role === 'ceo' && status !== 'active' && this.countActiveByRole('ceo') <= 1) {
      return { success: false, error: 'Cannot deactivate the last active CEO' };
    }
    user.status = status;
    if (status !== 'active') {
      this.revokeUserSessions(user.username);
    }
    logger.info(`✓ User status changed: ${user.username} -> ${status}`);
    return { success: true };
  }

  /**
   * Delete a user. Enforces role hierarchy, blocks deleting the last active
   * CEO, and revokes the user's sessions.
   */
  deleteUser(actorRole: UserRole, userId: string): { success: boolean; error?: string } {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };
    if (!this.canManage(actorRole, user.role)) {
      return { success: false, error: 'Insufficient privilege to delete this user' };
    }
    if (user.role === 'ceo' && this.countActiveByRole('ceo') <= 1) {
      return { success: false, error: 'Cannot delete the last active CEO' };
    }
    this.revokeUserSessions(user.username);
    this.users.delete(userId);
    logger.info(`✓ User deleted: ${user.username}`);
    return { success: true };
  }

  /**
   * Change password
   */
  changePassword(userId: string, oldPassword: string, newPassword: string): { success: boolean; error?: string } {
    const user = this.users.get(userId);
    if (!user) return { success: false, error: 'User not found' };

    if (!this.verifyPassword(oldPassword, user.passwordHash)) {
      return { success: false, error: 'Current password is incorrect' };
    }

    user.passwordHash = this.hashPassword(newPassword);
    logger.info(`✓ Password changed for user: ${user.username}`);

    return { success: true };
  }

  /**
   * Get session statistics
   */
  getSessionStats(): Record<string, any> {
    const activeSessions = Array.from(this.sessions.values());
    const roleBreakdown: Record<UserRole, number> = {
      ceo: 0,
      cto: 0,
      developer: 0,
      artist: 0,
      tech_artist: 0
    };

    activeSessions.forEach(token => {
      roleBreakdown[token.role]++;
    });

    return {
      totalActiveSessions: activeSessions.length,
      totalUsers: this.users.size,
      roleBreakdown,
      usersByRole: {
        ceo: Array.from(this.users.values()).filter(u => u.role === 'ceo').length,
        cto: Array.from(this.users.values()).filter(u => u.role === 'cto').length,
        developer: Array.from(this.users.values()).filter(u => u.role === 'developer').length,
        artist: Array.from(this.users.values()).filter(u => u.role === 'artist').length,
        tech_artist: Array.from(this.users.values()).filter(u => u.role === 'tech_artist').length
      }
    };
  }
}

export default AuthSystem;
