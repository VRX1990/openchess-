interface MoveSanTextProps {
  san: string;
  className?: string;
}

function FigurineGlyph({ piece }: { piece: 'K' | 'Q' | 'R' | 'B' | 'N' }) {
  switch (piece) {
    case 'N':
      return (
        <svg viewBox="0 0 24 24" className="inline-block w-[0.95em] h-[0.95em] -mt-[0.14em] mr-[0.06em] shrink-0" aria-hidden="true">
          <path
            d="M17.5 19.5H6.5v-1.8c0-1.6 1.5-2.6 3.2-3.4.5-.2.7-.8.3-1.2-.8-.8-2.2-.8-3-.1-.5.4-1.3.3-1.6-.3-.3-.6-.1-1.3.4-1.8 1.5-1.5 3.1-3.1 4.1-4.8l.4-1.4c.1-.5.7-.7 1.1-.4l1.1.8c1.1-.3 2.5-.1 3.7.7 1.9 1.3 2.8 3.8 2.4 7.3-.2 1.8-.6 3.7-1.1 5.4v1z"
            fill="currentColor"
          />
          <circle cx="11.2" cy="8.2" r="1" fill="#262421" />
        </svg>
      );
    case 'B':
      return (
        <svg viewBox="0 0 24 24" className="inline-block w-[0.95em] h-[0.95em] -mt-[0.14em] mr-[0.06em] shrink-0" aria-hidden="true">
          <circle cx="12" cy="4.3" r="1.7" fill="currentColor" />
          <path
            d="M12 6.4c-3.1 1.6-4.7 4.4-4.2 7.4.3 1.6 1.1 2.5 2 3.1H7.2v2.6h9.6v-2.6h-2.6c.9-.6 1.7-1.5 2-3.1.5-3-1.1-5.8-4.2-7.4zm2.2 3.4l-3.6 3.6-1-1 3.6-3.6 1 1z"
            fill="currentColor"
          />
        </svg>
      );
    case 'R':
      return (
        <svg viewBox="0 0 24 24" className="inline-block w-[0.95em] h-[0.95em] -mt-[0.14em] mr-[0.06em] shrink-0" aria-hidden="true">
          <path
            d="M6.5 4.5h2.4v2h1.9v-2h2.4v2h1.9v-2h2.4v4.5l-1.5 1.4v6.3l1.5 1.3v2H6.5v-2L8 16.7v-6.3L6.5 9V4.5z"
            fill="currentColor"
          />
        </svg>
      );
    case 'Q':
      return (
        <svg viewBox="0 0 24 24" className="inline-block w-[0.95em] h-[0.95em] -mt-[0.14em] mr-[0.06em] shrink-0" aria-hidden="true">
          <circle cx="4.5" cy="7.5" r="1.4" fill="currentColor" />
          <circle cx="8.5" cy="5.5" r="1.4" fill="currentColor" />
          <circle cx="12" cy="4.6" r="1.5" fill="currentColor" />
          <circle cx="15.5" cy="5.5" r="1.4" fill="currentColor" />
          <circle cx="19.5" cy="7.5" r="1.4" fill="currentColor" />
          <path
            d="M5 9.2l3.4 4.1.6-6.2 3 5.5 3-5.5.6 6.2L19 9.2l-1.5 8.2v2.1H6.5v-2.1L5 9.2z"
            fill="currentColor"
          />
        </svg>
      );
    case 'K':
      return (
        <svg viewBox="0 0 24 24" className="inline-block w-[0.95em] h-[0.95em] -mt-[0.14em] mr-[0.06em] shrink-0" aria-hidden="true">
          <path
            d="M11 3h2v2.2h2v1.9h-2V9c2.8-.6 5.5 1.1 5.5 4.1 0 2.1-1.2 3.8-2.8 4.7v1.7H8.3v-1.7C6.7 16.9 5.5 15.2 5.5 13.1c0-3 2.7-4.7 5.5-4.1V7.1H9V5.2h2V3z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

export function MoveSanText({ san, className }: MoveSanTextProps) {
  if (!san) return null;

  // Handle leading piece letter (e.g., Nf3, Bb5+, Qxd7, Rae1)
  const lead = san[0];
  const isLeadPiece =
    lead === 'K' || lead === 'Q' || lead === 'R' || lead === 'B' || lead === 'N';
  const body = isLeadPiece ? san.slice(1) : san;

  // Handle promotion piece (e.g., e8=Q+)
  const promoIdx = body.indexOf('=');
  if (promoIdx >= 0 && promoIdx + 1 < body.length) {
    const promoChar = body[promoIdx + 1];
    const isPromoPiece =
      promoChar === 'Q' || promoChar === 'R' || promoChar === 'B' || promoChar === 'N';
    if (isPromoPiece) {
      const beforePromo = body.slice(0, promoIdx + 1);
      const afterPromo = body.slice(promoIdx + 2);
      return (
        <span className={`inline-flex items-center ${className ?? ''}`}>
          {isLeadPiece && <FigurineGlyph piece={lead} />}
          <span>{beforePromo}</span>
          <FigurineGlyph piece={promoChar} />
          {afterPromo && <span>{afterPromo}</span>}
        </span>
      );
    }
  }

  return (
    <span className={`inline-flex items-center ${className ?? ''}`}>
      {isLeadPiece && <FigurineGlyph piece={lead} />}
      <span>{body}</span>
    </span>
  );
}
