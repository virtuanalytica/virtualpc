import React, { useEffect, useState } from 'react';
import './Settings.css';

type ResourceControls = {
  enabled: boolean;
  cpuTemperatureLimitC: number;
  gpuTemperatureLimitC: number;
  totalThreadPct: number;
  perAgentThreadPct: number;
  ramUtilizationPct: number;
  gpuClockPctWhenHot: number;
  gpuMemoryPctPerSystem: number;
  targets: string[];
};

type SettingsState = {
  theme: string;
  refreshRate: string;
  notifications: boolean;
  autoBackup: boolean;
  resourceControls: ResourceControls;
};

const defaultSettings: SettingsState = {
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

export default function Settings() {
  const [settings, setSettings] = useState<SettingsState>(defaultSettings);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data?.success && data.settings) {
          setSettings((current) => ({
            ...current,
            ...data.settings,
            resourceControls: { ...current.resourceControls, ...data.settings.resourceControls },
          }));
        }
      })
      .catch(() => setStatus('Settings API unavailable; local defaults are shown.'));
  }, []);

  const handleChange = (field: 'theme' | 'refreshRate' | 'notifications' | 'autoBackup', value: string | boolean) => {
    setSettings((current) => ({ ...current, [field]: value }));
  };

  const handleResourceChange = (field: keyof ResourceControls, value: number | boolean | string[]) => {
    setSettings((current) => ({
      ...current,
      resourceControls: { ...current.resourceControls, [field]: value },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setStatus('');
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'save failed');
      setSettings(data.settings);
      setStatus('Settings saved.');
    } catch (e: any) {
      setStatus(e.message || 'Settings save failed.');
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = async () => {
    if (!confirm('Reset all settings to defaults?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/settings/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'reset failed');
      setSettings(data.settings);
      setStatus('Settings reset.');
    } catch (e: any) {
      setStatus(e.message || 'Settings reset failed.');
    } finally {
      setSaving(false);
    }
  };

  const clearLocalData = () => {
    if (!confirm('Clear all local data? This cannot be undone.')) return;
    localStorage.clear();
    alert('Local data cleared');
  };

  return (
    <div className="settings-container">
      <h1>Settings</h1>

      <div className="settings-sections">
        <section className="settings-section">
          <h2>Display</h2>
          <div className="setting-group">
            <label>Theme</label>
            <select value={settings.theme} onChange={(e) => handleChange('theme', e.target.value)}>
              <option value="dark">Dark (Default)</option>
              <option value="light">Light</option>
              <option value="auto">Auto</option>
            </select>
            <p className="setting-hint">Choose your preferred color scheme</p>
          </div>
        </section>

        <section className="settings-section">
          <h2>Updates and Refresh</h2>
          <div className="setting-group">
            <label>Refresh Rate (ms)</label>
            <input
              type="number"
              value={settings.refreshRate}
              onChange={(e) => handleChange('refreshRate', e.target.value)}
              min="1000"
              max="60000"
              step="1000"
            />
            <p className="setting-hint">How often to fetch updated data</p>
          </div>

          <div className="setting-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.autoBackup}
                onChange={(e) => handleChange('autoBackup', e.target.checked)}
              />
              <span>Auto-backup memory data</span>
            </label>
            <p className="setting-hint">Automatically back up local memory data periodically</p>
          </div>
        </section>

        <section className="settings-section">
          <h2>Notifications</h2>
          <div className="setting-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.notifications}
                onChange={(e) => handleChange('notifications', e.target.checked)}
              />
              <span>Enable notifications</span>
            </label>
            <p className="setting-hint">Get alerts for critical issues and blockers</p>
          </div>
        </section>

        <section className="settings-section">
          <h2>Resource Controls</h2>
          <div className="setting-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={settings.resourceControls.enabled}
                onChange={(e) => handleResourceChange('enabled', e.target.checked)}
              />
              <span>Enable resource guard</span>
            </label>
          </div>

          <div className="settings-grid">
            <div className="setting-group">
              <label>CPU temperature limit (C)</label>
              <input
                type="number"
                value={settings.resourceControls.cpuTemperatureLimitC}
                onChange={(e) => handleResourceChange('cpuTemperatureLimitC', Number(e.target.value))}
                min="30"
                max="100"
              />
            </div>
            <div className="setting-group">
              <label>GPU temperature limit (C)</label>
              <input
                type="number"
                value={settings.resourceControls.gpuTemperatureLimitC}
                onChange={(e) => handleResourceChange('gpuTemperatureLimitC', Number(e.target.value))}
                min="30"
                max="100"
              />
            </div>
            <div className="setting-group">
              <label>Total system threads (%)</label>
              <input
                type="number"
                value={settings.resourceControls.totalThreadPct}
                onChange={(e) => handleResourceChange('totalThreadPct', Number(e.target.value))}
                min="1"
                max="100"
              />
            </div>
            <div className="setting-group">
              <label>Threads per agent (%)</label>
              <input
                type="number"
                value={settings.resourceControls.perAgentThreadPct}
                onChange={(e) => handleResourceChange('perAgentThreadPct', Number(e.target.value))}
                min="1"
                max="100"
              />
            </div>
            <div className="setting-group">
              <label>RAM utilization (%)</label>
              <input
                type="number"
                value={settings.resourceControls.ramUtilizationPct}
                onChange={(e) => handleResourceChange('ramUtilizationPct', Number(e.target.value))}
                min="1"
                max="100"
              />
            </div>
            <div className="setting-group">
              <label>GPU MHz limit when hot (%)</label>
              <input
                type="number"
                value={settings.resourceControls.gpuClockPctWhenHot}
                onChange={(e) => handleResourceChange('gpuClockPctWhenHot', Number(e.target.value))}
                min="1"
                max="100"
              />
            </div>
            <div className="setting-group">
              <label>GPU memory per system (%)</label>
              <input
                type="number"
                value={settings.resourceControls.gpuMemoryPctPerSystem}
                onChange={(e) => handleResourceChange('gpuMemoryPctPerSystem', Number(e.target.value))}
                min="1"
                max="100"
              />
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h2>System Information</h2>
          <div className="info-group">
            <div className="info-item">
              <span className="info-label">Version:</span>
              <span className="info-value">VirtualPC v1.0</span>
            </div>
            <div className="info-item">
              <span className="info-label">API Endpoint:</span>
              <span className="info-value">localhost:3100</span>
            </div>
            <div className="info-item">
              <span className="info-label">Neo4j Memory:</span>
              <span className="info-value">Configured</span>
            </div>
            <div className="info-item">
              <span className="info-label">Kafka Broker:</span>
              <span className="info-value">Optional</span>
            </div>
          </div>
        </section>

        <section className="settings-section danger-zone">
          <h2>Danger Zone</h2>
          <div className="danger-actions">
            <button className="btn-danger" onClick={clearLocalData}>
              Clear Local Data
            </button>
            <button className="btn-danger" onClick={resetSettings}>
              Reset Settings
            </button>
          </div>
        </section>
      </div>

      <div className="settings-footer">
        {status && <span className="settings-status">{status}</span>}
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          Save Settings
        </button>
      </div>
    </div>
  );
}
