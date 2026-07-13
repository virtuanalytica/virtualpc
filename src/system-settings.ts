import express from 'express';
import * as fs from 'fs';
import * as path from 'path';
import logger from './utils/logger';

const SETTINGS_PATH = path.join(__dirname, '..', 'data', 'settings.json');

export interface ResourceControlsSettings {
  enabled: boolean;
  cpuTemperatureLimitC: number;
  gpuTemperatureLimitC: number;
  totalThreadPct: number;
  perAgentThreadPct: number;
  ramUtilizationPct: number;
  gpuClockPctWhenHot: number;
  gpuMemoryPctPerSystem: number;
  targets: string[];
}

export interface SystemSettings {
  theme: 'dark' | 'light' | 'auto';
  refreshRate: string;
  notifications: boolean;
  autoBackup: boolean;
  resourceControls: ResourceControlsSettings;
}

export const DEFAULT_SETTINGS: SystemSettings = {
  theme: 'dark',
  refreshRate: '5000',
  notifications: true,
  autoBackup: true,
  resourceControls: {
    enabled: true,
    cpuTemperatureLimitC: 60,
    gpuTemperatureLimitC: 60,
    totalThreadPct: 25,
    perAgentThreadPct: 25,
    ramUtilizationPct: 75,
    gpuClockPctWhenHot: 50,
    gpuMemoryPctPerSystem: 50,
    targets: ['virtualpc', 'alexander'],
  },
};

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function sanitizeSettings(input: Partial<SystemSettings> | any): SystemSettings {
  const resourceControls = input?.resourceControls || {};
  const targets = Array.isArray(resourceControls.targets)
    ? resourceControls.targets.map((t: unknown) => String(t).trim().toLowerCase()).filter(Boolean)
    : DEFAULT_SETTINGS.resourceControls.targets;

  return {
    theme: ['dark', 'light', 'auto'].includes(input?.theme) ? input.theme : DEFAULT_SETTINGS.theme,
    refreshRate: String(clampNumber(input?.refreshRate, Number(DEFAULT_SETTINGS.refreshRate), 1000, 60000)),
    notifications: typeof input?.notifications === 'boolean' ? input.notifications : DEFAULT_SETTINGS.notifications,
    autoBackup: typeof input?.autoBackup === 'boolean' ? input.autoBackup : DEFAULT_SETTINGS.autoBackup,
    resourceControls: {
      enabled: typeof resourceControls.enabled === 'boolean' ? resourceControls.enabled : DEFAULT_SETTINGS.resourceControls.enabled,
      cpuTemperatureLimitC: clampNumber(resourceControls.cpuTemperatureLimitC, DEFAULT_SETTINGS.resourceControls.cpuTemperatureLimitC, 30, 100),
      gpuTemperatureLimitC: clampNumber(resourceControls.gpuTemperatureLimitC, DEFAULT_SETTINGS.resourceControls.gpuTemperatureLimitC, 30, 100),
      totalThreadPct: clampNumber(resourceControls.totalThreadPct, DEFAULT_SETTINGS.resourceControls.totalThreadPct, 1, 100),
      perAgentThreadPct: clampNumber(resourceControls.perAgentThreadPct, DEFAULT_SETTINGS.resourceControls.perAgentThreadPct, 1, 100),
      ramUtilizationPct: clampNumber(resourceControls.ramUtilizationPct, DEFAULT_SETTINGS.resourceControls.ramUtilizationPct, 1, 100),
      gpuClockPctWhenHot: clampNumber(resourceControls.gpuClockPctWhenHot, DEFAULT_SETTINGS.resourceControls.gpuClockPctWhenHot, 1, 100),
      gpuMemoryPctPerSystem: clampNumber(resourceControls.gpuMemoryPctPerSystem, DEFAULT_SETTINGS.resourceControls.gpuMemoryPctPerSystem, 1, 100),
      targets: targets.length ? Array.from(new Set(targets)) : DEFAULT_SETTINGS.resourceControls.targets,
    },
  };
}

export function loadSystemSettings(): SystemSettings {
  try {
    const raw = fs.readFileSync(SETTINGS_PATH, 'utf8');
    return sanitizeSettings(JSON.parse(raw));
  } catch (e: any) {
    if (e.code !== 'ENOENT') logger.warn(`Settings load failed, using defaults: ${e.message}`);
    return DEFAULT_SETTINGS;
  }
}

export function saveSystemSettings(settings: SystemSettings): SystemSettings {
  const clean = sanitizeSettings(settings);
  fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(SETTINGS_PATH, `${JSON.stringify(clean, null, 2)}\n`);
  return clean;
}

export function registerSystemSettingsRoutes(app: express.Express) {
  app.get('/api/settings', (_req, res) => {
    res.json({ success: true, settings: loadSystemSettings(), path: SETTINGS_PATH });
  });

  app.put('/api/settings', (req, res) => {
    try {
      const settings = saveSystemSettings(req.body || {});
      res.json({ success: true, settings, path: SETTINGS_PATH });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  app.post('/api/settings/reset', (_req, res) => {
    try {
      const settings = saveSystemSettings(DEFAULT_SETTINGS);
      res.json({ success: true, settings, path: SETTINGS_PATH });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
}
