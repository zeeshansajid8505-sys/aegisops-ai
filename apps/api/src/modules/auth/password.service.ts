import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  /**
   * Hashes plain-text passwords using Argon2id with recommended OWASP parameters.
   * - type: argon2id
   * - memoryCost: 64 MB (65536 KiB)
   * - timeCost: 3 iterations
   * - parallelism: 4 threads
   */
  async hash(password: string): Promise<string> {
    return argon2.hash(password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
  }

  /**
   * Verifies a candidate password against an Argon2id hash.
   */
  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      return false;
    }
  }
}