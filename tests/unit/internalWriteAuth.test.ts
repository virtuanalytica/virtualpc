import { internalWriteAuth, PROTECTED_WRITE_PATHS } from '../../src/middleware/internalWriteAuth';

/**
 * Proof for TOP_100 #19 — the internal-write guard. The six write endpoints
 * were unauthenticated. The guard authorises localhost or a shared service
 * token, defaults to WARN (log-but-allow) so it's non-breaking, and rejects
 * only when INTERNAL_WRITE_ENFORCE is on.
 */
function mockReq(over: Partial<{ method: string; path: string; ip: string; headers: Record<string, string> }> = {}) {
  const headers = over.headers || {};
  return {
    method: over.method ?? 'POST',
    path: over.path ?? '/api/wiki',
    ip: over.ip ?? '203.0.113.7', // a non-loopback default
    get: (h: string) => headers[h.toLowerCase()],
  } as any;
}

function mockRes() {
  const res: any = { statusCode: 200, body: undefined, headersSent: false };
  res.status = (c: number) => { res.statusCode = c; return res; };
  res.json = (b: any) => { res.body = b; res.headersSent = true; return res; };
  return res;
}

function run(mw: any, req: any) {
  const res = mockRes();
  let nexted = false;
  mw(req, res, () => { nexted = true; });
  return { res, nexted };
}

describe('internalWriteAuth (TOP_100 #19)', () => {
  it('protects exactly the six documented write paths', () => {
    expect([...PROTECTED_WRITE_PATHS].sort()).toEqual([
      '/api/backlog/items',
      '/api/corpus/ingest',
      '/api/governance/register',
      '/api/kami/queue',
      '/api/mcp/call',
      '/api/wiki',
    ]);
  });

  it.each(['127.0.0.1', '::1', '::ffff:127.0.0.1'])('allows loopback caller %s even when enforcing', (ip) => {
    const { res, nexted } = run(internalWriteAuth({ enforce: true }), mockReq({ ip }));
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('WARN mode (default): allows a non-local unauthenticated write (logged, not blocked)', () => {
    const { res, nexted } = run(internalWriteAuth({ enforce: false }), mockReq({ ip: '203.0.113.7' }));
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('ENFORCE mode: rejects a non-local caller with no token (403, no next)', () => {
    const { res, nexted } = run(internalWriteAuth({ enforce: true }), mockReq({ ip: '203.0.113.7' }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('ENFORCE mode: a valid service token authorises a non-local caller', () => {
    const mw = internalWriteAuth({ enforce: true, serviceToken: 'svc-secret-123' });
    const { res, nexted } = run(mw, mockReq({ ip: '203.0.113.7', headers: { 'x-api-key': 'svc-secret-123' } }));
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('ENFORCE mode: a wrong token is still rejected', () => {
    const mw = internalWriteAuth({ enforce: true, serviceToken: 'svc-secret-123' });
    const { res, nexted } = run(mw, mockReq({ ip: '203.0.113.7', headers: { 'x-api-key': 'WRONG' } }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('accepts the token via Authorization: ApiKey <token> too', () => {
    const mw = internalWriteAuth({ enforce: true, serviceToken: 'svc-secret-123' });
    const { res, nexted } = run(mw, mockReq({ ip: '203.0.113.7', headers: { authorization: 'ApiKey svc-secret-123' } }));
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('ignores non-POST methods on protected paths (read-through)', () => {
    const { res, nexted } = run(internalWriteAuth({ enforce: true }), mockReq({ method: 'GET', ip: '203.0.113.7' }));
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('ignores POSTs to non-protected paths', () => {
    const { res, nexted } = run(internalWriteAuth({ enforce: true }), mockReq({ path: '/api/tasks', ip: '203.0.113.7' }));
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  // Regression: Express routes case-insensitively and ignores a trailing slash,
  // so the guard must normalise the path or it can be bypassed entirely.
  it('blocks the trailing-slash bypass (/api/wiki/) under enforce', () => {
    const { res, nexted } = run(
      internalWriteAuth({ enforce: true }),
      mockReq({ path: '/api/wiki/', ip: '203.0.113.7' }),
    );
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('blocks the case-variant bypass (/API/Wiki) under enforce', () => {
    const { res, nexted } = run(
      internalWriteAuth({ enforce: true }),
      mockReq({ path: '/API/Wiki', ip: '203.0.113.7' }),
    );
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });

  it('still allows localhost through the normalised path', () => {
    const { res, nexted } = run(
      internalWriteAuth({ enforce: true }),
      mockReq({ path: '/api/Corpus/Ingest/', ip: '127.0.0.1' }),
    );
    expect(nexted).toBe(true);
    expect(res.statusCode).toBe(200);
  });

  it('empty service token never authorises a non-local caller (no accidental open door)', () => {
    // enforce + empty token + a caller that sends an empty key must NOT pass.
    const mw = internalWriteAuth({ enforce: true, serviceToken: '' });
    const { res, nexted } = run(mw, mockReq({ ip: '203.0.113.7', headers: { 'x-api-key': '' } }));
    expect(nexted).toBe(false);
    expect(res.statusCode).toBe(403);
  });
});
