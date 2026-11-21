import { Chess, type Color, type PieceSymbol } from 'chess.js';
import type { EvaluatedMove, MoveQuality } from './engine';

export type ReviewSpeedPreset = 'fast' | 'standard' | 'deep';

export interface ReviewSpeedOption {
  id: ReviewSpeedPreset;
  label: string;
  depth: number;
  movetimeMs: number;
  shortDesc: string;
}

export const REVIEW_SPEED_PRESETS: Record<ReviewSpeedPreset, ReviewSpeedOption> = {
  fast: {
    id: 'fast',
    label: 'Fast',
    depth: 11,
    movetimeMs: 95,
    shortDesc: 'Depth 11 · Instant',
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    depth: 14,
    movetimeMs: 185,
    shortDesc: 'Depth 14 · Balanced',
  },
  deep: {
    id: 'deep',
    label: 'Deep',
    depth: 17,
    movetimeMs: 420,
    shortDesc: 'Depth 17 · Tournament',
  },
};

export interface StockfishPvLine {
  multipv: number;
  depth: number;
  seldepth?: number;
  nodes?: number;
  nps?: number;
  evalCp: number; // Always normalized to White's perspective (+ = White ahead, - = Black ahead)
  mateIn: number | null; // +N = White mates in N, -N = Black mates in N
  evalText: string;
  firstMoveUci: string;
  firstMoveFrom: string;
  firstMoveTo: string;
  firstMoveSan: string;
  lineUci: string[];
  lineSan: string[];
}

export interface PositionAnalysisSnapshot {
  fen: string;
  depth: number;
  nps?: number;
  nodes?: number;
  lines: StockfishPvLine[];
  bestMoveSan: string;
  bestMoveFrom: string;
  bestMoveTo: string;
  evalCp: number;
  mateIn: number | null;
  source: 'stockfish-19-wasm' | 'lichess-cloud' | 'local-book' | 'local-js';
}

const PIECE_MATERIAL_CP: Record<PieceSymbol, number> = {
  p: 100,
  n: 310,
  b: 330,
  r: 500,
  q: 900,
  k: 0,
};

export function encodeMateEvalCp(matePliesFromWhite: number): number {
  if (matePliesFromWhite === 0) return 0;
  const dist = Math.max(1, Math.min(999, Math.abs(Math.round(matePliesFromWhite))));
  const magnitude = 100000 - dist;
  return matePliesFromWhite > 0 ? magnitude : -magnitude;
}

export function decodeMateDistance(evalCp: number): number | null {
  if (Math.abs(evalCp) < 90000) return null;
  const dist = Math.max(1, 100000 - Math.min(99999, Math.abs(Math.round(evalCp))));
  return evalCp > 0 ? dist : -dist;
}

export function formatEvalDisplay(evalCp: number, mateIn?: number | null): string {
  const effectiveMate = mateIn ?? decodeMateDistance(evalCp);
  if (effectiveMate !== null && effectiveMate !== 0) {
    return effectiveMate > 0 ? `M${effectiveMate}` : `-M${Math.abs(effectiveMate)}`;
  }
  const pawns = evalCp / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(Math.abs(pawns) >= 10 ? 1 : 2)}`;
}

/**
 * Logistic Expected-Points / Win Probability model (0..100 for White).
 * Matches Chess.com / Lichess calibrated centipawn-to-win-chance scaling.
 */
export function evalToWhiteWinPercent(evalCp: number, mateIn?: number | null): number {
  const effectiveMate = mateIn ?? decodeMateDistance(evalCp);
  if (effectiveMate !== null && effectiveMate !== 0) {
    return effectiveMate > 0 ? 100 : 0;
  }
  const clamped = Math.max(-2500, Math.min(2500, evalCp));
  const raw = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export function evalToMoverWinPercent(
  evalCp: number,
  moverColor: Color,
  mateIn?: number | null,
): number {
  const whiteWin = evalToWhiteWinPercent(evalCp, mateIn);
  return moverColor === 'w' ? whiteWin : Math.round((100 - whiteWin) * 10) / 10;
}

/**
 * Calibrated single-move accuracy percentage (0..100) derived from Win% loss.
 */
export function computeMoveAccuracyPercent(winLossPct: number): number {
  const loss = Math.max(0, winLossPct);
  if (loss <= 0.3) return 100;
  const raw = 103.1668 * Math.exp(-0.04354 * loss) - 3.1669;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

export interface ParsedUciInfo {
  depth: number;
  seldepth?: number;
  multipv: number;
  nodes?: number;
  nps?: number;
  scoreType: 'cp' | 'mate';
  scoreValue: number;
  pvUci: string[];
  bound?: 'upperbound' | 'lowerbound';
}

export function parseUciInfoLine(line: string): ParsedUciInfo | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith('info ') || !trimmed.includes(' score ') || !trimmed.includes(' pv ')) {
    return null;
  }
  if (trimmed.includes('upperbound') || trimmed.includes('lowerbound')) {
    return null;
  }

  const tokens = trimmed.split(/\s+/);
  let depth = 0;
  let seldepth: number | undefined;
  let multipv = 1;
  let nodes: number | undefined;
  let nps: number | undefined;
  let scoreType: 'cp' | 'mate' | null = null;
  let scoreValue = 0;
  let pvUci: string[] = [];

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok === 'depth' && i + 1 < tokens.length) {
      depth = Number.parseInt(tokens[++i], 10) || 0;
    } else if (tok === 'seldepth' && i + 1 < tokens.length) {
      seldepth = Number.parseInt(tokens[++i], 10) || undefined;
    } else if (tok === 'multipv' && i + 1 < tokens.length) {
      multipv = Math.max(1, Number.parseInt(tokens[++i], 10) || 1);
    } else if (tok === 'nodes' && i + 1 < tokens.length) {
      nodes = Number.parseInt(tokens[++i], 10) || undefined;
    } else if (tok === 'nps' && i + 1 < tokens.length) {
      nps = Number.parseInt(tokens[++i], 10) || undefined;
    } else if (tok === 'score' && i + 2 < tokens.length) {
      const kind = tokens[++i];
      const val = Number.parseInt(tokens[++i], 10);
      if ((kind === 'cp' || kind === 'mate') && Number.isFinite(val)) {
        scoreType = kind;
        scoreValue = val;
      }
    } else if (tok === 'pv') {
      pvUci = tokens.slice(i + 1).filter((m) => /^[a-h][1-8][a-h][1-8][qrbn]?$/.test(m));
      break;
    }
  }

  if (!scoreType || pvUci.length === 0 || depth <= 0) {
    return null;
  }

  return {
    depth,
    seldepth,
    multipv,
    nodes,
    nps,
    scoreType,
    scoreValue,
    pvUci,
  };
}

export function uciLineToPvLine(fen: string, info: ParsedUciInfo): StockfishPvLine | null {
  let chess: Chess;
  try {
    chess = new Chess(fen);
  } catch {
    return null;
  }

  const sideSign = chess.turn() === 'w' ? 1 : -1;
  let evalCp = 0;
  let mateIn: number | null = null;

  if (info.scoreType === 'mate') {
    const signedMate = info.scoreValue === 0 ? 1 : info.scoreValue * sideSign;
    mateIn = signedMate;
    evalCp = encodeMateEvalCp(signedMate);
  } else {
    evalCp = Math.round(info.scoreValue * sideSign);
  }

  const lineSan: string[] = [];
  let firstMoveFrom = '';
  let firstMoveTo = '';
  let firstMoveSan = '';

  for (let i = 0; i < info.pvUci.length && i < 10; i++) {
    const uci = info.pvUci[i];
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length > 4 ? (uci[4].toLowerCase() as PieceSymbol) : undefined;
    try {
      const played = chess.move({ from, to, promotion });
      if (!played) break;
      if (i === 0) {
        firstMoveFrom = played.from;
        firstMoveTo = played.to;
        firstMoveSan = played.san;
      }
      lineSan.push(played.san);
    } catch {
      break;
    }
  }

  if (!firstMoveSan || !firstMoveFrom || !firstMoveTo) return null;

  return {
    multipv: info.multipv,
    depth: info.depth,
    seldepth: info.seldepth,
    nodes: info.nodes,
    nps: info.nps,
    evalCp,
    mateIn,
    evalText: formatEvalDisplay(evalCp, mateIn),
    firstMoveUci: info.pvUci[0],
    firstMoveFrom,
    firstMoveTo,
    firstMoveSan,
    lineUci: info.pvUci.slice(0, lineSan.length),
    lineSan,
  };
}

/**
 * Evaluates terminal (checkmate / draw) positions cleanly without needing engine search.
 */
export function buildTerminalSnapshot(fen: string): PositionAnalysisSnapshot | null {
  try {
    const chess = new Chess(fen);
    if (!chess.isGameOver()) return null;
    if (chess.isCheckmate()) {
      // Side to move has been checkmated
      const winnerSign = chess.turn() === 'w' ? -1 : 1;
      const evalCp = encodeMateEvalCp(winnerSign);
      return {
        fen,
        depth: 99,
        lines: [],
        bestMoveSan: '',
        bestMoveFrom: '',
        bestMoveTo: '',
        evalCp,
        mateIn: winnerSign,
        source: 'stockfish-19-wasm',
      };
    }
    return {
      fen,
      depth: 99,
      lines: [],
      bestMoveSan: '',
      bestMoveFrom: '',
      bestMoveTo: '',
      evalCp: 0,
      mateIn: null,
      source: 'stockfish-19-wasm',
    };
  } catch {
    return null;
  }
}


/**
 * Classifies a move using Chess.com / Lichess Win%-Loss Expected Points & Stockfish 19 evaluations.
 */
export function classifyMoveFromAnalysis(params: {
  move: EvaluatedMove;
  before: PositionAnalysisSnapshot;
  after: PositionAnalysisSnapshot;
  plyIndex: number;
  wasBook: boolean;
}): EvaluatedMove {
  const { move, before, after, plyIndex, wasBook } = params;
  const color = move.color;
  const moverSign = color === 'w' ? 1 : -1;

  const evalBefore = before.evalCp;
  const evalAfter = after.evalCp;
  const winBeforeMover = evalToMoverWinPercent(evalBefore, color, before.mateIn);
  const winAfterMover = evalToMoverWinPercent(evalAfter, color, after.mateIn);
  const winLoss = Math.max(0, Math.round((winBeforeMover - winAfterMover) * 10) / 10);

  const rawCpDelta = (evalBefore - evalAfter) * moverSign;
  // Cap extreme mate-score distortion when winning position shifts from +20 to +14
  const cpLoss = Math.max(
    0,
    Math.abs(evalBefore) >= 90000 && Math.abs(evalAfter) >= 90000 && (evalBefore * evalAfter > 0)
      ? 0
      : Math.min(2500, Math.round(rawCpDelta)),
  );

  const bestSan = before.bestMoveSan || move.bestMoveSan || move.san;
  const bestFrom = before.bestMoveFrom || move.bestMoveFrom || move.from;
  const bestTo = before.bestMoveTo || move.bestMoveTo || move.to;
  const playedIsBest =
    move.san === bestSan || (move.from === bestFrom && move.to === bestTo);

  let legalCount = 2;
  try {
    legalCount = new Chess(move.fenBefore).moves().length;
  } catch {
    legalCount = 2;
  }

  const secondBest = before.lines.length > 1 ? before.lines[1] : null;
  const secondBestWin = secondBest
    ? evalToMoverWinPercent(secondBest.evalCp, color, secondBest.mateIn)
    : null;
  const secondBestWinDrop =
    secondBestWin !== null ? Math.max(0, winBeforeMover - secondBestWin) : 0;

  // Exact Static Exchange Evaluation (SEE) on `move.to` for genuine Brilliant (!!) sacrifice detection
  let seeOnToCp = 0;
  let hasLegalOppCaptureOnTo = false;
  try {
    const beforeProbe = new Chess(move.fenBefore);
    const playedMove = beforeProbe.move({
      from: move.from,
      to: move.to,
      promotion: 'q',
    });
    const capturedOnMoveCp = playedMove?.captured
      ? PIECE_MATERIAL_CP[playedMove.captured]
      : 0;
    const gains: number[] = [capturedOnMoveCp];

    const sim = new Chess(move.fenAfter);
    for (let ply = 0; ply < 6; ply++) {
      const caps = sim
        .moves({ verbose: true })
        .filter((m) => m.to === move.to && Boolean(m.captured));
      if (caps.length === 0) break;
      caps.sort(
        (a, b) => PIECE_MATERIAL_CP[a.piece] - PIECE_MATERIAL_CP[b.piece],
      );
      const cheapest = caps[0];
      const capVal = cheapest.captured ? PIECE_MATERIAL_CP[cheapest.captured] : 0;
      if (ply === 0) hasLegalOppCaptureOnTo = true;
      gains.push(capVal);
      sim.move(cheapest);
    }

    let tailScore = 0;
    for (let i = gains.length - 1; i >= 1; i--) {
      tailScore = Math.max(0, gains[i] - tailScore);
    }
    seeOnToCp = gains[0] - tailScore;
  } catch {
    seeOnToCp = 0;
  }

  const isSoundSacrifice =
    !wasBook &&
    plyIndex >= 6 &&
    legalCount > 1 &&
    hasLegalOppCaptureOnTo &&
    seeOnToCp <= -190 &&
    winBeforeMover < 93 &&
    winAfterMover >= 50 &&
    (playedIsBest || winLoss <= 1.8);

  const moverHadForcedMate =
    before.mateIn !== null && (color === 'w' ? before.mateIn > 0 : before.mateIn < 0);
  const moverStillHasForcedMate =
    after.mateIn !== null && (color === 'w' ? after.mateIn > 0 : after.mateIn < 0);
  const oppNowHasForcedMate =
    after.mateIn !== null && (color === 'w' ? after.mateIn < 0 : after.mateIn > 0);
  const oppAlreadyHadForcedMate =
    before.mateIn !== null && (color === 'w' ? before.mateIn < 0 : before.mateIn > 0);

  const isMissedWin =
    !playedIsBest &&
    ((moverHadForcedMate && !moverStillHasForcedMate && winAfterMover < 92) ||
      (winBeforeMover >= 82 && winAfterMover <= 62));

  let quality: MoveQuality = 'Good';
  let classificationNote: string | undefined;

  if (wasBook && winLoss <= 4.5) {
    quality = 'Book';
    classificationNote = 'Standard opening theory';
  } else if (isSoundSacrifice) {
    quality = 'Brilliant';
    classificationNote = 'Sound tactical sacrifice maintaining the initiative!';
  } else if (
    !wasBook &&
    legalCount > 1 &&
    playedIsBest &&
    ((secondBestWinDrop >= 11.5 && winAfterMover >= 38) ||
      (winBeforeMover <= 42 && winAfterMover >= 50) ||
      (moverHadForcedMate && (!secondBest || secondBest.mateIn === null)))
  ) {
    quality = 'Great';
    classificationNote = 'Only move! Finds the critical continuation.';
  } else if (playedIsBest || winLoss <= 1.2 || (cpLoss <= 10 && Math.abs(evalBefore) < 5000)) {
    quality = 'Best';
  } else if (winLoss <= 5.0 && cpLoss <= 85) {
    quality = 'Good';
  } else if (winLoss <= 10.5 && cpLoss <= 165) {
    quality = 'Inaccuracy';
  } else if (
    (oppNowHasForcedMate && !oppAlreadyHadForcedMate && winBeforeMover >= 15) ||
    winLoss > 20.5
  ) {
    quality = 'Blunder';
    if (oppNowHasForcedMate && !oppAlreadyHadForcedMate) {
      classificationNote = `Allows checkmate in ${Math.abs(after.mateIn ?? 1)}`;
    } else if (isMissedWin) {
      classificationNote = `Missed win — ${bestSan} was winning`;
    }
  } else if (winLoss > 10.5 || isMissedWin) {
    quality = 'Mistake';
    if (isMissedWin) {
      classificationNote = moverHadForcedMate
        ? `Missed forced mate — ${bestSan} wins`
        : `Missed winning advantage — ${bestSan} kept control`;
    }
  }

  const accuracyPercent =
    quality === 'Book' || quality === 'Brilliant' || quality === 'Great' || quality === 'Best'
      ? computeMoveAccuracyPercent(playedIsBest ? 0 : Math.min(winLoss, 1.0))
      : computeMoveAccuracyPercent(winLoss);

  return {
    ...move,
    evalCp: evalAfter,
    mateIn: after.mateIn,
    bestMoveSan: bestSan,
    bestMoveFrom: bestFrom,
    bestMoveTo: bestTo,
    bestLineSan: before.lines[0]?.lineSan ?? [bestSan],
    cpLoss: playedIsBest ? 0 : cpLoss,
    quality,
    winChanceBefore: winBeforeMover,
    winChanceAfter: winAfterMover,
    accuracyPercent,
    isMissedWin,
    evalDepth: Math.min(before.depth || 14, after.depth || 14),
    evalSource: before.source,
    classificationNote,
  };
}
