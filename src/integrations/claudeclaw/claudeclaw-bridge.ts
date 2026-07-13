/**
 * ClaudeClaw Bridge - process bridge to the fillslava ClaudeClaw installation
 *
 * The full ClaudeClaw system (Telegram bot, 12 agents, dashboard, trader
 * pipeline) lives at CLAUDECLAW_HOME and runs standalone. This bridge lets
 * virtualpc invoke its headless CLI surfaces (ab-test, auto-research) and
 * check installation health without importing its codebase.
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';

export const CLAUDECLAW_HOME =
  process.env.CLAUDECLAW_HOME ||
  '/media/knight2/EDS2/repo/claudeclaw_fill/ClaudeClaw-main';

export interface BridgeHealth {
  installed: boolean;
  built: boolean;
  envConfigured: boolean;
  home: string;
}

export function checkHealth(): BridgeHealth {
  const installed = fs.existsSync(path.join(CLAUDECLAW_HOME, 'node_modules'));
  const built = fs.existsSync(path.join(CLAUDECLAW_HOME, 'dist', 'src'));
  const envConfigured = fs.existsSync(path.join(CLAUDECLAW_HOME, '.env'));
  return { installed, built, envConfigured, home: CLAUDECLAW_HOME };
}

export interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Run a ClaudeClaw npm script headlessly (e.g. 'ab-test', 'auto-research').
 * Args after '--' are forwarded to the script.
 */
export function runCli(
  script: string,
  args: string[] = [],
  timeoutMs = 600_000
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', script, '--', ...args], {
      cwd: CLAUDECLAW_HOME,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`claudeclaw ${script} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      logger.info(`claudeclaw-bridge: ${script} exited ${code}`);
      resolve({ code, stdout, stderr });
    });
  });
}
