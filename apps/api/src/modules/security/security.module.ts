import { Global, Module } from '@nestjs/common';
import { SecurityLoggerService } from './security-logger.service';
import { SSRFValidatorService } from './ssrf-validator.service';
import { SecretEncryptionService } from './secret-encryption.service';

@Global()
@Module({
  providers: [SecurityLoggerService, SSRFValidatorService, SecretEncryptionService],
  exports: [SecurityLoggerService, SSRFValidatorService, SecretEncryptionService],
})
export class SecurityModule {}