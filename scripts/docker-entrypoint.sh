#!/bin/sh
# OmniChat container entrypoint.
#
# Provisions the database schema before starting the app:
#   - PostgreSQL (production): runs `prisma db push` so a fresh deploy creates tables.
#   - SQLite / other (local or single-container): skips — the host path uses
#     `pnpm db:init` / `pnpm db:push`, and the SQLite file lives in a mounted volume.
#
# Fails safe: no --accept-data-loss, so a lossy schema change aborts the container
# start instead of silently dropping data.
set -eu

db_url="${DATABASE_URL:-}"

case "$db_url" in
  postgresql://*|postgres://*)
    echo "[entrypoint] PostgreSQL detected - provisioning schema with 'prisma db push'..."
    if ! prisma db push --schema prisma/schema.prisma --skip-generate; then
      echo "[entrypoint] ERROR: schema provisioning failed; aborting container start." >&2
      exit 1
    fi
    echo "[entrypoint] Schema provisioning complete."
    ;;
  "")
    echo "[entrypoint] WARNING: DATABASE_URL is not set; skipping schema provisioning." >&2
    ;;
  *)
    echo "[entrypoint] Non-PostgreSQL DATABASE_URL; skipping runtime schema provisioning."
    ;;
esac

exec "$@"
