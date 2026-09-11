import { parseBigIntSafe } from './numeric-validator';

export const MAX_PAST_SKEW_MS = 300_000; // 5 minutes in past
export const MAX_FUTURE_SKEW_MS = 60_000; // 1 minute in future

export interface ParsedTimestamp {
  date: Date;
  timeUnixNano: bigint;
  isValidSkew: boolean;
  skewError?: string;
}

export function parseAndValidateTimestamp(
  rawTimeNano: unknown,
  referenceNow: Date = new Date(),
  enforceSkew = true,
): ParsedTimestamp | null {
  const nanoBigInt = parseBigIntSafe(rawTimeNano);
  if (nanoBigInt === null || nanoBigInt <= 0n) {
    return null;
  }

  // Convert nano to millis: nano / 1,000,000n
  const millis = Number(nanoBigInt / 1_000_000n);
  if (!Number.isFinite(millis) || millis <= 0) {
    return null;
  }

  const date = new Date(millis);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (!enforceSkew) {
    return {
      date,
      timeUnixNano: nanoBigInt,
      isValidSkew: true,
    };
  }

  const nowMs = referenceNow.getTime();
  const pointMs = date.getTime();
  const diffMs = pointMs - nowMs;

  if (diffMs > MAX_FUTURE_SKEW_MS) {
    return {
      date,
      timeUnixNano: nanoBigInt,
      isValidSkew: false,
      skewError: `Timestamp is ${Math.round(diffMs / 1000)}s in the future (max allowed ${MAX_FUTURE_SKEW_MS / 1000}s)`,
    };
  }

  if (nowMs - pointMs > MAX_PAST_SKEW_MS) {
    return {
      date,
      timeUnixNano: nanoBigInt,
      isValidSkew: false,
      skewError: `Timestamp is ${Math.round((nowMs - pointMs) / 1000)}s in the past (max allowed ${MAX_PAST_SKEW_MS / 1000}s)`,
    };
  }

  return {
    date,
    timeUnixNano: nanoBigInt,
    isValidSkew: true,
  };
}

