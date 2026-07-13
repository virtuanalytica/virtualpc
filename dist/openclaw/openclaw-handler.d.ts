/**
 * OpenClaw Integration Handler
 * Autonomous agent command execution without approval
 */
interface AgentCommand {
    id: string;
    agent: string;
    command: string;
    params?: Record<string, any>;
    timestamp: Date;
    status: 'pending' | 'executing' | 'completed' | 'failed';
    result?: any;
    error?: string;
}
export declare class OpenClawHandler {
    private commandQueue;
    private executedCommands;
    /**
     * Queue command for execution (no approval required)
     */
    queueCommand(agent: string, command: string, params?: Record<string, any>): AgentCommand;
    /**
     * Execute command immediately
     */
    private executeCommand;
    /**
     * Process command for specific agent
     */
    private processCommand;
    /**
     * Run a whitelisted VirtualPC operations script. These commands are the
     * bridge between autonomous agents and local MOLGANG tooling; keep them
     * narrow and deterministic.
     */
    private runVirtualPcScript;
    /**
     * Get command status
     */
    getCommandStatus(commandId: string): AgentCommand | undefined;
    /**
     * Get all commands for an agent
     */
    getAgentCommands(agent: string, limit?: number): AgentCommand[];
    /**
     * Get command history
     */
    getCommandHistory(limit?: number): AgentCommand[];
    /**
     * Get execution statistics
     */ getStats(): {
        totalCommands: number;
        completed: number;
        failed: number;
        successRate: number;
        byAgent: Record<string, number>;
        recentCommands: AgentCommand[];
    };
    /**
     * Get commands grouped by agent
     */
    private getCommandsByAgent;
    /**
     * Cancel a queued command
     */
    cancelCommand(commandId: string): boolean;
    /**
     * Clear all history
     */
    clearHistory(): void;
}
export default OpenClawHandler;
//# sourceMappingURL=openclaw-handler.d.ts.map