import logger from '../utils/logger';

export interface RouteDecision {
  agentId: string;
  reason: 'mention' | 'active_session' | 'keyword' | 'default';
  matchedKeyword?: string;
  cleanedMessage: string;
  confidence: number;
}

interface ActiveSession {
  userId: string;
  agentId: string;
  startedAt: Date;
  lastActivity: Date;
  messageCount: number;
}

export class AgentOrchestrator {
  private activeSessions = new Map<string, ActiveSession>();
  private readonly keywords: Record<string, string[]> = {
    fill: ['strategy', 'decision', 'approval', 'roadmap', 'okr', 'governance'],
    kai: ['deploy', 'infrastructure', 'database', 'docker', 'kubernetes', 'gpu', 'performance'],
    zip: ['feature', 'ui', 'dashboard', 'frontend', 'component', 'layout'],
    mira: ['design', 'creative', 'visual', 'icon', 'brand', 'animation'],
    luna: ['test', 'qa', 'quality', 'bug', 'verification', 'validation', 'coverage'],
  };
  private readonly timeoutMs = 30 * 60 * 1000;

  routeMessage(userId: string, rawMessage: string): RouteDecision {
    const message = rawMessage.trimStart();
    const mention = /^@([a-z][a-z0-9_-]{0,29})\b\s*/i.exec(message);
    if (mention && this.valid(mention[1])) {
      return { agentId: mention[1].toLowerCase(), reason: 'mention', cleanedMessage: message.slice(mention[0].length).trim(), confidence: 1 };
    }
    const session = this.getSession(userId);
    if (session) {
      session.lastActivity = new Date();
      session.messageCount++;
      return { agentId: session.agentId, reason: 'active_session', cleanedMessage: message, confidence: 0.9 };
    }
    const lower = message.toLowerCase();
    for (const [agentId, words] of Object.entries(this.keywords)) {
      const hit = words.find(word => lower.includes(word));
      if (hit) return { agentId, reason: 'keyword', matchedKeyword: hit, cleanedMessage: message, confidence: 0.7 };
    }
    return { agentId: 'fill', reason: 'default', cleanedMessage: message, confidence: 0.5 };
  }

  startSession(userId: string, agentId: string): void {
    if (!this.valid(agentId)) { logger.warn(`[Orchestrator] Invalid agent: ${agentId}`); return; }
    this.activeSessions.set(userId, { userId, agentId: agentId.toLowerCase(), startedAt: new Date(), lastActivity: new Date(), messageCount: 0 });
  }

  endSession(userId: string): void { this.activeSessions.delete(userId); }

  getSession(userId: string): ActiveSession | undefined {
    const session = this.activeSessions.get(userId);
    if (!session) return undefined;
    if (Date.now() - session.lastActivity.getTime() >= this.timeoutMs) { this.activeSessions.delete(userId); return undefined; }
    return session;
  }

  async createInterAgentTask(fromAgentId: string, toAgentId: string, taskTitle: string, _description: string, _priority = 'medium') {
    logger.info(`[Orchestrator] Inter-agent task: ${fromAgentId} -> ${toAgentId}: ${taskTitle}`);
    return { id: `iat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, status: 'pending' };
  }

  getStats() {
    const sessionsByAgent: Record<string, number> = {};
    let totalMessages = 0;
    for (const session of this.activeSessions.values()) {
      if (!this.getSession(session.userId)) continue;
      sessionsByAgent[session.agentId] = (sessionsByAgent[session.agentId] || 0) + 1;
      totalMessages += session.messageCount;
    }
    return { activeSessions: this.activeSessions.size, sessionsByAgent, totalMessages };
  }

  private valid(agentId: string): boolean { return Object.prototype.hasOwnProperty.call(this.keywords, agentId.toLowerCase()); }
}

export const agentOrchestrator = new AgentOrchestrator();
