import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  User, Mail, Save, Volume2, Bell, Shield, LogOut,
  ChevronDown, Sparkles, Trash2, MonitorSpeaker, Mic, Check,
} from 'lucide-react';
import { useIsMobile } from '../lib/useMediaQuery';

import { useAuth } from '../contexts/AuthContext';

const fadePage = {
  initial:  { opacity: 0 },
  animate:  { opacity: 1 },
  transition: { duration: 0.35 },
};

function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      style={{
        width: 40, height: 22, borderRadius: 999, cursor: 'pointer', border: 'none',
        position: 'relative', flexShrink: 0,
        background: on ? 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))' : 'hsl(215 15% 18%)',
        transition: 'background 0.25s',
      }}
    >
      <motion.div
        animate={{ x: on ? 18 : 2 }}
        transition={{ type: 'spring', stiffness: 400, damping: 26 }}
        style={{
          width: 18, height: 18, borderRadius: '50%',
          background: 'white', position: 'absolute', top: 2,
        }}
      />
    </button>
  );
}

function SelectField({ value, options, onChange }: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
          background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)',
          border: '1px solid hsl(215 15% 18%)', outline: 'none',
          fontSize: 13, fontFamily: 'var(--font-sans)',
        }}
      >
        {value} <ChevronDown size={14} color="hsl(210 10% 50%)" />
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
            background: 'hsl(215 15% 10%)', border: '1px solid hsl(215 15% 18%)',
            borderRadius: 10, overflow: 'hidden', zIndex: 30,
            boxShadow: '0 8px 24px hsl(220 15% 3% / 0.7)',
          }}
        >
          {options.map(opt => (
            <button
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                padding: '9px 12px', textAlign: 'left', border: 'none', cursor: 'pointer',
                background: value === opt ? 'hsl(176 40% 45% / 0.15)' : 'transparent',
                color: value === opt ? 'hsl(174 85% 70%)' : 'hsl(210 10% 65%)',
                fontSize: 13, fontFamily: 'var(--font-sans)',
              }}
            >
              {value === opt && <Check size={13} />}
              {opt}
            </button>
          ))}
        </motion.div>
      )}
    </div>
  );
}

function SettingRow({ icon, iconBg, title, desc, children }: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 0',
      borderBottom: '1px solid hsl(215 15% 14%)',
    }}>
      <div style={{
        width: 38, height: 38, borderRadius: 10, flexShrink: 0,
        background: iconBg,
        border: `1px solid ${iconBg}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 600, color: 'hsl(210 10% 84%)' }}>{title}</p>
        <p style={{ fontSize: 12, color: 'hsl(210 10% 48%)', marginTop: 2 }}>{desc}</p>
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user, logout } = useAuth();
  
  const nameParts = (user?.name || '').split(' ');
  const defaultFirstName = nameParts[0] || '';
  const defaultLastName = nameParts.slice(1).join(' ') || '';

  const [profile, setProfile] = useState({ 
    firstName: defaultFirstName, 
    lastName: defaultLastName, 
    email: user?.email || '' 
  });
  
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user?.id) {
      const savedAvatar = localStorage.getItem(`interviewpilot_avatar_${user.id}`);
      if (savedAvatar) setAvatarUrl(savedAvatar);
    }
  }, [user?.id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && user?.id) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setAvatarUrl(dataUrl);
        localStorage.setItem(`interviewpilot_avatar_${user.id}`, dataUrl);
      };
      reader.readAsDataURL(file);
    }
  };
  
  const [prefs, setPrefs] = useState({ role: 'Senior Backend Engineer', company: 'Stripe', difficulty: 'Senior' });
  const [voice, setVoice] = useState('Athena (Natural)');
  const [speed, setSpeed] = useState(1.0);
  const [toggles, setToggles] = useState({
    aiVoice: true, subtitles: true, emailDigest: true,
    streakAlerts: false, shareReports: false,
  });
  const [saved, setSaved] = useState(false);

  const toggle = (key: keyof typeof toggles) =>
    setToggles(t => ({ ...t, [key]: !t[key] }));

  const save = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2400);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', borderRadius: 10,
    background: 'hsl(215 15% 8%)', color: 'hsl(210 10% 85%)',
    border: '1px solid hsl(215 15% 18%)', outline: 'none',
    fontSize: 13, fontFamily: 'var(--font-sans)',
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 15, fontWeight: 600, color: 'hsl(210 10% 88%)',
  };

  return (
    <motion.div {...fadePage} style={{ minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'flex-start', marginBottom: 24,
        flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? 21 : 26, fontWeight: 700, color: 'hsl(210 10% 92%)',
            letterSpacing: '-0.02em', marginBottom: 4,
          }}>
            Settings
          </h1>
          <p style={{ fontSize: 14, color: 'hsl(210 10% 50%)' }}>
            Manage your profile, interview preferences, and audio behavior.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={save}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '11px 22px', borderRadius: 10,
            background: saved
              ? 'hsl(142 70% 45%)'
              : 'linear-gradient(135deg, hsl(176 40% 45%), hsl(174 85% 60%))',
            border: 'none', color: 'hsl(220 15% 5%)', cursor: 'pointer',
            fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-sans)',
            boxShadow: saved ? 'none' : '0 4px 16px hsl(176 40% 45% / 0.35)',
          }}
        >
          {saved ? <Check size={16} /> : <Save size={16} />}
          {saved ? 'Saved!' : 'Save Changes'}
        </motion.button>
      </div>

      {/* ── Two-column settings layout ──────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) minmax(0, 1.2fr)',
        gap: 20, alignItems: 'start',
      }}>

        {/* ── Left column ───────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {/* Profile */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="glass"
            style={{ borderRadius: 16, padding: isMobile ? '18px' : '24px' }}
          >
            <h2 style={{ ...sectionTitle, marginBottom: 20 }}>
              Profile
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 24 }}>
              <div style={{
                width: 64, height: 64, borderRadius: '50%', flexShrink: 0,
                background: 'linear-gradient(135deg, hsl(176 40% 40%), hsl(215 80% 50%))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700, color: 'white',
                overflow: 'hidden',
              }}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  profile.firstName.charAt(0).toUpperCase() || 'U'
                )}
              </div>
              <div>
                <p style={{ fontSize: 15, fontWeight: 600, color: 'hsl(210 10% 90%)' }}>
                  {profile.firstName} {profile.lastName}
                </p>
                <p style={{ fontSize: 12.5, color: 'hsl(210 10% 50%)' }}>Candidate · Member since Jan 2026</p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    marginTop: 8, padding: '6px 12px', borderRadius: 8, cursor: 'pointer',
                    background: 'hsl(215 15% 11%)', color: 'hsl(174 85% 70%)',
                    border: '1px solid hsl(174 85% 60% / 0.3)',
                    fontSize: 12, fontWeight: 500, fontFamily: 'var(--font-sans)',
                  }}>
                  Change Photo
                </button>
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  style={{ display: 'none' }}
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <User size={12} /> First Name
                </label>
                <input
                  value={profile.firstName}
                  onChange={e => setProfile(p => ({ ...p, firstName: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <User size={12} /> Last Name
                </label>
                <input
                  value={profile.lastName}
                  onChange={e => setProfile(p => ({ ...p, lastName: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Mail size={12} /> Email Address
                </label>
                <input
                  type="email"
                  value={profile.email}
                  onChange={e => setProfile(p => ({ ...p, email: e.target.value }))}
                  style={inputStyle}
                />
              </div>
            </div>
          </motion.div>

          {/* Account */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            style={{
              borderRadius: 16, padding: isMobile ? '18px' : '24px',
              background: 'hsl(0 85% 60% / 0.04)',
              border: '1px solid hsl(0 85% 60% / 0.2)',
            }}
          >
            <h2 style={{ fontSize: 15, fontWeight: 600, color: 'hsl(0 85% 70%)', marginBottom: 8 }}>
              Account
            </h2>
            <p style={{ fontSize: 12.5, color: 'hsl(210 10% 55%)', marginBottom: 16 }}>
              Sign out of this device or permanently delete your account and data.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                onClick={() => navigate('/')}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
                  background: 'hsl(215 15% 11%)', color: 'hsl(210 10% 75%)',
                  border: '1px solid hsl(215 15% 20%)',
                  fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}
              >
                <LogOut size={15} /> Sign Out
              </button>
              <button
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 20px', borderRadius: 10, cursor: 'pointer',
                  background: 'hsl(0 85% 60% / 0.1)', color: 'hsl(0 85% 70%)',
                  border: '1px solid hsl(0 85% 60% / 0.3)',
                  fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-sans)',
                }}
              >
                <Trash2 size={15} /> Delete Account
              </button>
            </div>
          </motion.div>
        </div>

        {/* ── Right column ──────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, minWidth: 0 }}>

          {/* Interview Preferences */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass"
            style={{ borderRadius: 16, padding: isMobile ? '18px' : '24px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <Sparkles size={15} color="hsl(174 85% 65%)" />
              <h2 style={sectionTitle}>
                Interview Preferences
              </h2>
            </div>
            <p style={{ fontSize: 12.5, color: 'hsl(210 10% 50%)', marginBottom: 20 }}>
              Defaults used when starting a new interview.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600 }}>Target Role</label>
                <input
                  value={prefs.role}
                  onChange={e => setPrefs(p => ({ ...p, role: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600 }}>Company</label>
                <input
                  value={prefs.company}
                  onChange={e => setPrefs(p => ({ ...p, company: e.target.value }))}
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 12, color: 'hsl(210 10% 45%)', fontWeight: 600 }}>Difficulty</label>
                <SelectField
                  value={prefs.difficulty}
                  options={['Junior', 'Mid-level', 'Senior', 'Staff+']}
                  onChange={v => setPrefs(p => ({ ...p, difficulty: v }))}
                />
              </div>
            </div>
          </motion.div>

          {/* Voice & Audio */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="glass"
            style={{ borderRadius: 16, padding: isMobile ? '18px 18px 8px' : '24px 24px 8px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Volume2 size={15} color="hsl(174 85% 65%)" />
              <h2 style={sectionTitle}>
                Voice & Audio
              </h2>
            </div>

            <SettingRow
              icon={<MonitorSpeaker size={17} color="hsl(174 85% 65%)" />}
              iconBg="hsl(174 85% 60% / 0.12)"
              title="AI Voice"
              desc="Voice used by the interviewer"
            >
              <div style={{ width: isMobile ? 140 : 170 }}>
                <SelectField
                  value={voice}
                  options={['Athena (Natural)', 'Nova (Fast)', 'Echo (Deep)', 'Sage (Warm)']}
                  onChange={setVoice}
                />
              </div>
            </SettingRow>

            <div style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
              borderBottom: '1px solid hsl(215 15% 14%)',
            }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: 'hsl(35 90% 55% / 0.12)',
                border: '1px solid hsl(35 90% 55% / 0.12)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Volume2 size={17} color="hsl(35 90% 65%)" />
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: 13.5, fontWeight: 600, color: 'hsl(210 10% 84%)' }}>Speaking Rate</p>
                <p style={{ fontSize: 12, color: 'hsl(210 10% 48%)', marginTop: 2 }}>{speed.toFixed(1)}×</p>
              </div>
              <input
                type="range"
                min={0.5} max={1.5} step={0.1}
                value={speed}
                onChange={e => setSpeed(parseFloat(e.target.value))}
                style={{ width: isMobile ? '40%' : 150, accentColor: 'hsl(176 40% 45%)', minWidth: 90, flexShrink: 1 }}
              />
            </div>

            <SettingRow
              icon={<Mic size={17} color="hsl(174 85% 65%)" />}
              iconBg="hsl(174 85% 60% / 0.12)"
              title="AI Voice Playback"
              desc="Hear the interviewer speak out loud"
            >
              <Toggle on={toggles.aiVoice} onToggle={() => toggle('aiVoice')} />
            </SettingRow>

            <SettingRow
              icon={<Volume2 size={17} color="hsl(174 85% 65%)" />}
              iconBg="hsl(174 85% 60% / 0.12)"
              title="Live Subtitles"
              desc="Show captions while the AI speaks"
            >
              <Toggle on={toggles.subtitles} onToggle={() => toggle('subtitles')} />
            </SettingRow>
          </motion.div>

          {/* Notifications */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass"
            style={{ borderRadius: 16, padding: isMobile ? '18px 18px 8px' : '24px 24px 8px' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Bell size={15} color="hsl(174 85% 65%)" />
              <h2 style={sectionTitle}>
                Notifications
              </h2>
            </div>

            <SettingRow
              icon={<Bell size={17} color="hsl(215 80% 65%)" />}
              iconBg="hsl(215 80% 60% / 0.12)"
              title="Weekly Progress Digest"
              desc="Summary of your scores and roadmap progress every Monday"
            >
              <Toggle on={toggles.emailDigest} onToggle={() => toggle('emailDigest')} />
            </SettingRow>

            <SettingRow
              icon={<Shield size={17} color="hsl(215 80% 65%)" />}
              iconBg="hsl(215 80% 60% / 0.12)"
              title="Streak Alerts"
              desc="Ping me when my practice streak is at risk"
            >
              <Toggle on={toggles.streakAlerts} onToggle={() => toggle('streakAlerts')} />
            </SettingRow>

            <SettingRow
              icon={<Sparkles size={17} color="hsl(215 80% 65%)" />}
              iconBg="hsl(215 80% 60% / 0.12)"
              title="Share Reports"
              desc="Send completed feedback reports to my email"
            >
              <Toggle on={toggles.shareReports} onToggle={() => toggle('shareReports')} />
            </SettingRow>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
