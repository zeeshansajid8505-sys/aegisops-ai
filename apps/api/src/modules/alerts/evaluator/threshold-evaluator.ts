import { AlertComparisonOperator } from '@aegisops/types';

/**
 * Pure, side-effect-free comparison evaluator.
 * Evaluates whether an observed metric value breaches a threshold.
 *
 * @param observedValue The computed metric value for the window
 * @param operator The comparison operator (GT, GTE, LT, LTE, EQ, NEQ)
 * @param threshold The static threshold value configured on the rule
 * @returns true if the condition is breached (violated), false otherwise
 */
export function evaluateComparison(
  observedValue: number,
  operator: AlertComparisonOperator,
  threshold: number,
): boolean {
  if (
    typeof observedValue !== 'number' ||
    Number.isNaN(observedValue) ||
    !Number.isFinite(observedValue) ||
    typeof threshold !== 'number' ||
    Number.isNaN(threshold) ||
    !Number.isFinite(threshold)
  ) {
    return false;
  }

  const EPSILON = 1e-9;

  switch (operator) {
    case 'GT':
      return observedValue > threshold;
    case 'GTE':
      return observedValue >= threshold - EPSILON;
    case 'LT':
      return observedValue < threshold;
    case 'LTE':
      return observedValue <= threshold + EPSILON;
    case 'EQ':
      return Math.abs(observedValue - threshold) < EPSILON;
    case 'NEQ':
      return Math.abs(observedValue - threshold) >= EPSILON;
    default:
      return false;
  }
}

