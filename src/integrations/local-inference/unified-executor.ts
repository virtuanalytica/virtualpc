/**
 * Unified Inference Executor
 *
 * Handles both local (Ollama) and cloud (Claude) model execution with:
 * - Intelligent fallback (local → Claude)
 * - Cost optimization
 * - Performance tracking
 * - Load balancing across 2x 3090s
 */

import logger from '../../utils/logger';
import OllamaClient from './ollama-client';
import { getGovernor, ThroughputGovernor } from './throughput-governor';
import { secretOrEnv } from '../../security/secretsBootstrap';

export interface ExecutionConfig {
  preferLocal: boolean; // Try local models first
  fallbackToClaude: boolean; // Fall back to Claude if local fails
  maxRetries: number;
  timeoutMs: number;
}

export interface ExecutionResult {
  response: string;
  model: string;
  provider: 'local' | 'claude';
  latency_ms: number;
  cost: number;
  tokens?: {
    prompt?: number;
    prompt_tokens?: number;
    completion?: number;
    completion_tokens?: number;
    total?: number;
    total_tokens?: number;
  };
  fallback: boolean; // Did we fall back?
}

export class UnifiedExecutor {
  private ollamaClient: OllamaClient;
  private governor: ThroughputGovernor;
  private config: ExecutionConfig;
  private executionStats: Map<string, {
    success: number;
    failed: number;
    totalLatency: number;
    totalCost: number;
    fallbacks: number;
  }> = new Map();

  // Agent-to-model mappings
  private agentModels: Map<string, string[]> = new Map([
    ['fill', ['qwen-27b', 'claude-opus']], // CEO: use best local, fallback to Claude
    ['kai', ['qwen-27b', 'qwen-14b', 'claude-opus']], // CTO: multiple options
    ['zip', ['qwen-14b', 'phi-4-15b', 'claude-sonnet']], // Dev: fast local, fallback to Sonnet
    ['mira', ['phi-4-15b', 'qwen-7b', 'claude-opus']], // Artist: creative local models
    ['luna', ['qwen-14b', 'deepseek-r1-8b', 'claude-sonnet']] // Tech Artist: reasoning models
  ]);

  constructor(ollama: OllamaClient, governor: ThroughputGovernor = getGovernor()) {
    this.ollamaClient = ollama;
    this.governor = governor;
    this.config = {
      preferLocal: true, // Always try local first to save costs
      fallbackToClaude: true, // Fall back to Claude if local fails/timeouts
      maxRetries: 2,
      timeoutMs: 120000 // 2 minutes
    };

    this.initializeStats();
    logger.info('✓ Unified Executor initialized with local + Claude hybrid');
  }

  /**
   * Execute task with intelligent model selection
   */
  async execute(
    agent: string,
    task: string,
    options?: Partial<ExecutionConfig>
  ): Promise<ExecutionResult> {
    const config = { ...this.config, ...options };
    const models = this.agentModels.get(agent) || ['qwen-27b', 'claude-opus'];

    // Roster gate: agents deselected in the inference settings don't run.
    if (!this.governor.isAgentActive(agent)) {
      throw new Error(`Agent '${agent}' is deactivated in inference settings (activeAgents)`);
    }

    logger.debug(`Executing for ${agent}: ${task.substring(0, 50)}...`);

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
          } catch (localError) {
            logger.warn(`Local model ${model} failed, attempting fallback...`);
            this.recordFallback(model);

            if (!config.fallbackToClaude) throw localError;
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
          } catch (claudeError) {
            if (attempt === models.length - 1) throw claudeError;
            // Try next model
            continue;
          }
        }
      } catch (error) {
        if (attempt === models.length - 1) {
          logger.error(`All models failed for ${agent}`);
          throw error;
        }
      }
    }

    throw new Error(`No viable model available for ${agent}`);
  }

  /**
   * Execute on local model (Ollama)
   */
  private async executeLocal(
    agent: string,
    model: string,
    task: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Throughput admission: keep every concurrent stream ≥ the t/s floor.
    // 'cloud' aborts the local attempt so the caller falls through to Claude;
    // 'downgrade' swaps in a smaller model; 'queue'/'run' wait for a slot.
    const decision = this.governor.decide(model);
    if (decision.action === 'cloud') {
      throw new Error(`throughput-governor routed to cloud: ${decision.reason}`);
    }
    const runModel = decision.model;
    if (decision.action === 'downgrade') {
      logger.info(`throughput-governor: ${model} → ${runModel} (${decision.reason})`);
    }

    const slot = await this.governor.acquireSlot(this.config.timeoutMs * 2);
    try {
      const response = await this.ollamaClient.infer({
        model: runModel,
        prompt: `You are ${agent}. Task: ${task}`,
        temperature: 0.7
      });

      const completionTokens = response.usage?.completion_tokens || 0;
      const tps = completionTokens > 0 && response.latency_ms > 0
        ? (completionTokens * 1000) / response.latency_ms
        : 0;
      if (tps > 0) {
        this.governor.recordMeasurement(runModel, tps, slot.concurrent);
      }

      const latency = Date.now() - startTime;

      return {
        response: response.response,
        model: runModel,
        provider: 'local',
        latency_ms: latency,
        cost: 0, // Local models are free
        tokens: response.usage,
        fallback: false
      };
    } catch (error: any) {
      logger.error(`Local inference failed: ${error.message}`);
      throw error;
    } finally {
      slot.release();
    }
  }

  /**
   * Execute on Claude (API)
   */
  private async executeClaude(
    agent: string,
    model: string,
    task: string
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Model to API model mapping
    const modelMap: Record<string, string> = {
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
          'x-api-key': secretOrEnv('api', 'ANTHROPIC_API_KEY') || '',
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

      const data: any = await response.json();
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
    } catch (error: any) {
      logger.error(`Claude API call failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate Claude API cost
   */
  private calculateCost(model: string, inputTokens: number, outputTokens: number): number {
    const rates: Record<string, { input: number; output: number }> = {
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
  private isLocalModel(model: string): boolean {
    return ['qwen-27b', 'qwen-14b', 'qwen-7b', 'deepseek-r1-8b', 'phi-4-15b', 'mistral-7b', 'llama-70b'].includes(model);
  }

  /**
   * Check if model is Claude
   */
  private isClaudeModel(model: string): boolean {
    return model.startsWith('claude-');
  }

  /**
   * Get agent's preferred models
   */
  getAgentModels(agent: string): string[] {
    return this.agentModels.get(agent) || [];
  }

  /**
   * Set agent model preferences
   */
  setAgentModels(agent: string, models: string[]): void {
    this.agentModels.set(agent, models);
    logger.info(`Updated ${agent} model preference: ${models.join(', ')}`);
  }

  /**
   * Get execution statistics
   */
  getStats(): any {
    const stats: any = {};

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
  async getOllamaStatus(): Promise<any> {
    return this.ollamaClient.getModelStatus();
  }

  // ============================================================
  // Private Methods
  // ============================================================

  private recordSuccess(model: string, latency: number, cost: number): void {
    const stats = this.executionStats.get(model) || { success: 0, failed: 0, totalLatency: 0, totalCost: 0, fallbacks: 0 };
    stats.success++;
    stats.totalLatency += latency;
    stats.totalCost += cost;
    this.executionStats.set(model, stats);
  }

  private recordFallback(model: string): void {
    const stats = this.executionStats.get(model) || { success: 0, failed: 0, totalLatency: 0, totalCost: 0, fallbacks: 0 };
    stats.failed++;
    stats.fallbacks++;
    this.executionStats.set(model, stats);
  }

  private initializeStats(): void {
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

export default UnifiedExecutor;
