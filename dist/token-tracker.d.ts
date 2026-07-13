/**
 * Token Usage Tracker - tracks model/API token consumption per agent
 * Records every inference call with tokens used, model, cost
 * Provides aggregations by hour, day, month, and combined totals
 */
export declare const MODEL_COSTS: {
    [model: string]: {
        prompt: number;
        completion: number;
        tier: 1 | 2 | 3;
    };
};
export declare function recordAgentTokens(): void;
export declare function recordRealEvent(input: {
    agent: string;
    model: string;
    promptTokens: number;
    completionTokens: number;
}): void;
export declare function getHourlyUsage(agent?: string): any[];
export declare function getDailyUsage(agent?: string): any[];
export declare function getAgentSummary(): {
    agents: any;
    combined: {
        totalTokens: number;
        totalCost: number;
        totalCalls: number;
        costSavingsPercent: number;
        uptimeSeconds: number;
    };
    models: {
        [model: string]: {
            prompt: number;
            completion: number;
            tier: 1 | 2 | 3;
        };
    };
};
export declare function getRecentEvents(agent?: string, limit?: number): any[];
//# sourceMappingURL=token-tracker.d.ts.map