FROM node:22-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@12.3.4

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml turbo.json ./
COPY packages/config ./packages/config
COPY packages/types ./packages/types
COPY apps/worker ./apps/worker

RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter=@aegisops/types build
RUN pnpm --filter=@aegisops/worker build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
RUN npm install -g pnpm@12.3.4

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/worker/node_modules ./apps/worker/node_modules

CMD ["node", "apps/worker/dist/index.js"]
