import { Router, Request, Response } from 'express';

const router = Router();

// GET /api/health
router.get('/', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'interviewpilot-api',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

export default router;
