import { generateAlertFingerprint } from './fingerprint';

describe('Alert Fingerprint Generator', () => {
  const baseParams = {
    organizationId: 'org-1',
    ruleId: 'rule-1',
    serviceId: 'svc-1',
    environmentId: 'env-1',
    evaluationMode: 'PER_SERIES' as const,
    metricSeriesId: 'series-1',
  };

  it('generates a 64-character hex SHA-256 string', () => {
    const fp = generateAlertFingerprint(baseParams);
    expect(fp).toHaveLength(64);
    expect(/^[a-f0-9]{64}$/.test(fp)).toBe(true);
  });

  it('is deterministic for identical parameters', () => {
    const fp1 = generateAlertFingerprint(baseParams);
    const fp2 = generateAlertFingerprint({ ...baseParams });
    expect(fp1).toBe(fp2);
  });

  it('produces different hashes for different organizations', () => {
    const fp1 = generateAlertFingerprint(baseParams);
    const fp2 = generateAlertFingerprint({ ...baseParams, organizationId: 'org-2' });
    expect(fp1).not.toBe(fp2);
  });

  it('produces different hashes for different rules', () => {
    const fp1 = generateAlertFingerprint(baseParams);
    const fp2 = generateAlertFingerprint({ ...baseParams, ruleId: 'rule-2' });
    expect(fp1).not.toBe(fp2);
  });

  it('produces different hashes for different environments', () => {
    const fp1 = generateAlertFingerprint(baseParams);
    const fp2 = generateAlertFingerprint({ ...baseParams, environmentId: 'env-2' });
    expect(fp1).not.toBe(fp2);
  });

  it('produces different hashes for different series in PER_SERIES mode', () => {
    const fp1 = generateAlertFingerprint(baseParams);
    const fp2 = generateAlertFingerprint({ ...baseParams, metricSeriesId: 'series-2' });
    expect(fp1).not.toBe(fp2);
  });

  it('binds to aggregate in AGGREGATE_SERIES mode regardless of seriesId', () => {
    const fp1 = generateAlertFingerprint({
      ...baseParams,
      evaluationMode: 'AGGREGATE_SERIES',
      metricSeriesId: 'series-1',
    });
    const fp2 = generateAlertFingerprint({
      ...baseParams,
      evaluationMode: 'AGGREGATE_SERIES',
      metricSeriesId: 'series-2',
    });
    expect(fp1).toBe(fp2);
  });
});
