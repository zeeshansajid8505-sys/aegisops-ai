-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('SEV_1', 'SEV_2', 'SEV_3', 'SEV_4');

-- CreateEnum
CREATE TYPE "AlertRuleStatus" AS ENUM ('ENABLED', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "AlertComparisonOperator" AS ENUM ('GT', 'GTE', 'LT', 'LTE', 'EQ', 'NEQ');

-- CreateEnum
CREATE TYPE "AlertEvaluationMode" AS ENUM ('PER_SERIES', 'AGGREGATE_SERIES');

-- CreateEnum
CREATE TYPE "AlertAggregation" AS ENUM ('AVG', 'MIN', 'MAX', 'SUM', 'LAST', 'RATE', 'P50', 'P90', 'P99');

-- CreateEnum
CREATE TYPE "AlertSeriesReduction" AS ENUM ('MAX', 'MIN', 'AVG', 'SUM');

-- CreateEnum
CREATE TYPE "AlertNoDataPolicy" AS ENUM ('IGNORE', 'OK', 'ALERT');

-- CreateEnum
CREATE TYPE "AlertInstanceState" AS ENUM ('INACTIVE', 'PENDING', 'FIRING');

-- CreateEnum
CREATE TYPE "AlertEvaluationResult" AS ENUM ('OK', 'BREACH', 'NO_DATA', 'ERROR');

-- CreateEnum
CREATE TYPE "AlertEventType" AS ENUM ('PENDING_STARTED', 'PENDING_CLEARED', 'FIRING_STARTED', 'RESOLVED');

-- CreateTable
CREATE TABLE "alert_rules" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "metric_definition_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "severity" "AlertSeverity" NOT NULL DEFAULT 'SEV_3',
    "status" "AlertRuleStatus" NOT NULL DEFAULT 'ENABLED',
    "evaluation_mode" "AlertEvaluationMode" NOT NULL DEFAULT 'PER_SERIES',
    "aggregation" "AlertAggregation" NOT NULL DEFAULT 'AVG',
    "series_reduction" "AlertSeriesReduction",
    "comparison_operator" "AlertComparisonOperator" NOT NULL,
    "threshold_value" DOUBLE PRECISION NOT NULL,
    "window_seconds" INTEGER NOT NULL DEFAULT 300,
    "evaluation_interval_seconds" INTEGER NOT NULL DEFAULT 60,
    "pending_duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "recovery_duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "no_data_policy" "AlertNoDataPolicy" NOT NULL DEFAULT 'IGNORE',
    "series_filters" JSONB NOT NULL DEFAULT '[]',
    "created_by_user_id" TEXT,
    "last_evaluated_at" TIMESTAMP(3),
    "last_successful_evaluation_at" TIMESTAMP(3),
    "last_evaluation_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "alert_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_instances" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "metric_series_id" TEXT,
    "fingerprint" TEXT NOT NULL,
    "state" "AlertInstanceState" NOT NULL DEFAULT 'INACTIVE',
    "current_value" DOUBLE PRECISION,
    "last_evaluation_result" "AlertEvaluationResult" NOT NULL DEFAULT 'OK',
    "first_breached_at" TIMESTAMP(3),
    "pending_since" TIMESTAMP(3),
    "firing_started_at" TIMESTAMP(3),
    "last_breached_at" TIMESTAMP(3),
    "clear_candidate_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "last_evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_state_change_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "alert_instances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "alert_instance_id" TEXT NOT NULL,
    "event_type" "AlertEventType" NOT NULL,
    "from_state" "AlertInstanceState",
    "to_state" "AlertInstanceState",
    "observed_value" DOUBLE PRECISION,
    "threshold_value" DOUBLE PRECISION,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alert_evaluations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "rule_id" TEXT NOT NULL,
    "alert_instance_id" TEXT,
    "metric_series_id" TEXT,
    "evaluation_key" TEXT NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "window_start" TIMESTAMP(3) NOT NULL,
    "window_end" TIMESTAMP(3) NOT NULL,
    "observed_value" DOUBLE PRECISION,
    "sample_count" INTEGER NOT NULL DEFAULT 0,
    "result" "AlertEvaluationResult" NOT NULL,
    "duration_ms" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alert_rules_organization_id_service_id_environment_id_idx" ON "alert_rules"("organization_id", "service_id", "environment_id");

-- CreateIndex
CREATE INDEX "alert_rules_metric_definition_id_idx" ON "alert_rules"("metric_definition_id");

-- CreateIndex
CREATE INDEX "alert_rules_status_idx" ON "alert_rules"("status");

-- CreateIndex
CREATE INDEX "alert_instances_organization_id_state_idx" ON "alert_instances"("organization_id", "state");

-- CreateIndex
CREATE INDEX "alert_instances_service_id_environment_id_idx" ON "alert_instances"("service_id", "environment_id");

-- CreateIndex
CREATE INDEX "alert_instances_fingerprint_idx" ON "alert_instances"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "alert_instances_rule_id_fingerprint_key" ON "alert_instances"("rule_id", "fingerprint");

-- CreateIndex
CREATE INDEX "alert_events_alert_instance_id_occurred_at_idx" ON "alert_events"("alert_instance_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "alert_events_rule_id_occurred_at_idx" ON "alert_events"("rule_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "alert_events_organization_id_occurred_at_idx" ON "alert_events"("organization_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "alert_evaluations_rule_id_evaluated_at_idx" ON "alert_evaluations"("rule_id", "evaluated_at" DESC);

-- CreateIndex
CREATE INDEX "alert_evaluations_organization_id_evaluated_at_idx" ON "alert_evaluations"("organization_id", "evaluated_at" DESC);

-- CreateIndex
CREATE INDEX "alert_evaluations_alert_instance_id_evaluated_at_idx" ON "alert_evaluations"("alert_instance_id", "evaluated_at" DESC);

-- CreateIndex
CREATE INDEX "alert_evaluations_evaluation_key_idx" ON "alert_evaluations"("evaluation_key");

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_metric_definition_id_fkey" FOREIGN KEY ("metric_definition_id") REFERENCES "metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_rules" ADD CONSTRAINT "alert_rules_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_instances" ADD CONSTRAINT "alert_instances_metric_series_id_fkey" FOREIGN KEY ("metric_series_id") REFERENCES "metric_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_events" ADD CONSTRAINT "alert_events_alert_instance_id_fkey" FOREIGN KEY ("alert_instance_id") REFERENCES "alert_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_evaluations" ADD CONSTRAINT "alert_evaluations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_evaluations" ADD CONSTRAINT "alert_evaluations_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "alert_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_evaluations" ADD CONSTRAINT "alert_evaluations_alert_instance_id_fkey" FOREIGN KEY ("alert_instance_id") REFERENCES "alert_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alert_evaluations" ADD CONSTRAINT "alert_evaluations_metric_series_id_fkey" FOREIGN KEY ("metric_series_id") REFERENCES "metric_series"("id") ON DELETE SET NULL ON UPDATE CASCADE;

