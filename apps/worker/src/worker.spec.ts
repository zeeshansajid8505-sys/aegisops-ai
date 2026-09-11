import { WorkerSSRFValidator } from './ssrf-validator';
import { loadWorkerConfig } from './config';

describe('Worker SSRF Validator & Configuration', () => {
  let ssrf: WorkerSSRFValidator;

  beforeEach(() => {
    ssrf = new WorkerSSRFValidator();
    delete process.env['PROBE_ALLOW_PRIVATE_TARGETS'];
  });

  it('should initialize with valid worker configuration', () => {
    const config = loadWorkerConfig();
    expect(config.redisHost).toBeDefined();
    expect(config.redisPort).toBeGreaterThan(0);
    expect(config.concurrency).toBeGreaterThan(0);
  });

  it('should reject invalid or non-HTTP protocols', async () => {
    const fileRes = await ssrf.validateTargetUrl('file:///etc/passwd');
    expect(fileRes.valid).toBe(false);
    expect(fileRes.error).toContain('Prohibited protocol');

    const ftpRes = await ssrf.validateTargetUrl('ftp://ftp.server.com');
    expect(ftpRes.valid).toBe(false);
  });

  it('should ALWAYS block cloud metadata IP 169.254.169.254', async () => {
    process.env['PROBE_ALLOW_PRIVATE_TARGETS'] = 'true';
    const res = await ssrf.validateTargetUrl('http://169.254.169.254/latest/meta-data');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('cloud metadata');
  });

  it('should block loopback and RFC1918 addresses by default', async () => {
    const res127 = await ssrf.validateTargetUrl('http://127.0.0.1:3000/health');
    expect(res127.valid).toBe(false);

    const res10 = await ssrf.validateTargetUrl('http://10.0.1.20/health');
    expect(res10.valid).toBe(false);

    const res192 = await ssrf.validateTargetUrl('http://192.168.1.1/api/check');
    expect(res192.valid).toBe(false);
  });

  it('should allow loopback and RFC1918 when PROBE_ALLOW_PRIVATE_TARGETS=true', async () => {
    process.env['PROBE_ALLOW_PRIVATE_TARGETS'] = 'true';

    const res127 = await ssrf.validateTargetUrl('http://127.0.0.1:3000/health');
    expect(res127.valid).toBe(true);

    const res192 = await ssrf.validateTargetUrl('http://192.168.1.1:8080/health');
    expect(res192.valid).toBe(true);
  });

  it('should validate gRPC target host:port correctly', async () => {
    // Cloud metadata on gRPC
    const metaRes = await ssrf.validateGrpcTarget('169.254.169.254:50051');
    expect(metaRes.valid).toBe(false);

    // Loopback on gRPC by default
    const localRes = await ssrf.validateGrpcTarget('127.0.0.1:50051');
    expect(localRes.valid).toBe(false);

    // Permissive mode allows local target
    process.env['PROBE_ALLOW_PRIVATE_TARGETS'] = 'true';
    const localAllowed = await ssrf.validateGrpcTarget('127.0.0.1:50051');
    expect(localAllowed.valid).toBe(true);
  });
});
