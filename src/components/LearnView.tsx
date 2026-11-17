import { useEffect, useState } from 'react';
import {
  BookOpen,
  ChevronRight,
  Crosshair,
  GraduationCap,
  Heart,
  Swords,
} from 'lucide-react';
import {
  CHESS_BASICS_LESSONS,
  CURATED_STUDY_CARDS,
  PRACTICE_COURSES,
  loadBasicsProgress,
  loadCoordBest,
  loadPracticeProgress,
  type StudySummaryCard,
} from '../chess/learnCurriculum';
import type { BoardTheme } from './ChessBoard';
import { ChessPiece } from './ChessPiece';
import { LearnBasicsView } from './LearnBasicsView';
import { LearnPracticeView } from './LearnPracticeView';
import { LearnCoordinatesView } from './LearnCoordinatesView';
import { LearnStudyView } from './LearnStudyView';

interface LearnViewProps {
  boardTheme: BoardTheme;
  onLessonCompleted: () => void;
}

type LearnSection = 'hub' | 'basics' | 'practice' | 'coordinates' | 'study';

const STUDY_BADGE_COLORS = [
  'bg-[#81B64C]/20 text-[#81B64C]',
  'bg-[#E59A28]/20 text-[#F7C045]',
  'bg-[#6FB3E0]/20 text-[#6FB3E0]',
  'bg-[#E06C5A]/20 text-[#E06C5A]',
];

export function LearnView({ boardTheme, onLessonCompleted }: LearnViewProps) {
  const [section, setSection] = useState<LearnSection>('hub');
  const [initialStudyId, setInitialStudyId] = useState<string | undefined>(undefined);
  const [studies, setStudies] = useState<StudySummaryCard[]>(CURATED_STUDY_CARDS);

  useEffect(() => {
    document.body.dataset.state = `learn-${section}`;
  }, [section]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/learn/studies?sort=popular&topic=all')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { studies?: StudySummaryCard[] } | null) => {
        if (!cancelled && Array.isArray(data?.studies) && data.studies.length > 0) {
          setStudies(data.studies.slice(0, 6));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (section === 'basics') {
    return (
      <LearnBasicsView
        boardTheme={boardTheme}
        onLessonCompleted={onLessonCompleted}
        onBack={() => setSection('hub')}
      />
    );
  }

  if (section === 'practice') {
    return (
      <LearnPracticeView
        boardTheme={boardTheme}
        onLessonCompleted={onLessonCompleted}
        onBack={() => setSection('hub')}
      />
    );
  }

  if (section === 'coordinates') {
    return (
      <LearnCoordinatesView
        boardTheme={boardTheme}
        onDrillCompleted={onLessonCompleted}
        onBack={() => setSection('hub')}
      />
    );
  }

  if (section === 'study') {
    return (
      <LearnStudyView
        boardTheme={boardTheme}
        initialStudyId={initialStudyId}
        onStudyExplored={onLessonCompleted}
        onBack={() => {
          setInitialStudyId(undefined);
          setSection('hub');
        }}
      />
    );
  }

  // Learn Hub (Chess.com dark UI matching Photos #2-#6 navigation flow)
  const basicsProgress = loadBasicsProgress();
  const basicsPct = Math.round(
    (Object.keys(basicsProgress).length / Math.max(1, CHESS_BASICS_LESSONS.length)) * 100,
  );
  const practiceProgress = loadPracticeProgress();
  const practiceDone = Object.values(practiceProgress).reduce(
    (acc, list) => acc + list.length,
    0,
  );
  const practiceTotal = PRACTICE_COURSES.reduce(
    (acc, c) => acc + (c.totalExercises ?? 8),
    0,
  );
  const coordBest = loadCoordBest();
  const bestCoord = Math.max(coordBest.w, coordBest.b, coordBest.random);

  return (
    <div className="max-w-3xl mx-auto space-y-5 pb-20 lg:pb-8">
      {/* Top Learn Header */}
      <div className="flex items-center justify-between px-0.5 pt-1">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#81B64C]/20 border border-[#81B64C]/40 flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5 text-[#81B64C]" />
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white font-display">
            Learn
          </h1>
        </div>
      </div>

      {/* Primary Learn Modules Menu Card (Chess basics / Practice / Coordinate training) */}
      <section className="rounded-2xl bg-[#393734] overflow-hidden divide-y divide-white/8 shadow-md">
        <button
          type="button"
          onClick={() => setSection('basics')}
          className="w-full px-4 py-3.5 hover:bg-[#43403C] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#81B64C]/20 flex items-center justify-center shrink-0">
              <div className="w-6 h-6">
                <ChessPiece type="p" color="w" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-white">Chess basics</div>
              <div className="text-xs text-[#9E998F]">
                Piece movement, captures, checkmate &amp; special rules
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono font-bold text-[#81B64C] tabular-nums">
              {basicsPct}%
            </span>
            <ChevronRight className="w-4 h-4 text-[#9E998F]" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSection('practice')}
          className="w-full px-4 py-3.5 hover:bg-[#43403C] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#F7C045]/15 flex items-center justify-center shrink-0">
              <Swords className="w-5 h-5 text-[#F7C045]" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-white">Practice</div>
              <div className="text-xs text-[#9E998F]">
                Checkmate patterns, tactics &amp; endgame drills
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-mono font-bold text-[#DEDAD2] tabular-nums">
              {practiceDone}/{practiceTotal}
            </span>
            <ChevronRight className="w-4 h-4 text-[#9E998F]" />
          </div>
        </button>

        <button
          type="button"
          onClick={() => setSection('coordinates')}
          className="w-full px-4 py-3.5 hover:bg-[#43403C] flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[#6FB3E0]/15 flex items-center justify-center shrink-0">
              <Crosshair className="w-5 h-5 text-[#6FB3E0]" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-extrabold text-white">Coordinate training</div>
              <div className="text-xs text-[#9E998F]">
                30-second square vision speed sprints
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {bestCoord > 0 && (
              <span className="text-xs font-mono font-bold text-[#F7C045] tabular-nums">
                Best {bestCoord}
              </span>
            )}
            <ChevronRight className="w-4 h-4 text-[#9E998F]" />
          </div>
        </button>
      </section>

      {/* Study Section (More > opens full Study Library) */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between px-0.5">
          <h2 className="text-lg font-extrabold text-white font-display">Study</h2>
          <button
            type="button"
            onClick={() => {
              setInitialStudyId(undefined);
              setSection('study');
            }}
            className="flex items-center gap-1 text-xs font-bold text-[#DEDAD2] hover:text-white cursor-pointer"
          >
            <span>More</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-2xl bg-[#393734] overflow-hidden divide-y divide-white/8 shadow-md">
          {studies.slice(0, 5).map((st, idx) => (
            <button
              key={st.id}
              type="button"
              onClick={() => {
                setInitialStudyId(st.id);
                setSection('study');
              }}
              className="w-full px-4 py-3.5 hover:bg-[#43403C] flex items-center gap-3.5 text-left transition-colors cursor-pointer"
            >
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  STUDY_BADGE_COLORS[idx % STUDY_BADGE_COLORS.length]
                }`}
              >
                <BookOpen className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm sm:text-base font-extrabold text-white truncate">
                  {st.name}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-[#9E998F] mt-0.5 truncate">
                  <Heart className="w-3.5 h-3.5 text-[#E06C5A] shrink-0" />
                  <span className="font-mono tabular-nums">
                    {st.likes.toLocaleString()}
                  </span>
                  <span>·</span>
                  <span className="truncate font-semibold text-[#DEDAD2]">
                    {st.author}
                  </span>
                  {st.ageLabel && (
                    <>
                      <span>·</span>
                      <span className="shrink-0">{st.ageLabel}</span>
                    </>
                  )}
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-[#9E998F] shrink-0" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
