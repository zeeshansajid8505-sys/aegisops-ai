import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
  version: number;
  mask: string;
}

@Injectable()
export class SecretEncryptionService {
  private readonly logger = new Logger(SecretEncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor() {
    const rawKey =
      process.env.INTEGRATION_ENCRYPTION_KEY ||
      process.env.SESSION_SECRET ||
      'aegisops-production-integration-secret-encryption-master-key-v1';
    this.key = crypto.createHash('sha256').update(rawKey).digest();
  }

  /**
   * Generates a safe masked representation of a secret string.
   * e.g. "••••••••" or "••••••••abcd"
   */
  maskSecret(plaintext: string): string {
    if (!plaintext || typeof plaintext !== 'string') {
      return '••••••••';
    }
    const trimmed = plaintext.trim();
    if (trimmed.length <= 8) {
      return '••••••••';
    }
    const last4 = trimmed.slice(-4);
    return `••••••••${last4}`;
  }

  /**
   * Encrypts a plaintext secret using AES-256-GCM.
   */
  encrypt(plaintext: string): EncryptedSecret {
    if (!plaintext || typeof plaintext !== 'string') {
      throw new Error('Plaintext secret must be a non-empty string');
    }

    // 12-byte IV standard for AES-GCM
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      ciphertext,
      iv: iv.toString('hex'),
      tag: authTag.toString('hex'),
      version: 1,
      mask: this.maskSecret(plaintext),
    };
  }

  /**
   * Decrypts an AES-256-GCM encrypted payload.
   */
  decrypt(payload: { ciphertext: string; iv: string; tag: string; version?: number }): string {
    if (!payload?.ciphertext || !payload?.iv || !payload?.tag) {
      throw new Error('Invalid encrypted payload: ciphertext, iv, and tag are required');
    }

    try {
      const iv = Buffer.from(payload.iv, 'hex');
      const tag = Buffer.from(payload.tag, 'hex');
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(tag);

      let plaintext = decipher.update(payload.ciphertext, 'hex', 'utf8');
      plaintext += decipher.final('utf8');

      return plaintext;
    } catch (err: any) {
      this.logger.error(`Secret decryption failed: ${err?.message || err}`);
      throw new Error('Failed to decrypt integration secret. Authentication tag verification failed.');
    }
  }
}

