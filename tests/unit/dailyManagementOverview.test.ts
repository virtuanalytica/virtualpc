import {
  buildDailyManagementOverview,
  resolveTrackedAgentForTerminal,
  summarizeWorkLogForDate,
  WorkLogEntryLike,
} from '../../src/daily-management-overview';

describe('daily management overview', () => {
  const workLog: WorkLogEntryLike[] = [
    {
      timestamp: '2026-06-15T08:00:00.000Z',
      agent: 'Alexander',
      role: 'Technical Arbiter',
      taskId: 'task-1',
      taskTitle: 'Architecture review',
      subtask: 'Risk analysis',
      action: 'subtask_completed',
      minutesSpent: 17,
    },
    {
      timestamp: '2026-06-15T09:00:00.000Z',
      agent: 'Kimi',
      role: 'Long-Context Researcher',
      taskId: 'task-2',
      taskTitle: 'Design copy pass',
      subtask: 'Rewrite headers',
      action: 'task_completed',
      minutesSpent: 31,
    },
    {
      timestamp: '2026-06-14T23:59:59.000Z',
      agent: 'Alexander',
      role: 'Technical Arbiter',
      taskId: 'task-old',
      taskTitle: 'Previous day',
      subtask: 'Archive',
      action: 'task_completed',
      minutesSpent: 99,
    },
  ];

  it('summarizes work log entries for the requested UTC day', () => {
    const summary = summarizeWorkLogForDate(workLog, '2026-06-15T12:00:00.000Z');

    expect(summary.totalMinutes).toBe(48);
    expect(summary.tasksCompleted).toBe(1);
    expect(summary.subtasksCompleted).toBe(1);
    expect(summary.byAgent.Alexander.totalMinutes).toBe(17);
    expect(summary.byAgent.Kimi.tasksCompleted).toBe(1);
  });

  it('maps open terminal tools to VirtualPC agent accounting identities', () => {
    expect(resolveTrackedAgentForTerminal('Codex')).toBe('Athena');
    expect(resolveTrackedAgentForTerminal('Kimi')).toBe('Kimi');
    expect(resolveTrackedAgentForTerminal('Claude')).toBe('Fill');
    expect(resolveTrackedAgentForTerminal('Alexander')).toBe('Alexander');
    expect(resolveTrackedAgentForTerminal('VirtualPC')).toBeNull();
  });

  it('builds the management rollup from tokens, work log, and terminal sessions', () => {
    const overview = buildDailyManagementOverview({
      generatedAt: new Date('2026-06-15T12:00:00.000Z'),
      workLog,
      dailyUsage: [{ date: '6/15', tokens: 6500, cost: 0, calls: 6 }],
      tokenSummary: {
        agents: {
          Alexander: {
            primaryModel: 'deepseek-r1-8b',
            today: { tokens: 1200, promptTokens: 800, completionTokens: 400, calls: 2, cost: 0, tier1Pct: 100 },
          },
          Kimi: {
            primaryModel: 'kimi-k2.6',
            today: { tokens: 2100, promptTokens: 1600, completionTokens: 500, calls: 3, cost: 0, tier1Pct: 100 },
          },
          Athena: {
            primaryModel: 'gpt-5.5',
            today: { tokens: 3200, promptTokens: 2500, completionTokens: 700, calls: 1, cost: 0, tier1Pct: 100 },
          },
        },
      },
      terminalCoordination: {
        activeAction: {
          id: 'action-1',
          title: 'Implement overview',
          kind: 'code',
          ownerSessionId: 'term-codex',
          ownerLabel: 'Codex terminal',
          ownerAgent: 'Codex',
          startedAt: '2026-06-15T11:00:00.000Z',
          updatedAt: '2026-06-15T11:00:00.000Z',
          expiresAt: '2026-06-15T11:30:00.000Z',
        },
        sessions: [
          {
            id: 'term-codex',
            label: 'Codex terminal',
            agent: 'Codex',
            createdAt: '2026-06-15T11:00:00.000Z',
            lastSeenAt: '2026-06-15T11:05:00.000Z',
            expiresAt: '2026-06-15T11:20:00.000Z',
            status: 'active',
          },
        ],
      },
      terminalActivity: {
        totalActivities: 4,
        terminalA: {
          status: {
            terminal: 'A',
            agent: 'Alexander',
            isActive: true,
            lastActivity: '2026-06-15T11:01:00.000Z',
            compactionNeeded: false,
            contextTokens: 22000,
            messageCount: 7,
          },
        },
      },
    });

    expect(overview.virtualPC.tokensToday).toBe(6500);
    expect(overview.virtualPC.workMinutesToday).toBe(48);
    expect(overview.alexander.tokensToday).toBe(1200);
    expect(overview.terminalSessions[0].trackedAgent).toBe('Athena');
    expect(overview.terminalSessions[0].tokensToday).toBe(3200);
    expect(overview.terminalSessions[0].ownsActiveAction).toBe(true);
    expect(overview.terminalStatuses[0].contextTokens).toBe(22000);
  });
});
