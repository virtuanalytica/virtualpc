/**
 * Tournament routes — administer the 3-developer competing-branch regime.
 *
 * All activity flows through backlog items; every step is recorded on the
 * item's audit log. The pure rules live in ./dev-tournament, persistence in
 * src/integrations/scrum (same scrum.json).
 *
 *  GET  /api/tournament/org                       roles, legs, rosters (reference)
 *  GET  /api/tournament                           list feature items
 *  POST /api/tournament                           file a feature (backlogRef, title)
 *  GET  /api/tournament/:id                        one item (with audit log)
 *  POST /api/tournament/:id/poker                  3 teams' planning-poker votes
 *  POST /api/tournament/:id/build                  open the three competing branches
 *  POST /api/tournament/:id/build/:leg             set a leg's build status
 *  POST /api/tournament/:id/review                 reviewer verdicts → PO picks 1 winner
 *  POST /api/tournament/:id/merge                  mark the winner merged
 */
import type { Express } from 'express';
import { DEV_LEGS, COORDINATOR, REVIEWER, LEG_IDS, teamRoster } from './dev-tournament';
import {
  createTournamentFeature, getTournament, listTournaments, recordPoker,
  startTournamentBuilds, setBuildStatus, recordReviewAndSelect, markMerged,
} from '../integrations/scrum';

export function registerTournamentRoutes(app: Express): void {
  app.get('/api/tournament/org', (_req, res) => {
    res.json({
      success: true,
      coordinator: COORDINATOR,
      reviewer: REVIEWER,
      legs: DEV_LEGS.map(l => ({ ...l, roster: teamRoster(l) })),
    });
  });

  app.get('/api/tournament', (_req, res) => {
    res.json({ success: true, items: listTournaments() });
  });

  app.post('/api/tournament', (req, res) => {
    const { backlogRef, title } = req.body || {};
    if (!title || !String(title).trim()) { res.status(400).json({ success: false, error: 'title required' }); return; }
    res.json({ success: true, item: createTournamentFeature(String(backlogRef || ''), String(title)) });
  });

  app.get('/api/tournament/:id', (req, res) => {
    const item = getTournament(req.params.id);
    if (!item) { res.status(404).json({ success: false, error: 'feature not found' }); return; }
    res.json({ success: true, item });
  });

  app.post('/api/tournament/:id/poker', (req, res) => {
    const estimates = (req.body || {}).estimates;
    if (!Array.isArray(estimates)) { res.status(400).json({ success: false, error: 'estimates[] required ({leg, points})' }); return; }
    const item = recordPoker(req.params.id, estimates);
    if (!item) { res.status(404).json({ success: false, error: 'feature not found' }); return; }
    res.json({ success: true, item, agreed: item.poker?.agreed });
  });

  app.post('/api/tournament/:id/build', (req, res) => {
    const item = startTournamentBuilds(req.params.id);
    if (!item) { res.status(404).json({ success: false, error: 'feature not found' }); return; }
    res.json({ success: true, item });
  });

  app.post('/api/tournament/:id/build/:leg', (req, res) => {
    const { leg } = req.params;
    const { status } = req.body || {};
    if (!LEG_IDS.includes(leg as any)) { res.status(400).json({ success: false, error: `leg must be one of ${LEG_IDS.join('|')}` }); return; }
    if (!['pending', 'in_progress', 'ready', 'failed'].includes(status)) { res.status(400).json({ success: false, error: 'status must be pending|in_progress|ready|failed' }); return; }
    const item = setBuildStatus(req.params.id, leg as any, status);
    if (!item) { res.status(404).json({ success: false, error: 'feature not found' }); return; }
    res.json({ success: true, item });
  });

  app.post('/api/tournament/:id/review', (req, res) => {
    const verdicts = (req.body || {}).verdicts;
    if (!Array.isArray(verdicts)) { res.status(400).json({ success: false, error: 'verdicts[] required ({leg, passed, score})' }); return; }
    const item = recordReviewAndSelect(req.params.id, verdicts);
    if (!item) { res.status(404).json({ success: false, error: 'feature not found' }); return; }
    res.json({ success: true, item, winner: item.winner || null });
  });

  app.post('/api/tournament/:id/merge', (req, res) => {
    const item = markMerged(req.params.id);
    if (!item) { res.status(404).json({ success: false, error: 'feature not found' }); return; }
    if (!item.winner) { res.status(409).json({ success: false, error: 'no winner selected yet' }); return; }
    res.json({ success: true, item });
  });
}
