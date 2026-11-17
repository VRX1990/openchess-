import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Link2,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Puzzle,
  RefreshCw,
  Rocket,
  User,
  UserPlus,
  Zap,
} from 'lucide-react';
import {
  COUNTRY_OPTIONS,
  STARTING_SKILL_TIERS,
  validateGoogleOrGmailEmail,
} from '../chess/onlineHelpers';
import { authenticateWithGooglePopup } from '../firebase';
import type { LichessSession } from '../chess/useLichessAuth';
import { PlayerAvatar } from './PlayerAvatar';

export interface AuthViewProps {
  lichessSession: LichessSession | null;
  loading: boolean;
  authError: string | null;
  onClearError: () => void;
  onSignIn: (params: {
    username: string;
    email?: string;
    password: string;
  }) => Promise<LichessSession>;
  onSignUp?: (params: {
    username: string;
    email: string;
    password: string;
    verificationCode?: string;
    googleIdToken?: string;
    startingRating?: number;
    country?: string;
  }) => Promise<LichessSession>;
  onSignInWithGoogle?: (params: {
    idToken: string;
    username?: string;
    password?: string;
    startingRating?: number;
    country?: string;
  }) => Promise<LichessSession>;
  onSignInWithLichess?: () => Promise<LichessSession>;
  onLinkLichess?: () => Promise<LichessSession>;
  onSignInWithToken?: (params: { token: string }) => Promise<LichessSession>;
  onLinkToken?: (token: string) => Promise<LichessSession>;
  onRequestEmailCode?: (params: {
    username: string;
    email: string;
    purpose?: 'register' | 'login';
  }) => Promise<{
    deliveryMode: 'email' | 'google-oauth-required';
    maskedEmail: string;
  }>;
  onVerifyEmailCode?: (params: {
    username: string;
    email: string;
    code: string;
  }) => Promise<LichessSession>;
  onSyncNow: () => Promise<unknown>;
  onDisconnect: () => void;
  onSuccess: () => void;
  onBack: () => void;
}

function GoogleLogoSvg() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

export function AuthView({
  lichessSession,
  loading,
  authError,
  onClearError,
  onSignIn,
  onSignUp,
  onSignInWithGoogle,
  onSignInWithLichess,
  onLinkLichess,
  onSignInWithToken,
  onLinkToken,
  onSyncNow,
  onDisconnect,
  onSuccess,
  onBack,
}: AuthViewProps) {
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');

  // Login state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [revealLoginPassword, setRevealLoginPassword] = useState(false);

  // Create Account state
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [revealRegPassword, setRevealRegPassword] = useState(false);
  const [regCountry, setRegCountry] = useState('INT');
  const [regStartingRating, setRegStartingRating] = useState<number>(800);
  const [verifiedGoogleToken, setVerifiedGoogleToken] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);

  // Lichess OAuth / PAT state
  const [showTokenInput, setShowTokenInput] = useState(false);
  const [personalTokenDraft, setPersonalTokenDraft] = useState('');
  const [lichessBusy, setLichessBusy] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const [localError, setLocalError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    document.body.dataset.state = 'auth';
  }, []);

  const switchTab = (tab: 'login' | 'register') => {
    setAuthTab(tab);
    setLocalError(null);
    onClearError();
  };

  const handleGoogleContinue = async (mode: 'login' | 'register') => {
    setLocalError(null);
    onClearError();
    setGoogleBusy(true);
    try {
      const hintEmail =
        mode === 'register'
          ? regEmail.trim()
          : loginIdentifier.includes('@')
            ? loginIdentifier.trim()
            : '';
      const hintDisplayName =
        mode === 'register'
          ? regUsername.trim()
          : !loginIdentifier.includes('@')
            ? loginIdentifier.trim()
            : '';
      const identity = await authenticateWithGooglePopup({
        hintEmail,
        hintDisplayName,
      });
      if (mode === 'register') {
        setRegEmail(identity.email);
        setVerifiedGoogleToken(identity.idToken);
        const suggestedUser =
          regUsername.trim() ||
          (identity.displayName || identity.email.split('@')[0] || '')
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .slice(0, 20);
        if (!regUsername.trim() && suggestedUser.length >= 3) {
          setRegUsername(suggestedUser);
        }
        // If username & password are already provided, complete registration immediately
        if (/^[a-zA-Z0-9_-]{3,24}$/.test(regUsername.trim()) && regPassword.length >= 6 && onSignUp) {
          await onSignUp({
            username: regUsername.trim(),
            email: identity.email,
            password: regPassword,
            googleIdToken: identity.idToken,
            startingRating: regStartingRating,
            country: regCountry,
          });
          onSuccess();
          return;
        }
        if (onSignInWithGoogle && !regPassword) {
          await onSignInWithGoogle({
            idToken: identity.idToken,
            username: suggestedUser,
            startingRating: regStartingRating,
            country: regCountry,
          });
          onSuccess();
          return;
        }
      } else if (onSignInWithGoogle) {
        await onSignInWithGoogle({
          idToken: identity.idToken,
        });
        onSuccess();
      }
    } catch (err: unknown) {
      const rawMsg = err instanceof Error ? err.message : 'Google sign-in was cancelled.';
      if (rawMsg.includes('auth/popup-closed-by-user')) {
        setLocalError('Google sign-in window was closed before completing.');
      } else if (rawMsg.includes('auth/popup-blocked')) {
        setLocalError('Please allow popups for this site to sign in with Google.');
      } else {
        setLocalError(rawMsg);
      }
    } finally {
      setGoogleBusy(false);
    }
  };

  const handleSignInSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    onClearError();

    const cleanId = loginIdentifier.trim();
    if (!cleanId || cleanId.length < 2) {
      setLocalError('Enter your username or email address.');
      return;
    }
    if (loginPassword.length < 4) {
      setLocalError('Password must be at least 4 characters.');
      return;
    }

    try {
      await onSignIn({
        username: cleanId,
        password: loginPassword,
      });
      onSuccess();
    } catch {
      // authError displays server message
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    onClearError();

    const cleanUser = regUsername.trim();
    if (!/^[a-zA-Z0-9_-]{3,24}$/.test(cleanUser)) {
      setLocalError('Username must be 3–24 characters (letters, numbers, _ or -).');
      return;
    }
    if (regPassword.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    const emailToUse = regEmail.trim().toLowerCase();
    const emailCheck = validateGoogleOrGmailEmail(emailToUse);
    if (!emailCheck.valid) {
      setLocalError(emailCheck.error || 'Enter a valid email address.');
      return;
    }

    if (!onSignUp) return;

    try {
      await onSignUp({
        username: cleanUser,
        email: emailCheck.normalizedEmail,
        password: regPassword,
        googleIdToken: verifiedGoogleToken || undefined,
        startingRating: regStartingRating,
        country: regCountry,
      });
      onSuccess();
    } catch {
      // authError displays server validation message
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncNotice(null);
    try {
      await onSyncNow();
      setSyncNotice('Account ratings, puzzles, and recent games synced.');
    } finally {
      setSyncing(false);
    }
  };

  const handleLichessConnect = async () => {
    setLocalError(null);
    setSyncNotice(null);
    onClearError();
    setLichessBusy(true);
    try {
      if (lichessSession && onLinkLichess) {
        await onLinkLichess();
        setSyncNotice('Synced with your Lichess account (ratings, puzzles, and games).');
      } else if (onSignInWithLichess) {
        await onSignInWithLichess();
        onSuccess();
      }
    } catch {
      // authError displays upstream/popup message
    } finally {
      setLichessBusy(false);
    }
  };

  const handleSubmitPersonalToken = async () => {
    const clean = personalTokenDraft.trim();
    if (clean.length < 8) {
      setLocalError('Enter a valid Lichess personal access token.');
      return;
    }
    setLocalError(null);
    setSyncNotice(null);
    onClearError();
    setLichessBusy(true);
    try {
      if (lichessSession && onLinkToken) {
        await onLinkToken(clean);
        setPersonalTokenDraft('');
        setShowTokenInput(false);
        setSyncNotice('Linked & synced with your Lichess account!');
      } else if (onSignInWithToken) {
        await onSignInWithToken({ token: clean });
        setPersonalTokenDraft('');
        setShowTokenInput(false);
        onSuccess();
      }
    } catch {
      // authError displays message
    } finally {
      setLichessBusy(false);
    }
  };

  const shownError = localError || authError;
  const activeUser = lichessSession?.account;
  const isBusy = loading || googleBusy || lichessBusy;

  return (
    <div className="max-w-md mx-auto pt-4 pb-16 space-y-5">
      {/* Top Bar */}
      <div className="flex items-center justify-between px-1">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to OpenChess"
          className="w-10 h-10 rounded-xl bg-[#262421] hover:bg-[#312E2A] border border-white/10 flex items-center justify-center text-[#C8C4BC] hover:text-white cursor-pointer transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2">
          <svg viewBox="0 0 28 28" className="w-7 h-7 shrink-0" aria-hidden="true">
            <rect width="28" height="28" rx="6" fill="#81B64C" />
            <rect x="0" y="24" width="28" height="4" rx="2" fill="#457524" opacity="0.55" />
            <circle cx="14" cy="8.5" r="3.2" fill="#FFFFFF" />
            <path
              d="M11 12.2c.8-.5 5.2-.5 6 0l-1.1 5.2c1.4 1 2.4 2.3 2.6 3.9H9.5c.2-1.6 1.2-2.9 2.6-3.9L11 12.2z"
              fill="#FFFFFF"
            />
            <rect x="8" y="21.8" width="12" height="2.2" rx="1.1" fill="#FFFFFF" />
          </svg>
          <span className="text-lg font-extrabold font-display text-white">OpenChess</span>
        </div>

        <div className="w-10" />
      </div>

      {!lichessSession ? (
        <section className="rounded-2xl bg-[#262421] border border-white/10 overflow-hidden shadow-2xl">
          <div className="h-1 w-full bg-[#81B64C]" />
          <div className="p-5 sm:p-6 space-y-4">
            {/* Segmented Switcher */}
            <div
              role="tablist"
              aria-label="Account authentication mode"
              className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#1A1917] border border-white/5"
            >
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'login'}
                onClick={() => switchTab('login')}
                className={`min-h-[40px] rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  authTab === 'login'
                    ? 'bg-[#383530] text-white shadow-sm'
                    : 'text-[#9E998F] hover:text-white'
                }`}
              >
                <LogIn className="w-3.5 h-3.5 text-[#81B64C]" />
                <span>Log In</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={authTab === 'register'}
                onClick={() => switchTab('register')}
                className={`min-h-[40px] rounded-lg text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                  authTab === 'register'
                    ? 'bg-[#383530] text-white shadow-sm'
                    : 'text-[#9E998F] hover:text-white'
                }`}
              >
                <UserPlus className="w-3.5 h-3.5 text-[#81B64C]" />
                <span>Create Account</span>
              </button>
            </div>

            {authTab === 'login' ? (
              <form onSubmit={(e) => void handleSignInSubmit(e)} className="space-y-3.5">
                <div className="text-center space-y-1">
                  <h1 className="text-xl font-extrabold text-white font-display">
                    Welcome Back
                  </h1>
                  <p className="text-xs text-[#9E998F]">
                    Enter your chess username or email to sign in and automatically sync your ratings, profile, and recent games.
                  </p>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => void handleGoogleContinue('login')}
                    className="w-full min-h-[46px] rounded-xl bg-white hover:bg-[#F2F2F2] text-[#1F1F1F] font-extrabold text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <GoogleLogoSvg />
                    <span>{googleBusy ? 'Connecting to Google...' : 'Continue with Google'}</span>
                  </button>

                  {onSignInWithLichess && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleLichessConnect()}
                      className="w-full min-h-[44px] rounded-xl bg-[#302E2B] hover:bg-[#3A3733] border border-white/15 text-white font-extrabold text-xs sm:text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Globe className="w-4 h-4 text-[#81B64C]" />
                      <span>{lichessBusy ? 'Connecting Lichess...' : 'Continue with Lichess'}</span>
                    </button>
                  )}

                  {onSignInWithToken && (
                    <div className="pt-0.5">
                      <button
                        type="button"
                        onClick={() => setShowTokenInput((v) => !v)}
                        className="text-[11px] font-bold text-[#9E998F] hover:text-white flex items-center gap-1 mx-auto cursor-pointer"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>{showTokenInput ? 'Hide Lichess access token' : 'Or use Lichess personal access token'}</span>
                      </button>
                      {showTokenInput && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="password"
                            value={personalTokenDraft}
                            onChange={(e) => setPersonalTokenDraft(e.target.value)}
                            placeholder="lip_..."
                            className="flex-1 min-h-[38px] rounded-lg bg-[#1A1917] border border-white/10 px-3 text-xs text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
                          />
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleSubmitPersonalToken()}
                            className="px-3 rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-xs font-extrabold text-white cursor-pointer disabled:opacity-50"
                          >
                            Connect
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3 py-0.5">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A756C]">
                    or with password
                  </span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="auth-username" className="block text-xs font-bold text-[#C8C4BC]">
                    Username or Email
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-[#8E8980] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-username"
                      type="text"
                      autoComplete="username"
                      value={loginIdentifier}
                      onChange={(e) => setLoginIdentifier(e.target.value)}
                      placeholder="Username or email"
                      className="w-full min-h-[44px] rounded-xl bg-[#1A1917] border border-white/10 pl-9 pr-3 text-sm text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="auth-password" className="block text-xs font-bold text-[#C8C4BC]">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#8E8980] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="auth-password"
                      type={revealLoginPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="Password"
                      className="w-full min-h-[44px] rounded-xl bg-[#1A1917] border border-white/10 pl-9 pr-10 text-sm text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
                    />
                    <button
                      type="button"
                      onClick={() => setRevealLoginPassword((v) => !v)}
                      aria-label={revealLoginPassword ? 'Hide password' : 'Show password'}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9E998F] hover:text-white absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                    >
                      {revealLoginPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {shownError && (
                  <div
                    role="alert"
                    className="p-2.5 rounded-xl bg-[#5C2320]/60 border border-[#E06C5A]/40 text-xs font-semibold text-[#F7C7C1]"
                  >
                    {shownError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isBusy}
                  className="w-full min-h-[48px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-4 border-[#457524] active:border-b-0 active:translate-y-[1px] text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <LogIn className="w-4 h-4 text-white" />
                  <span>{loading ? 'Signing In...' : 'Log In'}</span>
                </button>
              </form>
            ) : (
              <form onSubmit={(e) => void handleRegisterSubmit(e)} className="space-y-3.5">
                <div className="text-center space-y-1">
                  <h1 className="text-xl font-extrabold text-white font-display">
                    Create Your Account
                  </h1>
                  <p className="text-xs text-[#9E998F]">
                    Choose your username and starting skill level.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() => void handleGoogleContinue('register')}
                  className="w-full min-h-[46px] rounded-xl bg-white hover:bg-[#F2F2F2] text-[#1F1F1F] font-extrabold text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <GoogleLogoSvg />
                  <span>
                    {googleBusy
                      ? 'Verifying with Google...'
                      : verifiedGoogleToken
                        ? `Verified (${regEmail})`
                        : 'Continue with Google'}
                  </span>
                </button>

                <div className="flex items-center gap-3 py-0.5">
                  <div className="h-px flex-1 bg-white/10" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#7A756C]">
                    account details
                  </span>
                  <div className="h-px flex-1 bg-white/10" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="space-y-1.5">
                    <label htmlFor="reg-username" className="block text-xs font-bold text-[#C8C4BC]">
                      Username
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-[#8E8980] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        id="reg-username"
                        type="text"
                        autoComplete="username"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        placeholder="Username"
                        className="w-full min-h-[42px] rounded-xl bg-[#1A1917] border border-white/10 pl-9 pr-3 text-sm text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="reg-country" className="block text-xs font-bold text-[#C8C4BC]">
                      Country
                    </label>
                    <div className="relative">
                      <Globe className="w-4 h-4 text-[#8E8980] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <select
                        id="reg-country"
                        value={regCountry}
                        onChange={(e) => setRegCountry(e.target.value)}
                        className="w-full min-h-[42px] rounded-xl bg-[#1A1917] border border-white/10 pl-9 pr-2 text-xs font-semibold text-white focus:outline-none focus:border-[#81B64C]"
                      >
                        {COUNTRY_OPTIONS.map((c) => (
                          <option key={c.code} value={c.code}>
                            {c.flag} {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="reg-email" className="block text-xs font-bold text-[#C8C4BC]">
                    Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-[#8E8980] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="reg-email"
                      type="email"
                      autoComplete="email"
                      value={regEmail}
                      onChange={(e) => {
                        setRegEmail(e.target.value);
                        setVerifiedGoogleToken(null);
                      }}
                      placeholder="name@gmail.com"
                      className="w-full min-h-[42px] rounded-xl bg-[#1A1917] border border-white/10 pl-9 pr-3 text-sm text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
                    />
                  </div>
                </div>

                {verifiedGoogleToken && regEmail && (
                  <div className="p-2.5 rounded-xl bg-[#81B64C]/12 border border-[#81B64C]/35 text-xs text-[#D8F2BC] flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-[#81B64C] shrink-0" />
                    <span className="truncate">Google account verified: {regEmail}</span>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="reg-password" className="block text-xs font-bold text-[#C8C4BC]">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-[#8E8980] absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="reg-password"
                      type={revealRegPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={regPassword}
                      onChange={(e) => setRegPassword(e.target.value)}
                      placeholder="At least 6 characters"
                      className="w-full min-h-[42px] rounded-xl bg-[#1A1917] border border-white/10 pl-9 pr-10 text-sm text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
                    />
                    <button
                      type="button"
                      onClick={() => setRevealRegPassword((v) => !v)}
                      aria-label={revealRegPassword ? 'Hide password' : 'Show password'}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9E998F] hover:text-white absolute right-1.5 top-1/2 -translate-y-1/2 cursor-pointer"
                    >
                      {revealRegPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-[#C8C4BC]">Starting Skill Level</div>
                  <div className="grid grid-cols-2 gap-2">
                    {STARTING_SKILL_TIERS.map((tier) => {
                      const selected = regStartingRating === tier.rating;
                      return (
                        <button
                          key={tier.id}
                          type="button"
                          onClick={() => setRegStartingRating(tier.rating)}
                          className={`p-2.5 rounded-xl border text-left cursor-pointer transition-colors ${
                            selected
                              ? 'bg-[#383530] border-[#81B64C]'
                              : 'bg-[#1A1917] border-white/10 hover:border-white/25'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-xs font-extrabold text-white">{tier.label}</span>
                            <span className="text-xs font-mono font-bold text-[#81B64C]">
                              {tier.rating}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#9E998F] truncate mt-0.5">
                            {tier.description}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {shownError && (
                  <div
                    role="alert"
                    className="p-2.5 rounded-xl bg-[#5C2320]/60 border border-[#E06C5A]/40 text-xs font-semibold text-[#F7C7C1]"
                  >
                    {shownError}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isBusy}
                  className="w-full min-h-[48px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-4 border-[#457524] active:border-b-0 active:translate-y-[1px] text-white font-extrabold text-sm sm:text-base flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                >
                  <UserPlus className="w-4 h-4 text-white" />
                  <span>{isBusy ? 'Creating Account...' : 'Create Account'}</span>
                </button>
              </form>
            )}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl bg-[#262421] border border-white/10 overflow-hidden shadow-2xl">
          <div className="h-1 w-full bg-[#81B64C]" />
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <PlayerAvatar
                  username={lichessSession.account.username}
                  avatarUrl={lichessSession.account.profile?.avatarUrl}
                  isCurrentUser
                  size={48}
                  rounded="rounded-xl"
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-extrabold text-white truncate">
                      {lichessSession.account.username}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#81B64C]/20 text-[10px] font-extrabold text-[#81B64C] uppercase">
                      Verified
                    </span>
                  </div>
                  <div className="text-xs text-[#9E998F] truncate">
                    {lichessSession.account.email ||
                      `${lichessSession.account.count?.all ?? 0} games played`}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => void handleSync()}
                disabled={syncing}
                aria-label="Refresh account"
                className="w-9 h-9 rounded-xl bg-[#302E2B] hover:bg-[#3A3733] flex items-center justify-center text-[#81B64C] cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-[#1E1C19] px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-[#9E998F] flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[#81B64C]" />
                  Rapid
                </span>
                <span className="text-sm font-extrabold font-mono text-white tabular-nums">
                  {activeUser?.perfs?.rapid?.rating ?? 1200}
                </span>
              </div>
              <div className="rounded-xl bg-[#1E1C19] px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-[#9E998F] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#F7C045]" />
                  Blitz
                </span>
                <span className="text-sm font-extrabold font-mono text-white tabular-nums">
                  {activeUser?.perfs?.blitz?.rating ?? 1200}
                </span>
              </div>
              <div className="rounded-xl bg-[#1E1C19] px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-[#9E998F] flex items-center gap-1.5">
                  <Rocket className="w-3.5 h-3.5 text-[#E59A28]" />
                  Bullet
                </span>
                <span className="text-sm font-extrabold font-mono text-white tabular-nums">
                  {activeUser?.perfs?.bullet?.rating ?? 1200}
                </span>
              </div>
              <div className="rounded-xl bg-[#1E1C19] px-3 py-2.5 flex items-center justify-between">
                <span className="text-xs font-bold text-[#9E998F] flex items-center gap-1.5">
                  <Puzzle className="w-3.5 h-3.5 text-[#E06C5A]" />
                  Puzzles
                </span>
                <span className="text-sm font-extrabold font-mono text-white tabular-nums">
                  {activeUser?.perfs?.puzzle?.rating ?? 1200}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-[#1E1C19] border border-white/10 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Globe className="w-4 h-4 text-[#81B64C] shrink-0" />
                  <span className="text-xs font-extrabold text-white truncate">
                    Lichess Sync
                  </span>
                </div>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-extrabold uppercase ${
                    lichessSession.hasOnlineToken
                      ? 'bg-[#81B64C]/20 text-[#9CD363]'
                      : 'bg-[#E59A28]/20 text-[#F5C451]'
                  }`}
                >
                  {lichessSession.hasOnlineToken ? 'Connected' : 'Not Linked'}
                </span>
              </div>
              <p className="text-[11px] text-[#9E998F] leading-relaxed">
                {lichessSession.hasOnlineToken
                  ? 'Your puzzle rating, Storm/Streak scores, rated online games, and following list sync directly with Lichess.'
                  : 'Link your Lichess account to sync real Lichess puzzle ratings, rated matchmaking, recent games, and followers.'}
              </p>
              {!lichessSession.hasOnlineToken && (
                <div className="space-y-2">
                  {onLinkLichess && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => void handleLichessConnect()}
                      className="w-full min-h-[38px] rounded-lg bg-[#81B64C] hover:bg-[#8EC556] text-xs font-extrabold text-white flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Link2 className="w-3.5 h-3.5" />
                      <span>{lichessBusy ? 'Linking Lichess...' : 'Link Lichess Account (OAuth)'}</span>
                    </button>
                  )}
                  {onLinkToken && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setShowTokenInput((v) => !v)}
                        className="text-[11px] font-bold text-[#9E998F] hover:text-white flex items-center gap-1 cursor-pointer"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>{showTokenInput ? 'Hide personal access token' : 'Or link with personal access token'}</span>
                      </button>
                      {showTokenInput && (
                        <div className="mt-2 flex gap-2">
                          <input
                            type="password"
                            value={personalTokenDraft}
                            onChange={(e) => setPersonalTokenDraft(e.target.value)}
                            placeholder="lip_..."
                            className="flex-1 min-h-[36px] rounded-lg bg-[#262421] border border-white/10 px-3 text-xs text-white placeholder:text-[#736E66] focus:outline-none focus:border-[#81B64C]"
                          />
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleSubmitPersonalToken()}
                            className="px-3 rounded-lg bg-[#383530] hover:bg-[#46423C] text-xs font-extrabold text-white cursor-pointer disabled:opacity-50"
                          >
                            Link
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {syncNotice && (
                <div className="text-[11px] font-semibold text-[#9CD363] flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  <span>{syncNotice}</span>
                </div>
              )}
            </div>

            {shownError && (
              <div
                role="alert"
                className="p-2.5 rounded-xl bg-[#5C2320]/60 border border-[#E06C5A]/40 text-xs font-semibold text-[#F7C7C1]"
              >
                {shownError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={onBack}
                className="min-h-[42px] rounded-xl bg-[#81B64C] hover:bg-[#8EC556] border-b-[3px] border-[#457524] text-xs font-extrabold text-white cursor-pointer"
              >
                Continue to Home
              </button>
              <button
                type="button"
                onClick={onDisconnect}
                className="min-h-[42px] rounded-xl bg-[#302E2B] hover:bg-[#CA3431]/20 text-xs font-extrabold text-[#FF7D6B] flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
