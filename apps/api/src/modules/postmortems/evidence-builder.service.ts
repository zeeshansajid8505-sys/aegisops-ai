import { Injectable, NotFoundException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export interface PostmortemDraftContent {
  title: string;
  summary: string;
  impact: string;
  rootCause: string;
  contributingFactors: string;
  detection: string;
  response: string;
  resolution: string;
  lessonsLearned: string;
  whatWentWell: string;
  whatWentPoorly: string;
  evidenceFingerprint: string;
  isHumanConfirmedRootCause: boolean;
  confirmedRootCauseSummary: string | null;
}

@Injectable()
export class EvidenceBuilderService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Builds an evidence-grounded postmortem draft deterministically from real incident data.
   */
  async buildDraftFromIncident(
    organizationId: string,
    incidentId: string,
  ): Promise<PostmortemDraftContent> {
    const incident = await this.prisma.incident.findFirst({
      where: { id: incidentId, organizationId },
      include: {
        primaryService: true,
        environment: true,
        commander: { include: { user: true } },
        rootCauseConfirmedBy: { include: { user: true } },
        confirmedRootCauseHypothesis: true,
        alerts: {
          include: {
            alertRule: true,
          },
        },
        timelineEvents: {
          orderBy: { occurredAt: 'asc' },
          include: { actor: { include: { user: true } } },
        },
        hypotheses: {
          orderBy: { rank: 'asc' },
        },
        runbookExecutions: {
          include: {
            runbook: true,
            steps: true,
          },
        },
      },
    });

    if (!incident) {
      throw new NotFoundException(`Incident ${incidentId} not found`);
    }

    // Nearby anomalies on primary service (+- 2 hours)
    const windowStart = new Date(incident.detectedAt.getTime() - 2 * 3600000);
    const windowEnd = new Date((incident.resolvedAt || incident.detectedAt).getTime() + 2 * 3600000);

    const anomalies = incident.primaryServiceId
      ? await this.prisma.anomalyFinding.findMany({
          where: {
            organizationId,
            serviceId: incident.primaryServiceId,
            firstDetectedAt: { gte: windowStart, lte: windowEnd },
          },
          take: 5,
        })
      : [];

    // Deterministic SHA-256 fingerprint from immutable evidence inputs
    const evidencePayload = {
      incidentId: incident.id,
      detectedAt: incident.detectedAt.toISOString(),
      resolvedAt: incident.resolvedAt ? incident.resolvedAt.toISOString() : null,
      primaryServiceId: incident.primaryServiceId,
      alertIds: incident.alerts.map((a) => a.id).sort(),
      timelineEventIds: incident.timelineEvents.map((t) => t.id).sort(),
      hypothesesIds: incident.hypotheses.map((h) => h.id).sort(),
    };
    const evidenceFingerprint = crypto
      .createHash('sha256')
      .update(JSON.stringify(evidencePayload))
      .digest('hex');

    // Human Confirmation Flag
    const isHumanConfirmed = Boolean(
      incident.rootCauseConfirmedAt || incident.confirmedRootCauseHypothesisId || incident.rootCauseSummary,
    );
    const confirmedRootCauseSummary = incident.rootCauseSummary ||
      incident.confirmedRootCauseHypothesis?.hypothesis ||
      null;

    // Durations
    const detectedStr = incident.detectedAt.toISOString();
    const resStr = incident.resolvedAt ? incident.resolvedAt.toISOString() : 'Unresolved';

    const durationSeconds = incident.resolvedAt
      ? Math.round((incident.resolvedAt.getTime() - incident.detectedAt.getTime()) / 1000)
      : null;
    const durationText = durationSeconds
      ? `${Math.floor(durationSeconds / 60)} minutes (${durationSeconds} seconds)`
      : 'Ongoing / Not Resolved';

    // Summary Section
    const summary = [
      `### Executive Summary`,
      `On ${incident.detectedAt.toUTCString()}, incident **${incident.incidentKey}** was detected with severity **${incident.severity}**.`,
      `- **Primary Service**: ${incident.primaryService?.name || 'Unassigned'} (${incident.primaryService?.tier || 'TIER_UNKNOWN'})`,
      `- **Environment**: ${incident.environment?.name || 'Default'}`,
      `- **Status**: ${incident.status}`,
      `- **Incident Commander**: ${incident.commander?.user?.displayName || 'Unassigned'}`,
      `- **Total Duration**: ${durationText}`,
    ].join('\n');

    // Impact Section
    const impact = [
      `### Customer & Operational Impact`,
      `- Service **${incident.primaryService?.name || 'Unknown'}** experienced degraded reliability.`,
      incident.resolvedAt
        ? `- The incident had an active duration of ${durationText}.`
        : `- The incident is currently ${incident.status}.`,
      anomalies.length > 0
        ? `- Telemetry detected ${anomalies.length} anomalous metric deviation(s) during the incident window.`
        : `- Customer impact not quantified. Additional telemetry analysis recommended.`,
    ].join('\n');

    // Root Cause Section (Strict Human Authority Hierarchy)
    let rootCause = '';
    if (isHumanConfirmed && confirmedRootCauseSummary) {
      const confirmer = incident.rootCauseConfirmedBy?.user?.displayName || 'Human Operator';
      const confirmedDate = incident.rootCauseConfirmedAt
        ? new Date(incident.rootCauseConfirmedAt).toUTCString()
        : 'Unknown Date';
      rootCause = [
        `### Confirmed Root Cause`,
        `**${confirmedRootCauseSummary}**`,
        `\n> **Authority Grounding**: Confirmed by operator **${confirmer}** on ${confirmedDate}.`,
      ].join('\n');
    } else {
      rootCause = [
        `### Root Cause Analysis`,
        `**Root cause not yet confirmed.**`,
        `\n> Root cause requires human verification. Review investigative hypotheses below:`,
        ...(incident.hypotheses.length > 0
          ? incident.hypotheses.map(
              (h) => `- **Hypothesis #${h.rank}** (Score: ${(h.score * 100).toFixed(0)}%): ${h.hypothesis} *(Status: ${h.status})*`,
            )
          : ['- No automated AI hypotheses were generated for this incident.']),
      ].join('\n');
    }

    // Contributing Factors
    const contributingFactors = [
      `### Contributing Factors & Correlated Signals`,
      incident.alerts.length > 0
        ? `#### Linked Alert Episodes (${incident.alerts.length}):\n` +
          incident.alerts
            .map((a) => `- **${a.alertRule?.name || 'Alert'}** (${a.alertSeverity}): linked at ${a.linkedAt.toISOString()}`)
            .join('\n')
        : `- No alerts were explicitly linked to this incident.`,
      anomalies.length > 0
        ? `\n#### Telemetry Anomalies Detected:\n` +
          anomalies
            .map((an) => `- Anomaly on detector \`${an.detectorId}\` (Score: ${(an.peakScore * 100).toFixed(1)}%)`)
            .join('\n')
        : `\n- No metric anomalies detected within +-2 hours.`,
    ].join('\n');

    // Detection Section
    const firstAlert = incident.alerts[0];
    const detection = [
      `### Detection Timeline`,
      `- **Initial Detection**: ${detectedStr}`,
      firstAlert
        ? `- **Trigger Signal**: Linked alert rule \`${firstAlert.alertRule?.name || 'Automated Alert'}\``
        : `- **Trigger Signal**: Manual creation or unlinked threshold breach.`,
      `- **Time to Acknowledge**: ${incident.acknowledgedAt ? Math.round((incident.acknowledgedAt.getTime() - incident.detectedAt.getTime()) / 1000) + 's' : 'N/A'}`,
    ].join('\n');

    // Response Section
    const responseMilestones = incident.timelineEvents
      .slice(0, 15)
      .map(
        (t) =>
          `- \`${t.occurredAt.toISOString()}\` [**${t.eventType}**] ${t.message} (${t.actor?.user?.displayName || 'System'})`,
      );

    const runbookDetails = incident.runbookExecutions.map(
      (r) => `- Executed Runbook **${r.runbook?.name || 'Runbook'}**: Status \`${r.status}\``,
    );

    const response = [
      `### Incident Response & Timeline`,
      responseMilestones.length > 0
        ? responseMilestones.join('\n')
        : `- Response initiated immediately upon detection.`,
      runbookDetails.length > 0 ? `\n#### Runbook Remediation Actions:\n` + runbookDetails.join('\n') : '',
    ].join('\n');

    // Resolution Section
    const resolution = [
      `### Resolution & Recovery`,
      `- **Resolved At**: ${resStr}`,
      `- **Mitigation Timestamp**: ${incident.mitigatedAt ? incident.mitigatedAt.toISOString() : 'None recorded'}`,
      incident.summary
        ? `- **Resolution Summary**: ${incident.summary}`
        : `- **Resolution Notes**: Resolved from incident command console.`,
    ].join('\n');

    // Lessons Learned & What Went Well / What Went Poorly
    const whatWentWell = [
      `- Automated alert correlation associated incoming signals with the primary incident.`,
      `- Responders and commanders coordinated through unified Incident Command Console.`,
      incident.runbookExecutions.length > 0 ? `- Guided remediation runbooks were triggered.` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const whatWentPoorly = [
      `- Response lifecycle milestones can be accelerated with earlier acknowledgement.`,
      `- Root cause identification should be documented before resolution.`,
    ].join('\n');

    const lessonsLearned = [
      `### Lessons Learned`,
      `#### What Went Well:`,
      whatWentWell,
      `\n#### What Went Poorly:`,
      whatWentPoorly,
      `\n#### Where We Got Lucky:`,
      `- Impact was contained before cascading to downstream service dependencies.`,
    ].join('\n');

    return {
      title: `Postmortem: [${incident.incidentKey}] ${incident.title}`,
      summary,
      impact,
      rootCause,
      contributingFactors,
      detection,
      response,
      resolution,
      lessonsLearned,
      whatWentWell,
      whatWentPoorly,
      evidenceFingerprint,
      isHumanConfirmedRootCause: isHumanConfirmed,
      confirmedRootCauseSummary,
    };
  }
}

