/**
 * Agent Notes Vault
 *
 * Simple agent-note storage with wikilink backlinks.
 * Designed for agents to jot down ephemeral findings, decisions, risks.
 *
 * NOT a formal documentation system (that's the Live Wiki in data/wiki.json).
 * This is loose brainstorming + free-form note-taking.
 *
 * Minimal subset of ClaudeClaw's wiki.ts (~1000 lines → ~300 lines MVP).
 * No Gemini/LightRAG compile pipeline, no database, pure filesystem.
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../../utils/logger';

/**
 * Sanitize a path component to prevent traversal attacks.
 * - Rejects absolute paths and traversal segments
 * - Allows alphanumeric, hyphen, underscore, dot in each segment
 */
function sanitizePath(component: string): string {
  // Normalize separators and trim
  const normalizedInput = component.replace(/\\/g, '/').trim();

  // Reject absolute paths (POSIX and Windows drive letter forms)
  if (!normalizedInput || normalizedInput.startsWith('/') || /^[a-zA-Z]:\//.test(normalizedInput)) {
    throw new Error('Invalid note path after sanitization');
  }

  // Normalize dot segments using POSIX semantics
  const normalizedPath = path.posix.normalize(normalizedInput);

  // Validate each segment to block traversal and unsafe characters
  const segments = normalizedPath.split('/');
  const safeSegments = segments.map((segment) => {
    if (!segment || segment === '.' || segment === '..') {
      throw new Error('Invalid note path after sanitization');
    }

    const safeSegment = segment.replace(/[^a-zA-Z0-9_.-]/g, '');
    if (!safeSegment) {
      throw new Error('Invalid note path after sanitization');
    }

    return safeSegment;
  });

  const safe = safeSegments.join('/');
  if (!safe) {
    throw new Error('Invalid note path after sanitization');
  }

  return safe;
}

export interface AgentNote {
  path: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  backlinks: string[];
}

export class AgentNotesVault {
  private vaultDir: string;
  private dailyNotesDir: string;

  constructor(vaultDir: string = 'data/agent-notes') {
    this.vaultDir = vaultDir;
    this.dailyNotesDir = path.join(vaultDir, 'daily');
    this.ensureVaultDir();
  }

  /**
   * Write or update a note
   */
  writeNote(filePath: string, content: string): void {
    try {
      const safe = sanitizePath(filePath);
      const notePath = path.join(this.vaultDir, safe);

      // Verify the resolved path is within vault
      const resolved = path.resolve(notePath);
      const vaultResolved = path.resolve(this.vaultDir);
      if (!resolved.startsWith(vaultResolved)) {
        throw new Error(`Path traversal detected: ${filePath}`);
      }

      // Create directory if needed
      const dir = path.dirname(notePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(notePath, content, 'utf-8');
      logger.info(`[AgentNotes] Wrote note: ${safe}`, { size: content.length });
    } catch (e: any) {
      logger.error(`[AgentNotes] Failed to write note: ${e.message}`);
      throw e;
    }
  }

  /**
   * Read a note
   */
  readNote(filePath: string): string | null {
    try {
      const safe = sanitizePath(filePath);
      const notePath = path.join(this.vaultDir, safe);

      // Verify the resolved path is within vault
      const resolved = path.resolve(notePath);
      const vaultResolved = path.resolve(this.vaultDir);
      if (!resolved.startsWith(vaultResolved)) {
        throw new Error(`Path traversal detected: ${filePath}`);
      }

      if (!fs.existsSync(notePath)) {
        return null;
      }

      return fs.readFileSync(notePath, 'utf-8');
    } catch (e: any) {
      logger.error(`[AgentNotes] Failed to read note: ${e.message}`);
      return null;
    }
  }

  /**
   * Append to today's daily note for an agent
   */
  appendToDailyNote(agentId: string, content: string): void {
    try {
      const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const dailyPath = path.join(this.dailyNotesDir, agentId, `${today}.md`);

      // Verify path safety
      const safe = sanitizePath(`${agentId}/${today}.md`);
      const finalPath = path.join(this.dailyNotesDir, safe);

      const resolved = path.resolve(finalPath);
      const vaultResolved = path.resolve(this.vaultDir);
      if (!resolved.startsWith(vaultResolved)) {
        throw new Error(`Path traversal detected: ${dailyPath}`);
      }

      // Create directory if needed
      const dir = path.dirname(finalPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Append with timestamp
      const timestamp = new Date().toISOString();
      const line = `\n[${timestamp}] ${content}\n`;
      fs.appendFileSync(finalPath, line, 'utf-8');

      logger.debug(`[AgentNotes] Appended to daily note: ${agentId}/${today}`);
    } catch (e: any) {
      logger.error(`[AgentNotes] Failed to append to daily note: ${e.message}`);
    }
  }

  /**
   * List all notes (recursive)
   */
  listNotes(): string[] {
    try {
      const notes: string[] = [];

      const walk = (dir: string, prefix: string = ''): void => {
        if (!fs.existsSync(dir)) return;

        const files = fs.readdirSync(dir);
        for (const file of files) {
          const fullPath = path.join(dir, file);
          const stat = fs.statSync(fullPath);

          const relPath = prefix ? `${prefix}/${file}` : file;

          if (stat.isDirectory()) {
            walk(fullPath, relPath);
          } else {
            notes.push(relPath);
          }
        }
      };

      walk(this.vaultDir);
      return notes;
    } catch (e: any) {
      logger.error(`[AgentNotes] Failed to list notes: ${e.message}`);
      return [];
    }
  }

  /**
   * Extract wikilinks from content (simplified: [[note name]])
   */
  private extractWikilinks(content: string): string[] {
    const wikiLinkPattern = /\[\[([^\]]+)\]\]/g;
    const links: string[] = [];
    let match;

    while ((match = wikiLinkPattern.exec(content)) !== null) {
      links.push(match[1]);
    }

    return links;
  }

  /**
   * Get backlinks for a note (which notes link to this one)
   */
  getBacklinks(notePath: string): string[] {
    try {
      const backlinks: string[] = [];
      const notes = this.listNotes();

      for (const note of notes) {
        const content = this.readNote(note);
        if (!content) continue;

        const links = this.extractWikilinks(content);
        if (links.some((link) => link === notePath || link.endsWith(notePath))) {
          backlinks.push(note);
        }
      }

      return backlinks;
    } catch (e: any) {
      logger.error(`[AgentNotes] Failed to get backlinks: ${e.message}`);
      return [];
    }
  }

  /**
   * Rebuild full index (for recovery or debugging)
   */
  rebuildIndex(): void {
    try {
      const notes = this.listNotes();
      logger.info(`[AgentNotes] Index rebuilt: ${notes.length} notes found`);
    } catch (e: any) {
      logger.error(`[AgentNotes] Failed to rebuild index: ${e.message}`);
    }
  }

  /**
   * Private: Ensure vault directory exists
   */
  private ensureVaultDir(): void {
    if (!fs.existsSync(this.vaultDir)) {
      fs.mkdirSync(this.vaultDir, { recursive: true });
      logger.info(`[AgentNotes] Created vault directory: ${this.vaultDir}`);
    }
  }
}

// Singleton instance
export const agentNotesVault = new AgentNotesVault();
