import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  setAccessToken,
  setAuthLostHandler,
  refreshAccessToken,
  rememberSession,
  resumeSession,
  forgetSession,
} from '../api/client';
import { authService } from '../services/authService';
import { permissionService } from '../services/permissionService';
import { STORAGE_KEYS } from '../constants/storage';
// Imported from the module rather than the hooks barrel: that barrel imports
// this file, and the cycle would leave one of them undefined at module-eval time.
import { clearAllFilterState } from '../hooks/useFilterState';

export const AuthContext = createContext(null);

// The refresh token is HttpOnly, so JS cannot see whether a session exists. This
// non-secret flag records that we established one, letting a cold start skip the
// /auth/refresh probe entirely when the user has never signed in (or has signed
// out) — otherwise every visit to the login page fires a pointless 401.
//
// It is a hint, not a credential: forging it only buys you one failed refresh.
const SESSION_HINT = STORAGE_KEYS.sessionHint;

const sessionHint = {
  get: () => {
    try { return localStorage.getItem(SESSION_HINT) === '1'; } catch { return false; }
  },
  set: () => {
    try { localStorage.setItem(SESSION_HINT, '1'); } catch { /* private mode */ }
  },
  clear: () => {
    try { localStorage.removeItem(SESSION_HINT); } catch { /* private mode */ }
  },
};

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('booting'); // booting | anonymous | authed
  const [session, setSession] = useState(null); // { userId, isSetupRequired }
  const [permissionContext, setPermissionContext] = useState(null);
  // Family accounts the signed-in person may operate: themselves + any managed
  // child accounts. `accountChoicePending` is raised once right after an
  // interactive login when there is more than one, so the UI can prompt "which
  // account?"; it is not raised on a silent resume/reload.
  const [accounts, setAccounts] = useState([]);
  const [accountChoicePending, setAccountChoicePending] = useState(false);
  const queryClient = useQueryClient();
  const mounted = useRef(true);
  const booted = useRef(false);

  // Must re-arm on mount, not just disarm on cleanup: StrictMode mounts twice in
  // dev, and a cleanup-only version latches this false and swallows every setState.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const loadPermissions = useCallback(async (userId) => {
    const ctx = await permissionService.fullContext(userId);
    if (mounted.current) setPermissionContext(ctx);
    return ctx;
  }, []);

  const establish = useCallback(async (token, { interactive = false } = {}) => {
    const record = rememberSession(token);
    let userId = record.user_id;
    // user_id is optional on Token; fall back to /users/me when absent.
    if (userId == null) {
      const me = await authService.me();
      userId = me?.id ?? me?.user_id;
    }
    if (userId == null) throw new Error('Could not resolve the signed-in user id.');
    await loadPermissions(userId);
    sessionHint.set();
    // The family accounts this person can operate (self + managed children).
    // Best-effort: a member with no children just gets [self], and a failure
    // must never block an otherwise-good sign-in.
    let list = [];
    try { list = await authService.getMyAccounts(); } catch { list = []; }
    const accountList = Array.isArray(list) ? list : [];
    if (mounted.current) {
      setAccounts(accountList);
      setSession({ userId, isSetupRequired: record.is_setup_required === true });
      // Prompt "which account?" only on a fresh interactive login with a choice
      // to make — never on a silent resume or a deliberate switch.
      setAccountChoicePending(interactive && accountList.length > 1);
      setStatus('authed');
    }
    return userId;
  }, [loadPermissions]);

  // Open one of the caller's accounts (self or a managed child). Establishing
  // the returned token reloads permissions for the opened profile, so the whole
  // app re-scopes to that member; the picker is dismissed either way.
  const switchTo = useCallback(async (userId) => {
    const token = await authService.switchAccount(userId);
    // Wipe every cached query + remembered list filter before re-establishing,
    // so no panel bleeds the previous profile's data (dashboards, attendance,
    // lists) into the opened one. Same hygiene as sign-out, minus the redirect.
    queryClient.clear();
    clearAllFilterState();
    await establish(token, { interactive: false });
    if (mounted.current) setAccountChoicePending(false);
  }, [establish, queryClient]);

  const dismissAccountChoice = useCallback(() => setAccountChoicePending(false), []);

  const signOut = useCallback(async ({ callApi = true } = {}) => {
    if (callApi) {
      try { await authService.logout(); } catch { /* best effort */ }
    }
    forgetSession();
    sessionHint.clear();
    queryClient.clear();
    // Remembered list filters are per session, not per browser — the next person
    // to sign in on this tab should not inherit someone else's search.
    clearAllFilterState();
    if (mounted.current) {
      setSession(null);
      setPermissionContext(null);
      setAccounts([]);
      setAccountChoicePending(false);
      setStatus('anonymous');
    }
  }, [queryClient]);

  // A refresh failure anywhere in the app drops us to the login screen.
  useEffect(() => {
    setAuthLostHandler(() => { signOut({ callApi: false }); });
  }, [signOut]);

  // On mount, resume the cheapest way that works:
  //   1. The mirrored access token, if its JWT has not expired — no request at
  //      all, so a plain reload never touches /auth/refresh.
  //   2. Otherwise the HttpOnly refresh cookie, but only if we have ever
  //      established a session on this device. Without the hint there is nothing
  //      to resume, so go straight to the login screen and skip the request.
  // Runs exactly once per page load. The guard is a ref rather than the usual
  // cancel flag because StrictMode's second mount must let the first run finish,
  // not abort it — cancelling would leave us stuck on 'booting', and re-running
  // would fire a second /full-context.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    const live = resumeSession();
    if (!live && !sessionHint.get()) {
      setStatus('anonymous');
      return;
    }
    (async () => {
      try {
        await establish(live ?? await refreshAccessToken());
      } catch {
        // Token and cookie are both spent — clear up so the next load is silent.
        sessionHint.clear();
        forgetSession();
        if (mounted.current) setStatus('anonymous');
      }
    })();
  }, [establish]);

  /**
   * WHEN SOMEBODY ELSE CHANGES YOUR ROLE.
   *
   * The two hooks that write a role re-read the caller's own grants themselves,
   * so an admin who changes their own role sees the app change under them at
   * once. That covers nothing for the member on the other side of it: their role
   * was changed in a different session, on a different device, and this tab has
   * no idea. /full-context is fetched once at sign-in and held in state, so the
   * new rank simply did not exist for them until they reloaded the page — which
   * nobody thinks to do, because nothing on screen suggests anything moved.
   *
   * So the context is re-read when the tab comes back: returning to it, or to
   * the network. That is the moment a change made elsewhere is worth catching,
   * and it costs one request.
   *
   * THROTTLED, and the throttle starts armed — `since` is seeded at mount, so
   * alt-tabbing away and straight back does not fire, and neither does the
   * focus event that arrives moments after signing in.
   *
   * This is deliberately NOT `refetchOnWindowFocus` for the query cache, which
   * utils/queryClient turns off on purpose: that is every list on screen on
   * every focus, for data that changes on human timescales. This is one request
   * for the one thing that decides what the person is allowed to see.
   *
   * A failure is swallowed. Keeping the grants already in hand is right — a
   * flaky network must not empty somebody's sidebar — and a refresh token that
   * has actually expired surfaces through the interceptor's own auth-lost path.
   */
  useEffect(() => {
    const userId = session?.userId;
    if (status !== 'authed' || userId == null) return undefined;

    const MIN_GAP_MS = 60_000;
    let since = Date.now();

    const revalidate = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - since < MIN_GAP_MS) return;
      since = Date.now();
      loadPermissions(userId).catch(() => { /* keep the grants we have */ });
    };

    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('focus', revalidate);
    window.addEventListener('online', revalidate);
    return () => {
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('focus', revalidate);
      window.removeEventListener('online', revalidate);
    };
  }, [status, session?.userId, loadPermissions]);

  const value = useMemo(() => ({
    status,
    session,
    permissionContext,

    accounts,
    activeUserId: session?.userId ?? null,
    accountChoicePending,
    switchTo,
    dismissAccountChoice,

    loginInit: authService.loginInit,
    loginWithPassword: async (m, p) => establish(await authService.loginWithPassword(m, p), { interactive: true }),
    loginWithPin: async (m, p) => establish(await authService.loginWithPin(m, p), { interactive: true }),

    /**
     * verify-otp returns a SETUP/RESET-scoped token, NOT an access token, so this
     * deliberately does not start a session — it only parks the scoped token as
     * the bearer so set-credentials can authenticate. setAccessToken, not
     * rememberSession: mirroring it would let a reload resume a scoped token as
     * if it were a session.
     */
    verifyOtp: async (mobile, otp, purpose) => {
      const token = await authService.verifyOtp(mobile, otp, purpose);
      setAccessToken(token.access_token);
      return token;
    },

    /**
     * Completes setup/reset. The backend bumps token_version and invalidates
     * other sessions, so the scoped token is dropped and the user logs in again.
     */
    completeSetup: async (mobile, password, pin) => {
      const result = await authService.setCredentials(mobile, password, pin);
      forgetSession();
      return result;
    },

    /** Re-pull grants without a full reload (e.g. after a role change). */
    reloadPermissions: () => session && loadPermissions(session.userId),
    signOut,
  }), [
    status, session, permissionContext, accounts, accountChoicePending,
    establish, loadPermissions, signOut, switchTo, dismissAccountChoice,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
