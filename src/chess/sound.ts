export type ChessSoundKey =
  | 'move'
  | 'capture'
  | 'castle'
  | 'check'
  | 'error'
  | 'confirmation'
  | 'victory'
  | 'defeat'
  | 'draw'
  | 'notify';

export const REAL_CHESS_SOUND_FILES: Record<ChessSoundKey, string> = {
  move: '/sounds/Move.mp3',
  capture: '/sounds/Capture.mp3',
  castle: '/sounds/Castle.mp3',
  check: '/sounds/Check.mp3',
  error: '/sounds/Error.mp3',
  confirmation: '/sounds/Confirmation.mp3',
  victory: '/sounds/Victory.mp3',
  defeat: '/sounds/Defeat.mp3',
  draw: '/sounds/Draw.mp3',
  notify: '/sounds/GenericNotify.mp3',
};

let muted = false;
let audioCtx: AudioContext | null = null;
const decodedBuffers = new Map<ChessSoundKey, AudioBuffer>();
const loadingPromises = new Map<ChessSoundKey, Promise<AudioBuffer | null>>();
const htmlAudioTemplates = new Map<ChessSoundKey, HTMLAudioElement>();
let lastPlayedSound: { key: ChessSoundKey; src: string; ts: number } | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      audioCtx = new Ctor();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

function preloadSoundSample(key: ChessSoundKey): Promise<AudioBuffer | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const existing = decodedBuffers.get(key);
  if (existing) return Promise.resolve(existing);
  const inFlight = loadingPromises.get(key);
  if (inFlight) return inFlight;

  const src = REAL_CHESS_SOUND_FILES[key];
  if (!htmlAudioTemplates.has(key) && typeof Audio !== 'undefined') {
    try {
      const el = new Audio(src);
      el.preload = 'auto';
      htmlAudioTemplates.set(key, el);
    } catch {
      // ignore in headless/non-audio environments
    }
  }

  const p = fetch(src)
    .then((res) => (res.ok ? res.arrayBuffer() : null))
    .then(async (buf) => {
      if (!buf) return null;
      const ctx = getAudioContext();
      if (!ctx) return null;
      const decoded = await ctx.decodeAudioData(buf.slice(0));
      decodedBuffers.set(key, decoded);
      return decoded;
    })
    .catch(() => null);

  loadingPromises.set(key, p);
  return p;
}

export function preloadAllChessSounds(): void {
  if (typeof window === 'undefined') return;
  (Object.keys(REAL_CHESS_SOUND_FILES) as ChessSoundKey[]).forEach((key) => {
    void preloadSoundSample(key);
  });
}

if (typeof window !== 'undefined') {
  window.setTimeout(() => {
    preloadAllChessSounds();
  }, 150);
}

export function setSoundMuted(value: boolean) {
  muted = value;
}

export function isSoundMuted(): boolean {
  return muted;
}

export function playRealSoundSample(
  key: ChessSoundKey,
  volume = 0.85,
  delayMs = 0,
): void {
  const src = REAL_CHESS_SOUND_FILES[key];
  lastPlayedSound = { key, src, ts: Date.now() };
  if (muted || typeof window === 'undefined') return;

  const trigger = () => {
    const ctx = getAudioContext();
    const buffer = decodedBuffers.get(key);
    if (ctx && buffer && ctx.state === 'running') {
      try {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        gain.gain.value = Math.max(0, Math.min(1, volume));
        source.connect(gain);
        gain.connect(ctx.destination);
        source.start(0);
        return;
      } catch {
        // Fall through to HTMLAudioElement playback
      }
    }

    void preloadSoundSample(key);
    try {
      const template = htmlAudioTemplates.get(key);
      const audio = template
        ? (template.cloneNode(true) as HTMLAudioElement)
        : new Audio(src);
      audio.volume = Math.max(0, Math.min(1, volume));
      void audio.play().catch(() => {});
    } catch {
      // ignore autoplay blocks prior to user gesture
    }
  };

  if (delayMs > 0) {
    window.setTimeout(trigger, delayMs);
  } else {
    trigger();
  }
}

export function playMoveSound(opts?: {
  capture?: boolean;
  check?: boolean;
  castle?: boolean;
}) {
  if (opts?.castle) {
    playRealSoundSample('move', 0.9, 0);
    playRealSoundSample('castle', 0.85, 75);
    if (opts?.check) {
      playRealSoundSample('check', 0.8, 110);
    }
    return;
  }
  if (opts?.capture) {
    playRealSoundSample('capture', 0.92, 0);
    if (opts?.check) {
      playRealSoundSample('check', 0.8, 65);
    }
    return;
  }
  playRealSoundSample('move', 0.9, 0);
  if (opts?.check) {
    playRealSoundSample('check', 0.8, 55);
  }
}

export function playErrorSound() {
  playRealSoundSample('error', 0.85, 0);
}

export function playSuccessSound() {
  playRealSoundSample('confirmation', 0.88, 0);
}

export function playGameOverSound(won: boolean | null) {
  if (won === true) {
    playRealSoundSample('victory', 0.85, 0);
  } else if (won === false) {
    playRealSoundSample('defeat', 0.85, 0);
  } else {
    playRealSoundSample('draw', 0.85, 0);
  }
}

declare global {
  interface Window {
    __OPENCHESS_SOUND_ENGINE__?: {
      type: 'real-recorded-audio';
      files: Record<ChessSoundKey, string>;
      playSample: typeof playRealSoundSample;
      getLastPlayed: () => typeof lastPlayedSound;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__OPENCHESS_SOUND_ENGINE__ = {
    type: 'real-recorded-audio',
    files: REAL_CHESS_SOUND_FILES,
    playSample: playRealSoundSample,
    getLastPlayed: () => lastPlayedSound,
  };
}
