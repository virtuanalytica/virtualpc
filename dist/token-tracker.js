"use strict";
/**
 * Token Usage Tracker - tracks model/API token consumption per agent
 * Records every inference call with tokens used, model, cost
 * Provides aggregations by hour, day, month, and combined totals
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MODEL_COSTS = void 0;
exports.recordAgentTokens = recordAgentTokens;
exports.recordRealEvent = recordRealEvent;
exports.getHourlyUsage = getHourlyUsage;
exports.getDailyUsage = getDailyUsage;
exports.getAgentSummary = getAgentSummary;
exports.getRecentEvents = getRecentEvents;
const agent_registry_1 = require("./agent-registry");
// Cost per 1K tokens.
// All-local Gemma / Phi / Qwen / Devstral / DeepSeek (LM Studio on EDS2 RTX 3090) are
// tier-1 free. Paid fallbacks kept for when a cloud call is genuinely needed.
exports.MODEL_COSTS = {
    'gemma-4-26b': { prompt: 0, completion: 0, tier: 1 },
    'qwen3.5-27b': { prompt: 0, completion: 0, tier: 1 },
    'devstral': { prompt: 0, completion: 0, tier: 1 },
    'deepseek-r1-8b': { prompt: 0, completion: 0, tier: 1 },
    'phi-4': { prompt: 0, completion: 0, tier: 1 },
    'nomic-embed': { prompt: 0, completion: 0, tier: 1 },
    // Moonshot Kimi via the paid CLI subscription (kimi --quiet -p).
    // User has a flat-fee plan, so per-token cost is $0 from our accounting
    // perspective. Marked tier 1 so it shows alongside the local roster.
    'kimi-k2.6': { prompt: 0, completion: 0, tier: 1 },
    // Cloud fallbacks (used only when local is unreachable or context exceeds local ctx)
    'mistral-7b': { prompt: 0.0001, completion: 0.0003, tier: 2 },
    'llama-70b': { prompt: 0.0003, completion: 0.0008, tier: 2 },
    'claude-sonnet': { prompt: 0.003, completion: 0.015, tier: 3 },
    'claude-opus': { prompt: 0.015, completion: 0.075, tier: 3 },
};
// Per-agent model preference (drives the simulated usage mix on the dashboard).
// Policy: default to local Gemma / Phi / Qwen / Devstral / DeepSeek — cloud
// models only appear for overflow scenarios. This matches the real LM Studio
// routing in src/lmstudio.ts.
const AGENT_MODELS = {
    Fill: ['phi-4', 'gemma-4-26b'],
    Kai: ['devstral', 'phi-4', 'qwen3.5-27b'],
    Zip: ['devstral', 'phi-4'],
    Mira: ['claude-sonnet', 'phi-4', 'gemma-4-26b'], // designer agent, primary on Anthropic for taskType:'design'
    Luna: ['claude-sonnet', 'devstral', 'phi-4', 'deepseek-r1-8b'],
    Cleopatra: ['deepseek-r1-8b', 'qwen3.5-27b'],
    Alexander: ['deepseek-r1-8b', 'qwen3.5-27b'],
    MoneyGod: ['deepseek-r1-8b', 'qwen3.5-27b'],
    Analyst: ['phi-4', 'gemma-4-26b'],
    VideoProducer: ['phi-4', 'gemma-4-26b'],
    Vice: ['phi-4', 'gemma-4-26b'],
    Atlas: ['devstral', 'deepseek-r1-8b'],
    Kimi: ['kimi-k2.6', 'phi-4', 'gemma-4-26b', 'qwen3.5-27b'], // primary: Moonshot Kimi via paid CLI (~/.local/bin/kimi); local fallbacks if CLI missing
    Croesus: ['phi-4', 'deepseek-r1-8b'], // local fallbacks; routes to Kimi/DeepSeek for commercial reasoning
};
// Per-agent model preference by kind (for tier simulation on the dashboard).
// 85% tier-1 (local), 10% tier-2, 5% tier-3 — reflects the push toward local-first.
const TIER_WEIGHTS = { tier1: 0.85, tier2: 0.10, tier3: 0.05 };
const events = [];
const startTime = Date.now();
// Simulate realistic token usage patterns per tick
function recordAgentTokens() {
    const agents = agent_registry_1.AGENT_NAMES; // single source of truth — all 12 agents
    const now = Date.now();
    for (const agent of agents) {
        // Each agent uses ~1-3 model calls per tick cycle
        const callCount = 1 + Math.floor(Math.random() * 3);
        // Defensive default: if a new agent lands in agent-registry before its
        // model preferences are mapped here, fall back to phi-4 instead of crashing
        // the whole module on .find().
        const models = AGENT_MODELS[agent] || ['phi-4'];
        for (let i = 0; i < callCount; i++) {
            // 70% chance tier 1 (free), 20% tier 2, 10% tier 3
            const roll = Math.random();
            let model;
            // Pick UNIFORMLY at random among the agent's models that match the
            // chosen tier. The previous implementation used Array.find which
            // returned only the first matching entry — that meant agents with
            // qwen3.5-27b as their 2nd/3rd tier-1 model (Kai, Cleopatra, Alexander,
            // MoneyGod, Kimi) never logged a qwen call, even though the dashboard
            // listed it as a preferred model. Reported as "QWEN tokens not updated".
            const pickFromTier = (tier) => {
                const matches = models.filter(m => exports.MODEL_COSTS[m]?.tier === tier);
                if (matches.length === 0)
                    return undefined;
                return matches[Math.floor(Math.random() * matches.length)];
            };
            if (roll < 0.70)
                model = pickFromTier(1) || models[0];
            else if (roll < 0.90)
                model = pickFromTier(2) || pickFromTier(1) || models[0];
            else
                model = pickFromTier(3) || pickFromTier(1) || models[0];
            const mc = exports.MODEL_COSTS[model] || { prompt: 0, completion: 0, tier: 1 };
            const promptTokens = 200 + Math.floor(Math.random() * 1800);
            const completionTokens = 100 + Math.floor(Math.random() * 900);
            const totalTokens = promptTokens + completionTokens;
            const cost = (promptTokens / 1000) * mc.prompt + (completionTokens / 1000) * mc.completion;
            const actions = {
                Fill: ['strategic analysis', 'budget review', 'OKR planning', 'risk assessment', 'team review'],
                Kai: ['infra planning', 'code review', 'security audit', 'deployment check', 'DB optimization'],
                Zip: ['feature coding', 'bug fixing', 'game logic', 'API design', 'test writing'],
                Mira: ['UI design', 'asset creation', 'layout review', 'color tuning', 'icon design'],
                Luna: ['perf profiling', 'shader coding', 'render optimization', 'device testing', 'VFX design'],
            };
            events.push({
                timestamp: now - Math.floor(Math.random() * 5000), // slight jitter
                agent,
                model,
                tier: mc.tier,
                promptTokens,
                completionTokens,
                totalTokens,
                cost,
                action: actions[agent]?.[Math.floor(Math.random() * 5)] || 'processing',
            });
        }
    }
    // Keep max 50K events (rolling window)
    if (events.length > 50000) {
        events.splice(0, events.length - 50000);
    }
}
// Real-call recorder — wired from lmstudio.chatAsAgent on every successful
// completion. Adds a real event alongside the simulated stream, tagged with
// action='real-llm' so dashboards can split if they want to.
function recordRealEvent(input) {
    const mc = exports.MODEL_COSTS[input.model] || { prompt: 0, completion: 0, tier: 1 };
    const total = input.promptTokens + input.completionTokens;
    events.push({
        timestamp: Date.now(),
        agent: input.agent,
        model: input.model,
        tier: mc.tier,
        promptTokens: input.promptTokens,
        completionTokens: input.completionTokens,
        totalTokens: total,
        cost: (input.promptTokens / 1000) * mc.prompt + (input.completionTokens / 1000) * mc.completion,
        action: 'real-llm',
    });
    if (events.length > 50000)
        events.splice(0, events.length - 50000);
}
// === AGGREGATION FUNCTIONS ===
function filterByTime(from, to) {
    return events.filter(e => e.timestamp >= from && e.timestamp <= to);
}
function getHourlyUsage(agent) {
    const now = Date.now();
    const hours = [];
    for (let h = 23; h >= 0; h--) {
        const from = now - (h + 1) * 3600000;
        const to = now - h * 3600000;
        let filtered = filterByTime(from, to);
        if (agent)
            filtered = filtered.filter(e => e.agent === agent);
        const tokens = filtered.reduce((s, e) => s + e.totalTokens, 0);
        const cost = filtered.reduce((s, e) => s + e.cost, 0);
        const calls = filtered.length;
        const d = new Date(to);
        hours.push({
            hour: `${d.getHours().toString().padStart(2, '0')}:00`,
            tokens, cost: +cost.toFixed(4), calls,
            tier1: filtered.filter(e => e.tier === 1).reduce((s, e) => s + e.totalTokens, 0),
            tier2: filtered.filter(e => e.tier === 2).reduce((s, e) => s + e.totalTokens, 0),
            tier3: filtered.filter(e => e.tier === 3).reduce((s, e) => s + e.totalTokens, 0),
        });
    }
    return hours;
}
function getDailyUsage(agent) {
    const now = Date.now();
    const days = [];
    for (let d = 6; d >= 0; d--) {
        const from = now - (d + 1) * 86400000;
        const to = now - d * 86400000;
        let filtered = filterByTime(from, to);
        if (agent)
            filtered = filtered.filter(e => e.agent === agent);
        const tokens = filtered.reduce((s, e) => s + e.totalTokens, 0);
        const cost = filtered.reduce((s, e) => s + e.cost, 0);
        const calls = filtered.length;
        const dt = new Date(to);
        days.push({
            date: `${dt.getMonth() + 1}/${dt.getDate()}`,
            tokens, cost: +cost.toFixed(4), calls,
        });
    }
    return days;
}
function getAgentSummary() {
    const agents = agent_registry_1.AGENT_NAMES; // single source of truth — all 12 agents
    const now = Date.now();
    const todayStart = now - (now % 86400000);
    const monthStart = now - 30 * 86400000;
    const summaries = {};
    let grandTotalTokens = 0, grandTotalCost = 0, grandTotalCalls = 0;
    for (const agent of agents) {
        const all = events.filter(e => e.agent === agent);
        const today = all.filter(e => e.timestamp >= todayStart);
        const thisHour = all.filter(e => e.timestamp >= now - 3600000);
        const month = all.filter(e => e.timestamp >= monthStart);
        const sum = (arr) => ({
            tokens: arr.reduce((s, e) => s + e.totalTokens, 0),
            cost: +arr.reduce((s, e) => s + e.cost, 0).toFixed(4),
            calls: arr.length,
            promptTokens: arr.reduce((s, e) => s + e.promptTokens, 0),
            completionTokens: arr.reduce((s, e) => s + e.completionTokens, 0),
            tier1Pct: arr.length > 0 ? Math.round(arr.filter(e => e.tier === 1).length / arr.length * 100) : 0,
            tier2Pct: arr.length > 0 ? Math.round(arr.filter(e => e.tier === 2).length / arr.length * 100) : 0,
            tier3Pct: arr.length > 0 ? Math.round(arr.filter(e => e.tier === 3).length / arr.length * 100) : 0,
        });
        const models = {};
        for (const e of all)
            models[e.model] = (models[e.model] || 0) + e.totalTokens;
        const topModel = Object.entries(models).sort((a, b) => b[1] - a[1])[0];
        summaries[agent] = {
            thisHour: sum(thisHour),
            today: sum(today),
            month: sum(month),
            allTime: sum(all),
            primaryModel: topModel ? topModel[0] : 'none',
            modelBreakdown: models,
        };
        grandTotalTokens += all.reduce((s, e) => s + e.totalTokens, 0);
        grandTotalCost += all.reduce((s, e) => s + e.cost, 0);
        grandTotalCalls += all.length;
    }
    return {
        agents: summaries,
        combined: {
            totalTokens: grandTotalTokens,
            totalCost: +grandTotalCost.toFixed(4),
            totalCalls: grandTotalCalls,
            costSavingsPercent: grandTotalCalls > 0 ? Math.round(events.filter(e => e.tier === 1).length / events.length * 100) : 0,
            uptimeSeconds: Math.round((now - startTime) / 1000),
        },
        models: exports.MODEL_COSTS,
    };
}
function getRecentEvents(agent, limit = 20) {
    let filtered = agent ? events.filter(e => e.agent === agent) : events;
    return filtered.slice(-limit).reverse().map(e => ({
        time: new Date(e.timestamp).toISOString().substring(11, 19),
        agent: e.agent,
        model: e.model,
        tier: e.tier,
        tokens: e.totalTokens,
        cost: +e.cost.toFixed(6),
        action: e.action,
    }));
}
// Tick every 30 seconds to generate usage data
setInterval(recordAgentTokens, 30000);
// Generate some initial history
for (let i = 0; i < 20; i++)
    recordAgentTokens();
//# sourceMappingURL=token-tracker.js.map