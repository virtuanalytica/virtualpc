import {
  buildCodexArgs, parseLoginStatus, classifyRun, CodexExecOptions,
} from '../../src/codex/exec';

/**
 * Unit tests for the Codex bridge pure core (argv builder + result classifier).
 */

describe('buildCodexArgs', () => {
  it('requires a prompt', () => {
    expect(() => buildCodexArgs({} as CodexExecOptions)).toThrow(/prompt is required/);
    expect(() => buildCodexArgs({ prompt: '   ' })).toThrow(/prompt is required/);
  });

  it('defaults to read-only sandbox + skip-git-repo-check, prompt last', () => {
    const a = buildCodexArgs({ prompt: 'do a thing' });
    expect(a[0]).toBe('exec');
    expect(a).toContain('-s');
    expect(a[a.indexOf('-s') + 1]).toBe('read-only');
    expect(a).toContain('--skip-git-repo-check');
    expect(a[a.length - 1]).toBe('do a thing');           // prompt is the positional arg
  });

  it('maps model + xhigh reasoning effort to the right flags', () => {
    const a = buildCodexArgs({ prompt: 'p', model: 'gpt-5.5-codex', reasoningEffort: 'xhigh' });
    expect(a[a.indexOf('-m') + 1]).toBe('gpt-5.5-codex');
    expect(a).toContain('-c');
    expect(a[a.indexOf('-c') + 1]).toBe('model_reasoning_effort="xhigh"');
  });

  it('honours an explicit sandbox and can disable the git check', () => {
    const a = buildCodexArgs({ prompt: 'p', sandbox: 'workspace-write', skipGitRepoCheck: false });
    expect(a[a.indexOf('-s') + 1]).toBe('workspace-write');
    expect(a).not.toContain('--skip-git-repo-check');
  });
});

describe('parseLoginStatus', () => {
  it('reads logged-in + method', () => {
    expect(parseLoginStatus('Logged in using ChatGPT')).toEqual({ loggedIn: true, method: 'ChatGPT' });
    expect(parseLoginStatus('Not logged in')).toEqual({ loggedIn: false });
  });
});

describe('classifyRun', () => {
  it('exit 0 → ok with the last message preferred over stdout', () => {
    const r = classifyRun({ exitCode: 0, timedOut: false, lastMessage: ' answer ', stdout: 'noise' });
    expect(r.ok).toBe(true);
    expect(r.message).toBe('answer');
  });
  it('timeout → not ok', () => {
    const r = classifyRun({ exitCode: null, timedOut: true });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/timed out/);
  });
  it('non-zero exit → not ok, carries stderr', () => {
    const r = classifyRun({ exitCode: 2, timedOut: false, stderr: 'boom' });
    expect(r.ok).toBe(false);
    expect(r.error).toBe('boom');
  });
});
