import { Express, Request, Response } from 'express';
import * as taskEngine from '../task-engine';
import * as tokenTracker from '../token-tracker';

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function exportBundle() {
  return {
    schema: 'virtualpc.export.v1',
    exportedAt: new Date().toISOString(),
    version: process.env.VIRTUALPC_VERSION || '0.1',
    stats: taskEngine.getGameStats(),
    backlog: taskEngine.getBacklogItems(),
    workLog: taskEngine.getWorkLog(undefined, 1000),
    tokenSummary: tokenTracker.getAgentSummary(),
  };
}

function asMarkdown(bundle: ReturnType<typeof exportBundle>): string {
  const lines = [
    `# VirtualPC export ${bundle.version}`,
    '',
    `- Exported: ${bundle.exportedAt}`,
    `- Completed: ${bundle.stats.tasksCompleted}`,
    `- In progress: ${bundle.stats.tasksInProgress}`,
    `- Daily updates: ${bundle.stats.completedLast24h}`,
    `- Qwen tokens: ${Object.values(bundle.tokenSummary.agents).reduce((n: number, a: any) => n + Number(a.modelBreakdown?.['qwen3.5-27b'] || 0), 0)}`,
    '',
    '| ID | Title | Owner | Status | Priority |',
    '|---|---|---|---|---|',
  ];
  for (const item of bundle.backlog as any[]) {
    lines.push(`| ${item.id} | ${String(item.title).replace(/\|/g, '\\|')} | ${item.assigned_to} | ${item.status} | ${item.priority} |`);
  }
  return `${lines.join('\n')}\n`;
}

function asCsv(bundle: ReturnType<typeof exportBundle>): string {
  const header = ['id', 'title', 'assigned_to', 'status', 'priority', 'sprint', 'description'];
  const rows = (bundle.backlog as any[]).map(item => header.map(key => csvCell(item[key])).join(','));
  return `${header.join(',')}\n${rows.join('\n')}\n`;
}

export function registerExportRoutes(app: Express): void {
  app.get('/api/export/backlog', (req: Request, res: Response) => {
    const format = String(req.query.format || 'json').toLowerCase();
    const bundle = exportBundle();
    if (format === 'markdown' || format === 'md') {
      res.type('text/markdown').set('Content-Disposition', 'attachment; filename="virtualpc-backlog.md"').send(asMarkdown(bundle));
      return;
    }
    if (format === 'csv') {
      res.type('text/csv').set('Content-Disposition', 'attachment; filename="virtualpc-backlog.csv"').send(asCsv(bundle));
      return;
    }
    if (format !== 'json') {
      res.status(400).json({ success: false, error: 'format must be json, csv or markdown' });
      return;
    }
    res.type('json').set('Content-Disposition', 'attachment; filename="virtualpc-export.json"').json(bundle);
  });
}
