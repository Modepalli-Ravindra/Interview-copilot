import { Router, Request, Response } from 'express';
import { analyzeResumeText } from '../services/resumeAnalyzer';
import { gatewayStatus } from '../services/aiGateway';

const router = Router();

// POST /api/analysis/resume — real-time resume analysis via the AI gateway
router.post('/resume', async (req: Request, res: Response) => {
  const { resumeText, role, company } = req.body || {};

  if (typeof resumeText !== 'string' || resumeText.trim().length === 0) {
    return res.status(400).json({ success: false, error: 'resumeText is required' });
  }

  try {
    const { analysis, fromMock } = await analyzeResumeText({
      resumeText,
      role: role || 'Software Engineer',
      company: company || 'Unknown',
    });
    res.json({
      success: true,
      data: { analysis, gateway: gatewayStatus(), fromMock },
    });
  } catch (err) {
    console.error('[Analysis] resume analysis failed:', (err as Error).message);
    res.status(502).json({ success: false, error: 'AI gateway unavailable' });
  }
});

export default router;
