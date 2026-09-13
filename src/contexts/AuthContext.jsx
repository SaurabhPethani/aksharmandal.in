import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  setAccessToken,
  setAuthLostHandler,
  rememberSession,
  resumeSession,
  forgetSession,
} from '../api/client';
import { authService } from '../services/authService';
// Imported from the module rather than the hooks barrel: that barrel imports
// this file, and the cycle would leave one of them undefined at module-eval time.
import { clearAllFilterState } from '../hooks/useFilterState';

export const AuthContext = createContext(null);

// Mobile port of the web AuthContext. Left out until what they depend on exists
// in this app:
//   - permission loading (/full-context): needs services/permissionService
//   - clearing the query cache: @tanstack/react-query is not installed
//   - the session hint and cold-start refresh: need a storage library
//   - re-reading permissions on focus: used document/window (AppState on mobile)
// `permissionContext` and `reloadPermissions` stay in the value so consumers
// keep the same shape.

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('booting'); // booting | anonymous | authed
  const [session, setSession] = useState(null); // { userId, isSetupRequired }
  // Family accounts the signed-in person may operate: themselves + any managed
  // child accounts. `accountChoicePending` is raised once right after an
  // interactive login when there is more than one, so the UI can prompt "which
  // account?"; it is not raised on a silent resume.
  const [accounts, setAccounts] = useState([]);
  const [accountChoicePending, setAccountChoicePending] = useState(false);
  const mounted = useRef(true);
  const booted = useRef(false);

  // Must re-arm on mount, not just disarm on cleanup: StrictMode mounts twice in
  // dev, and a cleanup-only version latches this false and swallows every setState.
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
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
  }, []);

  // Open one of the caller's accounts (self or a managed child). The picker is
  // dismissed either way.
  const switchTo = useCallback(async (userId) => {
    const token = await authService.switchAccount(userId);
    // Remembered list filters belong to the previous profile.
    clearAllFilterState();
    await establish(token, { interactive: false });
    if (mounted.current) setAccountChoicePending(false);
  }, [establish]);

  const dismissAccountChoice = useCallback(() => setAccountChoicePending(false), []);

  const signOut = useCallback(async ({ callApi = true } = {}) => {
    if (callApi) {
      try { await authService.logout(); } catch { /* best effort */ }
    }
    forgetSession();
    // Remembered list filters are per session — the next person to sign in on
    // this phone should not inherit someone else's search.
    clearAllFilterState();
    if (mounted.current) {
      setSession(null);
      setAccounts([]);
      setAccountChoicePending(false);
      setStatus('anonymous');
    }
  }, []);

  // A refresh failure anywhere in the app drops us to the login screen.
  useEffect(() => {
    setAuthLostHandler(() => { signOut({ callApi: false }); });
  }, [signOut]);

  // On mount, pick up a token still held in memory (a remount inside the same app
  // process). A cold start has nothing to resume and goes straight to login.
  // The guard is a ref rather than the usual cancel flag because StrictMode's
  // second mount must let the first run finish, not abort it.
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;

    const live = resumeSession();
    if (!live) {
      setStatus('anonymous');
      return;
    }
    (async () => {
      try {
        await establish(live);
      } catch {
        forgetSession();
        if (mounted.current) setStatus('anonymous');
      }
    })();
  }, [establish]);

  const value = useMemo(() => ({
    status,
    session,
    permissionContext: null,

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
     * rememberSession: remembering it would let a resume treat a scoped token as
     * a session.
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

    /** No-op until services/permissionService is ported. */
    reloadPermissions: async () => null,
    signOut,
  }), [
    status, session, accounts, accountChoicePending,
    establish, signOut, switchTo, dismissAccountChoice,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
