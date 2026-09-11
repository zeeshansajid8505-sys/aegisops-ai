import { isValidFiniteNumber, parseBigIntSafe, parseNumberSafe } from './numeric-validator';
import { parseAndValidateTimestamp } from './timestamp-validator';

describe('Numeric & Timestamp Validators', () => {
  describe('Numeric Validator', () => {
    it('should validate finite numbers and reject NaN/Infinities', () => {
      expect(isValidFiniteNumber(42)).toBe(true);
      expect(isValidFiniteNumber(3.14159)).toBe(true);
      expect(isValidFiniteNumber(-100)).toBe(true);
      expect(isValidFiniteNumber(NaN)).toBe(false);
      expect(isValidFiniteNumber(Infinity)).toBe(false);
      expect(isValidFiniteNumber(-Infinity)).toBe(false);
      expect(isValidFiniteNumber('42')).toBe(false);
    });

    it('should safely parse big integers from numbers and strings', () => {
      expect(parseBigIntSafe('1725800000000000000')).toBe(1725800000000000000n);
      expect(parseBigIntSafe(100)).toBe(100n);
      expect(parseBigIntSafe(null)).toBeNull();
      expect(parseBigIntSafe('invalid')).toBeNull();
    });

    it('should safely parse numbers', () => {
      expect(parseNumberSafe(42.5)).toBe(42.5);
      expect(parseNumberSafe('99.9')).toBe(99.9);
      expect(parseNumberSafe(NaN)).toBeNull();
    });
  });

  describe('Timestamp Validator', () => {
    it('should accept timestamps within the allowed skew window', () => {
      const now = new Date();
      const currentNano = BigInt(now.getTime()) * 1_000_000n;

      const result = parseAndValidateTimestamp(currentNano, now, true);
      expect(result).toBeDefined();
      expect(result!.isValidSkew).toBe(true);
    });

    it('should reject timestamps older than 300 seconds', () => {
      const now = new Date();
      const oldTimeMs = now.getTime() - 400_000; // ~400s in past
      const oldNano = BigInt(oldTimeMs) * 1_000_000n;

      const result = parseAndValidateTimestamp(oldNano, now, true);
      expect(result).toBeDefined();
      expect(result!.isValidSkew).toBe(false);
      expect(result!.skewError).toContain('past');
    });

    it('should reject timestamps more than 60 seconds in the future', () => {
      const now = new Date();
      const futureTimeMs = now.getTime() + 100_000; // 100s in future
      const futureNano = BigInt(futureTimeMs) * 1_000_000n;

      const result = parseAndValidateTimestamp(futureNano, now, true);
      expect(result).toBeDefined();
      expect(result!.isValidSkew).toBe(false);
      expect(result!.skewError).toContain('future');
    });
  });
});

