import type { Color, PieceSymbol } from 'chess.js';

interface ChessPieceProps {
  type: PieceSymbol;
  color: Color;
  className?: string;
}

/**
 * Chess.com Neo-inspired Staunton SVG pieces with two-tone depth shading
 * so both White and Black pieces read crisply on dark-green, walnut, and slate boards.
 */
export function ChessPiece({ type, color, className = 'w-full h-full' }: ChessPieceProps) {
  const isWhite = color === 'w';
  const fill = isWhite ? '#FFFFFF' : '#585552';
  const shade = isWhite ? '#DCD8CE' : '#3A3836';
  const highlight = isWhite ? '#FFFFFF' : '#8A8680';
  const stroke = isWhite ? '#3D3B38' : '#1F1E1C';
  const detailStroke = isWhite ? '#3D3B38' : '#CBC7BF';
  const shadowStyle = {
    filter: isWhite
      ? 'drop-shadow(0 2px 1.5px rgba(0, 0, 0, 0.28))'
      : 'drop-shadow(0 2px 1.5px rgba(0, 0, 0, 0.36))',
  };

  switch (type) {
    case 'p':
      return (
        <svg viewBox="0 0 45 45" className={className} style={shadowStyle} aria-hidden="true">
          <path
            d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.65"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Right-side sculptural shading */}
          <path
            d="M23 9.2c1.8.2 3.2 1.8 3.2 3.8 0 .8-.25 1.55-.7 2.2 1.85 1.08 3.1 3.1 3.1 5.6 0 1.9-.85 3.6-2.25 4.8 2.7 1.05 6.8 5.25 6.8 13.1h-4.7c-.2-6.8-2.8-10.7-5.75-12.3 1.15-1.05 1.8-2.7 1.8-4.7 0-2.35-1.1-4.35-2.6-5.3.4-.6.6-1.35.6-2.15 0-1.95-.95-3.65-2.3-4.45.8-.45 1.75-.65 2.8-.6z"
            fill={shade}
            opacity="0.85"
          />
          {/* Collar ring & highlight */}
          <path
            d="M17.2 26.2h10.6"
            stroke={detailStroke}
            strokeWidth="1.1"
            strokeLinecap="round"
            opacity="0.65"
          />
          {!isWhite && (
            <path
              d="M19.6 11.4a2.8 2.8 0 0 1 2.2-1.4"
              fill="none"
              stroke={highlight}
              strokeWidth="1.15"
              strokeLinecap="round"
              opacity="0.7"
            />
          )}
        </svg>
      );

    case 'r':
      return (
        <svg viewBox="0 0 45 45" className={className} style={shadowStyle} aria-hidden="true">
          <g fill={fill} stroke={stroke} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
            <path d="M34 14l-3 3H14l-3-3" />
            <path d="M31 17v12.5H14V17" />
            <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
          </g>
          {/* Right-side shadow */}
          <path
            d="M26 17.5h4.3v11.5H26zM28 32.5h4.2v3H28zM29.5 36.4h5.7v2H29.5z"
            fill={shade}
            opacity="0.85"
          />
          <g fill="none" stroke={detailStroke} strokeWidth="1.1" opacity="0.6">
            <path d="M12 14h21" />
            <path d="M14.5 17.2h16" />
            <path d="M14.5 29.5h16" />
            <path d="M12.5 32.2h20" />
          </g>
          {!isWhite && (
            <path
              d="M12.2 10.2v3.2"
              stroke={highlight}
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.55"
            />
          )}
        </svg>
      );

    case 'n':
      return (
        <svg viewBox="0 0 45 45" className={className} style={shadowStyle} aria-hidden="true">
          <g fill={fill} stroke={stroke} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" />
            <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" />
          </g>
          {/* Mane / neck shading */}
          <path
            d="M 24.6,11.2 C 30.8,12.8 35.6,18.2 36.2,38.2 L 32.4,38.2 C 32.5,22 29,14.8 24.1,12.4 Z"
            fill={shade}
            opacity="0.9"
          />
          <circle cx="15" cy="15.5" r="1.15" fill={detailStroke} />
          <path
            d="M 9.5 25.5 A 0.65 0.65 0 1 1 8.2,25.5 A 0.65 0.65 0 1 1 9.5 25.5 z"
            fill={detailStroke}
          />
          {!isWhite && (
            <path
              d="M 13.5,15.5 C 11,19.5 8.5,23.5 8,25.5"
              fill="none"
              stroke={highlight}
              strokeWidth="1.15"
              strokeLinecap="round"
              opacity="0.65"
            />
          )}
        </svg>
      );

    case 'b':
      return (
        <svg viewBox="0 0 45 45" className={className} style={shadowStyle} aria-hidden="true">
          <g fill={fill} stroke={stroke} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" />
            <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <circle cx="22.5" cy="8" r="2.5" />
          </g>
          {/* Right-side miter shading */}
          <path
            d="M23.5 11.8c7.5 3.6 7.4 11.4 3.2 13.7-.3.2.5.8 1.4 2.1.4.8.6 1.7.3 2.8-1.4 1-3.7 1.3-5.8 1.2 2.4-1.1 3.4-2.8 2.4-5.4 3.4-3.3 2.5-10.4-1.5-14.4z"
            fill={shade}
            opacity="0.85"
          />
          <path
            d="M17.5 26h10M15 30h15m-7.5-14.5v5M20 18h5"
            fill="none"
            stroke={detailStroke}
            strokeWidth="1.4"
            strokeLinecap="round"
            opacity="0.85"
          />
          {!isWhite && (
            <path
              d="M15.6 19.2c.6-3 2.5-5.6 5.2-7"
              fill="none"
              stroke={highlight}
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.6"
            />
          )}
        </svg>
      );

    case 'q':
      return (
        <svg viewBox="0 0 45 45" className={className} style={shadowStyle} aria-hidden="true">
          <g fill={fill} stroke={stroke} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="12" r="2.6" />
            <circle cx="14" cy="9" r="2.6" />
            <circle cx="22.5" cy="8" r="2.6" />
            <circle cx="31" cy="9" r="2.6" />
            <circle cx="39" cy="12" r="2.6" />
            <path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" />
            <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
          </g>
          {/* Right crown shading */}
          <path
            d="M27 25.5l3.6-12.5.3 11.4 6.6-9.5L35 25.5c-.4 1.6-1.5 2.1-2.3 3.8-.9 1.6-.8 2.2-.3 4 1 .8.9 1.8.6 2.5 1 1.1.2 1.8-.8 2-2.2.4-4.5.6-6.9.6 1.5-1.8 2-4.6 1.2-8.2-.4-1.8.2-3.2.5-4.7z"
            fill={shade}
            opacity="0.85"
          />
          <path
            d="M11.5 30c3.5-1 18.5-1 22 0M12 33.5c6-1 15-1 21 0"
            fill="none"
            stroke={detailStroke}
            strokeWidth="1.2"
            strokeLinecap="round"
            opacity="0.7"
          />
        </svg>
      );

    case 'k':
      return (
        <svg viewBox="0 0 45 45" className={className} style={shadowStyle} aria-hidden="true">
          <g fill={fill} stroke={stroke} strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22.5 11.63V6M20 8h5" fill="none" stroke={stroke} strokeWidth="2.1" />
            <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
            <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" />
          </g>
          {/* Right-wing shading */}
          <path
            d="M23.2 24.5c2.7-6.2 10.7-8.7 14.3-3.6 2.3 4.6-4.5 8.2-5.4 8.6v6.7c-2.6 1.5-5.6 2.2-8.8 2.2v-7.5c0-2.6 0-4.8-.1-6.4z"
            fill={shade}
            opacity="0.85"
          />
          <path
            d="M11.5 30c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0m-21 3.5c5.5-3 15.5-3 21 0"
            fill="none"
            stroke={detailStroke}
            strokeWidth="1.25"
            strokeLinecap="round"
            opacity="0.8"
          />
          {!isWhite && (
            <path
              d="M8.5 22.5c1.2-3 4.2-4.6 7.2-4"
              fill="none"
              stroke={highlight}
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.6"
            />
          )}
        </svg>
      );
  }
}
