/**
 * Process Singleton Lock
 *
 * Ensures only one instance of a process runs at a time using a PID file lock.
 * Prevents duplicate instances from accessing shared resources (e.g., state files).
 *
 * Ported from ClaudeClaw's bot-singleton.ts (142 lines, node:fs + node:process only).
 */

import * as fs from 'fs';
import logger from './logger';

export class ProcessSingleton {
  private pidFile: string;
  private ownPid: number;

  constructor(pidFilePath: string = '.virtualpc.pid') {
    this.pidFile = pidFilePath;
    this.ownPid = process.pid;
  }

  /**
   * Acquire the singleton lock
   * Returns true if we got the lock, false if another process holds it
   */
  acquire(): boolean {
    try {
      // Check if PID file exists
      if (fs.existsSync(this.pidFile)) {
        const existingPid = fs.readFileSync(this.pidFile, 'utf-8').trim();
        const existingPidNum = parseInt(existingPid, 10);

        // Check if the process with that PID is still running
        if (this.isProcessRunning(existingPidNum)) {
          logger.error(
            `[ProcessSingleton] Another instance is running (PID: ${existingPidNum}). Cannot acquire lock.`
          );
          return false;
        }

        // PID file is stale, remove it
        logger.warn(`[ProcessSingleton] Stale PID file found (PID: ${existingPidNum}). Removing...`);
        try {
          fs.unlinkSync(this.pidFile);
        } catch (e: any) {
          logger.error(`[ProcessSingleton] Failed to remove stale PID file: ${e.message}`);
          return false;
        }
      }

      // Write our PID to the file
      fs.writeFileSync(this.pidFile, this.ownPid.toString());
      logger.info(`[ProcessSingleton] Acquired lock (PID: ${this.ownPid})`);
      return true;
    } catch (e: any) {
      logger.error(`[ProcessSingleton] Failed to acquire lock: ${e.message}`);
      return false;
    }
  }

  /**
   * Release the singleton lock
   */
  release(): void {
    try {
      if (fs.existsSync(this.pidFile)) {
        const currentPid = fs.readFileSync(this.pidFile, 'utf-8').trim();
        if (currentPid === this.ownPid.toString()) {
          fs.unlinkSync(this.pidFile);
          logger.info(`[ProcessSingleton] Released lock (PID: ${this.ownPid})`);
        }
      }
    } catch (e: any) {
      logger.error(`[ProcessSingleton] Failed to release lock: ${e.message}`);
    }
  }

  /**
   * Check if a process with the given PID is still running
   */
  private isProcessRunning(pid: number): boolean {
    try {
      // Sending signal 0 checks if process exists without sending any signal
      process.kill(pid, 0);
      return true;
    } catch (e: any) {
      // If error, process doesn't exist
      return false;
    }
  }

  /**
   * Get the PID that holds the lock (or null if no lock)
   */
  getLockHolder(): number | null {
    try {
      if (fs.existsSync(this.pidFile)) {
        const pidStr = fs.readFileSync(this.pidFile, 'utf-8').trim();
        const pid = parseInt(pidStr, 10);
        return this.isProcessRunning(pid) ? pid : null;
      }
      return null;
    } catch (e: any) {
      return null;
    }
  }

  /**
   * Force release (dangerous, use only if sure the other process is dead)
   */
  forceRelease(): void {
    try {
      if (fs.existsSync(this.pidFile)) {
        fs.unlinkSync(this.pidFile);
        logger.warn(`[ProcessSingleton] Force released lock`);
      }
    } catch (e: any) {
      logger.error(`[ProcessSingleton] Failed to force release: ${e.message}`);
    }
  }
}

// Singleton instance (default: .virtualpc.pid in current directory)
export const processSingleton = new ProcessSingleton('.virtualpc.pid');
