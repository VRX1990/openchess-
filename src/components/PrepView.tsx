import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Brain,
  CheckSquare,
  Flame,
  RefreshCw,
  Sparkles,
  Square,
  Target,
  Trophy,
  Zap,
} from 'lucide-react';
import {
  getSharpingPlanForDay,
  SHARPING_DAILY_PLANS,
} from '../chess/content';
import {
  loadMatchHistory,
  loadRushBest,
  summarizeTrainingDna,
} from '../chess/analytics';

export type NavTab =
  | 'home'
  | 'profile'
  | 'streak'
  | 'new-game'
  | 'bots'
  | 'play'
  | 'puzzles'
  | 'learn'
  | 'watch'
  | 'friends'
  | 'review'
  | 'prep'
  | 'messages'
  | 'leaderboard'
  | 'auth';

interface PrepViewProps {
  stats: {
    gamesPlayed: number;
    puzzlesSolved: number;
    lessonsCompleted: number;
  };
  onNavigate: (tab: NavTab) => void;
}

const SHARPING_STORAGE_KEY = 'openchess_daily_sharping_done';
const LEGACY_PREP_KEY = 'crownline_sunday_prep';

export function PrepView({ stats, onNavigate }: PrepViewProps) {
  const todayWeekday = useMemo(() => new Date().getDay(), []);
  const [selectedWeekday, setSelectedWeekday] = useState<number>(todayWeekday);
  const [rotations, setRotations] = useState<Record<number, number>>({});

  const [completedIds, setCompletedIds] = useState<string[]>(() => {
    try {
      const saved =
        localStorage.getItem(SHARPING_STORAGE_KEY) ??
        localStorage.getItem(LEGACY_PREP_KEY);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    document.body.dataset.state = 'prep';
  }, []);

  const toggleTask = (taskId: string) => {
    setCompletedIds((prev) => {
      const next = prev.includes(taskId)
        ? prev.filter((id) => id !== taskId)
        : [...prev, taskId];
      try {
        localStorage.setItem(SHARPING_STORAGE_KEY, JSON.stringify(next));
        localStorage.setItem(LEGACY_PREP_KEY, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const handleShuffleDay = (weekdayIndex: number) => {
    setRotations((prev) => ({
      ...prev,
      [weekdayIndex]: (prev[weekdayIndex] ?? 0) + 1,
    }));
  };

  const activeDayPlan = useMemo(
    () => getSharpingPlanForDay(selectedWeekday, rotations[selectedWeekday] ?? 0),
    [rotations, selectedWeekday],
  );

  const allDayPlans = useMemo(
    () =>
      SHARPING_DAILY_PLANS.map((plan) =>
        getSharpingPlanForDay(plan.weekdayIndex, rotations[plan.weekdayIndex] ?? 0),
      ),
    [rotations],
  );

  const activeDayDoneCount = activeDayPlan.tasks.filter((t) =>
    completedIds.includes(t.id),
  ).length;
  const activeDayTotal = activeDayPlan.tasks.length;
  const activeDayPct = Math.round(
    (activeDayDoneCount / Math.max(1, activeDayTotal)) * 100,
  );

  const weeklyTasksTotal = allDayPlans.reduce((acc, d) => acc + d.tasks.length, 0);
  const weeklyDoneCount = allDayPlans.reduce(
    (acc, d) => acc + d.tasks.filter((t) => completedIds.includes(t.id)).length,
    0,
  );
  const weeklyPct = Math.round(
    (weeklyDoneCount / Math.max(1, weeklyTasksTotal)) * 100,
  );

  const dna = summarizeTrainingDna(loadMatchHistory());
  const rushBest = loadRushBest();

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-14">
      {/* Hero Summary: Daily Sharping */}
      <section className="bg-[#21201D] border border-white/10 rounded-2xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2 max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-extrabold text-[#E59A28]">
            <Zap className="w-4 h-4 fill-[#E59A28]" />
            <span>DAILY SHARPING · EVERY DAY A NEW EDGE</span>
            <span className="px-2 py-0.5 rounded-md bg-[#81B64C]/20 text-[#9CD363] font-mono">
              {activeDayPlan.badge}
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#F2F0EC] font-display tracking-tight">
            Sharping · Daily Chess Conditioning
          </h1>
          <p className="text-xs sm:text-sm text-[#B8B4AC] leading-relaxed">
            Sharpen your game every single day with a rotating daily focus—from Monday Fork &amp; Pin Ignition and Tuesday Opening Mastery to Thursday Endgame Conversion and Sunday Speed Synthesis.
          </p>
        </div>

        <div className="bg-[#1A1917] border border-white/10 rounded-xl p-4 min-w-[220px] shrink-0 space-y-2">
          <div className="flex items-center justify-between text-xs text-[#9E998F]">
            <span>Today’s Sharping</span>
            <span className="font-mono text-[#E59A28] font-bold">
              Week {weeklyPct}%
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-3xl font-extrabold font-mono text-[#81B64C] tabular-nums">
              {activeDayPct}%
            </span>
            <span className="text-xs font-mono text-[#B8B4AC] tabular-nums">
              {activeDayDoneCount} / {activeDayTotal} today
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-[#2E2C28] overflow-hidden">
            <div
              className="h-full bg-[#81B64C] transition-[width] duration-300"
              style={{ width: `${activeDayPct}%` }}
            />
          </div>
        </div>
      </section>

      {/* 7-Day Interactive Day Selector Strip (Mon - Sun) */}
      <section className="bg-[#21201D] border border-white/10 rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-[#F7C045] fill-[#F7C045]" />
            <h2 className="text-sm sm:text-base font-extrabold text-white font-display">
              7-Day Rotating Sharping Schedule
            </h2>
          </div>
          <button
            type="button"
            onClick={() => handleShuffleDay(selectedWeekday)}
            className="min-h-[36px] px-3 py-1.5 rounded-xl bg-[#2B2925] hover:bg-[#383530] border border-white/10 text-xs font-extrabold text-[#AEE076] flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>New Daily Drills</span>
          </button>
        </div>

        {/* 7 Day Buttons */}
        <div
          role="tablist"
          aria-label="Daily Sharping days"
          className="grid grid-cols-7 gap-1.5"
        >
          {SHARPING_DAILY_PLANS.map((day) => {
            const isToday = day.weekdayIndex === todayWeekday;
            const isSelected = day.weekdayIndex === selectedWeekday;
            const planForDay = getSharpingPlanForDay(
              day.weekdayIndex,
              rotations[day.weekdayIndex] ?? 0,
            );
            const dayDone = planForDay.tasks.filter((t) =>
              completedIds.includes(t.id),
            ).length;

            return (
              <button
                key={day.id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => setSelectedWeekday(day.weekdayIndex)}
                className={`py-2 px-1 rounded-xl border text-center transition-colors cursor-pointer flex flex-col items-center gap-0.5 ${
                  isSelected
                    ? 'bg-[#363B2F] border-[#81B64C] text-white'
                    : 'bg-[#1A1917] hover:bg-[#2B2925] border-white/[0.07] text-[#B8B4AC]'
                }`}
              >
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#81B64C]">
                  {isToday ? 'Today' : day.shortDay}
                </span>
                <span className="text-xs font-extrabold text-white truncate max-w-full">
                  {day.shortDay}
                </span>
                <span className="text-[10px] font-mono text-[#9E998F] tabular-nums">
                  {dayDone}/{planForDay.tasks.length}
                </span>
              </button>
            );
          })}
        </div>

        {/* Highlighted Active Day Workout Card */}
        <div
          data-testid="active-sharping-day-card"
          className="rounded-xl bg-[#1A1917] border border-[#81B64C]/35 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#81B64C] text-[#191815] text-[10px] font-extrabold uppercase">
                  {selectedWeekday === todayWeekday ? "Today's Focus" : activeDayPlan.shortDay}
                </span>
                <h3 className="text-base sm:text-lg font-extrabold text-white font-display">
                  {activeDayPlan.dayLabel}
                </h3>
              </div>
              <p className="text-xs text-[#C8C4BC] mt-1">{activeDayPlan.focus}</p>
            </div>
            <span className="px-2.5 py-1 rounded-lg bg-[#262421] border border-white/10 text-[11px] font-semibold text-[#E59A28] flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" />
              <span>{activeDayPlan.badge}</span>
            </span>
          </div>

          <div className="px-3 py-2 rounded-lg bg-[#262421] border-l-3 border-[#81B64C] text-xs text-[#DEDAD2]">
            <strong className="text-[#9CD363]">Coach Habit:</strong> {activeDayPlan.coachTip}
          </div>

          <div className="space-y-2">
            {activeDayPlan.tasks.map((task) => {
              const checked = completedIds.includes(task.id);
              return (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[#262421] border border-white/[0.07]"
                >
                  <button
                    type="button"
                    onClick={() => toggleTask(task.id)}
                    className="flex items-start gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                  >
                    {checked ? (
                      <CheckSquare className="w-4 h-4 text-[#81B64C] shrink-0 mt-0.5" />
                    ) : (
                      <Square className="w-4 h-4 text-[#736E66] shrink-0 mt-0.5" />
                    )}
                    <span
                      className={`text-xs sm:text-sm font-semibold leading-snug ${
                        checked ? 'line-through text-[#7E7970]' : 'text-[#F2F0EC]'
                      }`}
                    >
                      {task.label}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onNavigate(task.targetMode)}
                    className="px-3 py-1.5 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-xs font-extrabold text-white flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <span>Start</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Live Session Stats Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#21201D] border border-white/10 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#9E998F]">Practice Matches Finished</div>
            <div className="text-2xl font-bold font-mono text-[#F2F0EC] tabular-nums mt-1">
              {stats.gamesPlayed}
            </div>
          </div>
          <Trophy className="w-6 h-6 text-[#81B64C]" />
        </div>

        <div className="bg-[#21201D] border border-white/10 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#9E998F]">Tactical Puzzles Solved</div>
            <div className="text-2xl font-bold font-mono text-[#F2F0EC] tabular-nums mt-1">
              {stats.puzzlesSolved}
            </div>
          </div>
          <Target className="w-6 h-6 text-[#E59A28]" />
        </div>

        <div className="bg-[#21201D] border border-white/10 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#9E998F]">Openings &amp; Endgames Drilled</div>
            <div className="text-2xl font-bold font-mono text-[#F2F0EC] tabular-nums mt-1">
              {stats.lessonsCompleted}
            </div>
          </div>
          <Brain className="w-6 h-6 text-[#6FB3E0]" />
        </div>
      </section>

      {/* Training DNA Phase Breakdown */}
      <section className="bg-[#21201D] border border-white/10 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-[#81B64C]">
              <Activity className="w-4 h-4" />
              <span>
                Training DNA · {dna.gamesAnalyzed} Game{dna.gamesAnalyzed === 1 ? '' : 's'} Analyzed
                {rushBest > 0 ? ` · Rush Best ${rushBest}` : ''}
              </span>
            </div>
            <p className="text-xs text-[#DEDAD2] mt-1">{dna.recommendation}</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate(dna.recommendedTab)}
            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#81B64C] hover:bg-[#90C55B] text-[#191815] text-xs font-extrabold flex items-center justify-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap"
          >
            <span>Sharpen {dna.weakestPhase}</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 font-mono text-xs tabular-nums">
          {(
            [
              { label: 'Opening Accuracy', value: dna.openingAvg },
              { label: 'Middlegame Accuracy', value: dna.middlegameAvg },
              { label: 'Endgame Accuracy', value: dna.endgameAvg },
            ] as const
          ).map((phase) => (
            <div key={phase.label} className="p-3 rounded-lg bg-[#1A1917] border border-white/8 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-sans text-[#B8B4AC]">{phase.label}</span>
                <span className="font-bold text-[#F2F0EC]">
                  {phase.value > 0 ? `${phase.value}%` : '—'}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-[#2E2C28] overflow-hidden">
                <div
                  className="h-full bg-[#81B64C] transition-[width] duration-300"
                  style={{ width: `${phase.value}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Full 7-Day Sharping Overview Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {allDayPlans.map((day) => {
          const isToday = day.weekdayIndex === todayWeekday;
          return (
            <div
              key={day.id}
              className={`bg-[#21201D] border rounded-xl p-5 space-y-3.5 ${
                isToday ? 'border-[#81B64C]/50' : 'border-white/10'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold text-[#F2F0EC] font-display">
                      {day.dayLabel}
                    </h2>
                    {isToday && (
                      <span className="px-1.5 py-0.5 rounded bg-[#81B64C]/20 text-[#9CD363] text-[10px] font-extrabold uppercase">
                        Today
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#9E998F] mt-1">{day.focus}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleShuffleDay(day.weekdayIndex)}
                  title="Rotate drills for this day"
                  className="p-1.5 rounded-lg bg-[#1A1917] hover:bg-[#2B2925] text-[#9E998F] hover:text-white cursor-pointer shrink-0"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2">
                {day.tasks.map((task) => {
                  const checked = completedIds.includes(task.id);
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#1A1917] border border-white/8"
                    >
                      <button
                        type="button"
                        onClick={() => toggleTask(task.id)}
                        className="flex items-start gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                      >
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-[#81B64C] shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-[#736E66] shrink-0 mt-0.5" />
                        )}
                        <span
                          className={`text-xs leading-relaxed ${
                            checked
                              ? 'line-through text-[#7E7970]'
                              : 'text-[#DEDAD2]'
                          }`}
                        >
                          {task.label}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => onNavigate(task.targetMode)}
                        className="px-2.5 py-1 rounded bg-[#2F2C28] hover:bg-[#3C3934] text-[11px] font-semibold text-[#F2F0EC] flex items-center gap-1 shrink-0 cursor-pointer"
                      >
                        <span>Sharpen</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}
