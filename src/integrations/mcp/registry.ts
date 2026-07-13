/**
 * MCP-compatible tool registry — coordinates tool use across all agents.
 *
 * This is the in-house alternative to OpenAI Symphony for tool-call
 * orchestration. Symphony orchestrates issue queues; we already have a
 * task engine for that. What we needed was *tool-call* coordination — a
 * single layer that:
 *
 *   1. Catalogues every tool the agents can invoke (codegraph, governance,
 *      wiki, assets, scrum, forum) with a JSON schema for each.
 *   2. Enforces a per-agent ACL (the `tools` field on AgentMeta) so an
 *      agent can only call tools it was provisioned for.
 *   3. Returns a single, consistent shape — { ok, result, error } — so the
 *      caller doesn't need to know which subsystem actually answered.
 *
 * The shape mirrors the MCP "tools/list" + "tools/call" RPCs so we can
 * swap in @modelcontextprotocol/sdk later without changing the schemas.
 *
 * Both Claude CLI (`claude mcp add`) and Kimi CLI (`kimi mcp`) speak the
 * full MCP protocol; this registry speaks an HTTP subset that's easy to
 * shim into either.
 */
import { AGENT_META, getAgent } from '../../agent-registry';
import * as codegraph from '../codegraph';
import * as governance from '../governance';
import * as wiki from '../wiki';
import * as scrum from '../scrum';
import * as forum from '../forum';
import * as kami from '../kami';
import * as corpus from '../corpus';
import { terminalCoordination } from '../../terminal-coordination';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';

// __dirname at runtime resolves to dist/integrations/mcp/, so three levels
// up lands on the repo root regardless of whether we're loaded from src/
// (ts-node) or dist/ (compiled).
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

export interface ToolDefinition {
  /** Dotted name, e.g. "codegraph.symbol" */
  name: string;
  /** One-line summary shown in MCP tool catalog */
  description: string;
  /** JSON-Schema for the input arguments (kept lightweight) */
  inputSchema: {
    type: 'object';
    properties: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };
  /** Implementation */
  handler: (args: any) => Promise<unknown> | unknown;
}

const TOOLS: ToolDefinition[] = [
  // ─── codegraph.* ──────────────────────────────────────────────────────
  {
    name: 'codegraph.stats',
    description: 'Summary counts for the current code graph (files, symbols, edges).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const g = codegraph.getCodegraph(REPO_ROOT);
      return codegraph.summarize(g);
    },
  },
  {
    name: 'codegraph.symbol',
    description: 'Find a symbol (function/class/const) and the files that reference it.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string', description: 'Exact or substring symbol name' } },
      required: ['name'],
    },
    handler: async ({ name }: { name: string }) => {
      const g = codegraph.getCodegraph(REPO_ROOT);
      const matches = codegraph.findSymbol(g, name);
      return { matches, refs: matches.length > 0 ? codegraph.findReferences(g, matches[0].name) : [] };
    },
  },
  {
    name: 'codegraph.file',
    description: 'Get exports + imports + cross-file dependencies for a TS file.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Repo-relative file path' } },
      required: ['path'],
    },
    handler: async ({ path: rel }: { path: string }) => {
      const g = codegraph.getCodegraph(REPO_ROOT);
      const file = (g as any).files?.[rel];
      if (!file) return { error: `unknown path: ${rel}` };
      return file;
    },
  },

  // ─── governance.* ─────────────────────────────────────────────────────
  {
    name: 'governance.list',
    description: 'List data-governance entries (filter by kind/owner/tag).',
    inputSchema: {
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['shared-data', 'asset-registry', 'wiki-term', 'schema', 'config', 'license'] },
        owner: { type: 'string' },
        tag: { type: 'string' },
      },
    },
    handler: async (args: { kind?: governance.GovernanceKind; owner?: string; tag?: string }) => {
      return { entries: governance.listEntries(args) };
    },
  },
  {
    name: 'governance.lineage',
    description: 'Get the lineage / source / consumers / related-by-tag for a governance entry or wiki term.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Governance entry id or human term name' } },
      required: ['id'],
    },
    handler: async ({ id }: { id: string }) => governance.getLineage(id),
  },
  {
    name: 'governance.register',
    description: 'Upsert a data-governance entry (Governor only — ACL enforced upstream).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }, name: { type: 'string' }, kind: { type: 'string' },
        owner: { type: 'string' }, source: { type: 'string' },
        schema: { type: 'string' }, lineage: { type: 'string' }, license: { type: 'string' },
      },
      required: ['id', 'name', 'kind', 'owner', 'source'],
    },
    handler: async (args: any) => governance.registerEntry(args),
  },

  // ─── wiki.* ───────────────────────────────────────────────────────────
  {
    name: 'wiki.lookup',
    description: 'Look up a wiki term by id or fuzzy term name.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, q: { type: 'string' }, namespace: { type: 'string', enum: ['game', 'qchem'] } },
    },
    handler: async ({ id, q, namespace }: { id?: string; q?: string; namespace?: wiki.WikiNamespace }) => {
      if (id) {
        const e = wiki.getEntry(id);
        return e ? { entry: e } : { error: `unknown wiki id: ${id}` };
      }
      return { entries: wiki.listEntries({ q, namespace }) };
    },
  },
  {
    name: 'wiki.upsert',
    description: 'Create or update a wiki entry (Kimi/Governor/Pixel — ACL enforced).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }, term: { type: 'string' },
        namespace: { type: 'string', enum: ['game', 'qchem'] },
        summary: { type: 'string' }, body: { type: 'string' },
        seeAlso: { type: 'string' }, governanceId: { type: 'string' }, author: { type: 'string' },
      },
      required: ['id', 'term', 'namespace', 'summary', 'body'],
    },
    handler: async (args: any) => {
      const seeAlso = typeof args.seeAlso === 'string'
        ? args.seeAlso.split(',').map((s: string) => s.trim()).filter(Boolean)
        : args.seeAlso;
      return wiki.upsertEntry({ ...args, seeAlso });
    },
  },

  // ─── assets.search ────────────────────────────────────────────────────
  {
    name: 'assets.search',
    description: 'Search the EDS2 asset registry for 3D models / textures / audio matching a query.',
    inputSchema: {
      type: 'object',
      properties: { q: { type: 'string', description: 'Substring on filename or category' } },
      required: ['q'],
    },
    handler: async ({ q }: { q: string }) => {
      const REGISTRY_PATH = '/media/knight2/EDS2/projects/molgang-web/shared/asset-registry.json';
      if (!fs.existsSync(REGISTRY_PATH)) return { entries: [], note: 'registry not yet built — run scripts/build-asset-registry.js' };
      try {
        const raw = JSON.parse(fs.readFileSync(REGISTRY_PATH, 'utf8'));
        const all = (raw.assets || raw.entries || []) as any[];
        const lc = q.toLowerCase();
        const matches = all.filter(a => JSON.stringify(a).toLowerCase().includes(lc)).slice(0, 50);
        return { entries: matches, total: matches.length, registrySize: all.length };
      } catch (e: any) {
        return { error: e.message };
      }
    },
  },

  // ─── scrum.* ──────────────────────────────────────────────────────────
  {
    name: 'scrum.standup',
    description: 'Log a standup item for a team (Hermes coordinators + members).',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', enum: ['cross', 'scrum-roblox', 'scrum-web', 'scrum-marketing'] },
        agent: { type: 'string' },
        body: { type: 'string', description: 'Free-text: did / blocking / next' },
      },
      required: ['team', 'agent', 'body'],
    },
    handler: async (a: { team: scrum.ScrumTeam; agent: string; body: string }) => scrum.logStandup(a.team, a.agent, a.body),
  },
  {
    name: 'scrum.standups',
    description: 'List recent standup items, optionally per-team.',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', enum: ['cross', 'scrum-roblox', 'scrum-web', 'scrum-marketing'] },
        limit: { type: 'string' },
      },
    },
    handler: async ({ team, limit }: { team?: scrum.ScrumTeam; limit?: string }) => ({
      items: scrum.listStandups(team, limit ? parseInt(String(limit)) : 50),
    }),
  },
  {
    name: 'scrum.bug',
    description: 'File a bug report (testers + agents finding regressions).',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', enum: ['cross', 'scrum-roblox', 'scrum-web', 'scrum-marketing'] },
        reporter: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        severity: { type: 'string', enum: ['p0-blocker', 'p1-major', 'p2-minor', 'p3-cosmetic'] },
        surface: { type: 'string' },
      },
      required: ['team', 'reporter', 'title', 'body'],
    },
    handler: async (a: any) => scrum.fileBug(a),
  },
  {
    name: 'scrum.bugs',
    description: 'List bug reports (filter by team / status / severity / reporter).',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string' }, status: { type: 'string' },
        severity: { type: 'string' }, reporter: { type: 'string' },
      },
    },
    handler: async (a: any) => ({ bugs: scrum.listBugs({ ...a, limit: 100 }) }),
  },
  {
    name: 'scrum.summary',
    description: 'Summary counts per team (standups + open / total bugs).',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => scrum.summary(),
  },

  // ─── forum.* ──────────────────────────────────────────────────────────
  {
    name: 'forum.read',
    description: 'List forum threads (testers share tips/tricks/feature ideas).',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string' }, tag: { type: 'string' },
        q: { type: 'string' }, threadId: { type: 'string' },
      },
    },
    handler: async (a: any) => {
      if (a.threadId) {
        const t = forum.getThread(a.threadId);
        return t ? { thread: t } : { error: `unknown thread: ${a.threadId}` };
      }
      return { threads: forum.listThreads({ team: a.team, tag: a.tag, q: a.q, limit: 50 }) };
    },
  },
  {
    name: 'forum.post',
    description: 'Create a new forum thread.',
    inputSchema: {
      type: 'object',
      properties: {
        team: { type: 'string', enum: ['cross', 'scrum-roblox', 'scrum-web', 'scrum-marketing'] },
        author: { type: 'string' }, title: { type: 'string' }, body: { type: 'string' },
        tags: { type: 'string', description: 'comma-separated tags' },
      },
      required: ['team', 'author', 'title', 'body'],
    },
    handler: async (a: any) => {
      const tags = typeof a.tags === 'string' ? a.tags.split(',').map((s: string) => s.trim()).filter(Boolean) : a.tags;
      return forum.createThread({ ...a, tags });
    },
  },
  {
    name: 'forum.reply',
    description: 'Reply to an existing forum thread.',
    inputSchema: {
      type: 'object',
      properties: { threadId: { type: 'string' }, author: { type: 'string' }, body: { type: 'string' } },
      required: ['threadId', 'author', 'body'],
    },
    handler: async (a: { threadId: string; author: string; body: string }) => {
      const r = forum.reply(a.threadId, a.author, a.body);
      return r ? { reply: r } : { error: `unknown thread: ${a.threadId}` };
    },
  },

  // ─── coordination.* — terminal active-action lease ───────────────────
  {
    name: 'coordination.status',
    description: 'Read open terminal sessions and the current active-action lease.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => terminalCoordination.snapshot(),
  },
  {
    name: 'coordination.acquire',
    description: 'Claim the active-action lease for a terminal session. Returns blockedBy when another terminal owns it.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        sessionKey: { type: 'string' },
        title: { type: 'string' },
        kind: { type: 'string', enum: ['code', 'design', 'review', 'deploy', 'coordination', 'other'] },
        target: { type: 'string' },
        notes: { type: 'string' },
      },
      required: ['sessionId', 'sessionKey', 'title'],
    },
    handler: async (a: any) => terminalCoordination.acquireAction(String(a.sessionId), String(a.sessionKey), {
      title: String(a.title),
      kind: a.kind,
      target: a.target,
      notes: a.notes,
    }),
  },
  {
    name: 'coordination.release',
    description: 'Release the active-action lease owned by a terminal session.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string' },
        sessionKey: { type: 'string' },
        actionId: { type: 'string' },
      },
      required: ['sessionId', 'sessionKey'],
    },
    handler: async (a: any) => ({
      released: terminalCoordination.releaseAction(String(a.sessionId), String(a.sessionKey), a.actionId ? String(a.actionId) : undefined),
    }),
  },

  // ─── corpus.* — semantic retrieval over the unified knowledge store ──
  {
    name: 'corpus.search',
    description: 'Hybrid semantic search across the embedded corpus (codebase + docs + IUPAC + textbook + papers). Agents call this BEFORE reasoning from scratch — same answer quality at ~3× lower token cost.',
    inputSchema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'natural-language query' },
        k: { type: 'string', description: 'top-k passages to return (default 8, max 50)' },
        kind: { type: 'string', enum: ['code', 'doc', 'shared-data', 'iupac', 'textbook', 'paper', 'other'], description: 'optional source-kind filter' },
      },
      required: ['q'],
    },
    handler: async ({ q, k, kind }: { q: string; k?: string; kind?: corpus.CorpusChunk['source_kind'] }) => {
      // Need access to the LightRAGClient; the MCP registry doesn't have direct
      // wiring to it. We could plumb it via a setter, but the cheapest path is
      // to call our own HTTP endpoint that already has access via app.locals.
      const http = require('http');
      return new Promise((resolve) => {
        const url = new URL(`http://127.0.0.1:${process.env.PORT || 3100}/api/corpus/search?q=${encodeURIComponent(q)}&k=${k || 8}${kind ? '&kind=' + encodeURIComponent(kind) : ''}`);
        http.get(url, (r: any) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch { resolve({ error: 'parse failed' }); }
          });
        }).on('error', (e: any) => resolve({ error: e.message }));
      });
    },
  },
  {
    name: 'corpus.stats',
    description: 'Corpus size by source kind (code / doc / iupac / textbook / etc) + vector-indexed count.',
    inputSchema: { type: 'object', properties: {} },
    handler: async () => {
      const http = require('http');
      return new Promise((resolve) => {
        http.get(`http://127.0.0.1:${process.env.PORT || 3100}/api/corpus/stats`, (r: any) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => {
            try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
            catch { resolve({ error: 'parse failed' }); }
          });
        }).on('error', (e: any) => resolve({ error: e.message }));
      });
    },
  },

  // ─── kami.* — typeset document briefs ─────────────────────────────────
  // Agents queue typeset-doc requests here. A Claude Code session with
  // the Kami skill (~/.claude/skills/kami) drains the queue and renders.
  {
    name: 'kami.queue',
    description: 'Queue a typeset-document brief for Kami (Claude Code skill renders to HTML/PDF/slides). Use for resumes, one-pagers, white papers, letters, portfolios, slide decks.',
    inputSchema: {
      type: 'object',
      properties: {
        requester: { type: 'string' },
        type: { type: 'string', enum: ['one-pager', 'long-doc', 'letter', 'portfolio', 'resume', 'slides', 'white-paper'] },
        language: { type: 'string', enum: ['en', 'zh', 'ja'] },
        title: { type: 'string' },
        audience: { type: 'string' },
        outline: { type: 'string', description: 'Markdown outline / key points the doc must cover' },
        sources: { type: 'string', description: 'comma-separated list of sources (URLs, file paths, governance ids)' },
        outputPath: { type: 'string' },
      },
      required: ['requester', 'type', 'title', 'outline'],
    },
    handler: async (a: any) => {
      const sources = typeof a.sources === 'string'
        ? a.sources.split(',').map((s: string) => s.trim()).filter(Boolean)
        : a.sources;
      return kami.queueBrief({ ...a, sources });
    },
  },
  {
    name: 'kami.briefs',
    description: 'List Kami doc briefs (filter by status / requester).',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['queued', 'in-progress', 'delivered', 'cancelled'] },
        requester: { type: 'string' },
      },
    },
    handler: async (a: any) => ({ briefs: kami.listBriefs({ ...a, limit: 100 }) }),
  },
  {
    name: 'kami.deliver',
    description: 'Mark a Kami brief delivered (called by the renderer after writing the HTML/PDF). Optional notes on choices made.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' }, status: { type: 'string', enum: ['queued', 'in-progress', 'delivered', 'cancelled'] },
        notes: { type: 'string' },
      },
      required: ['id', 'status'],
    },
    handler: async (a: { id: string; status: kami.KamiStatus; notes?: string }) => {
      const b = kami.setStatus(a.id, a.status, a.notes);
      return b ? { brief: b } : { error: `unknown brief: ${a.id}` };
    },
  },
];

export function listTools(agentName?: string): { name: string; description: string; inputSchema: ToolDefinition['inputSchema'] }[] {
  const all = TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  if (!agentName) return all;
  const agent = getAgent(agentName);
  if (!agent || !agent.tools) return [];
  return all.filter(t => agentAllowed(agent.tools!, t.name));
}

export function agentAllowed(acl: string[], toolName: string): boolean {
  for (const rule of acl) {
    if (rule === toolName) return true;
    if (rule.endsWith('.*')) {
      const ns = rule.slice(0, -2);
      if (toolName === ns || toolName.startsWith(ns + '.')) return true;
    }
    if (rule === '*') return true;
  }
  return false;
}

export async function callTool(agentName: string, toolName: string, args: any): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const agent = getAgent(agentName);
  if (!agent) return { ok: false, error: `unknown agent: ${agentName}` };
  if (!agent.tools || !agentAllowed(agent.tools, toolName)) {
    return { ok: false, error: `agent ${agentName} not authorised to call ${toolName} (acl=${(agent.tools || []).join(',') || 'none'})` };
  }
  const def = TOOLS.find(t => t.name === toolName);
  if (!def) return { ok: false, error: `unknown tool: ${toolName}` };
  try {
    const result = await def.handler(args || {});
    return { ok: true, result };
  } catch (e: any) {
    logger.warn(`mcp.callTool ${toolName} failed for ${agentName}: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

export function toolNames(): string[] { return TOOLS.map(t => t.name); }
