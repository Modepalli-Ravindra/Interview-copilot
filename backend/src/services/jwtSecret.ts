/**
 * Central JWT secret resolution shared by token issuance (auth routes),
 * verification (REST middleware) and the socket.io auth layer.
 *
 * Production REQUIRES a real JWT_SECRET (see the boot guard in server.ts) —
 * the dev-only fallback below must never be relied on outside local runs.
 */
export function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'super-secret-jwt-key-for-dev';
}
