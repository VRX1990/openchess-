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

export interface KeyMoment {
  ply: number;
  moveNumber: number;
  color: Color;
  san: string;
  bestMoveSan: string;
  quality: MoveQuality;
  kind: 'turning_point' | 'best_find' | 'missed_win' | 'blunder';
  label: string;
  evalSwingText: string;
  note: string;
}

export interface SmartGameInsights {
  summaryHeadline: string;
  coachVerdict: string;
  strengthSummary: string;
  weaknessSummary: string;
  focusDrill: string;
  turningPointPly: number | null;
  turningPointText: string | null;
  bestMomentPly: number | null;
  bestMomentText: string | null;
  openingAccuracy: number | null;
  middlegameAccuracy: number | null;
  endgameAccuracy: number | null;
  keyTakeaways: string[];
  keyMoments: KeyMoment[];
}

export function cpToWhiteWinPercent(evalCp: number): number {
  const clamped = Math.max(-2500, Math.min(2500, evalCp));
  const raw = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
  return Math.max(1, Math.min(99, Math.round(raw)));
}

function countAttackedHighValueTargets(
  chess: Chess,
  attackerSquare: Square,
  attackerColor: Color,
): { count: number; targets: string[] } {
  const opp: Color = attackerColor === 'w' ? 'b' : 'w';
  const piece = chess.get(attackerSquare);
  if (!piece) return { count: 0, targets: [] };

  const attacks = chess.moves({ square: attackerSquare, verbose: true });
  const targets: string[] = [];
  const seen = new Set<string>();

  for (const m of attacks) {
    if (!m.captured) continue;
    const victim = chess.get(m.to as Square);
    if (!victim || victim.color !== opp) continue;
    if (victim.type === 'p') continue;
    if (PIECE_WORTH[victim.type] > PIECE_WORTH[piece.type] || !chess.isAttacked(m.to as Square, opp)) {
      if (!seen.has(m.to)) {
        seen.add(m.to);
        targets.push(`${PIECE_NAMES[victim.type]} on ${m.to}`);
      }
    }
  }

  return { count: targets.length, targets };
}

function isOpenOrSemiOpenFile(chess: Chess, fileChar: string, color: Color): 'open' | 'semi-open' | null {
  const fileIdx = 'abcdefgh'.indexOf(fileChar);
  if (fileIdx < 0) return null;
  const board = chess.board();
  let friendlyPawns = 0;
  let enemyPawns = 0;
  for (let r = 0; r < 8; r++) {
    const sq = board[r][fileIdx];
    if (sq?.type === 'p') {
      if (sq.color === color) friendlyPawns++;
      else enemyPawns++;
    }
  }
  if (friendlyPawns === 0 && enemyPawns === 0) return 'open';
  if (friendlyPawns === 0 && enemyPawns > 0) return 'semi-open';
  return null;
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
  let isPromotion = false;
  let isCastle = false;
  let movedPiece: PieceSymbol = 'p';
  let capturedPiece: PieceSymbol | null = null;
  let forkTargets: string[] = [];
  let rookFileStatus: 'open' | 'semi-open' | null = null;
  let developedFromBackRank = false;

  try {
    const after = new Chess(move.fenBefore);
    const played = after.move({ from: move.from, to: move.to, promotion: 'q' });
    if (played) {
      movedPiece = played.piece;
      capturedPiece = played.captured ?? null;
      isCapture = Boolean(played.captured) || played.flags.includes('e');
      isPromotion = played.flags.includes('p') || Boolean(played.promotion);
      isCastle = played.flags.includes('k') || played.flags.includes('q');
      isCheck = after.inCheck();
      isCheckmate = after.isCheckmate();
      developedFromBackRank =
        (played.piece === 'n' || played.piece === 'b') &&
        ((played.color === 'w' && played.from.endsWith('1')) ||
          (played.color === 'b' && played.from.endsWith('8')));

      if (!after.isGameOver()) {
        hangingAfter = findHangingFriendlyPiece(after, move.color);
        oppHangingAfter = findHangingFriendlyPiece(after, move.color === 'w' ? 'b' : 'w');

        // Detect double attack / fork from the destination square (requires flipping turn or checking attacks)
        if (played.piece !== 'k' && played.piece !== 'p') {
          const fenParts = after.fen().split(' ');
          fenParts[1] = move.color;
          try {
            const probe = new Chess(fenParts.join(' '));
            const forkCheck = countAttackedHighValueTargets(probe, played.to as Square, move.color);
            if (forkCheck.count >= 2 || (isCheck && forkCheck.count >= 1)) {
              forkTargets = forkCheck.targets;
            }
          } catch {
            // ignore illegal en-passant probe if any
          }
        }

        if (played.piece === 'r') {
          rookFileStatus = isOpenOrSemiOpenFile(after, played.to[0], move.color);
        }
      }
    }
  } catch {
    // fallback if FEN replay fails
  }

  if (isCheckmate) tags.push('Checkmate');
  else if (isCheck) tags.push('Forcing Check');
  if (forkTargets.length > 0) tags.push('Double Attack');
  if (isCastle) tags.push('King Safety');
  if (isPromotion) tags.push('Promotion');
  if (rookFileStatus === 'open') tags.push('Open File');
  if (isCapture) tags.push('Capture');
  if (CENTRAL_SQUARES.has(move.to)) tags.push('Center Control');
  if (hangingAfter) tags.push('Hanging Piece');
  else if (oppHangingAfter) tags.push('Target Created');

  let headline = `${movePrefix} is ${move.quality}`;
  let why = '';
  let betterPlan: string | null = null;
  let tacticalAlert: string | null = null;

  if (hangingAfter) {
    tacticalAlert = `Leaves your ${PIECE_NAMES[hangingAfter.piece]} on ${hangingAfter.square} undefended.`;
  } else if (move.cpLoss >= 180 && move.bestMoveSan && move.bestMoveSan !== move.san) {
    tacticalAlert = `Costs ${Math.abs(winChanceDelta)}% win probability compared to ${move.bestMoveSan}.`;
  }

  const evalDropPawns = (move.cpLoss / 100).toFixed(2);
  const hasDistinctBest = Boolean(move.bestMoveSan && move.bestMoveSan !== move.san);

  if (isCheckmate) {
    headline = `${movePrefix} delivers Checkmate!`;
    why =
      coach.id === 'dante'
        ? 'Clinical finish — every escape square around the enemy king is sealed off.'
        : 'Decisive checkmate — your pieces coordinated cleanly to finish the game.';
  } else if (move.quality === 'Book') {
    headline = `${movePrefix} is Book`;
    if (isCastle) {
      why = 'Standard opening theory — tucks your king into safety and connects your rooks.';
    } else if (developedFromBackRank) {
      why = `Principled opening development — brings your ${PIECE_NAMES[movedPiece]} to ${move.to} toward the center.`;
    } else if (CENTRAL_SQUARES.has(move.to)) {
      why = `Mainline theory — claims central space on ${move.to} and opens lines for your minor pieces.`;
    } else if (isCapture) {
      why = 'Recognized theoretical capture that clarifies the center and keeps piece play smooth.';
    } else {
      why =
        coach.id === 'vera'
          ? 'Sound opening theory that keeps your pawn structure healthy and prepares active piece placement.'
          : 'Established opening move that supports development and prepares smooth middlegame play.';
    }
  } else if (move.quality === 'Brilliant') {
    headline = `${movePrefix} is Brilliant!!`;
    why =
      coach.id === 'dante'
        ? `Electrifying sacrifice! ${move.san} tears open lines and puts maximum pressure on the defense.`
        : `Rare tactical resource — ${move.san} sacrifices material on purpose to seize a decisive initiative (${moverWinAfter}% win chance).`;
  } else if (move.quality === 'Great') {
    headline = `${movePrefix} is a Great Move!`;
    why =
      forkTargets.length > 0
        ? `Sharp tactical strike! ${move.san} creates multiple threats at once (${forkTargets.slice(0, 2).join(' and ')}).`
        : isCheck
          ? `Critical forcing check! ${move.san} is the only move that keeps the advantage (${moverWinAfter}% win chance).`
          : `Clutch decision in a razor-thin moment — ${move.san} turns the position in your favor (${moverWinAfter}% win chance).`;
  } else if (move.quality === 'Best') {
    headline = `${movePrefix} is the Best Move`;
    if (forkTargets.length > 0) {
      why = `Top engine choice: ${move.san} attacks ${forkTargets.slice(0, 2).join(' and ')} simultaneously.`;
    } else if (isCastle) {
      why = 'Top engine choice: castling secures your king and activates a rook toward the center.';
    } else if (isCheck) {
      why = `Strongest continuation: ${move.san} delivers a forcing check that keeps the initiative.`;
    } else if (isPromotion) {
      why = `Decisive promotion — ${move.san} upgrades your pawn and converts the endgame advantage.`;
    } else if (isCapture && capturedPiece) {
      why = `Exact capture: removing the ${PIECE_NAMES[capturedPiece]} on ${move.to} improves your position cleanly.`;
    } else if (rookFileStatus === 'open') {
      why = `Textbook rook play: ${move.san} seizes the open ${move.to[0]}-file and creates invasion targets.`;
    } else if (developedFromBackRank) {
      why = `Ideal development: ${move.san} activates your ${PIECE_NAMES[movedPiece]} to an active square.`;
    } else if (CENTRAL_SQUARES.has(move.to)) {
      why = `Top positional choice: ${move.san} anchors your presence on ${move.to} and restricts counterplay.`;
    } else {
      why = `Exact engine preference — ${move.san} improves your ${PIECE_NAMES[movedPiece]} without creating targets.`;
    }
  } else if (move.quality === 'Good') {
    headline = `${movePrefix} is Good`;
    if (isCastle) {
      why = `Practical castling that gets your king to safety${hasDistinctBest ? `, though ${move.bestMoveSan} was slightly sharper` : ''}.`;
    } else if (rookFileStatus === 'open') {
      why = `Solid plan placing your rook on the open ${move.to[0]}-file${hasDistinctBest ? ` (${move.bestMoveSan} held a slight edge)` : ''}.`;
    } else {
      why = hasDistinctBest
        ? `${move.san} keeps a healthy structure (${moverWinAfter}% win chance), though ${move.bestMoveSan} pressed slightly harder.`
        : `${move.san} keeps your pieces coordinated and the position balanced.`;
    }
    if (hasDistinctBest && move.cpLoss >= 25) {
      betterPlan = `Stronger alternative: ${move.bestMoveSan} (${move.bestMoveFrom}→${move.bestMoveTo}) keeps tighter control.`;
    }
  } else if (move.quality === 'Inaccuracy') {
    headline = `${movePrefix} is an Inaccuracy (?!)`;
    why =
      hangingAfter
        ? `${move.san} loosens coordination and leaves your ${PIECE_NAMES[hangingAfter.piece]} on ${hangingAfter.square} exposed (-${evalDropPawns}).`
        : `${move.san} lets some pressure slip (-${evalDropPawns}, ${winChanceDelta >= 0 ? '+' : ''}${winChanceDelta}% win chance).`;
    if (hasDistinctBest) {
      betterPlan = `${coach.name} suggests ${move.bestMoveSan} (${move.bestMoveFrom}→${move.bestMoveTo}) to stay more active.`;
    }
  } else if (move.quality === 'Mistake') {
    headline = `${movePrefix} is a Mistake (?)`;
    if (move.isMissedWin && hasDistinctBest) {
      why = `${move.san} lets a winning edge slip away (-${evalDropPawns}). You had a much stronger continuation available.`;
    } else if (hangingAfter) {
      why = `${move.san} leaves your ${PIECE_NAMES[hangingAfter.piece]} on ${hangingAfter.square} undefended (-${evalDropPawns}).`;
    } else {
      why = `${move.san} concedes real counterplay (-${evalDropPawns}, ${winChanceDelta}% win chance).`;
    }
    if (hasDistinctBest) {
      betterPlan = `Play ${move.bestMoveSan} (${move.bestMoveFrom}→${move.bestMoveTo}) instead to keep control.`;
    }
  } else {
    headline = `${movePrefix} is a Blunder (??)`;
    if (
      typeof move.mateIn === 'number' &&
      (move.color === 'w' ? move.mateIn < 0 : move.mateIn > 0)
    ) {
      why = `${move.san} walks into a forced checkmate in ${Math.abs(move.mateIn)}.`;
    } else if (hangingAfter) {
      why = `Critical oversight — ${move.san} leaves your ${PIECE_NAMES[hangingAfter.piece]} on ${hangingAfter.square} hanging (${winChanceDelta}% win chance).`;
    } else if (move.isMissedWin) {
      why = `Huge swing (${winChanceDelta}% win chance) — ${move.san} gives away a decisive advantage.`;
    } else {
      why = `Major tactical swing (-${evalDropPawns}, ${winChanceDelta}% win chance) that turns the game sharply.`;
    }
    if (hasDistinctBest) {
      betterPlan = `Key save: ${move.bestMoveSan} (${move.bestMoveFrom}→${move.bestMoveTo}) holds the position together.`;
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
  if (subset.every((m) => typeof m.accuracyPercent === 'number')) {
    const avg =
      subset.reduce((s, m) => s + (m.accuracyPercent ?? 0), 0) / subset.length;
    return Math.max(0, Math.min(100, Math.round(avg * 10) / 10));
  }
  const avgLoss = subset.reduce((s, m) => s + Math.min(m.cpLoss, 500), 0) / subset.length;
  return Math.max(15, Math.min(99, Math.round(100 * Math.exp(-0.0038 * avgLoss))));
}

function formatMoveShort(m: EvaluatedMove): string {
  return `${m.moveNumber}${m.color === 'b' ? '...' : '.'} ${m.san}`;
}

export function buildSmartGameInsights(
  moves: EvaluatedMove[],
  playerColor: Color,
  coachId: CoachPersonaId = 'viktor',
): SmartGameInsights {
  const coach = getCoachProfile(coachId);
  const sideLabel = playerColor === 'w' ? 'White' : 'Black';
  const mine = moves.filter((m) => m.color === playerColor);

  if (mine.length === 0) {
    return {
      summaryHeadline: `${coach.name} is ready to review`,
      coachVerdict: 'Step through the moves to inspect key moments, best continuations, and accuracy by phase.',
      strengthSummary: 'Full opening, middlegame, and endgame scoring updates as moves are scanned.',
      weaknessSummary: 'No critical errors flagged yet.',
      focusDrill: 'Jump to the first critical swing once the scan finishes.',
      turningPointPly: null,
      turningPointText: null,
      bestMomentPly: null,
      bestMomentText: null,
      openingAccuracy: null,
      middlegameAccuracy: null,
      endgameAccuracy: null,
      keyTakeaways: ['Use Next Move or Auto-Review to walk through the game from Move 1.'],
      keyMoments: [],
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
      ? `${formatMoveShort(worstMove)} (${worstMove.quality}, -${(worstMove.cpLoss / 100).toFixed(2)}) — ${worstMove.bestMoveSan} was best.`
      : null;

  const bestCandidate =
    mine.find((m) => m.quality === 'Brilliant') ??
    mine.find((m) => m.quality === 'Great') ??
    mine.filter((m) => m.quality === 'Best' && m.moveNumber > 4)[0] ??
    mine[0] ??
    null;

  const bestMomentPly = bestCandidate ? bestCandidate.ply : null;
  const bestMomentText = bestCandidate
    ? `${formatMoveShort(bestCandidate)} (${bestCandidate.quality})`
    : null;

  const blunders = mine.filter((m) => m.quality === 'Blunder');
  const mistakes = mine.filter((m) => m.quality === 'Mistake');
  const inaccuracies = mine.filter((m) => m.quality === 'Inaccuracy');
  const missedWins = mine.filter((m) => m.isMissedWin);
  const topMoves = mine.filter(
    (m) => m.quality === 'Best' || m.quality === 'Great' || m.quality === 'Brilliant' || m.quality === 'Book',
  );
  const brilliantOrGreat = mine.filter((m) => m.quality === 'Brilliant' || m.quality === 'Great');

  // Build curated clickable Key Moments (across whole game so master/opponent swings are also visible)
  const keyMoments: KeyMoment[] = [];
  const usedPlies = new Set<number>();

  // 1. Top Tactical Find (for player first, or either side)
  const gameHighlight =
    brilliantOrGreat[0] ??
    moves.find((m) => m.quality === 'Brilliant' || m.quality === 'Great') ??
    bestCandidate;
  if (gameHighlight) {
    usedPlies.add(gameHighlight.ply);
    keyMoments.push({
      ply: gameHighlight.ply,
      moveNumber: gameHighlight.moveNumber,
      color: gameHighlight.color,
      san: gameHighlight.san,
      bestMoveSan: gameHighlight.bestMoveSan,
      quality: gameHighlight.quality,
      kind: 'best_find',
      label:
        gameHighlight.quality === 'Brilliant'
          ? 'Brilliant Find'
          : gameHighlight.quality === 'Great'
            ? 'Great Move'
            : 'Best Find',
      evalSwingText: `${gameHighlight.evalCp >= 0 ? '+' : ''}${(gameHighlight.evalCp / 100).toFixed(2)}`,
      note:
        gameHighlight.classificationNote ||
        `Cleanest move on the board (${gameHighlight.color === 'w' ? 'White' : 'Black'}).`,
    });
  }

  // 2. Missed Win (if any)
  const firstMissedWin = missedWins[0] ?? moves.find((m) => m.isMissedWin);
  if (firstMissedWin && !usedPlies.has(firstMissedWin.ply)) {
    usedPlies.add(firstMissedWin.ply);
    keyMoments.push({
      ply: firstMissedWin.ply,
      moveNumber: firstMissedWin.moveNumber,
      color: firstMissedWin.color,
      san: firstMissedWin.san,
      bestMoveSan: firstMissedWin.bestMoveSan,
      quality: firstMissedWin.quality,
      kind: 'missed_win',
      label: 'Missed Win',
      evalSwingText: `-${(firstMissedWin.cpLoss / 100).toFixed(2)}`,
      note: `${firstMissedWin.bestMoveSan} kept a decisive winning edge.`,
    });
  }

  // 3. Biggest Turning Point / Error for player
  if (worstMove && worstMove.cpLoss >= 60 && !usedPlies.has(worstMove.ply)) {
    usedPlies.add(worstMove.ply);
    keyMoments.push({
      ply: worstMove.ply,
      moveNumber: worstMove.moveNumber,
      color: worstMove.color,
      san: worstMove.san,
      bestMoveSan: worstMove.bestMoveSan,
      quality: worstMove.quality,
      kind: worstMove.quality === 'Blunder' ? 'blunder' : 'turning_point',
      label: worstMove.quality === 'Blunder' ? 'Critical Blunder' : 'Turning Point',
      evalSwingText: `-${(worstMove.cpLoss / 100).toFixed(2)}`,
      note: `${worstMove.bestMoveSan} kept the balance; ${worstMove.san} gave counterplay.`,
    });
  }

  // 4. Biggest opponent mistake if player didn't have enough swings
  if (keyMoments.length < 3) {
    const oppSwing = [...moves]
      .filter((m) => !usedPlies.has(m.ply) && (m.quality === 'Blunder' || m.quality === 'Mistake'))
      .sort((a, b) => b.cpLoss - a.cpLoss)[0];
    if (oppSwing) {
      usedPlies.add(oppSwing.ply);
      keyMoments.push({
        ply: oppSwing.ply,
        moveNumber: oppSwing.moveNumber,
        color: oppSwing.color,
        san: oppSwing.san,
        bestMoveSan: oppSwing.bestMoveSan,
        quality: oppSwing.quality,
        kind: oppSwing.quality === 'Blunder' ? 'blunder' : 'turning_point',
        label: `${oppSwing.color === 'w' ? 'White' : 'Black'} Slip`,
        evalSwingText: `-${(oppSwing.cpLoss / 100).toFixed(2)}`,
        note: `Best reply was ${oppSwing.bestMoveSan}.`,
      });
    }
  }

  keyMoments.sort((a, b) => a.ply - b.ply);

  // Headline
  let summaryHeadline = `${sideLabel} · ${overallAcc}% Accuracy`;
  if (overallAcc >= 88 && blunders.length === 0) {
    summaryHeadline = `${sideLabel} · Clinical ${overallAcc}% Precision`;
  } else if (blunders.length >= 2) {
    summaryHeadline = `${sideLabel} · High-Variance Battle (${overallAcc}%)`;
  } else if (missedWins.length > 0) {
    summaryHeadline = `${sideLabel} · Missed Finishing Blow (${overallAcc}%)`;
  } else if (overallAcc >= 75) {
    summaryHeadline = `${sideLabel} · Solid ${overallAcc}% Performance`;
  } else {
    summaryHeadline = `${sideLabel} · ${overallAcc}% (Tactical Review Ready)`;
  }

  // Persona-specific coach verdict citing concrete moves
  let coachVerdict = '';
  if (blunders.length === 0 && mistakes.length <= 1) {
    coachVerdict =
      coach.id === 'dante'
        ? `Sharp, clean chess! You found ${topMoves.length} top moves${bestCandidate ? `, highlighted by ${formatMoveShort(bestCandidate)}` : ''}, without giving your opponent a free blunder.`
        : coach.id === 'vera'
          ? `Very disciplined control across ${mine.length} moves. Keeping blunders at zero allowed your structure to speak${bestCandidate ? `, especially around ${formatMoveShort(bestCandidate)}` : ''}.`
          : `Clean game with ${topMoves.length} strong/book moves and zero blunders${bestCandidate ? ` — ${formatMoveShort(bestCandidate)} stood out` : ''}.`;
  } else if (firstMissedWin && firstMissedWin.color === playerColor) {
    coachVerdict =
      coach.id === 'dante'
        ? `You built a winning attack, but let the knockout slip on ${formatMoveShort(firstMissedWin)} when ${firstMissedWin.bestMoveSan} closed the door.`
        : `You outplayed the position early, then missed conversion on ${formatMoveShort(firstMissedWin)} — ${firstMissedWin.bestMoveSan} kept a decisive edge.`;
  } else if (openingAccuracy !== null && openingAccuracy < 72) {
    coachVerdict =
      coach.id === 'elena'
        ? `The opening phase (${openingAccuracy}%) forced you onto the back foot early. Slow down around your first 8 moves to finish development cleanly.`
        : `Early drift in the opening (${openingAccuracy}% accuracy) put unnecessary pressure on your middlegame${worstMove ? `, peaking at ${formatMoveShort(worstMove)}` : ''}.`;
  } else if (worstMove && worstMove.cpLoss >= 90) {
    coachVerdict =
      coach.id === 'vera'
        ? `Most of your structure held together well, but ${formatMoveShort(worstMove)} swung the balance by ${(worstMove.cpLoss / 100).toFixed(1)} pawns (${worstMove.bestMoveSan} was needed).`
        : `You played ${topMoves.length} accurate moves, and the game hinged on ${formatMoveShort(worstMove)} where ${worstMove.bestMoveSan} kept you in control.`;
  } else {
    coachVerdict = `Competitive effort with ${topMoves.length} accurate moves across ${mine.length} turns. Review the ${mistakes.length + inaccuracies.length} soft moments to tighten up.`;
  }

  // Strength summary
  const bestPhase = [
    { name: 'opening', acc: openingAccuracy },
    { name: 'middlegame', acc: middlegameAccuracy },
    { name: 'endgame', acc: endgameAccuracy },
  ]
    .filter((p): p is { name: string; acc: number } => p.acc !== null)
    .sort((a, b) => b.acc - a.acc)[0];

  const strengthSummary =
    brilliantOrGreat.length > 0
      ? `Spotted ${brilliantOrGreat.length} critical tactical resource${brilliantOrGreat.length > 1 ? 's' : ''} (${formatMoveShort(brilliantOrGreat[0])}) and averaged ${overallAcc}% overall.`
      : bestPhase && bestPhase.acc >= 80
        ? `Strongest in the ${bestPhase.name} (${bestPhase.acc}% accuracy) with ${topMoves.length} engine-grade moves.`
        : `Found ${topMoves.length} top/book choices across ${mine.length} moves and kept pressure alive.`;

  // Weakness / Priority Fix summary
  const weakPhase = [
    { name: 'Opening', acc: openingAccuracy },
    { name: 'Middlegame', acc: middlegameAccuracy },
    { name: 'Endgame', acc: endgameAccuracy },
  ]
    .filter((p): p is { name: string; acc: number } => p.acc !== null)
    .sort((a, b) => a.acc - b.acc)[0];

  const weaknessSummary =
    worstMove && worstMove.cpLoss >= 85
      ? `Check ${formatMoveShort(worstMove)} (${worstMove.quality}): ${worstMove.bestMoveSan} avoided a ${(worstMove.cpLoss / 100).toFixed(2)}-pawn swing.`
      : weakPhase && weakPhase.acc < 78
        ? `${weakPhase.name} accuracy dipped to ${weakPhase.acc}% — tighten candidate checks in this phase.`
        : inaccuracies.length > 0
          ? `${inaccuracies.length} minor inaccuracies slightly eased pressure; look for sharper piece activity.`
          : 'Very few weaknesses — focus on converting small advantages faster.';

  // Concrete drill
  const focusDrill =
    blunders.length > 0
      ? `Retry ${formatMoveShort(blunders[0])} on the board first, and scan checks, captures, and hanging pieces before locking in.`
      : missedWins.length > 0
        ? `Walk through ${formatMoveShort(missedWins[0])} with engine lines on to train finishing combinations.`
        : openingAccuracy !== null && openingAccuracy < 75
          ? 'Review Moves 1–8 against the engine lines to lock in faster piece development and castling.'
          : 'Compare your middlegame candidate moves against the top 2 engine lines on critical turns.';

  const keyTakeaways: string[] = [strengthSummary, weaknessSummary];
  if (turningPointText) {
    keyTakeaways.push(`Key turning point: ${turningPointText}`);
  }

  return {
    summaryHeadline,
    coachVerdict,
    strengthSummary,
    weaknessSummary,
    focusDrill,
    turningPointPly,
    turningPointText,
    bestMomentPly,
    bestMomentText,
    openingAccuracy,
    middlegameAccuracy,
    endgameAccuracy,
    keyTakeaways: keyTakeaways.slice(0, 3),
    keyMoments: keyMoments.slice(0, 4),
  };
}


