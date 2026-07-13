"use strict";
/**
 * Agent Registry — single source of truth for the VirtualPC roster.
 *
 * Every module (task engine, token tracker, commits tracker, social hub, UI)
 * imports from here so there can be no drift where "All Agents" shows 12 but
 * Token Usage only shows 5. Adding a new agent = editing this file once.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AGENT_MODELS = exports.COLOR_MAP = exports.AVATAR_MAP = exports.ROLE_MAP = exports.AGENT_NAMES = exports.AGENT_META = void 0;
exports.getAgent = getAgent;
exports.AGENT_META = [
    // ─── Core 14 (existing roster) ────────────────────────────────────────
    { name: 'Fill', role: 'CEO · Scrum-of-Scrums chair', avatar: '👑', color: '#fbbf24', kind: 'core', models: ['claude-sonnet', 'gemma-4-26b', 'claude-opus', 'qwen3.5-27b'], teams: ['cross', 'scrum-roblox', 'scrum-web', 'scrum-marketing'], tools: ['scrum.*', 'forum.*', 'coordination.*', 'codegraph.stats', 'governance.lineage', 'wiki.lookup'] },
    { name: 'Kai', role: 'CTO · Cross-team infra', avatar: '⚡', color: '#a78bfa', kind: 'core', models: ['claude-sonnet', 'devstral', 'claude-opus', 'qwen3.5-27b'], teams: ['cross', 'scrum-roblox', 'scrum-web'], tools: ['codegraph.*', 'governance.lineage', 'assets.search', 'scrum.standup', 'scrum.bug', 'wiki.lookup'] },
    { name: 'Zip', role: 'Developer', avatar: '💻', color: '#22c55e', kind: 'core', models: ['claude-sonnet', 'devstral', 'phi-4'], teams: ['scrum-web'], tools: ['codegraph.*', 'wiki.lookup', 'assets.search'] },
    { name: 'Mira', role: 'Creative Director', avatar: '🎨', color: '#ec4899', kind: 'core', models: ['claude-sonnet', 'gemma-4-26b', 'phi-4'], teams: ['scrum-web', 'scrum-roblox'], tools: ['assets.search', 'wiki.lookup', 'governance.lineage', 'kami.queue', 'kami.briefs'] },
    { name: 'Luna', role: 'Tech Artist', avatar: '✨', color: '#06b6d4', kind: 'core', models: ['devstral', 'claude-sonnet', 'deepseek-r1', 'phi-4'], teams: ['scrum-web'], tools: ['assets.search', 'codegraph.symbol', 'codegraph.file', 'wiki.lookup', 'kami.queue', 'kami.briefs'] },
    { name: 'Cleopatra', role: 'Executive Authority', avatar: '👸', color: '#f97316', kind: 'decision', models: ['claude-sonnet', 'qwen3.5-27b', 'claude-opus'], teams: ['cross'], tools: ['scrum.*', 'governance.*', 'forum.read'] },
    { name: 'Alexander', role: 'Technical Arbiter', avatar: '🗡️', color: '#ef4444', kind: 'decision', models: ['claude-sonnet', 'qwen3.5-27b', 'deepseek-r1'], teams: ['cross'], tools: ['coordination.*', 'codegraph.*', 'governance.lineage', 'scrum.bug'] },
    { name: 'MoneyGod', role: 'Economy Authority', avatar: '💰', color: '#10b981', kind: 'decision', models: ['claude-sonnet', 'qwen3.5-27b'], teams: ['cross', 'scrum-marketing'], tools: ['governance.lineage', 'wiki.lookup'] },
    { name: 'Analyst', role: 'Data Analyst', avatar: '📊', color: '#8b5cf6', kind: 'resource', models: ['claude-sonnet', 'gemma-4-26b', 'phi-4'], teams: ['scrum-marketing'], tools: ['governance.*', 'codegraph.stats', 'forum.read', 'wiki.lookup'] },
    { name: 'VideoProducer', role: 'Video Producer', avatar: '🎬', color: '#d946ef', kind: 'resource', models: ['claude-sonnet', 'gemma-4-26b', 'phi-4'], teams: ['scrum-marketing'], tools: ['assets.search', 'wiki.lookup'] },
    { name: 'Vice', role: 'Open-World Design Expert', avatar: '🌆', color: '#e11d48', kind: 'specialist', models: ['claude-sonnet', 'gemma-4-26b', 'qwen3.5-27b'], teams: ['scrum-roblox', 'scrum-web'], tools: ['assets.search', 'wiki.lookup', 'governance.lineage'] },
    { name: 'Atlas', role: 'Simulation / AR / VR / CAD Realism', avatar: '🥽', color: '#0ea5e9', kind: 'specialist', models: ['deepseek-r1', 'claude-sonnet', 'devstral'], teams: ['scrum-web'], tools: ['assets.search', 'codegraph.*', 'governance.lineage', 'wiki.lookup'] },
    { name: 'Kimi', role: 'Long-Context Researcher', avatar: '🌙', color: '#7c3aed', kind: 'specialist', models: ['claude-sonnet', 'kimi', 'moonshot', 'gemma-4-26b', 'qwen3.5-27b'], teams: ['cross'], tools: ['coordination.*', 'wiki.*', 'codegraph.*', 'governance.lineage', 'assets.search', 'forum.read'] },
    { name: 'Croesus', role: 'Commercialization Strategist', avatar: '💎', color: '#fde047', kind: 'specialist', models: ['claude-sonnet', 'kimi', 'deepseek-r1'], teams: ['scrum-marketing'], tools: ['governance.lineage', 'wiki.lookup', 'forum.read'] },
    // ─── Data governance + Web developer (added 2026-05-04) ───────────────
    // Governor curates the data-governance registry: every shared/*.json file,
    // every wiki term, every asset license — owner, lineage, last-updated.
    // Pixel ships the webgame UI (Next.js/Phaser/Three.js) including the new
    // /wiki page that the data-governance registry feeds.
    // Governor (data governance) and Pixel (web dev) are local-GPU-only —
    // no claude-sonnet fallback. See docs/AGENT-MODEL-ROSTER.md for
    // sizing rationale and pretrained-model picks per task type.
    // Multi-model "expert team": each agent has 4 models picked per task
    // type, all fitting in 24 GB VRAM (RTX 3090).
    { name: 'Governor', role: 'Data Governance / Wiki Analyst', avatar: '📒', color: '#0891b2', kind: 'governance', models: ['claude-sonnet', 'phi-4', 'qwen3.5-27b', 'gemma-4-26b', 'deepseek-r1'], teams: ['cross', 'scrum-marketing', 'scrum-web'], tools: ['coordination.*', 'governance.*', 'codegraph.*', 'assets.search', 'wiki.*', 'kami.*'] },
    { name: 'Pixel', role: 'Web Developer · Next.js / Wiki UX', avatar: '🖼️', color: '#16a34a', kind: 'core', models: ['qwen-coder-32b', 'claude-sonnet', 'devstral', 'deepseek-r1'], teams: ['scrum-web'], tools: ['coordination.*', 'codegraph.*', 'wiki.*', 'assets.search', 'governance.lineage', 'kami.queue', 'kami.briefs'] },
    // ─── 5 Hermes scrum coordinators (one per scrum + 2 cross-cutting) ────
    // Backed by the Hermes 3 + DeepSeek-R1 Reviewer pair on EDS2.
    // They run the daily standup, hold the burndown, escalate blockers.
    { name: 'Hermes-Roblox', role: 'Scrum Master · Roblox team', avatar: '🪽', color: '#fb923c', kind: 'hermes-coordinator', models: ['claude-sonnet', 'hermes-3', 'deepseek-r1'], teams: ['scrum-roblox'], tools: ['scrum.*', 'forum.*', 'codegraph.stats', 'wiki.lookup'] },
    { name: 'Hermes-Web', role: 'Scrum Master · Web team', avatar: '🪽', color: '#22d3ee', kind: 'hermes-coordinator', models: ['claude-sonnet', 'hermes-3', 'deepseek-r1'], teams: ['scrum-web'], tools: ['scrum.*', 'forum.*', 'codegraph.stats', 'wiki.lookup'] },
    { name: 'Hermes-Marketing', role: 'Scrum Master · Marketing & Perception', avatar: '🪽', color: '#facc15', kind: 'hermes-coordinator', models: ['claude-sonnet', 'hermes-3', 'deepseek-r1'], teams: ['scrum-marketing'], tools: ['scrum.*', 'forum.*', 'wiki.lookup'] },
    { name: 'Hermes-Cross', role: 'Scrum-of-Scrums coordinator', avatar: '🪽', color: '#f472b6', kind: 'hermes-coordinator', models: ['claude-sonnet', 'hermes-3', 'deepseek-r1'], teams: ['cross'], tools: ['scrum.*', 'forum.*', 'coordination.*', 'governance.lineage'] },
    { name: 'Hermes-Reviewer', role: 'DeepSeek-R1 cross-team reviewer', avatar: '🪽', color: '#a3e635', kind: 'hermes-coordinator', models: ['claude-sonnet', 'deepseek-r1', 'hermes-3'], teams: ['cross'], tools: ['scrum.*', 'forum.*', 'codegraph.*', 'governance.lineage'] },
    // ─── Principal Reviewer — the single GPT-5.5 (Codex) PR gate ─────────────
    // Athena reviews as the most-senior PhD-level engineer on the team. As of
    // 2026-06-04 she runs ON GPT-5.5 via Codex at xhigh effort (was Opus 4.8) —
    // the main reviewer model, billed to the ChatGPT subscription through the
    // Codex bridge (src/codex). For each feature, the THREE developer legs (gpt /
    // claude / virtualpc — see src/org/dev-tournament.ts) build competing
    // branches; Athena reviews EVERY branch, spots any coding mistake, REQUIRES a
    // working feature + a clean unit + regression run on the whole, and enforces
    // docs/CODING-STANDARDS.md (standardsAdhered=false BLOCKS). She scores each
    // branch; the Product Owner (Claude Opus, max) reads the reviews and selects
    // exactly one winner. She never writes feature code — review, standards, and
    // gate only. See docs/DEV-TOURNAMENT.md and docs/ATHENA-REVIEW-GATE.md.
    { name: 'Athena', role: 'Principal Reviewer · senior PhD-level engineer · GPT-5.5 (Codex, xhigh) PR gate · owns coding standards', avatar: '🦉', color: '#9333ea', kind: 'reviewer', models: ['gpt-5.5'], teams: ['cross', 'scrum-roblox', 'scrum-web', 'scrum-marketing'], tools: ['coordination.*', 'codegraph.*', 'scrum.bug', 'scrum.standup', 'governance.lineage', 'forum.*', 'wiki.lookup'] },
    // ─── Tester agents — synthetic users who play the games + file bugs ───
    // Testers — get scrum.bug + forum.* (the forum is where they share tips/tricks).
    // Roblox testers (4)
    { name: 'Tester-RB-Casey', role: 'Casual Roblox player (10-13)', avatar: '🎮', color: '#34d399', kind: 'tester', models: ['claude-sonnet', 'phi-4', 'gemma-4-26b'], teams: ['scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
    { name: 'Tester-RB-Riley', role: 'Hardcore tycoon player (14-17)', avatar: '🎮', color: '#10b981', kind: 'tester', models: ['claude-sonnet', 'phi-4', 'gemma-4-26b'], teams: ['scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
    { name: 'Tester-RB-Morgan', role: 'Speedrunner / glitch-hunter', avatar: '🎮', color: '#059669', kind: 'tester', models: ['claude-sonnet', 'phi-4', 'deepseek-r1'], teams: ['scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
    { name: 'Tester-RB-Avery', role: 'Educator playing in classroom', avatar: '🎮', color: '#047857', kind: 'tester', models: ['claude-sonnet', 'phi-4'], teams: ['scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
    // Web testers (4)
    { name: 'Tester-Web-Sam', role: 'Mobile-first web player (Z Fold)', avatar: '🌐', color: '#60a5fa', kind: 'tester', models: ['claude-sonnet', 'phi-4', 'gemma-4-26b'], teams: ['scrum-web'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
    { name: 'Tester-Web-Quinn', role: 'Desktop browser player', avatar: '🌐', color: '#3b82f6', kind: 'tester', models: ['claude-sonnet', 'phi-4', 'gemma-4-26b'], teams: ['scrum-web'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
    { name: 'Tester-Web-Drew', role: 'Accessibility tester (screen reader)', avatar: '🌐', color: '#2563eb', kind: 'tester', models: ['claude-sonnet', 'phi-4'], teams: ['scrum-web'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
    { name: 'Tester-Web-Jordan', role: 'Chemistry teacher curriculum tester', avatar: '🌐', color: '#1d4ed8', kind: 'tester', models: ['claude-sonnet', 'phi-4'], teams: ['scrum-web'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
    // Marketing/competitor playtest (2)
    { name: 'Tester-MK-Alex', role: 'Plays competitor chemistry games', avatar: '🎯', color: '#eab308', kind: 'tester', models: ['claude-sonnet', 'phi-4'], teams: ['scrum-marketing'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
    { name: 'Tester-MK-Robin', role: 'TikTok / social-loop tester', avatar: '🎯', color: '#ca8a04', kind: 'tester', models: ['claude-sonnet', 'phi-4', 'gemma-4-26b'], teams: ['scrum-marketing'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
    // Gameplay-experience testers (4) — added 2026-05-04 to evaluate the
    // GTA6-without-vices target. Demographic testers above hit specific
    // personas; these hit specific GAME SYSTEMS: world feel, missions,
    // physics, character. They publish gap-analysis threads tagged
    // 'gta6-gap' so the team can prioritize the right feature work.
    { name: 'Tester-GP-Sienna', role: 'Open-world feel · density + ambient life', avatar: '🌇', color: '#fb7185', kind: 'tester', models: ['claude-sonnet', 'gemma-4-26b', 'phi-4', 'deepseek-r1'], teams: ['scrum-web', 'scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup', 'assets.search'] },
    { name: 'Tester-GP-Dante', role: 'Mission + narrative design', avatar: '📜', color: '#c084fc', kind: 'tester', models: ['claude-sonnet', 'gemma-4-26b', 'qwen3.5-27b', 'phi-4'], teams: ['scrum-web', 'scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup', 'governance.lineage'] },
    { name: 'Tester-GP-Onyx', role: 'Physics + interaction realism', avatar: '🛞', color: '#475569', kind: 'tester', models: ['claude-sonnet', 'deepseek-r1', 'phi-4', 'devstral'], teams: ['scrum-web'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup', 'codegraph.symbol'] },
    { name: 'Tester-GP-Iris', role: 'Character animation · dialogue · NPC AI', avatar: '🎭', color: '#f0abfc', kind: 'tester', models: ['claude-sonnet', 'gemma-4-26b', 'phi-4'], teams: ['scrum-web', 'scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup', 'assets.search'] },
];
/** Canonical list of agent names — use this everywhere you need to iterate. */
exports.AGENT_NAMES = exports.AGENT_META.map(a => a.name);
/** Lookup by name (returns undefined if missing). */
function getAgent(name) {
    return exports.AGENT_META.find(a => a.name === name);
}
/** roleMap compatibility: { Fill: 'CEO', Kai: 'CTO', ... } */
exports.ROLE_MAP = Object.fromEntries(exports.AGENT_META.map(a => [a.name, a.role]));
/** avatarMap compatibility */
exports.AVATAR_MAP = Object.fromEntries(exports.AGENT_META.map(a => [a.name, a.avatar]));
/** colorMap compatibility */
exports.COLOR_MAP = Object.fromEntries(exports.AGENT_META.map(a => [a.name, a.color]));
/** Agent → preferred models for token tracker / routing */
exports.AGENT_MODELS = Object.fromEntries(exports.AGENT_META.map(a => [a.name, a.models]));
//# sourceMappingURL=agent-registry.js.map