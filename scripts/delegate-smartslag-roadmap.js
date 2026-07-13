#!/usr/bin/env node
/**
 * Push SmartSlag3 Research Network work into VirtualPC's backlog.
 * Re-runnable; the current backlog API has no dedupe, so use deliberately.
 */

const http = require('http');
const fs = require('fs');

const VIRTUALPC = process.env.VIRTUALPC_URL || 'http://127.0.0.1:3100';
const SPEC = process.env.SMARTSLAG_SPEC || '/home/knight2/molgang-roblox/docs/SMARTSLAG_RESEARCH_NETWORK.md';
const DRY_RUN = process.argv.includes('--dry-run');

function postJson(path, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(path, VIRTUALPC);
    const data = JSON.stringify(body);
    const req = http.request(
      { host: u.hostname, port: u.port || 80, path: u.pathname, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let buf = '';
        res.on('data', c => buf += c);
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`HTTP ${res.statusCode}: ${buf.slice(0, 300)}`));
            return;
          }
          try { resolve(JSON.parse(buf)); } catch (e) { reject(new Error('bad json: ' + buf.slice(0, 300))); }
        });
      });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const specExists = fs.existsSync(SPEC);
const source = specExists ? SPEC : 'docs/SMARTSLAG_RESEARCH_NETWORK.md (missing locally at runtime)';

const ROADMAP = [
  {
    sprint: 'SmartSlag-M1', priority: 'critical', assigned_to: 'Atlas',
    title: 'SmartSlag3 M1 digital-twin validation plan',
    description: `Own the scientific realism target from ${source}. Define the held-out validation set, metrics, acceptable 10-15% error bands, uncertainty display, and stop/go criteria for separation efficiency, metal recovery, and energy consumption.`,
    estimated_hours: 8,
    subtasks: ['Define validation schema', 'Define error metrics', 'Map process stages to metrics', 'Specify uncertainty bands', 'Publish M1 acceptance checklist']
  },
  {
    sprint: 'SmartSlag-M1', priority: 'critical', assigned_to: 'Kai',
    title: 'VirtualPC-controlled SmartSlag work-unit backend',
    description: 'Design and implement the safe command/work-unit path: agents create/inspect work units, clients submit WebGPU/surrogate results, server validates bounds/hashes, rewards only after server-side checks. Integrate with OpenClaw/VirtualPC operations without letting arbitrary client output mint rewards.',
    estimated_hours: 12,
    subtasks: ['Work-unit schema', 'Validation envelope', 'Reward policy', 'API route plan', 'Audit log hooks', 'Security review']
  },
  {
    sprint: 'SmartSlag-M1', priority: 'high', assigned_to: 'Zip',
    title: 'SmartSlagTwin Level-1 process module skeleton',
    description: 'Add the first deterministic process-level model for sieves, hydrocyclones, ultrasonic treatment, leaching/extraction. Start with calibrated equations/tables rather than ML. Keep server authoritative.',
    estimated_hours: 10,
    subtasks: ['Module skeleton', 'Input variables', 'Output metrics', 'Hydrocyclone reduced equation placeholder', 'Ultrasound treatment placeholder', 'Unit tests']
  },
  {
    sprint: 'SmartSlag-M1', priority: 'high', assigned_to: 'Luna',
    title: 'Blender equipment realism pass for SmartSlag3 stages',
    description: 'Use the local Flatpak Blender 5.0 pipeline and existing assets to improve/verify sieve, hydrocyclone/cyclone separator, ultrasonic treatment tank, pumps, pipes, slurry/sediment visuals. Export GLB/FBX-ready assets and update asset registry notes.',
    estimated_hours: 14,
    subtasks: ['Inventory current assets', 'Hydrocyclone/sieve gap list', 'Generate or enhance Blender models', 'Export GLB/FBX', 'Render previews', 'Update registry/docs']
  },
  {
    sprint: 'SmartSlag-M1', priority: 'high', assigned_to: 'Mira',
    title: 'SmartSlag3 operator UX for setpoints and uncertainty',
    description: 'Design the operator-facing workflow: flowsheet configuration, process setpoints, prediction cards, uncertainty bands, validated-compute rewards, and no fake precision. Fit current Roblox UI first and native-engine realism later.',
    estimated_hours: 8,
    subtasks: ['Flowsheet UX', 'Setpoint controls', 'Prediction card design', 'Uncertainty display', 'Reward feedback', 'Roblox UI constraints']
  },
  {
    sprint: 'SmartSlag-M1', priority: 'medium', assigned_to: 'Kimi',
    title: 'Quantum/reference-job research memo for SmartSlag3',
    description: 'Research the practical split between DFT, semi-empirical methods, and ML surrogates for slag/reagent/surface chemistry. Keep ordinary players on surrogate inference and reserve trusted nodes for reference labels.',
    estimated_hours: 6,
    subtasks: ['DFT scope', 'Semi-empirical scope', 'Surrogate label strategy', 'Reproducibility metadata', 'Trusted-node validation policy']
  },
  {
    sprint: 'SmartSlag-M1', priority: 'medium', assigned_to: 'Hermes-Roblox',
    title: 'Coordinate Roblox SmartSlag3 sprint',
    description: 'Run scrum coordination for the Roblox proof: SmartSlagTwin module, SlagProcessing UI setpoints, validation demo, and tester feedback. Escalate blockers to Fill/Kai.',
    estimated_hours: 4,
    subtasks: ['Daily standup', 'Blocker list', 'Backlog hygiene', 'Tester assignment', 'Sprint closeout']
  },
  {
    sprint: 'SmartSlag-M1', priority: 'medium', assigned_to: 'Athena',
    title: 'Review SmartSlag3 security and realism claims',
    description: 'Review the implementation plan for scientific defensibility, server-authoritative rewards, anti-spoofing, testability, and no overclaimed quantum/CFD behavior.',
    estimated_hours: 5,
    subtasks: ['Science-claim review', 'Security review', 'Test coverage review', 'Docs consistency review', 'Release gate decision']
  }
];

(async () => {
  console.log(`SmartSlag3 roadmap: ${ROADMAP.length} items`);
  console.log(`VirtualPC: ${VIRTUALPC}`);
  console.log(`Spec: ${source}`);
  if (DRY_RUN) {
    for (const item of ROADMAP) console.log(`[dry-run] ${item.assigned_to}: ${item.title}`);
    return;
  }

  let ok = 0, failed = 0;
  for (const item of ROADMAP) {
    process.stdout.write(`  ${item.assigned_to.padEnd(14)} ${item.priority.padEnd(9)} ${item.title.slice(0, 72).padEnd(72)} `);
    try {
      const r = await postJson('/api/backlog/items', item);
      if (r.success) { console.log(`ok ${r.task?.id || ''}`); ok++; }
      else { console.log(`fail ${r.error || 'unknown response'}`); failed++; }
    } catch (e) {
      console.log(`fail ${e.message}`);
      failed++;
    }
  }
  console.log(`Done: ${ok} created, ${failed} failed`);
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error('FATAL', e); process.exit(1); });
