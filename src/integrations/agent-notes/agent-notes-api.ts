/**
 * Agent Notes API Routes
 *
 * REST endpoints for managing agent notes (brainstorming vault).
 */

import express from 'express';
import { agentNotesVault } from './agent-notes-vault';
import { hiveMind } from '../../orchestration/hive-mind';

export function setupAgentNotesRoutes(app: express.Express) {
  // List all notes
  app.get('/api/agent-notes', (req, res): any => {
    try {
      const notes = agentNotesVault.listNotes();
      return res.json({
        success: true,
        count: notes.length,
        notes,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });

  // Get a specific note
  app.get('/api/agent-notes/:path(*)', (req, res): any => {
    try {
      const notePath = req.params.path;
      const content = agentNotesVault.readNote(notePath);

      if (!content) {
        return res.status(404).json({ error: 'Note not found' });
      }

      return res.json({
        success: true,
        path: notePath,
        content,
      });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  });

  // Create or update a note
  app.post('/api/agent-notes/:path(*)', (req, res): any => {
    try {
      const { content, agentId } = req.body;
      const notePath = req.params.path;

      if (!content) {
        return res.status(400).json({ error: 'content required' });
      }

      agentNotesVault.writeNote(notePath, content);

      // Log to hive mind
      if (agentId) {
        hiveMind.logHiveMind(agentId, 'note_created', `Created note: ${notePath}`, {
          pathLength: notePath.length,
          contentLength: content.length,
        });
      }

      return res.json({
        success: true,
        path: notePath,
        message: 'Note saved',
      });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  });

  // Get backlinks for a note
  app.get('/api/agent-notes/:path(*)/backlinks', (req, res): any => {
    try {
      const notePath = req.params.path;
      const backlinks = agentNotesVault.getBacklinks(notePath);

      return res.json({
        success: true,
        path: notePath,
        count: backlinks.length,
        backlinks,
      });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  });

  // Append to daily note for an agent
  app.post('/api/agent-notes/daily/:agentId', (req, res): any => {
    try {
      const { content } = req.body;
      const agentId = req.params.agentId;

      if (!content) {
        return res.status(400).json({ error: 'content required' });
      }

      agentNotesVault.appendToDailyNote(agentId, content);

      // Log to hive mind
      hiveMind.logHiveMind(agentId, 'daily_note_append', `Added to daily note`, {
        contentLength: content.length,
      });

      return res.json({
        success: true,
        agentId,
        message: 'Appended to daily note',
      });
    } catch (error: any) {
      return res.status(400).json({ error: error.message });
    }
  });

  // Rebuild index (admin only)
  app.post('/api/agent-notes/admin/rebuild-index', (req, res): any => {
    try {
      agentNotesVault.rebuildIndex();
      return res.json({
        success: true,
        message: 'Index rebuilt',
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
    }
  });
}

export default setupAgentNotesRoutes;
