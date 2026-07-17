/**
 * Message Classifier Tests
 *
 * Verify message complexity classification
 */

import { classifyMessage, getComplexityConfidence } from '../../src/utils/message-classifier';

describe('Message Classifier', () => {
  describe('Classification', () => {
    it('should classify short messages as simple', () => {
      expect(classifyMessage('hello')).toBe('simple');
      expect(classifyMessage('deploy api')).toBe('simple');
      expect(classifyMessage('run tests')).toBe('simple');
    });

    it('should classify complex keywords as complex', () => {
      expect(classifyMessage('explain the architecture')).toBe('complex'); // 'explain' + wordcount
      expect(classifyMessage('analyze performance issue')).toBe('complex'); // 'analyze' keyword
      expect(classifyMessage('please compare these two designs')).toBe('complex'); // 'compare' keyword
      expect(classifyMessage('debug this issue now')).toBe('complex'); // 'debug' keyword
    });

    it('should classify very long messages as complex', () => {
      const longMessage = 'This is a very long message with many words to test the word count heuristic and features and more content and additional words';
      expect(classifyMessage(longMessage)).toBe('complex'); // >20 words
    });

    it('should classify empty messages as simple', () => {
      expect(classifyMessage('')).toBe('simple');
      expect(classifyMessage('   ')).toBe('simple');
    });

    it('should be case-insensitive', () => {
      expect(classifyMessage('EXPLAIN THE SYSTEM')).toBe('complex');
      expect(classifyMessage('Deploy API')).toBe('simple');
      expect(classifyMessage('ANALYZE')).toBe('complex');
    });

    it('should handle compound keywords', () => {
      expect(classifyMessage('please explain the architecture system design and rationale')).toBe('complex'); // 'explain' keyword
      expect(classifyMessage('design the dashboard please')).toBe('complex'); // 'design' keyword
      expect(classifyMessage('investigate why performance degraded')).toBe('complex'); // 'investigate' keyword
    });
  });

  describe('Confidence Scoring', () => {
    it('should give high confidence for clearly simple messages', () => {
      const confidence = getComplexityConfidence('hi', 'simple');
      expect(confidence).toBeGreaterThan(0.8);
    });

    it('should give high confidence for clearly complex messages', () => {
      const confidence = getComplexityConfidence('explain the architecture', 'complex');
      expect(confidence).toBeGreaterThan(0.6);
    });

    it('should penalize incorrect classifications', () => {
      const wrongConfidence = getComplexityConfidence('hello', 'complex');
      expect(wrongConfidence).toBeLessThanOrEqual(0.5);
    });

    it('should be consistent with classifications', () => {
      const msg = 'analyze the system';
      const classification = classifyMessage(msg);
      const confidence = getComplexityConfidence(msg, classification);
      expect(confidence).toBeGreaterThan(0.5);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single word messages', () => {
      expect(classifyMessage('deploy')).toBe('simple');
      expect(classifyMessage('explain')).toBe('complex');
    });

    it('should handle messages with special characters', () => {
      expect(classifyMessage('run tests!')).toBe('simple');
      expect(classifyMessage('debug why?')).toBe('complex');
    });

    it('should handle messages with numbers', () => {
      expect(classifyMessage('run 5 tests')).toBe('simple');
      expect(classifyMessage('analyze 100 metrics')).toBe('complex');
    });
  });
});
