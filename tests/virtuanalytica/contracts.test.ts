/**
 * VirtuAnalytica API contract tests.
 *
 * Spins up the Express app and verifies the public route contracts without
 * requiring Neo4j or external services.
 */

import express from 'express';
import { registerVirtuAnalyticaRoutes } from '../../src/virtuanalytica';
import * as commerce from '../../src/virtuanalytica/commerce';

function buildApp() {
  const app = express();
  app.use(express.json());
  registerVirtuAnalyticaRoutes(app);
  return app;
}

describe('/api/virtuanalytica contracts', () => {
  beforeEach(() => commerce.resetForTesting());

  it('GET /health returns ok', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/virtuanalytica/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.ok).toBe(true);
  });

  it('GET /state returns tier info', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/virtuanalytica/state');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.demoMode).toBe(true);
    expect(res.body.tiers).toBeDefined();
  });

  it('GET /catalog/roles returns priced roles', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/virtuanalytica/catalog/roles');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.roles.length).toBeGreaterThan(0);
    expect(res.body.roles[0]).toHaveProperty('priceEur');
  });

  it('GET /catalog/capabilities returns priced capabilities', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/virtuanalytica/catalog/capabilities');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.capabilities.length).toBeGreaterThan(0);
    expect(res.body.capabilities[0]).toHaveProperty('priceEur');
  });

  it('POST /catalog/import returns 402 when not enabled', async () => {
    const app = buildApp();
    const res = await request(app).post('/api/virtuanalytica/catalog/import').send({ demo: true });
    expect(res.status).toBe(402);
    expect(res.body.success).toBe(false);
  });

  it('POST /catalog/import succeeds in test mode', async () => {
    commerce.enableTestMode();
    const app = buildApp();
    const res = await request(app).post('/api/virtuanalytica/catalog/import').send({ demo: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.imported).toBeDefined();
  });
});

// Minimal request helper to avoid adding supertest dependency.
function request(app: express.Express) {
  return {
    get(path: string) {
      return new Promise<any>((resolve, reject) => {
        const req = { method: 'GET', url: path, headers: {}, body: undefined as any };
        const res: any = {
          statusCode: 200,
          headers: {},
          body: undefined,
          status(n: number) { this.statusCode = n; return this; },
          json(obj: any) { this.body = obj; resolve({ status: this.statusCode, body: this.body, headers: this.headers }); },
          send(obj: any) { this.body = obj; resolve({ status: this.statusCode, body: this.body, headers: this.headers }); },
          setHeader() { return this; },
          end() { resolve({ status: this.statusCode, body: this.body, headers: this.headers }); },
        };
        app(req as any, res, (err: any) => { if (err) reject(err); else resolve({ status: res.statusCode, body: res.body, headers: res.headers }); });
      });
    },
    post(path: string) {
      return {
        async send(body: any) {
          return new Promise<any>((resolve, reject) => {
            const req = { method: 'POST', url: path, headers: {}, body };
            const res: any = {
              statusCode: 200,
              headers: {},
              body: undefined,
              status(n: number) { this.statusCode = n; return this; },
              json(obj: any) { this.body = obj; resolve({ status: this.statusCode, body: this.body, headers: this.headers }); },
              send(obj: any) { this.body = obj; resolve({ status: this.statusCode, body: this.body, headers: this.headers }); },
              setHeader() { return this; },
              end() { resolve({ status: res.statusCode, body: res.body, headers: res.headers }); },
            };
            app(req as any, res, (err: any) => { if (err) reject(err); else resolve({ status: res.statusCode, body: res.body, headers: res.headers }); });
          });
        },
      };
    },
  };
}
