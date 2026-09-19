/**
 * Throughput Governor — tokens/sec admission control for local inference.
 *
 * The virtualpc roster was sized for a 2×3090 workstation. On a light
 * desktop (no GPU) the same set of concurrently active models starves:
 * every stream drops below a usable tokens/sec. This module scales the
 * setup to the host it actually runs on:
 *
 *   1. Probe the host (GPU count, cores, RAM) and classify a tier.
 *   2. Estimate each model's solo t/s from a memory-bandwidth prior,
 *      refined at runtime by measured t/s (EMA) from real completions.
 *   3. Compute a dynamic ComputePlan: how many model streams may run
 *      concurrently such that every stream keeps ≥ minTokensPerSec.
 *   4. Let the user bias that estimate in settings (light/balanced/heavy
 *      or a custom factor) — heavier accepts slower streams, lighter
 *      spares the machine.
 *   5. Admission decisions per request: run / downgrade to a smaller
 *      model / queue for a free slot / route to cloud.
 *
 * Agent diversity is preserved by NOT deactivating agents to save
 * compute: at least MIN_ACTIVE_AGENTS stay selectable and active; they
 * time-share the admitted streams instead. Which agents are active is a
 * user setting (validated here).
 *
 * Like gpu/availability.ts this file is the pure decision core plus a
 * thin stateful singleton; host probing I/O lives in probeHost().
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import logger from '../../utils/logger';

// ─── Host probe & tiers ─────────────────────────────────────────────────

export interface HostProbe {
  gpuCount: number;
  cpuCores: number;
  totalRamGB: number;
}

export type HostTier = 'gpu-workstation' | 'cpu-workstation' | 'light-desktop';

export function classifyTier(probe: HostProbe): HostTier {
  if (probe.gpuCount > 0) return 'gpu-workstation';
  if (probe.cpuCores >= 32 && probe.totalRamGB >= 64) return 'cpu-workstation';
  return 'light-desktop';
}

/** Model defaults by host tier (for ClaudeClaw and agent routing). */
export function tierDefaultModels(tier: HostTier): Record<string, string> {
  switch (tier) {
    case 'light-desktop':
      return { light: 'hermes3:3b', standard: 'hermes3:3b', coder: 'qwen2.5-coder:3b', judge: 'deepseek-r1:8b' };
    case 'cpu-workstation':
      return { light: 'hermes3:3b', standard: 'hermes3:8b', coder: 'qwen2.5-coder:7b', judge: 'deepseek-r1:8b' };
    default: // gpu-workstation
      return { light: 'hermes3:3b', standard: 'hermes3:8b', coder: 'qwen2.5-coder:32b', judge: 'deepseek-r1:8b' };
  }
}

/** Effective memory bandwidth prior (GB/s) — dominates local-inference t/s. */
const TIER_BANDWIDTH_GBPS: Record<HostTier, number> = {
  'gpu-workstation': 900, // RTX 3090 class
  'cpu-workstation': 150, // multi-channel server DDR
  'light-desktop': 30, // dual-channel desktop DDR4
};

/** Fraction of total RAM usable for model weights. */
const RAM_USABLE_FRACTION = 0.6;

/** Probe the actual host (the only I/O in this module). */
export function probeHost(): HostProbe {
  let gpuCount = 0;
  try {
    if (fs.existsSync('/proc/driver/nvidia/version')) {
      const out = execFileSync('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
        timeout: 5000,
        encoding: 'utf8',
      });
      gpuCount = out.split('\n').filter(l => l.trim()).length;
    }
  } catch {
    gpuCount = 0;
  }
  return {
    gpuCount,
    cpuCores: os.cpus().length,
    totalRamGB: Math.round(os.totalmem() / 1e9),
  };
}

// ─── Model sizing ───────────────────────────────────────────────────────

/**
 * Estimate a model's weight footprint (GB, ~Q4 quant) from its name.
 * Works for internal names ('qwen-27b') and Ollama tags ('hermes3:8b',
 * 'qwen2.5-coder:32b'). Unknown names assume 8B.
 */
export function estimateModelGB(model: string): number {
  const m = (model || '').toLowerCase();
  // Take the LAST '<number>b' fragment so version digits ('qwen2.5') don't match.
  const matches = m.match(/(\d+(?:\.\d+)?)b\b/g);
  const paramsB = matches ? parseFloat(matches[matches.length - 1]) : 8;
  return Math.max(1, paramsB * 0.65); // ~0.65 GB per B params at Q4 + overhead
}

/** Prior solo tokens/sec for a model on a tier (bandwidth / weight-bytes). */
export function priorSoloTps(model: string, tier: HostTier): number {
  return TIER_BANDWIDTH_GBPS[tier] / estimateModelGB(model);
}

/**
 * Predicted per-stream t/s when n streams share the host. Throughput
 * divides across streams with a contention penalty per extra stream.
 */
export function predictPerStreamTps(soloTps: number, streams: number): number {
  if (streams <= 1) return soloTps;
  return (soloTps / streams) * Math.pow(0.9, streams - 1);
}

// ─── Settings ───────────────────────────────────────────────────────────

export type UsageMode = 'light' | 'balanced' | 'heavy' | 'custom';

export interface InferenceSettings {
  /** Bias on the dynamic compute estimate. */
  usageMode: UsageMode;
  /** Only used when usageMode === 'custom'. Clamped to [0.25, 2]. */
  customFactor: number;
  /** Per-stream tokens/sec floor every admitted stream must keep. */
  minTokensPerSec: number;
  /** Selected active agents; [] = all agents active. Else ≥ MIN_ACTIVE_AGENTS. */
  activeAgents: string[];
  /** Hard override of concurrent streams (null = use dynamic estimate). */
  maxConcurrentOverride: number | null;
  /** Ollama keep-alive timeout: '2m' (light-desktop) or '30m' (workstation). */
  keepAlive: string;
}

export const MIN_ACTIVE_AGENTS = 5;
export const MAX_STREAMS_CAP = 8;

export const DEFAULT_SETTINGS: InferenceSettings = {
  usageMode: 'balanced',
  customFactor: 1.0,
  minTokensPerSec: 5,
  activeAgents: [],
  maxConcurrentOverride: null,
  keepAlive: '30m',
};

const USAGE_FACTORS: Record<Exclude<UsageMode, 'custom'>, number> = {
  light: 0.5,
  balanced: 1.0,
  heavy: 1.5,
};

export function usageFactor(s: InferenceSettings): number {
  const f = s.usageMode === 'custom' ? s.customFactor : USAGE_FACTORS[s.usageMode];
  return Math.min(2, Math.max(0.25, f || 1));
}

export interface RosterValidation {
  ok: boolean;
  errors: string[];
  /** Deduplicated, validated roster ([] = all active). */
  agents: string[];
}

/**
 * Validate an active-agent selection. Empty selection means "all agents
 * active" (backward compatible). A non-empty selection must contain at
 * least MIN_ACTIVE_AGENTS known agents — diversity floor.
 */
export function validateRoster(selected: string[], knownAgents: string[]): RosterValidation {
  const errors: string[] = [];
  const known = new Set(knownAgents.map(a => a.toLowerCase()));
  const seen = new Set<string>();
  const agents: string[] = [];
  for (const name of selected || []) {
    const key = (name || '').toLowerCase().trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (!known.has(key)) {
      errors.push(`unknown agent: ${name}`);
      continue;
    }
    agents.push(name.trim());
  }
  if (agents.length > 0 && agents.length < MIN_ACTIVE_AGENTS) {
    errors.push(
      `at least ${MIN_ACTIVE_AGENTS} active agents required for diversity (got ${agents.length})`
    );
  }
  return { ok: errors.length === 0, errors, agents };
}

// ─── Compute plan ───────────────────────────────────────────────────────

export interface ComputePlan {
  tier: HostTier;
  probe: HostProbe;
  /** Dynamic estimate before the user bias. */
  baseStreams: number;
  usageFactor: number;
  /** Streams actually admitted concurrently (after bias/override), ≥ 1. */
  maxConcurrentStreams: number;
  minTokensPerSec: number;
  /** Largest model (GB) a single stream may load on this plan. */
  maxModelGB: number;
  reason: string;
}

/**
 * Dynamic capacity estimate: the largest stream count where a reference
 * 8B model still meets the t/s floor, capped by usable RAM. The user's
 * usage factor then biases it heavier or lighter.
 */
export function estimateComputePlan(
  probe: HostProbe,
  settings: InferenceSettings,
  /** Measured solo t/s for the reference model, if calibrated. */
  referenceSoloTps?: number
): ComputePlan {
  const tier = classifyTier(probe);
  const refModel = '8b';
  const refGB = estimateModelGB(refModel);
  const solo = referenceSoloTps ?? priorSoloTps(refModel, tier);

  const usableRamGB = probe.totalRamGB * RAM_USABLE_FRACTION;
  const ramStreams = Math.max(1, Math.floor(usableRamGB / refGB));
  const gpuStreams = tier === 'gpu-workstation' ? probe.gpuCount * 2 : MAX_STREAMS_CAP;

  let tpsStreams = 1;
  for (let n = 1; n <= MAX_STREAMS_CAP; n++) {
    if (predictPerStreamTps(solo, n) >= settings.minTokensPerSec) tpsStreams = n;
    else break;
  }

  const baseStreams = Math.max(1, Math.min(tpsStreams, ramStreams, gpuStreams));
  const factor = usageFactor(settings);
  const biased = Math.round(baseStreams * factor);
  const maxConcurrentStreams =
    settings.maxConcurrentOverride != null
      ? Math.min(MAX_STREAMS_CAP, Math.max(1, settings.maxConcurrentOverride))
      : Math.min(MAX_STREAMS_CAP, Math.max(1, biased));

  return {
    tier,
    probe,
    baseStreams,
    usageFactor: factor,
    maxConcurrentStreams,
    minTokensPerSec: settings.minTokensPerSec,
    maxModelGB: usableRamGB / Math.max(1, maxConcurrentStreams),
    reason:
      `${tier}: solo≈${solo.toFixed(1)} t/s → ${tpsStreams} stream(s) at ≥${settings.minTokensPerSec} t/s, ` +
      `RAM caps ${ramStreams}, factor ${factor} → ${maxConcurrentStreams}`,
  };
}

// ─── Admission ──────────────────────────────────────────────────────────

export type AdmissionAction = 'run' | 'downgrade' | 'queue' | 'cloud';

export interface AdmissionDecision {
  action: AdmissionAction;
  /** Model to actually run ('run'/'downgrade'); the requested one otherwise. */
  model: string;
  predictedTps: number;
  reason: string;
}

/** Downgrade ladder toward smaller/faster local models. */
const DOWNGRADE_LADDER = ['qwen-14b', 'deepseek-r1-8b', 'qwen-7b', 'mistral-7b'];

/**
 * Decide whether a local model may start given the plan and how many
 * streams are already running. tpsOf() supplies the (calibrated) solo
 * t/s estimate per model.
 */
export function decideAdmission(
  model: string,
  activeStreams: number,
  plan: ComputePlan,
  tpsOf: (model: string) => number
): AdmissionDecision {
  const pick = (candidate: string, streams: number): number =>
    predictPerStreamTps(tpsOf(candidate), streams);

  // Model too large for this host's per-stream RAM budget → downgrade/cloud.
  if (estimateModelGB(model) > plan.maxModelGB) {
    const fit = DOWNGRADE_LADDER.find(
      m => estimateModelGB(m) <= plan.maxModelGB && pick(m, activeStreams + 1) >= plan.minTokensPerSec
    );
    if (fit) {
      return {
        action: 'downgrade',
        model: fit,
        predictedTps: pick(fit, activeStreams + 1),
        reason: `${model} (~${estimateModelGB(model).toFixed(0)}GB) exceeds ${plan.maxModelGB.toFixed(0)}GB/stream on ${plan.tier}`,
      };
    }
    return {
      action: 'cloud',
      model,
      predictedTps: 0,
      reason: `no local model fits ${plan.maxModelGB.toFixed(0)}GB/stream at ≥${plan.minTokensPerSec} t/s`,
    };
  }

  // All slots busy → wait for one.
  if (activeStreams >= plan.maxConcurrentStreams) {
    return {
      action: 'queue',
      model,
      predictedTps: pick(model, plan.maxConcurrentStreams),
      reason: `${activeStreams}/${plan.maxConcurrentStreams} streams busy`,
    };
  }

  const predicted = pick(model, activeStreams + 1);
  if (predicted >= plan.minTokensPerSec) {
    return { action: 'run', model, predictedTps: predicted, reason: 'within t/s budget' };
  }

  // Below the floor: try a smaller model that meets it.
  const smaller = DOWNGRADE_LADDER.find(
    m =>
      estimateModelGB(m) < estimateModelGB(model) &&
      estimateModelGB(m) <= plan.maxModelGB &&
      pick(m, activeStreams + 1) >= plan.minTokensPerSec
  );
  if (smaller) {
    return {
      action: 'downgrade',
      model: smaller,
      predictedTps: pick(smaller, activeStreams + 1),
      reason: `${model} predicted ${predicted.toFixed(1)} t/s < floor ${plan.minTokensPerSec}`,
    };
  }

  // Alone it's still too slow locally → cloud; otherwise wait for a solo slot.
  if (activeStreams > 0) {
    return {
      action: 'queue',
      model,
      predictedTps: predicted,
      reason: `below floor with ${activeStreams} concurrent stream(s); waiting for a freer slot`,
    };
  }
  return {
    action: 'cloud',
    model,
    predictedTps: predicted,
    reason: `even solo, ${model} predicts ${predicted.toFixed(1)} t/s < floor ${plan.minTokensPerSec} on ${plan.tier}`,
  };
}

// ─── Stateful governor (singleton) ──────────────────────────────────────

const SETTINGS_FILE = path.join(process.cwd(), 'data', 'inference-settings.json');
const CALIBRATION_FILE = path.join(process.cwd(), 'data', 'inference-calibration.json');
const EMA_ALPHA = 0.3;

export class ThroughputGovernor {
  private probe: HostProbe;
  private settings: InferenceSettings;
  private plan: ComputePlan;
  /** Measured solo-t/s EMA per model (overrides the bandwidth prior). */
  private calibration: Map<string, number> = new Map();
  private activeStreams = 0;
  private waiters: Array<() => void> = [];
  private settingsFile: string;
  private calibrationFile: string;

  constructor(probe?: HostProbe, settingsFile: string = SETTINGS_FILE, calibrationFile: string = CALIBRATION_FILE) {
    this.settingsFile = settingsFile;
    this.calibrationFile = calibrationFile;
    this.probe = probe ?? probeHost();
    this.settings = this.loadSettings();
    this.calibration = this.loadCalibration();
    this.plan = this.replan();
    logger.info(`✓ Throughput governor: ${this.plan.reason}`);
  }

  // ── settings ──
  private loadSettings(): InferenceSettings {
    try {
      const raw = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
      return { ...DEFAULT_SETTINGS, ...raw };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  private loadCalibration(): Map<string, number> {
    try {
      const raw = JSON.parse(fs.readFileSync(this.calibrationFile, 'utf8'));
      return new Map(Object.entries(raw as Record<string, number>));
    } catch {
      return new Map();
    }
  }

  private saveCalibration(): void {
    try {
      const obj = Object.fromEntries(this.calibration);
      fs.mkdirSync(path.dirname(this.calibrationFile), { recursive: true });
      fs.writeFileSync(this.calibrationFile, JSON.stringify(obj, null, 2));
    } catch (e: any) {
      logger.warn(`throughput-governor: could not persist calibration: ${e.message}`);
    }
  }

  getSettings(): InferenceSettings {
    return { ...this.settings, activeAgents: [...this.settings.activeAgents] };
  }

  /**
   * Apply (partial) settings from the options UI. Roster must be known
   * agents with the min-5 diversity floor; throws on validation errors.
   */
  updateSettings(patch: Partial<InferenceSettings>, knownAgents: string[]): InferenceSettings {
    const next: InferenceSettings = { ...this.settings, ...patch };
    if (patch.activeAgents !== undefined) {
      const v = validateRoster(patch.activeAgents, knownAgents);
      if (!v.ok) throw new Error(v.errors.join('; '));
      next.activeAgents = v.agents;
    }
    if (!['light', 'balanced', 'heavy', 'custom'].includes(next.usageMode)) {
      throw new Error(`invalid usageMode: ${next.usageMode}`);
    }
    if (!(next.minTokensPerSec > 0 && next.minTokensPerSec <= 200)) {
      throw new Error(`minTokensPerSec must be in (0, 200]`);
    }
    this.settings = next;
    this.plan = this.replan();
    try {
      fs.mkdirSync(path.dirname(this.settingsFile), { recursive: true });
      fs.writeFileSync(this.settingsFile, JSON.stringify(next, null, 2));
    } catch (e: any) {
      logger.warn(`throughput-governor: could not persist settings: ${e.message}`);
    }
    logger.info(`✓ Inference settings updated — ${this.plan.reason}`);
    return this.getSettings();
  }

  // ── plan ──
  private replan(): ComputePlan {
    const refTps = this.calibration.get('__reference__');
    return estimateComputePlan(this.probe, this.settings, refTps);
  }

  getPlan(): ComputePlan {
    return this.plan;
  }

  refreshProbe(probe?: HostProbe): ComputePlan {
    this.probe = probe ?? probeHost();
    this.plan = this.replan();
    return this.plan;
  }

  // ── roster ──
  /** Is this agent allowed to run? ([] selection = all active.) */
  isAgentActive(agent: string): boolean {
    if (this.settings.activeAgents.length === 0) return true;
    const a = (agent || '').toLowerCase();
    return this.settings.activeAgents.some(n => n.toLowerCase() === a);
  }

  // ── calibration ──
  soloTpsOf(model: string): number {
    return this.calibration.get(model) ?? priorSoloTps(model, this.plan.tier);
  }

  /**
   * Feed a measured completion back in. tps is the observed tokens/sec of
   * that stream; concurrent is how many streams ran when it started.
   */
  recordMeasurement(model: string, tps: number, concurrent: number): void {
    if (!(tps > 0)) return;
    const n = Math.max(1, concurrent);
    const soloEst = (tps * n) / Math.pow(0.9, n - 1);
    const prev = this.calibration.get(model);
    const ema = prev === undefined ? soloEst : EMA_ALPHA * soloEst + (1 - EMA_ALPHA) * prev;
    this.calibration.set(model, ema);
    // The reference calibration (any ~8B-class model) sharpens the plan.
    if (Math.abs(estimateModelGB(model) - estimateModelGB('8b')) < 2) {
      const prevRef = this.calibration.get('__reference__');
      this.calibration.set(
        '__reference__',
        prevRef === undefined ? soloEst : EMA_ALPHA * soloEst + (1 - EMA_ALPHA) * prevRef
      );
      this.plan = this.replan();
    }
    this.saveCalibration();
  }

  getCalibration(): Record<string, number> {
    return Object.fromEntries(
      Array.from(this.calibration.entries()).map(([m, t]) => [m, Math.round(t * 10) / 10])
    );
  }

  // ── admission / slot lifecycle ──
  decide(model: string): AdmissionDecision {
    return decideAdmission(model, this.activeStreams, this.plan, m => this.soloTpsOf(m));
  }

  getActiveStreams(): number {
    return this.activeStreams;
  }

  getQueueDepth(): number {
    return this.waiters.length;
  }

  /**
   * Acquire a stream slot, waiting until one frees up (FIFO) or timeout.
   * Returns a release function plus the concurrency at start (for
   * recordMeasurement).
   */
  async acquireSlot(timeoutMs = 300_000): Promise<{ release: () => void; concurrent: number }> {
    if (this.activeStreams < this.plan.maxConcurrentStreams) {
      this.activeStreams++;
      return { release: this.makeRelease(), concurrent: this.activeStreams };
    }
    await new Promise<void>((resolve, reject) => {
      const waiter = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(() => {
        const i = this.waiters.indexOf(waiter);
        if (i >= 0) this.waiters.splice(i, 1);
        reject(new Error(`throughput-governor: timed out waiting for a stream slot (${timeoutMs}ms)`));
      }, timeoutMs);
      this.waiters.push(waiter);
    });
    this.activeStreams++;
    return { release: this.makeRelease(), concurrent: this.activeStreams };
  }

  private makeRelease(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeStreams = Math.max(0, this.activeStreams - 1);
      const next = this.waiters.shift();
      if (next) next();
    };
  }
}

let singleton: ThroughputGovernor | null = null;

/** Shared governor — one t/s budget for every local-inference consumer. */
export function getGovernor(): ThroughputGovernor {
  if (!singleton) singleton = new ThroughputGovernor();
  return singleton;
}

/** Test hook. */
export function resetGovernor(): void {
  singleton = null;
}

export default ThroughputGovernor;
