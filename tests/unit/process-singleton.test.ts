/**
 * Process Singleton Tests
 *
 * Verify PID-file based single-instance locking
 */

import { ProcessSingleton } from '../../src/utils/process-singleton';
import * as fs from 'fs';
import * as path from 'path';

describe('Process Singleton', () => {
  let pidFile: string;
  let singleton: ProcessSingleton;

  beforeEach(() => {
    pidFile = path.join('/tmp', `test-${Date.now()}.pid`);
    singleton = new ProcessSingleton(pidFile);
  });

  afterEach(() => {
    try {
      singleton.release();
      if (fs.existsSync(pidFile)) {
        fs.unlinkSync(pidFile);
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('Lock Acquisition', () => {
    it('should acquire lock when none exists', () => {
      const acquired = singleton.acquire();
      expect(acquired).toBe(true);
      expect(fs.existsSync(pidFile)).toBe(true);
    });

    it('should fail to acquire lock if another process has it', () => {
      const singleton1 = new ProcessSingleton(pidFile);
      const singleton2 = new ProcessSingleton(pidFile);

      const acquired1 = singleton1.acquire();
      expect(acquired1).toBe(true);

      const acquired2 = singleton2.acquire();
      expect(acquired2).toBe(false);

      singleton1.release();
    });

    it('should write current PID to file', () => {
      singleton.acquire();
      const pidContent = fs.readFileSync(pidFile, 'utf-8').trim();
      expect(parseInt(pidContent, 10)).toBe(process.pid);
    });
  });

  describe('Lock Release', () => {
    it('should release the lock', () => {
      singleton.acquire();
      expect(fs.existsSync(pidFile)).toBe(true);

      singleton.release();
      expect(fs.existsSync(pidFile)).toBe(false);
    });

    it('should only release if we hold the lock', () => {
      const singleton1 = new ProcessSingleton(pidFile);
      const singleton2 = new ProcessSingleton(pidFile + '.other');

      singleton1.acquire();
      singleton2.release(); // Should not affect singleton1's lock

      expect(fs.existsSync(pidFile)).toBe(true);
      singleton1.release();
    });
  });

  describe('Stale Lock Handling', () => {
    it('should handle stale PID files', () => {
      // Write an invalid (non-existent) PID
      fs.writeFileSync(pidFile, '999999');

      const singleton2 = new ProcessSingleton(pidFile);
      const acquired = singleton2.acquire();

      expect(acquired).toBe(true);
      expect(fs.existsSync(pidFile)).toBe(true);

      singleton2.release();
    });
  });

  describe('Lock Holder Detection', () => {
    it('should report the lock holder PID', () => {
      singleton.acquire();
      const holder = singleton.getLockHolder();
      expect(holder).toBe(process.pid);
    });

    it('should return null if no lock exists', () => {
      const holder = singleton.getLockHolder();
      expect(holder).toBeNull();
    });

    it('should return null for stale lock', () => {
      // Write invalid PID
      fs.writeFileSync(pidFile, '999999');

      const holder = singleton.getLockHolder();
      expect(holder).toBeNull();

      fs.unlinkSync(pidFile);
    });
  });

  describe('Force Release', () => {
    it('should force release a lock', () => {
      singleton.acquire();
      expect(fs.existsSync(pidFile)).toBe(true);

      singleton.forceRelease();
      expect(fs.existsSync(pidFile)).toBe(false);
    });
  });
});
