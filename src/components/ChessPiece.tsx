import { memo } from 'react';
import type { Color, PieceSymbol } from 'chess.js';
import { useChessTheme, type PieceTheme } from '../chess/theme';

interface ChessPieceProps {
  type: PieceSymbol;
  color: Color;
  className?: string;
  pieceTheme?: PieceTheme;
}

interface PiecePalette {
  whiteFill: string;
  whiteShade: string;
  whiteHighlight: string;
  whiteStroke: string;
  whiteDetailStroke: string;
  blackFill: string;
  blackShade: string;
  blackHighlight: string;
  blackStroke: string;
  blackDetailStroke: string;
  strokeWidth: number;
  opacity?: number;
}

const PIECE_PALETTES: Record<PieceTheme, PiecePalette> = {
  neo: {
    whiteFill: '#FFFFFF',
    whiteShade: '#D9D8D4',
    whiteHighlight: '#FFFFFF',
    whiteStroke: '#383633',
    whiteDetailStroke: '#383633',
    blackFill: '#565352',
    blackShade: '#3E3C3B',
    blackHighlight: '#797674',
    blackStroke: '#22201F',
    blackDetailStroke: '#22201F',
    strokeWidth: 1.55,
  },
  classic: {
    whiteFill: '#FBF5E6',
    whiteShade: '#DFD2B8',
    whiteHighlight: '#FFFFFF',
    whiteStroke: '#3A2E23',
    whiteDetailStroke: '#4D3D2E',
    blackFill: '#45352C',
    blackShade: '#281E18',
    blackHighlight: '#7A6355',
    blackStroke: '#17110D',
    blackDetailStroke: '#EADBC5',
    strokeWidth: 1.65,
  },
  wood: {
    whiteFill: '#ECC992',
    whiteShade: '#C69A5F',
    whiteHighlight: '#F8DFB4',
    whiteStroke: '#4E311B',
    whiteDetailStroke: '#59371E',
    blackFill: '#78482B',
    blackShade: '#4B2B17',
    blackHighlight: '#A36B46',
    blackStroke: '#28150A',
    blackDetailStroke: '#E2BD8B',
    strokeWidth: 1.65,
  },
  glass: {
    whiteFill: '#EBF5FC',
    whiteShade: '#B6CEE0',
    whiteHighlight: '#FFFFFF',
    whiteStroke: '#385770',
    whiteDetailStroke: '#446A87',
    blackFill: '#3B5166',
    blackShade: '#223344',
    blackHighlight: '#8FB5D6',
    blackStroke: '#16212C',
    blackDetailStroke: '#D5E7F5',
    strokeWidth: 1.55,
    opacity: 0.93,
  },
  alpha: {
    whiteFill: '#FFFFFF',
    whiteShade: '#ECEAE5',
    whiteHighlight: '#FFFFFF',
    whiteStroke: '#1D1C1A',
    whiteDetailStroke: '#1D1C1A',
    blackFill: '#242321',
    blackShade: '#181715',
    blackHighlight: '#52504C',
    blackStroke: '#0E0D0C',
    blackDetailStroke: '#F2EFE9',
    strokeWidth: 1.95,
  },
  club: {
    whiteFill: '#FFF9EB',
    whiteShade: '#E4D6B5',
    whiteHighlight: '#FFFFFF',
    whiteStroke: '#3F3321',
    whiteDetailStroke: '#5C4A2F',
    blackFill: '#332E28',
    blackShade: '#1D1A16',
    blackHighlight: '#7C6D56',
    blackStroke: '#12100D',
    blackDetailStroke: '#DFBD74',
    strokeWidth: 1.7,
  },
  merida: {
    whiteFill: '#FAF7EE',
    whiteShade: '#DDD6C3',
    whiteHighlight: '#FFFFFF',
    whiteStroke: '#1E1D1B',
    whiteDetailStroke: '#1E1D1B',
    blackFill: '#3B3935',
    blackShade: '#211F1D',
    blackHighlight: '#6C6861',
    blackStroke: '#141311',
    blackDetailStroke: '#EAE6DC',
    strokeWidth: 1.85,
  },
  icy: {
    whiteFill: '#F2FAFF',
    whiteShade: '#C7E2F4',
    whiteHighlight: '#FFFFFF',
    whiteStroke: '#294D6B',
    whiteDetailStroke: '#3B6B91',
    blackFill: '#2C5E85',
    blackShade: '#1B3E5B',
    blackHighlight: '#7AB4DF',
    blackStroke: '#10273B',
    blackDetailStroke: '#DDF1FF',
    strokeWidth: 1.65,
  },
  royal: {
    whiteFill: '#FFF5DA',
    whiteShade: '#E2C98E',
    whiteHighlight: '#FFFDF4',
    whiteStroke: '#463315',
    whiteDetailStroke: '#7A5B21',
    blackFill: '#362D3B',
    blackShade: '#1F1824',
    blackHighlight: '#776682',
    blackStroke: '#130D17',
    blackDetailStroke: '#F2CE74',
    strokeWidth: 1.7,
  },
};

/**
 * Clean modern Neo vector silhouette set matching the signature smooth,
 * high-contrast tournament look with right-side cel-shading and zero wireframe clutter.
 */
function renderNeoPiece(
  type: PieceSymbol,
  isWhite: boolean,
  className: string,
  pal: PiecePalette,
) {
  const fill = isWhite ? pal.whiteFill : pal.blackFill;
  const shade = isWhite ? pal.whiteShade : pal.blackShade;
  const stroke = isWhite ? pal.whiteStroke : pal.blackStroke;
  const accent = isWhite ? '#494744' : '#262422';
  const rimHighlight = isWhite ? 'rgba(255,255,255,0)' : 'rgba(255,255,255,0.14)';
  const sw = pal.strokeWidth;
  const neoStyle = undefined;

  switch (type) {
    case 'p':
      return (
        <svg viewBox="0 0 45 45" className={className} style={neoStyle} aria-hidden="true">
          {/* Main Neo Pawn Silhouette */}
          <path
            d="M22.5 9.2c-2.85 0-5.15 2.3-5.15 5.15 0 1.62.75 3.06 1.92 4.01-1.95.72-3.32 2.48-3.32 4.54 0 1.38.62 2.63 1.62 3.48-3.2 1.68-5.95 5.45-6.62 11.55-.1.9.6 1.67 1.5 1.67h20.1c.9 0 1.6-.77 1.5-1.67-.67-6.1-3.42-9.87-6.62-11.55 1-.85 1.62-2.1 1.62-3.48 0-2.06-1.37-3.82-3.32-4.54 1.17-.95 1.92-2.39 1.92-4.01 0-2.85-2.3-5.15-5.15-5.15z"
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
          {/* Subtle right-side cel-shade */}
          <path
            d="M22.9 10.1c2.25.2 4.05 2.05 4.05 4.25 0 1.42-.65 2.68-1.68 3.55 1.72.72 2.9 2.28 2.9 4.1 0 1.24-.54 2.34-1.42 3.12 2.95 1.65 5.42 5.2 6.08 10.75.08.62-.35 1.05-.95 1.05h-5.3c-.45-5.2-2.4-8.85-4.9-10.55.9-.78 1.45-1.85 1.45-3.12 0-1.68-.9-3.15-2.22-3.85.92-.82 1.52-2.02 1.52-3.38 0-2.08-1.08-3.92-2.75-4.95.95-.6 2.02-.97 3.22-.87z"
            fill={shade}
          />
          {/* Re-stroke clean outer border */}
          <path
            d="M22.5 9.2c-2.85 0-5.15 2.3-5.15 5.15 0 1.62.75 3.06 1.92 4.01-1.95.72-3.32 2.48-3.32 4.54 0 1.38.62 2.63 1.62 3.48-3.2 1.68-5.95 5.45-6.62 11.55-.1.9.6 1.67 1.5 1.67h20.1c.9 0 1.6-.77 1.5-1.67-.67-6.1-3.42-9.87-6.62-11.55 1-.85 1.62-2.1 1.62-3.48 0-2.06-1.37-3.82-3.32-4.54 1.17-.95 1.92-2.39 1.92-4.01 0-2.85-2.3-5.15-5.15-5.15z"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
          {!isWhite && (
            <path
              d="M19.2 13.6a3.4 3.4 0 0 1 2.7-2.6"
              fill="none"
              stroke={rimHighlight}
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          )}
        </svg>
      );

    case 'r':
      return (
        <svg viewBox="0 0 45 45" className={className} style={neoStyle} aria-hidden="true">
          {/* Neo Rook bold 3-crenellation tower + stepped pedestal */}
          <path
            d="M10.5 39.8h24c.75 0 1.35-.6 1.35-1.35v-2.1c0-.75-.6-1.35-1.35-1.35h-1.4l-2.1-2.8V18.2l3.1-2.75c.35-.3.55-.75.55-1.22V8.8c0-.66-.54-1.2-1.2-1.2h-4.1c-.66 0-1.2.54-1.2 1.2v2.45h-3.4V8.8c0-.66-.54-1.2-1.2-1.2h-4.1c-.66 0-1.2.54-1.2 1.2v2.45h-3.4V8.8c0-.66-.54-1.2-1.2-1.2h-4.1c-.66 0-1.2.54-1.2 1.2v5.43c0 .47.2.92.55 1.22l3.1 2.75v14L11.9 35h-1.4c-.75 0-1.35.6-1.35 1.35v2.1c0 .75.6 1.35 1.35 1.35z"
            fill={fill}
          />
          {/* Right-side cel-shade */}
          <path
            d="M25.8 18.2h5.2v14l2.1 2.8h1.4c.55 0 1 .45 1 1v2.1c0 .55-.45 1-1 1h-7.2v-3.1h-1.5V18.2zM29.4 7.9h4.05c.55 0 1 .45 1 1v5.3l-3.1 2.7h-4.4l2.45-2.7V7.9z"
            fill={shade}
          />
          {/* Crisp structural horizontal lines (minimal Neo style) */}
          <path
            d="M14.2 18.2h16.6M14.2 32.1h16.6M12.2 35.1h20.6"
            fill="none"
            stroke={stroke}
            strokeWidth="1.25"
            strokeLinecap="round"
            opacity={isWhite ? 0.65 : 0.72}
          />
          {/* Re-stroke outer outline */}
          <path
            d="M10.5 39.8h24c.75 0 1.35-.6 1.35-1.35v-2.1c0-.75-.6-1.35-1.35-1.35h-1.4l-2.1-2.8V18.2l3.1-2.75c.35-.3.55-.75.55-1.22V8.8c0-.66-.54-1.2-1.2-1.2h-4.1c-.66 0-1.2.54-1.2 1.2v2.45h-3.4V8.8c0-.66-.54-1.2-1.2-1.2h-4.1c-.66 0-1.2.54-1.2 1.2v2.45h-3.4V8.8c0-.66-.54-1.2-1.2-1.2h-4.1c-.66 0-1.2.54-1.2 1.2v5.43c0 .47.2.92.55 1.22l3.1 2.75v14L11.9 35h-1.4c-.75 0-1.35.6-1.35 1.35v2.1c0 .75.6 1.35 1.35 1.35z"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'n':
      return (
        <svg viewBox="0 0 45 45" className={className} style={neoStyle} aria-hidden="true">
          {/* Sleek Neo Knight silhouette (single cohesive modern profile) */}
          <path
            d="M12.2 39.8h23.6c.75 0 1.35-.62 1.32-1.38-.4-9.8-1.2-19.1-6.55-24.85-2.65-2.85-6.15-4.35-9.85-4.55l-2.65-2.7c-.45-.45-1.22-.18-1.3.46l-.35 2.95c-1.85.85-3.4 2.2-4.62 3.92l-4.25 6.85c-.62 1-.65 2.25-.02 3.22.72 1.12 2.1 1.58 3.35 1.15l1.65-.56c.55-.18 1.15-.02 1.54.42l.3.35c.35.4.95.46 1.38.14l4.15-3.15c.6-.45 1.46-.18 1.66.55.55 2.02.2 4.35-1.48 6.45-2.2 2.75-5.85 3.65-7.9 6.2-.75.95-1.08 2.15-1.15 3.4-.04.72.52 1.33 1.15 1.33z"
            fill={fill}
          />
          {/* Smooth arched right-side mane shading */}
          <path
            d="M21.4 9.7c3.65.45 6.8 2.05 9.15 4.7 4.75 5.35 5.48 13.75 5.88 23.85.02.42-.3.75-.72.75h-5.4c-.35-9.8-1.45-18.9-5.8-24.2-1.45-1.78-3.05-3.1-4.8-4.05.52-.42 1.1-.78 1.69-1.05z"
            fill={shade}
          />
          {/* Subtle inner throat/jaw crease & crisp base separator */}
          <path
            d="M12.6 35.6h23.2"
            fill="none"
            stroke={stroke}
            strokeWidth="1.25"
            strokeLinecap="round"
            opacity={isWhite ? 0.55 : 0.7}
          />
          {/* Clean Neo eye & nostril */}
          <circle cx="15.3" cy="15.6" r="1.2" fill={isWhite ? accent : '#EAE8E4'} />
          <circle cx="9.6" cy="21.9" r="0.85" fill={isWhite ? accent : '#EAE8E4'} />
          {/* Re-stroke clean silhouette */}
          <path
            d="M12.2 39.8h23.6c.75 0 1.35-.62 1.32-1.38-.4-9.8-1.2-19.1-6.55-24.85-2.65-2.85-6.15-4.35-9.85-4.55l-2.65-2.7c-.45-.45-1.22-.18-1.3.46l-.35 2.95c-1.85.85-3.4 2.2-4.62 3.92l-4.25 6.85c-.62 1-.65 2.25-.02 3.22.72 1.12 2.1 1.58 3.35 1.15l1.65-.56c.55-.18 1.15-.02 1.54.42l.3.35c.35.4.95.46 1.38.14l4.15-3.15c.6-.45 1.46-.18 1.66.55.55 2.02.2 4.35-1.48 6.45-2.2 2.75-5.85 3.65-7.9 6.2-.75.95-1.08 2.15-1.15 3.4-.04.72.52 1.33 1.15 1.33z"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'b':
      return (
        <svg viewBox="0 0 45 45" className={className} style={neoStyle} aria-hidden="true">
          {/* Neo Bishop: clean top orb, teardrop mitre with signature diagonal slash, sleek pedestal */}
          <circle cx="22.5" cy="7.6" r="2.7" fill={fill} stroke={stroke} strokeWidth={sw} />
          <path
            d="M22.5 10.6c-6.55 3.7-9.65 9.9-7.95 16.05.42 1.52 1.22 2.75 2.25 3.65l-.7 1.35c-2.85 1.15-5.5 3.25-6.35 6.5-.2.8.4 1.65 1.25 1.65h23c.85 0 1.45-.85 1.25-1.65-.85-3.25-3.5-5.35-6.35-6.5l-.7-1.35c1.03-.9 1.83-2.13 2.25-3.65 1.7-6.15-1.4-12.35-7.95-16.05z"
            fill={fill}
          />
          {/* Right-side cel-shade */}
          <path
            d="M23.2 11.4c5.4 3.55 8 9.2 6.5 14.8-.38 1.4-1.08 2.52-2.02 3.35l.65 1.28c2.65 1.12 5.05 3.1 5.82 6.08.15.6-.25 1.22-.85 1.22h-6.1c-.4-2.85-1.65-5.15-3.75-6.65l-.65-1.2c2.25-2.05 3.55-5.2 3.45-8.9-.08-3.6-1.2-7.15-3.05-9.98z"
            fill={shade}
          />
          {/* Iconic Chess.com Neo diagonal mitre notch/slash */}
          <path
            d="M25.6 14.5l-5.8 6.4"
            fill="none"
            stroke={isWhite ? accent : '#EAE8E4'}
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          {/* Clean collar band */}
          <path
            d="M16.5 30.8h12M12.2 35.8h20.6"
            fill="none"
            stroke={stroke}
            strokeWidth="1.25"
            strokeLinecap="round"
            opacity={isWhite ? 0.65 : 0.72}
          />
          {/* Re-stroke outer outline */}
          <path
            d="M22.5 10.6c-6.55 3.7-9.65 9.9-7.95 16.05.42 1.52 1.22 2.75 2.25 3.65l-.7 1.35c-2.85 1.15-5.5 3.25-6.35 6.5-.2.8.4 1.65 1.25 1.65h23c.85 0 1.45-.85 1.25-1.65-.85-3.25-3.5-5.35-6.35-6.5l-.7-1.35c1.03-.9 1.83-2.13 2.25-3.65 1.7-6.15-1.4-12.35-7.95-16.05z"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'q':
      return (
        <svg viewBox="0 0 45 45" className={className} style={neoStyle} aria-hidden="true">
          {/* 5 Neo Crown Pearls */}
          <g fill={fill} stroke={stroke} strokeWidth={sw}>
            <circle cx="6.2" cy="14.5" r="2.35" />
            <circle cx="14.1" cy="10.4" r="2.35" />
            <circle cx="22.5" cy="8.8" r="2.45" />
            <circle cx="30.9" cy="10.4" r="2.35" />
            <circle cx="38.8" cy="14.5" r="2.35" />
          </g>
          {/* Neo Queen Crown + Flared Pedestal */}
          <path
            d="M11 39.8h23c.82 0 1.48-.66 1.48-1.48v-2.15c0-.66-.42-1.22-1.05-1.42l-1.58-.52 5.45-17.1-6.9 9.2-1.2-13.2-5.1 12.1-2.6-13.6-2.6 13.6-5.1-12.1-1.2 13.2-6.9-9.2 5.45 17.1-1.58.52c-.63.2-1.05.76-1.05 1.42v2.15c0 .82.66 1.48 1.48 1.48z"
            fill={fill}
          />
          {/* Right-side cel-shade */}
          <path
            d="M27.6 34.4l5.3-16.4-6.35 8.5-1.15-12.2-1.9 9.7v15.1h10.2c.6 0 1.08-.48 1.08-1.08v-2.1c0-.5-.32-.95-.82-1.12l-1.28-.4H27.6z"
            fill={shade}
          />
          {/* Crisp minimal waist & base line */}
          <path
            d="M12.2 34.2h20.6M11.4 36.8h22.2"
            fill="none"
            stroke={stroke}
            strokeWidth="1.25"
            strokeLinecap="round"
            opacity={isWhite ? 0.6 : 0.72}
          />
          {/* Re-stroke outer outline */}
          <path
            d="M11 39.8h23c.82 0 1.48-.66 1.48-1.48v-2.15c0-.66-.42-1.22-1.05-1.42l-1.58-.52 5.45-17.1-6.9 9.2-1.2-13.2-5.1 12.1-2.6-13.6-2.6 13.6-5.1-12.1-1.2 13.2-6.9-9.2 5.45 17.1-1.58.52c-.63.2-1.05.76-1.05 1.42v2.15c0 .82.66 1.48 1.48 1.48z"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </svg>
      );

    case 'k':
      return (
        <svg viewBox="0 0 45 45" className={className} style={neoStyle} aria-hidden="true">
          {/* Bold Neo Cross Finial */}
          <path
            d="M22.5 5.4v7.6M18.9 8.6h7.2"
            fill="none"
            stroke={stroke}
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          {/* Neo King Royal Crown Lobes + Solid Pedestal */}
          <path
            d="M11.2 39.8h22.6c.82 0 1.48-.66 1.48-1.48v-2.15c0-.66-.42-1.22-1.05-1.42l-1.35-.45c1.6-2.2 4.35-5.6 5.2-9.55 1.15-5.3-2.55-9.6-7.65-9.6-3.2 0-5.85 1.75-7.93 4.3-2.08-2.55-4.73-4.3-7.93-4.3-5.1 0-8.8 4.3-7.65 9.6.85 3.95 3.6 7.35 5.2 9.55l-1.35.45c-.63.2-1.05.76-1.05 1.42v2.15c0 .82.66 1.48 1.48 1.48z"
            fill={fill}
          />
          {/* Center Royal Crown Peak */}
          <path
            d="M22.5 12.2c-2.25 0-3.65 2.05-3.15 4.85.45 2.55 1.65 5.35 3.15 7.45 1.5-2.1 2.7-4.9 3.15-7.45.5-2.8-.9-4.85-3.15-4.85z"
            fill={fill}
          />
          {/* Right-side cel-shade */}
          <path
            d="M30.4 15.8c4.45 0 7.55 3.85 6.55 8.6-.78 3.65-3.3 6.85-4.88 8.95l1.28.45c.5.18.85.65.85 1.2v2.1c0 .55-.45 1-1 1h-7.8v-4.2c1.25-2.15 2.5-5.4 2.5-9.55 0-3.5-1.15-6.4-2.85-8.1 1.55-.32 3.38-.45 5.35-.45z"
            fill={shade}
          />
          {/* Crisp center rib + horizontal base bands */}
          <path
            d="M22.5 23.2v9.4M12.2 34.1h20.6M11.4 36.8h22.2"
            fill="none"
            stroke={stroke}
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity={isWhite ? 0.65 : 0.72}
          />
          {/* Re-stroke outer crown & center peak */}
          <path
            d="M11.2 39.8h22.6c.82 0 1.48-.66 1.48-1.48v-2.15c0-.66-.42-1.22-1.05-1.42l-1.35-.45c1.6-2.2 4.35-5.6 5.2-9.55 1.15-5.3-2.55-9.6-7.65-9.6-3.2 0-5.85 1.75-7.93 4.3-2.08-2.55-4.73-4.3-7.93-4.3-5.1 0-8.8 4.3-7.65 9.6.85 3.95 3.6 7.35 5.2 9.55l-1.35.45c-.63.2-1.05.76-1.05 1.42v2.15c0 .82.66 1.48 1.48 1.48z"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
          <path
            d="M22.5 12.2c-2.25 0-3.65 2.05-3.15 4.85.45 2.55 1.65 5.35 3.15 7.45 1.5-2.1 2.7-4.9 3.15-7.45.5-2.8-.9-4.85-3.15-4.85z"
            fill="none"
            stroke={stroke}
            strokeWidth={sw}
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

/**
 * Staunton SVG pieces supporting 9 distinct styles
 * (Neo, Classic, Merida, Wood, Club, Alpha, Glass, Icy, Royal).
 */
function ChessPieceInner({
  type,
  color,
  className = 'w-full h-full',
  pieceTheme,
}: ChessPieceProps) {
  const { prefs } = useChessTheme();
  const activeStyle = pieceTheme ?? prefs.pieceTheme;
  const pal = PIECE_PALETTES[activeStyle] ?? PIECE_PALETTES.neo;
  const isWhite = color === 'w';

  if (activeStyle === 'neo') {
    return renderNeoPiece(type, isWhite, className, pal);
  }

  const fill = isWhite ? pal.whiteFill : pal.blackFill;
  const shade = isWhite ? pal.whiteShade : pal.blackShade;
  const highlight = isWhite ? pal.whiteHighlight : pal.blackHighlight;
  const stroke = isWhite ? pal.whiteStroke : pal.blackStroke;
  const detailStroke = isWhite ? pal.whiteDetailStroke : pal.blackDetailStroke;
  const sw = pal.strokeWidth;
  const shadowStyle = {
    opacity: pal.opacity ?? 1,
  };

  switch (type) {
    case 'p':
      return (
        <svg viewBox="0 0 45 45" className={className} style={shadowStyle} aria-hidden="true">
          <path
            d="M22.5 9c-2.21 0-4 1.79-4 4 0 .89.29 1.71.78 2.38C17.33 16.5 16 18.59 16 21c0 2.03.94 3.84 2.41 5.03-3 1.06-7.41 5.55-7.41 13.47h23c0-7.92-4.41-12.41-7.41-13.47 1.47-1.19 2.41-3 2.41-5.03 0-2.41-1.33-4.5-3.28-5.62.49-.67.78-1.49.78-2.38 0-2.21-1.79-4-4-4z"
            fill={fill}
            stroke={stroke}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M23 9.2c1.8.2 3.2 1.8 3.2 3.8 0 .8-.25 1.55-.7 2.2 1.85 1.08 3.1 3.1 3.1 5.6 0 1.9-.85 3.6-2.25 4.8 2.7 1.05 6.8 5.25 6.8 13.1h-4.7c-.2-6.8-2.8-10.7-5.75-12.3 1.15-1.05 1.8-2.7 1.8-4.7 0-2.35-1.1-4.35-2.6-5.3.4-.6.6-1.35.6-2.15 0-1.95-.95-3.65-2.3-4.45.8-.45 1.75-.65 2.8-.6z"
            fill={shade}
            opacity="0.85"
          />
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
          <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 39h27v-3H9v3zM12 36v-4h21v4H12zM11 14V9h4v2h5V9h5v2h5V9h4v5" />
            <path d="M34 14l-3 3H14l-3-3" />
            <path d="M31 17v12.5H14V17" />
            <path d="M31 29.5l1.5 2.5h-20l1.5-2.5" />
          </g>
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
          <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            <path d="M 22,10 C 32.5,11 38.5,18 38,39 L 15,39 C 15,30 25,32.5 23,18" />
            <path d="M 24,18 C 24.38,20.91 18.45,25.37 16,27 C 13,29 13.18,31.34 11,31 C 9.958,30.06 12.41,27.96 11,28 C 10,28 11.19,29.23 10,30 C 9,30 5.997,31 6,26 C 6,24 12,14 12,14 C 12,14 13.89,12.1 14,10.5 C 13.27,9.506 13.5,8.5 13.5,7.5 C 14.5,6.5 16.5,10 16.5,10 L 18.5,10 C 18.5,10 19.28,8.008 21,7 C 22,7 22,10 22,10" />
          </g>
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
          <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 36c3.39-.97 10.11.43 13.5-2 3.39 2.43 10.11 1.03 13.5 2 0 0 1.65.54 3 2-.68.97-1.65.99-3 .5-3.39-.97-10.11.46-13.5-1-3.39 1.46-10.11.03-13.5 1-1.354.49-2.323.47-3-.5 1.354-1.94 3-2 3-2z" />
            <path d="M15 32c2.5 2.5 12.5 2.5 15 0 .5-1.5 0-2 0-2 0-2.5-2.5-4-2.5-4 5.5-1.5 6-11.5-5-15.5-11 4-10.5 14-5 15.5 0 0-2.5 1.5-2.5 4 0 0-.5.5 0 2z" />
            <circle cx="22.5" cy="8" r="2.5" />
          </g>
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
          <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="12" r="2.6" />
            <circle cx="14" cy="9" r="2.6" />
            <circle cx="22.5" cy="8" r="2.6" />
            <circle cx="31" cy="9" r="2.6" />
            <circle cx="39" cy="12" r="2.6" />
            <path d="M9 26c8.5-1.5 21-1.5 27 0l2.5-12.5L31 25l-.3-14.1-5.2 13.6-3-14.5-3 14.5-5.2-13.6L14 25 6.5 13.5 9 26z" />
            <path d="M9 26c0 2 1.5 2 2.5 4 1 1.5 1 1 .5 3.5-1.5 1-1.5 2.5-1.5 2.5-1.5 1.5.5 2.5.5 2.5 6.5 1 16.5 1 23 0 0 0 1.5-1 0-2.5 0 0 .5-1.5-1-2.5-.5-2.5-.5-2 .5-3.5 1-2 2.5-2 2.5-4-8.5-1.5-18.5-1.5-27 0z" />
          </g>
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
          <g fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
            <path d="M22.5 11.63V6M20 8h5" fill="none" stroke={stroke} strokeWidth="2.1" />
            <path d="M22.5 25s4.5-7.5 3-10.5c0 0-1-2.5-3-2.5s-3 2.5-3 2.5c-1.5 3 3 10.5 3 10.5" />
            <path d="M11.5 37c5.5 3.5 15.5 3.5 21 0v-7s9-4.5 6-10.5c-4-6.5-13.5-3.5-16 4V27v-3.5c-3.5-7.5-13-10.5-16-4-3 6 5 10 5 10V37z" />
          </g>
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

export const ChessPiece = memo(ChessPieceInner);
