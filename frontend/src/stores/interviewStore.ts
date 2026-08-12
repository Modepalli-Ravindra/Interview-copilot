import { create } from 'zustand';
import type { TranscriptEntry, CodeExecutionResult, InterviewSession } from '../types';

interface InterviewState {
  // Session
  currentSession: InterviewSession | null;
  // Voice
  isRecording: boolean;
  isPlayingAudio: boolean;
  isConnected: boolean;
  speechEnabled: boolean;
  // Transcript
  transcript: TranscriptEntry[];
  // Code Editor
  currentCode: string;
  editorLanguage: string;
  isRunningCode: boolean;
  lastCodeResult: CodeExecutionResult | null;
  // Audio amplitude array for visualizer (0–1 per bar)
  audioAmplitudes: number[];

  // Actions
  setSession: (session: InterviewSession | null) => void;
  setRecording: (val: boolean) => void;
  setPlayingAudio: (val: boolean) => void;
  setConnected: (val: boolean) => void;
  setSpeechEnabled: (val: boolean) => void;
  addTranscript: (entry: Omit<TranscriptEntry, 'id' | 'timestamp'>) => void;
  clearTranscript: () => void;
  updateCode: (code: string) => void;
  setEditorLanguage: (lang: string) => void;
  setRunningCode: (val: boolean) => void;
  setCodeResult: (result: CodeExecutionResult | null) => void;
  setAudioAmplitudes: (amps: number[]) => void;
  reset: () => void;
}

export const useInterviewStore = create<InterviewState>((set) => ({
  currentSession: null,
  isRecording: false,
  isPlayingAudio: false,
  isConnected: false,
  speechEnabled: true,
  transcript: [],
  currentCode: '# Write your solution here\ndef solution():\n    pass\n',
  editorLanguage: 'python',
  isRunningCode: false,
  lastCodeResult: null,
  audioAmplitudes: Array(16).fill(0.1),

  setSession: (session) => set({ currentSession: session }),
  setRecording: (val) => set({ isRecording: val }),
  setPlayingAudio: (val) => set({ isPlayingAudio: val }),
  setConnected: (val) => set({ isConnected: val }),
  setSpeechEnabled: (val) => set({ speechEnabled: val }),
  addTranscript: (entry) =>
    set((state) => ({
      transcript: [
        ...state.transcript,
        { ...entry, id: crypto.randomUUID(), timestamp: new Date() },
      ],
    })),
  clearTranscript: () => set({ transcript: [] }),
  updateCode: (code) => set({ currentCode: code }),
  setEditorLanguage: (lang) => set({ editorLanguage: lang }),
  setRunningCode: (val) => set({ isRunningCode: val }),
  setCodeResult: (result) => set({ lastCodeResult: result }),
  setAudioAmplitudes: (amps) => set({ audioAmplitudes: amps }),
  reset: () => set({
    currentSession: null,
    isRecording: false,
    isPlayingAudio: false,
    isConnected: false,
    transcript: [],
    currentCode: '# Write your solution here\ndef solution():\n    pass\n',
    isRunningCode: false,
    lastCodeResult: null,
    audioAmplitudes: Array(16).fill(0.1),
  }),
}));
