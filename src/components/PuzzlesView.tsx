import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type PieceSymbol } from 'chess.js';
import {
  CheckCircle2,
  Flame,
  Lightbulb,
  RotateCcw,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Grid2x2,
  MessageSquare,
  RefreshCw,
  BookOpen,
  BarChart3,
  History,
  Calendar,
  Trophy,
  X,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Search,
  SearchCheck,
  Volume2,
  VolumeX,
  Heart,
} from 'lucide-react';
import { PUZZLES, type ChessPuzzle } from '../chess/content';
import type { LichessAccount, NormalizedLichessPuzzle } from '../chess/lichess';
import { evaluatePosition } from '../chess/engine';
import {
  getPuzzleAccuracy,
  loadPuzzleHistory,
  loadPuzzleStats,
  loadRushBest,
  mergePuzzleSyncStats,
  recordPuzzleHistoryEntry,
  recordPuzzleResult,
  savePuzzleStats,
  saveRushBest,
  type PuzzleHistoryEntry,
  type PuzzlePlayerStats,
} from '../chess/analytics';
import { playErrorSound, playGameOverSound, playMoveSound, playSuccessSound, setSoundMuted } from '../chess/sound';
import { ChessBoard, type BoardTheme } from './ChessBoard';
import { CoachWorkspace } from './CoachWorkspace';
import { BottomSheet } from './BottomSheet';
import { BotAvatar } from './BotAvatar';
import { DailyPuzzleIcon, NavPuzzlesIcon } from './ChessIcons';

interface PuzzlesViewProps {
  boardTheme: BoardTheme;
  syncedPuzzleRating?: number;
  syncedPuzzleGames?: number;
  syncedStormHigh?: number;
  syncedStreakHigh?: number;
  lichessToken?: string | null;
  hasOnlineToken?: boolean;
  lastSyncedAt?: number;
  username?: string | null;
  onPuzzleSolved: () => void;
  onRecordAccountResult?: (params: {
    category: 'puzzle';
    outcome: 'win' | 'loss';
    opponentRating?: number;
  }) => void;
  onSyncPuzzleProgress?: (progress: {
    rating?: number;
    solvedDelta?: number;
    stormScore?: number;
    streakScore?: number;
  }) => void;
  onSubmitRealPuzzleResult?: (params: {
    puzzleId: string;
    win: boolean;
    angle?: string;
  }) => Promise<LichessAccount | null>;
}

type PuzzleViewMode =
  | 'hub'
  | 'solve'
  | 'legacy'
  | 'themes'
  | 'openings'
  | 'streak'
  | 'storm'
  | 'dashboard'
  | 'history';

type ActivePuzzleItem = ChessPuzzle & {
  lastMove?: { from: string; to: string } | null;
  playersSummary?: string;
  plays?: number;
  themes?: string[];
};

type PuzzleThemeId = string;

interface PuzzleThemeItem {
  id: string;
  label: string;
  desc: string;
}

interface PuzzleThemeCategory {
  id: string;
  title: string;
  items: PuzzleThemeItem[];
}

const PUZZLE_THEME_CATEGORIES: PuzzleThemeCategory[] = [
  {
    id: 'phases',
    title: 'Phases',
    items: [
      {
        id: 'opening',
        label: 'Opening',
        desc: 'Tactics arising during the initial development phase of the game.',
      },
      {
        id: 'middlegame',
        label: 'Middlegame',
        desc: 'Complex tactical clashes during the main battle phase.',
      },
      {
        id: 'endgame',
        label: 'Endgame',
        desc: 'Tactics in simplified positions where every tempo counts.',
      },
      {
        id: 'rookEndgame',
        label: 'Rook endgame',
        desc: 'An endgame with only rooks and pawns.',
      },
      {
        id: 'bishopEndgame',
        label: 'Bishop endgame',
        desc: 'An endgame with only bishops and pawns.',
      },
      {
        id: 'pawnEndgame',
        label: 'Pawn endgame',
        desc: 'An endgame with only kings and pawns.',
      },
      {
        id: 'knightEndgame',
        label: 'Knight endgame',
        desc: 'An endgame with only knights and pawns.',
      },
      {
        id: 'queenEndgame',
        label: 'Queen endgame',
        desc: 'An endgame with only queens and pawns.',
      },
      {
        id: 'queenRookEndgame',
        label: 'Queen and Rook',
        desc: 'An endgame with queens, rooks, and pawns.',
      },
    ],
  },
  {
    id: 'motifs',
    title: 'Motifs',
    items: [
      {
        id: 'advancedPawn',
        label: 'Advanced pawn',
        desc: 'One of your pawns is deep in the opponent position, threatening to promote.',
      },
      {
        id: 'attackingF2F7',
        label: 'Attacking f2 or f7',
        desc: 'An attack focusing on the vulnerable f2 or f7 square.',
      },
      {
        id: 'capturingDefender',
        label: 'Capture the defender',
        desc: 'Remove a piece that is critical to defence of another piece.',
      },
      {
        id: 'discoveredAttack',
        label: 'Discovered attack',
        desc: 'Moving a piece that previously blocked an attack by another long-range piece.',
      },
      {
        id: 'doubleCheck',
        label: 'Double check',
        desc: 'Checking with two pieces at once as a result of a discovered attack.',
      },
      {
        id: 'exposedKing',
        label: 'Exposed king',
        desc: 'A tactic involving a king with few defenders around it, often leading to checkmate.',
      },
      {
        id: 'fork',
        label: 'Fork',
        desc: 'A move where the moved piece attacks two opponent pieces at once.',
      },
      {
        id: 'hangingPiece',
        label: 'Hanging piece',
        desc: 'A tactic involving an opponent piece being undefended or insufficiently defended.',
      },
      {
        id: 'kingsideAttack',
        label: 'Kingside attack',
        desc: 'An attack on the opponent king after they castled on the kingside.',
      },
      {
        id: 'pin',
        label: 'Pin',
        desc: 'A tactic involving pins, where a piece is unable to move without revealing an attack on a higher value piece.',
      },
      {
        id: 'queensideAttack',
        label: 'Queenside attack',
        desc: 'An attack on the opponent king after they castled on the queenside.',
      },
      {
        id: 'sacrifice',
        label: 'Sacrifice',
        desc: 'A tactic involving giving up material in the short-term to gain an advantage.',
      },
      {
        id: 'skewer',
        label: 'Skewer',
        desc: 'A motif where a high-value piece is attacked, moves out of the way, and allows a lower-value piece behind it to be captured.',
      },
      {
        id: 'trappedPiece',
        label: 'Trapped piece',
        desc: 'A piece is unable to escape capture as it has limited moves.',
      },
    ],
  },
  {
    id: 'advanced',
    title: 'Advanced',
    items: [
      {
        id: 'attraction',
        label: 'Attraction',
        desc: 'An exchange or sacrifice encouraging or forcing an opponent piece to a square that allows a follow-up tactic.',
      },
      {
        id: 'clearance',
        label: 'Clearance',
        desc: 'A move, often with tempo, that clears a square, file or diagonal for a follow-up tactical idea.',
      },
      {
        id: 'defensiveMove',
        label: 'Defensive move',
        desc: 'A precise move or sequence of moves that is needed to avoid losing material or another advantage.',
      },
      {
        id: 'deflection',
        label: 'Deflection',
        desc: 'A move that distracts an opponent piece from another duty that it performs, such as guarding a key square.',
      },
      {
        id: 'interference',
        label: 'Interference',
        desc: 'Moving a piece between two opponent pieces to leave one or both opponent pieces undefended.',
      },
      {
        id: 'intermezzo',
        label: 'Intermezzo',
        desc: 'Instead of playing the expected move, first interpose another move that poses an immediate threat.',
      },
      {
        id: 'quietMove',
        label: 'Quiet move',
        desc: 'A move that does not make a check or capture, but prepares an unavoidable threat for a later move.',
      },
      {
        id: 'xRayAttack',
        label: 'X-Ray attack',
        desc: 'A piece attacks or defends a square through an enemy piece.',
      },
      {
        id: 'zugzwang',
        label: 'Zugzwang',
        desc: 'The opponent is limited in the moves they can make, and all movesthey have worsen their position.',
      },
    ],
  },
  {
    id: 'mates',
    title: 'Mates',
    items: [
      {
        id: 'mate',
        label: 'Checkmate',
        desc: 'Win the game with style.',
      },
      {
        id: 'mateIn1',
        label: 'Mate in 1',
        desc: 'Deliver checkmate in one move.',
      },
      {
        id: 'mateIn2',
        label: 'Mate in 2',
        desc: 'Deliver checkmate in two moves.',
      },
      {
        id: 'mateIn3',
        label: 'Mate in 3',
        desc: 'Deliver checkmate in three moves.',
      },
      {
        id: 'mateIn4',
        label: 'Mate in 4',
        desc: 'Deliver checkmate in four moves.',
      },
      {
        id: 'mateIn5',
        label: 'Mate in 5 or more',
        desc: 'Figure out a long mating sequence.',
      },
    ],
  },
  {
    id: 'mateThemes',
    title: 'Mate themes',
    items: [
      {
        id: 'anastasiaMate',
        label: "Anastasia's mate",
        desc: 'A knight and rook or queen team up to trap the opposing king between the side of the board and a friendly piece.',
      },
      {
        id: 'arabianMate',
        label: 'Arabian mate',
        desc: 'A knight and a rook team up to trap the opposing king on a corner of the board.',
      },
      {
        id: 'backRankMate',
        label: 'Back rank mate',
        desc: 'Checkmate the king on the home rank when it is trapped there by its own pieces.',
      },
      {
        id: 'bodenMate',
        label: "Boden's mate",
        desc: 'Two attacking bishops on criss-crossing diagonals deliver mate to a king obstructed by friendly pieces.',
      },
      {
        id: 'doubleBishopMate',
        label: 'Double bishop mate',
        desc: 'Two attacking bishops on adjacent diagonals deliver mate to a king obstructed by friendly pieces.',
      },
      {
        id: 'dovetailMate',
        label: 'Dovetail mate',
        desc: 'A queen delivers mate to an adjacent king, whose only two escape squares are obstructed by friendly pieces.',
      },
      {
        id: 'hookMate',
        label: 'Hook mate',
        desc: 'Checkmate with a rook, knight, and pawn along with one enemy pawn to limit the enemy king escape.',
      },
      {
        id: 'killBoxMate',
        label: 'Kill box mate',
        desc: 'A rook is next to the enemy king and supported by a queen that also blocks the king escape squares.',
      },
      {
        id: 'operaMate',
        label: 'Opera mate',
        desc: 'Checkmate the king with a rook and a bishop on the back rank.',
      },
      {
        id: 'smotheredMate',
        label: 'Smothered mate',
        desc: 'A knight delivers checkmate to a king that is surrounded by its own pieces.',
      },
      {
        id: 'vukovicMate',
        label: "Vukovic's mate",
        desc: 'A rook and knight team up to mate the king on the edge of the board.',
      },
    ],
  },
  {
    id: 'specialMoves',
    title: 'Special moves',
    items: [
      {
        id: 'castling',
        label: 'Castling',
        desc: 'Bring the king to safety, and deploy the rook for attack.',
      },
      {
        id: 'enPassant',
        label: 'En passant',
        desc: 'A tactic involving the en passant rule, where a pawn can take an opponent pawn that has bypassed it using its initial two-square move.',
      },
      {
        id: 'promotion',
        label: 'Promotion',
        desc: 'Promote one of your pawns to a queen or minor piece.',
      },
      {
        id: 'underPromotion',
        label: 'Underpromotion',
        desc: 'Promote a pawn to a knight, bishop, or rook instead of a queen.',
      },
    ],
  },
  {
    id: 'goals',
    title: 'Goals',
    items: [
      {
        id: 'equality',
        label: 'Equality',
        desc: 'Come back from a losing position, and secure a draw or a balanced position.',
      },
      {
        id: 'advantage',
        label: 'Advantage',
        desc: 'Seize your chance to get a decisive advantage. (200cp ≤ eval ≤ 600cp)',
      },
      {
        id: 'crushing',
        label: 'Crushing',
        desc: 'Spot the opponent blunder to obtain a crushing advantage. (eval ≥ 600cp)',
      },
    ],
  },
  {
    id: 'lengths',
    title: 'Lengths',
    items: [
      {
        id: 'oneMove',
        label: 'One-move puzzle',
        desc: 'A puzzle that is only one move long.',
      },
      {
        id: 'short',
        label: 'Short puzzle',
        desc: 'Two moves to win.',
      },
      {
        id: 'long',
        label: 'Long puzzle',
        desc: 'Three moves to win.',
      },
      {
        id: 'veryLong',
        label: 'Very long puzzle',
        desc: 'Four moves or more to win.',
      },
    ],
  },
  {
    id: 'origin',
    title: 'Origin',
    items: [
      {
        id: 'master',
        label: 'Master games',
        desc: 'Puzzles from games played by titled players.',
      },
      {
        id: 'masterVsMaster',
        label: 'Master vs Master games',
        desc: 'Puzzles from games between two titled players.',
      },
      {
        id: 'superGM',
        label: 'Super GM games',
        desc: 'Puzzles from games played by the best players in the world.',
      },
      {
        id: 'legacy',
        label: 'Legacy',
        desc: 'Switch to the classic OpenChess puzzles layout.',
      },
    ],
  },
];

const PUZZLE_OPENINGS: PuzzleThemeItem[] = [
  {
    id: 'Sicilian_Defense',
    label: 'Sicilian Defense',
    desc: '1. e4 c5 — Sharp, asymmetrical battles from the most popular reply to 1.e4.',
  },
  {
    id: 'French_Defense',
    label: 'French Defense',
    desc: '1. e4 e6 — Resilient pawn chains and counterattacks against the center.',
  },
  {
    id: 'Queens_Pawn_Game',
    label: "Queen's Pawn Game",
    desc: '1. d4 — Strategic and tactical motifs from Queen pawn structures.',
  },
  {
    id: 'Italian_Game',
    label: 'Italian Game',
    desc: '1. e4 e5 2. Nf3 Nc6 3. Bc4 — Rapid development and f7 tactical strikes.',
  },
  {
    id: 'Caro-Kann_Defense',
    label: 'Caro-Kann Defense',
    desc: '1. e4 c6 — Solid central control with active piece counterplay.',
  },
  {
    id: 'Scandinavian_Defense',
    label: 'Scandinavian Defense',
    desc: '1. e4 d5 — Immediate central confrontation and open lines.',
  },
  {
    id: 'Queens_Gambit_Declined',
    label: "Queen's Gambit Declined",
    desc: '1. d4 d5 2. c4 e6 — Classical central tension and minority attack tactics.',
  },
  {
    id: 'Ruy_Lopez',
    label: 'Ruy Lopez',
    desc: '1. e4 e5 2. Nf3 Nc6 3. Bb5 — Rich Spanish torture and central breaks.',
  },
  {
    id: 'English_Opening',
    label: 'English Opening',
    desc: '1. c4 — Flank pressure on d5 and long diagonal bishop tactics.',
  },
  {
    id: 'Indian_Defense',
    label: 'Indian Defense',
    desc: '1. d4 Nf6 — Hypermodern piece pressure and dynamic pawn breaks.',
  },
  {
    id: 'Scotch_Game',
    label: 'Scotch Game',
    desc: '1. e4 e5 2. Nf3 Nc6 3. d4 — Open center and immediate tactical lines.',
  },
  {
    id: 'Philidor_Defense',
    label: 'Philidor Defense',
    desc: '1. e4 e5 2. Nf3 d6 — Compact defense and sudden counter-strikes.',
  },
  {
    id: 'Pirc_Defense',
    label: 'Pirc Defense',
    desc: '1. e4 d6 2. d4 Nf6 — Kingside fianchetto and counterattacking the center.',
  },
  {
    id: 'Four_Knights_Game',
    label: 'Four Knights Game',
    desc: '1. e4 e5 2. Nf3 Nc6 3. Nc3 Nf6 — Symmetrical development with hidden forks and pins.',
  },
  {
    id: 'Kings_Gambit',
    label: "King's Gambit",
    desc: '1. e4 e5 2. f4 — Romantic f-file sacrifices and king hunts.',
  },
  {
    id: 'Vienna_Game',
    label: 'Vienna Game',
    desc: '1. e4 e5 2. Nc3 — Flexible knights and delayed f4 attacks.',
  },
  {
    id: 'Slav_Defense',
    label: 'Slav Defense',
    desc: '1. d4 d5 2. c4 c6 — Solid d5 support with active light-squared bishop play.',
  },
  {
    id: 'Alekhine_Defense',
    label: 'Alekhine Defense',
    desc: '1. e4 Nf6 — Provoking White pawns forward to become tactical targets.',
  },
  {
    id: 'Nimzo-Indian_Defense',
    label: 'Nimzo-Indian Defense',
    desc: '1. d4 Nf6 2. c4 e6 3. Nc3 Bb4 — Pinning the knight to fight for e4.',
  },
  {
    id: 'Kings_Indian_Defense',
    label: "King's Indian Defense",
    desc: '1. d4 Nf6 2. c4 g6 — Fierce kingside pawn storms and tactical sacrifices.',
  },
  {
    id: 'Dutch_Defense',
    label: 'Dutch Defense',
    desc: '1. d4 f5 — Asymmetric fight for e4 and kingside attacking chances.',
  },
  {
    id: 'Catalan_Opening',
    label: 'Catalan Opening',
    desc: '1. d4 Nf6 2. c4 e6 3. g3 — Long-diagonal pressure that creates tactical pins.',
  },
  {
    id: 'Benoni_Defense',
    label: 'Benoni Defense',
    desc: '1. d4 Nf6 2. c4 c5 — Dynamic counterplay with a queenside majority.',
  },
  {
    id: 'Bird_Opening',
    label: 'Bird Opening',
    desc: '1. f4 — Controlling e5 and launching kingside attacks.',
  },
  {
    id: 'Center_Game',
    label: 'Center Game',
    desc: '1. e4 e5 2. d4 exd4 — Early queen activity and opposite-side castling attacks.',
  },
];

function AppleArrowIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M12 4.5c1.1-1.3 2.7-1.6 3.5-1.4-.1 1-.6 2.1-1.8 2.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M12 7c-3.2 0-5.5 2.3-5.5 5.6 0 3.7 2.5 6.9 5.5 6.9s5.5-3.2 5.5-6.9C17.5 9.3 15.2 7 12 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="M4 4l16 16M20 20v-4.5M20 20h-4.5"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StormTornadoIcon({ className = 'w-6 h-6' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d="M3 5h18M5 9h15M7 13h11M9 17h7M11 21h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

const LEGACY_QUICK_THEMES: Array<{ id: string; label: string }> = [
  { id: 'daily', label: 'Daily Puzzle' },
  { id: 'next', label: 'Healthy Mix' },
  { id: 'attraction', label: 'Attraction' },
  { id: 'fork', label: 'Fork' },
  { id: 'pin', label: 'Pin' },
  { id: 'skewer', label: 'Skewer' },
  { id: 'discoveredAttack', label: 'Discovered Attack' },
  { id: 'mateIn1', label: 'Mate in 1' },
  { id: 'mateIn2', label: 'Mate in 2' },
  { id: 'backRankMate', label: 'Back Rank' },
  { id: 'endgame', label: 'Endgame' },
];

export function PuzzlesView({
  boardTheme,
  syncedPuzzleRating,
  syncedPuzzleGames,
  syncedStormHigh,
  syncedStreakHigh,
  lichessToken = null,
  hasOnlineToken = false,
  lastSyncedAt = 0,
  username,
  onPuzzleSolved,
  onRecordAccountResult,
  onSyncPuzzleProgress,
  onSubmitRealPuzzleResult,
}: PuzzlesViewProps) {
  const [viewMode, setViewMode] = useState<PuzzleViewMode>('solve');
  const [puzzleTheme, setPuzzleTheme] = useState<PuzzleThemeId>('daily');
  const [themeSearchQuery, setThemeSearchQuery] = useState('');
  const [openingSearchQuery, setOpeningSearchQuery] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [puzzleQueue, setPuzzleQueue] = useState<ActivePuzzleItem[]>(() => [...PUZZLES]);
  const [puzzleIdx, setPuzzleIdx] = useState(0);
  const [puzzleLoading, setPuzzleLoading] = useState(false);
  const [puzzleError, setPuzzleError] = useState<string | null>(null);

  const [dailyPuzzle, setDailyPuzzle] = useState<ActivePuzzleItem>(() => ({
    ...PUZZLES[0],
    plays: 66913,
  }));
  const [healthyMixPreview, setHealthyMixPreview] = useState<ActivePuzzleItem>(
    () => PUZZLES[1] ?? PUZZLES[0],
  );
  const [attractionPreview, setAttractionPreview] = useState<ActivePuzzleItem>(
    () => PUZZLES.find((p) => p.motif === 'Attraction') ?? PUZZLES[0],
  );

  // Puzzle Storm (3-minute timed blitz tactics)
  const [stormPhase, setStormPhase] = useState<'idle' | 'active' | 'done'>('idle');
  const [stormQueue, setStormQueue] = useState<ActivePuzzleItem[]>([]);
  const [stormIdx, setStormIdx] = useState(0);
  const [stormScore, setStormScore] = useState(0);
  const [stormStrikes, setStormStrikes] = useState(0);
  const [stormSeconds, setStormSeconds] = useState(180);
  const [stormBest, setStormBest] = useState<number>(() =>
    Math.max(loadRushBest(), syncedStormHigh ?? 0),
  );

  // Puzzle Streak (progressive difficulty, 1 mistake ends run)
  const [streakPhase, setStreakPhase] = useState<'active' | 'ended'>('active');
  const [streakQueue, setStreakQueue] = useState<ActivePuzzleItem[]>([]);
  const [streakIdx, setStreakIdx] = useState(0);
  const [streakRunCount, setStreakRunCount] = useState(0);

  // Puzzle History
  const [puzzleHistory, setPuzzleHistory] = useState<PuzzleHistoryEntry[]>(() =>
    loadPuzzleHistory(),
  );

  const activePuzzle: ActivePuzzleItem = useMemo(() => {
    if (viewMode === 'storm' && stormQueue[stormIdx]) {
      return stormQueue[stormIdx];
    }
    if (viewMode === 'streak' && streakQueue[streakIdx]) {
      return streakQueue[streakIdx];
    }
    return puzzleQueue[puzzleIdx] ?? PUZZLES[0];
  }, [puzzleIdx, puzzleQueue, stormIdx, stormQueue, streakIdx, streakQueue, viewMode]);

  const [fen, setFen] = useState(activePuzzle.fen);
  const [solutionStep, setSolutionStep] = useState(0);
  const [status, setStatus] = useState<'solving' | 'wrong' | 'solved'>('solving');
  const [puzzleBadge, setPuzzleBadge] = useState<{
    square: string;
    status: 'correct' | 'wrong';
  } | null>(null);
  const [dailyLives, setDailyLives] = useState(5);
  const [soundOff, setSoundOff] = useState(false);
  const [hintSquares, setHintSquares] = useState<{ from?: string; to?: string } | null>(null);
  const [hintArrow, setHintArrow] = useState<{ from: string; to: string } | null>(null);
  const [lastMove, setLastMove] = useState<{
    from: string;
    to: string;
    captured?: boolean;
  } | null>(activePuzzle.lastMove ?? null);
  const [rightTab, setRightTab] = useState<'puzzle' | 'tutor'>('puzzle');
  const [mobileSheet, setMobileSheet] = useState<'none' | 'list' | 'tutor'>('none');

  const [puzzleStats, setPuzzleStats] = useState<PuzzlePlayerStats>(() => loadPuzzleStats());
  const [solvedDelta, setSolvedDelta] = useState<number | null>(null);

  const hadWrongAttemptRef = useRef(false);
  const userInteractedRef = useRef(false);
  const stormScoreRef = useRef(0);
  const seenPuzzleIdsRef = useRef<Set<string>>(new Set());
  const prevSyncedPuzzleRatingRef = useRef<number | undefined>(
    (() => {
      try {
        const raw = localStorage.getItem('openchess_last_synced_puzzle_rating');
        const n = raw ? Number(raw) : NaN;
        return Number.isFinite(n) && n > 0 ? n : undefined;
      } catch {
        return undefined;
      }
    })(),
  );
  const onSyncProgressRef = useRef(onSyncPuzzleProgress);
  onSyncProgressRef.current = onSyncPuzzleProgress;

  useEffect(() => {
    stormScoreRef.current = stormScore;
  }, [stormScore]);

  useEffect(() => {
    setPuzzleStats(loadPuzzleStats());
    setPuzzleHistory(loadPuzzleHistory());
    setStormBest(Math.max(loadRushBest(), syncedStormHigh ?? 0));
    prevSyncedPuzzleRatingRef.current = undefined;
  }, [username, syncedStormHigh]);

  useEffect(() => {
    if (typeof syncedStormHigh === 'number' && Number.isFinite(syncedStormHigh) && syncedStormHigh > 0) {
      setStormBest((prev) => Math.max(prev, syncedStormHigh));
    }
  }, [syncedStormHigh]);

  useEffect(() => {
    const prevSynced = prevSyncedPuzzleRatingRef.current;
    setPuzzleStats((prev) => {
      const merged = mergePuzzleSyncStats(prev, {
        syncedPuzzleRating,
        syncedStreakHigh,
        prevSyncedPuzzleRating: prevSynced,
        authoritative: Boolean(hasOnlineToken || username),
      });
      if (merged !== prev) {
        savePuzzleStats(merged);
      }
      return merged;
    });
    if (typeof syncedPuzzleRating === 'number' && Number.isFinite(syncedPuzzleRating) && syncedPuzzleRating > 0) {
      prevSyncedPuzzleRatingRef.current = syncedPuzzleRating;
      try {
        localStorage.setItem('openchess_last_synced_puzzle_rating', String(syncedPuzzleRating));
      } catch {
        // ignore storage quota errors
      }
    }
  }, [hasOnlineToken, syncedPuzzleRating, syncedStreakHigh, username]);

  const refreshPuzzleActivity = useCallback(() => {
    if (!lichessToken) return;
    fetch('/api/lichess/puzzle/activity', {
      headers: { Authorization: `Bearer ${lichessToken}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!Array.isArray(data?.activity) || data.activity.length === 0) return;
        const remoteEntries = data.activity as PuzzleHistoryEntry[];
        setPuzzleHistory((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          for (const entry of remoteEntries) {
            if (entry?.id && !seen.has(entry.id)) {
              seen.add(entry.id);
              merged.push(entry);
            }
          }
          merged.sort((a, b) => b.timestamp - a.timestamp);
          return merged.slice(0, 40);
        });
      })
      .catch(() => {});
  }, [lichessToken]);

  useEffect(() => {
    refreshPuzzleActivity();
  }, [refreshPuzzleActivity, lastSyncedAt]);

  const displayRating =
    hasOnlineToken && typeof syncedPuzzleRating === 'number' && syncedPuzzleRating > 0
      ? syncedPuzzleRating
      : puzzleStats.attemptCount > 0 || !syncedPuzzleRating
        ? puzzleStats.rating
        : syncedPuzzleRating;
  const totalSolvedDisplay = Math.max(puzzleStats.solvedCount, syncedPuzzleGames ?? 0);
  const bestStreakDisplay = Math.max(puzzleStats.bestStreak, syncedStreakHigh ?? 0);
  const accuracy = useMemo(() => getPuzzleAccuracy(puzzleStats), [puzzleStats]);

  useEffect(() => {
    document.body.dataset.state = 'puzzles';
  }, []);

  const resetBoardToPuzzle = useCallback((target: ActivePuzzleItem) => {
    setFen(target.fen);
    setSolutionStep(0);
    setStatus('solving');
    setPuzzleBadge(null);
    setDailyLives(5);
    setHintSquares(null);
    setHintArrow(null);
    setLastMove(target.lastMove ?? null);
    setMobileSheet('none');
    setSolvedDelta(null);
    hadWrongAttemptRef.current = false;
  }, []);

  const fetchRatedPuzzles = useCallback(
    async (theme: PuzzleThemeId, openSolver = true, preserveMode?: PuzzleViewMode) => {
      setPuzzleLoading(true);
      if (openSolver) {
        setPuzzleError(null);
        userInteractedRef.current = true;
        setViewMode((prev) => preserveMode ?? (prev === 'legacy' ? 'legacy' : 'solve'));
      }
      try {
        const headers: Record<string, string> = {};
        if (lichessToken) {
          headers.Authorization = `Bearer ${lichessToken}`;
        }
        const excludeParam =
          seenPuzzleIdsRef.current.size > 0
            ? `&exclude=${encodeURIComponent(Array.from(seenPuzzleIdsRef.current).slice(-40).join(','))}`
            : '';
        const res = await fetch(
          `/api/lichess/puzzle?theme=${encodeURIComponent(theme)}${excludeParam}`,
          { headers },
        );
        const data = await res.json();
        if (!res.ok || !Array.isArray(data.puzzles) || data.puzzles.length === 0) {
          throw new Error(data.error || 'Could not load new puzzles right now.');
        }
        const fetched = data.puzzles as NormalizedLichessPuzzle[];
        for (const p of fetched) {
          if (p?.id) seenPuzzleIdsRef.current.add(p.id);
        }
        const shouldSyncBoard = openSolver || !userInteractedRef.current;
        if (shouldSyncBoard) {
          setPuzzleQueue(fetched);
          setPuzzleIdx(0);
          setPuzzleTheme(theme);
        }
        if (theme === 'daily' && fetched[0]) {
          setDailyPuzzle({
            ...fetched[0],
            plays: fetched[0].plays ?? 66913,
          });
          if (fetched[1]) setHealthyMixPreview(fetched[1]);
        } else if (theme === 'attraction' && fetched[0]) {
          setAttractionPreview(fetched[0]);
        } else if (fetched[0]) {
          setHealthyMixPreview(fetched[0]);
        }
        if (shouldSyncBoard && fetched[0]) {
          resetBoardToPuzzle(fetched[0]);
        }
      } catch (err: unknown) {
        if (openSolver) {
          setPuzzleError(
            err instanceof Error
              ? err.message
              : 'Unable to fetch fresh puzzles — continuing with loaded tactics.',
          );
          const fallback = puzzleQueue[0] ?? PUZZLES[0];
          resetBoardToPuzzle(fallback);
        }
      } finally {
        setPuzzleLoading(false);
      }
    },
    [lichessToken, puzzleQueue, resetBoardToPuzzle],
  );

  const handleSelectTheme = (themeId: string) => {
    setThemeSearchQuery('');
    if (themeId === 'legacy') {
      userInteractedRef.current = true;
      setPuzzleError(null);
      setViewMode('legacy');
      if (puzzleQueue.length === 0) {
        setPuzzleQueue([...PUZZLES]);
        setPuzzleIdx(0);
        resetBoardToPuzzle(PUZZLES[0]);
      }
      return;
    }
    void fetchRatedPuzzles(themeId, true, 'solve');
  };

  // Load live Daily Puzzle, Healthy Mix, and Attraction previews on mount and when Lichess auth changes
  useEffect(() => {
    void fetchRatedPuzzles('daily', false);
    const headers: Record<string, string> = {};
    if (lichessToken) headers.Authorization = `Bearer ${lichessToken}`;
    fetch('/api/lichess/puzzle?theme=attraction', { headers })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.puzzles) && data.puzzles[0]) {
          setAttractionPreview(data.puzzles[0] as NormalizedLichessPuzzle);
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lichessToken, hasOnlineToken]);

  // Puzzle Storm 3-minute countdown timer
  useEffect(() => {
    if (viewMode !== 'storm' || stormPhase !== 'active') return;
    const id = window.setInterval(() => {
      setStormSeconds((prev) => {
        if (prev <= 1) {
          const finalScore = stormScoreRef.current;
          setStormPhase('done');
          setStormBest((b) => saveRushBest(Math.max(b, finalScore)));
          onSyncProgressRef.current?.({ stormScore: finalScore });
          playGameOverSound(finalScore >= 5);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [stormPhase, viewMode]);

  const startPuzzleStorm = () => {
    userInteractedRef.current = true;
    const liveQueue = puzzleQueue.filter((p) => p.id.startsWith('puzzle-'));
    const initialList = liveQueue.length > 0 ? liveQueue : [...puzzleQueue, ...PUZZLES];
    const unique = Array.from(new Map(initialList.map((p) => [p.id, p])).values());
    const sorted = [...unique].sort((a, b) => a.rating - b.rating);
    setViewMode('storm');
    setStormQueue(sorted);
    setStormIdx(0);
    setStormScore(0);
    setStormStrikes(0);
    setStormSeconds(180);
    setStormPhase('active');
    if (sorted[0]) {
      resetBoardToPuzzle(sorted[0]);
    }

    const stormHeaders: Record<string, string> = {};
    if (lichessToken) {
      stormHeaders.Authorization = `Bearer ${lichessToken}`;
    }
    fetch('/api/lichess/puzzle?theme=fork', { headers: stormHeaders })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.puzzles) && data.puzzles.length > 0) {
          const fresh = [...(data.puzzles as ActivePuzzleItem[])].sort(
            (a, b) => a.rating - b.rating,
          );
          for (const p of fresh) {
            if (p?.id) seenPuzzleIdsRef.current.add(p.id);
          }
          setStormQueue((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const extra = fresh.filter((p) => !seen.has(p.id));
            return [...prev, ...extra];
          });
        }
      })
      .catch(() => {});
  };

  const startPuzzleStreak = () => {
    userInteractedRef.current = true;
    const liveQueue = puzzleQueue.filter((p) => p.id.startsWith('puzzle-'));
    const initialList = liveQueue.length > 0 ? liveQueue : [...puzzleQueue, ...PUZZLES];
    const unique = Array.from(new Map(initialList.map((p) => [p.id, p])).values());
    const sorted = [...unique].sort((a, b) => a.rating - b.rating);
    setViewMode('streak');
    setStreakQueue(sorted);
    setStreakIdx(0);
    setStreakRunCount(0);
    setStreakPhase('active');
    if (sorted[0]) {
      resetBoardToPuzzle(sorted[0]);
    }
    const streakHeaders: Record<string, string> = {};
    if (lichessToken) streakHeaders.Authorization = `Bearer ${lichessToken}`;
    fetch('/api/lichess/puzzle?theme=next', { headers: streakHeaders })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.puzzles) && data.puzzles.length > 0) {
          const fresh = [...(data.puzzles as ActivePuzzleItem[])].sort(
            (a, b) => a.rating - b.rating,
          );
          for (const p of fresh) {
            if (p?.id) seenPuzzleIdsRef.current.add(p.id);
          }
          setStreakQueue((prev) => {
            const seen = new Set(prev.map((p) => p.id));
            const extra = fresh.filter((p) => !seen.has(p.id));
            return [...prev, ...extra];
          });
        }
      })
      .catch(() => {});
  };

  const handleNextPuzzle = () => {
    userInteractedRef.current = true;
    if (viewMode === 'streak') {
      const nextIdx = (streakIdx + 1) % Math.max(1, streakQueue.length);
      setStreakIdx(nextIdx);
      if (streakQueue[nextIdx]) resetBoardToPuzzle(streakQueue[nextIdx]);
      return;
    }
    const nextIdx = puzzleIdx + 1;
    if (nextIdx < puzzleQueue.length) {
      setPuzzleIdx(nextIdx);
      resetBoardToPuzzle(puzzleQueue[nextIdx]);
    } else {
      const fetchTheme = puzzleTheme === 'daily' ? 'next' : puzzleTheme;
      void fetchRatedPuzzles(fetchTheme, true);
    }
  };

  const playerSide: Color = useMemo(() => {
    try {
      return new Chess(activePuzzle.fen).turn();
    } catch {
      return 'w';
    }
  }, [activePuzzle.fen]);

  const dailySide: Color = useMemo(() => {
    try {
      return new Chess(dailyPuzzle.fen).turn();
    } catch {
      return 'w';
    }
  }, [dailyPuzzle.fen]);

  const evalCp = useMemo(() => {
    try {
      return evaluatePosition(new Chess(fen));
    } catch {
      return 0;
    }
  }, [fen]);

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      }).format(new Date()),
    [],
  );

  const handleMove = (from: string, to: string, promotion?: PieceSymbol): boolean => {
    if (status === 'solved') return false;
    if (viewMode === 'storm' && stormPhase !== 'active') return false;
    if (viewMode === 'streak' && streakPhase !== 'active') return false;
    userInteractedRef.current = true;

    const chess = new Chess(fen);
    let move;
    try {
      move = chess.move({ from, to, promotion: promotion ?? 'q' });
    } catch {
      return false;
    }
    if (!move) return false;

    const expectedSan = activePuzzle.solution[solutionStep];
    if (move.san !== expectedSan) {
      playErrorSound();
      setPuzzleBadge({ square: move.to, status: 'wrong' });
      if (puzzleTheme === 'daily') {
        setDailyLives((prev) => Math.max(0, prev - 1));
      }

      // Puzzle Storm mode: 3 strikes or timer
      if (viewMode === 'storm') {
        const nextStrikes = stormStrikes + 1;
        setStormStrikes(nextStrikes);
        if (nextStrikes >= 3) {
          setStormPhase('done');
          setStormBest(saveRushBest(stormScore));
          onSyncProgressRef.current?.({ stormScore });
          playGameOverSound(false);
        } else {
          setStatus('wrong');
          window.setTimeout(() => {
            const nextStorm = (stormIdx + 1) % Math.max(1, stormQueue.length);
            setStormIdx(nextStorm);
            if (stormQueue[nextStorm]) resetBoardToPuzzle(stormQueue[nextStorm]);
          }, 420);
        }
        return false;
      }

      // Puzzle Streak mode: 1 wrong move ends the streak run
      if (viewMode === 'streak') {
        setStatus('wrong');
        setStreakPhase('ended');
        onSyncProgressRef.current?.({ streakScore: streakRunCount });
        playGameOverSound(streakRunCount >= 5);
        return false;
      }

      setStatus('wrong');
      if (!hadWrongAttemptRef.current) {
        hadWrongAttemptRef.current = true;
        const baseRating = displayRating;
        const nextMissStats = recordPuzzleResult({
          stats: { ...puzzleStats, rating: baseRating },
          puzzleRating: activePuzzle.rating,
          outcome: 'miss',
        });
        savePuzzleStats(nextMissStats);
        setPuzzleStats(nextMissStats);
        setPuzzleHistory(
          recordPuzzleHistoryEntry({
            id: activePuzzle.id,
            fen: activePuzzle.fen,
            rating: activePuzzle.rating,
            title: activePuzzle.title,
            motif: activePuzzle.motif,
            solved: false,
            delta: nextMissStats.lastDelta,
            timestamp: Date.now(),
          }),
        );
        if (hasOnlineToken && onSubmitRealPuzzleResult) {
          void onSubmitRealPuzzleResult({
            puzzleId: activePuzzle.id,
            win: false,
            angle: puzzleTheme,
          }).then((updatedAcct) => {
            const realRating = updatedAcct?.perfs?.puzzle?.rating;
            if (typeof realRating === 'number' && realRating > 0) {
              const realDelta = realRating - baseRating;
              const syncedStats: PuzzlePlayerStats = {
                ...nextMissStats,
                rating: realRating,
                lastDelta: realDelta,
              };
              savePuzzleStats(syncedStats);
              setPuzzleStats(syncedStats);
            }
            refreshPuzzleActivity();
          });
        } else {
          onRecordAccountResult?.({
            category: 'puzzle',
            outcome: 'loss',
            opponentRating: activePuzzle.rating,
          });
          onSyncProgressRef.current?.({ rating: nextMissStats.rating });
        }
      }
      return false;
    }

    setFen(chess.fen());
    setLastMove({
      from: move.from,
      to: move.to,
      captured: Boolean(move.captured) || move.flags.includes('e'),
    });
    setHintSquares(null);
    setHintArrow(null);
    setStatus('solving');
    setPuzzleBadge({ square: move.to, status: 'correct' });
    playMoveSound({
      capture: Boolean(move.captured),
      check: chess.inCheck(),
    });

    const nextStep = solutionStep + 1;
    if (nextStep >= activePuzzle.solution.length) {
      setStatus('solved');
      setPuzzleBadge({ square: move.to, status: 'correct' });
      playSuccessSound();
      onPuzzleSolved();

      if (viewMode === 'storm') {
        const nextScore = stormScore + 1;
        setStormScore(nextScore);
        setStormBest(saveRushBest(nextScore));
        onSyncProgressRef.current?.({ stormScore: nextScore, solvedDelta: 1 });
        if (hasOnlineToken && onSubmitRealPuzzleResult && activePuzzle.id.startsWith('puzzle-')) {
          void onSubmitRealPuzzleResult({ puzzleId: activePuzzle.id, win: true, angle: 'mix' });
        }
        window.setTimeout(() => {
          const nextStorm = (stormIdx + 1) % Math.max(1, stormQueue.length);
          setStormIdx(nextStorm);
          if (stormQueue[nextStorm]) resetBoardToPuzzle(stormQueue[nextStorm]);
        }, 260);
        return true;
      }

      if (viewMode === 'streak') {
        const nextStreak = streakRunCount + 1;
        setStreakRunCount(nextStreak);
        const updatedStreakStats: PuzzlePlayerStats = {
          ...puzzleStats,
          streak: nextStreak,
          bestStreak: Math.max(puzzleStats.bestStreak, nextStreak),
          solvedCount: puzzleStats.solvedCount + 1,
        };
        savePuzzleStats(updatedStreakStats);
        setPuzzleStats(updatedStreakStats);
        onSyncProgressRef.current?.({ streakScore: nextStreak, solvedDelta: 1 });
        if (hasOnlineToken && onSubmitRealPuzzleResult && activePuzzle.id.startsWith('puzzle-')) {
          void onSubmitRealPuzzleResult({ puzzleId: activePuzzle.id, win: true, angle: 'mix' });
        }
        window.setTimeout(() => {
          const nextIdx = (streakIdx + 1) % Math.max(1, streakQueue.length);
          setStreakIdx(nextIdx);
          if (streakQueue[nextIdx]) resetBoardToPuzzle(streakQueue[nextIdx]);
        }, 380);
        return true;
      }

      const outcome = hadWrongAttemptRef.current ? 'retry-solve' : 'clean-solve';
      const baseRating = displayRating;
      const nextSolvedStats = recordPuzzleResult({
        stats: { ...puzzleStats, rating: baseRating },
        puzzleRating: activePuzzle.rating,
        outcome,
      });
      savePuzzleStats(nextSolvedStats);
      setPuzzleStats(nextSolvedStats);
      setSolvedDelta(nextSolvedStats.lastDelta);
      setPuzzleHistory(
        recordPuzzleHistoryEntry({
          id: activePuzzle.id,
          fen: activePuzzle.fen,
          rating: activePuzzle.rating,
          title: activePuzzle.title,
          motif: activePuzzle.motif,
          solved: true,
          delta: nextSolvedStats.lastDelta,
          timestamp: Date.now(),
        }),
      );
      if (hasOnlineToken && onSubmitRealPuzzleResult && outcome === 'clean-solve') {
        void onSubmitRealPuzzleResult({
          puzzleId: activePuzzle.id,
          win: true,
          angle: puzzleTheme,
        }).then((updatedAcct) => {
          const realRating = updatedAcct?.perfs?.puzzle?.rating;
          if (typeof realRating === 'number' && realRating > 0) {
            const realDelta = realRating - baseRating;
            const syncedStats: PuzzlePlayerStats = {
              ...nextSolvedStats,
              rating: realRating,
              lastDelta: realDelta,
            };
            savePuzzleStats(syncedStats);
            setPuzzleStats(syncedStats);
            setSolvedDelta(realDelta);
          }
          refreshPuzzleActivity();
        });
      } else {
        if (outcome === 'clean-solve') {
          onRecordAccountResult?.({
            category: 'puzzle',
            outcome: 'win',
            opponentRating: activePuzzle.rating,
          });
        }
        onSyncProgressRef.current?.({
          rating: nextSolvedStats.rating,
          solvedDelta: 1,
          streakScore: nextSolvedStats.bestStreak,
        });
      }
      return true;
    }

    setSolutionStep(nextStep);
    window.setTimeout(() => {
      const replySan = activePuzzle.solution[nextStep];
      const afterReply = new Chess(chess.fen());
      const reply = afterReply.move(replySan);
      if (reply) {
        setFen(afterReply.fen());
        setLastMove({
          from: reply.from,
          to: reply.to,
          captured: Boolean(reply.captured) || reply.flags.includes('e'),
        });
        setPuzzleBadge(null);
        setSolutionStep(nextStep + 1);
        playMoveSound({
          capture: Boolean(reply.captured),
          check: afterReply.inCheck(),
        });
      }
    }, 300);

    return true;
  };

  const showHint = () => {
    const expectedSan = activePuzzle.solution[solutionStep];
    if (!expectedSan) return;
    userInteractedRef.current = true;
    const c = new Chess(fen);
    const legal = c.moves({ verbose: true });
    const cleanExpected = expectedSan.replace(/[+#!?]+$/g, '');
    const match =
      legal.find((m) => m.san === expectedSan) ??
      legal.find((m) => m.san.replace(/[+#!?]+$/g, '') === cleanExpected) ??
      legal.find((m) => `${m.from}${m.to}` === expectedSan.slice(0, 4));
    if (match) {
      setHintSquares({ from: match.from, to: match.to });
      setHintArrow({ from: match.from, to: match.to });
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  // ============================================================================
  // 1. PUZZLES MODES HUB VIEW (Chess.com 2-Column Board + Modes Right Dock)
  // ============================================================================
  if (viewMode === 'hub') {
    return (
      <div className="max-w-[1160px] mx-auto pb-16 lg:pb-0">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_390px] gap-4 lg:gap-5 items-start">
          {/* Desktop Left Column: Live Daily Puzzle Board Preview */}
          <div className="hidden lg:flex flex-col gap-2 w-full max-w-[min(calc(100dvh-112px),740px)] mx-auto">
            <div className="flex items-center justify-between px-0.5">
              <div className="flex items-center gap-2">
                <NavPuzzlesIcon className="w-6 h-6 shrink-0" />
                <span className="text-[15px] font-extrabold text-white font-display">
                  Daily Puzzle
                </span>
                <span className="text-[13px] font-mono text-[#9B9A97] tabular-nums">
                  ({dailyPuzzle.rating})
                </span>
              </div>
              <span className="text-[12px] font-bold text-[#9B9A97]">
                {dailySide === 'w' ? 'White to move' : 'Black to move'}
              </span>
            </div>
            <div
              role="button"
              tabIndex={0}
              aria-label={`Solve Daily Puzzle · ${dailySide === 'w' ? 'White' : 'Black'} to move`}
              onClick={() => {
                setPuzzleTheme('daily');
                resetBoardToPuzzle(dailyPuzzle);
                setViewMode('solve');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setPuzzleTheme('daily');
                  resetBoardToPuzzle(dailyPuzzle);
                  setViewMode('solve');
                }
              }}
              className="w-full aspect-square cursor-pointer"
            >
              <ChessBoard
                fen={dailyPuzzle.fen}
                orientation={dailySide}
                interactive={false}
                lastMove={dailyPuzzle.lastMove ?? null}
                theme={boardTheme}
                onMove={() => false}
              />
            </div>
          </div>

          {/* Right Column: Flush #262421 Puzzles Modes Dock */}
          <aside className="w-full max-w-[460px] lg:max-w-none mx-auto rounded-[5px] bg-[#262421] overflow-hidden flex flex-col lg:h-[min(calc(100dvh-2rem),836px)] shadow-[0_6px_22px_rgba(0,0,0,0.28)]">
            <div className="h-[48px] bg-[#1F1E1B] px-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <NavPuzzlesIcon className="w-6 h-6 shrink-0" />
                <h1 className="text-[18px] font-extrabold text-white font-display">
                  Puzzles
                </h1>
              </div>
              <div className="flex items-center gap-1.5 text-[13px] font-mono font-extrabold text-[#F7C045] tabular-nums">
                <Flame className="w-4 h-4 text-[#E59A28]" />
                <span>{displayRating}</span>
              </div>
            </div>

            <div className="p-3.5 sm:p-4 space-y-2.5 flex-1 overflow-y-auto">
              {/* Mobile Compact Daily Puzzle Preview Board */}
              <div
                role="button"
                tabIndex={0}
                onClick={() => {
                  setPuzzleTheme('daily');
                  resetBoardToPuzzle(dailyPuzzle);
                  setViewMode('solve');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setPuzzleTheme('daily');
                    resetBoardToPuzzle(dailyPuzzle);
                    setViewMode('solve');
                  }
                }}
                className="lg:hidden rounded-[10px] bg-[#1F1E1B] hover:bg-[#2B2926] border border-white/[0.06] p-2.5 flex items-center gap-3 transition-colors cursor-pointer"
              >
                <div className="w-[74px] h-[74px] rounded-[6px] overflow-hidden shrink-0 pointer-events-none shadow">
                  <ChessBoard
                    fen={dailyPuzzle.fen}
                    orientation={dailySide}
                    interactive={false}
                    hideCoordinates
                    lastMove={dailyPuzzle.lastMove ?? null}
                    theme={boardTheme}
                    onMove={() => false}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#81B64C]">
                    Today&apos;s Tactic
                  </div>
                  <div className="text-[14px] font-extrabold text-white truncate font-display">
                    {dailySide === 'w' ? 'White to move' : 'Black to move'}
                  </div>
                  <div className="text-[11.5px] text-[#9B9A97] tabular-nums">
                    Rating {dailyPuzzle.rating} · Tap to solve
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-[#9B9A97] shrink-0" />
              </div>

              {/* Primary Rated Puzzles CTA */}
              <button
                type="button"
                onClick={() => void fetchRatedPuzzles('next', true)}
                className="w-full h-[54px] rounded-[9px] cc-btn-primary text-white font-extrabold font-display text-[18px] cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Solve Puzzles</span>
              </button>

              {/* Daily Puzzle */}
              <button
                type="button"
                onClick={() => {
                  setPuzzleTheme('daily');
                  resetBoardToPuzzle(dailyPuzzle);
                  setViewMode('solve');
                }}
                className="w-full px-4 py-3 rounded-[7px] cc-btn-secondary flex items-center gap-3.5 text-left cursor-pointer"
              >
                <DailyPuzzleIcon className="w-7 h-7 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-extrabold text-white">Daily Puzzle</div>
                  <div className="text-[12px] text-[#9B9A97] leading-snug">
                    {dailySide === 'w' ? 'White to move' : 'Black to move'} · Rating {dailyPuzzle.rating}
                  </div>
                </div>
              </button>

              {/* Puzzle Rush (3-Minute Timed) */}
              <button
                type="button"
                onClick={startPuzzleStorm}
                className="w-full px-4 py-3 rounded-[7px] cc-btn-secondary flex items-center gap-3.5 text-left cursor-pointer"
              >
                <StormTornadoIcon className="w-6 h-6 text-[#F28C28] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-extrabold text-white">Puzzle Rush</div>
                  <div className="text-[12px] text-[#9B9A97] leading-snug">
                    Race the 3-minute clock and beat your high score.
                  </div>
                </div>
              </button>

              {/* Puzzle Survival / Streak */}
              <button
                type="button"
                onClick={startPuzzleStreak}
                className="w-full px-4 py-3 rounded-[7px] cc-btn-secondary flex items-center gap-3.5 text-left cursor-pointer"
              >
                <AppleArrowIcon className="w-6 h-6 text-[#81B64C] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-extrabold text-white">Puzzle Survival</div>
                  <div className="text-[12px] text-[#9B9A97] leading-snug">
                    Solve progressively harder tactics without missing.
                  </div>
                </div>
              </button>

              {/* Custom Themes */}
              <button
                type="button"
                onClick={() => setViewMode('themes')}
                className="w-full px-4 py-3 rounded-[7px] cc-btn-secondary flex items-center gap-3.5 text-left cursor-pointer"
              >
                <BookOpen className="w-6 h-6 text-[#46B3F4] shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-extrabold text-white">Custom Puzzles</div>
                  <div className="text-[12px] text-[#9B9A97] leading-snug">
                    Drill specific motifs, endgames, and openings.
                  </div>
                </div>
              </button>

              {/* Stats & History Row */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setViewMode('dashboard')}
                  className="px-3 py-2.5 rounded-[7px] bg-[#1F1E1B] hover:bg-[#312E2B] flex items-center justify-center gap-2 text-[13px] font-bold text-[#DEDAD2] cursor-pointer"
                >
                  <BarChart3 className="w-4 h-4 text-[#81B64C]" />
                  <span>Stats</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPuzzleHistory(loadPuzzleHistory());
                    setViewMode('history');
                  }}
                  className="px-3 py-2.5 rounded-[7px] bg-[#1F1E1B] hover:bg-[#312E2B] flex items-center justify-center gap-2 text-[13px] font-bold text-[#DEDAD2] cursor-pointer"
                >
                  <History className="w-4 h-4 text-[#F28C28]" />
                  <span>History</span>
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. PUZZLE THEMES VIEW (Matches Screenshot: Search + By openings + 9 Categories)
  // ============================================================================
  if (viewMode === 'themes') {
    const trimmedQuery = themeSearchQuery.trim().toLowerCase();
    const matchingThemes: PuzzleThemeItem[] = trimmedQuery
      ? [
          ...PUZZLE_THEME_CATEGORIES.flatMap((cat) => cat.items),
          ...PUZZLE_OPENINGS,
        ].filter(
          (item) =>
            item.label.toLowerCase().includes(trimmedQuery) ||
            item.desc.toLowerCase().includes(trimmedQuery) ||
            item.id.toLowerCase().includes(trimmedQuery),
        )
      : [];

    const toggleCategory = (catId: string) => {
      setExpandedCategories((prev) => ({
        ...prev,
        [catId]: !prev[catId],
      }));
    };

    return (
      <div className="max-w-3xl mx-auto pb-24 lg:pb-8">
        {/* Top Bar matching Screenshot: <- Puzzle Themes */}
        <div className="flex items-center gap-4 px-1 py-2.5 border-b border-white/8">
          <button
            type="button"
            onClick={() => {
              setThemeSearchQuery('');
              setViewMode('hub');
            }}
            aria-label="Back to Puzzles"
            className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-[#DEDAD2] cursor-pointer"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
            Puzzle Themes
          </h1>
        </div>

        {/* Rounded Search Bar */}
        <div className="pt-4 pb-2 px-1">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 text-[#9E998F] absolute left-4 pointer-events-none" />
            <input
              type="text"
              value={themeSearchQuery}
              onChange={(e) => setThemeSearchQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search puzzle themes"
              className="w-full h-12 pl-12 pr-10 rounded-full bg-[#393734] text-white placeholder-[#9E998F] text-base border border-white/8 focus:outline-none focus:border-white/25"
            />
            {themeSearchQuery && (
              <button
                type="button"
                onClick={() => setThemeSearchQuery('')}
                aria-label="Clear search"
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-[#9E998F] absolute right-2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {trimmedQuery ? (
          <div className="divide-y divide-white/6 mt-2">
            {matchingThemes.length === 0 ? (
              <div className="py-10 text-center text-sm text-[#9E998F]">
                No puzzle themes or openings match &ldquo;{themeSearchQuery}&rdquo;.
              </div>
            ) : (
              matchingThemes.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTheme(item.id)}
                  className="w-full px-3 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-[#393734]/70 transition-colors cursor-pointer"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-base font-semibold text-white">{item.label}</div>
                    <div className="text-xs sm:text-sm text-[#9E998F] mt-0.5 leading-snug">
                      {item.desc}
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-[#9E998F] shrink-0" />
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="mt-1">
            {/* By openings > */}
            <button
              type="button"
              onClick={() => {
                setOpeningSearchQuery('');
                setViewMode('openings');
              }}
              className="w-full px-2 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="text-[17px] font-normal text-white">By openings</span>
              <ChevronRight className="w-5 h-5 text-[#B8B4AC] shrink-0" />
            </button>

            {/* 9 Accordion Categories matching Screenshot */}
            {PUZZLE_THEME_CATEGORIES.map((category) => {
              const isOpen = Boolean(expandedCategories[category.id]);
              return (
                <div key={category.id}>
                  <button
                    type="button"
                    onClick={() => toggleCategory(category.id)}
                    aria-expanded={isOpen}
                    className="w-full px-2 py-4 flex items-center justify-between text-left hover:bg-white/5 transition-colors cursor-pointer"
                  >
                    <span className="text-[17px] font-normal text-white">{category.title}</span>
                    <ChevronDown
                      className={`w-5 h-5 text-[#B8B4AC] shrink-0 transition-transform duration-200 ${
                        isOpen ? 'rotate-180' : ''
                      }`}
                    />
                  </button>

                  {isOpen && (
                    <div className="pl-3 pr-1 pb-2 space-y-1 border-l-2 border-white/10 ml-2 mb-2">
                      {category.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectTheme(item.id)}
                          className="w-full px-3 py-3 rounded-xl hover:bg-[#393734] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="text-[15px] font-semibold text-white">
                              {item.label}
                            </div>
                            <div className="text-xs text-[#9E998F] mt-0.5 leading-snug">
                              {item.desc}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-[#9E998F] shrink-0" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // 2B. PUZZLE OPENINGS VIEW ("By openings")
  // ============================================================================
  if (viewMode === 'openings') {
    const trimmedOpening = openingSearchQuery.trim().toLowerCase();
    const filteredOpenings = trimmedOpening
      ? PUZZLE_OPENINGS.filter(
          (o) =>
            o.label.toLowerCase().includes(trimmedOpening) ||
            o.desc.toLowerCase().includes(trimmedOpening),
        )
      : PUZZLE_OPENINGS;

    return (
      <div className="max-w-3xl mx-auto pb-24 lg:pb-8">
        <div className="flex items-center gap-4 px-1 py-2.5 border-b border-white/8">
          <button
            type="button"
            onClick={() => setViewMode('themes')}
            aria-label="Back to Puzzle Themes"
            className="w-10 h-10 rounded-full hover:bg-white/5 flex items-center justify-center text-[#DEDAD2] cursor-pointer"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <h1 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
            By openings
          </h1>
        </div>

        <div className="pt-4 pb-2 px-1">
          <div className="relative flex items-center">
            <Search className="w-5 h-5 text-[#9E998F] absolute left-4 pointer-events-none" />
            <input
              type="text"
              value={openingSearchQuery}
              onChange={(e) => setOpeningSearchQuery(e.target.value)}
              placeholder="Search openings"
              aria-label="Search openings"
              className="w-full h-12 pl-12 pr-10 rounded-full bg-[#393734] text-white placeholder-[#9E998F] text-base border border-white/8 focus:outline-none focus:border-white/25"
            />
            {openingSearchQuery && (
              <button
                type="button"
                onClick={() => setOpeningSearchQuery('')}
                aria-label="Clear opening search"
                className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-[#9E998F] absolute right-2 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="divide-y divide-white/6 mt-1">
          {filteredOpenings.map((opening) => (
            <button
              key={opening.id}
              type="button"
              onClick={() => void fetchRatedPuzzles(opening.id, true)}
              className="w-full px-2 py-3.5 flex items-center justify-between gap-4 text-left hover:bg-[#393734]/70 transition-colors cursor-pointer"
            >
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-semibold text-white">{opening.label}</div>
                <div className="text-xs sm:text-sm text-[#9E998F] mt-0.5 leading-snug">
                  {opening.desc}
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-[#B8B4AC] shrink-0" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 3. PUZZLE DASHBOARD VIEW
  // ============================================================================
  if (viewMode === 'dashboard') {
    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-24 lg:pb-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setViewMode('hub')}
            className="w-10 h-10 rounded-xl bg-[#393734] hover:bg-[#43403C] flex items-center justify-center text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-white font-display">Puzzle Dashboard</h1>
            <p className="text-xs text-[#9E998F]">Train, analyse, improve</p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="rounded-xl bg-[#393734] p-4 space-y-1">
            <div className="text-xs text-[#9E998F] font-semibold">Puzzle Rating</div>
            <div className="text-2xl font-extrabold font-mono text-white tabular-nums">
              {displayRating}
            </div>
          </div>
          <div className="rounded-xl bg-[#393734] p-4 space-y-1">
            <div className="text-xs text-[#9E998F] font-semibold">Puzzles Solved</div>
            <div className="text-2xl font-extrabold font-mono text-[#81B64C] tabular-nums">
              {totalSolvedDisplay}
            </div>
          </div>
          <div className="rounded-xl bg-[#393734] p-4 space-y-1">
            <div className="text-xs text-[#9E998F] font-semibold">Best Streak</div>
            <div className="text-2xl font-extrabold font-mono text-[#F7C045] tabular-nums">
              {bestStreakDisplay}
            </div>
          </div>
          <div className="rounded-xl bg-[#393734] p-4 space-y-1">
            <div className="text-xs text-[#9E998F] font-semibold">Puzzle Storm Best</div>
            <div className="text-2xl font-extrabold font-mono text-[#7FC4ED] tabular-nums">
              {stormBest}
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-[#393734] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-white">Tactical Readiness</h2>
            <span className="text-xs font-mono font-bold text-[#81B64C]">
              Accuracy: {accuracy !== null ? `${accuracy}%` : '100%'}
            </span>
          </div>
          <p className="text-xs text-[#B8B4AC] leading-relaxed">
            Solve Healthy Mix puzzles daily to sharpen pattern recognition across forks, pins,
            deflections, and endgame conversions.
          </p>
          <button
            type="button"
            onClick={() => void fetchRatedPuzzles('next', true)}
            className="w-full min-h-[46px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-4 border-[#457524] text-white font-extrabold text-sm cursor-pointer"
          >
            Train Healthy Mix Now
          </button>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 4. PUZZLE HISTORY VIEW
  // ============================================================================
  if (viewMode === 'history') {
    const items =
      puzzleHistory.length > 0
        ? puzzleHistory
        : PUZZLES.slice(0, 4).map((p, idx) => ({
            id: p.id,
            fen: p.fen,
            rating: p.rating,
            title: p.title,
            motif: p.motif,
            solved: true,
            delta: 12,
            timestamp: Date.now() - idx * 3600_000,
          }));

    return (
      <div className="max-w-3xl mx-auto space-y-4 pb-24 lg:pb-8">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setViewMode('hub')}
            className="w-10 h-10 rounded-xl bg-[#393734] hover:bg-[#43403C] flex items-center justify-center text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl font-extrabold text-white font-display">Puzzle history</h1>
            <p className="text-xs text-[#9E998F]">
              Tap any puzzle to replay it on the board.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {items.map((entry, idx) => {
            const turn = (() => {
              try {
                return new Chess(entry.fen).turn();
              } catch {
                return 'w';
              }
            })();
            return (
              <div
                key={`${entry.id}-${idx}`}
                role="button"
                tabIndex={0}
                onClick={() => {
                  const found =
                    puzzleQueue.find((p) => p.id === entry.id) ??
                    PUZZLES.find((p) => p.id === entry.id) ??
                    PUZZLES[0];
                  resetBoardToPuzzle(found);
                  setViewMode('solve');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const found =
                      puzzleQueue.find((p) => p.id === entry.id) ??
                      PUZZLES.find((p) => p.id === entry.id) ??
                      PUZZLES[0];
                    resetBoardToPuzzle(found);
                    setViewMode('solve');
                  }
                }}
                className="rounded-xl bg-[#393734] hover:bg-[#43403C] p-3 flex items-center gap-3.5 text-left transition-colors cursor-pointer"
              >
                <div className="w-20 h-20 rounded-lg overflow-hidden shrink-0 pointer-events-none">
                  <ChessBoard
                    fen={entry.fen}
                    orientation={turn}
                    interactive={false}
                    hideCoordinates
                    theme={boardTheme}
                    onMove={() => false}
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-extrabold text-white truncate">
                      {entry.motif}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-extrabold ${
                        entry.solved
                          ? 'bg-[#81B64C]/20 text-[#9CD363]'
                          : 'bg-[#CA3431]/25 text-[#F5B8B0]'
                      }`}
                    >
                      {entry.solved ? 'Solved' : 'Missed'}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-[#B8B4AC]">
                    Rating {entry.rating}{' '}
                    <span className={entry.delta >= 0 ? 'text-[#81B64C]' : 'text-[#E06C5A]'}>
                      ({entry.delta >= 0 ? `+${entry.delta}` : entry.delta})
                    </span>
                  </div>
                  <div className="text-[11px] text-[#9E998F]">Tap to replay puzzle</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 5. ACTIVE PUZZLE SOLVER / PUZZLE STREAK / PUZZLE STORM VIEW
  // ============================================================================
  const renderPlayerStatsStrip = () => (
    <div
      aria-label="Your puzzle statistics"
      className="grid grid-cols-4 gap-1.5"
    >
      <div className="px-2 py-1.5 rounded-[5px] bg-[#1F1E1B]">
        <div className="text-[10px] text-[#9B9A97] font-semibold">Rating</div>
        <div className="flex items-baseline gap-1 font-mono tabular-nums">
          <span className="text-sm font-extrabold text-white">{displayRating}</span>
          {puzzleStats.lastDelta !== 0 && (
            <span
              className={`text-[10px] font-bold ${
                puzzleStats.lastDelta > 0 ? 'text-[#81B64C]' : 'text-[#E06C5A]'
              }`}
            >
              {puzzleStats.lastDelta > 0 ? `+${puzzleStats.lastDelta}` : puzzleStats.lastDelta}
            </span>
          )}
        </div>
      </div>

      <div className="px-2 py-1.5 rounded-[5px] bg-[#1F1E1B]">
        <div className="text-[10px] text-[#9B9A97] font-semibold">Streak</div>
        <div className="flex items-center gap-1 font-mono tabular-nums">
          <Flame className="w-3.5 h-3.5 text-[#E59A28] shrink-0" />
          <span className="text-sm font-extrabold text-white">
            {viewMode === 'streak' ? streakRunCount : puzzleStats.streak}
          </span>
          <span className="text-[10px] text-[#9B9A97]">/{bestStreakDisplay}</span>
        </div>
      </div>

      <div className="px-2 py-1.5 rounded-[5px] bg-[#1F1E1B]">
        <div className="text-[10px] text-[#9B9A97] font-semibold">Solved</div>
        <div className="text-sm font-extrabold font-mono tabular-nums text-[#81B64C]">
          {totalSolvedDisplay}
        </div>
      </div>

      <div className="px-2 py-1.5 rounded-[5px] bg-[#1F1E1B]">
        <div className="text-[10px] text-[#9B9A97] font-semibold">Accuracy</div>
        <div className="text-sm font-extrabold font-mono tabular-nums text-white">
          {accuracy !== null ? `${accuracy}%` : '—'}
        </div>
      </div>
    </div>
  );

  const isDailyMode = viewMode === 'solve' && puzzleTheme === 'daily';

  const renderPuzzleDetails = () => (
    <div className="flex-1 flex flex-col justify-between overflow-hidden">
      <div className="p-4 space-y-4 overflow-y-auto flex-1">
        {/* Daily Puzzle Date Strip matching Chess.com 05-puzzles-daily.png */}
        {isDailyMode && (
          <div className="flex items-center justify-center gap-3 text-[13px] font-bold text-[#DEDAD2]">
            <button
              type="button"
              onClick={() => {
                const prevIdx = (puzzleIdx - 1 + puzzleQueue.length) % Math.max(1, puzzleQueue.length);
                setPuzzleIdx(prevIdx);
                if (puzzleQueue[prevIdx]) resetBoardToPuzzle(puzzleQueue[prevIdx]);
              }}
              aria-label="Previous daily puzzle"
              className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center text-[#9B9A97] hover:text-white cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span>{todayLabel}</span>
            <button
              type="button"
              onClick={handleNextPuzzle}
              aria-label="Next daily puzzle"
              className="w-6 h-6 rounded hover:bg-white/10 flex items-center justify-center text-[#9B9A97] hover:text-white cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Exact Chess.com 2026 Coach Portrait + Crisp White Speech Bubble */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-[58px] h-[58px] rounded-[6px] overflow-hidden bg-[#1F1E1B] shrink-0">
              <BotAvatar id="coach" />
            </div>
            <div className="relative flex-1 cc-speech-bubble rounded-[12px] px-3.5 py-3">
              <svg
                viewBox="0 0 10 14"
                className="w-2.5 h-3.5 absolute -left-2 top-5 text-white fill-current"
                aria-hidden="true"
              >
                <path d="M10 0 L0 7 L10 14 Z" />
              </svg>
              <div className="flex items-center gap-2 mb-1">
                {status === 'solved' ? (
                  <span className="w-5 h-5 rounded-full bg-[#81B64C] text-white flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5 stroke-[2.8]" />
                  </span>
                ) : status === 'wrong' ? (
                  <span className="w-5 h-5 rounded-full bg-[#FA412D] text-white flex items-center justify-center shrink-0">
                    <X className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                ) : (
                  <span
                    className={`w-4 h-4 rounded-[3px] border shrink-0 ${
                      playerSide === 'w'
                        ? 'bg-white border-[#8E8C88]'
                        : 'bg-[#262421] border-[#262421]'
                    }`}
                  />
                )}
                <span className="text-[14.5px] font-extrabold text-[#262421]">
                  {status === 'solved'
                    ? 'Solved'
                    : status === 'wrong'
                      ? 'Incorrect'
                      : playerSide === 'w'
                        ? 'White to move'
                        : 'Black to move'}
                </span>
                {status === 'solved' && solvedDelta && solvedDelta > 0 && (
                  <span className="ml-auto text-[12px] font-mono font-extrabold text-[#5D9231] tabular-nums">
                    +{solvedDelta}
                  </span>
                )}
              </div>
              <p className="text-[13px] font-medium leading-snug text-[#3B3936]">
                {status === 'solved'
                  ? activePuzzle.explanation || 'Fantastic!'
                  : status === 'wrong'
                    ? 'Try again! Look for a forcing check, capture, or tactical threat.'
                    : hintSquares
                      ? `Hint: ${activePuzzle.hint}`
                      : isDailyMode
                        ? "Lock in! You've got this!"
                        : `It's your turn as ${
                            playerSide === 'w' ? 'White' : 'Black'
                          }. Can you find the winning move?`}
              </p>
            </div>
          </div>

          {/* Exact Chess.com Daily Puzzle 5 Green Hearts */}
          {isDailyMode && (
            <div className="flex items-center gap-1.5 pl-1" aria-label={`${dailyLives} of 5 lives remaining`}>
              {[0, 1, 2, 3, 4].map((idx) => (
                <Heart
                  key={idx}
                  className={`w-6 h-6 transition-all ${
                    idx < dailyLives
                      ? 'text-[#81B64C] fill-[#81B64C]'
                      : 'text-[#4A4845] fill-[#383633]'
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {renderPlayerStatsStrip()}

        {viewMode === 'storm' && (
          <div className="p-3.5 rounded-[7px] bg-[#1F1E1B] space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] text-[#9B9A97]">Puzzle Storm · 3:00 Blitz</div>
                <div className="text-2xl font-mono font-extrabold text-white tabular-nums">
                  {formatTimer(stormSeconds)}
                </div>
              </div>
              <div className="text-right font-mono tabular-nums">
                <div className="text-xl font-extrabold text-[#81B64C]">{stormScore}</div>
                <div className="text-[11px] text-[#9B9A97]">Best {stormBest}</div>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs pt-1 border-t border-white/[0.06]">
              <span className="text-[#B8B6B2]">Strikes Remaining</span>
              <div className="flex items-center gap-1.5">
                {[0, 1, 2].map((idx) => (
                  <span
                    key={idx}
                    className={`w-6 h-6 rounded flex items-center justify-center ${
                      idx < stormStrikes
                        ? 'bg-[#5C2320] text-[#F5B8B0]'
                        : 'bg-[#2B2926] text-[#6D6961]'
                    }`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </span>
                ))}
              </div>
            </div>

            {stormPhase === 'done' && (
              <div className="p-3 rounded-[6px] bg-[#262421] space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-[#E59A28]">
                  <Trophy className="w-4 h-4" />
                  <span>Puzzle Storm Complete · Score {stormScore}</span>
                </div>
                <button
                  type="button"
                  onClick={startPuzzleStorm}
                  className="w-full h-[40px] px-3 rounded-[6px] cc-btn-primary-sm text-white font-extrabold text-xs cursor-pointer"
                >
                  Play Storm Again
                </button>
              </div>
            )}
          </div>
        )}

        {viewMode === 'streak' && (
          <div className="p-3.5 rounded-[7px] bg-[#1F1E1B] space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Flame className="w-5 h-5 text-[#F7C045] fill-[#F7C045]" />
                <span className="text-sm font-extrabold text-white">
                  Puzzle Streak: {streakRunCount}
                </span>
              </div>
              <span className="text-xs font-mono text-[#9B9A97]">Best: {bestStreakDisplay}</span>
            </div>
            {streakPhase === 'ended' && (
              <div className="space-y-2 pt-1 border-t border-white/[0.06]">
                <p className="text-xs text-[#F7C7C1]">
                  Streak ended at {streakRunCount}! One wrong move ends the streak.
                </p>
                <button
                  type="button"
                  onClick={startPuzzleStreak}
                  className="w-full h-[38px] rounded-[6px] cc-btn-primary-sm text-white font-extrabold text-xs cursor-pointer"
                >
                  Start New Streak
                </button>
              </div>
            )}
          </div>
        )}

        <div className="px-3 py-2.5 rounded-[6px] bg-[#1F1E1B] space-y-0.5">
          <div className="text-[11px] text-[#9B9A97] flex items-center justify-between gap-2">
            <span className="font-semibold text-[#C8C6C2]">
              {activePuzzle.title} · ELO{' '}
              <span className="font-mono text-white tabular-nums">{activePuzzle.rating}</span>
            </span>
            {activePuzzle.plays ? (
              <span className="font-mono tabular-nums">
                {activePuzzle.plays.toLocaleString()} plays
              </span>
            ) : (
              <span>Rated Tactic</span>
            )}
          </div>
          <div className="text-[14px] font-extrabold text-white font-display">
            {activePuzzle.motif}
          </div>
          {activePuzzle.playersSummary && activePuzzle.playersSummary !== 'Live Online Game' && (
            <p className="text-[11px] font-medium text-[#9B9A97] truncate">
              Game: {activePuzzle.playersSummary}
            </p>
          )}
        </div>

        {puzzleLoading && (
          <div className="p-2.5 rounded-[6px] bg-[#1F1E1B] text-xs text-[#C8C6C2] flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#81B64C]" />
            <span>Loading fresh tactical puzzle...</span>
          </div>
        )}

        {puzzleError && (
          <div className="p-2.5 rounded-[6px] bg-[#5C2320]/70 text-xs text-[#F7C7C1]">
            <p>{puzzleError}</p>
          </div>
        )}

        {status === 'wrong' && (
          <div role="status" className="sr-only">
            Not the best move — try again.
          </div>
        )}
        {status === 'solved' && (
          <div role="status" className="sr-only">
            Puzzle Solved!
          </div>
        )}
      </div>

      {/* Exact Chess.com 2026 Puzzles Bottom Controls (08-puzzles-rated-clean & 09-puzzles-solved) */}
      <div className="px-4 py-3 bg-[#1F1E1B] border-t border-white/[0.06] space-y-2.5 shrink-0">
        {status === 'solved' ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => resetBoardToPuzzle(activePuzzle)}
              aria-label="Retry puzzle"
              title="Retry"
              className="w-[50px] h-[46px] rounded-[8px] bg-[#363431] hover:bg-[#43403C] text-[#DEDAD2] hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setRightTab('tutor')}
              aria-label="Analyze puzzle with Coach"
              title="Analyze"
              className="w-[50px] h-[46px] rounded-[8px] bg-[#363431] hover:bg-[#43403C] text-[#DEDAD2] hover:text-white flex items-center justify-center shrink-0 cursor-pointer transition-colors"
            >
              <SearchCheck className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={handleNextPuzzle}
              disabled={puzzleLoading}
              aria-label="Next Puzzle"
              className="flex-1 h-[46px] px-4 rounded-[8px] cc-btn-primary text-white font-extrabold font-display text-[17px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span>Next</span>
              <ChevronRight className="w-5 h-5 stroke-[3]" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={showHint}
            className="w-full h-[46px] px-4 rounded-[8px] bg-[#363431] hover:bg-[#43403C] text-[15px] font-extrabold text-white flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Lightbulb className="w-4 h-4 text-[#F2F0EC]" />
            <span>Hint</span>
          </button>
        )}

        {/* Chess.com Bottom Utility Icon Strip: Coach / Reset on left, < > arrows on right */}
        <div className="flex items-center justify-between pt-0.5 text-[#9B9A97]">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setRightTab('tutor')}
              aria-label="Coach explanation"
              title="Coach"
              className="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => resetBoardToPuzzle(activePuzzle)}
              aria-label="Reset puzzle"
              title="Reset"
              className="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => resetBoardToPuzzle(activePuzzle)}
              aria-label="Previous step"
              title="Step back"
              className="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleNextPuzzle}
              disabled={puzzleLoading}
              aria-label="Skip to next puzzle"
              title="Next puzzle"
              className="w-7 h-7 rounded hover:bg-white/10 hover:text-white flex items-center justify-center cursor-pointer disabled:opacity-40"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  const isLegacyUi = viewMode === 'legacy';

  return (
    <div className="space-y-3">
      {isLegacyUi && (
        <div className="space-y-2.5">
          {/* Classic Compact Puzzles Header */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#21201D] border border-white/10 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setViewMode('themes')}
                aria-label="Back to Puzzle Themes"
                className="w-8 h-8 rounded-lg bg-[#393734] hover:bg-[#43403C] flex items-center justify-center text-white cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <h1 className="text-sm sm:text-base font-extrabold text-white font-display leading-tight">
                  Puzzles · Legacy UI
                </h1>
                <p className="text-[11px] text-[#9E998F]">
                  Classic OpenChess tactical trainer · Quick theme switcher
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setViewMode('themes')}
                className="px-2.5 py-1.5 rounded-lg bg-[#312E2A] hover:bg-[#3D3934] text-xs font-semibold text-[#E2DFD7] cursor-pointer"
              >
                Themes
              </button>
              <button
                type="button"
                onClick={() => setViewMode('hub')}
                className="px-2.5 py-1.5 rounded-lg bg-[#81B64C]/20 hover:bg-[#81B64C]/30 border border-[#81B64C]/35 text-xs font-bold text-[#9CD363] cursor-pointer"
              >
                Modern Hub
              </button>
            </div>
          </div>

          {/* Classic Quick-Theme Switcher Strip */}
          <div
            aria-label="Classic puzzle theme switcher"
            className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar"
          >
            {LEGACY_QUICK_THEMES.map((t) => {
              const active = puzzleTheme === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => void fetchRatedPuzzles(t.id, true, 'legacy')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? 'bg-[#81B64C] text-[#191815]'
                      : 'bg-[#262421] hover:bg-[#312E2A] text-[#C8C4BC] border border-white/8'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_370px] xl:grid-cols-[minmax(0,1fr)_410px] gap-4 lg:gap-5 items-start">
        <div className="flex justify-center">
          <div className="w-full max-w-[min(560px,100vw)] lg:max-w-[min(calc(100dvh-84px),780px)]">
            {/* Compact mobile-only header strip (desktop shows header in right dock like Chess.com) */}
            <div className="flex lg:hidden items-center justify-between py-2 px-0.5 gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                {!isLegacyUi && (
                  <button
                    type="button"
                    onClick={() => setViewMode('hub')}
                    aria-label="Back to Puzzles"
                    className="w-9 h-9 rounded-[8px] bg-[#262421] hover:bg-[#383633] flex items-center justify-center text-white shrink-0 cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}
                <div className="min-w-0">
                  <div className="text-sm font-bold text-[#F2F0EC] truncate">
                    {playerSide === 'w' ? 'White to play' : 'Black to play'} · {activePuzzle.title}
                  </div>
                  <div className="text-xs text-[#9E998F] truncate">
                    {viewMode === 'storm'
                      ? `Puzzle Storm · ${formatTimer(stormSeconds)} · Score ${stormScore}`
                      : viewMode === 'streak'
                        ? `Puzzle Streak · ${streakRunCount} in a row`
                        : `${activePuzzle.motif} · Puzzle ELO ${activePuzzle.rating}`}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono tabular-nums bg-[#262421] border border-white/8 rounded px-2.5 py-1 shrink-0">
                <div className="text-[#E59A28] font-bold flex items-center gap-0.5">
                  <Flame className="w-3.5 h-3.5" />
                  <span>
                    {viewMode === 'storm'
                      ? stormScore
                      : viewMode === 'streak'
                        ? streakRunCount
                        : puzzleStats.streak}
                  </span>
                </div>
                <div className="text-[#F2F0EC] font-bold">{displayRating}</div>
              </div>
            </div>

          <div className="-mx-2.5 sm:mx-0">
            <ChessBoard
              fen={fen}
              orientation={playerSide}
              interactive={
                status !== 'solved' &&
                !puzzleLoading &&
                (viewMode !== 'storm' || stormPhase === 'active') &&
                (viewMode !== 'streak' || streakPhase === 'active')
              }
              allowedColor={playerSide}
              lastMove={lastMove}
              lastMoveCapture={Boolean(lastMove?.captured)}
              puzzleBadge={puzzleBadge}
              hintSquares={hintSquares}
              bestMoveArrow={hintArrow}
              theme={boardTheme}
              onMove={handleMove}
            />
          </div>

          {/* Mobile inline feedback strip */}
          {status === 'wrong' && (
            <div className="lg:hidden mt-2 px-3 py-2 rounded bg-[#5C2320]/70 border border-[#E06C5A]/40 text-xs text-[#F7C7C1] flex items-center justify-between gap-2">
              <span>
                {viewMode === 'streak'
                  ? `Streak ended at ${streakRunCount}!`
                  : 'Not the best move — try again!'}
              </span>
              {viewMode === 'streak' && (
                <button
                  type="button"
                  onClick={startPuzzleStreak}
                  className="px-2.5 py-1 rounded bg-[#81B64C] text-[#191815] font-bold cursor-pointer shrink-0"
                >
                  Restart
                </button>
              )}
            </div>
          )}
          {status === 'solved' && (
            <div className="lg:hidden mt-2 px-3 py-2 rounded bg-[#81B64C]/20 border border-[#81B64C]/45 text-xs text-[#C6ECA0] flex items-center justify-between gap-2">
              <span className="font-bold truncate">
                {solvedDelta && solvedDelta > 0
                  ? `Solved! +${solvedDelta} ELO · ${activePuzzle.motif}`
                  : `Solved! ${activePuzzle.motif}`}
              </span>
              <button
                type="button"
                onClick={handleNextPuzzle}
                className="px-3 py-1 rounded bg-[#81B64C] text-[#191815] font-bold cursor-pointer shrink-0"
              >
                Next
              </button>
            </div>
          )}

          {/* Mobile Thumb Action Strip */}
          <div className="lg:hidden grid grid-cols-4 gap-1.5 mt-2">
            <button
              type="button"
              onClick={() => setViewMode('hub')}
              className="min-h-[44px] rounded-md bg-[#2A2824] text-[11px] font-semibold text-[#F2F0EC] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            >
              <Grid2x2 className="w-4 h-4 text-[#81B64C]" />
              <span>Puzzles Hub</span>
            </button>
            <button
              type="button"
              onClick={showHint}
              disabled={status === 'solved'}
              className="min-h-[44px] rounded-md bg-[#2A2824] text-[11px] font-semibold text-[#F2F0EC] flex flex-col items-center justify-center gap-0.5 cursor-pointer disabled:opacity-40"
            >
              <Lightbulb className="w-4 h-4 text-[#E59A28]" />
              <span>Hint</span>
            </button>
            <button
              type="button"
              onClick={() => setMobileSheet('tutor')}
              className="min-h-[44px] rounded-md bg-[#81B64C]/20 border border-[#81B64C]/40 text-[11px] font-bold text-[#AEE076] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            >
              <MessageSquare className="w-4 h-4" />
              <span>Coach</span>
            </button>
            {status === 'solved' ? (
              <button
                type="button"
                onClick={handleNextPuzzle}
                className="min-h-[44px] rounded-md bg-[#81B64C] text-[11px] font-extrabold text-[#191815] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
              >
                <ArrowRight className="w-4 h-4" />
                <span>Next</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => resetBoardToPuzzle(activePuzzle)}
                className="min-h-[44px] rounded-md bg-[#2A2824] text-[11px] font-semibold text-[#F2F0EC] flex flex-col items-center justify-center gap-0.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Desktop Right Dock — Flush #262421 Puzzles Panel */}
      <aside className="hidden lg:flex bg-[#262421] rounded-[5px] shadow-[0_6px_22px_rgba(0,0,0,0.28)] overflow-hidden flex-col lg:h-[min(calc(100dvh-2rem),836px)]">
        {/* Exact Chess.com 2026 Puzzles / Daily Puzzle Top Bar */}
        <div className="h-[50px] bg-[#1F1E1B] px-3 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => setViewMode('hub')}
            aria-label="Back to Puzzles Hub"
            className="w-8 h-8 rounded-[5px] hover:bg-white/[0.06] flex items-center justify-center text-[#9B9A97] hover:text-white cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            {isDailyMode ? (
              <DailyPuzzleIcon className="w-6 h-6 shrink-0" />
            ) : (
              <NavPuzzlesIcon className="w-7 h-7 shrink-0" />
            )}
            <span className="text-[19px] font-extrabold text-white font-display tracking-tight">
              {isDailyMode ? 'Daily Puzzle' : 'Puzzles'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const next = !soundOff;
              setSoundOff(next);
              setSoundMuted(next);
            }}
            aria-label={soundOff ? 'Unmute puzzle sounds' : 'Mute puzzle sounds'}
            className="w-8 h-8 rounded-[5px] hover:bg-white/[0.06] flex items-center justify-center text-[#9B9A97] hover:text-white cursor-pointer"
          >
            {soundOff ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>

        <div
          role="tablist"
          aria-label="Puzzle panel tabs"
          className="grid grid-cols-2 bg-[#1F1E1B] border-t border-white/[0.05] shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'puzzle'}
            onClick={() => setRightTab('puzzle')}
            className={`py-2.5 text-[12px] font-bold cursor-pointer transition-colors ${
              rightTab === 'puzzle'
                ? 'bg-[#262421] text-white'
                : 'text-[#9B9A97] hover:text-white'
            }`}
          >
            Puzzle
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'tutor'}
            onClick={() => setRightTab('tutor')}
            className={`py-2.5 text-[12px] font-bold cursor-pointer transition-colors ${
              rightTab === 'tutor'
                ? 'bg-[#262421] text-white'
                : 'text-[#9B9A97] hover:text-white'
            }`}
          >
            Coach
          </button>
        </div>

        {rightTab === 'puzzle' ? (
          renderPuzzleDetails()
        ) : (
          <CoachWorkspace
            fen={fen}
            pgn=""
            mode="puzzles"
            playerColor={playerSide}
            evalCp={evalCp}
            suggestedMoveSan={activePuzzle.solution[solutionStep] ?? ''}
            contextNote={`Solving rated puzzle "${activePuzzle.title}" (${activePuzzle.motif}, Puzzle ELO ${activePuzzle.rating}).`}
            onHighlightArrow={setHintArrow}
          />
        )}
      </aside>

      {/* Mobile Bottom Sheets */}
      <BottomSheet
        open={mobileSheet === 'list'}
        title={`Puzzles · ELO ${displayRating}`}
        onClose={() => setMobileSheet('none')}
      >
        {renderPuzzleDetails()}
      </BottomSheet>

      <BottomSheet
        open={mobileSheet === 'tutor'}
        title="Coach OpenChess — Puzzles"
        onClose={() => setMobileSheet('none')}
      >
        <CoachWorkspace
          fen={fen}
          pgn=""
          mode="puzzles"
          playerColor={playerSide}
          evalCp={evalCp}
          suggestedMoveSan={activePuzzle.solution[solutionStep] ?? ''}
          contextNote={`Solving rated puzzle "${activePuzzle.title}" (${activePuzzle.motif}, Puzzle ELO ${activePuzzle.rating}).`}
          onHighlightArrow={(arrow) => {
            setHintArrow(arrow);
            setMobileSheet('none');
          }}
        />
      </BottomSheet>
      </div>
    </div>
  );
}
