-- CreateEnum
CREATE TYPE "MetricInstrumentType" AS ENUM ('GAUGE', 'SUM', 'HISTOGRAM', 'SUMMARY');

-- CreateEnum
CREATE TYPE "AggregationTemporality" AS ENUM ('DELTA', 'CUMULATIVE');

-- CreateEnum
CREATE TYPE "MetricValueType" AS ENUM ('INT64', 'DOUBLE', 'HISTOGRAM');

-- CreateTable
CREATE TABLE "telemetry_ingest_keys" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "rate_limit_rpm" INTEGER NOT NULL DEFAULT 120,
    "rate_limit_pts" INTEGER NOT NULL DEFAULT 100000,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "telemetry_ingest_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_definitions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT,
    "instrument_type" "MetricInstrumentType" NOT NULL,
    "temporality" "AggregationTemporality",
    "is_monotonic" BOOLEAN,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_series" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "series_hash" TEXT NOT NULL,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "attributes_json" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_points" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "timestamp" TIMESTAMPTZ(3) NOT NULL,
    "time_unix_nano" BIGINT NOT NULL,
    "start_time_unix_nano" BIGINT,
    "value_type" "MetricValueType" NOT NULL,
    "int_value" BIGINT,
    "double_value" DOUBLE PRECISION,
    "histogram_count" BIGINT,
    "histogram_sum" DOUBLE PRECISION,
    "histogram_min" DOUBLE PRECISION,
    "histogram_max" DOUBLE PRECISION,
    "bucket_counts" JSONB,
    "explicit_bounds" JSONB,
    "attributes" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metric_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "metric_rollups_minute" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "bucket_minute" TIMESTAMPTZ(3) NOT NULL,
    "sample_count" INTEGER NOT NULL,
    "min" DOUBLE PRECISION NOT NULL,
    "max" DOUBLE PRECISION NOT NULL,
    "sum" DOUBLE PRECISION NOT NULL,
    "avg" DOUBLE PRECISION NOT NULL,
    "last_value" DOUBLE PRECISION NOT NULL,
    "p50" DOUBLE PRECISION,
    "p90" DOUBLE PRECISION,
    "p99" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "metric_rollups_minute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "telemetry_ingestion_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "ingest_key_id" TEXT,
    "points_accepted" INTEGER NOT NULL DEFAULT 0,
    "points_rejected" INTEGER NOT NULL DEFAULT 0,
    "payload_bytes" INTEGER NOT NULL,
    "content_type" TEXT NOT NULL,
    "client_ip" TEXT,
    "user_agent" TEXT,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telemetry_ingestion_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "telemetry_ingest_keys_key_hash_key" ON "telemetry_ingest_keys"("key_hash");

-- CreateIndex
CREATE INDEX "telemetry_ingest_keys_key_hash_idx" ON "telemetry_ingest_keys"("key_hash");

-- CreateIndex
CREATE INDEX "telemetry_ingest_keys_organization_id_idx" ON "telemetry_ingest_keys"("organization_id");

-- CreateIndex
CREATE INDEX "telemetry_ingest_keys_service_id_environment_id_idx" ON "telemetry_ingest_keys"("service_id", "environment_id");

-- CreateIndex
CREATE INDEX "metric_definitions_organization_id_service_id_idx" ON "metric_definitions"("organization_id", "service_id");

-- CreateIndex
CREATE INDEX "metric_definitions_name_idx" ON "metric_definitions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "metric_definitions_service_id_name_key" ON "metric_definitions"("service_id", "name");

-- CreateIndex
CREATE INDEX "metric_series_organization_id_environment_id_idx" ON "metric_series"("organization_id", "environment_id");

-- CreateIndex
CREATE INDEX "metric_series_service_id_environment_id_idx" ON "metric_series"("service_id", "environment_id");

-- CreateIndex
CREATE INDEX "metric_series_definition_id_idx" ON "metric_series"("definition_id");

-- CreateIndex
CREATE UNIQUE INDEX "metric_series_environment_id_definition_id_series_hash_key" ON "metric_series"("environment_id", "definition_id", "series_hash");

-- CreateIndex
CREATE INDEX "metric_points_series_id_timestamp_idx" ON "metric_points"("series_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "metric_points_environment_id_timestamp_idx" ON "metric_points"("environment_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "metric_points_organization_id_timestamp_idx" ON "metric_points"("organization_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "metric_rollups_minute_environment_id_bucket_minute_idx" ON "metric_rollups_minute"("environment_id", "bucket_minute" DESC);

-- CreateIndex
CREATE INDEX "metric_rollups_minute_definition_id_bucket_minute_idx" ON "metric_rollups_minute"("definition_id", "bucket_minute" DESC);

-- CreateIndex
CREATE INDEX "metric_rollups_minute_organization_id_bucket_minute_idx" ON "metric_rollups_minute"("organization_id", "bucket_minute" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "metric_rollups_minute_series_id_bucket_minute_key" ON "metric_rollups_minute"("series_id", "bucket_minute");

-- CreateIndex
CREATE INDEX "telemetry_ingestion_events_organization_id_created_at_idx" ON "telemetry_ingestion_events"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "telemetry_ingestion_events_service_id_environment_id_create_idx" ON "telemetry_ingestion_events"("service_id", "environment_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "telemetry_ingest_keys" ADD CONSTRAINT "telemetry_ingest_keys_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_ingest_keys" ADD CONSTRAINT "telemetry_ingest_keys_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_ingest_keys" ADD CONSTRAINT "telemetry_ingest_keys_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_ingest_keys" ADD CONSTRAINT "telemetry_ingest_keys_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_definitions" ADD CONSTRAINT "metric_definitions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_definitions" ADD CONSTRAINT "metric_definitions_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_series" ADD CONSTRAINT "metric_series_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_series" ADD CONSTRAINT "metric_series_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_series" ADD CONSTRAINT "metric_series_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_series" ADD CONSTRAINT "metric_series_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_points" ADD CONSTRAINT "metric_points_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_points" ADD CONSTRAINT "metric_points_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_points" ADD CONSTRAINT "metric_points_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_points" ADD CONSTRAINT "metric_points_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "metric_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_rollups_minute" ADD CONSTRAINT "metric_rollups_minute_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_rollups_minute" ADD CONSTRAINT "metric_rollups_minute_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_rollups_minute" ADD CONSTRAINT "metric_rollups_minute_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_rollups_minute" ADD CONSTRAINT "metric_rollups_minute_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "metric_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metric_rollups_minute" ADD CONSTRAINT "metric_rollups_minute_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "metric_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_ingestion_events" ADD CONSTRAINT "telemetry_ingestion_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_ingestion_events" ADD CONSTRAINT "telemetry_ingestion_events_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "telemetry_ingestion_events" ADD CONSTRAINT "telemetry_ingestion_events_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
