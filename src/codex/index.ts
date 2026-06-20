/**
 * Codex bridge — adapter + routes.
 *
 * Runs `codex exec` so coding/review tasks are billed to the signed-in ChatGPT
 * *subscription* (no per-token API cost), and exposes it to the rest of the org:
 *
 *   GET  /api/codex/status         is codex installed + logged in?
 *   POST /api/codex/exec           run a one-shot codex task (read-only default)
 *
 * Used by the role layer (src/codex/roles): the PhD reviewer + the GPT-5.5
 * senior dev + their GPT-5.4 juniors all run through here. See ./exec for the
 * pure argv/result core and ./roles for the role→model/effort mapping.
 */
import type { Express } from 'express';
import { spawn, execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import logger from '../utils/logger';
import {
  CodexExecOptions, CodexRunResult, buildCodexArgs, classifyRun, parseLoginStatus,
} from './exec';

const DEFAULT_TIMEOUT_MS = Number(process.env.CODEX_TIMEOUT_MS) || 10 * 60 * 1000; // 10m

let seq = 0;
function tmpOutFile(): string {
  return path.join(os.tmpdir(), `codex-out-${process.pid}-${(seq++).toString(36)}.txt`);
}

export interface CodexStatus {
  installed: boolean;
  loggedIn: boolean;
  method?: string;       // e.g. "ChatGPT"
  version?: string;
  detail: string;
}

/** Detect whether codex is installed and signed in. Cheap, synchronous. */
export function codexStatus(): CodexStatus {
  let version: string | undefined;
  try {
    version = execSync('codex --version', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 }).trim();
  } catch {
    return { installed: false, loggedIn: false, detail: 'codex CLI not found on PATH' };
  }
  try {
    const out = execSync('codex login status', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 8000 });
    const { loggedIn, method } = parseLoginStatus(out);
    return {
      installed: true, loggedIn, method, version,
      detail: loggedIn ? `logged in${method ? ` using ${method}` : ''}` : 'installed but not logged in (run: codex login)',
    };
  } catch {
    return { installed: true, loggedIn: false, version, detail: 'installed; login status check failed' };
  }
}

/**
 * Run a one-shot `codex exec`. Resolves with a classified result rather than
 * rejecting, so callers get a uniform shape on success, failure, or timeout.
 */
export function codexExec(opts: CodexExecOptions, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CodexRunResult> {
  return new Promise((resolve) => {
    const outputFile = opts.outputFile || tmpOutFile();
    const args = buildCodexArgs({ ...opts, outputFile });
    let stdout = '', stderr = '', timedOut = false, settled = false;

    let child;
    try {
      child = spawn('codex', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e: any) {
      resolve(classifyRun({ exitCode: null, timedOut: false, stderr: `spawn failed: ${e.message}` }));
      return;
    }

    const timer = setTimeout(() => { timedOut = true; try { child.kill('SIGKILL'); } catch { /* already gone */ } }, timeoutMs);

    child.stdout?.on('data', (d) => { stdout += d.toString(); });
    child.stderr?.on('data', (d) => { stderr += d.toString(); });

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let lastMessage: string | undefined;
      try { if (fs.existsSync(outputFile)) lastMessage = fs.readFileSync(outputFile, 'utf8'); } catch { /* ignore */ }
      // Only clean up files we created.
      if (!opts.outputFile) { try { fs.unlinkSync(outputFile); } catch { /* ignore */ } }
      resolve(classifyRun({ exitCode, timedOut, lastMessage, stdout, stderr }));
    };

    child.on('error', (e) => { finish(null); logger.warn(`[codex] spawn error: ${e.message}`); });
    child.on('close', (code) => finish(code));
  });
}

export function registerCodexRoutes(app: Express): void {
  app.get('/api/codex/status', (_req, res) => {
    res.json({ success: true, ...codexStatus() });
  });

  app.post('/api/codex/exec', async (req, res) => {
    const b = req.body || {};
    if (!b.prompt || !String(b.prompt).trim()) {
      res.status(400).json({ success: false, error: 'prompt is required' });
      return;
    }
    const st = codexStatus();
    if (!st.loggedIn) {
      res.status(503).json({ success: false, error: `codex not ready: ${st.detail}` });
      return;
    }
    // Default to read-only — an API-triggered agent must opt in to write.
    const sandbox = ['read-only', 'workspace-write'].includes(b.sandbox) ? b.sandbox : 'read-only';
    const result = await codexExec({
      prompt: String(b.prompt),
      model: b.model,
      reasoningEffort: b.reasoningEffort,
      cwd: b.cwd,
      sandbox,
    });
    res.json({ success: result.ok, ...result });
  });
}
