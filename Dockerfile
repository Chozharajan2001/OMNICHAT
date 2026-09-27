# OmniChat Dockerfile
# Multi-stage build for Next.js application with PostgreSQL support

# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Generate Prisma client
RUN pnpm prisma generate

# Build the application
RUN pnpm build

# Stage 3: Runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy necessary files from builder
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Prisma CLI (pinned to the @prisma/client major) so the entrypoint can provision
# the PostgreSQL schema at container start. Engines are fetched at build time.
RUN npm install --global prisma@7.8.0

# Runtime entrypoint: provisions the schema for PostgreSQL, then execs CMD.
COPY scripts/docker-entrypoint.sh ./docker-entrypoint.sh

# Set correct permissions
RUN chmod +x ./docker-entrypoint.sh && chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health', { redirect: 'error', signal: AbortSignal.timeout(8000) }).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Provision schema (PostgreSQL only), then start the application
ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
