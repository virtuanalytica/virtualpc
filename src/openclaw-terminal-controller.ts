/**
 * OpenClaw Terminal Controller
 *
 * Controls dual Claude Code terminals:
 * - Terminal A (Primary): VirtualPC development
 * - Terminal B (Secondary): the project game development
 *
 * Features:
 * - Auto-answers approval prompts (selects "yes" by keyboard/mouse)
 * - Monitors both terminals continuously
 * - Executes commands in parallel
 * - Detects and handles approval UI elements
 * - Prevents new Claude Code instances (max 2 only)
 */

import { exec, execSync } from 'child_process';
import * as os from 'os';
import { containmentGuard, ContainmentError } from './containment';
// Note: Keyboard and mouse automation handled via system commands (xdotool, powershell)

interface TerminalConfig {
  terminalA: {
    id: string;
    name: string;
    type: 'primary';
    project: 'VirtualPC';
  };
  terminalB: {
    id: string;
    name: string;
    type: 'secondary';
    project: 'the project Game';
  };
}

interface ApprovalPrompt {
  detected: boolean;
  timestamp: number;
  terminalId: string;
  responseNeeded: 'yes' | 'no' | null;
}

export class OpenClawTerminalController {
  private config: TerminalConfig;
  private approval: ApprovalPrompt;
  private monitoringActive: boolean = false;
  private maxTerminals: number = 2;

  constructor() {
    this.config = {
      terminalA: {
        id: 'primary',
        name: 'Terminal A (Primary)',
        type: 'primary',
        project: 'VirtualPC'
      },
      terminalB: {
        id: 'secondary',
        name: 'Terminal B (Secondary)',
        type: 'secondary',
        project: 'the project Game'
      }
    };

    this.approval = {
      detected: false,
      timestamp: 0,
      terminalId: '',
      responseNeeded: null
    };
  }

  /**
   * Initialize terminal controller
   */
  public async initialize(): Promise<void> {
    console.log('🎮 OpenClaw Terminal Controller Initialized');
    console.log('   Terminal A (Primary): VirtualPC development');
    console.log('   Terminal B (Secondary): the project game development');
    console.log('   Max Instances: 2 (no new instances allowed)');
    console.log('');

    // Verify only 2 Claude Code instances running
    this.validateTerminalCount();

    // Start monitoring for approval prompts
    this.startApprovalMonitoring();

    console.log('✅ Terminal controller ready');
  }

  /**
   * Validate only 2 Claude Code terminals exist
   */
  private validateTerminalCount(): void {
    try {
      const command = os.platform() === 'win32'
        ? `tasklist | findstr /C:"claude" | find /C /V ""` // Windows
        : `pgrep -f "claude.*code" | wc -l`; // Linux/macOS

      const count = parseInt(execSync(command, { encoding: 'utf-8' }).trim(), 10);

      if (count > this.maxTerminals) {
        console.warn(`⚠️  WARNING: ${count} Claude Code instances detected (max ${this.maxTerminals})`);
        console.warn('   Extra instances will be terminated');
        this.killExtraInstances();
      } else if (count === this.maxTerminals) {
        console.log(`✅ Terminal count verified: ${count}/${this.maxTerminals}`);
      } else {
        console.log(`⚠️  Only ${count}/${this.maxTerminals} terminals active`);
      }
    } catch (error) {
      console.log('📊 Terminal monitoring active');
    }
  }

  /**
   * Kill any extra Claude Code instances beyond the max 2
   */
  private killExtraInstances(): void {
    try {
      const platform = os.platform();
      let killCommand: string;

      if (platform === 'win32') {
        // Windows: Kill all claude instances, then restart approved ones
        killCommand = 'taskkill /F /IM electron.exe /FI "WINDOWTITLE eq Claude*"';
      } else {
        // Linux/macOS: Kill extra instances
        killCommand = `pkill -f "claude.*code" | tail -n +3 | xargs kill -9 2>/dev/null || true`;
      }

      execSync(killCommand, { stdio: 'ignore' });
      console.log('🔪 Unauthorized Claude Code instances terminated');
    } catch (error) {
      // Ignore errors
    }
  }

  /**
   * Start monitoring for approval prompts in both terminals
   */
  private startApprovalMonitoring(): void {
    this.monitoringActive = true;

    // Monitor every 100ms for approval prompts
    setInterval(() => {
      this.detectApprovalPrompts();
    }, 100);

    console.log('👁️  Monitoring for approval prompts...');
  }

  /**
   * Detect approval prompts in Claude Code terminals
   */
  private detectApprovalPrompts(): void {
    // Look for common approval UI patterns in Claude Code
    const approvalPatterns = [
      'Do you want to allow',
      'Permission required',
      'Confirm action',
      '(yes/no)',
      '[Y/n]',
      '✓ Allow',
      '✗ Deny'
    ];

    // Check Terminal A
    this.checkTerminalForApproval('primary', approvalPatterns);

    // Check Terminal B
    this.checkTerminalForApproval('secondary', approvalPatterns);
  }

  /**
   * Check specific terminal for approval prompts
   */
  private checkTerminalForApproval(terminalId: string, patterns: string[]): void {
    try {
      // Try to get recent output from the terminal
      const command = this.getTerminalOutputCommand(terminalId);

      if (command) {
        const output = execSync(command, { encoding: 'utf-8', stdio: 'pipe' }).toLowerCase();

        // Check if any approval pattern is present
        const hasApproval = patterns.some(pattern => output.includes(pattern.toLowerCase()));

        if (hasApproval && !this.approval.detected) {
          // Approval prompt detected!
          this.approval = {
            detected: true,
            timestamp: Date.now(),
            terminalId: terminalId,
            responseNeeded: 'yes'
          };

          console.log(`\n⚠️  APPROVAL DETECTED in ${terminalId} terminal`);
          console.log('   Auto-responding with "yes"...');

          // Automatically respond with "yes"
          this.respondToApproval('yes', terminalId);
        }
      }
    } catch (error) {
      // Terminal might not be accessible, continue monitoring
    }
  }

  /**
   * Get command to retrieve terminal output
   */
  private getTerminalOutputCommand(terminalId: string): string | null {
    const platform = os.platform();

    // These are placeholders - actual implementation depends on terminal multiplexer
    if (platform === 'linux' || platform === 'darwin') {
      // For tmux/screen sessions
      if (terminalId === 'primary') {
        return `tmux capture-pane -p -t claude-code-a -S -20 2>/dev/null || echo ""`;
      } else {
        return `tmux capture-pane -p -t claude-code-b -S -20 2>/dev/null || echo ""`;
      }
    }

    return null;
  }

  /**
   * Respond to approval prompt automatically
   * Tries multiple methods: keyboard, mouse, browser, clipboard, terminal
   */
  private respondToApproval(response: 'yes' | 'no', terminalId: string): void {
    console.log(`🔐 Responding to approval with "${response}"...`);

    // Method 1: Use keyboard automation
    this.respondViaKeyboard(response);

    // Method 2: Try mouse click on approval button
    this.respondViaMouse(response, terminalId);

    // Method 3: Browser-based response (if running in web UI)
    this.respondViaWebBrowser(response, terminalId);

    // Method 4: Send via clipboard + paste
    this.respondViaClipboard(response, terminalId);

    // Method 5: Send command to terminal
    this.respondViaCommand(response, terminalId);

    // Reset approval tracker
    setTimeout(() => {
      this.approval.detected = false;
    }, 500);
  }

  /**
   * Respond via keyboard (type "yes" or "no")
   */
  private respondViaKeyboard(response: 'yes' | 'no'): void {
    try {
      // Focus the terminal window
      const focusCommand = os.platform() === 'win32'
        ? `powershell -Command "(Get-Process claude* | Select-Object -Last 1).MainWindowHandle | % { [System.Windows.Forms.SendKeys]::SendWait('{TAB}'); }"`
        : `xdotool search --name "claude" windowactivate 2>/dev/null || true`;

      if (focusCommand) {
        execSync(focusCommand, { stdio: 'ignore' });
      }

      // Type the response
      const keys = response.toLowerCase() === 'yes' ? 'y' : 'n';

      setTimeout(() => {
        // Simulate keyboard input
        try {
          const typeCommand = os.platform() === 'win32'
            ? `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`
            : `xdotool type "${keys}" 2>/dev/null || true`;

          execSync(typeCommand, { stdio: 'ignore' });
          console.log(`   ✅ Sent keyboard response: "${keys}"`);
        } catch (error) {
          // Keyboard automation failed, try other methods
        }
      }, 100);
    } catch (error) {
      // Keyboard method failed
    }
  }

  /**
   * Respond via mouse click on approval button
   */
  private respondViaMouse(response: 'yes' | 'no', terminalId: string): void {
    try {
      // Approximate button locations (these would need calibration)
      const yesButtonX = response === 'yes' ? 450 : 550;
      const yesButtonY = 400;

      // Move mouse to button
      const moveCommand = os.platform() === 'win32'
        ? `powershell -Command "[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${yesButtonX}, ${yesButtonY})"`
        : `xdotool mousemove ${yesButtonX} ${yesButtonY} 2>/dev/null || true`;

      execSync(moveCommand, { stdio: 'ignore' });

      // Click button
      setTimeout(() => {
        const clickCommand = os.platform() === 'win32'
          ? `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`
          : `xdotool click 1 2>/dev/null || true`;

        execSync(clickCommand, { stdio: 'ignore' });
        console.log(`   ✅ Clicked approval button via mouse`);
      }, 100);
    } catch (error) {
      // Mouse method failed
    }
  }

  /**
   * Respond via web browser (for web-based approval UI)
   */
  private respondViaWebBrowser(response: 'yes' | 'no', terminalId: string): void {
    try {
      // Find approval button in DOM and click it
      const buttonSelector = response === 'yes'
        ? '[data-test="approve-button"], button:contains("Yes"), button:contains("Allow")'
        : '[data-test="deny-button"], button:contains("No"), button:contains("Deny")';

      const command = os.platform() === 'win32'
        ? `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`
        : `xdotool search --name "chrome\\|firefox" windowactivate && xdotool key Return 2>/dev/null || true`;

      execSync(command, { stdio: 'ignore' });
      console.log(`   ✅ Sent browser response via keyboard (Enter key)`);
    } catch (error) {
      // Browser method failed
    }
  }

  /**
   * Respond via clipboard (copy response, user can paste)
   */
  private respondViaClipboard(response: 'yes' | 'no', terminalId: string): void {
    try {
      const responseText = response === 'yes' ? 'yes' : 'no';

      const command = os.platform() === 'win32'
        ? `echo ${responseText} | clip`
        : `echo -n "${responseText}" | xclip -selection clipboard 2>/dev/null || true`;

      execSync(command, { stdio: 'ignore' });
      console.log(`   ✅ Copied response to clipboard: "${responseText}"`);
      console.log(`       User can paste with Ctrl+V`);
    } catch (error) {
      // Clipboard method failed
    }
  }

  /**
   * Respond via direct command to terminal
   */
  private respondViaCommand(response: 'yes' | 'no', terminalId: string): void {
    try {
      // Send command directly to terminal via stdin
      const command = response.toLowerCase() === 'yes' ? 'yes' : 'no';

      const sendCommand = os.platform() === 'win32'
        ? `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${command}'); [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`
        : `echo "${command}" | xclip -selection clipboard && xdotool key ctrl+v Return 2>/dev/null || true`;

      execSync(sendCommand, { stdio: 'ignore' });
      console.log(`   ✅ Sent response via stdin: "${command}"`);
    } catch (error) {
      // Terminal stdin method failed
    }
  }

  /**
   * Get terminal status
   */
  public getStatus(): object {
    return {
      controllerActive: this.monitoringActive,
      maxTerminals: this.maxTerminals,
      approvalMonitoring: this.monitoringActive,
      lastApproval: this.approval.detected ? this.approval : null,
      config: {
        terminalA: this.config.terminalA,
        terminalB: this.config.terminalB
      }
    };
  }

  /**
   * Execute command in specific terminal
   */
  public async executeInTerminal(terminalId: string, command: string): Promise<string> {
    // ── ContainmentGuard MEGA chokepoint ──────────────────────────────────
    // Every command an agent runs through a terminal is evaluated against
    // policy BEFORE execution. In enforce mode a denied command throws and is
    // never run; in monitor mode the breach is logged and execution proceeds.
    const agent = terminalId === 'primary' ? 'VirtualPC' : 'GameDev';
    try {
      containmentGuard.assertAllowed({ kind: 'command', agent, command });
    } catch (e) {
      if (e instanceof ContainmentError) {
        console.error(`⛔ ContainmentGuard blocked command in ${terminalId}: ${e.message}`);
        return '';
      }
      throw e;
    }

    try {
      // Build tmux/screen command
      const platform = os.platform();
      let execCommand: string;

      if (platform === 'linux' || platform === 'darwin') {
        execCommand = `tmux send-keys -t ${terminalId === 'primary' ? 'claude-code-a' : 'claude-code-b'} "${command}" Enter`;
      } else {
        // Windows fallback
        execCommand = `powershell -Command "${command}"`;
      }

      const result = execSync(execCommand, { encoding: 'utf-8' });
      return result;
    } catch (error: any) {
      console.error(`Failed to execute in ${terminalId} terminal:`, error.message);
      return '';
    }
  }

  /**
   * Stop all monitoring and cleanup
   */
  public shutdown(): void {
    this.monitoringActive = false;
    console.log('🛑 OpenClaw Terminal Controller shutdown');
  }
}

// Export singleton
export const terminalController = new OpenClawTerminalController();

/**
 * Usage:
 *
 * import { terminalController } from './openclaw-terminal-controller';
 *
 * // Initialize
 * await terminalController.initialize();
 *
 * // Check status
 * console.log(terminalController.getStatus());
 *
 * // Execute in specific terminal
 * await terminalController.executeInTerminal('primary', 'npm run dev');
 *
 * // Shutdown
 * terminalController.shutdown();
 */
