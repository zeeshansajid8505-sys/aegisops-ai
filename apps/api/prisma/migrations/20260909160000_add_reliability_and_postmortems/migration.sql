-- CreateEnum
CREATE TYPE "PostmortemStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ActionItemPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "ActionItemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "reliability_daily_rollups" (
    "id" TEXT NOT NULL,
    "rollup_key" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT,
    "environment_id" TEXT,
    "date" DATE NOT NULL,
    "incident_count" INTEGER NOT NULL DEFAULT 0,
    "critical_incident_count" INTEGER NOT NULL DEFAULT 0,
    "resolved_incident_count" INTEGER NOT NULL DEFAULT 0,
    "acknowledged_incident_count" INTEGER NOT NULL DEFAULT 0,
    "total_ack_seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_investigation_seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_mitigation_seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "total_resolution_seconds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alert_firing_count" INTEGER NOT NULL DEFAULT 0,
    "alert_resolution_count" INTEGER NOT NULL DEFAULT 0,
    "anomaly_detected_count" INTEGER NOT NULL DEFAULT 0,
    "anomaly_resolved_count" INTEGER NOT NULL DEFAULT 0,
    "runbook_execution_count" INTEGER NOT NULL DEFAULT 0,
    "notification_delivered_count" INTEGER NOT NULL DEFAULT 0,
    "notification_failed_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reliability_daily_rollups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_postmortems" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "status" "PostmortemStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "impact" TEXT NOT NULL,
    "root_cause" TEXT NOT NULL,
    "contributing_factors" TEXT NOT NULL,
    "detection" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "resolution" TEXT NOT NULL,
    "lessons_learned" TEXT NOT NULL,
    "what_went_well" TEXT NOT NULL,
    "what_went_poorly" TEXT NOT NULL,
    "evidence_fingerprint" TEXT NOT NULL,
    "generated_by" TEXT NOT NULL DEFAULT 'DETERMINISTIC',
    "created_by_membership_id" TEXT,
    "approved_by_membership_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_postmortems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postmortem_revisions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "postmortem_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "content_snapshot" JSONB NOT NULL,
    "changed_by_membership_id" TEXT,
    "change_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "postmortem_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "postmortem_action_items" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "postmortem_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" "ActionItemPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "ActionItemStatus" NOT NULL DEFAULT 'OPEN',
    "owner_membership_id" TEXT,
    "due_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_by_membership_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "postmortem_action_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reliability_daily_rollups_rollup_key_key" ON "reliability_daily_rollups"("rollup_key");

-- CreateIndex
CREATE INDEX "reliability_daily_rollups_organization_id_date_idx" ON "reliability_daily_rollups"("organization_id", "date");

-- CreateIndex
CREATE INDEX "reliability_daily_rollups_service_id_date_idx" ON "reliability_daily_rollups"("service_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "incident_postmortems_incident_id_key" ON "incident_postmortems"("incident_id");

-- CreateIndex
CREATE INDEX "incident_postmortems_organization_id_status_idx" ON "incident_postmortems"("organization_id", "status");

-- CreateIndex
CREATE INDEX "postmortem_revisions_postmortem_id_version_idx" ON "postmortem_revisions"("postmortem_id", "version" DESC);

-- CreateIndex
CREATE INDEX "postmortem_revisions_organization_id_idx" ON "postmortem_revisions"("organization_id");

-- CreateIndex
CREATE INDEX "postmortem_action_items_postmortem_id_status_idx" ON "postmortem_action_items"("postmortem_id", "status");

-- CreateIndex
CREATE INDEX "postmortem_action_items_organization_id_owner_membership_id_idx" ON "postmortem_action_items"("organization_id", "owner_membership_id");

-- AddForeignKey
ALTER TABLE "reliability_daily_rollups" ADD CONSTRAINT "reliability_daily_rollups_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reliability_daily_rollups" ADD CONSTRAINT "reliability_daily_rollups_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reliability_daily_rollups" ADD CONSTRAINT "reliability_daily_rollups_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_postmortems" ADD CONSTRAINT "incident_postmortems_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_postmortems" ADD CONSTRAINT "incident_postmortems_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_postmortems" ADD CONSTRAINT "incident_postmortems_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_postmortems" ADD CONSTRAINT "incident_postmortems_approved_by_membership_id_fkey" FOREIGN KEY ("approved_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postmortem_revisions" ADD CONSTRAINT "postmortem_revisions_postmortem_id_fkey" FOREIGN KEY ("postmortem_id") REFERENCES "incident_postmortems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postmortem_revisions" ADD CONSTRAINT "postmortem_revisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postmortem_revisions" ADD CONSTRAINT "postmortem_revisions_changed_by_membership_id_fkey" FOREIGN KEY ("changed_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postmortem_action_items" ADD CONSTRAINT "postmortem_action_items_postmortem_id_fkey" FOREIGN KEY ("postmortem_id") REFERENCES "incident_postmortems"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postmortem_action_items" ADD CONSTRAINT "postmortem_action_items_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postmortem_action_items" ADD CONSTRAINT "postmortem_action_items_owner_membership_id_fkey" FOREIGN KEY ("owner_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postmortem_action_items" ADD CONSTRAINT "postmortem_action_items_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

