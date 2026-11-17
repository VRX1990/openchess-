export interface ChessPuzzle {
  id: string;
  title: string;
  rating: number;
  motif: string;
  fen: string;
  solution: string[]; // Alternating player move -> opponent reply -> player move (SAN)
  hint: string;
  explanation: string;
}

export interface OpeningLine {
  id: string;
  name: string;
  eco: string;
  side: 'w' | 'b';
  level: 'Essential' | 'Tournament' | 'Sharp';
  moves: string[]; // Full line in SAN from starting position
  summary: string;
  keyIdeas: string[];
}

export interface EndgameDrill {
  id: string;
  name: string;
  fen: string;
  side: 'w' | 'b';
  goal: string;
  tip: string;
}

export interface PrepDayPlan {
  id: string;
  dayLabel: string;
  focus: string;
  tasks: {
    id: string;
    label: string;
    targetMode: 'play' | 'puzzles' | 'learn' | 'review';
  }[];
}

export const PUZZLES: ChessPuzzle[] = [
  {
    id: 'puzzle-9WCog',
    title: 'Puzzle #9WCog',
    rating: 1126,
    motif: 'Attraction',
    fen: '6rk/3n1p1p/rq2pPpQ/2p1P3/p4R2/P1p5/1PP3PP/R5K1 w - - 1 1',
    solution: ['Qxh7+', 'Kxh7', 'Rh4#'],
    hint: 'Sacrifice the queen on h7 to attract the Black king onto the open h-file for your rook!',
    explanation:
      '1. Qxh7+! attracts the Black king to h7 (1...Kxh7), allowing 2. Rh4# Anastasias/corridor checkmate!',
  },
  {
    id: 'pz-1',
    title: 'Back-Rank Strike',
    rating: 950,
    motif: 'Back-Rank Checkmate',
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    solution: ['Rd8#'],
    hint: 'The Black king has no escape square on the 7th rank.',
    explanation:
      'Black forgot to create luft (an escape square with h6 or g6). Rd8# delivers immediate back-rank checkmate.',
  },
  {
    id: 'pz-2',
    title: 'Royal Knight Fork',
    rating: 1120,
    motif: 'Knight Fork',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4',
    solution: ['Ng5', 'd5', 'exd5'],
    hint: 'Target the weak f7 pawn alongside your bishop on c4.',
    explanation:
      'In the Italian Game, Ng5 immediately attacks f7 twice. Notice that after d5 exd5, White keeps pressure while avoiding premature sacrifices.',
  },
  {
    id: 'pz-3',
    title: 'Queen & King Skewer',
    rating: 1240,
    motif: 'Pin & Win',
    fen: '4k3/8/8/4q3/8/8/4R3/4K3 w - - 0 1',
    solution: ['Rxe5+'],
    hint: 'Look along the open e-file!',
    explanation:
      'Wait—the Black queen stands directly on the e-file in front of the Black king. Rxe5+ captures the queen with check!',
  },
  {
    id: 'pz-4',
    title: 'Philidor’s Smothered Mate',
    rating: 1450,
    motif: 'Smothered Checkmate',
    fen: '5r1k/6pp/7N/8/8/1Q6/8/6K1 w - - 0 1',
    solution: ['Qg8+', 'Rxg8', 'Nf7#'],
    hint: 'Force the Black rook onto g8 so the king is completely boxed in by its own pieces!',
    explanation:
      'Classic Philidor’s Legacy! 1. Qg8+! forces 1...Rxg8 (the king cannot take because Nh6 covers g8), sealing the king in for 2. Nf7#.',
  },
  {
    id: 'pz-5',
    title: 'Fried Liver Counterstrike',
    rating: 1320,
    motif: 'Double Attack on f2 & e4',
    fen: 'r1bqk2r/pppp1Npp/2n5/2b1p3/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 0 5',
    solution: ['Qh4', 'g3', 'Qxe4+'],
    hint: 'Black counterattacks! Look at the undefended e4 pawn and f2.',
    explanation:
      'In the Traxler / Italian complications, Qh4! attacks both f2 and e4 simultaneously, forcing White on the defensive and winning e4 with check.',
  },
  {
    id: 'pz-6',
    title: 'Back-Rank Deflection',
    rating: 1580,
    motif: 'Deflection Sacrifice',
    fen: '2r3k1/5ppp/8/8/3Q4/8/5PPP/3R2K1 w - - 0 1',
    solution: ['Qd8+', 'Rxd8', 'Rxd8#'],
    hint: 'Black’s rook on c8 is overworked guarding the back rank. Sacrifice the queen to lure it away!',
    explanation:
      '1. Qd8+! deflects the c8 rook off its guard post. After 1...Rxd8, 2. Rxd8# delivers unstoppable back-rank checkmate.',
  },
  {
    id: 'pz-7',
    title: 'Rook Infiltration on the 7th',
    rating: 1480,
    motif: '7th Rank Mate Net',
    fen: '6k1/5p2/6p1/8/8/8/1R4PP/6K1 w - - 0 1',
    solution: ['Rb8+', 'Kg7', 'Kf2'],
    hint: 'Cut off the king on the back rank with check first, then activate your king!',
    explanation:
      'In rook endgames, checks from behind or cutting the king off (Rb8+ Kg7) followed by centralizing your king (Kf2) is essential daily tournament technique.',
  },
  {
    id: 'pz-8',
    title: 'Greek Gift Sacrifice',
    rating: 1720,
    motif: 'Bxh7+ Attack',
    fen: 'r1bq1rk1/pppn1ppp/4pn2/3p4/1b1P4/2NBPN2/PP3PPP/R1BQK2R w KQ - 0 8',
    solution: ['Bxh7+', 'Kxh7', 'Ng5+'],
    hint: 'The classic Bishop sacrifice on h7 pulls the Black king out into the open.',
    explanation:
      'Bxh7+! Kxh7 Ng5+! launches the Greek Gift attack. When Black plays Kg8 or Kg6, White’s queen enters on h5 or g4 with decisive pressure.',
  },
];

export const OPENINGS: OpeningLine[] = [
  {
    id: 'op-italian',
    name: 'Italian Game (Giuoco Piano)',
    eco: 'C50',
    side: 'w',
    level: 'Essential',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6', 'd4'],
    summary: 'Classical central control targeting f7 and preparing a rapid d4 pawn break.',
    keyIdeas: [
      'Play c3 before d4 so you can recapture with a pawn and build a broad center.',
      'Castle kingside early and route b1-knight via d2 to f1-g3.',
      'Watch out for Black’s ...d5 counter-strike if you delay castling.',
    ],
  },
  {
    id: 'op-london',
    name: 'London System',
    eco: 'D02',
    side: 'w',
    level: 'Essential',
    moves: ['d4', 'd5', 'Bf4', 'Nf6', 'e3', 'c5', 'c3', 'Nc6', 'Nd2'],
    summary: 'Rock-solid tournament setup against almost any Black response.',
    keyIdeas: [
      'Always build the e3-c3-d4 pawn pyramid to lock down the d4 square.',
      'Plant a knight on e5 supported by f4 when Black castles kingside.',
      'Tuck the dark-squared bishop back to g3 if challenged by ...Bd6.',
    ],
  },
  {
    id: 'op-ruy',
    name: 'Ruy Lopez (Spanish Opening)',
    eco: 'C65',
    side: 'w',
    level: 'Tournament',
    moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O'],
    summary: 'Championship-level pressure on Black’s e5 pawn via the c6 knight.',
    keyIdeas: [
      'Maintain tension with Ba4 rather than trading on c6 prematurely.',
      'Prepare Re1 and c3-d4 to seize space in the center.',
      'Keep the c2-square open for your bishop to retreat after ...b5 and ...Na5.',
    ],
  },
  {
    id: 'op-sicilian',
    name: 'Sicilian Defense (Open Classical)',
    eco: 'B56',
    side: 'b',
    level: 'Sharp',
    moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'Nc6'],
    summary: 'Asymmetrical counter-attack fighting for the half-open c-file.',
    keyIdeas: [
      'Trade your c-pawn for White’s d-pawn to gain a 2-vs-1 central pawn majority.',
      'Use the half-open c-file for your rook (...Rc8) and queen (...Qa5 or ...Qc7).',
      'Watch out for White’s Bg5/Bc4 sacrifices on d5 or e6.',
    ],
  },
  {
    id: 'op-qgd',
    name: "Queen's Gambit Declined",
    eco: 'D37',
    side: 'b',
    level: 'Tournament',
    moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5', 'Be7', 'e3', 'O-O'],
    summary: 'Resilient classical defense against 1.d4 with zero structural weaknesses.',
    keyIdeas: [
      'Hold the d5 stronghold firmly; never panic when White plays Bg5.',
      'Break out in the middlegame with ...c5 or ...e5 after castling.',
      'Use ...Be7 and ...h6/...Nbd7 to unpin smoothly.',
    ],
  },
  {
    id: 'op-caro',
    name: 'Caro-Kann Defense',
    eco: 'B12',
    side: 'b',
    level: 'Essential',
    moves: ['e4', 'c6', 'd4', 'd5', 'e5', 'Bf5', 'Nf3', 'e6', 'Be2', 'c5'],
    summary: 'Reliable, practical weapon against 1.e4 ideal for daily competitive play.',
    keyIdeas: [
      'Develop the light-squared bishop to f5 BEFORE playing ...e6.',
      'Attack White’s overextended e5/d4 chain with ...c5.',
      'Endgames usually favor Black due to White’s queenside pawn weaknesses.',
    ],
  },
];

export const ENDGAMES: EndgameDrill[] = [
  {
    id: 'eg-kq',
    name: 'King & Queen Checkmate',
    fen: '4k3/8/8/8/8/8/3Q4/4K3 w - - 0 1',
    side: 'w',
    goal: 'Drive the lone Black king to the edge and checkmate without stalemating.',
    tip: 'Use the Knight-move box technique with your Queen, then walk your King in for the final mate.',
  },
  {
    id: 'eg-kr',
    name: 'King & Rook Box Mate',
    fen: '4k3/8/8/8/8/8/8/3RK3 w - - 0 1',
    side: 'w',
    goal: 'Cut off ranks with the Rook, bring your King into opposition, and mate on the edge.',
    tip: 'Avoid pointless rook checks! First cut the king off, then step your own king closer.',
  },
  {
    id: 'eg-kp',
    name: 'King & Pawn Opposition',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    side: 'w',
    goal: 'Promote the e-pawn cleanly by holding key squares in front of the pawn.',
    tip: 'Always keep your King ahead of your pawn. Here Ke6 already secures victory!',
  },
  {
    id: 'eg-lucena',
    name: 'Lucena Bridge Technique',
    fen: '1K1k4/1P6/8/8/8/8/r7/4R3 w - - 0 1',
    side: 'w',
    goal: 'Promote the b7 pawn by building a rook bridge on the 4th rank.',
    tip: 'First drive the Black king away with Re1-d1+ or Rf1, then place your Rook on the 4th rank to shield checks.',
  },
];

export interface SharpingDayPlan extends PrepDayPlan {
  weekdayIndex: number; // 0 = Sunday .. 6 = Saturday
  shortDay: string;
  badge: string;
  coachTip: string;
  altTasks: PrepDayPlan['tasks'][];
}

export const SHARPING_DAILY_PLANS: SharpingDayPlan[] = [
  {
    id: 'mon',
    weekdayIndex: 1,
    shortDay: 'Mon',
    badge: 'Tactical Ignition',
    dayLabel: 'Monday · Fork & Pin Sharping',
    focus: 'Start the week by waking up tactical pattern recognition: double attacks, royal forks, and absolute pins.',
    coachTip: 'Always scan every check and capture before touching a piece.',
    tasks: [
      { id: 'mon-1', label: 'Solve 5 Fork & Pin tactical puzzles with clean calculation', targetMode: 'puzzles' },
      { id: 'mon-2', label: 'Play a 10+0 Rapid Coach Game focusing on zero hanging pieces', targetMode: 'play' },
      { id: 'mon-3', label: 'Step through your latest game from Move 1 in Smart Review', targetMode: 'review' },
    ],
    altTasks: [
      [
        { id: 'mon-alt-1', label: 'Hit a 5+ streak in Tactical Puzzles without hints', targetMode: 'puzzles' },
        { id: 'mon-alt-2', label: 'Drill the Italian Game central d4 break on the board', targetMode: 'learn' },
        { id: 'mon-alt-3', label: 'Inspect your middlegame accuracy in Smart Coach Review', targetMode: 'review' },
      ],
      [
        { id: 'mon-alt-4', label: 'Complete a 3-Minute Puzzle Rush warm-up sprint', targetMode: 'puzzles' },
        { id: 'mon-alt-5', label: 'Play a 5+3 Blitz sparring match against Coach Dante', targetMode: 'play' },
        { id: 'mon-alt-6', label: 'Fix 1 mistake using "Retry Move" in Game Review', targetMode: 'review' },
      ],
    ],
  },
  {
    id: 'tue',
    weekdayIndex: 2,
    shortDay: 'Tue',
    badge: 'Opening Mastery',
    dayLabel: 'Tuesday · Opening Repertoire Sharping',
    focus: 'Lock in your first 8 moves as both White and Black so you emerge from the opening with an advantage.',
    coachTip: 'Fight for the center with pawns and castle before move 8.',
    tasks: [
      { id: 'tue-1', label: 'Drill 1 White repertoire line (Italian Game or London System)', targetMode: 'learn' },
      { id: 'tue-2', label: 'Drill 1 Black counter-weapon (Sicilian or Caro-Kann Defense)', targetMode: 'learn' },
      { id: 'tue-3', label: 'Test your opening in a live or Coach sparring game', targetMode: 'play' },
    ],
    altTasks: [
      [
        { id: 'tue-alt-1', label: 'Clear Ruy Lopez or Queen’s Gambit from memory in Academy', targetMode: 'learn' },
        { id: 'tue-alt-2', label: 'Solve 4 Opening Trap & Deflection puzzles', targetMode: 'puzzles' },
        { id: 'tue-alt-3', label: 'Check your Opening Phase accuracy in Game Review', targetMode: 'review' },
      ],
      [
        { id: 'tue-alt-4', label: 'Practice both 1.e4 and 1.d4 responses in Opening Lab', targetMode: 'learn' },
        { id: 'tue-alt-5', label: 'Play a 10+0 match as Black and equalize by move 10', targetMode: 'play' },
        { id: 'tue-alt-6', label: 'Walk through Book moves from Move 1 in Game Review', targetMode: 'review' },
      ],
    ],
  },
  {
    id: 'wed',
    weekdayIndex: 3,
    shortDay: 'Wed',
    badge: 'Middlegame Attack',
    dayLabel: 'Wednesday · Initiative & Attack Sharping',
    focus: 'Sharpen your kingside attacking instincts, outpost control, and sacrificial breakthroughs.',
    coachTip: 'When your pieces outnumber the defenders around the enemy king, look for forcing sacrifices.',
    tasks: [
      { id: 'wed-1', label: 'Solve 5 Mating Net & Greek Gift attacking puzzles', targetMode: 'puzzles' },
      { id: 'wed-2', label: 'Spar against Coach Dante or Viktor in an attacking battle', targetMode: 'play' },
      { id: 'wed-3', label: 'Use Smart Coach Review to find your highest-impact move', targetMode: 'review' },
    ],
    altTasks: [
      [
        { id: 'wed-alt-1', label: 'Solve 5 Back-Rank & Smothered Mate combinations', targetMode: 'puzzles' },
        { id: 'wed-alt-2', label: 'Drill Sicilian Defense counter-attacking ideas in Academy', targetMode: 'learn' },
        { id: 'wed-alt-3', label: 'Review a recent win from Move 1 to spot missed brilliancies', targetMode: 'review' },
      ],
      [
        { id: 'wed-alt-4', label: 'Beat your personal best score in Puzzle Rush', targetMode: 'puzzles' },
        { id: 'wed-alt-5', label: 'Play an aggressive 3+2 Blitz match without blundering', targetMode: 'play' },
        { id: 'wed-alt-6', label: 'Analyze turning-point swings in Smart Coach Review', targetMode: 'review' },
      ],
    ],
  },
  {
    id: 'thu',
    weekdayIndex: 4,
    shortDay: 'Thu',
    badge: 'Endgame Precision',
    dayLabel: 'Thursday · Endgame & Conversion Sharping',
    focus: 'Turn winning advantages into full points by mastering king opposition, rook bridges, and clean mates.',
    coachTip: 'In the endgame, your King is an attacking piece—centralize it immediately!',
    tasks: [
      { id: 'thu-1', label: 'Master King & Pawn Opposition + Lucena Bridge in Academy', targetMode: 'learn' },
      { id: 'thu-2', label: 'Solve 4 Endgame & Promotion tactical puzzles', targetMode: 'puzzles' },
      { id: 'thu-3', label: 'Play a match with Coach Vera focusing on clean conversion', targetMode: 'play' },
    ],
    altTasks: [
      [
        { id: 'thu-alt-1', label: 'Complete King & Rook Box Mate and K+Q Mate drills', targetMode: 'learn' },
        { id: 'thu-alt-2', label: 'Solve 5 Rook on the 7th Rank tactical puzzles', targetMode: 'puzzles' },
        { id: 'thu-alt-3', label: 'Inspect your Endgame Phase rating in Smart Review', targetMode: 'review' },
      ],
      [
        { id: 'thu-alt-4', label: 'Drill all 4 essential endgame positions in Academy', targetMode: 'learn' },
        { id: 'thu-alt-5', label: 'Play a 10+0 Rapid game and convert without time trouble', targetMode: 'play' },
        { id: 'thu-alt-6', label: 'Review a close endgame from Move 1 to the final move', targetMode: 'review' },
      ],
    ],
  },
  {
    id: 'fri',
    weekdayIndex: 5,
    shortDay: 'Fri',
    badge: 'Blunder Immunity',
    dayLabel: 'Friday · Blunder-Check & Defense Sharping',
    focus: 'Eliminate 1-move oversights by practicing threat decoding and defensive prophylaxis.',
    coachTip: 'Always ask: "What is my opponent threatening right now?" before making your move.',
    tasks: [
      { id: 'fri-1', label: 'Reach a 4+ clean puzzle streak without a single miss', targetMode: 'puzzles' },
      { id: 'fri-2', label: 'Play a Coach Game and finish with 0 Blunders', targetMode: 'play' },
      { id: 'fri-3', label: 'Run Smart Coach Review and replay every Mistake/Blunder', targetMode: 'review' },
    ],
    altTasks: [
      [
        { id: 'fri-alt-1', label: 'Solve 6 Hanging Piece & Defensive Resource puzzles', targetMode: 'puzzles' },
        { id: 'fri-alt-2', label: 'Drill Caro-Kann or QGD solid defensive structures', targetMode: 'learn' },
        { id: 'fri-alt-3', label: 'Use Auto-Review to watch your last game from Move 1', targetMode: 'review' },
      ],
      [
        { id: 'fri-alt-4', label: 'Score 8+ in Puzzle Rush with zero early strikes', targetMode: 'puzzles' },
        { id: 'fri-alt-5', label: 'Spar against Coach Elena or Viktor with Coach Hints on', targetMode: 'play' },
        { id: 'fri-alt-6', label: 'Check your Blunder count across recent games in Review', targetMode: 'review' },
      ],
    ],
  },
  {
    id: 'sat',
    weekdayIndex: 6,
    shortDay: 'Sat',
    badge: 'Arena Simulation',
    dayLabel: 'Saturday · Deep Calculation & Match Sharping',
    focus: 'Simulate tournament pressure: deeper calculation, clock discipline, and multi-move combinations.',
    coachTip: 'Calculate forcing moves first: checks, captures, and direct threats.',
    tasks: [
      { id: 'sat-1', label: 'Play a 15+10 or 10+0 serious match against a strong opponent', targetMode: 'play' },
      { id: 'sat-2', label: 'Solve 5 high-rated multi-move tactical puzzles', targetMode: 'puzzles' },
      { id: 'sat-3', label: 'Run full Smart Coach Analysis from Move 1 on your match', targetMode: 'review' },
    ],
    altTasks: [
      [
        { id: 'sat-alt-1', label: 'Challenge a Tournament/Master bot or live online player', targetMode: 'play' },
        { id: 'sat-alt-2', label: 'Drill your favorite White & Black openings from memory', targetMode: 'learn' },
        { id: 'sat-alt-3', label: 'Compare your Opening, Middlegame & Endgame accuracy', targetMode: 'review' },
      ],
      [
        { id: 'sat-alt-4', label: 'Play 2 back-to-back Rapid/Blitz games maintaining 80%+ accuracy', targetMode: 'play' },
        { id: 'sat-alt-5', label: 'Solve 5 Mate-in-2 & Mate-in-3 calculation puzzles', targetMode: 'puzzles' },
        { id: 'sat-alt-6', label: 'Use "Next Key Move" in Game Review to study critical turns', targetMode: 'review' },
      ],
    ],
  },
  {
    id: 'sun',
    weekdayIndex: 0,
    shortDay: 'Sun',
    badge: 'Peak Sharpness',
    dayLabel: 'Sunday · Speed, Intuition & Review Synthesis',
    focus: 'Combine fast pattern recognition with full-game review to lock in the week’s rating gains.',
    coachTip: 'Confidence comes from clarity—keep your pieces active and trust your calculation.',
    tasks: [
      { id: 'sun-1', label: 'Wake up intuition with 5 fast tactical puzzles', targetMode: 'puzzles' },
      { id: 'sun-2', label: 'Review your opening key ideas & endgame bridges in Academy', targetMode: 'learn' },
      { id: 'sun-3', label: 'Play a confidence match and review it from Move 1', targetMode: 'play' },
    ],
    altTasks: [
      [
        { id: 'sun-alt-1', label: 'Run a 3-Minute Puzzle Rush challenge for peak speed', targetMode: 'puzzles' },
        { id: 'sun-alt-2', label: 'Play a live online match or Coach sparring session', targetMode: 'play' },
        { id: 'sun-alt-3', label: 'Generate a Smart Coach Report on your favorite game', targetMode: 'review' },
      ],
      [
        { id: 'sun-alt-4', label: 'Solve 5 Crushing Advantage puzzles cleanly', targetMode: 'puzzles' },
        { id: 'sun-alt-5', label: 'Clear 1 White and 1 Black opening drill in Academy', targetMode: 'learn' },
        { id: 'sun-alt-6', label: 'Inspect your weekly Training DNA & phase accuracies', targetMode: 'review' },
      ],
    ],
  },
];

export function getSharpingPlanForDay(weekdayIndex: number, rotation = 0): SharpingDayPlan {
  const found =
    SHARPING_DAILY_PLANS.find((d) => d.weekdayIndex === ((weekdayIndex % 7) + 7) % 7) ??
    SHARPING_DAILY_PLANS[0];
  const cleanRot = Math.abs(Math.floor(rotation));
  if (cleanRot === 0 || found.altTasks.length === 0) {
    return found;
  }
  const chosenTasks = found.altTasks[(cleanRot - 1) % found.altTasks.length] ?? found.tasks;
  return {
    ...found,
    tasks: chosenTasks,
  };
}

export const DEFAULT_PREP_PLAN: PrepDayPlan[] = SHARPING_DAILY_PLANS;

