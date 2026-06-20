import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Drives a feature item through the full tournament lifecycle against a
 * throwaway scrum.json, asserting the audit log + stage transitions.
 */

// Point the scrum store at a throwaway file BEFORE importing it, so the real
// data/scrum.json is never touched.
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vpc-tourn-'));
process.env.SCRUM_STORE_PATH = path.join(tmpRoot, 'scrum.json');

import {
  createTournamentFeature, recordPoker, startTournamentBuilds,
  setBuildStatus, recordReviewAndSelect, markMerged, getTournament,
} from '../../src/integrations/scrum';

describe('tournament lifecycle', () => {
  it('runs backlog → poker → build → review → select → merge with an audit trail', () => {
    const item = createTournamentFeature('BUG-7', 'Add slag cooling curve');
    expect(item.stage).toBe('backlog');
    expect(item.log.length).toBe(1);

    // All three teams agree at 5 points.
    const est = recordPoker(item.id, [
      { leg: 'gpt', points: 5 }, { leg: 'claude', points: 5 }, { leg: 'virtualpc', points: 3 },
    ])!;
    expect(est.stage).toBe('estimated');
    expect(est.poker!.consensus).toBe(5);

    const built = startTournamentBuilds(item.id)!;
    expect(built.stage).toBe('building');
    expect(built.builds.map(b => b.branch)).toEqual([
      'dev/gpt/' + item.id, 'dev/claude/' + item.id, 'dev/virtualpc/' + item.id,
    ]);

    setBuildStatus(item.id, 'gpt', 'ready');
    setBuildStatus(item.id, 'claude', 'ready');
    const afterBuilds = setBuildStatus(item.id, 'virtualpc', 'failed')!;
    expect(afterBuilds.stage).toBe('review');                 // all settled

    const reviewed = recordReviewAndSelect(item.id, [
      { leg: 'gpt', passed: true, score: 88 },
      { leg: 'claude', passed: true, score: 91 },
      { leg: 'virtualpc', passed: false, score: 40 },
    ])!;
    expect(reviewed.stage).toBe('selected');
    expect(reviewed.winner).toBe('claude');                   // highest passing score

    const merged = markMerged(item.id)!;
    expect(merged.stage).toBe('merged');
    // Audit log captured every transition.
    const events = merged.log.map(l => l.event).join('\n');
    expect(events).toMatch(/filed/);
    expect(events).toMatch(/winner: claude/);
    expect(events).toMatch(/merged/);

    // getTournament finds it.
    expect(getTournament(item.id)?.id).toBe(item.id);
  });

  it('rejects a feature for rework when no leg passes review', () => {
    const item = createTournamentFeature('BUG-8', 'Broken thing');
    startTournamentBuilds(item.id);
    const r = recordReviewAndSelect(item.id, [
      { leg: 'gpt', passed: false, score: 30 },
      { leg: 'claude', passed: false, score: 45 },
      { leg: 'virtualpc', passed: false, score: 20 },
    ])!;
    expect(r.stage).toBe('rejected');
    expect(r.winner).toBeUndefined();
  });
});
