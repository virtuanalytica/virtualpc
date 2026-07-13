"use strict";
/**
 * LM Studio agent-inference backend.
 *
 * Thin wrapper around the OpenAI-compatible API at http://127.0.0.1:1234/v1.
 * Per-agent model routing lets us send chat tasks to Gemma 4 26B, code tasks
 * to Devstral 24B, arbitration to Qwen 3.5 27B, cheap tasks to Phi-4,
 * reasoning to DeepSeek R1 Qwen3-8B. Model list matches what's on EDS2.
 *
 * Graceful degradation: if the server is down or the model isn't loaded,
 * endpoints return a structured error the UI can display rather than 500'ing.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLastThroughput = getLastThroughput;
exports.getModels = getModels;
exports.healthCheck = healthCheck;
exports.chatAsAgent = chatAsAgent;
exports.systemPromptForAgent = systemPromptForAgent;
const logger_1 = __importDefault(require("./utils/logger"));
const child_process_1 = require("child_process");
const shared_1 = require("./integrations/kafka/shared");
const secretsBootstrap_1 = require("./security/secretsBootstrap");
// Lazy-imported to avoid the chicken-and-egg between token-tracker (also
// imports from agent-registry like this module does). Re-imported inside
// the recordRealCall fn so the module's events array is shared.
// Most-recent measurement per agent. Updated on every successful chatAsAgent
// call so the dashboard can show "live tok/s" without re-running benchmarks.
// Persists in-process; resets on virtualpc restart.
const lastThroughput = {};
function getLastThroughput() { return { ...lastThroughput }; }
function recordThroughput(agent, model, usage, latencyMs) {
    const completion = usage?.completion_tokens ?? 0;
    const prompt = usage?.prompt_tokens ?? 0;
    const tps = latencyMs > 0 ? (completion / (latencyMs / 1000)) : 0;
    lastThroughput[agent] = {
        tokensPerSec: Math.round(tps * 10) / 10,
        model,
        promptTokens: prompt,
        completionTokens: completion,
        latencyMs,
        ts: new Date().toISOString(),
    };
    // Best-effort feed to the simulated tracker so events page reflects it
    // alongside the simulated stream. Keeps the dashboard's accounting model
    // unchanged; the tracker just gains real entries on top.
    try {
        const tt = require('./token-tracker');
        if (typeof tt.recordRealEvent === 'function') {
            tt.recordRealEvent({ agent, model, promptTokens: prompt, completionTokens: completion });
        }
    }
    catch { /* tracker unavailable — ignore */ }
    // Publish to Kafka topics for downstream consumers (audit log, cost
    // dashboard, distributed analytics). Fire-and-forget — never blocks the
    // chat response. shared.bestEffortPublish handles broker-down gracefully.
    // The downstream cost consumer reads .agent + .model + .tokens_* fields,
    // so they must be present on every event for the by-agent rollup to work.
    (0, shared_1.bestEffortPublish)(async (p) => {
        await p.publishModelResponse({
            request_id: `${agent}-${Date.now()}`,
            agent, // explicit field for cost-by-agent aggregation
            model,
            completion: '', // payload intentionally elided — content is sensitive
            tokens_prompt: prompt,
            tokens_completion: completion,
            cost_usd: 0, // computed by downstream cost.tracking consumer
            latency_ms: latencyMs,
        });
    });
}
// ─── Kimi CLI bridge ──────────────────────────────────────────────────────
// Shells out to `kimi --quiet -p <prompt>` (Moonshot's paid CLI, installed
// at ~/.local/bin/kimi by the user). Joins messages[] into one prompt so
// the existing call sites don't need to change shape. Prints stdout only;
// the CLI's --quiet flag suppresses the TUI noise.
const KIMI_CLI_PATH = process.env.KIMI_CLI_PATH || (process.env.HOME ? `${process.env.HOME}/.local/bin/kimi` : 'kimi');
const KIMI_TIMEOUT_MS = parseInt(process.env.KIMI_TIMEOUT_MS || '120000');
function flattenMessages(messages) {
    // kimi --quiet -p takes a single string. Mark roles so the model can
    // tell SYSTEM context from the USER turn.
    return messages.map(m => {
        const r = m.role.toUpperCase();
        return r === 'USER' ? m.content : `[${r}]\n${m.content}`;
    }).join('\n\n');
}
async function chatViaKimiCli(messages, opts = {}) {
    const prompt = flattenMessages(messages);
    const started = Date.now();
    return new Promise((resolve) => {
        (0, child_process_1.execFile)(KIMI_CLI_PATH, ['--quiet', '-p', prompt], { maxBuffer: 4 * 1024 * 1024, timeout: KIMI_TIMEOUT_MS }, (err, stdout, stderr) => {
            if (err) {
                // Common cases: ENOENT (CLI not installed for this user/PATH), 124 (timeout), 1 (auth lapse).
                const code = err.code;
                if (code === 'ENOENT') {
                    logger_1.default.warn(`Kimi CLI not found at ${KIMI_CLI_PATH} — falling back to LM Studio`);
                    resolve(null); // signals caller to fall through
                    return;
                }
                logger_1.default.warn(`Kimi CLI error (code=${code}): ${(stderr || err.message).slice(0, 200)}`);
                resolve(null); // graceful fallback
                return;
            }
            // --quiet output also includes a trailing "To resume this session: kimi -r <id>" line.
            // Strip it so the response is clean.
            const cleaned = stdout
                .split('\n')
                .filter(l => !/^\s*To resume this session:/i.test(l))
                .join('\n')
                .trim();
            // Rough token estimate (no usage stats from CLI). 1 token ≈ 4 chars.
            const promptTokens = Math.round(prompt.length / 4);
            const completionTokens = Math.round(cleaned.length / 4);
            resolve({
                ok: true,
                model: 'kimi-k2.6',
                agent: '', // filled in by caller
                content: cleaned,
                usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens, source: 'kimi-cli-estimate' },
                latencyMs: Date.now() - started,
            });
        });
    });
}
// ─── Claude CLI bridge (for designer agents) ─────────────────────────────
// Shells out to `claude --bare --print -p <prompt>` so Mira (Creative
// Director) and Luna (Tech Artist) can route their design-flavored work
// to Claude rather than local Phi-4. Same shell-out pattern as Kimi.
//
// Auth: --bare requires ANTHROPIC_API_KEY in env (no keychain / OAuth
// reads). Without that key the helper returns null and the caller falls
// through to LM Studio so the call still completes — never silently
// downgrades quality without leaving a log breadcrumb.
//
// Cost model: ~$3/1M prompt + $15/1M completion at Sonnet pricing.
// Recorded via token-tracker at tier 3 so the cost dashboard can flag
// design-spend separately from local tier-1 inference.
const CLAUDE_CLI_PATH = process.env.CLAUDE_CLI_PATH || 'claude';
const CLAUDE_TIMEOUT_MS = parseInt(process.env.CLAUDE_TIMEOUT_MS || '120000');
const CLAUDE_MODEL_TAG = process.env.CLAUDE_MODEL_TAG || 'claude-sonnet';
let _claudeAuthChecked = false;
let _claudeAuthOk = false;
function claudeAuthLikelyOk() {
    // Cheap precheck — avoid invoking the CLI if there's clearly no auth
    // path. Caches the result so repeat calls don't shell out per check.
    if (_claudeAuthChecked)
        return _claudeAuthOk;
    _claudeAuthChecked = true;
    _claudeAuthOk = !!(0, secretsBootstrap_1.secretOrEnv)('api', 'ANTHROPIC_API_KEY');
    if (!_claudeAuthOk) {
        logger_1.default.warn('Claude CLI: ANTHROPIC_API_KEY not set in virtualpc env — designer-agent calls will fall back to LM Studio. Set the key + restart to enable Claude routing.');
    }
    return _claudeAuthOk;
}
async function chatViaClaudeCli(messages, opts = {}) {
    if (!claudeAuthLikelyOk())
        return null;
    // Split system messages → --append-system-prompt (claude has its own
    // built-in system prompt and concatenates this on the end). Pass the
    // user turn as the actual prompt argument.
    const sys = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
    const userTurn = messages.filter(m => m.role !== 'system').map(m => m.role === 'user' ? m.content : `[ASSISTANT EARLIER]\n${m.content}`).join('\n\n');
    const args = ['--bare', '--print', '-p', userTurn];
    if (sys)
        args.push('--append-system-prompt', sys);
    const started = Date.now();
    return new Promise((resolve) => {
        (0, child_process_1.execFile)(CLAUDE_CLI_PATH, args, { maxBuffer: 8 * 1024 * 1024, timeout: CLAUDE_TIMEOUT_MS }, (err, stdout, stderr) => {
            if (err) {
                const code = err.code;
                if (code === 'ENOENT') {
                    logger_1.default.warn(`Claude CLI not found at ${CLAUDE_CLI_PATH} — falling back to LM Studio`);
                }
                else {
                    logger_1.default.warn(`Claude CLI error (code=${code}): ${(stderr || err.message).slice(0, 200)}`);
                }
                resolve(null);
                return;
            }
            const cleaned = stdout.trim();
            if (!cleaned || /not logged in|please run \/login/i.test(cleaned)) {
                logger_1.default.warn('Claude CLI returned an auth-required message — falling back. Run `claude /login` interactively or export ANTHROPIC_API_KEY.');
                _claudeAuthOk = false; // poison the cache so we stop asking
                resolve(null);
                return;
            }
            // Estimate token counts (claude --print doesn't emit usage stats
            // by default). 1 token ≈ 4 chars. Marked source so callers can
            // tell estimated vs metered.
            const promptText = sys + '\n' + userTurn;
            const promptTokens = Math.round(promptText.length / 4);
            const completionTokens = Math.round(cleaned.length / 4);
            resolve({
                ok: true,
                model: CLAUDE_MODEL_TAG,
                agent: '', // filled in by caller
                content: cleaned,
                usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens, source: 'claude-cli-estimate' },
                latencyMs: Date.now() - started,
            });
        });
    });
}
const DESIGNER_AGENTS = new Set(['Mira', 'Luna']);
// Prefer LiteLLM unified gateway when running. LiteLLM exposes the
// OpenAI-compatible /v1 surface and routes to local LM Studio + every
// configured cloud provider in one place. Falls back to direct LM Studio
// when LITELLM_URL is unset.
const LITELLM_URL = process.env.LITELLM_URL || '';
const LM_STUDIO_URL = LITELLM_URL || process.env.LM_STUDIO_URL || 'http://127.0.0.1:1234/v1';
const LITELLM_MASTER_KEY = process.env.LITELLM_MASTER_KEY || 'sk-virtualpc-dev';
const OLLAMA_URL = (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
// Per-agent / per-task-type model routing. Keys are agent names from the roster.
// Right-hand side is a substring that must appear in the LM Studio model id.
//
// Policy: default to SMALL/FAST models (phi-4, devstral-small, deepseek-r1-8b)
// that fit alongside Blender + the OS on the RTX 3090s. The big 26B+ models
// (gemma-4-26b, qwen3.5-27b) are only picked when the user explicitly requests
// taskType: 'deep' — this stops "load cancelled" failures like Vice was hitting
// when two requests raced to load Gemma 26B.
const AGENT_MODEL_ROUTES = {
    // Core 5
    Fill: 'phi-4', // executive chat
    Kai: 'devstral', // code-heavy
    Zip: 'devstral', // code-heavy
    Mira: 'phi-4', // visual concept articulation
    Luna: 'devstral', // shader + renderer code
    // Decision makers — need reasoning but keep default fast; deep work via taskType
    Cleopatra: 'deepseek-r1',
    Alexander: 'deepseek-r1',
    MoneyGod: 'deepseek-r1',
    // Resource-heavy
    Analyst: 'phi-4', // narrative + code snippets
    VideoProducer: 'phi-4', // storyboarding / script
    // Specialists
    Vice: 'phi-4', // screenplay / narrative (NOT gemma 26b by default)
    Atlas: 'devstral', // CAD / physics code
    Kimi: 'phi-4', // local fallback; routes to Moonshot Kimi via kimi-client when MOONSHOT_API_KEY is set
    // Data governance + Web developer (added 2026-05-04)
    Governor: 'phi-4', // structured registry edits; deeper audits via taskType:'deep'
    Pixel: 'devstral', // Next.js / Phaser / Three.js code
};
const TASK_TYPE_ROUTES = {
    chat: 'phi-4', // default chat goes to Phi-4 (fast, loaded)
    code: 'devstral',
    arbitration: 'deepseek-r1', // reasoning model, smaller than qwen-27b
    reasoning: 'deepseek-r1',
    cheap: 'phi-4',
    embedding: 'nomic-embed',
    // Explicit opt-in for the heavy models, used by tasks that genuinely need
    // long-context or larger capacity (governance audits, lengthy screenplays).
    deep: 'qwen3.5-27b',
    concept: 'gemma-4-26b',
    // Designer-agent route: visual brief / brand / UX work. Mira + Luna
    // shell out to the local `claude --bare --print` CLI (Anthropic Sonnet
    // by default). Credit cost is real — gated by ANTHROPIC_API_KEY auth.
    design: 'claude-sonnet',
    // Documentation route: ANY agent calling with taskType:'docs' is force-
    // routed through the Claude CLI so the Kami skill (tw93/kami, installed
    // at ~/.claude/skills/kami) auto-triggers and produces typeset HTML /
    // PDF / slides under the parchment + ink-blue design language.
    // Plain-prose fallback (no Kami styling) if Claude auth is missing:
    // gemma-4-26b for the next-best long-context author. The chatAsAgent
    // intercept handles taskType==='docs' before model resolution runs.
    docs: 'claude-sonnet',
};
let cachedModels = null;
const MODEL_CACHE_MS = 15000;
let lastModelFetchWarningAt = 0;
async function fetchJson(url, init, timeoutMs = 5000) {
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), timeoutMs);
    // When routing through LiteLLM, attach the master key as a Bearer token.
    const headers = { ...init?.headers };
    if (LITELLM_URL && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${LITELLM_MASTER_KEY}`;
    }
    try {
        const r = await fetch(url, { ...init, headers, signal: ctrl.signal });
        if (!r.ok) {
            const provider = LITELLM_URL ? 'LiteLLM' : 'LM Studio';
            throw new Error(`${provider} ${r.status}: ${await r.text()}`);
        }
        return (await r.json());
    }
    finally {
        clearTimeout(to);
    }
}
async function getModels(force = false) {
    if (!force && cachedModels && Date.now() - cachedModels.at < MODEL_CACHE_MS) {
        return cachedModels.models;
    }
    try {
        const r = await fetchJson(`${LM_STUDIO_URL}/models`, undefined, 3000);
        cachedModels = { at: Date.now(), models: r.data || [] };
        return cachedModels.models;
    }
    catch (e) {
        cachedModels = { at: Date.now(), models: [] };
        if (force || Date.now() - lastModelFetchWarningAt > MODEL_CACHE_MS) {
            logger_1.default.warn(`LM Studio unreachable: ${e.message}`);
            lastModelFetchWarningAt = Date.now();
        }
        return [];
    }
}
async function healthCheck() {
    const gateway = LITELLM_URL ? 'litellm' : 'lm-studio';
    const fallback = await ollamaHealth();
    try {
        const r = await fetchJson(`${LM_STUDIO_URL}/models`, undefined, 3000);
        const models = r.data || [];
        cachedModels = { at: Date.now(), models };
        return {
            reachable: true,
            chatReachable: true,
            gateway,
            url: LM_STUDIO_URL,
            modelsLoaded: models.length,
            models: models.map(m => m.id),
            fallback,
            activeChatBackend: LITELLM_URL ? 'litellm' : 'lm-studio',
        };
    }
    catch (e) {
        return {
            reachable: false,
            chatReachable: fallback.reachable,
            gateway,
            url: LM_STUDIO_URL,
            modelsLoaded: 0,
            models: [],
            fallback,
            activeChatBackend: fallback.reachable ? 'ollama' : 'none',
            error: e.message,
        };
    }
}
/** Pick the best currently-available model. Never triggers an on-demand load
 *  of a heavy model (which can cancel under memory pressure and fail chat).
 *  Priority: hint-substring match → fast-model fallback chain → any non-embed.
 */
async function resolveModel(hint) {
    const models = await getModels();
    if (models.length === 0)
        return null;
    const lower = hint.toLowerCase();
    const match = models.find(m => m.id.toLowerCase().includes(lower));
    if (match)
        return match.id;
    // Prefer smaller/faster model chain (lowest VRAM footprint first) so a chat
    // request doesn't try to load the 18 GB Gemma 26B when Phi-4 is already warm.
    const preferredFallback = ['phi-4', 'deepseek-r1', 'devstral', 'gemma', 'qwen'];
    for (const p of preferredFallback) {
        const found = models.find(m => m.id.toLowerCase().includes(p));
        if (found)
            return found.id;
    }
    const fallback = models.find(m => !/embed/i.test(m.id));
    return fallback?.id || null;
}
const OLLAMA_HINT_ROUTES = [
    [/devstral|coder|code/i, 'qwen2.5-coder:7b'],
    [/qwen3\.5|qwen|gemma/i, 'qwen2.5-coder:14b'],
    [/deepseek|reason|arbitration/i, 'deepseek-r1:8b'],
    [/claude|sonnet|design|docs/i, 'hermes3:8b'],
    [/phi-4|cheap|chat/i, 'hermes3:3b'],
];
function ollamaModelForHint(hint) {
    for (const [rx, model] of OLLAMA_HINT_ROUTES) {
        if (rx.test(hint))
            return model;
    }
    return process.env.OLLAMA_CHAT_MODEL || 'hermes3:8b';
}
async function ollamaHealth() {
    try {
        const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
        if (!r.ok) {
            return {
                provider: 'ollama',
                reachable: false,
                url: OLLAMA_URL,
                models: [],
                defaultModel: ollamaModelForHint('chat'),
                error: `${r.status} ${await r.text()}`,
            };
        }
        const data = await r.json();
        return {
            provider: 'ollama',
            reachable: true,
            url: OLLAMA_URL,
            models: Array.isArray(data.models) ? data.models.map((m) => m.name || m.model).filter(Boolean) : [],
            defaultModel: ollamaModelForHint('chat'),
        };
    }
    catch (e) {
        return {
            provider: 'ollama',
            reachable: false,
            url: OLLAMA_URL,
            models: [],
            defaultModel: ollamaModelForHint('chat'),
            error: e.message,
        };
    }
}
function estimateUsage(messages, content) {
    const promptText = messages.map(m => m.content).join('\n\n');
    const promptTokens = Math.max(1, Math.round(promptText.length / 4));
    const completionTokens = Math.max(1, Math.round(content.length / 4));
    return {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        source: 'ollama-estimate',
    };
}
async function chatViaOllama(agent, hint, messages, opts = {}) {
    const model = ollamaModelForHint(hint);
    const started = Date.now();
    try {
        const r = await fetch(`${OLLAMA_URL}/api/chat`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                model,
                messages,
                stream: false,
                options: {
                    temperature: opts.temperature ?? 0.6,
                    num_predict: opts.max_tokens ?? 512,
                },
            }),
            signal: AbortSignal.timeout(120000),
        });
        if (!r.ok) {
            logger_1.default.warn(`Ollama fallback failed (${model}): ${r.status} ${await r.text()}`);
            return null;
        }
        const data = await r.json();
        const content = data?.message?.content || '';
        const latencyMs = Date.now() - started;
        const usage = estimateUsage(messages, content);
        recordThroughput(agent, `ollama/${model}`, usage, latencyMs);
        return { ok: true, model: `ollama/${model}`, agent, content, usage, latencyMs };
    }
    catch (e) {
        logger_1.default.warn(`Ollama fallback unavailable (${model}): ${e.message}`);
        return null;
    }
}
async function chatAsAgent(agent, messages, opts = {}) {
    // Kimi agent has its own paid CLI subscription — bypass LM Studio entirely
    // and shell out to `kimi --quiet -p ...`. Honors the user's explicit
    // request: the Kimi roster slot should consume Moonshot quota, not local
    // GPU. If the CLI isn't on PATH (e.g. virtualpc.service running as a
    // different user), fall through to the LM Studio routing below so the
    // call still completes against a local model.
    if (agent === 'Kimi') {
        const r = await chatViaKimiCli(messages, opts);
        if (r) {
            recordThroughput(agent, r.model, r.usage, r.latencyMs);
            return { ...r, agent };
        }
    }
    // Designer agents (Mira, Luna) route through Claude CLI when:
    //   • taskType === 'design' (explicit opt-in by the caller), OR
    //   • CLAUDE_FOR_DESIGNERS=1 in the env (always-on policy)
    // Falls through to LM Studio if Claude auth isn't configured. Default
    // chat / code paths stay on local models — the user's stated "save
    // credits" preference applies unless design quality is explicitly
    // requested.
    //
    // Documentation route: taskType:'docs' for ANY agent goes through the
    // same Claude CLI bridge so the Kami skill (tw93/kami, installed at
    // ~/.claude/skills/kami) auto-triggers on the natural-language doc
    // phrasing and produces typeset HTML/PDF/slides. KAMI_FOR_DOCS=0
    // disables the always-on policy. Local fallback for docs (Claude auth
    // missing) is gemma-4-26b — long-context plain-prose, no Kami styling.
    const kamiForDocs = process.env.KAMI_FOR_DOCS !== '0';
    const isDocsTask = opts.taskType === 'docs' && kamiForDocs;
    let designerFallthroughHint = null;
    let docsFallthroughHint = null;
    const claudeRouted = DESIGNER_AGENTS.has(agent) && (opts.taskType === 'design' || process.env.CLAUDE_FOR_DESIGNERS === '1');
    if (claudeRouted || isDocsTask) {
        const r = await chatViaClaudeCli(messages, opts);
        if (r) {
            recordThroughput(agent, r.model, r.usage, r.latencyMs);
            return { ...r, agent };
        }
        // null → claude auth missing or call failed. The taskType=design /
        // taskType=docs hints would normally map to 'claude-sonnet' which
        // doesn't resolve against any locally-loaded LM Studio model, so we'd
        // 500 with "No model loaded matching claude-sonnet". Override the
        // hint to a sensible local default so the call still completes
        // (degraded but functional — no Kami styling on the docs path).
        if (isDocsTask) {
            docsFallthroughHint = 'gemma-4-26b';
            logger_1.default.info(`Claude CLI unavailable — docs task for ${agent} falling back to gemma-4-26b (no Kami styling)`);
        }
        if (claudeRouted) {
            designerFallthroughHint = AGENT_MODEL_ROUTES[agent] || 'phi-4';
            logger_1.default.info(`Claude CLI unavailable — designer ${agent} falling back to ${designerFallthroughHint}`);
        }
    }
    const hint = docsFallthroughHint
        ? docsFallthroughHint
        : designerFallthroughHint
            ? designerFallthroughHint
            : opts.taskType
                ? (TASK_TYPE_ROUTES[opts.taskType] || AGENT_MODEL_ROUTES[agent] || 'gemma-4-26b')
                : (AGENT_MODEL_ROUTES[agent] || 'gemma-4-26b');
    const model = await resolveModel(hint);
    if (!model) {
        const ollama = await chatViaOllama(agent, hint, messages, opts);
        if (ollama)
            return ollama;
        const health = await healthCheck();
        if (!health.reachable) {
            return {
                ok: false,
                reason: 'No local chat backend reachable',
                hint: 'Start LM Studio or Ollama. Current fallback tried Ollama at ' + OLLAMA_URL,
            };
        }
        return {
            ok: false,
            reason: `No model loaded matching "${hint}"`,
            hint: `Loaded models: ${health.models.join(', ') || '(none)'}. Run: lms load ${hint}`,
        };
    }
    const started = Date.now();
    const attemptChat = async (useModel) => {
        const req = {
            model: useModel,
            messages,
            temperature: opts.temperature ?? 0.6,
            max_tokens: opts.max_tokens ?? 512,
            stream: false,
        };
        return await fetchJson(`${LM_STUDIO_URL}/chat/completions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) }, 60000);
    };
    try {
        const r = await attemptChat(model);
        const latencyMs = Date.now() - started;
        recordThroughput(agent, model, r.usage, latencyMs);
        return {
            ok: true,
            model,
            agent,
            content: r.choices[0]?.message?.content || '',
            usage: r.usage || null,
            latencyMs,
        };
    }
    catch (e) {
        const ollama = await chatViaOllama(agent, hint, messages, opts);
        if (ollama)
            return ollama;
        // Two distinct error families the local stack throws under load:
        //   • VRAM/OOM pressure: gpu out of memory / cuda oom / allocation failed
        //   • Model not yet loaded: failed to load / operation canceled / unload / not yet loaded
        //
        // For OOM we wait briefly (the kernel reaps stale cuda allocs in seconds)
        // and retry the original model once, since the model the caller asked for
        // is the one their persona was tuned against. Only after that do we fall
        // back to phi-4. This keeps the request on its preferred route whenever
        // VRAM pressure was transient.
        const msg = e.message || '';
        const looksLikeOOM = /out of memory|oom|cuda allocator|allocation failed|insufficient memory/i.test(msg);
        const looksLikeLoadFailure = /Failed to load model|Operation canceled|unload|not yet loaded/i.test(msg);
        if (looksLikeOOM) {
            const wait = 15000;
            logger_1.default.warn(`LM Studio VRAM pressure on ${model} — waiting ${wait / 1000}s, then retrying original model once`);
            await new Promise(r => setTimeout(r, wait));
            try {
                const r = await attemptChat(model);
                const latencyMs = Date.now() - started;
                recordThroughput(agent, model, r.usage, latencyMs);
                logger_1.default.info(`LM Studio retry-after-OOM: ${model} succeeded after wait`);
                return {
                    ok: true, model, agent,
                    content: r.choices[0]?.message?.content || '',
                    usage: r.usage || null,
                    latencyMs,
                };
            }
            catch (e2) {
                // Fall through to the load-failure / fallback path below with the new error.
                e = e2;
            }
        }
        if (looksLikeLoadFailure || looksLikeOOM) {
            const fallbackHint = 'phi-4';
            const fallbackModel = await resolveModel(fallbackHint);
            if (fallbackModel && fallbackModel !== model) {
                try {
                    const r = await attemptChat(fallbackModel);
                    const latencyMs = Date.now() - started;
                    recordThroughput(agent, fallbackModel, r.usage, latencyMs);
                    logger_1.default.info(`LM Studio fallback: ${model} failed, served via ${fallbackModel}`);
                    return {
                        ok: true,
                        model: fallbackModel,
                        agent,
                        content: r.choices[0]?.message?.content || '',
                        usage: r.usage || null,
                        latencyMs,
                    };
                }
                catch (e2) {
                    return { ok: false, reason: `Both ${model} and fallback ${fallbackModel} failed. Last: ${e2.message}`, hint: 'Try `lms load microsoft/phi-4` then retry' };
                }
            }
        }
        return { ok: false, reason: e.message, hint: 'Check `lms server status` and `lms ps`' };
    }
}
/** Build a system prompt that grounds the agent in their VirtualPC role. */
function systemPromptForAgent(agent, role, context) {
    return [
        `You are ${agent}, ${role}, an agent inside the VirtualPC multi-agent system.`,
        `Respond in character. Keep answers grounded in VirtualPC context. Be concise unless asked to expand.`,
        context ? `\nCurrent context:\n${context}` : '',
    ].filter(Boolean).join('\n');
}
//# sourceMappingURL=lmstudio.js.map