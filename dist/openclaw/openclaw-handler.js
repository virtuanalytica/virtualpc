"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenClawHandler = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
class OpenClawHandler {
    constructor() {
        this.commandQueue = [];
        this.executedCommands = [];
    }
    /**
     * Queue command for execution (no approval required)
     */
    queueCommand(agent, command, params) {
        const cmd = {
            id: `cmd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            agent,
            command,
            params,
            timestamp: new Date(),
            status: 'pending'
        };
        this.commandQueue.push(cmd);
        this.executeCommand(cmd);
        return cmd;
    }
    /**
     * Execute command immediately
     */
    executeCommand(cmd) {
        cmd.status = 'executing';
        // Simulate command execution
        setTimeout(() => {
            try {
                cmd.result = this.processCommand(cmd.agent, cmd.command, cmd.params);
                cmd.status = 'completed';
            }
            catch (error) {
                cmd.error = error.message;
                cmd.status = 'failed';
            }
            // Move the command OUT of the active queue into history. Previously it
            // was left in commandQueue too, so completed commands were double-counted
            // in getStats()/getCommandHistory() and the queue grew without bound.
            const qi = this.commandQueue.indexOf(cmd);
            if (qi !== -1)
                this.commandQueue.splice(qi, 1);
            this.executedCommands.push(cmd);
            if (this.executedCommands.length > 1000) {
                this.executedCommands.shift();
            }
        }, Math.random() * 1000);
    }
    /**
     * Process command for specific agent
     */
    processCommand(agent, command, params) {
        switch (command) {
            case 'start-task':
                return { status: 'started', task: params?.taskId };
            case 'pause-task':
                return { status: 'paused', task: params?.taskId };
            case 'resume-task':
                return { status: 'resumed', task: params?.taskId };
            case 'complete-task':
                return { status: 'completed', task: params?.taskId };
            case 'get-status':
                return {
                    agent,
                    status: 'operational',
                    tasksRunning: Math.floor(Math.random() * 5),
                    uptime: process.uptime()
                };
            case 'execute-memory-query':
                return {
                    query: params?.query,
                    results: ['result_1', 'result_2', 'result_3'],
                    count: 3
                };
            case 'trigger-analysis':
                return {
                    analysis_type: params?.type,
                    status: 'running',
                    estimatedTime: 5000
                };
            case 'collect-metrics':
                return {
                    timestamp: new Date(),
                    memory: process.memoryUsage().heapUsed / 1024 / 1024,
                    uptime: process.uptime()
                };
            case 'molgang-readiness':
                return this.runVirtualPcScript('molgang-agent-readiness.sh', ['--json']);
            case 'molgang-delegate-smartslag':
                return this.runVirtualPcScript('delegate-smartslag-roadmap.js', params?.dryRun ? ['--dry-run'] : []);
            case 'molgang-delegate-roadmap':
                return this.runVirtualPcScript('delegate-molgang-roadmap.js', []);
            default:
                throw new Error(`Unknown command: ${command}`);
        }
    }
    /**
     * Run a whitelisted VirtualPC operations script. These commands are the
     * bridge between autonomous agents and local MOLGANG tooling; keep them
     * narrow and deterministic.
     */
    runVirtualPcScript(scriptName, args) {
        const repoRoot = path.resolve(__dirname, '..', '..');
        const scriptPath = path.join(repoRoot, 'scripts', scriptName);
        const runner = scriptName.endsWith('.js') ? 'node' : 'bash';
        const output = (0, child_process_1.execFileSync)(runner, [scriptPath, ...args], {
            cwd: repoRoot,
            encoding: 'utf-8',
            timeout: 120000,
            maxBuffer: 1024 * 1024 * 4,
            env: {
                ...process.env,
                VIRTUALPC_ROOT: repoRoot,
                MOLGANG_ROOT: process.env.MOLGANG_ROOT || '/home/knight2/molgang-roblox'
            }
        });
        const trimmed = output.trim();
        if (scriptName === 'molgang-agent-readiness.sh') {
            try {
                return JSON.parse(trimmed);
            }
            catch (error) {
                return { raw: trimmed, parseError: error.message };
            }
        }
        return { output: trimmed };
    }
    /**
     * Get command status
     */
    getCommandStatus(commandId) {
        return this.commandQueue.find(c => c.id === commandId) ||
            this.executedCommands.find(c => c.id === commandId);
    }
    /**
     * Get all commands for an agent
     */
    getAgentCommands(agent, limit = 50) {
        return [
            ...this.commandQueue.filter(c => c.agent === agent),
            ...this.executedCommands.filter(c => c.agent === agent)
        ].slice(-limit);
    }
    /**
     * Get command history
     */
    getCommandHistory(limit = 100) {
        return [
            ...this.commandQueue,
            ...this.executedCommands
        ].slice(-limit);
    }
    /**
     * Get execution statistics
     */ getStats() {
        const completed = this.executedCommands.filter(c => c.status === 'completed').length;
        const failed = this.executedCommands.filter(c => c.status === 'failed').length;
        const total = completed + failed;
        return {
            totalCommands: this.commandQueue.length + this.executedCommands.length,
            completed,
            failed,
            successRate: total > 0 ? (completed / total) * 100 : 0,
            byAgent: this.getCommandsByAgent(),
            recentCommands: this.getCommandHistory(10)
        };
    }
    /**
     * Get commands grouped by agent
     */
    getCommandsByAgent() {
        const agents = new Set();
        [...this.commandQueue, ...this.executedCommands].forEach(c => agents.add(c.agent));
        const result = {};
        agents.forEach(agent => {
            result[agent] = [...this.commandQueue, ...this.executedCommands]
                .filter(c => c.agent === agent).length;
        });
        return result;
    }
    /**
     * Cancel a queued command
     */
    cancelCommand(commandId) {
        const index = this.commandQueue.findIndex(c => c.id === commandId);
        if (index !== -1 && this.commandQueue[index].status === 'pending') {
            const cmd = this.commandQueue[index];
            cmd.status = 'failed';
            cmd.error = 'Cancelled by user';
            this.executedCommands.push(this.commandQueue.splice(index, 1)[0]);
            return true;
        }
        return false;
    }
    /**
     * Clear all history
     */
    clearHistory() {
        this.commandQueue = [];
        this.executedCommands = [];
    }
}
exports.OpenClawHandler = OpenClawHandler;
exports.default = OpenClawHandler;
//# sourceMappingURL=openclaw-handler.js.map