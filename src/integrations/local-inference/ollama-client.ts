/**
 * Ollama Client - Local Model Inference
 *
 * Runs open source models on local 3090 GPUs via Ollama
 * Supports: Qwen, DeepSeek, Phi, Llama, Mistral
 */

import * as os from 'os';
import logger from '../../utils/logger';

export interface OllamaModelConfig {
  name: string;
  variant: string; // 'qwen-27b', 'deepseek-r1-8b', 'phi-4-15b', etc.
  max_tokens: number;
  temperature: number;
  gpu_layers: number; // How many layers to offload to GPU (for 3090)
  batch_size: number;
}

export interface InferenceRequest {
  model: string;
  prompt: string;
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  keepAlive?: string; // Ollama model keep-alive timeout (e.g., '2m', '30m')
}

export interface InferenceResponse {
  response: string;
  model: string;
  done: boolean;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  latency_ms: number;
}

export class OllamaClient {
  private baseUrl: string;
  private timeout: number;
  private modelConfigs: Map<string, OllamaModelConfig> = new Map();
  private healthCheck: boolean = false;
  private inferenceStats: Map<string, { count: number; totalLatency: number }> = new Map();

  constructor(baseUrl: string = process.env.OLLAMA_HOST
    ? (process.env.OLLAMA_HOST.startsWith('http') ? process.env.OLLAMA_HOST : `http://${process.env.OLLAMA_HOST}`)
    : 'http://localhost:11434') {
    this.baseUrl = baseUrl;
    this.timeout = 120000; // 2 minutes for long inference
    this.initializeModels();
    this.checkHealth();
  }

  /** Compute optimal thread count: ~50% CPU usage without oversubscription. */
  private getOptimalThreadCount(): number {
    const cores = os.cpus().length;
    return Math.max(4, Math.min(Math.floor(cores / 2), 16));
  }

  /**
   * Initialize model configurations for 3090 GPUs
   */
  private initializeModels(): void {
    // Variants map internal names to real Ollama tags. Unpulled tags
    // fall back to cloud tier via UnifiedExecutor's fallback chain.
    const models: OllamaModelConfig[] = [
      {
        name: 'qwen-27b',
        variant: 'qwen2.5-coder:32b',
        max_tokens: 32000,
        temperature: 0.7,
        gpu_layers: 99,
        batch_size: 1
      },
      {
        name: 'qwen-14b',
        variant: 'qwen2.5-coder:14b',
        max_tokens: 32000,
        temperature: 0.7,
        gpu_layers: 99,
        batch_size: 2
      },
      {
        name: 'qwen-7b',
        variant: 'qwen2.5-coder:7b',
        max_tokens: 32000,
        temperature: 0.7,
        gpu_layers: 99,
        batch_size: 4
      },
      {
        name: 'deepseek-r1-8b',
        variant: 'deepseek-r1:8b',
        max_tokens: 32000,
        temperature: 0.7,
        gpu_layers: 99,
        batch_size: 2
      },
      {
        name: 'phi-4-15b',
        variant: 'phi4:14b',
        max_tokens: 16000,
        temperature: 0.7,
        gpu_layers: 99,
        batch_size: 4
      },
      {
        name: 'mistral-7b',
        variant: 'mistral:7b',
        max_tokens: 32000,
        temperature: 0.7,
        gpu_layers: 99,
        batch_size: 4
      },
      {
        name: 'llama-70b',
        variant: 'llama3.3:70b',
        max_tokens: 8000,
        temperature: 0.7,
        gpu_layers: 99,
        batch_size: 1
      }
    ];

    models.forEach(config => {
      this.modelConfigs.set(config.name, config);
      this.inferenceStats.set(config.name, { count: 0, totalLatency: 0 });
    });

    logger.info(`✓ Ollama client configured with ${models.length} local models`);
  }

  /**
   * Check if Ollama is running
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET'
      });

      if (response.ok) {
        const data: any = await response.json();
        const modelCount = data?.models?.length || 0;
        logger.info(`✓ Ollama health check passed (${modelCount} models available)`);
        this.healthCheck = true;
        return true;
      }
    } catch (error) {
      logger.warn('⚠️ Ollama not responding - local inference unavailable');
      logger.warn('Start Ollama with: ollama serve');
      this.healthCheck = false;
    }

    return false;
  }

  /**
   * Run inference on local model
   */
  async infer(request: InferenceRequest): Promise<InferenceResponse> {
    if (!this.healthCheck) {
      throw new Error('Ollama service not available');
    }

    const config = this.modelConfigs.get(request.model);
    if (!config) {
      throw new Error(`Model not configured: ${request.model}`);
    }

    const startTime = Date.now();

    try {
      logger.debug(`Inferring on ${request.model}: ${request.prompt.substring(0, 50)}...`);

      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.variant,
          prompt: request.prompt,
          stream: false,
          ...(request.keepAlive && { keep_alive: request.keepAlive }),
          options: {
            num_predict: request.max_tokens || config.max_tokens,
            temperature: request.temperature ?? config.temperature,
            num_gpu: config.gpu_layers, // Layers to GPU
            num_thread: this.getOptimalThreadCount(), // Dynamic ~50% CPU
            repeat_penalty: 1.1,
            top_k: 40,
            top_p: 0.9
          }
        })
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Ollama API error: ${error}`);
      }

      const data: any = await response.json();
      const latency = Date.now() - startTime;

      // Record stats
      const stats = this.inferenceStats.get(request.model);
      if (stats) {
        stats.count++;
        stats.totalLatency += latency;
      }

      return {
        response: data?.response || '',
        model: request.model,
        done: true,
        usage: {
          prompt_tokens: data?.prompt_eval_count || 0,
          completion_tokens: data?.eval_count || 0,
          total_tokens: (data?.prompt_eval_count || 0) + (data?.eval_count || 0)
        },
        latency_ms: latency
      };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      logger.error(`Inference error on ${request.model}:`, error.message);

      throw new Error(`Local inference failed: ${error.message}`);
    }
  }

  /**
   * Batch inference for multiple prompts
   */
  async batchInfer(model: string, prompts: string[]): Promise<InferenceResponse[]> {
    const results: InferenceResponse[] = [];

    for (const prompt of prompts) {
      try {
        const result = await this.infer({ model, prompt });
        results.push(result);
      } catch (error) {
        logger.error(`Batch inference failed for prompt: ${prompt.substring(0, 50)}`);
        results.push({
          response: '',
          model,
          done: false,
          latency_ms: 0
        });
      }
    }

    return results;
  }

  /**
   * Get model status
   */
  async getModelStatus(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      const data: any = await response.json();

      return {
        health: this.healthCheck ? 'operational' : 'offline',
        models_available: data.models?.map((m: any) => m.name) || [],
        models_configured: Array.from(this.modelConfigs.keys()),
        inference_stats: Object.fromEntries(this.inferenceStats)
      };
    } catch {
      return {
        health: 'offline',
        error: 'Failed to reach Ollama service'
      };
    }
  }

  /**
   * Get inference statistics
   */
  getStats(): {
    model: string;
    calls: number;
    avgLatency: number;
  }[] {
    const stats: any[] = [];

    for (const [model, data] of this.inferenceStats.entries()) {
      if (data.count > 0) {
        stats.push({
          model,
          calls: data.count,
          avgLatency: Math.round(data.totalLatency / data.count)
        });
      }
    }

    return stats.sort((a, b) => b.calls - a.calls);
  }

  /**
   * Is Ollama healthy?
   */
  isHealthy(): boolean {
    return this.healthCheck;
  }
}

export default OllamaClient;
