/**
 * Approval Monitor for Alexander
 *
 * Purpose: Flag all approval prompts/yes-or-no decisions immediately to Alexander
 * Ensures Alexander can command the other terminal (Terminal B / Cleopatra)
 *
 * Monitors:
 * - Kafka approval messages
 * - Terminal approval prompts
 * - Yes/No decision points
 * - Permission requests
 */
export interface ApprovalEvent {
    id: string;
    timestamp: Date;
    type: 'approval' | 'permission' | 'decision' | 'prompt';
    source: string;
    question: string;
    options: string[];
    urgency: 'low' | 'medium' | 'high' | 'critical';
    status: 'pending' | 'approved' | 'rejected' | 'expired';
}
export declare class ApprovalMonitor {
    private pendingApprovals;
    private approvalHistory;
    private maxHistorySize;
    private idSeq;
    /**
     * Flag a new approval event
     * Called whenever a yes/no decision or permission is needed
     */
    flagApproval(source: string, // terminal name
    question: string, options?: string[], urgency?: 'low' | 'medium' | 'high' | 'critical'): ApprovalEvent;
    /**
     * Alexander issues command to approve or reject
     */
    respondToApproval(approvalId: string, response: 'yes' | 'no'): ApprovalEvent | null;
    /**
     * Get all pending approvals (critical info for Alexander)
     */
    getPendingApprovals(): ApprovalEvent[];
    /**
     * Get approval by ID
     */
    getApproval(approvalId: string): ApprovalEvent | null;
    /**
     * Get approval history
     */
    getHistory(): ApprovalEvent[];
    /**
     * Clear expired approvals (default: 5 minutes)
     */
    clearExpired(maxAgeMins?: number): number;
    /**
     * Status dashboard for Alexander
     */
    getStatus(): any;
    /**
     * Format for terminal display
     */
    formatForDisplay(): string;
}
export declare const approvalMonitor: ApprovalMonitor;
/**
 * Usage in other modules:
 *
 * import { approvalMonitor } from './approval-monitor';
 *
 * // Flag an approval
 * approvalMonitor.flagApproval(
 *   'Terminal B (Cleopatra)',
 *   'Continue the project development?',
 *   ['yes', 'no'],
 *   'high'
 * );
 *
 * // Alexander responds
 * approvalMonitor.respondToApproval(approvalId, 'yes');
 *
 * // Check pending
 * const pending = approvalMonitor.getPendingApprovals();
 */
//# sourceMappingURL=approval-monitor.d.ts.map