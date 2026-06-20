import {
  AGENT_META,
  AGENT_NAMES,
  getAgent,
  ROLE_MAP,
  AVATAR_MAP,
  COLOR_MAP,
  AGENT_MODELS,
} from '../../src/agent-registry';

/**
 * Invariant tests for the agent registry — the "single source of truth" whose
 * whole purpose is to prevent drift between the roster and the derived maps.
 * A duplicate name would silently collapse the Map-based derivations.
 */

describe('agent-registry', () => {
  it('has no duplicate agent names', () => {
    const seen = new Set<string>();
    const dups: string[] = [];
    for (const a of AGENT_META) {
      if (seen.has(a.name)) dups.push(a.name);
      seen.add(a.name);
    }
    expect(dups).toEqual([]);
  });

  it('AGENT_NAMES matches AGENT_META 1:1', () => {
    expect(AGENT_NAMES).toEqual(AGENT_META.map(a => a.name));
    expect(AGENT_NAMES).toHaveLength(AGENT_META.length);
  });

  it('every agent has the required non-empty fields', () => {
    for (const a of AGENT_META) {
      expect(a.name).toBeTruthy();
      expect(a.role).toBeTruthy();
      expect(a.avatar).toBeTruthy();
      expect(a.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(Array.isArray(a.models)).toBe(true);
      expect(a.models.length).toBeGreaterThan(0);
    }
  });

  it('getAgent resolves known names and returns undefined for unknown', () => {
    expect(getAgent('Fill')?.role).toContain('CEO');
    expect(getAgent('Athena')?.kind).toBe('reviewer');
    expect(getAgent('NoSuchAgent')).toBeUndefined();
  });

  it('every derived map has an entry for every agent (no drift)', () => {
    for (const name of AGENT_NAMES) {
      expect(ROLE_MAP[name]).toBeDefined();
      expect(AVATAR_MAP[name]).toBeDefined();
      expect(COLOR_MAP[name]).toBeDefined();
      expect(AGENT_MODELS[name]).toBeDefined();
    }
    // ...and the maps contain no extra/phantom keys.
    expect(Object.keys(ROLE_MAP).sort()).toEqual([...AGENT_NAMES].sort());
  });

  it('exactly one agent is the GPT-5.5 (Codex) reviewer (Athena)', () => {
    // As of 2026-06-04 the PhD reviewer runs on GPT-5.5 via Codex (was Opus 4.8).
    const reviewerModel = AGENT_META.filter(a => a.models.length === 1 && a.models[0] === 'gpt-5.5');
    expect(reviewerModel.map(a => a.name)).toEqual(['Athena']);
    expect(getAgent('Athena')?.kind).toBe('reviewer');
  });

  it('tool ACLs (when present) are non-empty strings', () => {
    for (const a of AGENT_META) {
      if (a.tools) {
        for (const t of a.tools) expect(typeof t === 'string' && t.length > 0).toBe(true);
      }
    }
  });
});
