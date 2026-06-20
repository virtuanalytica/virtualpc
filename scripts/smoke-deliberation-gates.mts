#!/usr/bin/env node
/**
 * Smoke checks for the deliberation gate artifacts.
 *
 * Validates:
 * 1. High-risk tasks in .ai/tasks/index.json have deliberation_refs and gate_status.
 * 2. Referenced deliberation artifacts exist.
 * 3. No codex task with high-risk flags lacks gate_status.
 * 4. Parallel groups have disjoint owned_files or a declared interface contract.
 * 5. Task-graph-audit artifact has a valid verdict.
 * 6. No deliberation artifact contains obvious secret markers.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const HIGH_RISK_FLAGS = new Set([
  'schema_migration',
  'ml_leakage',
  'security',
  'external_repo',
  'reader_redirection',
]);

const SECRET_MARKERS = [
  'API_KEY=',
  'PASSWORD=',
  'SECRET=',
  'TOKEN=',
  '.env',
];

const cwdFlag = process.argv.indexOf('--cwd');
const explicitCwd = cwdFlag >= 0 && process.argv[cwdFlag + 1];
const root = explicitCwd ? path.resolve(explicitCwd as string) : process.cwd();
const tasksIndexPath = explicitCwd
  ? path.join(root, 'tasks', 'index.json')
  : path.join(root, '.ai', 'tasks', 'index.json');
const indexDir = path.dirname(tasksIndexPath);
const deliberationDir = explicitCwd ? root : path.join(path.dirname(indexDir), 'deliberation');

interface TaskEntry {
  id: string;
  file: string;
  implementation_agent?: string;
  parallel_group?: string | null;
  depends_on?: string[];
  owned_files?: string[];
  risk_flags?: string[];
  gate_status?: string;
  deliberation_refs?: string[];
}

interface IndexJson {
  version?: string;
  slug?: string;
  deliberation_refs?: string[];
  tasks?: TaskEntry[];
}

let errors: string[] = [];
let warnings: string[] = [];

function fileExists(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function readJson<T>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function isHighRisk(task: TaskEntry): boolean {
  return (task.risk_flags ?? []).some((f) => HIGH_RISK_FLAGS.has(f));
}

function checkTasksIndex(): IndexJson | null {
  if (!fileExists(tasksIndexPath)) {
    errors.push(`Missing ${tasksIndexPath}`);
    return null;
  }
  const index = readJson<IndexJson>(tasksIndexPath);
  if (!index) {
    errors.push(`Could not parse ${tasksIndexPath}`);
    return null;
  }

  const tasks = index.tasks ?? [];
  const groups = new Map<string, TaskEntry[]>();

  for (const task of tasks) {
    const taskFile = path.resolve(indexDir, task.file);
    if (!fileExists(taskFile)) {
      errors.push(`Task ${task.id}: missing file ${task.file}`);
    }

    if (isHighRisk(task)) {
      if (!task.gate_status) {
        errors.push(`Task ${task.id}: high-risk flags but missing gate_status`);
      } else if (task.gate_status !== 'deliberation_approved') {
        errors.push(`Task ${task.id}: gate_status is ${task.gate_status}`);
      }

      const refs = task.deliberation_refs && task.deliberation_refs.length > 0
        ? task.deliberation_refs
        : (index.deliberation_refs ?? []);
      if (refs.length === 0) {
        errors.push(`Task ${task.id}: high-risk but no deliberation_refs`);
      } else {
        for (const ref of refs) {
          if (!fileExists(path.resolve(indexDir, ref))) {
            errors.push(`Task ${task.id}: missing deliberation ref ${ref}`);
          }
        }
      }
    }

    if (task.implementation_agent === 'codex' && isHighRisk(task) && !task.gate_status) {
      errors.push(`Task ${task.id}: codex + high-risk but gate_status missing`);
    }

    if (task.parallel_group) {
      if (!groups.has(task.parallel_group)) groups.set(task.parallel_group, []);
      groups.get(task.parallel_group)!.push(task);
    }
  }

  for (const [groupName, members] of groups) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i];
        const b = members[j];
        const aFiles = new Set(a.owned_files ?? []);
        const overlap = (b.owned_files ?? []).filter((f) => aFiles.has(f));
        if (overlap.length > 0) {
          errors.push(
            `Parallel group ${groupName}: tasks ${a.id} and ${b.id} share owned files: ${overlap.join(', ')}`
          );
        }
      }
    }
  }

  return index;
}

function checkTaskGraphAudit(index: IndexJson | null): void {
  const slug = index?.slug ?? '*';
  const auditDir = path.join(deliberationDir, 'task-graph-audit');
  if (!fs.existsSync(auditDir)) {
    warnings.push('No task-graph-audit artifacts found');
    return;
  }
  const files = fs.readdirSync(auditDir).filter((f) => f.endsWith('.json'));
  if (files.length === 0) {
    warnings.push('No task-graph-audit JSON artifacts found');
    return;
  }
  let found = false;
  for (const f of files) {
    const data = readJson<any>(path.join(auditDir, f));
    if (!data) continue;
    if (data.gate !== 'deliberation-task-graph-audit') {
      errors.push(`${f}: gate field missing or incorrect`);
    }
    if (!['dispatch_ok', 'revise_tasks', 'human_review_required'].includes(data.verdict)) {
      errors.push(`${f}: invalid verdict ${data.verdict}`);
    }
    found = true;
  }
  if (!found) {
    warnings.push(`No valid task-graph-audit artifact matching slug ${slug}`);
  }
}

function checkSecrets(): void {
  if (!fs.existsSync(deliberationDir)) return;
  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.json') || entry.name.endsWith('.md')) {
        const text = fs.readFileSync(full, 'utf8');
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
          for (const marker of SECRET_MARKERS) {
            if (lines[i].includes(marker)) {
              errors.push(`Possible secret marker in ${full}:${i + 1}: ${marker}`);
            }
          }
        }
      }
    }
  }
  walk(deliberationDir);
}

function main(): number {
  const index = checkTasksIndex();
  checkTaskGraphAudit(index);
  checkSecrets();

  for (const w of warnings) console.log(`WARN: ${w}`);
  for (const e of errors) console.log(`FAIL: ${e}`);

  if (errors.length > 0) {
    console.log(`\n${errors.length} failure(s), ${warnings.length} warning(s).`);
    return 1;
  }
  console.log(`OK. ${warnings.length} warning(s).`);
  return 0;
}

process.exit(main());
