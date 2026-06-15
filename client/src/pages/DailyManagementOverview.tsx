import React, { useEffect, useMemo, useState } from 'react';
import './DailyManagementOverview.css';

type AgentDailySummary = {
  agent: string;
  tokensToday: number;
  promptTokensToday: number;
  completionTokensToday: number;
  callsToday: number;
  estimatedCostToday: number;
  tier1Pct: number;
  workMinutesToday: number;
  tasksCompletedToday: number;
  subtasksCompletedToday: number;
  workEntriesToday: number;
  primaryModel: string;
  lastActivity: string | null;
};

type TerminalSessionSummary = {
  id: string;
  label: string;
  agent: string;
  trackedAgent: string | null;
  tokenSource: string;
  status: string;
  tokensToday: number;
  callsToday: number;
  contextTokens: number;
  messageCount: number;
  lastSeenAt: string;
  expiresAt: string;
  ownsActiveAction: boolean;
  activeActionTitle: string | null;
};

type TerminalStatusSummary = {
  terminal: string;
  agent: string;
  isActive: boolean;
  contextTokens: number;
  messageCount: number;
  lastActivity: string;
  compactionNeeded: boolean;
  tokensToday: number;
};

type DailyTokenUsage = {
  date: string;
  tokens: number;
  cost: number;
  calls: number;
};

type WorkEntry = {
  timestamp: string;
  agent: string;
  role?: string;
  taskId: string;
  taskTitle: string;
  subtask: string;
  action: string;
  minutesSpent: number;
};

type ActiveAction = {
  id: string;
  title: string;
  kind: string;
  ownerLabel: string;
  ownerAgent: string;
  target?: string;
  expiresAt: string;
};

type DailyOverview = {
  date: string;
  generatedAt: string;
  virtualPC: {
    tokensToday: number;
    promptTokensToday: number;
    completionTokensToday: number;
    callsToday: number;
    estimatedCostToday: number;
    workMinutesToday: number;
    workHoursToday: number;
    workEntriesToday: number;
    tasksCompletedToday: number;
    subtasksCompletedToday: number;
    activeTerminalSessions: number;
    registeredTerminalSessions: number;
    terminalContextTokens: number;
    terminalActivities: number;
  };
  alexander: AgentDailySummary;
  terminalSessions: TerminalSessionSummary[];
  terminalStatuses: TerminalStatusSummary[];
  topAgentsToday: AgentDailySummary[];
  sevenDayTokens: DailyTokenUsage[];
  recentWork: WorkEntry[];
  activeAction: ActiveAction | null;
  notes: string[];
};

function formatNumber(value: number | undefined): string {
  return Number(value || 0).toLocaleString();
}

function formatCost(value: number | undefined): string {
  return `$${Number(value || 0).toFixed(4)}`;
}

function formatTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleString();
}

function formatShortTime(value?: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '-';
  return date.toLocaleTimeString();
}

function statusClass(status: string): string {
  return status === 'active' ? 'mg-status-active' : 'mg-status-muted';
}

export const DailyManagementOverview: React.FC = () => {
  const [overview, setOverview] = useState<DailyOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = async () => {
    try {
      const response = await fetch('/api/management/daily-overview');
      const data = await response.json();
      if (!response.ok || data.success === false) {
        throw new Error(data.error || 'daily overview unavailable');
      }
      setOverview(data.overview);
      setError('');
    } catch (err: any) {
      setError(err.message || 'daily overview unavailable');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    const interval = setInterval(loadOverview, 15000);
    return () => clearInterval(interval);
  }, []);

  const maxTrendTokens = useMemo(() => {
    return Math.max(1, ...(overview?.sevenDayTokens || []).map(day => day.tokens));
  }, [overview]);

  if (loading) {
    return <div className="management-overview mg-loading">Loading management overview...</div>;
  }

  if (!overview) {
    return (
      <div className="management-overview">
        <div className="mg-error">{error || 'Management overview unavailable.'}</div>
      </div>
    );
  }

  return (
    <div className="management-overview">
      <header className="mg-header">
        <div>
          <span className="mg-kicker">Daily Management</span>
          <h1>VirtualPC Work Overview</h1>
          <p>{overview.date} · updated {formatShortTime(overview.generatedAt)}</p>
        </div>
        <button className="mg-button" onClick={loadOverview}>Refresh</button>
      </header>

      {error && <div className="mg-error">{error}</div>}

      <section className="mg-kpi-grid">
        <article className="mg-kpi">
          <span>VirtualPC tokens today</span>
          <strong>{formatNumber(overview.virtualPC.tokensToday)}</strong>
          <small>{formatNumber(overview.virtualPC.callsToday)} model calls</small>
        </article>
        <article className="mg-kpi">
          <span>Work logged today</span>
          <strong>{overview.virtualPC.workHoursToday}h</strong>
          <small>{formatNumber(overview.virtualPC.workEntriesToday)} entries</small>
        </article>
        <article className="mg-kpi">
          <span>Completed today</span>
          <strong>{formatNumber(overview.virtualPC.tasksCompletedToday)}</strong>
          <small>{formatNumber(overview.virtualPC.subtasksCompletedToday)} subtasks</small>
        </article>
        <article className="mg-kpi">
          <span>Terminal context</span>
          <strong>{formatNumber(overview.virtualPC.terminalContextTokens)}</strong>
          <small>{overview.virtualPC.activeTerminalSessions}/{overview.virtualPC.registeredTerminalSessions} sessions active</small>
        </article>
      </section>

      <section className="mg-two-column">
        <article className="mg-panel mg-summary-panel">
          <div className="mg-panel-heading">
            <span className="mg-kicker">VirtualPC</span>
            <strong>{formatCost(overview.virtualPC.estimatedCostToday)}</strong>
          </div>
          <div className="mg-stat-list">
            <div><span>Prompt tokens</span><strong>{formatNumber(overview.virtualPC.promptTokensToday)}</strong></div>
            <div><span>Completion tokens</span><strong>{formatNumber(overview.virtualPC.completionTokensToday)}</strong></div>
            <div><span>Terminal activities</span><strong>{formatNumber(overview.virtualPC.terminalActivities)}</strong></div>
            <div><span>Active action</span><strong>{overview.activeAction ? overview.activeAction.ownerLabel : 'none'}</strong></div>
          </div>
          {overview.activeAction && (
            <div className="mg-active-action">
              <span>{overview.activeAction.kind}</span>
              <strong>{overview.activeAction.title}</strong>
              <small>{overview.activeAction.ownerAgent} · expires {formatShortTime(overview.activeAction.expiresAt)}</small>
            </div>
          )}
        </article>

        <article className="mg-panel mg-summary-panel">
          <div className="mg-panel-heading">
            <span className="mg-kicker">Alexander</span>
            <strong>{overview.alexander.primaryModel}</strong>
          </div>
          <div className="mg-stat-list">
            <div><span>Tokens today</span><strong>{formatNumber(overview.alexander.tokensToday)}</strong></div>
            <div><span>Work minutes</span><strong>{formatNumber(overview.alexander.workMinutesToday)}</strong></div>
            <div><span>Tasks completed</span><strong>{formatNumber(overview.alexander.tasksCompletedToday)}</strong></div>
            <div><span>Last activity</span><strong>{formatShortTime(overview.alexander.lastActivity)}</strong></div>
          </div>
        </article>
      </section>

      <section className="mg-panel">
        <div className="mg-panel-heading">
          <span className="mg-kicker">Terminal Sessions</span>
          <strong>{overview.terminalSessions.length}</strong>
        </div>
        <div className="mg-table-wrap">
          <table className="mg-table">
            <thead>
              <tr>
                <th>Session</th>
                <th>Agent</th>
                <th>Status</th>
                <th>Tokens</th>
                <th>Context</th>
                <th>Action</th>
                <th>Last seen</th>
              </tr>
            </thead>
            <tbody>
              {overview.terminalSessions.length === 0 ? (
                <tr><td colSpan={7} className="mg-empty">No key-exchanged terminal sessions yet.</td></tr>
              ) : overview.terminalSessions.map(session => (
                <tr key={session.id}>
                  <td>
                    <strong>{session.label}</strong>
                    <small>{session.id}</small>
                  </td>
                  <td>
                    <strong>{session.agent}</strong>
                    <small>{session.trackedAgent ? `tracked as ${session.trackedAgent}` : session.tokenSource}</small>
                  </td>
                  <td><span className={`mg-status ${statusClass(session.status)}`}>{session.status}</span></td>
                  <td>{formatNumber(session.tokensToday)}</td>
                  <td>{formatNumber(session.contextTokens)}</td>
                  <td>{session.ownsActiveAction ? session.activeActionTitle : '-'}</td>
                  <td>{formatShortTime(session.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mg-three-column">
        <article className="mg-panel">
          <div className="mg-panel-heading">
            <span className="mg-kicker">Top Agents</span>
            <strong>tokens</strong>
          </div>
          <div className="mg-agent-list">
            {overview.topAgentsToday.map(agent => (
              <div className="mg-agent-row" key={agent.agent}>
                <div>
                  <strong>{agent.agent}</strong>
                  <small>{agent.primaryModel}</small>
                </div>
                <div>
                  <strong>{formatNumber(agent.tokensToday)}</strong>
                  <small>{formatNumber(agent.workMinutesToday)} min</small>
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="mg-panel">
          <div className="mg-panel-heading">
            <span className="mg-kicker">Monitored Terminals</span>
            <strong>A/B</strong>
          </div>
          <div className="mg-terminal-stack">
            {overview.terminalStatuses.map(status => (
              <div className="mg-terminal-card" key={status.terminal}>
                <div>
                  <strong>Terminal {status.terminal}</strong>
                  <small>{status.agent}</small>
                </div>
                <div>
                  <strong>{formatNumber(status.contextTokens)}</strong>
                  <small>context tokens</small>
                </div>
                <div>
                  <strong>{formatNumber(status.tokensToday)}</strong>
                  <small>agent tokens</small>
                </div>
                <span className={`mg-status ${status.compactionNeeded ? 'mg-status-warn' : 'mg-status-active'}`}>
                  {status.compactionNeeded ? 'compact' : 'ok'}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="mg-panel">
          <div className="mg-panel-heading">
            <span className="mg-kicker">7-Day Tokens</span>
            <strong>{formatNumber(overview.sevenDayTokens.reduce((sum, day) => sum + day.tokens, 0))}</strong>
          </div>
          <div className="mg-trend" aria-label="Seven day token trend">
            {overview.sevenDayTokens.map(day => (
              <div className="mg-trend-day" key={day.date}>
                <div className="mg-trend-bar-wrap">
                  <div
                    className="mg-trend-bar"
                    style={{ height: `${Math.max(6, Math.round((day.tokens / maxTrendTokens) * 100))}%` }}
                    title={`${day.date}: ${formatNumber(day.tokens)} tokens`}
                  />
                </div>
                <span>{day.date}</span>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="mg-panel">
        <div className="mg-panel-heading">
          <span className="mg-kicker">Recent Work</span>
          <strong>{overview.recentWork.length}</strong>
        </div>
        <div className="mg-work-list">
          {overview.recentWork.length === 0 ? (
            <div className="mg-empty">No work entries logged for this day yet.</div>
          ) : overview.recentWork.map((entry, index) => (
            <article className="mg-work-item" key={`${entry.timestamp}-${entry.taskId}-${index}`}>
              <div>
                <strong>{entry.agent}</strong>
                <span>{entry.action.replace(/_/g, ' ')}</span>
              </div>
              <p>{entry.taskTitle}</p>
              <small>{entry.subtask} · {formatNumber(entry.minutesSpent)} min · {formatTime(entry.timestamp)}</small>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

export default DailyManagementOverview;
