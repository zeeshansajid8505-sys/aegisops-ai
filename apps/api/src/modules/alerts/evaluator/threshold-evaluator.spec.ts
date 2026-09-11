import { evaluateComparison } from './threshold-evaluator';

describe('Threshold Evaluator', () => {
  describe('GT operator', () => {
    it('returns true when observed > threshold', () => {
      expect(evaluateComparison(100.1, 'GT', 100)).toBe(true);
      expect(evaluateComparison(500, 'GT', 200)).toBe(true);
    });

    it('returns false when observed <= threshold', () => {
      expect(evaluateComparison(100, 'GT', 100)).toBe(false);
      expect(evaluateComparison(99.9, 'GT', 100)).toBe(false);
    });
  });

  describe('GTE operator', () => {
    it('returns true when observed >= threshold (including epsilon)', () => {
      expect(evaluateComparison(100, 'GTE', 100)).toBe(true);
      expect(evaluateComparison(100.0000000001, 'GTE', 100)).toBe(true);
      expect(evaluateComparison(101, 'GTE', 100)).toBe(true);
    });

    it('returns false when observed < threshold', () => {
      expect(evaluateComparison(99.9, 'GTE', 100)).toBe(false);
    });
  });

  describe('LT operator', () => {
    it('returns true when observed < threshold', () => {
      expect(evaluateComparison(99.9, 'LT', 100)).toBe(true);
      expect(evaluateComparison(0, 'LT', 10)).toBe(true);
    });

    it('returns false when observed >= threshold', () => {
      expect(evaluateComparison(100, 'LT', 100)).toBe(false);
      expect(evaluateComparison(100.1, 'LT', 100)).toBe(false);
    });
  });

  describe('LTE operator', () => {
    it('returns true when observed <= threshold (including epsilon)', () => {
      expect(evaluateComparison(100, 'LTE', 100)).toBe(true);
      expect(evaluateComparison(99.9, 'LTE', 100)).toBe(true);
    });

    it('returns false when observed > threshold', () => {
      expect(evaluateComparison(100.1, 'LTE', 100)).toBe(false);
    });
  });

  describe('EQ operator', () => {
    it('returns true when values match within epsilon', () => {
      expect(evaluateComparison(100, 'EQ', 100)).toBe(true);
      expect(evaluateComparison(100 + 1e-10, 'EQ', 100)).toBe(true);
    });

    it('returns false when values differ beyond epsilon', () => {
      expect(evaluateComparison(100.01, 'EQ', 100)).toBe(false);
      expect(evaluateComparison(99.99, 'EQ', 100)).toBe(false);
    });
  });

  describe('NEQ operator', () => {
    it('returns true when values differ', () => {
      expect(evaluateComparison(100.1, 'NEQ', 100)).toBe(true);
      expect(evaluateComparison(99, 'NEQ', 100)).toBe(true);
    });

    it('returns false when values match within epsilon', () => {
      expect(evaluateComparison(100, 'NEQ', 100)).toBe(false);
      expect(evaluateComparison(100 + 1e-10, 'NEQ', 100)).toBe(false);
    });
  });

  describe('Edge cases and non-finite numbers', () => {
    it('returns false for NaN or infinite observed values', () => {
      expect(evaluateComparison(NaN, 'GT', 100)).toBe(false);
      expect(evaluateComparison(Infinity, 'GT', 100)).toBe(false);
      expect(evaluateComparison(-Infinity, 'LT', 100)).toBe(false);
    });

    it('returns false for NaN or infinite thresholds', () => {
      expect(evaluateComparison(50, 'GT', NaN)).toBe(false);
      expect(evaluateComparison(50, 'LT', Infinity)).toBe(false);
    });

    it('returns false for non-numeric types', () => {
      expect(evaluateComparison(undefined as any, 'GT', 100)).toBe(false);
      expect(evaluateComparison(null as any, 'GT', 100)).toBe(false);
    });
  });
});
