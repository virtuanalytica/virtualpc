/**
 * Model Router — matches VirtualPC agents to locally-loadable LLMs based on
 * the host's compute resources.
 *
 * Why this exists:
 *   - The previous code hard-coded 26 B/27 B models that do not fit on an
 *     8 GB MacBook Air and fail when LM Studio is not running.
 *   - We want a single, repo-owned place that says "this agent needs code
 *     capability, here are the smallest models that satisfy it".
 *   - The setup program (`scripts/setup-model-roster.js`) uses this module
 *     to generate a runtime roster; `lmstudio.ts` uses it to pick a loaded
 *     model or fall back to simulation.
 */

import { execSync } from 'child_process';
import { AGENT_META, type AgentMeta } from './agent-registry';
import logger from './utils/logger';

// ─── Model catalog ──────────────────────────────────────────────────────────
// All sizes are for a Q4_K_M GGUF or equivalent LM-Studio-served model.
// Disk = installed file size. RAM = working set at modest context.

export type ModelTag = 'chat' | 'code' | 'reasoning' | 'embedding' | 'long-context' | 'vision';
export type WeightClass = 'featherweight' | 'lightweight' | 'middleweight' | 'heavyweight' | 'donkeykongweight';

export interface ModelInfo {
  id: string;           // substring matched against LM Studio /models id
  name: string;         // human label
  params: number;       // billions
  diskGB: number;
  ramGB: number;
  tags: ModelTag[];
  weightClass: WeightClass;
  lmStudioLoad?: string; // full identifier for `lms load ...` (cloud-only models omit)
  cloudFallback?: string;
}

// ─── Weight-class standards ─────────────────────────────────────────────────
// lightweight  : models under ~200 MB that fit many agents on a 4 GB MacBook Air
// middleweight : 200 MB – 4 GB, for workstations with 16-32 GB RAM
// heavyweight  : > 4 GB / high-parameter models for 5 TB+ disk, 64 GB+ RAM, GPU
export const WEIGHT_CLASSES: Record<WeightClass, { maxDiskGB: number; label: string; minFreeRAMGB: number; minVRAMGB?: number; targetDevices: string }> = {
  featherweight:   { maxDiskGB: 0.05, label: 'Featherweight (< 50 MB · Raspberry Pi / ESP32 class)', minFreeRAMGB: 0.25, targetDevices: 'raspberry-pi, esp32, microcontrollers' },
  lightweight:     { maxDiskGB: 0.2,  label: 'Lightweight (< 200 MB · low-end laptops)', minFreeRAMGB: 0.5, targetDevices: 'macbook-air, chromebook, low-ram-laptop' },
  middleweight:    { maxDiskGB: 4.0,  label: 'Middleweight (200 MB – 4 GB · workstations)', minFreeRAMGB: 4, targetDevices: 'desktop, laptop-16gb' },
  heavyweight:     { maxDiskGB: 30.0, label: 'Heavyweight (4 GB – 30 GB · GPU ≥ 15 GB VRAM)', minFreeRAMGB: 16, minVRAMGB: 15, targetDevices: 'rtx3090, a100-40gb, multi-gpu' },
  donkeykongweight:{ maxDiskGB: 9999, label: 'DonkeyKongWeight (> 30 GB · monster GPU rigs)', minFreeRAMGB: 64, minVRAMGB: 32, targetDevices: 'v100-32gb, a100-80gb, h100, multi-gpu-cluster' },
};

export const MODEL_CATALOG: ModelInfo[] = [
  // ─── Featherweight roster (< 100 MB) ─────────────────────────────────────
  { id: 'smollm-135m',      name: 'SmolLM 135M Instruct', weightClass: 'featherweight', params: 0.135, diskGB: 0.10, ramGB: 0.5, tags: ['chat'],                 lmStudioLoad: 'HuggingFaceTB/SmolLM-135M-Instruct-GGUF' },
  { id: 'smollm2-135m',     name: 'SmolLM2 135M Instruct', weightClass: 'featherweight', params: 0.135, diskGB: 0.10, ramGB: 0.5, tags: ['chat'],                 lmStudioLoad: 'HuggingFaceTB/SmolLM2-135M-Instruct-GGUF' },
  { id: 'nomic-embed-text-v1.5', name: 'Nomic Embed Text v1.5', weightClass: 'featherweight', params: 0.137, diskGB: 0.13, ramGB: 0.5, tags: ['embedding'],     lmStudioLoad: 'nomic-ai/nomic-embed-text-v1.5' },

  // ─── Lightweight roster (100 MB – 200 MB) ────────────────────────────────
  { id: 'qwen2.5-0.5b',     name: 'Qwen2.5 0.5B Instruct', weightClass: 'lightweight', params: 0.5,   diskGB: 0.35, ramGB: 1.0, tags: ['chat', 'reasoning'],    lmStudioLoad: 'bartowski/Qwen2.5-0.5B-Instruct-GGUF' },
  { id: 'qwen2.5-coder-0.5b', name: 'Qwen2.5 Coder 0.5B', weightClass: 'lightweight', params: 0.5,   diskGB: 0.35, ramGB: 1.0, tags: ['code', 'chat'],         lmStudioLoad: 'bartowski/Qwen2.5-Coder-0.5B-Instruct-GGUF' },
  { id: 'tinyllama-1.1b',   name: 'TinyLlama 1.1B Chat',   weightClass: 'lightweight', params: 1.1,   diskGB: 0.65, ramGB: 1.5, tags: ['chat', 'reasoning'],    lmStudioLoad: 'TheBloke/TinyLlama-1.1B-Chat-v1.0-GGUF' },
  { id: 'stablelm-2-zephyr-1.6b', name: 'StableLM 2 Zephyr 1.6B', weightClass: 'lightweight', params: 1.6, diskGB: 1.0, ramGB: 2.0, tags: ['chat'],           lmStudioLoad: 'stabilityai/stablelm-2-zephyr-1.6b' },

  // ─── Middleweight roster (200 MB – 4 GB) ─────────────────────────────────
  // Demo/MLX-optimized small middleweight models (fit on a lightweight PC with ~9 GB free)
  { id: 'qwen2.5-0.5b-instruct-4bit', name: 'Qwen2.5 0.5B Instruct (MLX 4bit)', weightClass: 'middleweight', params: 0.5, diskGB: 0.28, ramGB: 0.7, tags: ['chat', 'reasoning'], lmStudioLoad: 'mlx-community/Qwen2.5-0.5B-Instruct-4bit' },
  { id: 'qwen2.5-7b',       name: 'Qwen2.5 7B Instruct',   weightClass: 'middleweight', params: 7,     diskGB: 4.5,  ramGB: 5.0, tags: ['chat', 'reasoning', 'long-context'], lmStudioLoad: 'bartowski/Qwen2.5-7B-Instruct-GGUF' },
  { id: 'qwen2.5-coder-7b', name: 'Qwen2.5 Coder 7B',      weightClass: 'middleweight', params: 7,     diskGB: 4.5,  ramGB: 5.0, tags: ['code', 'chat', 'long-context'],      lmStudioLoad: 'bartowski/Qwen2.5-Coder-7B-Instruct-GGUF' },
  { id: 'gemma-3-4b',       name: 'Gemma 3 4B IT',         weightClass: 'middleweight', params: 4,     diskGB: 2.5,  ramGB: 3.5, tags: ['chat', 'long-context'],              lmStudioLoad: 'bartowski/gemma-3-4b-it-GGUF' },
  { id: 'phi-4-mini',       name: 'Phi-4 Mini Instruct',   weightClass: 'middleweight', params: 3.8,   diskGB: 2.3,  ramGB: 3.0, tags: ['chat', 'code'],                      lmStudioLoad: 'bartowski/Phi-4-mini-instruct-GGUF' },

  // ─── Heavyweight roster (4 GB – 30 GB) ───────────────────────────────────
  { id: 'phi-4',            name: 'Phi-4 Instruct (14B)',  weightClass: 'heavyweight', params: 14,    diskGB: 9.0,  ramGB: 10.0, tags: ['chat', 'code', 'long-context'],     lmStudioLoad: 'microsoft/phi-4' },
  { id: 'devstral',         name: 'Devstral 24B',          weightClass: 'heavyweight', params: 24,    diskGB: 15.0, ramGB: 18.0, tags: ['code', 'long-context'],             lmStudioLoad: 'Allama/Devstral-24B-GGUF' },
  { id: 'gemma-4-26b',      name: 'Gemma 4 26B',           weightClass: 'heavyweight', params: 26,    diskGB: 16.0, ramGB: 20.0, tags: ['chat', 'long-context'],             lmStudioLoad: 'google/gemma-4-26b-a4b' },
  { id: 'qwen3.5-27b',      name: 'Qwen 3.5 27B',          weightClass: 'heavyweight', params: 27,    diskGB: 17.0, ramGB: 20.0, tags: ['chat', 'reasoning', 'long-context'], lmStudioLoad: 'Qwen/Qwen3.5-27B-GGUF' },
  { id: 'glm-latest',       name: 'GLM Latest',            weightClass: 'heavyweight', params: 32,    diskGB: 20.0, ramGB: 24.0, tags: ['chat', 'reasoning', 'long-context'], lmStudioLoad: 'THUDM/glm-4-32b-0414' },

  // ─── DonkeyKongWeight roster (> 30 GB / multi-GPU / monster machines) ────
  { id: 'deepseek-r1-671b', name: 'DeepSeek R1 671B',      weightClass: 'donkeykongweight', params: 671,   diskGB: 380.0, ramGB: 400.0, tags: ['reasoning', 'chat', 'long-context'], lmStudioLoad: 'unsloth/DeepSeek-R1-GGUF' },
  { id: 'glm-4-plus-latest',name: 'GLM 4 Plus Latest',     weightClass: 'donkeykongweight', params: 100,   diskGB: 60.0,  ramGB: 80.0, tags: ['chat', 'reasoning', 'long-context'], lmStudioLoad: 'THUDM/glm-4-plus' },
  { id: 'kimi-k2.6',        name: 'Kimi K2.6 (> 200B)',    weightClass: 'donkeykongweight', params: 200,   diskGB: 0,    ramGB: 0,    tags: ['chat', 'reasoning', 'long-context'], cloudFallback: 'moonshot/kimi-k2.6' },

  // ─── Cloud-only fallbacks (never downloaded locally) ─────────────────────
  { id: 'claude-sonnet',    name: 'Claude Sonnet (cloud)', weightClass: 'heavyweight', params: 0,     diskGB: 0,    ramGB: 0,   tags: ['chat', 'code', 'reasoning', 'long-context'], cloudFallback: 'anthropic/claude-sonnet-4-20250514' },
  { id: 'claude-opus',      name: 'Claude Opus (cloud)',   weightClass: 'heavyweight', params: 0,     diskGB: 0,    ramGB: 0,   tags: ['chat', 'code', 'reasoning', 'long-context'], cloudFallback: 'anthropic/claude-opus-4' },
  { id: 'gpt-5.5',          name: 'GPT-5.5 (Codex)',       weightClass: 'heavyweight', params: 0,     diskGB: 0,    ramGB: 0,   tags: ['code', 'reasoning', 'long-context'],         cloudFallback: 'openai/gpt-5.5' },
];

// ─── Agent capability rules ─────────────────────────────────────────────────
// Map agent kind/role to the model capabilities it needs, plus how many
// models should be assigned for redundancy.

export interface AgentModelRule {
  agent?: string;       // exact agent name; if omitted, matches by kind
  kind?: AgentMeta['kind'];
  capabilities: ModelTag[];
  minModels: number;
  maxModels: number;
  allowCloud: boolean;
}

export const AGENT_MODEL_RULES: AgentModelRule[] = [
  // Core executives and chat-heavy agents
  { kind: 'core',       capabilities: ['chat'],                    minModels: 2, maxModels: 3, allowCloud: true },
  // Decision makers need reasoning
  { kind: 'decision',   capabilities: ['reasoning', 'chat'],       minModels: 2, maxModels: 3, allowCloud: true },
  // Specialists vary by role — exact overrides below
  { kind: 'specialist', capabilities: ['chat', 'reasoning'],       minModels: 2, maxModels: 3, allowCloud: true },
  { kind: 'resource',   capabilities: ['chat'],                    minModels: 2, maxModels: 3, allowCloud: true },
  { kind: 'governance', capabilities: ['chat', 'long-context'],    minModels: 2, maxModels: 3, allowCloud: true },
  { kind: 'reviewer',   capabilities: ['code', 'reasoning'],       minModels: 1, maxModels: 2, allowCloud: true },
  { kind: 'tester',     capabilities: ['chat'],                    minModels: 2, maxModels: 3, allowCloud: true },
  { kind: 'hermes-coordinator', capabilities: ['chat', 'reasoning'], minModels: 2, maxModels: 3, allowCloud: true },

  // Per-agent overrides (more specific than kind)
  { agent: 'Kai',        capabilities: ['code', 'chat'],            minModels: 2, maxModels: 3, allowCloud: true },
  { agent: 'Zip',        capabilities: ['code', 'chat'],            minModels: 2, maxModels: 3, allowCloud: true },
  { agent: 'Luna',       capabilities: ['code', 'chat'],            minModels: 2, maxModels: 3, allowCloud: true },
  { agent: 'Pixel',      capabilities: ['code', 'chat', 'long-context'], minModels: 2, maxModels: 3, allowCloud: true },
  { agent: 'Atlas',      capabilities: ['code', 'reasoning'],       minModels: 2, maxModels: 3, allowCloud: true },
  { agent: 'Data-Engineer',  capabilities: ['code', 'chat'],        minModels: 2, maxModels: 3, allowCloud: true },
  { agent: 'Data-Scientist', capabilities: ['reasoning', 'chat'],   minModels: 2, maxModels: 3, allowCloud: true },
  { agent: 'Athena',     capabilities: ['code', 'reasoning'],       minModels: 1, maxModels: 2, allowCloud: true },
];

// ─── Resource detection ─────────────────────────────────────────────────────

export interface HostResources {
  platform: 'darwin' | 'linux' | 'win32' | 'unknown';
  totalRAMGB: number;
  freeRAMGB: number;
  freeDiskGB: number;
  totalVRAMGB: number;
  freeVRAMGB: number;
  hasMetal: boolean;
  hasCUDA: boolean;
  cpuCores: number;
  recommendedMaxDiskGB: number;
  recommendedMaxRAMGB: number;
}

function round1(n: number): number { return Math.round(n * 10) / 10; }

// ─── User overrides ─────────────────────────────────────────────────────────
// VirtualPC can persist user overrides in data/model-router-settings.json.
// Supported keys: weightClass, maxDiskGB, maxRAMGB, maxVRAMGB, allowBigModels,
// allowCloud, forceSimulation.

const SETTINGS_PATH = process.env.MODEL_ROUTER_SETTINGS || './data/model-router-settings.json';

export interface ModelRouterSettings {
  weightClass?: WeightClass;
  maxDiskGB?: number;
  maxRAMGB?: number;
  maxVRAMGB?: number;
  allowBigModels?: boolean;
  allowCloud?: boolean;
  forceSimulation?: boolean;
}

let _cachedSettings: ModelRouterSettings | null = null;
let _settingsMtime = 0;

export function readSettings(): ModelRouterSettings {
  try {
    const fs = require('fs');
    if (!fs.existsSync(SETTINGS_PATH)) return {};
    const stat = fs.statSync(SETTINGS_PATH);
    if (_cachedSettings && stat.mtimeMs === _settingsMtime) return _cachedSettings;
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    const parsed = JSON.parse(raw) as ModelRouterSettings;
    _cachedSettings = parsed;
    _settingsMtime = stat.mtimeMs;
    return parsed;
  } catch (e) {
    logger.warn('model-router: could not read settings, using defaults');
    return {};
  }
}

export function writeSettings(settings: ModelRouterSettings) {
  const fs = require('fs');
  const dir = require('path').dirname(SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  _cachedSettings = settings;
}

function detectVRAM(): { totalVRAMGB: number; freeVRAMGB: number; hasCUDA: boolean } {
  let totalVRAMGB = 0;
  let freeVRAMGB = 0;
  let hasCUDA = false;
  try {
    // nvidia-smi gives VRAM in MiB
    const smi = execSync('nvidia-smi --query-gpu=memory.total,memory.free --format=csv,noheader,nounits', { encoding: 'utf8' });
    const lines = smi.trim().split('\n');
    for (const line of lines) {
      const [totalMiB, freeMiB] = line.split(',').map((s: string) => parseInt(s.trim(), 10));
      totalVRAMGB += totalMiB / 1024;
      freeVRAMGB += freeMiB / 1024;
    }
    hasCUDA = totalVRAMGB > 0;
  } catch {
    // No NVIDIA GPU; check Metal on macOS via system_profiler (rough, only Apple Silicon)
    if (process.platform === 'darwin') {
      try {
        const metal = execSync('system_profiler SPDisplaysDataType -json', { encoding: 'utf8' });
        const json = JSON.parse(metal);
        const displays = json?.SPDisplaysDataType || [];
        for (const d of displays) {
          if (d.spdisplays_vram_shared || d.spdisplays_vram) {
            const vramStr = d.spdisplays_vram_shared || d.spdisplays_vram;
            const match = vramStr.match(/(\d+(?:\.\d+)?)\s*(MB|GB)/i);
            if (match) {
              const val = parseFloat(match[1]);
              const gb = match[2].toUpperCase() === 'GB' ? val : val / 1024;
              totalVRAMGB += gb;
              freeVRAMGB += gb * 0.5; // conservative: half of unified memory is free for models
            }
          }
        }
      } catch { /* ignore */ }
    }
  }
  return { totalVRAMGB: round1(totalVRAMGB), freeVRAMGB: round1(freeVRAMGB), hasCUDA };
}

export function detectHostResources(): HostResources {
  const platform = process.platform as HostResources['platform'];
  let totalRAMGB = 8;
  let freeRAMGB = 2;
  let freeDiskGB = 4;
  let cpuCores = 4;

  try {
    if (platform === 'darwin') {
      const mem = execSync('sysctl -n hw.memsize', { encoding: 'utf8' }).trim();
      totalRAMGB = parseInt(mem, 10) / (1024 ** 3);
      const cores = execSync('sysctl -n hw.ncpu', { encoding: 'utf8' }).trim();
      cpuCores = parseInt(cores, 10);
      const vm = execSync('vm_stat', { encoding: 'utf8' });
      const pageSize = 16384;
      const freePages = (vm.match(/Pages free:\s+(\d+)/)?.[1] || '0');
      const inactivePages = (vm.match(/Pages inactive:\s+(\d+)/)?.[1] || '0');
      freeRAMGB = (parseInt(freePages) + parseInt(inactivePages)) * pageSize / (1024 ** 3);
      const df = execSync('df -g / 2>/dev/null | tail -1 | awk \'{print $4}\'', { encoding: 'utf8', shell: '/bin/bash' }).trim();
      freeDiskGB = parseFloat(df) || 4;
    } else if (platform === 'linux') {
      const meminfo = execSync('cat /proc/meminfo', { encoding: 'utf8' });
      const totalKB = parseInt(meminfo.match(/MemTotal:\s+(\d+)/)?.[1] || '0');
      const availableKB = parseInt(meminfo.match(/MemAvailable:\s+(\d+)/)?.[1] || '0');
      totalRAMGB = totalKB / (1024 ** 2);
      freeRAMGB = availableKB / (1024 ** 2);
      const df = execSync("df -BG / | tail -1 | awk '{print $4}' | tr -d 'G'", { encoding: 'utf8', shell: '/bin/bash' }).trim();
      freeDiskGB = parseFloat(df) || 4;
      cpuCores = parseInt(execSync('nproc', { encoding: 'utf8' }).trim(), 10);
    }
  } catch (e) {
    logger.warn('model-router: could not detect host resources, using safe defaults');
  }

  const vram = detectVRAM();
  const hasMetal = platform === 'darwin';
  const hasCUDA = vram.hasCUDA;
  const settings = readSettings();

  // Auto-detected limits
  let recommendedMaxDiskGB = round1(Math.max(0.5, freeDiskGB - 1));
  let recommendedMaxRAMGB = round1(Math.max(0.5, totalRAMGB * 0.5));

  // User overrides from VirtualPC settings
  if (typeof settings.maxDiskGB === 'number') recommendedMaxDiskGB = settings.maxDiskGB;
  if (typeof settings.maxRAMGB === 'number') recommendedMaxRAMGB = settings.maxRAMGB;

  return {
    platform,
    totalRAMGB: round1(totalRAMGB),
    freeRAMGB: round1(freeRAMGB),
    freeDiskGB: round1(freeDiskGB),
    totalVRAMGB: vram.totalVRAMGB,
    freeVRAMGB: settings.maxVRAMGB ?? vram.freeVRAMGB,
    hasMetal,
    hasCUDA,
    cpuCores,
    recommendedMaxDiskGB,
    recommendedMaxRAMGB,
  };
}

// ─── Roster generation ──────────────────────────────────────────────────────

export interface RosterEntry {
  agent: string;
  models: string[];
  primary: string;
  capabilities: ModelTag[];
}

export interface GeneratedRoster {
  generatedAt: string;
  weightClass: WeightClass;
  resources: HostResources;
  allowBigModels: boolean;
  allowCloud: boolean;
  roster: RosterEntry[];
  recommendedDownloads: ModelInfo[];
  simulationByDefault: boolean;
}

function ruleFor(agent: AgentMeta): AgentModelRule {
  const exact = AGENT_MODEL_RULES.find(r => r.agent === agent.name);
  if (exact) return exact;
  const byKind = AGENT_MODEL_RULES.find(r => r.kind === agent.kind && !r.agent);
  if (byKind) return byKind;
  return { capabilities: ['chat'], minModels: 1, maxModels: 2, allowCloud: true };
}

function modelSatisfies(model: ModelInfo, tags: ModelTag[]): boolean {
  return tags.every(t => model.tags.includes(t));
}

export function generateRoster(opts: {
  weightClass?: WeightClass;
  allowBigModels?: boolean;
  allowCloud?: boolean;
  resources?: HostResources;
} = {}): GeneratedRoster {
  const settings = readSettings();
  const resources = opts.resources ?? detectHostResources();
  const allowBigModels = opts.allowBigModels ?? settings.allowBigModels ?? (process.env.FORCE_BIG_MODEL === '1');
  const allowCloud = opts.allowCloud ?? settings.allowCloud ?? true;

  // Auto-select weight class from resources unless overridden by user or caller.
  const autoWeightClass: WeightClass =
    resources.totalVRAMGB >= WEIGHT_CLASSES.donkeykongweight.minVRAMGB! && resources.totalRAMGB >= WEIGHT_CLASSES.donkeykongweight.minFreeRAMGB ? 'donkeykongweight' :
    resources.totalVRAMGB >= WEIGHT_CLASSES.heavyweight.minVRAMGB! && resources.totalRAMGB >= WEIGHT_CLASSES.heavyweight.minFreeRAMGB ? 'heavyweight' :
    resources.recommendedMaxDiskGB >= 4 && resources.totalRAMGB >= 8 ? 'middleweight' :
    resources.recommendedMaxDiskGB >= 0.2 ? 'lightweight' :
    'featherweight';

  const weightClass: WeightClass = opts.weightClass ?? settings.weightClass ?? autoWeightClass;

  const maxDiskForClass = WEIGHT_CLASSES[weightClass].maxDiskGB;

  const candidates = MODEL_CATALOG.filter(m => {
    if (m.diskGB === 0) return allowCloud;           // cloud-only
    if ((m.weightClass === 'heavyweight' || m.weightClass === 'donkeykongweight') && !allowBigModels) return false;
    if (WEIGHT_CLASSES[m.weightClass].maxDiskGB > maxDiskForClass) return false; // enforce class ceiling
    if (m.diskGB > resources.recommendedMaxDiskGB) return false;
    if (m.ramGB > resources.recommendedMaxRAMGB) return false;
    const minVram = WEIGHT_CLASSES[m.weightClass].minVRAMGB ?? 0;
    if (minVram > 0 && resources.totalVRAMGB > 0 && resources.totalVRAMGB < minVram) return false;
    return true;
  });

  // Sort by capability breadth then size — smallest, most capable first
  candidates.sort((a, b) => {
    const tagDiff = b.tags.length - a.tags.length;
    if (tagDiff !== 0) return tagDiff;
    return a.diskGB - b.diskGB;
  });

  const roster: RosterEntry[] = AGENT_META.map(agent => {
    const rule = ruleFor(agent);
    const matches = candidates
      .filter(m => modelSatisfies(m, rule.capabilities))
      .slice(0, rule.maxModels);
    const ids = matches.length
      ? matches.map(m => m.id)
      : // fallback: any chat-capable candidate, then any candidate at all
        (candidates.filter(m => m.tags.includes('chat')).map(m => m.id).slice(0, rule.maxModels)
          || candidates.map(m => m.id).slice(0, rule.maxModels)
          || (allowCloud ? ['claude-sonnet'] : []));
    return {
      agent: agent.name,
      models: ids,
      primary: ids[0] || 'simulated',
      capabilities: rule.capabilities,
    };
  });

  // Recommend the smallest distinct set that covers every capability we need
  const neededCaps = new Set<ModelTag>();
  AGENT_META.forEach(a => ruleFor(a).capabilities.forEach(c => neededCaps.add(c)));
  const recommendedDownloads: ModelInfo[] = [];
  const covered = new Set<ModelTag>();
  for (const cap of Array.from(neededCaps).sort()) {
    if (covered.has(cap)) continue;
    const best = candidates
      .filter(m => m.tags.includes(cap) && m.diskGB > 0)
      .sort((a, b) => a.diskGB - b.diskGB)[0];
    if (best && !recommendedDownloads.find(r => r.id === best.id)) {
      recommendedDownloads.push(best);
      best.tags.forEach(t => covered.add(t));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    weightClass,
    resources,
    allowBigModels,
    allowCloud,
    roster,
    recommendedDownloads,
    // If the machine has < 1 GB free or no viable candidate, simulate by default
    simulationByDefault: resources.freeDiskGB < 1 || candidates.filter(m => m.diskGB > 0).length === 0,
  };
}

// ─── Runtime model resolution ───────────────────────────────────────────────

export interface LoadedModel { id: string; object?: string; }

/**
 * Pick the best loaded model for an agent + task.
 * Returns null if nothing matches, so the caller can simulate.
 */
export function resolveModelForAgent(
  agent: string,
  taskType: string | undefined,
  loadedModels: LoadedModel[],
  roster?: GeneratedRoster,
): string | null {
  if (loadedModels.length === 0) return null;

  const r = roster ?? generateRoster();
  const entry = r.roster.find(e => e.agent === agent);
  const preferred = entry?.models ?? [];

  // Task-type capability boost
  const taskBoost: ModelTag[] = [];
  if (taskType === 'code') taskBoost.push('code');
  if (taskType === 'reasoning' || taskType === 'arbitration') taskBoost.push('reasoning');
  if (taskType === 'deep' || taskType === 'concept') taskBoost.push('long-context');
  if (taskType === 'embedding') taskBoost.push('embedding');

  const modelById = (id: string) => MODEL_CATALOG.find(m => m.id === id);

  // 1. preferred roster model that is loaded and matches task boost
  for (const id of preferred) {
    const m = modelById(id);
    const loaded = loadedModels.find(lm => lm.id.toLowerCase().includes(id.toLowerCase()));
    if (loaded && (!taskBoost.length || taskBoost.every(t => m?.tags.includes(t)))) {
      return loaded.id;
    }
  }

  // 2. any loaded preferred model
  for (const id of preferred) {
    const loaded = loadedModels.find(lm => lm.id.toLowerCase().includes(id.toLowerCase()));
    if (loaded) return loaded.id;
  }

  // 3. any loaded model matching task boost
  for (const lm of loadedModels) {
    const m = MODEL_CATALOG.find(c => lm.id.toLowerCase().includes(c.id.toLowerCase()));
    if (m && taskBoost.every(t => m.tags.includes(t))) return lm.id;
  }

  // 4. smallest loaded non-embedding chat model
  const chatLoaded = loadedModels
    .map(lm => ({ lm, m: MODEL_CATALOG.find(c => lm.id.toLowerCase().includes(c.id.toLowerCase())) }))
    .filter(x => x.m && x.m.tags.includes('chat'))
    .sort((a, b) => (a.m?.diskGB ?? 99) - (b.m?.diskGB ?? 99));
  if (chatLoaded.length) return chatLoaded[0].lm.id;

  // 5. any loaded non-embedding model
  const nonEmbed = loadedModels.find(lm => !/embed/i.test(lm.id));
  return nonEmbed?.id ?? null;
}

// ─── Simulation fallback ────────────────────────────────────────────────────
// Keeps VirtualPC functional when no local LLM is loaded.

const SIMULATION_TEMPLATES: Record<string, string[]> = {
  default: [
    'Acknowledged. I will proceed with the requested task.',
    'Understood — working on this now.',
    'Noted. I will coordinate the next steps.',
  ],
  'Data-Steward': [
    'Schema check complete: required fields are present and types look consistent.',
    'Data quality guard: no obvious null blocks found in the latest ingestion.',
    'I will update the governance registry with the new column lineage.',
  ],
  'Data-Engineer': [
    'ETL pipeline step drafted and feature columns extracted.',
    'Download window scheduled to respect the free-tier rate limiter.',
    'Feature store updated with the latest commodity indicators.',
  ],
  'Data-Analyst': [
    'Summary tables generated; key metrics look stable.',
    'Visualization data prepared for the dashboard.',
    'Peer comparison ratios computed for the latest filing period.',
  ],
  'Data-Scientist': [
    'Outlier detection run complete; flagged samples saved for review.',
    'Experiment log updated with the latest model scores.',
    'I will refine the feature set and re-run the validation split.',
  ],
  'Data-Manager': [
    'Lineage graph updated and versioning snapshot created.',
    'Data catalog refreshed with the latest standardized filings.',
    'Governance audit trail written to the registry.',
  ],
  Fill: [
    'Scrum-of-scrums update: no blockers, teams are aligned.',
    'I will chair the next standup and track the OKRs.',
  ],
  Kai: [
    'Infra check passed; dependencies are within acceptable range.',
    'I will review the deployment checklist.',
  ],
  Zip: [
    'Code changes look good; I will add a regression test.',
    'Feature branch is ready for review.',
  ],
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

export function simulateAgentResponse(agent: string, messages: { role: string; content: string }[]): {
  content: string;
  model: string;
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; source: string };
  latencyMs: number;
} {
  const promptText = messages.map(m => m.content).join('\n');
  const bucket = SIMULATION_TEMPLATES[agent] ?? SIMULATION_TEMPLATES.default;
  const idx = hashString(promptText) % bucket.length;
  const content = bucket[idx];
  const promptTokens = Math.round(promptText.length / 4);
  const completionTokens = Math.round(content.length / 4);
  return {
    content,
    model: 'simulated',
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      source: 'simulated-fallback',
    },
    latencyMs: Math.round(50 + Math.random() * 200),
  };
}

export function shouldSimulate(roster?: GeneratedRoster): boolean {
  // Simulation is now opt-in only.  By default VirtualPC must use a real
  // model (local or cloud).  Set FORCE_SIMULATE=1 to restore simulated
  // responses for testing or for resource-constrained headless runs.
  if (process.env.FORCE_SIMULATE === '1') return true;
  if (process.env.SIMULATE_INFERENCE === '1') return true;
  return false;
}
