import { describe, it, expect, beforeAll } from '@jest/globals';

// Integration tests against a running virtualpc server. They SKIP gracefully when
// the server is not reachable on :3100 (mirrors family-graph.test.ts's Neo4j guard),
// so the suite is green in dev/CI-without-server and exercises the API when it's up.
describe('API Integration Tests', () => {
  const baseUrl = 'http://localhost:3100';
  let serverUp = false;

  beforeAll(async () => {
    try {
      const r = await fetch(`${baseUrl}/health`);
      serverUp = r.ok;
    } catch {
      serverUp = false;
    }
    if (!serverUp) console.warn('⚠️  virtualpc server not on :3100 — API integration tests skipped');
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      if (!serverUp) return;
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);

      const data: any = await response.json();
      expect(data).toHaveProperty('status');
      expect(data.status).toBe('ok');
    });

    it('should include service status', async () => {
      if (!serverUp) return;
      const response = await fetch(`${baseUrl}/health`);
      const data: any = await response.json();

      expect(data).toHaveProperty('services');
      expect(data.services).toHaveProperty('lightrag');
      expect(data.services).toHaveProperty('kafka');
    });
  });

  describe('Dashboard Endpoints', () => {
    it('should get dashboard stats', async () => {
      if (!serverUp) return;
      const response = await fetch(`${baseUrl}/api/analytics/dashboard`);
      expect(response.status).toBe(200);

      const data: any = await response.json();
      expect(data).toHaveProperty('stats');
      expect(data.stats).toHaveProperty('totalRequests');
    });

    it('should get performance metrics', async () => {
      if (!serverUp) return;
      const response = await fetch(`${baseUrl}/api/analytics/performance`);
      expect(response.status).toBe(200);

      const data: any = await response.json();
      expect(data).toHaveProperty('performance');
      expect(data.performance).toHaveProperty('apiLatency');
    });
  });

  describe('Rate Limiting', () => {
    it('should include rate limit headers', async () => {
      if (!serverUp) return;
      const response = await fetch(`${baseUrl}/api/backlog`);
      expect(response.headers.has('X-RateLimit-Limit')).toBe(true);
    });

    it('should return 429 when rate limit exceeded', async () => {
      if (!serverUp) return;
      // Make requests rapidly
      const requests = Array(150).fill(null).map(() =>
        fetch(`${baseUrl}/api/test`)
      );

      const responses = await Promise.all(requests);
      const statusCodes = responses.map(r => r.status);

      // Should have at least one 429
      expect(statusCodes).toContain(429);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent endpoints', async () => {
      if (!serverUp) return;
      const response = await fetch(`${baseUrl}/api/nonexistent`);
      expect(response.status).toBe(404);
    });

    it('should return 400 for invalid requests', async () => {
      if (!serverUp) return;
      const response = await fetch(`${baseUrl}/api/test`, {
        method: 'POST',
        body: 'invalid json',
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('CORS', () => {
    it('should handle preflight requests', async () => {
      if (!serverUp) return;
      const response = await fetch(`${baseUrl}/api/`, {
        method: 'OPTIONS',
        headers: {
          'Origin': 'http://localhost:3000',
        },
      });
      expect(response.status).toBe(200);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      if (!serverUp) return;
      const response = await fetch(`${baseUrl}/health`);

      expect(response.headers.has('Content-Security-Policy')).toBe(true);
      expect(response.headers.has('X-Content-Type-Options')).toBe(true);
      expect(response.headers.has('X-Frame-Options')).toBe(true);
    });
  });
});
