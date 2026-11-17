import { useCallback, useEffect, useRef, useState } from 'react';
import type { LichessAccount, LichessUserGame } from './lichess';
import {
  calculateUpdatedElo,
  clearAccountLocalCaches,
  loadPlayedGames,
  mergeSyncedGames,
  recordGuestMatchResult,
  savePlayedGame,
} from './analytics';
import {
  loadLocalFriendsBackup,
  mergeFriendsBackupWithServer,
  mergeLocalAccountProgress,
  saveLocalFriendsBackup,
  type AccountProgressSyncPayload,
} from './onlineHelpers';
import {
  loadAccountFromFirestore,
  loadFriendsStateFromFirestore,
  loadPlayedGamesFromFirestore,
  savePlayedGameToFirestore,
  signOutFirebase,
  subscribeFirebaseAuthState,
  syncAccountToFirestore,
  syncFriendsStateToFirestore,
} from '../firebase';

export interface LichessSession {
  accessToken: string;
  hasOnlineToken?: boolean;
  account: LichessAccount;
}

const STORAGE_KEY = 'openchess_lichess_session';

export function loadLichessSession(): LichessSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LichessSession;
    if (parsed?.accessToken && parsed?.account?.username) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveLichessSession(session: LichessSession) {
  try {
    const prev = loadLichessSession();
    const prevName = prev?.account?.username?.trim().toLowerCase();
    const nextName = session?.account?.username?.trim().toLowerCase();
    if (prevName && nextName && prevName !== nextName) {
      clearAccountLocalCaches();
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore storage quota errors
  }
}

export function clearLichessSession() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    clearAccountLocalCaches();
  } catch {
    // ignore
  }
}

export function useLichessAuth() {
  const [session, setSession] = useState<LichessSession | null>(() => loadLichessSession());
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(0);
  const [authError, setAuthError] = useState<string | null>(null);
  const syncInFlightRef = useRef(false);

  const refreshAccount = useCallback(
    async (overrideToken?: string) => {
      const token = overrideToken ?? session?.accessToken;
      if (!token) return null;
      try {
        const res = await fetch('/api/lichess/account', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 401) {
          clearLichessSession();
          setSession(null);
          return null;
        }
        if (!res.ok) return null;
        const data = (await res.json()) as {
          account: LichessAccount;
          hasOnlineToken?: boolean;
          nowPlaying?: Array<{
            gameId: string;
            fullId?: string;
            color?: string;
            opponent?: { username?: string; rating?: number };
          }>;
        };
        if (data?.account?.username) {
          const next: LichessSession = {
            accessToken: token,
            hasOnlineToken: Boolean(data.hasOnlineToken),
            account: data.account,
          };
          saveLichessSession(next);
          setSession(next);
          setLastSyncedAt(Date.now());
        }
        return data;
      } catch {
        return null;
      }
    },
    [session?.accessToken],
  );

  const buildLocalProgressPayload = useCallback(
    (
      acct?: LichessAccount | null,
      fsSnap?: Awaited<ReturnType<typeof loadAccountFromFirestore>>,
    ): AccountProgressSyncPayload | undefined => {
      const basePerfs = acct?.perfs ?? {};
      const baseCount = acct?.count;
      const baseProfile = acct?.profile;
      const fsMatchesUser =
        Boolean(fsSnap) &&
        (!acct?.username || fsSnap!.username.toLowerCase() === acct.username.toLowerCase());
      const merged = mergeLocalAccountProgress({
        server: {
          perfs: basePerfs,
          count: baseCount,
          profile: baseProfile,
          leaguePoints: acct?.leaguePoints,
          ratingHistory: acct?.ratingHistory,
          localProgressInitialized: Boolean(
            (baseCount?.all ?? 0) > 0 ||
              (basePerfs.rapid?.games ?? 0) > 0 ||
              (basePerfs.blitz?.games ?? 0) > 0 ||
              (basePerfs.bullet?.games ?? 0) > 0 ||
              (acct?.leaguePoints ?? 0) > 0,
          ),
        },
        local: fsMatchesUser && fsSnap
          ? {
              perfs: {
                rapid: { rating: fsSnap.rapidRating, games: basePerfs.rapid?.games ?? 0 },
                blitz: { rating: fsSnap.blitzRating, games: basePerfs.blitz?.games ?? 0 },
                bullet: { rating: fsSnap.bulletRating, games: basePerfs.bullet?.games ?? 0 },
                puzzle: { rating: fsSnap.puzzleRating, games: basePerfs.puzzle?.games ?? 0 },
              },
              profile: {
                country: fsSnap.country,
                flag: fsSnap.country,
                bio: fsSnap.bio,
              },
              leaguePoints: fsSnap.leaguePoints,
            }
          : null,
      });
      return {
        perfs: merged.perfs,
        count: merged.count,
        profile: merged.profile,
        leaguePoints: merged.leaguePoints,
        ratingHistory: merged.ratingHistory,
      };
    },
    [],
  );

  // Sync live stats quietly in the background on launch, auth hydration, window focus, tab visibility, and every 30s
  useEffect(() => {
    const token = session?.accessToken;
    if (!token) return;
    const runQuietSync = () => {
      if (syncInFlightRef.current) return;
      syncInFlightRef.current = true;
      setSyncing(true);
      const latestSess = loadLichessSession() ?? session;
      const uname = latestSess?.account?.username;

      void (async () => {
        try {
          const baseBackup = loadLocalFriendsBackup(uname);
          const baseGames = loadPlayedGames();
          const [fsAccount, fsFriends, fsGames] = await Promise.all([
            loadAccountFromFirestore().catch(() => null),
            loadFriendsStateFromFirestore().catch(() => null),
            loadPlayedGamesFromFirestore().catch(() => []),
          ]);
          const combinedBackup = fsFriends
            ? mergeFriendsBackupWithServer({
                serverFriends: fsFriends.friends,
                serverOutgoing: fsFriends.outgoingRequests,
                serverRemoved: fsFriends.removedFriends,
                localBackup: baseBackup,
              })
            : baseBackup;
          if (fsFriends) {
            saveLocalFriendsBackup(
              uname,
              combinedBackup.friends,
              combinedBackup.outgoingRequests,
              combinedBackup.removedFriends,
            );
          }
          const combinedGames = mergeSyncedGames(baseGames, fsGames);
          for (const g of [...combinedGames].reverse()) {
            savePlayedGame(g);
          }
          const localAccountProgress = buildLocalProgressPayload(latestSess?.account, fsAccount);

          const r = await fetch('/api/account/sync', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              localFriends: combinedBackup.friends,
              localOutgoingRequests: combinedBackup.outgoingRequests,
              localRemovedFriends: combinedBackup.removedFriends,
              localPlayedGames: combinedGames.slice(0, 40),
              localAccountProgress,
            }),
          });
          const data = r.ok
            ? ((await r.json()) as {
                account?: LichessAccount;
                hasOnlineToken?: boolean;
                syncedAt?: number;
                friends?: string[];
                outgoingRequests?: string[];
                removedFriends?: string[];
                playedGames?: LichessUserGame[];
              })
            : null;
          if (data?.account?.username) {
            const next: LichessSession = {
              accessToken: token,
              hasOnlineToken: Boolean(data.hasOnlineToken ?? session.hasOnlineToken),
              account: data.account,
            };
            saveLichessSession(next);
            setSession(next);
            setLastSyncedAt(data.syncedAt ?? Date.now());
            void syncAccountToFirestore(data.account).catch(() => {});
            const mergedAfter = mergeFriendsBackupWithServer({
              serverFriends: Array.isArray(data.friends) ? data.friends : [],
              serverOutgoing: Array.isArray(data.outgoingRequests) ? data.outgoingRequests : [],
              serverRemoved: Array.isArray(data.removedFriends) ? data.removedFriends : [],
              localBackup: combinedBackup,
            });
            saveLocalFriendsBackup(
              data.account.username,
              mergedAfter.friends,
              mergedAfter.outgoingRequests,
              mergedAfter.removedFriends,
            );
            void syncFriendsStateToFirestore(mergedAfter).catch(() => {});
            if (Array.isArray(data.playedGames)) {
              for (const g of [...data.playedGames].reverse()) {
                savePlayedGame(g);
              }
            }
          } else {
            await refreshAccount(token);
          }
        } catch {
          await refreshAccount(token);
        } finally {
          syncInFlightRef.current = false;
          setSyncing(false);
        }
      })();
    };

    runQuietSync();
    const unsubAuth = subscribeFirebaseAuthState((signedIn) => {
      if (signedIn) runQuietSync();
    });
    const onFocus = () => runQuietSync();
    const onVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        runQuietSync();
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    const id = window.setInterval(runQuietSync, 30_000);
    return () => {
      unsubAuth();
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const signIn = useCallback(
    async (params: { username: string; email?: string; password: string; onlineToken?: string }) => {
      setConnecting(true);
      setAuthError(null);
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = (await res.json()) as { session?: LichessSession; error?: string };
        if (!res.ok || !data.session?.accessToken || !data.session?.account?.username) {
          throw new Error(data.error || 'Unable to sign in to OpenChess.');
        }
        saveLichessSession(data.session);
        setSession(data.session);
        setLastSyncedAt(Date.now());
        setAuthError(null);
        return data.session;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to sign in.';
        setAuthError(msg);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const signUp = useCallback(
    async (params: {
      username: string;
      email: string;
      password: string;
      verificationCode?: string;
      googleIdToken?: string;
      startingRating?: number;
      country?: string;
    }) => {
      setConnecting(true);
      setAuthError(null);
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = (await res.json()) as { session?: LichessSession; error?: string };
        if (!res.ok || !data.session?.accessToken || !data.session?.account?.username) {
          throw new Error(data.error || 'Unable to create OpenChess account.');
        }
        saveLichessSession(data.session);
        setSession(data.session);
        setLastSyncedAt(Date.now());
        setAuthError(null);
        void syncAccountToFirestore(data.session.account).catch(() => {});
        return data.session;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to create account.';
        setAuthError(msg);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const signInWithGoogle = useCallback(
    async (params: {
      idToken: string;
      username?: string;
      password?: string;
      startingRating?: number;
      country?: string;
    }) => {
      setConnecting(true);
      setAuthError(null);
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = (await res.json()) as { session?: LichessSession; error?: string };
        if (!res.ok || !data.session?.accessToken || !data.session?.account?.username) {
          throw new Error(data.error || 'Unable to sign in with Google.');
        }
        saveLichessSession(data.session);
        setSession(data.session);
        setLastSyncedAt(Date.now());
        setAuthError(null);
        void syncAccountToFirestore(data.session.account).catch(() => {});
        return data.session;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
        setAuthError(msg);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const requestEmailCode = useCallback(
    async (params: { username: string; email: string; purpose?: 'register' | 'login' }) => {
      setConnecting(true);
      setAuthError(null);
      try {
        const res = await fetch('/api/auth/email-request', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = (await res.json()) as {
          ok?: boolean;
          deliveryMode?: 'email' | 'google-oauth-required';
          maskedEmail?: string;
          error?: string;
        };
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Unable to send verification code.');
        }
        return {
          deliveryMode: data.deliveryMode ?? 'google-oauth-required',
          maskedEmail: data.maskedEmail ?? params.email,
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Email verification failed.';
        setAuthError(msg);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const verifyEmailCode = useCallback(
    async (params: { username: string; email: string; code: string; onlineToken?: string }) => {
      setConnecting(true);
      setAuthError(null);
      try {
        const res = await fetch('/api/auth/email-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = (await res.json()) as { session?: LichessSession; error?: string };
        if (!res.ok || !data.session?.accessToken || !data.session?.account?.username) {
          throw new Error(data.error || 'Verification failed.');
        }
        saveLichessSession(data.session);
        setSession(data.session);
        setLastSyncedAt(Date.now());
        setAuthError(null);
        return data.session;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Verification failed.';
        setAuthError(msg);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const signInWithToken = useCallback(
    async (params: { token: string; email?: string; password?: string }) => {
      setConnecting(true);
      setAuthError(null);
      try {
        const res = await fetch('/api/auth/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params),
        });
        const data = (await res.json()) as { session?: LichessSession; error?: string };
        if (!res.ok || !data.session?.accessToken || !data.session?.account?.username) {
          throw new Error(data.error || 'Unable to verify your personal access key.');
        }
        saveLichessSession(data.session);
        setSession(data.session);
        setLastSyncedAt(Date.now());
        setAuthError(null);
        return data.session;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to connect account key.';
        setAuthError(msg);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [],
  );

  const signInWithLichessOAuth = useCallback(
    async (preloadedUrl?: string, linkToUsername?: string): Promise<LichessSession> => {
      setConnecting(true);
      setAuthError(null);
      let url = preloadedUrl;
      try {
        if (!url) {
          const origin = typeof window !== 'undefined' ? window.location.origin : '';
          const linkQuery = linkToUsername ? `&linkTo=${encodeURIComponent(linkToUsername)}` : '';
          const res = await fetch(
            `/api/auth/lichess/url?origin=${encodeURIComponent(origin)}${linkQuery}`,
          );
          if (!res.ok) {
            throw new Error('Unable to start online account sign-in.');
          }
          const data = (await res.json()) as { url?: string };
          if (!data.url) {
            throw new Error('Login authorization URL was unavailable.');
          }
          url = data.url;
        }

        const popup = window.open(url, 'oauth_popup', 'width=600,height=720');
        if (!popup) {
          throw new Error('Please allow popups for this site to sign in to your account.');
        }

        return await new Promise<LichessSession>((resolve, reject) => {
          let settled = false;
          const cleanup = () => {
            window.removeEventListener('message', onMessage);
            window.clearInterval(closedPoll);
            window.clearTimeout(timeoutId);
          };

          const finishError = (msg: string) => {
            if (settled) return;
            settled = true;
            cleanup();
            setAuthError(msg);
            reject(new Error(msg));
          };

          const onMessage = async (event: MessageEvent) => {
            const origin = event.origin || '';
            const isAllowedOrigin =
              origin === window.location.origin ||
              origin.endsWith('.bonto.page') ||
              origin.endsWith('.trycloudflare.com') ||
              origin.endsWith('.run.app') ||
              origin.includes('localhost') ||
              origin.includes('127.0.0.1');
            if (!isAllowedOrigin) return;

            const payload = event.data as
              | {
                  type?: string;
                  accessToken?: string;
                  session?: LichessSession | null;
                }
              | undefined;
            if (!payload || payload.type !== 'LICHESS_OAUTH_SUCCESS') return;

            if (settled) return;
            settled = true;
            cleanup();

            try {
              if (payload.session?.accessToken && payload.session?.account?.username) {
                saveLichessSession(payload.session);
                setSession(payload.session);
                setLastSyncedAt(Date.now());
                setAuthError(null);
                resolve(payload.session);
                return;
              }
              if (payload.accessToken) {
                const exchanged = await signInWithToken({ token: payload.accessToken });
                resolve(exchanged);
                return;
              }
              throw new Error('Account authorization did not return a valid session.');
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Unable to complete sign-in.';
              setAuthError(msg);
              reject(err instanceof Error ? err : new Error(msg));
            }
          };

          const closedPoll = window.setInterval(() => {
            if (popup.closed && !settled) {
              finishError('Login popup was closed before finishing sign-in.');
            }
          }, 500);

          const timeoutId = window.setTimeout(() => {
            if (!settled) {
              finishError('Login timed out. Please try again.');
            }
          }, 180_000);

          window.addEventListener('message', onMessage);
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to sign in right now.';
        setAuthError(msg);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [signInWithToken],
  );

  const linkLichessOAuth = useCallback(async (): Promise<LichessSession> => {
    const linkTo = session?.account?.username;
    return signInWithLichessOAuth(undefined, linkTo);
  }, [session?.account?.username, signInWithLichessOAuth]);

  const linkOnlineToken = useCallback(
    async (token: string) => {
      if (!session?.accessToken) {
        throw new Error('Sign in first to link a personal access key.');
      }
      setConnecting(true);
      setAuthError(null);
      try {
        const res = await fetch('/api/account/link-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ token }),
        });
        const data = (await res.json()) as { session?: LichessSession; error?: string };
        if (!res.ok || !data.session?.accessToken || !data.session?.account?.username) {
          throw new Error(data.error || 'Invalid or expired personal access key.');
        }
        saveLichessSession(data.session);
        setSession(data.session);
        setLastSyncedAt(Date.now());
        setAuthError(null);
        return data.session;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unable to link personal access key.';
        setAuthError(msg);
        throw err;
      } finally {
        setConnecting(false);
      }
    },
    [session?.accessToken],
  );

  const applyAccountState = useCallback((account: LichessAccount) => {
    setSession((prev) => {
      if (!prev) return prev;
      const next: LichessSession = {
        ...prev,
        account,
      };
      saveLichessSession(next);
      return next;
    });
    setLastSyncedAt(Date.now());
  }, []);

  const updateProfile = useCallback(
    async (params: {
      username?: string;
      bio?: string;
      flag?: string;
      country?: string;
      avatarUrl?: string;
    }) => {
      if (!session?.accessToken) {
        throw new Error('Sign in first to update your profile.');
      }
      const res = await fetch('/api/account/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify(params),
      });
      const data = (await res.json()) as {
        account?: LichessAccount;
        accessToken?: string;
        error?: string;
      };
      if (!res.ok || !data.account) {
        throw new Error(data.error || 'Unable to update profile.');
      }
      if (data.accessToken) {
        const updatedAcct = data.account;
        const nextToken = data.accessToken;
        setSession((prev) => {
          if (!prev) return prev;
          const next: LichessSession = {
            ...prev,
            accessToken: nextToken,
            account: {
              ...prev.account,
              ...updatedAcct,
            },
          };
          saveLichessSession(next);
          return next;
        });
        setLastSyncedAt(Date.now());
      } else {
        applyAccountState(data.account);
      }
      void syncAccountToFirestore(data.account).catch(() => {});
      return data.account;
    },
    [applyAccountState, session?.accessToken],
  );

  const recordMatchResult = useCallback(
    async (params: {
      category: 'rapid' | 'blitz' | 'bullet' | 'puzzle';
      outcome: 'win' | 'loss' | 'draw';
      opponentRating?: number;
      gameId?: string;
    }) => {
      recordGuestMatchResult(params);
      if (!session?.accessToken) return null;

      // Optimistically update session.account.perfs so UI shows the new Elo immediately
      const oppRating = params.opponentRating ?? 1200;
      setSession((prev) => {
        if (!prev) return prev;
        const curPerfs = prev.account.perfs ?? {};
        const curCat = curPerfs[params.category] ?? { rating: 1200, games: 0 };
        const nextRating = calculateUpdatedElo(curCat.rating, oppRating, params.outcome);
        const curCount = prev.account.count ?? { all: 0, win: 0, loss: 0, draw: 0, rated: 0 };
        const nextAccount: LichessAccount = {
          ...prev.account,
          perfs: {
            ...curPerfs,
            [params.category]: {
              ...curCat,
              rating: nextRating,
              games: curCat.games + 1,
            },
          },
          count:
            params.category === 'puzzle'
              ? curCount
              : {
                  ...curCount,
                  all: curCount.all + 1,
                  rated: (curCount.rated ?? 0) + 1,
                  win: curCount.win + (params.outcome === 'win' ? 1 : 0),
                  loss: curCount.loss + (params.outcome === 'loss' ? 1 : 0),
                  draw: curCount.draw + (params.outcome === 'draw' ? 1 : 0),
                },
        };
        const nextSession: LichessSession = {
          ...prev,
          account: nextAccount,
        };
        saveLichessSession(nextSession);
        return nextSession;
      });

      try {
        const res = await fetch('/api/account/result', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify(params),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { account?: LichessAccount };
        if (data?.account?.username) {
          setSession((prev) => {
            if (!prev) return prev;
            const next: LichessSession = {
              ...prev,
              account: data.account!,
            };
            saveLichessSession(next);
            return next;
          });
          void syncAccountToFirestore(data.account).catch(() => {});
          return data.account;
        }
        return null;
      } catch {
        return null;
      }
    },
    [session?.accessToken],
  );

  const disconnect = useCallback(() => {
    clearLichessSession();
    void signOutFirebase();
    setSession(null);
    setLastSyncedAt(0);
    setAuthError(null);
  }, []);

  const syncNow = useCallback(async () => {
    if (!session?.accessToken) return null;
    if (syncInFlightRef.current) return null;
    syncInFlightRef.current = true;
    setSyncing(true);
    try {
      const latestSess = loadLichessSession() ?? session;
      const uname = latestSess.account?.username;
      const baseBackup = loadLocalFriendsBackup(uname);
      const baseGames = loadPlayedGames();
      const [fsAccount, fsFriends, fsGames] = await Promise.all([
        loadAccountFromFirestore().catch(() => null),
        loadFriendsStateFromFirestore().catch(() => null),
        loadPlayedGamesFromFirestore().catch(() => []),
      ]);
      const combinedBackup = fsFriends
        ? mergeFriendsBackupWithServer({
            serverFriends: fsFriends.friends,
            serverOutgoing: fsFriends.outgoingRequests,
            serverRemoved: fsFriends.removedFriends,
            localBackup: baseBackup,
          })
        : baseBackup;
      const combinedGames = mergeSyncedGames(baseGames, fsGames);
      for (const g of [...combinedGames].reverse()) {
        savePlayedGame(g);
      }
      const localAccountProgress = buildLocalProgressPayload(latestSess?.account, fsAccount);

      const res = await fetch('/api/account/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
        },
        body: JSON.stringify({
          localFriends: combinedBackup.friends,
          localOutgoingRequests: combinedBackup.outgoingRequests,
          localRemovedFriends: combinedBackup.removedFriends,
          localPlayedGames: combinedGames.slice(0, 40),
          localAccountProgress,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          account?: LichessAccount;
          hasOnlineToken?: boolean;
          syncedAt?: number;
          friends?: string[];
          outgoingRequests?: string[];
          removedFriends?: string[];
          playedGames?: LichessUserGame[];
        };
        if (data?.account?.username) {
          const next: LichessSession = {
            accessToken: session.accessToken,
            hasOnlineToken: Boolean(data.hasOnlineToken ?? session.hasOnlineToken),
            account: data.account,
          };
          saveLichessSession(next);
          setSession(next);
          setLastSyncedAt(data.syncedAt ?? Date.now());
          void syncAccountToFirestore(data.account).catch(() => {});
          const mergedAfter = mergeFriendsBackupWithServer({
            serverFriends: Array.isArray(data.friends) ? data.friends : [],
            serverOutgoing: Array.isArray(data.outgoingRequests) ? data.outgoingRequests : [],
            serverRemoved: Array.isArray(data.removedFriends) ? data.removedFriends : [],
            localBackup: combinedBackup,
          });
          saveLocalFriendsBackup(
            data.account.username,
            mergedAfter.friends,
            mergedAfter.outgoingRequests,
            mergedAfter.removedFriends,
          );
          void syncFriendsStateToFirestore(mergedAfter).catch(() => {});
          if (Array.isArray(data.playedGames)) {
            for (const g of [...data.playedGames].reverse()) {
              savePlayedGame(g);
            }
          }
          return data.account;
        }
      }
    } catch {
      // ignore network error
    } finally {
      syncInFlightRef.current = false;
      setSyncing(false);
    }
    const refreshed = await refreshAccount(session.accessToken);
    return refreshed?.account ?? null;
  }, [buildLocalProgressPayload, refreshAccount, session]);

  const saveAccountPlayedGame = useCallback(
    async (game: LichessUserGame) => {
      void savePlayedGameToFirestore(game).catch(() => {});
      if (!session?.accessToken) {
        setLastSyncedAt(Date.now());
        return null;
      }
      try {
        const res = await fetch('/api/account/games', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({ game }),
        });
        setLastSyncedAt(Date.now());
        if (!res.ok) return null;
        const data = (await res.json()) as {
          games?: LichessUserGame[];
          count?: LichessAccount['count'];
        };
        if (data?.count) {
          const next: LichessSession = {
            ...session,
            account: {
              ...session.account,
              count: data.count,
            },
          };
          saveLichessSession(next);
          setSession(next);
        }
        return data;
      } catch {
        setLastSyncedAt(Date.now());
        return null;
      }
    },
    [session],
  );

  const recordPuzzleProgress = useCallback(
    async (params: {
      rating?: number;
      solvedDelta?: number;
      stormScore?: number;
      streakScore?: number;
    }) => {
      if (!session?.accessToken) return null;
      try {
        const res = await fetch('/api/account/puzzle-progress', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify(params),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { account?: LichessAccount };
        if (data?.account?.username) {
          const next: LichessSession = {
            ...session,
            account: data.account,
          };
          saveLichessSession(next);
          setSession(next);
          void syncAccountToFirestore(data.account).catch(() => {});
          return data.account;
        }
        return null;
      } catch {
        return null;
      }
    },
    [session],
  );

  const submitRealPuzzleResult = useCallback(
    async (params: { puzzleId: string; win: boolean; angle?: string }) => {
      if (!session?.accessToken || !session.hasOnlineToken) return null;
      try {
        const cleanAngle = encodeURIComponent(params.angle || 'mix');
        const res = await fetch(`/api/lichess/puzzle/batch/${cleanAngle}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.accessToken}`,
          },
          body: JSON.stringify({
            solutions: [{ id: params.puzzleId, win: params.win }],
          }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { ok?: boolean; account?: LichessAccount | null };
        if (data?.account?.username) {
          const next: LichessSession = {
            ...session,
            account: data.account,
          };
          saveLichessSession(next);
          setSession(next);
          setLastSyncedAt(Date.now());
          return data.account;
        }
        return null;
      } catch {
        return null;
      }
    },
    [session],
  );

  return {
    session,
    connecting,
    syncing,
    lastSyncedAt,
    authError,
    clearError: () => setAuthError(null),
    signIn,
    signUp,
    signInWithGoogle,
    signInWithLichessOAuth,
    linkLichessOAuth,
    signInWithToken,
    linkOnlineToken,
    requestEmailCode,
    verifyEmailCode,
    disconnect,
    refreshAccount,
    syncNow,
    applyAccountState,
    updateProfile,
    recordMatchResult,
    saveAccountPlayedGame,
    recordPuzzleProgress,
    submitRealPuzzleResult,
  };
}
