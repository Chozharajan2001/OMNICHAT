# OmniChat Dockerfile
# Multi-stage build for Next.js application with PostgreSQL support
#
# `runner` MUST stay the last stage: Railway/Render and any plain
# `docker build .` take the final stage as the default target, and when
# `migrate` was last the app image booted into `prisma db push` instead of
# serving traffic. Compose pins `target:` explicitly as well.

# Stage 1: Dependencies
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm (pinned for reproducible builds; keep in sync with CI)
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# `prepare` executes during install, so its script must exist in this stage.
# link-hooks.mjs imports only node builtins, and a container image has neither a
# .git directory nor a git binary, so it no-ops here instead of failing the build.
COPY scripts/quality/link-hooks.mjs ./scripts/quality/
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Stage 2: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm (pinned for reproducible builds; keep in sync with CI)
RUN corepack enable && corepack prepare pnpm@11.8.0 --activate

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set environment variables for build
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# The generated client MUST match the provider the container runs against:
# prisma.config.ts chooses schema.prisma vs schema.sqlite.prisma from
# DATABASE_URL at generate time, and a Docker build has no runtime env. Without
# this the baked client came from the SQLite schema and every request died with
# "Driver Adapter `@prisma/adapter-pg` ... not compatible with the provider
# `sqlite`". Default is the server provider; each compose stack overrides it.
ARG DATABASE_URL=postgresql://build-only:build-only@localhost:5432/omnichat
ENV DATABASE_URL=${DATABASE_URL}

# Generate Prisma client
RUN pnpm prisma generate

# Build the application
RUN pnpm build

# Stage 3: Migrate — one-shot schema provisioning (run as an init service / deploy
# pre-command against the target DATABASE_URL; the runtime image stays slim).
# Inherits the builder's full toolchain (Prisma CLI + prisma.config.ts + dotenv).
FROM builder AS migrate
ENV NODE_ENV=production
CMD ["pnpm", "prisma", "db", "push"]

# Stage 4: Runner
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

# Set correct permissions
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health', { redirect: 'error', signal: AbortSignal.timeout(8000) }).then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# Start the application
CMD ["node", "server.js"]
