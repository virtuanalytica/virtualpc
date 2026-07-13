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
export declare function getLastThroughput(): {
    [x: string]: {
        tokensPerSec: number;
        model: string;
        promptTokens: number;
        completionTokens: number;
        latencyMs: number;
        ts: string;
    };
};
declare const TASK_TYPE_ROUTES: {
    [kind: string]: string;
};
interface LmModel {
    id: string;
    object: string;
    owned_by?: string;
}
interface LmChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}
export declare function getModels(force?: boolean): Promise<LmModel[]>;
export declare function healthCheck(): Promise<{
    reachable: boolean;
    chatReachable: boolean;
    gateway: 'litellm' | 'lm-studio';
    url: string;
    modelsLoaded: number;
    models: string[];
    fallback: {
        provider: 'ollama';
        reachable: boolean;
        url: string;
        models: string[];
        defaultModel: string;
        error?: string;
    };
    activeChatBackend: 'lm-studio' | 'litellm' | 'ollama' | 'none';
    error?: string;
}>;
export declare function chatAsAgent(agent: string, messages: LmChatMessage[], opts?: {
    temperature?: number;
    max_tokens?: number;
    taskType?: keyof typeof TASK_TYPE_ROUTES;
}): Promise<{
    ok: true;
    model: string;
    agent: string;
    content: string;
    usage: any;
    latencyMs: number;
} | {
    ok: false;
    reason: string;
    hint?: string;
}>;
/** Build a system prompt that grounds the agent in their VirtualPC role. */
export declare function systemPromptForAgent(agent: string, role: string, context?: string): string;
export {};
//# sourceMappingURL=lmstudio.d.ts.map