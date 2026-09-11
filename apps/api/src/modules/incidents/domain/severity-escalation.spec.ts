import {
  evaluateSeverityEscalation,
  compareSeverity,
  alertSeverityToIncidentSeverity,
} from './severity-escalation';

describe('Severity Escalation Engine', () => {
  it('correctly maps alert severities to incident severities', () => {
    expect(alertSeverityToIncidentSeverity('SEV_1')).toBe('CRITICAL');
    expect(alertSeverityToIncidentSeverity('SEV_2')).toBe('ERROR');
    expect(alertSeverityToIncidentSeverity('SEV_3')).toBe('WARNING');
    expect(alertSeverityToIncidentSeverity('SEV_4')).toBe('INFO');
  });

  it('compares incident severities accurately according to strict rank ordering', () => {
    expect(compareSeverity('CRITICAL', 'ERROR')).toBeGreaterThan(0);
    expect(compareSeverity('ERROR', 'WARNING')).toBeGreaterThan(0);
    expect(compareSeverity('WARNING', 'INFO')).toBeGreaterThan(0);
    expect(compareSeverity('WARNING', 'WARNING')).toBe(0);
    expect(compareSeverity('INFO', 'CRITICAL')).toBeLessThan(0);
  });

  it('escalates severity when a higher-severity alert is linked', () => {
    const res1 = evaluateSeverityEscalation('WARNING', 'SEV_1');
    expect(res1.escalated).toBe(true);
    expect(res1.newSeverity).toBe('CRITICAL');
    expect(res1.previousSeverity).toBe('WARNING');

    const res2 = evaluateSeverityEscalation('INFO', 'ERROR');
    expect(res2.escalated).toBe(true);
    expect(res2.newSeverity).toBe('ERROR');
  });

  it('never de-escalates severity when a lower or equal severity alert is linked', () => {
    const res1 = evaluateSeverityEscalation('CRITICAL', 'SEV_3'); // WARNING
    expect(res1.escalated).toBe(false);
    expect(res1.newSeverity).toBe('CRITICAL');

    const res2 = evaluateSeverityEscalation('ERROR', 'ERROR');
    expect(res2.escalated).toBe(false);
    expect(res2.newSeverity).toBe('ERROR');
  });
});

