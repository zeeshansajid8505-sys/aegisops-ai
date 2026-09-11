import { sanitizeAttributes, MAX_ATTRIBUTES_PER_POINT } from './sanitizer';

describe('Telemetry Attribute Sanitizer', () => {
  it('should redact sensitive keys matching sensitive patterns', () => {
    const input = {
      'service.name': 'order-service',
      'db.password': 'super-secret-pass',
      'auth.token': 'jwt.eyJhbGciOi...',
      'session.cookie': 'sid=12345',
      'authorization': 'Bearer confidential',
      'aws.secret_key': 'AKIAIOSFODNN7EXAMPLE',
      'http.status_code': 200,
    };

    const sanitized = sanitizeAttributes(input);

    expect(sanitized['service.name']).toBe('order-service');
    expect(sanitized['http.status_code']).toBe(200);
    expect(sanitized['db.password']).toBe('[REDACTED]');
    expect(sanitized['auth.token']).toBe('[REDACTED]');
    expect(sanitized['session.cookie']).toBe('[REDACTED]');
    expect(sanitized['authorization']).toBe('[REDACTED]');
    expect(sanitized['aws.secret_key']).toBe('[REDACTED]');
  });

  it('should enforce max 32 attributes per point', () => {
    const largeAttrs: Record<string, string> = {};
    for (let i = 0; i < 50; i++) {
      largeAttrs[`attr_${i}`] = `value_${i}`;
    }

    const sanitized = sanitizeAttributes(largeAttrs);
    expect(Object.keys(sanitized).length).toBe(MAX_ATTRIBUTES_PER_POINT);
  });

  it('should clamp key length to 128 and value length to 512', () => {
    const longKey = 'k'.repeat(200);
    const longVal = 'v'.repeat(1000);

    const sanitized = sanitizeAttributes({ [longKey]: longVal });
    const keys = Object.keys(sanitized);

    expect(keys[0]!.length).toBe(128);
    expect((sanitized[keys[0]!] as string).length).toBe(512);
  });
});

