import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTelemetryKeyDto } from './dto/create-telemetry-key.dto';
import type { TelemetryIngestKeySummary, TelemetryIngestKeyCreateResponse } from '@aegisops/types';

@Injectable()
export class TelemetryKeysService {
  private readonly logger = new Logger(TelemetryKeysService.name);

  constructor(private readonly prisma: PrismaService) {}

  async createKey(
    organizationId: string,
    serviceId: string,
    dto: CreateTelemetryKeyDto,
    userId: string,
  ): Promise<TelemetryIngestKeyCreateResponse> {
    // Verify environment belongs to service and organization
    const env = await this.prisma.serviceEnvironment.findFirst({
      where: {
        id: dto.environmentId,
        serviceId,
        organizationId,
      },
    });

    if (!env) {
      throw new NotFoundException(`Service environment with ID '${dto.environmentId}' not found for this service`);
    }

    // Generate 32 bytes (256 bits) cryptographically secure random entropy
    const entropy = crypto.randomBytes(32).toString('hex');
    const rawKey = `aeg_ing_${entropy}`;
    const keyPrefix = `aeg_ing_${entropy.slice(0, 8)}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const created = await this.prisma.telemetryIngestKey.create({
      data: {
        organizationId,
        serviceId,
        environmentId: dto.environmentId,
        name: dto.name,
        keyPrefix,
        keyHash,
        createdByUserId: userId,
        rateLimitRpm: dto.rateLimitRpm ?? 120,
        rateLimitPts: dto.rateLimitPts ?? 100000,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });

    this.logger.log(`Created telemetry ingest key '${dto.name}' (prefix: ${keyPrefix}) for service ${serviceId}`);

    return {
      ...this.mapToSummary(created),
      rawKey, // Explicit: raw secret returned only once
    };
  }

  async listKeys(
    organizationId: string,
    serviceId: string,
    environmentId?: string,
  ): Promise<TelemetryIngestKeySummary[]> {
    const keys = await this.prisma.telemetryIngestKey.findMany({
      where: {
        organizationId,
        serviceId,
        ...(environmentId ? { environmentId } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((k) => this.mapToSummary(k));
  }

  async revokeKey(
    organizationId: string,
    serviceId: string,
    keyId: string,
  ): Promise<TelemetryIngestKeySummary> {
    const existing = await this.prisma.telemetryIngestKey.findFirst({
      where: {
        id: keyId,
        organizationId,
        serviceId,
      },
    });

    if (!existing) {
      throw new NotFoundException(`Telemetry ingest key '${keyId}' not found`);
    }

    if (!existing.isActive || existing.revokedAt) {
      throw new BadRequestException(`Telemetry ingest key '${keyId}' is already revoked`);
    }

    const updated = await this.prisma.telemetryIngestKey.update({
      where: { id: keyId },
      data: {
        isActive: false,
        revokedAt: new Date(),
      },
    });

    this.logger.log(`Revoked telemetry ingest key '${keyId}' (prefix: ${existing.keyPrefix})`);

    return this.mapToSummary(updated);
  }

  async validateRawKey(rawKey: string): Promise<{
    id: string;
    organizationId: string;
    serviceId: string;
    environmentId: string;
    rateLimitRpm: number;
    rateLimitPts: number;
  } | null> {
    if (!rawKey || !rawKey.startsWith('aeg_ing_')) {
      return null;
    }

    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const key = await this.prisma.telemetryIngestKey.findUnique({
      where: { keyHash },
      select: {
        id: true,
        organizationId: true,
        serviceId: true,
        environmentId: true,
        isActive: true,
        revokedAt: true,
        expiresAt: true,
        rateLimitRpm: true,
        rateLimitPts: true,
      },
    });

    if (!key || !key.isActive || key.revokedAt) {
      return null;
    }

    if (key.expiresAt && key.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    // Update lastUsedAt asynchronously without blocking ingestion
    this.prisma.telemetryIngestKey
      .update({
        where: { id: key.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err) => {
        this.logger.debug(`Failed to update key lastUsedAt: ${err.message}`);
      });

    return {
      id: key.id,
      organizationId: key.organizationId,
      serviceId: key.serviceId,
      environmentId: key.environmentId,
      rateLimitRpm: key.rateLimitRpm,
      rateLimitPts: key.rateLimitPts,
    };
  }

  private mapToSummary(k: {
    id: string;
    organizationId: string;
    serviceId: string;
    environmentId: string;
    name: string;
    keyPrefix: string;
    createdByUserId: string | null;
    isActive: boolean;
    expiresAt: Date | null;
    revokedAt: Date | null;
    lastUsedAt: Date | null;
    rateLimitRpm: number;
    rateLimitPts: number;
    createdAt: Date;
    updatedAt: Date;
  }): TelemetryIngestKeySummary {
    return {
      id: k.id,
      organizationId: k.organizationId,
      serviceId: k.serviceId,
      environmentId: k.environmentId,
      name: k.name,
      keyPrefix: k.keyPrefix,
      isActive: k.isActive,
      rateLimitRpm: k.rateLimitRpm,
      rateLimitPts: k.rateLimitPts,
      createdByUserId: k.createdByUserId,
      expiresAt: k.expiresAt?.toISOString() ?? null,
      revokedAt: k.revokedAt?.toISOString() ?? null,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
      updatedAt: k.updatedAt.toISOString(),
    };
  }
}
