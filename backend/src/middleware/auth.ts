import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../services/jwtSecret';

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  // Offline smoke-test mode: grants a synthetic identity so the deterministic
  // suites (backend/scripts/*.js) can exercise the real authenticated routes.
  // NEVER enable outside local test runs.
  if (process.env.AUTH_TEST_MODE === 'true') {
    req.user = { userId: 'test-user', email: 'test@example.com', name: 'Test User' };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, getJwtSecret());
    req.user = decoded as Express.Request['user'];
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
  }
}
