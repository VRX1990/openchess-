import { useEffect, useState } from 'react';
import { Chess, type Color } from 'chess.js';
import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FlipVertical2,
  Heart,
  Loader2,
  Search,
  User,
} from 'lucide-react';
import {
  CURATED_STUDY_CARDS,
  type StudyChapter,
  type StudySummaryCard,
} from '../chess/learnCurriculum';
import { evaluatePosition } from '../chess/engine';
import { ChessBoard, type BoardTheme } from './ChessBoard';
import { EvaluationBar } from './EvaluationBar';
import { TutorPanel } from './TutorPanel';

interface LearnStudyViewProps {
  boardTheme: BoardTheme;
  initialStudyId?: string;
  onStudyExplored?: () => void;
  onBack?: () => void;
}

const TOPICS = ['all', 'Opening', 'Endgame', 'Tactics', 'Strategy'] as const;

export function LearnStudyView({
  boardTheme,
  initialStudyId,
  onStudyExplored,
  onBack,
}: LearnStudyViewProps) {
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>('all');
  const [sort, setSort] = useState<'popular' | 'hot' | 'newest'>('popular');
  const [searchQuery, setSearchQuery] = useState('');
  const [authorFilter, setAuthorFilter] = useState('');
  const [studyIdInput, setStudyIdInput] = useState('');

  const [studies, setStudies] = useState<StudySummaryCard[]>(CURATED_STUDY_CARDS);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [activeStudy, setActiveStudy] = useState<{
    id: string;
    name: string;
    chapters: StudyChapter[];
  } | null>(null);
  const [loadingStudy, setLoadingStudy] = useState(false);
  const [studyError, setStudyError] = useState<string | null>(null);

  const [chapterIdx, setChapterIdx] = useState(0);
  const [plyIdx, setPlyIdx] = useState(0); // 0 = initialFen, 1..N = moves[plyIdx - 1]
  const [flipped, setFlipped] = useState(false);
  const [rightTab, setRightTab] = useState<'moves' | 'chapters' | 'coach'>('moves');

  const fetchCatalog = async (opts?: { author?: string; q?: string }) => {
    setLoadingList(true);
    setListError(null);
    try {
      const qs = new URLSearchParams({ sort, topic });
      if (opts?.author) qs.set('author', opts.author);
      if (opts?.q) qs.set('q', opts.q);
      const res = await fetch(`/api/learn/studies?${qs.toString()}`);
      const data = (await res.json()) as { studies?: StudySummaryCard[]; error?: string };
      if (!res.ok) throw new Error(data.error || 'Could not load studies.');
      setStudies(data.studies && data.studies.length > 0 ? data.studies : CURATED_STUDY_CARDS);
    } catch (err: unknown) {
      setListError(err instanceof Error ? err.message : 'Unable to reach Study library.');
    } finally {
      setLoadingList(false);
    }
  };

  useEffect(() => {
    void fetchCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, sort]);

  useEffect(() => {
    if (initialStudyId) {
      void openStudyById(initialStudyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialStudyId]);

  const openStudyById = async (rawId: string) => {
    const cleaned = rawId.trim().split('/').pop()?.slice(0, 12) ?? '';
    if (!/^[a-zA-Z0-9]{6,12}$/.test(cleaned)) {
      setListError('Enter a valid 8-character Study ID.');
      return;
    }
    setLoadingStudy(true);
    setStudyError(null);
    try {
      const res = await fetch(`/api/learn/study/${encodeURIComponent(cleaned)}`);
      const data = (await res.json()) as {
        studyId?: string;
        studyName?: string;
        chapters?: StudyChapter[];
        error?: string;
      };
      if (!res.ok || !Array.isArray(data.chapters) || data.chapters.length === 0) {
        throw new Error(data.error || 'Could not load this study.');
      }
      setActiveStudy({
        id: data.studyId ?? cleaned,
        name: data.studyName ?? 'Interactive Study',
        chapters: data.chapters,
      });
      setChapterIdx(0);
      setPlyIdx(0);
      setFlipped(false);
      setRightTab('moves');
      onStudyExplored?.();
    } catch (err: unknown) {
      setStudyError(err instanceof Error ? err.message : 'Failed to load study chapters.');
    } finally {
      setLoadingStudy(false);
    }
  };

  if (!activeStudy && !loadingStudy) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label="Back to Learn"
                className="w-10 h-10 rounded-lg flex items-center justify-center text-[#DEDAD2] hover:text-white cursor-pointer"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div>
              <h2 className="text-lg font-extrabold text-white font-display">Interactive Studies</h2>
              <p className="text-xs text-[#9E998F]">
                Step through annotated opening repertoires, master traps, and endgame lectures chapter by chapter.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 p-1 rounded-lg bg-[#1A1917] border border-white/10">
            {(['popular', 'hot', 'newest'] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSort(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold capitalize cursor-pointer ${
                  sort === s ? 'bg-[#393734] text-white' : 'text-[#9E998F] hover:text-white'
                }`}
              >
                {s === 'hot' ? 'Trending' : s}
              </button>
            ))}
          </div>
        </div>

        {/* Topic & Search Bar */}
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {TOPICS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTopic(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  topic === t
                    ? 'bg-[#393734] border-[#81B64C] text-white'
                    : 'bg-[#21201D] border-white/10 text-[#9E998F] hover:text-white'
                }`}
              >
                {t === 'all' ? 'All Topics' : t}
              </button>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (studyIdInput.trim()) {
                void openStudyById(studyIdInput);
              } else {
                void fetchCatalog({ author: authorFilter.trim() || undefined, q: searchQuery.trim() });
              }
            }}
            className="flex flex-wrap gap-1.5"
          >
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#8E8980] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter studies..."
                className="bg-[#1A1917] border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C] w-36"
              />
            </div>
            <div className="relative">
              <User className="w-3.5 h-3.5 text-[#8E8980] absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
                placeholder="By author..."
                className="bg-[#1A1917] border border-white/10 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C] w-32"
              />
            </div>
            <input
              type="text"
              value={studyIdInput}
              onChange={(e) => setStudyIdInput(e.target.value)}
              placeholder="Study ID..."
              className="bg-[#1A1917] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs font-mono text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C] w-24"
            />
            <button
              type="submit"
              className="px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-xs font-extrabold text-[#191815] cursor-pointer"
            >
              Go
            </button>
          </form>
        </div>

        {(listError || studyError) && (
          <div className="p-2.5 rounded-lg bg-[#5C2320]/60 border border-[#E06C5A]/40 text-xs text-[#F7C7C1]">
            {listError || studyError}
          </div>
        )}

        {loadingList ? (
          <div className="py-12 flex items-center justify-center gap-2 text-xs text-[#9E998F]">
            <Loader2 className="w-5 h-5 animate-spin text-[#81B64C]" />
            <span>Loading Study Library...</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {studies.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => void openStudyById(st.id)}
                className="p-4 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 hover:border-[#81B64C]/50 text-left flex flex-col justify-between gap-3 transition-colors cursor-pointer"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-[11px] text-[#9E998F]">
                    <span className="truncate">By {st.author}</span>
                    {st.likes > 0 && (
                      <span className="flex items-center gap-1 font-mono tabular-nums shrink-0">
                        <Heart className="w-3 h-3 text-[#FA412D]" />
                        <span>{st.likes.toLocaleString()}</span>
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-extrabold text-white line-clamp-2">{st.name}</div>
                  {st.chapters.length > 0 && (
                    <div className="text-[11px] text-[#B8B4AC] space-y-0.5 pt-1">
                      {st.chapters.slice(0, 3).map((ch, idx) => (
                        <div key={idx} className="truncate">
                          {idx + 1}. {ch}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/8 text-xs font-bold text-[#81B64C]">
                  <span className="flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Open Study</span>
                  </span>
                  <ChevronRight className="w-4 h-4" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (loadingStudy || !activeStudy) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3 text-xs text-[#C8C4BC]">
        <Loader2 className="w-6 h-6 animate-spin text-[#81B64C]" />
        <span>Parsing Study chapters &amp; annotations...</span>
      </div>
    );
  }

  const chapter = activeStudy.chapters[chapterIdx] ?? activeStudy.chapters[0];
  const activeMove = plyIdx > 0 ? chapter.moves[plyIdx - 1] : null;
  const activeFen = activeMove ? activeMove.fen : chapter.initialFen;
  const activeComment = activeMove ? activeMove.comment : chapter.initialComment;
  const activeArrows = activeMove ? activeMove.arrows : chapter.initialArrows;
  const activeHighlights = activeMove ? activeMove.highlights : chapter.initialHighlights;
  const activeLastMove = activeMove ? { from: activeMove.from, to: activeMove.to } : null;
  const baseOrientation: Color = chapter.orientation;
  const boardOrientation: Color = flipped
    ? baseOrientation === 'w'
      ? 'b'
      : 'w'
    : baseOrientation;

  let evalCp = 0;
  try {
    evalCp = evaluatePosition(new Chess(activeFen));
  } catch {
    evalCp = 0;
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_390px] xl:grid-cols-[minmax(0,1fr)_420px] gap-4 lg:gap-5 items-start">
      <div className="flex justify-center">
        <div className="w-full max-w-[min(560px,max(240px,calc(100dvh-295px)))] lg:max-w-[min(560px,max(360px,calc(100dvh-195px)))] space-y-2.5">
          {/* Study Viewer Header */}
          <div className="flex items-center justify-between gap-2 px-1">
            <button
              type="button"
              onClick={() => setActiveStudy(null)}
              className="flex items-center gap-1.5 text-xs font-bold text-[#C8C4BC] hover:text-white cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Library</span>
            </button>
            <div className="text-xs font-bold text-white truncate text-right">
              {activeStudy.name} · {chapter.name}
            </div>
          </div>

          <div className="-mx-2.5 sm:mx-0 flex items-stretch gap-1 sm:gap-2.5">
            <EvaluationBar evalCp={evalCp} orientation={boardOrientation} />
            <div className="flex-1 min-w-0">
              <ChessBoard
                fen={activeFen}
                orientation={boardOrientation}
                interactive={false}
                lastMove={activeLastMove}
                extraArrows={activeArrows}
                highlightSquares={activeHighlights}
                theme={boardTheme}
                onMove={() => false}
              />
            </div>
          </div>

          {/* Stepper Toolbar */}
          <div className="grid grid-cols-5 gap-1.5">
            <button
              type="button"
              onClick={() => setPlyIdx(0)}
              disabled={plyIdx === 0}
              aria-label="First move"
              className="min-h-[42px] rounded-lg bg-[#2A2824] hover:bg-[#383530] flex items-center justify-center text-white cursor-pointer disabled:opacity-40"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setPlyIdx((p) => Math.max(0, p - 1))}
              disabled={plyIdx === 0}
              aria-label="Previous move"
              className="min-h-[42px] rounded-lg bg-[#2A2824] hover:bg-[#383530] flex items-center justify-center text-white cursor-pointer disabled:opacity-40"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setPlyIdx((p) => Math.min(chapter.moves.length, p + 1))}
              disabled={plyIdx >= chapter.moves.length}
              aria-label="Next move"
              className="min-h-[42px] rounded-lg bg-[#81B64C] hover:bg-[#8EC556] flex items-center justify-center text-[#191815] font-extrabold cursor-pointer disabled:opacity-40"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setPlyIdx(chapter.moves.length)}
              disabled={plyIdx >= chapter.moves.length}
              aria-label="Final move"
              className="min-h-[42px] rounded-lg bg-[#2A2824] hover:bg-[#383530] flex items-center justify-center text-white cursor-pointer disabled:opacity-40"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              aria-label="Flip board"
              className="min-h-[42px] rounded-lg bg-[#2A2824] hover:bg-[#383530] flex items-center justify-center text-[#C8C4BC] hover:text-white cursor-pointer"
            >
              <FlipVertical2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right Study Inspector Dock */}
      <aside className="bg-[#21201D] border border-white/10 rounded-xl overflow-hidden flex flex-col lg:h-[min(640px,calc(100dvh-5rem))]">
        <div
          role="tablist"
          className="grid grid-cols-3 bg-[#1A1917] border-b border-white/10 p-1 gap-1 shrink-0"
        >
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'moves'}
            onClick={() => setRightTab('moves')}
            className={`py-2 rounded text-xs font-bold cursor-pointer ${
              rightTab === 'moves' ? 'bg-[#312E2A] text-white' : 'text-[#9E998F]'
            }`}
          >
            Notation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'chapters'}
            onClick={() => setRightTab('chapters')}
            className={`py-2 rounded text-xs font-bold cursor-pointer ${
              rightTab === 'chapters' ? 'bg-[#312E2A] text-white' : 'text-[#9E998F]'
            }`}
          >
            Chapters ({activeStudy.chapters.length})
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={rightTab === 'coach'}
            onClick={() => setRightTab('coach')}
            className={`py-2 rounded text-xs font-bold cursor-pointer ${
              rightTab === 'coach' ? 'bg-[#312E2A] text-white' : 'text-[#9E998F]'
            }`}
          >
            Coach
          </button>
        </div>

        {rightTab === 'moves' && (
          <div className="p-4 space-y-3.5 overflow-y-auto flex-1">
            {(chapter.opening || chapter.eco) && (
              <div className="text-xs text-[#9E998F]">
                {[chapter.eco, chapter.opening].filter(Boolean).join(' · ')}
              </div>
            )}

            {/* Annotation Box */}
            <div className="p-3 rounded-lg bg-[#1A1917] border border-white/8 text-xs text-[#DEDAD2] leading-relaxed">
              {activeComment ||
                'Step through the moves below to inspect the author’s lines and ideas.'}
            </div>

            {activeMove && activeMove.variationsText.length > 0 && (
              <div className="p-2.5 rounded-lg bg-[#1A1917] border border-white/8 space-y-1">
                <div className="text-[11px] font-bold text-[#E59A28]">Sidelines</div>
                {activeMove.variationsText.map((v, i) => (
                  <div key={i} className="font-mono text-[11px] text-[#C8C4BC]">
                    ({v})
                  </div>
                ))}
              </div>
            )}

            {/* Interactive Move Tree */}
            <div className="flex flex-wrap gap-1.5 font-mono text-xs tabular-nums">
              {chapter.moves.map((m, idx) => (
                <button
                  key={`${m.ply}-${m.san}`}
                  type="button"
                  onClick={() => setPlyIdx(idx + 1)}
                  className={`px-2 py-1 rounded cursor-pointer transition-colors ${
                    plyIdx === idx + 1
                      ? 'bg-[#81B64C] text-[#191815] font-extrabold'
                      : m.comment
                        ? 'bg-[#2F2C27] text-[#F7C045] hover:bg-[#3A3731]'
                        : 'bg-[#1A1917] text-[#DEDAD2] hover:bg-[#2E2B27]'
                  }`}
                >
                  {idx % 2 === 0 ? `${idx / 2 + 1}.` : ''}
                  {m.san}
                </button>
              ))}
            </div>
          </div>
        )}

        {rightTab === 'chapters' && (
          <div className="p-3.5 space-y-1.5 overflow-y-auto flex-1">
            {activeStudy.chapters.map((ch, idx) => (
              <button
                key={`${ch.name}-${idx}`}
                type="button"
                onClick={() => {
                  setChapterIdx(idx);
                  setPlyIdx(0);
                  setFlipped(false);
                  setRightTab('moves');
                }}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border text-left cursor-pointer ${
                  idx === chapterIdx
                    ? 'bg-[#312E2A] border-[#81B64C]'
                    : 'bg-[#1A1917] border-white/8 hover:border-white/20'
                }`}
              >
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {idx + 1}. {ch.name}
                  </div>
                  <div className="text-[11px] text-[#9E998F]">
                    {ch.moves.length} moves{ch.eco ? ` · ${ch.eco}` : ''}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-[#6D6961] shrink-0" />
              </button>
            ))}
          </div>
        )}

        {rightTab === 'coach' && (
          <TutorPanel
            fen={activeFen}
            pgn=""
            mode="learn"
            evalCp={evalCp}
            playerColor={boardOrientation}
            suggestedMoveSan=""
            contextNote={`Reviewing study "${activeStudy.name}" — chapter "${chapter.name}".`}
          />
        )}
      </aside>
    </div>
  );
}
