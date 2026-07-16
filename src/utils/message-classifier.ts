/**
 * Message Classifier
 *
 * Simple heuristic for classifying message complexity.
 * Helps route simple (quick) messages differently from complex (slow) queries.
 *
 * Ported from ClaudeClaw's message-classifier.ts (39 lines, no dependencies).
 */

export type MessageComplexity = 'simple' | 'complex';

/**
 * Classify a message as simple or complex
 */
export function classifyMessage(message: string): MessageComplexity {
  if (!message || message.trim().length === 0) {
    return 'simple';
  }

  const lowerMsg = message.toLowerCase();
  const wordCount = message.split(/\s+/).length;

  // Complex indicators
  const complexPatterns = [
    /explain/i,
    /analyze|analysis/i,
    /compare/i,
    /design|architecture/i,
    /debug/i,
    /investigate/i,
    /research/i,
    /comprehensive|detailed|thorough/i,
    /why\s+|how\s+|what\s+about/i,
  ];

  // Check for complex patterns
  const hasComplexPattern = complexPatterns.some((pattern) => pattern.test(lowerMsg));

  // Word count heuristic: >20 words often indicates a complex query
  const longMessage = wordCount > 20;

  return hasComplexPattern || longMessage ? 'complex' : 'simple';
}

/**
 * Get confidence score (0-1) for classification
 */
export function getComplexityConfidence(message: string, complexity: MessageComplexity): number {
  if (!message || message.trim().length === 0) {
    return complexity === 'simple' ? 0.95 : 0.05;
  }

  const lowerMsg = message.toLowerCase();
  const wordCount = message.split(/\s+/).length;

  const complexPatterns = [
    /explain/i,
    /analyze|analysis/i,
    /compare/i,
    /design|architecture/i,
    /debug/i,
    /investigate/i,
    /research/i,
    /comprehensive|detailed|thorough/i,
    /why\s+|how\s+|what\s+about/i,
  ];

  const matchCount = complexPatterns.filter((p) => p.test(lowerMsg)).length;

  if (complexity === 'complex') {
    // High confidence if matches complex patterns or long
    return Math.min(0.5 + matchCount * 0.1 + (wordCount > 20 ? 0.3 : 0), 1.0);
  } else {
    // High confidence for short, non-complex messages
    return Math.max(0.95 - matchCount * 0.15 - (wordCount > 15 ? 0.2 : 0), 0.0);
  }
}
