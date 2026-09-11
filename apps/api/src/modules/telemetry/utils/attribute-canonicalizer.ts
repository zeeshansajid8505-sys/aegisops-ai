import * as crypto from 'crypto';

export function canonicalizeAttributes(
  attributes: Record<string, string | number | boolean> | null | undefined,
): { canonicalJson: string; seriesHash: string } {
  if (!attributes || Object.keys(attributes).length === 0) {
    const canonicalJson = '{}';
    const seriesHash = crypto.createHash('sha256').update(canonicalJson).digest('hex');
    return { canonicalJson, seriesHash };
  }

  // Sort keys alphabetically
  const sortedKeys = Object.keys(attributes).sort();
  const sortedObj: Record<string, string | number | boolean> = {};

  for (const key of sortedKeys) {
    const val = attributes[key];
    if (val !== undefined) {
      sortedObj[key] = val;
    }
  }

  const canonicalJson = JSON.stringify(sortedObj);
  const seriesHash = crypto.createHash('sha256').update(canonicalJson).digest('hex');

  return { canonicalJson, seriesHash };
}

