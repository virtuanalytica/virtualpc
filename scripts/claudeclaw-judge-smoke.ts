/**
 * Cloud-judge smoke test: claude-haiku as judge must accept a known-good
 * pair and reject a known-bad pair. Exits non-zero on failure.
 * Run: npx ts-node scripts/claudeclaw-judge-smoke.ts
 */
import { ClaudeClawCore } from '../src/integrations/claudeclaw';

async function main() {
  const core = new ClaudeClawCore({ models: { judge: 'claude-haiku-4-5-20251001' } });
  const good = await core.judge(
    'What is the capital of France? One sentence.',
    'The capital of France is Paris.'
  );
  console.log('GOOD pair  →', good.score, good.accepted ? 'accept' : 'reject', good.hallucinationFlags);
  const bad = await core.judge(
    'What is the capital of Australia? One sentence.',
    'The capital of Australia is Sydney.'
  );
  console.log('BAD pair   →', bad.score, bad.accepted ? 'accept' : 'reject', bad.hallucinationFlags);
  const ok = good.accepted && !bad.accepted;
  console.log(ok ? 'SMOKE PASS' : 'SMOKE FAIL');
  process.exit(ok ? 0 : 1);
}
main();
