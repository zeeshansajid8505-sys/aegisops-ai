import { SSRFValidatorService } from './ssrf-validator.service';

describe('SSRFValidatorService', () => {
  let service: SSRFValidatorService;
  const originalEnv = process.env['PROBE_ALLOW_PRIVATE_TARGETS'];

  beforeEach(() => {
    delete process.env['PROBE_ALLOW_PRIVATE_TARGETS'];
    service = new SSRFValidatorService();
  });

  afterAll(() => {
    if (originalEnv !== undefined) {
      process.env['PROBE_ALLOW_PRIVATE_TARGETS'] = originalEnv;
    } else {
      delete process.env['PROBE_ALLOW_PRIVATE_TARGETS'];
    }
  });

  it('should reject invalid or malformed URLs', async () => {
    const res = await service.validateTargetUrl('not-a-valid-url');
    expect(res.valid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('should reject non-HTTP protocols (file://, ftp://, gopher://)', async () => {
    const fileRes = await service.validateTargetUrl('file:///etc/passwd');
    expect(fileRes.valid).toBe(false);
    expect(fileRes.error).toContain('Disallowed URL protocol');

    const ftpRes = await service.validateTargetUrl('ftp://ftp.example.com/file');
    expect(ftpRes.valid).toBe(false);
  });

  it('should ALWAYS block cloud metadata IP 169.254.169.254 even if private targets allowed', async () => {
    // Test with private targets prohibited
    const res1 = await service.validateTargetUrl('http://169.254.169.254/latest/meta-data');
    expect(res1.valid).toBe(false);
    expect(res1.error).toContain('cloud metadata');

    // Test with private targets allowed
    process.env['PROBE_ALLOW_PRIVATE_TARGETS'] = 'true';
    const res2 = await service.validateTargetUrl('http://169.254.169.254/computeMetadata/v1');
    expect(res2.valid).toBe(false);
    expect(res2.error).toContain('cloud metadata');
  });

  it('should block loopback 127.0.0.1 and localhost by default', async () => {
    const loopbackRes = await service.validateTargetUrl('http://127.0.0.1:8080/health');
    expect(loopbackRes.valid).toBe(false);

    const localhostRes = await service.validateTargetUrl('http://localhost:3000/api/health');
    expect(localhostRes.valid).toBe(false);
  });

  it('should block RFC1918 private IPv4 addresses by default', async () => {
    const res10 = await service.validateTargetUrl('http://10.0.0.1/health');
    expect(res10.valid).toBe(false);

    const res172 = await service.validateTargetUrl('http://172.16.5.10/status');
    expect(res172.valid).toBe(false);

    const res192 = await service.validateTargetUrl('http://192.168.1.1:8000/check');
    expect(res192.valid).toBe(false);
  });

  it('should allow loopback and RFC1918 when PROBE_ALLOW_PRIVATE_TARGETS=true', async () => {
    process.env['PROBE_ALLOW_PRIVATE_TARGETS'] = 'true';

    const loopbackRes = await service.validateTargetUrl('http://127.0.0.1:8080/health');
    expect(loopbackRes.valid).toBe(true);

    const rfc1918Res = await service.validateTargetUrl('http://192.168.1.50:3000/health');
    expect(rfc1918Res.valid).toBe(true);
  });

  it('should validate gRPC target host:port correctly', async () => {
    // Cloud metadata on gRPC
    const grpcMeta = await service.validateGrpcTarget('169.254.169.254:50051');
    expect(grpcMeta.valid).toBe(false);

    // Loopback on gRPC by default
    const grpcLocal = await service.validateGrpcTarget('127.0.0.1:50051');
    expect(grpcLocal.valid).toBe(false);

    // Permissive mode allows local gRPC target
    process.env['PROBE_ALLOW_PRIVATE_TARGETS'] = 'true';
    const grpcPermissive = await service.validateGrpcTarget('127.0.0.1:50051');
    expect(grpcPermissive.valid).toBe(true);
  });
});

