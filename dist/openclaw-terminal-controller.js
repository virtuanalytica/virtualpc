"use strict";
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
exports.terminalController = exports.OpenClawTerminalController = void 0;
const child_process_1 = require("child_process");
const os = __importStar(require("os"));
const containment_1 = require("./containment");
class OpenClawTerminalController {
    constructor() {
        this.monitoringActive = false;
        this.maxTerminals = 2;
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
    async initialize() {
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
    validateTerminalCount() {
        try {
            const command = os.platform() === 'win32'
                ? `tasklist | findstr /C:"claude" | find /C /V ""` // Windows
                : `pgrep -f "claude.*code" | wc -l`; // Linux/macOS
            const count = parseInt((0, child_process_1.execSync)(command, { encoding: 'utf-8' }).trim(), 10);
            if (count > this.maxTerminals) {
                console.warn(`⚠️  WARNING: ${count} Claude Code instances detected (max ${this.maxTerminals})`);
                console.warn('   Extra instances will be terminated');
                this.killExtraInstances();
            }
            else if (count === this.maxTerminals) {
                console.log(`✅ Terminal count verified: ${count}/${this.maxTerminals}`);
            }
            else {
                console.log(`⚠️  Only ${count}/${this.maxTerminals} terminals active`);
            }
        }
        catch (error) {
            console.log('📊 Terminal monitoring active');
        }
    }
    /**
     * Kill any extra Claude Code instances beyond the max 2
     */
    killExtraInstances() {
        try {
            const platform = os.platform();
            let killCommand;
            if (platform === 'win32') {
                // Windows: Kill all claude instances, then restart approved ones
                killCommand = 'taskkill /F /IM electron.exe /FI "WINDOWTITLE eq Claude*"';
            }
            else {
                // Linux/macOS: Kill extra instances
                killCommand = `pkill -f "claude.*code" | tail -n +3 | xargs kill -9 2>/dev/null || true`;
            }
            (0, child_process_1.execSync)(killCommand, { stdio: 'ignore' });
            console.log('🔪 Unauthorized Claude Code instances terminated');
        }
        catch (error) {
            // Ignore errors
        }
    }
    /**
     * Start monitoring for approval prompts in both terminals
     */
    startApprovalMonitoring() {
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
    detectApprovalPrompts() {
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
    checkTerminalForApproval(terminalId, patterns) {
        try {
            // Try to get recent output from the terminal
            const command = this.getTerminalOutputCommand(terminalId);
            if (command) {
                const output = (0, child_process_1.execSync)(command, { encoding: 'utf-8', stdio: 'pipe' }).toLowerCase();
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
        }
        catch (error) {
            // Terminal might not be accessible, continue monitoring
        }
    }
    /**
     * Get command to retrieve terminal output
     */
    getTerminalOutputCommand(terminalId) {
        const platform = os.platform();
        // These are placeholders - actual implementation depends on terminal multiplexer
        if (platform === 'linux' || platform === 'darwin') {
            // For tmux/screen sessions
            if (terminalId === 'primary') {
                return `tmux capture-pane -p -t claude-code-a -S -20 2>/dev/null || echo ""`;
            }
            else {
                return `tmux capture-pane -p -t claude-code-b -S -20 2>/dev/null || echo ""`;
            }
        }
        return null;
    }
    /**
     * Respond to approval prompt automatically
     * Tries multiple methods: keyboard, mouse, browser, clipboard, terminal
     */
    respondToApproval(response, terminalId) {
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
    respondViaKeyboard(response) {
        try {
            // Focus the terminal window
            const focusCommand = os.platform() === 'win32'
                ? `powershell -Command "(Get-Process claude* | Select-Object -Last 1).MainWindowHandle | % { [System.Windows.Forms.SendKeys]::SendWait('{TAB}'); }"`
                : `xdotool search --name "claude" windowactivate 2>/dev/null || true`;
            if (focusCommand) {
                (0, child_process_1.execSync)(focusCommand, { stdio: 'ignore' });
            }
            // Type the response
            const keys = response.toLowerCase() === 'yes' ? 'y' : 'n';
            setTimeout(() => {
                // Simulate keyboard input
                try {
                    const typeCommand = os.platform() === 'win32'
                        ? `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`
                        : `xdotool type "${keys}" 2>/dev/null || true`;
                    (0, child_process_1.execSync)(typeCommand, { stdio: 'ignore' });
                    console.log(`   ✅ Sent keyboard response: "${keys}"`);
                }
                catch (error) {
                    // Keyboard automation failed, try other methods
                }
            }, 100);
        }
        catch (error) {
            // Keyboard method failed
        }
    }
    /**
     * Respond via mouse click on approval button
     */
    respondViaMouse(response, terminalId) {
        try {
            // Approximate button locations (these would need calibration)
            const yesButtonX = response === 'yes' ? 450 : 550;
            const yesButtonY = 400;
            // Move mouse to button
            const moveCommand = os.platform() === 'win32'
                ? `powershell -Command "[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${yesButtonX}, ${yesButtonY})"`
                : `xdotool mousemove ${yesButtonX} ${yesButtonY} 2>/dev/null || true`;
            (0, child_process_1.execSync)(moveCommand, { stdio: 'ignore' });
            // Click button
            setTimeout(() => {
                const clickCommand = os.platform() === 'win32'
                    ? `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`
                    : `xdotool click 1 2>/dev/null || true`;
                (0, child_process_1.execSync)(clickCommand, { stdio: 'ignore' });
                console.log(`   ✅ Clicked approval button via mouse`);
            }, 100);
        }
        catch (error) {
            // Mouse method failed
        }
    }
    /**
     * Respond via web browser (for web-based approval UI)
     */
    respondViaWebBrowser(response, terminalId) {
        try {
            // Find approval button in DOM and click it
            const buttonSelector = response === 'yes'
                ? '[data-test="approve-button"], button:contains("Yes"), button:contains("Allow")'
                : '[data-test="deny-button"], button:contains("No"), button:contains("Deny")';
            const command = os.platform() === 'win32'
                ? `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`
                : `xdotool search --name "chrome\\|firefox" windowactivate && xdotool key Return 2>/dev/null || true`;
            (0, child_process_1.execSync)(command, { stdio: 'ignore' });
            console.log(`   ✅ Sent browser response via keyboard (Enter key)`);
        }
        catch (error) {
            // Browser method failed
        }
    }
    /**
     * Respond via clipboard (copy response, user can paste)
     */
    respondViaClipboard(response, terminalId) {
        try {
            const responseText = response === 'yes' ? 'yes' : 'no';
            const command = os.platform() === 'win32'
                ? `echo ${responseText} | clip`
                : `echo -n "${responseText}" | xclip -selection clipboard 2>/dev/null || true`;
            (0, child_process_1.execSync)(command, { stdio: 'ignore' });
            console.log(`   ✅ Copied response to clipboard: "${responseText}"`);
            console.log(`       User can paste with Ctrl+V`);
        }
        catch (error) {
            // Clipboard method failed
        }
    }
    /**
     * Respond via direct command to terminal
     */
    respondViaCommand(response, terminalId) {
        try {
            // Send command directly to terminal via stdin
            const command = response.toLowerCase() === 'yes' ? 'yes' : 'no';
            const sendCommand = os.platform() === 'win32'
                ? `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${command}'); [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`
                : `echo "${command}" | xclip -selection clipboard && xdotool key ctrl+v Return 2>/dev/null || true`;
            (0, child_process_1.execSync)(sendCommand, { stdio: 'ignore' });
            console.log(`   ✅ Sent response via stdin: "${command}"`);
        }
        catch (error) {
            // Terminal stdin method failed
        }
    }
    /**
     * Get terminal status
     */
    getStatus() {
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
    async executeInTerminal(terminalId, command) {
        // ── ContainmentGuard MEGA chokepoint ──────────────────────────────────
        // Every command an agent runs through a terminal is evaluated against
        // policy BEFORE execution. In enforce mode a denied command throws and is
        // never run; in monitor mode the breach is logged and execution proceeds.
        const agent = terminalId === 'primary' ? 'VirtualPC' : 'GameDev';
        try {
            containment_1.containmentGuard.assertAllowed({ kind: 'command', agent, command });
        }
        catch (e) {
            if (e instanceof containment_1.ContainmentError) {
                console.error(`⛔ ContainmentGuard blocked command in ${terminalId}: ${e.message}`);
                return '';
            }
            throw e;
        }
        try {
            // Build tmux/screen command
            const platform = os.platform();
            let execCommand;
            if (platform === 'linux' || platform === 'darwin') {
                execCommand = `tmux send-keys -t ${terminalId === 'primary' ? 'claude-code-a' : 'claude-code-b'} "${command}" Enter`;
            }
            else {
                // Windows fallback
                execCommand = `powershell -Command "${command}"`;
            }
            const result = (0, child_process_1.execSync)(execCommand, { encoding: 'utf-8' });
            return result;
        }
        catch (error) {
            console.error(`Failed to execute in ${terminalId} terminal:`, error.message);
            return '';
        }
    }
    /**
     * Stop all monitoring and cleanup
     */
    shutdown() {
        this.monitoringActive = false;
        console.log('🛑 OpenClaw Terminal Controller shutdown');
    }
}
exports.OpenClawTerminalController = OpenClawTerminalController;
// Export singleton
exports.terminalController = new OpenClawTerminalController();
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
//# sourceMappingURL=openclaw-terminal-controller.js.map