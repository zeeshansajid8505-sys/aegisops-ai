-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'MITIGATED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "IncidentSource" AS ENUM ('AUTOMATED', 'MANUAL');

-- CreateEnum
CREATE TYPE "IncidentSeverity" AS ENUM ('CRITICAL', 'ERROR', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "IncidentTimelineEventType" AS ENUM ('INCIDENT_CREATED', 'ALERT_ATTACHED', 'ALERT_RESOLVED', 'ALL_LINKED_SIGNALS_CLEARED', 'ACKNOWLEDGED', 'STATUS_CHANGED', 'SEVERITY_ESCALATED', 'SEVERITY_CHANGED', 'COMMANDER_ASSIGNED', 'COMMANDER_CHANGED', 'RESPONDER_ADDED', 'RESPONDER_REMOVED', 'NOTE_ADDED', 'TITLE_UPDATED', 'SUMMARY_UPDATED', 'REOPENED', 'RESOLVED', 'MANUAL_ALERT_ATTACHED', 'ALERT_UNLINKED');

-- CreateEnum
CREATE TYPE "IncidentResponderRole" AS ENUM ('COMMANDER', 'RESPONDER');

-- CreateEnum
CREATE TYPE "CorrelationTriggerStatus" AS ENUM ('PENDING', 'QUEUED', 'PROCESSED', 'FAILED');

-- CreateTable
CREATE TABLE "incidents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "incident_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "source" "IncidentSource" NOT NULL DEFAULT 'AUTOMATED',
    "status" "IncidentStatus" NOT NULL DEFAULT 'OPEN',
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'WARNING',
    "primary_service_id" TEXT,
    "environment_id" TEXT,
    "commander_membership_id" TEXT,
    "assigned_team_id" TEXT,
    "created_by_membership_id" TEXT,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_at" TIMESTAMP(3),
    "investigation_started_at" TIMESTAMP(3),
    "mitigated_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "reopened_at" TIMESTAMP(3),
    "last_signal_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "all_signals_cleared_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_alerts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "alert_instance_id" TEXT NOT NULL,
    "trigger_alert_event_id" TEXT NOT NULL,
    "alert_rule_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "alert_severity" "AlertSeverity" NOT NULL,
    "correlation_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "correlation_reasons" JSONB NOT NULL DEFAULT '[]',
    "linked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "unlinked_at" TIMESTAMP(3),
    "unlinked_by_membership_id" TEXT,
    "unlink_reason" TEXT,

    CONSTRAINT "incident_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_timeline_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "event_type" "IncidentTimelineEventType" NOT NULL,
    "actor_membership_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "message" TEXT NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "incident_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_responders" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "role" "IncidentResponderRole" NOT NULL DEFAULT 'RESPONDER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "incident_responders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_correlation_triggers" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "alert_event_id" TEXT NOT NULL,
    "event_type" "AlertEventType" NOT NULL,
    "status" "CorrelationTriggerStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "queued_at" TIMESTAMP(3),
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_correlation_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "incidents_incident_key_key" ON "incidents"("incident_key");

-- CreateIndex
CREATE INDEX "incidents_organization_id_status_idx" ON "incidents"("organization_id", "status");

-- CreateIndex
CREATE INDEX "incidents_organization_id_severity_idx" ON "incidents"("organization_id", "severity");

-- CreateIndex
CREATE INDEX "incidents_organization_id_environment_id_idx" ON "incidents"("organization_id", "environment_id");

-- CreateIndex
CREATE INDEX "incidents_primary_service_id_idx" ON "incidents"("primary_service_id");

-- CreateIndex
CREATE INDEX "incidents_commander_membership_id_idx" ON "incidents"("commander_membership_id");

-- CreateIndex
CREATE INDEX "incidents_last_signal_at_idx" ON "incidents"("last_signal_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "incident_alerts_trigger_alert_event_id_key" ON "incident_alerts"("trigger_alert_event_id");

-- CreateIndex
CREATE INDEX "incident_alerts_incident_id_idx" ON "incident_alerts"("incident_id");

-- CreateIndex
CREATE INDEX "incident_alerts_alert_instance_id_idx" ON "incident_alerts"("alert_instance_id");

-- CreateIndex
CREATE INDEX "incident_alerts_organization_id_service_id_idx" ON "incident_alerts"("organization_id", "service_id");

-- CreateIndex
CREATE INDEX "incident_timeline_events_incident_id_occurred_at_idx" ON "incident_timeline_events"("incident_id", "occurred_at" ASC);

-- CreateIndex
CREATE INDEX "incident_timeline_events_organization_id_occurred_at_idx" ON "incident_timeline_events"("organization_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "incident_responders_organization_id_membership_id_idx" ON "incident_responders"("organization_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_responders_incident_id_membership_id_key" ON "incident_responders"("incident_id", "membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "incident_correlation_triggers_alert_event_id_key" ON "incident_correlation_triggers"("alert_event_id");

-- CreateIndex
CREATE INDEX "incident_correlation_triggers_organization_id_status_idx" ON "incident_correlation_triggers"("organization_id", "status");

-- CreateIndex
CREATE INDEX "incident_correlation_triggers_status_created_at_idx" ON "incident_correlation_triggers"("status", "created_at");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_primary_service_id_fkey" FOREIGN KEY ("primary_service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_commander_membership_id_fkey" FOREIGN KEY ("commander_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_team_id_fkey" FOREIGN KEY ("assigned_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_alerts" ADD CONSTRAINT "incident_alerts_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_alerts" ADD CONSTRAINT "incident_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_alerts" ADD CONSTRAINT "incident_alerts_alert_instance_id_fkey" FOREIGN KEY ("alert_instance_id") REFERENCES "alert_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_alerts" ADD CONSTRAINT "incident_alerts_trigger_alert_event_id_fkey" FOREIGN KEY ("trigger_alert_event_id") REFERENCES "alert_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_alerts" ADD CONSTRAINT "incident_alerts_alert_rule_id_fkey" FOREIGN KEY ("alert_rule_id") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_alerts" ADD CONSTRAINT "incident_alerts_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_alerts" ADD CONSTRAINT "incident_alerts_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_alerts" ADD CONSTRAINT "incident_alerts_unlinked_by_membership_id_fkey" FOREIGN KEY ("unlinked_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline_events" ADD CONSTRAINT "incident_timeline_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline_events" ADD CONSTRAINT "incident_timeline_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_timeline_events" ADD CONSTRAINT "incident_timeline_events_actor_membership_id_fkey" FOREIGN KEY ("actor_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_responders" ADD CONSTRAINT "incident_responders_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_responders" ADD CONSTRAINT "incident_responders_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_responders" ADD CONSTRAINT "incident_responders_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_correlation_triggers" ADD CONSTRAINT "incident_correlation_triggers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_correlation_triggers" ADD CONSTRAINT "incident_correlation_triggers_alert_event_id_fkey" FOREIGN KEY ("alert_event_id") REFERENCES "alert_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

