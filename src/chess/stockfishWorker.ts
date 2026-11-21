import {
  computeClientStockfish19NnueMultiPv,
  evaluateSinglePly,
  isBookMove,
  type EvaluatedMove,
} from './engine';
import {
  REVIEW_SPEED_PRESETS,
  buildTerminalSnapshot,
  classifyMoveFromAnalysis,
  parseUciInfoLine,
  uciLineToPvLine,
  type PositionAnalysisSnapshot,
  type ReviewSpeedPreset,
  type StockfishPvLine,
} from './reviewAnalysis';

export interface ScanProgressTelemetry {
  analyzedPlies: number;
  totalPlies: number;
  analyzedPositions: number;
  totalPositions: number;
  currentMoveSan: string;
  currentPly: number;
  activeDepth: number;
  nps: number;
  cacheHits: number;
  cloudHits: number;
  engineLabel: string;
  preset: ReviewSpeedPreset;
  isComplete: boolean;
}

interface SearchJobOptions {
  fen: string;
  depth: number;
  movetimeMs: number;
  multiPv: number;
  onProgress?: (snapshot: PositionAnalysisSnapshot) => void;
  signal?: AbortSignal;
}

const MEMORY_POS_CACHE = new Map<string, PositionAnalysisSnapshot>();
const STORAGE_CACHE_KEY = 'openchess_sf19_pos_cache_v1';
let storageLoaded = false;

function ensureStorageCacheLoaded() {
  if (storageLoaded || typeof window === 'undefined') return;
  storageLoaded = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Array<[string, PositionAnalysisSnapshot]>;
    if (Array.isArray(parsed)) {
      for (const [k, v] of parsed.slice(-320)) {
        if (k && v && v.fen) {
          MEMORY_POS_CACHE.set(k, v);
        }
      }
    }
  } catch {
    // ignore storage errors
  }
}

let persistTimer: number | null = null;
function schedulePersistCache() {
  if (typeof window === 'undefined' || persistTimer !== null) return;
  persistTimer = window.setTimeout(() => {
    persistTimer = null;
    try {
      const entries = Array.from(MEMORY_POS_CACHE.entries()).slice(-300);
      window.localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(entries));
    } catch {
      // ignore quota errors
    }
  }, 500);
}

function getCacheKey(fen: string, minDepth: number, minMultiPv: number): string {
  return `${fen}|d${minDepth}|pv${minMultiPv}`;
}

export function getCachedPositionAnalysis(
  fen: string,
  minDepth = 11,
  minMultiPv = 1,
): PositionAnalysisSnapshot | null {
  ensureStorageCacheLoaded();
  for (let d = 60; d >= minDepth; d--) {
    const exact = MEMORY_POS_CACHE.get(getCacheKey(fen, d, minMultiPv));
    if (exact && exact.lines.length >= minMultiPv) return exact;
  }
  const byExact = MEMORY_POS_CACHE.get(getCacheKey(fen, minDepth, minMultiPv));
  if (byExact) return byExact;
  // Also allow higher multiPv hit at same depth
  for (const pv of [3, 2, 1]) {
    if (pv < minMultiPv) continue;
    const hit = MEMORY_POS_CACHE.get(getCacheKey(fen, minDepth, pv));
    if (hit) return hit;
  }
  return null;
}

function storeCachedPositionAnalysis(snapshot: PositionAnalysisSnapshot, requestedDepth: number) {
  ensureStorageCacheLoaded();
  if (MEMORY_POS_CACHE.size > 480) {
    const firstKey = MEMORY_POS_CACHE.keys().next().value;
    if (firstKey) MEMORY_POS_CACHE.delete(firstKey);
  }
  const pvCount = Math.max(1, snapshot.lines.length);
  MEMORY_POS_CACHE.set(getCacheKey(snapshot.fen, requestedDepth, pvCount), snapshot);
  schedulePersistCache();
}

function createAbortError(): Error {
  const err = new Error('Stockfish search aborted');
  err.name = 'AbortError';
  return err;
}

/**
 * Wraps one Stockfish 19 Lite Single-Threaded WASM Web Worker over UCI protocol.
 */
class StockfishUciWorker {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private initFailed = false;
  private queue: Promise<void> = Promise.resolve();
  private activeCancel: (() => void) | null = null;
  private listener: ((line: string) => void) | null = null;

  private ensureReady(): Promise<void> {
    if (this.initFailed) {
      return Promise.reject(new Error('Stockfish 19 WASM unavailable'));
    }
    if (this.readyPromise) return this.readyPromise;
    if (typeof Worker === 'undefined' || typeof window === 'undefined') {
      this.initFailed = true;
      return Promise.reject(new Error('Web Workers unavailable'));
    }

    this.readyPromise = new Promise<void>((resolve, reject) => {
      let settled = false;
      let uciSeen = false;
      const timer = window.setTimeout(() => {
        if (!settled) {
          settled = true;
          this.initFailed = true;
          this.terminate();
          reject(new Error('Stockfish 19 WASM startup timeout'));
        }
      }, 9000);

      try {
        const w = new Worker('/stockfish/stockfish-19-lite-single.js');
        this.worker = w;

        w.onerror = () => {
          if (!settled) {
            settled = true;
            window.clearTimeout(timer);
            this.initFailed = true;
            this.terminate();
            reject(new Error('Stockfish 19 WASM worker error'));
          }
        };

        w.onmessage = (ev: MessageEvent<unknown>) => {
          const text = typeof ev.data === 'string' ? ev.data : String(ev.data ?? '');
          const lines = text.split(/\r?\n/);
          for (const rawLine of lines) {
            const line = rawLine.trim();
            if (!line) continue;
            if (!settled) {
              if (line === 'uciok' && !uciSeen) {
                uciSeen = true;
                w.postMessage('setoption name Hash value 32');
                w.postMessage('isready');
                continue;
              }
              if (line === 'readyok' && uciSeen) {
                settled = true;
                window.clearTimeout(timer);
                resolve();
                continue;
              }
            }
            this.listener?.(line);
          }
        };

        w.postMessage('uci');
      } catch (err) {
        settled = true;
        window.clearTimeout(timer);
        this.initFailed = true;
        reject(err instanceof Error ? err : new Error('Failed to start Stockfish worker'));
      }
    });

    return this.readyPromise;
  }

  public cancelCurrent() {
    this.activeCancel?.();
  }

  public evaluate(opts: SearchJobOptions): Promise<PositionAnalysisSnapshot> {
    if (opts.signal?.aborted) {
      return Promise.reject(createAbortError());
    }

    const runTask = async (): Promise<PositionAnalysisSnapshot> => {
      if (opts.signal?.aborted) {
        throw createAbortError();
      }
      await this.ensureReady();
      if (opts.signal?.aborted) {
        throw createAbortError();
      }

      const terminal = buildTerminalSnapshot(opts.fen);
      if (terminal) return terminal;

      return new Promise<PositionAnalysisSnapshot>((resolve, reject) => {
        const w = this.worker;
        if (!w) {
          reject(new Error('Stockfish worker not initialized'));
          return;
        }

        let finished = false;
        let lastProgressEmit = 0;
        let maxDepthSeen = 0;
        let lastNps = 0;
        let lastNodes = 0;
        const linesByPv = new Map<number, StockfishPvLine>();
        let readyForSearch = false;

        const buildSnapshot = (): PositionAnalysisSnapshot => {
          const sorted = Array.from(linesByPv.values())
            .sort((a, b) => a.multipv - b.multipv)
            .slice(0, Math.max(1, opts.multiPv));
          const top = sorted[0];
          return {
            fen: opts.fen,
            depth: Math.max(maxDepthSeen, top?.depth ?? 0),
            nps: lastNps || top?.nps,
            nodes: lastNodes || top?.nodes,
            lines: sorted,
            bestMoveSan: top?.firstMoveSan ?? '',
            bestMoveFrom: top?.firstMoveFrom ?? '',
            bestMoveTo: top?.firstMoveTo ?? '',
            evalCp: top?.evalCp ?? 0,
            mateIn: top?.mateIn ?? null,
            source: 'stockfish-19-wasm',
          };
        };

        const cleanup = () => {
          this.listener = null;
          this.activeCancel = null;
          opts.signal?.removeEventListener('abort', handleAbort);
          window.clearTimeout(hardTimeout);
        };

        const handleAbort = () => {
          if (finished) return;
          try {
            w.postMessage('stop');
          } catch {
            // ignore
          }
          // Let bestmove finish quickly, otherwise force resolve/reject
          window.setTimeout(() => {
            if (!finished) {
              finished = true;
              cleanup();
              reject(createAbortError());
            }
          }, 120);
        };

        const hardTimeout = window.setTimeout(() => {
          if (finished) return;
          try {
            w.postMessage('stop');
          } catch {
            // ignore
          }
          window.setTimeout(() => {
            if (!finished) {
              finished = true;
              cleanup();
              const snap = buildSnapshot();
              if (snap.lines.length > 0) {
                resolve(snap);
              } else {
                reject(new Error('Stockfish search timed out'));
              }
            }
          }, 180);
        }, Math.max(1200, opts.movetimeMs * 4 + 1800));

        this.activeCancel = handleAbort;
        opts.signal?.addEventListener('abort', handleAbort);

        this.listener = (line: string) => {
          if (finished) return;
          if (!readyForSearch) {
            if (line === 'readyok') {
              readyForSearch = true;
              w.postMessage(`position fen ${opts.fen}`);
              w.postMessage(`go depth ${opts.depth} movetime ${opts.movetimeMs}`);
            }
            return;
          }

          if (line.startsWith('info ')) {
            const parsed = parseUciInfoLine(line);
            if (!parsed) return;
            const pvLine = uciLineToPvLine(opts.fen, parsed);
            if (!pvLine) return;
            if (pvLine.depth >= maxDepthSeen) {
              maxDepthSeen = pvLine.depth;
            }
            if (pvLine.nps) lastNps = pvLine.nps;
            if (pvLine.nodes) lastNodes = pvLine.nodes;
            linesByPv.set(pvLine.multipv, pvLine);

            if (opts.onProgress) {
              const now = performance.now();
              if (now - lastProgressEmit >= 70) {
                lastProgressEmit = now;
                opts.onProgress(buildSnapshot());
              }
            }
            return;
          }

          if (line.startsWith('bestmove')) {
            finished = true;
            cleanup();
            if (opts.signal?.aborted) {
              reject(createAbortError());
              return;
            }
            const snap = buildSnapshot();
            resolve(snap);
          }
        };

        w.postMessage(`setoption name MultiPV value ${Math.max(1, Math.min(3, opts.multiPv))}`);
        w.postMessage('isready');
      });
    };

    const next = this.queue.then(runTask, runTask);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  public terminate() {
    this.activeCancel?.();
    if (this.worker) {
      try {
        this.worker.terminate();
      } catch {
        // ignore
      }
      this.worker = null;
    }
    this.readyPromise = null;
  }
}

let interactiveWorker: StockfishUciWorker | null = null;
let interactiveAbort: AbortController | null = null;

function getInteractiveWorker(): StockfishUciWorker {
  if (!interactiveWorker) {
    interactiveWorker = new StockfishUciWorker();
  }
  return interactiveWorker;
}

function buildLocalFallbackSnapshot(
  fen: string,
  multiPv = 3,
): PositionAnalysisSnapshot {
  const terminal = buildTerminalSnapshot(fen);
  if (terminal) return terminal;
  const fallback = computeClientStockfish19NnueMultiPv(fen, 14, multiPv, 160);
  const lines: StockfishPvLine[] = fallback.lines.map((l, idx) => ({
    multipv: idx + 1,
    depth: fallback.depth,
    evalCp: l.evalCp,
    mateIn: null,
    evalText: l.evalText,
    firstMoveUci: `${l.firstMoveFrom}${l.firstMoveTo}`,
    firstMoveFrom: l.firstMoveFrom,
    firstMoveTo: l.firstMoveTo,
    firstMoveSan: l.firstMoveSan,
    lineUci: [],
    lineSan: l.lineSan,
  }));
  return {
    fen,
    depth: fallback.depth,
    lines,
    bestMoveSan: lines[0]?.firstMoveSan ?? '',
    bestMoveFrom: lines[0]?.firstMoveFrom ?? '',
    bestMoveTo: lines[0]?.firstMoveTo ?? '',
    evalCp: lines[0]?.evalCp ?? 0,
    mateIn: lines[0]?.mateIn ?? null,
    source: 'local-js',
  };
}

/**
 * Interactive Multi-PV analyzer for the active board / What-If variation exploration.
 * Automatically cancels any previous in-flight live position search.
 */
export async function analyzeLivePositionWithStockfish19(
  fen: string,
  options?: {
    depth?: number;
    movetimeMs?: number;
    multiPv?: number;
    forceRefresh?: boolean;
    onProgress?: (snapshot: PositionAnalysisSnapshot) => void;
    signal?: AbortSignal;
  },
): Promise<PositionAnalysisSnapshot> {
  const depth = options?.depth ?? 16;
  const movetimeMs = options?.movetimeMs ?? 850;
  const multiPv = options?.multiPv ?? 3;

  const terminal = buildTerminalSnapshot(fen);
  if (terminal) return terminal;

  if (!options?.forceRefresh) {
    const cached = getCachedPositionAnalysis(fen, Math.min(14, depth), multiPv);
    if (cached && cached.lines.length >= Math.min(multiPv, 2)) {
      return cached;
    }
  }

  // Cancel any prior live inspection search immediately
  interactiveAbort?.abort();
  const controller = new AbortController();
  interactiveAbort = controller;

  const onExternalAbort = () => controller.abort();
  options?.signal?.addEventListener('abort', onExternalAbort);

  const worker = getInteractiveWorker();
  worker.cancelCurrent();

  try {
    const snap = await worker.evaluate({
      fen,
      depth,
      movetimeMs,
      multiPv,
      onProgress: options?.onProgress,
      signal: controller.signal,
    });
    if (snap.lines.length > 0) {
      storeCachedPositionAnalysis(snap, depth);
      return snap;
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw err;
    }
  } finally {
    options?.signal?.removeEventListener('abort', onExternalAbort);
  }

  return buildLocalFallbackSnapshot(fen, multiPv);
}

let scanPoolWorkers: StockfishUciWorker[] = [];
function getScanPool(size: number): StockfishUciWorker[] {
  while (scanPoolWorkers.length < size) {
    scanPoolWorkers.push(new StockfishUciWorker());
  }
  return scanPoolWorkers.slice(0, size);
}

interface CloudBatchEntry {
  fen: string;
  depth: number;
  knodes?: number;
  source?: string;
  lines: Array<{
    evalCp: number;
    evalText: string;
    firstMoveFrom: string;
    firstMoveTo: string;
    firstMoveSan: string;
    lineSan: string[];
  }>;
}

function cloudEntryToSnapshot(entry: CloudBatchEntry): PositionAnalysisSnapshot | null {
  if (!entry.lines || entry.lines.length === 0) return null;
  const lines: StockfishPvLine[] = entry.lines.map((l, idx) => {
    const isMate = l.evalText.includes('M') || Math.abs(l.evalCp) >= 90000;
    const mateMatch = l.evalText.match(/(-?)#?M?(\d+)/);
    let mateIn: number | null = null;
    if (isMate && mateMatch) {
      const dist = Number.parseInt(mateMatch[2], 10) || 1;
      mateIn = l.evalText.startsWith('-') || l.evalCp < 0 ? -dist : dist;
    }
    return {
      multipv: idx + 1,
      depth: entry.depth || 45,
      evalCp: l.evalCp,
      mateIn,
      evalText: l.evalText,
      firstMoveUci: `${l.firstMoveFrom}${l.firstMoveTo}`,
      firstMoveFrom: l.firstMoveFrom,
      firstMoveTo: l.firstMoveTo,
      firstMoveSan: l.firstMoveSan,
      lineUci: [],
      lineSan: l.lineSan,
    };
  });
  return {
    fen: entry.fen,
    depth: entry.depth || 45,
    nps: undefined,
    lines,
    bestMoveSan: lines[0].firstMoveSan,
    bestMoveFrom: lines[0].firstMoveFrom,
    bestMoveTo: lines[0].firstMoveTo,
    evalCp: lines[0].evalCp,
    mateIn: lines[0].mateIn,
    source: 'lichess-cloud',
  };
}

/**
 * Full-game progressive Stockfish 19 WASM scanner.
 * Deduplicates FENs (`N+1` unique positions instead of `2N`), pre-seeds Lichess Cloud
 * opening hits in <950ms, and streams every ply classification live as workers finish.
 */
export async function scanGameWithStockfish19(params: {
  skeleton: EvaluatedMove[];
  preset: ReviewSpeedPreset;
  onMovesUpdate: (moves: EvaluatedMove[], telemetry: ScanProgressTelemetry) => void;
  signal?: AbortSignal;
}): Promise<EvaluatedMove[]> {
  const { skeleton, preset, onMovesUpdate, signal } = params;
  if (skeleton.length === 0) return [];

  const config = REVIEW_SPEED_PRESETS[preset];
  const multiPv = preset === 'fast' ? 1 : 2;

  // Unique positions in chronological order: index 0 is fenBefore of ply 1, index i is fenAfter of ply i
  const uniqueFens: string[] = [skeleton[0].fenBefore];
  for (const m of skeleton) {
    uniqueFens.push(m.fenAfter);
  }
  const totalPositions = uniqueFens.length;
  const totalPlies = skeleton.length;

  const snapshots = new Array<PositionAnalysisSnapshot | null>(totalPositions).fill(null);
  const working = skeleton.map((m) => ({ ...m }));
  const evaluatedMoveFlags = new Array<boolean>(totalPlies).fill(false);

  let cacheHits = 0;
  let cloudHits = 0;
  let latestNps = 0;
  let latestDepth = config.depth;
  let analyzedPositions = 0;
  let analyzedPlies = 0;

  // Pre-seed terminal positions + cached Stockfish 19 positions
  for (let p = 0; p < totalPositions; p++) {
    const fen = uniqueFens[p];
    const term = buildTerminalSnapshot(fen);
    if (term) {
      snapshots[p] = term;
      analyzedPositions += 1;
      continue;
    }
    const cached = getCachedPositionAnalysis(fen, config.depth, multiPv);
    if (cached) {
      snapshots[p] = cached;
      analyzedPositions += 1;
      cacheHits += 1;
    }
  }

  const recomputeCompletedPlies = (): boolean => {
    let anyNew = false;
    for (let i = 0; i < totalPlies; i++) {
      if (evaluatedMoveFlags[i]) continue;
      const before = snapshots[i];
      const after = snapshots[i + 1];
      if (!before || !after) continue;
      const wasBook = i < 16 && isBookMove(working[i].fenBefore, working[i].san);
      working[i] = classifyMoveFromAnalysis({
        move: working[i],
        before,
        after,
        plyIndex: i,
        wasBook,
      });
      evaluatedMoveFlags[i] = true;
      analyzedPlies += 1;
      anyNew = true;
    }
    return anyNew;
  };

  const emitProgress = (currentIdx: number, isComplete = false) => {
    const moveIdx = Math.min(totalPlies - 1, Math.max(0, currentIdx));
    const currentMove = working[moveIdx];
    onMovesUpdate([...working], {
      analyzedPlies,
      totalPlies,
      analyzedPositions,
      totalPositions,
      currentMoveSan: currentMove
        ? `${currentMove.moveNumber}${currentMove.color === 'w' ? '.' : '...'} ${currentMove.san}`
        : '',
      currentPly: moveIdx + 1,
      activeDepth: latestDepth,
      nps: latestNps,
      cacheHits,
      cloudHits,
      engineLabel: 'Analysis Engine',
      preset,
      isComplete,
    });
  };

  recomputeCompletedPlies();
  emitProgress(0, analyzedPlies === totalPlies);

  if (analyzedPlies === totalPlies || signal?.aborted) {
    return working;
  }

  // Fast non-blocking Lichess Cloud Eval pre-check for early opening/theory positions
  const uncachedEarlyFens = uniqueFens
    .slice(0, 28)
    .filter((_, idx) => snapshots[idx] === null);

  if (uncachedEarlyFens.length > 0 && typeof fetch === 'function') {
    try {
      const cloudController = new AbortController();
      const cloudTimeout = window.setTimeout(() => cloudController.abort(), 1100);
      const onOuterAbort = () => cloudController.abort();
      signal?.addEventListener('abort', onOuterAbort);

      const res = await fetch('/api/engine/cloud-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fens: uncachedEarlyFens }),
        signal: cloudController.signal,
      }).catch(() => null);

      window.clearTimeout(cloudTimeout);
      signal?.removeEventListener('abort', onOuterAbort);

      if (res && res.ok && !signal?.aborted) {
        const data = (await res.json()) as { evaluations?: CloudBatchEntry[] };
        if (Array.isArray(data?.evaluations)) {
          const byFen = new Map<string, PositionAnalysisSnapshot>();
          for (const item of data.evaluations) {
            const snap = cloudEntryToSnapshot(item);
            if (snap) {
              byFen.set(item.fen, snap);
              storeCachedPositionAnalysis(snap, snap.depth);
            }
          }
          for (let p = 0; p < totalPositions; p++) {
            if (!snapshots[p]) {
              const hit = byFen.get(uniqueFens[p]);
              if (hit) {
                snapshots[p] = hit;
                analyzedPositions += 1;
                cloudHits += 1;
              }
            }
          }
          if (recomputeCompletedPlies()) {
            emitProgress(analyzedPlies, analyzedPlies === totalPlies);
          }
        }
      }
    } catch {
      // Ignore network failure and proceed straight to local Stockfish 19 WASM
    }
  }

  if (signal?.aborted || analyzedPlies === totalPlies) {
    return working;
  }

  // Remaining positions to scan with Stockfish 19 WASM Web Workers
  const pendingIndices: number[] = [];
  for (let p = 0; p < totalPositions; p++) {
    if (!snapshots[p]) pendingIndices.push(p);
  }

  const hasWorkers = typeof Worker !== 'undefined' && typeof window !== 'undefined';
  if (!hasWorkers) {
    // Headless JS fallback
    for (let i = 0; i < totalPlies; i++) {
      if (!evaluatedMoveFlags[i]) {
        working[i] = evaluateSinglePly(working[i], i);
        evaluatedMoveFlags[i] = true;
        analyzedPlies += 1;
      }
    }
    emitProgress(totalPlies - 1, true);
    return working;
  }

  const concurrency =
    typeof navigator !== 'undefined' && (navigator.hardwareConcurrency ?? 4) <= 2 ? 1 : 2;
  const pool = getScanPool(concurrency);
  let cursor = 0;

  const runWorkerLoop = async (worker: StockfishUciWorker) => {
    while (cursor < pendingIndices.length && !signal?.aborted) {
      const posIdx = pendingIndices[cursor++];
      const fen = uniqueFens[posIdx];
      let snap: PositionAnalysisSnapshot | null = null;
      try {
        snap = await worker.evaluate({
          fen,
          depth: config.depth,
          movetimeMs: config.movetimeMs,
          multiPv,
          signal,
        });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        snap = buildLocalFallbackSnapshot(fen, multiPv);
      }

      if (signal?.aborted) return;

      if (snap && snap.lines.length > 0) {
        storeCachedPositionAnalysis(snap, config.depth);
        if (snap.nps) latestNps = snap.nps;
        if (snap.depth) latestDepth = snap.depth;
      } else {
        snap = buildLocalFallbackSnapshot(fen, multiPv);
      }

      snapshots[posIdx] = snap;
      analyzedPositions += 1;
      recomputeCompletedPlies();
      emitProgress(posIdx, analyzedPlies === totalPlies);
    }
  };

  await Promise.all(pool.map((worker) => runWorkerLoop(worker)));

  if (!signal?.aborted && analyzedPlies === totalPlies) {
    emitProgress(totalPlies - 1, true);
  }

  return working;
}
