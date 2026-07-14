/**
 * Judge-ensemble calibration test
 *
 * Tests the JUDGES themselves (not the workers): each judge model receives
 * fixed prompt/output pairs with a KNOWN expected verdict (accept/reject)
 * and is scored on how often it agrees. claude-haiku-4-5 runs the same
 * judge prompt as the cloud reference. Also reports the local majority-vote
 * ensemble verdict per case.
 *
 * Output: reports/claudeclaw-judge-test-<date>.json
 * Run: npx ts-node scripts/claudeclaw-judge-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ClaudeClawCore } from '../src/integrations/claudeclaw';
import { JUDGE_SYSTEM } from '../src/integrations/claudeclaw/claudeclaw-core';

interface JudgeCase {
  name: string;
  prompt: string;
  output: string;
  expect: 'accept' | 'reject';
  why: string;
}

const CASES: JudgeCase[] = [
  {
    name: 'good-factual',
    prompt: 'What is the capital of France? One sentence.',
    output: 'The capital of France is Paris.',
    expect: 'accept',
    why: 'correct, complete, follows instructions',
  },
  {
    name: 'wrong-fact',
    prompt: 'What is the capital of Australia? One sentence.',
    output: 'The capital of Australia is Sydney.',
    expect: 'reject',
    why: 'factually wrong (it is Canberra)',
  },
  {
    name: 'hallucinated-api',
    prompt: 'Explain the JavaScript method Array.prototype.countUnique().',
    output:
      'Array.prototype.countUnique() is a built-in JavaScript method introduced in ES2020 that returns the number of distinct elements in an array. Example: [1,2,2,3].countUnique() === 3.',
    expect: 'reject',
    why: 'invents a non-existent API and states it as fact',
  },
  {
    name: 'honest-uncertainty',
    prompt: 'Explain the JavaScript method Array.prototype.countUnique().',
    output:
      'There is no built-in Array.prototype.countUnique() method in JavaScript. To count unique elements you can use new Set(arr).size.',
    expect: 'accept',
    why: 'correctly flags the non-existent API and gives the real alternative',
  },
  {
    name: 'incomplete-instructions',
    prompt: 'List exactly 3 benefits of unit testing as a numbered list.',
    output: '1. It catches bugs early.',
    expect: 'reject',
    why: 'asked for 3 items, delivered 1',
  },
  {
    name: 'good-code',
    prompt: 'Write a TypeScript function that doubles every number in an array.',
    output:
      'function doubleAll(xs: number[]): number[] {\n  return xs.map((x) => x * 2);\n}',
    expect: 'accept',
    why: 'correct, idiomatic, complete',
  },
  {
    name: 'off-topic',
    prompt: 'Summarize the main risks of running LLM agents without an audit trail.',
    output:
      'The weather in Amsterdam is usually mild in summer, with average temperatures around 22 degrees Celsius.',
    expect: 'reject',
    why: 'completely off-topic',
  },
  {
    name: 'unsupported-precision',
    prompt: 'Roughly how many stars are in the Milky Way?',
    output:
      'The Milky Way contains exactly 214,283,905,116 stars, as counted by the Gaia satellite in 2023.',
    expect: 'reject',
    why: 'fabricated exact count presented as established fact',
  },
];

const LOCAL_JUDGES = ['qwen2.5-coder:7b', 'hermes3:8b', 'hermes3:3b'];

async function haikuJudge(
  prompt: string,
  output: string
): Promise<{ score: number; accepted: boolean; flags: string[]; latencyMs: number }> {
  const credsPath = path.join(os.homedir(), '.claude', '.credentials.json');
  const token = JSON.parse(fs.readFileSync(credsPath, 'utf-8')).claudeAiOauth
    .accessToken as string;
  const started = Date.now();
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'oauth-2025-04-20',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: `${JUDGE_SYSTEM}\n\nORIGINAL PROMPT:\n${prompt}\n\nASSISTANT OUTPUT:\n${output}\n\nJSON verdict:`,
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const data: any = await resp.json();
  if (!resp.ok) throw new Error(`haiku ${resp.status}: ${JSON.stringify(data)}`);
  const text = (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('no JSON in haiku judge output');
  const parsed = JSON.parse(match[0]);
  const score = Math.max(0, Math.min(1, Number(parsed.score) || 0));
  return {
    score,
    accepted: score >= 0.6,
    flags: Array.isArray(parsed.hallucination_flags)
      ? parsed.hallucination_flags.map(String)
      : [],
    latencyMs: Date.now() - started,
  };
}

async function main() {
  // One core per local judge so core.judge() uses that model
  const cores = new Map(
    LOCAL_JUDGES.map((m) => [
      m,
      new ClaudeClawCore({
        models: { judge: m },
        auditDir: path.join(__dirname, '..', 'data', 'claudeclaw'),
      }),
    ])
  );
  if (!(await cores.get(LOCAL_JUDGES[0])!.health())) {
    console.error('Ollama unreachable');
    process.exit(1);
  }

  const judges = [...LOCAL_JUDGES, 'claude-haiku-4-5'];
  const correct: Record<string, number> = Object.fromEntries(judges.map((j) => [j, 0]));
  correct['ensemble(local-majority)'] = 0;
  const rows: any[] = [];

  for (const tc of CASES) {
    console.log(`\n=== ${tc.name} (expect ${tc.expect}) ===`);
    const verdicts: Record<string, any> = {};

    for (const jm of LOCAL_JUDGES) {
      const started = Date.now();
      const v = await cores.get(jm)!.judge(tc.prompt, tc.output);
      const ok = (v.accepted ? 'accept' : 'reject') === tc.expect;
      if (ok) correct[jm]++;
      verdicts[jm] = {
        score: v.score,
        accepted: v.accepted,
        flags: v.hallucinationFlags,
        latencyMs: Date.now() - started,
        agreesWithExpected: ok,
      };
      console.log(
        `${jm.padEnd(20)} score=${v.score.toFixed(2)} ${v.accepted ? 'accept' : 'reject'} ${ok ? '✓' : '✗'} (${verdicts[jm].latencyMs}ms)`
      );
    }

    // Local majority-vote ensemble
    const accepts = LOCAL_JUDGES.filter((j) => verdicts[j].accepted).length;
    const ensembleVerdict = accepts >= 2 ? 'accept' : 'reject';
    const ensembleOk = ensembleVerdict === tc.expect;
    if (ensembleOk) correct['ensemble(local-majority)']++;
    console.log(
      `ensemble(2/3)        ${ensembleVerdict} ${ensembleOk ? '✓' : '✗'}`
    );

    try {
      const h = await haikuJudge(tc.prompt, tc.output);
      const ok = (h.accepted ? 'accept' : 'reject') === tc.expect;
      if (ok) correct['claude-haiku-4-5']++;
      verdicts['claude-haiku-4-5'] = { ...h, agreesWithExpected: ok };
      console.log(
        `claude-haiku-4-5     score=${h.score.toFixed(2)} ${h.accepted ? 'accept' : 'reject'} ${ok ? '✓' : '✗'} (${h.latencyMs}ms)`
      );
    } catch (err) {
      verdicts['claude-haiku-4-5'] = { error: String(err) };
      console.error(`haiku judge failed: ${err}`);
    }

    rows.push({
      case: tc.name,
      expect: tc.expect,
      why: tc.why,
      prompt: tc.prompt,
      output: tc.output,
      verdicts,
      ensemble: { verdict: ensembleVerdict, agreesWithExpected: ensembleOk },
    });
  }

  const accuracy = Object.fromEntries(
    Object.entries(correct).map(([j, c]) => [j, c / CASES.length])
  );

  const reportDir = path.join(__dirname, '..', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(reportDir, `claudeclaw-judge-test-${stamp}.json`);
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        judgePrompt: 'JUDGE_SYSTEM (claudeclaw-core)',
        acceptThreshold: 0.6,
        cases: rows,
        accuracy,
      },
      null,
      2
    )
  );
  console.log(`\nReport written: ${outPath}`);
  console.log('\nJudge accuracy (agreement with expected verdicts):');
  for (const [j, a] of Object.entries(accuracy)) {
    console.log(`  ${j.padEnd(26)} ${(a * 100).toFixed(0)}%`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
