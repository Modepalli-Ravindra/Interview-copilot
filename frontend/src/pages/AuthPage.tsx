import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import { Bot, Mail, Lock, User, ArrowRight } from 'lucide-react';
import { motion } from 'framer-motion';

export default function AuthPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login, user } = useAuth();
  const navigate = useNavigate();

  // If already logged in, redirect to dashboard
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  const validatePassword = (pwd: string) => {
    if (pwd.length < 8) return "Password must be at least 8 characters long";
    if (!/[a-zA-Z]/.test(pwd)) return "Password must contain at least one letter";
    if (!/[!@#$%^&*(),.?":{}|<>\-_]/.test(pwd)) return "Password must contain at least one special character";
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (!isLogin) {
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        setLoading(false);
        return;
      }
      const pwdError = validatePassword(password);
      if (pwdError) {
        setError(pwdError);
        setLoading(false);
        return;
      }
    }

    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const body = isLogin ? { email, password } : { email, password, name };
      
      const res = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || 'Authentication failed');
      }

      login(data.token, data.user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'radial-gradient(circle at top right, hsl(215 20% 12%), hsl(220 20% 4%))',
      fontFamily: 'var(--font-sans)',
      color: 'white',
      padding: 24,
    }}>
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          width: '100%', maxWidth: 440,
          background: 'hsl(215 15% 8%)',
          borderRadius: 24,
          border: '1px solid hsl(215 15% 15%)',
          padding: 40,
          boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 32 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'linear-gradient(135deg, hsl(174 85% 65%), hsl(142 70% 50%))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
            boxShadow: '0 4px 12px hsl(174 85% 65% / 0.3)'
          }}>
            <Bot size={24} color="black" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 8px 0' }}>
            {isLogin ? 'Welcome back' : 'Create an account'}
          </h1>
          <p style={{ color: 'hsl(210 10% 60%)', fontSize: 14, margin: 0 }}>
            {isLogin ? 'Sign in to continue to InterviewPilot' : 'Get started with AI-powered mock interviews'}
          </p>
        </div>

        {error && (
          <div style={{
            background: 'hsl(0 70% 50% / 0.1)',
            border: '1px solid hsl(0 70% 50% / 0.2)',
            color: 'hsl(0 100% 75%)',
            padding: 12, borderRadius: 8,
            fontSize: 14, marginBottom: 20,
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {!isLogin && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'hsl(210 10% 70%)', marginBottom: 6 }}>
                Full Name
              </label>
              <div style={{ position: 'relative' }}>
                <User size={18} color="hsl(210 10% 40%)" style={{ position: 'absolute', left: 12, top: 11 }} />
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="John Doe"
                  style={{
                    width: '100%', padding: '10px 12px 10px 40px',
                    background: 'hsl(215 15% 5%)',
                    border: '1px solid hsl(215 15% 18%)',
                    borderRadius: 8, color: 'white',
                    fontSize: 15, outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.target.style.borderColor = 'hsl(174 85% 65%)'}
                  onBlur={e => e.target.style.borderColor = 'hsl(215 15% 18%)'}
                />
              </div>
            </div>
          )}

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'hsl(210 10% 70%)', marginBottom: 6 }}>
              Email Address
            </label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} color="hsl(210 10% 40%)" style={{ position: 'absolute', left: 12, top: 11 }} />
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={{
                  width: '100%', padding: '10px 12px 10px 40px',
                  background: 'hsl(215 15% 5%)',
                  border: '1px solid hsl(215 15% 18%)',
                  borderRadius: 8, color: 'white',
                  fontSize: 15, outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={e => e.target.style.borderColor = 'hsl(174 85% 65%)'}
                onBlur={e => e.target.style.borderColor = 'hsl(215 15% 18%)'}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'hsl(210 10% 70%)', marginBottom: 6 }}>
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} color="hsl(210 10% 40%)" style={{ position: 'absolute', left: 12, top: 11 }} />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '10px 12px 10px 40px',
                  background: 'hsl(215 15% 5%)',
                  border: '1px solid hsl(215 15% 18%)',
                  borderRadius: 8, color: 'white',
                  fontSize: 15, outline: 'none',
                  transition: 'border-color 0.2s'
                }}
                onFocus={e => e.target.style.borderColor = 'hsl(174 85% 65%)'}
                onBlur={e => e.target.style.borderColor = 'hsl(215 15% 18%)'}
              />
            </div>
          </div>

          {!isLogin && (
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'hsl(210 10% 70%)', marginBottom: 6 }}>
                Confirm Password
              </label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} color="hsl(210 10% 40%)" style={{ position: 'absolute', left: 12, top: 11 }} />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{
                    width: '100%', padding: '10px 12px 10px 40px',
                    background: 'hsl(215 15% 5%)',
                    border: '1px solid hsl(215 15% 18%)',
                    borderRadius: 8, color: 'white',
                    fontSize: 15, outline: 'none',
                    transition: 'border-color 0.2s'
                  }}
                  onFocus={e => e.target.style.borderColor = 'hsl(174 85% 65%)'}
                  onBlur={e => e.target.style.borderColor = 'hsl(215 15% 18%)'}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 8,
              width: '100%', padding: '12px',
              background: 'hsl(174 85% 65%)',
              color: 'hsl(220 20% 5%)',
              border: 'none', borderRadius: 8,
              fontSize: 15, fontWeight: 600,
              cursor: loading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              opacity: loading ? 0.7 : 1,
              transition: 'opacity 0.2s'
            }}
          >
            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Create Account')}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>

        <div style={{ marginTop: 24, textAlign: 'center', fontSize: 14, color: 'hsl(210 10% 60%)' }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
            }}
            style={{
              background: 'none', border: 'none',
              color: 'hsl(174 85% 65%)', fontWeight: 500,
              cursor: 'pointer', padding: 0
            }}
          >
            {isLogin ? 'Sign up' : 'Log in'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
