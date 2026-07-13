import { execFileSync } from 'child_process';
import * as path from 'path';

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

export class OpenClawHandler {
  private commandQueue: AgentCommand[] = [];
  private executedCommands: AgentCommand[] = [];

  /**
   * Queue command for execution (no approval required)
   */
  queueCommand(agent: string, command: string, params?: Record<string, any>): AgentCommand {
    const cmd: AgentCommand = {
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
  private executeCommand(cmd: AgentCommand): void {
    cmd.status = 'executing';

    // Simulate command execution
    setTimeout(() => {
      try {
        cmd.result = this.processCommand(cmd.agent, cmd.command, cmd.params);
        cmd.status = 'completed';
      } catch (error: any) {
        cmd.error = error.message;
        cmd.status = 'failed';
      }

      // Move the command OUT of the active queue into history. Previously it
      // was left in commandQueue too, so completed commands were double-counted
      // in getStats()/getCommandHistory() and the queue grew without bound.
      const qi = this.commandQueue.indexOf(cmd);
      if (qi !== -1) this.commandQueue.splice(qi, 1);

      this.executedCommands.push(cmd);
      if (this.executedCommands.length > 1000) {
        this.executedCommands.shift();
      }
    }, Math.random() * 1000);
  }

  /**
   * Process command for specific agent
   */
  private processCommand(agent: string, command: string, params?: Record<string, any>): any {
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
  private runVirtualPcScript(scriptName: string, args: string[]): any {
    const repoRoot = path.resolve(__dirname, '..', '..');
    const scriptPath = path.join(repoRoot, 'scripts', scriptName);
    const runner = scriptName.endsWith('.js') ? 'node' : 'bash';
    const output = execFileSync(runner, [scriptPath, ...args], {
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
      } catch (error) {
        return { raw: trimmed, parseError: (error as Error).message };
      }
    }

    return { output: trimmed };
  }

  /**
   * Get command status
   */
  getCommandStatus(commandId: string): AgentCommand | undefined {
    return this.commandQueue.find(c => c.id === commandId) ||
           this.executedCommands.find(c => c.id === commandId);
  }

  /**
   * Get all commands for an agent
   */
  getAgentCommands(agent: string, limit: number = 50): AgentCommand[] {
    return [
      ...this.commandQueue.filter(c => c.agent === agent),
      ...this.executedCommands.filter(c => c.agent === agent)
    ].slice(-limit);
  }

  /**
   * Get command history
   */
  getCommandHistory(limit: number = 100): AgentCommand[] {
    return [
      ...this.commandQueue,
      ...this.executedCommands
    ].slice(-limit);
  }

  /**
   * Get execution statistics
   */  getStats() {
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
  private getCommandsByAgent(): Record<string, number> {
    const agents = new Set<string>();
    [...this.commandQueue, ...this.executedCommands].forEach(c => agents.add(c.agent));

    const result: Record<string, number> = {};
    agents.forEach(agent => {
      result[agent] = [...this.commandQueue, ...this.executedCommands]
        .filter(c => c.agent === agent).length;
    });

    return result;
  }

  /**
   * Cancel a queued command
   */
  cancelCommand(commandId: string): boolean {
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
  clearHistory(): void {
    this.commandQueue = [];
    this.executedCommands = [];
  }
}

export default OpenClawHandler;
