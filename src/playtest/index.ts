/**
 * Playtest feedback surface.
 *
 * Exposes the virtualpc tester-panel output so developers and 3D designers can
 * see it: the per-run playtest reports (data/playtest-reports.jsonl) plus the
 * synthesized GTA6-realism feedback report (data/playtest-feedback.json, written
 * by the molgang-tester-panel workflow). Read-only; mirrors the containment /
 * guardrails route style.
 */

import type { Express, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const REPORTS_JSONL = path.join(DATA_DIR, 'playtest-reports.jsonl');
const FEEDBACK_JSON = path.join(DATA_DIR, 'playtest-feedback.json');

function readJsonl(file: string, limit = 200): any[] {
  try {
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

function readFeedback(): any | null {
  try {
    return JSON.parse(fs.readFileSync(FEEDBACK_JSON, 'utf8'));
  } catch {
    return null;
  }
}

export function setupPlaytestRoutes(app: Express): void {
  // Per-run playtest reports (historical + new tester-panel summary runs).
  app.get('/api/playtest/reports', (req: Request, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 200, 1000);
      res.json({ success: true, data: readJsonl(REPORTS_JSONL, limit) });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // The synthesized GTA6-realism feedback (developer + 3D-designer tracks).
  app.get('/api/playtest/feedback', (_req: Request, res: Response) => {
    const fb = readFeedback();
    if (!fb) {
      return res.status(404).json({
        success: false,
        error: 'no playtest-feedback.json yet — run the molgang-tester-panel workflow',
      });
    }
    return res.json({ success: true, data: fb });
  });

  // Just the prioritized "do these first" list, for a quick triage view.
  app.get('/api/playtest/top', (_req: Request, res: Response) => {
    const fb = readFeedback();
    return res.json({ success: true, data: fb?.top10 ?? [], generatedAt: fb?.generatedAt ?? null });
  });

  // Lightweight status: is feedback available, how many reports, when generated.
  app.get('/api/playtest/status', (_req: Request, res: Response) => {
    const fb = readFeedback();
    res.json({
      success: true,
      data: {
        hasFeedback: !!fb,
        generatedAt: fb?.generatedAt ?? null,
        scorecard: fb?.scorecard ?? null,
        reportRuns: readJsonl(REPORTS_JSONL, 1000).length,
        top10Count: fb?.top10?.length ?? 0,
      },
    });
  });
}
