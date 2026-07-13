import { createHash, randomBytes, timingSafeEqual } from 'crypto';

export type TerminalAgent = 'Codex' | 'Kimi' | 'Claude' | 'Alexander' | 'VirtualPC' | 'Other';
export type TerminalSessionStatus = 'active' | 'expired';
export type ActiveActionKind = 'code' | 'design' | 'review' | 'deploy' | 'coordination' | 'other';

export interface TerminalSessionInput {
  label: string;
  agent?: TerminalAgent | string;
  publicKey?: string;
  pid?: number;
  capabilities?: string[];
  ttlMs?: number;
}

export interface TerminalSession {
  id: string;
  label: string;
  agent: string;
  publicKeyFingerprint?: string;
  pid?: number;
  capabilities: string[];
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  status: TerminalSessionStatus;
}

interface StoredTerminalSession extends TerminalSession {
  keyHash: string;
}

export interface TerminalKeyExchange {
  session: TerminalSession;
  sessionKey: string;
  challenge: string;
  expiresAt: string;
}

export interface ActiveActionInput {
  title: string;
  kind?: ActiveActionKind;
  target?: string;
  notes?: string;
  ttlMs?: number;
}

export interface ActiveAction {
  id: string;
  title: string;
  kind: ActiveActionKind;
  ownerSessionId: string;
  ownerLabel: string;
  ownerAgent: string;
  target?: string;
  notes?: string;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface CoordinationEvent {
  id: string;
  type: 'exchange' | 'heartbeat' | 'acquire' | 'blocked' | 'release' | 'force-release' | 'expired';
  at: string;
  sessionId?: string;
  actor?: string;
  message: string;
}

export interface CoordinationSnapshot {
  sessions: TerminalSession[];
  activeAction: ActiveAction | null;
  recentEvents: CoordinationEvent[];
}

export type AcquireActionResult =
  | { ok: true; action: ActiveAction; replaced: boolean }
  | { ok: false; blockedBy: ActiveAction; reason: string };

export interface TerminalCoordinationOptions {
  sessionTtlMs?: number;
  actionTtlMs?: number;
  now?: () => number;
}

export class TerminalAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TerminalAuthError';
  }
}

export class TerminalCoordinationManager {
  private sessions: Map<string, StoredTerminalSession> = new Map();
  private activeAction: ActiveAction | null = null;
  private events: CoordinationEvent[] = [];
  private seq = 0;
  private readonly sessionTtlMs: number;
  private readonly actionTtlMs: number;
  private readonly now: () => number;

  constructor(options: TerminalCoordinationOptions = {}) {
    this.sessionTtlMs = options.sessionTtlMs ?? 15 * 60 * 1000;
    this.actionTtlMs = options.actionTtlMs ?? 30 * 60 * 1000;
    this.now = options.now ?? (() => Date.now());
  }

  exchange(input: TerminalSessionInput): TerminalKeyExchange {
    this.expireStale();
    const now = this.now();
    const sessionKey = randomToken(32);
    const challenge = randomToken(16);
    const session: StoredTerminalSession = {
      id: this.nextId('term'),
      label: cleanText(input.label, 'Terminal session'),
      agent: cleanText(input.agent || 'Other', 'Other'),
      publicKeyFingerprint: input.publicKey ? fingerprint(input.publicKey) : undefined,
      pid: input.pid,
      capabilities: Array.isArray(input.capabilities) ? input.capabilities.map(String).slice(0, 20) : [],
      createdAt: iso(now),
      lastSeenAt: iso(now),
      expiresAt: iso(now + boundedTtl(input.ttlMs, this.sessionTtlMs)),
      status: 'active',
      keyHash: hashSecret(sessionKey),
    };
    this.sessions.set(session.id, session);
    this.record('exchange', `Session ${session.label} joined as ${session.agent}`, session.id);
    return {
      session: this.publicSession(session),
      sessionKey,
      challenge,
      expiresAt: session.expiresAt,
    };
  }

  heartbeat(sessionId: string, sessionKey: string): TerminalSession {
    const session = this.requireSession(sessionId, sessionKey);
    const now = this.now();
    session.lastSeenAt = iso(now);
    session.expiresAt = iso(now + this.sessionTtlMs);
    session.status = 'active';
    this.record('heartbeat', `Session ${session.label} heartbeat`, session.id);
    return this.publicSession(session);
  }

  acquireAction(sessionId: string, sessionKey: string, input: ActiveActionInput): AcquireActionResult {
    const session = this.requireSession(sessionId, sessionKey);
    this.expireStale();

    if (this.activeAction && this.activeAction.ownerSessionId !== session.id) {
      this.record(
        'blocked',
        `${session.label} blocked by active action owned by ${this.activeAction.ownerLabel}`,
        session.id,
      );
      return {
        ok: false,
        blockedBy: { ...this.activeAction },
        reason: 'another terminal session owns the active action lease',
      };
    }

    const now = this.now();
    const replaced = Boolean(this.activeAction);
    const action: ActiveAction = {
      id: this.activeAction?.id || this.nextId('action'),
      title: cleanText(input.title, 'Active terminal action'),
      kind: input.kind || 'coordination',
      ownerSessionId: session.id,
      ownerLabel: session.label,
      ownerAgent: session.agent,
      target: input.target ? String(input.target) : undefined,
      notes: input.notes ? String(input.notes) : undefined,
      startedAt: this.activeAction?.startedAt || iso(now),
      updatedAt: iso(now),
      expiresAt: iso(now + boundedTtl(input.ttlMs, this.actionTtlMs)),
    };
    this.activeAction = action;
    this.record('acquire', `${session.label} owns active action: ${action.title}`, session.id);
    return { ok: true, action: { ...action }, replaced };
  }

  releaseAction(sessionId: string, sessionKey: string, actionId?: string): boolean {
    const session = this.requireSession(sessionId, sessionKey);
    this.expireStale();
    if (!this.activeAction) return false;
    if (this.activeAction.ownerSessionId !== session.id) {
      throw new TerminalAuthError('only the owning terminal session may release this active action');
    }
    if (actionId && this.activeAction.id !== actionId) return false;
    const title = this.activeAction.title;
    this.activeAction = null;
    this.record('release', `${session.label} released active action: ${title}`, session.id);
    return true;
  }

  forceRelease(actor: string, reason: string): boolean {
    this.expireStale();
    if (!this.activeAction) return false;
    const title = this.activeAction.title;
    this.activeAction = null;
    this.record('force-release', `${cleanText(actor, 'VirtualPC')} force-released "${title}": ${cleanText(reason, 'no reason')}`, undefined, actor);
    return true;
  }

  snapshot(): CoordinationSnapshot {
    this.expireStale();
    return {
      sessions: Array.from(this.sessions.values()).map(session => this.publicSession(session)),
      activeAction: this.activeAction ? { ...this.activeAction } : null,
      recentEvents: [...this.events].slice(-50).reverse(),
    };
  }

  resetForTests(): void {
    this.sessions.clear();
    this.activeAction = null;
    this.events = [];
    this.seq = 0;
  }

  private requireSession(sessionId: string, sessionKey: string): StoredTerminalSession {
    this.expireStale();
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      throw new TerminalAuthError('terminal session is unknown or expired');
    }
    if (!safeEqual(session.keyHash, hashSecret(sessionKey))) {
      throw new TerminalAuthError('terminal session key is invalid');
    }
    return session;
  }

  private expireStale(): void {
    const now = this.now();
    for (const session of this.sessions.values()) {
      if (session.status === 'active' && Date.parse(session.expiresAt) <= now) {
        session.status = 'expired';
        this.record('expired', `Session ${session.label} expired`, session.id);
      }
    }

    if (this.activeAction) {
      const owner = this.sessions.get(this.activeAction.ownerSessionId);
      const actionExpired = Date.parse(this.activeAction.expiresAt) <= now;
      const ownerExpired = !owner || owner.status === 'expired';
      if (actionExpired || ownerExpired) {
        const title = this.activeAction.title;
        this.activeAction = null;
        this.record('expired', `Active action expired: ${title}`);
      }
    }
  }

  private publicSession(session: StoredTerminalSession): TerminalSession {
    const { keyHash: _keyHash, ...rest } = session;
    return { ...rest };
  }

  private record(type: CoordinationEvent['type'], message: string, sessionId?: string, actor?: string): void {
    this.events.push({
      id: this.nextId('evt'),
      type,
      at: iso(this.now()),
      sessionId,
      actor,
      message,
    });
    if (this.events.length > 200) this.events.splice(0, this.events.length - 200);
  }

  private nextId(prefix: string): string {
    return `${prefix}_${this.now()}_${this.seq++}`;
  }
}

function randomToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function boundedTtl(ttlMs: number | undefined, fallback: number): number {
  if (!Number.isFinite(ttlMs) || !ttlMs) return fallback;
  return Math.max(30_000, Math.min(ttlMs, 4 * 60 * 60 * 1000));
}

function cleanText(value: unknown, fallback: string): string {
  const text = String(value || '').trim();
  return text.length > 0 ? text.slice(0, 240) : fallback;
}

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export const terminalCoordination = new TerminalCoordinationManager();

