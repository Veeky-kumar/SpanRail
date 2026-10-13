# syntax=docker/dockerfile:1
FROM node:24-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 worker

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

USER worker
CMD ["npx", "tsx", "worker/index.ts"]
