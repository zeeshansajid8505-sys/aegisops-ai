-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "HypothesisConfidence" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "HypothesisStatus" AS ENUM ('PROPOSED', 'CONFIRMED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "RunbookStepType" AS ENUM ('CHECK', 'MANUAL_ACTION', 'VALIDATION', 'REFERENCE');

-- CreateEnum
CREATE TYPE "RunbookExecutionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RunbookExecutionStepStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "IncidentTimelineEventType" ADD VALUE 'ANALYSIS_STARTED';
ALTER TYPE "IncidentTimelineEventType" ADD VALUE 'ANALYSIS_COMPLETED';
ALTER TYPE "IncidentTimelineEventType" ADD VALUE 'ROOT_CAUSE_CONFIRMED';
ALTER TYPE "IncidentTimelineEventType" ADD VALUE 'HYPOTHESIS_REJECTED';
ALTER TYPE "IncidentTimelineEventType" ADD VALUE 'RUNBOOK_STARTED';
ALTER TYPE "IncidentTimelineEventType" ADD VALUE 'RUNBOOK_STEP_COMPLETED';
ALTER TYPE "IncidentTimelineEventType" ADD VALUE 'RUNBOOK_COMPLETED';

-- AlterTable
ALTER TABLE "incidents" ADD COLUMN     "confirmed_root_cause_hypothesis_id" TEXT,
ADD COLUMN     "root_cause_confirmed_at" TIMESTAMP(3),
ADD COLUMN     "root_cause_confirmed_by_membership_id" TEXT,
ADD COLUMN     "root_cause_summary" TEXT;

-- CreateTable
CREATE TABLE "incident_analyses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'QUEUED',
    "analysis_version" INTEGER NOT NULL DEFAULT 1,
    "algorithm_version" TEXT NOT NULL DEFAULT '1.0.0',
    "model_version" TEXT NOT NULL DEFAULT '1.0.0',
    "embedding_version" TEXT NOT NULL DEFAULT '1.0.0',
    "evidence_snapshot_id" TEXT,
    "evidence_fingerprint" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "summary" TEXT,
    "recommended_next_checks" JSONB NOT NULL DEFAULT '[]',
    "recommended_runbooks" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_evidence_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "primary_service_id" TEXT,
    "affected_service_ids" JSONB NOT NULL DEFAULT '[]',
    "evidence_version" TEXT NOT NULL DEFAULT '1.0.0',
    "evidence_fingerprint" TEXT NOT NULL,
    "facts" JSONB NOT NULL DEFAULT '[]',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incident_evidence_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "incident_hypotheses" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "analysis_id" TEXT NOT NULL,
    "candidate_service_id" TEXT,
    "rank" INTEGER NOT NULL DEFAULT 1,
    "hypothesis" TEXT NOT NULL,
    "confidence" "HypothesisConfidence" NOT NULL DEFAULT 'MEDIUM',
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason_codes" JSONB NOT NULL DEFAULT '[]',
    "evidence_refs" JSONB NOT NULL DEFAULT '[]',
    "counter_evidence_refs" JSONB NOT NULL DEFAULT '[]',
    "status" "HypothesisStatus" NOT NULL DEFAULT 'PROPOSED',
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "incident_hypotheses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runbooks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "service_id" TEXT,
    "severity" "IncidentSeverity",
    "tags" JSONB NOT NULL DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_membership_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runbooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runbook_steps" (
    "id" TEXT NOT NULL,
    "runbook_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "step_type" "RunbookStepType" NOT NULL DEFAULT 'CHECK',
    "requires_confirmation" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runbook_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runbook_executions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "incident_id" TEXT NOT NULL,
    "runbook_id" TEXT NOT NULL,
    "status" "RunbookExecutionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_by_membership_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runbook_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "runbook_execution_steps" (
    "id" TEXT NOT NULL,
    "execution_id" TEXT NOT NULL,
    "runbook_step_id" TEXT NOT NULL,
    "status" "RunbookExecutionStepStatus" NOT NULL DEFAULT 'PENDING',
    "completed_by_membership_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runbook_execution_steps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incident_analyses_incident_id_analysis_version_idx" ON "incident_analyses"("incident_id", "analysis_version" DESC);

-- CreateIndex
CREATE INDEX "incident_analyses_organization_id_status_idx" ON "incident_analyses"("organization_id", "status");

-- CreateIndex
CREATE INDEX "incident_analyses_evidence_fingerprint_idx" ON "incident_analyses"("evidence_fingerprint");

-- CreateIndex
CREATE INDEX "incident_evidence_snapshots_incident_id_created_at_idx" ON "incident_evidence_snapshots"("incident_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "incident_evidence_snapshots_organization_id_evidence_finger_idx" ON "incident_evidence_snapshots"("organization_id", "evidence_fingerprint");

-- CreateIndex
CREATE INDEX "incident_hypotheses_analysis_id_rank_idx" ON "incident_hypotheses"("analysis_id", "rank");

-- CreateIndex
CREATE INDEX "incident_hypotheses_incident_id_status_idx" ON "incident_hypotheses"("incident_id", "status");

-- CreateIndex
CREATE INDEX "incident_hypotheses_organization_id_candidate_service_id_idx" ON "incident_hypotheses"("organization_id", "candidate_service_id");

-- CreateIndex
CREATE INDEX "runbooks_organization_id_is_active_idx" ON "runbooks"("organization_id", "is_active");

-- CreateIndex
CREATE INDEX "runbooks_organization_id_service_id_idx" ON "runbooks"("organization_id", "service_id");

-- CreateIndex
CREATE INDEX "runbook_steps_runbook_id_order_idx" ON "runbook_steps"("runbook_id", "order");

-- CreateIndex
CREATE INDEX "runbook_executions_incident_id_created_at_idx" ON "runbook_executions"("incident_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "runbook_executions_organization_id_status_idx" ON "runbook_executions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "runbook_execution_steps_execution_id_runbook_step_id_key" ON "runbook_execution_steps"("execution_id", "runbook_step_id");

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_confirmed_root_cause_hypothesis_id_fkey" FOREIGN KEY ("confirmed_root_cause_hypothesis_id") REFERENCES "incident_hypotheses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_root_cause_confirmed_by_membership_id_fkey" FOREIGN KEY ("root_cause_confirmed_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_analyses" ADD CONSTRAINT "incident_analyses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_analyses" ADD CONSTRAINT "incident_analyses_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_analyses" ADD CONSTRAINT "incident_analyses_evidence_snapshot_id_fkey" FOREIGN KEY ("evidence_snapshot_id") REFERENCES "incident_evidence_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_evidence_snapshots" ADD CONSTRAINT "incident_evidence_snapshots_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_evidence_snapshots" ADD CONSTRAINT "incident_evidence_snapshots_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_evidence_snapshots" ADD CONSTRAINT "incident_evidence_snapshots_primary_service_id_fkey" FOREIGN KEY ("primary_service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_hypotheses" ADD CONSTRAINT "incident_hypotheses_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_hypotheses" ADD CONSTRAINT "incident_hypotheses_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_hypotheses" ADD CONSTRAINT "incident_hypotheses_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "incident_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "incident_hypotheses" ADD CONSTRAINT "incident_hypotheses_candidate_service_id_fkey" FOREIGN KEY ("candidate_service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbooks" ADD CONSTRAINT "runbooks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbooks" ADD CONSTRAINT "runbooks_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbooks" ADD CONSTRAINT "runbooks_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbook_steps" ADD CONSTRAINT "runbook_steps_runbook_id_fkey" FOREIGN KEY ("runbook_id") REFERENCES "runbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbook_executions" ADD CONSTRAINT "runbook_executions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbook_executions" ADD CONSTRAINT "runbook_executions_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbook_executions" ADD CONSTRAINT "runbook_executions_runbook_id_fkey" FOREIGN KEY ("runbook_id") REFERENCES "runbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbook_executions" ADD CONSTRAINT "runbook_executions_started_by_membership_id_fkey" FOREIGN KEY ("started_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbook_execution_steps" ADD CONSTRAINT "runbook_execution_steps_execution_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "runbook_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbook_execution_steps" ADD CONSTRAINT "runbook_execution_steps_runbook_step_id_fkey" FOREIGN KEY ("runbook_step_id") REFERENCES "runbook_steps"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runbook_execution_steps" ADD CONSTRAINT "runbook_execution_steps_completed_by_membership_id_fkey" FOREIGN KEY ("completed_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

