/**
 * Resume & JD Intelligence — Phase 2 API.
 *
 * Endpoints:
 *   POST /api/intelligence/resume  — upload a PDF/TXT/MD resume or paste text
 *                                     -> structured ResumeProfile + normalized skills.
 *   POST /api/intelligence/jd      — upload a PDF/TXT/MD JD or paste text
 *                                     -> structured JdProfile.
 *   POST /api/intelligence/match   — resume profile vs JD profile -> deterministic
 *                                     MatchResult (optionally persisted to a session).
 *
 * Parsing is deterministic (regex/keyword heuristics), never LLM-based. File
 * uploads are handled in-memory via multer (5MB cap) and are NOT stored on disk.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { parseResumeFile, parseResumeText, sanitizeResumeProfile, type ResumeProfile } from '../services/resumeParser';
import { parseJdFile, parseJdText, sanitizeJdProfile, type JdProfile } from '../services/jdParser';
import { matchResumeToJd } from '../services/matchEngine';
import { getSessionRecord, updateSessionRecord } from './sessions';
import { uploadResumeFile, getResumeFile, isStorageConfigured } from '../services/storage';

const router = Router();

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowedExt = /\.(pdf|txt|md)$/i.test(file.originalname);
    const allowedMime = ['application/pdf', 'text/plain', 'text/markdown'].includes(file.mimetype);
    cb(null, allowedExt || allowedMime);
  },
});

function isResumeProfile(v: unknown): v is ResumeProfile {
  return !!v && typeof v === 'object' && typeof (v as ResumeProfile).personal === 'object';
}

function isJdProfile(v: unknown): v is JdProfile {
  return !!v && typeof v === 'object' && typeof (v as JdProfile).role === 'string';
}

function handleError(res: Response, err: unknown, fallback: string): void {
  const message = err instanceof Error ? err.message : fallback;
  console.error(`[Intelligence] ${fallback}:`, message);
  res.status(400).json({ success: false, error: message });
}

// POST /api/intelligence/resume — multipart 'file' OR JSON { text }
router.post('/resume', upload.single('file'), async (req: Request, res: Response) => {
  try {
    let text = '';
    let filename = 'pasted-resume.txt';
    let fileType: 'pdf' | 'text' = 'text';

    if (req.file) {
      const parsed = await parseResumeFile(req.file.buffer, req.file.originalname, req.file.mimetype);
      text = parsed.text;
      filename = parsed.filename;
      fileType = parsed.fileType;
    } else if (req.is('multipart/form-data')) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported file type. Upload a .pdf, .txt, or .md file (max 5MB).',
      });
    } else if (typeof req.body?.text === 'string' && req.body.text.trim()) {
      text = req.body.text;
    }

    if (!text.trim()) {
      return res.status(400).json({ success: false, error: 'No resume provided — upload a file or paste text.' });
    }

    const profile = parseResumeText(text, 'Resume');

    // Best-effort S3 persistence of the original file (skipped when storage is
    // not configured or the upload fails — parsing never fails because of it).
    let fileKey: string | null = null;
    let fileUrl: string | null = null;
    if (req.file) {
      const stored = await uploadResumeFile(req.file.buffer, req.file.originalname);
      if (stored) {
        fileKey = stored.key;
        fileUrl = stored.url;
      }
    }

    res.json({
      success: true,
      data: {
        profile: sanitizeResumeProfile(profile),
        skills: profile.skillDetails,
        // Cleaned text the client needs for interview context (not persisted
        // twice — the session stores it in resume_text).
        text: profile.rawText,
        source: { filename, fileType },
        // Present when the file was stored in S3. Pass back on session create
        // so History can re-download the original file.
        resumeFileKey: fileKey,
        resumeFileUrl: fileUrl,
        storageConfigured: isStorageConfigured(),
      },
    });
  } catch (err) {
    handleError(res, err, 'Resume parsing failed');
  }
});

// GET /api/intelligence/resume/file/:key — download a stored resume file
router.get('/resume/file/:key', async (req: Request, res: Response) => {
  const key = req.params.key;
  if (!key) {
    return res.status(400).json({ success: false, error: 'Missing file key' });
  }
  if (!isStorageConfigured()) {
    return res.status(503).json({ success: false, error: 'Resume storage is not configured.' });
  }
  const buffer = await getResumeFile(key);
  if (!buffer) {
    return res.status(404).json({ success: false, error: 'Resume file not found' });
  }
  const isPdf = /\.pdf$/i.test(key);
  res.setHeader('Content-Type', isPdf ? 'application/pdf' : 'text/plain');
  res.setHeader('Content-Disposition', `attachment; filename="resume${isPdf ? '.pdf' : '.txt'}"`);
  res.setHeader('Content-Length', buffer.length);
  res.send(buffer);
});

// POST /api/intelligence/jd — multipart 'file' OR JSON { text, company? }
router.post('/jd', upload.single('file'), async (req: Request, res: Response) => {
  try {
    let text = '';
    let filename = 'pasted-jd.txt';
    let fileType: 'pdf' | 'text' = 'text';
    const company = typeof req.body?.company === 'string' ? req.body.company : 'Unknown';

    if (req.file) {
      const parsed = await parseJdFile(req.file.buffer, req.file.originalname, req.file.mimetype);
      text = parsed.text;
      filename = req.file.originalname;
      fileType = parsed.fileType;
    } else if (req.is('multipart/form-data')) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported file type. Upload a .pdf, .txt, or .md file (max 5MB).',
      });
    } else if (typeof req.body?.text === 'string' && req.body.text.trim()) {
      text = req.body.text;
    }

    if (!text.trim()) {
      return res.status(400).json({ success: false, error: 'No job description provided — upload a file or paste text.' });
    }

    const profile = await parseJdText(text, company);
    res.json({
      success: true,
      data: {
        profile: sanitizeJdProfile(profile),
        text: profile.rawText,
        source: { filename, fileType },
      },
    });
  } catch (err) {
    handleError(res, err, 'JD parsing failed');
  }
});

// POST /api/intelligence/match — JSON body.
// Provide either structured profiles (resumeProfile/jdProfile) or raw text
// (resumeText/jdText, parsed on the fly), and/or a sessionId to load/persist.
router.post('/match', async (req: Request, res: Response) => {
  try {
    const {
      sessionId,
      resumeProfile,
      jdProfile,
      resumeText,
      jdText,
      company,
    } = req.body || {};

    let rp: ResumeProfile | undefined = isResumeProfile(resumeProfile) ? resumeProfile : undefined;
    let jp: JdProfile | undefined = isJdProfile(jdProfile) ? jdProfile : undefined;

    if (sessionId && typeof sessionId === 'string') {
      const record = getSessionRecord(sessionId);
      if (record) {
        rp = rp || (isResumeProfile(record.resumeProfileData) ? record.resumeProfileData : undefined);
        jp = jp || (isJdProfile(record.jdProfileData) ? record.jdProfileData : undefined);
      }
    }

    if (!rp && typeof resumeText === 'string' && resumeText.trim()) {
      rp = parseResumeText(resumeText, 'Resume');
    }
    if (!jp && typeof jdText === 'string' && jdText.trim()) {
      jp = await parseJdText(jdText, typeof company === 'string' ? company : 'Unknown');
    }

    if (!rp || !jp) {
      return res.status(400).json({
        success: false,
        error: 'Both a resume profile and a job description are required.',
      });
    }

    const match = matchResumeToJd(rp, jp);
    if (sessionId && typeof sessionId === 'string') {
      updateSessionRecord(sessionId, {
        resumeProfileData: sanitizeResumeProfile(rp),
        jdProfileData: sanitizeJdProfile(jp),
        matchReport: match,
      });
    }

    res.json({
      success: true,
      data: {
        match,
        resumeProfile: sanitizeResumeProfile(rp),
        jdProfile: sanitizeJdProfile(jp),
      },
    });
  } catch (err) {
    handleError(res, err, 'Matching failed');
  }
});

export default router;
