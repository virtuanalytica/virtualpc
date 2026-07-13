"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VitalsService = void 0;
/**
 * VitalsService — system vitals + GPU overview backed by bash scripts/sidecar.
 *
 * The bash scripts under virtualpc/scripts/ are the single source of truth for
 * sampling (vitals-monitor.sh), aggregating (gpu-overview.sh), and controlling
 * Ollama (gpu-clean.sh). This service just exposes their output over HTTP.
 *
 * On/off:
 *   GPU_ENABLED=true   — all GPU/ollama features active, routes wired.
 *   GPU_ENABLED=false  — snapshot still works for CPU/mem/disk, but GPU fields
 *                        report as disabled and POST /api/gpu/* returns 503.
 */
const child_process_1 = require("child_process");
const fs_1 = require("fs");
const path = __importStar(require("path"));
const logger_1 = __importDefault(require("../utils/logger"));
const SCRIPTS_DIR = path.join(__dirname, '..', '..', 'scripts');
const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const SNAP_PATH = path.join(LOG_DIR, 'gpu-overview.json');
const JSONL_PATH = path.join(LOG_DIR, 'vitals.jsonl');
class VitalsService {
    constructor() {
        this.monitorChild = null;
        this.gpuEnabled = (process.env.GPU_ENABLED ?? 'true').toLowerCase() !== 'false';
        logger_1.default.info(`VitalsService: GPU_ENABLED=${this.gpuEnabled}`);
    }
    isGpuEnabled() { return this.gpuEnabled; }
    setGpuEnabled(on) {
        this.gpuEnabled = on;
        logger_1.default.info(`VitalsService: GPU_ENABLED flipped to ${on}`);
        if (on)
            this.startMonitor();
        else
            this.stopMonitor();
    }
    // Spawn vitals-monitor.sh as a long-running child. Idempotent.
    startMonitor(intervalSec = 30) {
        if (this.monitorChild && !this.monitorChild.killed)
            return;
        const script = path.join(SCRIPTS_DIR, 'vitals-monitor.sh');
        this.monitorChild = (0, child_process_1.spawn)('bash', [script, String(intervalSec)], {
            detached: false,
            stdio: ['ignore', 'ignore', 'ignore'],
        });
        this.monitorChild.on('exit', (code) => {
            logger_1.default.warn(`vitals-monitor exited code=${code}; clearing handle`);
            this.monitorChild = null;
        });
        logger_1.default.info(`VitalsService: spawned vitals-monitor (pid=${this.monitorChild.pid}, ${intervalSec}s)`);
    }
    stopMonitor() {
        if (this.monitorChild && !this.monitorChild.killed) {
            this.monitorChild.kill('SIGTERM');
            this.monitorChild = null;
            logger_1.default.info('VitalsService: stopped vitals-monitor');
        }
    }
    async getSnapshot() {
        try {
            const raw = await fs_1.promises.readFile(SNAP_PATH, 'utf8');
            const snap = JSON.parse(raw);
            if (!this.gpuEnabled) {
                // Blank out GPU fields when feature is off, keep CPU/mem/disk.
                snap.gpus = [];
                snap.gpu_procs = [];
                snap.ollama = { models: [] };
            }
            return snap;
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return null;
            throw e;
        }
    }
    // Read vitals.jsonl, return windowed aggregates. window in seconds, null = all.
    async getHistory(windows = {
        '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '24h': 86400, 'all': null,
    }) {
        let content = '';
        try {
            content = await fs_1.promises.readFile(JSONL_PATH, 'utf8');
        }
        catch (e) {
            if (e.code === 'ENOENT')
                return {};
            throw e;
        }
        const samples = [];
        for (const line of content.split('\n')) {
            if (!line.trim())
                continue;
            try {
                samples.push(JSON.parse(line));
            }
            catch { }
        }
        const now = Date.now();
        const out = {};
        const p = (pct, xs) => {
            if (!xs.length)
                return 0;
            const s = [...xs].sort((a, b) => a - b);
            return s[Math.round(((pct / 100) * (s.length - 1)))];
        };
        for (const [name, secs] of Object.entries(windows)) {
            const cutoff = secs == null ? 0 : now - secs * 1000;
            const recent = samples.filter(s => new Date(s.ts).getTime() >= cutoff);
            if (recent.length === 0) {
                out[name] = { n: 0 };
                continue;
            }
            const util0 = recent.map(s => s.gpus?.[0]?.util).filter((x) => typeof x === 'number');
            const util1 = recent.map(s => s.gpus?.[1]?.util).filter((x) => typeof x === 'number');
            const vram = recent.map(s => (s.gpus || []).reduce((a, g) => a + g.mem_used, 0));
            const agentMib = {};
            for (const s of recent)
                for (const pr of s.gpu_procs || [])
                    agentMib[pr.agent] = (agentMib[pr.agent] || 0) + pr.mem_mb;
            const avg = (xs) => xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
            out[name] = {
                n: recent.length,
                gpu0_util: { avg: avg(util0), p95: p(95, util0), max: util0.length ? Math.max(...util0) : 0 },
                gpu1_util: { avg: avg(util1), p95: p(95, util1), max: util1.length ? Math.max(...util1) : 0 },
                vram_mib: { avg: avg(vram), max: vram.length ? Math.max(...vram) : 0 },
                agent_mib_ticks: Object.fromEntries(Object.entries(agentMib).sort(([, a], [, b]) => b - a)),
            };
        }
        return out;
    }
    // GET /api/vitals/disk-candidates  — top relocation targets under /home/knight2.
    // Skips already-symlinked dirs and the active service paths. Read-only.
    async diskCandidates(opts = {}) {
        const minBytes = (opts.minMb ?? 50) * 1024 * 1024;
        const limit = opts.limit ?? 20;
        const fsp = require('fs').promises;
        const path = require('path');
        const HOME = '/home/knight2';
        const candidates = [];
        const enumerate = async (dir) => {
            try {
                const entries = await fsp.readdir(dir, { withFileTypes: true });
                for (const e of entries) {
                    if (!e.isDirectory() || e.isSymbolicLink())
                        continue;
                    candidates.push(path.join(dir, e.name));
                }
            }
            catch { }
        };
        await enumerate(HOME);
        await enumerate(path.join(HOME, '.cache'));
        await enumerate(path.join(HOME, '.local/share'));
        const results = [];
        const { spawnSync } = require('child_process');
        for (const p of candidates) {
            // Use bash du --bytes — fast and consistent. exclude=node_modules to keep
            // virtualpc's actively-mutating dir from blowing the size estimate.
            const r = spawnSync('du', ['-bs', '--exclude=node_modules', p], { encoding: 'utf8' });
            const bytes = Number((r.stdout || '0').split(/\s+/)[0]);
            if (!bytes || bytes < minBytes)
                continue;
            let status = '';
            if (/\/(virtualpc|custom-paperclip)$/.test(p) || /\/.claude$|\/.paperclip$/.test(p))
                status = 'ACTIVE — service in use';
            else if (/\/snap(\/|$)/.test(p))
                status = 'snap-confined';
            else if (/\/agents$/.test(p))
                status = 'git repo';
            const size_mb = Math.round(bytes / (1024 * 1024));
            const size_human = bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)}G` : `${size_mb}M`;
            results.push({ path: p, size_mb, size_human, status });
        }
        return results.sort((a, b) => b.size_mb - a.size_mb).slice(0, limit);
    }
    // POST /api/gpu/clean  — force-unload Ollama models.
    async cleanGpu() {
        const script = path.join(SCRIPTS_DIR, 'gpu-clean.sh');
        const r = (0, child_process_1.spawnSync)('bash', [script], { encoding: 'utf8' });
        const out = (r.stdout || '') + (r.stderr || '');
        const mBefore = out.match(/before:\s+(\d+)\s+MiB/);
        const mAfter = out.match(/after:\s+(\d+)\s+MiB/);
        const before = mBefore ? Number(mBefore[1]) : 0;
        const after = mAfter ? Number(mAfter[1]) : 0;
        const unloaded = Array.from(out.matchAll(/unloading (\S+)/g)).map(m => m[1]);
        return { before_mib: before, after_mib: after, freed_mib: Math.max(0, before - after), unloaded };
    }
}
exports.VitalsService = VitalsService;
exports.default = VitalsService;
//# sourceMappingURL=vitals-service.js.map