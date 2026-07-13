#!/usr/bin/env node
/**
 * Snapshot every VirtualPC agent's operational score from the live API.
 *
 * Default output:
 *   - prints a lowest-score-first table
 *   - writes data/agent-scores.json for trend keeping
 *   - exits non-zero if any agent is below threshold or explicitly blocked
 */

const fs = require('fs');
const http = require('http');
const path = require('path');

const baseUrl = process.env.VIRTUALPC_URL || 'http://127.0.0.1:3100';
const args = new Set(process.argv.slice(2));
const thresholdArg = process.argv.find(a => a.startsWith('--threshold='));
const threshold = thresholdArg ? Number(thresholdArg.split('=')[1]) : 70;
const writeSnapshot = !args.has('--no-write');
const jsonOnly = args.has('--json');

function getJson(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`${res.statusCode} ${body.slice(0, 200)}`));
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(10_000, () => req.destroy(new Error('request timeout')));
  });
}

function pad(s, n) {
  s = String(s ?? '');
  return s.length >= n ? s.slice(0, n - 1) + ' ' : s + ' '.repeat(n - s.length);
}

async function main() {
  const overview = await getJson(`${baseUrl}/api/agents/overview`);
  const agents = (overview.agents || [])
    .map(agent => ({
      name: agent.name,
      role: agent.role,
      score: agent.score,
      grade: agent.scoreGrade,
      status: agent.scoreStatus,
      tasksCompleted: agent.tasksCompleted,
      tasksInProgress: agent.tasksInProgress,
      currentTask: agent.currentTask,
      scorecard: agent.scorecard,
    }))
    .sort((a, b) => (a.score ?? -1) - (b.score ?? -1) || a.name.localeCompare(b.name));

  const report = {
    generatedAt: overview.generatedAt || new Date().toISOString(),
    source: `${baseUrl}/api/agents/overview`,
    threshold,
    scoreSummary: overview.scoreSummary || null,
    agents,
  };

  if (writeSnapshot) {
    const out = path.resolve(__dirname, '..', 'data', 'agent-scores.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  }

  if (jsonOnly) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  } else {
    console.log(`Agent score audit · ${report.generatedAt}`);
    console.log(`source: ${report.source}`);
    console.log('');
    console.log(`${pad('agent', 22)} ${pad('score', 7)} ${pad('grade', 6)} ${pad('status', 16)} current task`);
    console.log(`${'-'.repeat(22)} ${'-'.repeat(7)} ${'-'.repeat(6)} ${'-'.repeat(16)} ${'-'.repeat(48)}`);
    for (const a of agents) {
      console.log(`${pad(a.name, 22)} ${pad(a.score, 7)} ${pad(a.grade, 6)} ${pad(a.status, 16)} ${a.currentTask || '-'}`);
    }
    console.log('');
    console.log(`avg=${report.scoreSummary?.avgScore ?? '-'} lowest=${report.scoreSummary?.lowestScore ?? '-'} needs_attention=${(report.scoreSummary?.needsAttention || []).length}`);
    if (writeSnapshot) console.log('wrote data/agent-scores.json');
  }

  const below = agents.filter(a => typeof a.score === 'number' && a.score < threshold);
  const blocked = agents.filter(a => (a.scorecard?.blockerCount || 0) > 0);
  if (below.length || blocked.length) {
    const parts = [];
    if (below.length) parts.push(`below threshold: ${below.map(a => `${a.name}=${a.score}`).join(', ')}`);
    if (blocked.length) parts.push(`blocked: ${blocked.map(a => a.name).join(', ')}`);
    console.error(`agent-score-audit failed: ${parts.join('; ')}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`agent-score-audit failed: ${err.message}`);
  process.exit(2);
});
