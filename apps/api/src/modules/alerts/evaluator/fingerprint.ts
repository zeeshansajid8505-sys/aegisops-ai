import * as crypto from 'crypto';
import { AlertEvaluationMode } from '@aegisops/types';

export interface FingerprintParams {
  organizationId: string;
  ruleId: string;
  serviceId: string;
  environmentId: string;
  evaluationMode: AlertEvaluationMode;
  metricSeriesId?: string | null;
}

/**
 * Computes a deterministic SHA-256 fingerprint for an alert instance.
 * For PER_SERIES mode, the fingerprint uniquely binds (org, rule, service, env, series).
 * For AGGREGATE_SERIES mode, the fingerprint uniquely binds (org, rule, service, env, aggregate).
 */
export function generateAlertFingerprint(params: FingerprintParams): string {
  const {
    organizationId,
    ruleId,
    serviceId,
    environmentId,
    evaluationMode,
    metricSeriesId,
  } = params;

  const target =
    evaluationMode === 'AGGREGATE_SERIES'
      ? 'aggregate'
      : `series:${metricSeriesId ?? 'unknown'}`;

  const canonicalString = `org:${organizationId}|rule:${ruleId}|svc:${serviceId}|env:${environmentId}|target:${target}`;

  return crypto.createHash('sha256').update(canonicalString).digest('hex');
}

