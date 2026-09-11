const SENSITIVE_KEY_PATTERN = /password|secret|token|authorization|bearer|cookie|credential|private[_-]?key|api[_-]?key/i;

export const MAX_ATTRIBUTES_PER_POINT = 32;
export const MAX_ATTRIBUTE_KEY_LENGTH = 128;
export const MAX_ATTRIBUTE_VALUE_LENGTH = 512;

export function sanitizeAttributes(
  attributes: Record<string, unknown> | null | undefined,
): Record<string, string | number | boolean> {
  if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
    return {};
  }

  const sanitized: Record<string, string | number | boolean> = {};
  const entries = Object.entries(attributes);

  let count = 0;
  for (const [rawKey, rawVal] of entries) {
    if (count >= MAX_ATTRIBUTES_PER_POINT) {
      break;
    }

    if (typeof rawKey !== 'string') continue;
    const key = rawKey.slice(0, MAX_ATTRIBUTE_KEY_LENGTH);

    // Check sensitive keys
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      sanitized[key] = '[REDACTED]';
      count++;
      continue;
    }

    if (rawVal === null || rawVal === undefined) {
      sanitized[key] = '';
    } else if (typeof rawVal === 'boolean' || typeof rawVal === 'number') {
      sanitized[key] = rawVal;
    } else if (typeof rawVal === 'string') {
      sanitized[key] = rawVal.slice(0, MAX_ATTRIBUTE_VALUE_LENGTH);
    } else {
      // Stringify complex objects/arrays safely
      try {
        sanitized[key] = JSON.stringify(rawVal).slice(0, MAX_ATTRIBUTE_VALUE_LENGTH);
      } catch {
        sanitized[key] = String(rawVal).slice(0, MAX_ATTRIBUTE_VALUE_LENGTH);
      }
    }

    count++;
  }

  return sanitized;
}

