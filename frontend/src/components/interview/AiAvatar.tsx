import { motion } from 'framer-motion';

interface AiAvatarProps {
  isSpeaking: boolean;
  isListening: boolean;
  amplitudes: number[];
  size?: number;
}

export default function AiAvatar({
  isSpeaking,
  isListening,
  amplitudes,
  size = 150,
}: AiAvatarProps) {
  const active = isSpeaking || isListening;
  const amp = active && amplitudes.length > 0
    ? amplitudes.reduce((a, b) => a + b, 0) / amplitudes.length
    : 0;

  const accent = isListening ? 'hsl(142 70% 58%)' : 'hsl(174 85% 62%)';
  const accentStrong = isListening ? 'hsl(142 70% 75%)' : 'hsl(174 85% 80%)';
  const glowAura = active
    ? `radial-gradient(circle, ${accent.replace('58%', '55%').replace('62%', '55%')} / 0.45, transparent 70%)`
    : 'radial-gradient(circle, hsl(215 15% 30% / 0.45), transparent 70%)';

  const eyeGlow = active
    ? `0 0 ${8 + amp * 14}px ${accent} / 0.85`
    : `0 0 8px ${accent} / 0.55`;

  return (
    <div style={{ width: size, height: size, perspective: 900 }}>
      <motion.div
        animate={{
          rotateX: active ? [8, -5, 8] : [5, 0, 5],
          rotateY: active ? [-12, 12, -12] : [-7, 7, -7],
          y: active ? [0, -7, 0] : [0, -3, 0],
        }}
        transition={{ duration: active ? 3.6 : 6, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          position: 'relative', width: '100%', height: '100%',
          transformStyle: 'preserve-3d',
        }}
      >
        {/* ── Outer aura ─────────────────────────────── */}
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

        {/* ── Side panels (3D ears) ──────────────────── */}
        <motion.div
          animate={{ boxShadow: active ? `0 0 ${10 + amp * 18}px ${accent} / 0.4` : '0 0 6px hsl(215 15% 35% / 0.4)' }}
          transition={{ duration: 0.5 }}
          style={{
            position: 'absolute', top: '26%', left: '4%',
            width: size * 0.16, height: size * 0.5, borderRadius: 14,
            transform: 'rotateY(72deg)', transformOrigin: 'left center',
            background: 'linear-gradient(180deg, hsl(215 18% 26%), hsl(220 18% 12%))',
            border: '1px solid hsl(215 15% 28%)',
          }}
        />
        <motion.div
          animate={{ boxShadow: active ? `0 0 ${10 + amp * 18}px ${accent} / 0.4` : '0 0 6px hsl(215 15% 35% / 0.4)' }}
          transition={{ duration: 0.5 }}
          style={{
            position: 'absolute', top: '26%', right: '4%',
            width: size * 0.16, height: size * 0.5, borderRadius: 14,
            transform: 'rotateY(-72deg)', transformOrigin: 'right center',
            background: 'linear-gradient(180deg, hsl(215 18% 26%), hsl(220 18% 12%))',
            border: '1px solid hsl(215 15% 28%)',
          }}
        />

        {/* ── Antenna ────────────────────────────────── */}
        <div style={{
          position: 'absolute', top: '2%', left: '50%', width: 4, height: size * 0.13,
          transform: 'translateX(-50%) translateZ(6px)',
          background: 'linear-gradient(180deg, hsl(215 18% 30%), hsl(220 18% 12%))',
          borderRadius: 4,
        }}>
          <motion.div
            animate={{
              opacity: active ? [0.6, 1, 0.6] : 0.8,
              boxShadow: active ? `0 0 ${6 + amp * 12}px ${accent} / 0.9` : '0 0 5px hsl(215 15% 45% / 0.6)',
            }}
            transition={{ duration: active ? 0.9 : 2.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              position: 'absolute', top: -3, left: -1.5,
              width: 7, height: 7, borderRadius: '50%',
              background: accentStrong,
            }}
          />
        </div>

        {/* ── Head shell ─────────────────────────────── */}
        <motion.div
          animate={{
            scale: [1, active ? 1.03 : 1, 1],
            boxShadow: active
              ? `0 ${size * 0.03}px ${size * 0.08}px hsl(220 15% 3% / 0.6), 0 0 ${26 + amp * 34}px ${accent} / ${0.28 + amp * 0.25}`
              : `0 ${size * 0.03}px ${size * 0.08}px hsl(220 15% 3% / 0.6), 0 0 18px hsl(215 15% 35% / 0.3)`,
          }}
          transition={{ duration: active ? 0.6 : 2, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', inset: '7% 9% 3% 9%',
            borderRadius: '44% 44% 48% 48% / 56% 56% 42% 42%',
            transformStyle: 'preserve-3d',
            background:
              'radial-gradient(circle at 32% 22%, hsl(215 16% 34%) 0%, hsl(215 18% 22%) 38%, hsl(220 20% 12%) 70%, hsl(220 20% 7%) 100%)',
            border: '1px solid hsl(215 15% 30%)',
          }}
        >
          {/* Specular sheen */}
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 'inherit',
            background:
              'radial-gradient(circle at 30% 18%, hsl(215 20% 60% / 0.35), transparent 42%)',
            transform: 'translateZ(2px)',
          }} />

          {/* Face plate (screen) */}
          <div style={{
            position: 'absolute', inset: '20% 14% 22% 14%',
            borderRadius: '42% 42% 46% 46% / 52% 52% 48% 48%',
            transform: 'translateZ(10px)',
            background:
              'radial-gradient(circle at 50% 34%, hsl(220 20% 13%), hsl(220 18% 7%) 75%)',
            border: '1px solid hsl(215 15% 24%)',
            boxShadow:
              'inset 0 3px 10px hsl(220 15% 3% / 0.85), 0 0 12px hsl(215 15% 40% / 0.25)',
          }}>
            {/* Eyes */}
            <div style={{
              position: 'absolute', top: '30%', left: 0, right: 0,
              display: 'flex', justifyContent: 'space-around', padding: '0 18%',
            }}>
              {[0, 1].map(i => (
                <motion.div
                  key={i}
                  animate={{
                    scaleY: isSpeaking ? 0.32 : 1,
                    scaleX: isSpeaking ? 1.15 : 1,
                    boxShadow: eyeGlow,
                  }}
                  transition={{ duration: 0.16 }}
                  style={{
                    width: size * 0.085, height: size * 0.12, borderRadius: '50%',
                    background: accentStrong,
                    transform: `translateZ(${8 + amp * 6}px)`,
                  }}
                />
              ))}
            </div>

            {/* Mouth — LED grill reacts to speech */}
            <div style={{
              position: 'absolute', bottom: '16%', left: 0, right: 0,
              display: 'flex', justifyContent: 'center',
            }}>
              <motion.div
                animate={{
                  width: isSpeaking
                    ? size * (0.24 + amp * 0.2)
                    : size * 0.18,
                  opacity: isSpeaking ? 0.95 : 0.55,
                }}
                transition={{ duration: 0.09 }}
                style={{
                  height: size * 0.035, borderRadius: 999,
                  background: `linear-gradient(90deg, ${accent}33, ${accent}, ${accent}33)`,
                  boxShadow: isSpeaking
                    ? `0 0 ${8 + amp * 14}px ${accent} / 0.9`
                    : `0 0 6px ${accent} / 0.5`,
                  transform: 'translateZ(12px)',
                }}
              />
            </div>

            {/* Cheek glow when active */}
            {active && (
              <motion.div
                animate={{ opacity: [0.25, 0.55, 0.25] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 'inherit',
                  background: `radial-gradient(circle at 50% 42%, ${accent} / 0.18, transparent 65%)`,
                }}
              />
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
