-- CreateEnum
CREATE TYPE "TeamRole" AS ENUM ('LEAD', 'MEMBER');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('WEB_APP', 'API', 'WORKER', 'DATABASE', 'QUEUE', 'AI_SERVICE', 'INTERNAL_SERVICE', 'EXTERNAL_SERVICE', 'OTHER');

-- CreateEnum
CREATE TYPE "ServiceTier" AS ENUM ('TIER_1', 'TIER_2', 'TIER_3');

-- CreateEnum
CREATE TYPE "ServiceLifecycle" AS ENUM ('DEVELOPMENT', 'ACTIVE', 'DEPRECATED', 'RETIRED');

-- CreateEnum
CREATE TYPE "EnvironmentKind" AS ENUM ('PRODUCTION', 'STAGING', 'DEVELOPMENT', 'TEST', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DependencyType" AS ENUM ('SYNCHRONOUS', 'ASYNCHRONOUS', 'DATA', 'INFRASTRUCTURE', 'OTHER');

-- CreateEnum
CREATE TYPE "ProbeType" AS ENUM ('HTTP', 'GRPC');

-- CreateEnum
CREATE TYPE "ServiceHealthStatus" AS ENUM ('UNKNOWN', 'HEALTHY', 'DEGRADED', 'UNHEALTHY');

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_members" (
    "id" TEXT NOT NULL,
    "team_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "role" "TeamRole" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "team_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "service_type" "ServiceType" NOT NULL DEFAULT 'API',
    "tier" "ServiceTier" NOT NULL DEFAULT 'TIER_2',
    "lifecycle_status" "ServiceLifecycle" NOT NULL DEFAULT 'ACTIVE',
    "owner_team_id" TEXT,
    "repository_url" TEXT,
    "documentation_url" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_environments" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "EnvironmentKind" NOT NULL DEFAULT 'DEVELOPMENT',
    "base_url" TEXT,
    "is_production" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_environments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_dependencies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "source_service_id" TEXT NOT NULL,
    "target_service_id" TEXT NOT NULL,
    "dependency_type" "DependencyType" NOT NULL DEFAULT 'SYNCHRONOUS',
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_probes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "probe_type" "ProbeType" NOT NULL DEFAULT 'HTTP',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "is_critical" BOOLEAN NOT NULL DEFAULT false,
    "interval_seconds" INTEGER NOT NULL DEFAULT 30,
    "timeout_ms" INTEGER NOT NULL DEFAULT 5000,
    "failure_threshold" INTEGER NOT NULL DEFAULT 3,
    "success_threshold" INTEGER NOT NULL DEFAULT 2,
    "http_method" TEXT NOT NULL DEFAULT 'GET',
    "http_path" TEXT NOT NULL DEFAULT '/health',
    "http_expected_status_min" INTEGER NOT NULL DEFAULT 200,
    "http_expected_status_max" INTEGER NOT NULL DEFAULT 299,
    "grpc_host" TEXT,
    "grpc_service" TEXT,
    "grpc_use_tls" BOOLEAN NOT NULL DEFAULT false,
    "next_run_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_probes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_probe_states" (
    "id" TEXT NOT NULL,
    "probe_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "ServiceHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "consecutive_successes" INTEGER NOT NULL DEFAULT 0,
    "consecutive_failures" INTEGER NOT NULL DEFAULT 0,
    "last_checked_at" TIMESTAMP(3),
    "last_successful_at" TIMESTAMP(3),
    "last_failed_at" TIMESTAMP(3),
    "last_latency_ms" INTEGER,
    "last_failure_code" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_probe_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_probe_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "probe_id" TEXT NOT NULL,
    "service_id" TEXT NOT NULL,
    "environment_id" TEXT NOT NULL,
    "status" "ServiceHealthStatus" NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL,
    "latency_ms" INTEGER,
    "http_status_code" INTEGER,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "health_probe_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "teams_organization_id_idx" ON "teams"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "teams_organization_id_slug_key" ON "teams"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "team_members_team_id_idx" ON "team_members"("team_id");

-- CreateIndex
CREATE INDEX "team_members_membership_id_idx" ON "team_members"("membership_id");

-- CreateIndex
CREATE UNIQUE INDEX "team_members_team_id_membership_id_key" ON "team_members"("team_id", "membership_id");

-- CreateIndex
CREATE INDEX "services_organization_id_idx" ON "services"("organization_id");

-- CreateIndex
CREATE INDEX "services_owner_team_id_idx" ON "services"("owner_team_id");

-- CreateIndex
CREATE UNIQUE INDEX "services_organization_id_slug_key" ON "services"("organization_id", "slug");

-- CreateIndex
CREATE INDEX "service_environments_organization_id_idx" ON "service_environments"("organization_id");

-- CreateIndex
CREATE INDEX "service_environments_service_id_idx" ON "service_environments"("service_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_environments_service_id_key_key" ON "service_environments"("service_id", "key");

-- CreateIndex
CREATE INDEX "service_dependencies_organization_id_idx" ON "service_dependencies"("organization_id");

-- CreateIndex
CREATE INDEX "service_dependencies_source_service_id_idx" ON "service_dependencies"("source_service_id");

-- CreateIndex
CREATE INDEX "service_dependencies_target_service_id_idx" ON "service_dependencies"("target_service_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_dependencies_organization_id_source_service_id_targ_key" ON "service_dependencies"("organization_id", "source_service_id", "target_service_id");

-- CreateIndex
CREATE INDEX "health_probes_organization_id_idx" ON "health_probes"("organization_id");

-- CreateIndex
CREATE INDEX "health_probes_service_id_idx" ON "health_probes"("service_id");

-- CreateIndex
CREATE INDEX "health_probes_environment_id_idx" ON "health_probes"("environment_id");

-- CreateIndex
CREATE INDEX "health_probes_enabled_next_run_at_idx" ON "health_probes"("enabled", "next_run_at");

-- CreateIndex
CREATE UNIQUE INDEX "health_probe_states_probe_id_key" ON "health_probe_states"("probe_id");

-- CreateIndex
CREATE INDEX "health_probe_states_organization_id_idx" ON "health_probe_states"("organization_id");

-- CreateIndex
CREATE INDEX "health_probe_runs_organization_id_idx" ON "health_probe_runs"("organization_id");

-- CreateIndex
CREATE INDEX "health_probe_runs_probe_id_created_at_idx" ON "health_probe_runs"("probe_id", "created_at");

-- CreateIndex
CREATE INDEX "health_probe_runs_service_id_idx" ON "health_probe_runs"("service_id");

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_team_id_fkey" FOREIGN KEY ("team_id") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "team_members" ADD CONSTRAINT "team_members_membership_id_fkey" FOREIGN KEY ("membership_id") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_owner_team_id_fkey" FOREIGN KEY ("owner_team_id") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_environments" ADD CONSTRAINT "service_environments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_environments" ADD CONSTRAINT "service_environments_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_dependencies" ADD CONSTRAINT "service_dependencies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_dependencies" ADD CONSTRAINT "service_dependencies_source_service_id_fkey" FOREIGN KEY ("source_service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_dependencies" ADD CONSTRAINT "service_dependencies_target_service_id_fkey" FOREIGN KEY ("target_service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_probes" ADD CONSTRAINT "health_probes_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_probes" ADD CONSTRAINT "health_probes_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_probes" ADD CONSTRAINT "health_probes_environment_id_fkey" FOREIGN KEY ("environment_id") REFERENCES "service_environments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_probe_states" ADD CONSTRAINT "health_probe_states_probe_id_fkey" FOREIGN KEY ("probe_id") REFERENCES "health_probes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_probe_runs" ADD CONSTRAINT "health_probe_runs_probe_id_fkey" FOREIGN KEY ("probe_id") REFERENCES "health_probes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
