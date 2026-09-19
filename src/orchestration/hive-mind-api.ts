/**
 * Hive Mind API Routes
 *
 * Endpoints for accessing and managing hive-mind entries
 * and inter-agent tasks.
 */

import express from 'express';
import { hiveMind } from './hive-mind';
import { auditTrail } from '../security/audit-trail';

export function setupHiveMindRoutes(app: express.Express) {
  // Get recent hive-mind entries (all agents)
  app.get('/api/hive-mind/recent', (req, res): any => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const entries = hiveMind.getRecentHiveMind(limit);

      return res.json({
        success: true,
        count: entries.length,
        entries,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get hive-mind entries for a specific agent
  app.get('/api/hive-mind/agent/:agentId', (req, res): any => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
      const entries = hiveMind.getHiveByAgent(req.params.agentId, limit);

      return res.json({
        success: true,
        agentId: req.params.agentId,
        count: entries.length,
        entries,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Log a new hive-mind entry
  app.post('/api/hive-mind/log', (req, res): any => {
    try {
      const { agentId, actionType, summary, metadata } = req.body;
      if (!agentId || !actionType || !summary) {
        return res.status(400).json({ error: 'agentId, actionType, and summary required' });
      }

      const entryId = hiveMind.logHiveMind(agentId, actionType, summary, metadata);
      auditTrail.log('task_create', `hive-mind/${agentId}`, 'success', { actionType, summary }, { agentId });

      return res.json({
        success: true,
        entryId,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get all inter-agent tasks (with optional filtering)
  app.get('/api/hive-mind/inter-agent-tasks', (req, res): any => {
    try {
      const { status, fromAgent, toAgent } = req.query;
      const tasks = hiveMind.getInterAgentTasks({
        status: status as string,
        fromAgent: fromAgent as string,
        toAgent: toAgent as string,
      });

      return res.json({
        success: true,
        count: tasks.length,
        tasks,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Complete an inter-agent task
  app.post('/api/hive-mind/inter-agent-tasks/:id/complete', (req, res): any => {
    try {
      const { result, status } = req.body;
      const taskId = req.params.id;

      if (!result) {
        return res.status(400).json({ error: 'result required' });
      }

      hiveMind.completeInterAgentTask(taskId, result, status || 'completed');
      auditTrail.log('task_complete', `inter-agent-task/${taskId}`, 'success', { result, status }, {});

      return res.json({
        success: true,
        message: `Task ${taskId} marked ${status || 'completed'}`,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });
}

export default setupHiveMindRoutes;
