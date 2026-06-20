#!/usr/bin/env node
/**
 * Minimal infisical-wrap stub for local smoke runs.
 * This wrapper does NOT inject secrets. It strips `--no-secrets` and runs
 * the command after `--`.
 */
import { spawn } from 'node:child_process';

const sep = process.argv.indexOf('--');
if (sep === -1 || sep === process.argv.length - 1) {
  console.error('Usage: node scripts/infisical-wrap.mjs --no-secrets -- <command> [args...]');
  process.exit(1);
}

const args = process.argv.slice(sep + 1);
const cmd = args[0];
const cmdArgs = args.slice(1);

const child = spawn(cmd, cmdArgs, { stdio: 'inherit', shell: false });
child.on('exit', (code) => process.exit(code ?? 0));
