/**
 * Finance routes — the intangible-asset (immateriële activa) capitalization
 * report + the per-feature ROI view, built from the REAL git history.
 *
 * GET  /api/finance/capitalization        → balance sheet + per-feature ROI
 * POST /api/finance/value {id, value}      → PO/MoneyGod sets a feature's
 *                                            business value (drives ROI; never
 *                                            fabricated — only what's entered)
 * POST /api/finance/decisions/features     → point-in-time Jev feature fan-out
 * POST /api/finance/experiments/compare    → paired baseline/challenger metrics
 * POST /api/finance/retrieval/radient      → optional local precedent retrieval
 * See docs/FEATURE-CAPITALIZATION.md.
 */
import type { Express } from 'express';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { CapitalizationPolicy } from './feature-capitalization';
import { parseFeatureCommits, buildCapitalizationReport } from './capitalization-report';
import { HttpJevClient } from './jev-client';
import { buildJevFinanceFeatures, FinanceDecisionState } from './decision-features';
import { compareClassificationModels, compareDecisionModels, ClassificationObservation, PredictionObservation } from './decision-experiment';
import { PythonRadientEmbedder, RetrievalDocument, retrievePointInTime } from './radient-retrieval';

const VALUES_STORE = path.join(__dirname, '..', '..', 'data', 'feature-values.json');
const POLICY: CapitalizationPolicy = {
  blendedHourlyRate: 90,      // € blended agent labor rate
  hoursPerCommit: 2,
  capitalizableRate: 0.8,     // IAS38/RJ210 development recognition
  usefulLifeMonths: 36,
  tokensPerHour: 0,
};

function loadValues(): Record<string, number> {
  try { return JSON.parse(fs.readFileSync(VALUES_STORE, 'utf8')).values || {}; } catch { return {}; }
}
function saveValues(values: Record<string, number>) {
  try { fs.mkdirSync(path.dirname(VALUES_STORE), { recursive: true }); fs.writeFileSync(VALUES_STORE, JSON.stringify({ values }, null, 2)); }
  catch { /* best-effort */ }
}

function gitLog(): string {
  // Base preference: the released line if available, else local history.
  for (const range of ['vpc/master', 'master', 'HEAD']) {
    try {
      return execSync(`git log ${range} -n 400 --no-merges --format='C%x09%H%x09%s' --numstat`,
        { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
    } catch { /* try next */ }
  }
  return '';
}

export function registerFinanceRoutes(app: Express): void {
  app.get('/api/finance/decision-stack', (_req, res) => {
    res.json({
      success: true,
      jev: { configured: Boolean(process.env.TYPESAFE_API_KEY), model: process.env.TYPESAFE_MODEL ?? 'jev-latest' },
      radient: { configured: Boolean(process.env.RADIENT_PYTHON), local: true },
      jepaAnything: { experimental: true, enabled: process.env.JEPA_FINANCE_EXPERIMENTAL === '1' },
    });
  });

  app.get('/api/finance/capitalization', (_req, res) => {
    try {
      const features = parseFeatureCommits(gitLog());
      const report = buildCapitalizationReport(features, POLICY, loadValues());
      res.json({ success: true, policy: POLICY, ...report });
    } catch (e: any) { res.status(500).json({ success: false, error: e.message }); }
  });

  app.post('/api/finance/value', (req, res) => {
    const { id, value } = req.body || {};
    if (!id || typeof value !== 'number') { res.status(400).json({ success: false, error: 'id and numeric value required' }); return; }
    const values = loadValues(); values[id] = value; saveValues(values);
    res.json({ success: true, id, value });
  });

  app.post('/api/finance/decisions/features', async (req, res) => {
    const apiKey = process.env.TYPESAFE_API_KEY;
    if (!apiKey) { res.status(503).json({ success: false, error: 'TYPESAFE_API_KEY is not configured' }); return; }
    try {
      const state = req.body?.state as FinanceDecisionState;
      if (!state || !Array.isArray(state.evidence) || typeof state.assetId !== 'string') {
        res.status(400).json({ success: false, error: 'state with assetId, decisionAt, and evidence is required' }); return;
      }
      const client = new HttpJevClient({
        apiKey,
        endpoint: process.env.TYPESAFE_API_URL,
        model: process.env.TYPESAFE_MODEL,
      });
      const result = await buildJevFinanceFeatures(client, state);
      res.json({ success: true, ...result });
    } catch (error) {
      res.status(422).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/finance/experiments/compare', (req, res) => {
    try {
      if (!Array.isArray(req.body?.observations)) {
        res.status(400).json({ success: false, error: 'observations array is required' }); return;
      }
      const report = compareDecisionModels(req.body.observations as PredictionObservation[]);
      res.json({ success: true, report });
    } catch (error) {
      res.status(422).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/finance/experiments/classification', (req, res) => {
    try {
      if (!Array.isArray(req.body?.observations)) {
        res.status(400).json({ success: false, error: 'observations array is required' }); return;
      }
      const report = compareClassificationModels(req.body.observations as ClassificationObservation[]);
      res.json({ success: true, report });
    } catch (error) {
      res.status(422).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  app.post('/api/finance/retrieval/radient', async (req, res) => {
    try {
      const { query, documents, decisionAt, limit } = req.body ?? {};
      if (typeof query !== 'string' || !Array.isArray(documents) || typeof decisionAt !== 'string') {
        res.status(400).json({ success: false, error: 'query, documents, and decisionAt are required' }); return;
      }
      const results = await retrievePointInTime(
        new PythonRadientEmbedder(), query, documents as RetrievalDocument[], decisionAt,
        typeof limit === 'number' ? limit : 5,
      );
      res.json({ success: true, results });
    } catch (error) {
      res.status(422).json({ success: false, error: error instanceof Error ? error.message : String(error) });
    }
  });

  logger.info('[finance] capitalization and decision-experiment routes online');
}
