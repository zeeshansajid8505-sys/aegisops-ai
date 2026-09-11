-- CreateEnum
CREATE TYPE "AnomalyDetectorStatus" AS ENUM ('ENABLED', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AnomalyEvaluationMode" AS ENUM ('PER_SERIES', 'AGGREGATE_SERIES');

-- CreateEnum
CREATE TYPE "AnomalySensitivity" AS ENUM ('CONSERVATIVE', 'BALANCED', 'SENSITIVE');

-- CreateEnum
CREATE TYPE "AnomalyModelStatus" AS ENUM ('QUEUED', 'TRAINING', 'READY', 'FAILED', 'SUPERSEDED', 'STALE', 'INSUFFICIENT_DATA');

-- CreateEnum
CREATE TYPE "AnomalyEvaluationResult" AS ENUM ('NORMAL', 'ANOMALOUS', 'INSUFFICIENT_DATA', 'ERROR');

-- CreateEnum
CREATE TYPE "AnomalyFindingState" AS ENUM ('PENDING', 'ANOMALOUS', 'RESOLVED');

-- CreateEnum
CREATE TYPE "AnomalyEventType" AS ENUM ('PENDING_STARTED', 'ANOMALY_DETECTED', 'ANOMALY_UPDATED', 'RESOLVED', 'MODEL_CHANGED', 'ERROR');

-- CreateEnum
CREATE TYPE "AnomalyFeedbackClassification" AS ENUM ('USEFUL', 'FALSE_POSITIVE', 'EXPECTED_BEHAVIOR', 'UNSURE');

-- CreateTable
CREATE TABLE "anomaly_detectors" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "metric_definition_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "AnomalyDetectorStatus" NOT NULL DEFAULT 'ENABLED',
    "evaluation_mode" "AnomalyEvaluationMode" NOT NULL DEFAULT 'AGGREGATE_SERIES',
    "series_filters" JSONB NOT NULL DEFAULT '[]',
    "window_seconds" INTEGER NOT NULL DEFAULT 300,
    "evaluation_interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "training_lookback_hours" INTEGER NOT NULL DEFAULT 24,
    "minimum_training_windows" INTEGER NOT NULL DEFAULT 30,
    "sensitivity" "AnomalySensitivity" NOT NULL DEFAULT 'BALANCED',
    "contamination" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "pending_evaluations" INTEGER NOT NULL DEFAULT 2,
    "recovery_evaluations" INTEGER NOT NULL DEFAULT 2,
    "retrain_interval_hours" INTEGER NOT NULL DEFAULT 24,
    "current_model_version" INTEGER,
    "current_model_status" "AnomalyModelStatus",
    "last_evaluated_at" TIMESTAMP(3),
    "last_trained_at" TIMESTAMP(3),
    "created_by_membership_id" TEXT,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anomaly_detectors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_model_versions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "detector_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AnomalyModelStatus" NOT NULL DEFAULT 'QUEUED',
    "algorithm" TEXT NOT NULL DEFAULT 'IsolationForest',
    "algorithm_version" TEXT NOT NULL DEFAULT '1.9.0',
    "feature_schema_version" TEXT NOT NULL DEFAULT 'anomaly-feature-v1',
    "feature_names" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "training_data_fingerprint" TEXT,
    "training_window_start" TIMESTAMP(3),
    "training_window_end" TIMESTAMP(3),
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "contamination" DOUBLE PRECISION NOT NULL DEFAULT 0.02,
    "model_artifact" BYTEA,
    "artifact_hash" TEXT,
    "artifact_size_bytes" INTEGER,
    "trained_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anomaly_model_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_evaluations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "detector_id" TEXT NOT NULL,
    "model_version_id" TEXT,
    "metric_series_id" TEXT,
    "evaluation_key" TEXT NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "feature_vector" JSONB NOT NULL DEFAULT '{}',
    "raw_score" DOUBLE PRECISION NOT NULL,
    "normalized_score" DOUBLE PRECISION NOT NULL,
    "classification" TEXT NOT NULL DEFAULT 'NORMAL',
    "result" "AnomalyEvaluationResult" NOT NULL DEFAULT 'NORMAL',
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_findings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "detector_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "metric_definition_id" TEXT NOT NULL,
    "metric_series_id" TEXT,
    "model_version_id" TEXT,
    "series_attributes" JSONB,
    "fingerprint" TEXT NOT NULL,
    "state" "AnomalyFindingState" NOT NULL DEFAULT 'PENDING',
    "first_detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "pending_since" TIMESTAMP(3),
    "anomalous_since" TIMESTAMP(3),
    "last_anomalous_at" TIMESTAMP(3),
    "last_normal_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "current_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "peak_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anomaly_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_events" (
    "id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "event_type" "AnomalyEventType" NOT NULL,
    "score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_feedbacks" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "finding_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "classification" "AnomalyFeedbackClassification" NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "anomaly_feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anomaly_detectors_organization_id_status_idx" ON "anomaly_detectors"("organization_id", "status");

-- CreateIndex
CREATE INDEX "anomaly_detectors_service_id_environment_id_idx" ON "anomaly_detectors"("service_id", "environment_id");

-- CreateIndex
CREATE INDEX "anomaly_detectors_metric_definition_id_idx" ON "anomaly_detectors"("metric_definition_id");

-- CreateIndex
CREATE INDEX "anomaly_model_versions_organization_id_status_idx" ON "anomaly_model_versions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "anomaly_model_versions_detector_id_version_key" ON "anomaly_model_versions"("detector_id", "version");

-- CreateIndex
CREATE INDEX "anomaly_evaluations_detector_id_evaluated_at_idx" ON "anomaly_evaluations"("detector_id", "evaluated_at" DESC);

-- CreateIndex
CREATE INDEX "anomaly_evaluations_organization_id_result_idx" ON "anomaly_evaluations"("organization_id", "result");

-- CreateIndex
CREATE INDEX "anomaly_evaluations_evaluation_key_evaluated_at_idx" ON "anomaly_evaluations"("evaluation_key", "evaluated_at" DESC);

-- CreateIndex
CREATE INDEX "anomaly_findings_organization_id_state_idx" ON "anomaly_findings"("organization_id", "state");

-- CreateIndex
CREATE INDEX "anomaly_findings_service_id_state_idx" ON "anomaly_findings"("service_id", "state");

-- CreateIndex
CREATE INDEX "anomaly_findings_environment_id_state_idx" ON "anomaly_findings"("environment_id", "state");

-- CreateIndex
CREATE INDEX "anomaly_findings_metric_definition_id_idx" ON "anomaly_findings"("metric_definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "anomaly_findings_detector_id_fingerprint_key" ON "anomaly_findings"("detector_id", "fingerprint");

-- CreateIndex
CREATE INDEX "anomaly_events_finding_id_occurred_at_idx" ON "anomaly_events"("finding_id", "occurred_at");

-- CreateIndex
CREATE INDEX "anomaly_feedbacks_finding_id_idx" ON "anomaly_feedbacks"("finding_id");

-- CreateIndex
CREATE INDEX "anomaly_feedbacks_organization_id_idx" ON "anomaly_feedbacks"("organization_id");

-- AddForeignKey
ALTER TABLE "anomaly_detectors" ADD CONSTRAINT "anomaly_detectors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_detectors" ADD CONSTRAINT "anomaly_detectors_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_detectors" ADD CONSTRAINT "anomaly_detectors_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_detectors" ADD CONSTRAINT "anomaly_detectors_metric_definition_id_fkey" FOREIGN KEY ("metric_definition_id") REFERENCES "metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_detectors" ADD CONSTRAINT "anomaly_detectors_created_by_membership_id_fkey" FOREIGN KEY ("created_by_membership_id") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_model_versions" ADD CONSTRAINT "anomaly_model_versions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_model_versions" ADD CONSTRAINT "anomaly_model_versions_detector_id_fkey" FOREIGN KEY ("detector_id") REFERENCES "anomaly_detectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_evaluations" ADD CONSTRAINT "anomaly_evaluations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_evaluations" ADD CONSTRAINT "anomaly_evaluations_detector_id_fkey" FOREIGN KEY ("detector_id") REFERENCES "anomaly_detectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_evaluations" ADD CONSTRAINT "anomaly_evaluations_model_version_id_fkey" FOREIGN KEY ("model_version_id") REFERENCES "anomaly_model_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_evaluations" ADD CONSTRAINT "anomaly_evaluations_metric_series_id_fkey" FOREIGN KEY ("metric_series_id") REFERENCES "metric_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_findings" ADD CONSTRAINT "anomaly_findings_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_findings" ADD CONSTRAINT "anomaly_findings_detector_id_fkey" FOREIGN KEY ("detector_id") REFERENCES "anomaly_detectors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_findings" ADD CONSTRAINT "anomaly_findings_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_findings" ADD CONSTRAINT "anomaly_findings_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_findings" ADD CONSTRAINT "anomaly_findings_metric_definition_id_fkey" FOREIGN KEY ("metric_definition_id") REFERENCES "metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_findings" ADD CONSTRAINT "anomaly_findings_metric_series_id_fkey" FOREIGN KEY ("metric_series_id") REFERENCES "metric_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_findings" ADD CONSTRAINT "anomaly_findings_model_version_id_fkey" FOREIGN KEY ("model_version_id") REFERENCES "anomaly_model_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_events" ADD CONSTRAINT "anomaly_events_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "anomaly_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_feedbacks" ADD CONSTRAINT "anomaly_feedbacks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_feedbacks" ADD CONSTRAINT "anomaly_feedbacks_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "anomaly_findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anomaly_feedbacks" ADD CONSTRAINT "anomaly_feedbacks_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
