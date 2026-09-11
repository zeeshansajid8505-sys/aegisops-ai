import { Injectable, Logger } from '@nestjs/common';
import * as dns from 'dns';
import * as net from 'net';

export interface TargetValidationResult {
  valid: boolean;
  error?: string;
  resolvedIps?: string[];
}

@Injectable()
export class SSRFValidatorService {
  private readonly logger = new Logger(SSRFValidatorService.name);

  private readonly CLOUD_METADATA_IPS = new Set([
    '169.254.169.254',
    '169.254.170.2',
    'fd00:ec2::254',
  ]);

  private isPrivateTargetsAllowed(): boolean {
    return (
      process.env['PROBE_ALLOW_PRIVATE_TARGETS'] === 'true' ||
      process.env['WEBHOOK_ALLOW_PRIVATE_TARGETS'] === 'true'
    );
  }

  private isCloudMetadataIp(ip: string): boolean {
    const normalized = ip.toLowerCase();
    if (this.CLOUD_METADATA_IPS.has(normalized)) return true;
    // Check IPv4-mapped IPv6 (e.g. ::ffff:169.254.169.254)
    if (normalized.startsWith('::ffff:')) {
      const v4 = normalized.substring(7);
      if (this.CLOUD_METADATA_IPS.has(v4)) return true;
    }
    return false;
  }

  private isLinkLocalIp(ip: string): boolean {
    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number);
      return parts[0] === 169 && parts[1] === 254;
    }
    if (net.isIPv6(ip)) {
      const lower = ip.toLowerCase();
      return lower.startsWith('fe80:') || lower.startsWith('fe9') || lower.startsWith('fea') || lower.startsWith('feb');
    }
    return false;
  }

  private isLoopbackIp(ip: string): boolean {
    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number);
      return parts[0] === 127 || ip === '0.0.0.0';
    }
    if (net.isIPv6(ip)) {
      const lower = ip.toLowerCase();
      return lower === '::1' || lower === '::' || lower === '0:0:0:0:0:0:0:1';
    }
    return false;
  }

  private isRfc1918OrPrivateIp(ip: string): boolean {
    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number);
      if (parts.length !== 4) return false;
      const p0 = parts[0] ?? 0;
      const p1 = parts[1] ?? 0;
      // 10.0.0.0/8
      if (p0 === 10) return true;
      // 172.16.0.0/12 (172.16.x.x to 172.31.x.x)
      if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
      // 192.168.0.0/16
      if (p0 === 192 && p1 === 168) return true;
      // Carrier-grade NAT (100.64.0.0/10)
      if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;
      return false;
    }
    if (net.isIPv6(ip)) {
      const lower = ip.toLowerCase();
      // Unique Local Addresses (fc00::/7 -> fc00:: and fd00::)
      if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
      return false;
    }
    return false;
  }

  async validateTargetUrl(rawUrl: string): Promise<TargetValidationResult> {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { valid: false, error: 'Target URL is required' };
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }

    // Protocol check: strictly http and https only
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== 'http:' && protocol !== 'https:') {
      return {
        valid: false,
        error: `Disallowed URL protocol: ${protocol}. Only http: and https: are permitted.`,
      };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Check raw hostname for metadata keywords
    if (hostname === '169.254.169.254' || hostname === 'instance-data' || hostname === 'metadata.google.internal') {
      return { valid: false, error: 'Access to cloud metadata endpoints is strictly forbidden' };
    }

    // Resolve DNS
    try {
      let resolvedIps: string[] = [];
      if (net.isIP(hostname)) {
        resolvedIps = [hostname];
      } else {
        const records = await dns.promises.lookup(hostname, { all: true });
        resolvedIps = records.map((r) => r.address);
      }

      if (resolvedIps.length === 0) {
        return { valid: false, error: `Could not resolve hostname: ${hostname}` };
      }

      for (const ip of resolvedIps) {
        // Cloud metadata is NEVER allowed under any circumstances
        if (this.isCloudMetadataIp(ip)) {
          this.logger.warn(`SSRF Block: Target ${rawUrl} resolved to cloud metadata IP ${ip}`);
          return { valid: false, error: 'Target resolves to a prohibited cloud metadata address' };
        }

        // Link-local is NEVER allowed
        if (this.isLinkLocalIp(ip)) {
          this.logger.warn(`SSRF Block: Target ${rawUrl} resolved to link-local IP ${ip}`);
          return { valid: false, error: 'Target resolves to a prohibited link-local address' };
        }

        // Check private/loopback if private targets are disabled
        if (!this.isPrivateTargetsAllowed()) {
          if (this.isLoopbackIp(ip)) {
            this.logger.warn(`SSRF Block: Target ${rawUrl} resolved to loopback IP ${ip}`);
            return { valid: false, error: 'Loopback network targets are disabled by policy' };
          }
          if (this.isRfc1918OrPrivateIp(ip)) {
            this.logger.warn(`SSRF Block: Target ${rawUrl} resolved to private RFC1918 IP ${ip}`);
            return { valid: false, error: 'Private internal network targets are disabled by policy' };
          }
        }
      }

      return { valid: true, resolvedIps };
    } catch (err: any) {
      return { valid: false, error: `DNS resolution failed for host "${hostname}": ${err.message}` };
    }
  }

  async validateGrpcTarget(hostPort: string): Promise<TargetValidationResult> {
    if (!hostPort || typeof hostPort !== 'string') {
      return { valid: false, error: 'gRPC target host:port is required' };
    }

    const parts = hostPort.split(':');
    if (parts.length < 2) {
      return { valid: false, error: 'gRPC target must be in host:port format' };
    }

    const host = parts.slice(0, -1).join(':').replace(/[\[\]]/g, '');
    const port = Number(parts[parts.length - 1]);

    if (isNaN(port) || port < 1 || port > 65535) {
      return { valid: false, error: `Invalid port number: ${parts[parts.length - 1]}` };
    }

    if (host === '169.254.169.254' || host === 'instance-data' || host === 'metadata.google.internal') {
      return { valid: false, error: 'Access to cloud metadata endpoints is strictly forbidden' };
    }

    try {
      let resolvedIps: string[] = [];
      if (net.isIP(host)) {
        resolvedIps = [host];
      } else {
        const records = await dns.promises.lookup(host, { all: true });
        resolvedIps = records.map((r) => r.address);
      }

      for (const ip of resolvedIps) {
        if (this.isCloudMetadataIp(ip) || this.isLinkLocalIp(ip)) {
          return { valid: false, error: 'Target resolves to a prohibited cloud metadata or link-local address' };
        }
        if (!this.isPrivateTargetsAllowed()) {
          if (this.isLoopbackIp(ip) || this.isRfc1918OrPrivateIp(ip)) {
            return { valid: false, error: 'Private and loopback targets are disabled by policy' };
          }
        }
      }

      return { valid: true, resolvedIps };
    } catch (err: any) {
      return { valid: false, error: `DNS resolution failed for gRPC target "${host}": ${err.message}` };
    }
  }
}
