import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiCookieAuth } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthMeResponse, AuthUser } from '@aegisops/types';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SessionAuthGuard } from './guards/session-auth.guard';
import { AuthRateLimiterGuard } from './guards/auth-rate-limiter.guard';
import { CurrentUser } from './decorators/current-user.decorator';

@ApiTags('Authentication')
@Controller('v1/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('register')
  @UseGuards(AuthRateLimiterGuard)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register new account and create primary organization' })
  @ApiResponse({ status: 201, description: 'Account and organization created successfully' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser; initialOrganizationId: string }> {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    const { user, rawToken, initialOrganizationId } = await this.authService.register(
      dto,
      userAgent,
      ipAddress,
    );

    this.sessionService.attachSessionCookie(res, rawToken);
    return { user, initialOrganizationId };
  }

  @Post('login')
  @UseGuards(AuthRateLimiterGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in to existing account' })
  @ApiResponse({ status: 200, description: 'Authentication successful, session cookie set' })
  @ApiResponse({ status: 429, description: 'Too many authentication attempts' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ user: AuthUser }> {
    const userAgent = req.headers['user-agent'];
    const ipAddress = req.ip || req.socket.remoteAddress;

    const { user, rawToken } = await this.authService.login(
      dto,
      userAgent,
      ipAddress,
    );

    this.sessionService.attachSessionCookie(res, rawToken);
    return { user };
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile and memberships' })
  @ApiResponse({ status: 200, description: 'Current user profile with organization memberships' })
  async me(@CurrentUser() user: AuthUser): Promise<AuthMeResponse> {
    return this.authService.getCurrentUser(user.id);
  }

  @Post('logout')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke current session and clear cookie' })
  @ApiResponse({ status: 200, description: 'Logged out from current session' })
  async logout(
    @Req() req: any,
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string }> {
    const rawToken = req.rawToken;
    if (rawToken) {
      await this.authService.logout(rawToken, user.id);
    }
    this.sessionService.clearSessionCookie(res);
    return { message: 'Logged out successfully' };
  }

  @Post('logout-all')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke all active sessions across all devices' })
  @ApiResponse({ status: 200, description: 'All active sessions revoked' })
  async logoutAll(
    @Res({ passthrough: true }) res: Response,
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string }> {
    await this.authService.logoutAll(user.id);
    this.sessionService.clearSessionCookie(res);
    return { message: 'All active sessions revoked successfully' };
  }
}