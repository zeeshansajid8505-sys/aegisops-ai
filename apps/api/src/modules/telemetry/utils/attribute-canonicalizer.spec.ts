import { canonicalizeAttributes } from './attribute-canonicalizer';

describe('Attribute Canonicalizer', () => {
  it('should produce identical series hash regardless of attribute key order', () => {
    const attrsA = {
      z_env: 'production',
      a_host: 'node-01',
      m_route: '/api/v1/checkout',
    };

    const attrsB = {
      m_route: '/api/v1/checkout',
      a_host: 'node-01',
      z_env: 'production',
    };

    const resultA = canonicalizeAttributes(attrsA);
    const resultB = canonicalizeAttributes(attrsB);

    expect(resultA.canonicalJson).toBe(resultB.canonicalJson);
    expect(resultA.seriesHash).toBe(resultB.seriesHash);
  });

  it('should handle empty attributes object cleanly', () => {
    const result = canonicalizeAttributes({});
    expect(result.canonicalJson).toBe('{}');
    expect(result.seriesHash).toBeDefined();
    expect(result.seriesHash.length).toBe(64); // SHA-256 hex string
  });
});

