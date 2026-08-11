import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getJwtSecret } from '../services/jwtSecret';

const router = Router();

// ──────────────────────────────────────────────────────────────
// Privileged Supabase client (service-role key) — backend ONLY.
//
// register/login manage the `users` table. The service-role key bypasses
// Row-Level Security, so the table can stay RLS-enabled and NOT publicly
// writable while the server performs user creation/lookup. The anon
// (publishable) key is never used for the users table.
//
// Security rules for SUPABASE_SERVICE_ROLE_KEY:
//   * exists only in backend/.env (never committed)
//   * never exposed to the frontend or in any API response
//   * never in VITE_* variables
//   * never logged
//
// The client is constructed lazily so offline boots (smoke suites, local dev
// without Supabase) never crash; requests that hit register/login without a
// configured key fail with a clean 500.
// ──────────────────────────────────────────────────────────────
let _service: SupabaseClient | null = null;
function getServiceSupabase(): SupabaseClient {
  if (_service) return _service;
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY must be configured for user management');
  }
  _service = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as SupabaseClient;
  return _service;
}

router.post('/register', async (req: Request, res: Response) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ success: false, error: 'Email, password, and name are required' });
  }

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ success: false, error: 'Invalid email format' });
  }

  if (password.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long' });
  }
  if (!/[a-zA-Z]/.test(password)) {
    return res.status(400).json({ success: false, error: 'Password must contain at least one letter' });
  }
  if (!/[!@#$%^&*(),.?":{}|<>\-_]/.test(password)) {
    return res.status(400).json({ success: false, error: 'Password must contain at least one special character' });
  }

  try {
    // Check if user exists (service-role: RLS bypassed, backend-only access)
    const { data: existingUser } = await getServiceSupabase()
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle(); // Use maybeSingle to avoid throw on 0 rows

    if (existingUser) {
      return res.status(400).json({ success: false, error: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const userId = randomUUID();

    // Insert user (service-role). Maps the unique-email race to 400 as well.
    const { error: insertError } = await getServiceSupabase()
      .from('users')
      .insert({
        id: userId,
        email,
        password_hash: passwordHash,
        name
      });

    if (insertError) {
      if (insertError.code === '23505') {
        return res.status(400).json({ success: false, error: 'User already exists' });
      }
      console.error('[Auth] Insert error:', insertError.message);
      return res.status(500).json({ success: false, error: 'Failed to create user' });
    }

    // Generate JWT
    const token = jwt.sign({ userId, email, name }, getJwtSecret(), { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      token,
      user: { id: userId, email, name }
    });
  } catch (err) {
    console.error('[Auth] Registration error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, error: 'Email and password are required' });
  }

  try {
    const { data: user, error } = await getServiceSupabase()
      .from('users')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (error || !user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid email or password' });
    }

    const token = jwt.sign({ userId: user.id, email: user.email, name: user.name }, getJwtSecret(), { expiresIn: '7d' });

    res.json({
      success: true,
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

router.get('/me', async (req: Request, res: Response) => {
  // @ts-ignore - set by middleware
  const user = req.user;
  if (!user) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  res.json({ success: true, user });
});

export default router;
