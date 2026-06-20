/**
 * Model Downloader — auto-loads the smallest feasible local model when none
 * is loaded. Falls back to listing the exact commands for the user if the
 * LM Studio CLI is unavailable.
 */

import { execFile } from 'child_process';
import logger from './utils/logger';
import { MODEL_CATALOG, generateRoster, type ModelInfo } from './model-router';

const LMS_PATH = process.env.LMS_CLI_PATH || 'lms';
const MAX_POLL_MS = 120_000;
const POLL_INTERVAL_MS = 2_000;

export interface DownloadResult {
  ok: boolean;
  attempted: string;
  message: string;
  commands?: string[];
}

function which(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('which', [cmd], (err, stdout) => {
      if (err) resolve(null);
      else resolve(stdout.trim() || null);
    });
  });
}

function lms(args: string[], timeoutMs = 30_000): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(LMS_PATH, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (err, stdout, stderr) => {
        resolve({ ok: !err, stdout: stdout.trim(), stderr: stderr.trim() });
      });
  });
}

export function pickSmallestDownload(): ModelInfo | null {
  const roster = generateRoster();
  const local = roster.recommendedDownloads.filter(m => m.diskGB > 0);
  if (local.length === 0) return null;
  local.sort((a, b) => a.diskGB - b.diskGB);
  return local[0];
}

export async function ensureLocalModel(): Promise<DownloadResult> {
  const model = pickSmallestDownload();
  if (!model || !model.lmStudioLoad) {
    return {
      ok: false,
      attempted: 'none',
      message: 'No local model fits the current weight-class / resource constraints.',
      commands: recommendedLoadCommands(),
    };
  }

  const lmsBin = await which(LMS_PATH);
  if (!lmsBin) {
    return {
      ok: false,
      attempted: model.id,
      message: 'LM Studio CLI (`lms`) not found. Install LM Studio or add it to PATH.',
      commands: recommendedLoadCommands(),
    };
  }

  // Start the server if it isn't running.
  const status = await lms(['server', 'status'], 5_000);
  if (!status.ok || /not running/i.test(status.stdout)) {
    logger.info('model-downloader: starting LM Studio server');
    await lms(['server', 'start'], 10_000);
  }

  // Load the model in the background.
  logger.info(`model-downloader: loading ${model.lmStudioLoad}`);
  const load = await lms(['load', model.lmStudioLoad, '--yes'], 30_000);
  if (!load.ok) {
    return {
      ok: false,
      attempted: model.id,
      message: `Failed to load model: ${load.stderr || load.stdout}`,
      commands: recommendedLoadCommands(),
    };
  }

  // Poll until the model appears in the LM Studio /models list.
  const deadline = Date.now() + MAX_POLL_MS;
  while (Date.now() < deadline) {
    const list = await lms(['ps'], 5_000);
    if (list.ok && list.stdout.toLowerCase().includes(model.id.toLowerCase())) {
      return { ok: true, attempted: model.id, message: `Loaded ${model.name} (${model.id})` };
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  return {
    ok: false,
    attempted: model.id,
    message: `Model load started but did not appear within ${MAX_POLL_MS / 1000}s.`,
    commands: recommendedLoadCommands(),
  };
}

export function recommendedLoadCommands(): string[] {
  const roster = generateRoster();
  return roster.recommendedDownloads
    .filter(m => m.lmStudioLoad)
    .map(m => `lms load ${m.lmStudioLoad}  # ${m.name}, ~${m.diskGB} GB`);
}
