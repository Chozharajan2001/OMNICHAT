// Next.js server boot hook (runs once per server start, before serving).
// Provisions the desktop SQLite schema on first boot; no-op everywhere else.
export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;
    const { ensureSqliteSchema } = await import("./lib/db/sqlite-bootstrap");
    await ensureSqliteSchema();
}
