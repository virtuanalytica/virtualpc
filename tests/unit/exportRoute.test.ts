import { registerExportRoutes } from '../../src/api/export';

function harness() {
  const routes: Record<string, Function> = {};
  const app: any = {
    get: jest.fn((path: string, handler: Function) => { routes[`GET ${path}`] = handler; }),
  };
  registerExportRoutes(app);
  return routes;
}

function response() {
  const r: any = {
    statusCode: 200,
    body: undefined,
    sent: undefined,
    headers: {} as Record<string, string>,
    type: jest.fn((value: string) => { r.headers['Content-Type'] = value; return r; }),
    set: jest.fn((key: string, value: string) => { r.headers[key] = value; return r; }),
    status: jest.fn((code: number) => { r.statusCode = code; return r; }),
    json: jest.fn((value: unknown) => { r.body = value; return r; }),
    send: jest.fn((value: string) => { r.sent = value; return r; }),
  };
  return r;
}

describe('GET /api/export/backlog', () => {
  it('returns the versioned JSON export with a download filename', () => {
    const r = response();
    harness()['GET /api/export/backlog']({ query: { format: 'json' } }, r);

    expect(r.body.schema).toBe('virtualpc.export.v1');
    expect(r.body.version).toBe('0.1');
    expect(r.body.stats).toBeDefined();
    expect(Array.isArray(r.body.backlog)).toBe(true);
    expect(Array.isArray(r.body.workLog)).toBe(true);
    expect(r.headers['Content-Disposition']).toContain('virtualpc-export.json');
  });

  it.each([
    ['csv', 'text/csv', 'virtualpc-backlog.csv', 'id,title,assigned_to,status,priority,sprint,description'],
    ['markdown', 'text/markdown', 'virtualpc-backlog.md', '# VirtualPC export 0.1'],
  ])('returns %s with the correct content-disposition and body', (format, contentType, filename, marker) => {
    const r = response();
    harness()['GET /api/export/backlog']({ query: { format } }, r);

    expect(r.headers['Content-Type']).toBe(contentType);
    expect(r.headers['Content-Disposition']).toContain(filename);
    expect(r.sent).toContain(marker);
  });

  it('rejects unsupported formats without generating an export', () => {
    const r = response();
    harness()['GET /api/export/backlog']({ query: { format: 'sqlite' } }, r);

    expect(r.statusCode).toBe(400);
    expect(r.body).toEqual({ success: false, error: 'format must be json, csv or markdown' });
  });
});
