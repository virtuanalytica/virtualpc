import * as os from 'os';
import * as path from 'path';
import {
  classifyTier,
  estimateModelGB,
  predictPerStreamTps,
  usageFactor,
  validateRoster,
  estimateComputePlan,
  decideAdmission,
  ThroughputGovernor,
  DEFAULT_SETTINGS,
  MIN_ACTIVE_AGENTS,
  InferenceSettings,
  HostProbe,
} from '../../src/integrations/local-inference/throughput-governor';

/**
 * Unit tests for the throughput governor — the t/s admission control that
 * scales the virtualpc model roster down to light (no-GPU) hosts: dynamic
 * compute estimation, user bias (lighter/heavier), min-5 agent diversity,
 * and per-request run/downgrade/queue/cloud decisions.
 */

const LIGHT_DESKTOP: HostProbe = { gpuCount: 0, cpuCores: 8, totalRamGB: 16 };
const CPU_WORKSTATION: HostProbe = { gpuCount: 0, cpuCores: 96, totalRamGB: 640 };
const GPU_WORKSTATION: HostProbe = { gpuCount: 2, cpuCores: 96, totalRamGB: 640 };

const settings = (patch: Partial<InferenceSettings> = {}): InferenceSettings => ({
  ...DEFAULT_SETTINGS,
  ...patch,
});

describe('host tier classification', () => {
  it('classifies the three tiers', () => {
    expect(classifyTier(GPU_WORKSTATION)).toBe('gpu-workstation');
    expect(classifyTier(CPU_WORKSTATION)).toBe('cpu-workstation');
    expect(classifyTier(LIGHT_DESKTOP)).toBe('light-desktop');
  });
});

describe('model size estimation', () => {
  it('parses parameter counts from internal names and Ollama tags', () => {
    expect(estimateModelGB('qwen-27b')).toBeCloseTo(27 * 0.65, 1);
    expect(estimateModelGB('hermes3:8b')).toBeCloseTo(8 * 0.65, 1);
    expect(estimateModelGB('llama3.3:70b')).toBeCloseTo(70 * 0.65, 1);
  });
  it('does not confuse version digits with parameter counts', () => {
    // 'qwen2.5-coder:32b' must read 32B, not 2.5B
    expect(estimateModelGB('qwen2.5-coder:32b')).toBeCloseTo(32 * 0.65, 1);
  });
  it('assumes 8B for unknown names', () => {
    expect(estimateModelGB('devstral')).toBeCloseTo(8 * 0.65, 1);
  });
});

describe('per-stream throughput prediction', () => {
  it('returns solo t/s for a single stream', () => {
    expect(predictPerStreamTps(20, 1)).toBe(20);
  });
  it('divides with a contention penalty for extra streams', () => {
    expect(predictPerStreamTps(20, 2)).toBeCloseTo(9, 0);
    expect(predictPerStreamTps(20, 2)).toBeLessThan(10);
  });
});

describe('usage factor (settings bias)', () => {
  it('maps presets', () => {
    expect(usageFactor(settings({ usageMode: 'light' }))).toBe(0.5);
    expect(usageFactor(settings({ usageMode: 'balanced' }))).toBe(1.0);
    expect(usageFactor(settings({ usageMode: 'heavy' }))).toBe(1.5);
  });
  it('clamps custom factors to [0.25, 2]', () => {
    expect(usageFactor(settings({ usageMode: 'custom', customFactor: 9 }))).toBe(2);
    expect(usageFactor(settings({ usageMode: 'custom', customFactor: 0.01 }))).toBe(0.25);
    expect(usageFactor(settings({ usageMode: 'custom', customFactor: 0.8 }))).toBe(0.8);
  });
});

describe('active-agent roster validation (diversity floor)', () => {
  const known = ['Fill', 'Kai', 'Zip', 'Mira', 'Luna', 'Atlas', 'Pixel'];
  it('accepts an empty selection (= all agents active)', () => {
    const v = validateRoster([], known);
    expect(v.ok).toBe(true);
    expect(v.agents).toEqual([]);
  });
  it(`rejects fewer than ${MIN_ACTIVE_AGENTS} selected agents`, () => {
    const v = validateRoster(['Fill', 'Kai', 'Zip'], known);
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain('at least 5');
  });
  it('accepts 5+ known agents and deduplicates', () => {
    const v = validateRoster(['Fill', 'fill', 'Kai', 'Zip', 'Mira', 'Luna'], known);
    expect(v.ok).toBe(true);
    expect(v.agents).toEqual(['Fill', 'Kai', 'Zip', 'Mira', 'Luna']);
  });
  it('rejects unknown agent names', () => {
    const v = validateRoster(['Fill', 'Kai', 'Zip', 'Mira', 'Nobody'], known);
    expect(v.ok).toBe(false);
    expect(v.errors.join()).toContain('unknown agent: Nobody');
  });
});

describe('dynamic compute plan', () => {
  it('a light desktop gets a single stream at the default floor', () => {
    const plan = estimateComputePlan(LIGHT_DESKTOP, settings());
    expect(plan.tier).toBe('light-desktop');
    expect(plan.maxConcurrentStreams).toBe(1);
  });
  it('heavy bias buys the light desktop an extra stream', () => {
    const plan = estimateComputePlan(LIGHT_DESKTOP, settings({ usageMode: 'heavy' }));
    expect(plan.maxConcurrentStreams).toBe(2);
  });
  it('a CPU workstation sustains multiple streams', () => {
    const plan = estimateComputePlan(CPU_WORKSTATION, settings());
    expect(plan.tier).toBe('cpu-workstation');
    expect(plan.maxConcurrentStreams).toBeGreaterThanOrEqual(3);
  });
  it('a GPU workstation is capped by GPU count', () => {
    const plan = estimateComputePlan(GPU_WORKSTATION, settings());
    expect(plan.maxConcurrentStreams).toBe(4); // 2 GPUs × 2
  });
  it('light bias halves the workstation estimate', () => {
    const balanced = estimateComputePlan(CPU_WORKSTATION, settings());
    const light = estimateComputePlan(CPU_WORKSTATION, settings({ usageMode: 'light' }));
    expect(light.maxConcurrentStreams).toBeLessThan(balanced.maxConcurrentStreams);
  });
  it('an explicit override wins over the dynamic estimate', () => {
    const plan = estimateComputePlan(CPU_WORKSTATION, settings({ maxConcurrentOverride: 2 }));
    expect(plan.maxConcurrentStreams).toBe(2);
  });
  it('a measured (calibrated) reference t/s sharpens the estimate', () => {
    // Enough RAM that throughput (not memory) is the binding constraint.
    const desktop32: HostProbe = { gpuCount: 0, cpuCores: 8, totalRamGB: 32 };
    const prior = estimateComputePlan(desktop32, settings());
    const calibrated = estimateComputePlan(desktop32, settings(), 40);
    expect(calibrated.baseStreams).toBeGreaterThan(prior.baseStreams);
  });
});

describe('admission decisions', () => {
  const tpsOf = (plan: ReturnType<typeof estimateComputePlan>) => (m: string) =>
    // bandwidth prior, same formula as the governor's fallback
    (plan.tier === 'light-desktop' ? 30 : plan.tier === 'cpu-workstation' ? 150 : 900) /
    estimateModelGB(m);

  it('downgrades an oversized model on a light desktop', () => {
    const plan = estimateComputePlan(LIGHT_DESKTOP, settings());
    const d = decideAdmission('qwen-27b', 0, plan, tpsOf(plan));
    expect(d.action).toBe('downgrade');
    expect(estimateModelGB(d.model)).toBeLessThanOrEqual(plan.maxModelGB);
  });
  it('queues when all stream slots are busy', () => {
    const plan = estimateComputePlan(CPU_WORKSTATION, settings());
    const d = decideAdmission('qwen-7b', plan.maxConcurrentStreams, plan, tpsOf(plan));
    expect(d.action).toBe('queue');
  });
  it('runs a small model that meets the floor', () => {
    const plan = estimateComputePlan(CPU_WORKSTATION, settings());
    const d = decideAdmission('qwen-7b', 0, plan, tpsOf(plan));
    expect(d.action).toBe('run');
    expect(d.predictedTps).toBeGreaterThanOrEqual(plan.minTokensPerSec);
  });
  it('routes to cloud when even a solo local stream stays below the floor', () => {
    const plan = estimateComputePlan(LIGHT_DESKTOP, settings({ minTokensPerSec: 50 }));
    const d = decideAdmission('qwen-7b', 0, plan, tpsOf(plan));
    expect(d.action).toBe('cloud');
  });
});

describe('ThroughputGovernor (stateful)', () => {
  const tmpSettings = () =>
    path.join(os.tmpdir(), `inference-settings-test-${Date.now()}-${Math.random()}.json`);

  const tmpCalibration = () =>
    path.join(os.tmpdir(), `inference-calibration-test-${Date.now()}-${Math.random()}.json`);

  it('enforces the min-5 roster on updateSettings', () => {
    const g = new ThroughputGovernor(LIGHT_DESKTOP, tmpSettings(), tmpCalibration());
    expect(() =>
      g.updateSettings({ activeAgents: ['Fill', 'Kai'] }, ['Fill', 'Kai', 'Zip', 'Mira', 'Luna'])
    ).toThrow(/at least 5/);
    // empty selection = everyone active
    expect(g.isAgentActive('Zip')).toBe(true);
  });

  it('applies a valid roster and gates agents', () => {
    const g = new ThroughputGovernor(LIGHT_DESKTOP, tmpSettings(), tmpCalibration());
    const known = ['Fill', 'Kai', 'Zip', 'Mira', 'Luna', 'Atlas'];
    g.updateSettings({ activeAgents: ['Fill', 'Kai', 'Zip', 'Mira', 'Luna'] }, known);
    expect(g.isAgentActive('Fill')).toBe(true);
    expect(g.isAgentActive('Atlas')).toBe(false);
  });

  it('replans when the usage mode changes', () => {
    const g = new ThroughputGovernor(CPU_WORKSTATION, tmpSettings(), tmpCalibration());
    const before = g.getPlan().maxConcurrentStreams;
    g.updateSettings({ usageMode: 'light' }, []);
    expect(g.getPlan().maxConcurrentStreams).toBeLessThan(before);
  });

  it('learns solo t/s from measurements (EMA calibration)', () => {
    const g = new ThroughputGovernor(LIGHT_DESKTOP, tmpSettings(), tmpCalibration());
    g.recordMeasurement('hermes3:8b', 12, 1);
    expect(g.soloTpsOf('hermes3:8b')).toBeCloseTo(12, 0);
    // a second, slower sample moves the EMA down but not all the way
    g.recordMeasurement('hermes3:8b', 6, 1);
    expect(g.soloTpsOf('hermes3:8b')).toBeLessThan(12);
    expect(g.soloTpsOf('hermes3:8b')).toBeGreaterThan(6);
  });

  it('serializes streams beyond capacity and admits FIFO on release', async () => {
    const g = new ThroughputGovernor(LIGHT_DESKTOP, tmpSettings(), tmpCalibration()); // capacity 1
    const first = await g.acquireSlot(1000);
    expect(g.getActiveStreams()).toBe(1);

    let secondAcquired = false;
    const second = g.acquireSlot(1000).then(s => {
      secondAcquired = true;
      return s;
    });
    await new Promise(r => setTimeout(r, 20));
    expect(secondAcquired).toBe(false);
    expect(g.getQueueDepth()).toBe(1);

    first.release();
    const s2 = await second;
    expect(secondAcquired).toBe(true);
    expect(g.getActiveStreams()).toBe(1);
    s2.release();
    expect(g.getActiveStreams()).toBe(0);
  });

  it('times out a waiter that never gets a slot', async () => {
    const g = new ThroughputGovernor(LIGHT_DESKTOP, tmpSettings(), tmpCalibration());
    const held = await g.acquireSlot(1000);
    await expect(g.acquireSlot(50)).rejects.toThrow(/timed out/);
    held.release();
  });
});
