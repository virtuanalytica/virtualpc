/**
 * Commercialization — Croesus's promotion proposal engine.
 *
 * Croesus is an LLM agent that suggests promotional spend (legacy sponsored
 * placements, Twitter/TikTok ads, Discord boosts) for the the project game. This
 * module enforces three guardrails so an LLM never moves real money on its own:
 *
 *   1. Croesus can only PROPOSE. Status starts at "pending"; nothing is paid.
 *   2. A human with role ceo|cto|economy must approve via /approve before
 *      execute is even callable. Approval is recorded with username + ts.
 *   3. Execute calls Stripe / legacy APIs only when PROMO_REAL_MONEY=1 and
 *      the per-proposal + per-day spend caps allow it. Otherwise it dry-runs
 *      and records "executed_dryrun".
 *
 * Card details are NEVER stored as PAN. We hold a Stripe customer reference
 * in credentials; charges are made through Stripe's API by customer id +
 * payment method id.
 */
export type PromoChannel = 'sponsored-channel-1' | 'twitter-ad' | 'tiktok-ad' | 'discord-boost' | 'youtube-shorts' | 'other';
export type PromoStatus = 'pending' | 'approved' | 'rejected' | 'executed_real' | 'executed_dryrun' | 'failed';
export interface PromotionProposal {
    id: string;
    source_agent: string;
    channel: PromoChannel;
    budget_usd: number;
    duration_hours: number;
    pitch: string;
    predicted_roi_pct: number;
    status: PromoStatus;
    created_at: string;
    approved_by?: string;
    approved_at?: string;
    rejected_by?: string;
    rejected_at?: string;
    executed_at?: string;
    failure_reason?: string;
    external_ref?: string;
    /** Stripe PaymentIntent id (pi_...) when status === 'executed_real'. */
    stripe_payment_intent_id?: string;
    /** Stripe charge status: succeeded | requires_action | failed — copied from the PI for the dashboard. */
    stripe_status?: string;
}
export interface ProposeInput {
    source_agent: string;
    channel: PromoChannel;
    budget_usd: number;
    duration_hours: number;
    pitch: string;
    predicted_roi_pct: number;
}
export declare function propose(input: ProposeInput): {
    ok: true;
    proposal: PromotionProposal;
} | {
    ok: false;
    error: string;
};
export declare function list(filter?: {
    status?: PromoStatus;
}): PromotionProposal[];
export declare function approve(id: string, approvedBy: string): {
    ok: true;
    proposal: PromotionProposal;
} | {
    ok: false;
    error: string;
};
export declare function reject(id: string, rejectedBy: string): {
    ok: true;
    proposal: PromotionProposal;
} | {
    ok: false;
    error: string;
};
export interface ExecuteResult {
    ok: boolean;
    mode: 'real' | 'dryrun';
    proposal: PromotionProposal;
    error?: string;
}
export declare function execute(id: string): Promise<ExecuteResult>;
export declare function budget(): {
    per_proposal_cap_usd: number;
    per_day_cap_usd: number;
    spent_today_usd: number;
    remaining_today_usd: number;
    real_money_enabled: boolean;
};
//# sourceMappingURL=commercialization.d.ts.map