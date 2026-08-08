import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useInterviewStore } from '../../stores/interviewStore';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { Mic, MicOff, Volume2, VolumeX, Zap, PhoneOff, AlertTriangle } from 'lucide-react';

interface VoiceWidgetProps {
  onBargeIn: () => void;
  onEndSession: () => void;
  onAnswer: (text: string) => void;
}

export default function VoiceWidget({ onBargeIn, onEndSession, onAnswer }: VoiceWidgetProps) {
  const {
    isPlayingAudio, isConnected, speechEnabled,
    audioAmplitudes, setRecording, setSpeechEnabled,
  } = useInterviewStore();

  const { isListening, interimTranscript, error, supported, start, stop } = useSpeechRecognition({
    onFinalResult: onAnswer,
  });

  // Keep the store in sync so the waveform and avatar react while listening
  useEffect(() => {
    setRecording(isListening);
  }, [isListening, setRecording]);

  const handleMicToggle = () => {
    if (isListening) stop();
    else start();
  };

  const statusLabel = () => {
    if (!isConnected)   return { text: 'Not Connected',   color: 'hsl(0 85% 60%)'  };
    if (isPlayingAudio) return { text: 'AI Speaking…',    color: 'hsl(35 90% 55%)' };
    if (isListening)    return { text: 'Listening…',      color: 'hsl(142 70% 50%)' };
    return              { text: 'Ready',                 color: 'hsl(210 10% 55%)' };
  };

  const { text: statusText, color: statusColor } = statusLabel();

  return (
    <div style={{
      background: 'hsl(215 15% 8%)',
      border: '1px solid hsl(215 15% 15%)',
      borderRadius: 20, padding: '24px 20px',
      display: 'flex', flexDirection: 'column', gap: 20,
    }}>
      {/* Status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <motion.span
          animate={{ opacity: [1, 0.3, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: statusColor, flexShrink: 0,
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: statusColor, letterSpacing: '0.04em' }}>
          {statusText}
        </span>
      </div>

      {/* Waveform visualizer */}
      <div style={{
        height: 72, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        gap: 4, padding: '0 8px',
      }}>
        {audioAmplitudes.map((amp, i) => (
          <motion.div
            key={i}
            animate={{
              scaleY: isPlayingAudio || isListening ? amp + 0.15 : 0.08,
              opacity: isPlayingAudio || isListening ? 0.8 + amp * 0.2 : 0.25,
            }}
            transition={{
              type: 'spring', stiffness: 280, damping: 18,
              delay: i * 0.018,
            }}
            style={{
              width: 4, borderRadius: 4, transformOrigin: 'center',
              height: 52,
              background: isPlayingAudio
                ? 'linear-gradient(to top, hsl(35 90% 55%), hsl(174 85% 70%))'
                : isListening
                  ? 'linear-gradient(to top, hsl(142 70% 40%), hsl(174 85% 70%))'
                  : 'hsl(215 15% 25%)',
            }}
          />
        ))}
      </div>

      {/* Live transcription while listening */}
      <AnimatePresence mode="wait">
        {isListening ? (
          <motion.div
            key="live"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              minHeight: 56, maxHeight: 88, overflowY: 'auto',
              borderRadius: 10,
              background: 'hsl(215 15% 10%)',
              border: '1px solid hsl(142 70% 50% / 0.3)',
              padding: '10px 12px',
              fontSize: 13, lineHeight: 1.55,
              color: interimTranscript ? 'hsl(210 10% 82%)' : 'hsl(210 10% 45%)',
              fontStyle: interimTranscript ? 'normal' : 'italic',
            }}>
              {interimTranscript || 'Speak your answer now…'}
            </div>
          </motion.div>
        ) : error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              borderRadius: 10,
              background: 'hsl(0 85% 60% / 0.1)',
              border: '1px solid hsl(0 85% 60% / 0.25)',
              padding: '10px 12px',
              fontSize: 12, lineHeight: 1.5,
              color: 'hsl(0 85% 70%)',
            }}
          >
            <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>{error}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {!supported && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: 8,
          borderRadius: 10,
          background: 'hsl(35 90% 55% / 0.1)',
          border: '1px solid hsl(35 90% 55% / 0.25)',
          padding: '10px 12px',
          fontSize: 12, lineHeight: 1.5,
          color: 'hsl(35 90% 65%)',
        }}>
          <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Voice input needs a browser with speech recognition (Chrome, Edge, Safari).</span>
        </div>
      )}

      {/* Controls row */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {/* Mic toggle */}
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={handleMicToggle}
          disabled={!supported}
          style={{
            width: '100%', padding: '12px',
            borderRadius: 12,
            cursor: supported ? 'pointer' : 'not-allowed',
            fontSize: 14, fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: isListening
              ? 'linear-gradient(135deg, hsl(142 70% 38%), hsl(142 70% 50%))'
              : supported ? 'hsl(215 15% 14%)' : 'hsl(215 15% 10%)',
            color: isListening ? 'white' : supported ? 'hsl(210 10% 65%)' : 'hsl(210 10% 35%)',
            border: isListening ? 'none' : '1px solid hsl(215 15% 22%)',
            opacity: supported ? 1 : 0.6,
            transition: 'background 0.25s, color 0.25s',
            boxShadow: isListening ? '0 4px 16px hsl(142 70% 38% / 0.4)' : 'none',
          }}
        >
          {isListening ? <Mic size={16} /> : <MicOff size={16} />}
          {isListening ? 'Listening — speak now' : 'Press & Answer with Voice'}
        </motion.button>

        {/* Barge-in button — only shown during AI speech */}
        <AnimatePresence>
          {isPlayingAudio && (
            <motion.button
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.2 }}
              whileTap={{ scale: 0.96 }}
              onClick={onBargeIn}
              style={{
                width: '100%', padding: '11px',
                borderRadius: 12, border: '1px solid hsl(35 90% 55% / 0.5)',
                cursor: 'pointer', fontSize: 14, fontWeight: 600,
                fontFamily: 'var(--font-sans)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                background: 'hsl(35 90% 55% / 0.12)',
                color: 'hsl(35 90% 70%)',
              }}
            >
              <Zap size={16} /> Interrupt AI
            </motion.button>
          )}
        </AnimatePresence>

        {/* TTS toggle */}
        <button
          onClick={() => setSpeechEnabled(!speechEnabled)}
          style={{
            width: '100%', padding: '10px',
            borderRadius: 12, border: '1px solid hsl(215 15% 18%)',
            cursor: 'pointer', fontSize: 13, fontWeight: 500,
            fontFamily: 'var(--font-sans)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'transparent',
            color: speechEnabled ? 'hsl(174 85% 65%)' : 'hsl(210 10% 55%)',
            transition: 'all 0.2s',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'hsl(215 15% 12%)';
            (e.currentTarget as HTMLButtonElement).style.color = 'hsl(210 10% 75%)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.color = speechEnabled ? 'hsl(174 85% 65%)' : 'hsl(210 10% 55%)';
          }}
        >
          {speechEnabled ? <Volume2 size={15} /> : <VolumeX size={15} />}
          {speechEnabled ? 'Agent Voice On' : 'Agent Voice Off'}
        </button>

        {/* End session */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onEndSession}
          style={{
            width: '100%', padding: '10px',
            borderRadius: 12,
            border: '1px solid hsl(0 85% 60% / 0.35)',
            cursor: 'pointer', fontSize: 13, fontWeight: 600,
            fontFamily: 'var(--font-sans)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            background: 'hsl(0 85% 60% / 0.1)',
            color: 'hsl(0 85% 70%)',
            transition: 'background 0.2s',
          }}
        >
          <PhoneOff size={15} /> End Session
        </motion.button>
      </div>
    </div>
  );
}
