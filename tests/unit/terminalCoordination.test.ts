import { TerminalAuthError, TerminalCoordinationManager } from '../../src/terminal-coordination';

describe('TerminalCoordinationManager', () => {
  let now: number;
  let manager: TerminalCoordinationManager;

  beforeEach(() => {
    now = Date.parse('2026-06-15T08:00:00.000Z');
    manager = new TerminalCoordinationManager({
      now: () => now,
      sessionTtlMs: 60_000,
      actionTtlMs: 120_000,
    });
  });

  it('exchanges a session key without exposing it in snapshots', () => {
    const exchange = manager.exchange({
      label: 'Codex terminal',
      agent: 'Codex',
      publicKey: 'codex-public-key',
      capabilities: ['code', 'review'],
    });

    expect(exchange.session.id).toMatch(/^term_/);
    expect(exchange.sessionKey).toHaveLength(43);
    expect(exchange.challenge).toHaveLength(22);
    expect(exchange.session.publicKeyFingerprint).toHaveLength(16);

    const snapshot = manager.snapshot();
    expect(snapshot.sessions).toHaveLength(1);
    expect(JSON.stringify(snapshot)).not.toContain(exchange.sessionKey);
  });

  it('requires the exchanged key for heartbeat and active action acquisition', () => {
    const exchange = manager.exchange({ label: 'Kimi terminal', agent: 'Kimi' });

    expect(() => manager.heartbeat(exchange.session.id, 'wrong-key')).toThrow(TerminalAuthError);
    expect(() => manager.acquireAction(exchange.session.id, 'wrong-key', { title: 'Style copy' })).toThrow(TerminalAuthError);

    const heartbeat = manager.heartbeat(exchange.session.id, exchange.sessionKey);
    expect(heartbeat.lastSeenAt).toBe('2026-06-15T08:00:00.000Z');
  });

  it('lets only one terminal own the active action lease', () => {
    const codex = manager.exchange({ label: 'Codex terminal', agent: 'Codex' });
    const kimi = manager.exchange({ label: 'Kimi terminal', agent: 'Kimi' });

    const acquired = manager.acquireAction(codex.session.id, codex.sessionKey, {
      title: 'Implement coordination routes',
      kind: 'code',
      target: 'src/index.ts',
    });
    expect(acquired.ok).toBe(true);

    const blocked = manager.acquireAction(kimi.session.id, kimi.sessionKey, {
      title: 'Edit same active action',
      kind: 'design',
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.blockedBy.ownerLabel).toBe('Codex terminal');
      expect(blocked.reason).toMatch(/active action lease/);
    }
  });

  it('allows the owner to update and release the active action', () => {
    const codex = manager.exchange({ label: 'Codex terminal', agent: 'Codex' });
    const first = manager.acquireAction(codex.session.id, codex.sessionKey, { title: 'Build route', kind: 'code' });
    const second = manager.acquireAction(codex.session.id, codex.sessionKey, { title: 'Build route and tests', kind: 'code' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.replaced).toBe(true);
      expect(second.action.id).toBe(first.action.id);
      expect(second.action.title).toBe('Build route and tests');
      expect(manager.releaseAction(codex.session.id, codex.sessionKey, second.action.id)).toBe(true);
    }
    expect(manager.snapshot().activeAction).toBeNull();
  });

  it('blocks non-owners from releasing but allows force release', () => {
    const codex = manager.exchange({ label: 'Codex terminal', agent: 'Codex' });
    const alexander = manager.exchange({ label: 'Alexander terminal', agent: 'Alexander' });
    manager.acquireAction(codex.session.id, codex.sessionKey, { title: 'Risky deploy', kind: 'deploy' });

    expect(() => manager.releaseAction(alexander.session.id, alexander.sessionKey)).toThrow(TerminalAuthError);
    expect(manager.forceRelease('Alexander', 'manual arbitration')).toBe(true);
    expect(manager.snapshot().activeAction).toBeNull();
  });

  it('expires sessions and active actions together', () => {
    const codex = manager.exchange({ label: 'Codex terminal', agent: 'Codex' });
    manager.acquireAction(codex.session.id, codex.sessionKey, { title: 'Long task', kind: 'code' });

    now += 61_000;

    const snapshot = manager.snapshot();
    expect(snapshot.sessions[0].status).toBe('expired');
    expect(snapshot.activeAction).toBeNull();
    expect(snapshot.recentEvents.some(event => event.type === 'expired')).toBe(true);
  });
});

