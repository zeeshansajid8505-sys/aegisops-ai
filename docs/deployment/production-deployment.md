# AegisOps AI — Production Deployment Guide

This guide outlines the production deployment topology, environment variable configuration, database migration execution, and verification procedures for deploying **AegisOps AI** to cloud environments.

---

## 1. Production Architecture Overview

The recommended production topology divides workloads into managed persistence, background workers, typed APIs, and an edge-rendered frontend:

`
[User Browser]
      │ (HTTPS / WSS)
      ▼
┌─────────────────────────┐
│ Next.js Frontend        │  (Vercel or Container Host)
│ - Edge SSR & Static     │
└────────────┬────────────┘
             │ (Internal HTTPS)
             ▼
┌─────────────────────────┐         ┌─────────────────────────┐
│ NestJS Core API         │ ──────> │ Python FastAPI AI       │ (Private Network)
│ - Port 3001             │         │ - Port 8000             │
└──────┬──────────┬───────┘         └─────────────────────────┘
       │          │
       ▼          ▼
┌──────────────┐ ┌──────────────┐
│ PostgreSQL 16│ │ Redis 7      │
│ (Managed DB) │ │ (BullMQ / Pub│
└──────────────┘ └──────┬───────┘
                        │
                        ▼
                 ┌──────────────┐
                 │ BullMQ Worker│ (Background Container)
                 │ - Rollups    │
                 │ - AI Queue   │
                 └──────────────┘
`

---

## 2. Infrastructure Requirements & Recommended Providers

| Service | Recommended Cloud Host | Minimum Specs |
| :--- | :--- | :--- |
| **Web Frontend** | Vercel or Railway Container | 1 vCPU, 512MB RAM |
| **NestJS Core API** | Railway, Render, or AWS ECS | 1 vCPU, 1GB RAM |
| **BullMQ Worker** | Railway, Render, or AWS ECS | 1 vCPU, 512MB RAM |
| **Python AI Engine** | Railway or AWS ECS (Private Network) | 1 vCPU, 1GB RAM |
| **PostgreSQL 16** | Neon, Supabase, AWS RDS, or Railway | 2 vCPU, 2GB RAM, SSD storage |
| **Redis 7** | Upstash, Redis Cloud, or Railway | Memory: 256MB+, Persistent AOF |

---

## 3. Production Environment Variables Audit

### 3.1 NestJS Core API (pps/api)
`env
NODE_ENV=production
API_PORT=3001
API_HOST=0.0.0.0
API_BASE_URL=https://api.yourdomain.com
CORS_ORIGINS=https://app.yourdomain.com

# Persistence
DATABASE_URL=postgresql://user:password@managed-pg-host:5432/aegisops_prod?schema=public&sslmode=require
REDIS_URL=redis://default:password@managed-redis-host:6379

# Authentication & Session Security
SESSION_COOKIE_SECRET=strong-random-session-secret-min-32-chars
JWT_SECRET=strong-random-jwt-secret-min-32-chars
COOKIE_DOMAIN=yourdomain.com

# Internal AI Service Boundary
AI_SERVICE_URL=http://ai-service-internal:8000
AI_INTERNAL_API_KEY=strong-random-internal-service-key-min-32-chars

# Encryption at Rest (for Webhook secrets and integration tokens)
INTEGRATION_ENCRYPTION_KEY=64-char-hex-encoded-aes-256-key
`

### 3.2 Next.js Web (pps/web)
`env
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WS_URL=wss://api.yourdomain.com
`

### 3.3 Python AI Engine (pps/ai-service)
`env
ENVIRONMENT=production
AI_SERVICE_HOST=0.0.0.0
AI_SERVICE_PORT=8000
AI_INTERNAL_API_KEY=strong-random-internal-service-key-min-32-chars
`

### 3.4 BullMQ Background Worker (pps/worker)
`env
NODE_ENV=production
DATABASE_URL=postgresql://user:password@managed-pg-host:5432/aegisops_prod?schema=public&sslmode=require
REDIS_URL=redis://default:password@managed-redis-host:6379
AI_SERVICE_URL=http://ai-service-internal:8000
AI_INTERNAL_API_KEY=strong-random-internal-service-key-min-32-chars
WORKER_CONCURRENCY=5
`

---

## 4. Production Database Migration Protocol

> [!CAUTION]
> NEVER execute prisma db push or prisma migrate dev against production databases. These commands can result in schema resets and unrecoverable data loss.

### Migration Command
Always use the deterministic forward-only migration command:
`ash
# Executed in apps/api directory or via root script
pnpm --filter=@aegisops/api prisma migrate deploy
`

### Zero-Downtime Migration Rules
1. All schema alterations must be backwards-compatible (expand-and-contract pattern).
2. Adding new non-null columns must always include a default value.
3. Indexes must be created using CREATE INDEX CONCURRENTLY for high-volume tables.

---

## 5. Health Check & Smoke Verification

After deployment, verify that all health check endpoints return HTTP 200:

`ash
# 1. Core API Health (validates DB, Redis, Memory, and Uptime)
curl -f https://api.yourdomain.com/api/health

# 2. Core API Readiness (validates DB read/write readiness)
curl -f https://api.yourdomain.com/api/ready

# 3. Python AI Engine Health
curl -f http://ai-service-internal:8000/health

# 4. Web Frontend Health
curl -f https://app.yourdomain.com/api/health
`

Expected response format:
`json
{
   status: healthy,
  service: @aegisops/api,
  version: 1.0.0,
  components: {
    database: { status: healthy },
    redis: { status: healthy }
  }
}
`

---

## 6. Backup & Disaster Recovery

### Automated Backups
- **PostgreSQL**: Enable daily automated snapshot backups with a 30-day retention window and point-in-time recovery (PITR) enabled.
- **Redis**: Enable Append-Only File (AOF) persistence with fsync every second (ppendfsync everysec).

### Manual Snapshot Export
`ash
# On-demand PostgreSQL backup
pg_dump -h  -U  -d  -F c -b -v -f aegisops_backup.dump
`

---

## 7. Rollback Strategy

1. **Frontend Rollback**: Instant rollback via Vercel / Cloud Dashboard to previous immutable deployment artifact.
2. **Backend Rollback**: Re-deploy previous container image tag. Since migrations follow expand-and-contract, previous code version is compatible with current schema.