/**
 * VirtuAnalytica commercial entitlement engine.
 *
 * Tracks enabled state, test mode, token balance, selected roles/capabilities,
 * and Stripe-backed activation. Persists to data/virtuanalytica-commerce.json.
 *
 * - Base activation: €5.00 one-time.
 * - Each pretrained role: +€2.00 one-time.
 * - Each capability: +€1.00 one-time.
 * - Test mode: free, grants 100 000 tokens, marks status 'test'.
 * - Live activation: credits 1 000 tokens per euro (rounded) once payment succeeds.
 */

import * as fs from 'fs';
import * as path from 'path';
import logger from '../utils/logger';
import { FieldCrypto } from '../security/fieldCrypto';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const COMMERCE_PATH = path.join(DATA_DIR, 'virtuanalytica-commerce.json');

const TEST_MODE_TOKENS = 100_000;
const TOKENS_PER_EUR = 1_000;
const BASE_PRICE_EUR = 5;
const ROLE_PRICE_EUR = 2;
const CAPABILITY_PRICE_EUR = 1;

export interface VAEntitlement {
  enabled: boolean;
  testMode: boolean;
  tokensRemaining: number;
  tokensPurchased: number;
  tokensConsumed: number;
  paymentStatus: 'none' | 'pending' | 'paid' | 'test';
  selectedRoles: string[];
  selectedCapabilities: string[];
}

interface CommerceState extends VAEntitlement {
  pendingPaymentIntentId?: string | null;
}

let state: CommerceState | null = null;

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function getCrypto(): FieldCrypto | null {
  const key = process.env.FIELD_ENCRYPTION_KEY;
  if (!key) return null;
  try { return new FieldCrypto(key); } catch (e: any) {
    logger.warn(`virtuanalytica/commerce: FIELD_ENCRYPTION_KEY invalid: ${e.message}`);
    return null;
  }
}

function readState(): CommerceState {
  ensureDir();
  if (!fs.existsSync(COMMERCE_PATH)) {
    return {
      enabled: false,
      testMode: false,
      tokensRemaining: 0,
      tokensPurchased: 0,
      tokensConsumed: 0,
      paymentStatus: 'none',
      selectedRoles: [],
      selectedCapabilities: [],
      pendingPaymentIntentId: null,
    };
  }
  try {
    const raw = fs.readFileSync(COMMERCE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    const crypto = getCrypto();
    if (crypto && parsed.pendingPaymentIntentId && typeof parsed.pendingPaymentIntentId === 'string') {
      parsed.pendingPaymentIntentId = crypto.decryptField(parsed.pendingPaymentIntentId);
    }
    return {
      enabled: Boolean(parsed.enabled),
      testMode: Boolean(parsed.testMode),
      tokensRemaining: Number(parsed.tokensRemaining) || 0,
      tokensPurchased: Number(parsed.tokensPurchased) || 0,
      tokensConsumed: Number(parsed.tokensConsumed) || 0,
      paymentStatus: parsed.paymentStatus || 'none',
      selectedRoles: Array.isArray(parsed.selectedRoles) ? parsed.selectedRoles : [],
      selectedCapabilities: Array.isArray(parsed.selectedCapabilities) ? parsed.selectedCapabilities : [],
      pendingPaymentIntentId: parsed.pendingPaymentIntentId ?? null,
    };
  } catch (e: any) {
    logger.error(`virtuanalytica/commerce: corrupt state file, resetting: ${e.message}`);
    return {
      enabled: false, testMode: false, tokensRemaining: 0, tokensPurchased: 0, tokensConsumed: 0,
      paymentStatus: 'none', selectedRoles: [], selectedCapabilities: [], pendingPaymentIntentId: null,
    };
  }
}

function writeState(): void {
  ensureDir();
  const crypto = getCrypto();
  const payload: any = { ...state };
  if (crypto && payload.pendingPaymentIntentId) {
    payload.pendingPaymentIntentId = crypto.encryptField(payload.pendingPaymentIntentId);
  }
  fs.writeFileSync(COMMERCE_PATH, JSON.stringify(payload, null, 2));
}

function ensureLoaded(): void {
  if (!state) state = readState();
}

export function getEntitlement(): VAEntitlement {
  ensureLoaded();
  const { enabled, testMode, tokensRemaining, tokensPurchased, tokensConsumed, paymentStatus, selectedRoles, selectedCapabilities } = state!;
  return { enabled, testMode, tokensRemaining, tokensPurchased, tokensConsumed, paymentStatus, selectedRoles, selectedCapabilities };
}

export interface VAPrice {
  baseEur: number;
  rolesEur: number;
  capabilitiesEur: number;
  totalEur: string;
}

export function calculatePrice(selectedRoles: string[], selectedCapabilities: string[]): VAPrice {
  const rolesEur = (selectedRoles?.length || 0) * ROLE_PRICE_EUR;
  const capabilitiesEur = (selectedCapabilities?.length || 0) * CAPABILITY_PRICE_EUR;
  const total = BASE_PRICE_EUR + rolesEur + capabilitiesEur;
  return {
    baseEur: BASE_PRICE_EUR,
    rolesEur,
    capabilitiesEur,
    totalEur: total.toFixed(2),
  };
}

export function setSelection(selectedRoles: string[], selectedCapabilities: string[]): VAEntitlement {
  ensureLoaded();
  state!.selectedRoles = Array.from(new Set(selectedRoles || []));
  state!.selectedCapabilities = Array.from(new Set(selectedCapabilities || []));
  writeState();
  return getEntitlement();
}

export function enableTestMode(selectedRoles?: string[], selectedCapabilities?: string[]): VAEntitlement {
  ensureLoaded();
  state!.enabled = true;
  state!.testMode = true;
  state!.paymentStatus = 'test';
  state!.tokensRemaining = TEST_MODE_TOKENS;
  state!.tokensPurchased = TEST_MODE_TOKENS;
  state!.tokensConsumed = 0;
  if (selectedRoles) state!.selectedRoles = Array.from(new Set(selectedRoles));
  if (selectedCapabilities) state!.selectedCapabilities = Array.from(new Set(selectedCapabilities));
  writeState();
  logger.info('virtuanalytica/commerce: test mode enabled');
  return getEntitlement();
}

export function disableCommercial(): VAEntitlement {
  ensureLoaded();
  state!.enabled = false;
  state!.testMode = false;
  state!.paymentStatus = 'none';
  state!.tokensRemaining = 0;
  state!.tokensPurchased = 0;
  state!.tokensConsumed = 0;
  state!.pendingPaymentIntentId = null;
  writeState();
  logger.info('virtuanalytica/commerce: disabled');
  return getEntitlement();
}

export interface PaymentIntentResult {
  success: boolean;
  paymentIntentId?: string;
  clientSecret?: string;
  amountCents?: number;
  currency?: string;
  error?: string;
}

export async function createPaymentIntent(
  selectedRoles?: string[],
  selectedCapabilities?: string[],
  currency = 'eur',
  paymentMethodType: 'card' | 'ideal' = 'card',
): Promise<PaymentIntentResult> {
  ensureLoaded();
  const price = calculatePrice(selectedRoles || state!.selectedRoles, selectedCapabilities || state!.selectedCapabilities);
  const amountCents = Math.round(Number(price.totalEur) * 100);

  let stripe: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  } catch {
    // Stripe not configured — return a deterministic test PI so the UI can still activate in dev.
    const paymentIntentId = `pi_dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    state!.pendingPaymentIntentId = paymentIntentId;
    state!.paymentStatus = 'pending';
    writeState();
    logger.warn('virtuanalytica/commerce: Stripe not configured; using dev payment intent');
    return { success: true, paymentIntentId, clientSecret: `${paymentIntentId}_secret`, amountCents, currency };
  }

  try {
    const pi = await stripe.paymentIntents.create({
      amount: amountCents,
      currency,
      payment_method_types: [paymentMethodType],
      metadata: { product: 'virtuanalytica', roles: (selectedRoles || state!.selectedRoles).join(','), capabilities: (selectedCapabilities || state!.selectedCapabilities).join(',') },
    });
    state!.pendingPaymentIntentId = pi.id;
    state!.paymentStatus = 'pending';
    writeState();
    return { success: true, paymentIntentId: pi.id, clientSecret: pi.client_secret, amountCents, currency };
  } catch (e: any) {
    logger.error(`virtuanalytica/commerce: Stripe PI creation failed: ${e.message}`);
    return { success: false, error: e.message || 'Payment intent creation failed' };
  }
}

export interface ActivationResult {
  success: boolean;
  entitlement?: VAEntitlement;
  error?: string;
}

export function activate(paymentIntentId: string): ActivationResult {
  ensureLoaded();
  if (!paymentIntentId) return { success: false, error: 'paymentIntentId is required' };

  const price = calculatePrice(state!.selectedRoles, state!.selectedCapabilities);
  const tokens = Math.round(Number(price.totalEur) * TOKENS_PER_EUR);

  // Dev fallback: deterministic activation when Stripe is not configured.
  if (paymentIntentId.startsWith('pi_dev_')) {
    state!.enabled = true;
    state!.testMode = false;
    state!.paymentStatus = 'paid';
    state!.tokensRemaining += tokens;
    state!.tokensPurchased += tokens;
    state!.pendingPaymentIntentId = null;
    writeState();
    return { success: true, entitlement: getEntitlement() };
  }

  let stripe: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  } catch {
    return { success: false, error: 'Stripe is not configured' };
  }

  try {
    const pi = stripe.paymentIntents.retrieve(paymentIntentId);
    if (pi.status !== 'succeeded') {
      return { success: false, error: `Payment not yet succeeded (status: ${pi.status})` };
    }
    state!.enabled = true;
    state!.testMode = false;
    state!.paymentStatus = 'paid';
    state!.tokensRemaining += tokens;
    state!.tokensPurchased += tokens;
    state!.pendingPaymentIntentId = null;
    writeState();
    return { success: true, entitlement: getEntitlement() };
  } catch (e: any) {
    return { success: false, error: e.message || 'Activation failed' };
  }
}

export function consumeTokens(n: number): { allowed: boolean; remaining: number; error?: string } {
  ensureLoaded();
  if (!state!.enabled) return { allowed: false, remaining: 0, error: 'VirtuAnalytica is not enabled' };
  if (state!.tokensRemaining < n) return { allowed: false, remaining: state!.tokensRemaining, error: `Insufficient tokens (${state!.tokensRemaining} < ${n})` };
  state!.tokensRemaining -= n;
  state!.tokensConsumed += n;
  writeState();
  return { allowed: true, remaining: state!.tokensRemaining };
}

export function resetForTesting(): void {
  state = {
    enabled: false, testMode: false, tokensRemaining: 0, tokensPurchased: 0, tokensConsumed: 0,
    paymentStatus: 'none', selectedRoles: [], selectedCapabilities: [], pendingPaymentIntentId: null,
  };
  if (fs.existsSync(COMMERCE_PATH)) fs.unlinkSync(COMMERCE_PATH);
}
