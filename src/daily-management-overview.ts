export interface WorkLogEntryLike {
  timestamp: string;
  agent: string;
  role?: string;
  taskId: string;
  taskTitle: string;
  subtask: string;
  action: 'subtask_completed' | 'task_started' | 'task_completed' | string;
  minutesSpent: number;
  project?: string;
  registeredFor?: string;
}

export interface TokenWindowLike {
  tokens?: number;
  cost?: number;
  calls?: number;
  promptTokens?: number;
  completionTokens?: number;
  tier1Pct?: number;
  tier2Pct?: number;
  tier3Pct?: number;
}

export interface TokenAgentSummaryLike {
  today?: TokenWindowLike;
  thisHour?: TokenWindowLike;
  primaryModel?: string;
}

export interface TokenSummaryLike {
  agents?: Record<string, TokenAgentSummaryLike>;
}

export interface DailyTokenUsageLike {
  date: string;
  tokens: number;
  cost: number;
  calls: number;
}

export interface TerminalSessionLike {
  id: string;
  label: string;
  agent: string;
  capabilities?: string[];
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  status: 'active' | 'expired' | string;
}

export interface ActiveActionLike {
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
}

export interface CoordinationSnapshotLike {
  sessions?: TerminalSessionLike[];
  activeAction?: ActiveActionLike | null;
  recentEvents?: unknown[];
}

export interface TerminalStatusLike {
  terminal: 'A' | 'B' | string;
  agent: string;
  isActive: boolean;
  lastActivity: string;
  compactionNeeded: boolean;
  contextTokens: number;
  messageCount: number;
}

export interface TerminalActivitySummaryLike {
  totalActivities?: number;
  terminalA?: { status?: TerminalStatusLike; activities?: number; highPriority?: number };
  terminalB?: { status?: TerminalStatusLike; activities?: number; highPriority?: number };
}

export interface DailyOverviewSources {
  tokenSummary: TokenSummaryLike;
  dailyUsage: DailyTokenUsageLike[];
  workLog: WorkLogEntryLike[];
  terminalCoordination: CoordinationSnapshotLike;
  terminalActivity: TerminalActivitySummaryLike;
  generatedAt?: Date;
}

export interface WorkSummaryForDay {
  date: string;
  totalMinutes: number;
  tasksCompleted: number;
  subtasksCompleted: number;
  workEntries: number;
  byAgent: Record<string, AgentWorkSummaryForDay>;
}

export interface AgentWorkSummaryForDay {
  totalMinutes: number;
  tasksCompleted: number;
  subtasksCompleted: number;
  workEntries: number;
  lastActivity: string | null;
}

export interface AgentDailyManagementSummary {
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
}

export interface TerminalSessionDailySummary {
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
}

export interface TerminalStatusDailySummary {
  terminal: string;
  agent: string;
  isActive: boolean;
  contextTokens: number;
  messageCount: number;
  lastActivity: string;
  compactionNeeded: boolean;
  tokensToday: number;
}

export interface DailyManagementOverview {
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
  alexander: AgentDailyManagementSummary;
  terminalSessions: TerminalSessionDailySummary[];
  terminalStatuses: TerminalStatusDailySummary[];
  topAgentsToday: AgentDailyManagementSummary[];
  sevenDayTokens: DailyTokenUsageLike[];
  recentWork: WorkLogEntryLike[];
  activeAction: ActiveActionLike | null;
  notes: string[];
}

const ZERO_TOKEN_WINDOW: Required<TokenWindowLike> = {
  tokens: 0,
  cost: 0,
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
  tier1Pct: 0,
  tier2Pct: 0,
  tier3Pct: 0,
};

const TERMINAL_AGENT_ALIASES: Record<string, string | null> = {
  Alexander: 'Alexander',
  Kimi: 'Kimi',
  Codex: 'Athena',
  Claude: 'Fill',
  VirtualPC: null,
  Other: null,
};

export function dayKey(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

export function resolveTrackedAgentForTerminal(agent: string): string | null {
  const normalized = String(agent || '').trim();
  if (!normalized) return null;
  return Object.prototype.hasOwnProperty.call(TERMINAL_AGENT_ALIASES, normalized)
    ? TERMINAL_AGENT_ALIASES[normalized]
    : normalized;
}

export function summarizeWorkLogForDate(entries: WorkLogEntryLike[], date: Date | string | number): WorkSummaryForDay {
  const dateId = dayKey(date);
  const summary: WorkSummaryForDay = {
    date: dateId,
    totalMinutes: 0,
    tasksCompleted: 0,
    subtasksCompleted: 0,
    workEntries: 0,
    byAgent: {},
  };

  for (const entry of entries) {
    if (dayKey(entry.timestamp) !== dateId) continue;
    const minutes = Number.isFinite(entry.minutesSpent) ? Math.max(0, entry.minutesSpent) : 0;
    const agent = entry.agent || 'Unknown';
    if (!summary.byAgent[agent]) {
      summary.byAgent[agent] = {
        totalMinutes: 0,
        tasksCompleted: 0,
        subtasksCompleted: 0,
        workEntries: 0,
        lastActivity: null,
      };
    }

    const agentSummary = summary.byAgent[agent];
    summary.totalMinutes += minutes;
    summary.workEntries += 1;
    agentSummary.totalMinutes += minutes;
    agentSummary.workEntries += 1;

    if (entry.action === 'task_completed') {
      summary.tasksCompleted += 1;
      agentSummary.tasksCompleted += 1;
    }
    if (entry.action === 'subtask_completed') {
      summary.subtasksCompleted += 1;
      agentSummary.subtasksCompleted += 1;
    }
    if (!agentSummary.lastActivity || entry.timestamp > agentSummary.lastActivity) {
      agentSummary.lastActivity = entry.timestamp;
    }
  }

  return summary;
}

export function buildDailyManagementOverview(sources: DailyOverviewSources): DailyManagementOverview {
  const generatedAt = sources.generatedAt || new Date();
  const date = dayKey(generatedAt);
  const tokenSummary = sources.tokenSummary || {};
  const agents = tokenSummary.agents || {};
  const workSummary = summarizeWorkLogForDate(sources.workLog || [], generatedAt);
  const activeAction = sources.terminalCoordination.activeAction || null;
  const terminalStatuses = extractTerminalStatuses(sources.terminalActivity || {}, agents);
  const terminalContextTokens = terminalStatuses.reduce((sum, status) => sum + status.contextTokens, 0);
  const agentSummaries = Object.keys(agents)
    .map(agent => buildAgentSummary(agent, agents[agent], workSummary.byAgent[agent]))
    .sort((a, b) => b.tokensToday - a.tokensToday);
  const virtualTokens = agentSummaries.reduce((totals, agent) => ({
    tokens: totals.tokens + agent.tokensToday,
    promptTokens: totals.promptTokens + agent.promptTokensToday,
    completionTokens: totals.completionTokens + agent.completionTokensToday,
    calls: totals.calls + agent.callsToday,
    cost: totals.cost + agent.estimatedCostToday,
  }), { tokens: 0, promptTokens: 0, completionTokens: 0, calls: 0, cost: 0 });
  const sessions = sources.terminalCoordination.sessions || [];
  const terminalSessions = sessions.map(session => buildTerminalSessionSummary(session, activeAction, agents, terminalStatuses));
  const recentWork = (sources.workLog || [])
    .filter(entry => dayKey(entry.timestamp) === date)
    .slice(-12)
    .reverse();

  return {
    date,
    generatedAt: generatedAt.toISOString(),
    virtualPC: {
      tokensToday: virtualTokens.tokens,
      promptTokensToday: virtualTokens.promptTokens,
      completionTokensToday: virtualTokens.completionTokens,
      callsToday: virtualTokens.calls,
      estimatedCostToday: roundMoney(virtualTokens.cost),
      workMinutesToday: workSummary.totalMinutes,
      workHoursToday: roundOne(workSummary.totalMinutes / 60),
      workEntriesToday: workSummary.workEntries,
      tasksCompletedToday: workSummary.tasksCompleted,
      subtasksCompletedToday: workSummary.subtasksCompleted,
      activeTerminalSessions: terminalSessions.filter(session => session.status === 'active').length,
      registeredTerminalSessions: terminalSessions.length,
      terminalContextTokens,
      terminalActivities: Number(sources.terminalActivity.totalActivities || 0),
    },
    alexander: buildAgentSummary('Alexander', agents.Alexander, workSummary.byAgent.Alexander),
    terminalSessions,
    terminalStatuses,
    topAgentsToday: agentSummaries.slice(0, 8),
    sevenDayTokens: sources.dailyUsage || [],
    recentWork,
    activeAction,
    notes: [
      'Token totals come from the VirtualPC token tracker per agent.',
      'Terminal session rows map Codex to Athena, Kimi to Kimi, Claude to Fill, and Alexander to Alexander when agent tokens are available.',
      'Terminal context tokens are shown separately because they measure open terminal context, not completed model calls.',
    ],
  };
}

function buildAgentSummary(
  agent: string,
  tokenAgent: TokenAgentSummaryLike | undefined,
  workAgent: AgentWorkSummaryForDay | undefined,
): AgentDailyManagementSummary {
  const today = normalizeTokenWindow(tokenAgent?.today);
  return {
    agent,
    tokensToday: today.tokens,
    promptTokensToday: today.promptTokens,
    completionTokensToday: today.completionTokens,
    callsToday: today.calls,
    estimatedCostToday: roundMoney(today.cost),
    tier1Pct: today.tier1Pct,
    workMinutesToday: workAgent?.totalMinutes || 0,
    tasksCompletedToday: workAgent?.tasksCompleted || 0,
    subtasksCompletedToday: workAgent?.subtasksCompleted || 0,
    workEntriesToday: workAgent?.workEntries || 0,
    primaryModel: tokenAgent?.primaryModel || 'none',
    lastActivity: workAgent?.lastActivity || null,
  };
}

function buildTerminalSessionSummary(
  session: TerminalSessionLike,
  activeAction: ActiveActionLike | null,
  agents: Record<string, TokenAgentSummaryLike>,
  terminalStatuses: TerminalStatusDailySummary[],
): TerminalSessionDailySummary {
  const trackedAgent = resolveTrackedAgentForTerminal(session.agent);
  const tokenWindow = trackedAgent ? normalizeTokenWindow(agents[trackedAgent]?.today) : ZERO_TOKEN_WINDOW;
  const matchingStatus = findMatchingTerminalStatus(session, trackedAgent, terminalStatuses);
  const ownsActiveAction = activeAction?.ownerSessionId === session.id;
  const tokensToday = trackedAgent ? tokenWindow.tokens : 0;

  return {
    id: session.id,
    label: session.label,
    agent: session.agent,
    trackedAgent,
    tokenSource: trackedAgent ? `agent:${trackedAgent}` : 'coordination-only',
    status: session.status,
    tokensToday,
    callsToday: trackedAgent ? tokenWindow.calls : 0,
    contextTokens: matchingStatus?.contextTokens || 0,
    messageCount: matchingStatus?.messageCount || 0,
    lastSeenAt: session.lastSeenAt,
    expiresAt: session.expiresAt,
    ownsActiveAction,
    activeActionTitle: ownsActiveAction ? activeAction?.title || null : null,
  };
}

function extractTerminalStatuses(
  terminalActivity: TerminalActivitySummaryLike,
  agents: Record<string, TokenAgentSummaryLike>,
): TerminalStatusDailySummary[] {
  const rawStatuses = [
    terminalActivity.terminalA?.status,
    terminalActivity.terminalB?.status,
  ].filter((status): status is TerminalStatusLike => Boolean(status));

  return rawStatuses.map(status => {
    const tokenWindow = normalizeTokenWindow(agents[status.agent]?.today);
    return {
      terminal: status.terminal,
      agent: status.agent,
      isActive: Boolean(status.isActive),
      contextTokens: Number(status.contextTokens || 0),
      messageCount: Number(status.messageCount || 0),
      lastActivity: status.lastActivity || '',
      compactionNeeded: Boolean(status.compactionNeeded),
      tokensToday: tokenWindow.tokens,
    };
  });
}

function findMatchingTerminalStatus(
  session: TerminalSessionLike,
  trackedAgent: string | null,
  statuses: TerminalStatusDailySummary[],
): TerminalStatusDailySummary | undefined {
  const label = session.label.toLowerCase();
  const byLabel = statuses.find(status => label.includes(`terminal ${status.terminal.toLowerCase()}`));
  if (byLabel) return byLabel;
  if (trackedAgent) {
    const byAgent = statuses.find(status => status.agent === trackedAgent || status.agent === session.agent);
    if (byAgent) return byAgent;
  }
  return undefined;
}

function normalizeTokenWindow(window: TokenWindowLike | undefined): Required<TokenWindowLike> {
  return {
    tokens: Number(window?.tokens || 0),
    cost: Number(window?.cost || 0),
    calls: Number(window?.calls || 0),
    promptTokens: Number(window?.promptTokens || 0),
    completionTokens: Number(window?.completionTokens || 0),
    tier1Pct: Number(window?.tier1Pct || 0),
    tier2Pct: Number(window?.tier2Pct || 0),
    tier3Pct: Number(window?.tier3Pct || 0),
  };
}

function roundMoney(value: number): number {
  return Number(value.toFixed(4));
}

function roundOne(value: number): number {
  return Number(value.toFixed(1));
}
