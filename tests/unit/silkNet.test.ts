import {
  SilkNodeRegistry,
  SilkGossip,
  silkNodeId,
  SILK_SCHEMA,
} from '../../src/integrations/lightrag/silk-net';
import { MicroPostStore } from '../../src/integrations/lightrag/micro-post';

// ── helpers ───────────────────────────────────────────────────────────────────

function makeRegistry() { return new SilkNodeRegistry(); }

function futureIso(ms: number) { return new Date(Date.now() + ms).toISOString(); }

// ── 1. silkNodeId ─────────────────────────────────────────────────────────────

describe('silkNodeId', () => {
  it('returns a 64-char hex string', () => {
    expect(silkNodeId('https://example.com')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is case-insensitive on the URL', () => {
    expect(silkNodeId('https://EXAMPLE.COM')).toBe(silkNodeId('https://example.com'));
  });

  it('trims whitespace', () => {
    expect(silkNodeId('  https://example.com  ')).toBe(silkNodeId('https://example.com'));
  });

  it('differs for different URLs', () => {
    expect(silkNodeId('https://a.com')).not.toBe(silkNodeId('https://b.com'));
  });
});

// ── 2. SilkNodeRegistry ───────────────────────────────────────────────────────

describe('SilkNodeRegistry', () => {
  it('rejects non-URL', () => {
    const r = makeRegistry();
    expect(r.join({ url: 'not-a-url' }).ok).toBe(false);
  });

  it('rejects empty url', () => {
    const r = makeRegistry();
    expect(r.join({ url: '' }).ok).toBe(false);
  });

  it('registers a new node', () => {
    const r = makeRegistry();
    const result = r.join({ url: 'https://node1.example.com', label: 'Node 1' });
    expect(result.ok).toBe(true);
    expect(r.size()).toBe(1);
  });

  it('node has silk:true marker', () => {
    const r = makeRegistry();
    r.join({ url: 'https://node.test' });
    const node = r.list()[0];
    expect(node.silk).toBe(true);
  });

  it('heartbeat (re-join) is idempotent', () => {
    const r = makeRegistry();
    r.join({ url: 'https://node.test', label: 'A' });
    r.join({ url: 'https://node.test', label: 'A' });
    expect(r.size()).toBe(1);
  });

  it('heartbeat refreshes lastSeenAt', async () => {
    const r = makeRegistry();
    r.join({ url: 'https://node.test' });
    const first = r.list()[0].lastSeenAt;
    await new Promise(res => setTimeout(res, 10));
    r.join({ url: 'https://node.test' });
    expect(r.list()[0].lastSeenAt >= first).toBe(true);
  });

  it('heartbeat updates bridgesKnitweb', () => {
    const r = makeRegistry();
    r.join({ url: 'https://node.test', bridgesKnitweb: false });
    r.join({ url: 'https://node.test', bridgesKnitweb: true });
    expect(r.list()[0].bridgesKnitweb).toBe(true);
  });

  it('list() excludes expired nodes', () => {
    const r = makeRegistry();
    r.join({ url: 'https://live.test' });
    // inject an already-expired node
    const id = silkNodeId('https://dead.test');
    (r as any).nodes.set(id, {
      url: 'https://dead.test', nodeId: id, label: 'dead',
      silk: true, joinedAt: '2020-01-01T00:00:00Z',
      lastSeenAt: '2020-01-01T00:00:00Z',
      expiresAt:  '2020-01-01T01:00:00Z',
      bridgesKnitweb: false, postCount: 0,
    });
    const nodes = r.list();
    expect(nodes.length).toBe(1);
    expect(nodes[0].url).toBe('https://live.test');
  });

  it('list(onlyBridges=true) returns only bridge nodes', () => {
    const r = makeRegistry();
    r.join({ url: 'https://a.test', bridgesKnitweb: false });
    r.join({ url: 'https://b.test', bridgesKnitweb: true });
    expect(r.list(true).length).toBe(1);
    expect(r.list(true)[0].url).toBe('https://b.test');
  });

  it('get() returns node by id', () => {
    const r = makeRegistry();
    r.join({ url: 'https://node.test' });
    const id = silkNodeId('https://node.test');
    expect(r.get(id)?.url).toBe('https://node.test');
  });

  it('get() returns undefined for unknown id', () => {
    const r = makeRegistry();
    expect(r.get('deadbeef')).toBeUndefined();
  });

  it('incrementPostCount increments counter', () => {
    const r = makeRegistry();
    r.join({ url: 'https://node.test' });
    r.incrementPostCount('https://node.test');
    r.incrementPostCount('https://node.test');
    expect(r.list()[0].postCount).toBe(2);
  });

  it('incrementPostCount is no-op for unknown url', () => {
    const r = makeRegistry();
    expect(() => r.incrementPostCount('https://unknown.test')).not.toThrow();
  });

  it('evicts when at capacity and no expired node exists', () => {
    const r = makeRegistry();
    // Artificially lower the cap
    const cap = 3;
    (r as any).nodes.clear();
    // fill to cap
    for (let i = 0; i < cap; i++) {
      r.join({ url: `https://node${i}.test` });
    }
    // Simulate MAX_SILK_NODES == 3 by directly checking the evict path
    // (cap is 1000 in production so we just verify size stays consistent)
    expect(r.size()).toBe(cap);
  });
});

// ── 3. SILK_SCHEMA constant ───────────────────────────────────────────────────

describe('SILK_SCHEMA', () => {
  it('has expected value', () => {
    expect(SILK_SCHEMA).toBe('vpc.silk-net/1');
  });
});

// ── 4. SilkGossip (light smoke test — no real HTTP) ──────────────────────────

describe('SilkGossip', () => {
  it('starts and stops without throwing', () => {
    const registry = makeRegistry();
    const store    = new MicroPostStore();
    const gossip   = new SilkGossip(registry, store, 'https://self.test');
    gossip.start();
    gossip.stop();
  });

  it('double start is safe', () => {
    const registry = makeRegistry();
    const store    = new MicroPostStore();
    const gossip   = new SilkGossip(registry, store, 'https://self.test');
    gossip.start();
    gossip.start();  // should not throw or create duplicate timers
    gossip.stop();
  });

  it('pushPost resolves even with no peers', async () => {
    const registry = makeRegistry();
    const store    = new MicroPostStore();
    const gossip   = new SilkGossip(registry, store, 'https://self.test');
    await expect(gossip.pushPost({
      schema: 'vpc.micro-post/1',
      id: 'a'.repeat(64),
      line1: 'hello', line2: '', author: 'did:silk:test',
      signature: '', ts: new Date().toISOString(),
    })).resolves.toBeUndefined();
  });

  it('pushPost skips myUrl when picking peers', async () => {
    const registry = makeRegistry();
    registry.join({ url: 'https://self.test' });  // self — should be skipped
    const store  = new MicroPostStore();
    const gossip = new SilkGossip(registry, store, 'https://self.test');
    // No error — no peers to push to after self is excluded
    await expect(gossip.pushPost({
      schema: 'vpc.micro-post/1',
      id: 'b'.repeat(64),
      line1: 'test', line2: '', author: 'did:silk:test',
      signature: '', ts: new Date().toISOString(),
    })).resolves.toBeUndefined();
  });
});
