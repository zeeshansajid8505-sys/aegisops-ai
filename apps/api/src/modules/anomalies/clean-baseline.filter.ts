import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlertInstanceState } from '@prisma/client';

export interface ExcludedTimeInterval {
  start: Date;
  end: Date;
  reason: string;
}

export interface CleanBaselineResult {
  excludedIntervals: ExcludedTimeInterval[];
  maskedIntervalsCount: number;
}

const BUFFER_MS = 5 * 60 * 1000; // 5 minutes before and after incident/alert

@Injectable()
export class CleanBaselineFilter {
  private readonly logger = new Logger(CleanBaselineFilter.name);

  constructor(private readonly prisma: PrismaService) {}

  async getExcludedIntervals(
    organizationId: string,
    serviceId: string,
    environmentId: string,
    lookbackStart: Date,
    lookbackEnd: Date,
  ): Promise<CleanBaselineResult> {
    const intervals: ExcludedTimeInterval[] = [];

    // 1. Query active or historical incidents during the lookback period
    const incidents = await this.prisma.incident.findMany({
      where: {
        organizationId,
        primaryServiceId: serviceId,
        detectedAt: { lte: lookbackEnd },
        OR: [
          { resolvedAt: null },
          { resolvedAt: { gte: lookbackStart } },
        ],
      },
      select: {
        id: true,
        title: true,
        detectedAt: true,
        resolvedAt: true,
      },
    });

    for (const inc of incidents) {
      const start = new Date(Math.max(lookbackStart.getTime(), inc.detectedAt.getTime() - BUFFER_MS));
      const end = inc.resolvedAt
        ? new Date(Math.min(lookbackEnd.getTime(), inc.resolvedAt.getTime() + BUFFER_MS))
        : lookbackEnd;
      intervals.push({
        start,
        end,
        reason: `Active Incident: ${inc.title} (${inc.id})`,
      });
    }

    // 2. Query FIRING alert instances during the lookback period
    const firingAlerts = await this.prisma.alertInstance.findMany({
      where: {
        organizationId,
        serviceId,
        environmentId,
        state: AlertInstanceState.FIRING,
        firingStartedAt: { lte: lookbackEnd },
      },
      select: {
        id: true,
        firingStartedAt: true,
        lastEvaluatedAt: true,
      },
    });

    for (const alert of firingAlerts) {
      if (alert.firingStartedAt) {
        const start = new Date(Math.max(lookbackStart.getTime(), alert.firingStartedAt.getTime() - BUFFER_MS));
        const end = alert.lastEvaluatedAt
          ? new Date(Math.min(lookbackEnd.getTime(), alert.lastEvaluatedAt.getTime() + BUFFER_MS))
          : lookbackEnd;
        intervals.push({
          start,
          end,
          reason: `Firing Alert Instance (${alert.id})`,
        });
      }
    }

    // 3. Query historical FIRING AlertEvents
    const alertEvents = await this.prisma.alertEvent.findMany({
      where: {
        organizationId,
        eventType: 'FIRING_STARTED',
        occurredAt: {
          gte: lookbackStart,
          lte: lookbackEnd,
        },
        alertInstance: {
          serviceId,
          environmentId,
        },
      },
      select: {
        id: true,
        occurredAt: true,
      },
      take: 200,
    });

    for (const ev of alertEvents) {
      intervals.push({
        start: new Date(Math.max(lookbackStart.getTime(), ev.occurredAt.getTime() - BUFFER_MS)),
        end: new Date(Math.min(lookbackEnd.getTime(), ev.occurredAt.getTime() + BUFFER_MS)),
        reason: `Alert Firing Event (${ev.id})`,
      });
    }

    // Merge overlapping intervals
    const merged = this.mergeIntervals(intervals);

    this.logger.log(
      `Clean baseline filter for service ${serviceId}: identified ${intervals.length} raw outage intervals, merged into ${merged.length} clean exclusions`,
    );

    return {
      excludedIntervals: merged,
      maskedIntervalsCount: merged.length,
    };
  }

  isWindowClean(windowStart: Date, windowEnd: Date, excludedIntervals: ExcludedTimeInterval[]): boolean {
    const wStart = windowStart.getTime();
    const wEnd = windowEnd.getTime();

    for (const interval of excludedIntervals) {
      const eStart = interval.start.getTime();
      const eEnd = interval.end.getTime();

      // Overlap check: max(wStart, eStart) < min(wEnd, eEnd)
      if (Math.max(wStart, eStart) < Math.min(wEnd, eEnd)) {
        return false;
      }
    }

    return true;
  }

  private mergeIntervals(intervals: ExcludedTimeInterval[]): ExcludedTimeInterval[] {
    if (intervals.length <= 1) return intervals;

    const sorted = [...intervals].sort((a, b) => a.start.getTime() - b.start.getTime());
    const merged: ExcludedTimeInterval[] = [sorted[0]!];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i]!;
      const last = merged[merged.length - 1]!;

      if (current.start.getTime() <= last.end.getTime()) {
        if (current.end.getTime() > last.end.getTime()) {
          last.end = current.end;
        }
      } else {
        merged.push(current);
      }
    }

    return merged;
  }
}
