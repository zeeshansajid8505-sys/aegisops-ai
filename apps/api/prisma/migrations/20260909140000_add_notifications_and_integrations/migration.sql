-- CreateEnum
CREATE TYPE "IntegrationType" AS ENUM ('SLACK_WEBHOOK', 'GENERIC_WEBHOOK', 'PAGERDUTY_WEBHOOK');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL', 'SLACK', 'WEBHOOK');

-- CreateEnum
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('PENDING', 'DELIVERED', 'FAILED', 'RETRYING', 'SKIPPED');

-- CreateTable
CREATE TABLE "notification_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "source_module" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'INFO',
    "service_id" TEXT,
    "environment_id" TEXT,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "actor_user_id" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "event_id" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'IN_APP',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "severity" "IncidentSeverity" NOT NULL DEFAULT 'INFO',
    "deep_link" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_receipts" (
    "id" TEXT NOT NULL,
    "notification_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_connections" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "description" TEXT,
    "target_url" TEXT NOT NULL,
    "secret_ciphertext" TEXT,
    "secret_iv" TEXT,
    "secret_tag" TEXT,
    "secret_version" INTEGER NOT NULL DEFAULT 1,
    "secret_mask" TEXT,
    "headers" JSONB,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_tested_at" TIMESTAMP(3),
    "last_test_status" TEXT,
    "last_test_error" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "integration_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "event_types" TEXT[],
    "min_severity" "IncidentSeverity" NOT NULL DEFAULT 'INFO',
    "service_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "environment_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "channels" "NotificationChannel"[],
    "email_recipients" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "slack_connection_id" TEXT,
    "webhook_connection_id" TEXT,
    "cooldown_seconds" INTEGER NOT NULL DEFAULT 60,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "notification_event_id" TEXT NOT NULL,
    "notification_policy_id" TEXT,
    "integration_connection_id" TEXT,
    "channel" "NotificationChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "destination_fingerprint" TEXT NOT NULL,
    "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 4,
    "next_attempt_at" TIMESTAMP(3),
    "last_error" TEXT,
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_delivery_attempts" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "response_status" INTEGER,
    "response_duration_ms" INTEGER,
    "response_body_excerpt" TEXT,
    "error_message" TEXT,
    "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_delivery_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_notification_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "min_severity" "IncidentSeverity" NOT NULL DEFAULT 'INFO',
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_events_organization_id_event_type_idx" ON "notification_events"("organization_id", "event_type");

-- CreateIndex
CREATE INDEX "notification_events_organization_id_occurred_at_idx" ON "notification_events"("organization_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_organization_id_created_at_idx" ON "notifications"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notification_receipts_user_id_organization_id_read_at_idx" ON "notification_receipts"("user_id", "organization_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_receipts_notification_id_user_id_key" ON "notification_receipts"("notification_id", "user_id");

-- CreateIndex
CREATE INDEX "integration_connections_organization_id_type_idx" ON "integration_connections"("organization_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "integration_connections_organization_id_name_key" ON "integration_connections"("organization_id", "name");

-- CreateIndex
CREATE INDEX "notification_policies_organization_id_is_enabled_idx" ON "notification_policies"("organization_id", "is_enabled");

-- CreateIndex
CREATE INDEX "notification_deliveries_organization_id_status_idx" ON "notification_deliveries"("organization_id", "status");

-- CreateIndex
CREATE INDEX "notification_deliveries_organization_id_created_at_idx" ON "notification_deliveries"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_organization_id_notification_event__key" ON "notification_deliveries"("organization_id", "notification_event_id", "notification_policy_id", "channel", "destination_fingerprint");

-- CreateIndex
CREATE INDEX "notification_delivery_attempts_delivery_id_attempt_number_idx" ON "notification_delivery_attempts"("delivery_id", "attempt_number");

-- CreateIndex
CREATE INDEX "user_notification_preferences_organization_id_user_id_idx" ON "user_notification_preferences"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_notification_preferences_user_id_organization_id_chann_key" ON "user_notification_preferences"("user_id", "organization_id", "channel");

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_events" ADD CONSTRAINT "notification_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "notification_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_receipts" ADD CONSTRAINT "notification_receipts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_connections" ADD CONSTRAINT "integration_connections_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_policies" ADD CONSTRAINT "notification_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_policies" ADD CONSTRAINT "notification_policies_slack_connection_id_fkey" FOREIGN KEY ("slack_connection_id") REFERENCES "integration_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_policies" ADD CONSTRAINT "notification_policies_webhook_connection_id_fkey" FOREIGN KEY ("webhook_connection_id") REFERENCES "integration_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_policies" ADD CONSTRAINT "notification_policies_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_event_id_fkey" FOREIGN KEY ("notification_event_id") REFERENCES "notification_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_policy_id_fkey" FOREIGN KEY ("notification_policy_id") REFERENCES "notification_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_integration_connection_id_fkey" FOREIGN KEY ("integration_connection_id") REFERENCES "integration_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_delivery_attempts" ADD CONSTRAINT "notification_delivery_attempts_delivery_id_fkey" FOREIGN KEY ("delivery_id") REFERENCES "notification_deliveries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_notification_preferences" ADD CONSTRAINT "user_notification_preferences_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

