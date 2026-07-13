"use strict";
/**
 * OpenClaw Emergency Kill Switch (Ctrl-Q-Q)
 *
 * Global keyboard listener that terminates all automation processes
 * when user presses Ctrl+Q twice rapidly within 1 second.
 *
 * This is a critical safety mechanism to return control to user
 * when autonomous automation becomes unresponsive or problematic.
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
exports.killSwitch = exports.OpenClawKillSwitch = void 0;
const child_process_1 = require("child_process");
const os = __importStar(require("os"));
class OpenClawKillSwitch {
    constructor(config = {}) {
        this.lastQPress = 0;
        this.qPressCount = 0;
        this.isKillSwitchActive = false;
        this.config = {
            keyCombo: config.keyCombo || 'ctrl-q-q',
            timeWindow: config.timeWindow || 1000,
            debug: config.debug || false
        };
    }
    /**
     * Initialize kill switch listener
     * Must be called at application startup
     */
    initialize() {
        console.log('🔴 OpenClaw Kill Switch Initialized');
        console.log('   Press Ctrl+Q twice (within 1 second) to stop all automation');
        // Try to setup global keyboard listener
        // Note: This requires system-level keyboard hook or manual key event handling
        this.setupKeyboardListener();
    }
    /**
     * Setup keyboard listener for Ctrl+Q+Q detection
     */
    setupKeyboardListener() {
        // If running in Node.js with interactive terminal
        if (process.stdin.isTTY) {
            // Enable raw mode to capture all keypresses
            process.stdin.setRawMode(true);
            process.stdin.on('data', (key) => {
                this.handleKeypress(key);
            });
        }
        // For web-based selenium automation, use a different approach
        this.setupSeleniumMonitoring();
        if (this.config.debug) {
            console.log('✅ Keyboard listener active');
        }
    }
    /**
     * Handle individual keypress events
     */
    handleKeypress(key) {
        // Ctrl+Q = 0x11 (17 in decimal)
        const keyCode = key[0];
        // Check if this is a 'Q' keypress with Ctrl held
        const isCtrlPressed = process.stdin.isRaw;
        const isQKey = keyCode === 0x11; // Ctrl+Q
        if (isQKey && isCtrlPressed) {
            const now = Date.now();
            // Check if this is within the time window of the last Q press
            if (now - this.lastQPress < this.config.timeWindow) {
                this.qPressCount++;
                if (this.qPressCount >= 2) {
                    // KILL SWITCH ACTIVATED!
                    this.activateKillSwitch();
                    this.qPressCount = 0;
                }
            }
            else {
                // Reset counter if outside time window
                this.qPressCount = 1;
            }
            this.lastQPress = now;
        }
    }
    /**
     * Setup monitoring for Selenium processes
     * When running demos, watch for Ctrl+Q signals
     */
    setupSeleniumMonitoring() {
        // Listen for SIGINT (Ctrl+C) as fallback
        process.on('SIGINT', () => {
            // Ctrl+C pressed - activate kill switch
            this.activateKillSwitch();
        });
    }
    /**
     * ACTIVATE KILL SWITCH - Terminate all automation
     */
    activateKillSwitch() {
        if (this.isKillSwitchActive) {
            return; // Already activated, prevent double-trigger
        }
        this.isKillSwitchActive = true;
        console.log('\n');
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log('║ ⚠️  CTRL-Q-Q DETECTED - EMERGENCY STOP INITIATED     ║');
        console.log('╚═══════════════════════════════════════════════════════╝');
        console.log('');
        // Kill all automation processes
        this.killAllAutomation();
        // Disable mouse control
        this.disableMouseControl();
        // Return control to user
        console.log('✅ Control returned to user');
        console.log('📝 All automation stopped');
        console.log('');
        console.log('Recovery options:');
        console.log('  • npm run dev (resume normal development)');
        console.log('  • npm run demo:interactive (restart VirtualPC demo)');
        console.log('');
        // Reset kill switch flag after 2 seconds
        setTimeout(() => {
            this.isKillSwitchActive = false;
        }, 2000);
    }
    /**
     * Kill all automation-related processes
     */
    killAllAutomation() {
        console.log('🔪 Terminating automation processes...');
        const killTargets = [
            'selenium-launcher',
            'interactive-demo',
            'chrome.*webdriver',
            'firefox.*webdriver',
            'chromedriver',
            'geckodriver'
        ];
        for (const target of killTargets) {
            this.killProcess(target);
        }
        console.log('✅ All automation processes terminated');
    }
    /**
     * Kill a specific process by name pattern
     */
    killProcess(pattern) {
        try {
            const command = this.getOSKillCommand(pattern);
            if (this.config.debug) {
                console.log(`   Killing: ${pattern}`);
            }
            (0, child_process_1.execSync)(command, { stdio: 'ignore' });
        }
        catch (error) {
            // Process might not exist, that's okay
            if (this.config.debug) {
                console.log(`   No process found: ${pattern}`);
            }
        }
    }
    /**
     * Get OS-specific kill command
     */
    getOSKillCommand(pattern) {
        const platform = os.platform();
        if (platform === 'win32') {
            // Windows
            return `taskkill /F /IM ${pattern} 2>nul`;
        }
        else {
            // macOS / Linux
            return `pkill -f "${pattern}" 2>/dev/null || true`;
        }
    }
    /**
     * Disable mouse control
     */
    disableMouseControl() {
        console.log('🖱️  Disabling mouse automation...');
        // Mouse control disabled automatically when selenium processes killed
        console.log('✅ Mouse control released');
    }
    /**
     * Reset automation (for recovery after kill switch)
     */
    reset() {
        this.isKillSwitchActive = false;
        this.qPressCount = 0;
        this.lastQPress = 0;
        console.log('🔄 Kill switch reset, ready for next automation');
    }
    /**
     * Get current status
     */
    getStatus() {
        return {
            isActive: this.isKillSwitchActive,
            timeWindow: this.config.timeWindow,
            qPressCount: this.qPressCount
        };
    }
}
exports.OpenClawKillSwitch = OpenClawKillSwitch;
// Export singleton instance
exports.killSwitch = new OpenClawKillSwitch({
    debug: process.env.DEBUG_KILL_SWITCH === 'true'
});
// Initialize on import
if (process.env.ENABLE_KILL_SWITCH !== 'false') {
    exports.killSwitch.initialize();
}
/**
 * Usage in other modules:
 *
 * import { killSwitch } from './openclaw-kill-switch';
 *
 * // Initialize at startup
 * killSwitch.initialize();
 *
 * // Check status
 * console.log(killSwitch.getStatus());
 *
 * // Manually trigger (if needed)
 * killSwitch.activateKillSwitch();
 *
 * // Reset after recovery
 * killSwitch.reset();
 */
//# sourceMappingURL=openclaw-kill-switch.js.map