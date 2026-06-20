/**
 * Agent Registry — single source of truth for the VirtualPC roster.
 *
 * Every module (task engine, token tracker, commits tracker, social hub, UI)
 * imports from here so there can be no drift where "All Agents" shows 12 but
 * Token Usage only shows 5. Adding a new agent = editing this file once.
 *
 * Model lists: each agent has a small default roster.  At runtime
 * src/model-router.ts selects the actual loaded model by weight class and
 * capability, so these defaults are used by the token tracker / dashboard.
 */

export interface AgentMeta {
  name: string;
  role: string;
  avatar: string;
  color: string;
  kind: 'core' | 'decision' | 'specialist' | 'resource' | 'hermes-coordinator' | 'tester' | 'marketing' | 'governance' | 'reviewer';
  /** Preferred model substrings for token-tracker / LM Studio routing */
  models: string[];
  /**
   * Scrum membership. Agents can belong to multiple teams (e.g. Fill chairs
   * the scrum-of-scrums; Kai joins both web-scrum and roblox-scrum as
   * cross-cutting infra). 'cross' = sits at the scrum-of-scrums layer.
   */
  teams?: ('cross' | 'scrum-roblox' | 'scrum-web' | 'scrum-marketing')[];
  /**
   * MCP tool ACL — names of tools the agent is allowed to call through the
   * virtualpc MCP server. Wildcards like 'codegraph.*' allowed. Read by the
   * MCP server on every tool invocation. Empty/undefined = no MCP access.
   */
  tools?: string[];
}

// Default small-model roster used across the dashboard / token tracker.
// Big models are opt-in via FORCE_BIG_MODEL=1 or the setup program.
const CHAT_MODELS   = ['smollm-135m', 'qwen2.5-0.5b', 'tinyllama-1.1b'];
const CODE_MODELS   = ['qwen2.5-coder-0.5b', 'qwen2.5-0.5b', 'tinyllama-1.1b'];
const REASON_MODELS = ['qwen2.5-0.5b', 'tinyllama-1.1b', 'smollm2-135m'];
const CLOUD_MODELS  = ['claude-sonnet', 'kimi-k2.6'];

export const AGENT_META: AgentMeta[] = [
  // ─── Core 14 ────────────────────────────────────────────────────────────
  { name: 'Fill',          role: 'CEO · Scrum-of-Scrums chair',       avatar: '👑', color: '#fbbf24', kind: 'core',       models: [...CHAT_MODELS, ...CLOUD_MODELS], teams: ['cross', 'scrum-roblox', 'scrum-web', 'scrum-marketing'], tools: ['scrum.*', 'forum.*', 'codegraph.stats', 'governance.lineage', 'wiki.lookup'] },
  { name: 'Kai',           role: 'CTO · Cross-team infra',            avatar: '⚡', color: '#a78bfa', kind: 'core',       models: [...CODE_MODELS, ...REASON_MODELS, ...CLOUD_MODELS], teams: ['cross', 'scrum-roblox', 'scrum-web'], tools: ['codegraph.*', 'governance.lineage', 'assets.search', 'scrum.standup', 'scrum.bug', 'wiki.lookup'] },
  { name: 'Zip',           role: 'Developer',                          avatar: '💻', color: '#22c55e', kind: 'core',       models: [...CODE_MODELS, ...CLOUD_MODELS], teams: ['scrum-web'], tools: ['codegraph.*', 'wiki.lookup', 'assets.search'] },
  { name: 'Mira',          role: 'Creative Director',                  avatar: '🎨', color: '#ec4899', kind: 'core',       models: [...CHAT_MODELS, 'claude-sonnet'], teams: ['scrum-web', 'scrum-roblox'], tools: ['assets.search', 'wiki.lookup', 'governance.lineage', 'kami.queue', 'kami.briefs'] },
  { name: 'Luna',          role: 'Tech Artist',                        avatar: '✨', color: '#06b6d4', kind: 'core',       models: [...CODE_MODELS, 'claude-sonnet'], teams: ['scrum-web'], tools: ['assets.search', 'codegraph.symbol', 'codegraph.file', 'wiki.lookup', 'kami.queue', 'kami.briefs'] },
  { name: 'Cleopatra',     role: 'Executive Authority',                avatar: '👸', color: '#f97316', kind: 'decision',   models: [...REASON_MODELS, ...CLOUD_MODELS], teams: ['cross'], tools: ['scrum.*', 'governance.*', 'forum.read'] },
  { name: 'Alexander',     role: 'Technical Arbiter',                  avatar: '🗡️', color: '#ef4444', kind: 'decision',   models: [...REASON_MODELS, ...CODE_MODELS, ...CLOUD_MODELS], teams: ['cross'], tools: ['codegraph.*', 'governance.lineage', 'scrum.bug'] },
  { name: 'MoneyGod',      role: 'Economy Authority',                  avatar: '💰', color: '#10b981', kind: 'decision',   models: [...REASON_MODELS, ...CLOUD_MODELS], teams: ['cross', 'scrum-marketing'], tools: ['governance.lineage', 'wiki.lookup'] },
  { name: 'Analyst',       role: 'Data Analyst',                       avatar: '📊', color: '#8b5cf6', kind: 'resource',   models: [...CHAT_MODELS, ...REASON_MODELS, ...CLOUD_MODELS], teams: ['scrum-marketing'], tools: ['governance.*', 'codegraph.stats', 'forum.read', 'wiki.lookup'] },
  { name: 'VideoProducer', role: 'Video Producer',                     avatar: '🎬', color: '#d946ef', kind: 'resource',   models: [...CHAT_MODELS, ...CLOUD_MODELS], teams: ['scrum-marketing'], tools: ['assets.search', 'wiki.lookup'] },
  { name: 'Vice',          role: 'Open-World Design Expert',           avatar: '🌆', color: '#e11d48', kind: 'specialist', models: [...CHAT_MODELS, ...REASON_MODELS, ...CLOUD_MODELS], teams: ['scrum-roblox', 'scrum-web'], tools: ['assets.search', 'wiki.lookup', 'governance.lineage'] },
  { name: 'Atlas',         role: 'Simulation / AR / VR / CAD Realism', avatar: '🥽', color: '#0ea5e9', kind: 'specialist', models: [...CODE_MODELS, ...REASON_MODELS, ...CLOUD_MODELS], teams: ['scrum-web'], tools: ['assets.search', 'codegraph.*', 'governance.lineage', 'wiki.lookup'] },
  { name: 'Kimi',          role: 'Long-Context Researcher',           avatar: '🌙', color: '#7c3aed', kind: 'specialist', models: ['kimi-k2.6', ...CHAT_MODELS], teams: ['cross'], tools: ['wiki.*', 'codegraph.*', 'governance.lineage', 'assets.search', 'forum.read'] },
  { name: 'Croesus',       role: 'Commercialization Strategist',       avatar: '💎', color: '#fde047', kind: 'specialist', models: [...REASON_MODELS, ...CLOUD_MODELS], teams: ['scrum-marketing'], tools: ['governance.lineage', 'wiki.lookup', 'forum.read'] },

  // ─── Data governance + Web developer ────────────────────────────────────
  { name: 'Governor',      role: 'Data Governance / Wiki Analyst',     avatar: '📒', color: '#0891b2', kind: 'governance', models: [...CHAT_MODELS, ...CLOUD_MODELS], teams: ['cross', 'scrum-marketing', 'scrum-web'], tools: ['governance.*', 'codegraph.*', 'assets.search', 'wiki.*', 'kami.*'] },
  { name: 'Pixel',         role: 'Web Developer · Next.js / Wiki UX',  avatar: '🖼️', color: '#16a34a', kind: 'core',       models: [...CODE_MODELS, ...CLOUD_MODELS], teams: ['scrum-web'], tools: ['codegraph.*', 'wiki.*', 'assets.search', 'governance.lineage', 'kami.queue', 'kami.briefs'] },

  // ─── 5 Hermes scrum coordinators ────────────────────────────────────────
  { name: 'Hermes-Roblox',   role: 'Scrum Master · Roblox team',       avatar: '🪽', color: '#fb923c', kind: 'hermes-coordinator', models: [...CHAT_MODELS, ...REASON_MODELS], teams: ['scrum-roblox'], tools: ['scrum.*', 'forum.*', 'codegraph.stats', 'wiki.lookup'] },
  { name: 'Hermes-Web',      role: 'Scrum Master · Web team',          avatar: '🪽', color: '#22d3ee', kind: 'hermes-coordinator', models: [...CHAT_MODELS, ...REASON_MODELS], teams: ['scrum-web'], tools: ['scrum.*', 'forum.*', 'codegraph.stats', 'wiki.lookup'] },
  { name: 'Hermes-Marketing',role: 'Scrum Master · Marketing & Perception', avatar: '🪽', color: '#facc15', kind: 'hermes-coordinator', models: [...CHAT_MODELS, ...REASON_MODELS], teams: ['scrum-marketing'], tools: ['scrum.*', 'forum.*', 'wiki.lookup'] },
  { name: 'Hermes-Cross',    role: 'Scrum-of-Scrums coordinator',      avatar: '🪽', color: '#f472b6', kind: 'hermes-coordinator', models: [...CHAT_MODELS, ...REASON_MODELS], teams: ['cross'], tools: ['scrum.*', 'forum.*', 'governance.lineage'] },
  { name: 'Hermes-Reviewer', role: 'DeepSeek-R1 cross-team reviewer',  avatar: '🪽', color: '#a3e635', kind: 'hermes-coordinator', models: [...REASON_MODELS, ...CODE_MODELS], teams: ['cross'], tools: ['scrum.*', 'forum.*', 'codegraph.*', 'governance.lineage'] },

  // ─── Principal Reviewer ─────────────────────────────────────────────────
  { name: 'Athena',        role: 'Principal Reviewer · senior PhD-level engineer · GPT-5.5 (Codex, xhigh) PR gate · owns coding standards', avatar: '🦉', color: '#9333ea', kind: 'reviewer', models: ['gpt-5.5', ...CODE_MODELS, ...REASON_MODELS], teams: ['cross', 'scrum-roblox', 'scrum-web', 'scrum-marketing'], tools: ['codegraph.*', 'scrum.bug', 'scrum.standup', 'governance.lineage', 'forum.*', 'wiki.lookup'] },

  // ─── Tester agents ──────────────────────────────────────────────────────
  { name: 'Tester-RB-Casey',   role: 'Casual Roblox player (10-13)',     avatar: '🎮', color: '#34d399', kind: 'tester', models: [...CHAT_MODELS], teams: ['scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
  { name: 'Tester-RB-Riley',   role: 'Hardcore tycoon player (14-17)',   avatar: '🎮', color: '#10b981', kind: 'tester', models: [...CHAT_MODELS], teams: ['scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
  { name: 'Tester-RB-Morgan',  role: 'Speedrunner / glitch-hunter',      avatar: '🎮', color: '#059669', kind: 'tester', models: [...CHAT_MODELS, ...REASON_MODELS], teams: ['scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
  { name: 'Tester-RB-Avery',   role: 'Educator playing in classroom',    avatar: '🎮', color: '#047857', kind: 'tester', models: [...CHAT_MODELS], teams: ['scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
  { name: 'Tester-Web-Sam',    role: 'Mobile-first web player (Z Fold)', avatar: '🌐', color: '#60a5fa', kind: 'tester', models: [...CHAT_MODELS], teams: ['scrum-web'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
  { name: 'Tester-Web-Quinn',  role: 'Desktop browser player',           avatar: '🌐', color: '#3b82f6', kind: 'tester', models: [...CHAT_MODELS], teams: ['scrum-web'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
  { name: 'Tester-Web-Drew',   role: 'Accessibility tester (screen reader)', avatar: '🌐', color: '#2563eb', kind: 'tester', models: [...CHAT_MODELS], teams: ['scrum-web'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
  { name: 'Tester-Web-Jordan', role: 'Chemistry teacher curriculum tester', avatar: '🌐', color: '#1d4ed8', kind: 'tester', models: [...CHAT_MODELS], teams: ['scrum-web'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
  { name: 'Tester-MK-Alex',    role: 'Plays competitor chemistry games', avatar: '🎯', color: '#eab308', kind: 'tester', models: [...CHAT_MODELS], teams: ['scrum-marketing'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
  { name: 'Tester-MK-Robin',   role: 'TikTok / social-loop tester',      avatar: '🎯', color: '#ca8a04', kind: 'tester', models: [...CHAT_MODELS, ...REASON_MODELS], teams: ['scrum-marketing'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup'] },
  { name: 'Tester-GP-Sienna',  role: 'Open-world feel · density + ambient life',  avatar: '🌇', color: '#fb7185', kind: 'tester', models: [...CHAT_MODELS, ...REASON_MODELS], teams: ['scrum-web', 'scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup', 'assets.search'] },
  { name: 'Tester-GP-Dante',   role: 'Mission + narrative design',                avatar: '📜', color: '#c084fc', kind: 'tester', models: [...CHAT_MODELS, ...REASON_MODELS], teams: ['scrum-web', 'scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup', 'governance.lineage'] },
  { name: 'Tester-GP-Onyx',    role: 'Physics + interaction realism',             avatar: '🛞', color: '#475569', kind: 'tester', models: [...REASON_MODELS, ...CODE_MODELS], teams: ['scrum-web'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup', 'codegraph.symbol'] },
  { name: 'Tester-GP-Iris',    role: 'Character animation · dialogue · NPC AI',   avatar: '🎭', color: '#f0abfc', kind: 'tester', models: [...CHAT_MODELS, ...REASON_MODELS], teams: ['scrum-web', 'scrum-roblox'], tools: ['scrum.bug', 'scrum.standup', 'forum.*', 'wiki.lookup', 'assets.search'] },

  // ─── Ultra-light data agents ────────────────────────────────────────────
  { name: 'Data-Steward',   role: 'Data Steward · schema & quality guard',     avatar: '🛡️', color: '#14b8a6', kind: 'specialist', models: [...CHAT_MODELS], teams: ['cross'], tools: ['governance.lineage', 'wiki.lookup'] },
  { name: 'Data-Engineer',  role: 'Data Engineer · ETL & feature pipelines',   avatar: '⚙️', color: '#f59e0b', kind: 'specialist', models: [...CODE_MODELS], teams: ['cross'], tools: ['codegraph.stats', 'governance.lineage'] },
  { name: 'Data-Analyst',   role: 'Data Analyst · summaries & visualizations', avatar: '📊', color: '#8b5cf6', kind: 'specialist', models: [...CHAT_MODELS, ...REASON_MODELS], teams: ['cross', 'scrum-marketing'], tools: ['governance.lineage', 'wiki.lookup'] },
  { name: 'Data-Scientist', role: 'Data Scientist · models & experiments',     avatar: '🔬', color: '#ec4899', kind: 'specialist', models: [...REASON_MODELS, ...CODE_MODELS], teams: ['cross'], tools: ['governance.lineage', 'wiki.lookup'] },
  { name: 'Data-Manager',   role: 'Data Manager · lineage & versioning',       avatar: '📁', color: '#64748b', kind: 'governance', models: [...CHAT_MODELS], teams: ['cross'], tools: ['governance.*', 'wiki.lookup'] },
];

/** Canonical list of agent names — use this everywhere you need to iterate. */
export const AGENT_NAMES: string[] = AGENT_META.map(a => a.name);

/** Lookup by name (returns undefined if missing). */
export function getAgent(name: string): AgentMeta | undefined {
  return AGENT_META.find(a => a.name === name);
}

/** roleMap compatibility: { Fill: 'CEO', Kai: 'CTO', ... } */
export const ROLE_MAP: { [name: string]: string } = Object.fromEntries(
  AGENT_META.map(a => [a.name, a.role])
);

/** avatarMap compatibility */
export const AVATAR_MAP: { [name: string]: string } = Object.fromEntries(
  AGENT_META.map(a => [a.name, a.avatar])
);

/** colorMap compatibility */
export const COLOR_MAP: { [name: string]: string } = Object.fromEntries(
  AGENT_META.map(a => [a.name, a.color])
);

/** Agent → preferred models for token tracker / routing */
export const AGENT_MODELS: { [name: string]: string[] } = Object.fromEntries(
  AGENT_META.map(a => [a.name, a.models])
);
