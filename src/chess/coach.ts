import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import {
  checkBlunderFast,
  evaluateSinglePly,
  isBookPosition,
  type EvaluatedMove,
  type MoveQuality,
} from './engine';

export type CoachStrengthId = 'beginner' | 'club' | 'tournament' | 'master' | 'grandmaster';

export type CoachPersonaId = 'viktor' | 'elena' | 'dante' | 'vera';

export interface CoachProfile {
  id: CoachPersonaId;
  name: string;
  title: 'IM' | 'WGM' | 'GM';
  specialty: string;
  tagline: string;
  tone: string;
  defaultStrength: CoachStrengthId;
  accentColor: string;
}

export const COACH_PROFILES: CoachProfile[] = [
  {
    id: 'viktor',
    name: 'Coach Viktor',
    title: 'IM',
    specialty: 'Practical Tactician',
    tagline: 'Balanced opening principles, immediate blunder checks & clear endgame habits.',
    tone: 'You speak like a seasoned International Master sitting across the club table—calm, crisp, and practical.',
    defaultStrength: 'club',
    accentColor: '#81B64C',
  },
  {
    id: 'elena',
    name: 'Coach Elena',
    title: 'WGM',
    specialty: 'Patient Fundamentals',
    tagline: 'Friendly piece-safety reminders, development structure & stress-free guidance.',
    tone: 'You are a warm, encouraging Women Grandmaster focusing on piece safety, solid structure, and confidence.',
    defaultStrength: 'beginner',
    accentColor: '#5B9BD5',
  },
  {
    id: 'dante',
    name: 'Coach Dante',
    title: 'GM',
    specialty: 'Sharp Attack & Tactics',
    tagline: 'Forcing checks, gambits, king-hunt patterns & punishing passive defense.',
    tone: 'You are an energetic attacking Grandmaster spotlighting forcing moves, initiative, and tactical combinations.',
    defaultStrength: 'tournament',
    accentColor: '#E59A28',
  },
  {
    id: 'vera',
    name: 'Coach Vera',
    title: 'GM',
    specialty: 'Positional & Endgame Mastery',
    tagline: 'Outposts, weak squares, rook activity & clean technique to convert advantages.',
    tone: 'You are a disciplined endgame & positional Grandmaster highlighting weak squares, pawn breaks, and prophylaxis.',
    defaultStrength: 'master',
    accentColor: '#B27CF5',
  },
];

const SELECTED_COACH_KEY = 'openchess_active_coach_id';
const SELECTED_COACH_STRENGTH_KEY = 'openchess_active_coach_strength';

export function getCoachProfile(id?: string | null): CoachProfile {
  return COACH_PROFILES.find((c) => c.id === id) ?? COACH_PROFILES[0];
}

export function loadSelectedCoachId(): CoachPersonaId {
  try {
    const saved = localStorage.getItem(SELECTED_COACH_KEY);
    if (saved && COACH_PROFILES.some((c) => c.id === saved)) {
      return saved as CoachPersonaId;
    }
  } catch {
    // ignore
  }
  return 'viktor';
}

export function saveSelectedCoachId(id: CoachPersonaId): void {
  try {
    localStorage.setItem(SELECTED_COACH_KEY, id);
  } catch {
    // ignore
  }
}

export function loadSelectedCoachStrength(): CoachStrengthId {
  try {
    const saved = localStorage.getItem(SELECTED_COACH_STRENGTH_KEY);
    if (saved && COACH_STRENGTH_LEVELS.some((s) => s.id === saved)) {
      return saved as CoachStrengthId;
    }
  } catch {
    // ignore
  }
  return 'club';
}

export function saveSelectedCoachStrength(id: CoachStrengthId): void {
  try {
    localStorage.setItem(SELECTED_COACH_STRENGTH_KEY, id);
  } catch {
    // ignore
  }
}

export interface CoachStrengthOption {
  id: CoachStrengthId;
  label: string;
  elo: number;
  description: string;
}

export const COACH_STRENGTH_LEVELS: CoachStrengthOption[] = [
  {
    id: 'beginner',
    label: 'Beginner',
    elo: 800,
    description: 'Encouraging hints & hanging-piece alerts',
  },
  {
    id: 'club',
    label: 'Club',
    elo: 1200,
    description: 'Solid openings & tactical pattern training',
  },
  {
    id: 'tournament',
    label: 'Tournament',
    elo: 1500,
    description: 'Disciplined tactical sparring & calculation',
  },
  {
    id: 'master',
    label: 'Master',
    elo: 1850,
    description: 'Deep calculation & positional pressure',
  },
  {
    id: 'grandmaster',
    label: 'Grandmaster',
    elo: 2100,
    description: 'Unforgiving precision & sharp endgame conversion',
  },
];

export interface CoachLessonFeedback {
  san: string;
  from: string;
  to: string;
  quality: MoveQuality;
  cpLoss: number;
  headline: string;
  explanation: string;
  tacticalWarning: string | null;
  bestSan: string;
  bestFrom: string;
  bestTo: string;
  shouldPause: boolean;
  evalCp: number;
}

const PIECE_NAMES: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'knight',
  b: 'bishop',
  r: 'rook',
  q: 'queen',
  k: 'king',
};

const PIECE_WORTH: Record<PieceSymbol, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 99,
};

const CENTRAL_SQUARES = new Set(['e4', 'd4', 'e5', 'd5', 'c4', 'c5', 'f4', 'f5']);

function findHangingFriendlyPiece(chess: Chess, color: Color): { piece: PieceSymbol; square: string } | null {
  const opp: Color = color === 'w' ? 'b' : 'w';
  const board = chess.board();
  let worst: { piece: PieceSymbol; square: string; value: number } | null = null;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = board[r][c];
      if (!sq || sq.color !== color || sq.type === 'k' || sq.type === 'p') continue;
      const squareName = `${'abcdefgh'[c]}${8 - r}` as Square;
      const attacked = chess.isAttacked(squareName, opp);
      if (!attacked) continue;
      const defended = chess.isAttacked(squareName, color);
      if (!defended) {
        const val = PIECE_WORTH[sq.type];
        if (!worst || val > worst.value) {
          worst = { piece: sq.type, square: squareName, value: val };
        }
      }
    }
  }

  return worst ? { piece: worst.piece, square: worst.square } : null;
}

export function evaluateCoachStudentMove(
  fenBefore: string,
  from: string,
  to: string,
  promotion: PieceSymbol = 'q',
  plyIndex = 0,
  coachId: CoachPersonaId = 'viktor',
): CoachLessonFeedback | null {
  const beforeChess = new Chess(fenBefore);
  const afterChess = new Chess(fenBefore);
  const coach = getCoachProfile(coachId);

  let played: Move;
  try {
    const m = afterChess.move({ from, to, promotion });
    if (!m) return null;
    played = m;
  } catch {
    return null;
  }

  const skeleton: EvaluatedMove = {
    ply: plyIndex + 1,
    moveNumber: Math.floor(plyIndex / 2) + 1,
    color: played.color,
    san: played.san,
    from: played.from,
    to: played.to,
    fenBefore,
    fenAfter: afterChess.fen(),
    evalCp: 0,
    bestMoveSan: played.san,
    bestMoveFrom: played.from,
    bestMoveTo: played.to,
    cpLoss: 0,
    quality: plyIndex < 8 && isBookPosition(fenBefore) ? 'Book' : 'Good',
  };

  const evaluated = evaluateSinglePly(skeleton, plyIndex);
  const blunderHit = checkBlunderFast(fenBefore, from, to, promotion);

  let quality: MoveQuality = evaluated.quality;
  let cpLoss = evaluated.cpLoss;
  let bestSan = evaluated.bestMoveSan || played.san;
  let bestFrom = evaluated.bestMoveFrom || played.from;
  let bestTo = evaluated.bestMoveTo || played.to;

  if (blunderHit?.isBlunder) {
    cpLoss = Math.max(cpLoss, blunderHit.cpLoss);
    if (quality !== 'Blunder') {
      quality = blunderHit.cpLoss >= 200 || blunderHit.reason.includes('checkmate') ? 'Blunder' : 'Mistake';
    }
    bestSan = blunderHit.bestSan;
    bestFrom = blunderHit.bestFrom;
    bestTo = blunderHit.bestTo;
  }

  const hanging = !afterChess.isGameOver()
    ? findHangingFriendlyPiece(afterChess, played.color)
    : null;

  let tacticalWarning: string | null = null;
  if (blunderHit?.reason && blunderHit.reason.includes('checkmate')) {
    tacticalWarning = 'Watch out — that move allows checkmate on the very next turn!';
  } else if (hanging) {
    tacticalWarning = `Your ${PIECE_NAMES[hanging.piece]} on ${hanging.square} is undefended and under attack.`;
  } else if (cpLoss >= 100 && bestSan !== played.san) {
    tacticalWarning = `Playing ${bestSan} keeps about ${(cpLoss / 100).toFixed(1)} pawns stronger control.`;
  }

  const shouldPause =
    !afterChess.isCheckmate() &&
    (Boolean(blunderHit?.isBlunder) ||
      quality === 'Blunder' ||
      (quality === 'Mistake' && cpLoss >= 100));

  let headline = `${played.san} is ${quality}`;
  let explanation = '';

  if (afterChess.isCheckmate()) {
    headline = `${played.san} — Checkmate!`;
    explanation =
      coach.id === 'dante'
        ? 'Boom — clean tactical finish! You hunted the king down without giving counterplay.'
        : 'Textbook finishing blow! You spotted the mating pattern cleanly.';
  } else if (quality === 'Book') {
    headline = `${played.san} is Book`;
    explanation =
      coach.id === 'elena'
        ? 'Great opening choice — calm development and harmonious piece coordination.'
        : coach.id === 'vera'
          ? 'Principled theory — staking out central squares while keeping structure flexible.'
          : 'Strong theoretical move — developing harmoniously and fighting for the center.';
  } else if (quality === 'Brilliant' || quality === 'Great') {
    headline = `${played.san} is ${quality}!`;
    explanation =
      coach.id === 'dante'
        ? 'Sharp calculation! That forcing resource creates immediate tactical pressure.'
        : 'Excellent find! You spotted the strongest dynamic idea in the position.';
  } else if (quality === 'Best' || quality === 'Good') {
    if (played.flags.includes('k') || played.flags.includes('q')) {
      explanation =
        coach.id === 'elena'
          ? 'Lovely castling! King tucked safely away and rook ready to join the game.'
          : 'Good king safety — castling tucks your king away and activates your rook.';
    } else if (played.captured) {
      explanation = `Clean capture with ${played.san}, improving your piece balance without weakening your position.`;
    } else if (afterChess.inCheck()) {
      explanation = `Nice forcing check with ${played.san}, seizing the initiative.`;
    } else if (CENTRAL_SQUARES.has(played.to)) {
      explanation = `${played.san} stakes a claim in the center and opens lines for your pieces.`;
    } else if (played.piece === 'n' || played.piece === 'b') {
      explanation =
        coach.id === 'vera'
          ? `Clean positional improvement — placing your ${PIECE_NAMES[played.piece]} on ${played.to} controls key dark/light squares.`
          : `Solid piece placement — activating your ${PIECE_NAMES[played.piece]} to ${played.to} keeps your position flexible.`;
    } else {
      explanation = `${played.san} keeps your position balanced${bestSan !== played.san ? `, while ${bestSan} was slightly sharper` : ''}.`;
    }
  } else if (quality === 'Inaccuracy') {
    headline = `${played.san} is an Inaccuracy`;
    explanation =
      bestSan !== played.san
        ? `${played.san} lets slip a bit of momentum (-${(cpLoss / 100).toFixed(2)}). ${bestSan} kept stronger pressure.`
        : `${played.san} loses slight accuracy (-${(cpLoss / 100).toFixed(2)}). Look for more active piece play.`;
  } else {
    headline =
      quality === 'Blunder'
        ? coach.id === 'elena'
          ? `Pause & check — ${played.san} drops material`
          : `Hold on — ${played.san} is a Blunder`
        : `Careful — ${played.san} is a Mistake`;
    explanation =
      tacticalWarning ??
      `${played.san} drops ~${(cpLoss / 100).toFixed(1)} pawns. Look closely at ${bestSan} instead.`;
  }

  void beforeChess;

  return {
    san: played.san,
    from: played.from,
    to: played.to,
    quality,
    cpLoss,
    headline,
    explanation,
    tacticalWarning,
    bestSan,
    bestFrom,
    bestTo,
    shouldPause,
    evalCp: evaluated.evalCp,
  };
}

export function explainCoachReplyMove(
  fenBefore: string,
  move: Pick<Move, 'san' | 'from' | 'to' | 'piece' | 'color' | 'captured' | 'flags'>,
  plyIndex: number,
  coachId: CoachPersonaId = 'viktor',
): string {
  const probe = new Chess(fenBefore);
  const coach = getCoachProfile(coachId);
  try {
    probe.move({ from: move.from, to: move.to, promotion: 'q' });
  } catch {
    return `${coach.name} played ${move.san}.`;
  }

  const studentColor: Color = move.color === 'w' ? 'b' : 'w';
  const hangingTarget = !probe.isGameOver() ? findHangingFriendlyPiece(probe, studentColor) : null;
  const watchWarning = hangingTarget
    ? ` Watch your undefended ${PIECE_NAMES[hangingTarget.piece]} on ${hangingTarget.square}!`
    : '';

  if (probe.isCheckmate()) {
    return coach.id === 'dante'
      ? `Checkmate with ${move.san} — decisive king hunt when the lines opened!`
      : `I played ${move.san} for checkmate — notice how your king ran out of escape squares.`;
  }
  if (probe.inCheck()) {
    return coach.id === 'dante'
      ? `Check with ${move.san}! Seize the initiative — answer the king threat carefully.${watchWarning}`
      : `I played ${move.san} with check — handle the king threat first before launching another plan.${watchWarning}`;
  }
  if (move.flags.includes('k') || move.flags.includes('q')) {
    return coach.id === 'elena'
      ? `I castled (${move.san}) to keep my king cozy and link my rooks cleanly.${watchWarning}`
      : `I castled (${move.san}) to keep my king safe and bring a rook toward the center.${watchWarning}`;
  }
  if (move.captured) {
    return coach.id === 'dante'
      ? `I snapped on ${move.to} (${move.san}) to open lines and test your piece coordination.${watchWarning}`
      : `I captured with ${move.san} to relieve pressure and contest key squares.${watchWarning}`;
  }
  if (plyIndex < 10 && (move.piece === 'n' || move.piece === 'b')) {
    if (coach.id === 'dante') {
      return `I sprang my ${PIECE_NAMES[move.piece]} to ${move.to} (${move.san}) to build attacking momentum.${watchWarning}`;
    }
    if (coach.id === 'elena') {
      return `I gently developed my ${PIECE_NAMES[move.piece]} to ${move.to} (${move.san}), keeping everything protected.${watchWarning}`;
    }
    if (coach.id === 'vera') {
      return `I posted my ${PIECE_NAMES[move.piece]} on ${move.to} (${move.san}) to contest key central outposts.${watchWarning}`;
    }
    return `I developed my ${PIECE_NAMES[move.piece]} to ${move.to} (${move.san}) to fight for the center.${watchWarning}`;
  }
  if (CENTRAL_SQUARES.has(move.to)) {
    return coach.id === 'vera'
      ? `I occupied ${move.to} with ${move.san} to restrict your central breaks.${watchWarning}`
      : coach.id === 'dante'
        ? `I claimed ${move.to} with ${move.san} to open targets toward your kingside.${watchWarning}`
        : `I played ${move.san} to strengthen my grip on the center squares.${watchWarning}`;
  }
  return coach.id === 'elena'
    ? `I played ${move.san} to keep my pieces connected and ready for the next phase.${watchWarning}`
    : `I played ${move.san} to improve my piece coordination and prepare the next plan.${watchWarning}`;
}

export interface SmartMoveAnalysis {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  quality: MoveQuality;
  headline: string;
  why: string;
  betterPlan: string | null;
  tacticalAlert: string | null;
  winChanceWhite: number;
  winChanceMover: number;
  winChanceDelta: number;
  phase: 'Opening' | 'Middlegame' | 'Endgame';
  tags: string[];
}

export interface SmartGameInsights {
  summaryHeadline: string;
  coachVerdict: string;
  turningPointPly: number | null;
  turningPointText: string | null;
  bestMomentPly: number | null;
  bestMomentText: string | null;
  openingAccuracy: number | null;
  middlegameAccuracy: number | null;
  endgameAccuracy: number | null;
  keyTakeaways: string[];
}

export function cpToWhiteWinPercent(evalCp: number): number {
  const clamped = Math.max(-2500, Math.min(2500, evalCp));
  const raw = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
  return Math.max(1, Math.min(99, Math.round(raw)));
}

export function buildSmartMoveAnalysis(
  move: EvaluatedMove,
  prevMove: EvaluatedMove | null = null,
  coachId: CoachPersonaId = 'viktor',
): SmartMoveAnalysis {
  const coach = getCoachProfile(coachId);
  const movePrefix = `${move.moveNumber}.${move.color === 'b' ? '..' : ''} ${move.san}`;
  const phase: SmartMoveAnalysis['phase'] =
    move.moveNumber <= 8 ? 'Opening' : move.moveNumber <= 24 ? 'Middlegame' : 'Endgame';

  const prevEvalCp = prevMove ? prevMove.evalCp : 0;
  const whiteWinBefore = cpToWhiteWinPercent(prevEvalCp);
  const whiteWinAfter = cpToWhiteWinPercent(move.evalCp);
  const moverWinBefore = move.color === 'w' ? whiteWinBefore : 100 - whiteWinBefore;
  const moverWinAfter = move.color === 'w' ? whiteWinAfter : 100 - whiteWinAfter;
  const winChanceDelta = moverWinAfter - moverWinBefore;

  const tags: string[] = [phase];
  let hangingAfter: { piece: PieceSymbol; square: string } | null = null;
  let oppHangingAfter: { piece: PieceSymbol; square: string } | null = null;
  let isCheck = false;
  let isCheckmate = false;
  let isCapture = false;
  let isCastle = false;
  let movedPiece: PieceSymbol = 'p';

  try {
    const before = new Chess(move.fenBefore);
    const played = before.move({ from: move.from, to: move.to, promotion: 'q' });
    if (played) {
      movedPiece = played.piece;
      isCapture = Boolean(played.captured) || played.flags.includes('e');
      isCastle = played.flags.includes('k') || played.flags.includes('q');
      isCheck = before.inCheck();
      isCheckmate = before.isCheckmate();
      if (!before.isGameOver()) {
        hangingAfter = findHangingFriendlyPiece(before, move.color);
        oppHangingAfter = findHangingFriendlyPiece(before, move.color === 'w' ? 'b' : 'w');
      }
    }
  } catch {
    // fallback if FEN replay fails
  }

  if (isCheckmate) tags.push('Checkmate');
  else if (isCheck) tags.push('Forcing Check');
  if (isCastle) tags.push('King Safety');
  if (isCapture) tags.push('Material Trade');
  if (CENTRAL_SQUARES.has(move.to)) tags.push('Center Control');
  if (hangingAfter) tags.push('Hanging Piece');
  else if (oppHangingAfter) tags.push('Target Created');

  let headline = `${movePrefix} is ${move.quality}`;
  let why = '';
  let betterPlan: string | null = null;
  let tacticalAlert: string | null = null;

  if (hangingAfter) {
    tacticalAlert = `Leaves your ${PIECE_NAMES[hangingAfter.piece]} on ${hangingAfter.square} undefended!`;
  } else if (move.cpLoss >= 180 && move.bestMoveSan && move.bestMoveSan !== move.san) {
    tacticalAlert = `Drops ${Math.abs(winChanceDelta)}% win probability compared to ${move.bestMoveSan}.`;
  }

  if (isCheckmate) {
    headline = `${movePrefix} delivers Checkmate!`;
    why =
      coach.id === 'dante'
        ? 'Clinical attacking finish! Every escape square around the enemy king is sealed off.'
        : 'Decisive checkmate — your pieces coordinated cleanly to end the game on the spot.';
  } else if (move.quality === 'Book') {
    headline = `${movePrefix} is a Book Move`;
    why =
      coach.id === 'vera'
        ? 'Established opening theory that fights for central space and keeps piece structure harmonious.'
        : coach.id === 'elena'
          ? 'Solid theoretical development — brings pieces toward the action while keeping your king safe.'
          : 'Standard opening theory that contests key central squares and prepares smooth development.';
  } else if (move.quality === 'Brilliant') {
    headline = `${movePrefix} is Brilliant!!`;
    why =
      coach.id === 'dante'
        ? `Electrifying tactical resource! ${move.san} seizes the initiative and forces the opponent onto a razor’s edge.`
        : `Exceptional calculation — ${move.san} finds the sharpest dynamic idea on the board (${moverWinAfter}% win chance).`;
  } else if (move.quality === 'Great') {
    headline = `${movePrefix} is a Great Move!`;
    why = `High-impact decision in a critical position! ${move.san} shifts win probability in your favor (${moverWinAfter}%).`;
  } else if (move.quality === 'Best') {
    headline = `${movePrefix} is the Best Move`;
    if (isCastle) {
      why = 'Top engine choice: castling secures your king and activates your rook toward the central files.';
    } else if (isCheck) {
      why = `Engine’s #1 choice: ${move.san} delivers a forcing check that seizes tempo and restricts the enemy king.`;
    } else if (isCapture) {
      why = `Precision capture! ${move.san} wins or exchanges material on the most favorable terms.`;
    } else if (CENTRAL_SQUARES.has(move.to)) {
      why = `Optimal placement: ${move.san} cements control over the vital ${move.to} square and improves coordination.`;
    } else {
      why = `Exact engine preference — ${move.san} activates your ${PIECE_NAMES[movedPiece]} while keeping zero weaknesses.`;
    }
  } else if (move.quality === 'Good') {
    headline = `${movePrefix} is a Solid Move`;
    why =
      move.bestMoveSan && move.bestMoveSan !== move.san
        ? `${move.san} maintains a playable structure (${moverWinAfter}% win rate), though ${move.bestMoveSan} was slightly more incisive.`
        : `${move.san} keeps your pieces coordinated and maintains the balance of the position.`;
    if (move.bestMoveSan && move.bestMoveSan !== move.san && move.cpLoss >= 25) {
      betterPlan = `Consider ${move.bestMoveSan} (${move.bestMoveFrom}→${move.bestMoveTo}) to fight for slightly more initiative.`;
    }
  } else if (move.quality === 'Inaccuracy') {
    headline = `${movePrefix} is an Inaccuracy (?! )`;
    why = `${move.san} surrenders some momentum (-${(move.cpLoss / 100).toFixed(2)} eval, ${winChanceDelta >= 0 ? '+' : ''}${winChanceDelta}% win chance).`;
    if (move.bestMoveSan && move.bestMoveSan !== move.san) {
      betterPlan = `${coach.name} recommends ${move.bestMoveSan} (${move.bestMoveFrom}→${move.bestMoveTo}) to keep stronger piece activity.`;
    }
  } else if (move.quality === 'Mistake') {
    headline = `${movePrefix} is a Mistake (?)`;
    why =
      hangingAfter
        ? `${move.san} exposes your ${PIECE_NAMES[hangingAfter.piece]} on ${hangingAfter.square} and loses ${(move.cpLoss / 100).toFixed(2)} pawns of evaluation.`
        : `${move.san} allows immediate counterplay (-${(move.cpLoss / 100).toFixed(2)} eval, ${winChanceDelta}% win probability).`;
    if (move.bestMoveSan && move.bestMoveSan !== move.san) {
      betterPlan = `Play ${move.bestMoveSan} (${move.bestMoveFrom}→${move.bestMoveTo}) instead to defend key squares and stay in control.`;
    }
  } else {
    headline = `${movePrefix} is a Blunder (??)`;
    why =
      hangingAfter
        ? `Critical oversight — ${move.san} leaves your ${PIECE_NAMES[hangingAfter.piece]} on ${hangingAfter.square} undefended (${winChanceDelta}% win chance).`
        : `Major swing (-${(move.cpLoss / 100).toFixed(2)} eval, ${winChanceDelta}% win chance). ${move.san} misses a crucial tactical threat.`;
    if (move.bestMoveSan && move.bestMoveSan !== move.san) {
      betterPlan = `The essential resource was ${move.bestMoveSan} (${move.bestMoveFrom}→${move.bestMoveTo}), which preserves your position.`;
    }
  }

  return {
    ply: move.ply,
    moveNumber: move.moveNumber,
    color: move.color,
    san: move.san,
    quality: move.quality,
    headline,
    why,
    betterPlan,
    tacticalAlert,
    winChanceWhite: whiteWinAfter,
    winChanceMover: moverWinAfter,
    winChanceDelta,
    phase,
    tags: tags.slice(0, 3),
  };
}

function computeSubsetAccuracy(subset: EvaluatedMove[]): number | null {
  if (subset.length === 0) return null;
  const avgLoss = subset.reduce((s, m) => s + Math.min(m.cpLoss, 500), 0) / subset.length;
  return Math.max(15, Math.min(99, Math.round(100 * Math.exp(-0.0038 * avgLoss))));
}

export function buildSmartGameInsights(
  moves: EvaluatedMove[],
  playerColor: Color,
  coachId: CoachPersonaId = 'viktor',
): SmartGameInsights {
  const coach = getCoachProfile(coachId);
  const mine = moves.filter((m) => m.color === playerColor);

  if (mine.length === 0) {
    return {
      summaryHeadline: `${coach.name} is ready to review your game from Move 1`,
      coachVerdict: 'Step through the game from the opening move to see move-by-move evaluations, win probabilities, and tactical alternatives.',
      turningPointPly: null,
      turningPointText: null,
      bestMomentPly: null,
      bestMomentText: null,
      openingAccuracy: null,
      middlegameAccuracy: null,
      endgameAccuracy: null,
      keyTakeaways: ['Use Next Move or Auto-Review to walk through the game from beginning to end.'],
    };
  }

  const overallAcc = computeSubsetAccuracy(mine) ?? 80;
  const openingAccuracy = computeSubsetAccuracy(mine.filter((m) => m.moveNumber <= 8));
  const middlegameAccuracy = computeSubsetAccuracy(mine.filter((m) => m.moveNumber > 8 && m.moveNumber <= 24));
  const endgameAccuracy = computeSubsetAccuracy(mine.filter((m) => m.moveNumber > 24));

  const worstMove = [...mine].sort((a, b) => b.cpLoss - a.cpLoss)[0] ?? null;
  const turningPointPly = worstMove && worstMove.cpLoss >= 60 ? worstMove.ply : null;
  const turningPointText =
    worstMove && worstMove.cpLoss >= 60
      ? `Move ${worstMove.moveNumber}${worstMove.color === 'b' ? '...' : '.'} ${worstMove.san} (${worstMove.quality}, -${(worstMove.cpLoss / 100).toFixed(2)}) — ${worstMove.bestMoveSan} was best.`
      : null;

  const bestCandidate =
    mine.find((m) => m.quality === 'Brilliant' || m.quality === 'Great') ??
    mine.filter((m) => m.quality === 'Best' && m.moveNumber > 4)[0] ??
    mine[0] ??
    null;

  const bestMomentPly = bestCandidate ? bestCandidate.ply : null;
  const bestMomentText = bestCandidate
    ? `Move ${bestCandidate.moveNumber}${bestCandidate.color === 'b' ? '...' : '.'} ${bestCandidate.san} (${bestCandidate.quality})`
    : null;

  const blunders = mine.filter((m) => m.quality === 'Blunder').length;
  const mistakes = mine.filter((m) => m.quality === 'Mistake').length;
  const bestCount = mine.filter(
    (m) => m.quality === 'Best' || m.quality === 'Great' || m.quality === 'Brilliant' || m.quality === 'Book',
  ).length;

  let summaryHeadline = `Clinical ${overallAcc}% Accuracy Performance`;
  if (overallAcc >= 88 && blunders === 0) {
    summaryHeadline = `Masterclass Precision (${overallAcc}% Accuracy, 0 Blunders)`;
  } else if (blunders >= 2) {
    summaryHeadline = `Sharp Battle Decided by Tactical Swings (${overallAcc}% Accuracy)`;
  } else if (overallAcc >= 75) {
    summaryHeadline = `Solid Competitive Game (${overallAcc}% Accuracy)`;
  } else {
    summaryHeadline = `Tactical Learning Game (${overallAcc}% Accuracy)`;
  }

  let coachVerdict = '';
  if (blunders === 0 && mistakes <= 1) {
    coachVerdict = `${coach.name}: "You played disciplined chess from the opening through the final phase, finding ${bestCount} best/book moves without a single blunder."`;
  } else if (openingAccuracy !== null && openingAccuracy < 72) {
    coachVerdict = `${coach.name}: "Your early opening setup (${openingAccuracy}% accuracy) put you under pressure—let's step from Move 1 to lock in cleaner development."`;
  } else if (turningPointText) {
    coachVerdict = `${coach.name}: "You found ${bestCount} strong moves, but the critical swing came on ${turningPointText}"`;
  } else {
    coachVerdict = `${coach.name}: "Good competitive effort with ${bestCount} accurate moves. Walk through each phase from Move 1 to sharpen your conversion."`;
  }

  const keyTakeaways: string[] = [];
  if (openingAccuracy !== null) {
    keyTakeaways.push(
      openingAccuracy >= 82
        ? `Opening (${openingAccuracy}%): Clean theoretical start through the first 8 moves.`
        : `Opening (${openingAccuracy}%): Focus on rapid castling and central control in the first 8 moves.`,
    );
  }
  if (middlegameAccuracy !== null) {
    keyTakeaways.push(
      middlegameAccuracy >= 80
        ? `Middlegame (${middlegameAccuracy}%): Strong tactical awareness during piece clashes.`
        : `Middlegame (${middlegameAccuracy}%): Double-check undefended pieces before committing captures.`,
    );
  }
  if (endgameAccuracy !== null) {
    keyTakeaways.push(
      endgameAccuracy >= 80
        ? `Endgame (${endgameAccuracy}%): Crisp technique in the late phase.`
        : `Endgame (${endgameAccuracy}%): Activate your king and rooks earlier in simplified positions.`,
    );
  }
  if (turningPointText) {
    keyTakeaways.push(`Key review moment: ${turningPointText}`);
  }

  return {
    summaryHeadline,
    coachVerdict,
    turningPointPly,
    turningPointText,
    bestMomentPly,
    bestMomentText,
    openingAccuracy,
    middlegameAccuracy,
    endgameAccuracy,
    keyTakeaways: keyTakeaways.slice(0, 3),
  };
}

