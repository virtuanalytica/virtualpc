"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.approvalMonitor = exports.ApprovalMonitor = void 0;
const logger_1 = __importDefault(require("./utils/logger"));
class ApprovalMonitor {
    constructor() {
        this.pendingApprovals = new Map();
        this.approvalHistory = [];
        this.maxHistorySize = 100;
        // Monotonic counter so two approvals from the same source in the same
        // millisecond get distinct ids (otherwise they overwrite in the map).
        this.idSeq = 0;
    }
    /**
     * Flag a new approval event
     * Called whenever a yes/no decision or permission is needed
     */
    flagApproval(source, // terminal name
    question, options = ['yes', 'no'], urgency = 'high') {
        const approvalId = `approval_${source}_${Date.now()}_${this.idSeq++}`;
        const approval = {
            id: approvalId,
            timestamp: new Date(),
            type: 'approval',
            source,
            question,
            options,
            urgency,
            status: 'pending'
        };
        this.pendingApprovals.set(approvalId, approval);
        // Log immediately to Alexander
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════╗');
        console.log('║ ⚠️  APPROVAL FLAGGED TO ALEXANDER                   ║');
        console.log('╚══════════════════════════════════════════════════════╝');
        console.log('');
        console.log(`🦁 ALEXANDER: Approval waiting in ${source}`);
        console.log(`   ID: ${approvalId}`);
        console.log(`   Question: "${question}"`);
        console.log(`   Options: ${options.join(' / ')}`);
        console.log(`   Urgency: ${urgency.toUpperCase()}`);
        console.log(`   Time: ${approval.timestamp.toISOString()}`);
        console.log('');
        console.log('👑 CLEOPATRA: Awaiting your command...');
        console.log('💰 MONEY GOD: Resources standing by...');
        console.log('');
        logger_1.default.warn(`⚠️  Approval flagged: ${source} - "${question}"`);
        logger_1.default.warn(`    Type: ${approval.type} | Urgency: ${urgency}`);
        return approval;
    }
    /**
     * Alexander issues command to approve or reject
     */
    respondToApproval(approvalId, response) {
        const approval = this.pendingApprovals.get(approvalId);
        if (!approval) {
            logger_1.default.error(`❌ Approval not found: ${approvalId}`);
            return null;
        }
        // Update status
        approval.status = response === 'yes' ? 'approved' : 'rejected';
        // Log Alexander's decision
        console.log('\n');
        console.log('╔══════════════════════════════════════════════════════╗');
        console.log('║ 🦁 ALEXANDER\'S DECISION                            ║');
        console.log('╚══════════════════════════════════════════════════════╝');
        console.log('');
        console.log(`✅ Response: ${response.toUpperCase()}`);
        console.log(`   Approval ID: ${approvalId}`);
        console.log(`   Terminal: ${approval.source}`);
        console.log(`   Question: "${approval.question}"`);
        console.log(`   Decision Time: ${new Date().toISOString()}`);
        console.log('');
        logger_1.default.info(`✅ Alexander decision: ${response.toUpperCase()} on ${approvalId}`);
        // Move to history
        this.pendingApprovals.delete(approvalId);
        this.approvalHistory.push(approval);
        // Keep history bounded
        if (this.approvalHistory.length > this.maxHistorySize) {
            this.approvalHistory.shift();
        }
        return approval;
    }
    /**
     * Get all pending approvals (critical info for Alexander)
     */
    getPendingApprovals() {
        return Array.from(this.pendingApprovals.values()).sort((a, b) => {
            const urgencyOrder = { critical: 4, high: 3, medium: 2, low: 1 };
            return urgencyOrder[b.urgency] -
                urgencyOrder[a.urgency];
        });
    }
    /**
     * Get approval by ID
     */
    getApproval(approvalId) {
        return this.pendingApprovals.get(approvalId) || null;
    }
    /**
     * Get approval history
     */
    getHistory() {
        return [...this.approvalHistory];
    }
    /**
     * Clear expired approvals (default: 5 minutes)
     */
    clearExpired(maxAgeMins = 5) {
        const now = Date.now();
        const maxAge = maxAgeMins * 60 * 1000;
        let cleared = 0;
        for (const [id, approval] of this.pendingApprovals.entries()) {
            if (now - approval.timestamp.getTime() > maxAge) {
                approval.status = 'expired';
                this.pendingApprovals.delete(id);
                this.approvalHistory.push(approval);
                cleared++;
            }
        }
        if (cleared > 0) {
            logger_1.default.warn(`🔲 Cleared ${cleared} expired approvals`);
        }
        return cleared;
    }
    /**
     * Status dashboard for Alexander
     */
    getStatus() {
        const pending = this.getPendingApprovals();
        const critical = pending.filter(a => a.urgency === 'critical');
        const high = pending.filter(a => a.urgency === 'high');
        return {
            totalPending: pending.length,
            critical: critical.length,
            high: high.length,
            medium: pending.filter(a => a.urgency === 'medium').length,
            low: pending.filter(a => a.urgency === 'low').length,
            pending: pending,
            historicalTotal: this.approvalHistory.length,
            recentDecisions: this.approvalHistory.slice(-10)
        };
    }
    /**
     * Format for terminal display
     */
    formatForDisplay() {
        const pending = this.getPendingApprovals();
        if (pending.length === 0) {
            return '✅ No pending approvals';
        }
        let output = '⚠️  PENDING APPROVALS FOR ALEXANDER:\n\n';
        pending.forEach((approval, index) => {
            const urgencyEmoji = {
                critical: '🔴',
                high: '🟠',
                medium: '🟡',
                low: '🟢'
            }[approval.urgency];
            output += `${index + 1}. ${urgencyEmoji} [${approval.source}]\n`;
            output += `   Q: ${approval.question}\n`;
            output += `   ID: ${approval.id}\n`;
            output += `   Time: ${approval.timestamp.toISOString()}\n\n`;
        });
        output += `Command: alexander approve <approval_id> yes/no\n`;
        return output;
    }
}
exports.ApprovalMonitor = ApprovalMonitor;
// Export singleton
exports.approvalMonitor = new ApprovalMonitor();
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
//# sourceMappingURL=approval-monitor.js.map