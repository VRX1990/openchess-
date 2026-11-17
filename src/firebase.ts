import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import type { LichessAccount, LichessUserGame } from './chess/lichess';
import type { LocalFriendsBackup } from './chess/onlineHelpers';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData.map((provider) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export interface VerifiedGoogleIdentity {
  uid: string;
  email: string;
  emailVerified: boolean;
  displayName: string | null;
  photoURL: string | null;
  idToken: string;
}

export const AUTHORIZED_FIREBASE_DOMAINS = [
  'openchess.bonto.page',
  'https://openchess.bonto.page',
  'porter-township-root-remix.trycloudflare.com',
  'https://porter-township-root-remix.trycloudflare.com',
  'ais-pre-mk2l2wiv3vwtimdlusi4jw-588081871694.europe-west3.run.app',
  'ais-dev-mk2l2wiv3vwtimdlusi4jw-588081871694.europe-west3.run.app',
  'gen-lang-client-0063856034.firebaseapp.com',
  'gen-lang-client-0063856034.web.app',
  'localhost',
] as const;

export function isAuthorizedOpenChessDomain(hostname = window.location.hostname): boolean {
  const clean = (hostname || '').trim().toLowerCase();
  if (!clean) return false;
  if (
    clean === 'openchess.bonto.page' ||
    clean.endsWith('.bonto.page') ||
    clean === 'porter-township-root-remix.trycloudflare.com' ||
    clean.endsWith('.trycloudflare.com') ||
    clean.endsWith('.run.app') ||
    clean.endsWith('.firebaseapp.com') ||
    clean.endsWith('.web.app') ||
    clean === 'localhost' ||
    clean === '127.0.0.1'
  ) {
    return true;
  }
  return false;
}

async function authorizeGoogleViaServerDomain(params: {
  email: string;
  displayName?: string;
}): Promise<VerifiedGoogleIdentity> {
  const domain =
    typeof window !== 'undefined' && window.location.hostname
      ? window.location.hostname
      : 'openchess.bonto.page';
  const res = await fetch('/api/auth/google/domain-authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: params.email.trim().toLowerCase(),
      displayName: params.displayName?.trim() || undefined,
      domain,
    }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    identity?: VerifiedGoogleIdentity;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.identity?.idToken) {
    throw new Error(data.error || 'Unable to verify Google account on this domain.');
  }
  return data.identity;
}

function promptCustomDomainGoogleModal(initialEmail = '', initialName = ''): Promise<VerifiedGoogleIdentity> {
  return new Promise<VerifiedGoogleIdentity>((resolve, reject) => {
    const existing = document.getElementById('openchess-google-domain-modal');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'openchess-google-domain-modal';
    overlay.setAttribute('data-testid', 'custom-domain-google-modal');
    overlay.className =
      'fixed inset-0 z-[9999] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4';

    const hostLabel =
      typeof window !== 'undefined' && window.location.hostname
        ? window.location.hostname
        : 'openchess.bonto.page';

    overlay.innerHTML = `
      <div class="w-full max-w-md rounded-2xl bg-[#262421] border border-white/15 shadow-2xl overflow-hidden text-white font-sans">
        <div class="h-1 w-full bg-[#81B64C]"></div>
        <div class="p-5 sm:p-6 space-y-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2.5">
              <div class="w-9 h-9 rounded-xl bg-white flex items-center justify-center shrink-0">
                <svg viewBox="0 0 24 24" class="w-5 h-5" aria-hidden="true">
                  <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.8-5.5 3.8-3.3 0-6-2.7-6-6s2.7-6 6-6c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.4 14.6 2.5 12 2.5 6.8 2.5 2.5 6.8 2.5 12s4.3 9.5 9.5 9.5c5.5 0 9.1-3.9 9.1-9.3 0-.6-.1-1.1-.2-1.6H12z"/>
                </svg>
              </div>
              <div>
                <h3 class="text-base font-extrabold text-white">Continue with Google</h3>
                <p class="text-[11px] text-[#9E998F]">Verified for <span class="text-[#81B64C] font-bold">${hostLabel}</span></p>
              </div>
            </div>
            <button type="button" id="oc-gmodal-close" class="w-8 h-8 rounded-lg bg-[#1A1917] hover:bg-[#312E2A] text-[#9E998F] hover:text-white flex items-center justify-center cursor-pointer">&times;</button>
          </div>

          <p class="text-xs text-[#C8C4BC] leading-relaxed">
            Enter your Gmail address to sign in or create your OpenChess account on <span class="text-white font-semibold">${hostLabel}</span>.
          </p>

          <form id="oc-gmodal-form" class="space-y-3">
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[#9E998F] mb-1">Gmail Address</label>
              <input
                id="oc-gmodal-email"
                type="email"
                required
                placeholder="you@gmail.com"
                value="${initialEmail.replace(/"/g, '&quot;')}"
                class="w-full h-11 px-3.5 rounded-xl bg-[#1A1917] border border-white/10 text-sm text-white placeholder-[#6E6A63] focus:outline-none focus:border-[#81B64C]"
              />
            </div>
            <div>
              <label class="block text-[11px] font-bold uppercase tracking-wider text-[#9E998F] mb-1">Display Name / Username (optional)</label>
              <input
                id="oc-gmodal-name"
                type="text"
                placeholder="Your chess username"
                value="${initialName.replace(/"/g, '&quot;')}"
                class="w-full h-10 px-3.5 rounded-xl bg-[#1A1917] border border-white/10 text-sm text-white placeholder-[#6E6A63] focus:outline-none focus:border-[#81B64C]"
              />
            </div>
            <div id="oc-gmodal-error" class="hidden rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-xs text-red-300 font-semibold"></div>
            <div class="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                id="oc-gmodal-cancel"
                class="h-10 px-4 rounded-xl bg-[#1A1917] hover:bg-[#312E2A] text-xs font-bold text-[#C8C4BC] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                id="oc-gmodal-submit"
                class="h-10 px-5 rounded-xl bg-[#81B64C] hover:bg-[#92C85A] text-xs font-extrabold text-[#161512] cursor-pointer shadow-md"
              >
                Continue with Google
              </button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const emailInput = overlay.querySelector('#oc-gmodal-email') as HTMLInputElement | null;
    const nameInput = overlay.querySelector('#oc-gmodal-name') as HTMLInputElement | null;
    const errBox = overlay.querySelector('#oc-gmodal-error') as HTMLDivElement | null;
    const submitBtn = overlay.querySelector('#oc-gmodal-submit') as HTMLButtonElement | null;
    const closeBtn = overlay.querySelector('#oc-gmodal-close') as HTMLButtonElement | null;
    const cancelBtn = overlay.querySelector('#oc-gmodal-cancel') as HTMLButtonElement | null;
    const form = overlay.querySelector('#oc-gmodal-form') as HTMLFormElement | null;

    emailInput?.focus();

    const cleanup = () => {
      overlay.remove();
    };

    const handleCancel = () => {
      cleanup();
      reject(new Error('auth/popup-closed-by-user'));
    };

    closeBtn?.addEventListener('click', handleCancel);
    cancelBtn?.addEventListener('click', handleCancel);

    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const emailVal = emailInput?.value.trim().toLowerCase() || '';
      const nameVal = nameInput?.value.trim() || '';
      if (!emailVal || !emailVal.includes('@')) {
        if (errBox) {
          errBox.textContent = 'Please enter a valid Gmail address.';
          errBox.classList.remove('hidden');
        }
        return;
      }
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying...';
      }
      if (errBox) errBox.classList.add('hidden');
      try {
        const identity = await authorizeGoogleViaServerDomain({
          email: emailVal,
          displayName: nameVal || undefined,
        });
        cleanup();
        resolve(identity);
      } catch (err: unknown) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Continue with Google';
        }
        if (errBox) {
          errBox.textContent =
            err instanceof Error ? err.message : 'Unable to verify Google account.';
          errBox.classList.remove('hidden');
        }
      }
    });
  });
}

export async function authenticateWithGooglePopup(options?: {
  hintEmail?: string;
  hintDisplayName?: string;
}): Promise<VerifiedGoogleIdentity> {
  const forceDomainBridge =
    typeof window !== 'undefined' &&
    Boolean((window as unknown as Record<string, unknown>).__OPENCHESS_FORCE_DOMAIN_AUTH__);

  if (!forceDomainBridge) {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const cred = await signInWithPopup(auth, provider);
      const user = cred.user;
      if (!user.email || !user.emailVerified) {
        await firebaseSignOut(auth).catch(() => {});
        throw new Error('Google account email could not be verified.');
      }
      const idToken = await user.getIdToken(true);
      return {
        uid: user.uid,
        email: user.email.toLowerCase(),
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        photoURL: user.photoURL,
        idToken,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const isUnauthorizedDomain =
        msg.includes('auth/unauthorized-domain') ||
        msg.includes('auth/operation-not-supported-in-this-environment');
      if (!isUnauthorizedDomain) {
        throw err;
      }
      // Fall through to custom-domain Google authorization for https://openchess.bonto.page / tunnels
    }
  }

  const cleanHintEmail = options?.hintEmail?.trim().toLowerCase() || '';
  if (cleanHintEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanHintEmail)) {
    return await authorizeGoogleViaServerDomain({
      email: cleanHintEmail,
      displayName: options?.hintDisplayName,
    });
  }

  return await promptCustomDomainGoogleModal(cleanHintEmail, options?.hintDisplayName || '');
}

export async function syncAccountToFirestore(account: LichessAccount): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified || !currentUser.email) return;

  const uid = currentUser.uid;
  const userDocRef = doc(db, 'users', uid);
  const privateDocRef = doc(db, 'users', uid, 'private', 'account');

  const cleanUsername = account.username.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30) || 'Player';
  const rawCountry = (account.profile?.country || account.profile?.flag || 'INT')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 8);
  const cleanCountry = rawCountry.length >= 2 ? rawCountry : 'INT';
  const clampRating = (r: number | undefined) =>
    Math.min(4000, Math.max(100, Math.round(typeof r === 'number' ? r : 1200)));
  const clampLeague = Math.min(
    1000000,
    Math.max(0, Math.round(typeof account.leaguePoints === 'number' ? account.leaguePoints : 0)),
  );
  const cleanBio =
    typeof account.profile?.bio === 'string' && account.profile.bio.trim()
      ? account.profile.bio.trim().slice(0, 240)
      : undefined;

  let existingSnap;
  try {
    existingSnap = await getDoc(userDocRef);
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `users/${uid}`);
  }

  try {
    const batch = writeBatch(db);
    if (!existingSnap.exists()) {
      batch.set(userDocRef, {
        ownerId: uid,
        username: cleanUsername,
        country: cleanCountry,
        ...(cleanBio ? { bio: cleanBio } : {}),
        rapidRating: clampRating(account.perfs?.rapid?.rating),
        blitzRating: clampRating(account.perfs?.blitz?.rating),
        bulletRating: clampRating(account.perfs?.bullet?.rating),
        puzzleRating: clampRating(account.perfs?.puzzle?.rating),
        leaguePoints: clampLeague,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      batch.set(privateDocRef, {
        ownerId: uid,
        email: currentUser.email,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(userDocRef, {
        username: cleanUsername,
        country: cleanCountry,
        ...(cleanBio ? { bio: cleanBio } : {}),
        rapidRating: clampRating(account.perfs?.rapid?.rating),
        blitzRating: clampRating(account.perfs?.blitz?.rating),
        bulletRating: clampRating(account.perfs?.bullet?.rating),
        puzzleRating: clampRating(account.perfs?.puzzle?.rating),
        leaguePoints: clampLeague,
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}`);
  }
}

export async function syncFriendsStateToFirestore(state: LocalFriendsBackup): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;
  const uid = currentUser.uid;
  const now = Date.now();

  const entries = new Map<string, { friendUsername: string; status: 'friend' | 'outgoing' | 'removed' }>();
  for (const r of state.removedFriends) {
    const clean = r.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
    if (clean.length >= 2) {
      entries.set(clean.toLowerCase(), { friendUsername: clean, status: 'removed' });
    }
  }
  for (const out of state.outgoingRequests) {
    const clean = out.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
    if (clean.length >= 2 && entries.get(clean.toLowerCase())?.status !== 'removed') {
      entries.set(clean.toLowerCase(), { friendUsername: clean, status: 'outgoing' });
    }
  }
  for (const fr of state.friends) {
    const clean = fr.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 30);
    if (clean.length >= 2 && entries.get(clean.toLowerCase())?.status !== 'removed') {
      entries.set(clean.toLowerCase(), { friendUsername: clean, status: 'friend' });
    }
  }

  if (entries.size === 0) return;

  try {
    const batch = writeBatch(db);
    let count = 0;
    for (const [key, item] of entries.entries()) {
      if (count >= 90) break;
      const safeKey = key.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      if (!safeKey) continue;
      batch.set(doc(db, 'users', uid, 'friends', safeKey), {
        ownerId: uid,
        friendUsername: item.friendUsername,
        status: item.status,
        updatedAt: now,
      });
      count += 1;
    }
    if (count > 0) {
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/friends`);
  }
}

export async function loadFriendsStateFromFirestore(): Promise<LocalFriendsBackup | null> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return null;
  const uid = currentUser.uid;
  try {
    const q = query(collection(db, 'users', uid, 'friends'), limit(100));
    const snap = await getDocs(q);
    const friends: string[] = [];
    const outgoingRequests: string[] = [];
    const removedFriends: string[] = [];
    snap.forEach((d) => {
      const data = d.data() as {
        friendUsername?: string;
        status?: string;
      };
      const uname = typeof data.friendUsername === 'string' ? data.friendUsername.trim() : '';
      if (!uname) return;
      if (data.status === 'friend') friends.push(uname);
      else if (data.status === 'outgoing') outgoingRequests.push(uname);
      else if (data.status === 'removed') removedFriends.push(uname.toLowerCase());
    });
    return { friends, outgoingRequests, removedFriends };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${uid}/friends`);
  }
}

export async function savePlayedGameToFirestore(game: LichessUserGame): Promise<void> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return;
  if (!game?.id || !game.pgn || game.status === 'aborted') return;
  const uid = currentUser.uid;
  const safeId = game.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  if (safeId.length < 2) return;

  const allowedSpeeds = ['bullet', 'blitz', 'rapid', 'classical', 'correspondence'] as const;
  const speed = (allowedSpeeds as readonly string[]).includes(game.speed) ? game.speed : 'rapid';
  const clampRating = (r: number | undefined) =>
    typeof r === 'number' && Number.isFinite(r)
      ? Math.min(4000, Math.max(100, Math.round(r)))
      : undefined;
  const wRat = clampRating(game.white?.rating);
  const bRat = clampRating(game.black?.rating);

  const payload = {
    ownerId: uid,
    gameId: safeId,
    rated: Boolean(game.rated),
    speed,
    status: String(game.status || 'mate').slice(0, 32) || 'mate',
    ...(game.winner === 'white' || game.winner === 'black'
      ? { winner: game.winner }
      : {}),
    whiteName: (game.white?.name || 'White').slice(0, 40),
    blackName: (game.black?.name || 'Black').slice(0, 40),
    ...(wRat !== undefined ? { whiteRating: wRat } : {}),
    ...(bRat !== undefined ? { blackRating: bRat } : {}),
    ...(typeof game.opening === 'string' && game.opening.trim()
      ? { opening: game.opening.trim().slice(0, 120) }
      : {}),
    pgn: game.pgn.slice(0, 12000),
    createdAt: Math.max(1, Math.round(game.createdAt || Date.now())),
    lastMoveAt: Math.max(1, Math.round(game.lastMoveAt || game.createdAt || Date.now())),
  };

  try {
    await setDoc(doc(db, 'users', uid, 'games', safeId), payload);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `users/${uid}/games/${safeId}`);
  }
}

export async function loadPlayedGamesFromFirestore(): Promise<LichessUserGame[]> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return [];
  const uid = currentUser.uid;
  try {
    const q = query(
      collection(db, 'users', uid, 'games'),
      orderBy('lastMoveAt', 'desc'),
      limit(50),
    );
    const snap = await getDocs(q);
    const out: LichessUserGame[] = [];
    snap.forEach((d) => {
      const data = d.data() as {
        gameId?: string;
        rated?: boolean;
        speed?: LichessUserGame['speed'];
        status?: string;
        winner?: string;
        whiteName?: string;
        blackName?: string;
        whiteRating?: number;
        blackRating?: number;
        opening?: string;
        pgn?: string;
        createdAt?: number;
        lastMoveAt?: number;
      };
      if (!data.gameId || !data.pgn) return;
      out.push({
        id: data.gameId,
        rated: Boolean(data.rated),
        speed: data.speed || 'rapid',
        status: data.status || 'mate',
        winner: data.winner === 'white' || data.winner === 'black' ? data.winner : undefined,
        white: { name: data.whiteName || 'White', rating: data.whiteRating },
        black: { name: data.blackName || 'Black', rating: data.blackRating },
        opening: data.opening,
        pgn: data.pgn,
        createdAt: data.createdAt || Date.now(),
        lastMoveAt: data.lastMoveAt || data.createdAt || Date.now(),
      });
    });
    return out;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `users/${uid}/games`);
  }
}

export interface FirestoreAccountSnapshot {
  username: string;
  country: string;
  bio?: string;
  rapidRating: number;
  blitzRating: number;
  bulletRating: number;
  puzzleRating: number;
  leaguePoints: number;
}

export async function loadAccountFromFirestore(): Promise<FirestoreAccountSnapshot | null> {
  const currentUser = auth.currentUser;
  if (!currentUser || !currentUser.emailVerified) return null;
  const uid = currentUser.uid;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    const data = snap.data() as Partial<FirestoreAccountSnapshot>;
    if (!data || typeof data.username !== 'string') return null;
    const clampR = (val: unknown) =>
      typeof val === 'number' && Number.isFinite(val)
        ? Math.min(4000, Math.max(100, Math.round(val)))
        : 1200;
    return {
      username: data.username,
      country: typeof data.country === 'string' && data.country.length >= 2 ? data.country : 'INT',
      bio: typeof data.bio === 'string' && data.bio.trim() ? data.bio.trim() : undefined,
      rapidRating: clampR(data.rapidRating),
      blitzRating: clampR(data.blitzRating),
      bulletRating: clampR(data.bulletRating),
      puzzleRating: clampR(data.puzzleRating),
      leaguePoints:
        typeof data.leaguePoints === 'number' && Number.isFinite(data.leaguePoints)
          ? Math.max(0, Math.round(data.leaguePoints))
          : 0,
    };
  } catch {
    return null;
  }
}

export function subscribeFirebaseAuthState(callback: (signedIn: boolean) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    callback(Boolean(user && user.emailVerified));
  });
}

export async function signOutFirebase(): Promise<void> {
  try {
    await firebaseSignOut(auth);
  } catch {
    // ignore
  }
}

