import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Mic, Mail, Lock, User, Eye, EyeOff, ArrowLeft, Loader2 } from 'lucide-react';

type Mode = 'login' | 'register';

export default function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' });
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    // Simulate API call — replace with real auth endpoint
    await new Promise(r => setTimeout(r, 1200));
    setLoading(false);
    navigate('/dashboard');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px 12px 42px',
    background: 'hsl(215 15% 8%)',
    border: '1px solid hsl(215 15% 20%)',
    borderRadius: 10, color: 'hsl(210 10% 88%)',
    fontSize: 14, fontFamily: 'var(--font-sans)',
    outline: 'none', transition: 'border-color 0.2s',
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center',
      justifyContent: 'center', background: 'hsl(220 15% 5%)',
      padding: '24px', position: 'relative', overflow: 'hidden',
    }}>
      {/* Gradient orbs */}
      <div style={{
        position: 'absolute', top: '15%', left: '10%',
        width: 400, height: 400, borderRadius: '50%',
        background: 'radial-gradient(circle, hsl(176 40% 35% / 0.2) 0%, transparent 70%)',
        filter: 'blur(50px)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '10%', right: '10%',
        width: 350, height: 350, borderRadius: '50%',
        background: 'radial-gradient(circle, hsl(215 80% 45% / 0.15) 0%, transparent 70%)',
        filter: 'blur(50px)', pointerEvents: 'none',
      }} />

      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="glass"
        style={{
          width: '100%', maxWidth: 440,
          borderRadius: 20, padding: '40px 40px',
          position: 'relative', zIndex: 1,
        }}
      >
        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'hsl(210 10% 55%)', fontSize: 13,
            fontFamily: 'var(--font-sans)', marginBottom: 28,
            padding: 0, transition: 'color 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'hsl(174 85% 70%)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'hsl(210 10% 55%)')}
        >
          <ArrowLeft size={15} /> Back to Home
        </button>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 70%))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Mic size={20} color="hsl(220 15% 5%)" />
          </div>
          <span style={{ fontWeight: 700, fontSize: 18, color: 'hsl(210 10% 92%)', letterSpacing: '-0.02em' }}>
            InterviewPilot <span style={{ color: 'hsl(174 85% 70%)' }}>AI</span>
          </span>
        </div>

        {/* Mode toggle */}
        <div style={{
          display: 'flex', gap: 0,
          background: 'hsl(215 15% 8%)',
          borderRadius: 10, padding: 4, marginBottom: 28,
          border: '1px solid hsl(215 15% 18%)',
        }}>
          {(['login', 'register'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(''); }}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8,
                border: 'none', cursor: 'pointer',
                fontFamily: 'var(--font-sans)', fontSize: 14, fontWeight: 500,
                transition: 'all 0.2s',
                background: mode === m
                  ? 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 55%))'
                  : 'transparent',
                color: mode === m ? 'hsl(220 15% 5%)' : 'hsl(210 10% 55%)',
              }}
            >
              {m === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              {mode === 'register' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { key: 'firstName', placeholder: 'First name' },
                    { key: 'lastName',  placeholder: 'Last name'  },
                  ].map(({ key, placeholder }) => (
                    <div key={key} style={{ position: 'relative' }}>
                      <User size={16} color="hsl(210 10% 45%)" style={{
                        position: 'absolute', left: 14, top: '50%',
                        transform: 'translateY(-50%)',
                      }} />
                      <input
                        type="text"
                        placeholder={placeholder}
                        value={(form as any)[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        style={inputStyle}
                        onFocus={e => (e.target.style.borderColor = 'hsl(176 40% 45%)')}
                        onBlur={e => (e.target.style.borderColor = 'hsl(215 15% 20%)')}
                        required
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* Email */}
              <div style={{ position: 'relative' }}>
                <Mail size={16} color="hsl(210 10% 45%)" style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                }} />
                <input
                  type="email"
                  placeholder="Email address"
                  value={form.email}
                  onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = 'hsl(176 40% 45%)')}
                  onBlur={e => (e.target.style.borderColor = 'hsl(215 15% 20%)')}
                  required
                />
              </div>

              {/* Password */}
              <div style={{ position: 'relative' }}>
                <Lock size={16} color="hsl(210 10% 45%)" style={{
                  position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  style={{ ...inputStyle, paddingRight: 42 }}
                  onFocus={e => (e.target.style.borderColor = 'hsl(176 40% 45%)')}
                  onBlur={e => (e.target.style.borderColor = 'hsl(215 15% 20%)')}
                  required minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', padding: 2,
                  }}
                >
                  {showPassword
                    ? <EyeOff size={16} color="hsl(210 10% 45%)" />
                    : <Eye size={16} color="hsl(210 10% 45%)" />}
                </button>
              </div>

              {error && (
                <motion.p
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    fontSize: 13, color: 'hsl(0 85% 65%)',
                    background: 'hsl(0 85% 60% / 0.1)',
                    border: '1px solid hsl(0 85% 60% / 0.3)',
                    borderRadius: 8, padding: '8px 12px',
                  }}
                >
                  {error}
                </motion.p>
              )}

              <motion.button
                type="submit"
                disabled={loading}
                whileHover={{ scale: loading ? 1 : 1.02 }}
                whileTap={{ scale: loading ? 1 : 0.98 }}
                style={{
                  width: '100%', padding: '13px',
                  borderRadius: 10, border: 'none',
                  background: loading
                    ? 'hsl(176 40% 35%)'
                    : 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 55%))',
                  color: 'hsl(220 15% 5%)',
                  cursor: loading ? 'wait' : 'pointer',
                  fontSize: 15, fontWeight: 700,
                  fontFamily: 'var(--font-sans)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  marginTop: 4, transition: 'background 0.3s',
                  boxShadow: '0 4px 16px hsl(176 40% 45% / 0.35)',
                }}
              >
                {loading ? (
                  <><Loader2 size={17} style={{ animation: 'spin 0.8s linear infinite' }} /> Processing...</>
                ) : mode === 'login' ? 'Sign In to InterviewPilot' : 'Create My Account'}
              </motion.button>
            </motion.div>
          </AnimatePresence>
        </form>
      </motion.div>
    </div>
  );
}
