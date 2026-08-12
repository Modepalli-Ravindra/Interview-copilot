import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import 'dotenv/config';
import { authMiddleware } from './middleware/auth';
import { corsOriginAllowList, corsOriginDiagnostic } from './services/corsConfig';
import authRouter from './routes/auth';
import healthRouter from './routes/health';
import sessionsRouter from './routes/sessions';
import analysisRouter from './routes/analysis';
import executeRouter from './routes/execute';
import problemsRouter from './routes/problems';
import dashboardRouter from './routes/dashboard';
import roadmapRouter from './routes/roadmap';
import githubRouter from './routes/github';
import intelligenceRouter from './routes/intelligence';
import candidatesRouter from './routes/candidates';
import codingRouter from './routes/coding';
import codingInterviewRouter from './routes/codingInterview';
import voiceRouter from './routes/voice';

const app = express();

// Enable Helmet to set security headers and prevent basic vulnerabilities
app.use(helmet());

// CORS for the Vite frontend. FRONTEND_URL is normalized + validated at boot
// (backend/src/services/corsConfig.ts) so a bad value fails the deploy instead
// of throwing ERR_INVALID_CHAR on every request. Uses a server-side allow-list
// (foreign origins get no ACAO header) and the SAME origin as Socket.IO.
import { getCorsOrigin } from './services/corsConfig';

// Fail fast in production if FRONTEND_URL is invalid
if (process.env.NODE_ENV === 'production') {
  try {
    getCorsOrigin(); // this will throw if invalid
  } catch (err) {
    console.error('[CORS FATAL]', err);
    process.exit(1);
  }
}

console.log(`[CORS] ${corsOriginDiagnostic()}`);
app.use(cors({
  origin: corsOriginAllowList,
  credentials: true
}));

// Express body parsers with payload caps (resumes/JD text can be long, but
// 2MB is generous and stops abuse before it reaches the AI providers).
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Request logger (dev)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Per-IP rate limiting for the API (generous — single-user personal use).
const apiLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 300),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please slow down.' },
});

// Auth gate for all /api routes (health and auth stay open).
app.use('/api', (req, _res, next) => {
  if (req.path.startsWith('/health') || req.path.startsWith('/auth/register') || req.path.startsWith('/auth/login')) {
    return next();
  }
  authMiddleware(req, _res, next);
});

// Route mounting
app.use('/api/auth',     apiLimiter, authRouter);
app.use('/api/health',   healthRouter);
app.use('/api/sessions', apiLimiter, sessionsRouter);
app.use('/api/analysis', apiLimiter, analysisRouter);
app.use('/api/execute',  apiLimiter, executeRouter);
app.use('/api/problems', apiLimiter, problemsRouter);
app.use('/api/dashboard', apiLimiter, dashboardRouter);
app.use('/api/roadmap',  apiLimiter, roadmapRouter);
app.use('/api/github',   apiLimiter, githubRouter);
app.use('/api/intelligence', apiLimiter, intelligenceRouter);
app.use('/api/candidates', apiLimiter, candidatesRouter);
app.use('/api/coding',   apiLimiter, codingRouter);
app.use('/api/coding-interview', apiLimiter, codingInterviewRouter);
app.use('/api/voice',            apiLimiter, voiceRouter);

// Standard Error Fallback Handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ success: false, error: 'Request payload too large.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ success: false, error: 'Malformed JSON body.' });
  }
  console.error('[System Error] Unhandled exception:', err);
  res.status(500).json({
    status: 'error',
    message: 'An unexpected internal error occurred.'
  });
});

export default app;
