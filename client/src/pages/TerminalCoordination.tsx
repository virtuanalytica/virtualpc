import React, { useEffect, useMemo, useState } from 'react';
import './TerminalCoordination.css';

type TerminalSession = {
  id: string;
  label: string;
  agent: string;
  capabilities: string[];
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  status: 'active' | 'expired';
};

type ActiveAction = {
  id: string;
  title: string;
  kind: string;
  ownerSessionId: string;
  ownerLabel: string;
  ownerAgent: string;
  target?: string;
  notes?: string;
  startedAt: string;
  updatedAt: string;
  expiresAt: string;
};

type CoordinationEvent = {
  id: string;
  type: string;
  at: string;
  sessionId?: string;
  actor?: string;
  message: string;
};

type CoordinationSnapshot = {
  sessions: TerminalSession[];
  activeAction: ActiveAction | null;
  recentEvents: CoordinationEvent[];
};

const STORAGE_KEY = 'virtualpc.terminalCoordination.session';

function formatTime(value?: string): string {
  if (!value) return '-';
  return new Date(value).toLocaleTimeString();
}

function loadStoredSession(): { sessionId: string; sessionKey: string; label: string; agent: string } | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const TerminalCoordination: React.FC = () => {
  const [snapshot, setSnapshot] = useState<CoordinationSnapshot>({ sessions: [], activeAction: null, recentEvents: [] });
  const [storedSession, setStoredSession] = useState(loadStoredSession);
  const [label, setLabel] = useState(storedSession?.label || 'GUI coordination session');
  const [agent, setAgent] = useState(storedSession?.agent || 'VirtualPC');
  const [actionTitle, setActionTitle] = useState('Coordinate terminal work');
  const [actionKind, setActionKind] = useState('coordination');
  const [target, setTarget] = useState('virtualpc');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const activeOwnerIsLocal = useMemo(() => {
    return Boolean(storedSession && snapshot.activeAction?.ownerSessionId === storedSession.sessionId);
  }, [snapshot.activeAction, storedSession]);

  const loadStatus = async () => {
    const response = await fetch('/api/terminal-coordination');
    const data = await response.json();
    if (data.success) {
      setSnapshot({
        sessions: data.sessions || [],
        activeAction: data.activeAction || null,
        recentEvents: data.recentEvents || [],
      });
    }
  };

  useEffect(() => {
    loadStatus().catch(() => setNotice('Terminal coordination status is unavailable.'));
    const interval = setInterval(() => {
      loadStatus().catch(() => undefined);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const postJson = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const response = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || data.reason || 'request failed');
      }
      await loadStatus();
      return data;
    } finally {
      setBusy(false);
    }
  };

  const exchangeSession = async () => {
    try {
      const data = await postJson('/api/terminal-coordination/sessions/exchange', {
        label,
        agent,
        publicKey: `${label}:${agent}:${Date.now()}`,
        capabilities: ['gui', 'coordination', 'active-action'],
      });
      const next = {
        sessionId: data.exchange.session.id,
        sessionKey: data.exchange.sessionKey,
        label,
        agent,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setStoredSession(next);
      setNotice('Session key exchanged and stored locally.');
    } catch (error: any) {
      setNotice(error.message);
    }
  };

  const claimAction = async () => {
    if (!storedSession) {
      setNotice('Register this GUI session first.');
      return;
    }
    try {
      await postJson('/api/terminal-coordination/actions/acquire', {
        sessionId: storedSession.sessionId,
        sessionKey: storedSession.sessionKey,
        title: actionTitle,
        kind: actionKind,
        target,
      });
      setNotice('Active action claimed.');
    } catch (error: any) {
      setNotice(error.message);
      loadStatus().catch(() => undefined);
    }
  };

  const releaseAction = async () => {
    if (!storedSession) {
      setNotice('No local session registered.');
      return;
    }
    try {
      await postJson('/api/terminal-coordination/actions/release', {
        sessionId: storedSession.sessionId,
        sessionKey: storedSession.sessionKey,
        actionId: snapshot.activeAction?.id,
      });
      setNotice('Active action released.');
    } catch (error: any) {
      setNotice(error.message);
    }
  };

  const forceRelease = async () => {
    try {
      await postJson('/api/terminal-coordination/actions/force-release', {
        actor: 'VirtualPC GUI',
        reason: 'manual coordination override',
      });
      setNotice('Active action force released.');
    } catch (error: any) {
      setNotice(error.message);
    }
  };

  return (
    <div className="terminal-coordination">
      <div className="tc-header">
        <div>
          <span className="tc-kicker">Terminal Coordination</span>
          <h1>Active Action Control</h1>
        </div>
        <button className="tc-button tc-secondary" onClick={() => loadStatus()} disabled={busy}>
          Refresh
        </button>
      </div>

      {notice && <div className="tc-notice">{notice}</div>}

      <section className={`tc-active ${snapshot.activeAction ? 'tc-owned' : 'tc-free'}`}>
        <div>
          <span className="tc-label">Active action</span>
          <h2>{snapshot.activeAction?.title || 'No terminal owns the action lease'}</h2>
          {snapshot.activeAction && (
            <p>
              {snapshot.activeAction.ownerLabel} · {snapshot.activeAction.ownerAgent} · expires {formatTime(snapshot.activeAction.expiresAt)}
            </p>
          )}
        </div>
        <div className="tc-active-actions">
          <button className="tc-button" onClick={claimAction} disabled={busy || Boolean(snapshot.activeAction && !activeOwnerIsLocal)}>
            Claim
          </button>
          <button className="tc-button tc-secondary" onClick={releaseAction} disabled={busy || !activeOwnerIsLocal}>
            Release
          </button>
          <button className="tc-button tc-danger" onClick={forceRelease} disabled={busy || !snapshot.activeAction}>
            Force
          </button>
        </div>
      </section>

      <section className="tc-grid">
        <div className="tc-panel">
          <span className="tc-label">Key exchange</span>
          <div className="tc-form">
            <label>
              Session label
              <input value={label} onChange={(event) => setLabel(event.target.value)} />
            </label>
            <label>
              Agent
              <select value={agent} onChange={(event) => setAgent(event.target.value)}>
                <option>VirtualPC</option>
                <option>Codex</option>
                <option>Kimi</option>
                <option>Claude</option>
                <option>Alexander</option>
              </select>
            </label>
            <button className="tc-button" onClick={exchangeSession} disabled={busy}>
              Exchange Key
            </button>
          </div>
          <div className="tc-session-token">
            <span>Local session</span>
            <strong>{storedSession?.sessionId || 'not registered'}</strong>
          </div>
        </div>

        <div className="tc-panel">
          <span className="tc-label">Action</span>
          <div className="tc-form">
            <label>
              Title
              <input value={actionTitle} onChange={(event) => setActionTitle(event.target.value)} />
            </label>
            <label>
              Kind
              <select value={actionKind} onChange={(event) => setActionKind(event.target.value)}>
                <option value="coordination">coordination</option>
                <option value="code">code</option>
                <option value="design">design</option>
                <option value="review">review</option>
                <option value="deploy">deploy</option>
                <option value="other">other</option>
              </select>
            </label>
            <label>
              Target
              <input value={target} onChange={(event) => setTarget(event.target.value)} />
            </label>
          </div>
        </div>
      </section>

      <section className="tc-grid">
        <div className="tc-panel">
          <div className="tc-panel-title">
            <span className="tc-label">Open sessions</span>
            <strong>{snapshot.sessions.filter((session) => session.status === 'active').length}/{snapshot.sessions.length}</strong>
          </div>
          <div className="tc-session-list">
            {snapshot.sessions.length === 0 ? (
              <div className="tc-empty">No terminal sessions registered.</div>
            ) : snapshot.sessions.map((session) => (
              <article key={session.id} className="tc-session-card">
                <div>
                  <strong>{session.label}</strong>
                  <span>{session.agent}</span>
                </div>
                <div>
                  <span className={`tc-status tc-status-${session.status}`}>{session.status}</span>
                  <small>seen {formatTime(session.lastSeenAt)}</small>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="tc-panel">
          <span className="tc-label">Recent coordination events</span>
          <div className="tc-event-list">
            {snapshot.recentEvents.length === 0 ? (
              <div className="tc-empty">No events yet.</div>
            ) : snapshot.recentEvents.slice(0, 8).map((event) => (
              <article key={event.id} className="tc-event">
                <span>{formatTime(event.at)}</span>
                <strong>{event.type}</strong>
                <p>{event.message}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default TerminalCoordination;
