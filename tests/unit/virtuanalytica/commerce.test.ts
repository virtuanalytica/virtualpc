/**
 * Unit tests for the VirtuAnalytica commerce/entitlement engine.
 */

import * as commerce from '../../../src/virtuanalytica/commerce';

describe('virtuanalytica commerce', () => {
  beforeEach(() => commerce.resetForTesting());

  it('starts disabled with zero tokens', () => {
    const ent = commerce.getEntitlement();
    expect(ent.enabled).toBe(false);
    expect(ent.testMode).toBe(false);
    expect(ent.tokensRemaining).toBe(0);
    expect(ent.paymentStatus).toBe('none');
  });

  it('calculates price correctly', () => {
    expect(commerce.calculatePrice([], [])).toEqual({ baseEur: 5, rolesEur: 0, capabilitiesEur: 0, totalEur: '5.00' });
    expect(commerce.calculatePrice(['data-engineer', 'cloud-engineer'], ['data-lineage'])).toEqual({
      baseEur: 5, rolesEur: 4, capabilitiesEur: 1, totalEur: '10.00',
    });
  });

  it('stores role/capability selection without enabling', () => {
    const ent = commerce.setSelection(['data-engineer'], ['data-lineage']);
    expect(ent.selectedRoles).toEqual(['data-engineer']);
    expect(ent.selectedCapabilities).toEqual(['data-lineage']);
    expect(ent.enabled).toBe(false);
  });

  it('enables test mode and grants tokens', () => {
    const ent = commerce.enableTestMode(['data-engineer'], ['data-lineage']);
    expect(ent.enabled).toBe(true);
    expect(ent.testMode).toBe(true);
    expect(ent.paymentStatus).toBe('test');
    expect(ent.tokensRemaining).toBe(100_000);
    expect(ent.selectedRoles).toEqual(['data-engineer']);
  });

  it('consumes tokens when enabled', () => {
    commerce.enableTestMode();
    const result = commerce.consumeTokens(10);
    expect(result.allowed).toBe(true);
    expect(commerce.getEntitlement().tokensRemaining).toBe(100_000 - 10);
    expect(commerce.getEntitlement().tokensConsumed).toBe(10);
  });

  it('refuses consumption when disabled', () => {
    const result = commerce.consumeTokens(1);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('not enabled');
  });

  it('refuses consumption when balance is insufficient', () => {
    commerce.enableTestMode();
    commerce.consumeTokens(100_000);
    const result = commerce.consumeTokens(1);
    expect(result.allowed).toBe(false);
    expect(result.error).toContain('Insufficient tokens');
  });

  it('disables commercial state and clears tokens', () => {
    commerce.enableTestMode(['data-engineer'], ['data-lineage']);
    const ent = commerce.disableCommercial();
    expect(ent.enabled).toBe(false);
    expect(ent.tokensRemaining).toBe(0);
    expect(ent.selectedRoles).toEqual(['data-engineer']);
  });

  it('creates a dev payment intent without Stripe', async () => {
    const result = await commerce.createPaymentIntent(['data-engineer'], ['data-lineage']);
    expect(result.success).toBe(true);
    expect(result.paymentIntentId).toMatch(/^pi_dev_/);
    expect(result.amountCents).toBe(800); // base €5 + 1 role €2 + 1 capability €1 = €8
  });

  it('activates a dev payment intent and credits tokens', () => {
    const pi = `pi_dev_${Date.now()}_test`;
    const result = commerce.activate(pi);
    expect(result.success).toBe(true);
    expect(result.entitlement!.enabled).toBe(true);
    expect(result.entitlement!.tokensRemaining).toBe(5000); // €5 * 1000
  });
});
