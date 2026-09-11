import { validateMetricCompatibility } from './metric-compatibility';
import { BadRequestException } from '@nestjs/common';

describe('Metric Compatibility Validator', () => {
  it('allows valid aggregations for GAUGE', () => {
    expect(() => validateMetricCompatibility('AVG', { instrumentType: 'GAUGE' })).not.toThrow();
    expect(() => validateMetricCompatibility('MIN', { instrumentType: 'GAUGE' })).not.toThrow();
    expect(() => validateMetricCompatibility('MAX', { instrumentType: 'GAUGE' })).not.toThrow();
    expect(() => validateMetricCompatibility('LAST', { instrumentType: 'GAUGE' })).not.toThrow();
  });

  it('rejects RATE and percentiles on GAUGE', () => {
    expect(() => validateMetricCompatibility('RATE', { instrumentType: 'GAUGE' })).toThrow(BadRequestException);
    expect(() => validateMetricCompatibility('P99', { instrumentType: 'GAUGE' })).toThrow(BadRequestException);
    expect(() => validateMetricCompatibility('P50', { instrumentType: 'GAUGE' })).toThrow(BadRequestException);
  });

  it('allows RATE, SUM, LAST for monotonic SUM counter', () => {
    expect(() => validateMetricCompatibility('RATE', { instrumentType: 'SUM', isMonotonic: true })).not.toThrow();
    expect(() => validateMetricCompatibility('SUM', { instrumentType: 'SUM', isMonotonic: true })).not.toThrow();
    expect(() => validateMetricCompatibility('LAST', { instrumentType: 'SUM', isMonotonic: true })).not.toThrow();
  });

  it('rejects percentiles and AVG on monotonic counter', () => {
    expect(() => validateMetricCompatibility('P90', { instrumentType: 'SUM', isMonotonic: true })).toThrow(BadRequestException);
    expect(() => validateMetricCompatibility('AVG', { instrumentType: 'SUM', isMonotonic: true })).toThrow(BadRequestException);
  });

  it('allows percentiles and statistics on HISTOGRAM', () => {
    expect(() => validateMetricCompatibility('P50', { instrumentType: 'HISTOGRAM' })).not.toThrow();
    expect(() => validateMetricCompatibility('P90', { instrumentType: 'HISTOGRAM' })).not.toThrow();
    expect(() => validateMetricCompatibility('P99', { instrumentType: 'HISTOGRAM' })).not.toThrow();
    expect(() => validateMetricCompatibility('AVG', { instrumentType: 'HISTOGRAM' })).not.toThrow();
    expect(() => validateMetricCompatibility('MAX', { instrumentType: 'HISTOGRAM' })).not.toThrow();
  });

  it('rejects RATE on HISTOGRAM', () => {
    expect(() => validateMetricCompatibility('RATE', { instrumentType: 'HISTOGRAM' })).toThrow(BadRequestException);
  });
});
