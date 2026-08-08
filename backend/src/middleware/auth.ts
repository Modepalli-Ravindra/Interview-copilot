import { Request, Response, NextFunction } from 'express';

/**
 * Auth seam — a pluggable gate for protected /api routes.
 *
 * Current state: OPTIONAL simple bearer-token auth. Full Supabase Auth
 * (JWT verification via the JS SDK) is the planned replacement; keep this
 * middleware as the single chokepoint so swapping the implementation later
 * does not touch any route code.
 *
 * Env:
 *   AUTH_ENABLED=true|false   (default false — single-user personal use)
 *   AUTH_TOKEN=<secret>       required when AUTH_ENABLED=true
 */

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const enabled = process.env.AUTH_ENABLED === 'true';
  if (!enabled) return next();

  const expected = process.env.AUTH_TOKEN;
  if (!expected) {
    res.status(500).json({ success: false, error: 'AUTH_TOKEN not configured' });
    return;
  }

  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token || token !== expected) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
}
