"use strict";
/**
 * Unified Inference Executor
 *
 * Handles both local (Ollama) and cloud (Claude) model execution with:
 * - Intelligent fallback (local → Claude)
 * - Cost optimization
 * - Performance tracking
 * - Load balancing across 2x 3090s
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnifiedExecutor = void 0;
const logger_1 = __importDefault(require("../../utils/logger"));
const secretsBootstrap_1 = require("../../security/secretsBootstrap");
class UnifiedExecutor {
    constructor(ollama) {
        this.executionStats = new Map();
        // Agent-to-model mappings
        this.agentModels = new Map([
            ['fill', ['qwen-27b', 'claude-opus']], // CEO: use best local, fallback to Claude
            ['kai', ['qwen-27b', 'qwen-14b', 'claude-opus']], // CTO: multiple options
            ['zip', ['qwen-14b', 'phi-4-15b', 'claude-sonnet']], // Dev: fast local, fallback to Sonnet
            ['mira', ['phi-4-15b', 'qwen-7b', 'claude-opus']], // Artist: creative local models
            ['luna', ['qwen-14b', 'deepseek-r1-8b', 'claude-sonnet']] // Tech Artist: reasoning models
        ]);
        this.ollamaClient = ollama;
        this.config = {
            preferLocal: true, // Always try local first to save costs
            fallbackToClaude: true, // Fall back to Claude if local fails/timeouts
            maxRetries: 2,
            timeoutMs: 120000 // 2 minutes
        };
        this.initializeStats();
        logger_1.default.info('✓ Unified Executor initialized with local + Claude hybrid');
    }
    /**
     * Execute task with intelligent model selection
     */
    async execute(agent, task, options) {
        const config = { ...this.config, ...options };
        const models = this.agentModels.get(agent) || ['qwen-27b', 'claude-opus'];
        logger_1.default.debug(`Executing for ${agent}: ${task.substring(0, 50)}...`);
        // Try each model in preference order
        for (let attempt = 0; attempt < models.length; attempt++) {
            const model = models[attempt];
            try {
                // Try local model first if it's Tier 1
                if (config.preferLocal && this.isLocalModel(model)) {
                    try {
                        const result = await this.executeLocal(agent, model, task);
                        this.recordSuccess(model, result.latency_ms, 0);
                        return { ...result, fallback: false };
                    }
                    catch (localError) {
                        logger_1.default.warn(`Local model ${model} failed, attempting fallback...`);
                        this.recordFallback(model);
                        if (!config.fallbackToClaude)
                            throw localError;
                        // Try next model
                        continue;
                    }
                }
                // Execute Claude model
                if (this.isClaudeModel(model)) {
                    try {
                        const result = await this.executeClaude(agent, model, task);
                        this.recordSuccess(model, result.latency_ms, result.cost);
                        return { ...result, fallback: attempt > 0 };
                    }
                    catch (claudeError) {
                        if (attempt === models.length - 1)
                            throw claudeError;
                        // Try next model
                        continue;
                    }
                }
            }
            catch (error) {
                if (attempt === models.length - 1) {
                    logger_1.default.error(`All models failed for ${agent}`);
                    throw error;
                }
            }
        }
        throw new Error(`No viable model available for ${agent}`);
    }
    /**
     * Execute on local model (Ollama)
     */
    async executeLocal(agent, model, task) {
        const startTime = Date.now();
        try {
            const response = await this.ollamaClient.infer({
                model,
                prompt: `You are ${agent}. Task: ${task}`,
                temperature: 0.7
            });
            const latency = Date.now() - startTime;
            return {
                response: response.response,
                model,
                provider: 'local',
                latency_ms: latency,
                cost: 0, // Local models are free
                tokens: response.usage,
                fallback: false
            };
        }
        catch (error) {
            logger_1.default.error(`Local inference failed: ${error.message}`);
            throw error;
        }
    }
    /**
     * Execute on Claude (API)
     */
    async executeClaude(agent, model, task) {
        const startTime = Date.now();
        // Model to API model mapping
        const modelMap = {
            'claude-opus': 'claude-opus-4-6',
            'claude-sonnet': 'claude-sonnet-4-6',
            'claude-haiku': 'claude-haiku-4-5-20251001'
        };
        const apiModel = modelMap[model] || model;
        try {
            // Call Claude API
            const response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': (0, secretsBootstrap_1.secretOrEnv)('api', 'ANTHROPIC_API_KEY') || '',
                    'anthropic-version': '2023-06-01'
                },
                body: JSON.stringify({
                    model: apiModel,
                    max_tokens: 2048,
                    messages: [
                        {
                            role: 'user',
                            content: `You are ${agent}. Execute this task: ${task}`
                        }
                    ]
                })
            });
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Claude API error: ${error}`);
            }
            const data = await response.json();
            const latency = Date.now() - startTime;
            // Calculate cost (approximate)
            const inputTokens = data?.usage?.input_tokens || 0;
            const outputTokens = data?.usage?.output_tokens || 0;
            const cost = this.calculateCost(model, inputTokens, outputTokens);
            return {
                response: data?.content?.[0]?.text || '',
                model,
                provider: 'claude',
                latency_ms: latency,
                cost,
                tokens: {
                    prompt: inputTokens,
                    completion: outputTokens,
                    total: inputTokens + outputTokens
                },
                fallback: false
            };
        }
        catch (error) {
            logger_1.default.error(`Claude API call failed: ${error.message}`);
            throw error;
        }
    }
    /**
     * Calculate Claude API cost
     */
    calculateCost(model, inputTokens, outputTokens) {
        const rates = {
            'claude-opus': { input: 0.000015, output: 0.000075 },
            'claude-sonnet': { input: 0.000003, output: 0.000015 },
            'claude-haiku': { input: 0.00000080, output: 0.000004 }
        };
        const rate = rates[model] || rates['claude-opus'];
        return (inputTokens * rate.input) + (outputTokens * rate.output);
    }
    /**
     * Check if model is local (Ollama)
     */
    isLocalModel(model) {
        return ['qwen-27b', 'qwen-14b', 'qwen-7b', 'deepseek-r1-8b', 'phi-4-15b', 'mistral-7b', 'llama-70b'].includes(model);
    }
    /**
     * Check if model is Claude
     */
    isClaudeModel(model) {
        return model.startsWith('claude-');
    }
    /**
     * Get agent's preferred models
     */
    getAgentModels(agent) {
        return this.agentModels.get(agent) || [];
    }
    /**
     * Set agent model preferences
     */
    setAgentModels(agent, models) {
        this.agentModels.set(agent, models);
        logger_1.default.info(`Updated ${agent} model preference: ${models.join(', ')}`);
    }
    /**
     * Get execution statistics
     */
    getStats() {
        const stats = {};
        for (const [model, data] of this.executionStats.entries()) {
            stats[model] = {
                success: data.success,
                failed: data.failed,
                fallbacks: data.fallbacks,
                success_rate: Math.round((data.success / (data.success + data.failed)) * 100) + '%',
                avg_latency_ms: Math.round(data.totalLatency / (data.success + data.failed)),
                total_cost: data.totalCost.toFixed(4)
            };
        }
        return stats;
    }
    /**
     * Get Ollama status
     */
    async getOllamaStatus() {
        return this.ollamaClient.getModelStatus();
    }
    // ============================================================
    // Private Methods
    // ============================================================
    recordSuccess(model, latency, cost) {
        const stats = this.executionStats.get(model) || { success: 0, failed: 0, totalLatency: 0, totalCost: 0, fallbacks: 0 };
        stats.success++;
        stats.totalLatency += latency;
        stats.totalCost += cost;
        this.executionStats.set(model, stats);
    }
    recordFallback(model) {
        const stats = this.executionStats.get(model) || { success: 0, failed: 0, totalLatency: 0, totalCost: 0, fallbacks: 0 };
        stats.failed++;
        stats.fallbacks++;
        this.executionStats.set(model, stats);
    }
    initializeStats() {
        const allModels = [
            'qwen-27b', 'qwen-14b', 'qwen-7b',
            'deepseek-r1-8b', 'phi-4-15b', 'mistral-7b', 'llama-70b',
            'claude-opus', 'claude-sonnet', 'claude-haiku'
        ];
        allModels.forEach(model => {
            this.executionStats.set(model, {
                success: 0,
                failed: 0,
                totalLatency: 0,
                totalCost: 0,
                fallbacks: 0
            });
        });
    }
}
exports.UnifiedExecutor = UnifiedExecutor;
exports.default = UnifiedExecutor;
//# sourceMappingURL=unified-executor.js.map