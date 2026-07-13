/**
 * Optional Graphify management integration.
 *
 * Graphify is useful as an AI/codebase knowledge-graph provider, but it is not
 * a required VirtualPC runtime dependency. This module exposes status/report
 * endpoints unconditionally and gates mutating commands behind
 * VIRTUALPC_GRAPHIFY_MANAGEMENT_ENABLED=true.
 */

import type { Express, Request, Response } from 'express';
import { spawn, spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';

export interface GraphifyArtifact {
  path: string;
  exists: boolean;
  sizeBytes: number;
  updatedAt: string | null;
}

export interface GraphifyStatus {
  success: true;
  available: boolean;
  binary: string;
  version: string | null;
  managementEnabled: boolean;
  developerAccessEnabled: boolean;
  repoRoot: string;
  outputDir: string;
  state: any;
  artifacts: {
    graphJson: GraphifyArtifact;
    graphHtml: GraphifyArtifact;
    report: GraphifyArtifact;
    analysis: GraphifyArtifact;
  };
  commands: {
    install: string;
    buildCodeGraph: string;
    buildSemanticGraph: string;
    installForClaudeCode: string;
    installForCodex: string;
    installForOpenClaw: string;
  };
}

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const DEFAULT_OUT = path.join(REPO_ROOT, 'graphify-out');
const DEFAULT_STATE = path.join(REPO_ROOT, 'data', 'graphify-management-state.json');
const DEFAULT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'graphify-management.sh');

function boolEnv(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').toLowerCase());
}

function graphifyBinary(): string {
  return process.env.GRAPHIFY_BIN || 'graphify';
}

function outputDir(): string {
  return path.resolve(process.env.GRAPHIFY_OUT || DEFAULT_OUT);
}

function statePath(): string {
  return path.resolve(process.env.GRAPHIFY_STATE_FILE || DEFAULT_STATE);
}

function artifact(filePath: string): GraphifyArtifact {
  try {
    const stat = fs.statSync(filePath);
    return {
      path: filePath,
      exists: true,
      sizeBytes: stat.size,
      updatedAt: stat.mtime.toISOString(),
    };
  } catch {
    return {
      path: filePath,
      exists: false,
      sizeBytes: 0,
      updatedAt: null,
    };
  }
}

function readJson(filePath: string): any {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

function detectGraphify(): { available: boolean; version: string | null } {
  const bin = graphifyBinary();
  const which = spawnSync('bash', ['-lc', `command -v ${JSON.stringify(bin)}`], {
    encoding: 'utf-8',
    timeout: 3000,
  });
  if (which.status !== 0 || !which.stdout.trim()) {
    return { available: false, version: null };
  }

  const version = spawnSync(bin, ['--version'], {
    encoding: 'utf-8',
    timeout: 3000,
  });
  const text = `${version.stdout || ''}${version.stderr || ''}`.trim();
  return { available: true, version: text || null };
}

export function getGraphifyStatus(): GraphifyStatus {
  const out = outputDir();
  const detected = detectGraphify();
  return {
    success: true,
    available: detected.available,
    binary: graphifyBinary(),
    version: detected.version,
    managementEnabled: boolEnv('VIRTUALPC_GRAPHIFY_MANAGEMENT_ENABLED'),
    developerAccessEnabled: boolEnv('VIRTUALPC_GRAPHIFY_DEVELOPER_ENABLED'),
    repoRoot: REPO_ROOT,
    outputDir: out,
    state: readJson(statePath()),
    artifacts: {
      graphJson: artifact(path.join(out, 'graph.json')),
      graphHtml: artifact(path.join(out, 'graph.html')),
      report: artifact(path.join(out, 'GRAPH_REPORT.md')),
      analysis: artifact(path.join(out, '.graphify_analysis.json')),
    },
    commands: {
      install: 'uv tool install graphifyy',
      buildCodeGraph: 'scripts/graphify-management.sh build-code',
      buildSemanticGraph: 'VIRTUALPC_GRAPHIFY_SEMANTIC=true scripts/graphify-management.sh build-semantic',
      installForClaudeCode: 'scripts/graphify-management.sh install-claude-project',
      installForCodex: 'scripts/graphify-management.sh install-codex-project',
      installForOpenClaw: 'scripts/graphify-management.sh install-claw-project',
    },
  };
}

function requireManagement(res: Response): boolean {
  if (boolEnv('VIRTUALPC_GRAPHIFY_MANAGEMENT_ENABLED')) return true;
  res.status(403).json({
    success: false,
    error: 'Graphify management commands are disabled',
    enable: 'Set VIRTUALPC_GRAPHIFY_MANAGEMENT_ENABLED=true and restart VirtualPC.',
  });
  return false;
}

function startScript(command: string, extraEnv: NodeJS.ProcessEnv = {}): { pid: number | undefined } {
  const child = spawn('bash', [DEFAULT_SCRIPT, command], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      GRAPHIFY_OUT: outputDir(),
      GRAPHIFY_STATE_FILE: statePath(),
      ...extraEnv,
    },
  });
  child.unref();
  return { pid: child.pid };
}

function safeCommand(value: any, allowed: Set<string>): string | null {
  const command = String(value || '');
  return allowed.has(command) ? command : null;
}

export function registerGraphifyRoutes(app: Express): void {
  app.get('/api/graphify/status', (_req: Request, res: Response) => {
    res.json(getGraphifyStatus());
  });

  app.get('/api/graphify/report', (_req: Request, res: Response) => {
    const reportPath = path.join(outputDir(), 'GRAPH_REPORT.md');
    if (!fs.existsSync(reportPath)) {
      res.status(404).json({ success: false, error: 'GRAPH_REPORT.md not found. Run a Graphify build first.' });
      return;
    }
    res.type('text/markdown').send(fs.readFileSync(reportPath, 'utf-8'));
  });

  app.post('/api/graphify/build', (req: Request, res: Response) => {
    if (!requireManagement(res)) return;
    const command = safeCommand(req.body?.mode || 'build-code', new Set(['build-code', 'build-semantic']));
    if (!command) {
      res.status(400).json({ success: false, error: 'mode must be build-code or build-semantic' });
      return;
    }
    const run = startScript(command, {
      GRAPHIFY_BACKEND: req.body?.backend ? String(req.body.backend) : process.env.GRAPHIFY_BACKEND,
      GRAPHIFY_MODEL: req.body?.model ? String(req.body.model) : process.env.GRAPHIFY_MODEL,
    });
    res.json({ success: true, started: command, ...run });
  });

  app.post('/api/graphify/developer-install', (req: Request, res: Response) => {
    if (!requireManagement(res)) return;
    const command = safeCommand(
      req.body?.platform,
      new Set(['install-claude-project', 'install-codex-project', 'install-claw-project'])
    );
    if (!command) {
      res.status(400).json({
        success: false,
        error: 'platform must be install-claude-project, install-codex-project, or install-claw-project',
      });
      return;
    }
    const run = startScript(command);
    res.json({ success: true, started: command, ...run });
  });

  logger.info('✓ Graphify management routes configured (optional)');
}
