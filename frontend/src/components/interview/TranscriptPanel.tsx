import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInterviewStore } from '../../stores/interviewStore';
import type { TranscriptEntry } from '../../types';
import { Bot, User, Loader2, GraduationCap, Download } from 'lucide-react';

interface TranscriptPanelProps {
  isThinking: boolean;
}

const senderConfig = {
  interviewer: {
    label: 'AI Interviewer',
    icon: Bot,
    iconBg: 'hsl(176 40% 45% / 0.2)',
    iconColor: 'hsl(174 85% 70%)',
    bubbleBg: 'hsl(215 15% 11%)',
    bubbleBorder: 'hsl(215 15% 17%)',
    textColor: 'hsl(210 10% 85%)',
  },
  candidate: {
    label: 'You',
    icon: User,
    iconBg: 'hsl(215 80% 50% / 0.2)',
    iconColor: 'hsl(215 80% 70%)',
    bubbleBg: 'hsl(176 40% 45% / 0.08)',
    bubbleBorder: 'hsl(176 40% 45% / 0.25)',
    textColor: 'hsl(210 10% 90%)',
  },
  system: {
    label: 'System',
    icon: Bot,
    iconBg: 'hsl(35 90% 55% / 0.15)',
    iconColor: 'hsl(35 90% 65%)',
    bubbleBg: 'hsl(35 90% 55% / 0.06)',
    bubbleBorder: 'hsl(35 90% 55% / 0.2)',
    textColor: 'hsl(35 90% 70%)',
  },
  teaching: {
    label: 'AI Coach',
    icon: GraduationCap,
    iconBg: 'hsl(280 70% 60% / 0.18)',
    iconColor: 'hsl(280 80% 75%)',
    bubbleBg: 'hsl(280 70% 60% / 0.07)',
    bubbleBorder: 'hsl(280 70% 60% / 0.28)',
    textColor: 'hsl(278 60% 88%)',
  },
};

function formatTime(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatTimestamp(d: Date) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function downloadTranscript(entries: TranscriptEntry[]): void {
  const lines = entries.map((e) => {
    const speaker = senderConfig[e.sender]?.label || 'System';
    const time = formatTimestamp(new Date(e.timestamp));
    return `[${time}] ${speaker}: ${e.text}`;
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `interview-transcript-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function TranscriptPanel({ isThinking }: TranscriptPanelProps) {
  const { transcript } = useInterviewStore();
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, isThinking]);

  return (
    <div style={{
      flex: 1, overflowY: 'auto',
      display: 'flex', flexDirection: 'column',
      gap: 16, padding: '20px 20px 12px',
    }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'hsl(210 10% 42%)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
          Live transcript
        </span>
        {transcript.length > 0 && (
          <button
            onClick={() => downloadTranscript(transcript)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
              background: 'hsl(215 15% 11%)',
              border: '1px solid hsl(215 15% 18%)',
              color: 'hsl(210 10% 60%)', fontSize: 12, fontWeight: 500,
              fontFamily: 'var(--font-sans)',
              transition: 'color 0.18s, border-color 0.18s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'hsl(174 85% 70%)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(176 40% 45% / 0.4)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.color = 'hsl(210 10% 60%)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'hsl(215 15% 18%)';
            }}
          >
            <Download size={13} /> Download
          </button>
        )}
      </div>

      {transcript.length === 0 && !isThinking && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 12, color: 'hsl(210 10% 40%)',
          }}
        >
          <Bot size={40} strokeWidth={1.2} color="hsl(215 15% 25%)" />
          <p style={{ fontSize: 14, textAlign: 'center', maxWidth: 260, lineHeight: 1.6 }}>
            Your interview transcript will appear here. Connect your mic to start.
          </p>
        </motion.div>
      )}

      <AnimatePresence initial={false}>
        {transcript.map((entry) => {
          const cfg = senderConfig[entry.sender] || senderConfig.system;
          const Icon = cfg.icon;
          return (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 280, damping: 24 }}
              style={{
                display: 'flex', gap: 12,
                flexDirection: entry.sender === 'candidate' ? 'row-reverse' : 'row',
              }}
            >
              {/* Avatar */}
              <div style={{
                width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                background: cfg.iconBg,
                border: `1px solid ${cfg.iconBg}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginTop: 2,
              }}>
                <Icon size={15} color={cfg.iconColor} />
              </div>

              {/* Bubble */}
              <div style={{
                maxWidth: '78%',
                display: 'flex', flexDirection: 'column',
                alignItems: entry.sender === 'candidate' ? 'flex-end' : 'flex-start',
                gap: 4,
              }}>
                <span style={{ fontSize: 11, color: 'hsl(210 10% 42%)', fontWeight: 500 }}>
                  {cfg.label} · {formatTime(new Date(entry.timestamp))}
                </span>
                <div style={{
                  padding: '10px 14px', borderRadius: 14,
                  background: cfg.bubbleBg,
                  border: `1px solid ${cfg.bubbleBorder}`,
                  fontSize: 14, color: cfg.textColor,
                  lineHeight: 1.65,
                  borderTopLeftRadius: entry.sender === 'candidate' ? 14 : 4,
                  borderTopRightRadius: entry.sender === 'candidate' ? 4 : 14,
                }}>
                  {entry.text}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Thinking indicator */}
      <AnimatePresence>
        {isThinking && (
          <motion.div
            key="thinking"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            style={{ display: 'flex', gap: 12, alignItems: 'center' }}
          >
            <div style={{
              width: 32, height: 32, borderRadius: 10,
              background: 'hsl(176 40% 45% / 0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Bot size={15} color="hsl(174 85% 70%)" />
            </div>
            <div style={{
              padding: '10px 14px', borderRadius: 14, borderTopLeftRadius: 4,
              background: 'hsl(215 15% 11%)',
              border: '1px solid hsl(215 15% 17%)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Loader2 size={14} color="hsl(174 85% 65%)"
                style={{ animation: 'spin 0.9s linear infinite' }} />
              <span style={{ fontSize: 13, color: 'hsl(210 10% 55%)', fontStyle: 'italic' }}>
                AI is thinking…
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div ref={bottomRef} />
    </div>
  );
}
