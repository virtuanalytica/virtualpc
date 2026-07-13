#!/usr/bin/env node
/**
 * seed-scrum-tasks.js — onboarding-task injection for the scrum-of-scrums.
 *
 * Pushes recurring "core duty" tasks to each tester + Hermes coordinator
 * via virtualpc's task engine. Idempotent — checks for an existing task
 * with the same subject before adding.
 *
 * Run once after a roster change:
 *   node scripts/seed-scrum-tasks.js
 */
'use strict';

const http = require('http');

const VIRTUALPC_URL = process.env.VIRTUALPC_URL || 'http://127.0.0.1:3100';

function request(method, pathname, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(VIRTUALPC_URL + pathname);
    const req = http.request({
      hostname: u.hostname, port: u.port, path: u.pathname,
      method, headers: data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {},
      timeout: 8000,
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        try { resolve(JSON.parse(raw)); } catch { resolve({ raw }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    if (data) req.write(data);
    req.end();
  });
}

async function listAgents() {
  const r = await request('GET', '/api/agents/overview');
  return Array.isArray(r) ? r : (r.agents || []);
}

let _backlogCache = null;
async function loadBacklog() {
  if (_backlogCache) return _backlogCache;
  const r = await request('GET', '/api/backlog/per-person');
  _backlogCache = r && typeof r === 'object' ? r : {};
  return _backlogCache;
}

async function listTasks(agent) {
  const backlog = await loadBacklog();
  // shape: { agentName: { tasks: [...] } } or { agentName: [...] } depending on version
  const slice = backlog[agent] || backlog?.byPerson?.[agent] || {};
  return Array.isArray(slice) ? slice : (slice.tasks || slice.items || []);
}

async function addTask(agent, subject, description, priority) {
  // /api/backlog/items requires project + tags so every item is attributable.
  return request('POST', '/api/backlog/items', {
    title: subject,
    description,
    assigned_to: agent,
    priority: priority || 'medium',
    project: 'VirtualPC platform',
    tags: ['project:virtualpc-platform', 'scrum', `agent:${agent}`, `priority:${priority || 'medium'}`],
  });
}

const TESTER_DUTY = {
  subject: 'Continuous playtest + forum sharing',
  description: [
    'Run continuously in your persona. Each session:',
    '1. Play the current build through your typical session length.',
    '2. File any defect via POST /api/scrums/<your-team>/bug with severity (p0..p3) + reproduction steps.',
    '3. Share at least one tip / trick / glitch / feature-idea per session as a forum thread (POST /api/forum/<your-team>) with appropriate tags.',
    '4. Reply to other testers\' threads when you can confirm or extend their finding.',
    'Hermes coordinator reads the forum + bug queue daily; loud signals escalate to the cross-team scrum.',
  ].join('\n'),
};

const HERMES_DUTY = {
  subject: 'Daily standup + bug-triage digest',
  description: [
    'Each working day:',
    '1. Aggregate the team\'s GET /api/scrums/<team>/standups (last 24h).',
    '2. Read the bug queue (GET /api/scrums/<team>/bugs?status=open) — flag p0/p1 to Alexander.',
    '3. Read the team forum (GET /api/forum/<team>) — surface tip/trick/feature-request signals.',
    '4. Post a digest as your own standup item.',
    '5. Once weekly, post a roll-up to /api/scrums/cross/standup so Fill + Cleopatra see cross-team patterns.',
  ].join('\n'),
};

const FORUM_SEEDS = [
  {
    team: 'scrum-roblox', author: 'Tester-RB-Casey',
    title: 'Welcome thread — share your favourite onboarding moment',
    body: 'Drop a short note on what made the first 10 minutes click for you. We use these to tune the new-player tutorial.',
    tags: ['tip', 'onboarding'],
  },
  {
    team: 'scrum-web', author: 'Tester-Web-Drew',
    title: 'Accessibility checklist — keep this thread updated',
    body: 'Running list of ARIA gaps + keyboard-nav holes. Append findings as replies; cite the URL + steps.',
    tags: ['accessibility', 'feature-request'],
  },
  {
    team: 'scrum-marketing', author: 'Tester-MK-Alex',
    title: 'Competitor watch — chemistry-game roundup',
    body: 'I\'ll post one competitor breakdown per week (mechanics + monetisation + retention hooks). Reply with anything I missed.',
    tags: ['competitor-review'],
  },
  {
    team: 'cross', author: 'Hermes-Cross',
    title: 'Cross-team RFC log',
    body: 'Use this thread to land RFCs that touch multiple scrums. Reply to existing ones rather than creating new threads when the topic overlaps.',
    tags: ['rfc'],
  },
];

(async () => {
  console.log('▶ seeding scrum-of-scrums onboarding tasks');
  const agents = await listAgents();
  const byName = {};
  for (const a of agents) byName[a.name] = a;

  let added = 0, skipped = 0;

  for (const a of agents) {
    if (a.kind !== 'tester' && a.kind !== 'hermes-coordinator') continue;
    const tasks = await listTasks(a.name);
    const duty = a.kind === 'tester' ? TESTER_DUTY : HERMES_DUTY;
    const has = tasks.some(t => (t.title || t.subject || '').includes(duty.subject));
    if (has) { skipped++; continue; }
    try {
      await addTask(a.name, duty.subject, duty.description, 'high');
      console.log(`  ✓ added duty task → ${a.name}`);
      added++;
    } catch (e) {
      console.warn(`  ! failed for ${a.name}: ${e.message}`);
    }
  }

  console.log(`▶ seeding initial forum threads`);
  for (const seed of FORUM_SEEDS) {
    try {
      const r = await request('POST', `/api/forum/${seed.team}`, seed);
      if (r.success) {
        console.log(`  ✓ thread '${seed.title}' (${seed.team})`);
      } else {
        console.warn(`  ! ${seed.team}: ${r.error || 'unknown'}`);
      }
    } catch (e) {
      console.warn(`  ! ${seed.team}: ${e.message}`);
    }
  }

  console.log(`✓ done. duties: ${added} added / ${skipped} skipped (already present)`);
})();
