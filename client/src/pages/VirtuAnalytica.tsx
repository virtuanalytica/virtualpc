import React, { useEffect, useState } from 'react';
import './VirtuAnalytica.css';

interface Entitlement {
  enabled: boolean;
  testMode: boolean;
  tokensRemaining: number;
  tokensPurchased: number;
  tokensConsumed: number;
  paymentStatus: 'none' | 'pending' | 'paid' | 'test';
  selectedRoles: string[];
  selectedCapabilities: string[];
}

interface Role {
  id: string;
  name: string;
  category: string;
  shortDescription: string;
  priceEur: number;
}

interface Capability {
  id: string;
  name: string;
  category: string;
  shortDescription: string;
  priceEur: number;
}

export default function VirtuAnalytica() {
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [capabilities, setCapabilities] = useState<Capability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<any>(null);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [entRes, rolesRes, capsRes] = await Promise.all([
        fetch('/api/virtuanalytica/entitlement'),
        fetch('/api/virtuanalytica/catalog/roles'),
        fetch('/api/virtuanalytica/catalog/capabilities'),
      ]);
      const entData = await entRes.json();
      const rolesData = await rolesRes.json();
      const capsData = await capsRes.json();
      if (entData.success) setEntitlement(entData.entitlement);
      if (rolesData.success) setRoles(rolesData.roles);
      if (capsData.success) setCapabilities(capsData.capabilities);
    } catch (err: any) {
      setError(err.message || 'Failed to load VirtuAnalytica');
    } finally {
      setLoading(false);
    }
  };

  const importDemo = async () => {
    setImportResult(null);
    try {
      const res = await fetch('/api/virtuanalytica/catalog/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demo: true }),
      });
      const data = await res.json();
      if (data.success) setImportResult(data);
      else setError(data.error || 'Import failed');
    } catch (err: any) {
      setError(err.message || 'Import failed');
    }
  };

  const statusLabel = () => {
    if (!entitlement) return 'Loading…';
    if (entitlement.testMode) return 'Test mode';
    if (entitlement.enabled) return 'Active';
    return 'Disabled';
  };

  const statusClass = () => {
    if (!entitlement) return 'disabled';
    if (entitlement.testMode) return 'test';
    if (entitlement.enabled) return 'active';
    return 'disabled';
  };

  if (loading) return <div className="va-page"><p>Loading VirtuAnalytica…</p></div>;

  return (
    <div className="va-page">
      <h1>🛰️ VirtuAnalytica</h1>
      <p className="va-subtitle">Data-roles command centre — catalog, connections, tools, and RACI-ready capabilities.</p>

      <div className="va-status-bar">
        <span className={`va-status-badge ${statusClass()}`}>{statusLabel()}</span>
        {entitlement && (
          <span className="va-token-pill">
            Tokens: {entitlement.tokensRemaining.toLocaleString()}
            {entitlement.testMode && ' (test)'}
          </span>
        )}
      </div>

      {!entitlement?.enabled && (
        <div className="va-card va-locked">
          <h3>VirtuAnalytica is locked</h3>
          <p>Enable test mode or purchase an activation in Settings to unlock catalog import, connections, and tools.</p>
        </div>
      )}

      {entitlement?.enabled && (
        <>
          <div className="va-actions">
            <button className="btn-primary" onClick={importDemo}>Import demo catalog</button>
            <button className="btn-primary" onClick={loadAll}>Refresh</button>
          </div>
          {importResult && (
            <div className="va-card va-success">
              <h4>Demo catalog imported</h4>
              <pre>{JSON.stringify(importResult, null, 2)}</pre>
            </div>
          )}
        </>
      )}

      {error && <div className="va-error">{error}</div>}

      <div className="va-grid">
        <div className="va-card">
          <h3>Pretrained roles</h3>
          <p className="va-hint">{roles.length} roles available. Selected: {entitlement?.selectedRoles.length || 0}</p>
          <ul className="va-list">
            {roles.map((role) => (
              <li key={role.id} className={entitlement?.selectedRoles.includes(role.id) ? 'selected' : ''}>
                <strong>{role.name}</strong>
                <span className="va-category">{role.category}</span>
                <p>{role.shortDescription}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="va-card">
          <h3>Capabilities</h3>
          <p className="va-hint">{capabilities.length} capabilities available. Selected: {entitlement?.selectedCapabilities.length || 0}</p>
          <ul className="va-list">
            {capabilities.map((cap) => (
              <li key={cap.id} className={entitlement?.selectedCapabilities.includes(cap.id) ? 'selected' : ''}>
                <strong>{cap.name}</strong>
                <span className="va-category">{cap.category}</span>
                <p>{cap.shortDescription}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
