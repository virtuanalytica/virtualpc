/**
 * Model Scheduler — shared time-slot reservations for loaded LLMs.
 *
 * Not all agents work at the same time, and many can share the same small
 * local model. The scheduler reserves a model for an agent while a task runs,
 * releases it afterwards, and allows extending a reservation for long tasks.
 */

import logger from './utils/logger';

export interface LoadedModel { id: string; object?: string; }
export interface Reservation {
  modelId: string;
  agent: string;
  taskType: string;
  startedAt: number;
  estimatedMs: number;
  extendedMs: number;
  expiresAt: number;
}

const DEFAULT_ESTIMATES: Record<string, number> = {
  cheap: 10_000,
  chat: 30_000,
  code: 60_000,
  reasoning: 90_000,
  arbitration: 90_000,
  deep: 120_000,
  concept: 60_000,
  embedding: 5_000,
  design: 60_000,
  docs: 120_000,
};

const GRACE_MS = 5_000;

const reservations = new Map<string, Reservation>();

function now() { return Date.now(); }

function estimateMs(taskType?: string): number {
  return DEFAULT_ESTIMATES[taskType || 'chat'] ?? DEFAULT_ESTIMATES.chat;
}

function cleanExpired() {
  const t = now();
  for (const [modelId, r] of reservations) {
    if (t > r.expiresAt + GRACE_MS) {
      logger.warn(`model-scheduler: reservation for ${r.agent} on ${modelId} expired; releasing`);
      reservations.delete(modelId);
    }
  }
}

export function getSchedule(): {
  reservations: Reservation[];
  idleModels: string[];
  busyModels: string[];
  timestamp: string;
} {
  cleanExpired();
  return {
    reservations: Array.from(reservations.values()),
    idleModels: [],
    busyModels: Array.from(reservations.keys()),
    timestamp: new Date().toISOString(),
  };
}

export function reserveModel(
  agent: string,
  taskType: string | undefined,
  preferredModels: string[],
  loadedModels: LoadedModel[],
  requestedMs?: number,
): string | null {
  cleanExpired();

  if (loadedModels.length === 0) return null;
  const loaded = loadedModels.map(m => m.id);
  const busyIds = new Set(reservations.keys());

  // 1. Prefer a loaded model from the agent's preferred roster that is idle.
  for (const id of preferredModels) {
    const match = loaded.find(lm => lm.toLowerCase().includes(id.toLowerCase()));
    if (match && !busyIds.has(match)) {
      return allocate(match, agent, taskType, requestedMs);
    }
  }

  // 2. Any idle loaded model.
  for (const lm of loaded) {
    if (!busyIds.has(lm)) {
      return allocate(lm, agent, taskType, requestedMs);
    }
  }

  // 3. Everything is busy. Pick the reservation that expires soonest and reuse it
  //    (agents share models). The caller can decide to wait or proceed.
  let soonest: Reservation | null = null;
  for (const r of reservations.values()) {
    if (!soonest || r.expiresAt < soonest.expiresAt) soonest = r;
  }
  if (soonest) {
    logger.info(`model-scheduler: all models busy; ${agent} sharing ${soonest.modelId} (reserved by ${soonest.agent})`);
    return allocate(soonest.modelId, agent, taskType, requestedMs);
  }

  return null;
}

function allocate(modelId: string, agent: string, taskType: string | undefined, requestedMs?: number): string {
  const duration = requestedMs ?? estimateMs(taskType);
  const started = now();
  const reservation: Reservation = {
    modelId,
    agent,
    taskType: taskType || 'chat',
    startedAt: started,
    estimatedMs: duration,
    extendedMs: 0,
    expiresAt: started + duration,
  };
  reservations.set(modelId, reservation);
  logger.info(`model-scheduler: reserved ${modelId} for ${agent}/${reservation.taskType} (~${Math.round(duration / 1000)}s)`);
  return modelId;
}

export function extendReservation(modelId: string, extraMs: number): boolean {
  cleanExpired();
  const r = reservations.get(modelId);
  if (!r) return false;
  r.extendedMs += extraMs;
  r.expiresAt = r.startedAt + r.estimatedMs + r.extendedMs;
  logger.info(`model-scheduler: extended ${modelId} for ${r.agent} by ${Math.round(extraMs / 1000)}s`);
  return true;
}

export function releaseReservation(modelId: string) {
  const r = reservations.get(modelId);
  if (r) {
    logger.info(`model-scheduler: released ${modelId} from ${r.agent}`);
    reservations.delete(modelId);
  }
}

export async function waitForIdleModel(
  agent: string,
  taskType: string | undefined,
  preferredModels: string[],
  getLoaded: () => Promise<LoadedModel[]>,
  timeoutMs = 30_000,
): Promise<string | null> {
  const deadline = now() + timeoutMs;
  const poll = 500;
  while (now() < deadline) {
    const model = reserveModel(agent, taskType, preferredModels, await getLoaded());
    if (model) return model;
    await new Promise(r => setTimeout(r, poll));
  }
  return null;
}
