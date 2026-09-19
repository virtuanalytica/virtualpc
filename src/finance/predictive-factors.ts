/**
 * Experimental hand-off for JEPA-Anything/OPF features.
 *
 * VirtualPC does not pretend that JEPA-Anything ships a trained finance model.
 * A separately trained, versioned artifact must produce these neutral factor
 * coordinates before they can enter an experiment.
 */
export interface PredictiveFactorSnapshot {
  artifactId: string;
  observedAt: string;
  availableAt: string;
  latentDimension: number;
  factorCount: number;
  coordinatesPerFactor: number;
  factors: number[][];
}

export function predictiveFactorsToFeatures(
  snapshot: PredictiveFactorSnapshot,
  decisionAt: string,
  enabled = process.env.JEPA_FINANCE_EXPERIMENTAL === '1',
): Record<string, number> {
  if (!enabled) throw new Error('JEPA finance factors are experimental and disabled');
  if (!snapshot.artifactId.trim()) throw new Error('A versioned JEPA artifactId is required');
  if (snapshot.factorCount * snapshot.coordinatesPerFactor !== snapshot.latentDimension) {
    throw new Error('JEPA geometry must satisfy factorCount * coordinatesPerFactor = latentDimension');
  }
  if (snapshot.factors.length !== snapshot.factorCount || snapshot.factors.some(row => row.length !== snapshot.coordinatesPerFactor)) {
    throw new Error('JEPA factor matrix does not match declared geometry');
  }
  const availableAt = Date.parse(snapshot.availableAt);
  const cutoff = Date.parse(decisionAt);
  if (!Number.isFinite(availableAt) || !Number.isFinite(cutoff) || availableAt > cutoff) {
    throw new Error('JEPA factors violate the point-in-time boundary');
  }
  const features: Record<string, number> = {};
  snapshot.factors.forEach((factor, factorIndex) => factor.forEach((value, coordinateIndex) => {
    if (!Number.isFinite(value)) throw new Error('JEPA coordinates must be finite');
    // Neutral names avoid asserting an economic interpretation that has not been validated.
    features[`jepa.pc_${String(factorIndex).padStart(3, '0')}.${String(coordinateIndex).padStart(3, '0')}`] = value;
  }));
  return features;
}
