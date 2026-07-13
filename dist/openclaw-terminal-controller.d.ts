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
export declare class OpenClawTerminalController {
    private config;
    private approval;
    private monitoringActive;
    private maxTerminals;
    constructor();
    /**
     * Initialize terminal controller
     */
    initialize(): Promise<void>;
    /**
     * Validate only 2 Claude Code terminals exist
     */
    private validateTerminalCount;
    /**
     * Kill any extra Claude Code instances beyond the max 2
     */
    private killExtraInstances;
    /**
     * Start monitoring for approval prompts in both terminals
     */
    private startApprovalMonitoring;
    /**
     * Detect approval prompts in Claude Code terminals
     */
    private detectApprovalPrompts;
    /**
     * Check specific terminal for approval prompts
     */
    private checkTerminalForApproval;
    /**
     * Get command to retrieve terminal output
     */
    private getTerminalOutputCommand;
    /**
     * Respond to approval prompt automatically
     * Tries multiple methods: keyboard, mouse, browser, clipboard, terminal
     */
    private respondToApproval;
    /**
     * Respond via keyboard (type "yes" or "no")
     */
    private respondViaKeyboard;
    /**
     * Respond via mouse click on approval button
     */
    private respondViaMouse;
    /**
     * Respond via web browser (for web-based approval UI)
     */
    private respondViaWebBrowser;
    /**
     * Respond via clipboard (copy response, user can paste)
     */
    private respondViaClipboard;
    /**
     * Respond via direct command to terminal
     */
    private respondViaCommand;
    /**
     * Get terminal status
     */
    getStatus(): object;
    /**
     * Execute command in specific terminal
     */
    executeInTerminal(terminalId: string, command: string): Promise<string>;
    /**
     * Stop all monitoring and cleanup
     */
    shutdown(): void;
}
export declare const terminalController: OpenClawTerminalController;
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
//# sourceMappingURL=openclaw-terminal-controller.d.ts.map