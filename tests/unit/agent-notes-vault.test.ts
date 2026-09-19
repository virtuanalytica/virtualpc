/**
 * Agent Notes Vault Tests
 */

import { AgentNotesVault } from '../../src/integrations/agent-notes/agent-notes-vault';
import * as fs from 'fs';
import * as path from 'path';

describe('Agent Notes Vault', () => {
  let vault: AgentNotesVault;
  let vaultDir: string;

  beforeEach(() => {
    vaultDir = path.join('/tmp', `agent-notes-test-${Date.now()}`);
    vault = new AgentNotesVault(vaultDir);
  });

  afterEach(() => {
    try {
      if (fs.existsSync(vaultDir)) {
        fs.rmSync(vaultDir, { recursive: true, force: true });
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Note Operations', () => {
    it('should write and read a note', () => {
      vault.writeNote('test.md', 'Hello, notes!');
      const content = vault.readNote('test.md');
      expect(content).toBe('Hello, notes!');
    });

    it('should return null for non-existent note', () => {
      const content = vault.readNote('nonexistent.md');
      expect(content).toBeNull();
    });

    it('should handle nested paths', () => {
      vault.writeNote('folder/subfolder/note.md', 'Nested content');
      const content = vault.readNote('folder/subfolder/note.md');
      expect(content).toBe('Nested content');
    });

    it('should sanitize path traversal attempts', () => {
      // Traversal is rejected before filesystem access; do not silently
      // rewrite an attacker-controlled path into an unrelated note.
      expect(() => vault.writeNote('../../../etc/passwd', 'blocked')).toThrow();
      expect(() => vault.writeNote('../../outside', 'blocked')).toThrow();
      expect(vault.listNotes()).toEqual([]);
    });
  });

  describe('Daily Notes', () => {
    it('should append to daily note', () => {
      vault.appendToDailyNote('kai', 'Morning thoughts');
      vault.appendToDailyNote('kai', 'Evening update');

      const dailyPath = `daily/kai/${new Date().toISOString().split('T')[0]}.md`;
      const content = vault.readNote(dailyPath);
      expect(content).toContain('Morning thoughts');
      expect(content).toContain('Evening update');
    });
  });

  describe('Listing & Backlinks', () => {
    it('should list all notes', () => {
      vault.writeNote('note1.md', 'Note 1');
      vault.writeNote('folder/note2.md', 'Note 2');
      const notes = vault.listNotes();

      expect(notes.length).toBeGreaterThanOrEqual(2);
    });

    it('should extract wikilinks from content', () => {
      vault.writeNote('about-design.md', 'See [[architecture]] and [[api-spec]]');
      vault.writeNote('architecture.md', 'Architecture notes');
      vault.writeNote('api-spec.md', 'API spec');

      const backlinks = vault.getBacklinks('architecture');
      expect(backlinks.length).toBeGreaterThan(0);
    });

    it('should handle rebuild index without crashing', () => {
      vault.writeNote('note.md', 'Content');
      expect(() => {
        vault.rebuildIndex();
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should handle empty paths gracefully', () => {
      expect(() => {
        vault.writeNote('', 'content');
      }).toThrow();
    });

    it('should handle very long paths', () => {
      const longPath = 'a'.repeat(200) + '.md';
      expect(() => {
        vault.writeNote(longPath, 'content');
      }).not.toThrow();
    });
  });
});
