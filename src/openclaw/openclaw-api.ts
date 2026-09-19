/**
 * OpenClaw API Routes
 * Command execution, monitoring, and control endpoints
 */

import express from 'express';
import OpenClawHandler from './openclaw-handler';
import { agentOrchestrator } from '../orchestration/agent-orchestrator';

const handler = new OpenClawHandler();

export function setupOpenClawRoutes(app: express.Express) {
  // Queue a new command (no approval required)
  app.post('/api/openclaw/command', (req, res): any => {
    try {
      const { agent, command, params } = req.body;
      if (!agent || !command) {
        return res.status(400).json({ error: 'agent and command required' });
      }

      const cmd = handler.queueCommand(agent, command, params);
      return res.json({ success: true, command: cmd });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get command status
  app.get('/api/openclaw/command/:id', (req, res): any => {
    try {
      const cmd = handler.getCommandStatus(req.params.id);
      if (!cmd) {
        return res.status(404).json({ error: 'Command not found' });
      }
      return res.json({ success: true, command: cmd });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get agent commands
  app.get('/api/openclaw/agent/:agent/commands', (req, res): any => {
    try {
      const commands = handler.getAgentCommands(req.params.agent);
      return res.json({ success: true, agent: req.params.agent, commands });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get command history
  app.get('/api/openclaw/history', (req, res): any => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const commands = handler.getCommandHistory(limit);
      return res.json({ success: true, commands });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get execution statistics
  app.get('/api/openclaw/stats', (req, res): any => {
    try {
      const stats = handler.getStats();
      return res.json({ success: true, ...stats });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Cancel a command
  app.post('/api/openclaw/command/:id/cancel', (req, res): any => {
    try {
      const cancelled = handler.cancelCommand(req.params.id);
      return res.json({ success: cancelled });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Clear history
  app.post('/api/openclaw/clear', (req, res): any => {
    try {
      handler.clearHistory();
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // === Dual Terminal Management ===

  // Get terminal status (A & B)
  app.get('/api/openclaw/terminals', (req, res): any => {
    try {
      const terminals = handler.getTerminalStatus();
      return res.json({ success: true, terminals });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get specific terminal commands
  app.get('/api/openclaw/terminal/:id', (req, res): any => {
    try {
      const terminalId = req.params.id.toUpperCase();
      if (terminalId !== 'A' && terminalId !== 'B') {
        return res.status(400).json({ error: 'Terminal must be A or B' });
      }
      const terminal = handler.getTerminalInfo(terminalId as 'A' | 'B');
      return res.json({ success: true, terminal });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Enable/disable continuous execution
  app.post('/api/openclaw/continuous/:enable', (req, res): any => {
    try {
      const enable = req.params.enable === 'true' || req.params.enable === '1';
      handler.setContinuousExecution(enable);
      return res.json({
        success: true,
        continuousExecution: enable,
        message: enable ? 'Continuous execution enabled' : 'Continuous execution disabled'
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get continuous execution status
  app.get('/api/openclaw/continuous', (req, res): any => {
    try {
      const status = handler.isContinuousExecutionEnabled();
      return res.json({ success: true, continuousExecution: status });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // === Approval Bypass & Authorization ===

  // Verify approval bypass is active
  app.get('/api/openclaw/approval-status', (req, res): any => {
    try {
      return res.json({
        success: true,
        approvalBypassActive: true,
        message: 'OpenClaw commands execute without approval',
        note: 'All agents authorized for autonomous execution'
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // === Agent Orchestration (Message Routing) ===

  // Route a message to the appropriate agent
  app.post('/api/openclaw/route', (req, res): any => {
    try {
      const { userId, message } = req.body;
      if (!userId || !message) {
        return res.status(400).json({ error: 'userId and message required' });
      }

      const decision = agentOrchestrator.routeMessage(userId, message);
      return res.json({
        success: true,
        ...decision
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Start agent session for user
  app.post('/api/openclaw/session/start', (req, res): any => {
    try {
      const { userId, agentId } = req.body;
      if (!userId || !agentId) {
        return res.status(400).json({ error: 'userId and agentId required' });
      }

      agentOrchestrator.startSession(userId, agentId);
      return res.json({
        success: true,
        message: `Session started: ${userId} → ${agentId}`
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // End agent session for user
  app.post('/api/openclaw/session/end', (req, res): any => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'userId required' });
      }

      agentOrchestrator.endSession(userId);
      return res.json({
        success: true,
        message: `Session ended for ${userId}`
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get active session for user
  app.get('/api/openclaw/session/:userId', (req, res): any => {
    try {
      const session = agentOrchestrator.getSession(req.params.userId);
      return res.json({
        success: true,
        session: session || null
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Create inter-agent task (coordination)
  app.post('/api/openclaw/inter-agent-task', (req, res): any => {
    try {
      const { fromAgentId, toAgentId, taskTitle, description, priority } = req.body;
      if (!fromAgentId || !toAgentId || !taskTitle) {
        return res.status(400).json({
          error: 'fromAgentId, toAgentId, and taskTitle required'
        });
      }

      agentOrchestrator.createInterAgentTask(
        fromAgentId,
        toAgentId,
        taskTitle,
        description || '',
        priority || 'medium'
      ).then((task: any) => {
        res.json({ success: true, task });
      }).catch((error: any) => {
        res.status(500).json({ error: error.message });
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get orchestration statistics
  app.get('/api/openclaw/orchestration/stats', (req, res): any => {
    try {
      const stats = agentOrchestrator.getStats();
      return res.json({
        success: true,
        ...stats
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });
}

export default setupOpenClawRoutes;
