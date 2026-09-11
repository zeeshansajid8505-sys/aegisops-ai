# ADR-002: Next.js (App Router) for Operational Web Interface

## Status
Accepted

## Context
An SRE platform requires high information density, responsive interactive dashboards, server-side data fetching for initial load speed, and client-side real-time stream subscription.

## Decision
Use **Next.js 15 (App Router)** with React 19, TypeScript, and Tailwind CSS for `apps/web`.

## Consequences
### Positive
* Unified React ecosystem with server and client components.
* Streamlined routing, nested layouts, and edge-friendly rendering.
* Seamless integration with TanStack Query for client-side cache invalidation and WebSockets.
* Tailwind CSS enables rapid, consistent, high-density UI development without styling bloat.

### Negative / Trade-offs
* App Router has a learning curve for server/client boundary management.
* Strict client component directives (`'use client'`) required for WebSocket and browser event handlers.
