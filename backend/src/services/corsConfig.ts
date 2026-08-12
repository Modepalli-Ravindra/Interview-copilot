/**
 * Central CORS origin resolution shared by the REST middleware (app.ts) and
 * Socket.IO (server.ts) so both are ALWAYS consistent.
 *
 * Production failure mode this fixes: FRONTEND_URL is handed to cors() /
 * socket.io verbatim. If it contains a control/non-ASCII byte (a stray
 * newline or quote pasted into the Render dashboard), Node throws
 * ERR_INVALID_CHAR while writing the Access-Control-Allow-Origin header on
 * EVERY request. We normalize + validate the value once at boot so a bad
 * FRONTEND_URL fails the deploy loudly instead of failing every browser call.
 *
 * We also use a server-side allow-list (origin callback) rather than a fixed
 * string: a string origin is emitted for EVERY request and relies purely on
 * the browser to enforce it, while the callback lets the server refuse to
 * bless foreign origins at all (no Access-Control-Allow-Origin header).
 */

export const CORS_DEV_FALLBACK = 'http://localhost:5173';

/**
 * Normalize a raw frontend origin string to a single canonical origin
 * (scheme://host[:port], no path/query/fragment, no trailing slash).
 *
 * Leading/trailing whitespace (incl. a stray newline from a paste) and a
 * single surrounding pair of quotes are stripped — these are exactly the
 * paste artifacts that produced ERR_INVALID_CHAR. Any control / non-ASCII
 * byte that survives trimming (i.e. interior) is rejected outright. Returns
 * null for empty input. Throws on anything unsafe for the
 * Access-Control-Allow-Origin header or incompatible with credentials:true.
 */
export function normalizeOrigin(raw: string | undefined | null): string | null {
  if (raw === undefined || raw === null) return null;
  let v = String(raw).trim();
  if (v.length === 0) return null;

  // A single surrounding pair of matching quotes is a common paste artifact.
  if (v.length >= 2) {
    const first = v[0];
    const last = v[v.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      v = v.slice(1, -1).trim();
    }
    if (v.length === 0) return null;
  }

  // Reject every non-printable/non-ASCII byte that survived trimming: any of
  // these would make Node throw ERR_INVALID_CHAR when the value is written to
  // the header.
  if (/[^\u0020-\u007E]/.test(v)) {
    throw new Error('FRONTEND_URL contains control or non-ASCII characters (e.g. a stray newline or tab)');
  }

  // Wildcards are never safe with credentials:true (they would also defeat
  // the whole point of a single allowed origin).
  if (v.includes('*')) {
    throw new Error('FRONTEND_URL must be a single concrete origin, not a wildcard like *');
  }

  let parsed: URL;
  try {
    parsed = new URL(v);
  } catch {
    throw new Error('FRONTEND_URL is not a valid absolute URL');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('FRONTEND_URL must be an http(s) origin');
  }
  if (parsed.username || parsed.password) {
    throw new Error('FRONTEND_URL must not contain user credentials');
  }
  if (parsed.pathname && parsed.pathname !== '/') {
    throw new Error('FRONTEND_URL must be a bare origin with no path');
  }
  if (parsed.search || parsed.hash) {
    throw new Error('FRONTEND_URL must be a bare origin with no query or fragment');
  }

  return parsed.origin;
}

let _cachedRaw: string | undefined;
let _cachedOrigin: string | null = null;

/**
 * Resolve the effective CORS origin for this process.
 *
 * In production FRONTEND_URL must resolve to exactly one valid origin;
 * otherwise the server refuses to boot (fail fast, never fail every request).
 * In development it falls back to the Vite dev server origin.
 */
export function getCorsOrigin(): string {
  const raw = process.env.FRONTEND_URL;
  if (raw === _cachedRaw && _cachedOrigin !== null) return _cachedOrigin;
  const origin = normalizeOrigin(raw);
  if (!origin) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FRONTEND_URL must be set to a single http(s) origin (e.g. https://my-vercel-app.vercel.app)');
    }
    return CORS_DEV_FALLBACK;
  }
  _cachedRaw = raw;
  _cachedOrigin = origin;
  return origin;
}

export type CorsOriginCallback = (err: Error | null, allow: string | false) => void;

/**
 * Server-side origin allow-list used by BOTH the REST cors() middleware and
 * Socket.IO (engine.io uses the same cors package, so semantics are shared).
 *
 *   - No Origin header (curl / Render health check / server-to-server):
 *     no cross-origin context — proceed with NO CORS headers.
 *   - Origin === configured FRONTEND_URL: reflect the exact origin + keep
 *     credentials:true.
 *   - Any other Origin: refused (no Access-Control-Allow-Origin header), so
 *     the browser blocks it. Wildcards are impossible here.
 */
export function corsOriginAllowList(origin: string | undefined, callback: CorsOriginCallback): void {
  try {
    if (!origin) {
      return callback(null, false);
    }
    const allowed = getCorsOrigin();
    callback(null, origin === allowed ? origin : false);
  } catch (err) {
    callback(err as Error, false);
  }
}

/**
 * Safe diagnostic string for startup logs. Never contains secret values —
 * the frontend origin is a public URL.
 */
export function corsOriginDiagnostic(): string {
  try {
    return `CORS origin configured: ${getCorsOrigin()}`;
  } catch (err) {
    return `CORS origin configuration error: ${(err as Error).message}`;
  }
}
