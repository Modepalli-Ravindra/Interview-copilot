import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpeechSynthesisResult {
  supported: boolean;
  speaking: boolean;
  speak: (text: string, onEnd?: () => void) => void;
  cancel: () => void;
}

export function useSpeechSynthesis(): UseSpeechSynthesisResult {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [speaking, setSpeaking] = useState(false);
  const onEndRef = useRef<(() => void) | null>(null);
  const tokenRef = useRef(0);

  const cancel = useCallback(() => {
    tokenRef.current += 1;
    onEndRef.current = null;
    setSpeaking(false);
    if (supported) {
      window.speechSynthesis.cancel();
    }
  }, [supported]);

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!supported) {
      onEnd?.();
      return;
    }
    const token = tokenRef.current + 1;
    tokenRef.current = token;
    onEndRef.current = onEnd ?? null;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 1;

    utterance.onstart = () => {
      if (tokenRef.current !== token) return;
      setSpeaking(true);
    };

    const finish = () => {
      if (tokenRef.current !== token) return;
      setSpeaking(false);
      const cb = onEndRef.current;
      onEndRef.current = null;
      cb?.();
    };

    utterance.onend = finish;
    utterance.onerror = finish;

    window.speechSynthesis.speak(utterance);
  }, [supported]);

  useEffect(() => () => {
    if (supported) window.speechSynthesis.cancel();
  }, [supported]);

  return { supported, speaking, speak, cancel };
}
