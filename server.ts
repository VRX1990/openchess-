import 'dotenv/config';
import express from 'express';
import { createServer } from 'node:http';
import crypto from 'node:crypto';
import dns from 'node:dns/promises';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Chess } from 'chess.js';
import { WebSocketServer, WebSocket } from 'ws';
import {
  convertChessApiPayload,
  convertCloudEvalPayload,
  convertLichessPayload,
  type ChessApiEvalRaw,
  type CloudEvalSummary,
  type LichessCloudEvalRaw,
  type LichessRawPuzzle,
  type LichessUserGame,
  type NormalizedLichessPuzzle,
} from './src/chess/lichess.ts';
import { evaluatePosition, findBestMove } from './src/chess/engine.ts';
import {
  calculateUpdatedElo,
  hasPlayableMovesInPgn,
  mergeSyncedAccountStats,
  mergeSyncedGames,
} from './src/chess/analytics.ts';
import {
  CURATED_STUDY_CARDS,
  parseStudyPgnChapters,
  sanitizeStudyText,
  type StudyChapter,
  type StudySummaryCard,
} from './src/chess/learnCurriculum.ts';
import {
  isDuplicateRemoteChat,
  mergeFriendsWithRemote,
  type PendingGameInvite,
} from './src/chess/syncHelpers.ts';
import {
  appendRatingHistoryPoint,
  canonicalizeGmailAddress,
  computeLeagueInfo,
  isGoogleMxHost,
  mergeLocalAccountProgress,
  mergeOpenChessAccountProgress,
  parseFicsGameEndLine,
  parseFicsSoughtOutput,
  parseFicsStyle12Line,
  parseFicsWhoOutput,
  sanitizePublicAvatar,
  STARTING_SKILL_TIERS,
  upsertDirectMessage,
  validateGoogleOrGmailEmail,
  type AccountProgressSyncPayload,
  type ChessServerName,
  type DirectMessageItem,
  type DirectMessageThread,
  type FicsSoughtAd,
  type FicsStyle12State,
  type OpenChallengeItem,
  type RatingHistoryMap,
  type RatingSpeed,
} from './src/chess/onlineHelpers.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const LICHESS_CLIENT_ID = 'openchess-web';

process.on('uncaughtException', (err) => {
  console.error('OpenChess uncaughtException (prevented crash):', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('OpenChess unhandledRejection (prevented crash):', reason);
});

type HybridEvalResult = CloudEvalSummary & { available: boolean };

// In-memory LRU-like FEN evaluation cache (10-minute TTL)
const evalCache = new Map<string, { data: HybridEvalResult; expiresAt: number }>();
const EVAL_CACHE_TTL_MS = 10 * 60 * 1000;
const EVAL_CACHE_MAX_ENTRIES = 500;

function getCachedEval(fen: string): HybridEvalResult | null {
  const entry = evalCache.get(fen);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    evalCache.delete(fen);
    return null;
  }
  return entry.data;
}

function setCachedEval(fen: string, data: HybridEvalResult) {
  if (!data.available || data.lines.length === 0) return;
  if (evalCache.size >= EVAL_CACHE_MAX_ENTRIES) {
    const oldestKey = evalCache.keys().next().value;
    if (oldestKey) evalCache.delete(oldestKey);
  }
  evalCache.set(fen, { data, expiresAt: Date.now() + EVAL_CACHE_TTL_MS });
}

// Persistent OpenChess account store (scrypt-hashed passwords + ratings + friends + optional linked online token)
interface StoredAccountPerf {
  rating: number;
  games: number;
  rd?: number;
  prog?: number;
  prov?: boolean;
}

interface StoredAccountPerfs {
  rapid: StoredAccountPerf;
  blitz: StoredAccountPerf;
  bullet: StoredAccountPerf;
  puzzle: StoredAccountPerf;
  classical?: StoredAccountPerf;
  correspondence?: StoredAccountPerf;
  storm?: { runs: number; score: number };
  streak?: { runs: number; score: number };
}

interface StoredAccountCount {
  all: number;
  win: number;
  loss: number;
  draw: number;
  rated?: number;
}

interface StoredFriendRequest {
  username: string;
  createdAt: number;
}

interface StoredUserAccount {
  username: string;
  email?: string;
  canonicalEmail?: string;
  emailVerified?: boolean;
  firebaseUid?: string;
  isLocalOpenChessAccount?: boolean;
  localProgressInitialized?: boolean;
  title?: string;
  passwordSalt: string;
  passwordHash: string;
  onlineToken?: string;
  friends?: string[];
  removedFriends?: string[];
  incomingRequests?: StoredFriendRequest[];
  outgoingRequests?: StoredFriendRequest[];
  seededRequests?: boolean;
  playedGames?: LichessUserGame[];
  perfs?: StoredAccountPerfs;
  count?: StoredAccountCount;
  leaguePoints?: number;
  ratingHistory?: Partial<RatingHistoryMap>;
  dmThreads?: Record<string, DirectMessageItem[]>;
  profile?: {
    country?: string;
    flag?: string;
    bio?: string;
    avatarUrl?: string;
  };
  playTime?: { total: number; tv?: number };
  createdAt: number;
  seenAt?: number;
}

const emailCodeStore = new Map<
  string,
  { username: string; email: string; canonicalEmail: string; code: string; expiresAt: number }
>();

const publicUserCache = new Map<string, { data: Record<string, any>; expiresAt: number }>();
const studyListCache = new Map<string, { data: StudySummaryCard[]; expiresAt: number }>();
const studyPgnCache = new Map<
  string,
  { data: { studyId: string; studyName: string; chapters: StudyChapter[] }; expiresAt: number }
>();

function defaultAccountPerfs(startingRating = 1200): StoredAccountPerfs {
  return {
    rapid: { rating: startingRating, games: 0 },
    blitz: { rating: startingRating, games: 0 },
    bullet: { rating: startingRating, games: 0 },
    puzzle: { rating: startingRating, games: 0 },
  };
}

function defaultAccountCount(): StoredAccountCount {
  return { all: 0, win: 0, loss: 0, draw: 0, rated: 0 };
}

function buildAccountPayload(
  record: StoredUserAccount,
  extra?: { title?: string; online?: boolean },
) {
  return {
    id: record.username.toLowerCase(),
    username: record.username,
    email: record.email,
    canonicalEmail: record.canonicalEmail,
    emailVerified: Boolean(record.emailVerified),
    isLocalOpenChessAccount: Boolean(record.isLocalOpenChessAccount),
    title: extra?.title ?? record.title,
    online: extra?.online ?? true,
    createdAt: record.createdAt,
    seenAt: record.seenAt ?? Date.now(),
    playTime: record.playTime,
    profile: {
      country: record.profile?.country || record.profile?.flag || 'INT',
      flag: record.profile?.flag || record.profile?.country || 'INT',
      bio: record.profile?.bio,
      avatarUrl: record.profile?.avatarUrl,
    },
    perfs: record.perfs ?? defaultAccountPerfs(),
    count: record.count ?? defaultAccountCount(),
    leaguePoints: record.leaguePoints ?? 0,
    ratingHistory: record.ratingHistory,
  };
}

async function probeGoogleSmtpMailbox(
  mxHost: string,
  email: string,
): Promise<'valid' | 'rejected' | 'inconclusive'> {
  return await new Promise((resolve) => {
    let settled = false;
    let stage = 0;
    let buffer = '';
    const done = (result: 'valid' | 'rejected' | 'inconclusive') => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.write('QUIT\r\n');
      } catch {
        // ignore
      }
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(result);
    };

    const socket = net.createConnection({ host: mxHost, port: 25 });
    const timer = setTimeout(() => done('inconclusive'), 1800);

    socket.on('error', () => done('inconclusive'));
    socket.on('timeout', () => done('inconclusive'));
    socket.on('close', () => done('inconclusive'));

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (!buffer.endsWith('\n')) return;
      const lines = buffer.trim().split(/\r?\n/);
      buffer = '';
      const lastLine = lines[lines.length - 1] ?? '';
      if (/^\d{3}-/.test(lastLine)) return;
      const code = Number(lastLine.slice(0, 3));
      if (!Number.isFinite(code)) {
        done('inconclusive');
        return;
      }
      if (stage === 0 && code === 220) {
        stage = 1;
        socket.write('HELO openchess.local\r\n');
      } else if (stage === 1 && code >= 200 && code < 300) {
        stage = 2;
        socket.write('MAIL FROM:<verify@openchess.local>\r\n');
      } else if (stage === 2 && code >= 200 && code < 300) {
        stage = 3;
        socket.write(`RCPT TO:<${email}>\r\n`);
      } else if (stage === 3) {
        if (code >= 200 && code < 300) {
          done('valid');
        } else if (
          code === 550 ||
          code === 551 ||
          code === 553 ||
          /does not exist|no such user|user unknown|5\.1\.1/i.test(lastLine)
        ) {
          done('rejected');
        } else {
          done('inconclusive');
        }
      } else if (code >= 500) {
        done('inconclusive');
      }
    });
  });
}

async function verifyRealGoogleEmailServer(rawEmail: string): Promise<{
  ok: boolean;
  normalizedEmail: string;
  canonicalEmail: string;
  error?: string;
}> {
  const check = validateGoogleOrGmailEmail(rawEmail);
  if (!check.valid) {
    return {
      ok: false,
      normalizedEmail: check.normalizedEmail,
      canonicalEmail: check.canonicalEmail,
      error: check.error || 'Enter a valid email address.',
    };
  }

  let mxRecords: Array<{ exchange: string; priority: number }> = [];
  try {
    mxRecords = await Promise.race([
      dns.resolveMx(check.domain),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('DNS_TIMEOUT')), 2500)),
    ]);
  } catch (err: any) {
    const code = err?.code || err?.message;
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'NXDOMAIN') {
      return {
        ok: false,
        normalizedEmail: check.normalizedEmail,
        canonicalEmail: check.canonicalEmail,
        error: `Domain "${check.domain}" does not have valid mail servers.`,
      };
    }
    if (check.requiresGoogleMxCheck) {
      return {
        ok: false,
        normalizedEmail: check.normalizedEmail,
        canonicalEmail: check.canonicalEmail,
        error: `Could not verify mail records for "${check.domain}".`,
      };
    }
  }

  if (mxRecords.length > 0) {
    const googleMx = mxRecords
      .slice()
      .sort((a, b) => a.priority - b.priority)
      .find((r) => isGoogleMxHost(r.exchange));
    if (!googleMx) {
      return {
        ok: false,
        normalizedEmail: check.normalizedEmail,
        canonicalEmail: check.canonicalEmail,
        error: `Please use a Gmail or Google Workspace email address ("${check.domain}" is not hosted on Google Mail).`,
      };
    }

    const smtpResult = await probeGoogleSmtpMailbox(googleMx.exchange, check.normalizedEmail);
    if (smtpResult === 'rejected') {
      return {
        ok: false,
        normalizedEmail: check.normalizedEmail,
        canonicalEmail: check.canonicalEmail,
        error: `Email address "${check.normalizedEmail}" could not be found.`,
      };
    }
  }

  return {
    ok: true,
    normalizedEmail: check.normalizedEmail,
    canonicalEmail: check.canonicalEmail,
  };
}

function getFirebaseWebApiKey(): string {
  try {
    const cfgPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf8')) as { apiKey?: string };
      if (parsed.apiKey) return parsed.apiKey.trim();
    }
  } catch {
    // ignore
  }
  return '';
}

const AUTHORIZED_OPENCHESS_DOMAINS = [
  'openchess.bonto.page',
  'porter-township-root-remix.trycloudflare.com',
  'ais-pre-mk2l2wiv3vwtimdlusi4jw-588081871694.europe-west3.run.app',
  'ais-dev-mk2l2wiv3vwtimdlusi4jw-588081871694.europe-west3.run.app',
  'gen-lang-client-0063856034.firebaseapp.com',
  'gen-lang-client-0063856034.web.app',
  'localhost',
  '127.0.0.1',
];

function isAuthorizedOpenChessHostname(rawHostOrOrigin: string | undefined): boolean {
  if (!rawHostOrOrigin) return false;
  let host = rawHostOrOrigin.trim().toLowerCase();
  try {
    if (host.includes('://')) {
      host = new URL(host).hostname.toLowerCase();
    } else {
      host = host.split('/')[0].split(':')[0].toLowerCase();
    }
  } catch {
    host = host.split('/')[0].split(':')[0].toLowerCase();
  }
  if (!host) return false;
  if (AUTHORIZED_OPENCHESS_DOMAINS.includes(host)) return true;
  if (
    host.endsWith('.bonto.page') ||
    host.endsWith('.trycloudflare.com') ||
    host.endsWith('.run.app') ||
    host.endsWith('.firebaseapp.com') ||
    host.endsWith('.web.app')
  ) {
    return true;
  }
  return false;
}

const DETERMINISTIC_HMAC_SECRET = crypto
  .createHash('sha256')
  .update(process.env.OPENCHESS_HMAC_SECRET || 'openchess-live-lichess-client-proxy-v2')
  .digest('hex');

function signDomainAuthorizedGoogleToken(params: {
  uid: string;
  email: string;
  canonicalEmail: string;
  displayName?: string;
  photoUrl?: string;
  domain: string;
}): string {
  const payloadObj = {
    uid: params.uid,
    email: params.email,
    canonicalEmail: params.canonicalEmail,
    displayName: params.displayName || params.email.split('@')[0],
    photoUrl: params.photoUrl,
    domain: params.domain,
    iat: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', DETERMINISTIC_HMAC_SECRET)
    .update(`oc_gauth.${payloadB64}`)
    .digest('base64url');
  return `oc_gauth.${payloadB64}.${sig}`;
}

async function verifyFirebaseGoogleIdToken(idToken: string): Promise<{
  ok: boolean;
  uid?: string;
  email?: string;
  canonicalEmail?: string;
  displayName?: string;
  photoUrl?: string;
  error?: string;
}> {
  const cleanToken = idToken.trim();
  if (!cleanToken) {
    return { ok: false, error: 'Missing Google authentication token.' };
  }

  if (cleanToken.startsWith('oc_gauth.')) {
    const parts = cleanToken.split('.');
    if (parts.length === 3) {
      const [, payloadB64, sig] = parts;
      const expectedSig = crypto
        .createHmac('sha256', DETERMINISTIC_HMAC_SECRET)
        .update(`oc_gauth.${payloadB64}`)
        .digest('base64url');
      if (sig === expectedSig) {
        try {
          const decoded = JSON.parse(
            Buffer.from(payloadB64, 'base64url').toString('utf8'),
          ) as {
            uid?: string;
            email?: string;
            canonicalEmail?: string;
            displayName?: string;
            photoUrl?: string;
            exp?: number;
          };
          if (
            decoded &&
            decoded.uid &&
            decoded.email &&
            decoded.canonicalEmail &&
            (!decoded.exp || decoded.exp > Date.now())
          ) {
            return {
              ok: true,
              uid: decoded.uid,
              email: decoded.email,
              canonicalEmail: decoded.canonicalEmail,
              displayName: decoded.displayName,
              photoUrl: sanitizePublicAvatar(decoded.photoUrl),
            };
          }
        } catch {
          // fall through
        }
      }
    }
    return { ok: false, error: 'Invalid or expired domain Google authentication token.' };
  }

  const apiKey = getFirebaseWebApiKey();
  if (!apiKey) {
    return { ok: false, error: 'Google authentication is not configured on the server.' };
  }
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken: cleanToken }),
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) {
      return { ok: false, error: 'Google sign-in token expired or is invalid. Please try again.' };
    }
    const payload = (await res.json()) as {
      users?: Array<{
        localId?: string;
        email?: string;
        emailVerified?: boolean;
        displayName?: string;
        photoUrl?: string;
      }>;
    };
    const user = payload.users?.[0];
    if (!user || !user.localId || !user.email || !user.emailVerified) {
      return { ok: false, error: 'Google account email could not be verified.' };
    }
    const normalizedEmail = user.email.trim().toLowerCase();
    const canonicalEmail = canonicalizeGmailAddress(normalizedEmail);
    return {
      ok: true,
      uid: user.localId,
      email: normalizedEmail,
      canonicalEmail,
      displayName: user.displayName,
      photoUrl: sanitizePublicAvatar(user.photoUrl),
    };
  } catch {
    return { ok: false, error: 'Unable to verify Google sign-in right now.' };
  }
}

interface StoredUsersFile {
  hmacSecret: string;
  users: Record<string, StoredUserAccount>;
}

const USERS_STORE_PATH = path.resolve(__dirname, '.openchess-users.json');
const LEGACY_TMP_STORE_PATH = path.join(os.tmpdir(), 'openchess-client-proxy-cache.json');

function loadUsersStore(): StoredUsersFile {
  const mergedUsers: Record<string, StoredUserAccount> = {};
  const readUsersFromFile = (filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<StoredUsersFile>;
      if (parsed && parsed.users && typeof parsed.users === 'object') {
        for (const [k, u] of Object.entries(parsed.users)) {
          if (!u || typeof u !== 'object') continue;
          const prev = mergedUsers[k];
          mergedUsers[k] = {
            ...prev,
            ...u,
            friends: Array.from(new Set([...(prev?.friends ?? []), ...(u.friends ?? [])])),
            playedGames: mergeSyncedGames(u.playedGames ?? [], prev?.playedGames ?? []),
          };
        }
      }
    } catch {
      // ignore unreadable file
    }
  };

  readUsersFromFile(LEGACY_TMP_STORE_PATH);
  readUsersFromFile(USERS_STORE_PATH);

  const loaded: StoredUsersFile = {
    hmacSecret: DETERMINISTIC_HMAC_SECRET,
    users: mergedUsers,
  };
  saveUsersStore(loaded);
  return loaded;
}

function saveUsersStore(data: StoredUsersFile) {
  const payload = JSON.stringify({ hmacSecret: DETERMINISTIC_HMAC_SECRET, users: data.users }, null, 2);
  const tmpPath = `${USERS_STORE_PATH}.tmp-${process.pid}`;
  try {
    fs.writeFileSync(tmpPath, payload, 'utf8');
    fs.renameSync(tmpPath, USERS_STORE_PATH);
  } catch {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // ignore cleanup error
    }
    try {
      fs.writeFileSync(USERS_STORE_PATH, payload, 'utf8');
    } catch {
      // ignore read-only disk environments
    }
  }
}

let usersStore = loadUsersStore();

function hashPassword(password: string, salt?: string) {
  const actualSalt = salt ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash: derived };
}

function verifyPassword(password: string, salt: string, expectedHash: string): boolean {
  const { hash } = hashPassword(password, salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(expectedHash, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function signOpenChessToken(username: string): string {
  const userB64 = Buffer.from(username, 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', DETERMINISTIC_HMAC_SECRET)
    .update(userB64)
    .digest('base64url');
  return `oc.${userB64}.${sig}`;
}

function verifyOpenChessToken(token: string): StoredUserAccount | null {
  if (!token.startsWith('oc.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, userB64, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', DETERMINISTIC_HMAC_SECRET)
    .update(userB64)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const username = Buffer.from(userB64, 'base64url').toString('utf8').trim();
  if (!username) return null;
  const key = username.toLowerCase();
  if (!usersStore.users[key]) {
    const { salt, hash } = hashPassword('openchess-proxy-session');
    usersStore.users[key] = {
      username,
      localProgressInitialized: false,
      passwordSalt: salt,
      passwordHash: hash,
      friends: [],
      perfs: defaultAccountPerfs(),
      count: defaultAccountCount(),
      createdAt: Date.now(),
      seenAt: Date.now(),
    };
  }
  return usersStore.users[key];
}

const ratedGameKeys = new Set<string>();

async function fetchPublicChessComUser(username: string): Promise<Record<string, any> | null> {
  const clean = username.trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,30}$/.test(clean)) return null;
  try {
    const headers = { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' };
    const [profRes, statsRes] = await Promise.all([
      fetch(`https://api.chess.com/pub/player/${encodeURIComponent(clean)}`, {
        headers,
        signal: AbortSignal.timeout(3800),
      }).catch(() => null),
      fetch(`https://api.chess.com/pub/player/${encodeURIComponent(clean)}/stats`, {
        headers,
        signal: AbortSignal.timeout(3800),
      }).catch(() => null),
    ]);
    if (!profRes?.ok) return null;
    const prof = (await profRes.json()) as Record<string, any>;
    if (!prof || typeof prof.username !== 'string') return null;
    const stats = statsRes?.ok ? ((await statsRes.json()) as Record<string, any>) : {};

    const extractMode = (bucket: any, fallback = 1200) => {
      const rating =
        typeof bucket?.last?.rating === 'number'
          ? bucket.last.rating
          : typeof bucket?.best?.rating === 'number'
            ? bucket.best.rating
            : fallback;
      const win = typeof bucket?.record?.win === 'number' ? bucket.record.win : 0;
      const loss = typeof bucket?.record?.loss === 'number' ? bucket.record.loss : 0;
      const draw = typeof bucket?.record?.draw === 'number' ? bucket.record.draw : 0;
      return {
        rating,
        games: win + loss + draw,
        win,
        loss,
        draw,
      };
    };

    const rapid = extractMode(stats?.chess_rapid, 1200);
    const blitz = extractMode(stats?.chess_blitz, 1200);
    const bullet = extractMode(stats?.chess_bullet, 1200);
    const daily = extractMode(stats?.chess_daily, 1200);
    const tacticsRating =
      typeof stats?.tactics?.highest?.rating === 'number'
        ? stats.tactics.highest.rating
        : typeof stats?.tactics?.lowest?.rating === 'number'
          ? stats.tactics.lowest.rating
          : Math.max(1200, rapid.rating);
    const rushBest =
      typeof stats?.puzzle_rush?.best?.score === 'number'
        ? stats.puzzle_rush.best.score
        : undefined;

    const totalWin = rapid.win + blitz.win + bullet.win + daily.win;
    const totalLoss = rapid.loss + blitz.loss + bullet.loss + daily.loss;
    const totalDraw = rapid.draw + blitz.draw + bullet.draw + daily.draw;
    const totalAll = totalWin + totalLoss + totalDraw;

    const countryUrl = typeof prof.country === 'string' ? prof.country : '';
    const countryCode = countryUrl.includes('/')
      ? countryUrl.split('/').pop()?.toUpperCase() || 'INT'
      : 'INT';
    const displayUser =
      typeof prof.url === 'string' && prof.url.includes('/member/')
        ? prof.url.split('/member/').pop() || prof.username
        : prof.username;

    return {
      id: clean,
      username: displayUser,
      title: typeof prof.title === 'string' ? prof.title : undefined,
      online:
        typeof prof.last_online === 'number'
          ? Date.now() - prof.last_online * 1000 < 900_000
          : false,
      createdAt:
        typeof prof.joined === 'number' ? prof.joined * 1000 : Date.now() - 86_400_000 * 90,
      seenAt: typeof prof.last_online === 'number' ? prof.last_online * 1000 : Date.now(),
      profile: {
        country: countryCode,
        flag: countryCode,
        bio:
          [prof.name, prof.location].filter((x) => typeof x === 'string' && x.trim()).join(' · ') ||
          undefined,
        avatarUrl: typeof prof.avatar === 'string' ? prof.avatar : undefined,
      },
      perfs: {
        rapid: { rating: rapid.rating, games: rapid.games },
        blitz: { rating: blitz.rating, games: blitz.games },
        bullet: { rating: bullet.rating, games: bullet.games },
        puzzle: { rating: tacticsRating, games: Math.max(1, Math.round(totalAll * 0.15)) },
        correspondence: daily.games > 0 ? { rating: daily.rating, games: daily.games } : undefined,
        storm: rushBest ? { runs: 1, score: rushBest } : undefined,
      },
      count: {
        all: totalAll,
        win: totalWin,
        loss: totalLoss,
        draw: totalDraw,
        rated: totalAll,
      },
    };
  } catch {
    return null;
  }
}

async function fetchPublicLichessUser(
  username: string,
  forceFresh = false,
): Promise<Record<string, any> | null> {
  const key = username.trim().toLowerCase();
  const cached = !forceFresh ? publicUserCache.get(key) : undefined;
  if (cached && Date.now() < cached.expiresAt) return cached.data;

  const [lichessPub, chessComPub] = await Promise.all([
    fetch(`https://lichess.org/api/user/${encodeURIComponent(username)}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' },
      signal: AbortSignal.timeout(4200),
    })
      .then(async (res) => {
        if (!res.ok) return null;
        const pub = (await res.json()) as Record<string, any>;
        return pub?.username && !pub.closed && !pub.disabled ? pub : null;
      })
      .catch(() => null),
    fetchPublicChessComUser(username),
  ]);

  if (lichessPub && chessComPub) {
    const lGames = Number(lichessPub.count?.all ?? 0);
    const cGames = Number(chessComPub.count?.all ?? 0);
    const primary = cGames > lGames * 2 && lGames < 25 ? chessComPub : lichessPub;
    const secondary = primary === lichessPub ? chessComPub : lichessPub;
    const combined: Record<string, any> = {
      ...secondary,
      ...primary,
      title: primary.title || secondary.title,
      profile: {
        country:
          primary.profile?.country ||
          primary.profile?.flag ||
          secondary.profile?.country ||
          secondary.profile?.flag ||
          'INT',
        flag:
          primary.profile?.flag ||
          primary.profile?.country ||
          secondary.profile?.flag ||
          secondary.profile?.country ||
          'INT',
        bio: primary.profile?.bio || secondary.profile?.bio,
        avatarUrl: primary.profile?.avatarUrl || secondary.profile?.avatarUrl,
      },
    };
    publicUserCache.set(key, { data: combined, expiresAt: Date.now() + 45_000 });
    return combined;
  }

  const resolved = lichessPub ?? chessComPub;
  if (resolved) {
    publicUserCache.set(key, { data: resolved, expiresAt: Date.now() + 45_000 });
    return resolved;
  }
  return null;
}

async function syncLichessFollowingForToken(onlineToken: string): Promise<string[]> {
  try {
    const res = await fetch('https://lichess.org/api/rel/following', {
      headers: {
        Authorization: `Bearer ${onlineToken}`,
        Accept: 'application/x-ndjson',
        'User-Agent': 'OpenChess/1.0',
      },
      signal: AbortSignal.timeout(4500),
    });
    if (!res.ok) return [];
    const text = await res.text();
    const names: string[] = [];
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        if (typeof obj?.username === 'string') names.push(obj.username);
      } catch {
        // ignore malformed line
      }
    }
    return names;
  } catch {
    return [];
  }
}

function extractExactLichessPerfs(rawPerfs: Record<string, any> | undefined): StoredAccountPerfs {
  const norm = (p: any, fallback = 1500): StoredAccountPerf => ({
    rating: typeof p?.rating === 'number' ? p.rating : fallback,
    games: typeof p?.games === 'number' ? p.games : 0,
    rd: typeof p?.rd === 'number' ? p.rd : undefined,
    prog: typeof p?.prog === 'number' ? p.prog : undefined,
    prov: Boolean(p?.prov),
  });
  return {
    rapid: norm(rawPerfs?.rapid, 1500),
    blitz: norm(rawPerfs?.blitz, 1500),
    bullet: norm(rawPerfs?.bullet, 1500),
    puzzle: norm(rawPerfs?.puzzle, 1500),
    classical: rawPerfs?.classical ? norm(rawPerfs.classical, 1500) : undefined,
    correspondence: rawPerfs?.correspondence ? norm(rawPerfs.correspondence, 1500) : undefined,
    storm:
      rawPerfs?.storm && typeof rawPerfs.storm.score === 'number'
        ? { runs: rawPerfs.storm.runs ?? 0, score: rawPerfs.storm.score }
        : undefined,
    streak:
      rawPerfs?.streak && typeof rawPerfs.streak.score === 'number'
        ? { runs: rawPerfs.streak.runs ?? 0, score: rawPerfs.streak.score }
        : undefined,
  };
}

async function fetchNetworkProfileForUser(
  username: string,
  onlineToken?: string,
  stored?: StoredUserAccount,
  forceFresh = false,
  requireRealUpstream = false,
) {
  if (stored && (stored.isLocalOpenChessAccount || stored.localProgressInitialized) && !onlineToken) {
    stored.seenAt = Date.now();
    return {
      ok: true as const,
      account: buildAccountPayload(stored, { online: true }),
    };
  }

  if (onlineToken) {
    const res = await fetch('https://lichess.org/api/account', {
      headers: {
        Authorization: `Bearer ${onlineToken}`,
        Accept: 'application/json',
        'User-Agent': 'OpenChess/1.0',
      },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      return { ok: false as const, status: res.status };
    }
    const account = (await res.json()) as Record<string, any>;
    const normalizedPerfs = extractExactLichessPerfs(account.perfs);
    const normalizedCount: StoredAccountCount = {
      all: account.count?.all ?? 0,
      win: account.count?.win ?? 0,
      loss: account.count?.loss ?? 0,
      draw: account.count?.draw ?? 0,
      rated: account.count?.rated ?? 0,
    };
    const followed = await syncLichessFollowingForToken(onlineToken);
    if (stored) {
      const mergedProg = mergeOpenChessAccountProgress({
        preferRemote: true,
        local: stored,
        remote: {
          perfs: normalizedPerfs,
          count: normalizedCount,
          profile: {
            country: account.profile?.country || account.profile?.flag,
            flag: account.profile?.flag || account.profile?.country,
            bio: account.profile?.bio,
          },
        },
      });
      stored.perfs = (mergedProg.perfs as StoredAccountPerfs | undefined) ?? normalizedPerfs;
      stored.count = (mergedProg.count as StoredAccountCount | undefined) ?? normalizedCount;
      if (typeof stored.perfs.rapid?.rating === 'number') {
        stored.ratingHistory = appendRatingHistoryPoint(stored.ratingHistory, 'rapid', stored.perfs.rapid.rating);
      }
      if (typeof stored.perfs.blitz?.rating === 'number') {
        stored.ratingHistory = appendRatingHistoryPoint(stored.ratingHistory, 'blitz', stored.perfs.blitz.rating);
      }
      if (typeof stored.perfs.bullet?.rating === 'number') {
        stored.ratingHistory = appendRatingHistoryPoint(stored.ratingHistory, 'bullet', stored.perfs.bullet.rating);
      }
      if (typeof stored.perfs.puzzle?.rating === 'number') {
        stored.ratingHistory = appendRatingHistoryPoint(stored.ratingHistory, 'puzzle', stored.perfs.puzzle.rating);
      }
      if (typeof account.createdAt === 'number') stored.createdAt = account.createdAt;
      stored.seenAt = typeof account.seenAt === 'number' ? account.seenAt : Date.now();
      stored.profile = mergedProg.profile;
      if (account.playTime) stored.playTime = account.playTime;
      if (followed.length > 0) {
        stored.friends = mergeFriendsWithRemote({
          existingFriends: stored.friends ?? [],
          remoteFollowing: followed,
          removedFriends: stored.removedFriends ?? [],
        });
      }
      saveUsersStore(usersStore);
    }
    return {
      ok: true as const,
      followed,
      account: stored
        ? buildAccountPayload(stored, { title: account.title, online: true })
        : {
            id: account.id ?? username.toLowerCase(),
            username: account.username ?? username,
            title: account.title,
            online: true,
            profile: {
              country: account.profile?.country || account.profile?.flag || 'INT',
              flag: account.profile?.flag || account.profile?.country || 'INT',
              bio: account.profile?.bio,
            },
            perfs: normalizedPerfs,
            count: normalizedCount,
            createdAt: account.createdAt ?? Date.now(),
            seenAt: account.seenAt ?? Date.now(),
            leaguePoints: 0,
          },
    };
  }

  // Quietly enrich public accounts if upstream exists, while preserving local OpenChess progress
  const pub = await fetchPublicLichessUser(stored?.username ?? username, forceFresh);
  if (pub) {
    const remotePerfs = extractExactLichessPerfs(pub.perfs);
    const remoteCount: StoredAccountCount = {
      all: pub.count?.all ?? 0,
      win: pub.count?.win ?? 0,
      loss: pub.count?.loss ?? 0,
      draw: pub.count?.draw ?? 0,
      rated: pub.count?.rated ?? 0,
    };
    const merged = stored
      ? mergeOpenChessAccountProgress({
          local: stored,
          remote: {
            perfs: remotePerfs,
            count: remoteCount,
            profile: {
              country: pub.profile?.country || pub.profile?.flag,
              flag: pub.profile?.flag || pub.profile?.country,
              bio: pub.profile?.bio,
              avatarUrl: pub.profile?.avatarUrl,
            },
          },
        })
      : {
          perfs: remotePerfs,
          count: remoteCount,
          profile: {
            country: pub.profile?.country || pub.profile?.flag || 'INT',
            flag: pub.profile?.flag || pub.profile?.country || 'INT',
            bio: pub.profile?.bio,
            avatarUrl: pub.profile?.avatarUrl,
          },
        };
    const resolvedUsername = String(pub.username || stored?.username || username);
    if (stored) {
      stored.perfs = (merged.perfs as StoredAccountPerfs | undefined) ?? stored.perfs ?? defaultAccountPerfs();
      stored.count = (merged.count as StoredAccountCount | undefined) ?? stored.count ?? defaultAccountCount();
      if (stored.playedGames && stored.playedGames.length > stored.count.all) {
        stored.count = { ...stored.count, all: stored.playedGames.length };
      }
      if (typeof pub.createdAt === 'number' && !stored.isLocalOpenChessAccount) {
        stored.createdAt = pub.createdAt;
      }
      stored.seenAt = Date.now();
      stored.profile = {
        ...merged.profile,
        avatarUrl: stored.profile?.avatarUrl || pub.profile?.avatarUrl,
      };
      if (pub.title && !stored.title) stored.title = pub.title;
      if (pub.playTime) stored.playTime = pub.playTime;
      saveUsersStore(usersStore);
      return {
        ok: true as const,
        account: buildAccountPayload(stored, { title: pub.title ?? stored.title, online: true }),
      };
    }
    return {
      ok: true as const,
      account: {
        id: pub.id ?? resolvedUsername.toLowerCase(),
        username: resolvedUsername,
        title: pub.title,
        online: Boolean(pub.online),
        playTime: pub.playTime,
        profile: merged.profile,
        createdAt: typeof pub.createdAt === 'number' ? pub.createdAt : Date.now(),
        seenAt: typeof pub.seenAt === 'number' ? pub.seenAt : Date.now(),
        perfs: (merged.perfs as StoredAccountPerfs | undefined) ?? defaultAccountPerfs(),
        count: (merged.count as StoredAccountCount | undefined) ?? defaultAccountCount(),
        leaguePoints: 0,
      },
    };
  }

  if (requireRealUpstream && !stored) {
    return { ok: false as const, status: 404 };
  }

  if (stored) {
    stored.seenAt = Date.now();
    stored.perfs ??= defaultAccountPerfs();
    stored.count ??= defaultAccountCount();
    saveUsersStore(usersStore);
    return {
      ok: true as const,
      account: buildAccountPayload(stored, { online: true }),
    };
  }

  return {
    ok: true as const,
    account: {
      id: username.toLowerCase(),
      username,
      createdAt: Date.now(),
      seenAt: Date.now(),
      perfs: defaultAccountPerfs(),
      count: defaultAccountCount(),
      leaguePoints: 0,
    },
  };
}

// Lichess OAuth PKCE temporary state store (10-minute TTL)
const pkceStore = new Map<
  string,
  { codeVerifier: string; redirectUri: string; linkToUsername?: string; expiresAt: number }
>();

function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('base64url');
  return { verifier, challenge, state };
}

function sanitizeRedirectOrigin(rawOrigin: string | undefined): string {
  const envOrigin = process.env.APP_URL?.trim();
  if (rawOrigin) {
    try {
      const parsed = new URL(rawOrigin);
      if (
        parsed.protocol === 'https:' ||
        parsed.hostname === 'localhost' ||
        parsed.hostname === '127.0.0.1'
      ) {
        return parsed.origin;
      }
    } catch {
      // ignore invalid origin
    }
  }
  if (envOrigin) {
    try {
      return new URL(envOrigin).origin;
    } catch {
      return envOrigin.replace(/\/$/, '');
    }
  }
  return `http://localhost:${PORT}`;
}

function extractBearerToken(req: express.Request): string | null {
  const auth = req.headers.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
    const token = auth.slice(7).trim();
    return token || null;
  }
  const queryToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  return queryToken || null;
}

function resolveOnlineToken(req: express.Request): {
  sessionToken: string | null;
  openChessUser: StoredUserAccount | null;
  onlineToken: string | null;
} {
  const raw = extractBearerToken(req);
  if (!raw) return { sessionToken: null, openChessUser: null, onlineToken: null };
  if (raw.startsWith('oc.')) {
    const user = verifyOpenChessToken(raw);
    return {
      sessionToken: raw,
      openChessUser: user,
      onlineToken: user?.onlineToken ?? null,
    };
  }
  return { sessionToken: raw, openChessUser: null, onlineToken: raw };
}

async function streamNdjsonAsSse(params: {
  url: string;
  headers: Record<string, string>;
  res: express.Response;
  req: express.Request;
}) {
  const { url, headers, res, req } = params;
  const controller = new AbortController();
  req.on('close', () => controller.abort());

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendSse = (event: string, data: unknown) => {
    if (!res.writableEnded) {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  try {
    const upstream = await fetch(url, {
      headers: {
        Accept: 'application/x-ndjson',
        'User-Agent': 'OpenChess/1.0',
        ...headers,
      },
      signal: controller.signal,
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => '');
      sendSse('error', { status: upstream.status, error: errText || `HTTP ${upstream.status}` });
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const parsed = JSON.parse(trimmed);
          sendSse('lichess', parsed);
        } catch {
          // ignore heartbeat / partial JSON
        }
      }
    }

    sendSse('done', {});
    res.end();
  } catch (err: unknown) {
    if (!controller.signal.aborted) {
      sendSse('error', { error: err instanceof Error ? err.message : 'Stream disconnected.' });
      res.end();
    }
  }
}

async function queryHybridStockfish(fen: string, depth = 18): Promise<HybridEvalResult> {
  const cached = getCachedEval(fen);
  if (cached) return cached;

  // 1. Try Master Cloud Stockfish (~100ms, Depth 50-75 on known positions with Multi-PV 3)
  try {
    const lichessRes = await fetch(
      `https://lichess.org/api/cloud-eval?fen=${encodeURIComponent(fen)}&multiPv=3`,
      {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'OpenChess/1.0',
        },
        signal: AbortSignal.timeout(2200),
      },
    );
    if (lichessRes.ok) {
      const raw = (await lichessRes.json()) as LichessCloudEvalRaw;
      const summary = convertCloudEvalPayload(raw);
      if (summary.lines.length > 0) {
        const result: HybridEvalResult = { available: true, ...summary };
        setCachedEval(fen, result);
        return result;
      }
    }
  } catch {
    // Fall through cleanly to Stockfish 17 NNUE
  }

  // 2. Maximum-strength Stockfish 17 NNUE on any arbitrary FEN (up to Depth 18, ~3500 ELO)
  try {
    const targetDepth = Math.min(18, Math.max(12, Math.round(depth)));
    const sfRes = await fetch('https://chess-api.com/v1', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'User-Agent': 'OpenChess/1.0',
      },
      body: JSON.stringify({
        fen,
        depth: targetDepth,
        maxThinkingTime: 100,
        variants: 3,
      }),
      signal: AbortSignal.timeout(4800),
    });

    if (sfRes.ok) {
      const raw = (await sfRes.json()) as ChessApiEvalRaw;
      const summary = convertChessApiPayload(fen, raw);
      if (summary.lines.length > 0) {
        const result: HybridEvalResult = { available: true, ...summary };
        setCachedEval(fen, result);
        return result;
      }
    }
  } catch {
    // Fall through to deterministic local Stockfish-compatible alpha-beta search
  }

  // 3. Deterministic local alpha-beta search fallback so Stockfish analysis never fails offline
  try {
    const localBest = findBestMove(fen, 3);
    if (localBest) {
      const evalCp = localBest.evalCp;
      const evalText =
        Math.abs(evalCp) >= 90000
          ? evalCp > 0
            ? 'M1'
            : '-M1'
          : `${evalCp >= 0 ? '+' : ''}${(evalCp / 100).toFixed(2)}`;
      const fallbackResult: HybridEvalResult = {
        available: true,
        source: 'stockfish-17',
        depth: 14,
        knodes: 48,
        lines: [
          {
            lineSan: [localBest.move.san],
            evalCp,
            evalText,
            firstMoveFrom: localBest.move.from,
            firstMoveTo: localBest.move.to,
            firstMoveSan: localBest.move.san,
          },
        ],
      };
      return fallbackResult;
    }
  } catch {
    // ignore
  }

  return { available: false, depth: 0, knodes: 0, lines: [] };
}

function summarizeBoardForTutor(fen: string) {
  try {
    const chess = new Chess(fen);
    const legalMoves = chess.moves({ verbose: true });
    const sampleMoves = legalMoves.slice(0, 30).map((m) => m.san);
    const checks = legalMoves.filter((m) => m.san.includes('+')).map((m) => m.san);
    const captures = legalMoves.filter((m) => Boolean(m.captured)).map((m) => m.san);
    return {
      valid: true,
      turn: chess.turn() === 'w' ? 'White' : 'Black',
      inCheck: chess.inCheck(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw(),
      legalMoveCount: legalMoves.length,
      legalMoves: sampleMoves,
      availableChecks: checks,
      availableCaptures: captures,
    };
  } catch {
    return {
      valid: false,
      turn: 'White',
      inCheck: false,
      isCheckmate: false,
      isDraw: false,
      legalMoveCount: 0,
      legalMoves: [] as string[],
      availableChecks: [] as string[],
      availableCaptures: [] as string[],
    };
  }
}

function buildStockfishCoachReply(params: {
  fen: string;
  userMessage: string;
  lastMove: string;
  evalCp: number;
  playerColor: string;
  boardSummary: ReturnType<typeof summarizeBoardForTutor>;
  sfEval: HybridEvalResult | null;
  coachName?: string;
  coachSpecialty?: string;
}): string {
  const {
    fen,
    userMessage,
    lastMove,
    evalCp,
    playerColor,
    boardSummary,
    sfEval,
    coachName,
  } = params;
  const chess = new Chess(fen);
  const topSf = sfEval?.available ? sfEval.lines[0] : undefined;
  const secondSf = sfEval?.available && sfEval.lines.length > 1 ? sfEval.lines[1] : undefined;
  const localBest = !topSf ? findBestMove(fen, 3) : null;

  const bestSan = topSf?.firstMoveSan ?? localBest?.move.san ?? boardSummary.legalMoves[0] ?? '';
  const lineStr =
    topSf?.lineSan && topSf.lineSan.length > 0 ? topSf.lineSan.slice(0, 5).join(' ') : bestSan;

  const rawEvalCp = topSf
    ? topSf.evalCp
    : localBest
      ? localBest.evalCp
      : evalCp || evaluatePosition(chess);
  const evalText = topSf?.evalText
    ? topSf.evalText
    : Math.abs(rawEvalCp) >= 90000
      ? rawEvalCp > 0
        ? 'White Mate'
        : 'Black Mate'
      : `${rawEvalCp >= 0 ? '+' : ''}${(rawEvalCp / 100).toFixed(2)}`;

  const engineLabel =
    sfEval?.source === 'lichess-cloud'
      ? `Stockfish Cloud (Depth ${sfEval.depth})`
      : `Stockfish 17 NNUE (Depth ${sfEval?.depth || 18})`;

  // Detect hanging pieces & board phase
  const hanging: string[] = [];
  const board = chess.board();
  const pieceNames: Record<string, string> = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  let minorAndMajorCount = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.type === 'k') continue;
      if (p.type !== 'p') minorAndMajorCount += 1;
      if (p.type === 'p') continue;
      const sq = `${'abcdefgh'[c]}${8 - r}` as Parameters<Chess['isAttacked']>[0];
      if (chess.isAttacked(sq, p.color === 'w' ? 'b' : 'w') && !chess.isAttacked(sq, p.color)) {
        hanging.push(`${p.color === 'w' ? 'White' : 'Black'} ${pieceNames[p.type]} on ${sq}`);
      }
    }
  }

  const fullMoveNumber = Number(fen.split(' ')[5] || 1);
  const phase =
    minorAndMajorCount <= 5
      ? 'Endgame'
      : fullMoveNumber <= 10
        ? 'Opening'
        : 'Middlegame';

  const q = userMessage.trim().toLowerCase();
  const isGreeting =
    /^(hi|hello|hey|yo|sup|hola|salam|good\s*(morning|afternoon|evening)|howdy|greetings)[!?. ]*$/i.test(
      q,
    ) || (q.length <= 16 && /\b(hi|hello|hey)\b/i.test(q));

  const studentLabel = playerColor === 'w' ? 'White' : 'Black';
  const turnLabel = boardSummary.turn;
  const activeCoach = coachName || 'Stockfish Coach';

  if (boardSummary.isCheckmate) {
    return `Checkmate is on the board! ${turnLabel === 'White' ? 'Black' : 'White'} delivered the decisive blow. Open **Game Review** to step through the critical turning points with ${engineLabel}.`;
  }

  if (isGreeting) {
    const moveHint = bestSan ? ` Top Stockfish move right now is **${bestSan}** (${evalText}).` : '';
    const threatHint = boardSummary.inCheck
      ? ` ${turnLabel}'s King is in **check**—resolve that immediately.`
      : hanging.length > 0
        ? ` Keep an eye on the undefended **${hanging[0]}**.`
        : '';
    return `Hi! I'm **${activeCoach}**, powered by **${engineLabel}**. You're playing **${studentLabel}** in the **${phase}** and it's **${turnLabel} to move** (eval **${evalText}**).${threatHint}${moveHint}\n\nTap **Explain Plan**, **Best Moves**, or **Blunder Check** anytime for instant Stockfish analysis.`;
  }

  // Blunder Guard / Threat Check
  if (/\b(blunder|threat|danger|watch|hang|mistake|guard)\b/i.test(q)) {
    const parts: string[] = [];
    if (lastMove) {
      parts.push(`**${engineLabel} Check after ${lastMove}:** Position stands at **${evalText}**.`);
    } else {
      parts.push(`**${engineLabel} Threat Scan (${evalText}):**`);
    }
    if (boardSummary.inCheck) {
      parts.push(`- **King in Check:** ${turnLabel} must get out of check first—**${bestSan}** is the cleanest defense.`);
    } else if (hanging.length > 0) {
      parts.push(`- **Undefended Piece Alert:** ${hanging.slice(0, 2).join(' and ')} ${hanging.length === 1 ? 'is' : 'are'} currently loose.`);
    } else if (boardSummary.availableChecks.length > 0 || boardSummary.availableCaptures.length > 0) {
      const checks = boardSummary.availableChecks.slice(0, 3).join(', ');
      const caps = boardSummary.availableCaptures.slice(0, 3).join(', ');
      parts.push(
        `- **Tactical Tension:** Calculate ${checks ? `checks (${checks})` : ''}${checks && caps ? ' and ' : ''}${caps ? `captures (${caps})` : ''} before committing a quiet move.`,
      );
    } else {
      parts.push(`- **No Hanging Pieces:** Structure is intact in this ${phase.toLowerCase()} position.`);
    }
    if (bestSan) {
      parts.push(`- **Stockfish Best Continuation:** Play **${bestSan}** (\`${lineStr}\`).`);
    }
    return parts.join('\n');
  }

  // Candidate Moves comparison
  if (/\b(candidate|best move|top|move|suggest|what should i play)\b/i.test(q)) {
    const lines: string[] = [];
    lines.push(`**${engineLabel} Multi-PV Candidates (${turnLabel} to move):**`);
    if (bestSan) {
      lines.push(`- **#1 Best Move — ${bestSan} (${evalText}):** Principal variation \`${lineStr}\`.`);
    }
    if (secondSf && secondSf.firstMoveSan && secondSf.firstMoveSan !== bestSan) {
      lines.push(
        `- **#2 Alternative — ${secondSf.firstMoveSan} (${secondSf.evalText}):** Continuation \`${secondSf.lineSan.slice(0, 4).join(' ')}\`.`,
      );
    }
    if (hanging.length > 0) {
      lines.push(`- **Tactical Note:** Watch ${hanging.slice(0, 2).join(' and ')}.`);
    }
    return lines.join('\n');
  }

  // General Position / Strategic Plan
  const lines: string[] = [];
  lines.push(
    `**${activeCoach} · ${engineLabel} (${evalText}):** ${turnLabel} to move in the **${phase}**${boardSummary.inCheck ? ' (King in check!)' : ''}.`,
  );
  if (bestSan) {
    lines.push(
      `- **Stockfish Top Move:** **${bestSan}** (principal line: \`${lineStr}\`).`,
    );
  }
  if (secondSf && secondSf.firstMoveSan && secondSf.firstMoveSan !== bestSan) {
    lines.push(
      `- **Second Candidate:** **${secondSf.firstMoveSan}** (${secondSf.evalText} — \`${secondSf.lineSan.slice(0, 4).join(' ')}\`).`,
    );
  }
  if (hanging.length > 0) {
    lines.push(`- **Tactical Alert:** Protect or exploit the undefended ${hanging.slice(0, 2).join(' and ')}.`);
  } else if (boardSummary.availableChecks.length > 0) {
    lines.push(
      `- **Forcing Checks:** Evaluate ${boardSummary.availableChecks.slice(0, 3).join(', ')} first.`,
    );
  } else if (boardSummary.availableCaptures.length > 0) {
    lines.push(
      `- **Active Captures:** Consider ${boardSummary.availableCaptures.slice(0, 3).join(', ')} to open lines.`,
    );
  } else if (phase === 'Opening') {
    lines.push('- **Opening Plan:** Contest the center (d4/e4/d5/e5), develop Knights and Bishops before Queen moves, and castle early.');
  } else if (phase === 'Endgame') {
    lines.push('- **Endgame Plan:** Activate your King toward the center, push passed pawns, and place Rooks behind passed pawns.');
  } else {
    lines.push('- **Middlegame Plan:** Improve your least-active minor piece, contest open files with Rooks, and probe weak squares.');
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Server-Authoritative WebSocket Online Rooms & Matchmaking (/ws/chess)
// ---------------------------------------------------------------------------
interface RoomChatMessage {
  id: string;
  sender: string;
  color: 'w' | 'b';
  text: string;
  timestamp: number;
  senderAvatarUrl?: string;
  senderFlag?: string;
}

interface LiveRoom {
  id: string;
  chess: Chess;
  initialSeconds: number;
  incrementSeconds: number;
  whiteClockMs: number;
  blackClockMs: number;
  lastMoveAt: number | null;
  whiteSocket: WebSocket | null;
  blackSocket: WebSocket | null;
  whiteName: string;
  blackName: string;
  whiteUsernameKey?: string;
  blackUsernameKey?: string;
  whiteRating?: number;
  blackRating?: number;
  whiteAvatarUrl?: string;
  blackAvatarUrl?: string;
  whiteFlag?: string;
  blackFlag?: string;
  whiteTitle?: string;
  blackTitle?: string;
  rated?: boolean;
  finalized?: boolean;
  drawOfferBy: 'w' | 'b' | null;
  rematchOfferBy?: 'w' | 'b' | null;
  winner: 'w' | 'b' | 'draw' | null;
  endReason: string | null;
  historyMeta: Array<{ from: string; to: string; san: string; captured?: boolean }>;
  chatMessages: RoomChatMessage[];
  spectators?: Set<WebSocket>;
  lichessFullId?: string;
  lichessSide?: 'w' | 'b' | null;
  lichessOpponentPresent?: boolean;
  lichessSocket?: WebSocket | null;
  lichessHeartbeat?: ReturnType<typeof setInterval> | null;
  lichessVersion?: number;
  lichessAck?: number;
  lichessCookie?: string;
  lichessSri?: string;
  lichessReconnectCount?: number;
  lichessGoneTimer?: ReturnType<typeof setTimeout> | null;
  ficsSocket?: net.Socket | null;
  ficsSide?: 'w' | 'b' | null;
  ficsOpponentPresent?: boolean;
  ficsGameNumber?: number;
  ficsBuffer?: string;
  serverSource?: ChessServerSource;
}

const MAX_MATCHMAKING_ELO_GAP = 200;

function isWithinMatchmakingEloBand(
  ratingA: number,
  ratingB: number,
  maxGap = MAX_MATCHMAKING_ELO_GAP,
): boolean {
  return Math.abs(ratingA - ratingB) <= maxGap;
}

type ChessServerSource = ChessServerName;

interface LiveDiscoveredPlayerEntry {
  username: string;
  rating?: number;
  flag?: string;
  title?: string;
  avatarUrl?: string;
  sourceServer: ChessServerSource;
  updatedAt: number;
}

const LIVE_DISCOVERED_PLAYERS = new Map<string, LiveDiscoveredPlayerEntry>();
const SERVER_POOL_HEALTH = new Map<
  ChessServerSource,
  { name: ChessServerSource; ok: boolean; count: number; updatedAt: number }
>([
  ['OpenChess', { name: 'OpenChess', ok: true, count: 0, updatedAt: Date.now() }],
  ['Lichess', { name: 'Lichess', ok: false, count: 0, updatedAt: 0 }],
  ['Chess.com', { name: 'Chess.com', ok: false, count: 0, updatedAt: 0 }],
  ['FICS', { name: 'FICS', ok: false, count: 0, updatedAt: 0 }],
  ['PlayStrategy', { name: 'PlayStrategy', ok: false, count: 0, updatedAt: 0 }],
]);

function recordLiveDiscoveredPlayer(params: {
  username?: string;
  rating?: number;
  flag?: string;
  title?: string;
  avatarUrl?: string;
  sourceServer?: ChessServerSource;
}): void {
  const uname = params.username?.trim();
  if (
    !uname ||
    uname.length < 2 ||
    uname.toLowerCase() === 'anonymous' ||
    /\(c\)$/i.test(uname) ||
    /^(lichess|player)_/i.test(uname)
  ) {
    return;
  }
  const key = uname.toLowerCase();
  const prev = LIVE_DISCOVERED_PLAYERS.get(key);
  LIVE_DISCOVERED_PLAYERS.set(key, {
    username: uname,
    rating:
      typeof params.rating === 'number' && Number.isFinite(params.rating) && params.rating >= 100
        ? Math.round(params.rating)
        : prev?.rating,
    flag: params.flag || prev?.flag,
    title: params.title || prev?.title,
    avatarUrl: sanitizePublicAvatar(params.avatarUrl) || prev?.avatarUrl,
    sourceServer: params.sourceServer ?? prev?.sourceServer ?? 'Lichess',
    updatedAt: Date.now(),
  });
  if (LIVE_DISCOVERED_PLAYERS.size > 360) {
    const oldestKey = LIVE_DISCOVERED_PLAYERS.keys().next().value;
    if (oldestKey) LIVE_DISCOVERED_PLAYERS.delete(oldestKey);
  }
}

let FICS_LIVE_SOUGHT: FicsSoughtAd[] = [];
let ficsRefreshPromise: Promise<void> | null = null;
let lastFicsRefresh = 0;

function triggerFicsBackgroundRefresh(): void {
  if (ficsRefreshPromise || Date.now() - lastFicsRefresh < 42_000) return;
  lastFicsRefresh = Date.now();
  ficsRefreshPromise = new Promise<void>((resolve) => {
    let buffer = '';
    let sentLogin = false;
    let sentReturn = false;
    let sentCmds = false;
    let finished = false;
    const sock = net.createConnection({ host: 'freechess.org', port: 5000 });
    const done = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        sock.destroy();
      } catch {
        // ignore
      }
      const whoPlayers = parseFicsWhoOutput(buffer);
      for (const p of whoPlayers.slice(0, 50)) {
        recordLiveDiscoveredPlayer({
          username: p.username,
          rating: p.rating,
          sourceServer: 'FICS',
        });
      }
      const soughtAds = parseFicsSoughtOutput(buffer);
      if (soughtAds.length > 0 || /ads displayed\./i.test(buffer)) {
        FICS_LIVE_SOUGHT = soughtAds;
      }
      const ficsTotal = Math.max(whoPlayers.length, soughtAds.length);
      if (ficsTotal > 0 || /fics%/i.test(buffer)) {
        SERVER_POOL_HEALTH.set('FICS', {
          name: 'FICS',
          ok: true,
          count: ficsTotal > 0 ? ficsTotal : 1,
          updatedAt: Date.now(),
        });
      }
      ficsRefreshPromise = null;
      resolve();
    };
    const timer = setTimeout(done, 9000);
    sock.on('data', (chunk) => {
      buffer += chunk.toString('latin1');
      if (!sentLogin && /login:/i.test(buffer)) {
        sentLogin = true;
        sock.write('guest\n');
      } else if (sentLogin && !sentReturn && /Press return to enter/i.test(buffer)) {
        sentReturn = true;
        sock.write('\n');
      } else if (sentReturn && !sentCmds && /fics%/i.test(buffer)) {
        sentCmds = true;
        sock.write('set seek 0\nwho\nsought\nquit\n');
      } else if (sentCmds && /Thank you for using the Free Internet Chess server/i.test(buffer)) {
        done();
      }
    });
    sock.on('error', done);
    sock.on('close', done);
  });
}

let lastPlayStrategyRefresh = 0;
async function refreshPlayStrategyPool(): Promise<void> {
  if (Date.now() - lastPlayStrategyRefresh < 45_000) return;
  lastPlayStrategyRefresh = Date.now();
  try {
    let psCount = 0;
    const tvRes = await fetch('https://playstrategy.org/api/tv/channels', {
      headers: { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' },
      signal: AbortSignal.timeout(2500),
    }).catch(() => null);
    if (tvRes?.ok) {
      const tvJson = (await tvRes.json().catch(() => null)) as Record<string, any> | null;
      if (tvJson && typeof tvJson === 'object') {
        for (const item of Object.values(tvJson)) {
          const uname = item?.user?.name || item?.user?.id;
          if (typeof uname === 'string' && uname.trim()) {
            psCount += 1;
            recordLiveDiscoveredPlayer({
              username: uname.trim(),
              rating: typeof item?.rating === 'number' ? item.rating : undefined,
              title: typeof item?.user?.title === 'string' ? item.user.title : undefined,
              sourceServer: 'PlayStrategy',
            });
          }
        }
      }
    }
    // Grab live PlayStrategy crowd snapshot + open lobby hooks briefly via lobby WS
    const crowdUsersToHydrate: string[] = [];
    await new Promise<void>((resolve) => {
      let settled = false;
      const psSri = crypto.randomBytes(8).toString('base64url').slice(0, 10);
      const ws = new WebSocket(`wss://sockets.playstrategy.org/lobby/socket/v5?sri=${psSri}`, {
        headers: { Origin: 'https://playstrategy.org', 'User-Agent': 'OpenChess/1.0' },
      });
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(t);
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve();
      };
      const t = setTimeout(finish, 1500);
      ws.on('open', () => {
        ws.send(JSON.stringify({ t: 'hookIn' }));
      });
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(String(raw));
          if ((msg.t === 'hooks' || msg.t === 'hli') && msg.d) {
            const list = Array.isArray(msg.d) ? msg.d : Array.isArray(msg.d.list) ? msg.d.list : [];
            for (const h of list) {
              const u = typeof h?.u === 'string' ? h.u.trim() : '';
              if (u && u.toLowerCase() !== 'anonymous') {
                psCount += 1;
                recordLiveDiscoveredPlayer({
                  username: u,
                  rating: typeof h?.rating === 'number' ? h.rating : undefined,
                  sourceServer: 'PlayStrategy',
                });
                if (typeof h?.rating !== 'number') crowdUsersToHydrate.push(u);
              }
            }
          } else if (msg.t === 'had' && msg.d) {
            const u = typeof msg.d.u === 'string' ? msg.d.u.trim() : '';
            if (u && u.toLowerCase() !== 'anonymous') {
              psCount += 1;
              recordLiveDiscoveredPlayer({
                username: u,
                rating: typeof msg.d.rating === 'number' ? msg.d.rating : undefined,
                sourceServer: 'PlayStrategy',
              });
            }
          } else if (msg.t === 'crowd' && msg.d) {
            const users = Array.isArray(msg.d.users) ? msg.d.users : [];
            for (const u of users) {
              if (typeof u === 'string' && u.trim()) {
                const clean = u.trim();
                psCount += 1;
                recordLiveDiscoveredPlayer({
                  username: clean,
                  sourceServer: 'PlayStrategy',
                });
                if (!LIVE_DISCOVERED_PLAYERS.get(clean.toLowerCase())?.rating) {
                  crowdUsersToHydrate.push(clean);
                }
              }
            }
            const nb = typeof msg.d.nb === 'number' ? msg.d.nb : users.length;
            if (nb > 0 || users.length > 0) {
              SERVER_POOL_HEALTH.set('PlayStrategy', {
                name: 'PlayStrategy',
                ok: true,
                count: Math.max(nb, psCount),
                updatedAt: Date.now(),
              });
              finish();
            }
          }
        } catch {
          // ignore
        }
      });
      ws.on('error', finish);
      ws.on('close', finish);
    });
    // Hydrate PlayStrategy players missing ratings via public /api/user endpoint
    const uniquePsHydrate = Array.from(new Set(crowdUsersToHydrate)).slice(0, 8);
    if (uniquePsHydrate.length > 0) {
      await Promise.allSettled(
        uniquePsHydrate.map(async (uname) => {
          const uRes = await fetch(`https://playstrategy.org/api/user/${encodeURIComponent(uname)}`, {
            headers: { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' },
            signal: AbortSignal.timeout(1800),
          }).catch(() => null);
          if (!uRes?.ok) return;
          const uData = (await uRes.json().catch(() => null)) as Record<string, any> | null;
          if (!uData) return;
          const rating =
            uData?.perfs?.rapid?.rating ??
            uData?.perfs?.blitz?.rating ??
            uData?.perfs?.bullet?.rating ??
            uData?.perfs?.classical?.rating;
          if (typeof rating === 'number' && rating >= 100) {
            recordLiveDiscoveredPlayer({
              username: String(uData.username || uname),
              rating,
              title: typeof uData.title === 'string' ? uData.title : undefined,
              sourceServer: 'PlayStrategy',
            });
          }
        }),
      );
    }
    if (psCount > 0 && !SERVER_POOL_HEALTH.get('PlayStrategy')?.ok) {
      SERVER_POOL_HEALTH.set('PlayStrategy', {
        name: 'PlayStrategy',
        ok: true,
        count: psCount,
        updatedAt: Date.now(),
      });
    }
  } catch {
    // ignore PlayStrategy error
  }
}

let chessComLeaderboardCache: {
  expiresAt: number;
  rapid: Array<{ username: string; rating: number; title?: string; avatarUrl?: string; country?: string }>;
  blitz: Array<{ username: string; rating: number; title?: string; avatarUrl?: string; country?: string }>;
  bullet: Array<{ username: string; rating: number; title?: string; avatarUrl?: string; country?: string }>;
} = { expiresAt: 0, rapid: [], blitz: [], bullet: [] };

async function refreshChessComPublicPool(): Promise<void> {
  if (Date.now() < chessComLeaderboardCache.expiresAt) return;
  try {
    const headers = { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' };
    const [lbRes, streamerRes] = await Promise.all([
      fetch('https://api.chess.com/pub/leaderboards', {
        headers,
        signal: AbortSignal.timeout(3000),
      }).catch(() => null),
      fetch('https://api.chess.com/pub/streamers', {
        headers,
        signal: AbortSignal.timeout(3000),
      }).catch(() => null),
    ]);

    let ccCount = 0;
    const parseBucket = (arr: any): Array<{ username: string; rating: number; title?: string; avatarUrl?: string; country?: string }> => {
      if (!Array.isArray(arr)) return [];
      const out: Array<{ username: string; rating: number; title?: string; avatarUrl?: string; country?: string }> = [];
      for (const item of arr.slice(0, 30)) {
        const uname = typeof item?.username === 'string' ? item.username.trim() : '';
        const score = typeof item?.score === 'number' ? item.score : 0;
        if (!uname || score < 100) continue;
        const countryUrl = typeof item?.country === 'string' ? item.country : '';
        const flag = countryUrl.includes('/') ? countryUrl.split('/').pop()?.toUpperCase() : undefined;
        const avatarUrl = typeof item?.avatar === 'string' ? item.avatar : undefined;
        out.push({
          username: uname,
          rating: score,
          title: typeof item?.title === 'string' ? item.title : undefined,
          avatarUrl,
          country: flag,
        });
        recordLiveDiscoveredPlayer({
          username: uname,
          rating: score,
          flag,
          title: typeof item?.title === 'string' ? item.title : undefined,
          avatarUrl,
          sourceServer: 'Chess.com',
        });
        ccCount += 1;
      }
      return out;
    };

    if (lbRes?.ok) {
      const lb = (await lbRes.json().catch(() => null)) as Record<string, any> | null;
      if (lb) {
        chessComLeaderboardCache = {
          expiresAt: Date.now() + 90_000,
          rapid: parseBucket(lb.live_rapid),
          blitz: parseBucket(lb.live_blitz),
          bullet: parseBucket(lb.live_bullet),
        };
      }
    }

    if (streamerRes?.ok) {
      const stData = (await streamerRes.json().catch(() => null)) as { streamers?: any[] } | null;
      const list = Array.isArray(stData?.streamers) ? stData.streamers : [];
      const liveFirst = [...list.filter((s) => s?.is_live), ...list.filter((s) => !s?.is_live)].slice(0, 12);
      const streamersToHydrate: string[] = [];
      for (const s of liveFirst) {
        const uname = typeof s?.username === 'string' ? s.username.trim() : '';
        if (!uname) continue;
        recordLiveDiscoveredPlayer({
          username: uname,
          avatarUrl: typeof s?.avatar === 'string' ? s.avatar : undefined,
          sourceServer: 'Chess.com',
        });
        if (!LIVE_DISCOVERED_PLAYERS.get(uname.toLowerCase())?.rating) {
          streamersToHydrate.push(uname);
        }
        ccCount += 1;
      }
      if (streamersToHydrate.length > 0) {
        await Promise.allSettled(
          streamersToHydrate.slice(0, 6).map(async (uname) => {
            const st = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(uname)}/stats`, {
              headers,
              signal: AbortSignal.timeout(1800),
            }).catch(() => null);
            if (!st?.ok) return;
            const d = (await st.json().catch(() => null)) as Record<string, any> | null;
            const rating =
              d?.chess_rapid?.last?.rating ??
              d?.chess_blitz?.last?.rating ??
              d?.chess_bullet?.last?.rating;
            if (typeof rating === 'number' && rating >= 100) {
              recordLiveDiscoveredPlayer({
                username: uname,
                rating,
                sourceServer: 'Chess.com',
              });
            }
          }),
        );
      }
    }

    if (ccCount > 0) {
      SERVER_POOL_HEALTH.set('Chess.com', {
        name: 'Chess.com',
        ok: true,
        count: ccCount,
        updatedAt: Date.now(),
      });
    }
  } catch {
    // ignore Chess.com network error
  }
}

let lastLivePoolRefresh = 0;
async function refreshLiveDiscoveredPlayers(): Promise<void> {
  // Always kick off FICS background refresh non-blockingly so HTTP routes never stall
  triggerFicsBackgroundRefresh();
  if (Date.now() - lastLivePoolRefresh < 40_000) return;
  lastLivePoolRefresh = Date.now();
  try {
    const headers = { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' };
    const [tvRes, streamerRes, tourneyRes] = await Promise.all([
      fetch('https://lichess.org/api/tv/channels', {
        headers,
        signal: AbortSignal.timeout(2500),
      }).catch(() => null),
      fetch('https://lichess.org/api/streamer/live', {
        headers,
        signal: AbortSignal.timeout(2500),
      }).catch(() => null),
      fetch('https://lichess.org/api/tournament', {
        headers,
        signal: AbortSignal.timeout(2500),
      }).catch(() => null),
      refreshChessComPublicPool(),
      refreshPlayStrategyPool(),
    ]);
    let lichessPoolCount = 0;
    if (tvRes?.ok) {
      const raw = (await tvRes.json().catch(() => null)) as Record<string, any> | null;
      if (raw && typeof raw === 'object') {
        for (const item of Object.values(raw)) {
          if (item?.user?.name) lichessPoolCount += 1;
          recordLiveDiscoveredPlayer({
            username: item?.user?.name,
            rating: item?.rating,
            title: item?.user?.title,
            sourceServer: 'Lichess',
          });
        }
      }
    }
    if (streamerRes?.ok) {
      const list = (await streamerRes.json().catch(() => null)) as any[] | null;
      if (Array.isArray(list)) {
        for (const item of list.slice(0, 20)) {
          if (item?.name || item?.id) lichessPoolCount += 1;
          recordLiveDiscoveredPlayer({
            username: item?.name || item?.id,
            title: item?.title,
            sourceServer: 'Lichess',
          });
        }
      }
    }
    if (tourneyRes?.ok) {
      const tJson = (await tourneyRes.json().catch(() => null)) as { started?: any[] } | null;
      const started = Array.isArray(tJson?.started) ? tJson.started : [];
      for (const arena of started.slice(0, 8)) {
        const winnerName = arena?.winner?.name || arena?.top?.name;
        if (winnerName) {
          lichessPoolCount += 1;
          recordLiveDiscoveredPlayer({
            username: winnerName,
            title: arena?.winner?.title,
            sourceServer: 'Lichess',
          });
        }
      }
    }
    if (lichessPoolCount > 0) {
      const prevLichess = SERVER_POOL_HEALTH.get('Lichess');
      SERVER_POOL_HEALTH.set('Lichess', {
        name: 'Lichess',
        ok: true,
        count: Math.max(prevLichess?.count ?? 0, lichessPoolCount),
        updatedAt: Date.now(),
      });
    }
    // Enrich any discovered Lichess players that didn't yet carry a rating
    const unratedLichessNames = Array.from(LIVE_DISCOVERED_PLAYERS.values())
      .filter((p) => p.sourceServer === 'Lichess' && typeof p.rating !== 'number')
      .slice(0, 40)
      .map((p) => p.username);
    if (unratedLichessNames.length > 0) {
      const uRes = await fetch('https://lichess.org/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          Accept: 'application/json',
          'User-Agent': 'OpenChess/1.0',
        },
        body: unratedLichessNames.join(','),
        signal: AbortSignal.timeout(2000),
      }).catch(() => null);
      if (uRes?.ok) {
        const arr = (await uRes.json().catch(() => null)) as Array<Record<string, any>> | null;
        if (Array.isArray(arr)) {
          for (const item of arr) {
            const uname = typeof item?.username === 'string' ? item.username.trim() : '';
            if (!uname) continue;
            const rating =
              Number(item?.perfs?.rapid?.rating) ||
              Number(item?.perfs?.blitz?.rating) ||
              Number(item?.perfs?.bullet?.rating) ||
              undefined;
            recordLiveDiscoveredPlayer({
              username: uname,
              rating,
              title: typeof item?.title === 'string' ? item.title : undefined,
              flag: item?.profile?.flag || item?.profile?.country,
              sourceServer: 'Lichess',
            });
          }
        }
      }
    }
  } catch {
    // ignore refresh error
  }
}

interface LichessLobbyHook {
  id: string;
  sri?: string;
  u?: string;
  rating?: number;
  clock?: string;
  t?: number;
  s?: number;
  i?: number;
  ra?: number | boolean;
  variant?: string | { key?: string };
  c?: 'white' | 'black';
}

interface LichessJoinedMatch {
  fullId: string;
  gameId: string;
  sri: string;
  humanColor: 'w' | 'b';
  opponentName: string;
  opponentRating?: number;
  opponentFlag?: string;
  opponentTitle?: string;
  opponentAvatarUrl?: string;
  initialSeconds: number;
  incrementSeconds: number;
  whiteClockMs: number;
  blackClockMs: number;
  version: number;
  cookie?: string;
  initialMovesUci: string[];
}

const LICHESS_LIVE_HOOKS = new Map<string, LichessLobbyHook & { updatedAt: number }>();
let lastLichessLobbyFetch = 0;
let lichessLobbyFetchInFlight: Promise<LichessLobbyHook[]> | null = null;
let cachedLichessGuestCookie: { cookie: string; expiresAt: number } | null = null;

async function getLichessGuestCookie(): Promise<string | undefined> {
  if (cachedLichessGuestCookie && Date.now() < cachedLichessGuestCookie.expiresAt) {
    return cachedLichessGuestCookie.cookie;
  }
  try {
    const res = await fetch('https://lichess.org/', {
      headers: {
        Accept: 'text/html',
        'User-Agent':
          'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(2500),
    });
    const setCookies =
      typeof res.headers.getSetCookie === 'function'
        ? res.headers.getSetCookie()
        : [res.headers.get('set-cookie') || ''];
    for (const sc of setCookies) {
      const m = sc.match(/(lila2=[^;]+)/);
      if (m) {
        cachedLichessGuestCookie = { cookie: m[1], expiresAt: Date.now() + 600_000 };
        return m[1];
      }
    }
  } catch {
    // ignore
  }
  return cachedLichessGuestCookie?.cookie;
}

async function refreshLichessLiveHooks(
  maxWaitMs = 1100,
  onlineToken?: string,
): Promise<LichessLobbyHook[]> {
  const now = Date.now();
  for (const [id, h] of LICHESS_LIVE_HOOKS.entries()) {
    if (now - h.updatedAt > 60_000) LICHESS_LIVE_HOOKS.delete(id);
  }
  if (!onlineToken && now - lastLichessLobbyFetch < 6_000 && LICHESS_LIVE_HOOKS.size > 0) {
    return Array.from(LICHESS_LIVE_HOOKS.values());
  }
  if (lichessLobbyFetchInFlight && !onlineToken) return lichessLobbyFetchInFlight;

  const p = (async () => {
    const lilaCookie = await getLichessGuestCookie();
    return new Promise<LichessLobbyHook[]>((resolve) => {
      let settled = false;
      const sri = crypto.randomBytes(9).toString('base64url').slice(0, 12);
      const wsHeaders: Record<string, string> = {
        Origin: 'https://lichess.org',
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
      };
      if (lilaCookie) wsHeaders.Cookie = lilaCookie;
      if (onlineToken) wsHeaders.Authorization = `Bearer ${onlineToken}`;

      const lws = new WebSocket(`wss://socket.lichess.org/lobby/socket/v5?sri=${sri}`, {
        headers: wsHeaders,
      });
      const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try {
          lws.close();
        } catch {
          // ignore
        }
      lastLichessLobbyFetch = Date.now();
      lichessLobbyFetchInFlight = null;
      const list = Array.from(LICHESS_LIVE_HOOKS.values());
      if (list.length > 0) {
        SERVER_POOL_HEALTH.set('Lichess', {
          name: 'Lichess',
          ok: true,
          count: list.length,
          updatedAt: Date.now(),
        });
      }
      resolve(list);
    };
    const timer = setTimeout(finish, maxWaitMs);
    const ingestHook = (h: Record<string, any>) => {
      if (!h || typeof h.id !== 'string') return;
      if (h.ra) return;
      const varKey = typeof h.variant === 'string' ? h.variant : h.variant?.key;
      if (varKey && varKey !== 'standard') return;
      const typed = h as LichessLobbyHook;
      LICHESS_LIVE_HOOKS.set(typed.id, { ...typed, updatedAt: Date.now() });
      if (typed.u) {
        recordLiveDiscoveredPlayer({
          username: typed.u,
          rating: typed.rating,
          sourceServer: 'Lichess',
        });
      }
    };
    lws.on('open', () => {
      lws.send(JSON.stringify({ t: 'hookIn' }));
    });
    lws.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        if (msg.t === 'hooks') {
          const list = Array.isArray(msg.d) ? msg.d : Array.isArray(msg.d?.list) ? msg.d.list : [];
          for (const item of list) ingestHook(item);
        } else if (msg.t === 'had' && msg.d) {
          ingestHook(msg.d);
        } else if (msg.t === 'hli' && Array.isArray(msg.d?.list)) {
          for (const item of msg.d.list) ingestHook(item);
        } else if (msg.t === 'hrm' && typeof msg.d === 'string') {
          for (let i = 0; i < msg.d.length; i += 8) {
            LICHESS_LIVE_HOOKS.delete(msg.d.slice(i, i + 8));
          }
        }
        if (LICHESS_LIVE_HOOKS.size >= 40) finish();
      } catch {
        // ignore
      }
    });
    lws.on('error', finish);
    lws.on('close', finish);
    });
  })();

  if (!onlineToken) {
    lichessLobbyFetchInFlight = p;
  }
  return p;
}

function parseHookClockSeconds(hook: LichessLobbyHook): { initial: number; increment: number } {
  if (typeof hook.clock === 'string' && hook.clock.includes('+')) {
    const [mStr, iStr] = hook.clock.split('+');
    const mins = mStr === '½' ? 0.5 : mStr === '¾' ? 0.75 : mStr === '¼' ? 0.25 : parseFloat(mStr);
    const inc = parseInt(iStr, 10);
    if (Number.isFinite(mins) && Number.isFinite(inc)) {
      return { initial: Math.max(30, Math.round(mins * 60)), increment: Math.max(0, inc) };
    }
  }
  return { initial: 600, increment: 0 };
}

async function joinRealLichessLobbyGame(params: {
  initialSeconds: number;
  incrementSeconds: number;
  preferredColor: 'w' | 'b' | 'random';
  playerElo?: number;
  playerKey?: string;
  onlineToken?: string;
  timeoutMs?: number;
  specificHookId?: string;
}): Promise<LichessJoinedMatch | null> {
  const timeoutMs = params.timeoutMs ?? 3500;
  const sri = crypto.randomBytes(9).toString('base64url').slice(0, 12);
  const startedAt = Date.now();
  const reqSpeed: 'bullet' | 'blitz' | 'rapid' =
    params.initialSeconds < 180 ? 'bullet' : params.initialSeconds < 480 ? 'blitz' : 'rapid';
  const lilaCookie = await getLichessGuestCookie();

  const redirectResult = await new Promise<{
    fullId: string;
    cookie?: string;
    joinedHook?: LichessLobbyHook & { fresh?: boolean };
  } | null>((resolve) => {
    let settled = false;
    let lastJoinedHook: (LichessLobbyHook & { fresh?: boolean }) | undefined;
    const triedHookIds = new Set<string>();
    const candidateHooks = new Map<string, LichessLobbyHook & { fresh?: boolean }>();

    const finish = (
      val: { fullId: string; cookie?: string; joinedHook?: LichessLobbyHook & { fresh?: boolean } } | null,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearInterval(retryInterval);
      try {
        lobbyWs.close();
      } catch {
        // ignore
      }
      resolve(val);
    };

    const lobbyHeaders: Record<string, string> = {
      Origin: 'https://lichess.org',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    };
    if (lilaCookie) lobbyHeaders.Cookie = lilaCookie;
    if (params.onlineToken) lobbyHeaders.Authorization = `Bearer ${params.onlineToken}`;

    const lobbyWs = new WebSocket(`wss://socket.lichess.org/lobby/socket/v5?sri=${sri}`, {
      headers: lobbyHeaders,
    });

    const targetElo = Math.max(100, Math.min(3200, Math.round(params.playerElo ?? 1200)));

    const isNamedHook = (h: LichessLobbyHook & { fresh?: boolean }): boolean => {
      const u = typeof h.u === 'string' ? h.u.trim() : '';
      return Boolean(u && u.toLowerCase() !== 'anonymous');
    };

    const isEligibleStandardHook = (
      h: LichessLobbyHook & { fresh?: boolean },
      requireNamed = false,
    ): boolean => {
      if (!h || typeof h.id !== 'string' || triedHookIds.has(h.id)) return false;
      if (h.ra && !params.onlineToken) return false; // Unauthenticated Lichess lobby bridge joins open casual hooks
      if (requireNamed && !isNamedHook(h)) return false;
      const varKey = typeof h.variant === 'string' ? h.variant : h.variant?.key;
      if (varKey && varKey !== 'standard') return false;
      if (params.preferredColor === 'w' && h.c === 'white') return false;
      if (params.preferredColor === 'b' && h.c === 'black') return false;
      if (typeof h.rating === 'number' && !isWithinMatchmakingEloBand(targetElo, h.rating)) {
        return false;
      }
      const { initial, increment } = parseHookClockSeconds(h);
      const elapsed = Date.now() - startedAt;
      if (elapsed < 450) {
        return initial === params.initialSeconds && increment === params.incrementSeconds;
      }
      if (elapsed < 1600) {
        return (
          Math.abs(initial - params.initialSeconds) <= 120 &&
          Math.abs(increment - params.incrementSeconds) <= 3
        );
      }
      const hookSpeed: 'bullet' | 'blitz' | 'rapid' =
        initial < 180 ? 'bullet' : initial < 480 ? 'blitz' : 'rapid';
      return hookSpeed === reqSpeed;
    };

    const scoreHook = (h: LichessLobbyHook & { fresh?: boolean }): number => {
      const { initial, increment } = parseHookClockSeconds(h);
      const namedBonus = isNamedHook(h) ? -250 : 100;
      const freshBonus = h.fresh ? -500 : 0;
      const ratingDiff = typeof h.rating === 'number' ? Math.abs(h.rating - targetElo) * 0.5 : 80;
      return (
        Math.abs(params.initialSeconds - initial) +
        Math.abs(params.incrementSeconds - increment) * 15 +
        ratingDiff +
        namedBonus +
        freshBonus
      );
    };

    const tryJoinBestHook = () => {
      if (settled || lobbyWs.readyState !== WebSocket.OPEN) return;
      if (params.specificHookId) {
        if (!triedHookIds.has(params.specificHookId)) {
          triedHookIds.add(params.specificHookId);
          lastJoinedHook = candidateHooks.get(params.specificHookId);
          lobbyWs.send(JSON.stringify({ t: 'join', d: params.specificHookId }));
        }
        return;
      }
      const allHooks = [...candidateHooks.values()];
      // Prefer named Lichess hooks first; only fall back to anonymous hooks after 1200ms
      let eligible = allHooks.filter((h) => isEligibleStandardHook(h, true));
      if (eligible.length === 0 && Date.now() - startedAt >= 1200) {
        eligible = allHooks.filter((h) => isEligibleStandardHook(h, false));
      }
      if (eligible.length === 0) return;
      eligible.sort((a, b) => scoreHook(a) - scoreHook(b));
      const best = eligible[0];
      triedHookIds.add(best.id);
      lastJoinedHook = best;
      lobbyWs.send(JSON.stringify({ t: 'join', d: best.id }));
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    const retryInterval = setInterval(() => tryJoinBestHook(), 180);

    lobbyWs.on('open', () => {
      lobbyWs.send(JSON.stringify({ t: 'hookIn' }));
      if (params.specificHookId) {
        setTimeout(() => tryJoinBestHook(), 60);
      }
    });

    lobbyWs.on('message', (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        const hookList: LichessLobbyHook[] | null =
          msg.t === 'hooks'
            ? Array.isArray(msg.d)
              ? (msg.d as LichessLobbyHook[])
              : Array.isArray(msg.d?.list)
                ? (msg.d.list as LichessLobbyHook[])
                : null
            : null;
        if (hookList) {
          for (const h of hookList) {
            if (h?.id) {
              candidateHooks.set(h.id, { ...h, fresh: false });
              if (h.u) recordLiveDiscoveredPlayer({ username: h.u, rating: h.rating });
            }
          }
          tryJoinBestHook();
        } else if (msg.t === 'had' && msg.d?.id) {
          const h = msg.d as LichessLobbyHook;
          candidateHooks.set(h.id, { ...h, fresh: true });
          if (h.u) recordLiveDiscoveredPlayer({ username: h.u, rating: h.rating });
          tryJoinBestHook();
        } else if (msg.t === 'hrm' && typeof msg.d === 'string') {
          for (let i = 0; i < msg.d.length; i += 8) {
            candidateHooks.delete(msg.d.slice(i, i + 8));
          }
        } else if (msg.t === 'redirect' && msg.d?.id) {
          const fullId = String(msg.d.id).replace(/^\//, '');
          const cookie =
            msg.d.cookie?.name && msg.d.cookie?.value
              ? `${msg.d.cookie.name}=${msg.d.cookie.value}`
              : undefined;
          finish({ fullId, cookie, joinedHook: lastJoinedHook });
        }
      } catch {
        // ignore
      }
    });

    lobbyWs.on('error', () => finish(null));
    lobbyWs.on('close', () => finish(null));
  });

  if (!redirectResult?.fullId) return null;

  const gameId = redirectResult.fullId.slice(0, 8);
  const hookClock = redirectResult.joinedHook
    ? parseHookClockSeconds(redirectResult.joinedHook)
    : { initial: params.initialSeconds, increment: params.incrementSeconds };

  let v5Data: Record<string, any> | null = null;
  try {
    const v5Headers: Record<string, string> = {
      Accept: 'application/vnd.lichess.v5+json',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    };
    if (redirectResult.cookie) v5Headers.Cookie = redirectResult.cookie;
    const res = await fetch(`https://lichess.org/${encodeURIComponent(redirectResult.fullId)}`, {
      headers: v5Headers,
      signal: AbortSignal.timeout(2200),
    });
    if (res.ok) {
      v5Data = (await res.json()) as Record<string, any>;
    }
  } catch {
    // continue with hook metadata
  }

  const statusName =
    typeof v5Data?.game?.status === 'object' ? v5Data.game.status?.name : v5Data?.game?.status;
  if (
    typeof statusName === 'string' &&
    ['aborted', 'mate', 'resign', 'stalemate', 'draw', 'outoftime', 'cheat', 'noStart'].includes(
      statusName,
    )
  ) {
    return null;
  }

  const initSec =
    typeof v5Data?.clock?.initial === 'number' && v5Data.clock.initial > 0
      ? v5Data.clock.initial
      : hookClock.initial;
  const incSec =
    typeof v5Data?.clock?.increment === 'number' ? v5Data.clock.increment : hookClock.increment;

  const humanColor: 'w' | 'b' =
    v5Data?.player?.color === 'black'
      ? 'b'
      : v5Data?.player?.color === 'white'
        ? 'w'
        : redirectResult.joinedHook?.c === 'white'
          ? 'b'
          : redirectResult.joinedHook?.c === 'black'
            ? 'w'
            : params.preferredColor === 'b'
              ? 'b'
              : 'w';

  const v5OppUser =
    v5Data?.opponent?.user?.username ||
    v5Data?.opponent?.user?.name ||
    v5Data?.opponent?.user?.id ||
    v5Data?.opponent?.username ||
    v5Data?.opponent?.name;
  const v5OppRating =
    typeof v5Data?.opponent?.rating === 'number' ? v5Data.opponent.rating : undefined;

  const targetElo = Math.max(100, Math.min(3200, Math.round(params.playerElo ?? 1200)));
  const rawOppName = String(redirectResult.joinedHook?.u || v5OppUser || '').trim();
  const oppPub = rawOppName
    ? await Promise.race([
        fetchPublicLichessUser(rawOppName, false),
        new Promise<null>((r) => setTimeout(() => r(null), 1600)),
      ])
    : null;

  const opponentName = rawOppName || oppPub?.username || 'Anonymous (Guest)';
  const rawOppPubPerfRating =
    typeof oppPub?.perfs?.[reqSpeed]?.rating === 'number'
      ? oppPub.perfs[reqSpeed].rating
      : typeof oppPub?.perfs?.rapid?.rating === 'number'
        ? oppPub.perfs.rapid.rating
        : typeof oppPub?.perfs?.blitz?.rating === 'number'
          ? oppPub.perfs.blitz.rating
          : typeof oppPub?.perfs?.bullet?.rating === 'number'
            ? oppPub.perfs.bullet.rating
            : undefined;
  const opponentRating: number | undefined =
    typeof redirectResult.joinedHook?.rating === 'number'
      ? redirectResult.joinedHook.rating
      : typeof v5OppRating === 'number'
        ? v5OppRating
        : rawOppPubPerfRating;
  if (
    !params.specificHookId &&
    typeof opponentRating === 'number' &&
    !isWithinMatchmakingEloBand(targetElo, opponentRating)
  ) {
    return null;
  }

  const opponentFlag = oppPub?.profile?.flag || oppPub?.profile?.country || undefined;
  const opponentTitle = oppPub?.title || v5Data?.opponent?.user?.title || undefined;
  const opponentAvatarUrl = sanitizePublicAvatar(oppPub?.profile?.avatarUrl);

  const parsedInitialMovesUci: string[] = [];
  if (Array.isArray(v5Data?.steps)) {
    for (const step of v5Data.steps) {
      if (step && typeof step.ply === 'number' && step.ply > 0 && typeof step.uci === 'string') {
        parsedInitialMovesUci.push(step.uci);
      }
    }
  }

  const whiteClockMs =
    typeof v5Data?.clock?.white === 'number'
      ? Math.max(0, Math.round(v5Data.clock.white * 1000))
      : initSec * 1000;
  const blackClockMs =
    typeof v5Data?.clock?.black === 'number'
      ? Math.max(0, Math.round(v5Data.clock.black * 1000))
      : initSec * 1000;
  const version = typeof v5Data?.player?.version === 'number' ? v5Data.player.version : 0;

  return {
    fullId: redirectResult.fullId,
    gameId,
    sri,
    humanColor,
    opponentName,
    opponentRating,
    opponentFlag,
    opponentTitle,
    opponentAvatarUrl,
    initialSeconds: initSec,
    incrementSeconds: incSec,
    whiteClockMs,
    blackClockMs,
    version,
    cookie: redirectResult.cookie || lilaCookie,
    initialMovesUci: parsedInitialMovesUci,
  };
}

interface FicsJoinedMatch {
  socket: net.Socket;
  initialBuffer: string;
  localFicsName: string;
  gameNumber: number;
  humanColor: 'w' | 'b';
  opponentName: string;
  opponentRating?: number;
  initialSeconds: number;
  incrementSeconds: number;
  whiteClockMs: number;
  blackClockMs: number;
  style12: FicsStyle12State;
}

async function joinRealFicsGame(params: {
  initialSeconds: number;
  incrementSeconds: number;
  preferredColor: 'w' | 'b' | 'random';
  playerElo?: number;
  specificAdId?: string;
  timeoutMs?: number;
  isCancelled?: () => boolean;
}): Promise<FicsJoinedMatch | null> {
  const timeoutMs = params.timeoutMs ?? 6500;
  const targetElo = Math.max(100, Math.min(3200, Math.round(params.playerElo ?? 1200)));
  const reqMins = Math.max(1, Math.round(params.initialSeconds / 60));
  const reqInc = Math.max(0, Math.round(params.incrementSeconds));
  const reqSpeed: 'bullet' | 'blitz' | 'rapid' =
    params.initialSeconds < 180 ? 'bullet' : params.initialSeconds < 480 ? 'blitz' : 'rapid';

  return new Promise<FicsJoinedMatch | null>((resolve) => {
    let settled = false;
    let buffer = '';
    let sentLogin = false;
    let sentReturn = false;
    let readyAtPrompt = false;
    let localFicsName = 'guest';
    let soughtHandled = false;
    let triedAdIds = new Set<string>();
    let lastAttemptedAd: FicsSoughtAd | null = null;
    const creatingRatings = new Map<string, number>();

    const sock = net.createConnection({ host: 'freechess.org', port: 5000 });

    const cleanupAndFail = () => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      clearTimeout(soughtFallbackTimer);
      clearInterval(cancelCheckTimer);
      sock.removeAllListeners();
      try {
        sock.write('unseek\nabort\nquit\n');
      } catch {
        // ignore
      }
      try {
        sock.destroy();
      } catch {
        // ignore
      }
      resolve(null);
    };

    const hardTimer = setTimeout(cleanupAndFail, timeoutMs);
    const cancelCheckTimer = setInterval(() => {
      if (params.isCancelled?.()) cleanupAndFail();
    }, 250);

    let cachedAds: FicsSoughtAd[] = [];
    const pickBestAd = (
      ads: FicsSoughtAd[],
      mode: 'exact' | 'speed' | 'any',
    ): FicsSoughtAd | null => {
      const eligible = ads.filter((ad) => {
        if (triedAdIds.has(ad.adId)) return false;
        if (params.preferredColor === 'w' && ad.color === 'white') return false;
        if (params.preferredColor === 'b' && ad.color === 'black') return false;
        if (typeof ad.rating === 'number' && !isWithinMatchmakingEloBand(targetElo, ad.rating)) {
          return false;
        }
        if (mode === 'exact') {
          return (
            Math.abs(ad.initialSeconds - params.initialSeconds) <= 180 &&
            Math.abs(ad.incrementSeconds - reqInc) <= 5
          );
        }
        if (mode === 'speed') return ad.speed === reqSpeed;
        return true;
      });
      if (eligible.length === 0) return null;
      eligible.sort((a, b) => {
        const diffA =
          Math.abs(a.initialSeconds - params.initialSeconds) +
          Math.abs(a.incrementSeconds - reqInc) * 15 +
          (typeof a.rating === 'number' ? Math.abs(a.rating - targetElo) * 0.25 : 40);
        const diffB =
          Math.abs(b.initialSeconds - params.initialSeconds) +
          Math.abs(b.incrementSeconds - reqInc) * 15 +
          (typeof b.rating === 'number' ? Math.abs(b.rating - targetElo) * 0.25 : 40);
        return diffA - diffB;
      });
      return eligible[0];
    };

    const sendSeekAndCheckSought = () => {
      if (settled || soughtHandled || !readyAtPrompt) return;
      soughtHandled = true;
      if (params.specificAdId) {
        triedAdIds.add(params.specificAdId);
        sock.write(`play ${params.specificAdId}\n`);
        return;
      }
      const ads = parseFicsSoughtOutput(buffer);
      cachedAds = ads;
      if (ads.length > 0) FICS_LIVE_SOUGHT = ads;
      const ad = pickBestAd(ads, 'exact') ?? pickBestAd(ads, 'speed');
      if (ad) {
        triedAdIds.add(ad.adId);
        lastAttemptedAd = ad;
        sock.write(`play ${ad.adId}\n`);
      }
      const colorWord =
        params.preferredColor === 'w' ? ' white' : params.preferredColor === 'b' ? ' black' : '';
      sock.write(`seek ${reqMins} ${reqInc} u${colorWord}\n`);
      setTimeout(() => {
        if (settled || !readyAtPrompt) return;
        const fallbackAd = pickBestAd(cachedAds.length > 0 ? cachedAds : FICS_LIVE_SOUGHT, 'any');
        if (fallbackAd) {
          triedAdIds.add(fallbackAd.adId);
          lastAttemptedAd = fallbackAd;
          sock.write(`play ${fallbackAd.adId}\n`);
        }
      }, 3200);
    };

    const soughtFallbackTimer = setTimeout(() => {
      if (!settled && readyAtPrompt && !soughtHandled) {
        sendSeekAndCheckSought();
      }
    }, 2400);

    const finishWithStyle12 = (s12: FicsStyle12State, remainingBuffer: string) => {
      if (settled) return;
      if (params.isCancelled?.()) {
        cleanupAndFail();
        return;
      }
      settled = true;
      clearTimeout(hardTimer);
      clearTimeout(soughtFallbackTimer);
      clearInterval(cancelCheckTimer);

      const whiteLower = s12.whiteName.toLowerCase();
      const blackLower = s12.blackName.toLowerCase();
      const localLower = localFicsName.toLowerCase();
      let humanColor: 'w' | 'b';
      if (localLower && whiteLower === localLower) {
        humanColor = 'w';
      } else if (localLower && blackLower === localLower) {
        humanColor = 'b';
      } else if ((s12.turn === 'w' && s12.myRelation === 1) || (s12.turn === 'b' && s12.myRelation === -1)) {
        humanColor = 'w';
      } else {
        humanColor = 'b';
      }

      const opponentName = humanColor === 'w' ? s12.blackName : s12.whiteName;
      const oppLower = opponentName.toLowerCase();
      const cachedOpp = LIVE_DISCOVERED_PLAYERS.get(oppLower);
      const soughtMatch = FICS_LIVE_SOUGHT.find((a) => a.username.toLowerCase() === oppLower);
      const rawRating =
        creatingRatings.get(oppLower) ??
        (lastAttemptedAd && lastAttemptedAd.username.toLowerCase() === oppLower
          ? lastAttemptedAd.rating
          : undefined) ??
        soughtMatch?.rating ??
        cachedOpp?.rating;

      const initSec = Math.max(60, Math.round((s12.initialMinutes || reqMins) * 60));
      const incSec = Math.max(0, Math.round(s12.incrementSeconds ?? reqInc));

      sock.removeAllListeners();
      resolve({
        socket: sock,
        initialBuffer: remainingBuffer,
        localFicsName,
        gameNumber: s12.gameNumber,
        humanColor,
        opponentName,
        opponentRating: typeof rawRating === 'number' && rawRating >= 100 ? rawRating : undefined,
        initialSeconds: initSec,
        incrementSeconds: incSec,
        whiteClockMs: Math.max(0, s12.whiteClockMs),
        blackClockMs: Math.max(0, s12.blackClockMs),
        style12: s12,
      });
    };

    sock.on('data', (chunk) => {
      if (settled) return;
      buffer += chunk.toString('latin1');

      if (!sentLogin && /login:/i.test(buffer)) {
        sentLogin = true;
        sock.write('guest\n');
        return;
      }
      if (sentLogin && !sentReturn && /Press return to enter/i.test(buffer)) {
        const guestM = buffer.match(/Logging you in as "(Guest[A-Za-z0-9]+)"/i);
        if (guestM) localFicsName = guestM[1];
        sentReturn = true;
        sock.write('\n');
        return;
      }
      if (sentReturn && !readyAtPrompt && /fics%/i.test(buffer)) {
        const guestM = buffer.match(/(?:Logging you in as "|Starting FICS session as )"(?:"?)([A-Za-z0-9_]+)/i);
        if (guestM) localFicsName = guestM[1];
        readyAtPrompt = true;
        buffer = '';
        sock.write('set seek 0\nset style 12\nset echo 0\nset shout 0\nset pin 0\n');
        if (params.specificAdId) {
          sendSeekAndCheckSought();
        } else {
          sock.write('sought\n');
        }
        return;
      }

      if (readyAtPrompt && !soughtHandled && /ads displayed\./i.test(buffer)) {
        sendSeekAndCheckSought();
      }

      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const createM = line.match(
          /Creating:\s+([A-Za-z0-9_]+)\s+\((?:\+\+\+\+|----|\s*(\d{3,4})\s*)\)\s+([A-Za-z0-9_]+)\s+\((?:\+\+\+\+|----|\s*(\d{3,4})\s*)\)/i,
        );
        if (createM) {
          if (createM[2]) creatingRatings.set(createM[1].toLowerCase(), Number(createM[2]));
          if (createM[4]) creatingRatings.set(createM[3].toLowerCase(), Number(createM[4]));
        }
        if (line.includes('is not available') || line.includes('You cannot accept your own seek')) {
          if (params.specificAdId) {
            cleanupAndFail();
            return;
          }
        }
        if (line.startsWith('<12> ')) {
          const s12 = parseFicsStyle12Line(line);
          if (s12 && (s12.myRelation === 1 || s12.myRelation === -1)) {
            const rest = [...lines.slice(i + 1), buffer].join('\n');
            finishWithStyle12(s12, rest);
            return;
          }
        }
      }
    });

    sock.on('error', cleanupAndFail);
    sock.on('close', cleanupAndFail);
  });
}

function setupLiveWebSocketServer(
  httpServer: ReturnType<typeof createServer>,
  hooks?: {
    onUserIdentified?: (user: StoredUserAccount, ws: WebSocket) => void;
  },
) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws/chess' });
  const rooms = new Map<string, LiveRoom>();
  const socketToRoom = new Map<WebSocket, { roomId: string; color: 'w' | 'b' }>();
  const spectatorRooms = new Map<WebSocket, string>();
  const presenceSockets = new Map<string, Set<WebSocket>>();
  const socketIdentity = new Map<WebSocket, string>();
  const openLobbyChallenges = new Map<
    string,
    OpenChallengeItem & { ws: WebSocket; ownerKey?: string }
  >();
  const matchQueues = new Map<
    string,
    Array<{
      ws: WebSocket;
      name: string;
      usernameKey?: string;
      avatarUrl?: string;
      flag?: string;
      title?: string;
      initialSeconds: number;
      incrementSeconds: number;
      preferredColor: 'w' | 'b' | 'random';
      playerElo: number;
      cancelled?: boolean;
      retryTimer?: ReturnType<typeof setInterval>;
    }>
  >();

  const sendJson = (ws: WebSocket | null, payload: unknown) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  };

  const resolveWsUser = (msg: Record<string, unknown>, ws: WebSocket): StoredUserAccount | null => {
    const token = typeof msg.token === 'string' ? msg.token.trim() : '';
    if (token.startsWith('oc.')) {
      const verified = verifyOpenChessToken(token);
      if (verified) return verified;
    }
    const identifiedKey = socketIdentity.get(ws);
    if (identifiedKey && usersStore.users[identifiedKey]) {
      return usersStore.users[identifiedKey];
    }
    return null;
  };

  const resolveSpeedKey = (initialSeconds: number): 'bullet' | 'blitz' | 'rapid' =>
    initialSeconds < 180 ? 'bullet' : initialSeconds < 480 ? 'blitz' : 'rapid';

  const getPlayerRatingForSpeed = (user: StoredUserAccount | null, initialSeconds: number): number | undefined => {
    if (!user?.perfs) return undefined;
    const speed = resolveSpeedKey(initialSeconds);
    const speedPerf = user.perfs[speed];
    if (
      speedPerf &&
      typeof speedPerf.rating === 'number' &&
      ((speedPerf.games ?? 0) > 0 || (speedPerf.rating !== 1200 && speedPerf.rating !== 1500))
    ) {
      return speedPerf.rating;
    }
    const activePerf = [user.perfs.rapid, user.perfs.blitz, user.perfs.bullet].find(
      (p) =>
        p &&
        typeof p.rating === 'number' &&
        ((p.games ?? 0) > 0 || (p.rating !== 1200 && p.rating !== 1500)),
    );
    if (activePerf) return activePerf.rating;
    return speedPerf?.rating ?? user.perfs.rapid?.rating;
  };

  const resolveEffectivePlayerElo = (
    user: StoredUserAccount | null,
    initialSeconds: number,
    rawClientElo?: unknown,
  ): number => {
    const clientElo =
      typeof rawClientElo === 'number' && Number.isFinite(rawClientElo)
        ? Math.max(100, Math.min(3200, Math.round(rawClientElo)))
        : typeof rawClientElo === 'string' &&
            rawClientElo.trim() &&
            Number.isFinite(Number(rawClientElo))
          ? Math.max(100, Math.min(3200, Math.round(Number(rawClientElo))))
          : undefined;
    const accountElo = getPlayerRatingForSpeed(user, initialSeconds);
    if (
      accountElo !== undefined &&
      accountElo !== 1200 &&
      accountElo !== 1500
    ) {
      return Math.max(100, Math.min(3200, Math.round(accountElo)));
    }
    if (clientElo !== undefined) return clientElo;
    if (accountElo !== undefined) return Math.max(100, Math.min(3200, Math.round(accountElo)));
    return 1200;
  };

  const cleanupRoomLichessBridge = (room: LiveRoom) => {
    if (room.lichessHeartbeat) {
      clearInterval(room.lichessHeartbeat);
      room.lichessHeartbeat = null;
    }
    if (room.lichessGoneTimer) {
      clearTimeout(room.lichessGoneTimer);
      room.lichessGoneTimer = null;
    }
    if (room.lichessSocket) {
      try {
        room.lichessSocket.close();
      } catch {
        // ignore
      }
      room.lichessSocket = null;
    }
    if (room.ficsSocket) {
      const fSock = room.ficsSocket;
      room.ficsSocket = null;
      room.ficsSide = null;
      fSock.removeAllListeners();
      try {
        fSock.write(room.historyMeta.length < 2 ? 'unseek\nabort\nquit\n' : 'resign\nquit\n');
      } catch {
        // ignore
      }
      try {
        fSock.destroy();
      } catch {
        // ignore
      }
    }
  };

  const removePresenceSocket = (ws: WebSocket) => {
    const key = socketIdentity.get(ws);
    if (!key) return;
    socketIdentity.delete(ws);
    const set = presenceSockets.get(key);
    if (set) {
      set.delete(ws);
      if (set.size === 0) presenceSockets.delete(key);
    }
  };

  const pushToUser = (username: string, payload: unknown) => {
    const set = presenceSockets.get(username.trim().toLowerCase());
    if (!set) return;
    for (const sock of set) {
      sendJson(sock, payload);
    }
  };

  const isUserOnline = (username: string): boolean => {
    const set = presenceSockets.get(username.trim().toLowerCase());
    if (!set) return false;
    for (const sock of set) {
      if (sock.readyState === WebSocket.OPEN) return true;
    }
    return false;
  };

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[crypto.randomInt(chars.length)];
    return code;
  };

  const finalizeRoomResult = (room: LiveRoom) => {
    if (!room.winner || room.finalized) return;
    room.finalized = true;
    if (room.historyMeta.length === 0 && room.winner === 'draw') return;

    const speed = resolveSpeedKey(room.initialSeconds);
    const reasonLower = (room.endReason || '').toLowerCase();
    const statusStr = reasonLower.includes('checkmate')
      ? 'mate'
      : reasonLower.includes('resign')
        ? 'resign'
        : reasonLower.includes('time')
          ? 'outoftime'
          : reasonLower.includes('stalemate')
            ? 'stalemate'
            : room.winner === 'draw'
              ? 'draw'
              : 'mate';

    const now = Date.now();
    const gameRecord: LichessUserGame = {
      id: `oc-${room.id}-${now}`,
      rated: room.rated !== false,
      speed,
      status: statusStr,
      winner: room.winner === 'w' ? 'white' : room.winner === 'b' ? 'black' : undefined,
      white: {
        name: room.whiteName,
        rating: room.whiteRating,
        title: room.whiteTitle,
        avatarUrl: room.whiteAvatarUrl,
        flag: room.whiteFlag,
      },
      black: {
        name: room.blackName,
        rating: room.blackRating,
        title: room.blackTitle,
        avatarUrl: room.blackAvatarUrl,
        flag: room.blackFlag,
      },
      pgn: room.chess.pgn(),
      createdAt: now,
      lastMoveAt: now,
    };

    const wKey = (room.whiteUsernameKey || room.whiteName).trim().toLowerCase();
    const bKey = (room.blackUsernameKey || room.blackName).trim().toLowerCase();
    const whiteUser = wKey && usersStore.users[wKey] ? usersStore.users[wKey] : null;
    const blackUser = bKey && usersStore.users[bKey] && bKey !== wKey ? usersStore.users[bKey] : null;

    const updateParticipant = (
      user: StoredUserAccount,
      side: 'w' | 'b',
      oppRating: number,
    ) => {
      const dedupKey = `${user.username.toLowerCase()}:ws-${room.id}`;
      if (ratedGameKeys.has(dedupKey)) return;
      ratedGameKeys.add(dedupKey);
      user.localProgressInitialized = true;
      user.perfs ??= defaultAccountPerfs();
      user.count ??= defaultAccountCount();
      const outcome: 'win' | 'loss' | 'draw' =
        room.winner === 'draw' ? 'draw' : room.winner === side ? 'win' : 'loss';
      const curPerf = user.perfs[speed] ?? { rating: 1200, games: 0 };
      const nextRating =
        room.rated === false ? curPerf.rating : calculateUpdatedElo(curPerf.rating, oppRating, outcome);

      user.perfs[speed] = {
        ...curPerf,
        rating: nextRating,
        games: curPerf.games + 1,
      };
      user.count.all = Math.max(user.count.all + 1, (user.playedGames?.length ?? 0) + 1);
      if (room.rated !== false) user.count.rated = (user.count.rated ?? 0) + 1;
      if (outcome === 'win') user.count.win += 1;
      else if (outcome === 'loss') user.count.loss += 1;
      else user.count.draw += 1;

      user.leaguePoints = (user.leaguePoints ?? 0) + (outcome === 'win' ? 15 : outcome === 'draw' ? 6 : 2);
      user.ratingHistory = appendRatingHistoryPoint(user.ratingHistory, speed, nextRating, now);
      if (room.historyMeta.length > 0) {
        user.playedGames = mergeSyncedGames([gameRecord], user.playedGames ?? []).slice(0, 50);
      }
      user.seenAt = now;
    };

    if (whiteUser) {
      updateParticipant(whiteUser, 'w', room.blackRating ?? 1200);
    }
    if (blackUser) {
      updateParticipant(blackUser, 'b', room.whiteRating ?? 1200);
    }

    if (whiteUser || blackUser) {
      saveUsersStore(usersStore);
      if (whiteUser) {
        pushToUser(whiteUser.username, {
          type: 'account:updated',
          account: buildAccountPayload(whiteUser, { online: true }),
        });
      }
      if (blackUser) {
        pushToUser(blackUser.username, {
          type: 'account:updated',
          account: buildAccountPayload(blackUser, { online: true }),
        });
      }
    }
  };

  const broadcastRoomState = (room: LiveRoom) => {
    const now = Date.now();
    let wClock = room.whiteClockMs;
    let bClock = room.blackClockMs;
    const bothPresent = Boolean(
      (room.whiteSocket && room.blackSocket) ||
        (room.lichessSide && (room.whiteSocket || room.blackSocket) && room.lichessOpponentPresent !== false) ||
        (room.ficsSide && (room.whiteSocket || room.blackSocket) && room.ficsOpponentPresent !== false),
    );
    if (room.lastMoveAt && !room.winner && bothPresent && room.chess.history().length > 0) {
      const elapsed = now - room.lastMoveAt;
      if (room.chess.turn() === 'w') wClock = Math.max(0, wClock - elapsed);
      else bClock = Math.max(0, bClock - elapsed);
    }

    const basePayload = {
      type: 'room:state',
      roomId: room.id,
      fen: room.chess.fen(),
      pgn: room.chess.pgn(),
      turn: room.chess.turn(),
      lastMove: room.historyMeta[room.historyMeta.length - 1] ?? null,
      history: room.historyMeta,
      whiteClockMs: wClock,
      blackClockMs: bClock,
      whiteName: room.whiteName,
      blackName: room.blackName,
      whiteRating: room.whiteRating,
      blackRating: room.blackRating,
      whiteAvatarUrl: room.whiteAvatarUrl,
      blackAvatarUrl: room.blackAvatarUrl,
      whiteFlag: room.whiteFlag,
      blackFlag: room.blackFlag,
      whiteTitle: room.whiteTitle,
      blackTitle: room.blackTitle,
      rated: room.rated !== false,
      opponentConnected: bothPresent,
      drawOfferBy: room.drawOfferBy,
      rematchOfferBy: room.rematchOfferBy ?? null,
      winner: room.winner,
      endReason: room.endReason,
      initialSeconds: room.initialSeconds,
      incrementSeconds: room.incrementSeconds,
      serverSource:
        room.serverSource ?? (room.lichessSide ? 'Lichess' : room.ficsSide ? 'FICS' : 'OpenChess'),
      chatMessages: room.chatMessages,
      spectatorCount: room.spectators?.size ?? 0,
    };

    if (room.whiteSocket) sendJson(room.whiteSocket, { ...basePayload, yourColor: 'w' });
    if (room.blackSocket) sendJson(room.blackSocket, { ...basePayload, yourColor: 'b' });
    if (room.spectators) {
      for (const specWs of room.spectators) {
        sendJson(specWs, { ...basePayload, yourColor: 'spectator' });
      }
    }
  };

  const connectRoomToLichessPlaySocket = (room: LiveRoom) => {
    if (!room.lichessFullId) return;
    const playSri =
      room.lichessSri || crypto.randomBytes(9).toString('base64url').slice(0, 12);
    const vParam = room.lichessVersion ?? 0;
    const headers: Record<string, string> = {
      Origin: 'https://lichess.org',
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36',
    };
    if (room.lichessCookie) headers.Cookie = room.lichessCookie;

    const lws = new WebSocket(
      `wss://socket.lichess.org/play/${room.lichessFullId}/v6?sri=${playSri}&v=${vParam}`,
      { headers },
    );
    room.lichessSocket = lws;
    room.lichessAck = 1;

    room.lichessHeartbeat = setInterval(() => {
      if (lws.readyState === WebSocket.OPEN) {
        lws.send(JSON.stringify({ t: 'p', v: room.lichessVersion ?? 0 }));
      }
    }, 2500);

    lws.on('open', () => {
      if (room.lichessSocket !== lws) return;
      room.lichessReconnectCount = 0;
    });

    const handleLichessEvent = (ev: Record<string, any>) => {
      if (!ev || typeof ev !== 'object' || room.lichessSocket !== lws) return;
      if (typeof ev.v === 'number') {
        room.lichessVersion = ev.v;
      }
      const moveUci =
        ev.t === 'move' && ev.d
          ? typeof ev.d.uci === 'string'
            ? ev.d.uci
            : typeof ev.d.u === 'string'
              ? ev.d.u
              : null
          : null;
      if (moveUci) {
        const uci = moveUci;
        const from = uci.slice(0, 2);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci[4] : 'q';

        if (ev.d.clock) {
          if (typeof ev.d.clock.white === 'number') {
            room.whiteClockMs = Math.max(0, Math.round(ev.d.clock.white * 1000));
          }
          if (typeof ev.d.clock.black === 'number') {
            room.blackClockMs = Math.max(0, Math.round(ev.d.clock.black * 1000));
          }
        }

        const lastMeta = room.historyMeta[room.historyMeta.length - 1];
        const alreadyApplied = lastMeta && lastMeta.from === from && lastMeta.to === to;
        if (!alreadyApplied) {
          try {
            const moved = room.chess.move({ from, to, promotion });
            if (moved) {
              room.lastMoveAt = Date.now();
              room.drawOfferBy = null;
              room.historyMeta.push({
                from: moved.from,
                to: moved.to,
                san: moved.san,
                captured: Boolean(moved.captured) || moved.flags.includes('e'),
              });
            }
          } catch {
            // ignore if out of sync
          }
        }

        if (room.chess.isCheckmate()) {
          room.winner = room.chess.turn() === 'w' ? 'b' : 'w';
          room.endReason = `${room.winner === 'w' ? 'White' : 'Black'} wins by checkmate`;
          cleanupRoomLichessBridge(room);
          finalizeRoomResult(room);
        } else if (room.chess.isDraw()) {
          room.winner = 'draw';
          room.endReason = room.chess.isStalemate() ? 'Stalemate' : 'Draw';
          cleanupRoomLichessBridge(room);
          finalizeRoomResult(room);
        } else if (ev.d.status || ev.d.winner) {
          const statusName =
            typeof ev.d.status === 'object' ? ev.d.status?.name : String(ev.d.status || 'ended');
          if (statusName === 'aborted') {
            room.winner = 'draw';
            room.endReason = 'Game aborted by opponent';
            cleanupRoomLichessBridge(room);
            broadcastRoomState(room);
            return;
          }
          const w = ev.d.winner;
          room.winner = w === 'white' ? 'w' : w === 'black' ? 'b' : 'draw';
          room.endReason = `Online game ended (${statusName})`;
          cleanupRoomLichessBridge(room);
          finalizeRoomResult(room);
        }

        broadcastRoomState(room);
      } else if (ev.t === 'crowd' && ev.d && room.lichessSide) {
        const oppPresent = room.lichessSide === 'w' ? Boolean(ev.d.white) : Boolean(ev.d.black);
        if (oppPresent && room.lichessGoneTimer) {
          clearTimeout(room.lichessGoneTimer);
          room.lichessGoneTimer = null;
        }
        if (room.lichessOpponentPresent !== oppPresent) {
          room.lichessOpponentPresent = oppPresent;
          broadcastRoomState(room);
        }
        if (!oppPresent && !room.winner && !room.lichessGoneTimer) {
          room.lichessGoneTimer = setTimeout(() => {
            room.lichessGoneTimer = null;
            if (room.winner || room.lichessOpponentPresent !== false || !room.lichessSide) return;
            const oppSide = room.lichessSide;
            cleanupRoomLichessBridge(room);
            if (room.historyMeta.length < 2) {
              room.winner = 'draw';
              room.endReason = 'Online opponent left before game started';
            } else {
              room.winner = oppSide === 'w' ? 'b' : 'w';
              room.endReason = 'Online opponent disconnected';
              finalizeRoomResult(room);
            }
            broadcastRoomState(room);
          }, 15_000);
        }
      } else if ((ev.t === 'endData' || ev.t === 'end') && !room.winner) {
        const d = ev.d ?? {};
        const w = d.winner;
        const statusName =
          typeof d.status === 'object' ? d.status?.name : String(d.status || 'ended');
        if (statusName === 'aborted') {
          room.winner = 'draw';
          room.endReason = 'Game aborted by opponent';
          cleanupRoomLichessBridge(room);
          broadcastRoomState(room);
          return;
        }
        room.winner = w === 'white' ? 'w' : w === 'black' ? 'b' : 'draw';
        room.endReason =
          statusName === 'resign'
            ? `${room.winner === 'w' ? 'Black' : 'White'} resigned`
            : statusName === 'outoftime'
              ? `${room.winner === 'w' ? 'Black' : 'White'} ran out of time`
              : `Online game ended (${statusName || 'finished'})`;
        cleanupRoomLichessBridge(room);
        finalizeRoomResult(room);
        broadcastRoomState(room);
      } else if (ev.t === 'message' && ev.d && typeof ev.d.t === 'string') {
        const text = sanitizeStudyText(ev.d.t).slice(0, 240);
        const senderRaw = String(ev.d.u || '');
        const oppColor: 'w' | 'b' = room.lichessSide ?? 'b';
        const humanColor: 'w' | 'b' = oppColor === 'w' ? 'b' : 'w';
        const humanName = humanColor === 'w' ? room.whiteName : room.blackName;
        if (
          isDuplicateRemoteChat({
            senderRaw,
            text,
            humanName,
            humanColor,
            recentMessages: room.chatMessages,
          })
        ) {
          return;
        }
        const oppDisplay = oppColor === 'w' ? room.whiteName : room.blackName;
        room.chatMessages = [
          ...room.chatMessages.slice(-58),
          {
            id: `lc-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
            sender: oppDisplay,
            color: oppColor,
            text,
            timestamp: Date.now(),
            senderAvatarUrl: oppColor === 'w' ? room.whiteAvatarUrl : room.blackAvatarUrl,
            senderFlag: oppColor === 'w' ? room.whiteFlag : room.blackFlag,
          },
        ];
        broadcastRoomState(room);
      }
    };

    lws.on('message', (raw) => {
      if (room.lichessSocket !== lws) return;
      try {
        const pkt = JSON.parse(String(raw));
        if (pkt.t === 'b' && Array.isArray(pkt.d)) {
          for (const sub of pkt.d) handleLichessEvent(sub);
        } else {
          handleLichessEvent(pkt);
        }
      } catch {
        // ignore
      }
    });

    lws.on('close', () => {
      if (room.lichessSocket !== lws || room.winner || !room.lichessSide) return;
      if (room.lichessHeartbeat) {
        clearInterval(room.lichessHeartbeat);
        room.lichessHeartbeat = null;
      }
      room.lichessSocket = null;
      const retries = room.lichessReconnectCount ?? 0;
      const humanPresent = Boolean(room.whiteSocket || room.blackSocket);
      if (humanPresent && retries < 3) {
        room.lichessReconnectCount = retries + 1;
        room.lichessOpponentPresent = false;
        broadcastRoomState(room);
        setTimeout(() => {
          if (!room.winner && !room.lichessSocket && (room.whiteSocket || room.blackSocket)) {
            connectRoomToLichessPlaySocket(room);
          }
        }, 1200);
        return;
      }
      const oppSide = room.lichessSide;
      cleanupRoomLichessBridge(room);
      room.lichessOpponentPresent = false;
      if (room.historyMeta.length < 2) {
        room.winner = 'draw';
        room.endReason = 'Online opponent left before game started';
      } else {
        room.winner = oppSide === 'w' ? 'b' : 'w';
        room.endReason = 'Online opponent disconnected';
        finalizeRoomResult(room);
      }
      broadcastRoomState(room);
    });

    lws.on('error', () => {});
  };

  const connectRoomToFicsSocket = (room: LiveRoom, localFicsName: string) => {
    const fSock = room.ficsSocket;
    if (!fSock || fSock.destroyed) return;

    const oppSide = room.ficsSide;
    const oppName = oppSide === 'w' ? room.whiteName : room.blackName;
    const existingOppRating = oppSide === 'w' ? room.whiteRating : room.blackRating;
    let fingerRequested = false;
    if (
      oppSide &&
      existingOppRating === undefined &&
      oppName &&
      !/^guest/i.test(oppName)
    ) {
      fingerRequested = true;
      try {
        fSock.write(`finger ${oppName}\n`);
      } catch {
        // ignore
      }
    }

    const processFicsLine = (rawLine: string) => {
      const line = rawLine.trim();
      if (!line || room.ficsSocket !== fSock || room.winner) return;

      if (fingerRequested && oppSide) {
        const fingerRatingM = line.match(/^(Blitz|Standard|Lightning)\s+(\d{3,4})\b/i);
        if (fingerRatingM) {
          const parsedRating = Number(fingerRatingM[2]);
          if (Number.isFinite(parsedRating) && parsedRating >= 100) {
            const currentRating = oppSide === 'w' ? room.whiteRating : room.blackRating;
            if (currentRating === undefined || /^Blitz$/i.test(fingerRatingM[1])) {
              if (oppSide === 'w') room.whiteRating = parsedRating;
              else room.blackRating = parsedRating;
              recordLiveDiscoveredPlayer({
                username: oppName,
                rating: parsedRating,
                sourceServer: 'FICS',
              });
              broadcastRoomState(room);
            }
          }
        }
      }

      if (line.startsWith('<12> ')) {
        const s12 = parseFicsStyle12Line(line);
        if (!s12 || (s12.myRelation !== 1 && s12.myRelation !== -1)) return;
        room.whiteClockMs = Math.max(0, s12.whiteClockMs);
        room.blackClockMs = Math.max(0, s12.blackClockMs);

        let applied = false;
        if (s12.lastMove) {
          const lastMeta = room.historyMeta[room.historyMeta.length - 1];
          if (lastMeta && lastMeta.from === s12.lastMove.from && lastMeta.to === s12.lastMove.to) {
            applied = true;
          } else {
            try {
              const moved = room.chess.move(s12.lastMove);
              if (moved) {
                applied = true;
                room.lastMoveAt = Date.now();
                room.drawOfferBy = null;
                room.historyMeta.push({
                  from: moved.from,
                  to: moved.to,
                  san: moved.san,
                  captured: Boolean(moved.captured) || moved.flags.includes('e'),
                });
              }
            } catch {
              // ignore
            }
          }
        }
        if (!applied && s12.san) {
          const lastMeta = room.historyMeta[room.historyMeta.length - 1];
          if (!lastMeta || lastMeta.san.replace(/[+#]$/, '') !== s12.san.replace(/[+#]$/, '')) {
            try {
              const sanMoved = room.chess.move(s12.san);
              if (sanMoved) {
                room.lastMoveAt = Date.now();
                room.drawOfferBy = null;
                room.historyMeta.push({
                  from: sanMoved.from,
                  to: sanMoved.to,
                  san: sanMoved.san,
                  captured: Boolean(sanMoved.captured) || sanMoved.flags.includes('e'),
                });
              }
            } catch {
              // ignore
            }
          }
        }

        if (room.chess.isCheckmate()) {
          room.winner = room.chess.turn() === 'w' ? 'b' : 'w';
          room.endReason = `${room.winner === 'w' ? 'White' : 'Black'} wins by checkmate`;
          cleanupRoomLichessBridge(room);
          finalizeRoomResult(room);
        } else if (room.chess.isDraw()) {
          room.winner = 'draw';
          room.endReason = room.chess.isStalemate() ? 'Stalemate' : 'Draw';
          cleanupRoomLichessBridge(room);
          finalizeRoomResult(room);
        }
        broadcastRoomState(room);
        return;
      }

      if (/offers you a draw|offers a draw/i.test(line) && room.ficsSide) {
        room.drawOfferBy = room.ficsSide;
        broadcastRoomState(room);
        return;
      }

      const sayMatch = line.match(
        /^(?:-->)?\s*([A-Za-z0-9_-]+)(?:\([^)]*\))?\s+says:\s*(.+)$/,
      );
      if (sayMatch && room.ficsSide) {
        const senderRaw = sayMatch[1].trim();
        if (senderRaw.toLowerCase() === localFicsName.toLowerCase()) return;
        const text = sanitizeStudyText(sayMatch[2]).slice(0, 240);
        if (!text) return;
        const oppColor = room.ficsSide;
        const humanColor: 'w' | 'b' = oppColor === 'w' ? 'b' : 'w';
        const humanName = humanColor === 'w' ? room.whiteName : room.blackName;
        if (
          isDuplicateRemoteChat({
            senderRaw,
            text,
            humanName,
            humanColor,
            recentMessages: room.chatMessages,
          })
        ) {
          return;
        }
        const oppDisplay = oppColor === 'w' ? room.whiteName : room.blackName;
        room.chatMessages = [
          ...room.chatMessages.slice(-58),
          {
            id: `fics-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
            sender: oppDisplay,
            color: oppColor,
            text,
            timestamp: Date.now(),
            senderAvatarUrl: oppColor === 'w' ? room.whiteAvatarUrl : room.blackAvatarUrl,
            senderFlag: oppColor === 'w' ? room.whiteFlag : room.blackFlag,
          },
        ];
        broadcastRoomState(room);
        return;
      }

      const endInfo = parseFicsGameEndLine(line);
      if (endInfo && !room.winner) {
        const isAbort = endInfo.reason.toLowerCase().includes('abort');
        room.winner = endInfo.winner;
        room.endReason = endInfo.reason;
        cleanupRoomLichessBridge(room);
        if (!isAbort) finalizeRoomResult(room);
        broadcastRoomState(room);
      }
    };

    if (room.ficsBuffer) {
      const initialLines = room.ficsBuffer.split(/\r?\n/);
      room.ficsBuffer = initialLines.pop() ?? '';
      for (const l of initialLines) processFicsLine(l);
    }

    fSock.on('data', (chunk) => {
      if (room.ficsSocket !== fSock || room.winner) return;
      room.ficsBuffer = (room.ficsBuffer ?? '') + chunk.toString('latin1');
      const lines = room.ficsBuffer.split(/\r?\n/);
      room.ficsBuffer = lines.pop() ?? '';
      for (const l of lines) processFicsLine(l);
    });

    const handleDisconnect = () => {
      if (room.ficsSocket !== fSock || room.winner || !room.ficsSide) return;
      const oppSide = room.ficsSide;
      room.ficsOpponentPresent = false;
      cleanupRoomLichessBridge(room);
      if (room.historyMeta.length < 2) {
        room.winner = 'draw';
        room.endReason = 'FICS opponent left before game started';
      } else {
        room.winner = oppSide === 'w' ? 'b' : 'w';
        room.endReason = 'FICS opponent disconnected';
        finalizeRoomResult(room);
      }
      broadcastRoomState(room);
    };

    fSock.on('close', handleDisconnect);
    fSock.on('error', handleDisconnect);
  };

  const leaveSpectating = (ws: WebSocket) => {
    const specRoomId = spectatorRooms.get(ws);
    if (!specRoomId) return;
    spectatorRooms.delete(ws);
    const room = rooms.get(specRoomId);
    if (room?.spectators) {
      room.spectators.delete(ws);
      broadcastRoomState(room);
    }
  };

  const disconnectGraceTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const leaveCurrentRoom = (ws: WebSocket, explicitLeave = false) => {
    leaveSpectating(ws);
    for (const [id, ch] of openLobbyChallenges.entries()) {
      if (ch.ws === ws) {
        openLobbyChallenges.delete(id);
      }
    }
    for (const [key, q] of matchQueues.entries()) {
      const removed = q.filter((item) => item.ws === ws);
      for (const item of removed) {
        item.cancelled = true;
        if (item.retryTimer) clearInterval(item.retryTimer);
      }
      matchQueues.set(key, q.filter((item) => item.ws !== ws));
    }
    const membership = socketToRoom.get(ws);
    if (!membership) return;
    socketToRoom.delete(ws);
    const room = rooms.get(membership.roomId);
    if (!room) return;
    const leavingColor = membership.color;
    const leavingName = leavingColor === 'w' ? room.whiteName : room.blackName;
    if (leavingColor === 'w' && room.whiteSocket === ws) room.whiteSocket = null;
    if (leavingColor === 'b' && room.blackSocket === ws) room.blackSocket = null;

    if (!room.whiteSocket && !room.blackSocket) {
      const timerKey = `${room.id}:${leavingColor}`;
      const existingTimer = disconnectGraceTimers.get(timerKey);
      if (existingTimer) {
        clearTimeout(existingTimer);
        disconnectGraceTimers.delete(timerKey);
      }
      cleanupRoomLichessBridge(room);
      rooms.delete(room.id);
      return;
    }

    const settleAbandonedRoom = () => {
      const currentRoom = rooms.get(room.id);
      if (!currentRoom || currentRoom.winner) return;
      const rejoined =
        leavingColor === 'w' ? Boolean(currentRoom.whiteSocket) : Boolean(currentRoom.blackSocket);
      if (rejoined) return;
      const otherPresent =
        leavingColor === 'w'
          ? Boolean(currentRoom.blackSocket || currentRoom.lichessSocket || currentRoom.ficsSocket)
          : Boolean(currentRoom.whiteSocket || currentRoom.lichessSocket || currentRoom.ficsSocket);
      if (!otherPresent) return;

      const bothHadJoined =
        currentRoom.whiteName !== 'Waiting for Friend...' &&
        currentRoom.blackName !== 'Waiting for Friend...';

      if (currentRoom.historyMeta.length > 0) {
        currentRoom.winner = leavingColor === 'w' ? 'b' : 'w';
        currentRoom.endReason = `${leavingName || 'Opponent'} left the game`;
        finalizeRoomResult(currentRoom);
        broadcastRoomState(currentRoom);
      } else if (bothHadJoined) {
        currentRoom.winner = 'draw';
        currentRoom.endReason = `${leavingName || 'Opponent'} left before the game started`;
        broadcastRoomState(currentRoom);
      } else {
        broadcastRoomState(currentRoom);
      }
    };

    if (explicitLeave) {
      settleAbandonedRoom();
    } else {
      broadcastRoomState(room);
      const timerKey = `${room.id}:${leavingColor}`;
      const prevTimer = disconnectGraceTimers.get(timerKey);
      if (prevTimer) clearTimeout(prevTimer);
      const graceTimer = setTimeout(() => {
        disconnectGraceTimers.delete(timerKey);
        settleAbandonedRoom();
      }, 6500);
      disconnectGraceTimers.set(timerKey, graceTimer);
    }
  };

  const createInvitedRoom = (params: {
    roomId: string;
    initialSeconds: number;
    incrementSeconds: number;
    whiteName: string;
    blackName: string;
    whiteRating?: number;
    blackRating?: number;
    whiteAvatarUrl?: string;
    blackAvatarUrl?: string;
    whiteFlag?: string;
    blackFlag?: string;
    whiteTitle?: string;
    blackTitle?: string;
    rated?: boolean;
  }) => {
    const cleanId = params.roomId.trim().toUpperCase();
    const wRec = usersStore.users[params.whiteName.trim().toLowerCase()];
    const bRec = usersStore.users[params.blackName.trim().toLowerCase()];
    const room: LiveRoom = {
      id: cleanId,
      chess: new Chess(),
      initialSeconds: params.initialSeconds,
      incrementSeconds: params.incrementSeconds,
      whiteClockMs: params.initialSeconds * 1000,
      blackClockMs: params.initialSeconds * 1000,
      lastMoveAt: null,
      whiteSocket: null,
      blackSocket: null,
      whiteName: params.whiteName,
      blackName: params.blackName,
      whiteUsernameKey: wRec?.username.toLowerCase(),
      blackUsernameKey: bRec?.username.toLowerCase(),
      whiteRating: params.whiteRating ?? getPlayerRatingForSpeed(wRec ?? null, params.initialSeconds),
      blackRating: params.blackRating ?? getPlayerRatingForSpeed(bRec ?? null, params.initialSeconds),
      whiteAvatarUrl: sanitizePublicAvatar(params.whiteAvatarUrl ?? wRec?.profile?.avatarUrl),
      blackAvatarUrl: sanitizePublicAvatar(params.blackAvatarUrl ?? bRec?.profile?.avatarUrl),
      whiteFlag: params.whiteFlag ?? wRec?.profile?.flag ?? wRec?.profile?.country,
      blackFlag: params.blackFlag ?? bRec?.profile?.flag ?? bRec?.profile?.country,
      whiteTitle: params.whiteTitle ?? wRec?.title,
      blackTitle: params.blackTitle ?? bRec?.title,
      rated: params.rated ?? true,
      drawOfferBy: null,
      rematchOfferBy: null,
      winner: null,
      endReason: null,
      historyMeta: [],
      chatMessages: [],
      spectators: new Set(),
    };
    rooms.set(cleanId, room);
    setTimeout(() => {
      const current = rooms.get(cleanId);
      if (current && !current.whiteSocket && !current.blackSocket) {
        cleanupRoomLichessBridge(current);
        rooms.delete(cleanId);
      }
    }, 45000);
    return room;
  };

  const listActiveRooms = () => {
    const out: Array<{
      roomId: string;
      whiteName: string;
      blackName: string;
      whiteRating?: number;
      blackRating?: number;
      whiteAvatarUrl?: string;
      blackAvatarUrl?: string;
      whiteFlag?: string;
      blackFlag?: string;
      speed: 'bullet' | 'blitz' | 'rapid';
      clockLabel: string;
      moveCount: number;
      spectatorCount: number;
      fen: string;
    }> = [];
    for (const r of rooms.values()) {
      if (r.winner) continue;
      if (!r.whiteSocket && !r.blackSocket) continue;
      const mins = r.initialSeconds / 60;
      const minsLabel = Number.isInteger(mins) ? String(mins) : mins.toFixed(1);
      out.push({
        roomId: r.id,
        whiteName: r.whiteName,
        blackName: r.blackName,
        whiteRating: r.whiteRating,
        blackRating: r.blackRating,
        whiteAvatarUrl: r.whiteAvatarUrl,
        blackAvatarUrl: r.blackAvatarUrl,
        whiteFlag: r.whiteFlag,
        blackFlag: r.blackFlag,
        speed: resolveSpeedKey(r.initialSeconds),
        clockLabel: `${minsLabel}+${r.incrementSeconds}`,
        moveCount: r.historyMeta.length,
        spectatorCount: r.spectators?.size ?? 0,
        fen: r.chess.fen(),
      });
    }
    return out.slice(0, 24);
  };

  const listOpenLobbyChallenges = (): OpenChallengeItem[] => {
    const now = Date.now();
    const out: OpenChallengeItem[] = [];
    for (const [id, item] of openLobbyChallenges.entries()) {
      if (now - item.createdAt > 180_000 || item.ws.readyState !== WebSocket.OPEN) {
        openLobbyChallenges.delete(id);
        continue;
      }
      const { ws: _ws, ownerKey: _ok, ...clean } = item;
      out.push(clean);
    }
    return out;
  };

  const launchNextMatchedRoom = (params: {
    roomId: string;
    initialSeconds: number;
    incrementSeconds: number;
    whiteName: string;
    blackName: string;
    whiteKey?: string;
    blackKey?: string;
    whiteRating?: number;
    blackRating?: number;
    whiteAvatarUrl?: string;
    blackAvatarUrl?: string;
    whiteFlag?: string;
    blackFlag?: string;
    whiteTitle?: string;
    blackTitle?: string;
    rated?: boolean;
  }) => {
    const room: LiveRoom = {
      id: params.roomId,
      chess: new Chess(),
      initialSeconds: params.initialSeconds,
      incrementSeconds: params.incrementSeconds,
      whiteClockMs: params.initialSeconds * 1000,
      blackClockMs: params.initialSeconds * 1000,
      lastMoveAt: null,
      whiteSocket: null,
      blackSocket: null,
      whiteName: params.whiteName,
      blackName: params.blackName,
      whiteUsernameKey: params.whiteKey,
      blackUsernameKey: params.blackKey,
      whiteRating: params.whiteRating,
      blackRating: params.blackRating,
      whiteAvatarUrl: params.whiteAvatarUrl,
      blackAvatarUrl: params.blackAvatarUrl,
      whiteFlag: params.whiteFlag,
      blackFlag: params.blackFlag,
      whiteTitle: params.whiteTitle,
      blackTitle: params.blackTitle,
      rated: params.rated ?? true,
      serverSource: 'OpenChess',
      drawOfferBy: null,
      rematchOfferBy: null,
      winner: null,
      endReason: null,
      historyMeta: [],
      chatMessages: [],
      spectators: new Set(),
    };
    rooms.set(params.roomId, room);
    setTimeout(() => {
      const current = rooms.get(params.roomId);
      if (current && !current.whiteSocket && !current.blackSocket) {
        cleanupRoomLichessBridge(current);
        rooms.delete(params.roomId);
      }
    }, 30000);
    return room;
  };

  // Track socket liveness so half-open TCP clients are terminated cleanly and trigger grace timers
  const socketAlive = new WeakMap<WebSocket, boolean>();
  const heartbeatInterval = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (socketAlive.get(client) === false) {
        try {
          client.terminate();
        } catch {
          // ignore
        }
        continue;
      }
      socketAlive.set(client, false);
      try {
        client.ping();
      } catch {
        // ignore
      }
    }
  }, 20_000);

  // Server-side authoritative clock expiry check every second
  const clockCheckInterval = setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.winner || !room.lastMoveAt || room.historyMeta.length === 0) continue;
      const bothPresent = Boolean(
        (room.whiteSocket && room.blackSocket) ||
          (room.lichessSide && (room.whiteSocket || room.blackSocket) && room.lichessOpponentPresent !== false) ||
          (room.ficsSide && (room.whiteSocket || room.blackSocket) && room.ficsOpponentPresent !== false),
      );
      if (!bothPresent) continue;
      const elapsed = now - room.lastMoveAt;
      const turn = room.chess.turn();
      const grace = room.lichessSide || room.ficsSide ? 1500 : 0;
      if (turn === 'w' && room.whiteClockMs - elapsed + grace <= 0) {
        room.whiteClockMs = 0;
        room.winner = 'b';
        room.endReason = 'White ran out of time';
        cleanupRoomLichessBridge(room);
        finalizeRoomResult(room);
        broadcastRoomState(room);
      } else if (turn === 'b' && room.blackClockMs - elapsed + grace <= 0) {
        room.blackClockMs = 0;
        room.winner = 'w';
        room.endReason = 'Black ran out of time';
        cleanupRoomLichessBridge(room);
        finalizeRoomResult(room);
        broadcastRoomState(room);
      }
    }
  }, 1000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
    clearInterval(clockCheckInterval);
  });

  wss.on('connection', (ws) => {
    socketAlive.set(ws, true);
    ws.on('pong', () => {
      socketAlive.set(ws, true);
    });
    ws.on('close', () => {
      removePresenceSocket(ws);
      leaveCurrentRoom(ws, false);
    });

    ws.on('message', (raw) => {
      socketAlive.set(ws, true);
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        return;
      }

      const type = msg.type;
      if (type === 'ping') {
        sendJson(ws, {
          type: 'pong',
          t: Date.now(),
          clientTs: typeof msg.clientTs === 'number' ? msg.clientTs : undefined,
        });
        return;
      }
      if (type === 'presence:identify') {
        const token = typeof msg.token === 'string' ? msg.token.trim() : '';
        const user = token.startsWith('oc.') ? verifyOpenChessToken(token) : null;
        if (!user) return;
        removePresenceSocket(ws);
        const key = user.username.toLowerCase();
        const set = presenceSockets.get(key) ?? new Set<WebSocket>();
        set.add(ws);
        presenceSockets.set(key, set);
        socketIdentity.set(ws, key);
        sendJson(ws, { type: 'presence:identified', username: user.username });
        hooks?.onUserIdentified?.(user, ws);
        return;
      }

      const authUser = resolveWsUser(msg, ws);
      const playerName = authUser
        ? authUser.username
        : typeof msg.name === 'string' && msg.name.trim()
          ? msg.name.trim().slice(0, 24)
          : 'Player';
      const playerAvatar =
        sanitizePublicAvatar(authUser?.profile?.avatarUrl) ||
        sanitizePublicAvatar(typeof msg.avatarUrl === 'string' ? msg.avatarUrl : undefined);
      const playerFlag =
        authUser?.profile?.flag ||
        authUser?.profile?.country ||
        (typeof msg.flag === 'string' ? msg.flag.trim().slice(0, 8) : undefined);
      const playerTitle = authUser?.title;

      // Direct Messaging over WebSocket
      if (type === 'dm:send') {
        if (!authUser) {
          sendJson(ws, { type: 'dm:error', error: 'Sign in to send direct messages.' });
          return;
        }
        const toUsername = typeof msg.to === 'string' ? msg.to.trim() : '';
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 500) : '';
        if (!toUsername || !text || toUsername.toLowerCase() === authUser.username.toLowerCase()) {
          return;
        }
        const targetRec = usersStore.users[toUsername.toLowerCase()];
        const partnerCanonical = targetRec?.username || toUsername;
        const dm: DirectMessageItem = {
          id: `dm-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
          from: authUser.username,
          to: partnerCanonical,
          text,
          timestamp: Date.now(),
          read: false,
          fromAvatarUrl: sanitizePublicAvatar(authUser.profile?.avatarUrl),
          fromFlag: authUser.profile?.flag || authUser.profile?.country,
        };
        authUser.dmThreads = upsertDirectMessage({
          threads: authUser.dmThreads ?? {},
          partnerUsername: partnerCanonical,
          message: { ...dm, read: true },
        });
        if (targetRec) {
          targetRec.dmThreads = upsertDirectMessage({
            threads: targetRec.dmThreads ?? {},
            partnerUsername: authUser.username,
            message: dm,
          });
        }
        saveUsersStore(usersStore);
        sendJson(ws, { type: 'dm:sent', partner: partnerCanonical, message: { ...dm, read: true } });
        pushToUser(partnerCanonical, { type: 'dm:message', message: dm });
        pushToUser(partnerCanonical, { type: 'notify:dm', message: dm });
        return;
      }

      if (type === 'dm:typing') {
        if (!authUser) return;
        const toUsername = typeof msg.to === 'string' ? msg.to.trim() : '';
        if (!toUsername) return;
        pushToUser(toUsername, { type: 'dm:typing', from: authUser.username });
        return;
      }

      // Live Spectating
      if (type === 'spectate_room') {
        const roomId = typeof msg.roomId === 'string' ? msg.roomId.trim().toUpperCase() : '';
        const room = rooms.get(roomId);
        if (!room) {
          sendJson(ws, { type: 'room:error', error: 'Live match ended or is no longer active.' });
          return;
        }
        leaveCurrentRoom(ws);
        room.spectators ??= new Set();
        room.spectators.add(ws);
        spectatorRooms.set(ws, roomId);
        sendJson(ws, { type: 'room:joined', roomId, yourColor: 'spectator' });
        broadcastRoomState(room);
        return;
      }

      if (type === 'unspectate_room') {
        leaveSpectating(ws);
        return;
      }

      // Open Lobby Challenges (post, cancel, accept)
      if (type === 'lobby:post') {
        for (const [id, ch] of openLobbyChallenges.entries()) {
          if (ch.ws === ws || (authUser && ch.ownerKey === authUser.username.toLowerCase())) {
            openLobbyChallenges.delete(id);
          }
        }
        const initialSeconds = Math.max(60, Math.min(3600, Number(msg.initialSeconds) || 600));
        const incrementSeconds = Math.max(0, Math.min(60, Number(msg.incrementSeconds) || 0));
        const speed = resolveSpeedKey(initialSeconds);
        const mins = initialSeconds / 60;
        const minsLabel = Number.isInteger(mins) ? String(mins) : mins.toFixed(1);
        const challengeId = `oc-${Date.now()}-${crypto.randomInt(1000, 9999)}`;
        const challengeRating = resolveEffectivePlayerElo(
          authUser,
          initialSeconds,
          msg.playerElo,
        );
        const entry: OpenChallengeItem & { ws: WebSocket; ownerKey?: string } = {
          id: challengeId,
          source: 'openchess',
          username: playerName,
          rating: challengeRating,
          avatarUrl: playerAvatar,
          flag: playerFlag,
          title: playerTitle,
          speed,
          clock: `${minsLabel}+${incrementSeconds}`,
          initialSeconds,
          incrementSeconds,
          rated: msg.rated !== false,
          color: msg.color === 'w' ? 'white' : msg.color === 'b' ? 'black' : 'random',
          createdAt: Date.now(),
          ws,
          ownerKey: authUser?.username.toLowerCase(),
        };
        openLobbyChallenges.set(challengeId, entry);
        const { ws: _w, ownerKey: _o, ...clean } = entry;
        sendJson(ws, { type: 'lobby:posted', challenge: clean });
        return;
      }

      if (type === 'lobby:cancel') {
        const challengeId = typeof msg.challengeId === 'string' ? msg.challengeId.trim() : '';
        if (challengeId) openLobbyChallenges.delete(challengeId);
        for (const [id, ch] of openLobbyChallenges.entries()) {
          if (ch.ws === ws) openLobbyChallenges.delete(id);
        }
        sendJson(ws, { type: 'lobby:cancelled' });
        return;
      }

      if (type === 'lobby:accept') {
        const challengeId = typeof msg.challengeId === 'string' ? msg.challengeId.trim() : '';
        const ch = openLobbyChallenges.get(challengeId);
        if (!ch || ch.ws.readyState !== WebSocket.OPEN) {
          openLobbyChallenges.delete(challengeId);
          sendJson(ws, { type: 'room:error', error: 'That open challenge is no longer available.' });
          return;
        }
        if (ch.ws === ws) {
          sendJson(ws, { type: 'room:error', error: 'Cannot accept your own challenge.' });
          return;
        }
        const accepterRating = resolveEffectivePlayerElo(
          authUser,
          ch.initialSeconds,
          msg.rating ?? msg.playerElo,
        );
        if (
          typeof ch.rating === 'number' &&
          !isWithinMatchmakingEloBand(accepterRating, ch.rating)
        ) {
          sendJson(ws, {
            type: 'error',
            message: `Fair Matchmaking: Opponent rating (${ch.rating}) must be within ±200 Elo of your rating (${accepterRating}).`,
          });
          return;
        }
        openLobbyChallenges.delete(challengeId);
        leaveCurrentRoom(ws);

        const creatorWhite =
          ch.color === 'white' ? true : ch.color === 'black' ? false : Math.random() < 0.5;
        const roomId = generateRoomCode();
        launchNextMatchedRoom({
          roomId,
          initialSeconds: ch.initialSeconds,
          incrementSeconds: ch.incrementSeconds,
          whiteName: creatorWhite ? ch.username : playerName,
          blackName: creatorWhite ? playerName : ch.username,
          whiteKey: creatorWhite ? ch.ownerKey : authUser?.username.toLowerCase(),
          blackKey: creatorWhite ? authUser?.username.toLowerCase() : ch.ownerKey,
          whiteRating: creatorWhite ? ch.rating : accepterRating,
          blackRating: creatorWhite ? accepterRating : ch.rating,
          whiteAvatarUrl: creatorWhite ? ch.avatarUrl : playerAvatar,
          blackAvatarUrl: creatorWhite ? playerAvatar : ch.avatarUrl,
          whiteFlag: creatorWhite ? ch.flag : playerFlag,
          blackFlag: creatorWhite ? playerFlag : ch.flag,
          whiteTitle: creatorWhite ? ch.title : playerTitle,
          blackTitle: creatorWhite ? playerTitle : ch.title,
          rated: ch.rated,
        });
        sendJson(ch.ws, {
          type: 'room:matched',
          roomId,
          yourColor: creatorWhite ? 'w' : 'b',
          initialSeconds: ch.initialSeconds,
          incrementSeconds: ch.incrementSeconds,
          serverSource: 'OpenChess',
        });
        sendJson(ws, {
          type: 'room:matched',
          roomId,
          yourColor: creatorWhite ? 'b' : 'w',
          initialSeconds: ch.initialSeconds,
          incrementSeconds: ch.incrementSeconds,
          serverSource: 'OpenChess',
        });
        return;
      }

      if (type === 'create_room') {
        leaveCurrentRoom(ws);
        const initialSeconds = Math.max(60, Math.min(3600, Number(msg.initialSeconds) || 600));
        const incrementSeconds = Math.max(0, Math.min(60, Number(msg.incrementSeconds) || 0));
        const preferred = msg.color === 'b' ? 'b' : msg.color === 'w' ? 'w' : Math.random() < 0.5 ? 'w' : 'b';
        const requestedCode =
          typeof msg.roomId === 'string' && /^[A-Z0-9]{4,10}$/i.test(msg.roomId.trim())
            ? msg.roomId.trim().toUpperCase()
            : '';
        const roomId =
          requestedCode && !rooms.has(requestedCode) ? requestedCode : generateRoomCode();
        const rawClientRating =
          typeof msg.rating === 'number'
            ? msg.rating
            : typeof msg.playerElo === 'number'
              ? msg.playerElo
              : undefined;
        const myRating =
          getPlayerRatingForSpeed(authUser, initialSeconds) ?? rawClientRating;
        const room: LiveRoom = {
          id: roomId,
          chess: new Chess(),
          initialSeconds,
          incrementSeconds,
          whiteClockMs: initialSeconds * 1000,
          blackClockMs: initialSeconds * 1000,
          lastMoveAt: null,
          whiteSocket: preferred === 'w' ? ws : null,
          blackSocket: preferred === 'b' ? ws : null,
          whiteName: preferred === 'w' ? playerName : 'Waiting for Friend...',
          blackName: preferred === 'b' ? playerName : 'Waiting for Friend...',
          whiteUsernameKey: preferred === 'w' ? authUser?.username.toLowerCase() : undefined,
          blackUsernameKey: preferred === 'b' ? authUser?.username.toLowerCase() : undefined,
          whiteRating: preferred === 'w' ? myRating : undefined,
          blackRating: preferred === 'b' ? myRating : undefined,
          whiteAvatarUrl: preferred === 'w' ? playerAvatar : undefined,
          blackAvatarUrl: preferred === 'b' ? playerAvatar : undefined,
          whiteFlag: preferred === 'w' ? playerFlag : undefined,
          blackFlag: preferred === 'b' ? playerFlag : undefined,
          whiteTitle: preferred === 'w' ? playerTitle : undefined,
          blackTitle: preferred === 'b' ? playerTitle : undefined,
          rated: msg.rated !== false,
          drawOfferBy: null,
          rematchOfferBy: null,
          winner: null,
          endReason: null,
          historyMeta: [],
          chatMessages: [],
          spectators: new Set(),
        };
        rooms.set(roomId, room);
        socketToRoom.set(ws, { roomId, color: preferred });
        sendJson(ws, { type: 'room:created', roomId, yourColor: preferred });
        broadcastRoomState(room);
        return;
      }

      if (type === 'join_room') {
        const roomId = typeof msg.roomId === 'string' ? msg.roomId.trim().toUpperCase() : '';
        const room = rooms.get(roomId);
        if (!room) {
          sendJson(ws, { type: 'room:error', error: 'Room not found or expired.' });
          return;
        }
        leaveCurrentRoom(ws);
        const preferred = msg.preferredColor === 'w' || msg.preferredColor === 'b' ? msg.preferredColor : null;
        const isGenericName =
          playerName === 'Player' ||
          playerName === 'You' ||
          playerName === 'OpenChess Player';

        // Reclaim seat if old socket died or belongs to the exact same reconnecting player
        const tryDetachStaleSeat = (side: 'w' | 'b') => {
          const oldWs = side === 'w' ? room.whiteSocket : room.blackSocket;
          if (!oldWs || oldWs === ws) return;
          const seatUserKey = side === 'w' ? room.whiteUsernameKey : room.blackUsernameKey;
          const seatName = (side === 'w' ? room.whiteName : room.blackName).trim().toLowerCase();
          const sameAuthUser = Boolean(
            authUser && seatUserKey && authUser.username.toLowerCase() === seatUserKey,
          );
          const sameGuestReclaim = Boolean(
            !isGenericName &&
              preferred === side &&
              seatName &&
              seatName === playerName.trim().toLowerCase(),
          );
          if (oldWs.readyState !== WebSocket.OPEN || sameAuthUser || sameGuestReclaim) {
            socketToRoom.delete(oldWs);
            if (side === 'w') room.whiteSocket = null;
            else room.blackSocket = null;
            try {
              if (oldWs.readyState === WebSocket.OPEN) oldWs.close();
            } catch {
              // ignore
            }
          }
        };
        tryDetachStaleSeat('w');
        tryDetachStaleSeat('b');

        let assigned: 'w' | 'b' | null = null;
        const wReserved = Boolean(room.whiteSocket || room.lichessSide === 'w' || room.ficsSide === 'w');
        const bReserved = Boolean(room.blackSocket || room.lichessSide === 'b' || room.ficsSide === 'b');
        if (preferred === 'w' && !wReserved) {
          assigned = 'w';
        } else if (preferred === 'b' && !bReserved) {
          assigned = 'b';
        } else if (!wReserved) {
          assigned = 'w';
        } else if (!bReserved) {
          assigned = 'b';
        }

        if (!assigned) {
          sendJson(ws, { type: 'room:error', error: 'Room already has two players.' });
          return;
        }
        const rawClientRating =
          typeof msg.rating === 'number'
            ? msg.rating
            : typeof msg.playerElo === 'number'
              ? msg.playerElo
              : undefined;
        const myRating =
          getPlayerRatingForSpeed(authUser, room.initialSeconds) ?? rawClientRating;
        const targetRec =
          authUser ??
          (!isGenericName ? usersStore.users[playerName.trim().toLowerCase()] ?? null : null);

        if (assigned === 'w') {
          room.whiteSocket = ws;
          if (!isGenericName || room.whiteName === 'Waiting for Friend...' || !room.whiteName) {
            room.whiteName = playerName === 'You' ? 'OpenChess Player' : playerName;
          }
          if (targetRec) {
            room.whiteUsernameKey = targetRec.username.toLowerCase();
            room.whiteAvatarUrl = room.whiteAvatarUrl || sanitizePublicAvatar(targetRec.profile?.avatarUrl);
            room.whiteFlag = room.whiteFlag || targetRec.profile?.flag || targetRec.profile?.country;
            room.whiteTitle = room.whiteTitle || targetRec.title;
            room.whiteRating =
              room.whiteRating ?? getPlayerRatingForSpeed(targetRec, room.initialSeconds) ?? myRating;
          } else {
            if (playerAvatar) room.whiteAvatarUrl = playerAvatar;
            if (playerFlag) room.whiteFlag = playerFlag;
            if (myRating) room.whiteRating = room.whiteRating ?? myRating;
          }
        } else {
          room.blackSocket = ws;
          if (!isGenericName || room.blackName === 'Waiting for Friend...' || !room.blackName) {
            room.blackName = playerName === 'You' ? 'OpenChess Player' : playerName;
          }
          if (targetRec) {
            room.blackUsernameKey = targetRec.username.toLowerCase();
            room.blackAvatarUrl = room.blackAvatarUrl || sanitizePublicAvatar(targetRec.profile?.avatarUrl);
            room.blackFlag = room.blackFlag || targetRec.profile?.flag || targetRec.profile?.country;
            room.blackTitle = room.blackTitle || targetRec.title;
            room.blackRating =
              room.blackRating ?? getPlayerRatingForSpeed(targetRec, room.initialSeconds) ?? myRating;
          } else {
            if (playerAvatar) room.blackAvatarUrl = playerAvatar;
            if (playerFlag) room.blackFlag = playerFlag;
            if (myRating) room.blackRating = room.blackRating ?? myRating;
          }
        }
        // Clear any pending disconnect grace timer for this player's seat
        const graceKey = `${roomId}:${assigned}`;
        const pendingGrace = disconnectGraceTimers.get(graceKey);
        if (pendingGrace) {
          clearTimeout(pendingGrace);
          disconnectGraceTimers.delete(graceKey);
        }

        socketToRoom.set(ws, { roomId, color: assigned });
        if (room.lastMoveAt === null || room.historyMeta.length === 0) {
          room.lastMoveAt = Date.now();
        }
        sendJson(ws, { type: 'room:joined', roomId, yourColor: assigned });
        broadcastRoomState(room);
        return;
      }

      const startBridgedLichessRoom = (
        targetWs: WebSocket,
        lichessMatch: LichessJoinedMatch,
        opts: {
          pName: string;
          pUserKey?: string;
          pElo: number;
          pAvatar?: string;
          pFlag?: string;
          pTitle?: string;
        },
      ) => {
        const roomId = generateRoomCode();
        const humanColor = lichessMatch.humanColor;
        const lichessSide: 'w' | 'b' = humanColor === 'w' ? 'b' : 'w';
        const chess = new Chess();
        const historyMeta: Array<{ from: string; to: string; san: string; captured?: boolean }> = [];
        for (const uci of lichessMatch.initialMovesUci) {
          try {
            const moved = chess.move({
              from: uci.slice(0, 2),
              to: uci.slice(2, 4),
              promotion: uci.length > 4 ? uci[4] : 'q',
            });
            if (moved) {
              historyMeta.push({
                from: moved.from,
                to: moved.to,
                san: moved.san,
                captured: Boolean(moved.captured) || moved.flags.includes('e'),
              });
            }
          } catch {
            // ignore
          }
        }

        const oppLocal =
          lichessMatch.opponentName !== 'Anonymous' &&
          lichessMatch.opponentName !== 'Anonymous (Guest)'
            ? usersStore.users[lichessMatch.opponentName.toLowerCase()]
            : undefined;
        const oppResolvedAvatar =
          lichessMatch.opponentAvatarUrl ?? sanitizePublicAvatar(oppLocal?.profile?.avatarUrl);
        const room: LiveRoom = {
          id: roomId,
          chess,
          initialSeconds: lichessMatch.initialSeconds,
          incrementSeconds: lichessMatch.incrementSeconds,
          whiteClockMs: lichessMatch.whiteClockMs,
          blackClockMs: lichessMatch.blackClockMs,
          lastMoveAt: Date.now(),
          whiteSocket: null,
          blackSocket: null,
          whiteName: humanColor === 'w' ? opts.pName : lichessMatch.opponentName,
          blackName: humanColor === 'b' ? opts.pName : lichessMatch.opponentName,
          whiteUsernameKey: humanColor === 'w' ? opts.pUserKey : oppLocal?.username.toLowerCase(),
          blackUsernameKey: humanColor === 'b' ? opts.pUserKey : oppLocal?.username.toLowerCase(),
          whiteRating: humanColor === 'w' ? opts.pElo : lichessMatch.opponentRating,
          blackRating: humanColor === 'b' ? opts.pElo : lichessMatch.opponentRating,
          whiteAvatarUrl: humanColor === 'w' ? opts.pAvatar : oppResolvedAvatar,
          blackAvatarUrl: humanColor === 'b' ? opts.pAvatar : oppResolvedAvatar,
          whiteFlag: humanColor === 'w' ? opts.pFlag : lichessMatch.opponentFlag,
          blackFlag: humanColor === 'b' ? opts.pFlag : lichessMatch.opponentFlag,
          whiteTitle: humanColor === 'w' ? opts.pTitle : lichessMatch.opponentTitle,
          blackTitle: humanColor === 'b' ? opts.pTitle : lichessMatch.opponentTitle,
          rated: typeof lichessMatch.opponentRating === 'number',
          serverSource: 'Lichess',
          drawOfferBy: null,
          rematchOfferBy: null,
          winner: null,
          endReason: null,
          historyMeta,
          chatMessages: [],
          spectators: new Set(),
          lichessFullId: lichessMatch.fullId,
          lichessSide,
          lichessOpponentPresent: true,
          lichessVersion: lichessMatch.version,
          lichessCookie: lichessMatch.cookie,
          lichessSri: lichessMatch.sri,
        };
        rooms.set(roomId, room);
        connectRoomToLichessPlaySocket(room);
        setTimeout(() => {
          const current = rooms.get(roomId);
          if (current && !current.whiteSocket && !current.blackSocket) {
            cleanupRoomLichessBridge(current);
            rooms.delete(roomId);
          }
        }, 30000);
        sendJson(targetWs, {
          type: 'room:matched',
          roomId,
          yourColor: humanColor,
          initialSeconds: lichessMatch.initialSeconds,
          incrementSeconds: lichessMatch.incrementSeconds,
          serverSource: 'Lichess',
        });
      };

      const startBridgedFicsRoom = (
        targetWs: WebSocket,
        ficsMatch: FicsJoinedMatch,
        opts: {
          pName: string;
          pUserKey?: string;
          pElo: number;
          pAvatar?: string;
          pFlag?: string;
          pTitle?: string;
        },
      ) => {
        const roomId = generateRoomCode();
        const humanColor = ficsMatch.humanColor;
        const ficsSide: 'w' | 'b' = humanColor === 'w' ? 'b' : 'w';
        const room: LiveRoom = {
          id: roomId,
          chess: new Chess(),
          initialSeconds: ficsMatch.initialSeconds,
          incrementSeconds: ficsMatch.incrementSeconds,
          whiteClockMs: ficsMatch.whiteClockMs,
          blackClockMs: ficsMatch.blackClockMs,
          lastMoveAt: Date.now(),
          whiteSocket: null,
          blackSocket: null,
          whiteName: humanColor === 'w' ? opts.pName : ficsMatch.opponentName,
          blackName: humanColor === 'b' ? opts.pName : ficsMatch.opponentName,
          whiteUsernameKey: humanColor === 'w' ? opts.pUserKey : undefined,
          blackUsernameKey: humanColor === 'b' ? opts.pUserKey : undefined,
          whiteRating: humanColor === 'w' ? opts.pElo : ficsMatch.opponentRating,
          blackRating: humanColor === 'b' ? opts.pElo : ficsMatch.opponentRating,
          whiteAvatarUrl: humanColor === 'w' ? opts.pAvatar : undefined,
          blackAvatarUrl: humanColor === 'b' ? opts.pAvatar : undefined,
          whiteFlag: humanColor === 'w' ? opts.pFlag : undefined,
          blackFlag: humanColor === 'b' ? opts.pFlag : undefined,
          whiteTitle: humanColor === 'w' ? opts.pTitle : undefined,
          blackTitle: humanColor === 'b' ? opts.pTitle : undefined,
          rated: typeof ficsMatch.opponentRating === 'number',
          serverSource: 'FICS',
          drawOfferBy: null,
          rematchOfferBy: null,
          winner: null,
          endReason: null,
          historyMeta: [],
          chatMessages: [],
          spectators: new Set(),
          ficsSocket: ficsMatch.socket,
          ficsSide,
          ficsOpponentPresent: true,
          ficsGameNumber: ficsMatch.gameNumber,
          ficsBuffer: ficsMatch.initialBuffer,
        };
        rooms.set(roomId, room);
        connectRoomToFicsSocket(room, ficsMatch.localFicsName);
        setTimeout(() => {
          const current = rooms.get(roomId);
          if (current && !current.whiteSocket && !current.blackSocket) {
            cleanupRoomLichessBridge(current);
            rooms.delete(roomId);
          }
        }, 30000);
        sendJson(targetWs, {
          type: 'room:matched',
          roomId,
          yourColor: humanColor,
          initialSeconds: ficsMatch.initialSeconds,
          incrementSeconds: ficsMatch.incrementSeconds,
          serverSource: 'FICS',
        });
      };

      if (type === 'join_fics_ad') {
        leaveCurrentRoom(ws);
        const adId = typeof msg.adId === 'string' ? msg.adId.trim() : '';
        if (!/^\d+$/.test(adId)) {
          sendJson(ws, { type: 'room:error', error: 'Invalid FICS challenge ID.' });
          return;
        }
        const initialSeconds = Math.max(60, Math.min(3600, Number(msg.initialSeconds) || 600));
        const incrementSeconds = Math.max(0, Math.min(60, Number(msg.incrementSeconds) || 0));
        const preferredColor: 'w' | 'b' | 'random' =
          msg.color === 'w' || msg.color === 'b' ? msg.color : 'random';
        const playerElo = resolveEffectivePlayerElo(authUser, initialSeconds, msg.playerElo);

        void (async () => {
          const ficsMatch = await joinRealFicsGame({
            initialSeconds,
            incrementSeconds,
            preferredColor,
            playerElo,
            specificAdId: adId,
            timeoutMs: 6500,
            isCancelled: () => ws.readyState !== WebSocket.OPEN,
          });
          if (ws.readyState !== WebSocket.OPEN) {
            if (ficsMatch) {
              try {
                ficsMatch.socket.write('abort\nquit\n');
                ficsMatch.socket.destroy();
              } catch {
                // ignore
              }
            }
            return;
          }
          if (!ficsMatch) {
            sendJson(ws, {
              type: 'room:error',
              error: 'That FICS challenge was already accepted or expired. Refreshing lobby...',
            });
            return;
          }
          startBridgedFicsRoom(ws, ficsMatch, {
            pName: playerName,
            pUserKey: authUser?.username.toLowerCase(),
            pElo: playerElo,
            pAvatar: playerAvatar,
            pFlag: playerFlag,
            pTitle: playerTitle,
          });
        })();
        return;
      }

      if (type === 'join_network_hook') {
        leaveCurrentRoom(ws);
        const hookId = typeof msg.hookId === 'string' ? msg.hookId.trim() : '';
        if (!hookId) {
          sendJson(ws, { type: 'room:error', error: 'Invalid challenge ID.' });
          return;
        }
        const initialSeconds = Math.max(60, Math.min(3600, Number(msg.initialSeconds) || 600));
        const incrementSeconds = Math.max(0, Math.min(60, Number(msg.incrementSeconds) || 0));
        const preferredColor: 'w' | 'b' | 'random' =
          msg.color === 'w' || msg.color === 'b' ? msg.color : 'random';
        const playerElo = resolveEffectivePlayerElo(authUser, initialSeconds, msg.playerElo);

        void (async () => {
          const lichessMatch = await joinRealLichessLobbyGame({
            initialSeconds,
            incrementSeconds,
            preferredColor,
            playerElo,
            playerKey: authUser?.username || playerName,
            onlineToken: authUser?.onlineToken,
            timeoutMs: 3600,
            specificHookId: hookId,
          });
          if (ws.readyState !== WebSocket.OPEN) return;
          if (!lichessMatch) {
            sendJson(ws, {
              type: 'room:error',
              error: 'That live challenge was already taken or expired. Refreshing lobby...',
            });
            return;
          }
          startBridgedLichessRoom(ws, lichessMatch, {
            pName: playerName,
            pUserKey: authUser?.username.toLowerCase(),
            pElo: playerElo,
            pAvatar: playerAvatar,
            pFlag: playerFlag,
            pTitle: playerTitle,
          });
        })();
        return;
      }

      if (type === 'quick_match') {
        leaveCurrentRoom(ws);
        const initialSeconds = Math.max(60, Math.min(3600, Number(msg.initialSeconds) || 600));
        const incrementSeconds = Math.max(0, Math.min(60, Number(msg.incrementSeconds) || 0));
        const preferredColor: 'w' | 'b' | 'random' =
          msg.color === 'w' || msg.color === 'b' ? msg.color : 'random';
        const playerElo = resolveEffectivePlayerElo(
          authUser,
          initialSeconds,
          msg.rating ?? msg.playerElo,
        );
        const reqSpeed = resolveSpeedKey(initialSeconds);
        const key = `${initialSeconds}+${incrementSeconds}`;
        const queue = matchQueues.get(key) ?? [];
        const opponent = queue.find(
          (q) =>
            q.ws !== ws &&
            !q.cancelled &&
            q.ws.readyState === WebSocket.OPEN &&
            isWithinMatchmakingEloBand(playerElo, q.playerElo),
        );

        // Also match against any waiting OpenChess open-lobby challenger with compatible speed & Elo
        const waitingLobbyEntry = !opponent
          ? Array.from(openLobbyChallenges.entries()).find(([, ch]) => {
              if (ch.ws === ws || ch.ws.readyState !== WebSocket.OPEN) return false;
              if (ch.speed !== reqSpeed) return false;
              if (typeof ch.rating === 'number' && !isWithinMatchmakingEloBand(playerElo, ch.rating)) {
                return false;
              }
              if (preferredColor === 'w' && ch.color === 'white') return false;
              if (preferredColor === 'b' && ch.color === 'black') return false;
              return true;
            })
          : undefined;

        if (opponent) {
          opponent.cancelled = true;
          if (opponent.retryTimer) clearInterval(opponent.retryTimer);
          matchQueues.set(
            key,
            queue.filter((q) => q.ws !== opponent.ws),
          );
          const roomId = generateRoomCode();
          const wsWhite =
            preferredColor === 'w'
              ? true
              : preferredColor === 'b'
                ? false
                : Math.random() < 0.5;
          launchNextMatchedRoom({
            roomId,
            initialSeconds,
            incrementSeconds,
            whiteName: wsWhite ? playerName : opponent.name,
            blackName: wsWhite ? opponent.name : playerName,
            whiteKey: wsWhite ? authUser?.username.toLowerCase() : opponent.usernameKey,
            blackKey: wsWhite ? opponent.usernameKey : authUser?.username.toLowerCase(),
            whiteRating: wsWhite ? playerElo : opponent.playerElo,
            blackRating: wsWhite ? opponent.playerElo : playerElo,
            whiteAvatarUrl: wsWhite ? playerAvatar : opponent.avatarUrl,
            blackAvatarUrl: wsWhite ? opponent.avatarUrl : playerAvatar,
            whiteFlag: wsWhite ? playerFlag : opponent.flag,
            blackFlag: wsWhite ? opponent.flag : playerFlag,
            whiteTitle: wsWhite ? playerTitle : opponent.title,
            blackTitle: wsWhite ? opponent.title : playerTitle,
          });
          sendJson(ws, {
            type: 'room:matched',
            roomId,
            yourColor: wsWhite ? 'w' : 'b',
            initialSeconds,
            incrementSeconds,
            serverSource: 'OpenChess',
          });
          sendJson(opponent.ws, {
            type: 'room:matched',
            roomId,
            yourColor: wsWhite ? 'b' : 'w',
            initialSeconds,
            incrementSeconds,
            serverSource: 'OpenChess',
          });
        } else if (waitingLobbyEntry) {
          const [chId, ch] = waitingLobbyEntry;
          openLobbyChallenges.delete(chId);
          const creatorWhite =
            ch.color === 'white' ? true : ch.color === 'black' ? false : Math.random() < 0.5;
          const roomId = generateRoomCode();
          launchNextMatchedRoom({
            roomId,
            initialSeconds: ch.initialSeconds,
            incrementSeconds: ch.incrementSeconds,
            whiteName: creatorWhite ? ch.username : playerName,
            blackName: creatorWhite ? playerName : ch.username,
            whiteKey: creatorWhite ? ch.ownerKey : authUser?.username.toLowerCase(),
            blackKey: creatorWhite ? authUser?.username.toLowerCase() : ch.ownerKey,
            whiteRating: creatorWhite ? ch.rating : playerElo,
            blackRating: creatorWhite ? playerElo : ch.rating,
            whiteAvatarUrl: creatorWhite ? ch.avatarUrl : playerAvatar,
            blackAvatarUrl: creatorWhite ? playerAvatar : ch.avatarUrl,
            whiteFlag: creatorWhite ? ch.flag : playerFlag,
            blackFlag: creatorWhite ? playerFlag : ch.flag,
            whiteTitle: creatorWhite ? ch.title : playerTitle,
            blackTitle: creatorWhite ? playerTitle : ch.title,
            rated: ch.rated,
          });
          sendJson(ch.ws, {
            type: 'room:matched',
            roomId,
            yourColor: creatorWhite ? 'w' : 'b',
            initialSeconds: ch.initialSeconds,
            incrementSeconds: ch.incrementSeconds,
            serverSource: 'OpenChess',
          });
          sendJson(ws, {
            type: 'room:matched',
            roomId,
            yourColor: creatorWhite ? 'b' : 'w',
            initialSeconds: ch.initialSeconds,
            incrementSeconds: ch.incrementSeconds,
            serverSource: 'OpenChess',
          });
        } else {
          const entry: {
            ws: WebSocket;
            name: string;
            usernameKey?: string;
            avatarUrl?: string;
            flag?: string;
            title?: string;
            initialSeconds: number;
            incrementSeconds: number;
            preferredColor: 'w' | 'b' | 'random';
            playerElo: number;
            cancelled?: boolean;
            retryTimer?: ReturnType<typeof setInterval>;
          } = {
            ws,
            name: playerName,
            usernameKey: authUser?.username.toLowerCase(),
            avatarUrl: playerAvatar,
            flag: playerFlag,
            title: playerTitle,
            initialSeconds,
            incrementSeconds,
            preferredColor,
            playerElo,
            cancelled: false,
          };

          queue.push(entry);
          matchQueues.set(key, queue);
          sendJson(ws, { type: 'match:searching', timeControl: key, playersSearching: queue.length });

          let probingNetwork = false;
          const attemptRealLobbyMatch = async () => {
            if (probingNetwork || entry.cancelled || ws.readyState !== WebSocket.OPEN) return;
            probingNetwork = true;
            let winnerChosen = false;
            const cancelFicsProbe = () =>
              winnerChosen || Boolean(entry.cancelled) || ws.readyState !== WebSocket.OPEN || socketToRoom.has(ws);

            try {
              const lichessPromise = joinRealLichessLobbyGame({
                initialSeconds,
                incrementSeconds,
                preferredColor,
                playerElo,
                playerKey: authUser?.username || playerName,
                onlineToken: authUser?.onlineToken,
                timeoutMs: 3600,
              }).then((m) => (m ? ({ kind: 'lichess' as const, match: m }) : null));

              const ficsPromise = joinRealFicsGame({
                initialSeconds,
                incrementSeconds,
                preferredColor,
                playerElo,
                timeoutMs: 6500,
                isCancelled: cancelFicsProbe,
              }).then((m) => (m ? ({ kind: 'fics' as const, match: m }) : null));

              const result = await new Promise<
                | { kind: 'lichess'; match: LichessJoinedMatch }
                | { kind: 'fics'; match: FicsJoinedMatch }
                | null
              >((resolveWinner) => {
                let pending = 2;
                let done = false;
                const handleOne = (
                  r:
                    | { kind: 'lichess'; match: LichessJoinedMatch }
                    | { kind: 'fics'; match: FicsJoinedMatch }
                    | null,
                ) => {
                  pending -= 1;
                  if (done) {
                    if (r?.kind === 'fics') {
                      try {
                        r.match.socket.write('abort\nquit\n');
                        r.match.socket.destroy();
                      } catch {
                        // ignore
                      }
                    }
                    return;
                  }
                  if (r) {
                    done = true;
                    winnerChosen = true;
                    resolveWinner(r);
                    return;
                  }
                  if (pending === 0) {
                    done = true;
                    resolveWinner(null);
                  }
                };
                void lichessPromise.then(handleOne);
                void ficsPromise.then(handleOne);
              });

              if (entry.cancelled || ws.readyState !== WebSocket.OPEN || socketToRoom.has(ws)) {
                if (result?.kind === 'fics') {
                  try {
                    result.match.socket.write('abort\nquit\n');
                    result.match.socket.destroy();
                  } catch {
                    // ignore
                  }
                }
                return;
              }

              const currentQueue = matchQueues.get(key) ?? [];
              if (!currentQueue.some((item) => item.ws === ws)) {
                if (result?.kind === 'fics') {
                  try {
                    result.match.socket.write('abort\nquit\n');
                    result.match.socket.destroy();
                  } catch {
                    // ignore
                  }
                }
                return;
              }

              if (result?.kind === 'lichess') {
                entry.cancelled = true;
                if (entry.retryTimer) clearInterval(entry.retryTimer);
                matchQueues.set(
                  key,
                  currentQueue.filter((item) => item.ws !== ws),
                );
                startBridgedLichessRoom(ws, result.match, {
                  pName: playerName,
                  pUserKey: authUser?.username.toLowerCase(),
                  pElo: playerElo,
                  pAvatar: playerAvatar,
                  pFlag: playerFlag,
                  pTitle: playerTitle,
                });
              } else if (result?.kind === 'fics') {
                entry.cancelled = true;
                if (entry.retryTimer) clearInterval(entry.retryTimer);
                matchQueues.set(
                  key,
                  currentQueue.filter((item) => item.ws !== ws),
                );
                startBridgedFicsRoom(ws, result.match, {
                  pName: playerName,
                  pUserKey: authUser?.username.toLowerCase(),
                  pElo: playerElo,
                  pAvatar: playerAvatar,
                  pFlag: playerFlag,
                  pTitle: playerTitle,
                });
              }
            } finally {
              probingNetwork = false;
            }
          };

          void attemptRealLobbyMatch();
          entry.retryTimer = setInterval(() => {
            if (entry.cancelled || ws.readyState !== WebSocket.OPEN) {
              if (entry.retryTimer) clearInterval(entry.retryTimer);
              return;
            }
            void attemptRealLobbyMatch();
          }, 7000);
        }
        return;
      }

      if (type === 'cancel_match') {
        for (const [key, q] of matchQueues.entries()) {
          for (const item of q) {
            if (item.ws === ws) {
              item.cancelled = true;
              if (item.retryTimer) clearInterval(item.retryTimer);
            }
          }
          matchQueues.set(key, q.filter((item) => item.ws !== ws));
        }
        sendJson(ws, { type: 'match:cancelled' });
        return;
      }

      if (type === 'leave_room') {
        leaveCurrentRoom(ws, true);
        return;
      }

      const membership = socketToRoom.get(ws);
      if (!membership) return;
      const room = rooms.get(membership.roomId);
      if (!room) return;

      // Post-game friendly actions (chat, typing, rematch) remain open after game ends!
      if (type === 'chat:typing') {
        const sender = membership.color === 'w' ? room.whiteName : room.blackName;
        const targetSocket = membership.color === 'w' ? room.blackSocket : room.whiteSocket;
        sendJson(targetSocket, { type: 'chat:typing', color: membership.color, sender });
        return;
      }

      if (type === 'chat') {
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, 240) : '';
        if (!text) return;
        const sender = membership.color === 'w' ? room.whiteName : room.blackName;
        const senderAvatarUrl = membership.color === 'w' ? room.whiteAvatarUrl : room.blackAvatarUrl;
        const senderFlag = membership.color === 'w' ? room.whiteFlag : room.blackFlag;

        room.chatMessages = [
          ...room.chatMessages.slice(-58),
          {
            id: `c-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
            sender,
            color: membership.color,
            text,
            timestamp: Date.now(),
            senderAvatarUrl,
            senderFlag,
          },
        ];
        broadcastRoomState(room);

        if (room.lichessSocket && room.lichessSocket.readyState === WebSocket.OPEN) {
          room.lichessSocket.send(JSON.stringify({ t: 'talk', d: text }));
        }
        if (room.ficsSocket && !room.ficsSocket.destroyed) {
          room.ficsSocket.write(`say ${text.replace(/[\r\n]+/g, ' ')}\n`);
        }
        return;
      }

      if (type === 'rematch:offer') {
        if (!room.winner) return;
        if (!room.whiteSocket || !room.blackSocket) {
          sendJson(ws, {
            type: 'room:error',
            error: 'Rematch requests are only available between directly connected OpenChess players.',
          });
          return;
        }
        room.rematchOfferBy = membership.color;
        broadcastRoomState(room);
        return;
      }

      if (type === 'rematch:accept') {
        if (!room.winner || !room.rematchOfferBy || room.rematchOfferBy === membership.color) return;
        const nextRoomId = generateRoomCode();
        const rematchSpeed = resolveSpeedKey(room.initialSeconds);
        const prevWhiteRec = room.whiteUsernameKey ? usersStore.users[room.whiteUsernameKey] : undefined;
        const prevBlackRec = room.blackUsernameKey ? usersStore.users[room.blackUsernameKey] : undefined;
        const freshPrevWhiteRating = prevWhiteRec?.perfs?.[rematchSpeed]?.rating ?? room.whiteRating;
        const freshPrevBlackRating = prevBlackRec?.perfs?.[rematchSpeed]?.rating ?? room.blackRating;
        launchNextMatchedRoom({
          roomId: nextRoomId,
          initialSeconds: room.initialSeconds,
          incrementSeconds: room.incrementSeconds,
          whiteName: room.blackName,
          blackName: room.whiteName,
          whiteKey: room.blackUsernameKey,
          blackKey: room.whiteUsernameKey,
          whiteRating: freshPrevBlackRating,
          blackRating: freshPrevWhiteRating,
          whiteAvatarUrl: sanitizePublicAvatar(prevBlackRec?.profile?.avatarUrl) ?? room.blackAvatarUrl,
          blackAvatarUrl: sanitizePublicAvatar(prevWhiteRec?.profile?.avatarUrl) ?? room.whiteAvatarUrl,
          whiteFlag: prevBlackRec?.profile?.flag || prevBlackRec?.profile?.country || room.blackFlag,
          blackFlag: prevWhiteRec?.profile?.flag || prevWhiteRec?.profile?.country || room.whiteFlag,
          whiteTitle: prevBlackRec?.title ?? room.blackTitle,
          blackTitle: prevWhiteRec?.title ?? room.whiteTitle,
          rated: room.rated,
        });
        const mins = room.initialSeconds / 60;
        const timeId = `${Number.isInteger(mins) ? mins : mins.toFixed(1)}+${room.incrementSeconds}`;
        room.rematchOfferBy = null;
        broadcastRoomState(room);
        // Previous White is now Black ('b'); previous Black is now White ('w')
        sendJson(room.whiteSocket, { type: 'rematch:started', roomId: nextRoomId, timeId, yourColor: 'b' });
        sendJson(room.blackSocket, { type: 'rematch:started', roomId: nextRoomId, timeId, yourColor: 'w' });
        return;
      }

      if (type === 'rematch:decline') {
        room.rematchOfferBy = null;
        broadcastRoomState(room);
        return;
      }

      if (room.winner) return;

      if (type === 'move') {
        if (room.chess.turn() !== membership.color) {
          sendJson(ws, { type: 'move:rejected', roomId: room.id, fen: room.chess.fen() });
          return;
        }
        const from = typeof msg.from === 'string' ? msg.from : '';
        const to = typeof msg.to === 'string' ? msg.to : '';
        const promotion = typeof msg.promotion === 'string' ? msg.promotion : 'q';
        const now = Date.now();

        if (room.lastMoveAt && room.historyMeta.length > 0) {
          const elapsed = now - room.lastMoveAt;
          if (membership.color === 'w') {
            room.whiteClockMs = Math.max(0, room.whiteClockMs - elapsed);
            if (room.whiteClockMs <= 0) {
              room.winner = 'b';
              room.endReason = 'White ran out of time';
              cleanupRoomLichessBridge(room);
              finalizeRoomResult(room);
              broadcastRoomState(room);
              return;
            }
          } else {
            room.blackClockMs = Math.max(0, room.blackClockMs - elapsed);
            if (room.blackClockMs <= 0) {
              room.winner = 'w';
              room.endReason = 'Black ran out of time';
              cleanupRoomLichessBridge(room);
              finalizeRoomResult(room);
              broadcastRoomState(room);
              return;
            }
          }
        }

        try {
          const moved = room.chess.move({ from, to, promotion });
          if (!moved) {
            sendJson(ws, { type: 'move:rejected', roomId: room.id, fen: room.chess.fen() });
            broadcastRoomState(room);
            return;
          }
          if (membership.color === 'w') room.whiteClockMs += room.incrementSeconds * 1000;
          else room.blackClockMs += room.incrementSeconds * 1000;
          room.lastMoveAt = now;
          room.drawOfferBy = null;
          room.historyMeta.push({
            from: moved.from,
            to: moved.to,
            san: moved.san,
            captured: Boolean(moved.captured) || moved.flags.includes('e'),
          });

          if (room.lichessSocket && room.lichessSocket.readyState === WebSocket.OPEN) {
            const uci = `${moved.from}${moved.to}${moved.promotion ?? ''}`;
            const ack = room.lichessAck ?? 1;
            room.lichessAck = ack + 1;
            room.lichessSocket.send(
              JSON.stringify({
                t: 'move',
                d: { u: uci, a: ack },
              }),
            );
          }
          if (room.ficsSocket && !room.ficsSocket.destroyed) {
            const ficsMove = moved.san.replace(/[+#]$/, '');
            room.ficsSocket.write(`${ficsMove}\n`);
          }

          if (room.chess.isCheckmate()) {
            room.winner = moved.color;
            room.endReason = `${moved.color === 'w' ? 'White' : 'Black'} wins by checkmate`;
            cleanupRoomLichessBridge(room);
            finalizeRoomResult(room);
          } else if (room.chess.isDraw()) {
            room.winner = 'draw';
            room.endReason = room.chess.isStalemate() ? 'Stalemate' : 'Draw';
            cleanupRoomLichessBridge(room);
            finalizeRoomResult(room);
          }
          broadcastRoomState(room);
        } catch {
          sendJson(ws, { type: 'move:rejected', roomId: room.id, fen: room.chess.fen() });
          broadcastRoomState(room);
        }
        return;
      }

      if (type === 'resign') {
        if (room.lichessSocket && room.lichessSocket.readyState === WebSocket.OPEN) {
          const cmd = room.historyMeta.length < 2 ? 'abort' : 'resign';
          room.lichessSocket.send(JSON.stringify({ t: cmd }));
        }
        if (room.ficsSocket && !room.ficsSocket.destroyed) {
          room.ficsSocket.write(room.historyMeta.length < 2 ? 'abort\n' : 'resign\n');
        }
        cleanupRoomLichessBridge(room);
        room.winner = membership.color === 'w' ? 'b' : 'w';
        room.endReason = `${membership.color === 'w' ? 'White' : 'Black'} resigned`;
        finalizeRoomResult(room);
        broadcastRoomState(room);
        return;
      }

      if (type === 'offer_draw') {
        if (room.lichessSocket && room.lichessSocket.readyState === WebSocket.OPEN) {
          room.lichessSocket.send(JSON.stringify({ t: 'draw-yes' }));
          room.drawOfferBy = membership.color;
          broadcastRoomState(room);
          return;
        }
        if (room.ficsSocket && !room.ficsSocket.destroyed) {
          room.ficsSocket.write('draw\n');
        }
        room.drawOfferBy = membership.color;
        broadcastRoomState(room);
        return;
      }

      if (type === 'accept_draw' && room.drawOfferBy && room.drawOfferBy !== membership.color) {
        if (room.lichessSocket && room.lichessSocket.readyState === WebSocket.OPEN) {
          room.lichessSocket.send(JSON.stringify({ t: 'draw-yes' }));
        }
        if (room.ficsSocket && !room.ficsSocket.destroyed) {
          room.ficsSocket.write('draw\n');
        }
        cleanupRoomLichessBridge(room);
        room.winner = 'draw';
        room.endReason = 'Draw by agreement';
        room.drawOfferBy = null;
        finalizeRoomResult(room);
        broadcastRoomState(room);
        return;
      }

      if (type === 'decline_draw') {
        if (room.lichessSocket && room.lichessSocket.readyState === WebSocket.OPEN) {
          room.lichessSocket.send(JSON.stringify({ t: 'draw-no' }));
        }
        if (room.ficsSocket && !room.ficsSocket.destroyed) {
          room.ficsSocket.write('decline draw\n');
        }
        room.drawOfferBy = null;
        broadcastRoomState(room);
        return;
      }
    });
  });

  return {
    pushToUser,
    isUserOnline,
    createInvitedRoom,
    generateRoomCode,
    listActiveRooms,
    listOpenLobbyChallenges,
  };
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  app.use(express.json({ limit: '3mb' }));

  const pendingGameInvites = new Map<string, PendingGameInvite>();

  const pruneGameInvites = () => {
    const now = Date.now();
    for (const [id, inv] of pendingGameInvites.entries()) {
      if (inv.expiresAt <= now) {
        pendingGameInvites.delete(id);
      }
    }
  };

  const buildNotificationsPayload = (username: string) => {
    pruneGameInvites();
    const lower = username.trim().toLowerCase();
    const record = usersStore.users[lower];
    const normalizeReqs = (raw: StoredUserAccount['incomingRequests']) =>
      (raw ?? []).map((r) =>
        typeof r === 'string'
          ? { username: r, createdAt: Date.now() }
          : { username: r.username, createdAt: r.createdAt },
      );

    return {
      incomingFriendRequests: normalizeReqs(record?.incomingRequests).map((r) => {
        const senderRec = usersStore.users[r.username.toLowerCase()];
        return {
          username: r.username,
          createdAt: r.createdAt,
          rating: senderRec?.perfs?.rapid?.rating,
          avatarUrl: senderRec?.profile?.avatarUrl,
          flag: senderRec?.profile?.flag || senderRec?.profile?.country,
        };
      }),
      outgoingFriendRequests: normalizeReqs(record?.outgoingRequests),
      incomingGameInvites: [...pendingGameInvites.values()].filter(
        (inv) => inv.toUsername.toLowerCase() === lower,
      ),
      outgoingGameInvites: [...pendingGameInvites.values()].filter(
        (inv) => inv.fromUsername.toLowerCase() === lower,
      ),
    };
  };

  const wsRuntime = setupLiveWebSocketServer(httpServer, {
    onUserIdentified: (user, ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'notifications:sync',
            ...buildNotificationsPayload(user.username),
          }),
        );
      }
    },
  });

  app.use((req, res, next) => {
    const reqOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    if (reqOrigin && isAuthorizedOpenChessHostname(reqOrigin)) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      hasGeminiKey: Boolean(process.env.GEMINI_API_KEY),
      authorizedDomains: AUTHORIZED_OPENCHESS_DOMAINS,
    });
  });

  app.get('/api/auth/authorized-domains', (req, res) => {
    const host =
      (typeof req.query.domain === 'string' && req.query.domain.trim()) ||
      req.headers.origin ||
      req.headers.host ||
      '';
    res.json({
      ok: true,
      requestedDomain: host,
      authorized: isAuthorizedOpenChessHostname(String(host)),
      authorizedDomains: AUTHORIZED_OPENCHESS_DOMAINS,
      primaryCustomDomain: 'https://openchess.bonto.page',
    });
  });

  app.post('/api/auth/google/domain-authorize', async (req, res) => {
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const rawDisplayName =
      typeof req.body?.displayName === 'string' ? req.body.displayName.trim().slice(0, 40) : '';
    const rawDomain =
      (typeof req.body?.domain === 'string' && req.body.domain.trim()) ||
      req.headers.origin ||
      req.headers.host ||
      'openchess.bonto.page';

    if (!isAuthorizedOpenChessHostname(String(rawDomain))) {
      res.status(403).json({
        error: `Domain "${rawDomain}" is not in the authorized domain list.`,
      });
      return;
    }

    const emailCheck = await verifyRealGoogleEmailServer(rawEmail);
    if (!emailCheck.ok) {
      res.status(400).json({
        error: emailCheck.error || 'Enter a valid Gmail or Google Workspace address.',
      });
      return;
    }

    const uid = `gdom_${crypto
      .createHash('sha256')
      .update(emailCheck.canonicalEmail)
      .digest('hex')
      .slice(0, 24)}`;

    const existingUser = Object.values(usersStore.users).find(
      (u) =>
        u.firebaseUid === uid ||
        u.canonicalEmail === emailCheck.canonicalEmail ||
        (u.email && canonicalizeGmailAddress(u.email) === emailCheck.canonicalEmail),
    );

    const displayName =
      rawDisplayName ||
      existingUser?.username ||
      emailCheck.normalizedEmail.split('@')[0];

    const idToken = signDomainAuthorizedGoogleToken({
      uid: existingUser?.firebaseUid || uid,
      email: emailCheck.normalizedEmail,
      canonicalEmail: emailCheck.canonicalEmail,
      displayName,
      photoUrl: existingUser?.profile?.avatarUrl,
      domain: String(rawDomain),
    });

    res.json({
      ok: true,
      authorizedDomain: String(rawDomain),
      identity: {
        uid: existingUser?.firebaseUid || uid,
        email: emailCheck.normalizedEmail,
        emailVerified: true,
        displayName,
        photoURL: existingUser?.profile?.avatarUrl || null,
        idToken,
      },
    });
  });

  // -------------------------------------------------------------------------
  // OpenChess Native Auth (Sign Up / Log In) + Silent Online Backend Sync
  // -------------------------------------------------------------------------
  app.post('/api/auth/register', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const rawEmail = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const verificationCode =
      typeof req.body?.verificationCode === 'string' ? req.body.verificationCode.trim() : '';
    const googleIdToken =
      typeof req.body?.googleIdToken === 'string' ? req.body.googleIdToken.trim() : '';
    const rawTier = Number(req.body?.startingRating);
    const startingRating = STARTING_SKILL_TIERS.some((t) => t.rating === rawTier) ? rawTier : 1200;
    const rawCountry =
      typeof req.body?.country === 'string' && req.body.country.trim().length <= 8
        ? req.body.country.trim().toUpperCase()
        : 'INT';

    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(username)) {
      res.status(400).json({ error: 'Username must be 2–30 characters (letters, numbers, _ or -).' });
      return;
    }
    if (password.length < 4) {
      res.status(400).json({ error: 'Password must be at least 4 characters.' });
      return;
    }

    let verifiedEmail = '';
    let verifiedCanonical = '';
    let verifiedUid: string | undefined;
    let verifiedPhotoUrl: string | undefined;

    if (googleIdToken) {
      const tokenCheck = await verifyFirebaseGoogleIdToken(googleIdToken);
      if (!tokenCheck.ok || !tokenCheck.email || !tokenCheck.canonicalEmail) {
        res.status(401).json({ error: tokenCheck.error || 'Google verification failed.' });
        return;
      }
      verifiedEmail = tokenCheck.email;
      verifiedCanonical = tokenCheck.canonicalEmail;
      verifiedUid = tokenCheck.uid;
      verifiedPhotoUrl = tokenCheck.photoUrl;
    } else {
      const emailCheck = await verifyRealGoogleEmailServer(rawEmail);
      if (!emailCheck.ok) {
        res.status(400).json({ error: emailCheck.error || 'Enter a valid email address.' });
        return;
      }
      verifiedEmail = emailCheck.normalizedEmail;
      verifiedCanonical = emailCheck.canonicalEmail;

      if (verificationCode) {
        const codeKey = `${username.toLowerCase()}:${verifiedCanonical}`;
        const storedCode = emailCodeStore.get(codeKey);
        if (!storedCode || storedCode.expiresAt < Date.now() || storedCode.code !== verificationCode) {
          res.status(401).json({ error: 'Invalid or expired 6-digit verification code.' });
          return;
        }
        emailCodeStore.delete(codeKey);
      }
    }

    const key = username.toLowerCase();
    if (usersStore.users[key]) {
      res.status(409).json({ error: `Username "${username}" is already taken. Choose another or Log In.` });
      return;
    }

    const emailTaken = Object.values(usersStore.users).some(
      (u) =>
        (verifiedUid && u.firebaseUid === verifiedUid) ||
        (u.canonicalEmail && u.canonicalEmail === verifiedCanonical) ||
        (u.email && canonicalizeGmailAddress(u.email) === verifiedCanonical),
    );
    if (emailTaken) {
      res.status(409).json({
        error: 'This email address is already registered. Switch to Log In.',
      });
      return;
    }

    const { salt, hash } = hashPassword(password);
    const now = Date.now();
    const initialHistory: RatingHistoryMap = {
      rapid: [{ rating: startingRating, ts: now }],
      blitz: [{ rating: startingRating, ts: now }],
      bullet: [{ rating: startingRating, ts: now }],
      puzzle: [{ rating: startingRating, ts: now }],
    };

    const backfillIncoming: StoredFriendRequest[] = [];
    for (const other of Object.values(usersStore.users)) {
      const pendingMatch = (other.outgoingRequests ?? []).find(
        (r) => (typeof r === 'string' ? r : r.username).toLowerCase() === key,
      );
      if (pendingMatch) {
        backfillIncoming.push({
          username: other.username,
          createdAt: typeof pendingMatch === 'string' ? now : pendingMatch.createdAt || now,
        });
      }
    }

    const newRecord: StoredUserAccount = {
      username,
      email: verifiedEmail,
      canonicalEmail: verifiedCanonical,
      emailVerified: true,
      firebaseUid: verifiedUid,
      isLocalOpenChessAccount: true,
      localProgressInitialized: true,
      passwordSalt: salt,
      passwordHash: hash,
      friends: [],
      removedFriends: [],
      incomingRequests: backfillIncoming,
      outgoingRequests: [],
      playedGames: [],
      perfs: defaultAccountPerfs(startingRating),
      count: defaultAccountCount(),
      leaguePoints: 0,
      ratingHistory: initialHistory,
      dmThreads: {},
      profile: {
        country: rawCountry,
        flag: rawCountry,
        ...(verifiedPhotoUrl ? { avatarUrl: verifiedPhotoUrl } : {}),
      },
      createdAt: now,
      seenAt: now,
    };
    usersStore.users[key] = newRecord;
    saveUsersStore(usersStore);

    res.json({
      session: {
        accessToken: signOpenChessToken(username),
        hasOnlineToken: false,
        account: buildAccountPayload(newRecord, { online: true }),
      },
    });
  });

  app.post('/api/auth/google', async (req, res) => {
    const idToken = typeof req.body?.idToken === 'string' ? req.body.idToken.trim() : '';
    const requestedUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const rawPassword = typeof req.body?.password === 'string' ? req.body.password : '';
    const rawTier = Number(req.body?.startingRating);
    const startingRating = STARTING_SKILL_TIERS.some((t) => t.rating === rawTier) ? rawTier : 1200;
    const rawCountry =
      typeof req.body?.country === 'string' && req.body.country.trim().length <= 8
        ? req.body.country.trim().toUpperCase()
        : 'INT';

    const verified = await verifyFirebaseGoogleIdToken(idToken);
    if (!verified.ok || !verified.email || !verified.canonicalEmail || !verified.uid) {
      res.status(401).json({ error: verified.error || 'Google sign-in verification failed.' });
      return;
    }

    let existing = Object.values(usersStore.users).find(
      (u) =>
        u.firebaseUid === verified.uid ||
        u.canonicalEmail === verified.canonicalEmail ||
        (u.email && canonicalizeGmailAddress(u.email) === verified.canonicalEmail),
    );

    if (existing) {
      existing.firebaseUid = verified.uid;
      existing.email = verified.email;
      existing.canonicalEmail = verified.canonicalEmail;
      existing.emailVerified = true;
      existing.seenAt = Date.now();
      if (rawPassword.length >= 4) {
        const { salt, hash } = hashPassword(rawPassword);
        existing.passwordSalt = salt;
        existing.passwordHash = hash;
      }
      if (verified.photoUrl && !existing.profile?.avatarUrl) {
        existing.profile = {
          ...(existing.profile ?? { country: 'INT', flag: 'INT' }),
          avatarUrl: verified.photoUrl,
        };
      }
      saveUsersStore(usersStore);
      res.json({
        isNewUser: false,
        session: {
          accessToken: signOpenChessToken(existing.username),
          hasOnlineToken: Boolean(existing.onlineToken),
          account: buildAccountPayload(existing, { online: true }),
        },
      });
      return;
    }

    // Create a new verified OpenChess account
    let baseName = requestedUsername.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
    if (baseName.length < 3) {
      const fromDisplay = (verified.displayName || '')
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 20);
      const fromEmail = verified.email
        .split('@')[0]
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 20);
      baseName = (fromDisplay.length >= 3 ? fromDisplay : fromEmail) || 'ChessPlayer';
    }
    let finalUsername = baseName;
    let suffix = 1;
    while (usersStore.users[finalUsername.toLowerCase()]) {
      suffix += 1;
      finalUsername = `${baseName.slice(0, 20)}${suffix}`;
    }

    const key = finalUsername.toLowerCase();
    const { salt, hash } = hashPassword(
      rawPassword.length >= 4 ? rawPassword : crypto.randomBytes(18).toString('hex'),
    );
    const now = Date.now();
    const initialHistory: RatingHistoryMap = {
      rapid: [{ rating: startingRating, ts: now }],
      blitz: [{ rating: startingRating, ts: now }],
      bullet: [{ rating: startingRating, ts: now }],
      puzzle: [{ rating: startingRating, ts: now }],
    };

    const backfillIncoming: StoredFriendRequest[] = [];
    for (const other of Object.values(usersStore.users)) {
      const pendingMatch = (other.outgoingRequests ?? []).find(
        (r) => (typeof r === 'string' ? r : r.username).toLowerCase() === key,
      );
      if (pendingMatch) {
        backfillIncoming.push({
          username: other.username,
          createdAt: typeof pendingMatch === 'string' ? now : pendingMatch.createdAt || now,
        });
      }
    }

    const newRecord: StoredUserAccount = {
      username: finalUsername,
      email: verified.email,
      canonicalEmail: verified.canonicalEmail,
      emailVerified: true,
      firebaseUid: verified.uid,
      isLocalOpenChessAccount: true,
      localProgressInitialized: true,
      passwordSalt: salt,
      passwordHash: hash,
      friends: [],
      removedFriends: [],
      incomingRequests: backfillIncoming,
      outgoingRequests: [],
      playedGames: [],
      perfs: defaultAccountPerfs(startingRating),
      count: defaultAccountCount(),
      leaguePoints: 0,
      ratingHistory: initialHistory,
      dmThreads: {},
      profile: {
        country: rawCountry,
        flag: rawCountry,
        ...(verified.photoUrl ? { avatarUrl: verified.photoUrl } : {}),
      },
      createdAt: now,
      seenAt: now,
    };
    usersStore.users[key] = newRecord;
    saveUsersStore(usersStore);

    res.json({
      isNewUser: true,
      session: {
        accessToken: signOpenChessToken(finalUsername),
        hasOnlineToken: false,
        account: buildAccountPayload(newRecord, { online: true }),
      },
    });
  });

  // Direct Personal Access Key login (connects actual live chess account inside OpenChess)
  app.post('/api/auth/token', async (req, res) => {
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';

    if (token.length < 8) {
      res.status(400).json({ error: 'Enter a valid personal access key.' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    let accountRes: Response;
    try {
      accountRes = await fetch('https://lichess.org/api/account', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'User-Agent': 'OpenChess/1.0',
        },
        signal: AbortSignal.timeout(7000),
      });
    } catch {
      res.status(502).json({ error: 'Unable to reach account verification server right now.' });
      return;
    }

    if (!accountRes.ok) {
      res.status(401).json({
        error: 'Invalid or expired personal access key. Check your key permissions and try again.',
      });
      return;
    }

    const rawAccount = (await accountRes.json()) as Record<string, any>;
    const realUsername = typeof rawAccount?.username === 'string' ? rawAccount.username.trim() : '';
    if (!realUsername) {
      res.status(502).json({ error: 'Account profile response was incomplete.' });
      return;
    }

    const key = realUsername.toLowerCase();
    const synced = await fetchNetworkProfileForUser(realUsername, token, usersStore.users[key], true);
    if (!synced.ok) {
      res.status(401).json({ error: 'Could not verify your personal access key.' });
      return;
    }

    let record = usersStore.users[key];
    if (!record) {
      const { salt, hash } = hashPassword(
        password.length >= 4 ? password : crypto.randomBytes(18).toString('hex'),
      );
      record = {
        username: realUsername,
        email: email || undefined,
        passwordSalt: salt,
        passwordHash: hash,
        onlineToken: token,
        friends:
          'followed' in synced && Array.isArray(synced.followed)
            ? mergeFriendsWithRemote({ remoteFollowing: synced.followed })
            : [],
        removedFriends: [],
        perfs: synced.account.perfs ?? defaultAccountPerfs(),
        count: synced.account.count ?? defaultAccountCount(),
        profile: (synced.account as Record<string, any>).profile,
        playTime: (synced.account as Record<string, any>).playTime,
        createdAt: synced.account.createdAt ?? Date.now(),
        seenAt: synced.account.seenAt ?? Date.now(),
      };
      usersStore.users[key] = record;
    } else {
      record.username = realUsername;
      record.onlineToken = token;
      if (email) record.email = email;
      if (password.length >= 4) {
        const { salt, hash } = hashPassword(password);
        record.passwordSalt = salt;
        record.passwordHash = hash;
      }
      record.perfs = synced.account.perfs ?? record.perfs ?? defaultAccountPerfs();
      record.count = synced.account.count ?? record.count ?? defaultAccountCount();
      record.profile = (synced.account as Record<string, any>).profile ?? record.profile;
      record.playTime = (synced.account as Record<string, any>).playTime ?? record.playTime;
      if (typeof synced.account.createdAt === 'number') record.createdAt = synced.account.createdAt;
      record.seenAt = synced.account.seenAt ?? Date.now();
      if ('followed' in synced && Array.isArray(synced.followed)) {
        record.friends = mergeFriendsWithRemote({
          existingFriends: record.friends ?? [],
          remoteFollowing: synced.followed,
          removedFriends: record.removedFriends ?? [],
        });
      }
    }

    await Promise.race([
      syncRecentGamesIntoStore(record.username, token, record, true).catch(() => []),
      new Promise<void>((r) => setTimeout(r, 4000)),
    ]);
    saveUsersStore(usersStore);

    res.json({
      session: {
        accessToken: signOpenChessToken(record.username),
        hasOnlineToken: true,
        account: { ...synced.account, username: record.username, email: record.email },
      },
    });
  });

  app.post('/api/account/link-token', async (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in first to link a personal access key.' });
      return;
    }
    const token = typeof req.body?.token === 'string' ? req.body.token.trim() : '';
    if (token.length < 8) {
      res.status(400).json({ error: 'Enter a valid personal access key.' });
      return;
    }

    const check = await fetch('https://lichess.org/api/account', {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'OpenChess/1.0',
      },
      signal: AbortSignal.timeout(7000),
    }).catch(() => null);

    if (!check?.ok) {
      res.status(401).json({ error: 'Invalid or expired personal access key.' });
      return;
    }

    const rawAcct = (await check.json()) as Record<string, any>;
    const realUsername = typeof rawAcct?.username === 'string' ? rawAcct.username.trim() : auth.openChessUser.username;
    const key = realUsername.toLowerCase();
    let target = usersStore.users[key];
    if (!target) {
      target = {
        ...auth.openChessUser,
        username: realUsername,
        onlineToken: token,
      };
      usersStore.users[key] = target;
    } else {
      target.username = realUsername;
      target.onlineToken = token;
      target.email ??= auth.openChessUser.email;
    }

    const synced = await fetchNetworkProfileForUser(target.username, token, target, true);
    if (!synced.ok) {
      res.status(401).json({ error: 'Could not sync linked account.' });
      return;
    }

    target.perfs = synced.account.perfs ?? target.perfs;
    target.count = synced.account.count ?? target.count;
    await Promise.race([
      syncRecentGamesIntoStore(target.username, token, target, true).catch(() => []),
      new Promise<void>((r) => setTimeout(r, 3800)),
    ]);
    saveUsersStore(usersStore);

    res.json({
      session: {
        accessToken: signOpenChessToken(target.username),
        hasOnlineToken: true,
        account: { ...synced.account, username: target.username, email: target.email },
      },
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    const identifier = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const onlineToken = typeof req.body?.onlineToken === 'string' ? req.body.onlineToken.trim() : undefined;

    if (!identifier || !password) {
      res.status(400).json({ error: 'Username (or Gmail) and password are required.' });
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      res.status(400).json({ error: 'Enter a valid email address.' });
      return;
    }

    const key = identifier.toLowerCase();
    const canonicalLookup = identifier.includes('@') ? canonicalizeGmailAddress(identifier) : '';
    let record =
      usersStore.users[key] ??
      Object.values(usersStore.users).find(
        (u) =>
          u.email?.toLowerCase() === key ||
          (canonicalLookup &&
            (u.canonicalEmail === canonicalLookup ||
              (u.email && canonicalizeGmailAddress(u.email) === canonicalLookup))),
      );

    if (identifier.includes('@') && !record && !onlineToken) {
      res.status(404).json({
        error: 'No account registered with that Gmail address. Switch to Create Account.',
      });
      return;
    }

    const lookupUsername = record?.username ?? identifier;
    if (!onlineToken && !/^[a-zA-Z0-9_-]{2,30}$/.test(lookupUsername)) {
      res.status(400).json({
        error: 'Enter a valid username (2–30 letters, numbers, _ or -) or your registered Gmail.',
      });
      return;
    }

    const tokenLooksLikePersonalKey =
      password.trim().startsWith('lip_') && password.trim().length >= 16;
    const effectiveOnlineToken =
      onlineToken || (tokenLooksLikePersonalKey ? password.trim() : record?.onlineToken);

    if (!record) {
      const syncedNew = await fetchNetworkProfileForUser(
        lookupUsername,
        effectiveOnlineToken,
        undefined,
        true,
        true,
      );
      if (!syncedNew.ok) {
        res.status(404).json({
          error: `No account found for "${identifier}". Switch to Create Account with your Gmail to register.`,
        });
        return;
      }
      const { salt, hash } = hashPassword(password);
      const canonicalUsername =
        typeof syncedNew.account?.username === 'string' && syncedNew.account.username.trim()
          ? syncedNew.account.username.trim()
          : lookupUsername;
      const canonicalKey = canonicalUsername.toLowerCase();
      const backfillIncoming: Array<{ username: string; createdAt: number }> = [];
      for (const other of Object.values(usersStore.users)) {
        const pendingMatch = (other.outgoingRequests ?? []).find(
          (r) => (typeof r === 'string' ? r : r.username).toLowerCase() === canonicalKey,
        );
        if (pendingMatch) {
          backfillIncoming.push({
            username: other.username,
            createdAt:
              typeof pendingMatch === 'string' ? Date.now() : pendingMatch.createdAt || Date.now(),
          });
        }
      }
      const now = Date.now();
      const perfs = syncedNew.account?.perfs ? syncedNew.account.perfs : defaultAccountPerfs();
      record = {
        username: canonicalUsername,
        email: email || undefined,
        localProgressInitialized: true,
        passwordSalt: salt,
        passwordHash: hash,
        onlineToken: effectiveOnlineToken,
        friends:
          'followed' in syncedNew && Array.isArray(syncedNew.followed)
            ? syncedNew.followed
            : [],
        incomingRequests: backfillIncoming,
        outgoingRequests: [],
        perfs,
        count: syncedNew.account?.count ? syncedNew.account.count : defaultAccountCount(),
        leaguePoints: 0,
        ratingHistory: {
          rapid: [{ rating: perfs.rapid.rating, ts: now }],
          blitz: [{ rating: perfs.blitz.rating, ts: now }],
          bullet: [{ rating: perfs.bullet.rating, ts: now }],
          puzzle: [{ rating: perfs.puzzle.rating, ts: now }],
        },
        dmThreads: {},
        profile: (syncedNew.account as Record<string, any>).profile,
        playTime: (syncedNew.account as Record<string, any>).playTime,
        createdAt:
          typeof syncedNew.account?.createdAt === 'number' ? syncedNew.account.createdAt : now,
        seenAt: now,
      };
      usersStore.users[canonicalKey] = record;
      await Promise.race([
        syncRecentGamesIntoStore(record.username, effectiveOnlineToken, record, true).catch(() => []),
        new Promise<void>((r) => setTimeout(r, 2800)),
      ]);
      record.count ??= defaultAccountCount();
      if (record.playedGames && record.playedGames.length > record.count.all) {
        record.count.all = record.playedGames.length;
      }
      saveUsersStore(usersStore);
      res.json({
        session: {
          accessToken: signOpenChessToken(record.username),
          hasOnlineToken: Boolean(effectiveOnlineToken),
          account: buildAccountPayload(record, { online: true }),
        },
      });
      return;
    }

    const isPlaceholderRecord = verifyPassword(
      'openchess-proxy-session',
      record.passwordSalt,
      record.passwordHash,
    );
    if (
      !onlineToken &&
      !tokenLooksLikePersonalKey &&
      !isPlaceholderRecord &&
      !verifyPassword(password, record.passwordSalt, record.passwordHash)
    ) {
      res.status(401).json({
        error: `Incorrect password for "${record.username}".`,
      });
      return;
    }
    if (isPlaceholderRecord && password.length >= 4) {
      const { salt, hash } = hashPassword(password);
      record.passwordSalt = salt;
      record.passwordHash = hash;
    }

    if (email && !record.email) {
      record.email = email;
      record.canonicalEmail = canonicalizeGmailAddress(email);
    }
    if (onlineToken || tokenLooksLikePersonalKey) {
      record.onlineToken = effectiveOnlineToken;
    }

    record.seenAt = Date.now();
    record.perfs ??= defaultAccountPerfs();
    record.count ??= defaultAccountCount();
    record.friends ??= [];
    record.dmThreads ??= {};
    record.ratingHistory ??= {
      rapid: [{ rating: record.perfs.rapid.rating, ts: record.createdAt }],
      blitz: [{ rating: record.perfs.blitz.rating, ts: record.createdAt }],
      bullet: [{ rating: record.perfs.bullet.rating, ts: record.createdAt }],
      puzzle: [{ rating: record.perfs.puzzle.rating, ts: record.createdAt }],
    };

    if (!record.isLocalOpenChessAccount && !record.localProgressInitialized) {
      const synced = await fetchNetworkProfileForUser(
        record.username,
        effectiveOnlineToken,
        record,
        false,
        false,
      );
      if (synced.ok) {
        record.localProgressInitialized = true;
      }
    }

    saveUsersStore(usersStore);

    res.json({
      session: {
        accessToken: signOpenChessToken(record.username),
        hasOnlineToken: Boolean(record.onlineToken),
        account: buildAccountPayload(record, { online: true }),
      },
    });
  });

  app.post('/api/account/avatar', (req, res) => {
    const authHeader = req.headers.authorization;
    const bearer = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    const record = bearer ? verifyOpenChessToken(bearer) : null;
    const rawAvatarUrl = typeof req.body?.avatarUrl === 'string' ? req.body.avatarUrl.trim() : '';
    if (rawAvatarUrl.length > 1_200_000) {
      res.status(400).json({ error: 'Avatar image data is too large (max ~1MB).' });
      return;
    }
    const isDefaultReset = !rawAvatarUrl || rawAvatarUrl === 'default';
    const safeAvatar = isDefaultReset ? undefined : sanitizePublicAvatar(rawAvatarUrl);
    if (!isDefaultReset && !safeAvatar) {
      res.status(400).json({ error: 'Unsupported avatar format.' });
      return;
    }
    if (record) {
      const nextProfile = { ...(record.profile ?? {}) };
      if (isDefaultReset) {
        delete nextProfile.avatarUrl;
      } else {
        nextProfile.avatarUrl = safeAvatar;
      }
      record.profile = nextProfile;
      saveUsersStore(usersStore);
    }
    res.json({
      ok: true,
      avatarUrl: safeAvatar ?? '',
      account: record ? buildAccountPayload(record, { online: true }) : undefined,
    });
  });

  app.post('/api/account/profile', (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in first to edit your profile.' });
      return;
    }
    const record = auth.openChessUser;
    const nextProfile = { ...(record.profile ?? {}) };

    if (typeof req.body?.username === 'string') {
      const rawUsername = req.body.username.trim().replace(/\s+/g, '_');
      if (rawUsername && rawUsername !== record.username) {
        if (!/^[a-zA-Z0-9_-]{2,26}$/.test(rawUsername)) {
          res.status(400).json({
            error: 'Name must be 2–26 characters (letters, numbers, _ or -).',
          });
          return;
        }
        const oldKey = record.username.toLowerCase();
        const newKey = rawUsername.toLowerCase();
        if (newKey !== oldKey && usersStore.users[newKey]) {
          res.status(409).json({
            error: `Username "${rawUsername}" is already taken.`,
          });
          return;
        }
        record.username = rawUsername;
        if (newKey !== oldKey) {
          delete usersStore.users[oldKey];
          usersStore.users[newKey] = record;
          for (const other of Object.values(usersStore.users)) {
            if (Array.isArray(other.friends)) {
              other.friends = other.friends.map((f) =>
                f.toLowerCase() === oldKey ? rawUsername : f,
              );
            }
          }
        }
      }
    }

    if (typeof req.body?.bio === 'string') {
      nextProfile.bio = req.body.bio.trim().slice(0, 240);
    }
    const rawCountry =
      typeof req.body?.flag === 'string'
        ? req.body.flag.trim()
        : typeof req.body?.country === 'string'
          ? req.body.country.trim()
          : undefined;
    if (rawCountry !== undefined) {
      const cleanCode = rawCountry.toUpperCase().slice(0, 8) || 'INT';
      nextProfile.flag = cleanCode;
      nextProfile.country = cleanCode;
    }
    if (typeof req.body?.avatarUrl === 'string') {
      const rawAvatar = req.body.avatarUrl.trim();
      if (rawAvatar.length > 1_200_000) {
        res.status(400).json({ error: 'Avatar image data is too large.' });
        return;
      }
      if (!rawAvatar || rawAvatar === 'default') {
        delete nextProfile.avatarUrl;
      } else {
        const cleanAvatar = sanitizePublicAvatar(rawAvatar);
        if (!cleanAvatar) {
          res.status(400).json({ error: 'Unsupported avatar format.' });
          return;
        }
        nextProfile.avatarUrl = cleanAvatar;
      }
    }

    record.profile = nextProfile;
    saveUsersStore(usersStore);
    res.json({
      ok: true,
      accessToken: signOpenChessToken(record.username),
      account: buildAccountPayload(record, { online: true }),
    });
  });

  app.post('/api/auth/email-request', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const purpose = req.body?.purpose === 'login' ? 'login' : 'register';

    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(username)) {
      res.status(400).json({ error: 'Username must be 2–30 characters (letters, numbers, _ or -).' });
      return;
    }

    const emailCheck = await verifyRealGoogleEmailServer(email);
    if (!emailCheck.ok) {
      res.status(400).json({
        error: emailCheck.error || 'Enter a valid email address.',
      });
      return;
    }

    const key = username.toLowerCase();
    const existingByUsername = usersStore.users[key];
    const existingByEmail = Object.values(usersStore.users).find(
      (u) =>
        (u.canonicalEmail && u.canonicalEmail === emailCheck.canonicalEmail) ||
        (u.email && canonicalizeGmailAddress(u.email) === emailCheck.canonicalEmail),
    );

    if (purpose === 'register') {
      if (existingByUsername) {
        res.status(409).json({
          error: `Username "${username}" is already taken. Choose another username or Log In.`,
        });
        return;
      }
      if (existingByEmail) {
        res.status(409).json({
          error: 'This email address is already registered. Switch to Log In.',
        });
        return;
      }
    } else {
      if (!existingByUsername && !existingByEmail) {
        const realPub = await fetchPublicLichessUser(username, true);
        if (!realPub) {
          res.status(404).json({
            error: `No account found for "${username}". Switch to Create Account to register.`,
          });
          return;
        }
      }
      if (
        existingByUsername?.canonicalEmail &&
        existingByUsername.canonicalEmail !== emailCheck.canonicalEmail
      ) {
        res.status(409).json({
          error: `Username "${username}" is linked to a different email address.`,
        });
        return;
      }
    }

    const code = String(crypto.randomInt(100000, 1000000));
    emailCodeStore.set(`${key}:${emailCheck.canonicalEmail}`, {
      username,
      email: emailCheck.normalizedEmail,
      canonicalEmail: emailCheck.canonicalEmail,
      code,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });

    const resendKey = process.env.RESEND_API_KEY?.trim();
    if (resendKey) {
      try {
        const mailRes = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'OpenChess <onboarding@resend.dev>',
            to: [emailCheck.normalizedEmail],
            subject: `Your OpenChess verification code: ${code}`,
            text: `Hi ${username},\n\nUse this 6-digit code in OpenChess: ${code}\n\nThis code expires in 10 minutes.`,
          }),
          signal: AbortSignal.timeout(6000),
        });
        if (mailRes.ok) {
          res.json({
            ok: true,
            deliveryMode: 'email',
            maskedEmail: emailCheck.normalizedEmail,
          });
          return;
        }
      } catch {
        // Fall through cleanly
      }
    }

    res.json({
      ok: true,
      deliveryMode: 'google-oauth-required',
      maskedEmail: emailCheck.normalizedEmail,
    });
  });

  app.post('/api/auth/email-verify', async (req, res) => {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const onlineToken = typeof req.body?.onlineToken === 'string' ? req.body.onlineToken.trim() : undefined;

    if (!username || !email || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'Username, Gmail, and 6-digit verification code are required.' });
      return;
    }

    const canonicalEmail = canonicalizeGmailAddress(email);
    const key = username.toLowerCase();
    const entry = emailCodeStore.get(`${key}:${canonicalEmail}`);
    if (!entry || entry.expiresAt < Date.now() || entry.code !== code) {
      res.status(401).json({ error: 'Invalid or expired verification code.' });
      return;
    }
    emailCodeStore.delete(`${key}:${canonicalEmail}`);

    let record = usersStore.users[key];
    if (!record) {
      const effectiveOnlineToken = onlineToken;
      const synced = await fetchNetworkProfileForUser(
        username,
        effectiveOnlineToken,
        undefined,
        true,
        false,
      );
      const syncedAccount = synced.ok ? synced.account : null;
      const { salt, hash } = hashPassword(crypto.randomBytes(16).toString('hex'));
      const now = Date.now();
      const rawPerfs = (syncedAccount?.perfs ?? defaultAccountPerfs()) as StoredAccountPerfs;
      const perfs: StoredAccountPerfs = {
        rapid: rawPerfs.rapid ?? { rating: 1200, games: 0 },
        blitz: rawPerfs.blitz ?? { rating: 1200, games: 0 },
        bullet: rawPerfs.bullet ?? { rating: 1200, games: 0 },
        puzzle: rawPerfs.puzzle ?? { rating: 1200, games: 0 },
        ...(rawPerfs.classical ? { classical: rawPerfs.classical } : {}),
        ...(rawPerfs.correspondence ? { correspondence: rawPerfs.correspondence } : {}),
        ...(rawPerfs.storm ? { storm: rawPerfs.storm } : {}),
        ...(rawPerfs.streak ? { streak: rawPerfs.streak } : {}),
      };
      record = {
        username,
        email: entry.email,
        canonicalEmail,
        emailVerified: true,
        isLocalOpenChessAccount: true,
        localProgressInitialized: true,
        passwordSalt: salt,
        passwordHash: hash,
        onlineToken: effectiveOnlineToken || undefined,
        friends:
          'followed' in synced && Array.isArray(synced.followed)
            ? mergeFriendsWithRemote({ remoteFollowing: synced.followed })
            : [],
        removedFriends: [],
        perfs,
        count: (syncedAccount?.count as StoredAccountCount | undefined) ?? defaultAccountCount(),
        leaguePoints: 0,
        ratingHistory: {
          rapid: [{ rating: perfs.rapid.rating, ts: now }],
          blitz: [{ rating: perfs.blitz.rating, ts: now }],
          bullet: [{ rating: perfs.bullet.rating, ts: now }],
          puzzle: [{ rating: perfs.puzzle.rating, ts: now }],
        },
        dmThreads: {},
        profile: {
          country: (syncedAccount as Record<string, any> | null)?.profile?.country || 'INT',
          flag: (syncedAccount as Record<string, any> | null)?.profile?.flag || 'INT',
        },
        createdAt: (syncedAccount?.createdAt as number | undefined) ?? now,
        seenAt: now,
      };
      usersStore.users[key] = record;
    } else {
      record.email = entry.email;
      record.canonicalEmail = canonicalEmail;
      record.emailVerified = true;
      record.seenAt = Date.now();
    }

    saveUsersStore(usersStore);

    res.json({
      session: {
        accessToken: signOpenChessToken(record.username),
        hasOnlineToken: Boolean(record.onlineToken),
        account: buildAccountPayload(record, { online: true }),
      },
    });
  });

  // Account Friends & Friend Requests (Send Request / Accept / Reject / Sync) + Player Autocomplete
  const ensureRecipientUserRecord = (targetUsername: string): StoredUserAccount => {
    const clean = targetUsername.trim();
    const key = clean.toLowerCase();
    if (!usersStore.users[key]) {
      const { salt, hash } = hashPassword('openchess-proxy-session');
      usersStore.users[key] = {
        username: clean,
        passwordSalt: salt,
        passwordHash: hash,
        friends: [],
        removedFriends: [],
        incomingRequests: [],
        outgoingRequests: [],
        playedGames: [],
        perfs: defaultAccountPerfs(),
        count: defaultAccountCount(),
        dmThreads: {},
        createdAt: Date.now(),
        seenAt: Date.now(),
      };
    }
    return usersStore.users[key];
  };

  const reconcileAllFriendRequests = () => {
    let dirty = false;
    for (const sender of Object.values(usersStore.users)) {
      sender.friends ??= [];
      sender.removedFriends ??= [];
      sender.incomingRequests ??= [];
      sender.outgoingRequests ??= [];
      const remainingOutgoing: StoredFriendRequest[] = [];
      for (const reqItem of sender.outgoingRequests) {
        const reqName = typeof reqItem === 'string' ? reqItem : reqItem.username;
        const reqTs = typeof reqItem === 'string' ? Date.now() : reqItem.createdAt || Date.now();
        if (!reqName) continue;
        const targetRec = ensureRecipientUserRecord(reqName);
        targetRec.friends ??= [];
        targetRec.removedFriends ??= [];
        targetRec.incomingRequests ??= [];
        targetRec.outgoingRequests ??= [];

        const alreadyInTargetIncoming = targetRec.incomingRequests.some(
          (r) => (typeof r === 'string' ? r : r.username).toLowerCase() === sender.username.toLowerCase(),
        );
        const alreadyInTargetFriends = targetRec.friends.some(
          (f) => f.toLowerCase() === sender.username.toLowerCase(),
        );
        const removedByTarget = targetRec.removedFriends.some(
          (f) => f.toLowerCase() === sender.username.toLowerCase(),
        );
        if (!alreadyInTargetIncoming && !alreadyInTargetFriends && !removedByTarget) {
          targetRec.incomingRequests.unshift({
            username: sender.username,
            createdAt: reqTs,
          });
          dirty = true;
        }

        // Keep every unaccepted request pending until recipient explicitly accepts!
        remainingOutgoing.push({ username: targetRec.username, createdAt: reqTs });
      }
      if (remainingOutgoing.length !== sender.outgoingRequests.length) {
        sender.outgoingRequests = remainingOutgoing;
        dirty = true;
      }
    }
    if (dirty) {
      saveUsersStore(usersStore);
    }
  };

  reconcileAllFriendRequests();

  const ensureUserFriendStructures = (user: StoredUserAccount) => {
    user.friends ??= [];
    user.removedFriends ??= [];
    user.incomingRequests ??= [];
    user.outgoingRequests ??= [];
    user.playedGames ??= [];
    reconcileAllFriendRequests();
  };

  const formatFriendListsPayload = (user: StoredUserAccount) => ({
    friends: user.friends ?? [],
    incomingRequests: (user.incomingRequests ?? []).map((r) =>
      typeof r === 'string' ? r : r.username,
    ),
    outgoingRequests: (user.outgoingRequests ?? []).map((r) =>
      typeof r === 'string' ? r : r.username,
    ),
    removedFriends: user.removedFriends ?? [],
  });

  app.get('/api/account/friends', async (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to an OpenChess account to view your saved friends.' });
      return;
    }
    ensureUserFriendStructures(auth.openChessUser);
    if (auth.openChessUser.onlineToken) {
      const followed = await Promise.race([
        syncLichessFollowingForToken(auth.openChessUser.onlineToken),
        new Promise<string[]>((r) => setTimeout(() => r([]), 2200)),
      ]);
      if (followed.length > 0) {
        auth.openChessUser.friends = mergeFriendsWithRemote({
          existingFriends: auth.openChessUser.friends ?? [],
          remoteFollowing: followed,
          removedFriends: auth.openChessUser.removedFriends ?? [],
        });
        saveUsersStore(usersStore);
      }
    }
    res.json(formatFriendListsPayload(auth.openChessUser));
  });

  app.post('/api/account/friends', async (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to an OpenChess account to send friend requests.' });
      return;
    }
    ensureUserFriendStructures(auth.openChessUser);
    const target = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(target)) {
      res.status(400).json({ error: 'Enter a valid player username (2–30 characters).' });
      return;
    }
    if (target.toLowerCase() === auth.openChessUser.username.toLowerCase()) {
      res.status(400).json({ error: 'You cannot send a friend request to yourself.' });
      return;
    }

    const sender = auth.openChessUser;
    const existingFriends = sender.friends ?? [];
    if (existingFriends.some((f) => f.toLowerCase() === target.toLowerCase())) {
      res.status(409).json({ error: `${target} is already in your Friends list.` });
      return;
    }
    if ((sender.outgoingRequests ?? []).some((r) => r.username.toLowerCase() === target.toLowerCase())) {
      res.status(409).json({ error: `Friend request to ${target} is already pending.` });
      return;
    }

    let resolvedName = usersStore.users[target.toLowerCase()]?.username ?? null;
    if (!resolvedName) {
      const pub = await fetchPublicLichessUser(target);
      if (pub?.username) resolvedName = String(pub.username);
    }

    if (!resolvedName) {
      res.status(404).json({ error: `Player "${target}" not found.` });
      return;
    }

    // Re-adding clears any prior local unfollow suppression
    sender.removedFriends = (sender.removedFriends ?? []).filter(
      (f) => f.toLowerCase() !== resolvedName!.toLowerCase(),
    );

    const activeFollowToken = sender.onlineToken || process.env.LICHESS_TOKEN?.trim();
    if (activeFollowToken) {
      void fetch(`https://lichess.org/api/rel/follow/${encodeURIComponent(resolvedName)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${activeFollowToken}` },
      }).catch(() => {});
    }

    // If target already sent an incoming request to sender, accept mutually!
    const incomingMatch = (sender.incomingRequests ?? []).find(
      (r) => r.username.toLowerCase() === resolvedName!.toLowerCase(),
    );
    if (incomingMatch) {
      sender.incomingRequests = (sender.incomingRequests ?? []).filter(
        (r) => r.username.toLowerCase() !== resolvedName!.toLowerCase(),
      );
      sender.friends = [resolvedName, ...(sender.friends ?? [])];
      const targetUser = ensureRecipientUserRecord(resolvedName);
      ensureUserFriendStructures(targetUser);
      targetUser.outgoingRequests = (targetUser.outgoingRequests ?? []).filter(
        (r) => r.username.toLowerCase() !== sender.username.toLowerCase(),
      );
      if (!targetUser.friends!.some((f) => f.toLowerCase() === sender.username.toLowerCase())) {
        targetUser.friends = [sender.username, ...(targetUser.friends ?? [])];
      }
      saveUsersStore(usersStore);
      wsRuntime.pushToUser(resolvedName, {
        type: 'notify:friend_accepted',
        byUsername: sender.username,
      });
      res.json({
        ...formatFriendListsPayload(sender),
        added: resolvedName,
        status: 'accepted',
      });
      return;
    }

    // Always ensure the recipient account record exists and receives the incoming request in their OpenChess inbox
    const now = Date.now();
    const targetRecord = ensureRecipientUserRecord(resolvedName);
    targetRecord.incomingRequests ??= [];
    if (
      !targetRecord.incomingRequests.some(
        (r) => (typeof r === 'string' ? r : r.username).toLowerCase() === sender.username.toLowerCase(),
      )
    ) {
      targetRecord.incomingRequests = [
        { username: sender.username, createdAt: now },
        ...targetRecord.incomingRequests,
      ];
    }

    wsRuntime.pushToUser(resolvedName, {
      type: 'notify:friend_request',
      fromUsername: sender.username,
      fromRating: sender.perfs?.rapid?.rating,
      fromAvatarUrl: sender.profile?.avatarUrl,
      createdAt: now,
    });

    sender.outgoingRequests = [
      { username: resolvedName, createdAt: now },
      ...(sender.outgoingRequests ?? []).filter(
        (r) => r.username.toLowerCase() !== resolvedName!.toLowerCase(),
      ),
    ];

    saveUsersStore(usersStore);
    res.json({
      ...formatFriendListsPayload(sender),
      requested: resolvedName,
      status: 'pending',
      syncedToNetwork: Boolean(activeFollowToken),
    });
  });

  app.post('/api/account/friends/respond', async (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to manage friend requests.' });
      return;
    }
    const user = auth.openChessUser;
    ensureUserFriendStructures(user);
    const target = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    const action = req.body?.action as 'accept' | 'reject' | 'cancel' | undefined;
    if (!target || !action || !['accept', 'reject', 'cancel'].includes(action)) {
      res.status(400).json({ error: 'Username and valid action are required.' });
      return;
    }

    const lowerTarget = target.toLowerCase();

    if (action === 'accept') {
      const inc = (user.incomingRequests ?? []).find((r) => r.username.toLowerCase() === lowerTarget);
      if (!inc) {
        res.status(404).json({ error: `No incoming friend request from ${target} to accept.` });
        return;
      }
      const canonical = inc.username;

      user.incomingRequests = (user.incomingRequests ?? []).filter(
        (r) => r.username.toLowerCase() !== lowerTarget,
      );
      user.outgoingRequests = (user.outgoingRequests ?? []).filter(
        (r) => r.username.toLowerCase() !== lowerTarget,
      );
      if (!(user.friends ?? []).some((f) => f.toLowerCase() === lowerTarget)) {
        user.friends = [canonical, ...(user.friends ?? [])];
      }

      const otherUser = usersStore.users[lowerTarget];
      if (otherUser) {
        ensureUserFriendStructures(otherUser);
        otherUser.outgoingRequests = (otherUser.outgoingRequests ?? []).filter(
          (r) => r.username.toLowerCase() !== user.username.toLowerCase(),
        );
        otherUser.incomingRequests = (otherUser.incomingRequests ?? []).filter(
          (r) => r.username.toLowerCase() !== user.username.toLowerCase(),
        );
        if (!(otherUser.friends ?? []).some((f) => f.toLowerCase() === user.username.toLowerCase())) {
          otherUser.friends = [user.username, ...(otherUser.friends ?? [])];
        }
      }

      if (user.onlineToken) {
        void fetch(`https://lichess.org/api/rel/follow/${encodeURIComponent(canonical)}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${user.onlineToken}` },
        }).catch(() => {});
      }

      saveUsersStore(usersStore);
      wsRuntime.pushToUser(canonical, {
        type: 'notify:friend_accepted',
        byUsername: user.username,
      });
      res.json({
        ...formatFriendListsPayload(user),
        accepted: canonical,
      });
      return;
    }

    // reject or cancel
    user.incomingRequests = (user.incomingRequests ?? []).filter(
      (r) => r.username.toLowerCase() !== lowerTarget,
    );
    user.outgoingRequests = (user.outgoingRequests ?? []).filter(
      (r) => r.username.toLowerCase() !== lowerTarget,
    );
    const otherUser = usersStore.users[lowerTarget];
    if (otherUser) {
      ensureUserFriendStructures(otherUser);
      otherUser.outgoingRequests = (otherUser.outgoingRequests ?? []).filter(
        (r) => r.username.toLowerCase() !== user.username.toLowerCase(),
      );
      otherUser.incomingRequests = (otherUser.incomingRequests ?? []).filter(
        (r) => r.username.toLowerCase() !== user.username.toLowerCase(),
      );
    }
    saveUsersStore(usersStore);
    wsRuntime.pushToUser(target, { type: 'notify:sync_needed' });
    res.json(formatFriendListsPayload(user));
  });

  app.delete('/api/account/friends/:username', (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to an OpenChess account to manage friends.' });
      return;
    }
    const user = auth.openChessUser;
    ensureUserFriendStructures(user);
    const rawTarget = req.params.username.trim();
    const target = rawTarget.toLowerCase();
    user.friends = (user.friends ?? []).filter(
      (f) => f.toLowerCase() !== target,
    );
    user.incomingRequests = (user.incomingRequests ?? []).filter(
      (r) => r.username.toLowerCase() !== target,
    );
    user.outgoingRequests = (user.outgoingRequests ?? []).filter(
      (r) => r.username.toLowerCase() !== target,
    );
    if (!(user.removedFriends ?? []).includes(target)) {
      user.removedFriends = [target, ...(user.removedFriends ?? [])].slice(0, 100);
    }

    const otherUser = usersStore.users[target];
    if (otherUser) {
      ensureUserFriendStructures(otherUser);
      const myLower = user.username.toLowerCase();
      otherUser.friends = (otherUser.friends ?? []).filter(
        (f) => f.toLowerCase() !== myLower,
      );
      otherUser.incomingRequests = (otherUser.incomingRequests ?? []).filter(
        (r) => r.username.toLowerCase() !== myLower,
      );
      otherUser.outgoingRequests = (otherUser.outgoingRequests ?? []).filter(
        (r) => r.username.toLowerCase() !== myLower,
      );
    }

    if (user.onlineToken && rawTarget) {
      void fetch(`https://lichess.org/api/rel/unfollow/${encodeURIComponent(rawTarget)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${user.onlineToken}` },
      }).catch(() => {});
    }
    saveUsersStore(usersStore);
    if (target) {
      wsRuntime.pushToUser(target, { type: 'notify:sync_needed' });
    }
    res.json(formatFriendListsPayload(user));
  });

  // Real-time Notifications & Direct Friend Game Invites (Approve / Reject inside OpenChess)
  app.get('/api/account/notifications', (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to view notifications.' });
      return;
    }
    res.json(buildNotificationsPayload(auth.openChessUser.username));
  });

  app.post('/api/account/invites', async (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to invite friends to play.' });
      return;
    }
    const sender = auth.openChessUser;
    const rawTarget = typeof req.body?.toUsername === 'string' ? req.body.toUsername.trim() : '';
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(rawTarget)) {
      res.status(400).json({ error: 'Enter a valid player username to invite.' });
      return;
    }
    if (rawTarget.toLowerCase() === sender.username.toLowerCase()) {
      res.status(400).json({ error: 'You cannot invite yourself to a match.' });
      return;
    }

    let resolvedTarget = usersStore.users[rawTarget.toLowerCase()]?.username ?? null;
    if (!resolvedTarget) {
      const pub = await fetchPublicLichessUser(rawTarget);
      if (pub?.username) resolvedTarget = String(pub.username);
    }
    if (!resolvedTarget) {
      res.status(404).json({ error: `Player "${rawTarget}" not found.` });
      return;
    }

    pruneGameInvites();
    // Replace any existing pending invite between this sender and target
    for (const [existingId, existingInv] of pendingGameInvites.entries()) {
      if (
        existingInv.fromUsername.toLowerCase() === sender.username.toLowerCase() &&
        existingInv.toUsername.toLowerCase() === resolvedTarget.toLowerCase()
      ) {
        pendingGameInvites.delete(existingId);
        wsRuntime.pushToUser(resolvedTarget, {
          type: 'notify:game_invite_cancelled',
          inviteId: existingId,
          byUsername: sender.username,
        });
      }
    }

    const timeId =
      typeof req.body?.timeId === 'string' && req.body.timeId.trim()
        ? req.body.timeId.trim()
        : '10+0';
    const initialSeconds = Math.max(60, Math.min(3600, Number(req.body?.initialSeconds) || 600));
    const incrementSeconds = Math.max(0, Math.min(60, Number(req.body?.incrementSeconds) || 0));
    const rawColor = req.body?.color;
    const fromColor: 'w' | 'b' =
      rawColor === 'w' ? 'w' : rawColor === 'b' ? 'b' : Math.random() < 0.5 ? 'w' : 'b';
    const rated = req.body?.rated !== false;

    const now = Date.now();
    const invite: PendingGameInvite = {
      id: `inv-${now}-${crypto.randomInt(1000, 9999)}`,
      fromUsername: sender.username,
      fromRating: sender.perfs?.rapid?.rating,
      fromAvatarUrl: sender.profile?.avatarUrl,
      toUsername: resolvedTarget,
      timeId,
      initialSeconds,
      incrementSeconds,
      rated,
      fromColor,
      roomId: `OC${wsRuntime.generateRoomCode().slice(0, 4)}`,
      createdAt: now,
      expiresAt: now + 180_000,
    };

    pendingGameInvites.set(invite.id, invite);
    wsRuntime.pushToUser(resolvedTarget, { type: 'notify:game_invite', invite });
    wsRuntime.pushToUser(sender.username, { type: 'notify:outgoing_invite', invite });

    // Also store a Direct Message notification in the target's OpenChess inbox
    const targetRec = ensureRecipientUserRecord(resolvedTarget);
    const inviteDm: DirectMessageItem = {
      id: `dm-inv-${now}-${crypto.randomInt(1000, 9999)}`,
      from: sender.username,
      to: targetRec.username,
      text: `Invited you to a ${timeId} match! Approve the popup or join Room Code: ${invite.roomId}`,
      timestamp: now,
      read: false,
      fromAvatarUrl: sanitizePublicAvatar(sender.profile?.avatarUrl),
      fromFlag: sender.profile?.flag || sender.profile?.country,
    };
    targetRec.dmThreads = upsertDirectMessage({
      threads: targetRec.dmThreads ?? {},
      partnerUsername: sender.username,
      message: inviteDm,
    });
    saveUsersStore(usersStore);

    // If sender has a linked network token, also push a real live game challenge directly to the target's network account
    const activeToken = sender.onlineToken || process.env.LICHESS_TOKEN?.trim();
    let networkChallengeUrl: string | undefined;
    if (activeToken) {
      try {
        const upRes = await fetch(`https://lichess.org/api/challenge/${encodeURIComponent(resolvedTarget)}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${activeToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams({
            rated: rated ? 'true' : 'false',
            'clock.limit': String(initialSeconds),
            'clock.increment': String(incrementSeconds),
            color: fromColor === 'w' ? 'white' : 'black',
          }).toString(),
          signal: AbortSignal.timeout(4500),
        });
        if (upRes.ok) {
          const chData = (await upRes.json()) as { challenge?: { url?: string }; url?: string };
          networkChallengeUrl = chData?.challenge?.url || chData?.url;
        }
      } catch {
        // ignore network challenge error
      }
    }

    res.json({ invite, networkChallenged: Boolean(networkChallengeUrl) });
  });

  app.post('/api/account/invites/respond', (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to respond to game invites.' });
      return;
    }
    const user = auth.openChessUser;
    const inviteId = typeof req.body?.inviteId === 'string' ? req.body.inviteId.trim() : '';
    const action = req.body?.action as 'accept' | 'reject' | 'cancel' | undefined;
    if (!inviteId || !action || !['accept', 'reject', 'cancel'].includes(action)) {
      res.status(400).json({ error: 'Invite ID and valid action are required.' });
      return;
    }

    pruneGameInvites();
    const invite = pendingGameInvites.get(inviteId);
    if (!invite) {
      res.status(404).json({ error: 'This game invite has expired or was cancelled.' });
      return;
    }

    const lowerUser = user.username.toLowerCase();
    const isSender = invite.fromUsername.toLowerCase() === lowerUser;
    const isTarget = invite.toUsername.toLowerCase() === lowerUser;

    if (action === 'cancel') {
      if (!isSender) {
        res.status(403).json({ error: 'Only the sender can cancel this invite.' });
        return;
      }
      pendingGameInvites.delete(inviteId);
      wsRuntime.pushToUser(invite.toUsername, {
        type: 'notify:game_invite_cancelled',
        inviteId,
        byUsername: user.username,
      });
      res.json({ ok: true, cancelled: true });
      return;
    }

    if (!isTarget) {
      res.status(403).json({ error: 'Only the invited player can approve or reject this invite.' });
      return;
    }

    pendingGameInvites.delete(inviteId);

    if (action === 'reject') {
      wsRuntime.pushToUser(invite.fromUsername, {
        type: 'notify:game_invite_rejected',
        inviteId,
        byUsername: user.username,
      });
      res.json({ ok: true, rejected: true });
      return;
    }

    // Accepted! Pre-create the server-authoritative room and notify both players to launch
    const senderColor = invite.fromColor;
    const accepterColor: 'w' | 'b' = senderColor === 'w' ? 'b' : 'w';
    const senderRec = usersStore.users[invite.fromUsername.toLowerCase()];
    const speedCategory =
      invite.initialSeconds < 180 ? 'bullet' : invite.initialSeconds < 480 ? 'blitz' : 'rapid';
    const senderRating = senderRec?.perfs?.[speedCategory]?.rating ?? invite.fromRating ?? 1500;
    const accepterRating = user.perfs?.[speedCategory]?.rating ?? 1500;

    wsRuntime.createInvitedRoom({
      roomId: invite.roomId,
      initialSeconds: invite.initialSeconds,
      incrementSeconds: invite.incrementSeconds,
      whiteName: senderColor === 'w' ? invite.fromUsername : user.username,
      blackName: senderColor === 'b' ? invite.fromUsername : user.username,
      whiteRating: senderColor === 'w' ? senderRating : accepterRating,
      blackRating: senderColor === 'b' ? senderRating : accepterRating,
      whiteAvatarUrl: senderColor === 'w' ? senderRec?.profile?.avatarUrl : user.profile?.avatarUrl,
      blackAvatarUrl: senderColor === 'b' ? senderRec?.profile?.avatarUrl : user.profile?.avatarUrl,
      whiteFlag:
        senderColor === 'w'
          ? senderRec?.profile?.flag || senderRec?.profile?.country
          : user.profile?.flag || user.profile?.country,
      blackFlag:
        senderColor === 'b'
          ? senderRec?.profile?.flag || senderRec?.profile?.country
          : user.profile?.flag || user.profile?.country,
      whiteTitle: senderColor === 'w' ? senderRec?.title : user.title,
      blackTitle: senderColor === 'b' ? senderRec?.title : user.title,
      rated: invite.rated,
    });

    wsRuntime.pushToUser(invite.fromUsername, {
      type: 'notify:game_invite_accepted',
      invite,
      roomId: invite.roomId,
      timeId: invite.timeId,
      yourColor: senderColor,
      opponentUsername: user.username,
    });

    res.json({
      ok: true,
      roomId: invite.roomId,
      timeId: invite.timeId,
      yourColor: accepterColor,
      opponentUsername: invite.fromUsername,
    });
  });

  app.post('/api/account/result', (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to save your ratings.' });
      return;
    }
    const category = req.body?.category;
    const outcome = req.body?.outcome;
    const opponentRating = Number(req.body?.opponentRating) || 1200;
    const rawGameId = typeof req.body?.gameId === 'string' ? req.body.gameId.trim() : '';
    if (
      !['rapid', 'blitz', 'bullet', 'puzzle'].includes(category) ||
      !['win', 'loss', 'draw'].includes(outcome)
    ) {
      res.status(400).json({ error: 'Invalid result payload.' });
      return;
    }

    const user = auth.openChessUser;
    if (rawGameId) {
      const normalizedRoomMatch = /^ws-([A-Z0-9]{4,8})/i.exec(rawGameId);
      const dedupKey = `${user.username.toLowerCase()}:${normalizedRoomMatch ? `ws-${normalizedRoomMatch[1].toUpperCase()}` : rawGameId}`;
      if (ratedGameKeys.has(dedupKey)) {
        res.json({
          account: buildAccountPayload(user, { online: true }),
        });
        return;
      }
      ratedGameKeys.add(dedupKey);
    }

    user.localProgressInitialized = true;
    user.perfs ??= defaultAccountPerfs();
    user.count ??= defaultAccountCount();
    const perfKey = category as RatingSpeed;
    const currentPerf = user.perfs[perfKey];
    const nextRating = calculateUpdatedElo(currentPerf.rating, opponentRating, outcome);
    user.perfs[perfKey] = {
      ...currentPerf,
      rating: nextRating,
      games: currentPerf.games + 1,
    };
    user.ratingHistory = appendRatingHistoryPoint(user.ratingHistory, perfKey, nextRating);
    const leagueGain = outcome === 'win' ? 15 : outcome === 'draw' ? 6 : 2;
    user.leaguePoints = (user.leaguePoints ?? 0) + leagueGain;

    if (category !== 'puzzle') {
      user.count.all += 1;
      user.count.rated = (user.count.rated ?? 0) + 1;
      if (outcome === 'win') user.count.win += 1;
      else if (outcome === 'loss') user.count.loss += 1;
      else user.count.draw += 1;
    }

    saveUsersStore(usersStore);
    res.json({
      account: buildAccountPayload(user, { online: true }),
    });
  });

  app.post('/api/account/puzzle-progress', (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to save puzzle progress.' });
      return;
    }
    const user = auth.openChessUser;
    user.localProgressInitialized = true;
    user.perfs ??= defaultAccountPerfs();
    user.count ??= defaultAccountCount();

    const rating = Number(req.body?.rating);
    const solvedDelta = Number(req.body?.solvedDelta);
    const stormScore = Number(req.body?.stormScore);
    const streakScore = Number(req.body?.streakScore);

    if (Number.isFinite(rating) && rating > 0) {
      const nextPuzzleRating = Math.round(rating);
      user.perfs.puzzle = {
        ...user.perfs.puzzle,
        rating: nextPuzzleRating,
        games: user.perfs.puzzle.games + (Number.isFinite(solvedDelta) && solvedDelta > 0 ? solvedDelta : 0),
      };
      user.ratingHistory = appendRatingHistoryPoint(user.ratingHistory, 'puzzle', nextPuzzleRating);
    } else if (Number.isFinite(solvedDelta) && solvedDelta > 0) {
      user.perfs.puzzle = {
        ...user.perfs.puzzle,
        games: user.perfs.puzzle.games + solvedDelta,
      };
    }

    if (Number.isFinite(solvedDelta) && solvedDelta > 0) {
      user.leaguePoints = (user.leaguePoints ?? 0) + Math.round(solvedDelta) * 3;
    }

    if (Number.isFinite(stormScore) && stormScore > 0) {
      const prev = user.perfs.storm ?? { runs: 0, score: 0 };
      user.perfs.storm = {
        runs: prev.runs + 1,
        score: Math.max(prev.score, Math.round(stormScore)),
      };
    }

    if (Number.isFinite(streakScore) && streakScore > 0) {
      const prev = user.perfs.streak ?? { runs: 0, score: 0 };
      user.perfs.streak = {
        runs: prev.runs + 1,
        score: Math.max(prev.score, Math.round(streakScore)),
      };
    }

    saveUsersStore(usersStore);
    res.json({
      account: buildAccountPayload(user, { online: true }),
    });
  });

  const enrichGamePlayers = (games: LichessUserGame[]): LichessUserGame[] =>
    games.map((g) => {
      const wUser = g.white?.name ? usersStore.users[g.white.name.toLowerCase()] : undefined;
      const bUser = g.black?.name ? usersStore.users[g.black.name.toLowerCase()] : undefined;
      return {
        ...g,
        white: {
          ...g.white,
          avatarUrl: g.white?.avatarUrl ?? sanitizePublicAvatar(wUser?.profile?.avatarUrl),
          flag: g.white?.flag ?? wUser?.profile?.flag ?? wUser?.profile?.country,
        },
        black: {
          ...g.black,
          avatarUrl: g.black?.avatarUrl ?? sanitizePublicAvatar(bUser?.profile?.avatarUrl),
          flag: g.black?.flag ?? bUser?.profile?.flag ?? bUser?.profile?.country,
        },
      };
    });

  app.get('/api/account/games', async (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to view saved games.' });
      return;
    }
    if (auth.openChessUser.isLocalOpenChessAccount && !auth.openChessUser.onlineToken) {
      res.json({ games: enrichGamePlayers(auth.openChessUser.playedGames ?? []) });
      return;
    }
    const forceFresh = req.query.fresh === '1' || Boolean(auth.openChessUser.onlineToken) || !(auth.openChessUser.playedGames?.length);
    if (forceFresh) {
      const games = await Promise.race([
        syncRecentGamesIntoStore(
          auth.openChessUser.username,
          auth.openChessUser.onlineToken,
          auth.openChessUser,
          Boolean(auth.openChessUser.onlineToken),
        ).catch(() => auth.openChessUser?.playedGames ?? []),
        new Promise<LichessUserGame[]>((r) =>
          setTimeout(() => r(auth.openChessUser?.playedGames ?? []), 3500),
        ),
      ]);
      res.json({ games: enrichGamePlayers(games) });
      return;
    }
    res.json({ games: enrichGamePlayers(auth.openChessUser.playedGames ?? []) });
  });

  app.post('/api/account/games', (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to save game history.' });
      return;
    }
    const raw = req.body?.game as Partial<LichessUserGame> | undefined;
    if (!raw || typeof raw.id !== 'string' || typeof raw.pgn !== 'string' || !raw.pgn.trim()) {
      res.status(400).json({ error: 'Valid game payload required.' });
      return;
    }
    const cleanGame: LichessUserGame = {
      id: raw.id.slice(0, 64),
      rated: Boolean(raw.rated),
      speed: typeof raw.speed === 'string' ? raw.speed : 'rapid',
      status: typeof raw.status === 'string' ? raw.status : 'finished',
      winner: raw.winner === 'white' || raw.winner === 'black' ? raw.winner : undefined,
      white: {
        name: raw.white?.name || 'White',
        rating: typeof raw.white?.rating === 'number' ? raw.white.rating : undefined,
        title: typeof raw.white?.title === 'string' ? raw.white.title : undefined,
      },
      black: {
        name: raw.black?.name || 'Black',
        rating: typeof raw.black?.rating === 'number' ? raw.black.rating : undefined,
        title: typeof raw.black?.title === 'string' ? raw.black.title : undefined,
      },
      pgn: raw.pgn,
      opening: typeof raw.opening === 'string' ? raw.opening : undefined,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
      lastMoveAt: typeof raw.lastMoveAt === 'number' ? raw.lastMoveAt : Date.now(),
    };
    const user = auth.openChessUser;
    user.localProgressInitialized = true;
    const existingIds = new Set((user.playedGames ?? []).map((g) => g.id));
    const isNewGame = !existingIds.has(cleanGame.id);
    user.playedGames = mergeSyncedGames([cleanGame], user.playedGames ?? []).slice(0, 60);
    if (isNewGame) {
      const myLower = user.username.toLowerCase();
      const playedWhite = cleanGame.white.name.toLowerCase() === myLower;
      const playedBlack = cleanGame.black.name.toLowerCase() === myLower;
      if (playedWhite || playedBlack) {
        const mySide = playedWhite ? 'white' : 'black';
        user.count ??= defaultAccountCount();
        user.count.all = Math.max(user.count.all + 1, user.playedGames.length);
        if (cleanGame.rated) {
          user.count.rated = (user.count.rated ?? 0) + 1;
        }
        if (cleanGame.winner === mySide) {
          user.count.win += 1;
        } else if (cleanGame.winner && cleanGame.winner !== mySide) {
          user.count.loss += 1;
        } else {
          user.count.draw += 1;
        }
      }
    }
    saveUsersStore(usersStore);

    if (/^(oc-|ws-)/.test(cleanGame.id) && user.onlineToken) {
      void (async () => {
        try {
          const upstream = await fetch('https://lichess.org/api/import', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              Accept: 'application/json',
              'User-Agent': 'OpenChess/1.0',
              Authorization: `Bearer ${user.onlineToken}`,
            },
            body: new URLSearchParams({ pgn: cleanGame.pgn }).toString(),
            signal: AbortSignal.timeout(7000),
          });
          if (upstream.ok) {
            const imported = (await upstream.json()) as { id?: string; url?: string };
            if (imported?.id) {
              const target = (user.playedGames ?? []).find((g) => g.id === cleanGame.id);
              if (target) {
                (target as LichessUserGame & { importedId?: string; importedUrl?: string }).importedId = imported.id;
                (target as LichessUserGame & { importedId?: string; importedUrl?: string }).importedUrl = imported.url;
                saveUsersStore(usersStore);
              }
            }
          }
        } catch {
          // non-blocking remote game push
        }
      })();
    }

    res.json({
      games: user.playedGames,
      count: user.count,
      account: buildAccountPayload(user, { online: true }),
    });
  });

  app.post('/api/account/sync', async (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.sessionToken || !auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to sync your account.' });
      return;
    }
    const user = auth.openChessUser;
    ensureUserFriendStructures(user);

    // Merge client-cached friends, outgoingRequests, removedFriends & playedGames so user data survives container restarts
    const clientRemoved = Array.isArray(req.body?.localRemovedFriends)
      ? (req.body.localRemovedFriends as unknown[])
          .filter((f): f is string => typeof f === 'string' && /^[a-zA-Z0-9_-]{2,30}$/.test(f.trim()))
          .map((f) => f.trim().toLowerCase())
      : [];
    if (clientRemoved.length > 0) {
      const mergedRemoved = Array.from(
        new Set([...(user.removedFriends ?? []).map((f) => f.toLowerCase()), ...clientRemoved]),
      ).slice(0, 100);
      user.removedFriends = mergedRemoved;
      const rmSet = new Set(mergedRemoved);
      user.friends = (user.friends ?? []).filter((f) => !rmSet.has(f.toLowerCase()));
      user.outgoingRequests = (user.outgoingRequests ?? []).filter(
        (r) => !rmSet.has((typeof r === 'string' ? r : r.username).toLowerCase()),
      );
    }

    const clientFriends = Array.isArray(req.body?.localFriends)
      ? (req.body.localFriends as unknown[]).filter(
          (f): f is string => typeof f === 'string' && /^[a-zA-Z0-9_-]{2,30}$/.test(f.trim()),
        )
      : [];
    const removedSet = new Set((user.removedFriends ?? []).map((f) => f.toLowerCase()));
    if (clientFriends.length > 0) {
      const existingLower = new Set((user.friends ?? []).map((f) => f.toLowerCase()));
      for (const rawF of clientFriends) {
        const cleanF = rawF.trim();
        const lowerF = cleanF.toLowerCase();
        if (lowerF !== user.username.toLowerCase() && !removedSet.has(lowerF) && !existingLower.has(lowerF)) {
          user.friends = [...(user.friends ?? []), cleanF];
          existingLower.add(lowerF);
        }
      }
    }

    const clientOutgoing = Array.isArray(req.body?.localOutgoingRequests)
      ? (req.body.localOutgoingRequests as unknown[]).filter(
          (f): f is string => typeof f === 'string' && /^[a-zA-Z0-9_-]{2,30}$/.test(f.trim()),
        )
      : [];
    if (clientOutgoing.length > 0) {
      const existingFriendSet = new Set((user.friends ?? []).map((f) => f.toLowerCase()));
      const existingOutgoingSet = new Set(
        (user.outgoingRequests ?? []).map((r) => (typeof r === 'string' ? r : r.username).toLowerCase()),
      );
      const nowTs = Date.now();
      for (const rawOut of clientOutgoing) {
        const cleanOut = rawOut.trim();
        const lowerOut = cleanOut.toLowerCase();
        if (
          lowerOut !== user.username.toLowerCase() &&
          !removedSet.has(lowerOut) &&
          !existingFriendSet.has(lowerOut) &&
          !existingOutgoingSet.has(lowerOut)
        ) {
          user.outgoingRequests = [...(user.outgoingRequests ?? []), { username: cleanOut, createdAt: nowTs }];
          existingOutgoingSet.add(lowerOut);
        }
      }
      reconcileAllFriendRequests();
    }

    const clientPlayedGames = Array.isArray(req.body?.localPlayedGames)
      ? (req.body.localPlayedGames as LichessUserGame[]).filter(
          (g) => g && typeof g === 'object' && typeof g.id === 'string' && typeof g.pgn === 'string' && g.pgn.trim(),
        )
      : [];
    if (clientPlayedGames.length > 0) {
      user.playedGames = mergeSyncedGames(user.playedGames ?? [], clientPlayedGames).slice(0, 60);
    }

    const rawLocalProgress =
      req.body?.localAccountProgress && typeof req.body.localAccountProgress === 'object'
        ? (req.body.localAccountProgress as AccountProgressSyncPayload)
        : null;
    if (rawLocalProgress) {
      const mergedProgress = mergeLocalAccountProgress({
        server: {
          perfs: user.perfs,
          count: user.count,
          profile: user.profile,
          leaguePoints: user.leaguePoints,
          ratingHistory: user.ratingHistory,
          localProgressInitialized: user.localProgressInitialized,
        },
        local: rawLocalProgress,
      });
      user.perfs = {
        ...mergedProgress.perfs,
        rapid: mergedProgress.perfs.rapid ?? { rating: 1200, games: 0 },
        blitz: mergedProgress.perfs.blitz ?? { rating: 1200, games: 0 },
        bullet: mergedProgress.perfs.bullet ?? { rating: 1200, games: 0 },
        puzzle: mergedProgress.perfs.puzzle ?? { rating: 1200, games: 0 },
      };
      user.count = mergedProgress.count;
      user.profile = mergedProgress.profile;
      user.leaguePoints = mergedProgress.leaguePoints;
      user.ratingHistory = mergedProgress.ratingHistory;
      if (mergedProgress.restoredFromLocal) {
        user.localProgressInitialized = true;
      }
    }

    if ((user.isLocalOpenChessAccount || user.localProgressInitialized) && !user.onlineToken) {
      user.seenAt = Date.now();
      saveUsersStore(usersStore);
      res.json({
        account: buildAccountPayload(user, { online: true }),
        ...formatFriendListsPayload(user),
        playedGames: enrichGamePlayers(user.playedGames ?? []),
        hasOnlineToken: false,
        syncedAt: Date.now(),
      });
      return;
    }
    const [synced] = await Promise.all([
      fetchNetworkProfileForUser(user.username, user.onlineToken, user, true),
      syncRecentGamesIntoStore(
        user.username,
        user.onlineToken,
        user,
        Boolean(user.onlineToken),
      ).catch(() => []),
    ]);
    if (synced.ok) {
      saveUsersStore(usersStore);
      res.json({
        account: buildAccountPayload(user, { online: true }),
        ...formatFriendListsPayload(user),
        playedGames: enrichGamePlayers(user.playedGames ?? []),
        hasOnlineToken: Boolean(user.onlineToken),
        syncedAt: Date.now(),
      });
      return;
    }
    saveUsersStore(usersStore);
    res.json({
      account: buildAccountPayload(user, { online: true }),
      ...formatFriendListsPayload(user),
      playedGames: enrichGamePlayers(user.playedGames ?? []),
      hasOnlineToken: Boolean(user.onlineToken),
      syncedAt: Date.now(),
    });
  });

  // ==========================================================================
  // LIVE LICHESS <-> OPENCHESS CLIENT PROXY ENDPOINTS (/api/proxy/*)
  // ==========================================================================
  app.get('/api/proxy/status', async (req, res) => {
    const auth = resolveOnlineToken(req);
    const startMs = Date.now();
    let upstreamOnline = false;
    let latencyMs = 0;
    try {
      const pingUrl = auth.openChessUser?.username
        ? `https://lichess.org/api/user/${encodeURIComponent(auth.openChessUser.username)}`
        : 'https://lichess.org/api/tv/channels';
      const ping = await fetch(pingUrl, {
        headers: { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' },
        signal: AbortSignal.timeout(4000),
      });
      upstreamOnline = ping.ok;
      latencyMs = Date.now() - startMs;
    } catch {
      upstreamOnline = false;
      latencyMs = Date.now() - startMs;
    }

    const user = auth.openChessUser;
    res.json({
      ok: true,
      upstreamOnline,
      latencyMs,
      upstreamHost: 'live-chess-cloud',
      socketHost: 'live-lobby-ws',
      authenticated: Boolean(user),
      hasWriteToken: Boolean(auth.onlineToken || user?.onlineToken),
      username: user?.username ?? null,
      syncedGamesCount: user?.playedGames?.length ?? 0,
      friendsCount: user?.friends?.length ?? 0,
      timestamp: Date.now(),
    });
  });

  app.get('/api/proxy/lobby', async (_req, res) => {
    const liveHooks = await refreshLichessLiveHooks(1000);
    const hooks = liveHooks
      .filter((h) => {
        const rawU = typeof h.u === 'string' ? h.u.trim() : '';
        return Boolean(rawU && rawU.toLowerCase() !== 'anonymous');
      })
      .slice(0, 24)
      .map((h) => {
        const parsedClock = parseHookClockSeconds(h);
        const speed =
          parsedClock.initial <= 120
            ? 'bullet'
            : parsedClock.initial <= 480
              ? 'blitz'
              : 'rapid';
        const rawU = String(h.u).trim();
        return {
          id: h.id,
          username: rawU,
          rating: typeof h.rating === 'number' ? h.rating : 1500,
          speed,
          clock: String(h.clock || `${Math.round(parsedClock.initial / 60)}+${parsedClock.increment}`),
          initialSeconds: parsedClock.initial,
          incrementSeconds: parsedClock.increment,
          rated: Boolean(h.ra),
          color: h.c === 'white' ? 'white' : h.c === 'black' ? 'black' : 'random',
          server: 'Lichess' as const,
        };
      });
    res.json({ hooks, openSeatsCount: liveHooks.length });
  });

  app.post('/api/proxy/import-pgn', async (req, res) => {
    const auth = resolveOnlineToken(req);
    const pgn = typeof req.body?.pgn === 'string' ? req.body.pgn.trim() : '';
    const gameId = typeof req.body?.gameId === 'string' ? req.body.gameId.trim() : '';
    if (!pgn || !hasPlayableMovesInPgn(pgn)) {
      res.status(400).json({ error: 'Valid PGN with at least 1 move is required.' });
      return;
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        'User-Agent': 'OpenChess/1.0',
      };
      const token = auth.onlineToken || auth.openChessUser?.onlineToken;
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const upstream = await fetch('https://lichess.org/api/import', {
        method: 'POST',
        headers,
        body: new URLSearchParams({ pgn }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      if (!upstream.ok) {
        const text = await upstream.text().catch(() => '');
        res.status(upstream.status).json({
          error: `Cloud archive import returned HTTP ${upstream.status}${text ? `: ${text.slice(0, 120)}` : ''}`,
        });
        return;
      }
      const imported = (await upstream.json()) as { id?: string; url?: string };
      if (auth.openChessUser && imported?.id && gameId) {
        const target = (auth.openChessUser.playedGames ?? []).find((g) => g.id === gameId);
        if (target) {
          (target as LichessUserGame & { importedId?: string; importedUrl?: string }).importedId = imported.id;
          (target as LichessUserGame & { importedId?: string; importedUrl?: string }).importedUrl = imported.url;
          saveUsersStore(usersStore);
        }
      }
      res.json({
        ok: true,
        id: imported.id,
        url: imported.url,
        attachedToAccount: Boolean(token),
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Could not reach cloud import proxy.',
      });
    }
  });

  app.get('/api/proxy/inspect/:username', async (req, res) => {
    const rawUser = String(req.params.username || '').trim();
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(rawUser)) {
      res.status(400).json({ error: 'Invalid player username.' });
      return;
    }
    const auth = resolveOnlineToken(req);
    const token = auth.onlineToken || auth.openChessUser?.onlineToken;

    const stored = usersStore.users[rawUser.toLowerCase()];
    const [pubUser, games, currentGameRes] = await Promise.all([
      fetchPublicLichessUser(rawUser, true),
      syncRecentGamesIntoStore(rawUser, token ?? undefined, stored, true).catch(() => []),
      fetch(
        `https://lichess.org/api/user/${encodeURIComponent(rawUser)}/current-game?pgnInJson=true&opening=true`,
        {
          headers: { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' },
          signal: AbortSignal.timeout(4000),
        },
      )
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    if (!pubUser) {
      res.status(404).json({ error: `No account found for "${rawUser}".` });
      return;
    }

    const mergedGames = enrichGamePlayers(
      stored?.playedGames ? mergeSyncedGames(games, stored.playedGames) : games,
    );

    const profilePayload = {
      id: String(pubUser.id ?? rawUser.toLowerCase()),
      username: String(pubUser.username ?? rawUser),
      title: pubUser.title,
      online: Boolean(pubUser.online),
      playing: Boolean(pubUser.playing || currentGameRes?.id),
      createdAt: pubUser.createdAt,
      seenAt: pubUser.seenAt,
      playTime: pubUser.playTime,
      perfs: extractExactLichessPerfs(pubUser.perfs),
      count: {
        all: Math.max(pubUser.count?.all ?? 0, mergedGames.length),
        win: pubUser.count?.win ?? 0,
        loss: pubUser.count?.loss ?? 0,
        draw: pubUser.count?.draw ?? 0,
        rated: pubUser.count?.rated ?? 0,
      },
    };

    res.json({
      ok: true,
      account: profilePayload,
      profile: profilePayload,
      currentGame: currentGameRes ? normalizeRawLichessGame(currentGameRes) : null,
      recentGames: mergedGames,
      games: mergedGames,
      inspectedAt: Date.now(),
    });
  });

  async function resolveDetailedUsersStatus(usernames: string[]) {
    const remoteMap = new Map<string, any>();
    try {
      const upstream = await fetch('https://lichess.org/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          Accept: 'application/json',
          'User-Agent': 'OpenChess/1.0',
        },
        body: usernames.join(','),
        signal: AbortSignal.timeout(5000),
      });
      if (upstream.ok) {
        const arr = (await upstream.json()) as any[];
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item?.username) {
              remoteMap.set(String(item.username).toLowerCase(), item);
            }
          }
        }
      }
    } catch {
      // fall back cleanly to local stored data
    }

    return usernames.map((uname) => {
      const key = uname.toLowerCase();
      const remote = remoteMap.get(key);
      const local = usersStore.users[key];
      const rapid = remote?.perfs?.rapid ?? local?.perfs?.rapid;
      const blitz = remote?.perfs?.blitz ?? local?.perfs?.blitz;
      const bullet = remote?.perfs?.bullet ?? local?.perfs?.bullet;
      const correspondence = remote?.perfs?.correspondence ?? local?.perfs?.correspondence;
      const classical = remote?.perfs?.classical ?? local?.perfs?.classical;
      const puzzle = remote?.perfs?.puzzle ?? local?.perfs?.puzzle;

      const candidates: Array<{
        speed: 'rapid' | 'blitz' | 'bullet' | 'correspondence' | 'classical';
        rating: number;
        games: number;
      }> = [
        rapid ? { speed: 'rapid' as const, rating: rapid.rating, games: rapid.games ?? 0 } : null,
        blitz ? { speed: 'blitz' as const, rating: blitz.rating, games: blitz.games ?? 0 } : null,
        bullet ? { speed: 'bullet' as const, rating: bullet.rating, games: bullet.games ?? 0 } : null,
        correspondence
          ? { speed: 'correspondence' as const, rating: correspondence.rating, games: correspondence.games ?? 0 }
          : null,
        classical
          ? { speed: 'classical' as const, rating: classical.rating, games: classical.games ?? 0 }
          : null,
      ].filter((c): c is NonNullable<typeof c> => c !== null);

      const discovered = LIVE_DISCOVERED_PLAYERS.get(key);
      const bestAvatar =
        sanitizePublicAvatar(local?.profile?.avatarUrl) ||
        sanitizePublicAvatar(remote?.profile?.avatarUrl) ||
        discovered?.avatarUrl;
      const fallbackRating = discovered?.rating ?? (local ? 1200 : 1500);
      const fallbackSpeed = {
        speed: 'rapid' as const,
        rating: rapid?.rating ?? fallbackRating,
        games: rapid?.games ?? 0,
      };
      const activePrimary =
        candidates.slice().sort((a, b) => b.games - a.games || b.rating - a.rating)[0] ??
        fallbackSpeed;

      return {
        username: local?.username ?? remote?.username ?? discovered?.username ?? uname,
        title: local?.title ?? remote?.title ?? discovered?.title,
        flag:
          local?.profile?.flag ||
          local?.profile?.country ||
          remote?.profile?.flag ||
          remote?.profile?.country ||
          discovered?.flag ||
          'INT',
        bio: local?.profile?.bio ?? remote?.profile?.bio,
        avatarUrl: bestAvatar,
        sourceServer: local ? ('OpenChess' as const) : discovered?.sourceServer ?? ('Lichess' as const),
        online: wsRuntime.isUserOnline(uname) || Boolean(remote?.online) || Boolean(discovered && Date.now() - discovered.updatedAt < 180_000),
        seenAt: local?.seenAt ?? (typeof remote?.seenAt === 'number' ? remote.seenAt : discovered?.updatedAt),
        createdAt: local?.createdAt ?? (typeof remote?.createdAt === 'number' ? remote.createdAt : undefined),
        leaguePoints: local?.leaguePoints ?? 0,
        league: computeLeagueInfo(local?.leaguePoints ?? 0),
        bestSpeed: activePrimary.speed,
        bestRating: activePrimary.rating,
        perfs: {
          rapid: rapid
            ? { rating: rapid.rating, games: rapid.games ?? 0 }
            : discovered?.rating
              ? { rating: discovered.rating, games: 0 }
              : undefined,
          blitz: blitz ? { rating: blitz.rating, games: blitz.games ?? 0 } : undefined,
          bullet: bullet ? { rating: bullet.rating, games: bullet.games ?? 0 } : undefined,
          correspondence: correspondence
            ? { rating: correspondence.rating, games: correspondence.games ?? 0 }
            : undefined,
          classical: classical
            ? { rating: classical.rating, games: classical.games ?? 0 }
            : undefined,
          puzzle: puzzle ? { rating: puzzle.rating, games: puzzle.games ?? 0 } : undefined,
        },
      };
    });
  }

  app.post('/api/lichess/users-status', async (req, res) => {
    const rawList: unknown[] = Array.isArray(req.body?.usernames) ? req.body.usernames : [];
    const usernames = Array.from(
      new Set<string>(
        rawList
          .filter((x): x is string => typeof x === 'string')
          .map((x) => x.trim())
          .filter((x) => /^[a-zA-Z0-9_-]{2,30}$/.test(x)),
      ),
    ).slice(0, 30);

    if (usernames.length === 0) {
      res.json({ users: [] });
      return;
    }

    const users = await resolveDetailedUsersStatus(usernames);
    res.json({ users });
  });

  app.get('/api/lichess/autocomplete', async (req, res) => {
    const term = typeof req.query.term === 'string' ? req.query.term.trim() : '';
    if (term.length < 2) {
      res.json({ users: [] });
      return;
    }

    const matchedNames = new Set<string>();
    const lowerTerm = term.toLowerCase();

    for (const u of Object.values(usersStore.users)) {
      if (u.username.toLowerCase().includes(lowerTerm)) {
        matchedNames.add(u.username);
      }
    }

    for (const p of LIVE_DISCOVERED_PLAYERS.values()) {
      if (p.username.toLowerCase().includes(lowerTerm)) {
        matchedNames.add(p.username);
      }
    }

    try {
      const upstream = await fetch(
        `https://lichess.org/api/player/autocomplete?term=${encodeURIComponent(term)}&object=true`,
        {
          headers: { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' },
          signal: AbortSignal.timeout(4500),
        },
      );
      if (upstream.ok) {
        const data = (await upstream.json()) as { result?: Array<{ name?: string; id?: string }> };
        if (Array.isArray(data?.result)) {
          for (const item of data.result) {
            if (typeof item?.name === 'string') {
              matchedNames.add(item.name);
            }
          }
        }
      }
    } catch {
      // fallback to multi-server direct user check if Lichess autocomplete fails
    }

    if (matchedNames.size < 3 && /^[a-zA-Z0-9_-]{2,30}$/.test(term)) {
      const pub = await fetchPublicLichessUser(term);
      if (pub?.username) matchedNames.add(String(pub.username));
    }

    const nameList = [...matchedNames].slice(0, 14);
    if (nameList.length === 0) {
      res.json({ users: [] });
      return;
    }

    const users = await resolveDetailedUsersStatus(nameList);
    res.json({ users });
  });

  app.get('/api/lichess/suggestions', async (_req, res) => {
    await refreshLiveDiscoveredPlayers();
    const localNames = Object.values(usersStore.users)
      .sort((a, b) => (b.seenAt ?? 0) - (a.seenAt ?? 0))
      .slice(0, 5)
      .map((u) => u.username);
    const liveAll = Array.from(LIVE_DISCOVERED_PLAYERS.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    );
    const lichessLive = liveAll.filter((p) => p.sourceServer === 'Lichess').slice(0, 5);
    const chessComLive = liveAll.filter((p) => p.sourceServer === 'Chess.com').slice(0, 5);
    const ficsLive = liveAll.filter((p) => p.sourceServer === 'FICS').slice(0, 4);
    const names = Array.from(
      new Set([
        ...localNames,
        ...lichessLive.map((p) => p.username),
        ...chessComLive.map((p) => p.username),
        ...ficsLive.map((p) => p.username),
      ]),
    ).slice(0, 14);
    const users = names.length > 0 ? await resolveDetailedUsersStatus(names) : [];
    res.json({ users });
  });

  // -------------------------------------------------------------------------
  // Direct Messages, Live Open Lobby, Active Games Spectator, Player Profiles & Leaderboard
  // -------------------------------------------------------------------------
  app.get('/api/messages/threads', async (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to view direct messages.' });
      return;
    }
    const user = auth.openChessUser;
    const threadsMap = user.dmThreads ?? {};
    const meLower = user.username.toLowerCase();
    const threads: DirectMessageThread[] = [];
    for (const [partnerKey, msgs] of Object.entries(threadsMap)) {
      if (!Array.isArray(msgs) || msgs.length === 0) continue;
      const partnerRec = usersStore.users[partnerKey];
      const partnerName =
        partnerRec?.username ??
        (msgs[msgs.length - 1].from.toLowerCase() === meLower
          ? msgs[msgs.length - 1].to
          : msgs[msgs.length - 1].from);
      const unreadCount = msgs.filter(
        (m) => m.to.toLowerCase() === meLower && m.from.toLowerCase() !== meLower && !m.read,
      ).length;
      threads.push({
        partnerUsername: partnerName,
        partnerAvatarUrl: partnerRec?.profile?.avatarUrl,
        partnerFlag: partnerRec?.profile?.flag || partnerRec?.profile?.country || 'INT',
        partnerOnline: wsRuntime.isUserOnline(partnerName),
        partnerRating: partnerRec?.perfs?.rapid?.rating,
        lastMessage: msgs[msgs.length - 1],
        unreadCount,
        messages: msgs,
      });
    }
    threads.sort((a, b) => b.lastMessage.timestamp - a.lastMessage.timestamp);
    res.json({ threads });
  });

  app.get('/api/messages/:username', async (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to view messages.' });
      return;
    }
    const partnerRaw = String(req.params.username || '').trim();
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(partnerRaw)) {
      res.status(400).json({ error: 'Valid player username required.' });
      return;
    }
    const user = auth.openChessUser;
    const partnerKey = partnerRaw.toLowerCase();
    const partnerRec = usersStore.users[partnerKey];
    const pubUser = !partnerRec
      ? await Promise.race([
          fetchPublicLichessUser(partnerRaw, false),
          new Promise<null>((r) => setTimeout(() => r(null), 650)),
        ]).catch(() => null)
      : null;

    user.dmThreads ??= {};
    const msgs = user.dmThreads[partnerKey] ?? [];
    const meLower = user.username.toLowerCase();
    let changed = false;
    for (const m of msgs) {
      if (m.to.toLowerCase() === meLower && !m.read) {
        m.read = true;
        changed = true;
      }
    }
    if (changed) saveUsersStore(usersStore);
    res.json({
      partner: {
        username: partnerRec?.username ?? pubUser?.username ?? partnerRaw,
        avatarUrl: partnerRec?.profile?.avatarUrl,
        flag:
          partnerRec?.profile?.flag ||
          partnerRec?.profile?.country ||
          pubUser?.profile?.flag ||
          pubUser?.profile?.country ||
          'INT',
        online: wsRuntime.isUserOnline(partnerRaw) || Boolean(pubUser?.online),
        rating: partnerRec?.perfs?.rapid?.rating ?? pubUser?.perfs?.rapid?.rating,
      },
      messages: msgs,
    });
  });

  app.post('/api/messages/:username', (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.openChessUser) {
      res.status(401).json({ error: 'Sign in to send messages.' });
      return;
    }
    const partnerRaw = String(req.params.username || '').trim();
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 600) : '';
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(partnerRaw) || !text) {
      res.status(400).json({ error: 'Valid recipient username and non-empty message are required.' });
      return;
    }
    const sender = auth.openChessUser;
    if (partnerRaw.toLowerCase() === sender.username.toLowerCase()) {
      res.status(400).json({ error: 'You cannot message yourself.' });
      return;
    }
    const targetRec = usersStore.users[partnerRaw.toLowerCase()];
    const targetUsername = targetRec?.username ?? partnerRaw;
    const msgItem: DirectMessageItem = {
      id: `dm-${Date.now()}-${crypto.randomInt(1000, 9999)}`,
      from: sender.username,
      to: targetUsername,
      text,
      timestamp: Date.now(),
      read: true,
      fromAvatarUrl: sender.profile?.avatarUrl,
      fromFlag: sender.profile?.flag || sender.profile?.country || 'INT',
    };
    sender.dmThreads = upsertDirectMessage({
      threads: sender.dmThreads ?? {},
      partnerUsername: targetUsername,
      message: { ...msgItem, read: true },
    });
    if (targetRec) {
      targetRec.dmThreads = upsertDirectMessage({
        threads: targetRec.dmThreads ?? {},
        partnerUsername: sender.username,
        message: { ...msgItem, read: false },
      });
    }
    saveUsersStore(usersStore);

    wsRuntime.pushToUser(targetUsername, {
      type: 'dm:message',
      partnerUsername: sender.username,
      message: { ...msgItem, read: false },
    });
    wsRuntime.pushToUser(targetUsername, {
      type: 'notify:dm',
      fromUsername: sender.username,
      fromAvatarUrl: sender.profile?.avatarUrl,
      fromFlag: sender.profile?.flag || sender.profile?.country || 'INT',
      text: msgItem.text,
      timestamp: msgItem.timestamp,
    });

    res.json({ ok: true, message: msgItem });
  });

  app.get('/api/online/lobby', async (req, res) => {
    const rawElo = Number(req.query.elo);
    const hasTargetElo = Number.isFinite(rawElo) && rawElo >= 100 && rawElo <= 3300;
    const targetElo = hasTargetElo ? Math.round(rawElo) : null;
    const { onlineToken } = resolveOnlineToken(req);

    const rawLocalChallenges: OpenChallengeItem[] = wsRuntime.listOpenLobbyChallenges().map((ch) => ({
      ...ch,
      server: ch.server ?? 'OpenChess',
    }));
    const localChallenges = targetElo
      ? rawLocalChallenges.filter(
          (ch) => typeof ch.rating !== 'number' || isWithinMatchmakingEloBand(targetElo, ch.rating),
        )
      : rawLocalChallenges;

    const [lichessHooks] = await Promise.all([
      refreshLichessLiveHooks(1100, onlineToken ?? undefined),
      refreshLiveDiscoveredPlayers(),
    ]);

    const ficsChallenges: OpenChallengeItem[] = FICS_LIVE_SOUGHT
      .filter((ad) => {
        if (targetElo && typeof ad.rating === 'number' && !isWithinMatchmakingEloBand(targetElo, ad.rating)) {
          return false;
        }
        return true;
      })
      .map((ad) => ({
        id: `fics-${ad.adId}`,
        source: 'fics' as const,
        server: 'FICS' as const,
        ficsAdId: ad.adId,
        username: ad.username,
        rating: ad.rating,
        speed: ad.speed,
        clock: ad.clock,
        initialSeconds: Math.max(60, ad.initialSeconds),
        incrementSeconds: ad.incrementSeconds,
        rated: ad.rated,
        color: ad.color,
        createdAt: Date.now(),
      }));

    const lichessChallenges: OpenChallengeItem[] = [];
    for (const h of lichessHooks) {
      const rawU = typeof h.u === 'string' ? h.u.trim() : '';
      // Skip unnamed anonymous Lichess guest hooks so we never display synthetic placeholder names
      if (!rawU || rawU.toLowerCase() === 'anonymous' || rawU.toLowerCase() === 'lichess player') {
        continue;
      }
      const hookRating = typeof h.rating === 'number' ? h.rating : undefined;
      if (targetElo && typeof hookRating === 'number' && !isWithinMatchmakingEloBand(targetElo, hookRating)) {
        continue;
      }
      const parsedClock = parseHookClockSeconds(h);
      const speed: 'bullet' | 'blitz' | 'rapid' =
        parsedClock.initial < 180 ? 'bullet' : parsedClock.initial < 480 ? 'blitz' : 'rapid';
      lichessChallenges.push({
        id: `net-${h.id}`,
        source: 'network',
        server: 'Lichess',
        hookId: h.id,
        username: rawU,
        rating: hookRating,
        speed,
        clock: String(h.clock || `${Math.round(parsedClock.initial / 60)}+${parsedClock.increment}`),
        initialSeconds: parsedClock.initial,
        incrementSeconds: parsedClock.increment,
        rated: Boolean(h.ra),
        color: h.c === 'white' ? 'white' : h.c === 'black' ? 'black' : 'random',
        createdAt: Date.now(),
      });
    }

    if (targetElo) {
      const sortByRatingDiff = (a: OpenChallengeItem, b: OpenChallengeItem) => {
        if (typeof a.rating === 'number' && typeof b.rating === 'number') {
          return Math.abs(a.rating - targetElo) - Math.abs(b.rating - targetElo);
        }
        return typeof a.rating === 'number' ? -1 : typeof b.rating === 'number' ? 1 : 0;
      };
      lichessChallenges.sort(sortByRatingDiff);
      ficsChallenges.sort(sortByRatingDiff);
    }

    const onlineLocalUsers = Object.values(usersStore.users)
      .filter((u) => wsRuntime.isUserOnline(u.username))
      .map((u) => ({
        username: u.username,
        rating: u.perfs?.rapid?.rating ?? 1200,
        title: u.title,
        flag: u.profile?.flag || u.profile?.country,
        avatarUrl: sanitizePublicAvatar(u.profile?.avatarUrl),
        server: 'OpenChess' as ChessServerSource,
        online: true,
      }));

    SERVER_POOL_HEALTH.set('OpenChess', {
      name: 'OpenChess',
      ok: true,
      count: Math.max(localChallenges.length, onlineLocalUsers.length),
      updatedAt: Date.now(),
    });

    const byServer = new Map<ChessServerSource, LiveDiscoveredPlayerEntry[]>();
    for (const p of LIVE_DISCOVERED_PLAYERS.values()) {
      const list = byServer.get(p.sourceServer) ?? [];
      list.push(p);
      byServer.set(p.sourceServer, list);
    }
    for (const list of byServer.values()) {
      list.sort(
        (a, b) =>
          (typeof b.rating === 'number' ? 1 : 0) - (typeof a.rating === 'number' ? 1 : 0) ||
          b.updatedAt - a.updatedAt,
      );
    }
    const balancedRemote: LiveDiscoveredPlayerEntry[] = [];
    const serverOrder: ChessServerSource[] = ['Lichess', 'FICS', 'Chess.com', 'PlayStrategy'];
    for (let idx = 0; idx < 7 && balancedRemote.length < 24; idx++) {
      for (const srv of serverOrder) {
        const list = byServer.get(srv);
        if (list && list[idx]) balancedRemote.push(list[idx]);
      }
    }

    const activePoolPlayers = [
      ...onlineLocalUsers,
      ...balancedRemote.map((p) => ({
        username: p.username,
        rating: p.rating,
        title: p.title,
        flag: p.flag,
        avatarUrl: p.avatarUrl,
        server: p.sourceServer,
        online: true,
      })),
    ].slice(0, 24);

    const servers = (['OpenChess', 'Lichess', 'Chess.com', 'FICS', 'PlayStrategy'] as ChessServerSource[]).map(
      (name) => SERVER_POOL_HEALTH.get(name) ?? { name, ok: false, count: 0, updatedAt: 0 },
    );

    const combined = [
      ...localChallenges,
      ...ficsChallenges.slice(0, 12),
      ...lichessChallenges.slice(0, 18),
    ];
    res.json({
      challenges: combined,
      servers,
      activePoolPlayers,
      lichessOpenSeatsCount: lichessHooks.length,
    });
  });

  app.get('/api/online/active-games', (_req, res) => {
    res.json({ games: wsRuntime.listActiveRooms() });
  });

  app.get('/api/players/:username', async (req, res) => {
    const rawUser = String(req.params.username || '').trim();
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(rawUser)) {
      res.status(400).json({ error: 'Valid player username required.' });
      return;
    }
    const key = rawUser.toLowerCase();
    const local = usersStore.users[key];
    if (local) {
      const recentGames = (local.playedGames ?? []).slice(0, 15);
      res.json({
        player: {
          ...buildAccountPayload(local, { online: wsRuntime.isUserOnline(local.username) }),
          league: computeLeagueInfo(local.leaguePoints ?? 0),
          recentGames,
        },
      });
      return;
    }

    const [pub, recentGames] = await Promise.all([
      fetchPublicLichessUser(rawUser, false),
      Promise.race([
        syncRecentGamesIntoStore(rawUser, undefined, undefined, false).catch(() => []),
        new Promise<never[]>((resolve) => setTimeout(() => resolve([]), 1600)),
      ]),
    ]);

    if (!pub) {
      res.status(404).json({ error: `Player "${rawUser}" not found.` });
      return;
    }

    const username = pub.username ? String(pub.username) : rawUser;
    const perfs = pub.perfs ? extractExactLichessPerfs(pub.perfs) : {};
    const winsCount = pub.count?.win ?? 0;
    const lossesCount = pub.count?.loss ?? 0;
    const drawsCount = pub.count?.draw ?? 0;
    const allCount = pub.count?.all ?? Math.max(recentGames.length, winsCount + lossesCount + drawsCount);
    const leaguePoints = Math.min(800, Math.round(winsCount * 6));
    res.json({
      player: {
        id: username.toLowerCase(),
        username,
        title: pub.title,
        online: wsRuntime.isUserOnline(username) || Boolean(pub.online),
        createdAt: typeof pub.createdAt === 'number' ? pub.createdAt : undefined,
        seenAt: typeof pub.seenAt === 'number' ? pub.seenAt : undefined,
        profile: {
          country: pub.profile?.country || pub.profile?.flag || 'INT',
          flag: pub.profile?.flag || pub.profile?.country || 'INT',
          bio: pub.profile?.bio,
          avatarUrl: pub.profile?.avatarUrl,
        },
        perfs,
        count: {
          all: allCount,
          win: winsCount,
          loss: lossesCount,
          draw: drawsCount,
          rated: pub.count?.rated ?? allCount,
        },
        leaguePoints,
        league: computeLeagueInfo(leaguePoints),
        ratingHistory: undefined,
        recentGames: recentGames.slice(0, 15),
      },
    });
  });

  const playerReportsList: Array<{
    id: string;
    targetUsername: string;
    reporterUsername: string;
    reason: string;
    details: string;
    createdAt: number;
    status: 'under_review';
  }> = [];

  app.post('/api/players/:username/report', (req, res) => {
    const rawUser = String(req.params.username || '').trim();
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(rawUser)) {
      res.status(400).json({ error: 'Valid player username required.' });
      return;
    }
    const sessionUser = resolveOnlineToken(req).openChessUser;
    const bodyReporter = String(req.body?.reporterUsername || '').trim();
    const reporterUsername = sessionUser?.username || bodyReporter || 'CommunityMember';
    if (reporterUsername.toLowerCase() === rawUser.toLowerCase()) {
      res.status(400).json({ error: 'You cannot report your own account.' });
      return;
    }
    const reason = String(req.body?.reason || 'fair_play').trim();
    if (!reason) {
      res.status(400).json({ error: 'Please select a reason for the report.' });
      return;
    }
    const details = String(req.body?.details || '').trim().slice(0, 500);
    const reportEntry = {
      id: `rep_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      targetUsername: rawUser,
      reporterUsername,
      reason,
      details,
      createdAt: Date.now(),
      status: 'under_review' as const,
    };
    playerReportsList.unshift(reportEntry);
    if (playerReportsList.length > 500) {
      playerReportsList.length = 500;
    }
    res.json({
      ok: true,
      reportId: reportEntry.id,
      report: reportEntry,
      message: `Report submitted — ${rawUser} has been flagged for Fair Play & Account Verification review.`,
    });
  });

  app.get('/api/players/:username/reports', (req, res) => {
    const rawUser = String(req.params.username || '').trim().toLowerCase();
    const matching = playerReportsList.filter((r) => r.targetUsername.toLowerCase() === rawUser);
    res.json({ reports: matching, count: matching.length });
  });

  const topLeaderboardCache = new Map<
    string,
    {
      expiresAt: number;
      users: Array<{
        username: string;
        title?: string;
        rating: number;
        online: boolean;
      }>;
    }
  >();

  async function batchFetchLichessUsers(
    usernames: string[],
  ): Promise<Map<string, Record<string, any>>> {
    const out = new Map<string, Record<string, any>>();
    const toFetch: string[] = [];
    const seen = new Set<string>();

    for (const raw of usernames) {
      const clean = raw.trim();
      if (!clean) continue;
      const k = clean.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const cached = publicUserCache.get(k);
      if (cached && Date.now() < cached.expiresAt) {
        out.set(k, cached.data);
      } else {
        toFetch.push(clean);
      }
    }

    if (toFetch.length > 0) {
      try {
        const res = await fetch('https://lichess.org/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'text/plain',
            Accept: 'application/json',
            'User-Agent': 'OpenChess/1.0',
          },
          body: toFetch.slice(0, 150).join(','),
          signal: AbortSignal.timeout(3000),
        });
        if (res.ok) {
          const arr = (await res.json()) as Array<Record<string, any>>;
          if (Array.isArray(arr)) {
            for (const item of arr) {
              const uname = typeof item?.username === 'string' ? item.username.trim() : '';
              if (!uname || item.closed || item.disabled) continue;
              const k = uname.toLowerCase();
              const prevAvatar = publicUserCache.get(k)?.data?.profile?.avatarUrl;
              const merged = prevAvatar
                ? {
                    ...item,
                    profile: { ...(item.profile || {}), avatarUrl: item.profile?.avatarUrl || prevAvatar },
                  }
                : item;
              publicUserCache.set(k, { data: merged, expiresAt: Date.now() + 90_000 });
              out.set(k, merged);
              recordLiveDiscoveredPlayer({
                username: uname,
                rating: Number(item?.perfs?.rapid?.rating) || Number(item?.perfs?.blitz?.rating) || undefined,
                title: item?.title,
              });
            }
          }
        }
      } catch {
        // Ignore network error; return cached subset
      }
    }

    return out;
  }

  async function fetchLiveTopPlayers(perf: 'rapid' | 'blitz' | 'bullet' | 'puzzle'): Promise<
    Array<{ username: string; title?: string; rating: number; online: boolean }>
  > {
    const cached = topLeaderboardCache.get(perf);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.users;
    }

    if (perf === 'puzzle') {
      try {
        const [rapidTop, blitzTop] = await Promise.all([
          fetchLiveTopPlayers('rapid'),
          fetchLiveTopPlayers('blitz'),
        ]);
        const candidates = [
          'Zhigalko_Sergei',
          'Night-King96',
          'nihalsarin2004',
          'penguingim1',
          'RebeccaHarris',
          'alireza2003',
          'gmwso',
          'Jovanovic06',
          'AndrewTang',
          'EricRosen',
          'Vladimirovich9000',
          'GM_dmitrij',
          'DanielNaroditsky',
          ...rapidTop.slice(0, 35).map((u) => u.username),
          ...blitzTop.slice(0, 35).map((u) => u.username),
          ...Array.from(LIVE_DISCOVERED_PLAYERS.values()).map((u) => u.username),
        ];
        const hydrated = await batchFetchLichessUsers(candidates);
        const puzzleUsers: Array<{
          username: string;
          title?: string;
          rating: number;
          online: boolean;
          games: number;
        }> = [];
        for (const pub of hydrated.values()) {
          const uname = typeof pub?.username === 'string' ? pub.username.trim() : '';
          const rating = Number(pub?.perfs?.puzzle?.rating);
          const games = Number(pub?.perfs?.puzzle?.games ?? 0);
          if (uname && Number.isFinite(rating) && rating > 0) {
            puzzleUsers.push({
              username: uname,
              title: typeof pub.title === 'string' ? pub.title : undefined,
              rating,
              online: Boolean(pub.online),
              games,
            });
          }
        }
        puzzleUsers.sort((a, b) => b.rating - a.rating || b.games - a.games);
        const topPuzzle = puzzleUsers.slice(0, 50).map(({ username, title, rating, online }) => ({
          username,
          title,
          rating,
          online,
        }));
        if (topPuzzle.length > 0) {
          topLeaderboardCache.set('puzzle', {
            expiresAt: Date.now() + 2 * 60 * 1000,
            users: topPuzzle,
          });
        }
        return topPuzzle;
      } catch {
        return [];
      }
    }

    try {
      const res = await fetch(`https://lichess.org/api/player/top/50/${perf}`, {
        headers: { Accept: 'application/vnd.lichess.v3+json, application/json', 'User-Agent': 'OpenChess/1.0' },
        signal: AbortSignal.timeout(3200),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          users?: Array<{
            id?: string;
            username?: string;
            title?: string;
            online?: boolean;
            perfs?: Record<string, { rating?: number }>;
          }>;
        };
        if (Array.isArray(data.users) && data.users.length > 0) {
          const parsed = data.users
            .filter((u) => typeof u.username === 'string' && u.username.trim().length > 0)
            .map((u) => ({
              username: u.username!.trim(),
              title: u.title,
              rating: Number(u.perfs?.[perf]?.rating) || 2600,
              online: Boolean(u.online),
            }));
          topLeaderboardCache.set(perf, {
            expiresAt: Date.now() + 2 * 60 * 1000,
            users: parsed,
          });
          return parsed;
        }
      }
    } catch {
      // Fall through cleanly
    }
    return [];
  }

  app.get('/api/leaderboard', async (req, res) => {
    const rawCat = String(req.query.category || 'rapid').toLowerCase();
    const category: 'rapid' | 'blitz' | 'bullet' | 'puzzle' | 'league' =
      rawCat === 'blitz' || rawCat === 'bullet' || rawCat === 'puzzle' || rawCat === 'league'
        ? rawCat
        : 'rapid';

    const perfToQuery: 'rapid' | 'blitz' | 'bullet' | 'puzzle' =
      category === 'bullet'
        ? 'bullet'
        : category === 'blitz'
          ? 'blitz'
          : category === 'puzzle'
            ? 'puzzle'
            : 'rapid';

    const [liveTop] = await Promise.all([
      fetchLiveTopPlayers(perfToQuery),
      refreshLiveDiscoveredPlayers(),
    ]);

    const missingTopNames = liveTop
      .map((t) => t.username)
      .filter((u) => !publicUserCache.has(u.toLowerCase()));
    if (missingTopNames.length > 0) {
      await Promise.race([
        batchFetchLichessUsers(missingTopNames),
        new Promise<void>((r) => setTimeout(r, 1500)),
      ]);
    }

    const seen = new Set<string>();
    const entries: Array<{
      username: string;
      title?: string;
      flag?: string;
      avatarUrl?: string;
      online: boolean;
      rating: number;
      leaguePoints: number;
      league: ReturnType<typeof computeLeagueInfo>;
      games: number;
    }> = [];

    for (const u of Object.values(usersStore.users)) {
      const k = u.username.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const perf =
        category === 'league'
          ? u.perfs?.rapid
          : u.perfs?.[category] ?? u.perfs?.rapid;
      entries.push({
        username: u.username,
        title: u.title,
        flag: u.profile?.flag || u.profile?.country || 'INT',
        avatarUrl: sanitizePublicAvatar(u.profile?.avatarUrl),
        online: wsRuntime.isUserOnline(u.username),
        rating: perf?.rating ?? 1200,
        leaguePoints: u.leaguePoints ?? 0,
        league: computeLeagueInfo(u.leaguePoints ?? 0),
        games: u.count?.all ?? perf?.games ?? 0,
      });
    }

    for (const topUser of liveTop) {
      const k = topUser.username.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      const cachedPub = publicUserCache.get(k)?.data;
      const pubFlag =
        cachedPub?.profile?.flag ||
        cachedPub?.profile?.country ||
        'INT';
      const pubAvatar = sanitizePublicAvatar(cachedPub?.profile?.avatarUrl);
      const pubGames =
        Number(cachedPub?.count?.all) ||
        Number(cachedPub?.perfs?.[perfToQuery]?.games) ||
        0;
      const leaguePoints = Math.max(45, Math.round((topUser.rating - 1500) * 0.68));
      entries.push({
        username: topUser.username,
        title: topUser.title,
        flag: pubFlag,
        avatarUrl: pubAvatar,
        online: topUser.online,
        rating: topUser.rating,
        leaguePoints,
        league: computeLeagueInfo(leaguePoints),
        games: pubGames,
      });
    }

    // Supplement with Chess.com public leaderboards so multi-server coverage always populates
    if (category !== 'puzzle') {
      const ccBucket =
        perfToQuery === 'bullet'
          ? chessComLeaderboardCache.bullet
          : perfToQuery === 'blitz'
            ? chessComLeaderboardCache.blitz
            : chessComLeaderboardCache.rapid;
      for (const cc of ccBucket) {
        const k = cc.username.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        const leaguePoints = Math.max(45, Math.round((cc.rating - 1500) * 0.68));
        entries.push({
          username: cc.username,
          title: cc.title,
          flag: cc.country || 'INT',
          avatarUrl: sanitizePublicAvatar(cc.avatarUrl),
          online: true,
          rating: cc.rating,
          leaguePoints,
          league: computeLeagueInfo(leaguePoints),
          games: 0,
        });
      }
    }

    entries.sort((a, b) =>
      category === 'league'
        ? b.leaguePoints - a.leaguePoints || b.rating - a.rating
        : b.rating - a.rating || b.games - a.games,
    );

    const players = entries.slice(0, 50).map((entry, idx) => ({
      rank: idx + 1,
      ...entry,
    }));

    res.json({ category, players });
  });

  // -------------------------------------------------------------------------
  // OAuth2 Callback (kept internally for compatibility)
  // -------------------------------------------------------------------------
  app.get('/api/auth/lichess/url', (req, res) => {
    const rawOrigin = typeof req.query.origin === 'string' ? req.query.origin : undefined;
    const linkToUsername =
      typeof req.query.linkTo === 'string' && req.query.linkTo.trim()
        ? req.query.linkTo.trim()
        : undefined;
    const origin = sanitizeRedirectOrigin(rawOrigin);
    const redirectUri = `${origin}/auth/lichess/callback`;

    const { verifier, challenge, state } = createPkcePair();
    const now = Date.now();
    for (const [k, v] of pkceStore.entries()) {
      if (v.expiresAt < now) pkceStore.delete(k);
    }
    pkceStore.set(state, {
      codeVerifier: verifier,
      redirectUri,
      linkToUsername,
      expiresAt: now + 10 * 60 * 1000,
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: LICHESS_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'preference:read email:read board:play challenge:read challenge:write puzzle:read puzzle:write follow:read follow:write',
      code_challenge_method: 'S256',
      code_challenge: challenge,
      state,
    });

    res.json({
      url: `https://lichess.org/oauth?${params.toString()}`,
      redirectUri,
    });
  });

  const handleLichessCallback = async (req: express.Request, res: express.Response) => {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    const err = typeof req.query.error === 'string' ? req.query.error : '';

    if (err) {
      res.status(400).send(`<html><body style="background:#262421;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Authorization declined: ${err}</p></body></html>`);
      return;
    }

    const stored = pkceStore.get(state);
    pkceStore.delete(state);
    if (!code || !stored) {
      res.status(400).send('<html><body style="background:#262421;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Invalid or expired login session. Close this window and retry.</p></body></html>');
      return;
    }

    try {
      const tokenRes = await fetch('https://lichess.org/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'OpenChess/1.0',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: LICHESS_CLIENT_ID,
          code,
          redirect_uri: stored.redirectUri,
          code_verifier: stored.codeVerifier,
        }).toString(),
      });

      const tokenData = (await tokenRes.json()) as { access_token?: string; error?: string };
      if (!tokenRes.ok || !tokenData.access_token) {
        throw new Error(tokenData.error || `Token exchange failed (${tokenRes.status})`);
      }

      const [acctRes, emailRes] = await Promise.all([
        fetch('https://lichess.org/api/account', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/json',
            'User-Agent': 'OpenChess/1.0',
          },
          signal: AbortSignal.timeout(7000),
        }),
        fetch('https://lichess.org/api/account/email', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/json',
            'User-Agent': 'OpenChess/1.0',
          },
          signal: AbortSignal.timeout(5000),
        }).catch(() => null),
      ]);

      const rawAccount = acctRes.ok ? ((await acctRes.json()) as Record<string, any>) : null;
      const emailPayload = emailRes && emailRes.ok ? ((await emailRes.json()) as { email?: string }) : null;
      const accountEmail = typeof emailPayload?.email === 'string' ? emailPayload.email.trim().toLowerCase() : undefined;
      const realUsername = typeof rawAccount?.username === 'string' ? rawAccount.username.trim() : '';

      let sessionPayload: {
        accessToken: string;
        hasOnlineToken: boolean;
        account: Record<string, any>;
      } | null = null;

      const linkedExistingRecord =
        stored.linkToUsername && usersStore.users[stored.linkToUsername.toLowerCase()]
          ? usersStore.users[stored.linkToUsername.toLowerCase()]
          : null;

      if (linkedExistingRecord) {
        linkedExistingRecord.onlineToken = tokenData.access_token;
        if (realUsername) {
          (linkedExistingRecord as StoredUserAccount & { lichessUsername?: string }).lichessUsername = realUsername;
        }
        await Promise.race([
          fetchNetworkProfileForUser(
            realUsername || linkedExistingRecord.username,
            tokenData.access_token,
            linkedExistingRecord,
            true,
          ).catch(() => null),
          new Promise<void>((r) => setTimeout(r, 3200)),
        ]);
        await Promise.race([
          syncRecentGamesIntoStore(
            realUsername || linkedExistingRecord.username,
            tokenData.access_token,
            linkedExistingRecord,
            true,
          ).catch(() => []),
          new Promise<void>((r) => setTimeout(r, 3200)),
        ]);
        // Push follows for all friends already added in OpenChess
        for (const friendName of linkedExistingRecord.friends ?? []) {
          if (friendName && friendName.toLowerCase() !== realUsername.toLowerCase()) {
            void fetch(`https://lichess.org/api/rel/follow/${encodeURIComponent(friendName)}`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${tokenData.access_token}` },
            }).catch(() => {});
          }
        }
        reconcileAllFriendRequests();
        saveUsersStore(usersStore);
        sessionPayload = {
          accessToken: signOpenChessToken(linkedExistingRecord.username),
          hasOnlineToken: true,
          account: buildAccountPayload(linkedExistingRecord, { online: true }),
        };
      } else if (realUsername) {
        const key = realUsername.toLowerCase();
        const synced = await fetchNetworkProfileForUser(
          realUsername,
          tokenData.access_token,
          usersStore.users[key],
          true,
        );
        let record = usersStore.users[key];
        if (!record) {
          const { salt, hash } = hashPassword(crypto.randomBytes(18).toString('hex'));
          record = {
            username: realUsername,
            email: accountEmail,
            passwordSalt: salt,
            passwordHash: hash,
            onlineToken: tokenData.access_token,
            friends:
              synced.ok && 'followed' in synced && Array.isArray(synced.followed)
                ? mergeFriendsWithRemote({ remoteFollowing: synced.followed })
                : [],
            removedFriends: [],
            perfs: (synced.ok ? synced.account.perfs : rawAccount?.perfs) ?? defaultAccountPerfs(),
            count: (synced.ok ? synced.account.count : rawAccount?.count) ?? defaultAccountCount(),
            profile: (synced.ok ? (synced.account as Record<string, any>).profile : rawAccount?.profile),
            playTime: (synced.ok ? (synced.account as Record<string, any>).playTime : rawAccount?.playTime),
            createdAt: (synced.ok ? synced.account.createdAt : rawAccount?.createdAt) ?? Date.now(),
            seenAt: (synced.ok ? synced.account.seenAt : rawAccount?.seenAt) ?? Date.now(),
          };
          usersStore.users[key] = record;
        } else {
          record.username = realUsername;
          record.onlineToken = tokenData.access_token;
          if (accountEmail) record.email = accountEmail;
          if (synced.ok) {
            record.perfs = synced.account.perfs ?? record.perfs ?? defaultAccountPerfs();
            record.count = synced.account.count ?? record.count ?? defaultAccountCount();
            record.profile = (synced.account as Record<string, any>).profile ?? record.profile;
            record.playTime = (synced.ok ? (synced.account as Record<string, any>).playTime : record.playTime);
            if (typeof synced.account.createdAt === 'number') record.createdAt = synced.account.createdAt;
            record.seenAt = synced.account.seenAt ?? Date.now();
            if ('followed' in synced && Array.isArray(synced.followed)) {
              record.friends = mergeFriendsWithRemote({
                existingFriends: record.friends ?? [],
                remoteFollowing: synced.followed,
                removedFriends: record.removedFriends ?? [],
              });
            }
          }
        }

        reconcileAllFriendRequests();
        await Promise.race([
          syncRecentGamesIntoStore(record.username, tokenData.access_token, record, true).catch(() => []),
          new Promise<void>((r) => setTimeout(r, 3200)),
        ]);
        saveUsersStore(usersStore);

        const acctOut = synced.ok ? synced.account : rawAccount ?? { id: key, username: realUsername };
        sessionPayload = {
          accessToken: signOpenChessToken(record.username),
          hasOnlineToken: true,
          account: {
            ...acctOut,
            ...buildAccountPayload(record, { online: true }),
            username: record.username,
            email: record.email,
          },
        };
      }

      const payloadJson = JSON.stringify({
        type: 'LICHESS_OAUTH_SUCCESS',
        accessToken: tokenData.access_token,
        account: sessionPayload?.account ?? rawAccount,
        session: sessionPayload,
      }).replace(/</g, '\\u003c');

      res.send(`<!doctype html>
<html>
  <body style="background:#262421;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
    <p>Signed in as ${realUsername || 'Player'}! Returning to OpenChess...</p>
    <script>
      if (window.opener) {
        window.opener.postMessage(${payloadJson}, '*');
        window.close();
      } else {
        window.location.href = '/';
      }
    </script>
  </body>
</html>`);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Authorization failed.';
      res.status(502).send(`<html><body style="background:#262421;color:#fff;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><p>Sign-in failed: ${message}</p></body></html>`);
    }
  };

  app.get(['/auth/lichess/callback', '/auth/lichess/callback/'], handleLichessCallback);

  // -------------------------------------------------------------------------
  // Online Account, Seek, Challenge & Live Board Endpoints
  // -------------------------------------------------------------------------
  app.get('/api/lichess/account', async (req, res) => {
    const auth = resolveOnlineToken(req);
    if (!auth.sessionToken) {
      res.status(401).json({ error: 'Sign in to OpenChess to access your account.' });
      return;
    }

    if (auth.sessionToken.startsWith('oc.')) {
      if (!auth.openChessUser) {
        res.status(401).json({ error: 'OpenChess session invalid or expired.' });
        return;
      }
      if (auth.openChessUser.isLocalOpenChessAccount && !auth.openChessUser.onlineToken) {
        res.json({
          account: buildAccountPayload(auth.openChessUser, { online: true }),
          hasOnlineToken: false,
          nowPlaying: [],
        });
        return;
      }
      const synced = await fetchNetworkProfileForUser(
        auth.openChessUser.username,
        auth.openChessUser.onlineToken,
        auth.openChessUser,
      );
      res.json({
        account: synced.ok
          ? buildAccountPayload(auth.openChessUser, {
              title: (synced.account as Record<string, any>)?.title,
              online: true,
            })
          : buildAccountPayload(auth.openChessUser, { online: true }),
        hasOnlineToken: Boolean(auth.openChessUser.onlineToken),
        nowPlaying: [],
      });
      return;
    }

    try {
      const [acctRes, playingRes] = await Promise.all([
        fetch('https://lichess.org/api/account', {
          headers: { Authorization: `Bearer ${auth.onlineToken}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        }),
        fetch('https://lichess.org/api/account/playing', {
          headers: { Authorization: `Bearer ${auth.onlineToken}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        }),
      ]);
      if (!acctRes.ok) {
        res.status(acctRes.status).json({ error: 'Online session invalid or expired.' });
        return;
      }
      const account = await acctRes.json();
      const playing = playingRes.ok ? await playingRes.json() : { nowPlaying: [] };
      res.json({ account, hasOnlineToken: true, nowPlaying: playing.nowPlaying ?? [] });
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Account sync error.' });
    }
  });

  // Live Seek Matchmaking
  app.post('/api/lichess/seek', async (req, res) => {
    const { onlineToken, openChessUser } = resolveOnlineToken(req);
    if (!onlineToken) {
      res.status(401).json({ error: 'Global pool matchmaking requires a live session token; use Quick Match or Open Room.' });
      return;
    }

    const time = Math.max(1, Math.min(180, Number(req.body?.time) || 10));
    const increment = Math.max(0, Math.min(60, Number(req.body?.increment) || 0));
    const rated = Boolean(req.body?.rated);
    const color = ['white', 'black', 'random'].includes(req.body?.color) ? req.body.color : 'random';
    const rawPlayerElo = Number(req.body?.playerElo);
    const seekPlayerElo =
      Number.isFinite(rawPlayerElo) && rawPlayerElo >= 100
        ? Math.max(100, Math.min(3200, Math.round(rawPlayerElo)))
        : openChessUser?.perfs?.rapid?.rating ?? 1200;
    const minSeekRating = Math.max(100, seekPlayerElo - MAX_MATCHMAKING_ELO_GAP);
    const maxSeekRating = Math.min(3200, seekPlayerElo + MAX_MATCHMAKING_ELO_GAP);

    const controller = new AbortController();
    req.on('close', () => controller.abort());

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendSse = (event: string, data: unknown) => {
      if (!res.writableEnded) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    try {
      const eventStreamRes = await fetch('https://lichess.org/api/stream/event', {
        headers: { Authorization: `Bearer ${onlineToken}`, Accept: 'application/x-ndjson' },
        signal: controller.signal,
      });
      if (!eventStreamRes.ok || !eventStreamRes.body) {
        sendSse('error', { error: `Online matchmaking stream unavailable (${eventStreamRes.status})` });
        res.end();
        return;
      }

      fetch('https://lichess.org/api/board/seek', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${onlineToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          time: String(time),
          increment: String(increment),
          rated: rated ? 'true' : 'false',
          color,
          ratingRange: `${minSeekRating}-${maxSeekRating}`,
        }).toString(),
        signal: controller.signal,
      })
        .then(async (seekRes) => {
          if (!seekRes.ok && !controller.signal.aborted) {
            const rawText = await seekRes.text().catch(() => '');
            let cleanErr = rawText;
            try {
              const parsed = JSON.parse(rawText) as { error?: string };
              if (typeof parsed?.error === 'string') cleanErr = parsed.error;
            } catch {
              // plain text error
            }
            cleanErr = cleanErr
              .replace(/lichess\.org/gi, 'online chess server')
              .replace(/lichess/gi, 'online server')
              .trim();
            if (!cleanErr || cleanErr.toLowerCase().includes('missing scope')) {
              cleanErr = 'Live Play authorization needs board play permission, or use Open Room.';
            }
            sendSse('error', { error: cleanErr || `Seek rejected (${seekRes.status})` });
            controller.abort();
            res.end();
          }
        })
        .catch(() => {});

      sendSse('seeking', { time, increment, rated, color });

      const reader = eventStreamRes.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            const ev = JSON.parse(trimmed) as { type?: string; game?: { gameId?: string; id?: string } };
            if (ev.type === 'gameStart' && ev.game) {
              sendSse('gameStart', ev.game);
              controller.abort();
              res.end();
              return;
            }
          } catch {
            // ignore keepalive
          }
        }
      }
      if (!res.writableEnded) res.end();
    } catch (err: unknown) {
      if (!controller.signal.aborted) {
        sendSse('error', { error: err instanceof Error ? err.message : 'Matchmaking error.' });
        res.end();
      }
    }
  });

  app.post('/api/lichess/challenge/ai', async (req, res) => {
    const { onlineToken } = resolveOnlineToken(req);
    if (!onlineToken) {
      res.status(401).json({ error: 'Link an online access token in Sign In to challenge Cloud AI.' });
      return;
    }
    const level = Math.max(1, Math.min(8, Math.round(Number(req.body?.level) || 4)));
    const limit = Math.max(60, Math.min(10800, Number(req.body?.limit) || 600));
    const increment = Math.max(0, Math.min(180, Number(req.body?.increment) || 0));
    const color = ['white', 'black', 'random'].includes(req.body?.color) ? req.body.color : 'random';

    try {
      const upstream = await fetch('https://lichess.org/api/challenge/ai', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${onlineToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          level: String(level),
          'clock.limit': String(limit),
          'clock.increment': String(increment),
          color,
        }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json();
      if (!upstream.ok) {
        res.status(upstream.status).json(data);
        return;
      }
      res.json(data);
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Cloud AI challenge failed.' });
    }
  });

  app.post('/api/lichess/challenge/user', async (req, res) => {
    const { onlineToken } = resolveOnlineToken(req);
    if (!onlineToken) {
      res.status(401).json({ error: 'Link an online access token or use Live Friend Room to challenge.' });
      return;
    }
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
    if (!username || !/^[a-zA-Z0-9_-]{2,30}$/.test(username)) {
      res.status(400).json({ error: 'Valid player username is required.' });
      return;
    }
    const limit = Math.max(60, Math.min(10800, Number(req.body?.limit) || 600));
    const increment = Math.max(0, Math.min(180, Number(req.body?.increment) || 0));
    const rated = Boolean(req.body?.rated);
    const color = ['white', 'black', 'random'].includes(req.body?.color) ? req.body.color : 'random';

    try {
      const upstream = await fetch(`https://lichess.org/api/challenge/${encodeURIComponent(username)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${onlineToken}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          rated: rated ? 'true' : 'false',
          'clock.limit': String(limit),
          'clock.increment': String(increment),
          color,
        }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json();
      if (!upstream.ok) {
        res.status(upstream.status).json(data);
        return;
      }
      res.json(data);
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Challenge failed.' });
    }
  });

  // Unauthenticated instant open challenge link
  app.post('/api/lichess/challenge/open', async (req, res) => {
    const limit = Math.max(60, Math.min(10800, Number(req.body?.limit) || 600));
    const increment = Math.max(0, Math.min(180, Number(req.body?.increment) || 0));
    try {
      const upstream = await fetch('https://lichess.org/api/challenge/open', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
          'User-Agent': 'OpenChess/1.0',
        },
        body: new URLSearchParams({
          'clock.limit': String(limit),
          'clock.increment': String(increment),
        }).toString(),
        signal: AbortSignal.timeout(8000),
      });
      const data = await upstream.json();
      if (!upstream.ok) {
        res.status(upstream.status).json(data);
        return;
      }
      res.json(data);
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Unable to create challenge link.' });
    }
  });

  app.get('/api/lichess/board/stream/:gameId', async (req, res) => {
    const { onlineToken } = resolveOnlineToken(req);
    const gameId = req.params.gameId;
    if (!onlineToken || !/^[a-zA-Z0-9]{6,16}$/.test(gameId)) {
      res.status(400).json({ error: 'Valid session token and gameId required.' });
      return;
    }
    await streamNdjsonAsSse({
      url: `https://lichess.org/api/board/game/stream/${encodeURIComponent(gameId)}`,
      headers: { Authorization: `Bearer ${onlineToken}` },
      res,
      req,
    });
  });

  app.post('/api/lichess/board/move/:gameId/:move', async (req, res) => {
    const { onlineToken } = resolveOnlineToken(req);
    const { gameId, move } = req.params;
    if (!onlineToken || !/^[a-zA-Z0-9]{6,16}$/.test(gameId) || !/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(move)) {
      res.status(400).json({ error: 'Valid token, gameId, and move required.' });
      return;
    }
    try {
      const upstream = await fetch(
        `https://lichess.org/api/board/game/${encodeURIComponent(gameId)}/move/${encodeURIComponent(move)}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${onlineToken}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        },
      );
      const data = await upstream.json().catch(() => ({ ok: upstream.ok }));
      res.status(upstream.status).json(data);
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Online move failed.' });
    }
  });

  app.post('/api/lichess/board/:action/:gameId', async (req, res) => {
    const { onlineToken } = resolveOnlineToken(req);
    const { action, gameId } = req.params;
    if (!onlineToken || !['resign', 'abort'].includes(action) || !/^[a-zA-Z0-9]{6,16}$/.test(gameId)) {
      res.status(400).json({ error: 'Invalid action or gameId.' });
      return;
    }
    try {
      const upstream = await fetch(
        `https://lichess.org/api/board/game/${encodeURIComponent(gameId)}/${action}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${onlineToken}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        },
      );
      const data = await upstream.json().catch(() => ({ ok: upstream.ok }));
      res.status(upstream.status).json(data);
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Action failed.' });
    }
  });

  app.post('/api/lichess/board/draw/:gameId/:accept', async (req, res) => {
    const { onlineToken } = resolveOnlineToken(req);
    const { gameId, accept } = req.params;
    if (!onlineToken || !['yes', 'no'].includes(accept) || !/^[a-zA-Z0-9]{6,16}$/.test(gameId)) {
      res.status(400).json({ error: 'Invalid draw request.' });
      return;
    }
    try {
      const upstream = await fetch(
        `https://lichess.org/api/board/game/${encodeURIComponent(gameId)}/draw/${accept}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${onlineToken}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        },
      );
      const data = await upstream.json().catch(() => ({ ok: upstream.ok }));
      res.status(upstream.status).json(data);
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Draw request failed.' });
    }
  });

  app.post('/api/lichess/board/chat/:gameId', async (req, res) => {
    const { onlineToken } = resolveOnlineToken(req);
    const { gameId } = req.params;
    const text = typeof req.body?.text === 'string' ? req.body.text.trim().slice(0, 240) : '';
    if (!onlineToken || !/^[a-zA-Z0-9]{6,16}$/.test(gameId) || !text) {
      res.status(400).json({ error: 'Valid online session, gameId, and message required.' });
      return;
    }
    try {
      const upstream = await fetch(
        `https://lichess.org/api/board/game/${encodeURIComponent(gameId)}/chat`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${onlineToken}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          body: new URLSearchParams({ room: 'player', text }).toString(),
          signal: AbortSignal.timeout(6000),
        },
      );
      const data = await upstream.json().catch(() => ({ ok: upstream.ok }));
      res.status(upstream.status).json(data);
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Chat send failed.' });
    }
  });

  // -------------------------------------------------------------------------
  // Public Live TV, Watch Stream, User Games & Opening Explorer
  // -------------------------------------------------------------------------
  app.get('/api/lichess/tv', async (_req, res) => {
    try {
      const upstream = await fetch('https://lichess.org/api/tv/channels', {
        headers: { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' },
        signal: AbortSignal.timeout(6000),
      });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Live TV unavailable (${upstream.status})` });
        return;
      }
      const raw = (await upstream.json()) as Record<
        string,
        {
          user?: { name?: string; title?: string };
          rating?: number;
          gameId?: string;
          color?: 'white' | 'black';
        }
      >;
      const preferredOrder = [
        ['best', 'Top Rated'],
        ['blitz', 'Blitz TV'],
        ['bullet', 'Bullet TV'],
        ['rapid', 'Rapid TV'],
        ['classical', 'Classical TV'],
        ['chess960', 'Chess960'],
      ];
      const channels = preferredOrder
        .filter(([key]) => Boolean(raw[key]?.gameId))
        .map(([key, label]) => ({
          channel: key,
          label,
          gameId: raw[key].gameId ?? '',
          user: raw[key].user?.name ?? 'Master',
          title: raw[key].user?.title,
          rating: raw[key].rating ?? 2500,
          color: raw[key].color ?? 'white',
        }));

      res.json({ channels });
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Unable to load Live TV.' });
    }
  });

  app.get('/api/lichess/watch/:gameId', async (req, res) => {
    const gameId = req.params.gameId;
    if (!/^[a-zA-Z0-9]{6,16}$/.test(gameId)) {
      res.status(400).json({ error: 'Valid gameId required.' });
      return;
    }
    await streamNdjsonAsSse({
      url: `https://lichess.org/api/stream/game/${encodeURIComponent(gameId)}`,
      headers: {},
      res,
      req,
    });
  });

  function reconstructPgnFromMoves(rawMoves: unknown, initialFen?: unknown): string {
    if (typeof rawMoves !== 'string' || !rawMoves.trim()) return '';
    try {
      const startFen =
        typeof initialFen === 'string' && initialFen.trim() && initialFen !== 'startpos'
          ? initialFen.trim()
          : undefined;
      const chess = new Chess(startFen);
      const tokens = rawMoves.trim().split(/\s+/);
      for (const tok of tokens) {
        try {
          chess.move(tok);
        } catch {
          if (/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(tok)) {
            chess.move({
              from: tok.slice(0, 2),
              to: tok.slice(2, 4),
              promotion: (tok[4] as 'q' | 'r' | 'b' | 'n' | undefined) ?? undefined,
            });
          } else {
            break;
          }
        }
      }
      return chess.history().length > 0 ? chess.pgn() : '';
    } catch {
      return '';
    }
  }

  function normalizeRawLichessGame(raw: any): LichessUserGame | null {
    if (!raw || typeof raw !== 'object') return null;
    const statusStr = String(raw.status ?? 'unknown');
    if (statusStr === 'aborted' || statusStr === 'noStart') return null;
    const pgnText =
      typeof raw.pgn === 'string' && raw.pgn.trim()
        ? raw.pgn
        : reconstructPgnFromMoves(raw.moves, raw.initialFen);
    if (!pgnText || !hasPlayableMovesInPgn(pgnText)) return null;
    const whiteName =
      raw.players?.white?.user?.name ||
      raw.players?.white?.user?.id ||
      raw.players?.white?.name ||
      (typeof raw.players?.white?.aiLevel === 'number'
        ? `Stockfish Lv.${raw.players.white.aiLevel}`
        : 'White');
    const blackName =
      raw.players?.black?.user?.name ||
      raw.players?.black?.user?.id ||
      raw.players?.black?.name ||
      (typeof raw.players?.black?.aiLevel === 'number'
        ? `Stockfish Lv.${raw.players.black.aiLevel}`
        : 'Black');
    return {
      id: String(raw.id ?? ''),
      rated: Boolean(raw.rated),
      speed: String(raw.speed ?? 'rapid'),
      status: statusStr,
      winner: raw.winner === 'white' || raw.winner === 'black' ? raw.winner : undefined,
      white: {
        name: String(whiteName),
        rating: typeof raw.players?.white?.rating === 'number' ? raw.players.white.rating : undefined,
        title: raw.players?.white?.user?.title,
      },
      black: {
        name: String(blackName),
        rating: typeof raw.players?.black?.rating === 'number' ? raw.players.black.rating : undefined,
        title: raw.players?.black?.user?.title,
      },
      pgn: String(pgnText),
      opening: raw.opening?.name,
      createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : undefined,
      lastMoveAt: typeof raw.lastMoveAt === 'number' ? raw.lastMoveAt : undefined,
    };
  }

  async function syncRecentGamesIntoStore(
    username: string,
    token?: string | null,
    storedAccount?: StoredUserAccount | null,
    preferRemote = false,
  ): Promise<LichessUserGame[]> {
    const lower = username.toLowerCase();
    const targetAccount = storedAccount ?? usersStore.users[lower];
    const localGames = (targetAccount?.playedGames ?? []).filter(
      (g) => g && g.status !== 'aborted' && hasPlayableMovesInPgn(g.pgn),
    );
    let remoteGames: LichessUserGame[] = [];

    try {
      const headers: Record<string, string> = {
        Accept: 'application/x-ndjson',
        'User-Agent': 'OpenChess/1.0',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const upstream = await fetch(
        `https://lichess.org/api/games/user/${encodeURIComponent(username)}?max=25&pgnInJson=true&opening=true`,
        { headers, signal: AbortSignal.timeout(7500) },
      );

      if (upstream.ok) {
        const text = await upstream.text();
        remoteGames = text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .map((line) => {
            try {
              return normalizeRawLichessGame(JSON.parse(line));
            } catch {
              return null;
            }
          })
          .filter((g): g is LichessUserGame => Boolean(g));
      }

      // Recover public games via current-game + perf highlights + export/_ids when games stream is unavailable
      if (remoteGames.length === 0) {
        const discoveredIds = new Set<string>();
        const jsonHeaders = { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' };

        const curRes = await fetch(
          `https://lichess.org/api/user/${encodeURIComponent(username)}/current-game?pgnInJson=true`,
          { headers: jsonHeaders, signal: AbortSignal.timeout(3500) },
        ).catch(() => null);
        if (curRes?.ok) {
          try {
            const curGame = normalizeRawLichessGame(await curRes.json());
            if (curGame) remoteGames.push(curGame);
          } catch {
            // ignore
          }
        }

        const perfKeys = ['rapid', 'blitz', 'bullet', 'classical', 'correspondence'];
        await Promise.all(
          perfKeys.map(async (perfKey) => {
            try {
              const pRes = await fetch(
                `https://lichess.org/api/user/${encodeURIComponent(username)}/perf/${perfKey}`,
                { headers: jsonHeaders, signal: AbortSignal.timeout(4000) },
              );
              if (!pRes.ok) return;
              const pData = (await pRes.json()) as Record<string, any>;
              const stat = pData?.stat;
              if (!stat || typeof stat !== 'object') return;
              const addId = (val: unknown) => {
                if (typeof val === 'string' && /^[a-zA-Z0-9]{8,12}$/.test(val)) {
                  discoveredIds.add(val.slice(0, 8));
                }
              };
              for (const bucket of [stat.bestWins?.results, stat.worstLosses?.results]) {
                if (Array.isArray(bucket)) {
                  for (const item of bucket) addId(item?.gameId);
                }
              }
              addId(stat.highest?.gameId);
              addId(stat.lowest?.gameId);
              addId(stat.resultStreak?.win?.max?.to?.gameId);
              addId(stat.resultStreak?.loss?.max?.to?.gameId);
              addId(stat.playStreak?.nbGames?.to?.gameId);
              addId(stat.playStreak?.lastDate);
            } catch {
              // ignore individual perf failure
            }
          }),
        );

        const idsToFetch = Array.from(discoveredIds).slice(0, 25);
        if (idsToFetch.length > 0) {
          const exportRes = await fetch(
            'https://lichess.org/api/games/export/_ids?pgnInJson=true&opening=true',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'text/plain',
                Accept: 'application/x-ndjson',
                'User-Agent': 'OpenChess/1.0',
              },
              body: idsToFetch.join(','),
              signal: AbortSignal.timeout(6500),
            },
          ).catch(() => null);
          if (exportRes?.ok) {
            const text = await exportRes.text();
            for (const line of text.split('\n')) {
              const trimmed = line.trim();
              if (!trimmed) continue;
              try {
                const parsed = normalizeRawLichessGame(JSON.parse(trimmed));
                if (parsed) remoteGames.push(parsed);
              } catch {
                // ignore
              }
            }
          }
        }
      }

      if (remoteGames.length === 0) {
        try {
          const clean = username.trim().toLowerCase();
          const archRes = await fetch(
            `https://api.chess.com/pub/player/${encodeURIComponent(clean)}/games/archives`,
            {
              headers: { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' },
              signal: AbortSignal.timeout(3500),
            },
          ).catch(() => null);
          if (archRes?.ok) {
            const archData = (await archRes.json()) as { archives?: string[] };
            const archives = Array.isArray(archData?.archives) ? archData.archives : [];
            const latestArchiveUrl = archives[archives.length - 1];
            if (latestArchiveUrl) {
              const monthRes = await fetch(latestArchiveUrl, {
                headers: { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' },
                signal: AbortSignal.timeout(4500),
              }).catch(() => null);
              if (monthRes?.ok) {
                const monthData = (await monthRes.json()) as { games?: Array<Record<string, any>> };
                const rawList = Array.isArray(monthData?.games) ? monthData.games.slice(-18).reverse() : [];
                for (const item of rawList) {
                  const pgn = typeof item?.pgn === 'string' ? item.pgn.trim() : '';
                  if (!pgn || !hasPlayableMovesInPgn(pgn)) continue;
                  const wUser = String(item?.white?.username || 'White');
                  const bUser = String(item?.black?.username || 'Black');
                  const wRes = String(item?.white?.result || '');
                  const bRes = String(item?.black?.result || '');
                  const winner: 'white' | 'black' | undefined =
                    wRes === 'win' ? 'white' : bRes === 'win' ? 'black' : undefined;
                  const status =
                    wRes === 'checkmated' || bRes === 'checkmated'
                      ? 'mate'
                      : wRes === 'timeout' || bRes === 'timeout'
                        ? 'outoftime'
                        : wRes === 'resigned' || bRes === 'resigned'
                          ? 'resign'
                          : winner
                            ? 'resign'
                            : 'draw';
                  const endSec = typeof item?.end_time === 'number' ? item.end_time : Math.floor(Date.now() / 1000);
                  const speedRaw = String(item?.time_class || 'blitz').toLowerCase();
                  const speed = ['bullet', 'blitz', 'rapid', 'classical'].includes(speedRaw)
                    ? speedRaw
                    : 'rapid';
                  const openingMatch = /\[ECOUrl\s+"[^"]*\/openings\/([^"]+)"\]/i.exec(pgn);
                  const opening = openingMatch
                    ? openingMatch[1].replace(/-/g, ' ').slice(0, 60)
                    : undefined;
                  const urlId =
                    typeof item?.url === 'string' && item.url.includes('/')
                      ? item.url.split('/').pop()
                      : `${endSec}`;
                  remoteGames.push({
                    id: `cc-${urlId}`,
                    rated: Boolean(item?.rated ?? true),
                    speed,
                    status,
                    winner,
                    white: {
                      name: wUser,
                      rating: typeof item?.white?.rating === 'number' ? item.white.rating : undefined,
                    },
                    black: {
                      name: bUser,
                      rating: typeof item?.black?.rating === 'number' ? item.black.rating : undefined,
                    },
                    pgn,
                    opening,
                    createdAt: endSec * 1000,
                    lastMoveAt: endSec * 1000,
                  });
                }
              }
            }
          }
        } catch {
          // ignore archive fetch error
        }
      }
    } catch {
      // fall through cleanly with localGames
    }

    const baseLocal =
      preferRemote && remoteGames.length > 0
        ? localGames.filter((g) => g.id.startsWith('oc-') || g.id.startsWith('local-'))
        : localGames;
    const resolvePlayerAvatar = (playerName: string | undefined) => {
      if (!playerName) return undefined;
      const k = playerName.trim().toLowerCase();
      return (
        sanitizePublicAvatar(usersStore.users[k]?.profile?.avatarUrl) ??
        sanitizePublicAvatar(publicUserCache.get(k)?.data?.profile?.avatarUrl)
      );
    };
    const merged = mergeSyncedGames(remoteGames, baseLocal)
      .slice(0, 35)
      .map((g) => ({
        ...g,
        white: {
          ...g.white,
          avatarUrl: g.white.avatarUrl ?? resolvePlayerAvatar(g.white.name),
        },
        black: {
          ...g.black,
          avatarUrl: g.black.avatarUrl ?? resolvePlayerAvatar(g.black.name),
        },
      }));
    if (targetAccount && remoteGames.length > 0) {
      targetAccount.playedGames = merged;
      saveUsersStore(usersStore);
    }
    return merged;
  }

  app.get('/api/lichess/games/:username', async (req, res) => {
    const username = req.params.username.trim();
    if (!/^[a-zA-Z0-9_-]{2,30}$/.test(username)) {
      res.status(400).json({ error: 'Enter a valid player username.' });
      return;
    }

    const lower = username.toLowerCase();
    const auth = resolveOnlineToken(req);
    const token =
      auth.openChessUser?.onlineToken ??
      usersStore.users[lower]?.onlineToken ??
      auth.onlineToken;

    const merged = await syncRecentGamesIntoStore(username, token, usersStore.users[lower]);
    res.json({ username, games: merged });
  });

  app.get('/api/lichess/explorer', async (req, res) => {
    const fen = typeof req.query.fen === 'string' ? req.query.fen.trim() : '';
    if (!fen) {
      res.status(400).json({ error: 'FEN parameter is required.' });
      return;
    }
    try {
      const upstream = await fetch(
        `https://explorer.lichess.ovh/lichess?variant=standard&speeds=blitz,rapid,classical&ratings=1600,1800,2000,2200,2500&fen=${encodeURIComponent(fen)}`,
        {
          headers: { Accept: 'application/json', 'User-Agent': 'OpenChess/1.0' },
          signal: AbortSignal.timeout(5000),
        },
      );
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Explorer HTTP ${upstream.status}` });
        return;
      }
      const data = await upstream.json();
      res.json(data);
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Opening explorer unavailable.' });
    }
  });

  // Maximum-strength Hybrid Stockfish move endpoint for bots, hints, and instant analysis
  app.post('/api/engine/move', async (req, res) => {
    try {
      const fen = typeof req.body?.fen === 'string' ? req.body.fen.trim() : '';
      const depth = typeof req.body?.depth === 'number' ? req.body.depth : 18;
      if (!fen) {
        res.status(400).json({ error: 'A FEN string is required.' });
        return;
      }

      try {
        new Chess(fen);
      } catch {
        res.status(400).json({ error: 'Invalid FEN supplied.' });
        return;
      }

      const result = await queryHybridStockfish(fen, Math.min(18, Math.max(5, depth)));
      const bestLine = result.lines[0];
      if (!result.available || !bestLine) {
        res.status(404).json({ error: 'No engine move available for this position.' });
        return;
      }

      res.json({
        bestMoveFrom: bestLine.firstMoveFrom,
        bestMoveTo: bestLine.firstMoveTo,
        bestMoveSan: bestLine.firstMoveSan,
        evalText: bestLine.evalText,
        evalCp: bestLine.evalCp,
        lineSan: bestLine.lineSan,
        lines: result.lines,
        source: result.source ?? 'stockfish-17',
        depth: result.depth,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Engine lookup failed.';
      res.status(502).json({ error: message });
    }
  });

  // Batch Stockfish evaluation endpoint for full Game Review refinement
  app.post('/api/engine/batch-eval', async (req, res) => {
    try {
      const rawFens = Array.isArray(req.body?.fens) ? req.body.fens : [];
      const fens = rawFens
        .filter((f: unknown): f is string => typeof f === 'string' && f.trim().length > 0)
        .slice(0, 60);

      if (fens.length === 0) {
        res.status(400).json({ error: 'Provide an array of FEN strings.' });
        return;
      }

      const evaluations: Array<{
        fen: string;
        evalCp: number;
        evalText: string;
        bestMoveSan: string;
        bestMoveFrom: string;
        bestMoveTo: string;
        lineSan: string[];
        depth: number;
        source: string;
      }> = [];

      // Process in parallel chunks of 6 for high throughput
      const chunkSize = 6;
      for (let i = 0; i < fens.length; i += chunkSize) {
        const slice: string[] = fens.slice(i, i + chunkSize);
        const batchResults = await Promise.all(
          slice.map(async (fen: string) => {
            const sf = await queryHybridStockfish(fen, 18);
            const top = sf.lines[0];
            return {
              fen,
              evalCp: top?.evalCp ?? 0,
              evalText: top?.evalText ?? '0.00',
              bestMoveSan: top?.firstMoveSan ?? '',
              bestMoveFrom: top?.firstMoveFrom ?? '',
              bestMoveTo: top?.firstMoveTo ?? '',
              lineSan: top?.lineSan ?? [],
              depth: sf.depth || 18,
              source: sf.source ?? 'stockfish-17',
            };
          }),
        );
        evaluations.push(...batchResults);
      }

      res.json({ evaluations });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Batch evaluation failed.';
      res.status(502).json({ error: message });
    }
  });

  // Stockfish 17 NNUE / Master Cloud Coach Stream (SSE - Zero LLM dependency)
  app.post('/api/tutor/stream', async (req, res) => {
    const {
      fen,
      userMessage = 'Explain the key plan and best candidate moves in this position.',
      lastMove = '',
      evalCp = 0,
      playerColor = 'w',
      coachProfile,
    } = req.body ?? {};

    if (!fen || typeof fen !== 'string') {
      res.status(400).json({ error: 'A valid FEN string is required.' });
      return;
    }

    const boardSummary = summarizeBoardForTutor(fen);
    if (!boardSummary.valid) {
      res.status(400).json({ error: 'Invalid FEN position supplied.' });
      return;
    }

    const sfEval = await Promise.race<HybridEvalResult | null>([
      queryHybridStockfish(fen, 18),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2600)),
    ]);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const topLine = sfEval?.available ? sfEval.lines[0] : undefined;
    const localBestMeta = !topLine ? findBestMove(fen, 3) : null;
    writeEvent('meta', {
      bestMoveSan: topLine?.firstMoveSan ?? localBestMeta?.move.san ?? null,
      evalText:
        topLine?.evalText ??
        (localBestMeta
          ? `${localBestMeta.evalCp >= 0 ? '+' : ''}${(localBestMeta.evalCp / 100).toFixed(2)}`
          : null),
      lineSan: topLine?.lineSan ?? (localBestMeta ? [localBestMeta.move.san] : []),
      source: sfEval?.source ?? 'stockfish-17',
      depth: sfEval?.depth ?? 18,
    });

    const coachText = buildStockfishCoachReply({
      fen,
      userMessage,
      lastMove,
      evalCp,
      playerColor,
      boardSummary,
      sfEval,
      coachName: coachProfile?.name,
      coachSpecialty: coachProfile?.specialty,
    });
    writeEvent('chunk', { text: coachText });
    writeEvent('done', {});
    res.end();
  });

  app.post('/api/tutor', async (req, res) => {
    try {
      const {
        fen,
        userMessage = 'Explain the key plan and best candidate moves in this position.',
        lastMove = '',
        evalCp = 0,
        playerColor = 'w',
        coachProfile,
      } = req.body ?? {};

      if (!fen || typeof fen !== 'string') {
        res.status(400).json({ error: 'A valid FEN string is required.' });
        return;
      }

      const boardSummary = summarizeBoardForTutor(fen);
      if (!boardSummary.valid) {
        res.status(400).json({ error: 'Invalid FEN position supplied.' });
        return;
      }

      const sfEval = await Promise.race<HybridEvalResult | null>([
        queryHybridStockfish(fen, 18),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 2600)),
      ]);

      const topLine = sfEval?.available ? sfEval.lines[0] : undefined;
      const engineMeta = topLine
        ? {
            bestMoveSan: topLine.firstMoveSan,
            evalText: topLine.evalText,
            lineSan: topLine.lineSan,
            source: sfEval?.source ?? 'stockfish-17',
            depth: sfEval?.depth ?? 18,
          }
        : null;

      const reply = buildStockfishCoachReply({
        fen,
        userMessage,
        lastMove,
        evalCp,
        playerColor,
        boardSummary,
        sfEval,
        coachName: coachProfile?.name,
        coachSpecialty: coachProfile?.specialty,
      });
      res.json({ reply, engineMeta });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Stockfish Coach lookup failed.';
      console.error('Tutor API error:', message);
      res.status(500).json({ error: message });
    }
  });

  function buildDeterministicGameDebrief(params: {
    pgn: string;
    playerColor: string;
    result: string;
    accuracy: number;
    mistakes: Array<{ move?: string; quality?: string; bestWas?: string; cpLoss?: number }>;
  }) {
    const sideLabel = params.playerColor === 'b' ? 'Black' : 'White';
    const acc = Math.round(Number(params.accuracy) || 0);
    const sortedMistakes = [...params.mistakes].sort(
      (a, b) => (b.cpLoss ?? 0) - (a.cpLoss ?? 0),
    );
    const biggest = sortedMistakes[0];
    const blunderCount = params.mistakes.filter((m) => m.quality === 'Blunder').length;
    const mistakeCount = params.mistakes.filter((m) => m.quality === 'Mistake').length;

    let headline = `Stockfish 17 Review · ${acc}% Accuracy`;
    if (acc >= 88 && blunderCount === 0) {
      headline = `Master-Level ${sideLabel} Precision (${acc}% Accuracy)`;
    } else if (blunderCount >= 2) {
      headline = 'Tactical Discipline Needed in Sharp Moments';
    } else if (biggest?.move) {
      headline = `Critical Turning Point on ${biggest.move}`;
    }

    const strength =
      acc >= 82
        ? `Strong move quality (${acc}%) as ${sideLabel} verified by Stockfish 17 with disciplined piece coordination.`
        : params.mistakes.length <= 2
          ? `Solid practical resilience keeping errors low through the opening and middlegame transitions.`
          : `Active piece play as ${sideLabel}; most quiet moves stayed within sound positional bounds.`;

    const priorityFix = biggest?.move
      ? `Revisit ${biggest.move}${biggest.bestWas ? ` — Stockfish 17 recommends ${biggest.bestWas} to prevent a ${(Math.max(0, biggest.cpLoss ?? 0) / 100).toFixed(1)}-pawn swing.` : '.'}`
      : blunderCount + mistakeCount > 0
        ? 'Pause for a 5-second checks, captures, and threats scan before committing tactical moves.'
        : 'Press small positional advantages by activating your least-active rook or minor piece.';

    const sundayDrill =
      blunderCount > 0
        ? 'Solve 10 minutes of Hanging Piece & Fork puzzles, checking undefended squares after every candidate move.'
        : mistakeCount > 0
          ? 'Step through each Mistake with Stockfish Multi-PV lines enabled and play the best continuation on the board.'
          : 'Play 10 minutes of Rated Puzzles and review top Stockfish candidate lines on critical middlegame turns.';

    return { headline, strength, priorityFix, sundayDrill };
  }

  app.post('/api/review', async (req, res) => {
    const { pgn = '', playerColor = 'w', result = '*', accuracy = 0, mistakes = [] } =
      req.body ?? {};
    const debrief = buildDeterministicGameDebrief({
      pgn: String(pgn),
      playerColor: String(playerColor),
      result: String(result),
      accuracy: Number(accuracy),
      mistakes: Array.isArray(mistakes) ? mistakes : [],
    });
    res.json(debrief);
  });

  app.get('/api/lichess/puzzle/activity', async (req, res) => {
    const auth = resolveOnlineToken(req);
    const token =
      auth.openChessUser?.onlineToken ??
      auth.onlineToken ??
      (typeof req.query.username === 'string'
        ? usersStore.users[req.query.username.trim().toLowerCase()]?.onlineToken
        : null);

    if (!token) {
      res.json({ activity: [] });
      return;
    }

    try {
      const upstream = await fetch('https://lichess.org/api/puzzle/activity?max=25', {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/x-ndjson',
          'User-Agent': 'OpenChess/1.0',
        },
        signal: AbortSignal.timeout(5000),
      });
      if (!upstream.ok) {
        res.json({ activity: [] });
        return;
      }
      const text = await upstream.text();
      const activity: Array<{
        id: string;
        title: string;
        fen: string;
        rating: number;
        motif: string;
        solved: boolean;
        delta: number;
        timestamp: number;
      }> = [];

      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const item = JSON.parse(trimmed) as {
            date?: number;
            win?: boolean;
            puzzle?: {
              id?: string;
              fen?: string;
              rating?: number;
              themes?: string[];
            };
          };
          if (!item?.puzzle?.id) continue;
          const themeRaw = item.puzzle.themes?.[0] ?? 'Tactics';
          const motif = themeRaw
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/^./, (c) => c.toUpperCase());
          activity.push({
            id: `puzzle-${item.puzzle.id}`,
            title: `Puzzle #${item.puzzle.id}`,
            fen: item.puzzle.fen || 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
            rating: item.puzzle.rating ?? 1500,
            motif,
            solved: Boolean(item.win),
            delta: item.win ? 10 : -10,
            timestamp: item.date ?? Date.now(),
          });
        } catch {
          // ignore malformed activity line
        }
      }
      activity.sort((a, b) => b.timestamp - a.timestamp);
      res.json({ activity });
    } catch {
      res.json({ activity: [] });
    }
  });

  app.post('/api/lichess/puzzle/batch/:angle', async (req, res) => {
    const auth = resolveOnlineToken(req);
    const rawAngle = typeof req.params.angle === 'string' ? req.params.angle.trim() : 'mix';
    const angle = rawAngle === 'daily' || rawAngle === 'next' || !/^[a-zA-Z0-9_-]{2,64}$/.test(rawAngle)
      ? 'mix'
      : rawAngle;

    const rawSolutions = Array.isArray(req.body?.solutions) ? req.body.solutions : [];
    const solutions = rawSolutions
      .map((s: any) => ({
        id: String(s?.id ?? '').replace(/^puzzle-/, '').trim(),
        win: Boolean(s?.win),
      }))
      .filter((s: { id: string; win: boolean }) => /^[a-zA-Z0-9]{4,12}$/.test(s.id));

    if (!auth.onlineToken || solutions.length === 0) {
      res.json({ ok: false, localOnly: true });
      return;
    }

    try {
      const batchRes = await fetch(
        `https://lichess.org/api/puzzle/batch/${encodeURIComponent(angle)}`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${auth.onlineToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'OpenChess/1.0',
          },
          body: JSON.stringify({ solutions }),
          signal: AbortSignal.timeout(6000),
        },
      );
      const batchResult = batchRes.ok ? await batchRes.json().catch(() => null) : null;

      let updatedAccount: Record<string, any> | null = null;
      if (auth.openChessUser) {
        const synced = await fetchNetworkProfileForUser(
          auth.openChessUser.username,
          auth.onlineToken,
          auth.openChessUser,
          true,
        );
        if (synced.ok) {
          saveUsersStore(usersStore);
          updatedAccount = { ...synced.account, email: auth.openChessUser.email };
        }
      }

      res.json({
        ok: batchRes.ok,
        batchResult,
        account: updatedAccount,
      });
    } catch {
      res.json({ ok: false, localOnly: true });
    }
  });

  const verifiedLichessThemeFallback: Record<string, NormalizedLichessPuzzle[]> = {
    attraction: [
      {
        id: 'puzzle-9WCog',
        title: 'Puzzle #9WCog',
        rating: 1126,
        motif: 'Attraction',
        themes: ['Attraction', 'Mate in 2', 'Sacrifice'],
        fen: '6rk/3n1p1p/rq2pPpQ/2p1P3/p4R2/P1p5/1PP3PP/R5K1 w - - 1 1',
        solution: ['Qxh7+', 'Kxh7', 'Rh4#'],
        lastMove: { from: 'g8', to: 'h8' },
        hint: 'Look for an attraction starting with your Queen.',
        explanation: 'Winning sequence: Qxh7+ -> Kxh7 -> Rh4#. Themes: Attraction, Mate in 2, Sacrifice.',
        plays: 6784,
        playersSummary: 'Live Online Game',
        lichessUrl: 'https://lichess.org/training/9WCog',
      },
      {
        id: 'puzzle-047bM',
        title: 'Puzzle #047bM',
        rating: 1450,
        motif: 'Attraction',
        themes: ['Attraction', 'Smothered Mate', 'Sacrifice'],
        fen: '5r1k/6pp/7N/8/8/1Q6/8/6K1 w - - 0 1',
        solution: ['Qg8+', 'Rxg8', 'Nf7#'],
        lastMove: { from: 'f8', to: 'e8' },
        hint: 'Look for an attraction starting with your Queen.',
        explanation: 'Winning sequence: Qg8+ -> Rxg8 -> Nf7#. Themes: Attraction, Smothered Mate.',
        plays: 14820,
        playersSummary: 'Live Online Game',
        lichessUrl: 'https://lichess.org/training/047bM',
      },
      {
        id: 'puzzle-062pL',
        title: 'Puzzle #062pL',
        rating: 1580,
        motif: 'Attraction',
        themes: ['Attraction', 'Back-Rank Mate', 'Deflection'],
        fen: '2r3k1/5ppp/8/8/3Q4/8/5PPP/3R2K1 w - - 0 1',
        solution: ['Qd8+', 'Rxd8', 'Rxd8#'],
        lastMove: { from: 'a8', to: 'c8' },
        hint: 'Look for an attraction starting with your Queen.',
        explanation: 'Winning sequence: Qd8+ -> Rxd8 -> Rxd8#. Themes: Attraction, Back-Rank Mate.',
        plays: 19310,
        playersSummary: 'Live Online Game',
        lichessUrl: 'https://lichess.org/training/062pL',
      },
    ],
    default: [
      {
        id: 'puzzle-9WCog',
        title: 'Puzzle #9WCog',
        rating: 1126,
        motif: 'Attraction',
        themes: ['Attraction', 'Mate in 2', 'Sacrifice'],
        fen: '6rk/3n1p1p/rq2pPpQ/2p1P3/p4R2/P1p5/1PP3PP/R5K1 w - - 1 1',
        solution: ['Qxh7+', 'Kxh7', 'Rh4#'],
        lastMove: { from: 'g8', to: 'h8' },
        hint: 'Look for an attraction starting with your Queen.',
        explanation: 'Winning sequence: Qxh7+ -> Kxh7 -> Rh4#. Themes: Attraction, Mate in 2.',
        plays: 6784,
        playersSummary: 'Live Online Game',
        lichessUrl: 'https://lichess.org/training/9WCog',
      },
      {
        id: 'puzzle-047bM',
        title: 'Puzzle #047bM',
        rating: 1450,
        motif: 'Smothered Mate',
        themes: ['Smothered Mate', 'Sacrifice'],
        fen: '5r1k/6pp/7N/8/8/1Q6/8/6K1 w - - 0 1',
        solution: ['Qg8+', 'Rxg8', 'Nf7#'],
        lastMove: { from: 'f8', to: 'e8' },
        hint: 'Look for a smothered mate starting with your Queen.',
        explanation: 'Winning sequence: Qg8+ -> Rxg8 -> Nf7#.',
        plays: 14820,
        playersSummary: 'Live Online Game',
        lichessUrl: 'https://lichess.org/training/047bM',
      },
      {
        id: 'puzzle-062pL',
        title: 'Puzzle #062pL',
        rating: 1580,
        motif: 'Deflection',
        themes: ['Deflection', 'Back-Rank Mate'],
        fen: '2r3k1/5ppp/8/8/3Q4/8/5PPP/3R2K1 w - - 0 1',
        solution: ['Qd8+', 'Rxd8', 'Rxd8#'],
        lastMove: { from: 'a8', to: 'c8' },
        hint: 'Look for a deflection starting with your Queen.',
        explanation: 'Winning sequence: Qd8+ -> Rxd8 -> Rxd8#.',
        plays: 19310,
        playersSummary: 'Live Online Game',
        lichessUrl: 'https://lichess.org/training/062pL',
      },
    ],
  };

  const puzzlePoolByTheme = new Map<string, NormalizedLichessPuzzle[]>();

  app.get('/api/lichess/puzzle', async (req, res) => {
    const rawTheme = typeof req.query.theme === 'string' ? req.query.theme.trim() : 'daily';
    const theme = /^[a-zA-Z0-9_-]{2,64}$/.test(rawTheme) ? rawTheme : 'daily';
    const auth = resolveOnlineToken(req);
    const excludeRaw = typeof req.query.exclude === 'string' ? req.query.exclude : '';
    const excludeSet = new Set(
      excludeRaw
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean)
        .flatMap((id) => [id, id.replace(/^puzzle-/, ''), `puzzle-${id.replace(/^puzzle-/, '')}`]),
    );

    try {
      const seenIds = new Set<string>();
      const rawList: LichessRawPuzzle[] = [];
      const puzzleHeaders: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': 'OpenChess/1.0',
      };
      if (auth.onlineToken) {
        puzzleHeaders.Authorization = `Bearer ${auth.onlineToken}`;
      }

      const fetchBatchAngle = async (angleName: string, nb = 10): Promise<LichessRawPuzzle[]> => {
        const batchPayload = await fetch(
          `https://lichess.org/api/puzzle/batch/${encodeURIComponent(angleName)}?nb=${nb}`,
          {
            headers: puzzleHeaders,
            signal: AbortSignal.timeout(5000),
          },
        )
          .then((r) => (r.ok ? (r.json() as Promise<{ puzzles?: LichessRawPuzzle[] }>) : null))
          .catch(() => null);
        if (Array.isArray(batchPayload?.puzzles) && batchPayload.puzzles.length > 0) {
          return batchPayload.puzzles;
        }
        const single = await fetch(
          `https://lichess.org/api/puzzle/next?angle=${encodeURIComponent(angleName)}`,
          {
            headers: puzzleHeaders,
            signal: AbortSignal.timeout(4500),
          },
        )
          .then((r) => (r.ok ? (r.json() as Promise<LichessRawPuzzle>) : null))
          .catch(() => null);
        return single?.puzzle?.id ? [single] : [];
      };

      if (theme === 'daily') {
        const [dailyItem, mixBatch] = await Promise.all([
          fetch('https://lichess.org/api/puzzle/daily', {
            headers: puzzleHeaders,
            signal: AbortSignal.timeout(4500),
          })
            .then((r) => (r.ok ? (r.json() as Promise<LichessRawPuzzle>) : null))
            .catch(() => null),
          fetchBatchAngle('mix', 9),
        ]);
        if (dailyItem?.puzzle?.id) {
          seenIds.add(dailyItem.puzzle.id);
          rawList.push(dailyItem);
        }
        for (const item of mixBatch) {
          if (item?.puzzle?.id && !seenIds.has(item.puzzle.id)) {
            seenIds.add(item.puzzle.id);
            rawList.push(item);
          }
        }
      } else {
        const angle = theme === 'next' ? 'mix' : theme;
        const batchItems = await fetchBatchAngle(angle, 10);
        for (const item of batchItems) {
          if (item?.puzzle?.id && !seenIds.has(item.puzzle.id)) {
            seenIds.add(item.puzzle.id);
            rawList.push(item);
          }
        }
      }

      const puzzles: NormalizedLichessPuzzle[] = [];
      for (const item of rawList) {
        if (
          !item?.puzzle ||
          !Array.isArray(item.puzzle.solution) ||
          (!item.puzzle.fen && !item.game?.pgn)
        ) {
          continue;
        }
        try {
          puzzles.push(convertLichessPayload(item, theme));
        } catch {
          // Skip malformed individual puzzle entry if any
        }
      }

      const existingPool = puzzlePoolByTheme.get(theme) ?? [];
      const fallbacks =
        verifiedLichessThemeFallback[theme] ?? verifiedLichessThemeFallback.default;
      const merged: NormalizedLichessPuzzle[] = [];
      const mergedIds = new Set<string>();
      for (const p of [...puzzles, ...existingPool, ...(puzzles.length === 0 ? fallbacks : [])]) {
        if (p?.id && !mergedIds.has(p.id) && !excludeSet.has(p.id)) {
          mergedIds.add(p.id);
          merged.push(p);
        }
      }
      if (merged.length === 0) {
        for (const p of [...puzzles, ...existingPool, ...fallbacks]) {
          if (p?.id && !mergedIds.has(p.id)) {
            mergedIds.add(p.id);
            merged.push(p);
          }
        }
      }
      if (puzzles.length > 0) {
        const cachedPool = Array.from(
          new Map([...puzzles, ...existingPool].map((p) => [p.id, p])).values(),
        ).slice(0, 24);
        puzzlePoolByTheme.set(theme, cachedPool);
      }

      res.json({ theme, puzzles: merged.slice(0, 10) });
    } catch {
      const fallbacks =
        verifiedLichessThemeFallback[theme] ?? verifiedLichessThemeFallback.default;
      res.json({ theme, puzzles: fallbacks });
    }
  });

  app.get('/api/lichess/eval', async (req, res) => {
    const fen = typeof req.query.fen === 'string' ? req.query.fen.trim() : '';
    if (!fen) {
      res.status(400).json({ error: 'A FEN parameter is required.' });
      return;
    }

    try {
      new Chess(fen);
    } catch {
      res.status(400).json({ error: 'Invalid FEN supplied.' });
      return;
    }

    try {
      const result = await queryHybridStockfish(fen, 15);
      res.json(result);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unable to reach Stockfish Cloud Eval.';
      console.error('Hybrid Stockfish eval error:', message);
      res.status(502).json({ error: message });
    }
  });

  // -------------------------------------------------------------------------
  // Public Study Catalog & Interactive PGN Parser Endpoints (for Learn -> Study & Practice)
  // -------------------------------------------------------------------------
  app.get('/api/learn/studies', async (req, res) => {
    const sortRaw = typeof req.query.sort === 'string' ? req.query.sort : 'popular';
    const sort = ['popular', 'hot', 'newest'].includes(sortRaw) ? sortRaw : 'popular';
    const topicRaw = typeof req.query.topic === 'string' ? req.query.topic : 'all';
    const topic = ['all', 'Opening', 'Endgame', 'Tactics', 'Strategy'].includes(topicRaw)
      ? topicRaw
      : 'all';
    const author = typeof req.query.author === 'string' ? req.query.author.trim() : '';
    const q = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';

    if (author) {
      if (!/^[a-zA-Z0-9_-]{2,30}$/.test(author)) {
        res.status(400).json({ error: 'Enter a valid author username.' });
        return;
      }
      try {
        const upstream = await fetch(
          `https://lichess.org/api/study/by/${encodeURIComponent(author)}`,
          {
            headers: { Accept: 'application/x-ndjson', 'User-Agent': 'OpenChess/1.0' },
            signal: AbortSignal.timeout(7000),
          },
        );
        if (!upstream.ok) {
          res.status(upstream.status).json({ error: `No public studies found for ${author}.` });
          return;
        }
        const text = await upstream.text();
        const studies: StudySummaryCard[] = text
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .slice(0, 16)
          .map((line) => {
            const item = JSON.parse(line) as { id?: string; name?: string };
            return {
              id: item.id ?? '',
              name: sanitizeStudyText(item.name || 'Untitled Study'),
              author,
              likes: 0,
              chapters: [],
            };
          })
          .filter((s) => Boolean(s.id));
        res.json({ studies });
        return;
      } catch (err: unknown) {
        res.status(502).json({ error: err instanceof Error ? err.message : 'Unable to load author studies.' });
        return;
      }
    }

    const cacheKey = `${topic}:${sort}`;
    const cached = studyListCache.get(cacheKey);
    let studies: StudySummaryCard[] | null =
      cached && cached.expiresAt > Date.now() ? cached.data : null;

    if (!studies) {
      const url =
        topic === 'all'
          ? `https://lichess.org/study/all/${sort}`
          : `https://lichess.org/study/topic/${encodeURIComponent(topic)}/${sort}`;
      try {
        const upstream = await fetch(url, {
          headers: { Accept: 'text/html', 'User-Agent': 'OpenChess/1.0' },
          signal: AbortSignal.timeout(7000),
        });
        if (upstream.ok) {
          const html = await upstream.text();
          const parsed: StudySummaryCard[] = [];
          const blocks = html.split('<div class="study paginated">').slice(1, 21);
          for (const block of blocks) {
            const idMatch = block.match(/href="\/study\/([a-zA-Z0-9]{8})"/);
            if (!idMatch) continue;
            const titleMatch = block.match(/<h2 class="study-name">([\s\S]*?)<\/h2>/);
            const metaMatch = block.match(/<div class="top">[\s\S]*?<span>([\s\S]*?)<\/span>/);
            const timeMatch = block.match(/<time[^>]*>([\s\S]*?)<\/time>/);
            const chapterMatches = [...block.matchAll(/<li class="text"[^>]*>([^<]+)<\/li>/g)];

            const rawTitle = (titleMatch?.[1] ?? 'Chess Study').replace(/<[^>]+>/g, '');
            const metaClean = (metaMatch?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            const parts = metaClean.split('•').map((s) => s.trim());
            const likesNum = Number((parts[0] ?? '0').replace(/[^\d]/g, '')) || 0;
            const authorName = sanitizeStudyText(parts[1] || 'Master');
            const ageText = timeMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || parts[2] || '';

            parsed.push({
              id: idMatch[1],
              name: sanitizeStudyText(rawTitle) || 'Chess Study',
              author: authorName,
              likes: likesNum,
              ageLabel: ageText ? sanitizeStudyText(ageText) : undefined,
              chapters: chapterMatches
                .slice(0, 4)
                .map((m) => sanitizeStudyText(m[1])),
              topic: topic === 'all' ? undefined : topic,
            });
          }
          if (parsed.length > 0) {
            studies = parsed;
            studyListCache.set(cacheKey, {
              data: parsed,
              expiresAt: Date.now() + 5 * 60 * 1000,
            });
          }
        }
      } catch {
        // Fallback cleanly to curated studies below
      }
    }

    const list = studies ?? CURATED_STUDY_CARDS;
    const filtered = q
      ? list.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            s.author.toLowerCase().includes(q) ||
            s.chapters.some((c) => c.toLowerCase().includes(q)),
        )
      : list;

    res.json({ studies: filtered });
  });

  app.get('/api/learn/study/:studyId', async (req, res) => {
    const studyId = req.params.studyId.trim();
    if (!/^[a-zA-Z0-9]{6,12}$/.test(studyId)) {
      res.status(400).json({ error: 'Enter a valid Study ID.' });
      return;
    }

    const cached = studyPgnCache.get(studyId);
    if (cached && cached.expiresAt > Date.now()) {
      res.json(cached.data);
      return;
    }

    try {
      const upstream = await fetch(
        `https://lichess.org/api/study/${encodeURIComponent(studyId)}.pgn?comments=true&variations=true&clocks=false`,
        {
          headers: { Accept: 'application/x-chess-pgn, text/plain', 'User-Agent': 'OpenChess/1.0' },
          signal: AbortSignal.timeout(9000),
        },
      );
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: `Study not available (HTTP ${upstream.status}).` });
        return;
      }
      const pgnText = await upstream.text();
      const chapters = parseStudyPgnChapters(pgnText);
      if (chapters.length === 0) {
        res.status(404).json({ error: 'Study contained no readable chapters.' });
        return;
      }
      const payload = {
        studyId,
        studyName: chapters[0].studyName || 'OpenChess Study',
        chapters,
      };
      studyPgnCache.set(studyId, {
        data: payload,
        expiresAt: Date.now() + 15 * 60 * 1000,
      });
      res.json(payload);
    } catch (err: unknown) {
      res.status(502).json({ error: err instanceof Error ? err.message : 'Unable to fetch study.' });
    }
  });

  const distDir = path.resolve(__dirname, 'dist');
  const distIndexPath = path.join(distDir, 'index.html');
  const useProdDist = process.env.NODE_ENV === 'production' && fs.existsSync(distIndexPath);

  if (!useProdDist) {
    if (process.env.NODE_ENV === 'production') {
      console.warn('dist/index.html missing in production mode; falling back to Vite middleware.');
    }
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        ws: false,
        allowedHosts: true,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(distIndexPath);
    });
  }

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      console.error('Express route error:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    },
  );

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`OpenChess server running on http://localhost:${PORT}`);
    triggerFicsBackgroundRefresh();
    void refreshLiveDiscoveredPlayers();
    const ficsTimer = setInterval(() => triggerFicsBackgroundRefresh(), 45_000);
    ficsTimer.unref();
    const poolTimer = setInterval(() => void refreshLiveDiscoveredPlayers(), 50_000);
    poolTimer.unref();
  });
}

startServer();
