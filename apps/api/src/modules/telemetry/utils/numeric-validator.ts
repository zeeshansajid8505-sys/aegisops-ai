export function isValidFiniteNumber(val: unknown): val is number {
  if (typeof val !== 'number') return false;
  return Number.isFinite(val);
}

export function parseBigIntSafe(val: unknown): bigint | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'bigint') return val;
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return null;
    return BigInt(Math.trunc(val));
  }
  if (typeof val === 'string') {
    try {
      return BigInt(val);
    } catch {
      return null;
    }
  }
  // If protobufjs Long or similar object
  if (typeof val === 'object' && val !== null && 'toString' in val) {
    try {
      return BigInt((val as { toString(): string }).toString());
    } catch {
      return null;
    }
  }
  return null;
}

export function parseNumberSafe(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? val : null;
  }
  if (typeof val === 'bigint') {
    return Number(val);
  }
  if (typeof val === 'string') {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof val === 'object' && val !== null && 'toNumber' in val) {
    try {
      const num = (val as { toNumber(): number }).toNumber();
      return Number.isFinite(num) ? num : null;
    } catch {
      return null;
    }
  }
  return null;
}

