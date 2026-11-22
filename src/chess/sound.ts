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
let userUnlocked = false;
const rawArrayBuffers = new Map<ChessSoundKey, ArrayBuffer>();
const rawFetchPromises = new Map<ChessSoundKey, Promise<ArrayBuffer | null>>();
const decodedBuffers = new Map<ChessSoundKey, AudioBuffer>();
const decodePromises = new Map<ChessSoundKey, Promise<AudioBuffer | null>>();
const htmlAudioTemplates = new Map<ChessSoundKey, HTMLAudioElement>();
let lastPlayedSound: { key: ChessSoundKey; src: string; ts: number } | null = null;
let playedSoundCount = 0;

function ensureAudioContext(): AudioContext | null {
  if (typeof window === 'undefined' || !userUnlocked) return null;
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

function fetchRawSound(key: ChessSoundKey): Promise<ArrayBuffer | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  const existing = rawArrayBuffers.get(key);
  if (existing) return Promise.resolve(existing);
  const inFlight = rawFetchPromises.get(key);
  if (inFlight) return inFlight;

  const src = REAL_CHESS_SOUND_FILES[key];
  const p = fetch(src)
    .then((res) => (res.ok ? res.arrayBuffer() : null))
    .then((buf) => {
      if (buf) rawArrayBuffers.set(key, buf);
      return buf;
    })
    .catch(() => null);

  rawFetchPromises.set(key, p);
  return p;
}

function decodeSoundSample(key: ChessSoundKey): Promise<AudioBuffer | null> {
  if (typeof window === 'undefined' || !userUnlocked) return Promise.resolve(null);
  const existing = decodedBuffers.get(key);
  if (existing) return Promise.resolve(existing);
  const inFlight = decodePromises.get(key);
  if (inFlight) return inFlight;

  const p = fetchRawSound(key)
    .then(async (raw) => {
      if (!raw) return null;
      const ctx = ensureAudioContext();
      if (!ctx) return null;
      const decoded = await ctx.decodeAudioData(raw.slice(0));
      decodedBuffers.set(key, decoded);
      return decoded;
    })
    .catch(() => null);

  decodePromises.set(key, p);
  return p;
}

export function preloadAllChessSounds(): void {
  if (typeof window === 'undefined') return;
  (Object.keys(REAL_CHESS_SOUND_FILES) as ChessSoundKey[]).forEach((key) => {
    void fetchRawSound(key);
    if (userUnlocked) {
      void decodeSoundSample(key);
    }
  });
}

function unlockAudioOnGesture(): void {
  if (userUnlocked || typeof window === 'undefined') return;
  userUnlocked = true;
  ensureAudioContext();
  (Object.keys(REAL_CHESS_SOUND_FILES) as ChessSoundKey[]).forEach((key) => {
    void decodeSoundSample(key);
  });
}

if (typeof window !== 'undefined') {
  // Eagerly fetch raw MP3 bytes into memory with ZERO AudioContext autoplay warnings
  window.setTimeout(() => {
    preloadAllChessSounds();
  }, 180);

  const onFirstGesture = () => {
    unlockAudioOnGesture();
    window.removeEventListener('pointerdown', onFirstGesture, true);
    window.removeEventListener('keydown', onFirstGesture, true);
    window.removeEventListener('touchstart', onFirstGesture, true);
  };
  window.addEventListener('pointerdown', onFirstGesture, true);
  window.addEventListener('keydown', onFirstGesture, true);
  window.addEventListener('touchstart', onFirstGesture, true);
}

export function setSoundMuted(value: boolean) {
  muted = value;
}

export function isSoundMuted(): boolean {
  return muted;
}

function computeFilePan(square?: string): number {
  if (!square || square.length < 1) return 0;
  const idx = 'abcdefgh'.indexOf(square[0].toLowerCase());
  if (idx < 0) return 0;
  // Subtle spatial placement across the board (-0.18 left a-file .. +0.18 right h-file)
  return ((idx - 3.5) / 3.5) * 0.18;
}

export interface PlaySampleOptions {
  volume?: number;
  delayMs?: number;
  playbackRate?: number;
  pan?: number;
}

export function playRealSoundSample(
  key: ChessSoundKey,
  volumeOrOpts: number | PlaySampleOptions = 0.88,
  delayMsArg = 0,
): void {
  const opts: PlaySampleOptions =
    typeof volumeOrOpts === 'number'
      ? { volume: volumeOrOpts, delayMs: delayMsArg }
      : volumeOrOpts;

  const volume = opts.volume ?? 0.88;
  const delayMs = opts.delayMs ?? 0;
  const playbackRate = opts.playbackRate ?? 1.0;
  const pan = opts.pan ?? 0;

  const src = REAL_CHESS_SOUND_FILES[key];
  lastPlayedSound = { key, src, ts: Date.now() };
  if (muted || typeof window === 'undefined') return;
  playedSoundCount += 1;
  if (!userUnlocked) {
    unlockAudioOnGesture();
  }

  const trigger = () => {
    const ctx = ensureAudioContext();
    const buffer = decodedBuffers.get(key);
    if (ctx && buffer && ctx.state === 'running') {
      try {
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        source.playbackRate.value = Math.max(0.75, Math.min(1.4, playbackRate));
        gain.gain.value = Math.max(0, Math.min(1, volume));

        if (typeof ctx.createStereoPanner === 'function' && Math.abs(pan) > 0.005) {
          const panner = ctx.createStereoPanner();
          panner.pan.value = Math.max(-0.5, Math.min(0.5, pan));
          source.connect(gain);
          gain.connect(panner);
          panner.connect(ctx.destination);
        } else {
          source.connect(gain);
          gain.connect(ctx.destination);
        }
        source.start(0);
        return;
      } catch {
        // Fall through to HTMLAudioElement playback
      }
    }

    if (userUnlocked) {
      void decodeSoundSample(key);
      try {
        let template = htmlAudioTemplates.get(key);
        if (!template && typeof Audio !== 'undefined') {
          template = new Audio(src);
          template.preload = 'auto';
          htmlAudioTemplates.set(key, template);
        }
        const audio = template
          ? (template.cloneNode(true) as HTMLAudioElement)
          : new Audio(src);
        audio.volume = Math.max(0, Math.min(1, volume));
        audio.playbackRate = Math.max(0.75, Math.min(1.4, playbackRate));
        void audio.play().catch(() => {});
      } catch {
        // ignore autoplay blocks prior to user gesture
      }
    }
  };

  if (delayMs > 0) {
    window.setTimeout(trigger, delayMs);
  } else {
    trigger();
  }
}

function naturalWoodRate(base = 1.0): number {
  return base + (Math.random() - 0.5) * 0.03;
}

export function playMoveSound(opts?: {
  capture?: boolean;
  check?: boolean;
  castle?: boolean;
  promotion?: boolean;
  toSquare?: string;
}) {
  const pan = computeFilePan(opts?.toSquare);

  if (opts?.castle) {
    // Signature crisp double wooden tock: king lands, then rook slides into place
    playRealSoundSample('move', {
      volume: 0.9,
      delayMs: 0,
      playbackRate: naturalWoodRate(0.98),
      pan,
    });
    playRealSoundSample('castle', {
      volume: 0.86,
      delayMs: 90,
      playbackRate: naturalWoodRate(1.03),
      pan: pan * 0.6,
    });
    if (opts?.check) {
      playRealSoundSample('check', { volume: 0.82, delayMs: 130, playbackRate: 1.0, pan });
    }
    return;
  }

  if (opts?.promotion) {
    playRealSoundSample(opts.capture ? 'capture' : 'move', {
      volume: 0.9,
      delayMs: 0,
      playbackRate: naturalWoodRate(1.04),
      pan,
    });
    playRealSoundSample('confirmation', {
      volume: 0.65,
      delayMs: 55,
      playbackRate: 1.12,
      pan,
    });
    if (opts?.check) {
      playRealSoundSample('check', { volume: 0.82, delayMs: 105, playbackRate: 1.0, pan });
    }
    return;
  }

  if (opts?.capture) {
    playRealSoundSample('capture', {
      volume: 0.94,
      delayMs: 0,
      playbackRate: naturalWoodRate(1.0),
      pan,
    });
    if (opts?.check) {
      playRealSoundSample('check', { volume: 0.82, delayMs: 65, playbackRate: 1.0, pan });
    }
    return;
  }

  playRealSoundSample('move', {
    volume: 0.9,
    delayMs: 0,
    playbackRate: naturalWoodRate(1.0),
    pan,
  });
  if (opts?.check) {
    playRealSoundSample('check', { volume: 0.82, delayMs: 55, playbackRate: 1.0, pan });
  }
}

export function playPremoveSound() {
  playRealSoundSample('move', { volume: 0.5, delayMs: 0, playbackRate: 1.18 });
}

export function playGameStartSound() {
  playRealSoundSample('notify', { volume: 0.82, delayMs: 0, playbackRate: 1.0 });
}

export function playLowTimeTick() {
  playRealSoundSample('notify', { volume: 0.42, delayMs: 0, playbackRate: 1.32 });
}

export function playErrorSound() {
  playRealSoundSample('error', { volume: 0.85, delayMs: 0 });
}

export function playSuccessSound() {
  playRealSoundSample('confirmation', { volume: 0.88, delayMs: 0 });
}

export function playGameOverSound(won: boolean | null) {
  if (won === true) {
    playRealSoundSample('victory', { volume: 0.86, delayMs: 0 });
  } else if (won === false) {
    playRealSoundSample('defeat', { volume: 0.86, delayMs: 0 });
  } else {
    playRealSoundSample('draw', { volume: 0.86, delayMs: 0 });
  }
}

declare global {
  interface Window {
    __OPENCHESS_SOUND_ENGINE__?: {
      type: 'real-recorded-audio';
      files: Record<ChessSoundKey, string>;
      playSample: typeof playRealSoundSample;
      getLastPlayed: () => typeof lastPlayedSound;
      getPlayedCount: () => number;
      isUnlocked: () => boolean;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__OPENCHESS_SOUND_ENGINE__ = {
    type: 'real-recorded-audio',
    files: REAL_CHESS_SOUND_FILES,
    playSample: playRealSoundSample,
    getLastPlayed: () => lastPlayedSound,
    getPlayedCount: () => playedSoundCount,
    isUnlocked: () => userUnlocked,
  };
}
