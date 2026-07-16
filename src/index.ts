/**
 * VirtualPC - Fork with LightRAG, Kafka, Autonomous Agents
 *
 * Main entry point for the custom VirtualPC system.
 * Initializes: LightRAG, Kafka, Model Router, Agent Executor
 */

import express from 'express';
import { config } from 'dotenv';
import * as http from 'http';
import * as os from 'os';
import { Server as SocketIOServer } from 'socket.io';
import logger from './utils/logger';
import { readFileTail } from './utils/readFileTail';
import { KafkaOrchestrator } from './integrations/kafka/orchestrator';
import { LightRAGClient } from './integrations/lightrag/client';
import { AgentAPIWrapper } from './integrations/lightrag/agent-api';
import { P2PSync } from './integrations/lightrag/p2p-sync';
import { P2PGossip } from './integrations/lightrag/p2p-gossip';
import { FactValidator } from './integrations/lightrag/fact-validator';
import { InferenceEngine } from './integrations/lightrag/graph-inference';
import { AgentBridge } from './integrations/lightrag/agent-bridge';
import { seedQuantumAlgorithms } from './integrations/lightrag/quantum-schema';
import { registerGraphRoutes } from './integrations/lightrag/graph-api';
import { registerSnapshotRoutes } from './integrations/lightrag/graph-snapshot';
import { registerMonitorRoutes } from './integrations/lightrag/p2p-monitor';
import { registerQueryRoutes as registerGraphQueryRoutes } from './integrations/lightrag/graph-query';
import { registerProvenanceRoutes } from './integrations/lightrag/provenance';
import { registerNFCRoutes } from './integrations/lightrag/nfc-api';
import { NewsService, registerNewsRoutes } from './integrations/lightrag/news';
import { VoteCertificateService, registerVoteCertRoutes } from './integrations/lightrag/vote-certificate';
import { AttentionChainService, registerAttentionRoutes } from './integrations/lightrag/attention-chain';
import { P2PSwarm, registerSwarmRoutes } from './integrations/lightrag/p2p-swarm';
import { SovereignIdentityService, registerIdentityRoutes, didFromPublicKey } from './integrations/lightrag/identity';
import * as nodeCrypto from 'crypto';
import { ValueChainService, registerValueRoutes } from './integrations/lightrag/value-chain';
import { SovereignVotingService, registerSovereignVotingRoutes } from './integrations/lightrag/sovereign-voting';
import { ConsensusEngine, registerConsensusRoutes } from './integrations/lightrag/consensus';
import { ConsensusNetwork } from './integrations/lightrag/consensus-network';
import { ChainStore, defaultSnapshotPath } from './integrations/lightrag/chain-store';
import { UserApiService, registerUserRoutes } from './integrations/lightrag/user-api';
import { FeedService, registerFeedRoutes } from './integrations/lightrag/feed-api';
import { PqWalletService, registerPqRoutes } from './integrations/lightrag/wallet-vault';
import { DemocraticElectionService, registerElectionRoutes } from './integrations/lightrag/sovereign-elections';
import { GroupVotingService, registerGroupVotingRoutes } from './integrations/lightrag/group-voting';
import { GroupEventBus } from './integrations/lightrag/group-events';
import { MqttTelemetryAdapter } from './integrations/lightrag/transport-adapter';
import { FactMatrixService, registerFactMatrixRoutes } from './integrations/lightrag/fact-matrix';
import { mqttClientFromEnv } from './integrations/mqtt/mqtt-client';
import { BacklogService, registerHubBacklogRoutes } from './integrations/lightrag/backlog';
import { registerGitHubSyncRoutes, gitHubSyncFromEnv } from './integrations/backlog/github-sync';
import { registerGitLabSyncRoutes, gitLabSyncFromEnv } from './integrations/backlog/gitlab-sync';
import { LightningService, registerLightningRoutes, lightningFromEnv } from './integrations/lightrag/lightning';
import { protocolService, registerProtocolRoutes } from './integrations/lightrag/protocol-version';
import { AnchorService, defaultAnchorTargets, registerAnchorRoutes } from './integrations/chain/anchor';
import { OtsService, registerOtsRoutes } from './integrations/chain/opentimestamps';
import { ModelRouter } from './orchestration/model-router';
import { registerSkills } from './skills/register';
import setupOpenClawRoutes from './openclaw/openclaw-api';
import * as path from 'path';
import { MetricsDashboard } from './api/metrics-dashboard';
import { TaskScheduler } from './agent/task-scheduler';
import { SeasonalEventsManager } from './game/seasonal-events';
import { DeploymentManager } from './automation/deployment-manager';
import { CollaborationManager } from './features/collaboration';
import { AdvancedAnalytics } from './analytics/advanced-analytics';
import { BackupManager } from './automation/backup-manager';
import { AuditLogger } from './security/audit-logger';
import VitalsService from './vitals/vitals-service';
import InferenceAudit from './vitals/inference-audit';
import SelfRepair from './vitals/self-repair';
import { EntityModel } from './integrations/numerai/entity-model';
import NumeraiDataFetcher from './integrations/numerai/data-fetcher';
import OpenClawEDBBridge from './integrations/numerai/openclaw-edb-bridge';
import { killSwitch } from './openclaw-kill-switch';
import TaskFacilitator from './agent/task-facilitator';
import AutonomousSessionManager from './automation/autonomous-session-manager';
import AuthSystem from './auth/auth-system';
import { ASSET_REGISTRY_PATH } from './config/paths';
import { loadSecrets, resolveFieldCrypto, setActiveSecrets, secretOrEnv } from './security/secretsBootstrap';
import AuthMiddleware from './auth/auth-middleware';
import CEOAuditLogger from './auth/audit-logger';
import SpecialistDashboards from './auth/specialist-dashboards';
import setupAuthRoutes from './auth/auth-routes';
import setupAuditRoutes from './auth/audit-routes';
import setupSpecialistRoutes from './auth/specialist-routes';
import { AuditRetentionScheduler } from './auth/audit-retention';
import { LoginAnomalyMonitor } from './security/loginAnomalyMonitor';
import { setupOpenApiRoutes } from './api/openapi';
import GitHubSync from './automation/github-sync';
import setupGitHubRoutes from './automation/github-routes';
import { SecurityDashboard } from './security/securityDashboard';
import { securityHeaders } from './security/securityHeaders';
import { AdvancedRateLimiter } from './security/rateLimiter';
import { internalWriteAuth } from './middleware/internalWriteAuth';
import setupSecurityRoutes from './security/security-routes';
import { QualityDashboard } from './quality/qualityDashboard';
import setupQualityRoutes from './quality/quality-routes';
import { activityMonitor } from './terminal-activity-monitor';
import * as taskEngine from './task-engine';
import * as tokenTracker from './token-tracker';
import * as resourceModelRouter from './model-router';
import * as commitsTracker from './commits-tracker';
import * as lmstudio from './lmstudio';
import { AGENT_META } from './agent-registry';
import * as fs from 'fs';
import * as codegraph from './integrations/codegraph';
import * as governance from './integrations/governance';
import * as wiki from './integrations/wiki';
import * as scrum from './integrations/scrum';
import * as forum from './integrations/forum';
import * as kami from './integrations/kami';
import * as corpus from './integrations/corpus';
import { registerPlanRoutes } from './plan-review';
import { registerDataQualityRoutes } from './data-quality';
import { registerFinanceRoutes } from './finance';
import { registerGpuRoutes, getGpuAvailable } from './gpu';
import { registerInferenceRoutes } from './integrations/local-inference/inference-routes';
import { registerQueryRoutes } from './query-builder';
import { registerSpectroscopyRoutes } from './spectroscopy';
import { registerAssetMirrorRoutes } from './assets';
import { registerCodexRoutes } from './codex';
import { registerTournamentRoutes } from './org/tournament-routes';
import { registerRequirementRoutes } from './requirements';
import { registerFundamentalRoutes } from './fundamentals/routes';
import { MicroPostStore, DaoParamStore, MicroPostGossip, registerMicroPostRoutes } from './integrations/lightrag/micro-post';
import { SilkNodeRegistry, SilkGossip, registerSilkRoutes } from './integrations/lightrag/silk-net';
import { PulseEngine, PulseWalletStore, KnotValidationStore, registerPulseRoutes } from './integrations/lightrag/pulse';
import { RiskKnotStore, registerRiskRoutes } from './integrations/lightrag/risk-knot';
import { resolveModel } from './gpu/availability';
import * as mcp from './integrations/mcp/registry';
import * as autoresearch from './integrations/autoresearch';
import * as selfheal from './integrations/selfheal';
import { guardrailsAgent } from './guardrails/guardrails-agent';
import { containmentGuard, setupContainmentRoutes } from './containment';
import { setupPlaytestRoutes } from './playtest';
import { analyzeCsv } from './timeseries';
import * as credentials from './credentials';
import * as commercialization from './commercialization';
import * as commitAudit from './commit-audit';

// Load environment
config();
// Re-load credentials now that dotenv has populated process.env: the module's
// boot-time load ran at import (before config()), so FIELD_ENCRYPTION_KEY from
// .env was not yet visible. This pass decrypts api_keys and migrates any
// plaintext-at-rest to encrypted (no-op when the key is unset). See #31.
credentials.loadCredentials();

const app = express();
const server = http.createServer(app);
// Restrict WebSocket CORS to the local dashboards. `origin: '*'` let any
// website on the internet open a socket to this server, violating the
// local-only posture. Override with SOCKET_CORS_ORIGINS (comma-separated)
// if the dashboard is ever served from another origin.
const SOCKET_CORS_ORIGINS = (process.env.SOCKET_CORS_ORIGINS ||
  'http://localhost:3000,http://localhost:3100,http://127.0.0.1:3000,http://127.0.0.1:3100')
  .split(',').map(o => o.trim()).filter(Boolean);
const io = new SocketIOServer(server, {
  cors: { origin: SOCKET_CORS_ORIGINS, methods: ['GET', 'POST'] }
});
const PORT = process.env.PORT || 3100;
// Bind to loopback by default so the API is NOT exposed on the network. A prior
// security review found the server bound 0.0.0.0 with most routes unauthenticated.
// Set HOST=0.0.0.0 to deliberately expose it on the LAN — doing so also flips the
// internal-write guard into enforce mode (see internalWriteAuth below).
const HOST = process.env.HOST || '127.0.0.1';
const BOUND_NON_LOCAL = !['127.0.0.1', 'localhost', '::1'].includes(HOST);
const SERVER_START_TIME = Date.now();

// Middleware
// Bumped from default 100kb so /api/migration/slag/claim can accept a base64-
// encoded screenshot (~5 MB worst case after the ~33% base64 overhead).
app.use(express.json({ limit: '6mb' }));

// ── Security middleware (mounted before any route so it applies globally) ──
// 1) Response security headers. Safe-by-default; strict mode (COEP/COOP/strict
//    CSP/X-Frame DENY) is opt-in via ENFORCE_STRICT_SECURITY — see
//    src/security/securityHeaders.ts.
app.use(securityHeaders);

// 2) Global per-IP rate limiter. Default 1200 req/min/IP with a 60s window.
//    The recon measured a single multi-dashboard browser at ~270 req/min, and
//    all LOCAL dashboards share one bucket (req.ip == 127.0.0.1, no trust
//    proxy), so the headroom covers a power user with several tabs. External
//    attackers each get their OWN per-IP bucket, so the flooding-defense value
//    is unaffected by the generous localhost ceiling. Socket.IO + the canonical
//    liveness probes are exempt (bypassed before the limiter). cleanup() runs
//    every 5 min so the in-memory store can't leak; the timer is unref'd.
const rateLimitEnabled = (process.env.RATE_LIMIT_ENABLED ?? 'true').toLowerCase() !== 'false';
if (rateLimitEnabled) {
  const rateLimiter = new AdvancedRateLimiter();
  // Parse defensively: a non-numeric / non-positive env value would otherwise
  // yield NaN (perIp's `count >= NaN` is always false → limiting silently off)
  // or disable limiting, so fall back to the safe default instead.
  const parsePositive = (v: string | undefined, fallback: number): number => {
    const n = parseInt(v ?? '', 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const windowMs = parsePositive(process.env.RATE_LIMIT_WINDOW_MS, 60000);
  const maxRequests = parsePositive(process.env.RATE_LIMIT_MAX_REQUESTS, 1200);
  const limiterMw = rateLimiter.perIp({ windowMs, maxRequests });
  // Exempt the persistent WebSocket transport and the two canonical liveness
  // probes by BYPASSING the limiter entirely — perIp() has no skip path (a null
  // key buckets under 'unknown'), so exemption must happen before it runs.
  // NOTE: match the health probes EXACTLY, not by `/health` suffix — a suffix
  // match let an attacker dodge the limiter with any `/x/health` path. The
  // per-subsystem health routes (/api/llm/health, …) are low-frequency and stay
  // rate-limited, which 1200/min easily accommodates.
  const EXEMPT_PATHS = new Set(['/health', '/api/health']);
  const isExempt = (p: string) => p.startsWith('/socket.io') || EXEMPT_PATHS.has(p);
  app.use((req, res, next) => (isExempt(req.path || '') ? next() : limiterMw(req, res, next)));
  const cleanupTimer = setInterval(() => rateLimiter.cleanup(), 5 * 60 * 1000);
  if (typeof cleanupTimer.unref === 'function') cleanupTimer.unref();
  logger.info(`Rate limiter enabled: ${maxRequests} req / ${windowMs}ms per IP (socket.io + health exempt)`);
} else {
  logger.warn('Rate limiter disabled (RATE_LIMIT_ENABLED=false)');
}

// 3) Guard the internal-only write endpoints. Localhost callers always pass;
//    non-local callers need INTERNAL_WRITE_SERVICE_TOKEN. WARN mode (log-but-
//    allow) when bound to loopback so local dev is non-breaking, but ENFORCE
//    automatically when the server is deliberately exposed on the network
//    (HOST != loopback) so the high-risk routes can't be hit unauthenticated.
//    INTERNAL_WRITE_ENFORCE=true forces enforce even on loopback.
const enforceInternalWrites =
  BOUND_NON_LOCAL || (process.env.INTERNAL_WRITE_ENFORCE || '').toLowerCase() === 'true';
if (BOUND_NON_LOCAL) {
  logger.warn(
    `[security] HOST=${HOST} exposes the API on the network — internal-write guard set to ENFORCE. ` +
      `Set INTERNAL_WRITE_SERVICE_TOKEN for non-local callers.`,
  );
}
app.use(internalWriteAuth({ enforce: enforceInternalWrites }));

// Plan review — make plans available from VirtualPC + per-section human comments
// that relay back to the agents. See src/plan-review + /plan-review.html.
registerPlanRoutes(app);
// Data-quality daemon — continuous profiling + SLA on the platform's datasets.
registerDataQualityRoutes(app);
// Finance — intangible-asset (immateriële activa) capitalization report + ROI.
registerFinanceRoutes(app);
// Fundamentals, news, and filings storage with source + publication date.
registerFundamentalRoutes(app);
// GPU daemon — availability detection (3h), dynamic no-GPU model fallback, and
// LM Studio auto-boot when a GPU returns.
registerGpuRoutes(app);
// Inference throughput governor — hardware-adaptive concurrency control + calibration.
registerInferenceRoutes(app);
// Query builder — saved, parameterised, versioned queries over the knowledge surfaces.
registerQueryRoutes(app);
// Spectroscopy — ingest + peak detection for real spectra (Engel QChem payload).
registerSpectroscopyRoutes(app);
// Asset mirror coverage — Roblox→Web cross-platform remediation plan for designers.
registerAssetMirrorRoutes(app);
// Codex bridge — coding/review tasks via codex exec (GPT-5.5 dev leg).
registerCodexRoutes(app);
// Dev tournament — 3-developer competing-branch regime.
registerTournamentRoutes(app);
// Requirements register — USDP use-case-driven requirements with traceability.
registerRequirementRoutes(app);
// Force fresh HTML on every load so updates (new agents, panels, fixes)
// show up immediately instead of serving stale cached markup.
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});
app.use(express.static('dist/public'));
app.use(express.static('public'));

// Helper function to serve the dashboard. Previously this fell through to a
// stale snapshot at dist/public/index.html that someone had hand-copied from
// public/dashboard.html months ago — it drifted and started showing only 5
// agents instead of the full 14. Serve the live file from public/ so the
// dashboard can never go out of date again.
function serveSPAFile(_req: express.Request, res: express.Response) {
  const dashPath = path.resolve(__dirname, '..', 'public', 'dashboard.html');
  res.type('html').sendFile(dashPath, (err: any) => {
    if (err) {
      logger.error('Error serving dashboard.html:', err);
      res.status(500).send('Error loading dashboard');
    }
  });
}

// Newsgroup 2.0 frontend — design rationale in docs/NEWSGROUP-FRONTEND-LESSONS.md
app.get('/newsgroup', (_req, res) => {
  res.type('html').sendFile(path.resolve(__dirname, '..', 'public', 'newsgroup.html'), (err: any) => {
    if (err) res.status(500).send('Error loading newsgroup frontend');
  });
});

// Dashboard is now served at root (localhost:3100) - no separate /dashboard route needed

// Data-agent dashboard + config pages (also served by express.static, explicit routes for discoverability)
app.get('/data-agent-dashboard', (_req, res) => {
  res.type('html').sendFile(path.resolve(__dirname, '..', 'public', 'data-agent-dashboard.html'), (err: any) => {
    if (err) res.status(500).send('Error loading data-agent dashboard');
  });
});

app.get('/data-agent-config', (_req, res) => {
  res.type('html').sendFile(path.resolve(__dirname, '..', 'public', 'data-agent-config.html'), (err: any) => {
    if (err) res.status(500).send('Error loading data-agent config');
  });
});

// Data-science starter example — JSON mirror of public/examples/data-science/starter.py
app.get('/api/data-science/starter', (_req, res) => {
  const filePath = path.resolve(__dirname, '..', 'public', 'examples', 'data-science', 'starter.py');
  try {
    const code = require('fs').readFileSync(filePath, 'utf8');
    res.json({
      ok: true,
      title: 'VirtualPC Data Science Starter',
      description: 'Minimal self-contained example: load CSV, validate, engineer features, baseline regression, outlier detection.',
      file_path: '/examples/data-science/starter.py',
      code,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Terminal Activity Monitor - Track what's happening in both terminals
app.get('/api/terminal/activity', (req, res) => {
  const terminal = req.query.terminal as 'A' | 'B';
  const limit = parseInt(req.query.limit as string) || 50;

  if (terminal) {
    res.json({
      terminal,
      activities: activityMonitor.getTerminalActivities(terminal, limit),
      status: activityMonitor.getTerminalStatus(terminal),
      compactionNeeded: activityMonitor.isCompactionNeeded(terminal)
    });
  } else {
    res.json({
      summary: activityMonitor.getSummary(),
      recentActivities: activityMonitor.getActivities(limit),
      highPriorityActivities: activityMonitor.getHighPriorityActivities()
    });
  }
});

// Per-Person Backlog API - LIVE from task engine
app.get('/api/backlog/per-person', (req, res) => {
  res.json(taskEngine.getPerPersonBacklog());
});

// Per-task mutations used by the dashboard's agent-detail Tasks panel.
// These operate on the canonical task-engine `tasks` array (same store that
// drives /api/backlog/per-person), not the separate taskScheduler.
app.post('/api/backlog/:id/status', (req, res) => {
  const next = String(req.body?.status || '');
  if (!['pending', 'in-progress', 'completed'].includes(next)) {
    res.status(400).json({ success: false, error: 'status must be pending|in-progress|completed' });
    return;
  }
  const updated = taskEngine.setTaskStatus(req.params.id, next as any);
  if (!updated) { res.status(404).json({ success: false, error: 'task not found' }); return; }
  res.json({ success: true, task: { id: updated.id, status: updated.status, completed_at: updated.completed_at, progress: updated.progress } });
});

app.post('/api/backlog/:id/priority', (req, res) => {
  const next = String(req.body?.priority || '');
  if (!['critical', 'high', 'medium', 'low'].includes(next)) {
    res.status(400).json({ success: false, error: 'priority must be critical|high|medium|low' });
    return;
  }
  const updated = taskEngine.setTaskPriority(req.params.id, next as any);
  if (!updated) { res.status(404).json({ success: false, error: 'task not found' }); return; }
  res.json({ success: true, task: { id: updated.id, priority: updated.priority } });
});

// Heuristic: pick the most appropriate lightweight Data-* agent for a data task.
function routeDataTask(title: string, description: string): string {
  const text = `${title} ${description}`.toLowerCase();
  if (/schema|catalog|steward|quality|duplicate|currency|unit|governance|lineage|retention|pii/.test(text)) return 'Data-Steward';
  if (/etl|pipeline|feature|engineer|partition|normalize|parquet|idempotency|clean|extract|transform/.test(text)) return 'Data-Engineer';
  if (/regression|classification|clustering|model|experiment|feature importance|isolation forest|residual|cross-validation|hyperparameter|baseline/.test(text)) return 'Data-Scientist';
  if (/snapshot|version|refresh|dashboard publish|lineage report|backlog grooming|artifact count|workspace status/.test(text)) return 'Data-Manager';
  // default analyst covers summary, chart, outlier, peer comparison, etc.
  return 'Data-Analyst';
}

// External delegators inject roadmap items here. Validates agent name
// against the canonical roster so a typo can't create an orphan task.
// Pass assigned_to: "auto" to route data-domain tasks to the lightweight Data-* agents.
app.post('/api/backlog/items', (req, res) => {
  const b = req.body || {};
  if (!b.title || !b.description || !b.assigned_to) {
    res.status(400).json({ success: false, error: 'title, description, assigned_to required' });
    return;
  }
  let assigned_to = String(b.assigned_to);
  if (assigned_to.toLowerCase() === 'auto') {
    assigned_to = routeDataTask(String(b.title), String(b.description));
  }
  const t = taskEngine.addTask({
    title: String(b.title),
    description: String(b.description),
    priority: b.priority,
    assigned_to,
    estimated_hours: typeof b.estimated_hours === 'number' ? b.estimated_hours : undefined,
    subtasks: Array.isArray(b.subtasks) ? b.subtasks.map(String) : undefined,
    sprint: b.sprint ? String(b.sprint) : undefined,
  });
  if (!t) {
    res.status(400).json({ success: false, error: `unknown agent '${assigned_to}' — must be in the canonical roster` });
    return;
  }
  res.json({ success: true, task: { id: t.id, title: t.title, assigned_to: t.assigned_to, priority: t.priority, status: t.status } });
});

// ============================================================================
// GitHub proxy for knitweb/virtualpc — read-only access to the knowledge dirs
// (.backlog, .admin, .creative, .governance, .operations). The repo is private
// so the dashboard's external <a href> links 404 for unauthenticated visitors.
// This proxy uses the local `gh` CLI's keyring auth to fetch the file content,
// so the dashboard can show it inline. Hardcoded allow-list of path prefixes
// prevents using the proxy as a generic GitHub fetcher.
// ============================================================================
const GH_REPO = 'knitweb/virtualpc';
const GH_ALLOWED_DIRS = ['.backlog', '.admin', '.creative', '.governance', '.operations'];

// Map agent name → known doc paths in the repo. Used by the agent-detail panel.
const GH_AGENT_DOCS: { [name: string]: string[] } = {
  Mira:      ['.creative/MIRA-CREATIVE-AUTHORITY.md', '.creative/MIRA-DESIGN-BRIEF.md'],
  Cleopatra: ['.governance/CLEOPATRA-AUTHORITY.md'],
  MoneyGod:  ['.governance/MONEYGOD-AUTHORITY.md'],
  Alexander: ['.governance/ALEXANDER-PRINCIPLES.md', '.operations/ALEXANDER-COMMAND-INTERFACE.md'],
};

function ghPathAllowed(p: string): boolean {
  if (p.includes('..') || p.startsWith('/')) return false;
  return GH_ALLOWED_DIRS.some(d => p === d || p.startsWith(d + '/'));
}

function ghApiFetch(repoPath: string): Promise<{ path: string; content: string; size: number; html_url: string; encoding: string }> {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process');
    // 15s timeout so a slow/hung `gh` call can't block the request indefinitely
    // (the event loop isn't blocked, but the awaiting request would hang forever).
    execFile('gh', ['api', `repos/${GH_REPO}/contents/${repoPath}`], { maxBuffer: 4 * 1024 * 1024, timeout: 15000 }, (err: any, stdout: string, stderr: string) => {
      if (err) { reject(new Error(stderr || err.message)); return; }
      try {
        const j = JSON.parse(stdout);
        if (j.encoding === 'base64' && j.content) {
          j.content = Buffer.from(j.content, 'base64').toString('utf-8');
        }
        resolve(j);
      } catch (e: any) { reject(e); }
    });
  });
}

// List files in an allowed directory.
app.get('/api/github/virtualpc/list', async (req, res) => {
  const dir = String(req.query.dir || '');
  if (!GH_ALLOWED_DIRS.includes(dir)) {
    res.status(400).json({ success: false, error: `dir must be one of: ${GH_ALLOWED_DIRS.join(', ')}` });
    return;
  }
  try {
    const j = await ghApiFetch(dir);
    const items = Array.isArray(j) ? j : [j];
    res.json({ success: true, dir, files: items.map((x: any) => ({ name: x.name, path: x.path, size: x.size, type: x.type, html_url: x.html_url })) });
  } catch (e: any) { res.status(502).json({ success: false, error: e.message }); }
});

// Fetch a single file's markdown content.
app.get('/api/github/virtualpc/file', async (req, res) => {
  const p = String(req.query.path || '');
  if (!ghPathAllowed(p)) {
    res.status(400).json({ success: false, error: `path must start with one of: ${GH_ALLOWED_DIRS.join(', ')}` });
    return;
  }
  try {
    const j: any = await ghApiFetch(p);
    res.json({ success: true, path: j.path, content: j.content, size: j.size, html_url: j.html_url });
  } catch (e: any) { res.status(502).json({ success: false, error: e.message }); }
});

// List the github authority docs known for a given agent.
app.get('/api/github/agent-docs/:name', async (req, res) => {
  const docs = GH_AGENT_DOCS[req.params.name] || [];
  res.json({ success: true, agent: req.params.name, repo: GH_REPO, docs: docs.map(p => ({ path: p, html_url: `https://github.com/${GH_REPO}/blob/main/${p}` })) });
});

// ============================================================================
// Codegraph (GitNexus-compatible) — structural index of src/**.ts so agents
// don't have to read the whole repo to answer "where is X defined?" or
// "who calls Y?". Builds on demand, caches to data/codegraph.json (30 min TTL).
// Pairs with the existing LightRAG integration: codegraph = "how" (structure),
// LightRAG = "why" (semantics from docs/comments).
// ============================================================================
const REPO_ROOT = path.resolve(__dirname, '..');

app.get('/api/codegraph/stats', (_req, res) => {
  try { res.json({ success: true, ...codegraph.summarize(codegraph.getCodegraph(REPO_ROOT)) }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/codegraph/rebuild', (_req, res) => {
  try {
    const t0 = Date.now();
    const g = codegraph.getCodegraph(REPO_ROOT, true);
    res.json({ success: true, builtInMs: Date.now() - t0, ...codegraph.summarize(g) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/codegraph/symbol/:name', (req, res) => {
  try {
    const g = codegraph.getCodegraph(REPO_ROOT);
    const defs = codegraph.findSymbol(g, req.params.name);
    const refs = codegraph.findReferences(g, req.params.name);
    res.json({ success: true, name: req.params.name, definitions: defs, referencedBy: refs });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/codegraph/file', (req, res) => {
  try {
    const rel = String(req.query.path || '');
    if (!rel || rel.includes('..')) { res.status(400).json({ success: false, error: 'path required' }); return; }
    const g = codegraph.getCodegraph(REPO_ROOT);
    const file = g.files[rel];
    if (!file) { res.status(404).json({ success: false, error: 'file not in graph' }); return; }
    res.json({
      success: true,
      file,
      dependencies: g.dependencies?.[rel] || [],
      importedBy:   g.importedBy?.[rel] || [],
    });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// Cross-file dependency view — borrowed from GitNexus. Lets agents ask
// "what does file X depend on?" and "what depends on X?" without parsing
// the whole graph client-side.
app.get('/api/codegraph/dependencies', (req, res) => {
  try {
    const rel = req.query.path ? String(req.query.path) : null;
    const g = codegraph.getCodegraph(REPO_ROOT);
    if (rel) {
      if (rel.includes('..')) { res.status(400).json({ success: false, error: 'path traversal' }); return; }
      res.json({
        success: true,
        path: rel,
        imports: g.dependencies?.[rel] || [],
        importedBy: g.importedBy?.[rel] || [],
      });
    } else {
      // Fan-in / fan-out summary across the whole graph
      const fanIn  = Object.entries(g.importedBy || {}).map(([p, arr]) => ({ path: p, count: arr.length }));
      const fanOut = Object.entries(g.dependencies || {}).map(([p, arr]) => ({ path: p, count: arr.length }));
      fanIn.sort((a, b) => b.count - a.count);
      fanOut.sort((a, b) => b.count - a.count);
      res.json({
        success: true,
        topImported: fanIn.slice(0, 20),
        topImporters: fanOut.slice(0, 20),
        totalEdges: Object.values(g.dependencies || {}).reduce((s, a) => s + a.length, 0),
      });
    }
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/codegraph/search', (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) { res.status(400).json({ success: false, error: 'q required' }); return; }
    const g = codegraph.getCodegraph(REPO_ROOT);
    const matches = codegraph.findSymbol(g, q);
    const limited = matches.slice(0, 30);
    res.json({ success: true, q, matchCount: matches.length, matches: limited });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================================
// Data governance — Governor agent owns shared/*.json + asset registry +
// wiki lineage. Read endpoints are open (any agent can lookup); write is
// gated to Governor or the autonomous regenerate-docs script.
// ============================================================================
app.get('/api/governance', (req, res) => {
  try {
    const kind = req.query.kind as governance.GovernanceKind | undefined;
    const owner = req.query.owner as string | undefined;
    const tag = req.query.tag as string | undefined;
    res.json({ success: true, entries: governance.listEntries({ kind, owner, tag }) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/governance/lineage/:id', (req, res) => {
  try {
    const r = governance.getLineage(String(req.params.id));
    res.json({ success: true, ...r });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/governance/register', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.id || !body.name || !body.kind || !body.owner || !body.source) {
      res.status(400).json({ success: false, error: 'id, name, kind, owner, source required' });
      return;
    }
    const entry = governance.registerEntry(body);
    // Best-effort knowledge-graph notify (fire-and-forget).
    const hooks = (app as any).locals.governanceGraphHooks;
    const lr = (app as any).locals.lightrag;
    if (hooks && lr) hooks.notifyGovernanceWrite(lr, entry);
    res.json({ success: true, entry });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================================
// Wiki — game terms + quantum chemical engineering glossary. Pixel renders
// /wiki on molgang-web from these entries; Kimi authors them.
// ============================================================================
app.get('/api/wiki', (req, res) => {
  try {
    const namespace = req.query.namespace as wiki.WikiNamespace | undefined;
    const q = req.query.q as string | undefined;
    res.json({ success: true, entries: wiki.listEntries({ namespace, q }) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/wiki/:id', (req, res) => {
  try {
    const e = wiki.getEntry(String(req.params.id));
    if (!e) { res.status(404).json({ success: false, error: 'not found' }); return; }
    res.json({ success: true, entry: e });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/wiki', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.id || !body.term || !body.namespace || !body.summary || !body.body) {
      res.status(400).json({ success: false, error: 'id, term, namespace, summary, body required' });
      return;
    }
    const entry = wiki.upsertEntry(body);
    // Best-effort knowledge-graph notify (fire-and-forget).
    const hooks = (app as any).locals.governanceGraphHooks;
    const lr = (app as any).locals.lightrag;
    if (hooks && lr) hooks.notifyWikiWrite(lr, entry);
    res.json({ success: true, entry });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================================
// Scrum — standup feed + bug-report ingestion per team. Hermes coordinators
// drive the standups; testers file bugs; Fill / Cleopatra read across teams.
// ============================================================================
app.get('/api/scrums', (_req, res) => {
  try { res.json({ success: true, ...scrum.summary() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/scrums/:team/standups', (req, res) => {
  try {
    const team = req.params.team as scrum.ScrumTeam;
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : 50;
    res.json({ success: true, team, items: scrum.listStandups(team, limit) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/scrums/:team/standup', (req, res) => {
  try {
    const team = req.params.team as scrum.ScrumTeam;
    const { agent, body } = req.body || {};
    if (!agent || !body) { res.status(400).json({ success: false, error: 'agent + body required' }); return; }
    res.json({ success: true, item: scrum.logStandup(team, agent, body) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/scrums/:team/bugs', (req, res) => {
  try {
    const team = req.params.team as scrum.ScrumTeam;
    const status = req.query.status as scrum.BugReport['status'] | undefined;
    const severity = req.query.severity as scrum.BugSeverity | undefined;
    res.json({ success: true, team, bugs: scrum.listBugs({ team, status, severity, limit: 100 }) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/scrums/:team/bug', (req, res) => {
  try {
    const team = req.params.team as scrum.ScrumTeam;
    const { reporter, title, body, severity, surface, refs } = req.body || {};
    if (!reporter || !title || !body) { res.status(400).json({ success: false, error: 'reporter + title + body required' }); return; }
    res.json({ success: true, bug: scrum.fileBug({ team, reporter, title, body, severity, surface, refs }) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/scrums/bug/:id/update', (req, res) => {
  try {
    const updated = scrum.updateBug(req.params.id, req.body || {});
    if (!updated) { res.status(404).json({ success: false, error: 'not found' }); return; }
    res.json({ success: true, bug: updated });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================================
// Forum — testers share tips/tricks/feature ideas in their team's subforum.
// ============================================================================
app.get('/api/forum/:team', (req, res) => {
  try {
    const team = req.params.team as forum.ForumTeam;
    const tag = req.query.tag as string | undefined;
    const q = req.query.q as string | undefined;
    res.json({ success: true, team, threads: forum.listThreads({ team, tag, q, limit: 50 }) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/forum/:team', (req, res) => {
  try {
    const team = req.params.team as forum.ForumTeam;
    const { author, title, body, tags } = req.body || {};
    if (!author || !title || !body) { res.status(400).json({ success: false, error: 'author + title + body required' }); return; }
    const parsedTags = typeof tags === 'string'
      ? tags.split(',').map((s: string) => s.trim()).filter(Boolean)
      : Array.isArray(tags) ? tags : undefined;
    res.json({ success: true, thread: forum.createThread({ team, author, title, body, tags: parsedTags }) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/forum/thread/:id', (req, res) => {
  try {
    const t = forum.getThread(req.params.id);
    if (!t) { res.status(404).json({ success: false, error: 'not found' }); return; }
    res.json({ success: true, thread: t });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/forum/thread/:id/reply', (req, res) => {
  try {
    const { author, body } = req.body || {};
    if (!author || !body) { res.status(400).json({ success: false, error: 'author + body required' }); return; }
    const r = forum.reply(req.params.id, author, body);
    if (!r) { res.status(404).json({ success: false, error: 'thread not found' }); return; }
    res.json({ success: true, reply: r });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================================
// Kami — doc-brief queue. Agents queue briefs here describing typeset
// documents they want; a Claude Code session (with the Kami skill
// installed at ~/.claude/skills/kami) drains the queue and renders.
// virtualpc never tries to invoke `claude` itself — auth + autoloop-hook
// recursion would bite. The renderer marks each brief delivered when
// the HTML/PDF lands at outputPath.
// ============================================================================
app.get('/api/kami/briefs', (req, res) => {
  try {
    const status = req.query.status as kami.KamiStatus | undefined;
    const requester = req.query.requester as string | undefined;
    const limit = req.query.limit ? parseInt(String(req.query.limit)) : 50;
    res.json({ success: true, briefs: kami.listBriefs({ status, requester, limit }) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/kami/briefs/:id', (req, res) => {
  try {
    const b = kami.getBrief(String(req.params.id));
    if (!b) { res.status(404).json({ success: false, error: 'not found' }); return; }
    res.json({ success: true, brief: b });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/kami/queue', (req, res) => {
  try {
    const body = req.body || {};
    if (!body.requester || !body.type || !body.title || !body.outline) {
      res.status(400).json({ success: false, error: 'requester, type, title, outline required' });
      return;
    }
    res.json({ success: true, brief: kami.queueBrief(body) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/kami/briefs/:id/status', (req, res) => {
  try {
    const { status, notes } = req.body || {};
    if (!status) { res.status(400).json({ success: false, error: 'status required' }); return; }
    const b = kami.setStatus(req.params.id, status, notes);
    if (!b) { res.status(404).json({ success: false, error: 'not found' }); return; }
    res.json({ success: true, brief: b });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/kami/summary', (_req, res) => {
  try { res.json({ success: true, ...kami.summary() }); }
  catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================================
// Corpus — semantic-chunked + vector-embedded knowledge store. Hybrid
// search via the same Neo4j instance LightRAG uses (separate :Corpus
// label + native vector index, 768-dim from nomic-embed). Lets agents
// retrieve prior context before reasoning — closes the "agent reasons
// from scratch" cost gap. See § 10 of VIRTUALPC-ARCHITECTURE.md.
// ============================================================================
app.get('/api/corpus/search', async (req, res) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) { res.status(400).json({ success: false, error: 'q required' }); return; }
    const k = Math.min(50, Math.max(1, parseInt(String(req.query.k || '8'))));
    const sourceKind = req.query.kind ? String(req.query.kind) as corpus.CorpusChunk['source_kind'] : undefined;
    const lr = (app as any).locals.lightrag;
    if (!lr) { res.json({ success: true, results: [], note: 'lightrag not initialized' }); return; }
    const results = await corpus.search(lr, q, { k, sourceKind });
    res.json({ success: true, q, k, count: results.length, results });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/corpus/stats', async (_req, res) => {
  try {
    const lr = (app as any).locals.lightrag;
    if (!lr) { res.json({ success: true, total: 0, by_kind: {}, vector_indexed: 0, offline: true }); return; }
    const s = await corpus.stats(lr);
    res.json({ success: true, ...s });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/corpus/ingest', async (req, res) => {
  try {
    const chunks = req.body?.chunks;
    if (!Array.isArray(chunks)) { res.status(400).json({ success: false, error: 'chunks[] required' }); return; }
    const lr = (app as any).locals.lightrag;
    if (!lr) { res.status(503).json({ success: false, error: 'lightrag not initialized' }); return; }
    const r = await corpus.ingestChunks(lr, chunks);
    res.json({ success: true, ...r });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================================
// MCP — tool-use coordination layer. Replaces the need for OpenAI Symphony
// for tool orchestration: each agent has an ACL (`tools` field on AgentMeta)
// and every tool call goes through this dispatcher. Both Claude CLI and
// Kimi CLI can consume this catalogue once we shim it to the MCP RPC shape;
// for now agents call directly via /api/mcp/call.
// ============================================================================
app.get('/api/mcp/tools', (req, res) => {
  try {
    const agent = req.query.agent as string | undefined;
    res.json({ success: true, agent: agent || null, tools: mcp.listTools(agent) });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/api/mcp/call', async (req, res) => {
  try {
    const { agent, tool, args } = req.body || {};
    if (!agent || !tool) {
      res.status(400).json({ success: false, error: 'agent + tool required' });
      return;
    }
    const r = await mcp.callTool(String(agent), String(tool), args || {});
    if (!r.ok) { res.status(403).json({ success: false, error: r.error }); return; }
    res.json({ success: true, result: r.result });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================================
// Docs regeneration — kicks scripts/regenerate-docs.js which uses Kimi
// (taskType:'docs') to refresh README, architecture, and wiki entries.
// Long-running; returns the run id so the caller can poll if needed.
// ============================================================================
app.post('/api/docs/regenerate', async (req, res) => {
  try {
    const scope = String(req.body?.scope || 'all');
    // Allow-list the scope before it reaches the spawned script as a CLI arg.
    // regenerate-docs.js only understands these four values; anything else is
    // either a typo or an injection attempt and must not be forwarded.
    const ALLOWED_SCOPES = ['all', 'readme', 'architecture', 'wiki'];
    if (!ALLOWED_SCOPES.includes(scope)) {
      res.status(400).json({ success: false, error: `invalid scope; allowed: ${ALLOWED_SCOPES.join(', ')}` });
      return;
    }
    const { spawn } = require('child_process');
    const script = path.join(REPO_ROOT, 'scripts', 'regenerate-docs.js');
    if (!require('fs').existsSync(script)) {
      res.status(404).json({ success: false, error: `script not found: ${script}` });
      return;
    }
    const child = spawn('node', [script, '--scope', scope], { detached: true, stdio: 'ignore', cwd: REPO_ROOT });
    child.unref();
    res.json({ success: true, scope, pid: child.pid, note: 'queued — Kimi-backed long-context author runs in background' });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// ============================================================================
// Auto-research (Karpathy-style) — reserved for the research-flavored agents
// (Vice, Kimi, Analyst, Atlas). Plans → probes the codegraph for evidence →
// synthesizes → self-critiques. Pure-local Gemma 4 calls, zero API credits.
// ============================================================================
app.post('/api/autoresearch', async (req, res) => {
  const agent = String(req.body?.agent || '');
  const question = String(req.body?.question || '');
  if (!agent || !question) { res.status(400).json({ success: false, error: 'agent + question required' }); return; }
  if (!autoresearch.RESEARCH_AGENTS.includes(agent)) {
    res.status(400).json({ success: false, error: `agent must be one of: ${autoresearch.RESEARCH_AGENTS.join(', ')}` });
    return;
  }
  try {
    const r = await autoresearch.research({
      agent,
      question,
      sources: Array.isArray(req.body?.sources) ? req.body.sources : ['corpus', 'codegraph'],
      staticContext: Array.isArray(req.body?.staticContext) ? req.body.staticContext : undefined,
      maxSubQuestions: Number(req.body?.maxSubQuestions) || undefined,
      maxDepth: Number(req.body?.maxDepth) || undefined,
      rootDir: REPO_ROOT,
      lightragClient: (req.app as any).locals.lightrag,
    });
    res.json({ success: true, ...r });
  } catch (e: any) { res.status(502).json({ success: false, error: e.message }); }
});

app.get('/api/autoresearch/agents', (_req, res) => {
  res.json({ success: true, agents: autoresearch.RESEARCH_AGENTS });
});

// ============================================================================
// Self-heal — deterministic crawler that finds broken links / dead endpoints /
// dangling onclick handlers / orphaned nav-items in the dashboard's static
// HTML. Runs on demand. Gemma 4 is intentionally NOT in the audit loop —
// scans are cheap and predictable; reserve LLM hops for the optional /suggest.
// ============================================================================
app.post('/api/selfheal/audit', async (_req, res) => {
  try {
    const t0 = Date.now();
    const report = await selfheal.runAndCache(REPO_ROOT);
    res.json({ success: true, runMs: Date.now() - t0, ...report });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/api/selfheal/audit', (_req, res) => {
  const last = selfheal.getLastAudit();
  if (!last) { res.json({ success: true, fresh: false, message: 'No audit yet — POST to /api/selfheal/audit to run' }); return; }
  res.json({ success: true, fresh: true, ...last });
});

app.post('/api/selfheal/suggest', async (req, res) => {
  // Optional Gemma 4 patch suggestion for a single finding. Cheap, single hop.
  const finding = req.body?.finding;
  if (!finding || !finding.detail) { res.status(400).json({ success: false, error: 'finding required' }); return; }
  try {
    const r = await lmstudio.chatAsAgent(
      'Kai',
      [
        { role: 'system', content: 'You are Kai, CTO. Given a self-heal finding, propose a one-paragraph fix in plain text. No code blocks. Under 80 words.' },
        { role: 'user', content: `Finding (${finding.kind}, ${finding.severity}) at ${finding.file}:${finding.line}\n${finding.detail}` },
      ],
      { taskType: 'concept', temperature: 0.3, max_tokens: 800 },
    );
    if (!r.ok) { res.status(503).json({ success: false, error: r.reason }); return; }
    res.json({ success: true, suggestion: r.content, model: r.model, latencyMs: r.latencyMs });
  } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
});

// Game development milestones - LIVE from task engine
app.get('/api/game/milestones', (req, res) => {
  res.json({ success: true, milestones: taskEngine.getGameMilestones() });
});

app.get('/api/game/stats', (req, res) => {
  res.json({ success: true, ...taskEngine.getGameStats() });
});

// Token usage tracking - model consumption per agent
app.get('/api/tokens/summary', (req, res) => {
  res.json({ success: true, ...tokenTracker.getAgentSummary() });
});

app.get('/api/tokens/hourly', (req, res) => {
  const agent = req.query.agent as string | undefined;
  res.json({ success: true, hours: tokenTracker.getHourlyUsage(agent) });
});

app.get('/api/tokens/daily', (req, res) => {
  const agent = req.query.agent as string | undefined;
  res.json({ success: true, days: tokenTracker.getDailyUsage(agent) });
});

app.get('/api/tokens/events', (req, res) => {
  const agent = req.query.agent as string | undefined;
  const limit = parseInt(req.query.limit as string) || 20;
  res.json({ success: true, events: tokenTracker.getRecentEvents(agent, limit) });
});

// Model scheduler — current reservations and idle models.
app.get('/api/models/schedule', (req, res) => {
  const { getSchedule } = require('./lmstudio');
  res.json({ success: true, ...getSchedule() });
});

app.post('/api/models/schedule/:modelId/extend', (req, res) => {
  const { extendModelReservation } = require('./lmstudio');
  const extraMs = parseInt(req.body.extraMs, 10) || 30_000;
  const ok = extendModelReservation(req.params.modelId, extraMs);
  if (!ok) { res.status(404).json({ success: false, error: 'model not reserved' }); return; }
  res.json({ success: true, modelId: req.params.modelId, extendedByMs: extraMs });
});

// Trigger background download of the smallest recommended local model.
app.post('/api/models/download-recommended', async (req, res) => {
  const { ensureLocalModel } = require('./model-downloader');
  const result = await ensureLocalModel();
  res.json({ success: result.ok, ...result });
});

// Model-router health: resource detection + matched roster + recommended downloads.
app.get('/api/health/models', (req, res) => {
  const roster = resourceModelRouter.generateRoster();
  res.json({
    success: true,
    weightClass: roster.weightClass,
    resources: roster.resources,
    simulationByDefault: roster.simulationByDefault,
    allowBigModels: roster.allowBigModels,
    allowCloud: roster.allowCloud,
    recommendedDownloads: roster.recommendedDownloads.map(m => ({
      id: m.id,
      name: m.name,
      diskGB: m.diskGB,
      ramGB: m.ramGB,
      loadCommand: m.lmStudioLoad ? `lms load ${m.lmStudioLoad}` : null,
    })),
    rosterSample: roster.roster.slice(0, 10),
  });
});

app.post('/api/health/models/refresh', (req, res) => {
  const { refreshRoster } = require('./lmstudio');
  const roster = refreshRoster(req.body);
  res.json({ success: true, weightClass: roster.weightClass, rosterSample: roster.roster.slice(0, 10) });
});

// Auto-update status — what the last scripts/auto-update.sh tick observed.
// Returns { status, message, local_sha, remote_sha, checked_at } or
// { absent: true } before the timer has fired even once.
app.get('/api/vitals/auto-update', (req, res) => {
  try {
    const fs = require('fs');
    const STATE = '/tmp/virtualpc-auto-update.state';
    if (!fs.existsSync(STATE)) {
      res.json({ success: true, absent: true });
      return;
    }
    const raw = fs.readFileSync(STATE, 'utf8');
    res.json({ success: true, ...JSON.parse(raw) });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Commercialization (Croesus) — propose / approve / execute promotions with
// hard budget caps. Real-money execution is gated behind PROMO_REAL_MONEY=1
// and only fires after a human with role ceo|cto|economy approves. See
// src/commercialization.ts for the guardrails.
app.post('/api/commercialization/propose', (req, res) => {
  const sourceAgent = String(req.header('x-agent-id') || req.body?.source_agent || '');
  // Only Croesus can file proposals from this endpoint — keeps random callers
  // from spamming the queue. Human-filed proposals go through approve/execute.
  if (sourceAgent !== 'Croesus') {
    res.status(403).json({ success: false, error: 'only Croesus may propose; set X-Agent-Id: Croesus' });
    return;
  }
  const result = commercialization.propose({
    source_agent: 'Croesus',
    channel: req.body?.channel,
    budget_usd: Number(req.body?.budget_usd),
    duration_hours: Number(req.body?.duration_hours || 24),
    pitch: String(req.body?.pitch || ''),
    predicted_roi_pct: Number(req.body?.predicted_roi_pct || 0),
  });
  if (!result.ok) {
    res.status(400).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, proposal: result.proposal });
});

app.get('/api/commercialization/proposals', (req, res) => {
  const status = req.query.status ? (String(req.query.status) as any) : undefined;
  res.json({ success: true, proposals: commercialization.list({ status }) });
});

app.get('/api/commercialization/budget', (req, res) => {
  res.json({ success: true, ...commercialization.budget() });
});

// Approve / reject / execute — these mutate spend, so they require an
// authenticated human with one of the privileged roles. The auth system is
// constructed later inside initialize(); we hold a reference here so these
// module-level routes can verify a Bearer session token against a role.
let approverAuthSystem: AuthSystem | null = null;
const APPROVER_ROLES = ['ceo', 'cto'];

function privilegedActor(req: express.Request): string | null {
  // Preferred path: an authenticated session token with a privileged role.
  // This is the real check and is the only one honoured in production.
  const token = req.headers.authorization?.split(' ')[1];
  if (approverAuthSystem && token) {
    const authToken = approverAuthSystem.verifyToken(token);
    if (authToken && APPROVER_ROLES.includes(authToken.role)) {
      return authToken.username;
    }
    // A token was supplied but is invalid or under-privileged — reject it
    // outright rather than silently falling through to the dev header.
    return null;
  }

  // Dev-only fallback: the dashboard's X-Approver header from localhost. This
  // is spoofable, so it is OFF unless explicitly opted into and never in
  // production. Set ALLOW_HEADER_APPROVER=1 for local UI work without a login.
  const headerFallbackAllowed =
    process.env.NODE_ENV !== 'production' && process.env.ALLOW_HEADER_APPROVER === '1';
  if (!headerFallbackAllowed) return null;
  const ip = String(req.ip || '');
  const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
  if (!isLocal) return null;
  const who = String(req.header('x-approver') || '').trim();
  return who || null;
}

app.post('/api/commercialization/:id/approve', (req, res) => {
  const who = privilegedActor(req);
  if (!who) {
    res.status(403).json({ success: false, error: 'approval requires an authenticated ceo/cto session token' });
    return;
  }
  const r = commercialization.approve(req.params.id, who);
  if (!r.ok) {
    res.status(400).json({ success: false, error: r.error });
    return;
  }
  res.json({ success: true, proposal: r.proposal });
});

app.post('/api/commercialization/:id/reject', (req, res) => {
  const who = privilegedActor(req);
  if (!who) {
    res.status(403).json({ success: false, error: 'rejection requires an authenticated ceo/cto session token' });
    return;
  }
  const r = commercialization.reject(req.params.id, who);
  if (!r.ok) {
    res.status(400).json({ success: false, error: r.error });
    return;
  }
  res.json({ success: true, proposal: r.proposal });
});

app.post('/api/commercialization/:id/execute', async (req, res) => {
  const who = privilegedActor(req);
  if (!who) {
    res.status(403).json({ success: false, error: 'execute requires an authenticated ceo/cto session token' });
    return;
  }
  // execute() is now async — Stripe paymentIntents.create() is a network call.
  const r = await commercialization.execute(req.params.id);
  res.json({ success: r.ok, mode: r.mode, proposal: r.proposal, error: r.error });
});

// GPU symbiosis status — what state the daemon is in (idle / yielded to Blender).
// The daemon only writes /tmp/gpu-symbiosis-state on a transition, so a fresh
// daemon that's never had to yield has no state file. Treat that as "idle" if
// the log has a recent tick; "stale" if the last tick is too old to trust.
app.get('/api/gpu/symbiosis', (req, res) => {
  try {
    const fs = require('fs');
    const stateFile = fs.existsSync('/tmp/gpu-symbiosis-state')
      ? fs.readFileSync('/tmp/gpu-symbiosis-state', 'utf8').trim()
      : '';
    const disabled = fs.existsSync('/tmp/gpu-symbiosis-disable');

    let lastLog = '';
    let lastTickAgoS: number | null = null;
    let blenderMemMb: number | null = null;
    if (fs.existsSync('/tmp/gpu-symbiosis.log')) {
      const buf = readFileTail('/tmp/gpu-symbiosis.log');  // tail only — log grows unbounded
      const lines = buf.trim().split('\n');
      lastLog = lines.slice(-5).join('\n');
      // Last "blender_gpu_mem=N MiB threshold=M MiB" tick tells us when the
      // daemon last ran and what it saw.
      for (let i = lines.length - 1; i >= 0; i--) {
        const m = lines[i].match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) blender_gpu_mem=(\d+) MiB/);
        if (m) {
          lastTickAgoS = Math.max(0, Math.round((Date.now() - new Date(m[1].replace(' ', 'T') + 'Z').getTime()) / 1000));
          blenderMemMb = parseInt(m[2], 10);
          break;
        }
      }
    }

    // Resolve effective state for the dashboard.
    let state: string;
    if (disabled) state = 'disabled';
    else if (stateFile.startsWith('yielded')) state = 'yielded';
    else if (stateFile === 'idle') state = 'idle';
    else if (lastTickAgoS !== null && lastTickAgoS < 120) state = 'idle'; // daemon ticking, never had to act
    else if (lastTickAgoS !== null) state = 'stale';
    else state = 'unknown';

    res.json({
      success: true,
      state,
      disabled,
      stateFile,
      lastTickAgoS,
      blenderMemMb,
      lastLog,
    });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Provider credentials (API keys for Anthropic, OpenAI, Grok, DeepSeek, Kimi/Moonshot, Perplexity, ...)
app.get('/api/credentials', (req, res) => {
  res.json({ success: true, providers: credentials.listMasked() });
});

app.post('/api/credentials/:provider', (req, res) => {
  try {
    const { email, api_key, base_url, notes } = req.body || {};
    const result = credentials.setProvider(req.params.provider, { email, api_key, base_url, notes });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(400).json({ success: false, error: e.message });
  }
});

app.delete('/api/credentials/:provider', (req, res) => {
  res.json({ success: true, ...credentials.deleteProvider(req.params.provider) });
});

// Timeseries analyzer — CSV upload, per-column stats, Pearson pairs, z-score anomalies.
app.post('/api/timeseries/analyze', (req, res) => {
  const { csv, zThreshold } = req.body || {};
  if (typeof csv !== 'string' || csv.length < 10) {
    res.status(400).json({ success: false, error: 'csv (string) required in body' });
    return;
  }
  // Soft size cap — ChemE datasets of 5MB are generous.
  if (csv.length > 5_000_000) {
    res.status(413).json({ success: false, error: 'csv too large (max 5 MB)' });
    return;
  }
  try {
    const result = analyzeCsv(csv, { zThreshold: typeof zThreshold === 'number' ? zThreshold : 3 });
    res.json({ success: true, ...result });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Multi-agent proposals (Inbox / Outbox / global)
app.get('/api/agents/:name/inbox', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 15;
  res.json({ success: true, agent: req.params.name, inbox: taskEngine.getAgentInbox(req.params.name, limit) });
});

app.get('/api/agents/:name/outbox', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 15;
  res.json({ success: true, agent: req.params.name, outbox: taskEngine.getAgentOutbox(req.params.name, limit) });
});

app.get('/api/proposals', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json({ success: true, proposals: taskEngine.getAllProposals(limit) });
});

// Agent artifacts — real LM Studio outputs generated on task completion
app.get('/api/agents/:name/artifacts', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 10;
  const items = taskEngine.getAgentArtifacts(req.params.name, limit);
  res.json({ success: true, agent: req.params.name, count: items.length, artifacts: items });
});

app.get('/api/artifacts', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  res.json({ success: true, artifacts: taskEngine.getAllArtifacts(limit) });
});

// Agent in-progress drilldown with full subtask detail
app.get('/api/agents/:name/in-progress-detail', (req, res) => {
  const details = taskEngine.getAgentInProgressDetail(req.params.name);
  res.json({ success: true, agent: req.params.name, tasks: details, count: details.length });
});

// Live CLI log stream for an agent (client polls every 2s)
// All-agents merged CLI feed — backs the /terminal.html page that streams
// every agent's stdout into one timeline. Each line is tagged with agent +
// color (from the registry) so the client can show colored output and let
// the user toggle individual agents on/off without an extra fetch per agent.
app.get('/api/agents/cli-log/all', (req, res) => {
  const limitPerAgent = parseInt(req.query.limit as string) || 30;
  const since = req.query.since ? Date.parse(String(req.query.since)) : 0;
  const merged: { ts: string; agent: string; color: string; avatar: string; line: string; level?: string }[] = [];
  for (const meta of AGENT_META) {
    const lines = taskEngine.getAgentCliLog(meta.name, limitPerAgent);
    for (const l of lines) {
      if (since && Date.parse(l.ts) <= since) continue;
      merged.push({ ts: l.ts, agent: meta.name, color: meta.color, avatar: meta.avatar, line: l.line, level: l.level });
    }
  }
  merged.sort((a, b) => a.ts.localeCompare(b.ts));
  res.json({
    success: true,
    count: merged.length,
    lastTs: merged.length ? merged[merged.length - 1].ts : null,
    lines: merged,
  });
});

app.get('/api/agents/:name/cli-log', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const lines = taskEngine.getAgentCliLog(req.params.name, limit);
  res.json({ success: true, agent: req.params.name, lines });
});

// All-Agents overview — single payload powering /agents.html. Combines:
//   • the canonical agent registry (src/agent-registry.ts)
//   • Gemma-4-drafted persona prompts (data/agent-prompts.json)
//   • live activity from the task engine (current task, completed counts, last action)
function readAgentPrompts(): { [name: string]: { prompt: string; model?: string; generatedAt?: string } } {
  try {
    const p = path.resolve(__dirname, '..', 'data', 'agent-prompts.json');
    if (!fs.existsSync(p)) return {};
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    const out: any = {};
    for (const [name, v] of Object.entries(raw.agents || {})) {
      const a: any = v;
      if (a && a.prompt) out[name] = { prompt: a.prompt, model: a.model, generatedAt: a.generatedAt };
    }
    return out;
  } catch { return {}; }
}

app.get('/api/agents/overview', (_req, res) => {
  const prompts = readAgentPrompts();
  const tail = (s: string, n: number) => s.length > n ? s.slice(0, n) + '…' : s;
  const throughput = lmstudio.getLastThroughput();
  const agents = AGENT_META.map(meta => {
    const prog = (taskEngine as any).getAgentProgress?.(meta.name) || { completed: 0, inProgress: 0, currentTask: null };
    const cli = taskEngine.getAgentCliLog(meta.name, 1);
    const lastLine = cli[0];
    const persona = prompts[meta.name];
    const tp = throughput[meta.name];
    return {
      name: meta.name,
      role: meta.role,
      avatar: meta.avatar,
      color: meta.color,
      kind: meta.kind,
      models: meta.models,
      teams: meta.teams || [],
      tools: meta.tools || [],
      status: prog.inProgress > 0 ? 'working' : (prog.currentTask ? 'queued' : 'idle'),
      currentTask: prog.currentTask || null,
      tasksCompleted: prog.completed || 0,
      tasksInProgress: prog.inProgress || 0,
      lastAction: lastLine ? { ts: lastLine.ts, line: tail(lastLine.line, 140), level: lastLine.level } : null,
      promptPreview: persona ? tail(persona.prompt, 220) : null,
      promptModel: persona?.model || null,
      promptGeneratedAt: persona?.generatedAt || null,
      hasPrompt: !!persona,
      throughput: tp || null,    // {tokensPerSec, model, promptTokens, completionTokens, latencyMs, ts}
    };
  });
  res.json({
    success: true,
    count: agents.length,
    agents,
    promptsAvailable: Object.keys(prompts).length,
    generatedAt: new Date().toISOString(),
  });
});

// Live tokens-per-second per agent. Updated by lmstudio.chatAsAgent on every
// successful real call. Empty until something has actually been measured.
app.get('/api/agents/throughput', (_req, res) => {
  res.json({ success: true, throughput: lmstudio.getLastThroughput() });
});

// Run a one-shot benchmark for every agent (or a subset). Each agent gets a
// short identical prompt, lmstudio.chatAsAgent serves it (Kimi via CLI; the
// rest via LM Studio with the existing fallback chain), and the resulting
// tokens/second + which model actually served are returned. Updates the
// in-memory throughput cache so the All-Agents page can show fresh numbers
// without re-running. Sequential to avoid GPU contention spikes.
app.post('/api/agents/benchmark', async (req, res) => {
  const wanted: string[] = Array.isArray(req.body?.agents) ? req.body.agents
                          : AGENT_META.map(a => a.name);
  const maxTokens = parseInt(req.body?.max_tokens) || 80;
  const prompt = String(req.body?.prompt || 'Reply with this exact sentence and nothing else: BENCHMARK_OK.');
  const results: Array<{ agent: string; ok: boolean; model?: string; tokensPerSec?: number; promptTokens?: number; completionTokens?: number; latencyMs?: number; reason?: string }> = [];
  const t0 = Date.now();
  for (const agent of wanted) {
    const meta = AGENT_META.find(a => a.name === agent);
    if (!meta) { results.push({ agent, ok: false, reason: 'unknown agent' }); continue; }
    try {
      const r = await lmstudio.chatAsAgent(agent, [
        { role: 'system', content: 'You are a benchmark probe. Reply tersely.' },
        { role: 'user', content: prompt },
      ], { taskType: 'cheap', temperature: 0.1, max_tokens: maxTokens });
      if (r.ok) {
        const tt = lmstudio.getLastThroughput()[agent];
        results.push({ agent, ok: true, model: r.model, tokensPerSec: tt?.tokensPerSec ?? 0,
                       promptTokens: tt?.promptTokens, completionTokens: tt?.completionTokens, latencyMs: r.latencyMs });
      } else {
        results.push({ agent, ok: false, reason: r.reason });
      }
    } catch (e: any) {
      results.push({ agent, ok: false, reason: e.message });
    }
  }
  res.json({ success: true, totalMs: Date.now() - t0, results });
});

// Single-agent zoom-in: full persona prompt + recent activity
app.get('/api/agents/:name/prompt', (req, res) => {
  const meta = AGENT_META.find(a => a.name === req.params.name);
  if (!meta) { res.status(404).json({ success: false, error: 'unknown agent' }); return; }
  const prompts = readAgentPrompts();
  const persona = prompts[meta.name];
  res.json({
    success: true,
    agent: meta.name,
    role: meta.role,
    avatar: meta.avatar,
    color: meta.color,
    models: meta.models,
    prompt: persona?.prompt || null,
    model: persona?.model || null,
    generatedAt: persona?.generatedAt || null,
    runtimeSystemPrompt: lmstudio.systemPromptForAgent(meta.name, meta.role),
  });
});

// LM Studio agent-inference endpoints
app.get('/api/llm/health', async (req, res) => {
  const h = await lmstudio.healthCheck();
  res.json({ success: true, ...h });
});

app.get('/api/llm/models', async (req, res) => {
  const models = await lmstudio.getModels();
  res.json({ success: true, count: models.length, models });
});

app.post('/api/llm/chat', async (req, res) => {
  const { agent, message, messages, taskType, temperature, max_tokens } = req.body || {};
  if (!agent || typeof agent !== 'string') {
    res.status(400).json({ success: false, error: 'agent required' });
    return;
  }
  // Accept either a single `message` or a full `messages[]`
  let msgs: { role: 'system' | 'user' | 'assistant'; content: string }[];
  if (Array.isArray(messages)) {
    msgs = messages;
  } else if (typeof message === 'string') {
    const role = req.body.role || 'Agent';
    msgs = [
      { role: 'system', content: lmstudio.systemPromptForAgent(agent, role, req.body.context) },
      { role: 'user', content: message },
    ];
  } else {
    res.status(400).json({ success: false, error: 'message or messages[] required' });
    return;
  }
  const result = await lmstudio.chatAsAgent(agent, msgs, { taskType, temperature, max_tokens });
  if (!result.ok) {
    res.status(503).json({ success: false, ...result });
    return;
  }
  res.json({ success: true, ...result });
});

// Testplay latest results — read by Alexander's testplay dashboard
app.get('/api/testplay/latest', (req, res) => {
  try {
    const fs = require('fs');
    const p = path.resolve(__dirname, '..', 'tests', 'testplay', 'results', 'latest.json');
    if (!fs.existsSync(p)) {
      res.json({ success: true, _empty: true, reason: 'No testplay run yet. Run scripts/run-testplay.sh.' });
      return;
    }
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    res.json({ success: true, ...data });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Commits overview - mirrors Token Usage page
app.get('/api/commits/summary', (req, res) => {
  res.json({ success: true, ...commitsTracker.getCommitSummary() });
});

app.get('/api/commits/hourly', (req, res) => {
  const agent = req.query.agent as string | undefined;
  res.json({ success: true, hours: commitsTracker.getCommitHourly(agent) });
});

app.get('/api/commits/recent', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 30;
  res.json({ success: true, commits: commitsTracker.getRecentCommits(limit) });
});


// Domain progression tracks (chemical engineering, quantum computing, ...).
// Content lives in public/assets/tracks/*.json so writers can edit without
// touching code. /api/tracks returns the list; /api/tracks/:id streams one.
app.get('/api/tracks', (req, res) => {
  try {
    const fs = require('fs');
    const dir = path.resolve(__dirname, '..', 'public', 'assets', 'tracks');
    if (!fs.existsSync(dir)) {
      res.json({ success: true, tracks: [] });
      return;
    }
    const files = fs.readdirSync(dir).filter((f: string) => f.endsWith('.json'));
    const tracks = files.map((f: string) => {
      const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      return { id: t.id, name: t.name, tagline: t.tagline, tier_count: (t.tiers || []).length };
    });
    res.json({ success: true, tracks });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.get('/api/tracks/:id', (req, res) => {
  try {
    const fs = require('fs');
    // Path-traversal guard: a track id is a flat slug, never a path. Reject
    // anything outside [A-Za-z0-9_-] so encoded "../" sequences can't escape
    // the tracks directory and read arbitrary files (e.g. /etc/passwd).
    const id = String(req.params.id);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      res.status(400).json({ success: false, error: 'invalid track id' });
      return;
    }
    const tracksDir = path.resolve(__dirname, '..', 'public', 'assets', 'tracks');
    const file = path.resolve(tracksDir, `${id}.json`);
    // Defence in depth: confirm the resolved path is still inside tracksDir.
    if (file !== path.join(tracksDir, `${id}.json`) || !file.startsWith(tracksDir + path.sep)) {
      res.status(400).json({ success: false, error: 'invalid track id' });
      return;
    }
    if (!fs.existsSync(file)) {
      res.status(404).json({ success: false, error: 'track not found' });
      return;
    }
    res.json({ success: true, track: JSON.parse(fs.readFileSync(file, 'utf8')) });
  } catch (e: any) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Commit audit trail — every git commit recorded with timestamp, author,
// agent attribution, and any task-id reference parsed from the subject.
// Hook source: scripts/git-hooks/post-commit POSTs each commit here so the
// trail is built going forward without anyone having to remember to log.
app.post('/api/audit/commit', (req, res) => {
  const { sha, subject, author, timestamp } = req.body || {};
  if (!sha || !subject) {
    res.status(400).json({ success: false, error: 'sha and subject required' });
    return;
  }
  const r = commitAudit.record({ sha, subject, author: author || 'unknown', timestamp, source: 'hook' });
  if (!r.ok) {
    // Already-recorded is not a failure for the hook — return 200 so the hook stays quiet.
    res.json({ success: true, duplicate: true, reason: r.reason });
    return;
  }
  res.json({ success: true, entry: r.entry });
});

app.get('/api/audit/commits', (req, res) => {
  const filter: any = {};
  if (req.query.agent) filter.agent = String(req.query.agent);
  if (req.query.taskRef) filter.taskRef = String(req.query.taskRef);
  if (req.query.since) filter.sinceTs = String(req.query.since);
  filter.limit = Math.min(500, parseInt((req.query.limit as string) || '50', 10));
  res.json({ success: true, entries: commitAudit.list(filter) });
});

app.get('/api/audit/summary', (req, res) => {
  res.json({ success: true, ...commitAudit.summary() });
});

// One-shot backfill — useful after first deployment to capture pre-hook history.
app.post('/api/audit/backfill', (req, res) => {
  const max = Math.min(5000, Number(req.body?.max || 1000));
  res.json({ success: true, ...commitAudit.backfillFromGit(max) });
});

// Map a task to the GitHub commit(s) that delivered it. Used by the
// "Completed" view to render a → link badge per completed task.
// Single-task: GET /api/tasks/:id/commits?completed_at=ISO
// Batch:      POST /api/tasks/commits-map { tasks: [{id, completed_at}] }
app.get('/api/tasks/:id/commits', (req, res) => {
  const id = req.params.id;
  const completedAt = (req.query.completed_at as string) || undefined;
  const limit = Math.min(10, parseInt((req.query.limit as string) || '3', 10));
  res.json({
    success: true,
    repoUrl: commitsTracker.getRepoUrl(),
    commits: commitsTracker.getCommitsForTask(id, completedAt, limit),
  });
});

app.post('/api/tasks/commits-map', (req, res) => {
  const tasks = Array.isArray(req.body?.tasks) ? req.body.tasks.slice(0, 200) : [];
  const limit = Math.min(10, Number(req.body?.limit || 3));
  res.json({
    success: true,
    repoUrl: commitsTracker.getRepoUrl(),
    map: commitsTracker.getCommitsForTasks(tasks, limit),
  });
});

// Agent Social Hub - Facebook/LinkedIn style
app.get('/api/social/roster', (req, res) => {
  res.json({ success: true, agents: taskEngine.getSocialRoster() });
});

app.get('/api/social/:name/feed', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  const data = taskEngine.getAgentSocialFeed(req.params.name, limit);
  if (!data) {
    res.status(404).json({ success: false, error: 'Agent not in roster' });
    return;
  }
  res.json({ success: true, ...data });
});

// Work log / timesheet - all agents register their minutes
app.get('/api/worklog', (req, res) => {
  const agent = req.query.agent as string | undefined;
  const limit = parseInt(req.query.limit as string) || 50;
  res.json({ success: true, entries: taskEngine.getWorkLog(agent, limit) });
});

app.get('/api/worklog/summary', (req, res) => {
  res.json({ success: true, ...taskEngine.getWorkSummary() });
});

// Single backlog item detail - LIVE from task engine
app.get('/api/backlog/item/:itemId', (req, res) => {
  const detail = taskEngine.getTaskDetail(req.params.itemId);
  if (detail) {
    res.json({ success: true, item: detail });
  } else {
    res.status(404).json({ success: false, error: `Item '${req.params.itemId}' not found` });
  }
});

// Task Progress by Person - LIVE from task engine
app.get('/api/progress/:person', (req, res) => {
  const person = req.params.person;
  const progress = taskEngine.getAgentProgress(person);
  if (progress.total > 0) {
    res.json(progress);
  } else {
    res.status(404).json({ error: `Person '${person}' not found` });
  }
});

// --- Legacy static data (dead code, kept for reference) ---
if (false as any) {
const _app = app;
_app.get('/_legacy/backlog/per-person', (req: any, res: any) => {
  const backlogData = {
    'Fill': {
      role: 'CEO',
      avatar: '👑',
      tasks: [
        { id: 'fill-1', title: 'Strategic roadmap Q2-Q3', status: 'in-progress', priority: 'critical', description: 'Define product milestones for reaching 1M students. Set KPIs per sprint, review agent workload balance, and approve budget allocation for cloud resources.', sprint: 'week1', estimated_hours: 4, started_at: new Date(Date.now() - 3600000).toISOString() },
        { id: 'fill-2', title: 'Resource allocation review', status: 'in-progress', priority: 'high', description: 'Evaluate model routing cost vs quality tradeoff. Approve Tier-1 local model usage for routine tasks, reserve Tier-3 for complex reasoning.', sprint: 'week1', estimated_hours: 2, started_at: new Date(Date.now() - 1800000).toISOString() },
        { id: 'fill-3', title: 'Investor demo preparation', status: 'completed', priority: 'high', description: 'Prepare dashboard walkthrough demo for investor meeting. Show agent team productivity, cost savings metrics, and student capacity projections.', sprint: 'week1', estimated_hours: 3, completed_at: new Date(Date.now() - 7200000).toISOString() },
      ],
      completed: 8,
      active: 2,
      progress: 80
    },
    'Kai': {
      role: 'CTO',
      avatar: '⚡',
      tasks: [
        { id: 'bl-1', title: 'PLATFORM-6.1: Kafka Integration', status: 'in-progress', priority: 'critical', description: 'Full Kafka message queue integration with producer/consumer pipelines. Setting up 7 topics: agent.tasks, agent.results, model.requests, model.responses, lightrag.updates, game.events, system.alerts.', sprint: 'week1', estimated_hours: 8, started_at: new Date(Date.now() - 5400000).toISOString(), progress: 65 },
        { id: 'bl-2', title: 'PLATFORM-6.2: Redis Clustering', status: 'in-progress', priority: 'high', description: 'Redis cluster configuration for high-availability caching. Configure ioredis with sentinel failover for 99.9% cache availability.', sprint: 'week1', estimated_hours: 6, started_at: new Date(Date.now() - 3600000).toISOString(), progress: 40 },
        { id: 'bl-3', title: 'PLATFORM-6.3: Kubernetes Deployment', status: 'completed', priority: 'high', description: 'K8s manifests and production deployment pipeline. Multi-stage Docker builds, GPU support, Prometheus monitoring.', sprint: 'week1', estimated_hours: 10, completed_at: new Date(Date.now() - 86400000).toISOString() },
        { id: 'kai-4', title: 'Neo4j connection pooling', status: 'in-progress', priority: 'medium', description: 'Fix LightRAG connection drops after 30min idle. Implement connection pool with keepalive and auto-reconnect.', sprint: 'week2', estimated_hours: 4, started_at: new Date(Date.now() - 1200000).toISOString(), progress: 25 },
      ],
      completed: 19,
      active: 3,
      progress: 88
    },
    'Zip': {
      role: 'Developer',
      avatar: '💻',
      tasks: [
        { id: 'bl-4', title: 'Deep Ocean Reactor Zone', status: 'in-progress', priority: 'high', description: 'Implement Deep Ocean zone game mechanics and reactor puzzles. Includes chemistry-based crafting system, underwater physics, and reactor chain-reaction mini-game.', sprint: 'week2', estimated_hours: 12, started_at: new Date(Date.now() - 7200000).toISOString(), progress: 55 },
        { id: 'bl-7', title: 'Ranked PvP System', status: 'in-progress', priority: 'medium', description: 'Glicko-2 ranked matchmaking and PvP tournament system. ELO-based matchmaking, seasonal rankings, anti-smurf detection.', sprint: 'week3', estimated_hours: 8, started_at: new Date(Date.now() - 3600000).toISOString(), progress: 30 },
        { id: 'bl-8', title: 'In-Game Shop', status: 'pending', priority: 'medium', description: 'Cosmetics shop with MOLCO2 carbon credit currency. Virtual items, skins, emotes - no pay-to-win mechanics.', sprint: 'week3', estimated_hours: 6 },
        { id: 'bl-9', title: 'Battle Pass System', status: 'pending', priority: 'medium', description: '100-tier seasonal battle pass progression system. Free and premium tracks, daily/weekly challenges, exclusive rewards.', sprint: 'week4', estimated_hours: 8 },
      ],
      completed: 16,
      active: 2,
      progress: 76
    },
    'Mira': {
      role: 'Creative Director',
      avatar: '🎨',
      tasks: [
        { id: 'bl-5', title: 'Zone Visual Design', status: 'in-progress', priority: 'high', description: 'Visual assets and UI design for all game zones. Deep Ocean (bioluminescent), Crystal Caves (prismatic), Atmosphere (aurora), Upload Zone (digital), Tournament Arena (competitive).', sprint: 'week2', estimated_hours: 16, started_at: new Date(Date.now() - 10800000).toISOString(), progress: 45 },
        { id: 'mira-2', title: 'Agent status card icons (SVG)', status: 'in-progress', priority: 'high', description: 'Design unique SVG icons for each agent: Fill crown, Kai lightning, Zip terminal, Mira palette, Luna star. Animated idle/active/busy states.', sprint: 'week2', estimated_hours: 4, started_at: new Date(Date.now() - 5400000).toISOString(), progress: 70 },
        { id: 'mira-3', title: 'Leaderboard visualization', status: 'pending', priority: 'medium', description: 'Design animated leaderboard with rank transitions, sparkline performance history, and agent avatar integration.', sprint: 'week3', estimated_hours: 6 },
        { id: 'mira-4', title: 'Platform brand style guide', status: 'pending', priority: 'medium', description: 'Comprehensive brand guide: color palette, typography, iconography, motion principles, accessibility guidelines.', sprint: 'week3', estimated_hours: 8 },
      ],
      completed: 7,
      active: 2,
      progress: 58
    },
    'Luna': {
      role: 'Tech Artist',
      avatar: '✨',
      tasks: [
        { id: 'bl-6', title: 'Weather System', status: 'in-progress', priority: 'high', description: 'Dynamic weather effects and environmental simulations. Particle-based rain/snow, volumetric fog, day/night cycle with dynamic lighting, wind physics for vegetation.', sprint: 'week2', estimated_hours: 10, started_at: new Date(Date.now() - 7200000).toISOString(), progress: 50 },
        { id: 'bl-10', title: 'Mobile Optimization', status: 'in-progress', priority: 'medium', description: 'iOS/Android optimization and responsive design. LOD system, texture compression, draw call batching, 60fps target on mid-range devices.', sprint: 'week4', estimated_hours: 12, started_at: new Date(Date.now() - 3600000).toISOString(), progress: 20 },
        { id: 'luna-3', title: 'Shader library', status: 'pending', priority: 'medium', description: 'Reusable shader library: water surface, crystal refraction, energy flow, holographic UI, portal effects. GLSL with WebGL 2.0 fallback.', sprint: 'week3', estimated_hours: 8 },
      ],
      completed: 12,
      active: 2,
      progress: 75
    }
  };

  res.json(backlogData);
});

// Single backlog item detail
app.get('/api/backlog/item/:itemId', (req, res) => {
  // Collect all items from per-person backlog
  const allItems: { [key: string]: any } = {};
  const backlogPersonRes = require('http').request({ hostname: 'localhost', port: process.env.PORT || 3100, path: '/api/backlog/per-person', method: 'GET' });
  // Use a simpler static lookup
  const itemDb: { [key: string]: any } = {
    'bl-1': { id: 'bl-1', title: 'PLATFORM-6.1: Kafka Integration', priority: 'high', assigned_to: 'Kai', status: 'in-progress', sprint: 'week1', description: 'Full Kafka message queue integration with producer/consumer pipelines. Setting up 7 topics for distributed agent communication.', estimated_hours: 8, progress: 65, subtasks: ['Configure KafkaJS client', 'Create producer module', 'Create consumer module', 'Setup orchestrator', 'Test message routing', 'Deploy to staging'] },
    'bl-2': { id: 'bl-2', title: 'PLATFORM-6.2: Redis Clustering', priority: 'high', assigned_to: 'Kai', status: 'in-progress', sprint: 'week1', description: 'Redis cluster configuration for high-availability caching with sentinel failover.', estimated_hours: 6, progress: 40, subtasks: ['Configure ioredis cluster', 'Setup sentinel nodes', 'Implement cache invalidation', 'Load test cluster'] },
    'bl-3': { id: 'bl-3', title: 'PLATFORM-6.3: Kubernetes Deployment', priority: 'high', assigned_to: 'Kai', status: 'completed', sprint: 'week1', description: 'K8s manifests and production deployment pipeline with GPU support.', estimated_hours: 10, progress: 100, subtasks: ['Write k8s manifests', 'Multi-stage Dockerfile', 'GPU deployment config', 'Prometheus monitoring', 'Health check probes'] },
    'bl-4': { id: 'bl-4', title: 'Deep Ocean Reactor Zone', priority: 'medium', assigned_to: 'Zip', status: 'in-progress', sprint: 'week2', description: 'Implement Deep Ocean zone: chemistry crafting, underwater physics, reactor chain-reaction mini-game.', estimated_hours: 12, progress: 55, subtasks: ['Zone layout & spawning', 'Chemistry crafting system', 'Underwater physics engine', 'Reactor puzzle logic', 'NPC dialogue system', 'Zone rewards'] },
    'bl-5': { id: 'bl-5', title: 'Zone Visual Design', priority: 'medium', assigned_to: 'Mira', status: 'in-progress', sprint: 'week2', description: 'Visual assets for all 5 game zones: Deep Ocean, Crystal Caves, Atmosphere, Upload Zone, Tournament Arena.', estimated_hours: 16, progress: 45, subtasks: ['Deep Ocean bioluminescent theme', 'Crystal Caves prismatic assets', 'Atmosphere aurora effects', 'Upload Zone digital grid', 'Tournament Arena competitive stage'] },
    'bl-6': { id: 'bl-6', title: 'Weather System', priority: 'medium', assigned_to: 'Luna', status: 'in-progress', sprint: 'week2', description: 'Dynamic weather with particle rain/snow, volumetric fog, day/night cycle, wind physics.', estimated_hours: 10, progress: 50, subtasks: ['Particle system (rain/snow)', 'Volumetric fog shader', 'Day/night cycle', 'Wind physics for vegetation', 'Weather transition blending'] },
    'bl-7': { id: 'bl-7', title: 'Ranked PvP System', priority: 'medium', assigned_to: 'Zip', status: 'in-progress', sprint: 'week3', description: 'Glicko-2 matchmaking, ELO rankings, seasonal tournaments, anti-smurf detection.', estimated_hours: 8, progress: 30, subtasks: ['Glicko-2 rating engine', 'Matchmaking queue', 'Seasonal rankings', 'Anti-smurf detection', 'Tournament bracket system'] },
    'bl-8': { id: 'bl-8', title: 'In-Game Shop', priority: 'medium', assigned_to: 'Zip', status: 'pending', sprint: 'week3', description: 'Cosmetics shop with MOLCO2 carbon credit currency. No pay-to-win.', estimated_hours: 6, progress: 0, subtasks: ['Shop UI design', 'Item catalog system', 'MOLCO2 wallet integration', 'Purchase flow', 'Inventory management'] },
    'bl-9': { id: 'bl-9', title: 'Battle Pass System', priority: 'medium', assigned_to: 'Zip', status: 'pending', sprint: 'week4', description: '100-tier seasonal battle pass with free/premium tracks, challenges, exclusive rewards.', estimated_hours: 8, progress: 0, subtasks: ['100-tier progression', 'Free vs premium tracks', 'Daily/weekly challenges', 'Reward distribution', 'Season rollover'] },
    'bl-10': { id: 'bl-10', title: 'Mobile Optimization', priority: 'low', assigned_to: 'Luna', status: 'in-progress', sprint: 'week4', description: 'iOS/Android optimization: LOD, texture compression, draw call batching, 60fps target.', estimated_hours: 12, progress: 20, subtasks: ['LOD system', 'Texture compression pipeline', 'Draw call batching', 'Memory profiling', 'Device-specific configs'] },
    'fill-1': { id: 'fill-1', title: 'Strategic roadmap Q2-Q3', priority: 'critical', assigned_to: 'Fill', status: 'in-progress', sprint: 'week1', description: 'Define product milestones for 1M students. Set KPIs per sprint, review agent workload balance, approve budget.', estimated_hours: 4, progress: 60, subtasks: ['Define milestones', 'Set KPIs', 'Review workload', 'Budget approval'] },
    'fill-2': { id: 'fill-2', title: 'Resource allocation review', priority: 'high', assigned_to: 'Fill', status: 'in-progress', sprint: 'week1', description: 'Evaluate model routing cost vs quality. Approve Tier-1 for routine, Tier-3 for complex reasoning.', estimated_hours: 2, progress: 50, subtasks: ['Cost analysis', 'Quality metrics review', 'Tier policy update'] },
    'fill-3': { id: 'fill-3', title: 'Investor demo preparation', priority: 'high', assigned_to: 'Fill', status: 'completed', sprint: 'week1', description: 'Dashboard walkthrough demo for investors. Agent productivity, cost savings, student capacity projections.', estimated_hours: 3, progress: 100, subtasks: ['Script walkthrough', 'Polish dashboard', 'Prepare metrics deck'] },
    'kai-4': { id: 'kai-4', title: 'Neo4j connection pooling', priority: 'medium', assigned_to: 'Kai', status: 'in-progress', sprint: 'week2', description: 'Fix LightRAG connection drops after 30min idle. Connection pool with keepalive and auto-reconnect.', estimated_hours: 4, progress: 25, subtasks: ['Connection pool config', 'Keepalive heartbeat', 'Auto-reconnect logic', 'Integration test'] },
    'mira-2': { id: 'mira-2', title: 'Agent status card icons (SVG)', priority: 'high', assigned_to: 'Mira', status: 'in-progress', sprint: 'week2', description: 'SVG icons for each agent with animated idle/active/busy states.', estimated_hours: 4, progress: 70, subtasks: ['Fill crown icon', 'Kai lightning icon', 'Zip terminal icon', 'Mira palette icon', 'Luna star icon', 'Animation states'] },
    'mira-3': { id: 'mira-3', title: 'Leaderboard visualization', priority: 'medium', assigned_to: 'Mira', status: 'pending', sprint: 'week3', description: 'Animated leaderboard with rank transitions and sparkline history.', estimated_hours: 6, progress: 0, subtasks: ['Rank transition animations', 'Sparkline charts', 'Avatar integration'] },
    'mira-4': { id: 'mira-4', title: 'Platform brand style guide', priority: 'medium', assigned_to: 'Mira', status: 'pending', sprint: 'week3', description: 'Color palette, typography, iconography, motion principles, accessibility.', estimated_hours: 8, progress: 0, subtasks: ['Color system', 'Typography scale', 'Icon library', 'Motion principles'] },
    'luna-3': { id: 'luna-3', title: 'Shader library', priority: 'medium', assigned_to: 'Luna', status: 'pending', sprint: 'week3', description: 'Reusable GLSL shaders: water, crystal, energy, holographic, portal. WebGL 2.0 fallback.', estimated_hours: 8, progress: 0, subtasks: ['Water surface shader', 'Crystal refraction', 'Energy flow effect', 'Holographic UI', 'Portal warp'] },
  };

  const itemId = req.params.itemId;
  if (itemDb[itemId]) {
    res.json({ success: true, item: itemDb[itemId] });
  } else {
    res.status(404).json({ success: false, error: `Item '${itemId}' not found` });
  }
});

// Context Token Tracking (for monitoring /compact necessity)
app.post('/api/terminal/context-update', (req, res): any => {
  const { terminal, tokenCount } = req.body;
  if (!terminal || tokenCount === undefined) {
    return res.status(400).json({ error: 'Missing terminal or tokenCount' });
  }

  activityMonitor.updateContextTokens(terminal as 'A' | 'B', tokenCount);

  return res.json({
    terminal,
    tokenCount,
    compactionNeeded: activityMonitor.isCompactionNeeded(terminal as 'A' | 'B'),
    message: tokenCount > 130000 ? '⚠️ COMPACTION RECOMMENDED' : 'Tokens within limit'
  });
});

// Task Progress by Person
app.get('/api/progress/:person', (req, res) => {
  const person = req.params.person;
  const progressData: { [key: string]: any } = {
    'Fill': {
      completed: 8,
      inProgress: 2,
      pending: 1,
      total: 11,
      progress: 80,
      focus: 'Strategic roadmap Q2-Q3 & resource allocation',
      currentTask: 'Strategic roadmap Q2-Q3'
    },
    'Kai': {
      completed: 19,
      inProgress: 3,
      pending: 0,
      total: 22,
      progress: 88,
      focus: 'Kafka integration, Redis clustering, Neo4j pooling',
      currentTask: 'PLATFORM-6.1: Kafka Integration'
    },
    'Zip': {
      completed: 16,
      inProgress: 2,
      pending: 2,
      total: 20,
      progress: 76,
      focus: 'Deep Ocean Reactor Zone & Ranked PvP',
      currentTask: 'Deep Ocean Reactor Zone'
    },
    'Mira': {
      completed: 7,
      inProgress: 2,
      pending: 2,
      total: 11,
      progress: 58,
      focus: 'Zone visual design & agent SVG icons',
      currentTask: 'Zone Visual Design'
    },
    'Luna': {
      completed: 12,
      inProgress: 2,
      pending: 1,
      total: 15,
      progress: 75,
      focus: 'Weather system & mobile optimization',
      currentTask: 'Weather System'
    }
  };

  if (progressData[person]) {
    res.json(progressData[person]);
  } else {
    res.status(404).json({ error: `Person '${person}' not found` });
  }
});
} // end legacy dead code block

// Note: /api/backlog is defined in setupRoutes() to avoid route duplication

// System metrics - LIVE from task engine and token tracker
app.get('/api/metrics', (req, res) => {
  const gameStats = taskEngine.getGameStats();
  const allItems = taskEngine.getBacklogItems();
  const completed = allItems.filter((i: any) => i.status === 'completed').length;
  const inProg = allItems.filter((i: any) => i.status === 'in_progress').length;
  const pending = allItems.filter((i: any) => i.status === 'pending').length;
  const errored = allItems.filter((i: any) => i.status === 'error').length;
  const total = allItems.length;

  const tokenSummary = tokenTracker.getAgentSummary().combined;
  const uptimeSeconds = Math.floor((Date.now() - SERVER_START_TIME) / 1000);
  const uptimePct = uptimeSeconds > 0 ? 100 : 0; // since last server start
  // Cache hit rate = ratio of tier-1 (free local / simulated) calls vs total.
  const cacheHitRate = tokenSummary.totalCalls > 0
    ? Math.round((tokenTracker.getRecentEvents(undefined, 1000).filter((e: any) => e.tier === 1).length / Math.max(1, tokenTracker.getRecentEvents(undefined, 1000).length)) * 100)
    : 100;

  const metrics = {
    version: process.env.npm_package_version || '1.0.0',
    timestamp: new Date().toISOString(),
    totalTasks: gameStats.tasksCompleted + gameStats.tasksInProgress,
    completed: gameStats.tasksCompleted,
    inProgress: gameStats.tasksInProgress,
    pending,
    errored,
    costSavings: `${tokenSummary.costSavingsPercent}%`,

    dailyUpdates: gameStats.completedLastHour + gameStats.completedLastMinute,
    dailyActiveUsers: 0, // not tracked; reserved for future auth/session layer
    studentCapacity: 0,  // not tracked; removed from dashboard

    qwenTokens: {
      dailyBudget: 1000000,
      consumed: tokenSummary.totalTokens,
      remaining: Math.max(0, 1000000 - tokenSummary.totalTokens),
      percentUsed: Math.min(100, Math.round((tokenSummary.totalTokens / 1000000) * 100)),
      status: tokenSummary.totalTokens > 900000 ? 'critical' : tokenSummary.totalTokens > 700000 ? 'warning' : 'healthy'
    },

    apiResponseTime: 0, // not instrumented yet
    cacheHitRate,
    uptime: uptimePct,
    uptimeSeconds,

    costBreakdown: {
      description: `${tokenSummary.costSavingsPercent}% Cost Reduction achieved through:`,
      items: [
        { method: 'Local / Simulated Routing', savings: tokenSummary.costSavingsPercent, description: 'Route to on-device or simulated models' },
        { method: 'Model Routing', savings: 20, description: 'Route to optimal model by weight class' },
        { method: 'Request Batching', savings: 10, description: 'Batch multiple requests' }
      ]
    },
    agents: {
      total: gameStats.agentCount,
      active: gameStats.agentCount,
      busy: gameStats.tasksInProgress >= gameStats.agentCount ? gameStats.agentCount : gameStats.tasksInProgress,
      idle: Math.max(0, gameStats.agentCount - gameStats.tasksInProgress),
    },
    tasks: {
      total: gameStats.tasksCompleted + gameStats.tasksInProgress,
      completed: gameStats.tasksCompleted,
      inProgress: gameStats.tasksInProgress,
      pending,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      // Throughput windows so the dashboard can prove motion even when the
      // pending count is at steady-state (roster size × 2 pending = steady state).
      completedLastMinute: gameStats.completedLastMinute,
      completedLastHour: gameStats.completedLastHour,
      completedLast24h: gameStats.completedLast24h,
      lastCompletionTs: gameStats.lastCompletionTs,
    },
    systems: {
      neo4j: { status: 'operational', uptime: '99.9%' },
      redis: { status: 'operational', uptime: '99.8%' },
      
      auth: { status: 'operational', users: 5 }
    }
  };

  res.json(metrics);
});

// Legacy static HTML dashboard (kept for compatibility)
app.get('/dashboard-static', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>VirtualPC - Autonomous Agent System</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
            color: #e2e8f0;
            min-height: 100vh;
            padding: 20px;
        }
        .container { max-width: 1200px; margin: 0 auto; }
        header { text-align: center; margin-bottom: 40px; padding: 30px 0; }
        h1 {
            font-size: 2.5em;
            margin-bottom: 10px;
            background: linear-gradient(135deg, #60a5fa, #06b6d4);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .subtitle { color: #94a3b8; font-size: 1.1em; margin-top: 10px; }
        .status-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 40px;
        }
        .status-card {
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 10px;
            padding: 20px;
            backdrop-filter: blur(10px);
        }
        .status-card.online { border-color: rgba(34, 197, 94, 0.5); }
        .status-label { color: #94a3b8; font-size: 0.9em; margin-bottom: 8px; text-transform: uppercase; }
        .status-value { font-size: 1.8em; font-weight: 600; display: flex; align-items: center; gap: 10px; }
        .indicator {
            width: 12px;
            height: 12px;
            border-radius: 50%;
            background-color: #22c55e;
            animation: pulse 2s infinite;
        }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .section {
            background: rgba(30, 41, 59, 0.8);
            border: 1px solid rgba(148, 163, 184, 0.2);
            border-radius: 10px;
            padding: 30px;
            margin-bottom: 30px;
            backdrop-filter: blur(10px);
        }
        .section h2 { margin-bottom: 20px; color: #60a5fa; font-size: 1.3em; }
        .agent-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .agent-card {
            background: rgba(15, 23, 42, 0.6);
            border-left: 4px solid #60a5fa;
            border-radius: 6px;
            padding: 15px;
        }
        .agent-name { font-weight: 600; color: #60a5fa; margin-bottom: 5px; }
        .agent-role { color: #94a3b8; font-size: 0.85em; }
        .links-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 15px;
        }
        .link-btn {
            display: block;
            padding: 15px;
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.1), rgba(6, 182, 212, 0.1));
            border: 1px solid rgba(96, 165, 250, 0.3);
            border-radius: 8px;
            color: #60a5fa;
            text-decoration: none;
            text-align: center;
            font-weight: 500;
            transition: all 0.3s;
        }
        .link-btn:hover {
            background: linear-gradient(135deg, rgba(96, 165, 250, 0.2), rgba(6, 182, 212, 0.2));
            transform: translateY(-2px);
        }
        .feature-list { line-height: 2; color: #cbd5e1; }
        .footer { text-align: center; color: #64748b; padding: 20px 0; border-top: 1px solid rgba(148, 163, 184, 0.1); margin-top: 40px; }
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🚀 VirtualPC</h1>
            <p class="subtitle">Autonomous Agent System - VirtualPC Platform</p>
        </header>

        <div class="status-grid">
            <div class="status-card online">
                <div class="status-label">API Server</div>
                <div class="status-value"><span class="indicator"></span> Online</div>
            </div>
            <div class="status-card online">
                <div class="status-label">Neo4j (LightRAG)</div>
                <div class="status-value"><span class="indicator"></span> Ready</div>
            </div>
            <div class="status-card online">
                <div class="status-label">Kafka Queue</div>
                <div class="status-value"><span class="indicator"></span> Running</div>
            </div>
            <div class="status-card online">
                <div class="status-label">Redis Cache</div>
                <div class="status-value"><span class="indicator"></span> Ready</div>
            </div>
        </div>

        <div class="section">
            <h2>👥 Autonomous Agent Team</h2>
            <div class="agent-list">
                <div class="agent-card">
                    <div class="agent-name">Fill</div>
                    <div class="agent-role">CEO - Strategic decisions</div>
                </div>
                <div class="agent-card">
                    <div class="agent-name">Kai</div>
                    <div class="agent-role">CTO - Infrastructure & systems</div>
                </div>
                <div class="agent-card">
                    <div class="agent-name">Zip</div>
                    <div class="agent-role">Developer - Fast implementation</div>
                </div>
                <div class="agent-card">
                    <div class="agent-name">Mira</div>
                    <div class="agent-role">Artist - Design & visuals</div>
                </div>
                <div class="agent-card">
                    <div class="agent-name">Luna</div>
                    <div class="agent-role">Tech Artist - Performance & graphics</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>📊 API Endpoints</h2>
            <div class="links-grid">
                <a href="/health" class="link-btn">System Health</a>
                <a href="/api/memory/status" class="link-btn">Memory Status</a>
                <a href="/api/kafka/status" class="link-btn">Kafka Status</a>
                <a href="http://localhost:7474" class="link-btn">Neo4j Browser</a>
            </div>
        </div>

        <div class="section">
            <h2>📋 Task Status (Auto-refresh 5s)</h2>
            <div class="status-grid" id="taskStats">
                <div class="status-card">
                    <div class="status-label">Total Tasks</div>
                    <div class="status-value" id="totalTasks">Loading...</div>
                </div>
                <div class="status-card">
                    <div class="status-label">Completed</div>
                    <div class="status-value" id="completedTasks">Loading...</div>
                </div>
                <div class="status-card">
                    <div class="status-label">In Progress</div>
                    <div class="status-value" id="inProgressTasks">Loading...</div>
                </div>
                <div class="status-card">
                    <div class="status-label">Pending</div>
                    <div class="status-value" id="pendingTasks">Loading...</div>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>🎯 System Features</h2>
            <ul class="feature-list">
                <li>✅ <strong>87% Cost Reduction</strong> - Cache (40%) + Batching (30%) + Routing (20%)</li>
                <li>✅ <strong>Autonomous Agents</strong> - 5 specialized agents working independently</li>
                <li>✅ <strong>Shared Memory</strong> - Neo4j-based LightRAG for team knowledge</li>
                <li>✅ <strong>Message Queue</strong> - Kafka for distributed coordination</li>
                <li>✅ <strong>Production Security</strong> - HTTPS/TLS, JWT auth, RBAC, rate limiting</li>
                <li>✅ <strong>Kubernetes Ready</strong> - Docker containers with GPU support</li>
            </ul>
        </div>

        <div class="footer">
            <p>VirtualPC Autonomous Agent System • All systems operational • All systems operational</p>
        </div>
    </div>

    <script>
        // Auto-refresh task status every 5 seconds
        async function refreshTaskStatus() {
            try {
                const response = await fetch('/api/task-status');
                const data = await response.json();

                // Update task status elements
                document.getElementById('totalTasks').textContent = data.total || 0;
                document.getElementById('completedTasks').textContent = data.completed || 0;
                document.getElementById('inProgressTasks').textContent = data.inProgress || 0;
                document.getElementById('pendingTasks').textContent = data.pending || 0;
            } catch (error) {
                console.log('Task status fetch (expected during startup):', error.message);
            }
        }

        // Initial load
        refreshTaskStatus();

        // Set up 5-second polling interval
        setInterval(refreshTaskStatus, 5000);
    </script>
</body>
</html>
  `);
});

// Kafka shared producer + health endpoint. Promoted from dev-only to a
// production wire in May 2026: chatAsAgent and addTask now best-effort-
// publish events to model.responses, agent.tasks, agent.results.
import { ensureSharedProducer as _ensureSharedKafka, isKafkaConnected as _kafkaConnected, getKafkaBrokers as _kafkaBrokers, bestEffortPublish } from './integrations/kafka/shared';
import { startAuditConsumer as _startAudit, getCostState as _kafkaCost, readAuditTail as _kafkaAuditTail, isAuditConsumerRunning as _auditRunning } from './integrations/kafka/audit-consumer';

// If Kafka is not reachable on localhost:9092 and the user has not explicitly
// enabled it, disable it automatically in development to avoid cascades of
// ECONNREFUSED retry logs on lightweight machines.
(async function maybeDisableKafkaInDev() {
  if (process.env.KAFKA_DISABLED || process.env.KAFKA_BROKERS) return;
  const net = require('net');
  const reachable = await new Promise<boolean>(resolve => {
    const socket = net.connect(9092, 'localhost');
    socket.setTimeout(800);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
  if (!reachable) {
    process.env.KAFKA_DISABLED = '1';
    logger.info('Kafka not reachable on localhost:9092 — auto-disabling in dev (set KAFKA_BROKERS or unset KAFKA_DISABLED=0 to override)');
  }
})().finally(() => {
  _ensureSharedKafka().catch(() => { /* logged in shared module */ });
  // Boot the audit + cost consumer. Idempotent; if Kafka is offline it
  // logs a warning and stays dormant — next service restart re-attempts.
  _startAudit().catch(() => { /* logged in module */ });
});

app.get('/api/kafka/health', (_req, res) => {
  res.json({
    success: true,
    producer_connected: _kafkaConnected(),
    audit_consumer_running: _auditRunning(),
    brokers: _kafkaBrokers(),
    note: _kafkaConnected()
      ? 'Producer connected. chatAsAgent + addTask + setTaskStatus(completed) publish events to model.responses / agent.tasks / agent.results.'
      : 'Producer not connected. Bring brokers up via: docker compose -f deploy/docker-compose.yml up -d zookeeper kafka',
  });
});

// Cost dashboard fed by the audit consumer subscribing to model.responses.
// Returns running totals (lifetime + today + per-agent + per-model + per-pair).
app.get('/api/kafka/cost', (_req, res) => {
  const s = _kafkaCost();
  // Sort the agent + model maps by spend descending so the dashboard
  // doesn't have to do that work client-side.
  const sortByCost = (m: Record<string, any>) =>
    Object.entries(m).sort((a, b) => b[1].cost_usd - a[1].cost_usd)
      .map(([k, v]) => ({ key: k, ...v }));
  res.json({
    success: true,
    total: s.total,
    by_agent: sortByCost(s.byAgent),
    by_model: sortByCost(s.byModel),
    by_pair:  sortByCost(s.byPair).slice(0, 50),
    by_day:   Object.entries(s.byDay).sort().map(([d, v]) => ({ date: d, ...v })),
    last_flushed: s.lastFlushed,
  });
});

// Live tail of the audit JSONL — every event the producer emitted across
// every topic. Useful for debugging "did my publish actually fire?".
app.get('/api/kafka/audit', (req, res) => {
  const limit = Math.min(500, parseInt(String(req.query.limit || '50')) || 50);
  res.json({ success: true, count: limit, tail: _kafkaAuditTail(limit) });
});

// Demo network info — local IP + port-forward instructions
function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

app.get('/api/demo/network-info', (req, res) => {
  const port = process.env.PORT || 3100;
  const localIp = getLocalIp();
  res.json({
    success: true,
    localIp,
    port,
    localUrl: `http://${localIp}:${port}`,
    localhostUrl: `http://localhost:${port}`,
    routerSteps: [
      `Open your router admin page (usually http://192.168.1.1 or http://192.168.0.1).`,
      `Find "Port Forwarding", "Virtual Servers", or "NAT/PAT".`,
      `Add a rule: external TCP port ${port} → internal ${localIp}:${port}.`,
      `Save/apply. Your colleague can now reach this demo at http://<your-public-ip>:${port}`,
    ],
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    components: {
      api: 'operational',
      lightrag: 'checking...',
      kafka: 'checking...',
      models: 'checking...'
    }
  });
});

// Health check alias for React SPA — real status of every component the
// dashboard cares about. Does NOT cost an LLM call (just probes liveness).
app.get('/api/health', async (_req, res) => {
  // LightRAG: read whatever was stashed at startup.
  const lr = (app as any).locals.lightrag;
  const lightragOk = lr?.isConnected?.() ?? false;
  // Kafka: producer connection state from the shared singleton.
  let kafkaOk = false;
  try {
    const { isKafkaConnected } = require('./integrations/kafka/shared');
    kafkaOk = !!isKafkaConnected();
  } catch { /* shared.ts not loaded */ }
  // LM Studio: cheap models-list probe (cached 15 s upstream).
  let modelsLoaded = 0;
  try {
    const h = await lmstudio.healthCheck();
    modelsLoaded = h.modelsLoaded || 0;
  } catch { /* */ }
  // Process uptime + memory.
  const uptimeSec = Math.round(process.uptime());
  const mem = process.memoryUsage();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    uptime_sec: uptimeSec,
    memory_mb: { rss: Math.round(mem.rss / 1024 / 1024), heap: Math.round(mem.heapUsed / 1024 / 1024) },
    services: {
      api: 'operational',
      lightrag: lightragOk ? 'operational' : 'offline (graceful fallback)',
      kafka: kafkaOk ? 'operational' : 'offline (events not persisted)',
      lm_studio: modelsLoaded > 0 ? `operational (${modelsLoaded} models loaded)` : 'no models loaded',
    },
  });
});

// Task status endpoint (used by static dashboard) - LIVE
app.get('/api/task-status', (req, res) => {
  const stats = taskEngine.getGameStats();
  res.json({
    total: stats.tasksCompleted + stats.tasksInProgress,
    completed: stats.tasksCompleted,
    inProgress: stats.tasksInProgress,
    pending: 0
  });
});

/**
 * Initialize all system components
 */
async function initialize() {
  logger.info('🚀 VirtualPC starting...');

  // Initialize emergency kill switch (Ctrl-Q-Q to stop all automation)
  logger.info('🔴 OpenClaw Emergency Kill Switch active (Ctrl+Q+Q to stop)');
  killSwitch.initialize();

  try {
    // 0. Load secrets first (Infisical, no .env) so every downstream component
    //    sources credentials from the active SecretsManager. Returns null until
    //    Infisical is provisioned — non-breaking (env fallback meanwhile).
    const secrets = await loadSecrets();
    setActiveSecrets(secrets);

    // 1. Initialize LightRAG (shared memory)
    logger.info('📊 Initializing LightRAG...');
    const neo4jPassword = secretOrEnv('infra', 'NEO4J_PASSWORD');
    if (!neo4jPassword) {
      const msg = 'NEO4J_PASSWORD is not set.';
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`${msg} Refusing to start with a default Neo4j password in production.`);
      }
      logger.warn(`⚠️  ${msg} Falling back to the insecure default 'password' (dev only).`);
    }
    const lightrag = new LightRAGClient({
      neo4j_url: secretOrEnv('infra', 'NEO4J_URI') || 'bolt://localhost:7687',
      neo4j_username: secretOrEnv('infra', 'NEO4J_USER') || 'neo4j',
      neo4j_password: neo4jPassword || 'password'
    });
    await lightrag.connect();
    logger.info('✓ LightRAG connected');

    // 1a. Ingest the shared asset registry (molgang-roblox + molgang-web).
    //     Idempotent. Silently noops when LightRAG is offline. The
    //     /api/assets/* surface below queries this graph live.
    try {
      const { ingestAssetRegistry } = await import('./integrations/lightrag/asset-graph');
      const r = await ingestAssetRegistry(lightrag);
      if (r.offline) logger.warn('asset-graph: LightRAG offline — skip ingest');
      else logger.info(`✓ asset-graph: ${r.ingested} assets indexed (${r.mirrored} mirrored, ${r.orphan} orphan)`);
    } catch (e: any) {
      logger.warn(`asset-graph init failed: ${e.message}`);
    }

    // 1aa. Bootstrap the corpus vector index so corpus.search works on
    //      the very first call after a fresh DB. Idempotent.
    try {
      await corpus.bootstrapIndex(lightrag);
      logger.info('✓ corpus: vector index bootstrapped');
    } catch (e: any) {
      logger.warn(`corpus bootstrap failed: ${e.message}`);
    }

    // 1b. Ingest governance + wiki entries so the knowledge graph has
    //     the full lineage layer (term → governance → source). Same
    //     graceful-offline behavior as asset-graph.
    try {
      const gg = await import('./integrations/lightrag/governance-graph');
      const govR = await gg.ingestGovernanceState(lightrag);
      const wikR = await gg.ingestWikiState(lightrag);
      if (govR.offline) logger.warn('governance-graph: LightRAG offline — skip ingest');
      else logger.info(`✓ governance-graph: ${govR.ingested} governance + ${wikR.ingested} wiki nodes ingested`);
      // Stash the hooks on the global app so the write routes can call them.
      (app as any).locals.governanceGraphHooks = gg;
      (app as any).locals.lightrag = lightrag;
    } catch (e: any) {
      logger.warn(`governance-graph init failed: ${e.message}`);
    }

    // 1c. Ingest the Familie knowledge graph — een aparte, verbergbare graaf
    //     met personen / bedrijven / hardware / software / projecten. Zelfde
    //     graceful-offline gedrag. De /api/family/* surface hieronder serveert
    //     'm in 3D-force-graph formaat met een verberg-toggle.
    try {
      const fam = await import('./integrations/lightrag/family-graph');
      const r = await fam.ingestFamilyGraph(lightrag);
      if (r.offline) logger.warn('family-graph: LightRAG offline — skip ingest');
      else logger.info(`✓ family-graph: ${r.entities} objecten, ${r.categories} categorieën, ${r.structuralEdges} structureel + ${r.semanticEdges} afgeleid + ${r.verifiedEdges} geverifieerd (hidden=${r.hidden})`);
      // Chat-extractie delta (data/family-extract.json) — idempotent, getagd source='chat'.
      const ex = await fam.ingestExtract(lightrag);
      if (ex.missing) logger.info('family-graph: geen chat-extractie (run scripts/family-extract.py)');
      else if (!ex.offline) logger.info(`✓ family-graph: chat-extractie — ${ex.entities} entiteiten, ${ex.chats} chats, ${ex.edges} randen`);
      // Molgang-game delta (data/molgang-extract.json) — getagd source='molgang'.
      const mg = await fam.ingestMolgang(lightrag);
      if (mg.missing) logger.info('family-graph: geen molgang-extractie (run scripts/molgang-extract.py)');
      else if (!mg.offline) logger.info(`✓ family-graph: molgang — ${mg.entities} entiteiten, ${mg.edges} randen`);
      // Chemie/fysica staalslak-valorisatie (data/slag-chemistry.json) — source='chem'.
      const ch = await fam.ingestChemistry(lightrag);
      if (ch.missing) logger.info('family-graph: geen chemie-data (data/slag-chemistry.json ontbreekt)');
      else if (!ch.offline) logger.info(`✓ family-graph: chemie — ${ch.entities} entiteiten, ${ch.edges} randen`);
    } catch (e: any) {
      logger.warn(`family-graph init failed: ${e.message}`);
    }

    // Familie-graaf endpoints. GET /graph → 3D node-link JSON (respecteert de
    // verberg-toggle); GET/POST /visibility → toggle uitlezen/zetten.
    const familyApi = await import('./integrations/lightrag/family-graph');
    app.get('/api/family/graph', async (_req, res) => {
      try { res.json({ success: true, lightrag_connected: lightrag.isConnected(), ...(await familyApi.getFamilyGraph3D(lightrag)) }); }
      catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });
    app.get('/api/family/entities', async (_req, res) => {
      try { res.json({ success: true, ...(await familyApi.listFamilyEntities(lightrag)) }); }
      catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });
    app.get('/api/family/visibility', (_req, res) => {
      res.json({ success: true, ...familyApi.getFamilyVisibility() });
    });
    app.post('/api/family/visibility', async (req, res) => {
      try {
        const hidden = req.body?.hidden === true || req.body?.hidden === 'true';
        res.json({ success: true, ...(await familyApi.setFamilyVisibility(lightrag, hidden)) });
      } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });
    // Verberg-toggle als losse "flip" (geen body nodig).
    app.post('/api/family/toggle', async (_req, res) => {
      try {
        const cur = familyApi.getFamilyVisibility();
        res.json({ success: true, ...(await familyApi.setFamilyVisibility(lightrag, !cur.hidden)) });
      } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });
    // Categorieën (voor de portal-dropdown).
    app.get('/api/family/categories', (_req, res) => {
      res.json({ success: true, categories: familyApi.getCategories() });
    });
    // i18n-woordenboek (NL/EN/CN) voor de taal-toggle in het portaal.
    app.get('/api/family/i18n', (_req, res) => {
      res.json({ success: true, ...familyApi.getI18n() });
    });
    // Localhost-only: het privé portal-token uitlezen (de eigenaar leest 'm
    // lokaal en voert 'm één keer in op zijn Quest). Externe LAN-clients krijgen 403.
    app.get('/api/family/portal-token', (req, res) => {
      const ip = (req.socket.remoteAddress || '').replace('::ffff:', '');
      if (ip !== '127.0.0.1' && ip !== '::1') { res.status(403).json({ success: false, error: 'alleen via localhost' }); return; }
      res.json({ success: true, token: familyApi.getOrCreatePortalToken() });
    });

    // Privé schrijf-gate: alle update-endpoints vereisen het token
    // (header x-family-token of ?token=). Zo is de graaf op het LAN te
    // raadplegen maar alleen met token te wijzigen.
    const requireFamilyToken: import('express').RequestHandler = (req, res, next) => {
      const tok = (req.headers['x-family-token'] as string) || (req.query.token as string) || (req.body && req.body.token);
      if (!familyApi.checkPortalToken(tok)) { res.status(401).json({ success: false, error: 'ongeldig of ontbrekend portal-token' }); return; }
      next();
    };
    // Object toevoegen/bijwerken.
    app.post('/api/family/node', requireFamilyToken, async (req, res) => {
      try { res.json({ success: true, ...(await familyApi.upsertEntity(lightrag, { name: req.body?.name, cat: req.body?.cat, note: req.body?.note })) }); }
      catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
    });
    // Object verwijderen.
    app.delete('/api/family/node/:name', requireFamilyToken, async (req, res) => {
      try { res.json({ success: true, ...(await familyApi.removeEntity(lightrag, req.params.name)) }); }
      catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
    });
    // Rand toevoegen.
    app.post('/api/family/edge', requireFamilyToken, async (req, res) => {
      try { res.json({ success: true, ...(await familyApi.upsertEdge(lightrag, { from: req.body?.from, to: req.body?.to, rel: req.body?.rel, confidence: req.body?.confidence, evidence: req.body?.evidence })) }); }
      catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
    });
    // Rand verwijderen.
    app.post('/api/family/edge/delete', requireFamilyToken, async (req, res) => {
      try { res.json({ success: true, ...(await familyApi.removeEdge(lightrag, { from: req.body?.from, to: req.body?.to, rel: req.body?.rel })) }); }
      catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
    });
    // Chat-extractie opnieuw inladen (na het draaien van scripts/family-extract.py).
    app.post('/api/family/ingest-extract', requireFamilyToken, async (_req, res) => {
      try { res.json({ success: true, ...(await familyApi.ingestExtract(lightrag)) }); }
      catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });
    // Molgang-extractie opnieuw inladen (na scripts/molgang-extract.py).
    app.post('/api/family/ingest-molgang', requireFamilyToken, async (_req, res) => {
      try { res.json({ success: true, ...(await familyApi.ingestMolgang(lightrag)) }); }
      catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });
    // Chemie/fysica data opnieuw inladen (na bewerken van data/slag-chemistry.json).
    app.post('/api/family/ingest-chemistry', requireFamilyToken, async (_req, res) => {
      try { res.json({ success: true, ...(await familyApi.ingestChemistry(lightrag)) }); }
      catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });
    // Forceer een snapshot-export + Drive-sync (los van de auto-trigger bij wijzigingen).
    app.post('/api/family/export-sync', requireFamilyToken, async (_req, res) => {
      try { res.json({ success: true, ...(await familyApi.exportAndSync(lightrag)) }); }
      catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });

    // Asset query endpoints — read straight from the LightRAG graph so
    // designers (Mira, Luna) can ask "which 3D models from Roblox are not
    // yet ported to web?" without scanning the filesystem each time.
    const { queryAssets, getCategorySummary } = await import('./integrations/lightrag/asset-graph');
    app.get('/api/assets/categories', async (_req, res) => {
      try { res.json({ success: true, lightrag_connected: lightrag.isConnected(), categories: await getCategorySummary(lightrag) }); }
      catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });
    app.get('/api/assets', async (req, res) => {
      try {
        const assets = await queryAssets(lightrag, {
          category: req.query.category ? String(req.query.category) : undefined,
          origin:   req.query.origin   ? String(req.query.origin) as 'roblox'|'web' : undefined,
          orphan_only: req.query.orphan === '1' || req.query.orphan === 'true',
          limit: parseInt(String(req.query.limit || '50')) || 50,
        });
        res.json({ success: true, lightrag_connected: lightrag.isConnected(), count: assets.length, assets });
      } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });
    app.get('/api/assets/orphans', async (_req, res) => {
      try {
        const orphans = await queryAssets(lightrag, { orphan_only: true, limit: 200 });
        res.json({ success: true, count: orphans.length, orphans });
      } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });

    // Stream a single asset file by registry id. The three.js viewer
    // (Atlas's queued task) consumes this. Sandboxed to the three known
    // storage roots — anything outside `roblox-repo`, `web-repo`, `eds2`
    // is rejected so a path-traversal payload can't escape.
    app.get('/api/assets/file/:id', async (req, res) => {
      try {
        const fs = require('fs');
        const path = require('path');
        const REGISTRY_PATH = ASSET_REGISTRY_PATH;
        if (!fs.existsSync(REGISTRY_PATH)) { res.status(503).json({ success: false, error: 'registry not built' }); return; }
        const reg = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf-8'));
        const asset = (reg.assets || []).find((a: any) => a.id === req.params.id);
        if (!asset || !asset.abs_path) { res.status(404).json({ success: false, error: 'asset not found' }); return; }
        // Allowlist: file must live under one of the three known roots.
        const roots = Object.values(reg.storage_roots || {}) as string[];
        const real  = path.resolve(asset.abs_path);
        if (!roots.some(r => real.startsWith(path.resolve(r) + path.sep) || real === path.resolve(r))) {
          res.status(403).json({ success: false, error: 'asset outside known storage roots' }); return;
        }
        if (!fs.existsSync(real)) { res.status(404).json({ success: false, error: 'file missing on disk' }); return; }
        // Set sensible content-type by extension. Browsers + three.js loaders
        // both work fine without it but the explicit header helps caches.
        const mime: { [k: string]: string } = {
          '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json',
          '.fbx': 'application/octet-stream', '.obj': 'text/plain',
          '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
          '.svg': 'image/svg+xml', '.webp': 'image/webp',
        };
        res.setHeader('Content-Type', mime[asset.ext] || 'application/octet-stream');
        res.setHeader('Cache-Control', 'public, max-age=86400');   // 1 day; assets don't change often
        fs.createReadStream(real).pipe(res);
      } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });

    // 1b. Initialize Agent API Wrapper (with caching + rate limiting)
    logger.info('📦 Initializing Agent API Wrapper...');
    const agentAPI = new AgentAPIWrapper(lightrag);
    logger.info('✓ Agent API Wrapper ready (caching + rate limiting)');

    // 1c. Start P2P knowledge-graph sync — subscribes to lightrag.updates
    //     Kafka topic and materialises remote graph events into local Neo4j.
    //     Best-effort: if Kafka is offline the sync disables itself gracefully.
    const kafkaBrokers = (secretOrEnv('infra', 'KAFKA_BROKERS') || 'localhost:9092').split(',');
    const p2pSync = new P2PSync(kafkaBrokers, lightrag);
    p2pSync.start().catch((e: any) => logger.warn(`P2PSync start error: ${e.message}`));
    app.get('/api/lightrag/p2p', (_req, res) => res.json({ success: true, ...p2pSync.getStats() }));
    logger.info('✓ P2P knowledge-graph sync started');

    // Register full graph REST API (CRUD, traversal, visualization, export, ML, snapshot, query)
    registerGraphRoutes(app, lightrag);
    registerSnapshotRoutes(app, lightrag);
    registerGraphQueryRoutes(app, lightrag);
    registerProvenanceRoutes(app, lightrag);
    registerNFCRoutes(app, lightrag);

    // 1c-ii. Chain anchoring + OpenTimestamps + P2P news (whitepaper stack).
    //   News flow: instant publish (unverified) → P2P gossip → anchor.
    //   Anchors run dry-run until a signer/contract is configured via env.
    const anchorService = new AnchorService(lightrag, defaultAnchorTargets());
    if (process.env.ANCHOR_SCHEDULER === 'true') anchorService.start();
    registerAnchorRoutes(app, anchorService);
    const otsService = new OtsService(lightrag);
    registerOtsRoutes(app, otsService);

    // 1c-iii. Sovereign identity (self-certifying DIDs) + value chain
    //   (capped supply 888 888 888, Bitcoin-style halving eras). Attention
    //   events from REGISTERED identities mine value tokens (Tron BTT lesson:
    //   pay for contribution — here: pay for validated knowledge).
    const identityService = new SovereignIdentityService(lightrag);
    registerIdentityRoutes(app, identityService);
    const valueChain = new ValueChainService(lightrag, { identity: identityService });
    registerValueRoutes(app, valueChain);

    // Durability: restore ledger + identities from the last snapshot BEFORE any
    // hooks are wired — replayed history must not re-trigger consensus or
    // re-mint attention rewards. A corrupted snapshot fails the boot loudly.
    const chainStore = new ChainStore(defaultSnapshotPath(), valueChain, identityService);
    const restored = chainStore.load();
    if (restored) {
      logger.info(`💾 Chain restored from snapshot: ${restored.transfers} tx, ${restored.blocks} blocks, ${restored.identities} identities`);
    }

    const attentionService = new AttentionChainService(lightrag, {
      onEvent: (e) => {
        // Attention mining: a registered agent's contribution mints tokens at
        // the current era rate. Unregistered agents earn nothing (sybil gate).
        const did = identityService.didForHandle(e.agent);
        if (did) valueChain.rewardAttention(did, e.kind, e.weight);
      },
    });
    registerAttentionRoutes(app, attentionService);
    // attentionService passed to NewsService so GET /api/news?orderBy=attention works
    const newsService = new NewsService(lightrag, undefined, { attentionService });
    registerNewsRoutes(app, newsService, async () => {
      const pending = newsService.unanchoredIds();
      let anchorId: string;
      // Prefer free OTS aggregation; fall back to dry-run chain anchors
      try {
        const stamp = await otsService.stampCurrentRoot();
        anchorId = stamp.status !== 'failed' ? stamp.id : '';
      } catch { anchorId = ''; }
      if (!anchorId) {
        const records = await anchorService.anchorAll();
        anchorId = records[0]?.id ?? `local_${Date.now()}`;
      }
      // Anchoring is the strongest attention signal — feed the attention chain
      for (const id of pending) {
        try { attentionService.record({ itemId: id, agent: 'anchor-service', kind: 'anchor' }); } catch { /* non-fatal */ }
      }
      return { anchorId };
    });
    logger.info('✓ News + Anchor + OTS + Attention stack ready (instant-publish → p2p → anchor)');

    // 1c-iv. Sovereign identified voting — DID-bound sybil-resistant referenda;
    //   results published as signed news claims and anchored with the graph.
    const sovereignVoting = new SovereignVotingService(lightrag, {
      identity: identityService,
      valueChain,
      news: newsService,
    });
    registerSovereignVotingRoutes(app, sovereignVoting);
    logger.info('✓ Sovereign identity + value chain + voting ready (/api/identity, /api/value, /api/sovereign-votes)');

    // 1c-v. BFT Consensus Engine — closes the finality gap in the threat model (§4.1).
    //   Provides two-phase HotStuff consensus over the validator set so that
    //   cross-node transfer history reaches Byzantine-fault-tolerant finality
    //   rather than relying solely on external OTS/chain anchoring.
    //   onFinalized → seal the corresponding value-chain block so pending txs
    //   move from "pending" to "finalized" exactly when consensus agrees.
    const consensusEngine = new ConsensusEngine(lightrag, identityService, {
      blockTimeoutMs: parseInt(process.env.CONSENSUS_BLOCK_TIMEOUT_MS ?? '5000', 10),
      onFinalized: (block) => {
        // Seal value-chain block containing the finalized transfer set
        const sealed = valueChain.sealBlock();
        if (sealed) {
          logger.info(`consensus→value-chain: sealed block #${sealed.height} with ${sealed.txIds.length} txs (consensus height=${block.proposal.payload.height})`);
        }
        chainStore.scheduleSave();
      },
    });
    // Lazy delegate so the route handlers can propagate votes even though the
    // ConsensusNetwork is created after the routes are registered.
    let consensusNetwork: ConsensusNetwork | undefined;
    registerConsensusRoutes(app, consensusEngine, {
      deliverVote: (v) => consensusNetwork?.deliverVote(v) ?? Promise.resolve(null),
    });
    (app as any).locals.consensusEngine = consensusEngine;

    // Every applied transfer: queue for consensus finality + snapshot to disk.
    // Wired AFTER the restore above so replayed history is not re-queued.
    valueChain.setOnTransfer((tx) => {
      consensusEngine.queueTransfer(tx.id);
      chainStore.scheduleSave();
    });

    // Self-validator bootstrap: a fresh node keypair makes single-node
    // consensus work out of the box; multi-node deployments add the other
    // validators via POST /api/consensus/validators.
    {
      const kp = nodeCrypto.generateKeyPairSync('ed25519', {
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      });
      const nodeDid = didFromPublicKey(kp.publicKey);
      consensusEngine.setSelf(nodeDid, kp.privateKey);
      consensusEngine.addValidator({ did: nodeDid, stake: 0n, publicKeyPem: kp.publicKey });
      logger.info(`✓ Consensus self-validator: ${nodeDid}`);
    }

    // Network driver: broadcast proposals/votes to CONSENSUS_PEERS and
    // auto-propose when this node is the leader with pending transfers.
    const consensusPeers = (process.env.CONSENSUS_PEERS ?? '')
      .split(',').map(s => s.trim()).filter(Boolean);
    consensusNetwork = new ConsensusNetwork(consensusEngine, consensusPeers, {
      proposeIntervalMs: parseInt(process.env.CONSENSUS_PROPOSE_INTERVAL_MS ?? '2000', 10),
    });
    consensusNetwork.start();
    (app as any).locals.consensusNetwork = consensusNetwork;
    (app as any).locals.chainStore = chainStore;

    // Flush the snapshot on shutdown so the last debounce window is not lost.
    process.once('SIGTERM', () => chainStore.flush());
    process.once('SIGINT', () => chainStore.flush());

    // 1c-iv-b. User API + Feed API — wired AFTER consensus so node-status
    //   can report consensus state; wired AFTER restore so sessions and
    //   profiles reflect the recovered ledger.
    const userApi = new UserApiService(identityService, valueChain, attentionService, newsService, sovereignVoting);
    registerUserRoutes(app, userApi, consensusEngine, valueChain);

    const feedService = new FeedService(newsService, attentionService, identityService, valueChain);
    registerFeedRoutes(app, feedService);
    logger.info('✓ User + Feed APIs ready (/api/users/*, /api/feed/*, /api/node/status)');

    // 1c-iv-c. Post-quantum wallet layer — hash-based signatures (SHA-256
    //   only: quantum-resistant) + AES-256-GCM encrypted vault export.
    //   See docs/POST-QUANTUM-WALLET.md for the threat analysis.
    const pqWallet = new PqWalletService(identityService, valueChain);
    registerPqRoutes(app, pqWallet);
    // Phase-2 hybrid transfers: a carried pqRoot must be the sender's
    // enrolled key (POST-QUANTUM-WALLET.md §6, binding check).
    valueChain.setPqRootResolver((did) => pqWallet.getEnrolledRoot(did));

    // 1c-vi. Democratic elections — sovereign DID-bound ballots with Merkle-
    //   certified results, D'Hondt seat allocation, optional PQ signatures,
    //   and a full ISO 3166-1 country registry. See docs/README.md §P2P.
    const democraticElections = new DemocraticElectionService(identityService);
    registerElectionRoutes(app, democraticElections);
    logger.info('✓ Democratic elections ready (/api/elections/*, 195 countries)');

    // 1c-vii. Group voting + fact matrix + capability-routed fan-out.
    //   The bus publishes through TransportAdapter only (threat model §3.8):
    //   MQTT (opt-in via MQTT_BROKER_URL) is wrapped as a telemetry-only
    //   adapter, so governance/ballot events are structurally excluded from
    //   the broker; Kafka rides the shared best-effort producer (topic
    //   group.events). The fact matrix is the unified 888 888 888-dimension
    //   sparse coordinate space for transactions (price+volume), news, votes.
    const mqttBridge = mqttClientFromEnv(`virtualpc-${process.pid}`);
    if (mqttBridge) mqttBridge.connect();
    const transports = mqttBridge ? [new MqttTelemetryAdapter(mqttBridge)] : [];
    const groupEventBus = new GroupEventBus(transports);
    const factMatrix = new FactMatrixService(groupEventBus);
    registerFactMatrixRoutes(app, factMatrix);
    const groupVoting = new GroupVotingService(identityService, {
      valueChain,
      events: groupEventBus,
      matrix: factMatrix,
    });
    registerGroupVotingRoutes(app, groupVoting, groupEventBus);
    // News publications mirror into the matrix (news region) automatically.
    newsService.setOnPublish((item) => {
      try {
        factMatrix.ingestNews({
          newsId: item.id, claimer: item.claimer, source: item.source,
          semanticCoordinates: item.coordinates,
        });
      } catch { /* matrix full or invalid coords — news itself is unaffected */ }
    });
    process.once('SIGTERM', () => mqttBridge?.close());
    process.once('SIGINT', () => mqttBridge?.close());
    logger.info(`✓ Group voting + fact matrix ready (/api/groups/*, /api/matrix/*; MQTT ${mqttBridge ? 'on' : 'off'})`);

    // 1c-viii. Contributor backlog — knowledge graph as hub, GitHub/GitLab sync.
    const backlogService = new BacklogService(factMatrix, groupEventBus);
    registerHubBacklogRoutes(app, backlogService);
    const ghSync = gitHubSyncFromEnv(backlogService);
    if (ghSync) {
      registerGitHubSyncRoutes(app, ghSync);
      logger.info('✓ GitHub Issues sync ready (/api/hub/sync/github, /api/hub/webhooks/github)');
    }
    const glSync = gitLabSyncFromEnv(backlogService);
    if (glSync) {
      registerGitLabSyncRoutes(app, glSync);
      logger.info('✓ GitLab Issues sync ready (/api/hub/sync/gitlab, /api/hub/webhooks/gitlab)');
    }
    logger.info('✓ Contributor backlog hub ready (/api/hub/backlog/*)');
    // Graph-as-hub bridge: closing a group proposal closes every backlog
    // item that links it via graphRefs (kind 'proposal').
    groupVoting.setOnClose((cert) => {
      const closed = backlogService.closeByProposal(cert.proposalId);
      if (closed.length > 0) {
        logger.info(`backlog: proposal ${cert.proposalId} closed ${closed.length} linked item(s)`);
      }
    });

    // 1c-ix. Lightning Network — off-chain payment channels.
    //   Enables instant, high-volume micropayments between nodes without
    //   touching the chain for every transfer. Network ID is embedded in
    //   every commitment for fork-replay protection. See lightning.ts.
    const lightning = lightningFromEnv(identityService, valueChain);
    registerLightningRoutes(app, lightning);
    logger.info('⚡ Lightning Network ready (/api/lightning/*)');

    // 1c-x. Protocol versioning + fork registry.
    //   Feature-flag bitvector (BOLT #9 pattern), ForkSpec registry,
    //   peer capability negotiation, migration hooks. See protocol-version.ts.
    registerProtocolRoutes(app, protocolService);
    logger.info('✓ Protocol versioning ready (/api/protocol/*)');

    // 1d. Fact-validation graph — P2P consensus layer over knowledge graph.
    const factValidator = new FactValidator(lightrag);
    p2pSync.setFactValidator(factValidator); // wire so remote votes are applied locally
    app.get('/api/lightrag/facts', (_req, res) => res.json({ success: true, ...factValidator.getStats() }));
    app.get('/api/lightrag/facts/list', (req, res) => {
      const state = req.query.state as any;
      res.json({ success: true, facts: factValidator.listFacts(state) });
    });
    app.post('/api/lightrag/facts/submit', async (req, res) => {
      try {
        const { agent, ...fact } = req.body;
        const id = await factValidator.submit(agent, fact);
        res.json({ success: true, factId: id });
      } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
    });
    app.post('/api/lightrag/facts/:id/validate', async (req, res) => {
      try {
        const state = await factValidator.validate(req.body.agent, req.params.id);
        res.json({ success: true, state });
      } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
    });
    app.post('/api/lightrag/facts/:id/challenge', async (req, res) => {
      try {
        const state = await factValidator.challenge(req.body.agent, req.params.id, req.body.reason);
        res.json({ success: true, state });
      } catch (e: any) { res.status(400).json({ success: false, error: e.message }); }
    });
    logger.info('✓ P2P fact-validation graph ready');

    // 1d-ii. Signed vote certificates — quorum results published as news
    //   ("Stem resultaat als nieuws"). Ed25519 multi-sig today; the scheme
    //   field reserves a drop-in slot for BLS12-381 aggregation.
    const voteCertService = new VoteCertificateService(lightrag);
    registerVoteCertRoutes(app, voteCertService, { factValidator, news: newsService });
    logger.info('✓ Vote certificates ready (/api/votes/*)');

    // 1e. Seed well-known quantum algorithms for quantum-information readiness.
    try {
      const seeded = await seedQuantumAlgorithms(lightrag);
      logger.info(`✓ Quantum schema: ${seeded} algorithms seeded`);
    } catch (e: any) {
      logger.warn(`Quantum seed failed (non-fatal): ${e.message}`);
    }

    // 1f. P2P Gossip — HTTP fallback sync when Kafka is unavailable.
    //     Swarm-managed: tit-for-tat choking, optimistic unchoke, rarest-first
    //     replication, endgame fanout, PEX peer discovery, misbehavior bans
    //     (BitTorrent / Bitcoin Core / gossipsub v1.1 lessons).
    const gossipPeers = (secretOrEnv('infra', 'P2P_PEERS') || '').split(',').filter(Boolean);
    const myUrl = secretOrEnv('infra', 'MY_URL') || `http://localhost:${process.env.PORT || 3100}`;
    const swarm = new P2PSwarm({ myUrl });
    registerSwarmRoutes(app, swarm);
    const gossipAttentionThreshold = parseFloat(process.env.GOSSIP_ATTENTION_THRESHOLD ?? '0');
    const gossip = new P2PGossip(lightrag, gossipPeers, myUrl, swarm, {
      attentionService,
      attentionThreshold: gossipAttentionThreshold,
    });
    gossip.registerExpressRoutes(app);
    gossip.start();
    logger.info(`✓ P2PGossip configured (${gossipPeers.length} peers, swarm-managed)`);

    // 1f-micro. Micro-post P2P network — 2-line content, TTL chain anchors, DAO governance.
    const microSnapshotPath = process.env.MICRO_POST_DATA_DIR
      ? `${process.env.MICRO_POST_DATA_DIR}/micro-posts.json`
      : './data/micro-posts.json';
    const microPostStore = new MicroPostStore(undefined, { storage: microSnapshotPath });
    const microRestored = microPostStore.load();
    if (microRestored) logger.info(`✓ MicroPost store: restored ${microRestored.loaded} posts`);
    const microPostDao = new DaoParamStore(microPostStore);
    const microPostGossip = new MicroPostGossip(microPostStore, gossipPeers);
    microPostStore.startGc();
    microPostGossip.start();
    registerMicroPostRoutes(app, microPostStore, microPostDao, microPostGossip);
    logger.info('✓ MicroPost P2P network active');

    // 1f-pulse. Pulse (PLS) economy — mined by knot validation, burned when idle 3 months.
    const pulseWallets    = new PulseWalletStore();
    const pulseKnots      = new KnotValidationStore();
    const pulseEngine     = new PulseEngine(pulseWallets, pulseKnots);
    pulseEngine.startGc();
    registerPulseRoutes(app, pulseEngine, microPostStore);
    const riskKnotStore = new RiskKnotStore();
    registerRiskRoutes(app, riskKnotStore, pulseWallets);
    logger.info('✓ Pulse economy active — mine PLS by validating knots, stake on risk knots');

    // 1f-silk. Silk Net — free, open-source knitweb participation tier.
    // Silk nodes are permissionless; posts propagate into the shared MicroPostStore
    // and reach the full knitweb via bridge nodes. Not a testnet — data is real.
    const silkRegistry = new SilkNodeRegistry();
    const silkGossip   = new SilkGossip(silkRegistry, microPostStore, myUrl);
    silkGossip.start();
    registerSilkRoutes(app, silkRegistry, microPostStore, silkGossip, myUrl);
    logger.info('✓ Silk Net active — permissionless knitweb tier ready');

    // 1g. Agent Bridge — wires task completions/failures into the knowledge graph.
    const agentBridge = new AgentBridge(agentAPI, factValidator);
    app.get('/api/lightrag/bridge', (_req, res) => res.json({ success: true, ...agentBridge.getStats() }));
    logger.info('✓ AgentBridge ready');

    // 1h. Inference Engine — derives implicit facts every hour.
    const inferenceEngine = new InferenceEngine(lightrag);
    inferenceEngine.startScheduled(3_600_000);
    app.post('/api/lightrag/inference/run', async (_req, res) => {
      try {
        const summary = await inferenceEngine.runAll();
        // Publish inference results to Kafka so peers know which rules fired
        if (summary.totalDerived > 0) {
          bestEffortPublish(p => p.publishMemoryUpdate({
            type: 'context',
            content: `inference-run: ${summary.totalDerived} facts derived by ${summary.rulesRun} rules`,
            agent: 'inference-engine',
            metadata: summary as any,
          }));
        }
        res.json({ success: true, ...summary });
      } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
    });
    app.get('/api/lightrag/inference', (_req, res) => res.json({
      success: true,
      lastRunAt: inferenceEngine.getLastRunAt(),
    }));
    logger.info('✓ InferenceEngine scheduled (hourly)');

    // P2P unified health monitor dashboard
    registerMonitorRoutes(app, lightrag, { p2pSync, gossip, factValidator, inferenceEngine, agentBridge });

    // Make agentBridge available to the task engine via app.locals
    (app as any).locals.agentBridge = agentBridge;
    (app as any).locals.inferenceEngine = inferenceEngine;
    (app as any).locals.gossip = gossip;
    (app as any).locals.newsService = newsService;
    (app as any).locals.anchorService = anchorService;
    (app as any).locals.attentionService = attentionService;
    (app as any).locals.identityService = identityService;
    (app as any).locals.valueChain = valueChain;
    (app as any).locals.sovereignVoting = sovereignVoting;

    // 2. Initialize Kafka (message orchestration) - DISABLED for now
    logger.info('🔄 Kafka disabled (development mode) - running single-node');
    let kafka = null;
    // Kafka initialization commented out for development
    // await new KafkaOrchestrator({...}).connect();

    // 3. Initialize Model Router (intelligent multi-tier routing)
    logger.info('🤖 Initializing Model Router...');
    const modelRouter = new ModelRouter();
    logger.info('✓ Model Router ready (multi-tier orchestration enabled)');

    // 4. Register LightRAG as skills (Claude Code integration)
    logger.info('🎯 Registering LightRAG skills...');
    registerSkills(lightrag);
    logger.info('✓ Skills registered');

    // 5. Initialize system managers
    logger.info('📈 Initializing system managers...');
    const metrics = new MetricsDashboard();
    const taskScheduler = new TaskScheduler();
    const taskFacilitator = new TaskFacilitator({
      maxTasksPerAgent: 5,
      taskTimeoutMs: 60000,
      blockageCheckIntervalMs: 10000,
      rebalanceIntervalMs: 30000,
      escalationThresholdMs: 120000
    });
    const seasonalEvents = new SeasonalEventsManager();
    const deploymentManager = new DeploymentManager();
    const collaborationManager = new CollaborationManager();
    const analytics = new AdvancedAnalytics();
    const backupManager = new BackupManager();
    const auditLogger = new AuditLogger();
    logger.info('✓ System managers initialized (including Task Facilitator)');

    // 5a. Initialize Numerai + OpenClaw + EDB integration
    logger.info('📊 Initializing Numerai + EDB integration...');
    const entityModel = new EntityModel();
    const dataFetcher = new NumeraiDataFetcher(entityModel);
    const edbConfig = {
      host: process.env.EDB_HOST || 'localhost',
      port: parseInt(process.env.EDB_PORT || '5432'),
      database: process.env.EDB_DATABASE || 'numerai_data',
      username: process.env.EDB_USER,
      password: process.env.EDB_PASSWORD,
      timeout: 30000
    };
    // Note: Will be initialized with openclaw after OpenClaw handler is available
    let openclawEDBBridge: OpenClawEDBBridge;
    logger.info('✓ Numerai components initialized');

    // 5b. Initialize Autonomous Session Manager (prevents stalls)
    logger.info('📋 Initializing Autonomous Session Manager...');
    const sessionManager = new AutonomousSessionManager();
    logger.info('✓ Autonomous Session Manager ready');

    // 5d. Initialize 007 (rogue-agent watch)
    logger.info('🎯 Initializing 007 — Rogue Agent Watch...');
    guardrailsAgent.start();
    logger.info('✓ 007 active and monitoring');

    // 5c. Initialize Authentication System (employee auth + roles)
    logger.info('🔐 Initializing Authentication System...');
    // Field-encryption key sourced from the infra layer (secrets were loaded at
    // the top of initialize()); falls back to AuthSystem's env behavior when
    // Infisical isn't configured yet.
    const authSystem = new AuthSystem({ fieldCrypto: secrets ? resolveFieldCrypto(secrets) : undefined });
    // Expose the auth system to the module-level spend-approval routes so they
    // can verify a Bearer session token + privileged role (see privilegedActor).
    approverAuthSystem = authSystem;
    const authMiddleware = new AuthMiddleware(authSystem);
    const ceoAuditLogger = new CEOAuditLogger();
    const specialistDashboards = new SpecialistDashboards();
    logger.info('✓ Auth system, middleware, CEO audit logger, and specialist dashboards ready');

    // 5d. Setup API routes
    setupRoutes(app, { lightrag, agentAPI, kafka, modelRouter, metrics, taskScheduler, taskFacilitator, sessionManager, seasonalEvents, deploymentManager, collaborationManager, analytics, backupManager, authSystem, ceoAuditLogger, specialistDashboards, entityModel, dataFetcher, edbConfig });

    // 5e. Setup authentication routes (+ per-attempt login anomaly scoring)
    const loginAnomalyMonitor = new LoginAnomalyMonitor();
    setupAuthRoutes(app, authSystem, authMiddleware, { auditLogger: ceoAuditLogger, anomalyMonitor: loginAnomalyMonitor });
    setupAuditRoutes(app, ceoAuditLogger, authMiddleware);
    setupSpecialistRoutes(app, specialistDashboards, authMiddleware);

    // 5e-bis. Audit log retention (purge events older than the window; auto unless AUDIT_RETENTION_AUTO=false)
    const auditRetention = new AuditRetentionScheduler(ceoAuditLogger, {
      retentionDays: parseInt(process.env.AUDIT_RETENTION_DAYS || '90'),
      intervalMs: parseInt(process.env.AUDIT_RETENTION_INTERVAL_HOURS || '24') * 60 * 60 * 1000,
      runOnStart: (process.env.AUDIT_RETENTION_RUN_ON_START || 'false').toLowerCase() === 'true',
    });
    if ((process.env.AUDIT_RETENTION_AUTO || 'true').toLowerCase() === 'true') {
      auditRetention.start();
    }

    // 5f. Setup GitHub sync (auto-sync disabled unless GITHUB_SYNC_AUTO=true)
    const githubSync = new GitHubSync({
      remoteUrl: process.env.GITHUB_SYNC_REMOTE || '',
      branch: process.env.GITHUB_SYNC_BRANCH || 'master',
      autoSync: (process.env.GITHUB_SYNC_AUTO || 'false').toLowerCase() === 'true',
      syncInterval: parseInt(process.env.GITHUB_SYNC_INTERVAL_MIN || '30'),
      excludePatterns: (process.env.GITHUB_SYNC_EXCLUDE || '.env,*.key,*.pem,credentials.json')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean),
    });
    setupGitHubRoutes(app, githubSync, authMiddleware);

    // 5g. Security dashboard (CEO composite view of audit + auth signals)
    const securityDashboard = new SecurityDashboard(authSystem, ceoAuditLogger);
    setupSecurityRoutes(app, securityDashboard, authMiddleware);

    // 5g-bis. OpenAPI spec + Swagger UI (public) for the auth/audit/dashboard/security API
    setupOpenApiRoutes(app);

    // 5h. Quality dashboard (CEO view of QA gate reports — mirrors the
    // security dashboard pattern but reads <project>/build/qa/*.json
    // produced by the four QA tools defined in QUALITY_STANDARDS.md).
    const qualityDashboard = new QualityDashboard();
    setupQualityRoutes(app, qualityDashboard, authMiddleware);

    // 5b. Register SPA routes (must be after all API routes!)
    app.get('/', serveSPAFile);
    app.all('*', (req, res, next) => {
      // Skip API and static file routes
      if (req.path.startsWith('/api') || req.path.startsWith('/health') ||
          req.path.includes('.') || req.path.startsWith('/socket')) {
        return next();
      }
      serveSPAFile(req, res);
    });

    // 6. Setup WebSocket handlers for real-time updates
    setupWebSocketHandlers(io, { lightrag, kafka });

    // 6b. Start vitals monitor (if GPU_ENABLED). Spawns vitals-monitor.sh
    //     as a child so the JSONL keeps updating. Routes wired below.
    //
    // Sample interval: 5s (was 30s). nvtop refreshes ~1-2s, so 30s caused
    // the dashboard to lag visibly behind a side-by-side terminal. 5s cuts
    // the gap to within one dashboard refresh tick. JSONL grows 6× faster
    // (~17k entries/24h vs ~2.9k) — still trivial vs available disk.
    // Override via VITALS_INTERVAL_SEC env var.
    const vitals = new VitalsService();
    const vitalsInterval = parseInt(process.env.VITALS_INTERVAL_SEC || '5');
    if (vitals.isGpuEnabled()) vitals.startMonitor(vitalsInterval);
    const inferenceAudit = new InferenceAudit();
    const selfRepair = new SelfRepair(inferenceAudit);
    if (vitals.isGpuEnabled() && (process.env.SELF_REPAIR_ENABLED ?? 'true').toLowerCase() !== 'false') {
      selfRepair.start();
    }
    setupVitalsRoutes(app, vitals, inferenceAudit, selfRepair);
    setupGuardrailsRoutes(app);
    setupContainmentRoutes(app);
    console.log(`🛡️  ContainmentGuard MEGA active (mode: ${containmentGuard.mode}, ${containmentGuard.getPolicy().commandRules.length} command rules)`);
    setupPlaytestRoutes(app);

    // 6c. Global JSON error handler — must be registered after every route.
    // Without it, an error thrown (or forwarded via next(err)) in any handler
    // falls through to Express's default handler, which returns an HTML page
    // and leaks the stack trace, breaking the JSON API contract. Log the full
    // error server-side; return a terse JSON 500 to the caller.
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (res.headersSent) return next(err);
      logger.error(`Unhandled error on ${req.method} ${req.path}: ${err?.stack || err?.message || err}`);
      res.status(err?.status || 500).json({
        success: false,
        error: err?.message || 'internal server error',
      });
    });

    // 6c. Global JSON error handler — must be registered after every route.
    // Without it, an error thrown (or forwarded via next(err)) in any handler
    // falls through to Express's default handler, which returns an HTML page
    // and leaks the stack trace, breaking the JSON API contract. Log the full
    // error server-side; return a terse JSON 500 to the caller.
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
      if (res.headersSent) return next(err);
      logger.error(`Unhandled error on ${req.method} ${req.path}: ${err?.stack || err?.message || err}`);
      res.status(err?.status || 500).json({
        success: false,
        error: err?.message || 'internal server error',
      });
    });

    // 7. Start server — bind to HOST (loopback by default; see HOST above).
    server.listen(PORT as number, HOST, () => {
      logger.info(`
╔════════════════════════════════════════════════╗
║  VirtualPC Ready                               ║
╠════════════════════════════════════════════════╣
║  Status: Running                               ║
║  Bind: ${HOST}:${PORT}                         ║
║  Web UI: http://localhost:${PORT}             ║
║  Components: LightRAG, Kafka, Socket.io        ║
║  Agents: Ready to execute                      ║
╚════════════════════════════════════════════════╝
      `);
    });

    // Graceful shutdown — without this, the Express + Socket.IO + Kafka
    // sockets keep the event loop alive after SIGTERM, so systemd waits
    // the full 90 s default before SIGKILLing. Now: stop accepting new
    // connections, flush every dirty store, disconnect Kafka + Neo4j,
    // exit. Force-exit at 8s so the unit can restart cleanly.
    let shuttingDown = false;
    async function shutdown(sig: string) {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info(`▶ ${sig} received — graceful shutdown`);
      const forceExit = setTimeout(() => {
        logger.warn('graceful shutdown took >8s — force-exit');
        process.exit(1);
      }, 8000);
      try {
        // Stop accepting new HTTP connections (existing in-flight ones still complete).
        await new Promise<void>(resolve => server.close(() => resolve()));
        // Flush every dirty in-memory store synchronously.
        try { (taskEngine as any).flushSync?.(); } catch { /* */ }
        try { governance.flushSync(); } catch { /* */ }
        try { wiki.flushSync(); } catch { /* */ }
        try { scrum.flushSync(); } catch { /* */ }
        try { forum.flushSync(); } catch { /* */ }
        try { kami.flushSync(); } catch { /* */ }
        // Disconnect Kafka producer (consumer disconnect is best-effort).
        try {
          const { ensureSharedProducer } = require('./integrations/kafka/shared');
          const p = await ensureSharedProducer();
          await p?.disconnect?.();
        } catch { /* */ }
        clearTimeout(forceExit);
        logger.info('✓ shutdown complete');
        process.exit(0);
      } catch (e: any) {
        logger.warn(`shutdown error: ${e.message}`);
        clearTimeout(forceExit);
        process.exit(1);
      }
    }
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

/**
 * Setup API routes
 */
function setupRoutes(app: express.Express, components: any) {
  const { lightrag, agentAPI, kafka, modelRouter, metrics, taskScheduler, taskFacilitator, sessionManager, seasonalEvents, deploymentManager, collaborationManager, analytics, backupManager, authSystem, ceoAuditLogger, specialistDashboards, entityModel, dataFetcher, edbConfig } = components;

  // Local inference audit instance for this routes module
  const inferenceAudit = new InferenceAudit();

  // ========== Agent Memory API (with caching + rate limiting) ==========

  app.post('/api/memory/query', async (req, res) => {
    try {
      const { agent, topic, filters } = req.body;
      const result = await agentAPI.queryMemory(agent || 'anonymous', topic);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/memory/add-decision', async (req, res) => {
    try {
      const { agent, decision } = req.body;
      await agentAPI.addDecision(agent || 'anonymous', decision);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/memory/find-precedent', async (req, res) => {
    try {
      const { topic, threshold } = req.body;
      const results = await agentAPI.findPrecedent(topic, threshold || 0.75);
      res.json({ success: true, precedents: results });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/memory/status', async (req, res) => {
    try {
      const status = await agentAPI.getMemoryStatus();
      res.json({ success: true, ...status });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/memory/cache-stats', (req, res) => {
    try {
      const stats = agentAPI.getCacheStats();
      res.json({ success: true, ...stats });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== Raw Memory API (direct LightRAG access) ==========

  app.post('/api/memory/query-raw', async (req, res) => {
    try {
      const { query, filters } = req.body;
      const result = await lightrag.query(query, filters);
      res.json({ success: true, result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/memory/add-fact', async (req, res) => {
    try {
      const { fact, context, type, affects } = req.body;
      const result = await lightrag.addNode({
        type, content: fact, context, affects
      });
      res.json({ success: true, node_id: result.id });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Model routing routes
  app.post('/api/model/route', async (req, res) => {
    try {
      const { task, context } = req.body;
      const selected = await modelRouter.route(task, context);
      res.json({ success: true, selected_model: selected });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Kafka routes
  app.get('/api/kafka/status', async (req, res): Promise<any> => {
    try {
      if (!kafka) {
        return res.json({
          success: true,
          status: 'disabled',
          mode: 'development',
          message: 'Kafka disabled in development mode - running single-node',
          topics: ['agent.tasks', 'agent.results', 'model.requests', 'model.responses', 'lightrag.updates', 'game.events', 'system.alerts']
        });
      }
      const status = await kafka.getStatus();
      res.json(status);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== BACKLOG MANAGEMENT ==========

  app.post('/api/backlog/create', async (req, res) => {
    try {
      const { title, description, priority, assigned_to, story_points, sprint } = req.body;
      const id = `backlog-${Date.now()}`;
      const item = {
        id,
        title,
        description,
        priority: priority || 'medium',
        assigned_to,
        story_points: story_points || 0,
        sprint: sprint || 'backlog',
        status: 'new',
        created_at: new Date().toISOString()
      };
      await lightrag.addNode({
        type: 'Backlog',
        content: title,
        context: description,
        affects: [assigned_to || 'unassigned']
      });
      res.json({ success: true, item });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/backlog', async (req, res) => {
    try {
      const items = taskEngine.getBacklogItems();
      const completed = items.filter((i: any) => i.status === 'completed').length;
      const inProgress = items.filter((i: any) => i.status === 'in_progress').length;
      const pending = items.filter((i: any) => i.status === 'pending').length;
      const total = items.length;

      // Build priority queue from in-progress and pending items
      const activeItems = items.filter((i: any) => i.status !== 'completed');
      const priorityOrder: { [k: string]: number } = { high: 0, medium: 1, low: 2 };
      activeItems.sort((a: any, b: any) => (priorityOrder[a.priority] || 9) - (priorityOrder[b.priority] || 9));
      const queue = activeItems.slice(0, 5).map((item: any, idx: number) => ({
        rank: idx + 1,
        task: item.title,
        id: item.id,
        status: item.status === 'in_progress' ? 'in-progress' : item.status,
      }));

      res.json({
        success: true,
        items,
        total,
        by_priority: { high: items.filter((i: any) => i.priority === 'high').length, medium: items.filter((i: any) => i.priority === 'medium').length, low: items.filter((i: any) => i.priority === 'low').length },
        summary: { completed, inProgress, pending, total },
        priority_queue: queue,
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== ISSUES & BLOCKERS ==========

  app.post('/api/issues/create', async (req, res) => {
    try {
      const { title, description, severity, assigned_to, blocking_task } = req.body;
      const id = `issue-${Date.now()}`;
      const issue = {
        id,
        title,
        description,
        severity: severity || 'medium',
        assigned_to,
        blocking_task,
        status: 'open',
        created_at: new Date().toISOString()
      };
      await lightrag.addNode({
        type: 'Risk',
        content: title,
        context: description,
        affects: [assigned_to || 'team']
      });
      res.json({ success: true, issue });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/issues', async (req, res) => {
    try {
      const status = req.query.status || 'all';
      const now = new Date().toISOString();
      res.json({
        success: true,
        issues: [
          { id: 'iss-1', title: 'Neo4j connection timeout', description: 'LightRAG connection drops after 30min idle. Need connection pooling or keepalive configuration.', severity: 'high', assigned_to: 'Kai (CTO)', status: 'in_progress', blocking_task: 'PLATFORM-6.1', created_at: now, updated_at: now },
          { id: 'iss-2', title: 'Kafka topic creation race condition', description: 'When multiple agents try to create the same topic simultaneously, only one succeeds. Need pre-creation or locking.', severity: 'medium', assigned_to: 'Kai (CTO)', status: 'open', blocking_task: 'PLATFORM-6.1', created_at: now, updated_at: now }
        ],
        total: 2,
        open: 1,
        in_progress: 1,
        resolved: 0
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== DASHBOARD & PROGRESS ==========

  app.get('/api/dashboard', async (req, res) => {
    try {
      res.json({
        success: true,
        tasksCompleted: 58,
        monthlySavings: '1,760',
        overview: {
          total_tasks: 75,
          completed: 58,
          in_progress: 12,
          pending: 5,
          blocked: 2
        },
        agents: {
          fill: { status: 'idle', tasks_completed: 8, current_task: 'Strategic planning' },
          kai: { status: 'working', tasks_completed: 18, current_task: 'PLATFORM-6.1: Kafka Integration' },
          zip: { status: 'working', tasks_completed: 15, current_task: 'Deep Ocean Reactor Zone' },
          mira: { status: 'working', tasks_completed: 6, current_task: 'VirtualPC Dashboard Design' },
          luna: { status: 'idle', tasks_completed: 11, current_task: 'Performance optimization' }
        },
        cost_optimization: {
          reduction_percent: 87,
          daily_cost: 2.34,
          daily_budget: 50,
          monthly_cost: 45.67,
          monthly_budget: 1500
        },
        performance: {
          api_latency_ms: 8.3,
          cache_hit_rate: 40,
          memory_connected: true,
          kafka_topics: 7
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/agents/status', async (req, res) => {
    try {
      const agentMeta = [
        { name: 'Fill', role: 'CEO', costRate: 0.05 },
        { name: 'Kai', role: 'CTO', costRate: 0.08 },
        { name: 'Zip', role: 'Developer', costRate: 0.06 },
        { name: 'Mira', role: 'Creative Director', costRate: 0.04 },
        { name: 'Luna', role: 'Tech Artist', costRate: 0.05 },
      ];
      const agents = agentMeta.map(a => {
        const prog = taskEngine.getAgentProgress(a.name);
        return {
          name: a.name,
          role: a.role,
          status: prog.inProgress > 0 ? 'working' : 'idle',
          currentTask: prog.currentTask || 'Waiting...',
          tasksCompleted: prog.completed,
          costUsed: +(prog.completed * a.costRate).toFixed(2),
          avg_quality: +(0.88 + Math.random() * 0.1).toFixed(2),
          efficiency: +(0.75 + Math.random() * 0.15).toFixed(2),
        };
      });
      res.json({
        success: true,
        agents,
        team_efficiency: +(agents.reduce((s, a) => s + a.efficiency, 0) / agents.length).toFixed(2),
        total_decisions_recorded: agents.reduce((s, a) => s + a.tasksCompleted, 0),
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/cost/dashboard', async (req, res) => {
    try {
      res.json({
        success: true,
        cost_optimization: {
          total_reduction: '87%',
          breakdown: {
            caching: '40% (LightRAG)',
            batching: '30% (request combining)',
            routing: '20% (model selection)'
          },
          costs: {
            daily: { spent: 2.34, budget: 50, remaining: 47.66 },
            monthly: { spent: 45.67, budget: 1500, remaining: 1454.33 }
          },
          by_agent: [
            { agent: 'kai', cost: 1.89, tasks: 3 },
            { agent: 'fill', cost: 0.45, tasks: 1 },
            { agent: 'zip', cost: 0, tasks: 0 },
            { agent: 'mira', cost: 0, tasks: 0 },
            { agent: 'luna', cost: 0, tasks: 0 }
          ]
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== METRICS & MONITORING ==========
  app.get('/api/metrics/system', (req, res) => {
    try {
      const systemMetrics = metrics.getSystemMetrics();
      res.json({ success: true, ...systemMetrics });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/metrics/agents', (req, res) => {
    try {
      const agentMetrics = metrics.getAgentMetrics();
      res.json({ success: true, agents: agentMetrics });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/metrics/infrastructure', (req, res) => {
    try {
      const infraMetrics = metrics.getInfrastructureMetrics();
      res.json({ success: true, ...infraMetrics });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/metrics/performance', (req, res) => {
    try {
      const perfMetrics = metrics.getPerformanceMetrics();
      res.json({ success: true, ...perfMetrics });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== TASK SCHEDULING ==========
  app.post('/api/tasks/schedule', (req, res) => {
    try {
      const { title, description, skills_required, priority, estimated_hours, assigned_to } = req.body;
      const task = taskScheduler.scheduleTask({
        title,
        description,
        priority: priority || 'medium',
        assignedTo: assigned_to || '',
        dependencies: [],
        estimatedTime: (estimated_hours || 8) * 60,
        deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        createdAt: new Date()
      } as any);
      res.json({ success: true, task });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/tasks/schedule', (req, res) => {
    try {
      const schedule = taskScheduler.getTeamSchedule();
      const stats = taskScheduler.getStatistics();
      res.json({
        success: true,
        schedule: schedule,
        totalTasks: stats.totalTasks || 0,
        completedTasks: stats.completedTasks || 0,
        agentWorkload: stats.agentWorkload || {},
        efficiency: stats.efficiency || {}
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/tasks/agent/:agent', (req, res) => {
    try {
      const agentSchedule = taskScheduler.getAgentSchedule(req.params.agent);
      res.json({ success: true, ...agentSchedule });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/tasks/:taskId/complete', (req, res) => {
    try {
      const { quality_score, notes } = req.body;
      const result = taskScheduler.completeTask(req.params.taskId, quality_score, notes);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== TASK FACILITATION (Prevents Hanging Tasks) ==========

  app.post('/api/tasks/facilitate/register', (req, res) => {
    try {
      const { taskId, agent, priority } = req.body;
      const facilitation = taskFacilitator.registerTask(taskId, agent, priority || 0);
      return res.json({ success: true, facilitation });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/tasks/facilitate/:taskId/assign', (req, res) => {
    try {
      const { agent } = req.body;
      const success = taskFacilitator.assignTask(req.params.taskId, agent);
      return res.json({ success });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/tasks/facilitate/:taskId/start', (req, res) => {
    try {
      const success = taskFacilitator.startTask(req.params.taskId);
      return res.json({ success });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/tasks/facilitate/:taskId/activity', (req, res) => {
    try {
      taskFacilitator.updateActivity(req.params.taskId);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/tasks/facilitate/status', (req, res) => {
    try {
      const stats = taskFacilitator.getStats();
      const workload = taskFacilitator.getAgentWorkload();
      const pending = taskFacilitator.getPendingTasks();
      const blocked = taskFacilitator.getBlockedTasks();
      const escalated = taskFacilitator.getEscalatedTasks();

      return res.json({
        success: true,
        stats,
        workload,
        pending_count: pending.length,
        blocked_count: blocked.length,
        escalated_count: escalated.length
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/tasks/facilitate/:taskId/block', (req, res) => {
    try {
      const { blockedBy } = req.body;
      taskFacilitator.blockTask(req.params.taskId, blockedBy || []);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/tasks/facilitate/:taskId/unblock', (req, res) => {
    try {
      taskFacilitator.unblockTask(req.params.taskId);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== AUTONOMOUS SESSION MANAGEMENT ==========

  app.post('/api/sessions/start', (req, res) => {
    try {
      const { duration, config } = req.body;
      const session = sessionManager.startSession(duration || 480, config);
      return res.json({ success: true, session });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/sessions/record-commit', (req, res) => {
    try {
      const { message, hash, filesChanged, linesAdded } = req.body;
      sessionManager.recordCommit(message, hash, filesChanged || 0, linesAdded || 0);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/sessions/record-task-update', (req, res) => {
    try {
      const { taskId, status, activeForm } = req.body;
      sessionManager.recordTaskUpdate(taskId, status, activeForm || '');
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/sessions/record-progress', (req, res) => {
    try {
      const { phase, title, whatBuilt, nextActions } = req.body;
      sessionManager.recordProgressReport(phase, title, whatBuilt || [], nextActions || []);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.put('/api/sessions/context-tokens', (req, res) => {
    try {
      const { tokens } = req.body;
      sessionManager.updateContextTokens(tokens || 0);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/sessions/stats', (req, res) => {
    try {
      const stats = sessionManager.getStats();
      return res.json({ success: true, stats });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/sessions/warnings', (req, res) => {
    try {
      const warnings = sessionManager.getWarnings();
      const critical = warnings.filter((w: any) => w.severity === 'critical');
      return res.json({
        success: true,
        total: warnings.length,
        critical: critical.length,
        warnings
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/sessions/stop', (req, res) => {
    try {
      sessionManager.stop();
      return res.json({ success: true, message: 'Session paused' });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== SEASONAL EVENTS ==========
  app.get('/api/events/active', (req, res) => {
    try {
      const activeEvents = seasonalEvents.getActiveEvents();
      res.json({ success: true, events: activeEvents });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/events/challenges', (req, res) => {
    try {
      const challenges = seasonalEvents.getActiveChallenges();
      res.json({ success: true, challenges });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/events/progress/:eventId', (req, res) => {
    try {
      const { player_id, progress_data } = req.body;
      const result = seasonalEvents.updateEventProgress(req.params.eventId, player_id, progress_data);
      res.json({ success: true, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/events/leaderboard', (req, res) => {
    try {
      const leaderboard = seasonalEvents.getLeaderboard();
      res.json({ success: true, leaderboard });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== DEPLOYMENT MANAGEMENT ==========
  app.post('/api/deployments/start', (req, res) => {
    try {
      const { version, environment, services } = req.body;
      const deployment = deploymentManager.startDeployment(version, environment, services);
      res.json({ success: true, deployment });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/deployments/:deploymentId', (req, res) => {
    try {
      const deployment = deploymentManager.getDeploymentStatus(req.params.deploymentId);
      if (!deployment) {
        return res.status(404).json({ success: false, error: 'Deployment not found' });
      }
      return res.json({ success: true, deployment });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/deployments/:deploymentId/rollback', (req, res) => {
    try {
      const rollback = deploymentManager.rollback(req.params.deploymentId);
      if (!rollback) {
        return res.status(404).json({ success: false, error: 'Cannot rollback deployment' });
      }
      return res.json({ success: true, rollback });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/deployments/history/:environment', (req, res) => {
    try {
      const history = deploymentManager.getDeploymentHistory(req.params.environment, parseInt(req.query.limit as string) || 50);
      res.json({ success: true, history });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/deployments/readiness/:environment', (req, res) => {
    try {
      const readiness = deploymentManager.getDeploymentReadiness(req.params.environment);
      res.json({ success: true, ...readiness });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== COLLABORATION ==========
  app.post('/api/collaboration/start', (req, res) => {
    try {
      const { type, participants, priority } = req.body;
      const collab = collaborationManager.startCollaboration(type, participants, priority);
      res.json({ success: true, collab });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/collaboration/:collabId/message', (req, res) => {
    try {
      const { author, content, attachments } = req.body;
      const message = collaborationManager.addMessage(req.params.collabId, author, content, attachments);
      if (!message) {
        return res.status(404).json({ success: false, error: 'Collaboration not found' });
      }
      return res.json({ success: true, message });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/workspaces/create', (req, res) => {
    try {
      const { name, owner, members } = req.body;
      const workspace = collaborationManager.createWorkspace(name, owner, members);
      res.json({ success: true, workspace });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/collaboration/team-summary', (req, res) => {
    try {
      const summary = collaborationManager.getTeamSummary();
      res.json({ success: true, ...summary });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== ANALYTICS ==========
  app.post('/api/analytics/track', (req, res) => {
    try {
      const { type, agent, duration, status, metadata } = req.body;
      const event = analytics.trackEvent(type, agent, duration, status, metadata);
      res.json({ success: true, event });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/analytics/performance', (req, res) => {
    try {
      const agentName = req.query.agent as string;
      const hoursBack = parseInt(req.query.hours as string) || 24;
      const report = analytics.getPerformanceReport(agentName, hoursBack);
      res.json({ success: true, ...report });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/analytics/trends', (req, res) => {
    try {
      const hoursBack = parseInt(req.query.hours as string) || 24;
      const trends = analytics.getTrends(hoursBack);
      res.json({ success: true, ...trends });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/analytics/insights', (req, res) => {
    try {
      const priority = req.query.priority as string;
      const insights = analytics.getInsights(priority);
      res.json({ success: true, insights });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/analytics/health', (req, res) => {
    try {
      const health = analytics.getHealthScore();
      res.json({ success: true, ...health });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Analytics dashboard summary (used by React AnalyticsDashboard page)
  app.get('/api/analytics/dashboard', (req, res) => {
    try {
      res.json({
        success: true,
        stats: {
          totalRequests: 24750,
          averageLatency: 8.3,
          p99Latency: 45.2,
          errorRate: 0.02,
          cacheHitRate: 87,
          activeUsers: 5,
          throughput: 142
        }
      });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== BACKUP & DISASTER RECOVERY ==========
  app.post('/api/backups/create', (req, res) => {
    try {
      const { database, type } = req.body;
      const backup = backupManager.createBackup(database, type);
      res.json({ success: true, backup });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Statistics route must come BEFORE parametrized /:backupId route
  app.get('/api/backups/statistics', (req, res) => {
    try {
      const stats = backupManager.getBackupStatistics();
      return res.json({ success: true, ...stats });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/backups/:backupId', (req, res) => {
    try {
      const backup = backupManager.getBackupStatus(req.params.backupId);
      if (!backup) {
        return res.status(404).json({ success: false, error: 'Backup not found' });
      }
      return res.json({ success: true, backup });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/backups/:backupId/restore', (req, res) => {
    try {
      const result = backupManager.restore(req.params.backupId);
      res.json({ success: result.success, ...result });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/backups/history/:database', (req, res) => {
    try {
      const history = backupManager.getBackupHistory(req.params.database, parseInt(req.query.limit as string) || 50);
      res.json({ success: true, history });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/recovery/status', (req, res) => {
    try {
      const status = backupManager.getDisasterRecoveryStatus();
      res.json({ success: true, ...status });
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== SECURITY & AUDIT LOGGING ==========
  // Note: CEO audit logging routes are set up in setupAuditRoutes
  // These provide CEO-only access to: /api/audit/stats, /api/audit/events, /api/audit/export/*

  // ========== LOCAL MODEL INFERENCE (OLLAMA) ==========
  app.get('/api/models/ollama/status', async (req, res) => {
    try {
      // Check if Ollama is running
      const response = await fetch('http://localhost:11434/api/tags', {
        timeout: 5000
      } as any);

      if (response.ok) {
        const data: any = await response.json();
        return res.json({
          success: true,
          health: 'operational',
          models_available: data?.models?.map((m: any) => m.name) || [],
          models_configured: ['qwen-27b', 'qwen-14b', 'qwen-7b', 'deepseek-r1-8b', 'phi-4-15b', 'mistral-7b'],
          inference: 'enabled'
        });
      } else {
        return res.json({
          success: false,
          health: 'offline',
          error: 'Ollama service not responding'
        });
      }
    } catch (error: any) {
      return res.json({
        success: false,
        health: 'offline',
        error: 'Ollama not available - start with: ollama serve'
      });
    }
  });

  app.post('/api/models/inference', async (req, res) => {
    const startTs = Date.now();
    const { model, prompt, max_tokens } = req.body;
    const caller = String(req.header('x-agent-id') || req.header('x-caller') || req.ip || 'anonymous');

    // Per-caller concurrency cap — keeps a misbehaving agent from saturating
    // the GPU. Bypass with X-Bypass-Quota: 1 (trusted internal callers).
    const perCallerMax = Number(process.env.INFERENCE_PER_CALLER_MAX || 3);
    const bypass = req.header('x-bypass-quota') === '1';
    const inflight = inferenceAudit.inflightFor(caller);
    if (!bypass && inflight >= perCallerMax) {
      res.set('Retry-After', '5');
      await inferenceAudit.record({
        ts: new Date(startTs).toISOString(), caller, model: String(model || ''),
        prompt_head: '', prompt_hash: '', max_tokens: Number(max_tokens || 0),
        tokens_prompt: 0, tokens_completion: 0, latency_ms: 0,
        triggered_load: false, success: false, error: `quota: ${inflight}/${perCallerMax} in-flight`,
      });
      return res.status(429).json({
        success: false,
        error: `caller ${caller} has ${inflight} in-flight calls, max ${perCallerMax}`,
        retry_after_s: 5,
      });
    }
    inferenceAudit.startInflight(caller);

    // Record in-memory activity before we fetch — otherwise the self-repair
    // idle rule can race a long inference and unload its model mid-flight.
    inferenceAudit.markActivity(model);
    // Snapshot loaded models BEFORE the request to detect a "triggered_load".
    const loadedBefore = await InferenceAudit.loadedModels();

    const writeAudit = async (ok: boolean, tokensP: number, tokensC: number, err?: string) => {
      try {
        const triggered = ok ? await InferenceAudit.checkLoadTrigger(model, loadedBefore) : false;
        await inferenceAudit.record({
          ts: new Date(startTs).toISOString(),
          caller, model,
          prompt_head: typeof prompt === 'string' ? prompt.slice(0, 200) : '',
          prompt_hash: InferenceAudit.hashPrompt(String(prompt ?? '')),
          max_tokens: Number(max_tokens || 2048),
          tokens_prompt: tokensP,
          tokens_completion: tokensC,
          latency_ms: Date.now() - startTs,
          triggered_load: triggered,
          success: ok,
          error: err,
        });
      } catch { /* audit never blocks the response */ }
    };

    try {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            num_predict: max_tokens || 2048,
            temperature: 0.7
          }
        }),
        timeout: 120000
      } as any);

      if (!response.ok) {
        await writeAudit(false, 0, 0, `upstream ${response.status}`);
        return res.status(503).json({
          success: false,
          error: 'Local inference failed - ensure Ollama is running'
        });
      }

      const data: any = await response.json();
      await writeAudit(true, data?.prompt_eval_count || 0, data?.eval_count || 0);
      return res.json({
        success: true,
        response: data?.response || '',
        model,
        provider: 'ollama',
        tokens: {
          prompt: data?.prompt_eval_count || 0,
          completion: data?.eval_count || 0
        }
      });
    } catch (error: any) {
      await writeAudit(false, 0, 0, error?.message || 'unknown');
      return res.status(503).json({
        success: false,
        error: 'Ollama service unavailable'
      });
    } finally {
      inferenceAudit.endInflight(caller);
    }
  });

  app.get('/api/models/config', (req, res) => {
    try {
      // Policy (2026-06-03): every agent runs on Claude Sonnet as primary;
      // Athena (Principal Reviewer) is the lone Opus 4.8 PR gate. Derived
      // from the registry so the map can never drift from the roster.
      // GPU-aware resolution: when the GPU is down, agents whose lead model is a
      // local GPU model dynamically switch to a no-GPU flux fallback.
      const gpuUp = getGpuAvailable();
      const agents: Record<string, { primary: string; fallback: string; switched?: boolean }> = {};
      for (const meta of AGENT_META) {
        const lead = meta.models[0] || 'claude-sonnet';
        const r = resolveModel(meta.models, gpuUp);
        const fallback = meta.models.find(m => m !== lead) || 'claude-opus';
        agents[meta.name.toLowerCase()] = { primary: r.model, fallback, ...(r.switched ? { switched: true } : {}) };
      }
      const config = {
        success: true,
        policy: 'sonnet-everywhere; Athena=opus reviewer' + (gpuUp ? '' : '; GPU DOWN — local-model agents on flux fallback'),
        gpuAvailable: gpuUp,
        agents,
        tier1_models: ['qwen-27b', 'qwen-14b', 'qwen-7b', 'deepseek-r1-8b', 'phi-4-15b', 'mistral-7b'],
        tier3_models: ['claude-opus', 'claude-sonnet', 'claude-haiku'],
        cost_optimization: {
          local_inference_cost: 0,
          claude_opus_cost: 0.000015,
          claude_sonnet_cost: 0.000003
        }
      };
      return res.json(config);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ========== Numerai + EDB Integration Routes ==========

  app.get('/api/numerai/entities', (req, res) => {
    try {
      const stats = entityModel.getStats();
      const feeds = entityModel.exportEntityFeed();
      return res.json({
        success: true,
        stats,
        securities_count: (feeds.securities || []).length,
        signals_count: (feeds.signals || []).length,
        competitions_count: (feeds.competitions || []).length,
        relationships_count: (feeds.relationships || []).length,
        data_quality: feeds.data_quality,
        last_update: feeds.date
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.post('/api/numerai/fetch-daily', async (req, res) => {
    try {
      const result = await dataFetcher.fetchDailyData();
      return res.json({
        success: result.success,
        timestamp: result.timestamp,
        securities_updated: result.securities_updated,
        signals_updated: result.signals_updated,
        competitions_updated: result.competitions_updated,
        data_quality: result.data_quality,
        errors: (result.errors as string[])
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/numerai/eligible-shares', (req, res) => {
    try {
      const securities = entityModel.getEntitiesByType('security') as any[];
      return res.json({
        success: true,
        count: securities.length,
        securities: securities.map(s => ({
          id: s.id,
          ticker: s.ticker,
          name: s.name,
          asset_class: s.asset_class,
          status: s.status
        }))
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/numerai/competitions', (req, res) => {
    try {
      const competitions = entityModel.getEntitiesByType('competition') as any[];
      return res.json({
        success: true,
        active_count: competitions.filter(c => c.status === 'active').length,
        total: competitions.length,
        competitions: competitions.map(c => ({
          id: c.id,
          name: c.competition_name,
          status: c.status,
          participants: c.participants,
          prize_pool: c.prize_pool
        }))
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  app.get('/api/numerai/data-quality', (req, res) => {
    try {
      const quality = dataFetcher.getDataQuality();
      const history = dataFetcher.getFetchHistory(30);
      return res.json({
        success: true,
        current: quality,
        recent_fetches: history.length,
        errors_last_30_days: history.filter((h: any) => !h.success).length,
        last_successful_fetch: dataFetcher.getLastFetch().toISOString()
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // Task status endpoint for UI auto-refresh
  app.get('/api/task-status', (req, res) => {
    try {
      // Return mock task statistics (can be enhanced with real tracking later)
      const taskStatus = {
        total: Math.floor(Math.random() * 50) + 20,
        completed: Math.floor(Math.random() * 20) + 5,
        inProgress: Math.floor(Math.random() * 15) + 2,
        pending: Math.floor(Math.random() * 30) + 10,
        timestamp: new Date().toISOString()
      };
      return res.json(taskStatus);
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // OpenClaw command execution routes (no approval required)
  setupOpenClawRoutes(app);

  logger.info('✓ Routes configured');
  logger.info('✓ OpenClaw autonomous command execution enabled');
}

/**
 * Setup WebSocket handlers for real-time updates
 */
function setupWebSocketHandlers(io: SocketIOServer, components: any) {
  io.on('connection', (socket) => {
    logger.info('Client connected to WebSocket');

    socket.on('disconnect', () => {
      logger.info('Client disconnected from WebSocket');
    });

    // Listen for agent status requests
    socket.on('request-agent-status', async () => {
      try {
        // Fetch current agent status and emit to client - All agents working
        const agents = [
          { name: 'Fill', role: 'CEO', status: 'working', currentTask: 'Strategic Planning & WBSO Coordination', tasksCompleted: 12, costUsed: 4.50 },
          { name: 'Kai', role: 'CTO', status: 'working', currentTask: 'Kafka Optimization & Infrastructure', tasksCompleted: 18, costUsed: 8.91 },
          { name: 'Zip', role: 'Developer', status: 'working', currentTask: 'VirtualPC Core Features', tasksCompleted: 15, costUsed: 6.75 },
          { name: 'Mira', role: 'Artist', status: 'working', currentTask: 'Design system v2', tasksCompleted: 8, costUsed: 3.60 },
          { name: 'Luna', role: 'Tech Artist', status: 'working', currentTask: '3D Optimization & VR/AR Integration', tasksCompleted: 11, costUsed: 5.25 }
        ];
        socket.emit('agent-status-update', agents);
      } catch (error) {
        logger.error('Error fetching agent status:', error);
      }
    });

    // Listen for backlog updates
    socket.on('request-backlog', async () => {
      try {
        socket.emit('backlog-update', { items: [], lastUpdate: new Date() });
      } catch (error) {
        logger.error('Error fetching backlog:', error);
      }
    });

    // Listen for issue updates
    socket.on('request-issues', async () => {
      try {
        socket.emit('issue-update', { issues: [], lastUpdate: new Date() });
      } catch (error) {
        logger.error('Error fetching issues:', error);
      }
    });

    // Listen for memory updates
    socket.on('request-memory', async () => {
      try {
        socket.emit('memory-update', { entries: [], lastUpdate: new Date() });
      } catch (error) {
        logger.error('Error fetching memory:', error);
      }
    });
  });

  logger.info('✓ WebSocket handlers configured');
}

/**
 * Vitals + GPU control routes.
 * All endpoints are safe when GPU_ENABLED=false (snapshot drops GPU fields,
 * gpu/clean returns 503).
 */
function setupVitalsRoutes(app: express.Express, vitals: VitalsService, audit?: InferenceAudit, repair?: SelfRepair) {
  app.get('/api/vitals', async (_req, res) => {
    try {
      const snap = await vitals.getSnapshot();
      if (!snap) return res.status(404).json({ success: false, error: 'no snapshot yet' });
      return res.json({ success: true, gpu_enabled: vitals.isGpuEnabled(), snapshot: snap });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/vitals/history', async (req, res) => {
    try {
      const windowsParam = String(req.query.windows || '');
      const windows = windowsParam
        ? Object.fromEntries(windowsParam.split(',').map(w => {
            const [name, secs] = w.split(':');
            return [name, secs === 'all' ? null : Number(secs)];
          }))
        : undefined;
      const history = await vitals.getHistory(windows as any);
      return res.json({ success: true, gpu_enabled: vitals.isGpuEnabled(), history });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  app.get('/api/vitals/gpu', async (req, res) => {
    try {
      const snap = await vitals.getSnapshot();
      if (!snap) return res.status(404).json({ success: false, error: 'no snapshot yet' });
      // ?fresh=1 — bypass the cached snapshot and run nvidia-smi inline so
      // util/mem/temp match what nvtop shows right now (cached data lags by
      // up to one sample interval). Costs ~50 ms per call. Keeps gpu_procs
      // from the snapshot since that requires a separate nvidia-smi call.
      let gpus = snap.gpus;
      let live = false;
      if (req.query.fresh) {
        try {
          const fresh = await new Promise<any[]>((resolve, reject) => {
            const { execFile } = require('child_process');
            execFile('nvidia-smi',
              ['--query-gpu=index,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw', '--format=csv,noheader,nounits'],
              { timeout: 4000 },
              (err: any, stdout: string) => {
                if (err) return reject(err);
                resolve(stdout.trim().split('\n').map(line => {
                  const [i, util, mu, mt, t, p] = line.split(',').map(s => s.trim());
                  return { i: parseInt(i), util: parseInt(util) || 0, mem_used: parseInt(mu) || 0, mem_total: parseInt(mt) || 0, temp: parseInt(t) || 0, power: parseFloat(p) || 0 };
                }));
              });
          });
          gpus = fresh;
          live = true;
        } catch { /* fall through to cached */ }
      }
      return res.json({
        success: true,
        gpu_enabled: vitals.isGpuEnabled(),
        live,
        gpus,
        gpu_procs: snap.gpu_procs,
        ollama: snap.ollama,
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/gpu/clean', async (_req, res) => {
    if (!vitals.isGpuEnabled())
      return res.status(503).json({ success: false, error: 'GPU_ENABLED=false' });
    try {
      const result = await vitals.cleanGpu();
      return res.json({ success: true, ...result });
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/gpu/enable',  (_req, res) => { vitals.setGpuEnabled(true);  res.json({ success: true, gpu_enabled: true }); });
  app.post('/api/gpu/disable', (_req, res) => { vitals.setGpuEnabled(false); res.json({ success: true, gpu_enabled: false }); });

  app.get('/api/vitals/disk-candidates', async (req, res) => {
    try {
      const minMb = req.query.min_mb ? Number(req.query.min_mb) : 50;
      const limit = req.query.limit ? Number(req.query.limit) : 15;
      const candidates = await vitals.diskCandidates({ minMb, limit });
      res.json({ success: true, count: candidates.length, candidates });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  if (audit) {
    app.get('/api/vitals/inference-log', async (req, res) => {
      try {
        const events = await audit.query({
          caller: req.query.caller as string | undefined,
          model:  req.query.model as string | undefined,
          since:  req.query.since as string | undefined,
          limit:  req.query.limit ? Number(req.query.limit) : 100,
        });
        res.json({ success: true, count: events.length, events });
      } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
      }
    });

    app.get('/api/vitals/inference-stats', async (req, res) => {
      try {
        const w = req.query.window;
        const windowSec = (w == null || w === 'all') ? null : Number(w);
        const out = await audit.stats({ windowSec });
        const limit = Number(process.env.INFERENCE_PER_CALLER_MAX || 3);
        res.json({
          success: true,
          ...out,
          inflight: audit.inflightSnapshot(),
          per_caller_max: limit,
        });
      } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
      }
    });
  }

  if (repair) {
    app.get('/api/vitals/repair-log', async (req, res) => {
      try {
        const limit = req.query.limit ? Number(req.query.limit) : 50;
        const events = await repair.getRecent(limit);
        res.json({ success: true, mode: repair.getMode(), count: events.length, events });
      } catch (e: any) {
        res.status(500).json({ success: false, error: e.message });
      }
    });
    app.post('/api/vitals/repair-mode', (req, res) => {
      const mode = String(req.body?.mode || req.query.mode || '').toLowerCase();
      if (mode !== 'observe' && mode !== 'act') {
        res.status(400).json({ success: false, error: "mode must be 'observe' or 'act'" });
        return;
      }
      repair.setMode(mode as any);
      res.json({ success: true, mode });
    });
  }

  logger.info('✓ Vitals/GPU routes wired: /api/vitals, /api/vitals/history, /api/vitals/gpu, /api/vitals/inference-log, /api/vitals/repair-log, POST /api/gpu/{clean,enable,disable}, POST /api/vitals/repair-mode');
}

/**
 * Guardrails — suspicious-activity monitoring + manual intervention
 */
function setupGuardrailsRoutes(app: express.Express) {
  app.get('/api/guardrails/health', (_req, res) => {
    try { res.json({ success: true, data: guardrailsAgent.getSystemHealth() }); }
    catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.get('/api/guardrails/alerts', (req, res) => {
    try {
      const opts: any = {};
      if (req.query.severity) opts.severity = String(req.query.severity);
      if (req.query.acknowledged !== undefined) opts.acknowledged = req.query.acknowledged === 'true';
      if (req.query.agent) opts.agent = String(req.query.agent);
      if (req.query.limit) opts.limit = parseInt(String(req.query.limit), 10);
      res.json({ success: true, data: guardrailsAgent.getAlerts(opts) });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/api/guardrails/alerts/:id/acknowledge', (req, res) => {
    try {
      const ok = guardrailsAgent.acknowledgeAlert(req.params.id, String(req.body?.by || 'user'));
      res.json({ success: ok, message: ok ? 'acknowledged' : 'alert not found' });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.get('/api/guardrails/incidents', (req, res) => {
    try {
      const opts: any = {};
      if (req.query.resolved !== undefined) opts.resolved = req.query.resolved === 'true';
      if (req.query.agent) opts.agent = String(req.query.agent);
      if (req.query.limit) opts.limit = parseInt(String(req.query.limit), 10);
      res.json({ success: true, data: guardrailsAgent.getIncidents(opts) });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/api/guardrails/incidents/:id/resolve', (req, res) => {
    try {
      const ok = guardrailsAgent.resolveIncident(req.params.id);
      res.json({ success: ok, message: ok ? 'resolved' : 'incident not found' });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/api/guardrails/intervene', (req, res) => {
    try {
      const { type, targetAgent, targetTask, targetModel, reason } = req.body;
      if (!type || !reason) {
        res.status(400).json({ success: false, error: 'type and reason are required' });
        return;
      }
      const rec = guardrailsAgent.intervene({
        type, targetAgent, targetTask, targetModel, reason,
        initiatedBy: 'user',
      });
      res.json({ success: rec.result !== 'failed', data: rec });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.get('/api/guardrails/interventions', (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : undefined;
      res.json({ success: true, data: guardrailsAgent.getInterventions(limit) });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.get('/api/guardrails/rules', (_req, res) => {
    try { res.json({ success: true, data: guardrailsAgent.getRules() }); }
    catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/api/guardrails/rules/:id/toggle', (req, res) => {
    try {
      const enabled = req.body?.enabled !== undefined ? Boolean(req.body.enabled) : true;
      const ok = guardrailsAgent.setRuleEnabled(req.params.id, enabled);
      res.json({ success: ok, message: ok ? 'rule updated' : 'rule not found' });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  logger.info('✓ 007 routes wired: /api/guardrails/{health,alerts,incidents,intervene,interventions,rules}');
}

// Start the system
initialize().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});

export default app;
