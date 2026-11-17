import { useEffect, useRef, useState } from 'react';
import { Send, Sparkles, Compass, ShieldAlert, CalendarCheck2, Cpu } from 'lucide-react';
import type { Color } from 'chess.js';
import { getCoachProfile, type CoachPersonaId } from '../chess/coach';

export interface EngineMeta {
  bestMoveSan: string | null;
  evalText: string | null;
  lineSan: string[];
  source: 'lichess-cloud' | 'stockfish-17' | 'stockfish-19-nnue' | null;
  depth: number;
}

export interface TutorMessage {
  id: string;
  role: 'tutor' | 'user';
  text: string;
  engineMeta?: EngineMeta | null;
  streaming?: boolean;
}

interface TutorPanelProps {
  fen: string;
  pgn: string;
  mode: 'play' | 'puzzles' | 'learn' | 'review';
  lastMove?: string;
  evalCp: number;
  playerColor: Color;
  suggestedMoveSan?: string;
  contextNote?: string;
  queuedPrompt?: { id: number; text: string } | null;
  coachId?: CoachPersonaId;
}

function renderInlineBold(line: string) {
  const parts = line.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return (
        <strong key={i} className="font-bold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return (
        <em key={i} className="italic text-[#F3F0EA]">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function renderCoachText(text: string) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((rawLine, idx) => {
        const trimmed = rawLine.trim();
        if (!trimmed) return null;
        const isBullet = /^\*\s+/.test(trimmed) || /^-\s+/.test(trimmed);
        const content = isBullet ? trimmed.replace(/^(\*|-)\s+/, '') : trimmed;
        return isBullet ? (
          <div key={idx} className="flex items-start gap-1.5 pl-0.5">
            <span className="text-[#81B64C] font-bold leading-relaxed">•</span>
            <span>{renderInlineBold(content)}</span>
          </div>
        ) : (
          <p key={idx}>{renderInlineBold(content)}</p>
        );
      })}
    </div>
  );
}

export function TutorPanel({
  fen,
  pgn,
  mode,
  lastMove = '',
  evalCp,
  playerColor,
  suggestedMoveSan = '',
  contextNote = '',
  queuedPrompt = null,
  coachId = 'viktor',
}: TutorPanelProps) {
  const activeCoach = getCoachProfile(coachId);
  const [messages, setMessages] = useState<TutorMessage[]>([
    {
      id: 'welcome',
      role: 'tutor',
      text: `I'm ${activeCoach.name} (${activeCoach.specialty}). Ask me about any candidate move, plan, or tactic—backed by instant Client-Side Stockfish 19 NNUE lines.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);
  const lastHandledPromptIdRef = useRef<number | null>(null);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 1 && prev[0]?.id === 'welcome') {
        return [
          {
            id: 'welcome',
            role: 'tutor',
            text: `I'm ${activeCoach.name} (${activeCoach.specialty}). Ask me about any candidate move, plan, or tactic—backed by instant Client-Side Stockfish 19 NNUE lines.`,
          },
        ];
      }
      return prev;
    });
  }, [activeCoach.name, activeCoach.specialty]);

  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (
      queuedPrompt &&
      queuedPrompt.text.trim() &&
      queuedPrompt.id !== lastHandledPromptIdRef.current &&
      !loading
    ) {
      lastHandledPromptIdRef.current = queuedPrompt.id;
      void askTutor(queuedPrompt.text);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queuedPrompt, loading]);

  const askTutor = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || loading) return;

    const now = Date.now();
    const userMsg: TutorMessage = {
      id: `u-${now}`,
      role: 'user',
      text: trimmed,
    };
    const tutorId = `t-${now}`;
    const placeholderMsg: TutorMessage = {
      id: tutorId,
      role: 'tutor',
      text: '',
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, placeholderMsg]);
    setInput('');
    setLoading(true);
    setErrorMsg(null);

    const payload = {
      fen,
      pgn,
      mode,
      userMessage: trimmed,
      lastMove,
      evalCp,
      playerColor,
      contextNote,
      coachProfile: {
        id: activeCoach.id,
        name: activeCoach.name,
        title: activeCoach.title,
        specialty: activeCoach.specialty,
        tone: activeCoach.tone,
      },
    };

    try {
      const res = await fetch('/api/tutor/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const contentType = res.headers.get('content-type') ?? '';
      if (!res.ok || !res.body || !contentType.includes('text/event-stream')) {
        // Fallback to non-streaming endpoint
        const fallbackRes = await fetch('/api/tutor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await fallbackRes.json();
        if (!fallbackRes.ok) {
          throw new Error(data.error || 'Unable to reach Coach OpenChess.');
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tutorId
              ? {
                  ...m,
                  text: data.reply,
                  engineMeta: data.engineMeta ?? null,
                  streaming: false,
                }
              : m,
          ),
        );
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedAnyText = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const frames = buffer.split('\n\n');
        buffer = frames.pop() ?? '';

        for (const frame of frames) {
          const lines = frame.split('\n');
          let eventType = 'message';
          let dataLine = '';
          for (const line of lines) {
            if (line.startsWith('event:')) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
              dataLine += line.slice(5).trim();
            }
          }
          if (!dataLine) continue;

          try {
            const parsed = JSON.parse(dataLine);
            if (eventType === 'meta') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tutorId ? { ...m, engineMeta: parsed as EngineMeta } : m,
                ),
              );
            } else if (eventType === 'chunk' && typeof parsed.text === 'string') {
              if (parsed.text.length > 0) receivedAnyText = true;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === tutorId ? { ...m, text: m.text + parsed.text } : m,
                ),
              );
            } else if (eventType === 'error') {
              setErrorMsg(parsed.error || 'Coach stream interrupted.');
            } else if (eventType === 'done') {
              setMessages((prev) =>
                prev.map((m) => (m.id === tutorId ? { ...m, streaming: false } : m)),
              );
            }
          } catch {
            // ignore partial JSON frame
          }
        }
      }

      if (!receivedAnyText) {
        const fallbackRes = await fetch('/api/tutor', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await fallbackRes.json();
        if (!fallbackRes.ok) {
          throw new Error(data.error || 'Unable to reach Coach OpenChess.');
        }
        setMessages((prev) =>
          prev.map((m) =>
            m.id === tutorId
              ? {
                  ...m,
                  text: data.reply,
                  engineMeta: data.engineMeta ?? m.engineMeta ?? null,
                  streaming: false,
                }
              : m,
          ),
        );
      } else {
        setMessages((prev) =>
          prev.map((m) => (m.id === tutorId ? { ...m, streaming: false } : m)),
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Connection error.';
      setErrorMsg(msg);
      setMessages((prev) => prev.filter((m) => !(m.id === tutorId && !m.text)));
    } finally {
      setLoading(false);
    }
  };

  const evalDisplay =
    Math.abs(evalCp) >= 90000
      ? evalCp > 0
        ? 'White Mate'
        : 'Black Mate'
      : `${evalCp >= 0 ? '+' : ''}${(evalCp / 100).toFixed(1)}`;

  return (
    <div className="flex flex-col flex-1 h-full min-h-0">
      {/* Chess.com Coach Header Readout */}
      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 bg-[#21201D] border-b border-white/10 text-xs">
        <div className="flex items-center gap-2 text-[#B8B4AC]">
          <span>Eval</span>
          <span className="font-mono font-bold text-white tabular-nums">
            {evalDisplay}
          </span>
        </div>
        {suggestedMoveSan && (
          <div className="flex items-center gap-1.5 text-[#B8B4AC]">
            <span>Top Move</span>
            <span className="font-mono font-bold text-[#81B64C] tabular-nums">
              {suggestedMoveSan}
            </span>
          </div>
        )}
      </div>

      {/* Quick Coach Prompts */}
      <div className="grid grid-cols-2 gap-1.5 p-2.5 border-b border-white/10 bg-[#262421]">
        <button
          type="button"
          onClick={() =>
            askTutor('Explain the current position and the best strategic plan here.')
          }
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#312E2A] hover:bg-[#3C3934] text-xs font-semibold text-white transition-colors text-left cursor-pointer disabled:opacity-50"
        >
          <Compass className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />
          <span className="truncate">Explain Plan</span>
        </button>
        <button
          type="button"
          onClick={() =>
            askTutor('What are the top 2 candidate moves right now and why?')
          }
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#312E2A] hover:bg-[#3C3934] text-xs font-semibold text-white transition-colors text-left cursor-pointer disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5 text-[#E59A28] shrink-0" />
          <span className="truncate">Best Moves</span>
        </button>
        <button
          type="button"
          onClick={() =>
            askTutor(
              lastMove
                ? `Was ${lastMove} a good move, and are there any tactical threats to watch out for?`
                : 'What tactical threats should I check before moving?',
            )
          }
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#312E2A] hover:bg-[#3C3934] text-xs font-semibold text-white transition-colors text-left cursor-pointer disabled:opacity-50"
        >
          <ShieldAlert className="w-3.5 h-3.5 text-[#FA412D] shrink-0" />
          <span className="truncate">Blunder Check</span>
        </button>
        <button
          type="button"
          onClick={() =>
            askTutor(
              'Give me one practical Daily Sharping habit for this kind of position.',
            )
          }
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg bg-[#312E2A] hover:bg-[#3C3934] text-xs font-semibold text-white transition-colors text-left cursor-pointer disabled:opacity-50"
        >
          <CalendarCheck2 className="w-3.5 h-3.5 text-[#6FB3E0] shrink-0" />
          <span className="truncate">Sharping Tip</span>
        </button>
      </div>

      {/* Chat history */}
      <div ref={feedRef} className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`animate-view-enter rounded-xl px-3 py-2.5 text-sm leading-relaxed ${
              m.role === 'user'
                ? 'bg-[#81B64C]/18 border border-[#81B64C]/35 text-white ml-6'
                : 'bg-[#262421] border border-white/10 text-[#EAE8E3] mr-2'
            }`}
          >
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#9E998F] mb-1">
              <span>{m.role === 'user' ? 'You' : activeCoach.name}</span>
              {m.engineMeta?.bestMoveSan && (
                <span className="font-mono text-[10px] text-[#81B64C] flex items-center gap-1 tabular-nums">
                  <Cpu className="w-3 h-3" />
                  <span>
                    {`SF19 NNUE D${Math.max(19, m.engineMeta.depth || 19)}`} · {m.engineMeta.bestMoveSan} ({m.engineMeta.evalText})
                  </span>
                </span>
              )}
            </div>

            {m.engineMeta?.lineSan && m.engineMeta.lineSan.length > 0 && (
              <div className="mb-1.5 px-2 py-1 rounded bg-[#1E1C19] font-mono text-[11px] text-[#C8C4BC] tabular-nums truncate">
                Line: {m.engineMeta.lineSan.join(' ')}
              </div>
            )}

            {m.text ? (
              m.role === 'tutor' ? renderCoachText(m.text) : <div className="whitespace-pre-wrap">{m.text}</div>
            ) : m.streaming ? (
              <div className="text-xs text-[#9E998F] flex items-center gap-2 py-0.5">
                <span>{activeCoach.name} is writing</span>
                <span className="inline-flex gap-0.5">
                  <span className="w-1 h-1 rounded-full bg-[#81B64C] animate-bounce [animation-delay:-0.2s]" />
                  <span className="w-1 h-1 rounded-full bg-[#81B64C] animate-bounce [animation-delay:-0.1s]" />
                  <span className="w-1 h-1 rounded-full bg-[#81B64C] animate-bounce" />
                </span>
              </div>
            ) : null}
          </div>
        ))}

        {errorMsg && (
          <div
            role="alert"
            className="rounded-lg px-3 py-2 bg-[#5C2320]/60 border border-[#FA412D]/40 text-xs text-[#F7C7C1]"
          >
            {errorMsg}
          </div>
        )}
      </div>

      {/* Input box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          askTutor(input);
        }}
        className="p-2.5 border-t border-white/10 bg-[#21201D] flex items-center gap-2"
      >
        <label htmlFor="tutor-question-input" className="sr-only">
          Ask {activeCoach.name}
        </label>
        <input
          id="tutor-question-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={`Ask ${activeCoach.name} about any move...`}
          className="flex-1 bg-[#302E2B] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-[#847F76] focus:outline-none focus:border-[#81B64C]"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          aria-label="Send message to Coach OpenChess"
          className="px-3.5 py-2 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] border-b-2 border-[#457524] text-white font-bold text-sm transition-colors disabled:opacity-45 cursor-pointer flex items-center justify-center shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
