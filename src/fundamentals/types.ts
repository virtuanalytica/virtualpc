/**
 * Fundamental data types — balance-sheet style metrics, news claims, and SEC-style filings.
 * Every record keeps an explicit `source` and a wall-clock publication/filing date
 * so provenance and freshness are always auditable.
 */

export interface Fundamental {
  ticker: string;
  company: string;
  period: string;              // e.g. "FY2024" or "Q1-2025"
  revenue: number;             // in millions
  netIncome: number;           // in millions
  eps: number;
  peRatio: number;
  marketCap: number;           // in millions
  source: string;              // where the data came from
  publicationDate: string;     // ISO date the data was published
  lastUpdated: string;         // ISO timestamp
}

export interface NewsItem {
  id: string;
  ticker: string;
  headline: string;
  summary: string;
  source: string;
  publicationDate: string;     // ISO date
  url?: string;
}

export interface Filing {
  id: string;
  ticker: string;
  formType: '10-K' | '10-Q' | '8-K' | 'DEF 14A' | string;
  filingDate: string;          // ISO date
  source: string;
  description: string;
  url?: string;
}

export interface SummaryResult {
  ticker: string;
  summary: string;
  model: string;
  latencyMs: number;
}
