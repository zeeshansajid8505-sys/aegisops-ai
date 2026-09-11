FROM node:22-alpine AS builder

WORKDIR /app
RUN npm install -g pnpm@12.3.4

COPY package.json pnpm-lock.yaml* pnpm-workspace.yaml turbo.json ./
COPY packages/config ./packages/config
COPY packages/types ./packages/types
COPY apps/api ./apps/api

RUN pnpm install --frozen-lockfile=false
RUN pnpm --filter=@aegisops/types build
RUN cd apps/api && pnpm prisma generate
RUN pnpm --filter=@aegisops/api build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
RUN npm install -g pnpm@12.3.4

COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/node_modules ./apps/api/node_modules

EXPOSE 3001
CMD ["node", "apps/api/dist/main"]
