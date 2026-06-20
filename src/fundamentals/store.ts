import * as fs from 'fs';
import * as path from 'path';
import { parse } from 'csv-parse/sync';
import { Fundamental, NewsItem, Filing, SummaryResult } from './types';
import logger from '../utils/logger';

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'fundamentals');
const FUNDAMENTALS_FILE = path.join(DATA_DIR, 'fundamentals.json');
const NEWS_FILE = path.join(DATA_DIR, 'news.json');
const FILINGS_FILE = path.join(DATA_DIR, 'filings.json');
const SUMMARIES_FILE = path.join(DATA_DIR, 'summaries.json');

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch (e) {
    logger.warn(`fundamentals: failed to load ${file}: ${(e as Error).message}`);
    return fallback;
  }
}

function saveJson<T>(file: string, data: T) {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

export class FundamentalsStore {
  private fundamentals: Fundamental[] = [];
  private news: NewsItem[] = [];
  private filings: Filing[] = [];
  private summaries: Record<string, SummaryResult> = {};

  constructor() {
    this.load();
  }

  load() {
    this.fundamentals = loadJson<Fundamental[]>(FUNDAMENTALS_FILE, []);
    this.news = loadJson<NewsItem[]>(NEWS_FILE, []);
    this.filings = loadJson<Filing[]>(FILINGS_FILE, []);
    this.summaries = loadJson<Record<string, SummaryResult>>(SUMMARIES_FILE, {});
  }

  save() {
    saveJson(FUNDAMENTALS_FILE, this.fundamentals);
    saveJson(NEWS_FILE, this.news);
    saveJson(FILINGS_FILE, this.filings);
    saveJson(SUMMARIES_FILE, this.summaries);
  }

  getAllFundamentals(): Fundamental[] {
    return this.fundamentals;
  }

  getFundamental(ticker: string): Fundamental | undefined {
    return this.fundamentals.find(f => f.ticker.toUpperCase() === ticker.toUpperCase());
  }

  getNews(ticker?: string): NewsItem[] {
    if (!ticker) return this.news;
    return this.news.filter(n => n.ticker.toUpperCase() === ticker.toUpperCase());
  }

  getFilings(ticker?: string): Filing[] {
    if (!ticker) return this.filings;
    return this.filings.filter(f => f.ticker.toUpperCase() === ticker.toUpperCase());
  }

  ingestFundamentals(csvText: string) {
    const rows = parse(csvText, { columns: true, skip_empty_lines: true, cast: true }) as any[];
    const incoming: Fundamental[] = rows.map(r => ({
      ticker: String(r.ticker || r.Ticker).toUpperCase(),
      company: String(r.company || r.Company),
      period: String(r.period || r.Period),
      revenue: Number(r.revenue ?? r.Revenue),
      netIncome: Number(r.netIncome ?? r.NetIncome),
      eps: Number(r.eps ?? r.EPS),
      peRatio: Number(r.peRatio ?? r.PERatio ?? r['PE Ratio']),
      marketCap: Number(r.marketCap ?? r.MarketCap),
      source: String(r.source || r.Source),
      publicationDate: String(r.publicationDate || r['Publication Date']),
      lastUpdated: new Date().toISOString(),
    }));
    // Merge by ticker
    for (const item of incoming) {
      const idx = this.fundamentals.findIndex(f => f.ticker === item.ticker);
      if (idx >= 0) this.fundamentals[idx] = item;
      else this.fundamentals.push(item);
    }
    this.save();
    return { imported: incoming.length, total: this.fundamentals.length };
  }

  ingestNews(csvText: string) {
    const rows = parse(csvText, { columns: true, skip_empty_lines: true, cast: true }) as any[];
    const incoming: NewsItem[] = rows.map(r => ({
      id: `news-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ticker: String(r.ticker || r.Ticker).toUpperCase(),
      headline: String(r.headline || r.Headline),
      summary: String(r.summary || r.Summary),
      source: String(r.source || r.Source),
      publicationDate: String(r.publicationDate || r['Publication Date']),
      url: r.url || r.URL || undefined,
    }));
    this.news.unshift(...incoming);
    this.save();
    return { imported: incoming.length, total: this.news.length };
  }

  ingestFilings(csvText: string) {
    const rows = parse(csvText, { columns: true, skip_empty_lines: true, cast: true }) as any[];
    const incoming: Filing[] = rows.map(r => ({
      id: `filing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ticker: String(r.ticker || r.Ticker).toUpperCase(),
      formType: String(r.formType || r['Form Type']),
      filingDate: String(r.filingDate || r['Filing Date']),
      source: String(r.source || r.Source),
      description: String(r.description || r.Description),
      url: r.url || r.URL || undefined,
    }));
    this.filings.unshift(...incoming);
    this.save();
    return { imported: incoming.length, total: this.filings.length };
  }

  getSummary(ticker: string): SummaryResult | undefined {
    return this.summaries[ticker.toUpperCase()];
  }

  setSummary(ticker: string, result: SummaryResult) {
    this.summaries[ticker.toUpperCase()] = result;
    this.save();
  }
}

export const fundamentalsStore = new FundamentalsStore();
