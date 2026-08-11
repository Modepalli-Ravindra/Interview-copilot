export interface VoicePrefs {
  mode: 'voice' | 'text';
  enabled: boolean;
}

export interface VoiceSupport {
  sttSupported: boolean;
  ttsSupported: boolean;
}

const PREFS_KEY = 'interviewpilot_voice_prefs';

export const DEFAULT_VOICE_PREFS: VoicePrefs = { mode: 'voice', enabled: true };

export function getVoicePrefs(): VoicePrefs {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_VOICE_PREFS };
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>;
    return {
      mode: parsed.mode === 'text' ? 'text' : 'voice',
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_VOICE_PREFS.enabled,
    };
  } catch {
    return { ...DEFAULT_VOICE_PREFS };
  }
}

export function setVoicePrefs(prefs: VoicePrefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable — ignore */
  }
}

export async function detectVoiceSupport(): Promise<VoiceSupport> {
  let stt = false;
  try {
    const devices = await navigator.mediaDevices?.enumerateDevices?.();
    stt = Boolean(devices && devices.some((d) => d.kind === 'audioinput'));
  } catch {
    stt = false;
  }
  return {
    sttSupported: stt,
    ttsSupported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  };
}

/** Short two-tone completion chime, synthesized locally (no asset needed). */
export function playChime(): void {
  try {
    const Ctx: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const play = (freq: number, at: number, dur = 0.16) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + dur + 0.02);
    };
    play(880, 0);
    play(1318.5, 0.18);
    window.setTimeout(() => ctx.close().catch(() => {}), 1200);
  } catch {
    /* audio unavailable — ignore */
  }
}
