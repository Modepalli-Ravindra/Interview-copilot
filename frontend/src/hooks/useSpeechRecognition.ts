import { useCallback, useEffect, useRef, useState } from 'react';

interface UseSpeechRecognitionOptions {
  onFinalResult?: (text: string) => void;
  lang?: string;
}

interface UseSpeechRecognitionResult {
  isListening: boolean;
  interimTranscript: string;
  error: string | null;
  supported: boolean;
  start: () => void;
  stop: () => void;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRecognitionCtor(): any | null {
  if (typeof window === 'undefined') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function useSpeechRecognition({
  onFinalResult,
  lang = 'en-US',
}: UseSpeechRecognitionOptions = {}): UseSpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);
  const onFinalResultRef = useRef(onFinalResult);
  onFinalResultRef.current = onFinalResult;

  const supported = Boolean(getRecognitionCtor());

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // already stopped
      }
    }
    recognitionRef.current = null;
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setError('Speech recognition is not supported in this browser. Try Chrome or Edge.');
      return;
    }
    setError(null);
    setInterimTranscript('');

    const recognition = new Ctor();
    recognitionRef.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final.trim()) {
        setInterimTranscript('');
        stop();
        onFinalResultRef.current?.(final.trim());
        return;
      }
      setInterimTranscript(interim);
    };

    recognition.onerror = (event: any) => {
      if (event.error === 'not-allowed') {
        setError('Microphone permission denied. Allow mic access and try again.');
      } else if (event.error === 'no-speech') {
        setError('No speech detected. Press the mic and try again.');
      } else if (event.error !== 'aborted') {
        setError(`Speech recognition error: ${event.error}`);
      }
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    setIsListening(true);
    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setError('Could not start speech recognition.');
    }
  }, [lang, stop]);

  useEffect(() => () => stop(), [stop]);

  return { isListening, interimTranscript, error, supported, start, stop };
}
