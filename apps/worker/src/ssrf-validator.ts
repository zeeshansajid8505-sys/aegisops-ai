import * as dns from 'dns';
import * as net from 'net';
import { URL } from 'url';

export interface TargetValidationResult {
  valid: boolean;
  error?: string;
  resolvedIp?: string;
}

export class WorkerSSRFValidator {
  private isPrivateTargetsAllowed(): boolean {
    return (
      process.env['PROBE_ALLOW_PRIVATE_TARGETS'] === 'true' ||
      process.env['WEBHOOK_ALLOW_PRIVATE_TARGETS'] === 'true'
    );
  }

  private isCloudMetadata(ip: string): boolean {
    if (ip === '169.254.169.254') return true;
    if (net.isIPv4(ip)) {
      const parts = ip.split('.').map(Number);
      if (parts[0] === 169 && parts[1] === 254) return true;
    }
    if (net.isIPv6(ip)) {
      const lower = ip.toLowerCase();
      if (lower.startsWith('fe80:')) return true;
    }
    return false;
  }

  private isLoopback(ip: string): boolean {
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
      if (p0 === 10) return true;
      if (p0 === 172 && p1 >= 16 && p1 <= 31) return true;
      if (p0 === 192 && p1 === 168) return true;
      if (p0 === 100 && p1 >= 64 && p1 <= 127) return true;
      return false;
    }
    if (net.isIPv6(ip)) {
      const lower = ip.toLowerCase();
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

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return {
        valid: false,
        error: `Prohibited protocol: ${parsed.protocol}. Only http: and https: are allowed`,
      };
    }

    const hostname = parsed.hostname;
    if (!hostname) {
      return { valid: false, error: 'URL must contain a valid hostname' };
    }

    return this.validateHost(hostname);
  }

  async validateGrpcTarget(targetHostPort: string): Promise<TargetValidationResult> {
    if (!targetHostPort || typeof targetHostPort !== 'string') {
      return { valid: false, error: 'Target host:port is required' };
    }

    let host: string;
    if (targetHostPort.startsWith('[')) {
      const closingBracket = targetHostPort.indexOf(']');
      if (closingBracket === -1) {
        return { valid: false, error: 'Invalid IPv6 target format' };
      }
      host = targetHostPort.substring(1, closingBracket);
    } else {
      const parts = targetHostPort.split(':');
      if (parts.length > 2) {
        return { valid: false, error: 'Ambiguous host:port target' };
      }
      host = parts[0] || '';
    }

    if (!host) {
      return { valid: false, error: 'Target must specify a hostname or IP' };
    }

    return this.validateHost(host);
  }

  private async validateHost(hostOrIp: string): Promise<TargetValidationResult> {
    const allowPrivate = this.isPrivateTargetsAllowed();

    if (net.isIP(hostOrIp)) {
      const ip = hostOrIp;
      if (this.isCloudMetadata(ip)) {
        return { valid: false, error: 'Access to cloud metadata endpoints is strictly prohibited' };
      }
      if (!allowPrivate) {
        if (this.isLoopback(ip)) {
          return { valid: false, error: 'Access to loopback IP addresses is prohibited' };
        }
        if (this.isRfc1918OrPrivateIp(ip)) {
          return { valid: false, error: 'Access to private RFC1918 network addresses is prohibited' };
        }
      }
      return { valid: true, resolvedIp: ip };
    }

    try {
      const lookupResults = await dns.promises.lookup(hostOrIp, { all: true });
      if (!lookupResults || lookupResults.length === 0) {
        return { valid: false, error: `Could not resolve hostname '${hostOrIp}' via DNS` };
      }

      for (const entry of lookupResults) {
        const ip = entry.address;
        if (this.isCloudMetadata(ip)) {
          return {
            valid: false,
            error: `Resolved IP (${ip}) targets cloud metadata endpoint which is prohibited`,
          };
        }
        if (!allowPrivate) {
          if (this.isLoopback(ip)) {
            return {
              valid: false,
              error: `Resolved IP (${ip}) targets loopback which is prohibited`,
            };
          }
          if (this.isRfc1918OrPrivateIp(ip)) {
            return {
              valid: false,
              error: `Resolved IP (${ip}) targets private network which is prohibited`,
            };
          }
        }
      }

      const firstIp = lookupResults[0]?.address;
      return { valid: true, resolvedIp: firstIp };
    } catch (err: any) {
      return {
        valid: false,
        error: `DNS resolution failed for hostname '${hostOrIp}': ${err.message || 'Unknown DNS error'}`,
      };
    }
  }
}

