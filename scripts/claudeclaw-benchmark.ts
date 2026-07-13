/**
 * ClaudeClaw integration benchmark
 *
 * 1. Smoke-tests the dominant core (generate -> judge -> audit) on local
 *    Ollama models.
 * 2. Runs the same prompts against claude-haiku-4-5 (via the `claude` CLI)
 *    as the reference model.
 * 3. Scores ALL outputs with the same independent judge (deepseek-r1:8b)
 *    and writes a comparison report to reports/claudeclaw-benchmark-<date>.json
 *
 * Run: npx ts-node scripts/claudeclaw-benchmark.ts
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { ClaudeClawCore } from '../src/integrations/claudeclaw';
import { checkHealth } from '../src/integrations/claudeclaw';

const execFileAsync = promisify(execFile);

interface TestCase {
  name: string;
  tier: 'light' | 'standard' | 'coder';
  prompt: string;
}

const CASES: TestCase[] = [
  {
    name: 'factual-grounding',
    tier: 'standard',
    prompt:
      'What is the capital of Australia, and what is the largest city of Australia? Answer in exactly two short sentences.',
  },
  {
    name: 'code-generation',
    tier: 'coder',
    prompt:
      'Write a TypeScript function `median(xs: number[]): number` that returns the median of a numeric array. Handle even-length arrays. Only output the function, no explanation.',
  },
  {
    name: 'hallucination-bait',
    tier: 'standard',
    prompt:
      'Explain the `Array.prototype.shuffleInPlace()` method in JavaScript. If it does not exist, say so clearly.',
  },
  {
    name: 'summarization',
    tier: 'light',
    prompt:
      'Summarize in one sentence: "Knitweb is a pure-Python peer-to-peer network with a token called PLS and a coin called Fiber. It publishes signed feeds between federated peers and uses a revocable personhood anchor to prevent sybil attacks without collecting personal data."',
  },
  {
    name: 'instruction-following',
    tier: 'standard',
    prompt:
      'List exactly 3 risks of running an LLM agent without an audit trail. Format: numbered list, max 12 words per item.',
  },
];

async function callHaiku(prompt: string): Promise<{ output: string; latencyMs: number }> {
  const started = Date.now();
  const { stdout } = await execFileAsync(
    'claude',
    ['-p', '--model', 'claude-haiku-4-5-20251001', prompt],
    { timeout: 120_000, maxBuffer: 1024 * 1024 }
  );
  return { output: stdout.trim(), latencyMs: Date.now() - started };
}

async function main() {
  const health = checkHealth();
  console.log('ClaudeClaw bridge health:', health);

  const core = new ClaudeClawCore({
    auditDir: path.join(__dirname, '..', 'data', 'claudeclaw'),
  });
  if (!(await core.health())) {
    console.error('Ollama unreachable — start it with: systemctl --user start ollama');
    process.exit(1);
  }

  const rows: any[] = [];
  for (const tc of CASES) {
    console.log(`\n=== ${tc.name} (${tc.tier}) ===`);

    // Local pipeline: generate + judge + audit
    const local = await core.run({
      prompt: tc.prompt,
      tier: tc.tier,
      context: `benchmark:${tc.name}`,
    });
    console.log(
      `local  ${local.model}  score=${local.verdict?.score.toFixed(2)}  ` +
        `accepted=${local.verdict?.accepted}  esc=${local.escalations}  ${local.latencyMs}ms`
    );

    // Reference: claude-haiku-4-5 via claude CLI, judged by the same judge
    let haiku: any = null;
    try {
      const h = await callHaiku(tc.prompt);
      const hVerdict = await core.judge(tc.prompt, h.output);
      haiku = { ...h, verdict: hVerdict };
      console.log(
        `haiku  claude-haiku-4-5  score=${hVerdict.score.toFixed(2)}  ` +
          `accepted=${hVerdict.accepted}  ${h.latencyMs}ms`
      );
    } catch (err) {
      console.error(`haiku call failed: ${err}`);
      haiku = { error: String(err) };
    }

    rows.push({
      case: tc.name,
      tier: tc.tier,
      prompt: tc.prompt,
      local: {
        model: local.model,
        output: local.output,
        score: local.verdict?.score,
        accepted: local.verdict?.accepted,
        hallucinationFlags: local.verdict?.hallucinationFlags,
        escalations: local.escalations,
        latencyMs: local.latencyMs,
      },
      haiku: haiku.error
        ? { error: haiku.error }
        : {
            model: 'claude-haiku-4-5',
            output: haiku.output,
            score: haiku.verdict.score,
            accepted: haiku.verdict.accepted,
            hallucinationFlags: haiku.verdict.hallucinationFlags,
            latencyMs: haiku.latencyMs,
          },
    });
  }

  const reportDir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(reportDir, `claudeclaw-benchmark-${stamp}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), judge: 'deepseek-r1:8b', cases: rows },
      null,
      2
    )
  );
  console.log(`\nReport written: ${outPath}`);

  // Summary table
  console.log('\ncase                  local(score/ms)     haiku(score/ms)');
  for (const r of rows) {
    const l = r.local;
    const h = r.haiku.error ? { score: NaN, latencyMs: NaN } : r.haiku;
    console.log(
      `${r.case.padEnd(22)}${String(l.score?.toFixed(2)).padEnd(6)}${String(l.latencyMs).padEnd(12)}` +
        `${String(h.score?.toFixed ? h.score.toFixed(2) : 'ERR').padEnd(6)}${h.latencyMs ?? ''}`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
