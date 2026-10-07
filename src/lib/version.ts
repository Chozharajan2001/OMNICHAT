// src/lib/version.ts
// ────────────────────────────────────────────────────────────────
// One source for the application version.
// ────────────────────────────────────────────────────────────────

import { version } from "../../package.json";

/**
 * package.json is the only place this number is written. It used to be three:
 * the About page printed a literal (with visible backticks, since JSX renders
 * them as text), /api/health read `npm_package_version` -- which is undefined
 * whenever the process is not started through an npm/pnpm script, exactly what a
 * standalone container does -- and the OpenAPI document carried its own number.
 *
 * The OpenAPI version is deliberately separate: it tracks the contract of the
 * API, not the release of the app, and forcing them equal would make a docs-only
 * change look like a product release.
 */
export const APP_VERSION = version;
