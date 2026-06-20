/**
 * ContainmentGuard MEGA — Default Policy ("MEGA" ruleset)
 *
 * A comprehensive, defense-in-depth default. Tuned to be SAFE-BY-DEFAULT but
 * NON-BREAKING: the guard ships in `monitor` mode (logs breaches, never blocks)
 * unless CONTAINMENT_ENFORCE=true, matching the codebase convention used by
 * internalWriteAuth (INTERNAL_WRITE_ENFORCE) and securityHeaders
 * (ENFORCE_STRICT_SECURITY).
 *
 * Everything here is overridable via env or the /api/containment/policy surface.
 */

import * as os from 'os';
import * as path from 'path';
import type { ContainmentPolicy, CommandRule, CapabilityTier, TierCapabilities } from './types';

const HOME = os.homedir();

/**
 * Dangerous-command ruleset. Each is a deny/contain pattern with a reason.
 * Patterns are matched case-insensitively against the normalised command line.
 *
 * NOTE: these mirror and EXTEND the deny rules in ~/.claude/settings.json so the
 * platform enforces the same guarantees the user set for Claude Code itself.
 */
export const MEGA_COMMAND_RULES: CommandRule[] = [
  // ── Catastrophic filesystem destruction ────────────────────────────────
  // Order-independent: lookaheads require a recursive flag AND a force flag in
  // ANY arrangement (-rf, -fr, -r -f, --recursive --force) plus a fatal target.
  // This survives flag-reordering bypasses that a fixed r-then-f regex misses.
  { id: 'rm-rf-root', pattern: /\brm\b(?=[^\n]*(?:-[a-z]*r|--recursive))(?=[^\n]*(?:-[a-z]*f|--force))(?=[^\n]*\s\/(?:\s|$|\*))/i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'rm -rf targeting filesystem root' },
  { id: 'rm-rf-home', pattern: /\brm\b(?=[^\n]*(?:-[a-z]*r|--recursive))(?=[^\n]*(?:-[a-z]*f|--force))(?=[^\n]*\s(?:~|\$HOME)(?:\/|\s|$))/i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'rm -rf targeting home directory' },
  { id: 'no-preserve-root', pattern: /--no-preserve-root/i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'rm --no-preserve-root' },

  // ── Fork bomb / resource exhaustion ────────────────────────────────────
  { id: 'fork-bomb', pattern: /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, category: 'resource-limit', severity: 'critical', decision: 'deny', reason: 'shell fork bomb' },
  { id: 'yes-pipe', pattern: /\byes\b[^|]*\|\s*(sh|bash)\b/i, category: 'resource-limit', severity: 'warning', decision: 'contain', reason: 'yes piped into a shell' },

  // ── Disk / device clobbering ───────────────────────────────────────────
  { id: 'dd-to-device', pattern: /\bdd\b[^\n]*\bof=\/dev\/(sd|nvme|vd|hd|mmcblk|disk)/i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'dd writing to a block device' },
  { id: 'mkfs', pattern: /\bmkfs(\.\w+)?\s+\/dev\//i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'formatting a device' },
  { id: 'redirect-to-device', pattern: />\s*\/dev\/(sd|nvme|vd|hd|mmcblk)/i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'redirecting output onto a block device' },

  // ── Remote-code execution (pipe-to-shell) ──────────────────────────────
  { id: 'curl-pipe-sh', pattern: /\b(curl|wget|fetch)\b[^\n]*\|\s*(sudo\s+)?(sh|bash|zsh|python[0-9.]*|node|perl|ruby)\b/i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'piping a remote download directly into an interpreter' },
  { id: 'bash-process-sub-remote', pattern: /\b(bash|sh|zsh)\b\s+<\(\s*(curl|wget)/i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'executing a remotely-fetched script via process substitution' },

  // ── Reverse shells / backdoors ─────────────────────────────────────────
  { id: 'dev-tcp', pattern: /\/dev\/(tcp|udp)\//i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: '/dev/tcp reverse-shell primitive' },
  { id: 'nc-exec', pattern: /\bn(c|cat)\b[^\n]*\s-{1,2}e\b/i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'netcat -e backdoor' },
  { id: 'bash-i-net', pattern: /\bbash\s+-i\b[^\n]*(>&|>|<)\s*\/dev\/(tcp|udp)/i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'interactive bash bound to a socket' },

  // ── Credential / secret exfiltration ───────────────────────────────────
  { id: 'read-ssh-keys', pattern: /(cat|cp|tar|scp|rsync|less|head|tail|base64)\b[^\n]*(\.ssh\/(id_|authorized_keys)|\/etc\/shadow|\.aws\/credentials|\.gnupg\/)/i, category: 'secret-access', severity: 'critical', decision: 'deny', reason: 'reading private keys / credential stores' },
  { id: 'env-exfil', pattern: /\b(env|printenv|set)\b[^\n]*\|\s*(curl|wget|nc|ncat)\b/i, category: 'secret-access', severity: 'critical', decision: 'deny', reason: 'piping environment (secrets) to the network' },
  { id: 'exfil-secret-curl', pattern: /\b(curl|wget)\b[^\n]*(--data|--upload-file|-d\s|-T\s|-F\s)[^\n]*(token|secret|password|api[_-]?key|\.env|id_rsa|credentials)/i, category: 'secret-access', severity: 'critical', decision: 'deny', reason: 'uploading secret-bearing data to a remote host' },

  // ── Privilege escalation / security disabling ──────────────────────────
  { id: 'disable-firewall', pattern: /\b(iptables\s+-F|ufw\s+disable|setenforce\s+0|systemctl\s+stop\s+(firewalld|apparmor))\b/i, category: 'privilege-escalation', severity: 'critical', decision: 'deny', reason: 'disabling host security controls' },
  { id: 'chmod-777-root', pattern: /\bchmod\s+(-R\s+)?0?777\s+(\/(\s|$)|\/(etc|usr|bin|boot|root))/i, category: 'privilege-escalation', severity: 'critical', decision: 'deny', reason: 'world-writable on a system path' },
  { id: 'add-sudoer', pattern: /(>>?\s*\/etc\/sudoers|visudo)/i, category: 'privilege-escalation', severity: 'critical', decision: 'deny', reason: 'editing the sudoers file' },
  { id: 'passwd-root', pattern: /\b(passwd\s+root|usermod\b[^\n]*\b-aG\s+sudo)\b/i, category: 'privilege-escalation', severity: 'critical', decision: 'deny', reason: 'changing root / granting sudo' },

  // ── Host lifecycle ─────────────────────────────────────────────────────
  { id: 'shutdown-reboot', pattern: /\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/i, category: 'dangerous-command', severity: 'warning', decision: 'contain', reason: 'host shutdown/reboot' },
  { id: 'kill-init', pattern: /\bkill\s+-9\s+1\b/i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'killing PID 1' },

  // ── Source-control footguns (mirror settings.json deny list) ───────────
  { id: 'force-push-main', pattern: /\bgit\s+push\b[^\n]*(--force|-f)\b[^\n]*\b(origin\s+)?(main|master)\b/i, category: 'dangerous-command', severity: 'critical', decision: 'deny', reason: 'force-push to main/master' },
  { id: 'git-reset-hard-remote', pattern: /\bgit\s+reset\s+--hard\s+origin\/(main|master)\b/i, category: 'dangerous-command', severity: 'warning', decision: 'contain', reason: 'hard reset onto remote main/master' },
  { id: 'git-clean-fdx', pattern: /\bgit\s+clean\s+-[a-z]*f[a-z]*d[a-z]*x\b/i, category: 'dangerous-command', severity: 'warning', decision: 'contain', reason: 'git clean -fdx wipes untracked + ignored files' },

  // ── Log / history tampering (anti-forensics) ───────────────────────────
  { id: 'wipe-history', pattern: /\b(history\s+-c|>\s*~?\/?\.bash_history|truncate\s+-s\s*0\s+\/var\/log)/i, category: 'privilege-escalation', severity: 'warning', decision: 'contain', reason: 'history/log tampering' },

  // ── Crypto-miner signatures ────────────────────────────────────────────
  { id: 'miner', pattern: /\b(xmrig|minerd|cgminer|ethminer|cpuminer|stratum\+tcp:)\b/i, category: 'resource-limit', severity: 'critical', decision: 'deny', reason: 'cryptocurrency-miner signature' },
];

/** Default per-tier capabilities. Lower tiers progressively lose capabilities. */
const TIER_CAPS: Record<CapabilityTier, TierCapabilities> = {
  trusted: { shell: true, fsWrite: true, network: true, spawn: true, maxCommandsPerMinute: 240, maxProcesses: 32 },
  standard: { shell: true, fsWrite: true, network: true, spawn: true, maxCommandsPerMinute: 120, maxProcesses: 16 },
  restricted: { shell: true, fsWrite: true, network: false, spawn: false, maxCommandsPerMinute: 40, maxProcesses: 4 },
  untrusted: { shell: false, fsWrite: false, network: false, spawn: false, maxCommandsPerMinute: 0, maxProcesses: 0 },
};

function envList(name: string, fallback: string[]): string[] {
  const v = process.env[name];
  if (!v) return fallback;
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Build the default MEGA policy, honouring env overrides. */
export function buildDefaultPolicy(): ContainmentPolicy {
  const projectRoots = [
    path.join(HOME, 'virtualpc'),
    path.join(HOME, 'molgang-roblox'),
    path.join(HOME, 'molgang-backup'),
    '/media/knight2/EDS2/projects/molgang-web',
    path.join(HOME, '.claude', 'projects'), // memory + task state
    os.tmpdir(),
  ];

  return {
    mode: process.env.CONTAINMENT_ENFORCE === 'true' ? 'enforce' : 'monitor',

    commandRules: MEGA_COMMAND_RULES,

    allowedWriteRoots: envList('CONTAINMENT_WRITE_ROOTS', projectRoots),
    protectedPaths: envList('CONTAINMENT_PROTECTED_PATHS', [
      path.join(HOME, '.ssh'),
      path.join(HOME, '.aws'),
      path.join(HOME, '.gnupg'),
      path.join(HOME, '.config', 'gcloud'),
      '/etc/shadow',
      '/etc/sudoers',
      '/etc/passwd',
      path.join(HOME, '.claude', 'settings.json'),
      path.join(HOME, '.claude', '.credentials'),
    ]),

    egressMode: (process.env.CONTAINMENT_EGRESS_MODE as any) || 'allow-all',
    egressAllowHosts: envList('CONTAINMENT_EGRESS_ALLOW', [
      'localhost', '127.0.0.1', '::1',
      'github.com', 'codeload.github.com', 'raw.githubusercontent.com',
      'registry.npmjs.org', 'pypi.org', 'files.pythonhosted.org',
      'api.anthropic.com', 'huggingface.co', 'objects.githubusercontent.com',
    ]),
    egressDenyHosts: envList('CONTAINMENT_EGRESS_DENY', [
      // known paste/exfil sinks — denied even in allow-all mode
      'pastebin.com', 'paste.ee', 'ix.io', 'transfer.sh', 'file.io',
      'requestbin.com', 'webhook.site', 'ngrok.io', 'burpcollaborator.net',
    ]),

    maxCommandsPerMinute: Number(process.env.CONTAINMENT_MAX_CMD_PER_MIN) || 120,
    maxProcessesPerAgent: Number(process.env.CONTAINMENT_MAX_PROC) || 16,
    loopRepeatThreshold: Number(process.env.CONTAINMENT_LOOP_REPEAT) || 12,
    loopWindowMs: 60_000,

    agentTiers: {
      // Known platform agents (see memory: 5-agent coordinator, governance).
      Athena: 'trusted',
      Alexander: 'trusted',
      Fill: 'trusted',
      Kai: 'standard',
      Zip: 'standard',
      Mira: 'standard',
      Luna: 'standard',
      CEO: 'trusted',
    },
    defaultTier: (process.env.CONTAINMENT_DEFAULT_TIER as CapabilityTier) || 'standard',
    tierCapabilities: TIER_CAPS,
  };
}
