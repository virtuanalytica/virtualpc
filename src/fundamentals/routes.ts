import type { Express, Request, Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { fundamentalsStore } from './store';
import * as lmstudio from '../lmstudio';
import logger from '../utils/logger';

const SAMPLES_DIR = path.join(__dirname, '..', '..', 'data');

function loadSample(file: string): string {
  return fs.readFileSync(path.join(SAMPLES_DIR, file), 'utf8');
}

export function registerFundamentalRoutes(app: Express): void {
  // Seed sample data on first boot if empty
  if (fundamentalsStore.getAllFundamentals().length === 0) {
    try {
      fundamentalsStore.ingestFundamentals(loadSample('fundamentals-sample.csv'));
      fundamentalsStore.ingestNews(loadSample('news-sample.csv'));
      fundamentalsStore.ingestFilings(loadSample('filings-sample.csv'));
      logger.info('[fundamentals] seeded sample fundamentals, news, and filings');
    } catch (e) {
      logger.warn(`[fundamentals] sample seed failed: ${(e as Error).message}`);
    }
  }

  app.get('/api/fundamentals', (_req, res) => {
    res.json({ success: true, count: fundamentalsStore.getAllFundamentals().length, data: fundamentalsStore.getAllFundamentals() });
  });

  app.get('/api/fundamentals/:ticker', (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const fundamental = fundamentalsStore.getFundamental(ticker);
    if (!fundamental) { res.status(404).json({ success: false, error: 'ticker not found' }); return; }
    res.json({
      success: true,
      ticker,
      fundamental,
      news: fundamentalsStore.getNews(ticker),
      filings: fundamentalsStore.getFilings(ticker),
    });
  });

  app.get('/api/fundamentals/news', (req, res) => {
    const ticker = typeof req.query.ticker === 'string' ? req.query.ticker.toUpperCase() : undefined;
    res.json({ success: true, count: fundamentalsStore.getNews(ticker).length, data: fundamentalsStore.getNews(ticker) });
  });

  app.get('/api/fundamentals/filings', (req, res) => {
    const ticker = typeof req.query.ticker === 'string' ? req.query.ticker.toUpperCase() : undefined;
    res.json({ success: true, count: fundamentalsStore.getFilings(ticker).length, data: fundamentalsStore.getFilings(ticker) });
  });

  app.post('/api/fundamentals/ingest', (req, res): any => {
    const { type, csv } = req.body || {};
    if (!csv || typeof csv !== 'string') { res.status(400).json({ success: false, error: 'csv text required' }); return; }
    try {
      if (type === 'news') {
        const r = fundamentalsStore.ingestNews(csv);
        return res.json({ success: true, ...r, type: 'news' });
      }
      if (type === 'filings') {
        const r = fundamentalsStore.ingestFilings(csv);
        return res.json({ success: true, ...r, type: 'filings' });
      }
      const r = fundamentalsStore.ingestFundamentals(csv);
      return res.json({ success: true, ...r, type: 'fundamentals' });
    } catch (e: any) {
      res.status(400).json({ success: false, error: e.message });
    }
  });

  app.get('/api/fundamentals/summarize/:ticker', async (req, res) => {
    const ticker = req.params.ticker.toUpperCase();
    const fundamental = fundamentalsStore.getFundamental(ticker);
    if (!fundamental) { res.status(404).json({ success: false, error: 'ticker not found' }); return; }

    // Return cached summary if available
    const cached = fundamentalsStore.getSummary(ticker);
    if (cached) { res.json({ success: true, ...cached, cached: true }); return; }

    const context = [
      `Company: ${fundamental.company} (${ticker})`,
      `Period: ${fundamental.period}`,
      `Revenue: $${fundamental.revenue}M`,
      `Net Income: $${fundamental.netIncome}M`,
      `EPS: $${fundamental.eps}`,
      `P/E Ratio: ${fundamental.peRatio}`,
      `Market Cap: $${fundamental.marketCap}M`,
      `Source: ${fundamental.source}, published ${fundamental.publicationDate}`,
    ].join('\n');

    const messages = [
      { role: 'system' as const, content: 'You are a financial analyst. Summarize the following fundamental data in 2–3 sentences for a non-expert investor. Be concise.' },
      { role: 'user' as const, content: `Fundamental data:\n${context}\n\nProvide a short summary.` },
    ];

    const started = Date.now();
    const result = await lmstudio.chatAsAgent('Data-Scientist', messages, { taskType: 'reasoning', max_tokens: 180, temperature: 0.4 });
    if (!result.ok) {
      res.status(503).json({ success: false, ...result });
      return;
    }
    const summaryResult = { ticker, summary: result.content.trim(), model: result.model, latencyMs: Date.now() - started };
    fundamentalsStore.setSummary(ticker, summaryResult);
    res.json({ success: true, ...summaryResult, cached: false });
  });

  logger.info('[fundamentals] routes online — /api/fundamentals/*');
}
