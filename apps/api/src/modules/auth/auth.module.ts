import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { SessionAuthGuard } from './guards/session-auth.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, PasswordService, SessionService, SessionAuthGuard],
  exports: [AuthService, SessionService, SessionAuthGuard],
})
export class AuthModule {}