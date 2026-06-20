/**
 * Codex bridge — pure core.
 *
 * VirtualPC's agent fleet reaches cloud models through the LiteLLM gateway with
 * a pay-per-token OpenAI API key. That key can hit `insufficient_quota` when no
 * API billing is funded. Codex CLI is the alternative: signed in with a ChatGPT
 * account it runs on the *subscription* (within the plan's rate limits), at no
 * per-token API cost. This module routes coding tasks to `codex exec` so that
 * work is billed to the subscription instead of the API.
 *
 * This file is the pure part: it builds the `codex exec` argv and classifies a
 * run's outcome. No process spawning, no I/O — unit-tested. See ./index for the
 * adapter that actually runs it and the routes.
 */

export type CodexSandbox = 'read-only' | 'workspace-write' | 'danger-full-access';

export interface CodexExecOptions {
  /** Instructions for the agent (passed as the prompt argument). */
  prompt: string;
  /** Model the agent should use, e.g. `gpt-5.5-codex`. Omit for Codex's default. */
  model?: string;
  /**
   * Reasoning effort. Maps to `-c model_reasoning_effort="<level>"`. `xhigh` is
   * the max-effort tier the senior dev + PhD reviewer roles run at; juniors run
   * lower. Omit to use the model default.
   */
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  /** Working directory for the run (-C). */
  cwd?: string;
  /**
   * Sandbox policy for model-generated shell commands. Defaults to read-only —
   * the safe choice for an API-triggered run. Callers must opt in explicitly to
   * let Codex write.
   */
  sandbox?: CodexSandbox;
  /** Pass --skip-git-repo-check (default true) so non-git dirs work. */
  skipGitRepoCheck?: boolean;
  /** File the final assistant message is written to (-o). */
  outputFile?: string;
  /** Emit JSONL events on stdout (--json). */
  json?: boolean;
}

/**
 * Build the argv for `codex exec` (everything after the binary name). Using an
 * argv array — not a shell string — means the prompt is passed verbatim with no
 * shell-injection surface.
 */
export function buildCodexArgs(o: CodexExecOptions): string[] {
  if (!o || !o.prompt || !String(o.prompt).trim()) {
    throw new Error('codex: prompt is required');
  }
  const args: string[] = ['exec'];
  if (o.model) args.push('-m', o.model);
  if (o.reasoningEffort) args.push('-c', `model_reasoning_effort="${o.reasoningEffort}"`);
  if (o.cwd) args.push('-C', o.cwd);
  args.push('-s', o.sandbox || 'read-only');
  if (o.skipGitRepoCheck !== false) args.push('--skip-git-repo-check');
  if (o.outputFile) args.push('-o', o.outputFile);
  if (o.json) args.push('--json');
  // Prompt always last so it is unambiguously the positional argument.
  args.push(o.prompt);
  return args;
}

/** Parse `codex login status` output into a logged-in boolean. */
export function parseLoginStatus(stdout: string): { loggedIn: boolean; method?: string } {
  const s = (stdout || '').trim();
  if (/not logged in/i.test(s)) return { loggedIn: false };
  const m = s.match(/logged in(?:\s+using\s+(.+))?/i);
  if (m) return { loggedIn: true, method: (m[1] || '').trim() || undefined };
  return { loggedIn: false };
}

export interface CodexRunResult {
  ok: boolean;
  message: string;       // final assistant message (or error text)
  exitCode: number | null;
  timedOut: boolean;
  error?: string;
}

/**
 * Turn a raw process outcome into a classified result. `lastMessage` is the
 * contents of the -o output file (the clean final answer); `stdout`/`stderr`
 * are fallbacks when no output file was captured.
 */
export function classifyRun(p: {
  exitCode: number | null;
  timedOut: boolean;
  lastMessage?: string;
  stdout?: string;
  stderr?: string;
}): CodexRunResult {
  if (p.timedOut) {
    return { ok: false, message: '', exitCode: p.exitCode, timedOut: true, error: 'codex exec timed out' };
  }
  const msg = (p.lastMessage && p.lastMessage.trim())
    || (p.stdout && p.stdout.trim())
    || '';
  if (p.exitCode === 0) {
    return { ok: true, message: msg, exitCode: 0, timedOut: false };
  }
  return {
    ok: false,
    message: msg,
    exitCode: p.exitCode,
    timedOut: false,
    error: (p.stderr && p.stderr.trim()) || `codex exec exited with code ${p.exitCode}`,
  };
}
