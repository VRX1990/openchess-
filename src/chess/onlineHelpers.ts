export interface EmailValidationResult {
  valid: boolean;
  normalizedEmail: string;
  canonicalEmail: string;
  domain: string;
  requiresGoogleMxCheck: boolean;
  isGmailConsumer: boolean;
  error?: string;
}

export interface RatingHistoryPoint {
  rating: number;
  ts: number;
}

export type RatingSpeed = 'rapid' | 'blitz' | 'bullet' | 'puzzle';

export type RatingHistoryMap = Record<RatingSpeed, RatingHistoryPoint[]>;

export type LeagueTier =
  | 'Wood'
  | 'Stone'
  | 'Bronze'
  | 'Silver'
  | 'Crystal'
  | 'Elite'
  | 'Champion'
  | 'Legend';

export interface LeagueStatus {
  tier: LeagueTier;
  points: number;
  nextTier: LeagueTier | null;
  nextThreshold: number | null;
  progressPct: number;
  badgeColor: string;
}

export interface DirectMessageItem {
  id: string;
  from: string;
  to: string;
  text: string;
  timestamp: number;
  read?: boolean;
  fromAvatarUrl?: string;
  fromFlag?: string;
}

export interface DirectMessageThread {
  partnerUsername: string;
  partnerAvatarUrl?: string;
  partnerFlag?: string;
  partnerOnline?: boolean;
  partnerRating?: number;
  lastMessage: DirectMessageItem;
  unreadCount: number;
  messages: DirectMessageItem[];
}

export type ChessServerName = 'OpenChess' | 'Lichess' | 'Chess.com' | 'FICS' | 'PlayStrategy';

export interface OpenChallengeItem {
  id: string;
  source: 'openchess' | 'network' | 'fics';
  server?: ChessServerName;
  username: string;
  rating?: number;
  avatarUrl?: string;
  flag?: string;
  title?: string;
  speed: 'bullet' | 'blitz' | 'rapid';
  clock: string;
  initialSeconds: number;
  incrementSeconds: number;
  rated: boolean;
  color: 'white' | 'black' | 'random';
  createdAt: number;
  hookId?: string;
  ficsAdId?: string;
}

export const STARTING_SKILL_TIERS: Array<{
  id: 'new' | 'beginner' | 'intermediate' | 'advanced';
  label: string;
  rating: number;
  description: string;
}> = [
  { id: 'new', label: 'New to Chess', rating: 400, description: 'Just learning rules & pieces' },
  { id: 'beginner', label: 'Beginner', rating: 800, description: 'Knows basic tactics & openings' },
  { id: 'intermediate', label: 'Intermediate', rating: 1200, description: 'Regular club & online player' },
  { id: 'advanced', label: 'Advanced', rating: 1500, description: 'Experienced tournament strength' },
];

export const COUNTRY_OPTIONS: Array<{ code: string; name: string; flag: string }> = [
  { code: 'INT', name: 'International', flag: '🌍' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'IQ', name: 'Iraq', flag: '🇮🇶' },
  { code: 'EG', name: 'Egypt', flag: '🇪🇬' },
  { code: 'SA', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱' },
  { code: 'UA', name: 'Ukraine', flag: '🇺🇦' },
  { code: 'TR', name: 'Turkey', flag: '🇹🇷' },
  { code: 'IN', name: 'India', flag: '🇮🇳' },
  { code: 'BR', name: 'Brazil', flag: '🇧🇷' },
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'JP', name: 'Japan', flag: '🇯🇵' },
  { code: 'KR', name: 'South Korea', flag: '🇰🇷' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺' },
  { code: 'CN', name: 'China', flag: '🇨🇳' },
];

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  'guerrillamail.com',
  'guerrillamail.org',
  '10minutemail.com',
  '10minutemail.net',
  'yopmail.com',
  'yopmail.fr',
  'trashmail.com',
  'fakeinbox.com',
  'throwawaymail.com',
  'getnada.com',
  'maildrop.cc',
  'dispostable.com',
  'sharklasers.com',
  'mintemail.com',
  'mohmal.com',
  'emailondeck.com',
  'tempail.com',
  'discard.email',
  'burner.email',
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'fake.com',
  'localhost',
  'invalid',
]);

const NON_GOOGLE_CONSUMER_DOMAINS = new Set([
  'yahoo.com',
  'yahoo.co.uk',
  'hotmail.com',
  'outlook.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'gmx.com',
  'fastmail.com',
]);

export function canonicalizeGmailAddress(rawEmail: string): string {
  const trimmed = rawEmail.trim().toLowerCase();
  const atIndex = trimmed.indexOf('@');
  if (atIndex <= 0) return trimmed;
  let local = trimmed.slice(0, atIndex);
  let domain = trimmed.slice(atIndex + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') {
    const plusIdx = local.indexOf('+');
    if (plusIdx >= 0) local = local.slice(0, plusIdx);
    local = local.replace(/\./g, '');
  }
  return `${local}@${domain}`;
}

export function validateGoogleOrGmailEmail(rawEmail: string): EmailValidationResult {
  const normalized = rawEmail.trim().toLowerCase();
  const baseFail = (error: string): EmailValidationResult => ({
    valid: false,
    normalizedEmail: normalized,
    canonicalEmail: normalized,
    domain: '',
    requiresGoogleMxCheck: false,
    isGmailConsumer: false,
    error,
  });

  if (!normalized || normalized.length > 254) {
    return baseFail('Enter a valid email address.');
  }

  const atParts = normalized.split('@');
  if (atParts.length !== 2) {
    return baseFail('Enter a valid email address (e.g. name@gmail.com).');
  }

  const [localPart, domain] = atParts;
  if (!localPart || !domain || !domain.includes('.')) {
    return baseFail('Enter a valid email address.');
  }

  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return baseFail('Email username format is invalid.');
  }

  if (!/^[a-z0-9._+-]{1,64}$/.test(localPart)) {
    return baseFail('Email username contains invalid characters.');
  }

  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || domain.includes('..')) {
    return baseFail('Email domain is invalid.');
  }

  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return baseFail('Disposable email domains are not supported.');
  }

  if (NON_GOOGLE_CONSUMER_DOMAINS.has(domain)) {
    return baseFail(
      `Please sign in with a Gmail or Google Workspace account ("${domain}" is not supported).`,
    );
  }

  const isGmailConsumer = domain === 'gmail.com' || domain === 'googlemail.com';
  if (isGmailConsumer) {
    const coreLocal = canonicalizeGmailAddress(normalized).split('@')[0] ?? '';
    // Google enforces minimum 6 characters for consumer Gmail addresses
    if (coreLocal.length < 6) {
      return baseFail('Gmail addresses must have at least 6 characters before @gmail.com.');
    }
    if (/^(test|fake|dummy|sample|none|null|asdfgh|qwerty|123456|abcdef)\d*$/i.test(coreLocal)) {
      return baseFail('Enter a valid Gmail address.');
    }
  }

  return {
    valid: true,
    normalizedEmail: normalized,
    canonicalEmail: canonicalizeGmailAddress(normalized),
    domain,
    requiresGoogleMxCheck: !isGmailConsumer,
    isGmailConsumer,
  };
}

export function isGoogleMxHost(exchange: string): boolean {
  const host = exchange.trim().toLowerCase().replace(/\.$/, '');
  if (!host) return false;
  return (
    host === 'smtp.google.com' ||
    host.endsWith('.google.com') ||
    host.endsWith('.googlemail.com') ||
    host === 'aspmx.l.google.com' ||
    host.endsWith('.aspmx.l.google.com')
  );
}

export function appendRatingHistoryPoint(
  history: Partial<RatingHistoryMap> | undefined,
  speed: RatingSpeed,
  rating: number,
  ts = Date.now(),
): RatingHistoryMap {
  const base: RatingHistoryMap = {
    rapid: Array.isArray(history?.rapid) ? [...history!.rapid!] : [],
    blitz: Array.isArray(history?.blitz) ? [...history!.blitz!] : [],
    bullet: Array.isArray(history?.bullet) ? [...history!.bullet!] : [],
    puzzle: Array.isArray(history?.puzzle) ? [...history!.puzzle!] : [],
  };
  const rounded = Math.round(rating);
  const current = base[speed];
  const last = current[current.length - 1];
  if (last && last.rating === rounded && Math.abs(ts - last.ts) < 1500) {
    return base;
  }
  base[speed] = [...current, { rating: rounded, ts }].slice(-50);
  return base;
}

export const LEAGUE_TIERS: Array<{
  tier: LeagueTier;
  minPoints: number;
  badgeColor: string;
  description: string;
}> = [
  { tier: 'Wood', minPoints: 0, badgeColor: '#9C7A54', description: 'Starting Division' },
  { tier: 'Stone', minPoints: 25, badgeColor: '#8E99A2', description: '25+ Trophies' },
  { tier: 'Bronze', minPoints: 65, badgeColor: '#CD7F32', description: '65+ Trophies' },
  { tier: 'Silver', minPoints: 140, badgeColor: '#C5CED6', description: '140+ Trophies' },
  { tier: 'Crystal', minPoints: 260, badgeColor: '#56C2F6', description: '260+ Trophies' },
  { tier: 'Elite', minPoints: 420, badgeColor: '#B57EDC', description: '420+ Trophies' },
  { tier: 'Champion', minPoints: 640, badgeColor: '#F5C451', description: '640+ Trophies' },
  { tier: 'Legend', minPoints: 950, badgeColor: '#81B64C', description: '950+ Trophies' },
];

export function computeLeagueInfo(rawPoints = 0): LeagueStatus {
  const points = Math.max(0, Math.round(rawPoints));
  let idx = 0;
  for (let i = LEAGUE_TIERS.length - 1; i >= 0; i--) {
    if (points >= LEAGUE_TIERS[i].minPoints) {
      idx = i;
      break;
    }
  }
  const current = LEAGUE_TIERS[idx];
  const next = LEAGUE_TIERS[idx + 1] ?? null;
  if (!next) {
    return {
      tier: current.tier,
      points,
      nextTier: null,
      nextThreshold: null,
      progressPct: 100,
      badgeColor: current.badgeColor,
    };
  }
  const span = next.minPoints - current.minPoints;
  const pct = span > 0 ? Math.min(100, Math.max(0, Math.round(((points - current.minPoints) / span) * 100))) : 100;
  return {
    tier: current.tier,
    points,
    nextTier: next.tier,
    nextThreshold: next.minPoints,
    progressPct: pct,
    badgeColor: current.badgeColor,
  };
}

export interface ProgressAccountSnapshot {
  perfs?: {
    rapid?: { rating: number; games: number };
    blitz?: { rating: number; games: number };
    bullet?: { rating: number; games: number };
    puzzle?: { rating: number; games: number };
    classical?: { rating: number; games: number };
    correspondence?: { rating: number; games: number };
    storm?: { runs: number; score: number };
    streak?: { runs: number; score: number };
  };
  count?: { all: number; win: number; loss: number; draw: number; rated?: number };
  profile?: {
    country?: string;
    flag?: string;
    bio?: string;
    avatarUrl?: string;
  };
  isLocalOpenChessAccount?: boolean;
  localProgressInitialized?: boolean;
}

export function mergeOpenChessAccountProgress(params: {
  local: ProgressAccountSnapshot;
  remote?: ProgressAccountSnapshot | null;
  preferRemote?: boolean;
}) {
  const { local, remote, preferRemote = false } = params;
  const preserveLocal =
    !preferRemote && Boolean(local.isLocalOpenChessAccount || local.localProgressInitialized);

  const localProfile = local.profile ?? {};
  const remoteProfile = remote?.profile ?? {};

  const mergedProfile = {
    country:
      localProfile.country && localProfile.country !== 'INT'
        ? localProfile.country
        : remoteProfile.country || localProfile.country || 'INT',
    flag:
      localProfile.flag && localProfile.flag !== 'INT'
        ? localProfile.flag
        : remoteProfile.flag || localProfile.flag || localProfile.country || 'INT',
    bio:
      localProfile.bio && localProfile.bio.trim().length > 0
        ? localProfile.bio
        : remoteProfile.bio ?? localProfile.bio,
    avatarUrl: localProfile.avatarUrl || remoteProfile.avatarUrl,
  };

  if (preserveLocal || !remote) {
    return {
      perfs: local.perfs,
      count: local.count,
      profile: mergedProfile,
    };
  }

  if (preferRemote) {
    const bestStormScore = Math.max(
      local.perfs?.storm?.score ?? 0,
      remote.perfs?.storm?.score ?? 0,
    );
    const bestStreakScore = Math.max(
      local.perfs?.streak?.score ?? 0,
      remote.perfs?.streak?.score ?? 0,
    );
    return {
      perfs: {
        ...(local.perfs ?? {}),
        ...(remote.perfs ?? {}),
        ...(bestStormScore > 0
          ? {
              storm: {
                runs: Math.max(local.perfs?.storm?.runs ?? 0, remote.perfs?.storm?.runs ?? 0),
                score: bestStormScore,
              },
            }
          : {}),
        ...(bestStreakScore > 0
          ? {
              streak: {
                runs: Math.max(local.perfs?.streak?.runs ?? 0, remote.perfs?.streak?.runs ?? 0),
                score: bestStreakScore,
              },
            }
          : {}),
      },
      count: remote.count ?? local.count,
      profile: mergedProfile,
    };
  }

  return {
    perfs: {
      ...(remote.perfs ?? {}),
      ...(local.perfs ?? {}),
      rapid:
        (local.perfs?.rapid?.games ?? 0) > (remote.perfs?.rapid?.games ?? 0)
          ? local.perfs?.rapid
          : remote.perfs?.rapid ?? local.perfs?.rapid,
      blitz:
        (local.perfs?.blitz?.games ?? 0) > (remote.perfs?.blitz?.games ?? 0)
          ? local.perfs?.blitz
          : remote.perfs?.blitz ?? local.perfs?.blitz,
      bullet:
        (local.perfs?.bullet?.games ?? 0) > (remote.perfs?.bullet?.games ?? 0)
          ? local.perfs?.bullet
          : remote.perfs?.bullet ?? local.perfs?.bullet,
      puzzle:
        (local.perfs?.puzzle?.games ?? 0) > (remote.perfs?.puzzle?.games ?? 0)
          ? local.perfs?.puzzle
          : remote.perfs?.puzzle ?? local.perfs?.puzzle,
    },
    count:
      (local.count?.all ?? 0) >= (remote.count?.all ?? 0)
        ? local.count ?? remote.count
        : remote.count ?? local.count,
    profile: mergedProfile,
  };
}

export interface AccountProgressSyncPayload {
  perfs?: ProgressAccountSnapshot['perfs'];
  count?: ProgressAccountSnapshot['count'];
  profile?: ProgressAccountSnapshot['profile'];
  leaguePoints?: number;
  ratingHistory?: Partial<RatingHistoryMap>;
}

function clampSafeRating(val: unknown, fallback = 1200): number {
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  return Math.max(100, Math.min(3500, Math.round(val)));
}

function mergeRatingHistorySeries(
  a?: RatingHistoryPoint[],
  b?: RatingHistoryPoint[],
): RatingHistoryPoint[] {
  const combined = [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]
    .filter(
      (p): p is RatingHistoryPoint =>
        Boolean(p) &&
        typeof p.rating === 'number' &&
        Number.isFinite(p.rating) &&
        typeof p.ts === 'number' &&
        Number.isFinite(p.ts),
    )
    .sort((x, y) => x.ts - y.ts);
  const out: RatingHistoryPoint[] = [];
  for (const pt of combined) {
    const prev = out[out.length - 1];
    if (prev && prev.rating === Math.round(pt.rating) && Math.abs(pt.ts - prev.ts) < 1500) {
      continue;
    }
    out.push({ rating: clampSafeRating(pt.rating), ts: pt.ts });
  }
  return out.slice(-50);
}

export function mergeLocalAccountProgress(params: {
  server: AccountProgressSyncPayload & { localProgressInitialized?: boolean };
  local?: AccountProgressSyncPayload | null;
}): {
  perfs: NonNullable<ProgressAccountSnapshot['perfs']>;
  count: NonNullable<ProgressAccountSnapshot['count']>;
  profile: NonNullable<ProgressAccountSnapshot['profile']>;
  leaguePoints: number;
  ratingHistory: RatingHistoryMap;
  restoredFromLocal: boolean;
} {
  const { server, local } = params;
  const srvPerfs = server.perfs ?? {};
  const locPerfs = local?.perfs ?? {};
  const srvCount = server.count ?? { all: 0, win: 0, loss: 0, draw: 0, rated: 0 };
  const locCount = local?.count ?? { all: 0, win: 0, loss: 0, draw: 0, rated: 0 };

  const serverGames = Math.max(
    srvCount.all ?? 0,
    (srvPerfs.rapid?.games ?? 0) + (srvPerfs.blitz?.games ?? 0) + (srvPerfs.bullet?.games ?? 0),
  );
  const localGames = Math.max(
    locCount.all ?? 0,
    (locPerfs.rapid?.games ?? 0) + (locPerfs.blitz?.games ?? 0) + (locPerfs.bullet?.games ?? 0),
  );
  const serverEmpty = !server.localProgressInitialized && serverGames === 0;

  const pickPerf = (
    key: 'rapid' | 'blitz' | 'bullet' | 'puzzle' | 'classical' | 'correspondence',
    fallbackRating = 1200,
  ) => {
    const s = srvPerfs[key];
    const l = locPerfs[key];
    const sGames = Math.max(0, Math.round(s?.games ?? 0));
    const lGames = Math.max(0, Math.round(l?.games ?? 0));
    if (l && (lGames > sGames || (serverEmpty && l.rating !== 1200))) {
      return { rating: clampSafeRating(l.rating, fallbackRating), games: Math.max(sGames, lGames) };
    }
    if (s) {
      return { rating: clampSafeRating(s.rating, fallbackRating), games: Math.max(sGames, lGames) };
    }
    if (l) {
      return { rating: clampSafeRating(l.rating, fallbackRating), games: lGames };
    }
    return { rating: fallbackRating, games: 0 };
  };

  const rapid = pickPerf('rapid');
  const blitz = pickPerf('blitz');
  const bullet = pickPerf('bullet');
  const puzzle = pickPerf('puzzle');
  const stormScore = Math.max(0, srvPerfs.storm?.score ?? 0, locPerfs.storm?.score ?? 0);
  const stormRuns = Math.max(0, srvPerfs.storm?.runs ?? 0, locPerfs.storm?.runs ?? 0);
  const streakScore = Math.max(0, srvPerfs.streak?.score ?? 0, locPerfs.streak?.score ?? 0);
  const streakRuns = Math.max(0, srvPerfs.streak?.runs ?? 0, locPerfs.streak?.runs ?? 0);

  const useLocalCount = localGames > serverGames || (serverEmpty && (locCount.all ?? 0) > 0);
  const mergedCount = {
    all: Math.max(0, useLocalCount ? (locCount.all ?? 0) : (srvCount.all ?? 0), locCount.all ?? 0, srvCount.all ?? 0),
    win: Math.max(0, useLocalCount ? (locCount.win ?? 0) : (srvCount.win ?? 0), srvCount.win ?? 0),
    loss: Math.max(0, useLocalCount ? (locCount.loss ?? 0) : (srvCount.loss ?? 0), srvCount.loss ?? 0),
    draw: Math.max(0, useLocalCount ? (locCount.draw ?? 0) : (srvCount.draw ?? 0), srvCount.draw ?? 0),
    rated: Math.max(0, srvCount.rated ?? 0, locCount.rated ?? 0),
  };

  const sProf = server.profile ?? {};
  const lProf = local?.profile ?? {};
  const mergedProfile = {
    country:
      sProf.country && sProf.country !== 'INT'
        ? sProf.country
        : lProf.country || sProf.country || 'INT',
    flag:
      sProf.flag && sProf.flag !== 'INT'
        ? sProf.flag
        : lProf.flag || sProf.flag || lProf.country || 'INT',
    bio: sProf.bio && sProf.bio.trim().length > 0 ? sProf.bio : lProf.bio,
    avatarUrl: sProf.avatarUrl || lProf.avatarUrl,
  };

  const leaguePoints = Math.max(
    0,
    Math.round(server.leaguePoints ?? 0),
    Math.round(local?.leaguePoints ?? 0),
  );

  const ratingHistory: RatingHistoryMap = {
    rapid: mergeRatingHistorySeries(server.ratingHistory?.rapid, local?.ratingHistory?.rapid),
    blitz: mergeRatingHistorySeries(server.ratingHistory?.blitz, local?.ratingHistory?.blitz),
    bullet: mergeRatingHistorySeries(server.ratingHistory?.bullet, local?.ratingHistory?.bullet),
    puzzle: mergeRatingHistorySeries(server.ratingHistory?.puzzle, local?.ratingHistory?.puzzle),
  };

  const restoredFromLocal = Boolean(
    local &&
      (localGames > serverGames ||
        (serverEmpty &&
          (rapid.rating !== 1200 ||
            blitz.rating !== 1200 ||
            bullet.rating !== 1200 ||
            puzzle.rating !== 1200 ||
            leaguePoints > 0))),
  );

  return {
    perfs: {
      ...srvPerfs,
      rapid,
      blitz,
      bullet,
      puzzle,
      ...(stormScore > 0 || stormRuns > 0 ? { storm: { runs: stormRuns, score: stormScore } } : {}),
      ...(streakScore > 0 || streakRuns > 0 ? { streak: { runs: streakRuns, score: streakScore } } : {}),
    },
    count: mergedCount,
    profile: mergedProfile,
    leaguePoints,
    ratingHistory,
    restoredFromLocal,
  };
}

export function upsertDirectMessage(params: {
  threads: Record<string, DirectMessageItem[]>;
  partnerUsername: string;
  message: DirectMessageItem;
  maxPerThread?: number;
}): Record<string, DirectMessageItem[]> {
  const key = params.partnerUsername.trim().toLowerCase();
  const limit = params.maxPerThread ?? 100;
  const existing = params.threads[key] ?? [];
  if (existing.some((m) => m.id === params.message.id)) {
    return params.threads;
  }
  return {
    ...params.threads,
    [key]: [...existing, params.message].slice(-limit),
  };
}

export function countUnreadDirectMessages(
  threads: Record<string, DirectMessageItem[]>,
  currentUsername: string,
): number {
  const meLower = currentUsername.trim().toLowerCase();
  let count = 0;
  for (const msgs of Object.values(threads)) {
    for (const m of msgs) {
      if (m.to.toLowerCase() === meLower && m.from.toLowerCase() !== meLower && !m.read) {
        count += 1;
      }
    }
  }
  return count;
}

export function sanitizePublicAvatar(raw: string | undefined): string | undefined {
  if (!raw || typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('preset-') ||
    trimmed.startsWith('preset:') ||
    trimmed.startsWith('https://')
  ) {
    return trimmed;
  }
  return undefined;
}

export const MAX_MATCHMAKING_ELO_GAP = 200;

export function getFairMatchmakingEloBand(
  playerElo: number,
  maxGap = MAX_MATCHMAKING_ELO_GAP,
): { minElo: number; maxElo: number } {
  const safeElo = Math.max(100, Math.min(3200, Math.round(Number(playerElo) || 1200)));
  return {
    minElo: Math.max(100, safeElo - maxGap),
    maxElo: Math.min(3300, safeElo + maxGap),
  };
}

export function isWithinFairEloBand(
  playerElo: number,
  opponentElo: number,
  maxGap = MAX_MATCHMAKING_ELO_GAP,
): boolean {
  return Math.abs(Math.round(playerElo) - Math.round(opponentElo)) <= maxGap;
}

export function clampOpponentEloToBand(
  targetElo: number,
  rawOpponentElo: number,
  seedStr = '',
  maxGap = MAX_MATCHMAKING_ELO_GAP,
): number {
  const { minElo, maxElo } = getFairMatchmakingEloBand(targetElo, maxGap);
  if (rawOpponentElo >= minElo && rawOpponentElo <= maxElo) {
    return Math.round(rawOpponentElo);
  }
  const safeTarget = Math.max(100, Math.min(3200, Math.round(targetElo)));
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) | 0;
  }
  const offset = (Math.abs(hash) % 291) - 145;
  return Math.max(minElo, Math.min(maxElo, safeTarget + offset));
}

export const PUBLIC_SHARE_APP_URL = 'https://openchess.bonto.page';

export function getShareableAppOrigin(): string {
  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin && !origin.includes('localhost') && !origin.includes('127.0.0.1')) {
      return origin;
    }
  }
  return PUBLIC_SHARE_APP_URL;
}

const BOARD_FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const BOARD_RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export function computePremoveTargets(
  pieceType: 'p' | 'n' | 'b' | 'r' | 'q' | 'k',
  pieceColor: 'w' | 'b',
  fromSquare: string,
  occupiedSquares: ReadonlySet<string>,
): Map<string, { isCapture: boolean; isPromo: boolean }> {
  const targets = new Map<string, { isCapture: boolean; isPromo: boolean }>();
  if (!fromSquare || fromSquare.length !== 2) return targets;
  const fIdx = BOARD_FILES.indexOf(fromSquare[0]);
  const rIdx = BOARD_RANKS.indexOf(fromSquare[1]);
  if (fIdx < 0 || rIdx < 0) return targets;

  const addSq = (f: number, r: number) => {
    if (f < 0 || f > 7 || r < 0 || r > 7) return false;
    const sq = `${BOARD_FILES[f]}${BOARD_RANKS[r]}`;
    if (sq === fromSquare) return false;
    const isPromo =
      pieceType === 'p' && ((pieceColor === 'w' && r === 0) || (pieceColor === 'b' && r === 7));
    const isCapture = occupiedSquares.has(sq);
    targets.set(sq, { isCapture, isPromo });
    return true;
  };

  if (pieceType === 'p') {
    const dir = pieceColor === 'w' ? -1 : 1;
    const startRankIdx = pieceColor === 'w' ? 6 : 1;
    // 1 step forward, 2 steps from starting rank, and both diagonal capture/recapture squares
    addSq(fIdx, rIdx + dir);
    if (rIdx === startRankIdx) {
      addSq(fIdx, rIdx + dir * 2);
    }
    addSq(fIdx - 1, rIdx + dir);
    addSq(fIdx + 1, rIdx + dir);
    return targets;
  }

  if (pieceType === 'n') {
    const jumps = [
      [-2, -1],
      [-2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
      [2, -1],
      [2, 1],
    ];
    for (const [df, dr] of jumps) {
      addSq(fIdx + df, rIdx + dr);
    }
    return targets;
  }

  if (pieceType === 'k') {
    for (let df = -1; df <= 1; df++) {
      for (let dr = -1; dr <= 1; dr++) {
        if (df === 0 && dr === 0) continue;
        addSq(fIdx + df, rIdx + dr);
      }
    }
    // Castling premove squares from king starting square
    if (pieceColor === 'w' && fromSquare === 'e1') {
      addSq(6, 7); // g1
      addSq(2, 7); // c1
    } else if (pieceColor === 'b' && fromSquare === 'e8') {
      addSq(6, 0); // g8
      addSq(2, 0); // c8
    }
    return targets;
  }

  const dirs: Array<[number, number]> = [];
  if (pieceType === 'b' || pieceType === 'q') {
    dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
  }
  if (pieceType === 'r' || pieceType === 'q') {
    dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
  }
  for (const [df, dr] of dirs) {
    for (let step = 1; step < 8; step++) {
      if (!addSq(fIdx + df * step, rIdx + dr * step)) break;
    }
  }
  return targets;
}

export function isPremoveLegalAfterReply(params: {
  fen: string;
  playerColor: 'w' | 'b';
  from: string;
  to: string;
  promotion?: 'q' | 'r' | 'b' | 'n';
}): boolean {
  const parts = params.fen.split(' ');
  const activeColor = parts[1];
  if (activeColor !== params.playerColor) return false;
  const boardFenIdx = parts[0];
  if (!boardFenIdx) return false;
  // Validate format quickly and let chess.js caller execute move
  return (
    params.from.length === 2 &&
    params.to.length === 2 &&
    params.from !== params.to &&
    BOARD_FILES.includes(params.from[0]) &&
    BOARD_RANKS.includes(params.from[1]) &&
    BOARD_FILES.includes(params.to[0]) &&
    BOARD_RANKS.includes(params.to[1])
  );
}

export function isPlaceholderPlayerUsername(username: string | undefined | null): boolean {
  const clean = (username ?? '').trim().toLowerCase();
  return (
    !clean ||
    clean === 'anonymous' ||
    clean === 'anonymous (live)' ||
    clean === 'lichess player' ||
    clean.startsWith('lichess_')
  );
}

export function filterNamedOpenChallenges<
  T extends { username?: string | null; rating?: number },
>(challenges: T[], targetElo?: number | null): T[] {
  return challenges.filter((ch) => {
    if (isPlaceholderPlayerUsername(ch.username)) return false;
    if (
      typeof targetElo === 'number' &&
      typeof ch.rating === 'number' &&
      Math.abs(ch.rating - targetElo) > 200
    ) {
      return false;
    }
    return true;
  });
}

export function resolveOnlineOpponentRating(params: {
  hookRating?: unknown;
  v5OpponentRating?: unknown;
  publicPerfs?: Record<string, { rating?: unknown } | undefined> | null;
  speed?: 'bullet' | 'blitz' | 'rapid';
}): number | undefined {
  if (typeof params.hookRating === 'number' && Number.isFinite(params.hookRating) && params.hookRating > 0) {
    return Math.round(params.hookRating);
  }
  if (
    typeof params.v5OpponentRating === 'number' &&
    Number.isFinite(params.v5OpponentRating) &&
    params.v5OpponentRating > 0
  ) {
    return Math.round(params.v5OpponentRating);
  }
  const perfs = params.publicPerfs;
  if (perfs) {
    const order = [params.speed, 'rapid', 'blitz', 'bullet'].filter(Boolean) as string[];
    for (const k of order) {
      const r = perfs[k]?.rating;
      if (typeof r === 'number' && Number.isFinite(r) && r > 0) {
        return Math.round(r);
      }
    }
  }
  return undefined;
}

export interface LocalFriendsBackup {
  friends: string[];
  outgoingRequests: string[];
  removedFriends: string[];
}

function dedupeUsernamesPreserveCase(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const clean = raw.trim();
    if (!clean) continue;
    const lower = clean.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(clean);
  }
  return out;
}

export function loadLocalFriendsBackup(username: string | undefined | null): LocalFriendsBackup {
  const cleanUser = username?.trim().toLowerCase();
  if (!cleanUser || typeof localStorage === 'undefined') {
    return { friends: [], outgoingRequests: [], removedFriends: [] };
  }
  try {
    const raw = localStorage.getItem(`openchess_friends_backup_${cleanUser}`);
    if (!raw) return { friends: [], outgoingRequests: [], removedFriends: [] };
    const parsed = JSON.parse(raw) as {
      friends?: unknown;
      outgoingRequests?: unknown;
      removedFriends?: unknown;
    };
    return {
      friends: Array.isArray(parsed.friends)
        ? dedupeUsernamesPreserveCase(
            parsed.friends.filter((f): f is string => typeof f === 'string'),
          )
        : [],
      outgoingRequests: Array.isArray(parsed.outgoingRequests)
        ? dedupeUsernamesPreserveCase(
            parsed.outgoingRequests.filter((f): f is string => typeof f === 'string'),
          )
        : [],
      removedFriends: Array.isArray(parsed.removedFriends)
        ? Array.from(
            new Set(
              parsed.removedFriends
                .filter((f): f is string => typeof f === 'string')
                .map((f) => f.trim().toLowerCase())
                .filter(Boolean),
            ),
          )
        : [],
    };
  } catch {
    return { friends: [], outgoingRequests: [], removedFriends: [] };
  }
}

export function saveLocalFriendsBackup(
  username: string | undefined | null,
  friends: string[],
  outgoingRequests: string[] = [],
  removedFriends?: string[],
): void {
  const cleanUser = username?.trim().toLowerCase();
  if (!cleanUser || typeof localStorage === 'undefined') return;
  try {
    const existingRemoved =
      removedFriends !== undefined
        ? removedFriends
        : loadLocalFriendsBackup(cleanUser).removedFriends;
    const removedSet = new Set(
      existingRemoved.map((f) => f.trim().toLowerCase()).filter(Boolean),
    );
    const cleanFriends = dedupeUsernamesPreserveCase(friends).filter(
      (f) => !removedSet.has(f.toLowerCase()),
    );
    const friendLowerSet = new Set(cleanFriends.map((f) => f.toLowerCase()));
    const cleanOutgoing = dedupeUsernamesPreserveCase(outgoingRequests).filter(
      (f) => !removedSet.has(f.toLowerCase()) && !friendLowerSet.has(f.toLowerCase()),
    );
    localStorage.setItem(
      `openchess_friends_backup_${cleanUser}`,
      JSON.stringify({
        friends: cleanFriends,
        outgoingRequests: cleanOutgoing,
        removedFriends: Array.from(removedSet).slice(0, 100),
        updatedAt: Date.now(),
      }),
    );
  } catch {
    // ignore storage errors
  }
}

export function markFriendRemovedInBackup(
  username: string | undefined | null,
  targetUsername: string,
): LocalFriendsBackup {
  const cleanTarget = targetUsername.trim().toLowerCase();
  const prev = loadLocalFriendsBackup(username);
  if (!cleanTarget) return prev;
  const nextRemoved = Array.from(new Set([cleanTarget, ...prev.removedFriends])).slice(0, 100);
  const nextFriends = prev.friends.filter((f) => f.toLowerCase() !== cleanTarget);
  const nextOutgoing = prev.outgoingRequests.filter((f) => f.toLowerCase() !== cleanTarget);
  saveLocalFriendsBackup(username, nextFriends, nextOutgoing, nextRemoved);
  return {
    friends: nextFriends,
    outgoingRequests: nextOutgoing,
    removedFriends: nextRemoved,
  };
}

export function clearFriendRemovedInBackup(
  username: string | undefined | null,
  targetUsername: string,
): void {
  const cleanTarget = targetUsername.trim().toLowerCase();
  if (!cleanTarget) return;
  const prev = loadLocalFriendsBackup(username);
  if (!prev.removedFriends.includes(cleanTarget)) return;
  saveLocalFriendsBackup(
    username,
    prev.friends,
    prev.outgoingRequests,
    prev.removedFriends.filter((f) => f !== cleanTarget),
  );
}

export function mergeFriendsBackupWithServer(params: {
  serverFriends: string[];
  serverOutgoing?: string[];
  serverRemoved?: string[];
  localBackup: LocalFriendsBackup;
}): LocalFriendsBackup {
  const removedSet = new Set<string>(
    [
      ...params.localBackup.removedFriends,
      ...(params.serverRemoved ?? []),
    ]
      .map((f) => f.trim().toLowerCase())
      .filter(Boolean),
  );
  const mergedFriends = dedupeUsernamesPreserveCase([
    ...params.serverFriends,
    ...params.localBackup.friends,
  ]).filter((f) => !removedSet.has(f.toLowerCase()));

  const friendLowerSet = new Set(mergedFriends.map((f) => f.toLowerCase()));
  const mergedOutgoing = dedupeUsernamesPreserveCase([
    ...(params.serverOutgoing ?? []),
    ...params.localBackup.outgoingRequests,
  ]).filter((f) => !removedSet.has(f.toLowerCase()) && !friendLowerSet.has(f.toLowerCase()));

  return {
    friends: mergedFriends,
    outgoingRequests: mergedOutgoing,
    removedFriends: Array.from(removedSet).slice(0, 100),
  };
}

export interface FicsSoughtAd {
  adId: string;
  username: string;
  rating?: number;
  initialSeconds: number;
  incrementSeconds: number;
  speed: 'bullet' | 'blitz' | 'rapid';
  clock: string;
  rated: boolean;
  color: 'white' | 'black' | 'random';
}

export function parseFicsWhoOutput(rawBuffer: string): Array<{ username: string; rating?: number }> {
  const out: Array<{ username: string; rating?: number }> = [];
  const seen = new Set<string>();
  for (const rawLine of rawBuffer.split(/\r?\n/)) {
    if (/\(C\)/.test(rawLine)) continue;
    const tokenMatches = rawLine.matchAll(
      /(?:^|\s)(\d{3,4}|\+{4}|-{4})\s*[*^~:+.]?\s*([A-Za-z][A-Za-z0-9_-]{2,18})(?:\([A-Z*]+\))?(?=$|\s)/g,
    );
    for (const m of tokenMatches) {
      const ratingToken = m[1];
      const uname = m[2];
      if (
        !uname ||
        /^(Guest|TD|SR|CA|FM|IM|GM|WGM|WIM|WFM|TM|fics|blitz|standard|lightning|unrated|rated|displayed|players)$/i.test(
          uname,
        ) ||
        seen.has(uname.toLowerCase())
      ) {
        continue;
      }
      seen.add(uname.toLowerCase());
      const parsedRating = /^\d{3,4}$/.test(ratingToken) ? parseInt(ratingToken, 10) : undefined;
      out.push({
        username: uname,
        rating:
          typeof parsedRating === 'number' && parsedRating >= 400 && parsedRating <= 3200
            ? parsedRating
            : undefined,
      });
    }
  }
  return out;
}

export function parseFicsSoughtLine(rawLine: string): FicsSoughtAd | null {
  const line = rawLine.replace(/\r/g, '').trim();
  if (!line || /\(C\)/.test(line)) return null;
  // Format: "<adId> <rating|++++> <username> <time> <inc> <rated|unrated> <type> [white|black] <range> [m|f]"
  const m = line.match(
    /^(\d+)\s+(\d{3,4}|\+{4}|-{4})\s+([A-Za-z][A-Za-z0-9_-]{1,20})(?:\([A-Z*]+\))?\s+(\d+)\s+(\d+)\s+(rated|unrated)\s+([A-Za-z0-9/()_-]+)(?:\s+(?:\[(white|black)\]))?/i,
  );
  if (!m) return null;
  const adId = m[1];
  const ratingStr = m[2];
  const username = m[3];
  const mins = parseInt(m[4], 10);
  const inc = parseInt(m[5], 10);
  const rated = m[6].toLowerCase() === 'rated';
  const gameType = m[7].toLowerCase();
  const colorBracket = m[8]?.toLowerCase();

  if (!['standard', 'blitz', 'lightning'].includes(gameType)) return null;
  if (!Number.isFinite(mins) || !Number.isFinite(inc)) return null;

  const initialSeconds = mins > 0 ? mins * 60 : Math.max(30, inc > 0 ? 30 : 60);
  const expectedTotal = initialSeconds + 40 * inc;
  const speed: 'bullet' | 'blitz' | 'rapid' =
    expectedTotal < 180 ? 'bullet' : expectedTotal < 480 ? 'blitz' : 'rapid';
  const parsedRating = /^\d{3,4}$/.test(ratingStr) ? parseInt(ratingStr, 10) : undefined;

  return {
    adId,
    username,
    rating:
      typeof parsedRating === 'number' && parsedRating >= 400 && parsedRating <= 3200
        ? parsedRating
        : undefined,
    initialSeconds,
    incrementSeconds: inc,
    speed,
    clock: `${mins}+${inc}`,
    rated,
    color: colorBracket === 'white' ? 'white' : colorBracket === 'black' ? 'black' : 'random',
  };
}

export function parseFicsSoughtOutput(rawBuffer: string): FicsSoughtAd[] {
  const out: FicsSoughtAd[] = [];
  const seenIds = new Set<string>();
  for (const rawLine of rawBuffer.split(/\r?\n/)) {
    const ad = parseFicsSoughtLine(rawLine);
    if (!ad || seenIds.has(ad.adId)) continue;
    seenIds.add(ad.adId);
    out.push(ad);
  }
  return out;
}

export interface FicsStyle12State {
  fen: string;
  turn: 'w' | 'b';
  gameNumber: number;
  whiteName: string;
  blackName: string;
  myRelation: number;
  humanColor: 'w' | 'b' | null;
  initialMinutes: number;
  incrementSeconds: number;
  whiteClockMs: number;
  blackClockMs: number;
  fullMoveNumber: number;
  lastMove: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } | null;
  san: string | null;
}

export function parseFicsStyle12Line(rawLine: string): FicsStyle12State | null {
  const idx = rawLine.indexOf('<12> ');
  if (idx === -1) return null;
  const tokens = rawLine.slice(idx + 5).trim().split(/\s+/);
  if (tokens.length < 30) return null;

  const ranks = tokens.slice(0, 8);
  if (ranks.some((r) => r.length !== 8)) return null;
  const fenBoard = ranks
    .map((rank) => {
      let row = '';
      let empty = 0;
      for (const ch of rank) {
        if (ch === '-') {
          empty += 1;
        } else {
          if (empty > 0) {
            row += String(empty);
            empty = 0;
          }
          row += ch;
        }
      }
      if (empty > 0) row += String(empty);
      return row;
    })
    .join('/');

  const turnToken = tokens[8];
  const turn: 'w' | 'b' = turnToken === 'B' ? 'b' : 'w';
  const epFileIdx = parseInt(tokens[9], 10);
  const epSquare =
    epFileIdx >= 0 && epFileIdx <= 7
      ? `${BOARD_FILES[epFileIdx]}${turn === 'w' ? '6' : '3'}`
      : '-';

  const castling =
    `${tokens[10] === '1' ? 'K' : ''}${tokens[11] === '1' ? 'Q' : ''}${tokens[12] === '1' ? 'k' : ''}${tokens[13] === '1' ? 'q' : ''}` ||
    '-';

  const halfmove = Math.max(0, parseInt(tokens[14], 10) || 0);
  const gameNumber = parseInt(tokens[15], 10) || 0;
  const whiteName = tokens[16] || 'White';
  const blackName = tokens[17] || 'Black';
  const myRelation = parseInt(tokens[18], 10);
  const initialMinutes = Math.max(0, parseInt(tokens[19], 10) || 0);
  const incrementSeconds = Math.max(0, parseInt(tokens[20], 10) || 0);
  const whiteClockMs = Math.max(0, (parseInt(tokens[23], 10) || 0) * 1000);
  const blackClockMs = Math.max(0, (parseInt(tokens[24], 10) || 0) * 1000);
  const fullMoveNumber = Math.max(1, parseInt(tokens[25], 10) || 1);
  const verboseMove = tokens[26] || 'none';
  const sanToken = tokens[28] && tokens[28] !== 'none' ? tokens[28] : null;

  let humanColor: 'w' | 'b' | null = null;
  if (myRelation === 1) humanColor = turn;
  else if (myRelation === -1) humanColor = turn === 'w' ? 'b' : 'w';

  let lastMove: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } | null = null;
  const lowerVerbose = verboseMove.toLowerCase();
  const moverSide: 'w' | 'b' = turn === 'w' ? 'b' : 'w';
  if (lowerVerbose === 'o-o') {
    lastMove = moverSide === 'w' ? { from: 'e1', to: 'g1' } : { from: 'e8', to: 'g8' };
  } else if (lowerVerbose === 'o-o-o') {
    lastMove = moverSide === 'w' ? { from: 'e1', to: 'c1' } : { from: 'e8', to: 'c8' };
  } else {
    const coord = lowerVerbose.match(/([a-h][1-8])-([a-h][1-8])(?:=([qrbn]))?/);
    if (coord) {
      lastMove = {
        from: coord[1],
        to: coord[2],
        ...(coord[3] ? { promotion: coord[3] as 'q' | 'r' | 'b' | 'n' } : {}),
      };
    }
  }

  return {
    fen: `${fenBoard} ${turn} ${castling} ${epSquare} ${halfmove} ${fullMoveNumber}`,
    turn,
    gameNumber,
    whiteName,
    blackName,
    myRelation,
    humanColor,
    initialMinutes,
    incrementSeconds,
    whiteClockMs,
    blackClockMs,
    fullMoveNumber,
    lastMove,
    san: sanToken,
  };
}

export function parseFicsGameEndLine(
  rawLine: string,
): { winner: 'w' | 'b' | 'draw'; reason: string; aborted?: boolean } | null {
  const m = rawLine.match(/\{Game\s+\d+\s+\([^)]+\)\s+([^}]+)\}\s*(1-0|0-1|1\/2-1\/2|\*)?/i);
  if (!m) return null;
  const detail = m[1].trim();
  const resultToken = m[2];
  if (/abort|adjourn/i.test(detail) || resultToken === '*') {
    return { winner: 'draw', reason: detail, aborted: true };
  }
  if (resultToken === '1-0') return { winner: 'w', reason: detail };
  if (resultToken === '0-1') return { winner: 'b', reason: detail };
  if (resultToken === '1/2-1/2' || /drawn|stalemate|repetition|insufficient/i.test(detail)) {
    return { winner: 'draw', reason: detail };
  }
  if (/white\s+(checkmated|resigns|forfeits)/i.test(detail)) {
    return { winner: 'b', reason: detail };
  }
  if (/black\s+(checkmated|resigns|forfeits)/i.test(detail)) {
    return { winner: 'w', reason: detail };
  }
  return null;
}


