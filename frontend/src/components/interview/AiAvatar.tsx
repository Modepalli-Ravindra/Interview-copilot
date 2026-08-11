import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

interface AiAvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  size?: number;
  accent?: string;
}

export default function AiAvatar({
  isSpeaking,
  isListening,
  size = 180,
  accent = 'hsl(174 85% 65%)',
}: AiAvatarProps) {
  const [amp, setAmp] = useState(0);

  useEffect(() => {
    if (!isSpeaking) {
      setAmp(0);
      return;
    }
    const interval = setInterval(() => {
      setAmp(Math.random());
    }, 120);
    return () => clearInterval(interval);
  }, [isSpeaking]);

  const active = isSpeaking || isListening;

  const glowAura = active
    ? `radial-gradient(circle, ${accent.replace('58%', '55%').replace('62%', '55%')} / 0.45, transparent 70%)`
    : 'radial-gradient(circle, hsl(215 15% 30% / 0.45), transparent 70%)';

  return (
    <div style={{ width: size, height: size, perspective: 900 }}>
      <motion.div
        animate={{
          y: active ? [0, -4, 0] : [0, -2, 0],
        }}
        transition={{ duration: active ? 3.6 : 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'relative', width: '100%', height: '100%',
          transformStyle: 'preserve-3d',
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}
      >
        {/* Outer aura */}
        <motion.div
          animate={{
            opacity: active ? [0.35, 0.7, 0.35] : 0.28,
            scale: active ? [1, 1.06 + amp * 0.15, 1] : 1,
          }}
          transition={{ duration: active ? 1.2 : 3, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: '-12%', borderRadius: '50%',
            background: glowAura,
            filter: 'blur(8px)',
          }}
        />

        {/* The 3D Avatar Image */}
        <motion.div
          animate={{
            scale: active ? 1 + (amp * 0.05) : 1,
            boxShadow: active
              ? `0 ${size * 0.03}px ${size * 0.08}px hsl(220 15% 3% / 0.6), 0 0 ${16 + amp * 20}px ${accent} / ${0.3 + amp * 0.2}`
              : `0 ${size * 0.03}px ${size * 0.08}px hsl(220 15% 3% / 0.6), 0 0 12px hsl(215 15% 35% / 0.3)`,
          }}
          transition={{ duration: 0.1 }}
          style={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            overflow: 'hidden',
            border: `2px solid ${active ? accent : 'hsl(215 15% 30%)'}`,
            zIndex: 2,
          }}
        >
          <img 
            src="/hr_agent_avatar.png" 
            alt="AI Interviewer" 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
          />
        </motion.div>
      </motion.div>
    </div>
  );
}
