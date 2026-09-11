import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { SystemHealthResponse } from '@aegisops/types';
import { HealthService } from './health.service';

@ApiTags('Health')
@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  @ApiOperation({ summary: 'System Health Check', description: 'Returns system and dependency health status' })
  @ApiResponse({ status: 200, description: 'Health status response' })
  async getHealth(): Promise<SystemHealthResponse> {
    return this.healthService.checkHealth();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness Probe', description: 'Checks if the API service is ready to accept traffic' })
  @ApiResponse({ status: 200, description: 'Service ready' })
  async getReadiness(): Promise<{ ready: boolean; timestamp: string }> {
    return {
      ready: true,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness Probe', description: 'Checks if the API process is alive' })
  @ApiResponse({ status: 200, description: 'Service alive' })
  getLiveness(): { status: string; timestamp: string } {
    return this.healthService.getLiveness();
  }
}
