/**
 * Live Task Engine - agents actively progress through their tasks FOREVER.
 * When tasks complete, new ones are generated from each agent's task pool.
 * Tick rate: ~60-90s per subtask so progress is visible but not instant.
 *
 * State persists to /media/knight2/EDS2/virtualpc-state/task-state.json every
 * 30s so agent progress (especially Kai's GPU-heavy work) survives server
 * restarts instead of resetting to pool index 10.
 */

import logger from './utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { AGENT_NAMES, ROLE_MAP, AVATAR_MAP } from './agent-registry';

interface Subtask {
  name: string;
  done: boolean;
}

interface Task {
  id: string;
  title: string;
  status: 'completed' | 'in-progress' | 'pending';
  priority: 'critical' | 'high' | 'medium' | 'low';
  project: string;
  tags: string[];
  description: string;
  sprint: string;
  estimated_hours: number;
  progress: number;
  subtasks: Subtask[];
  assigned_to: string;
  started_at?: string;
  completed_at?: string;
  _tickRate: number;
  _lastTick: number;
}

type TaskTemplate = {
  title: string;
  priority: Task['priority'];
  description: string;
  estimated_hours: number;
  subtasks: string[];
  project?: string;
  tags?: string[];
};

// === TASK POOLS: infinite work per agent ===
// When an agent runs out, we pick the next from the pool and push it to tasks[]

const DEFAULT_PROJECT = 'VirtualPC platform';
const DEFAULT_PROJECT_TAG = 'project:virtualpc-platform';

function slugifyTag(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.replace(/^(project|priority|sprint|agent|role)-(.+)$/, '$1:$2');
}

function normalizeTags(tags: unknown, fallback: string[]): string[] {
  const raw = Array.isArray(tags) ? tags : [];
  const out = new Set<string>();
  for (const tag of [...raw, ...fallback]) {
    const normalized = slugifyTag(String(tag || ''));
    if (normalized) out.add(normalized);
  }
  return [...out];
}

function normalizeProject(value: unknown): string {
  const project = String(value || '').trim();
  return project || DEFAULT_PROJECT;
}

function defaultTaskTags(task: Partial<Task> & { assigned_to?: string; sprint?: string; priority?: Task['priority']; project?: string }): string[] {
  const project = normalizeProject(task.project);
  const projectSlug = slugifyTag(project) || 'virtualpc-platform';
  const role = ROLE_MAP[task.assigned_to || ''] || task.assigned_to || 'unassigned';
  return normalizeTags([], [
    project === DEFAULT_PROJECT ? DEFAULT_PROJECT_TAG : `project:${projectSlug}`,
    task.priority ? `priority:${task.priority}` : 'priority:medium',
    task.sprint ? `sprint:${task.sprint}` : 'sprint:backlog',
    task.assigned_to ? `agent:${task.assigned_to}` : 'agent:unassigned',
    `role:${role}`,
  ]);
}

function ensureTaskMetadata(task: Task): Task {
  task.project = normalizeProject((task as any).project);
  task.tags = normalizeTags((task as any).tags, defaultTaskTags(task));
  return task;
}

const taskPools: { [agent: string]: TaskTemplate[] } = {
  Fill: [
    { title: 'Quarterly OKR planning', priority: 'critical', description: 'Set platform-level OKRs for the next quarter. Translate them into per-agent task seed targets so the engine has a coherent direction.', estimated_hours: 5, subtasks: ['Review last quarter outcomes', 'Set 3 platform OKRs', 'Map OKRs to agents', 'Publish OKR document', 'Communicate to roster'] },
    { title: 'University & enterprise partnership outreach', priority: 'high', description: 'Identify partner organizations that could pilot VirtualPC for their own workflows. Draft proposals that highlight platform extensibility.', estimated_hours: 5, subtasks: ['Identify 5 candidate partners', 'Draft generic partnership proposal', 'Schedule pilot meetings', 'Track conversations in CRM'] },
    { title: 'Investor demo: platform overview', priority: 'high', description: 'Demo VirtualPC to prospective investors: agent roster, task engine, LLM routing, dashboards, auto-update path.', estimated_hours: 3, subtasks: ['Script walkthrough', 'Polish All-Agents page', 'Prepare scaling projections'] },
    { title: 'COPPA & GDPR compliance review', priority: 'high', description: 'Ensure VirtualPC deployments meet child data protection and EU privacy requirements out of the box.', estimated_hours: 6, subtasks: ['COPPA review', 'GDPR review', 'Data flow documentation', 'Compliance sign-off'] },
    { title: 'Risk assessment: agent autonomy escalation', priority: 'high', description: 'Evaluate risks of giving agents progressively more autonomous authority. Define guardrails, kill switches, escalation paths.', estimated_hours: 4, subtasks: ['Risk matrix', 'Kill-switch audit', 'Escalation playbook', 'Document mitigations'] },
    { title: 'Maintain important-files list + code review rotation', priority: 'high', description: 'Curate a list of critical files in the codebase. Perform primary review on changes touching them. Refresh quarterly.', estimated_hours: 5, subtasks: ['Seed important-files.md', 'PR label requirement', 'Weekly review pass', 'Quarterly list refresh', 'Publish review rubric'] },
    { title: 'Git versioning standards enforcement', priority: 'high', description: 'Ratify team-wide git standards: conventional commits, branch naming, mandatory PR review, no force-push on main.', estimated_hours: 4, subtasks: ['Conventional-commits rule', 'Branch-naming convention', 'Husky pre-commit hooks', 'commitlint config', 'Branch protection rules'] },
  ],
  Kai: [
    { title: 'Postgres / persistence tier for the task engine', priority: 'critical', description: 'Replace the in-memory task store with a Postgres-backed implementation. The mutators are isolated; redirect them at SQL.', estimated_hours: 10, subtasks: ['Schema design', 'Migration scripts', 'Repository layer', 'Tests against live DB', 'Cutover plan'] },
    { title: 'WebSocket activity stream', priority: 'high', description: 'Real-time WebSocket broadcast of task transitions and CLI lines. Replaces the polling fallback the dashboard currently uses.', estimated_hours: 6, subtasks: ['Socket.io rooms per agent', 'Emit on every status mutation', 'Client subscription API', 'Reconnection handling'] },
    { title: 'Mobile-responsive dashboard', priority: 'high', description: 'Audit dashboard.html and agents.html for foldable / phone breakpoints. Adaptive layout for small screens.', estimated_hours: 5, subtasks: ['Breakpoint audit', 'Sidebar collapse on mobile', 'Card grid responsive', 'Test on phone + tablet'] },
    { title: 'CI/CD pipeline', priority: 'high', description: 'GitHub Actions: lint, type-check, test, build, deploy preview. Block merges that fail any gate.', estimated_hours: 8, subtasks: ['ESLint config', 'Jest test runner', 'tsc --noEmit gate', 'Build artifact', 'Deploy-preview job', 'Branch protection'] },
    { title: 'Anti-abuse rate limiting', priority: 'critical', description: 'Server-side validation and rate limits on all public endpoints. Token bucket per IP, per session, per agent.', estimated_hours: 7, subtasks: ['Token-bucket middleware', 'Per-IP limit', 'Per-session limit', 'Anomaly alerts', 'Telemetry dashboard'] },
    { title: 'GPU symbiosis: dual RTX 3090', priority: 'critical', description: 'Allow VirtualPC, LM Studio, and other local GPU consumers to share both GPUs cooperatively. Yield when an interactive workload is active.', estimated_hours: 8, subtasks: ['nvidia-smi poll daemon', 'Evaluate MPS', 'Foreground-process detector', 'Yield policy', 'CUDA_VISIBLE_DEVICES rotation', 'Stress test'] },
    { title: 'Resource-utilization profiler + scheduler', priority: 'critical', description: 'Profile current core / RAM / GPU usage, then design a scheduler that saturates the box: batch analyst jobs, render queue across both 3090s, stream inference pinned to the less-loaded GPU.', estimated_hours: 10, subtasks: ['Baseline profiling', 'Scheduler design', 'NICE levels per agent', 'Live resource dashboard'] },
    { title: 'Analyst job queue on Dask', priority: 'high', description: 'Local Dask cluster so Analyst tasks fan out across all cores. cuDF/cuML on the less-loaded 3090 for GPU-bound work.', estimated_hours: 6, subtasks: ['LocalCluster bootstrap', 'Worker count = cpu - 2', 'GPU worker subset', 'Job submission API', 'Cleanup policy'] },
    { title: 'LM Studio agent-inference backend', priority: 'critical', description: 'Wire VirtualPC agent execution to the local LM Studio server. Per-agent model routing already exists in lmstudio.ts; verify failover paths and auto-reload behaviour.', estimated_hours: 6, subtasks: ['Streaming response handler', 'Token accounting', 'Fallback when model unloaded', 'Health check', 'Auto-reload integration'] },
  ],
  Zip: [
    { title: 'Task-detail panel: subtask checklist', priority: 'high', description: 'When you open a task in the agent detail panel, render its subtasks as a checklist with progress %. Subtasks already exist in the model; surface them.', estimated_hours: 5, subtasks: ['Read subtasks from getTaskDetail', 'Checklist component', 'Live progress %', 'Click to mark done', 'Persist to engine'] },
    { title: 'Agent inbox / outbox UI', priority: 'high', description: 'Surface /api/agents/:name/{inbox,outbox} in the detail panel. Threaded view of proposals between agents.', estimated_hours: 6, subtasks: ['Inbox tab in detail panel', 'Outbox tab', 'Threaded message renderer', 'Reply form', 'Wire send-proposal endpoint'] },
    { title: 'Search across tasks', priority: 'medium', description: 'Add a search box on the dashboard that filters tasks by title/description/agent. Client-side from /api/backlog.', estimated_hours: 4, subtasks: ['Search input UI', 'Client-side filter', 'Highlight matches', 'Empty state'] },
    { title: 'Bulk-edit tasks', priority: 'medium', description: 'Multi-select tasks in the agent detail panel and apply a status or priority change to all at once.', estimated_hours: 5, subtasks: ['Checkbox per row', 'Floating action bar', 'Bulk endpoint', 'Optimistic UI'] },
    { title: 'Task export: CSV + Markdown', priority: 'low', description: 'Export the current backlog or a single agent\'s tasks as CSV or as a Markdown report.', estimated_hours: 4, subtasks: ['CSV serializer', 'Markdown formatter', 'Download endpoint', 'UI button per agent'] },
    { title: 'Agent profile: live CLI stream', priority: 'high', description: 'Real-time WebSocket stream of an agent\'s exec commands tailed into the detail panel. ANSI-color renderer.', estimated_hours: 6, subtasks: ['CLI session recorder', 'WebSocket bridge', 'ANSI color renderer', 'Pause / scroll-back', 'Per-agent room'] },
    { title: 'In-chat auto-translation', priority: 'medium', description: 'Detect source language of incoming messages, translate inline to the viewer\'s preferred language, toggle to show original. Powered by local Gemma.', estimated_hours: 6, subtasks: ['Language auto-detect', 'Inline translated bubble', '"Show original" toggle', 'Per-user language pref', 'Cache translations'] },
  ],
  Mira: [
    { title: 'Design system v2', priority: 'high', description: 'Codify the dashboard\'s ad-hoc tokens (colors, spacing, type scale, motion) into a single design system referenced from a CSS custom-properties file.', estimated_hours: 8, subtasks: ['Audit current tokens', 'Define scales', 'Refactor dashboard.html', 'Refactor agents.html', 'Token reference doc'] },
    { title: 'Empty-state illustrations', priority: 'medium', description: 'Hand-drawn SVGs for empty states across the dashboard (no tasks, no recent activity, no proposals). Friendly tone.', estimated_hours: 5, subtasks: ['No-tasks SVG', 'No-activity SVG', 'No-proposals SVG', 'Network-down SVG', 'Wire into pages'] },
    { title: 'Onboarding tour', priority: 'medium', description: 'First-time-visitor tour: highlight sidebar, agent grid, ask-agent form, github docs panel. Dismissable, never auto-replays.', estimated_hours: 5, subtasks: ['Tour sequence design', 'Step renderer', 'Dismiss persistence', 'Replay control'] },
    { title: 'Agent avatar refresh', priority: 'low', description: 'Replace the emoji avatars with consistent illustrated portraits per agent. Lightweight SVG, themeable.', estimated_hours: 8, subtasks: ['14 portraits', 'Color theming', 'Drop into agent-registry', 'Update modal renderer'] },
    { title: 'Accessibility audit', priority: 'high', description: 'Run axe-core against every dashboard page. Fix contrast, ARIA, keyboard navigation, focus management.', estimated_hours: 6, subtasks: ['axe-core scan', 'Fix top 10 issues', 'Keyboard nav pass', 'Screen-reader walkthrough', 'Document patterns'] },
    { title: 'Status badge style guide', priority: 'low', description: 'Pin the visual language for status / priority / kind badges. Single source of CSS classes used everywhere.', estimated_hours: 3, subtasks: ['Badge palette', 'CSS classes', 'Refactor inline styles', 'Document'] },
    { title: 'Dark-mode polish', priority: 'medium', description: 'The dashboard is dark-only. Audit every page for the few spots where light text on light background still slips through.', estimated_hours: 4, subtasks: ['Page-by-page audit', 'Fix issues', 'Contrast verification', 'Snapshot tests'] },
  ],
  Luna: [
    { title: 'Frontend bundle size', priority: 'high', description: 'The dashboard ships ~50 KB of inline CSS+JS per page. Audit, dedupe, extract shared bundles, set up long-cache for static.', estimated_hours: 6, subtasks: ['Bundle analyzer', 'Extract shared CSS', 'Extract shared JS helpers', 'Cache headers', 'Measure improvement'] },
    { title: 'Asset pipeline: build-time minification', priority: 'medium', description: 'Set up a tiny build step that minifies the static HTML/CSS/JS in public/ on `npm run build`, without breaking the live-edit fast-path.', estimated_hours: 5, subtasks: ['Pick minifier', 'Build script', 'Source-map preservation', 'CI integration', 'Document escape hatch'] },
    { title: 'GPU vitals dashboard', priority: 'high', description: 'Live GPU utilization, memory pressure, model-loaded state per GPU. Polls /api/vitals.', estimated_hours: 6, subtasks: ['Per-GPU card', 'Sparkline chart', 'Threshold alerts', 'Model-loaded indicator', 'Auto-refresh'] },
    { title: 'Animation polish', priority: 'low', description: 'Audit all transitions on the dashboard. Hover, modal open/close, status change. Cull anything jittery.', estimated_hours: 4, subtasks: ['Transition audit', 'Easing curves', 'Reduced-motion support', 'Snapshot tests'] },
    { title: 'Live-update flicker reduction', priority: 'medium', description: 'The 15s overview refresh repaints the whole grid. Diff and update only changed cards instead.', estimated_hours: 4, subtasks: ['Card-keyed diff', 'In-place update', 'Verify no leak', 'Performance check'] },
    { title: 'Lighthouse target: 95+', priority: 'medium', description: 'Run Lighthouse on /, /agents.html, /vitals.html. Fix until performance/accessibility/best-practices/SEO each clear 95.', estimated_hours: 6, subtasks: ['Baseline scores', 'Performance fixes', 'A11y fixes', 'SEO meta tags', 'Document'] },
  ],
  Cleopatra: [
    { title: 'Strategic decision audit', priority: 'high', description: 'Audit the last sprint\'s critical-priority completions. Were they aligned with platform OKRs? Any scope creep? Deliver a dispassionate review.', estimated_hours: 4, subtasks: ['List critical completions', 'Map to OKR', 'Identify scope creep', 'Recommend adjustments', 'Publish audit'] },
    { title: 'Authority charter v2', priority: 'high', description: 'Refresh the executive authority charter. Decision rights between Cleopatra and Fill, escalation triggers, audit trail requirements.', estimated_hours: 5, subtasks: ['Read existing charter', 'Identify ambiguities', 'Redraft', 'Sign-off process', 'Publish to .governance'] },
    { title: 'Dual-sign-off workflow', priority: 'medium', description: 'Implement a simple dual-sign-off mechanism for proposals tagged `requires-executive`. Cleopatra and Fill must both approve.', estimated_hours: 6, subtasks: ['Tag schema', 'Approval UI', 'Notification on tag', 'Audit log entry', 'Test workflow'] },
    { title: 'Ratify quarterly OKRs', priority: 'high', description: 'Co-sign the Fill-drafted quarterly OKRs. Provide independent assessment of feasibility and alignment.', estimated_hours: 3, subtasks: ['Read draft OKRs', 'Independent assessment', 'Negotiate adjustments', 'Sign-off'] },
    { title: 'Executive escalation review', priority: 'medium', description: 'Weekly review of items escalated to executive level. Resolve, route, or defer with rationale.', estimated_hours: 3, subtasks: ['List escalations', 'Decide each', 'Document rationale', 'Communicate decisions'] },
  ],
  Alexander: [
    { title: 'Architecture review: persistence migration', priority: 'high', description: 'Independent review of the Kai-led migration from in-memory to Postgres. Identify risks, alternatives, sign-off conditions.', estimated_hours: 5, subtasks: ['Read proposal', 'Risk analysis', 'Alternative architectures', 'Sign-off conditions', 'Publish review'] },
    { title: 'Standards: TypeScript strict mode audit', priority: 'medium', description: 'Audit every file under src/ for strict-mode violations. Enable noUnusedLocals + noImplicitAny progressively.', estimated_hours: 6, subtasks: ['Audit current state', 'Triage violations', 'Fix or annotate', 'Enable flags', 'Document patterns'] },
    { title: 'Code-review rotation policy', priority: 'medium', description: 'Define when reviews escalate to Alexander vs stop at Kai/Zip. Document trigger phrases (security, persistence, auth).', estimated_hours: 3, subtasks: ['Trigger criteria', 'Escalation form', 'Review SLA', 'Publish policy'] },
    { title: 'Principles doc refresh', priority: 'low', description: 'Refresh ALEXANDER-PRINCIPLES.md to match current platform reality. Move project-specific examples out.', estimated_hours: 3, subtasks: ['Read existing', 'Identify dated bits', 'Rewrite principles', 'Generic examples', 'Publish'] },
    { title: 'Geek-mode approval rubric', priority: 'low', description: 'Codify the "Alexander always picks the most technically interesting path" heuristic so it can be applied programmatically when he\'s offline.', estimated_hours: 4, subtasks: ['Heuristic encoding', 'Automation hook', 'Test against history', 'Document'] },
  ],
  MoneyGod: [
    { title: 'Cost dashboard: per-agent + per-model', priority: 'high', description: 'Surface daily / weekly cost roll-up per agent and per model from the existing token-tracker. Surface trend deltas.', estimated_hours: 5, subtasks: ['Aggregation queries', 'Dashboard card', 'Trend deltas', 'Wire to /api/cost', 'Test'] },
    { title: 'Budget caps + auto-throttle', priority: 'critical', description: 'Hard daily / monthly budget caps that auto-route agents to cheaper models when the cap is approached.', estimated_hours: 6, subtasks: ['Cap config', 'Live spend tracker', 'Auto-route logic', 'Alert hooks', 'Test breach scenarios'] },
    { title: 'Anti-farm enforcement on shared resources', priority: 'high', description: 'Detect agents that hog inference time or compute. Throttle, rate-limit, escalate.', estimated_hours: 5, subtasks: ['Hog detection', 'Throttle policy', 'Escalation', 'Audit log', 'Dashboard tile'] },
    { title: 'Stripe customer record + audit-trail', priority: 'high', description: 'Stand up the financial customer record and audit trail required before any real-money flows engage.', estimated_hours: 6, subtasks: ['Stripe record schema', 'Audit log requirements', 'Sign-off checklist', 'Document'] },
    { title: 'Quarterly budget reconciliation', priority: 'medium', description: 'Reconcile predicted vs actual spend per category per quarter. Identify drift drivers.', estimated_hours: 4, subtasks: ['Pull spend data', 'Compare to budget', 'Drift analysis', 'Recommendations', 'Publish'] },
  ],
  Analyst: [
    { title: 'Cohort analysis: agent task throughput', priority: 'high', description: 'Cohort agents by completion velocity over time. Surface stalls, accelerations, and what changed.', estimated_hours: 5, subtasks: ['Cohort definition', 'Throughput metric', 'Change-point detection', 'Narrative report', 'Dashboard widget'] },
    { title: 'A/B test framework', priority: 'high', description: 'Lightweight A/B test infrastructure: variant assignment, conversion tracking, automatic stat-sig calc.', estimated_hours: 8, subtasks: ['Variant assignment service', 'Event collection', 'Stat-sig calc', 'Dashboard view', 'Documentation'] },
    { title: 'Forecast: agent capacity vs backlog', priority: 'medium', description: 'Monte-Carlo forecast of when the current backlog clears at observed velocity. Confidence intervals per agent.', estimated_hours: 6, subtasks: ['Velocity histogram', 'Monte-Carlo simulation', 'Per-agent intervals', 'Dashboard widget', 'Auto-refresh'] },
    { title: 'Time-series anomaly detection', priority: 'high', description: 'Detect unusual patterns in CLI activity, completion rate, latency. Tag and surface to operators.', estimated_hours: 7, subtasks: ['Anomaly model selection', 'Per-metric thresholds', 'Alert routing', 'Dashboard surface', 'Tuning'] },
    { title: 'Quality-of-output scoring', priority: 'medium', description: 'Sample artifacts produced by agents, score them with a rubric, surface aggregate quality scores per agent.', estimated_hours: 6, subtasks: ['Rubric design', 'Sampling logic', 'Scoring pass', 'Aggregation', 'Display'] },
  ],
  VideoProducer: [
    { title: 'Platform overview trailer (90s)', priority: 'high', description: 'Cinematic 90-second trailer showing VirtualPC dashboard, agent flow, Ask-Agent in action, GitHub docs viewer. Voice-over + screen capture.', estimated_hours: 8, subtasks: ['Storyboard', 'Screen captures', 'Voice-over script', 'Music + SFX', 'Edit + color', 'Export'] },
    { title: 'Onboarding screencast series', priority: 'medium', description: 'Five 60-second screencasts: install, smoke-test, add an agent, manage tasks, integrate gh proxy.', estimated_hours: 10, subtasks: ['5 scripts', 'Captures', 'Edits', 'Captions', 'Publish'] },
    { title: 'Investor reel: 2-minute platform pitch', priority: 'high', description: 'Tight 2-minute reel framing VirtualPC as a horizontal platform. Screencaps + animated diagrams + live agent footage.', estimated_hours: 10, subtasks: ['Pitch script', 'Diagrams', 'Captures', 'Edit', 'Color', 'Sound mix'] },
    { title: 'Live demo recording rig', priority: 'medium', description: 'Set up the dual-3090 box for clean live demo recording: framerate-locked OBS, quality presets, audio routing.', estimated_hours: 5, subtasks: ['OBS scenes', 'NVENC encoder', 'Audio routing', 'Test recording', 'Document'] },
    { title: 'Per-agent intro shorts', priority: 'low', description: '30-second intro short for each of the 14 agents. Shows their persona, role, color theme. Generated from the Gemma-drafted prompts.', estimated_hours: 14, subtasks: ['Template design', '14 scripts', 'Voice-over', 'Animate', 'Export', 'Wire into agent cards'] },
  ],
  Vice: [
    { title: 'Reference systems study: notable agent platforms', priority: 'high', description: 'Survey 5 notable autonomous-agent platforms (open + closed). Document UX patterns, governance models, and what VirtualPC could borrow.', estimated_hours: 8, subtasks: ['Identify 5 systems', 'UX teardowns', 'Governance teardowns', 'Borrow-or-skip recommendations', 'Publish'] },
    { title: 'User-research interviews: 5 operators', priority: 'high', description: 'Interview 5 people who would actually run VirtualPC for their own teams. Synthesize the top 3 unmet needs.', estimated_hours: 8, subtasks: ['Recruit 5', 'Interview script', 'Conduct interviews', 'Synthesize', 'Top-3 unmet needs'] },
    { title: 'Density / scale design study', priority: 'medium', description: 'Study how the dashboard scales from 14 agents to 100+. Density patterns, search, summarization, drill-down.', estimated_hours: 6, subtasks: ['Density mockups', 'Search prototype', 'Summarization patterns', 'Drill-down flow', 'Recommendations'] },
    { title: 'Competitive landscape brief', priority: 'medium', description: 'One-page brief on competing agent platforms. Position VirtualPC against them.', estimated_hours: 4, subtasks: ['Identify competitors', 'Feature matrix', 'Positioning statement', 'Publish'] },
  ],
  Atlas: [
    { title: 'Latency audit: agent → LLM → response', priority: 'high', description: 'End-to-end latency profiling of an Ask-Agent round-trip. Identify slowest hop, propose three improvements.', estimated_hours: 5, subtasks: ['Instrument hops', 'Capture profile', 'Identify hot path', 'Propose 3 fixes', 'Document'] },
    { title: 'Realism rubric for agent personas', priority: 'medium', description: 'Define a rubric for assessing whether a Gemma-drafted persona "feels" like the role. Score the current 14, recommend regen for the bottom 3.', estimated_hours: 5, subtasks: ['Rubric design', 'Score 14 personas', 'Identify weak ones', 'Recommend regen', 'Publish'] },
    { title: 'WebGPU-ready dashboard pipeline', priority: 'low', description: 'Prototype a WebGPU-rendered visualization of agent activity. Optional shiny path that doesn\'t replace the canvas-only fallback.', estimated_hours: 8, subtasks: ['WebGPU shell', 'Visualization', 'Canvas fallback', 'Browser support matrix', 'Decision'] },
    { title: 'Audit: simulation fidelity of agent behaviors', priority: 'medium', description: 'Compare what the agents actually do vs what their persona claims. Flag drift; recommend prompt tweaks.', estimated_hours: 5, subtasks: ['Sample interactions', 'Compare to persona', 'Drift report', 'Prompt tweaks', 'Document'] },
  ],
  Kimi: [
    { title: 'Codebase synthesis: full-tree summary', priority: 'high', description: 'Single long-context pass over the entire src/ tree. Output a 5-page architectural narrative covering coupling, dead code, and surprising patterns.', estimated_hours: 6, subtasks: ['Full-tree ingest', 'Module narrative', 'Coupling map', 'Dead-code list', 'Publish'] },
    { title: 'Cross-file inconsistency hunt', priority: 'high', description: 'Long-context audit for things that drift across files: status enums, role names, route paths, type aliases. Single source of truth proposal.', estimated_hours: 6, subtasks: ['Enumerate drift candidates', 'Cross-file scan', 'Propose canonical sources', 'Refactor plan', 'Publish'] },
    { title: 'Doc audit: what\'s stale', priority: 'medium', description: 'Read every md in docs/ and the top-of-repo README. Flag claims that the code no longer supports.', estimated_hours: 4, subtasks: ['Doc inventory', 'Per-doc audit', 'Stale claims list', 'Fix-or-delete recommendations', 'Publish'] },
    { title: 'Knowledge-graph build from .governance docs', priority: 'medium', description: 'Pass every .governance / .creative / .operations doc through a single long-context call to extract a knowledge graph of agent authority + relationships.', estimated_hours: 6, subtasks: ['Ingest docs', 'Extract entities', 'Extract relations', 'Render graph', 'Publish'] },
    { title: 'Onboarding generator', priority: 'low', description: 'Generate a personalized 1-page onboarding doc for any operator role from the full codebase context. Driven by a small role descriptor.', estimated_hours: 5, subtasks: ['Role descriptor schema', 'Generation prompt', 'Quality pass', 'Save artifacts', 'Document'] },
  ],
  Croesus: [
    { title: 'Promotion-portfolio model v2', priority: 'high', description: 'Refresh the predicted-ROI model used to file promotion proposals. Calibrate against observed outcomes from prior dryruns.', estimated_hours: 6, subtasks: ['Pull prior outcomes', 'Calibrate model', 'Cross-validate', 'Document', 'Roll out'] },
    { title: 'Channel mix analysis', priority: 'medium', description: 'Compare predicted ROI across channels (social ads, sponsored placements, community boosts). Recommend a default mix.', estimated_hours: 5, subtasks: ['Channel data pull', 'Predicted-ROI per channel', 'Mix recommendation', 'Risk caveats', 'Publish'] },
    { title: 'Per-proposal cap audit', priority: 'medium', description: 'Verify the existing per-proposal $5 / per-day $20 caps are being honored across all simulated runs. Find and fix any path that bypasses.', estimated_hours: 4, subtasks: ['Audit code paths', 'Find bypasses', 'Fix', 'Add tests', 'Document'] },
    { title: 'Real-money gate review', priority: 'critical', description: 'Before flipping PROMO_REAL_MONEY=1, document Stripe customer-record setup, audit-log requirements, and Cleopatra\'s sign-off conditions. No spend until this exists.', estimated_hours: 6, subtasks: ['Stripe customer ref design', 'Audit-log requirements', 'Cleopatra sign-off conditions', 'Document checklist'] },
    { title: 'Daily portfolio rebalance', priority: 'medium', description: 'Each morning: review yesterday\'s executed proposals, measure observed vs predicted ROI, adjust the model, file new proposals within the day\'s remaining cap.', estimated_hours: 3, subtasks: ['Pull executed', 'Compute observed vs predicted', 'Adjust prior', 'Identify candidates', 'File within cap'] },
  ],
};

function defaultTaskPoolFor(agent: string): TaskTemplate[] {
  const role = ROLE_MAP[agent] || agent;

  if (agent === 'Governor') {
    return [
      { title: 'Knowledge graph lineage audit', priority: 'high', description: 'Audit recently ingested VirtualPC and Alexander knowledge chunks for owner, source, and freshness metadata.', estimated_hours: 4, subtasks: ['Sample corpus chunks', 'Check source labels', 'Flag stale entries', 'Publish lineage notes'] },
      { title: 'Wiki gap triage', priority: 'high', description: 'Find concepts that appear in corpus search but lack a canonical wiki/governance node.', estimated_hours: 4, subtasks: ['Run corpus searches', 'Compare wiki nodes', 'Draft missing entries', 'Queue review'] },
      { title: 'Graph policy consistency pass', priority: 'medium', description: 'Check governance and corpus records for conflicting ownership, status, or review-gate language.', estimated_hours: 3, subtasks: ['List policy nodes', 'Compare claims', 'Resolve duplicates', 'Document decisions'] },
      { title: 'Agent-access ACL review', priority: 'medium', description: 'Verify each registered agent has the right MCP tool access for its role and no unnecessary write surface.', estimated_hours: 3, subtasks: ['Read roster ACLs', 'Map tools to roles', 'Flag excess access', 'Publish diff'] },
    ];
  }

  if (agent === 'Pixel') {
    return [
      { title: 'Knowledge search UX pass', priority: 'high', description: 'Improve the dashboard flow that agents use to inspect corpus, wiki, and codegraph evidence.', estimated_hours: 5, subtasks: ['Trace search routes', 'Design result states', 'Add source badges', 'Verify mobile layout'] },
      { title: 'Wiki graph inspector', priority: 'high', description: 'Build a compact inspector for wiki/governance nodes with linked corpus evidence.', estimated_hours: 6, subtasks: ['Define data shape', 'Render node detail', 'Link evidence', 'Add empty states'] },
      { title: 'Agent blocker panel', priority: 'high', description: 'Surface blocked, stale, and placeholder tasks clearly so operators can intervene before queues drift.', estimated_hours: 5, subtasks: ['Read guardrails health', 'Read backlog state', 'Design panel', 'Wire refresh'] },
      { title: 'Corpus source filter polish', priority: 'medium', description: 'Make source-kind and source-prefix filtering ergonomic for large local knowledge graphs.', estimated_hours: 4, subtasks: ['Audit filters', 'Add presets', 'Preserve query state', 'Test results'] },
    ];
  }

  if (agent === 'Athena') {
    return [
      { title: 'Review gate evidence audit', priority: 'critical', description: 'Review whether accepted work includes unit, regression, build, and knowledge-source evidence before approval.', estimated_hours: 5, subtasks: ['Collect branch evidence', 'Check standards', 'Run targeted tests', 'Write verdict'] },
      { title: 'Coding standards enforcement pass', priority: 'high', description: 'Sample recent changes against CODING-STANDARDS and file actionable corrections.', estimated_hours: 4, subtasks: ['Read changed files', 'Check standards', 'Identify risks', 'Publish review notes'] },
      { title: 'Competing branch review rehearsal', priority: 'high', description: 'Dry-run the two-branch review pipeline and verify the winning-branch criteria are objective.', estimated_hours: 4, subtasks: ['Select sample item', 'Score alternatives', 'Compare evidence', 'Record rubric update'] },
      { title: 'Knowledge-backed review checklist', priority: 'medium', description: 'Update the review checklist so each architectural claim links to corpus, codegraph, or wiki evidence.', estimated_hours: 3, subtasks: ['Audit checklist', 'Add graph lookup prompts', 'Test on sample PR', 'Publish revision'] },
    ];
  }

  if (agent.startsWith('Hermes-')) {
    return [
      { title: `${agent}: standup blocker sweep`, priority: 'high', description: `${role} sweeps the team queue for blocked or stale tasks and routes each item to an owner.`, estimated_hours: 3, subtasks: ['Read team backlog', 'Identify blockers', 'Assign owner', 'Publish standup'] },
      { title: `${agent}: knowledge evidence check`, priority: 'high', description: 'Verify active team work cites current corpus/wiki/codegraph evidence before implementation continues.', estimated_hours: 3, subtasks: ['Query corpus', 'Query wiki', 'Attach evidence', 'Escalate gaps'] },
      { title: `${agent}: review handoff prep`, priority: 'medium', description: 'Package completed team work so Athena can review without chasing missing context.', estimated_hours: 3, subtasks: ['Collect test output', 'Collect diff summary', 'Collect risk notes', 'Send handoff'] },
      { title: `${agent}: retro action tracking`, priority: 'medium', description: 'Turn retrospective findings into concrete follow-up tasks with owners and due dates.', estimated_hours: 2, subtasks: ['Read retro notes', 'Extract actions', 'Assign owners', 'Update backlog'] },
    ];
  }

  if (agent.startsWith('Tester-')) {
    return [
      { title: `${agent}: scenario playtest`, priority: 'high', description: `${role} runs a role-specific playtest and records reproducible findings.`, estimated_hours: 3, subtasks: ['Pick scenario', 'Run playtest', 'Capture issue', 'File bug'] },
      { title: `${agent}: regression repro pass`, priority: 'high', description: 'Re-run recently fixed issues and verify they stay fixed on the current build.', estimated_hours: 3, subtasks: ['Select fixed issue', 'Reproduce old path', 'Verify current behavior', 'Report result'] },
      { title: `${agent}: knowledge freshness check`, priority: 'medium', description: 'Check whether player-facing or curriculum-facing behavior matches the latest knowledge graph documentation.', estimated_hours: 2, subtasks: ['Read relevant wiki', 'Compare gameplay', 'Flag mismatch', 'Suggest update'] },
      { title: `${agent}: friction note`, priority: 'medium', description: 'Write one concise friction note with expected behavior, actual behavior, and impact.', estimated_hours: 2, subtasks: ['Observe friction', 'Write expected/actual', 'Rate severity', 'Post to forum'] },
    ];
  }

  return [
    { title: `${agent}: role backlog refinement`, priority: 'medium', description: `${role} refines its active backlog into evidence-backed, testable work items.`, estimated_hours: 3, subtasks: ['Read current context', 'Query knowledge graph', 'Draft tasks', 'Publish handoff'] },
    { title: `${agent}: blocker scan`, priority: 'high', description: `${role} checks for blocked dependencies and routes them to the right owner.`, estimated_hours: 2, subtasks: ['Read active tasks', 'Find stale items', 'Assign owner', 'Record status'] },
    { title: `${agent}: graph evidence update`, priority: 'medium', description: `${role} contributes missing source links or freshness notes to the shared knowledge graph.`, estimated_hours: 2, subtasks: ['Find missing evidence', 'Collect source', 'Draft update', 'Queue review'] },
  ];
}

// Track which pool index each agent is at
// Start at index 10 so the newly-added tasks (from the 2026-04-23 chat backlog:
// Cleopatra/MoneyGod, GPU symbiosis, RTS factory, agent social profiles, testplay,
// Gemma chat, 3D equipment alignment, timeseries analysis, etc.) seed first.
const poolIndex: { [agent: string]: number } = { Fill: 10, Kai: 10, Zip: 10, Mira: 10, Luna: 10, Cleopatra: 0, Alexander: 0, MoneyGod: 0, Analyst: 0, VideoProducer: 0, Vice: 0, Atlas: 0, Kimi: 0, Croesus: 0 };
let taskIdCounter = 100;
let sprintCounter = 1;

function nextTaskId(): string {
  return `task-${++taskIdCounter}`;
}

function currentSprint(): string {
  return `sprint-${sprintCounter}`;
}

function makeSubtasks(names: string[]): Subtask[] {
  return names.map(n => ({ name: n, done: false }));
}

// Tick rate range: 60-90 seconds per subtask completion
function randomTickRate(): number {
  return 60000 + Math.floor(Math.random() * 30000);
}

/** Generate a new task for an agent from their pool */
function generateTask(agent: string): Task {
  // Registered agents without bespoke pools get role-aware default work instead
  // of placeholder "define task pool" tasks.
  if (!taskPools[agent]) taskPools[agent] = defaultTaskPoolFor(agent);
  if (poolIndex[agent] === undefined) poolIndex[agent] = 0;
  const pool = taskPools[agent].length > 0 ? taskPools[agent] : defaultTaskPoolFor(agent);
  if (pool.length === 0) {
    return {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${agent}: blocker scan`,
      status: 'pending',
      priority: 'medium',
      project: DEFAULT_PROJECT,
      tags: defaultTaskTags({ assigned_to: agent, priority: 'medium', sprint: `sprint-${sprintCounter}`, project: DEFAULT_PROJECT }),
      description: `${agent} checks its queue for stale work and records the next owner.`,
      sprint: `sprint-${sprintCounter}`,
      estimated_hours: 1,
      progress: 0,
      subtasks: [{ name: 'Scan queue', done: false }, { name: 'Record owner', done: false }],
      assigned_to: agent,
      _tickRate: 90_000,
      _lastTick: 0,
    };
  }
  const idx = poolIndex[agent] % pool.length;
  poolIndex[agent]++;

  // After cycling through the pool once, increment sprint
  if (poolIndex[agent] > 0 && poolIndex[agent] % pool.length === 0) {
    sprintCounter++;
  }

  const template = pool[idx];
  return {
    id: nextTaskId(),
    title: template.title,
    status: 'pending',
    priority: template.priority,
    project: normalizeProject(template.project),
    tags: normalizeTags(template.tags, defaultTaskTags({ assigned_to: agent, priority: template.priority, sprint: currentSprint(), project: template.project })),
    description: template.description,
    sprint: currentSprint(),
    estimated_hours: template.estimated_hours,
    progress: 0,
    subtasks: makeSubtasks(template.subtasks),
    assigned_to: agent,
    _tickRate: randomTickRate(),
    _lastTick: Date.now(),
  };
}

// === INITIAL TASKS ===
const tasks: Task[] = [];

// === PERSISTENCE ===
// State is saved to EDS2 so restarts don't reset Kai's (or anyone's) progress.
// Survives server restarts, TypeScript rebuilds, and hook-triggered restarts.

const STATE_DIR = process.env.VIRTUALPC_STATE_DIR || '/media/knight2/EDS2/virtualpc-state';
const STATE_PATH = path.join(STATE_DIR, 'task-state.json');
const MAX_COMPLETED_TASKS_PER_AGENT = Math.max(3, parseInt(process.env.MAX_COMPLETED_TASKS_PER_AGENT || '12', 10) || 12);
let dirty = false;

interface PersistedState {
  version: 1;
  savedAt: string;
  tasks: Task[];
  poolIndex: { [agent: string]: number };
  sprintCounter: number;
  taskIdCounter: number;
  workLog: WorkLogEntry[];
}

// Forward declaration — WorkLogEntry is defined later in the file
interface WorkLogEntry {
  timestamp: string;
  agent: string;
  role: string;
  taskId: string;
  taskTitle: string;
  subtask: string;
  action: 'subtask_completed' | 'task_started' | 'task_completed';
  minutesSpent: number;
  project: string;
  registeredFor: string;
}

function compactTaskHistory(items: Task[]): { tasks: Task[]; dropped: number } {
  const keep = new Set<Task>();
  const completedSeen = new Map<string, number>();

  for (let i = items.length - 1; i >= 0; i--) {
    const task = items[i];
    if (isPlaceholderTask(task)) continue;

    if (task.status !== 'completed') {
      keep.add(task);
      continue;
    }

    const agent = task.assigned_to || 'unknown';
    const count = completedSeen.get(agent) || 0;
    if (count < MAX_COMPLETED_TASKS_PER_AGENT) keep.add(task);
    completedSeen.set(agent, count + 1);
  }

  const compacted = items.filter(task => keep.has(task));
  return { tasks: compacted, dropped: items.length - compacted.length };
}

function isPlaceholderTask(task: Task): boolean {
  return /: define task pool$/.test(task.title)
    || task.description.includes('has no taskPool entries')
    || task.subtasks.some(s => s.name === 'Add task pool entries');
}

function compactTasksInPlace(reason: string): number {
  const { tasks: compacted, dropped } = compactTaskHistory(tasks);
  if (dropped > 0) {
    tasks.splice(0, tasks.length, ...compacted);
    logger.info(`task-engine: compacted ${dropped} completed historical tasks (${reason}); kept ${tasks.length}`);
  }
  return dropped;
}

function saveState() {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    compactTasksInPlace('pre-save');
    const snapshot: PersistedState = {
      version: 1,
      savedAt: new Date().toISOString(),
      tasks,
      poolIndex,
      sprintCounter,
      taskIdCounter,
      workLog: (typeof workLog !== 'undefined') ? workLog : [],
    };
    const tmp = STATE_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(snapshot));
    fs.renameSync(tmp, STATE_PATH);
    dirty = false;
  } catch (e: any) {
    logger.warn(`task-engine saveState failed: ${e.message}`);
  }
}

function loadState(): boolean {
  try {
    if (!fs.existsSync(STATE_PATH)) return false;
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const snap = JSON.parse(raw) as PersistedState;
    if (snap.version !== 1 || !Array.isArray(snap.tasks)) {
      logger.warn('task-engine: state file incompatible, ignoring');
      return false;
    }
    tasks.length = 0;
    const compacted = compactTaskHistory(snap.tasks);
    let migratedMetadata = false;
    for (const t of compacted.tasks) {
      // Reset _lastTick so restored in-progress tasks don't all fire on the first tick
      t._lastTick = Date.now();
      const before = JSON.stringify({ project: (t as any).project, tags: (t as any).tags });
      const normalized = ensureTaskMetadata(t);
      const after = JSON.stringify({ project: normalized.project, tags: normalized.tags });
      if (before !== after) migratedMetadata = true;
      tasks.push(normalized);
    }
    Object.assign(poolIndex, snap.poolIndex || {});
    sprintCounter = snap.sprintCounter || 1;
    taskIdCounter = snap.taskIdCounter || 100;
    // workLog is populated later in the file; we stash the loaded entries here
    // and replay them into workLog once it's defined.
    (globalThis as any).__virtualpcPersistedWorkLog = snap.workLog || [];
    logger.info(`task-engine: restored ${tasks.length} tasks, sprint ${sprintCounter}, ${snap.workLog?.length || 0} work-log entries from ${STATE_PATH}`);
    if (compacted.dropped > 0) {
      logger.info(`task-engine: dropped ${compacted.dropped} old completed tasks during restore (kept last ${MAX_COMPLETED_TASKS_PER_AGENT}/agent)`);
      dirty = true;
    }
    if (migratedMetadata) dirty = true;
    return true;
  } catch (e: any) {
    logger.warn(`task-engine loadState failed: ${e.message}`);
    return false;
  }
}

function seedInitialTasks() {
  const agents = AGENT_NAMES;
  for (const agent of agents) {
    // 2 in-progress + 2 pending per agent
    for (let i = 0; i < 4; i++) {
      const task = generateTask(agent);
      if (i < 2) {
        task.status = 'in-progress';
        task.started_at = new Date(Date.now() - Math.random() * 3600000).toISOString();
        // Give first tasks some initial progress
        const doneCount = Math.floor(Math.random() * (task.subtasks.length - 1));
        for (let j = 0; j < doneCount; j++) {
          task.subtasks[j].done = true;
        }
        task.progress = task.subtasks.length > 0 ? Math.round((doneCount / task.subtasks.length) * 100) : 0;
      }
      tasks.push(task);
    }
  }
}

// Restore from disk if available; otherwise seed fresh.
// If restored, also ensure every currently-active agent has at least 4 tasks
// (covers the case where a new agent was added after the state file was saved).
if (loadState()) {
  const currentAgents = AGENT_NAMES;
  for (const agent of currentAgents) {
    const agentTasks = tasks.filter(t => t.assigned_to === agent && (t.status === 'in-progress' || t.status === 'pending'));
    if (agentTasks.length < 4) {
      // Seed the gap
      const gap = 4 - agentTasks.length;
      const currentIP = agentTasks.filter(t => t.status === 'in-progress').length;
      for (let i = 0; i < gap; i++) {
        const task = generateTask(agent);
        if (currentIP + i < 2) {
          task.status = 'in-progress';
          task.started_at = new Date().toISOString();
        }
        tasks.push(task);
      }
      logger.info(`task-engine: backfilled ${gap} tasks for newly-added agent ${agent}`);
    }
  }
} else {
  seedInitialTasks();
}

// === GAME DEVELOPMENT MILESTONES (driven by completed tasks) ===
export interface GameMilestone {
  id: string;
  name: string;
  description: string;
  category: 'zone' | 'system' | 'infrastructure' | 'art' | 'optimization';
  progress: number; // 0-100
  status: 'not-started' | 'in-progress' | 'completed';
  contributors: string[];
}

const gameMilestones: GameMilestone[] = [
  // Platform milestones — generic, project-agnostic. Replace with your own
  // milestone set per deployment by editing src/task-engine.ts.
  { id: 'gm-1', name: 'Persistence tier', description: 'Replace the in-memory task store with a Postgres-backed implementation while keeping the public API stable.', category: 'system', progress: 0, status: 'not-started', contributors: ['Kai', 'Zip'] },
  { id: 'gm-2', name: 'Real-time activity stream', description: 'WebSocket broadcast of task transitions and CLI lines to replace the dashboard\'s polling fallback.', category: 'system', progress: 0, status: 'not-started', contributors: ['Kai'] },
  { id: 'gm-3', name: 'Cost dashboard', description: 'Daily / weekly cost roll-up per agent and per model, with auto-throttle when budget caps approach.', category: 'system', progress: 0, status: 'not-started', contributors: ['MoneyGod', 'Kai'] },
  { id: 'gm-4', name: 'Agent inbox / outbox UI', description: 'Surface threaded agent-to-agent proposals in the detail panel.', category: 'system', progress: 0, status: 'not-started', contributors: ['Zip', 'Mira'] },
  { id: 'gm-5', name: 'Authentication & roles', description: 'Login, sessions, role-based dashboards, audit log of every mutation.', category: 'infrastructure', progress: 0, status: 'not-started', contributors: ['Kai'] },
  { id: 'gm-6', name: 'GPU symbiosis', description: 'Cooperative GPU sharing between VirtualPC agents, LM Studio, and any other local consumers.', category: 'infrastructure', progress: 0, status: 'not-started', contributors: ['Kai', 'Luna'] },
  { id: 'gm-7', name: 'Local-inference router', description: 'Three-tier model router: free local, low-cost cloud, premium cloud. Per-agent and per-task-type routes.', category: 'system', progress: 0, status: 'not-started', contributors: ['Kai'] },
  { id: 'gm-8', name: 'Mobile-responsive dashboard', description: 'Adaptive layout for phone and foldable screens.', category: 'optimization', progress: 0, status: 'not-started', contributors: ['Luna', 'Mira'] },
  { id: 'gm-9', name: 'Design system v2', description: 'Codified tokens for colors, spacing, type scale, motion. Single source of CSS custom properties.', category: 'art', progress: 0, status: 'not-started', contributors: ['Mira'] },
  { id: 'gm-10', name: 'Accessibility pass', description: 'axe-core scan + contrast / ARIA / keyboard fixes across every dashboard page.', category: 'art', progress: 0, status: 'not-started', contributors: ['Mira'] },
  { id: 'gm-11', name: 'CI/CD pipeline', description: 'Lint, type-check, test, build, deploy preview. Block merges that fail any gate.', category: 'infrastructure', progress: 0, status: 'not-started', contributors: ['Kai'] },
  { id: 'gm-12', name: 'A/B test framework', description: 'Variant assignment, conversion tracking, automatic stat-sig calculation.', category: 'system', progress: 0, status: 'not-started', contributors: ['Analyst', 'Zip'] },
  { id: 'gm-13', name: 'Onboarding & docs polish', description: 'Onboarding tour, screencast series, refreshed README + architecture doc.', category: 'art', progress: 0, status: 'not-started', contributors: ['VideoProducer', 'Mira', 'Kimi'] },
];

// Keywords that map completed tasks to milestones
const milestoneKeywords: { [milestoneId: string]: string[] } = {
  'gm-1':  ['persistence', 'postgres', 'database', 'task store', 'sql'],
  'gm-2':  ['websocket', 'real-time', 'activity stream', 'socket.io'],
  'gm-3':  ['cost dashboard', 'budget', 'spend', 'auto-throttle', 'token tracker'],
  'gm-4':  ['inbox', 'outbox', 'proposal', 'threaded'],
  'gm-5':  ['auth', 'login', 'session', 'role', 'audit log', 'rbac'],
  'gm-6':  ['gpu symbiosis', 'cuda', 'mps', '3090', 'gpu yield'],
  'gm-7':  ['model router', 'tier 1', 'tier 2', 'tier 3', 'litellm', 'lm studio'],
  'gm-8':  ['mobile', 'responsive', 'foldable', 'breakpoint', 'pwa'],
  'gm-9':  ['design system', 'design tokens', 'css custom properties'],
  'gm-10': ['axe', 'accessibility', 'aria', 'contrast', 'keyboard'],
  'gm-11': ['ci/cd', 'github actions', 'lint', 'tsc', 'jest', 'pipeline'],
  'gm-12': ['a/b', 'variant', 'experiment', 'conversion'],
  'gm-13': ['onboarding', 'tour', 'screencast', 'readme', 'architecture doc'],
};

function updateMilestones() {
  const completedTasks = tasks.filter(t => t.status === 'completed');
  for (const ms of gameMilestones) {
    const keywords = milestoneKeywords[ms.id] || [];
    // Count how many completed tasks match this milestone
    const matches = completedTasks.filter(t => {
      const text = (t.title + ' ' + t.description).toLowerCase();
      return keywords.some(kw => text.includes(kw));
    }).length;
    // Each matching completed task adds ~20% progress (capped at 100)
    ms.progress = Math.min(100, matches * 20);
    ms.status = ms.progress >= 100 ? 'completed' : ms.progress > 0 ? 'in-progress' : 'not-started';
  }
}

// === TICK ENGINE ===
export function tickEngine() {
  const now = Date.now();
  const agents = AGENT_NAMES;

  for (const agent of agents) {
    const agentTasks = tasks.filter(t => t.assigned_to === agent);
    const inProgress = agentTasks.filter(t => t.status === 'in-progress');

    // Advance each in-progress task
    for (const task of inProgress) {
      if (now - task._lastTick < task._tickRate) continue;
      task._lastTick = now;

      const nextSub = task.subtasks.find(s => !s.done);
      if (nextSub) {
        nextSub.done = true;
        dirty = true;
        // Log work: each subtask = estimated_hours / subtask_count in minutes
        const minsPerSub = Math.round((task.estimated_hours * 60) / task.subtasks.length);
        logWork(agent, task.id, task.title, nextSub.name, 'subtask_completed', minsPerSub);
      }

      const doneCount = task.subtasks.filter(s => s.done).length;
      task.progress = Math.round((doneCount / task.subtasks.length) * 100);

      if (doneCount === task.subtasks.length) {
        task.status = 'completed';
        task.completed_at = new Date().toISOString();
        task.progress = 100;
        dirty = true;
        logWork(agent, task.id, task.title, '', 'task_completed', 0);
        logger.info(`✅ ${agent} completed: ${task.title}`);
        // Fire-and-forget LM Studio generation of a real artifact for this task.
        // Agents actually think when they finish work.
        generateArtifactForCompletedTask(agent, task).catch(err => {
          logger.warn(`artifact gen failed for ${agent}/${task.id}: ${err.message}`);
          // Publish to task.failed Kafka topic so the audit consumer + the
          // dashboard's Kafka Spine page show artifact-generation failures
          // alongside other task lifecycle events. Best-effort.
          try {
            const { bestEffortPublish } = require('./integrations/kafka/shared');
            bestEffortPublish((p: any) => p.publishTaskFailed({
              task_id: task.id,
              agent,
              title: task.title,
              failure_stage: 'artifact-gen',
              error: err.message,
              ts: new Date().toISOString(),
            }));
          } catch { /* shared.ts not loadable in test envs */ }
        });
      }
    }

    // Ensure agent always has 2 in-progress and 2 pending
    const currentIP = agentTasks.filter(t => t.status === 'in-progress').length;
    const currentPending = agentTasks.filter(t => t.status === 'pending').length;

    // Start pending tasks if we have room
    if (currentIP < 2) {
      const toStart = agentTasks.find(t => t.status === 'pending');
      if (toStart) {
        toStart.status = 'in-progress';
        toStart.started_at = new Date().toISOString();
        toStart._lastTick = now;
        dirty = true;
        logWork(agent, toStart.id, toStart.title, '', 'task_started', 0);
        logger.info(`▶️ ${agent} started: ${toStart.title}`);
      }
    }

    // Generate new tasks if running low on pending
    const pendingAfter = agentTasks.filter(t => t.status === 'pending').length;
    if (pendingAfter < 2) {
      const needed = 2 - pendingAfter;
      for (let i = 0; i < needed; i++) {
        const newTask = generateTask(agent);
        tasks.push(newTask);
        dirty = true;
      }
    }
  }

  // Update game milestones based on completed work
  updateMilestones();
}

// === PUBLIC API ===

export function getPerPersonBacklog() {
  // Single source of truth for the roster — when agent-registry adds an
  // agent, this loop picks them up automatically.
  const meta: { [key: string]: { role: string; avatar: string } } = Object.fromEntries(
    AGENT_NAMES.map(name => [name, { role: ROLE_MAP[name] || '', avatar: AVATAR_MAP[name] || '' }])
  );

  const result: { [key: string]: any } = {};
  for (const [name, info] of Object.entries(meta)) {
    // Show last 3 completed + all in-progress + all pending (not the entire history)
    const agentTasks = tasks.filter(t => t.assigned_to === name);
    const completed = agentTasks.filter(t => t.status === 'completed');
    const active = agentTasks.filter(t => t.status === 'in-progress');
    const pending = agentTasks.filter(t => t.status === 'pending');
    const visible = [...completed.slice(-3), ...active, ...pending];

    const totalCompleted = completed.length;
    const totalActive = active.length;
    const allTotal = agentTasks.length;
    const progress = allTotal > 0 ? Math.round(((totalCompleted + active.reduce((s, t) => s + t.progress / 100, 0)) / allTotal) * 100) : 0;

    result[name] = {
      role: info.role,
      avatar: info.avatar,
      tasks: visible.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        description: t.description,
        sprint: t.sprint,
        estimated_hours: t.estimated_hours,
        progress: t.progress,
        project: t.project,
        tags: t.tags,
        started_at: t.started_at,
        completed_at: t.completed_at,
      })),
      completed: totalCompleted,
      active: totalActive,
      progress: Math.min(progress, 99), // never 100% overall — always more work
    };
  }
  return result;
}

export function getAgentProgress(agentName: string) {
  const agentTasks = tasks.filter(t => t.assigned_to === agentName);
  const completed = agentTasks.filter(t => t.status === 'completed').length;
  const inProgress = agentTasks.filter(t => t.status === 'in-progress').length;
  const pending = agentTasks.filter(t => t.status === 'pending').length;
  const total = agentTasks.length;

  const currentInProg = agentTasks.find(t => t.status === 'in-progress');
  const currentSubtask = currentInProg ? currentInProg.subtasks.find(s => !s.done)?.name : null;

  return {
    completed,
    inProgress,
    pending,
    total,
    progress: total > 0 ? Math.min(Math.round(((completed + agentTasks.filter(t => t.status === 'in-progress').reduce((s, t) => s + t.progress / 100, 0)) / total) * 100), 99) : 0,
    focus: currentInProg ? `${currentInProg.title}${currentSubtask ? ` → ${currentSubtask}` : ''}` : 'Generating next task...',
    currentTask: currentInProg?.title || null,
    currentSubtask,
  };
}

export interface AgentScorecard {
  agent: string;
  role: string;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  status: 'working' | 'queued' | 'idle' | 'needs_attention';
  completed: number;
  inProgress: number;
  pending: number;
  total: number;
  averageActiveProgress: number;
  lastActivity: string | null;
  blockerCount: number;
  placeholderCount: number;
  notes: string[];
}

function gradeFromAgentScore(score: number): AgentScorecard['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function looksBlocked(task: Task): boolean {
  const text = `${task.title} ${task.description}`.toLowerCase();
  return /\b(blocked by|is blocked|currently blocked|stalled on|waiting on|cannot proceed|missing credential|needs human)\b/.test(text);
}

export function getAgentScorecard(agentName: string): AgentScorecard {
  const agentTasks = tasks.filter(t => t.assigned_to === agentName);
  const completed = agentTasks.filter(t => t.status === 'completed').length;
  const active = agentTasks.filter(t => t.status === 'in-progress');
  const pendingTasks = agentTasks.filter(t => t.status === 'pending');
  const placeholders = agentTasks.filter(isPlaceholderTask).length;
  const blockers = agentTasks.filter(t => t.status !== 'completed' && looksBlocked(t)).length;
  const averageActiveProgress = active.length
    ? Math.round(active.reduce((sum, t) => sum + (t.progress || 0), 0) / active.length)
    : 0;

  let lastActivity: string | null = null;
  for (let i = workLog.length - 1; i >= 0; i--) {
    if (workLog[i].agent === agentName) {
      lastActivity = workLog[i].timestamp;
      break;
    }
  }

  const notes: string[] = [];
  let score = 100;

  if (active.length === 0) {
    score -= 35;
    notes.push('no in-progress task');
  } else if (active.length < 2) {
    score -= 10;
    notes.push('below target in-progress WIP');
  }

  if (pendingTasks.length === 0) {
    score -= 20;
    notes.push('no pending queue');
  } else if (pendingTasks.length < 2) {
    score -= 8;
    notes.push('below target pending queue');
  }

  if (blockers > 0) {
    score -= Math.min(30, blockers * 15);
    notes.push(`${blockers} active blocker signal${blockers === 1 ? '' : 's'}`);
  }

  if (placeholders > 0) {
    score -= Math.min(25, placeholders * 10);
    notes.push(`${placeholders} placeholder task${placeholders === 1 ? '' : 's'}`);
  }

  if (lastActivity) {
    const ageHours = (Date.now() - new Date(lastActivity).getTime()) / 3_600_000;
    if (ageHours > 72) {
      score -= 20;
      notes.push('no recorded work in 72h');
    } else if (ageHours > 24) {
      score -= 10;
      notes.push('no recorded work in 24h');
    }
  } else if (completed === 0) {
    score -= 5;
    notes.push('no retained work-log activity yet');
  }

  if (active.length >= 2 && pendingTasks.length >= 2 && blockers === 0 && placeholders === 0) {
    notes.push('queue healthy');
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const status: AgentScorecard['status'] = blockers > 0 || placeholders > 0 || score < 70
    ? 'needs_attention'
    : active.length > 0
      ? 'working'
      : pendingTasks.length > 0
        ? 'queued'
        : 'idle';

  return {
    agent: agentName,
    role: ROLE_MAP[agentName] || agentName,
    score,
    grade: gradeFromAgentScore(score),
    status,
    completed,
    inProgress: active.length,
    pending: pendingTasks.length,
    total: agentTasks.length,
    averageActiveProgress,
    lastActivity,
    blockerCount: blockers,
    placeholderCount: placeholders,
    notes,
  };
}

export function getAllAgentScorecards(): AgentScorecard[] {
  return AGENT_NAMES.map(getAgentScorecard);
}

export function getBacklogItems() {
  // Show active + pending + last 5 completed items
  const completed = tasks.filter(t => t.status === 'completed').slice(-5);
  const active = tasks.filter(t => t.status === 'in-progress');
  const pending = tasks.filter(t => t.status === 'pending');
  const visible = [...active, ...pending, ...completed];

  // Use the canonical ROLE_MAP (from agent-registry, covers all agents) instead of
  // a hand-maintained local map that had only 13 of 36 agents — the other 23
  // (Athena, Governor, Hermes-*, Pixel, Testers) displayed with no role. Short form
  // = text before the ' · ' qualifier, preserving the compact "Name (Role)" UI.
  const shortRole = (n: string) => (ROLE_MAP[n] || '').split(' · ')[0] || n;
  return visible.map(t => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    assigned_to: `${t.assigned_to} (${shortRole(t.assigned_to)})`,
    project: t.project,
    tags: t.tags,
    sprint: t.sprint,
    status: t.status === 'in-progress' ? 'in_progress' : t.status,
    created_at: t.started_at || new Date().toISOString(),
    description: t.description,
  }));
}

// Real task statistics over the live task store (replaces the former mock
// Math.random() counts behind /api/task-status). Counts the actual `tasks`
// array by status so the dashboard auto-refresh shows true numbers.
export function getTaskStats() {
  return {
    total: tasks.length,
    completed: tasks.filter(t => t.status === 'completed').length,
    inProgress: tasks.filter(t => t.status === 'in-progress').length,
    pending: tasks.filter(t => t.status === 'pending').length,
    timestamp: new Date().toISOString(),
  };
}

export function getTaskDetail(taskId: string) {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;
  const doneCount = task.subtasks.filter(s => s.done).length;
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    assigned_to: task.assigned_to,
    project: task.project,
    tags: task.tags,
    status: task.status,
    sprint: task.sprint,
    description: task.description,
    estimated_hours: task.estimated_hours,
    progress: task.progress,
    subtasks: task.subtasks.map(s => s.name),
    started_at: task.started_at,
    completed_at: task.completed_at,
    _subtasksDone: doneCount,
  };
}

// Mutators for the dashboard's per-agent task panel. Operate on the same
// `tasks` array that getPerPersonBacklog/getTaskDetail read from, so changes
// surface immediately in the UI on the next poll.
export function setTaskStatus(taskId: string, next: Task['status']): Task | null {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;
  const previous = task.status;
  task.status = next;
  if (next === 'in-progress' && !task.started_at) task.started_at = new Date().toISOString();
  if (next === 'completed') {
    task.completed_at = new Date().toISOString();
    task.progress = 100;
    // Mark every subtask done so progress math stays consistent.
    for (const s of task.subtasks) s.done = true;
  } else if (previous === 'completed') {
    // Reverting from completed → pending|in-progress: clear completed_at.
    task.completed_at = undefined;
  }
  dirty = true;   // trigger persistence on next save tick
  // Publish to Kafka agent.results when a task completes — downstream
  // subscribers (audit, cost dashboard, LightRAG sync) pick it up.
  // Lazy-required to avoid the build-time module cycle with kafka/shared.
  if (next === 'completed' && previous !== 'completed') {
    try {
      const { bestEffortPublish } = require('./integrations/kafka/shared');
      bestEffortPublish((p: any) => p.publishResult(task.id, task.assigned_to, {
        status: 'success', title: task.title, sprint: task.sprint,
        tokens_used: 0, execution_time_ms: 0,
      }));
    } catch { /* shared module unavailable — ignore */ }
  }
  return task;
}

export function setTaskPriority(taskId: string, next: Task['priority']): Task | null {
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;
  task.priority = next;
  dirty = true;
  return task;
}

// Inject a brand-new task into the live engine. Used by external delegators
// (e.g. external roadmap pushes via POST /api/backlog/items) so that the
// roster's per-agent queues and the dashboard's per-person backlog include
// items that didn't come from the seed pool. Validates the agent name
// against the canonical roster so a typo can't create an orphan task.
export function addTask(input: {
  title: string;
  description: string;
  priority?: Task['priority'];
  assigned_to: string;
  project: string;
  tags: string[];
  estimated_hours?: number;
  subtasks?: string[];
  sprint?: string;
}): Task | null {
  if (!AGENT_NAMES.includes(input.assigned_to)) return null;
  const id = `task-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const project = normalizeProject(input.project);
  const sprint = input.sprint || 'roadmap';
  const t: Task = {
    id,
    title: input.title,
    description: input.description,
    priority: input.priority || 'medium',
    project,
    tags: normalizeTags(input.tags, defaultTaskTags({ assigned_to: input.assigned_to, priority: input.priority || 'medium', sprint, project })),
    status: 'pending',
    assigned_to: input.assigned_to,
    estimated_hours: input.estimated_hours ?? 4,
    subtasks: (input.subtasks || []).map(s => ({ name: s, done: false })),
    progress: 0,
    sprint,
    _tickRate: 1,
    _lastTick: Date.now(),
  };
  tasks.push(t);
  // Without this dirty flag the next saveState() tick wouldn't include
  // newly-injected tasks, so a virtualpc restart between the inject and
  // the next periodic save would lose them. Observed live: the May-3
  // roadmap-delegation push got wiped by the 16:00 deploy because addTask
  // didn't mark dirty.
  dirty = true;
  // Publish the new task to Kafka agent.tasks for downstream consumers.
  try {
    const { bestEffortPublish } = require('./integrations/kafka/shared');
    bestEffortPublish((p: any) => p.publishTask(input.assigned_to, {
      task_type: 'delegated',
      priority: t.priority,
      payload: { id: t.id, title: t.title, project: t.project, tags: t.tags, sprint: t.sprint, estimated_hours: t.estimated_hours },
    }));
  } catch { /* shared module unavailable — ignore */ }
  return t;
}

export function getGameMilestones(): GameMilestone[] {
  updateMilestones();
  return gameMilestones;
}

export function getGameStats() {
  const totalCompleted = tasks.filter(t => t.status === 'completed').length;
  const totalInProgress = tasks.filter(t => t.status === 'in-progress').length;
  const milestonesCompleted = gameMilestones.filter(m => m.status === 'completed').length;
  const milestonesInProgress = gameMilestones.filter(m => m.status === 'in-progress').length;
  const overallProgress = Math.round(gameMilestones.reduce((s, m) => s + m.progress, 0) / gameMilestones.length);

  // Throughput windows — counted from workLog so they reflect *recent* motion
  // even when the steady-state pending/in-progress counts don't change.
  // Without this the dashboard's "Queued: 28" looks frozen for hours when the
  // engine is in fact ticking happily through subtasks.
  const now = Date.now();
  const minuteAgo = now - 60_000;
  const hourAgo = now - 3_600_000;
  const dayAgo = now - 86_400_000;
  let completedLastMinute = 0;
  let completedLastHour = 0;
  let completedLast24h = 0;
  let lastCompletionTs: string | null = null;
  for (const e of workLog) {
    if (e.action !== 'task_completed') continue;
    const t = new Date(e.timestamp).getTime();
    if (t > minuteAgo) completedLastMinute++;
    if (t > hourAgo) completedLastHour++;
    if (t > dayAgo) completedLast24h++;
    if (!lastCompletionTs || e.timestamp > lastCompletionTs) lastCompletionTs = e.timestamp;
  }

  return {
    sprint: currentSprint(),
    sprintNumber: sprintCounter,
    tasksCompleted: totalCompleted,
    tasksInProgress: totalInProgress,
    completedLastMinute,
    completedLastHour,
    completedLast24h,
    lastCompletionTs,
    milestonesCompleted,
    milestonesInProgress,
    milestonesTotal: gameMilestones.length,
    overallGameProgress: overallProgress,
    agentCount: AGENT_NAMES.length,
    uptime: Math.round((Date.now() - startTime) / 1000),
  };
}

const startTime = Date.now();

// === WORK LOG: every agent registers their minutes ===
interface WorkLogEntry {
  timestamp: string;
  agent: string;
  role: string;
  taskId: string;
  taskTitle: string;
  subtask: string;
  action: 'subtask_completed' | 'task_started' | 'task_completed';
  minutesSpent: number;
  project: string;
  registeredFor: string; // Edwin Hauwert 219252713
}

const workLog: WorkLogEntry[] = [];
// Hard cap on retained work-log entries. The array had no bound, which grew
// task-state.json to 196 MB — every 5s save tick then serialized the whole
// file and blocked the event loop, and startup loaded the entire blob into
// memory. Keep only the most recent MAX_WORKLOG entries; analytics here only
// look at recent windows / last-N slices, so older entries carry no value.
const MAX_WORKLOG = 10000;
// Replay any work-log entries that were restored from the persisted state.
// Use a manual loop instead of `push(...arr)` because the persisted log can
// be 100k+ entries and V8's variadic-call argument limit (~125k) blows the
// stack — observed crash: "RangeError: Maximum call stack size exceeded"
// at startup when the log grew past the threshold.
if ((globalThis as any).__virtualpcPersistedWorkLog) {
  const persisted = (globalThis as any).__virtualpcPersistedWorkLog as WorkLogEntry[];
  // Only replay the tail — a previously-unbounded log on disk could hold
  // hundreds of thousands of entries; keep the newest MAX_WORKLOG.
  const start = Math.max(0, persisted.length - MAX_WORKLOG);
  for (let i = start; i < persisted.length; i++) workLog.push(persisted[i]);
  delete (globalThis as any).__virtualpcPersistedWorkLog;
}
const PROJECT_NAME = 'VirtualPC platform';
const REGISTERED_FOR = 'Edwin Hauwert 219252713';
const roleMap: { [k: string]: string } = { Fill: 'CEO', Kai: 'CTO', Zip: 'Developer', Mira: 'Creative Director', Luna: 'Tech Artist', Cleopatra: 'Executive Authority', Alexander: 'Technical Arbiter', MoneyGod: 'Economy Authority', Analyst: 'Data Analyst', VideoProducer: 'Video Producer', Vice: 'Open-World Design Expert', Atlas: 'Simulation / AR / VR / CAD Realism', Kimi: 'Long-Context Researcher' };

export function logWork(agent: string, taskId: string, taskTitle: string, subtask: string, action: WorkLogEntry['action'], minutesSpent: number) {
  workLog.push({
    timestamp: new Date().toISOString(),
    agent,
    role: roleMap[agent] || agent,
    taskId,
    taskTitle,
    subtask,
    action,
    minutesSpent,
    project: PROJECT_NAME,
    registeredFor: REGISTERED_FOR,
  });
  // Rolling eviction — never let the in-memory log (and therefore the persisted
  // snapshot) grow without bound. Splice the oldest overflow in one shot.
  if (workLog.length > MAX_WORKLOG) {
    workLog.splice(0, workLog.length - MAX_WORKLOG);
  }
}

export function getWorkLog(agent?: string, limit?: number): WorkLogEntry[] {
  let entries = agent ? workLog.filter(e => e.agent === agent) : workLog;
  if (limit) entries = entries.slice(-limit);
  return entries;
}

export function getWorkSummary() {
  const agentSummaries: { [agent: string]: { totalMinutes: number; tasksCompleted: number; subtasksCompleted: number; lastActivity: string } } = {};
  for (const entry of workLog) {
    if (!agentSummaries[entry.agent]) {
      agentSummaries[entry.agent] = { totalMinutes: 0, tasksCompleted: 0, subtasksCompleted: 0, lastActivity: '' };
    }
    const s = agentSummaries[entry.agent];
    s.totalMinutes += entry.minutesSpent;
    if (entry.action === 'task_completed') s.tasksCompleted++;
    if (entry.action === 'subtask_completed') s.subtasksCompleted++;
    s.lastActivity = entry.timestamp;
  }
  return {
    project: PROJECT_NAME,
    registeredFor: REGISTERED_FOR,
    totalEntries: workLog.length,
    totalMinutesLogged: workLog.reduce((s, e) => s + e.minutesSpent, 0),
    agents: agentSummaries,
    uptime: Math.round((Date.now() - startTime) / 1000),
  };
}

// === AGENT ARTIFACTS (real LM Studio outputs on task completion) ===
interface Artifact {
  id: string;
  agent: string;
  taskId: string;
  taskTitle: string;
  timestamp: string;
  model: string;
  latencyMs: number;
  tokens: number;
  content: string;
  promptType: 'task_summary';
}

const artifacts: Artifact[] = [];
const MAX_ARTIFACTS = 300;

function artifactPromptFor(agent: string, task: Task): string {
  const subtasks = task.subtasks.map(s => s.name).join(', ');
  return `You are ${agent}. You just completed the task "${task.title}" (sprint ${task.sprint}, ${task.estimated_hours}h). Subtasks covered: ${subtasks}. Description: ${task.description}

Produce a concise post-completion artifact:
1. One-sentence outcome.
2. 3-5 bullet points with the key deliverables or decisions.
3. One risk or follow-up for the next sprint.

Keep it under 150 words. Plain text.`;
}

async function generateArtifactForCompletedTask(agent: string, task: Task): Promise<void> {
  // Lazy import to avoid circular dep with the lmstudio module
  const lms = await import('./lmstudio');
  const prompt = artifactPromptFor(agent, task);
  const result = await lms.chatAsAgent(
    agent,
    [
      { role: 'system', content: lms.systemPromptForAgent(agent, roleMap[agent] || agent) },
      { role: 'user', content: prompt },
    ],
    { taskType: 'cheap', max_tokens: 300 }
  );
  if (!result.ok) {
    logger.warn(`artifact skipped (${agent}/${task.id}): ${result.reason}`);
    return;
  }
  const art: Artifact = {
    id: `art-${task.id}-${Date.now()}`,
    agent,
    taskId: task.id,
    taskTitle: task.title,
    timestamp: new Date().toISOString(),
    model: result.model,
    latencyMs: result.latencyMs,
    tokens: result.usage?.total_tokens || 0,
    content: result.content,
    promptType: 'task_summary',
  };
  artifacts.push(art);
  if (artifacts.length > MAX_ARTIFACTS) artifacts.splice(0, artifacts.length - MAX_ARTIFACTS);
  logger.info(`📄 artifact saved for ${agent}/${task.id} (${art.tokens} tokens, ${art.latencyMs}ms via ${art.model})`);
  dirty = true;
}

export function getAgentArtifacts(agent: string, limit = 10): Artifact[] {
  return artifacts.filter(a => a.agent === agent).slice(-limit).reverse();
}

export function getAllArtifacts(limit = 50): Artifact[] {
  return artifacts.slice(-limit).reverse();
}

// === MULTI-AGENT PROPOSALS (agents actually collaborate via LM Studio) ===
// Periodically, a proposer agent sends a targeted message to another agent
// (Vice -> Zip, Cleopatra -> Fill, Analyst -> MoneyGod, etc.). Each proposal
// is a real LM Studio call grounded in both agents' roles. Shows up in the
// target's Inbox and the proposer's Outbox on the dashboard.
interface Proposal {
  id: string;
  from: string;      // proposer agent name
  to: string;        // target agent name
  timestamp: string;
  topic: string;     // short subject line
  content: string;   // generated body
  model: string;
  latencyMs: number;
  tokens: number;
  status: 'delivered';
}

const proposals: Proposal[] = [];
const MAX_PROPOSALS = 300;

// Proposer → possible targets + a matching prompt scaffold.
const PROPOSAL_LANES: Array<{ from: string; to: string; topic: string; prompt: (from: string, to: string) => string }> = [
  // Vice (open-world design) files task proposals back to implementers
  { from: 'Vice', to: 'Zip', topic: 'New interaction pattern proposal', prompt: (f, t) => `As ${f}, write a concrete 3-bullet task proposal for ${t} that introduces a new interaction pattern in the VirtualPC dashboard. Include one rough effort estimate. Under 120 words.` },
  { from: 'Vice', to: 'Luna', topic: 'Rendering/visual direction request', prompt: (f, t) => `As ${f}, brief ${t} (technical artist) on a visual-direction change for one of our districts. Reference color palette, lighting mood, time-of-day. Include one ask ${t} owns. Under 120 words.` },
  { from: 'Vice', to: 'Mira', topic: 'Asset commission', prompt: (f, t) => `As ${f}, commission ${t} (creative director) to design a set of props / NPCs for an upcoming district. Name 3 specific assets. Under 100 words.` },
  // Analyst surfaces data-driven proposals
  { from: 'Analyst', to: 'MoneyGod', topic: 'Economy signal requiring policy response', prompt: (f, t) => `As ${f} (data analyst), brief ${t} (economy authority) on a specific signal you found in player/market data that warrants a policy change. One signal, proposed intervention, expected outcome. Under 120 words.` },
  { from: 'Analyst', to: 'Fill', topic: 'KPI update', prompt: (f, t) => `As ${f}, send ${t} (CEO) a one-paragraph KPI update: one metric moving, one metric stuck, one recommendation. Under 100 words.` },
  { from: 'Analyst', to: 'Kai', topic: 'Performance regression to investigate', prompt: (f, t) => `As ${f}, flag to ${t} (CTO) a performance regression you spotted in the event stream. Include which endpoint or zone, severity, and suggested next step. Under 100 words.` },
  // Atlas audits CAD / physics realism
  { from: 'Atlas', to: 'Mira', topic: 'FreeCAD fidelity audit finding', prompt: (f, t) => `As ${f} (simulation/realism authority), report one specific finding from your FreeCAD audit of ${t}'s equipment models where the geometry would fail an industrial P&ID review. Give the fix. Under 120 words.` },
  { from: 'Atlas', to: 'Luna', topic: 'Physics validation vs Perry handbook', prompt: (f, t) => `As ${f}, file a small physics validation report for ${t} (tech artist). Name one simulation behavior (fluid, heat, vapor) that drifts from Perry's Chemical Engineers' Handbook values and propose the fix. Under 120 words.` },
  // Cleopatra runs governance reviews
  { from: 'Cleopatra', to: 'Fill', topic: 'Governance review of recent decision', prompt: (f, t) => `As ${f} (executive authority), produce an independent second-opinion on one of ${t}'s (CEO) recent strategic decisions. Agree, dissent, or request modification — with one reason. Under 120 words.` },
  { from: 'Cleopatra', to: 'Kai', topic: 'Compliance intersection question', prompt: (f, t) => `As ${f}, ask ${t} (CTO) one pointed question about GDPR / COPPA / EU AI Act compliance for a specific subsystem. Explain why you are asking. Under 100 words.` },
  // Alexander arbitrates tech-stack choices
  { from: 'Alexander', to: 'Kai', topic: 'ADR arbitration', prompt: (f, t) => `As ${f} (technical arbiter), write a short ADR stance on a tech-stack choice ${t} proposed (e.g., ORM, test framework, queue backend). Pick the more technically-interesting defensible option. Under 140 words.` },
  { from: 'Alexander', to: 'Zip', topic: 'Code-review delegation note', prompt: (f, t) => `As ${f}, send ${t} (developer) a note about a code-review standard you are enforcing. Pick a pattern you want reinforced and one to avoid. Under 100 words.` },
  // MoneyGod challenges the budget / economy decisions
  { from: 'MoneyGod', to: 'Fill', topic: 'Budget challenge', prompt: (f, t) => `As ${f} (economy authority), push back on a specific line in ${t}'s (CEO) Q3 budget forecast. Name the line, the concern, and a concrete alternative. Under 120 words.` },
  { from: 'MoneyGod', to: 'Zip', topic: 'Anti-farm gap to patch', prompt: (f, t) => `As ${f}, tell ${t} (developer) about an anti-farm gap you spotted in the MolCoin economy. One signal, one implementation ask. Under 100 words.` },
];

function pickProposalLane(): typeof PROPOSAL_LANES[number] {
  return PROPOSAL_LANES[Math.floor(Math.random() * PROPOSAL_LANES.length)];
}

async function generateProposal(): Promise<void> {
  const lane = pickProposalLane();
  try {
    const lms = await import('./lmstudio');
    const result = await lms.chatAsAgent(
      lane.from,
      [
        { role: 'system', content: lms.systemPromptForAgent(lane.from, roleMap[lane.from] || lane.from) },
        { role: 'user', content: lane.prompt(lane.from, lane.to) },
      ],
      { taskType: 'cheap', max_tokens: 260 }
    );
    if (!result.ok) {
      logger.warn(`proposal skipped (${lane.from} -> ${lane.to}): ${result.reason}`);
      return;
    }
    const p: Proposal = {
      id: `prop-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      from: lane.from,
      to: lane.to,
      timestamp: new Date().toISOString(),
      topic: lane.topic,
      content: result.content,
      model: result.model,
      latencyMs: result.latencyMs,
      tokens: result.usage?.total_tokens || 0,
      status: 'delivered',
    };
    proposals.push(p);
    if (proposals.length > MAX_PROPOSALS) proposals.splice(0, proposals.length - MAX_PROPOSALS);
    logger.info(`📨 proposal ${lane.from} → ${lane.to}: ${lane.topic} (${p.tokens} tokens)`);
    dirty = true;
  } catch (e: any) {
    logger.warn(`proposal generation crashed: ${e.message}`);
  }
}

// Fire a proposal every 3 minutes. Starts 45s after boot so the first tick
// has time to warm up tasks and for LM Studio to be ready.
setTimeout(() => {
  generateProposal();
  setInterval(generateProposal, 180_000);
}, 45_000);

export function getAgentInbox(agent: string, limit = 15): Proposal[] {
  return proposals.filter(p => p.to === agent).slice(-limit).reverse();
}

export function getAgentOutbox(agent: string, limit = 15): Proposal[] {
  return proposals.filter(p => p.from === agent).slice(-limit).reverse();
}

export function getAllProposals(limit = 50): Proposal[] {
  return proposals.slice(-limit).reverse();
}

// === IN-PROGRESS DETAIL (full subtask array, which done/not-done) ===
export function getAgentInProgressDetail(agent: string) {
  const agentTasks = tasks.filter(t => t.assigned_to === agent && t.status === 'in-progress');
  return agentTasks.map(t => ({
    id: t.id,
    title: t.title,
    priority: t.priority,
    description: t.description,
    estimated_hours: t.estimated_hours,
    progress: t.progress,
    started_at: t.started_at,
    sprint: t.sprint,
    subtasks: t.subtasks.map(s => ({ name: s.name, done: s.done })),
    subtasksDone: t.subtasks.filter(s => s.done).length,
    subtasksTotal: t.subtasks.length,
    currentSubtask: t.subtasks.find(s => !s.done)?.name || null,
    _secondsSinceLastTick: Math.round((Date.now() - t._lastTick) / 1000),
  }));
}

// === LIVE CLI LOG (synthesized from work log + plausible running commands) ===
// Each agent has a set of plausible shell commands that match their role.
// We synthesize a log stream mixing real task events with these running commands.

const agentCommands: { [agent: string]: string[] } = {
  Fill: [
    '$ gh issue list --label critical --repo febuz/virtualpc',
    '$ review-sprint --sprint 2 --format summary',
    '$ okr-tracker --quarter Q3 --status',
    '$ budget-forecast --period Q3 --output table',
    '$ partner-outreach --list universities',
    '$ compliance-check --standard gdpr,coppa',
    '$ team-perf-report --window 7d',
  ],
  Kai: [
    '$ nvidia-smi --query-gpu=name,utilization.gpu,memory.used --format=csv',
    '$ docker build -t virtualpc:kafka -f Dockerfile.kafka .',
    '$ kubectl apply -f k8s/virtualpc-deployment.yaml',
    '$ redis-cli --latency-history -i 1',
    '$ node scripts/kafka-topic-create.js --topic agent.tasks',
    '$ curl -s http://localhost:9200/_cluster/health | jq',
    '$ gh clone OpenSAGE/OpenSAGE /media/knight2/EDS2/reference-engines/OpenSAGE',
    '$ pytest tests/load --concurrent=1000',
  ],
  Zip: [
    '$ npm run test:chemistry -- --grep valence',
    '$ code src/components/RTS/FactoryGrid.tsx',
    '$ node scripts/run-migration.js --target task-store --dry-run',
    '$ npx playwright test tests/testplay/atom-lab.spec.ts',
    '$ node scripts/simulate-players.js --count 100 --persona crafter',
    '$ git rebase -i main',
    '$ npm run build:web && du -sh dist/',
  ],
  Mira: [
    '$ figma-export --node cleopatra-logo --format svg',
    '$ convert cleopatra-logo.svg -resize 512x512 cleopatra-logo@2x.png',
    '$ inkscape --export-area-drawing --export-png moneygod-icon.png',
    '$ figma-inspect --url design/agent-social-profiles',
    '$ code src/components/Profile/SocialFeed.tsx',
    '$ npm run storybook',
    '$ imageoptim assets/npc/farmer-chen.png',
    '$ blender --background reactor-cstr.blend --python bake-materials.py',
    '$ freecad -c parametric/cstr.FCStd --execute regen-exports.py',
    '$ blender --python-expr "import bpy; bpy.ops.wm.obj_export(filepath=\'/tmp/reactor.obj\')"',
    '$ curl -s http://127.0.0.1:1234/v1/chat/completions -d @prompts/concept-art.json',
    '$ python scripts/3dllm/text-to-mesh.py --model shap-e --prompt "distillation column cutaway"',
    '$ gltf-validator molecule-h2so4.glb',
    '$ mira gen mesh --prompt "chemical reactor pipe kit" --out assets/pipes/',
  ],
  Luna: [
    '$ blender --background --python render-equipment.py -- --device CUDA',
    '$ nvidia-smi --gpu-reset --id=1',
    '$ node profiler.js --sample 60s --device 0,1',
    '$ gltf-pipeline -i reactor.glb -o reactor.draco.glb --draco',
    '$ webgl-stats --scene rts --frame-budget 16.67',
    '$ npm run test:shaders -- --gpu rtx3090',
    '$ python scripts/asset-optimize.py --format webp --quality 85',
  ],
  // Decision makers: they review, ratify, escalate. Commands reflect that.
  Cleopatra: [
    '$ adr review --since 7d --status proposed',
    '$ governance audit --sprint current --format memo',
    '$ risk-matrix --domain migration --adversarial',
    '$ ratify --doc agent-social-charter.md',
    '$ dual-signoff --pr 1482 --second-approver @kai',
    '$ escalation-log --open --owner @cleopatra',
    '$ compliance-matrix --regulations gdpr,coppa,eu-ai-act',
    '$ decision-log --publish q3-board-narrative.md',
  ],
  Alexander: [
    '$ adr write --number 0042 --title rts-engine-choice',
    '$ veto --pr 1501 --reason "boring default"',
    '$ arbitrate --disputes open --owner @alexander',
    '$ approve --tier-routing gemma-for-chat.md',
    '$ override --fill-decision q3-stack-choice',
    '$ sign-off --ci-refactor unified-rojo-webpack',
    '$ adr freeze --number 0038 --duration 12m',
    '$ testing-pyramid --policy ratify',
    '$ standards publish --topic orm-choice',
  ],
  MoneyGod: [
    '$ economy report --window 7d --format board',
    '$ antifarm scan --signals all --candidates list',
    '$ market-integrity wash-trade --since 24h',
    '$ molco2 ledger reconcile --month current',
    '$ web3 policy --jurisdiction-audit',
    '$ budget challenge --fill-forecast q3',
    '$ cpi --curve A,B,C --retention d7',
    '$ escrow rules publish --tos v2.md',
    '$ battlepass pricing ab --test premium-tier-price',
  ],
  Analyst: [
    '$ python -m dask.distributed LocalCluster --n-workers=16 --threads-per-worker=2',
    '$ duckdb -c "SELECT agent, COUNT(*) FROM events WHERE ts > now() - INTERVAL 7 DAY GROUP BY 1"',
    '$ python cohorts.py --method cuml-kmeans --k 12 --gpu 0',
    '$ jupyter nbconvert --execute retention-analysis.ipynb --to html',
    '$ python economy-monte-carlo.py --runs 10000 --cores 32',
    '$ prophet fit --series dau.csv --periods 180 --out forecast.json',
    '$ python anomaly-detector.py --stream kafka://events --algorithm iforest',
    '$ neo4j-cypher "MATCH (r:Recipe)-[*..4]->(r2:Recipe) RETURN r, r2"',
  ],
  VideoProducer: [
    '$ blender --background platform-trailer.blend --python render_cycles.py -- --device CUDA --devices 0,1',
    '$ ffmpeg -hwaccel cuda -i raw_gameplay.mp4 -c:v h264_nvenc -b:v 25M trailer_4k60.mp4',
    '$ blender --background npc-femke.blend --render-frame 1:240 -o //cache/ --engine CYCLES',
    '$ davinci-resolve --batch-render project zone-promo-atomlab.drp',
    '$ ffmpeg -i master.mov -vf "scale=1080:1080" -c:v h264_nvenc social_square.mp4',
    '$ ffmpeg -i master.mov -vf "scale=1080:1920" -c:v h264_nvenc social_vertical.mp4',
    '$ python storyboard-to-blender.py --input shot-list.md --scene platform-main',
    '$ nvidia-smi --query-gpu=utilization.gpu,memory.used --format=csv --loop=5 >> render.log',
  ],
  Vice: [
    '$ research fetch --source rockstar-newswire --since 7d',
    '$ research fetch --source eve-online-devblog --since 14d',
    '$ research compile --topic "open-world density" --out memos/density-benchmarks.md',
    '$ gha compile --topic "gta6-preview-leaks" --ethics-filter on',
    '$ screenplay lint screenplay/act1.fountain',
    '$ mission-design validate tutorial-mission.yaml',
    '$ district-layout preview atom-lab-district.json',
    '$ radio-station scaffold --name chem-news --hosts 2',
    '$ task propose --target Zip --insight eve-sandbox-economy --effort 12h',
  ],
  Atlas: [
    '$ freecad -c parametric/column-tray.FCStd --execute audit-dimensions.py',
    '$ blender --background --python tools/heat-transfer-pde-bench.py',
    '$ adb devices && adb logcat -s QuestHome:V',
    '$ webxr-inspector http://localhost:3100/game',
    '$ python tools/fluid-sim-validate.py --dataset aspen-ref.parquet --tolerance 0.05',
    '$ ovrscene-tool inspect platform-overview.ovrscene',
    '$ cad-exporter freecad-to-gltf --src reactor.FCStd --dst web/assets/reactor.glb',
    '$ python tools/sim-sickness-score.py --session vr-playtest-42.json',
  ],
  Kimi: [
    '$ kimi-cli --context-window 200k --file src/**/*.ts --task "architectural review"',
    '$ cat docs/*.md | kimi-cli synthesize --out memos/doc-reconcile.md',
    '$ moonshot chat --model moonshot-v1-128k --stream',
    '$ find . -name "*.lua" -exec cat {} + | kimi-cli analyze --topic "parity gaps"',
    '$ kimi-cli research --query "agent platforms vs VirtualPC architecture" --depth deep',
    '$ kimi-cli logs ingest --window 7d --task "cross-service incident detection"',
    '$ jq -s . tests/testplay/results/*.json | kimi-cli summarize',
    '$ kimi-cli token-budget --month current --vs gemma-4-26b',
  ],
  Croesus: [
    '$ curl -sX POST localhost:3100/api/commercialization/propose -H "X-Agent-Id: Croesus" -d @proposal.json',
    '$ curl -s localhost:3100/api/commercialization/budget | jq',
    '$ kimi-cli market-research --query "self-hosted agent orchestration platforms"',
    '$ deepseek roi-model --channel discord-boost --target server-id-XXXX',
    '$ jq -r ".proposals[] | select(.status==\\"executed_dryrun\\") | .id" promotions.json',
    '$ python tools/promo-attribution.py --window 7d --channel all',
    '$ test $PROMO_REAL_MONEY = 0 && echo "DRY-RUN MODE — no real money"',
  ],
};

const cliSessionLog: { [agent: string]: Array<{ t: number; line: string; level: 'cmd' | 'out' | 'ok' | 'warn' | 'err' }> } =
  Object.fromEntries(AGENT_NAMES.map(agent => [agent, []]));

function pushCli(agent: string, line: string, level: 'cmd' | 'out' | 'ok' | 'warn' | 'err' = 'out') {
  const buf = cliSessionLog[agent] || (cliSessionLog[agent] = []);
  buf.push({ t: Date.now(), line, level });
  if (buf.length > 200) buf.splice(0, buf.length - 200);
}

// Seed some baseline CLI activity for each agent on startup and every tick
function tickCli() {
  for (const agent of Object.keys(agentCommands)) {
    // Probability of new activity per tick: 40%
    if (Math.random() > 0.4) continue;
    const cmds = agentCommands[agent];
    const cmd = cmds[Math.floor(Math.random() * cmds.length)];
    pushCli(agent, cmd, 'cmd');
    // Synthesize a plausible output line
    const outputs = [
      '  ... running',
      '  [info] warm cache hit (local)',
      '  [ok] completed in 1.24s',
      '  exit 0',
    ];
    pushCli(agent, outputs[Math.floor(Math.random() * outputs.length)], 'out');
  }
}
setInterval(tickCli, 4000);

export function getAgentCliLog(agent: string, limit = 50) {
  const session = cliSessionLog[agent] || [];
  const work = workLog.filter(e => e.agent === agent).slice(-30).map(e => {
    const t = new Date(e.timestamp).getTime();
    if (e.action === 'task_started') return { t, line: `[task] START  ${e.taskId} "${e.taskTitle}"`, level: 'cmd' as const };
    if (e.action === 'task_completed') return { t, line: `[task] DONE   ${e.taskId} "${e.taskTitle}"`, level: 'ok' as const };
    return { t, line: `[subtask] ok  "${e.subtask}" (+${e.minutesSpent}m)`, level: 'ok' as const };
  });
  const merged = [...session, ...work].sort((a, b) => a.t - b.t);
  const tail = merged.slice(-limit);
  return tail.map(e => ({
    ts: new Date(e.t).toISOString(),
    line: e.line,
    level: e.level,
  }));
}

// === AGENT SOCIAL FEED (Facebook/LinkedIn style posts) ===
// Synthesize posts from completed tasks + role-specific achievements.
// Supports extended roster: Cleopatra, Alexander, MoneyGod as stubs until they have their own task pools.
interface SocialAgent {
  name: string;
  handle: string;
  role: string;
  avatar: string;
  color: string;
  headline: string;
  bio: string;
  specialties: string[];
}

const socialRoster: SocialAgent[] = [
  { name: 'Fill',      handle: '@fill-ceo',        role: 'Chief Executive Officer', avatar: '👑', color: '#fbbf24', headline: 'Strategy, partnerships, OKRs',        bio: 'Strategic lead for VirtualPC. Keeps the platform pointed at milestones that matter, maintains the important-files list, signs off on cross-cutting decisions.', specialties: ['Strategy', 'Partnerships', 'Compliance', 'Roadmap'] },
  { name: 'Kai',       handle: '@kai-cto',         role: 'Chief Technology Officer', avatar: '⚡', color: '#a78bfa', headline: 'Infrastructure and scale',            bio: 'Kafka, Redis, Postgres, GPU scheduling, CI/CD, security. Makes VirtualPC boring-reliable.', specialties: ['Kafka', 'K8s', 'GPU Sched', 'Security'] },
  { name: 'Zip',       handle: '@zip-dev',         role: 'Developer',                avatar: '💻', color: '#22c55e', headline: 'Feature implementation',              bio: 'TypeScript, React, dashboard UX, integration plumbing. Turns proposals into shipping code.', specialties: ['TypeScript', 'React', 'Dashboard', 'Testing'] },
  { name: 'Mira',      handle: '@mira-art',        role: 'Creative Director',        avatar: '🎨', color: '#ec4899', headline: 'Design system, brand, accessibility', bio: 'Visual identity, design tokens, UI kits, accessibility audits. Owns the look and feel of every dashboard surface.', specialties: ['Brand', 'UI', 'Design Tokens', 'A11y'] },
  { name: 'Luna',      handle: '@luna-tech-art',   role: 'Technical Artist',         avatar: '✨', color: '#06b6d4', headline: 'Performance, rendering, GPU',         bio: 'Bundle size, animations, GPU vitals, mobile performance. Makes the dashboard fast on every device.', specialties: ['Performance', 'Animations', 'GPU', 'Mobile'] },
  { name: 'Cleopatra', handle: '@cleopatra-exec',  role: 'Executive Authority',      avatar: '👸', color: '#f97316', headline: 'Strategic decision rights',           bio: 'Holds executive authority over cross-cutting strategic decisions. Counterweight and partner to Fill on matters requiring dual sign-off.', specialties: ['Governance', 'Decisions', 'Escalation', 'Oversight'] },
  { name: 'Alexander', handle: '@alexander-cmd',   role: 'Technical Arbiter',        avatar: '🗡️', color: '#ef4444', headline: 'Architecture review and standards',   bio: 'Always picks the most technically interesting path. Custodian of architectural standards, code-review escalation, and approval heuristics.', specialties: ['Architecture', 'Standards', 'Reviews', 'Power User'] },
  { name: 'MoneyGod',  handle: '@moneygod',        role: 'Economy Authority',        avatar: '💰', color: '#10b981', headline: 'Cost caps, budget oversight',         bio: 'Oversees compute spend, model-mix economics, budget caps, and anti-abuse enforcement. No runaway bills on this watch.', specialties: ['Cost Tracking', 'Budgets', 'Anti-abuse', 'Auto-throttle'] },
  { name: 'Analyst',   handle: '@analyst',         role: 'Data Analyst',             avatar: '📊', color: '#8b5cf6', headline: 'Cohorts, forecasts, A/B tests',       bio: 'Runs on 32 cores + GPU (cuML). Cohort modelling, Monte Carlo forecasts, anomaly detection on event streams, A/B test analysis.', specialties: ['Cohorts', 'Forecasting', 'A/B', 'Streams'] },
  { name: 'VideoProducer', handle: '@videoproducer', role: 'Video Producer',         avatar: '🎬', color: '#d946ef', headline: 'Trailers, demos, screencasts',        bio: 'Dual-3090 Blender Cycles rendering, NVENC-accelerated encoding. Produces platform overview trailers, onboarding screencasts, investor reels.', specialties: ['Blender', 'Cinema', 'NVENC', 'Storyboards'] },
  { name: 'Vice',      handle: '@vice',            role: 'Research Lead',            avatar: '🌆', color: '#e11d48', headline: 'User research, competitive teardowns', bio: 'User research, competitive teardowns, density / scale design studies. Files task proposals back to developers every week.', specialties: ['Research', 'Teardowns', 'UX', 'Competitive'] },
  { name: 'Atlas',     handle: '@atlas',           role: 'Realism / Latency / VR / AR / CAD', avatar: '🥽', color: '#0ea5e9', headline: 'The fidelity ceiling', bio: 'Latency profiling, simulation fidelity audits, VR / AR / WebGPU prototyping, CAD-grade realism reviews. ±5% or it doesn\'t ship.', specialties: ['Latency', 'VR', 'AR', 'Realism'] },
  { name: 'Kimi',      handle: '@kimi',            role: 'Long-Context Researcher',  avatar: '🌙', color: '#7c3aed', headline: '200K context, single-shot synthesis', bio: 'Reads the entire codebase, every doc, and a week of logs in one prompt. Where Analyst slices and Vice researches one topic, Kimi ingests the whole corpus and finds connections nobody else can see.', specialties: ['Long Context', 'Synthesis', 'Codebase Review', 'Research'] },
  { name: 'Croesus',   handle: '@croesus-commerce', role: 'Commercialization Strategist',     avatar: '💎', color: '#fde047', headline: 'Profitable promotions only — proposes, never spends', bio: 'Files promotion proposals (sponsored placements, social ads, community boosts) with predicted ROI. Per-proposal cap $5, daily cap $20, dry-run by default. A human approves before any real money flows.', specialties: ['Commerce', 'ROI Modeling', 'Ad Targeting', 'Open Cloud'] },
];

export function getSocialRoster() {
  return socialRoster.map(a => ({
    ...a,
    stats: (() => {
      const agentWork = workLog.filter(e => e.agent === a.name);
      const done = agentWork.filter(e => e.action === 'task_completed').length;
      const subs = agentWork.filter(e => e.action === 'subtask_completed').length;
      const activeTasks = tasks.filter(t => t.assigned_to === a.name && t.status === 'in-progress').length;
      return { tasksCompleted: done, subtasksCompleted: subs, activeTasks, minutesLogged: agentWork.reduce((s, e) => s + e.minutesSpent, 0) };
    })(),
  }));
}

export function getAgentSocialFeed(agent: string, limit = 20) {
  const person = socialRoster.find(a => a.name === agent);
  if (!person) return null;

  // Posts from completed tasks
  const completedTasks = tasks.filter(t => t.assigned_to === agent && t.status === 'completed').slice(-limit);
  const taskPosts = completedTasks.map(t => ({
    id: `post-task-${t.id}`,
    type: 'completion' as const,
    timestamp: t.completed_at || new Date().toISOString(),
    title: `Shipped: ${t.title}`,
    body: t.description,
    meta: { sprint: t.sprint, hours: t.estimated_hours, priority: t.priority, subtasksDone: t.subtasks.filter(s => s.done).length },
    reactions: { like: 5 + Math.floor(Math.random() * 40), insight: 2 + Math.floor(Math.random() * 15), celebrate: 1 + Math.floor(Math.random() * 8) },
  }));

  // Posts from subtask completions (recent)
  const recentSubs = workLog.filter(e => e.agent === agent && e.action === 'subtask_completed').slice(-10);
  const subPosts = recentSubs.map((e, i) => ({
    id: `post-sub-${e.taskId}-${i}`,
    type: 'progress' as const,
    timestamp: e.timestamp,
    title: `Progress on "${e.taskTitle}"`,
    body: `Checked off: ${e.subtask} (+${e.minutesSpent} min logged).`,
    meta: { taskId: e.taskId, minutes: e.minutesSpent },
    reactions: { like: Math.floor(Math.random() * 8), insight: Math.floor(Math.random() * 4), celebrate: 0 },
  }));

  // Synthetic intro post for extended-roster agents (Cleopatra, Alexander, MoneyGod) with no work log yet
  const introPost = (taskPosts.length === 0 && subPosts.length === 0) ? [{
    id: `post-intro-${agent}`,
    type: 'intro' as const,
    timestamp: new Date().toISOString(),
    title: `Hello from ${agent}`,
    body: person.bio,
    meta: { role: person.role },
    reactions: { like: 12, insight: 3, celebrate: 5 },
  }] : [];

  const feed = [...introPost, ...taskPosts, ...subPosts]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, limit);

  return {
    profile: person,
    feed,
    pinned: taskPosts.slice(-3).reverse(),
  };
}

// Tick every 10 seconds
setInterval(tickEngine, 10000);
tickEngine();

// Persist state every 5s (only writes if dirty). Was 30s — reduced after
// the May-3 roadmap-delegation push was wiped by a systemd restart that
// fired SIGKILL after the SIGTERM exit handler timed out (the 68 MB
// snapshot takes ~500 ms to write and was hitting the systemd timeout).
// 5s narrows the loss window without overwhelming disk; the saveState fn
// uses tmp + rename for atomic writes so partial-write corruption stays out.
setInterval(() => {
  if (dirty) saveState();
}, 5000);

// Save immediately on clean shutdown so SIGTERM/SIGINT don't lose recent progress
function saveOnExit() {
  try { saveState(); } catch { /* best-effort */ }
}
process.once('SIGTERM', saveOnExit);
process.once('SIGINT', saveOnExit);
process.once('beforeExit', saveOnExit);
