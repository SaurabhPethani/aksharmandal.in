import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  setAccessToken,
  getAccessToken,
  setAuthLostHandler,
  setTokenRefreshedHandler,
  rememberSession,
  resumeSession,
  forgetSession,
} from '../api/client';

import { authService } from '../services/authService';

import { clearAllFilterState } from '../hooks/useFilterState';

import {
  getBiometricType,
  isBiometricAvailable,
  isBiometricLoginEnabled,
  enableBiometricLogin,
  authenticateWithBiometric,
  disableBiometricLogin,
  updateBiometricToken,
} from '../services/biometricService';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [status, setStatus] = useState('booting');

  const [session, setSession] = useState(null);

  const [accounts, setAccounts] = useState([]);

  const [accountChoicePending, setAccountChoicePending] = useState(false);

  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const mounted = useRef(true);

  const booted = useRef(false);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Convert an access token into an
   * authenticated application session.
   */
  const establish = useCallback(async (token, { interactive = false } = {}) => {
    const record = await rememberSession(token);

    let userId = record.user_id;

    if (userId == null) {
      const me = await authService.me();

      userId = me?.id ?? me?.user_id;
    }

    if (userId == null) {
      throw new Error('Could not resolve the signed-in user id.');
    }

    let list = [];

    try {
      list = await authService.getMyAccounts();
    } catch {
      list = [];
    }

    const accountList = Array.isArray(list) ? list : [];

    if (mounted.current) {
      setAccounts(accountList);

      setSession({
        userId,
        isSetupRequired: record.is_setup_required === true,
      });

      setAccountChoicePending(interactive && accountList.length > 1);

      setStatus('authed');
    }

    return {
      userId,
      token: record.access_token,
    };
  }, []);

  /**
   * Normal PIN login.
   */
  const loginWithPin = useCallback(
    async (mobile, pin) => {
      const token = await authService.loginWithPin(mobile, pin);

      return establish(token, {
        interactive: true,
      });
    },
    [establish],
  );

  /**
   * Normal password login.
   */
  const loginWithPassword = useCallback(
    async (mobile, password) => {
      const token = await authService.loginWithPassword(mobile, password);

      return establish(token, {
        interactive: true,
      });
    },
    [establish],
  );

  /**
   * Switch account.
   */
  const switchTo = useCallback(
    async userId => {
      const token = await authService.switchAccount(userId);

      clearAllFilterState();

      const result = await establish(token, {
        interactive: false,
      });

      /*
       * If biometric login is enabled,
       * keep its token synchronized.
       */
      await updateBiometricToken(result.token);

      if (mounted.current) {
        setAccountChoicePending(false);
      }

      return result;
    },
    [establish],
  );

  const dismissAccountChoice = useCallback(() => {
    setAccountChoicePending(false);
  }, []);

  /**
   * Enable biometric login for the
   * currently authenticated account.
   */
  const enableBiometric = useCallback(async () => {
    const available = await isBiometricAvailable();

    if (!available) {
      throw new Error(
        'Biometric authentication is not available on this device.',
      );
    }

    const token = getAccessToken();

    if (!token) {
      throw new Error('No active session is available for biometric login.');
    }

    const type = await getBiometricType();

    await enableBiometricLogin(token);

    if (mounted.current) {
      setBiometricAvailable(true);
      setBiometricEnabled(true);
    }

    return {
      enabled: true,
      type,
    };
  }, []);

  /**
   * Disable biometric login.
   *
   * Current application session remains active.
   */
  const disableBiometric = useCallback(async () => {
    await disableBiometricLogin();

    if (mounted.current) {
      setBiometricEnabled(false);
    }

    return true;
  }, []);

  /**
   * Login using biometric authentication.
   */
  const loginWithBiometric = useCallback(async () => {
    const credentials = await authenticateWithBiometric();

    if (!credentials?.token) {
      throw new Error(
        'Biometric authentication was cancelled or no biometric login is configured.',
      );
    }

    try {
      const result = await establish(
        {
          access_token: credentials.token,
        },
        {
          interactive: false,
        },
      );

      if (mounted.current) {
        setStatus('authed');
      }

      return result;
    } catch (error) {
      await forgetSession();
      throw error;
    }
  }, [establish]);

  /**
   * Normal logout.
   *
   * Biometric enrollment remains enabled.
   */
  const signOut = useCallback(async ({ callApi = true } = {}) => {
    if (callApi) {
      try {
        await authService.logout();
      } catch {
        // Best effort.
      }
    }

    await forgetSession();

    clearAllFilterState();

    if (mounted.current) {
      setSession(null);
      setAccounts([]);
      setAccountChoicePending(false);
      setStatus('anonymous');
    }
  }, []);

  /**
   * Handle expired/invalid authentication.
   */
  useEffect(() => {
    setAuthLostHandler(() => {
      signOut({
        callApi: false,
      });
    });

    return () => {
      setAuthLostHandler(null);
    };
  }, [signOut]);

  /**
   * Keep biometric token synchronized after
   * silent access-token refresh.
   */
  useEffect(() => {
    setTokenRefreshedHandler(async token => {
      await updateBiometricToken(token);
    });

    return () => {
      setTokenRefreshedHandler(null);
    };
  }, []);

  /**
   * Initial application boot.
   *
   * Normal session:
   *   resumeSession()
   *
   * No normal session:
   *   show login screen
   *
   * Biometric credentials are not automatically
   * opened here. LoginPage controls the biometric
   * prompt.
   */
  useEffect(() => {
    if (booted.current) {
      return;
    }

    booted.current = true;

    (async () => {
      try {
        const available = await isBiometricAvailable();

        const enabled = await isBiometricLoginEnabled();

        if (mounted.current) {
          setBiometricAvailable(available);

          setBiometricEnabled(available && enabled);
        }
      } catch {
        if (mounted.current) {
          setBiometricAvailable(false);
          setBiometricEnabled(false);
        }
      }

      const live = resumeSession();

      if (!live) {
        if (mounted.current) {
          setStatus('anonymous');
        }

        return;
      }

      try {
        await establish(live);
      } catch {
        await forgetSession();

        if (mounted.current) {
          setStatus('anonymous');
        }
      }
    })();
  }, [establish]);

  const value = useMemo(
    () => ({
      status,

      session,

      permissionContext: null,

      accounts,

      activeUserId: session?.userId ?? null,

      accountChoicePending,

      switchTo,

      dismissAccountChoice,

      loginInit: authService.loginInit,

      loginWithPassword,

      loginWithPin,

      verifyOtp: async (mobile, otp, purpose) => {
        const token = await authService.verifyOtp(mobile, otp, purpose);

        setAccessToken(token.access_token);

        return token;
      },

      completeSetup: async (mobile, password, pin) => {
        const result = await authService.setCredentials(mobile, password, pin);

        /*
         * set-credentials invalidates the
         * existing access token/session.
         */
        await forgetSession();

        return result;
      },

      /*
       * Biometric functionality.
       */
      biometricAvailable,

      biometricEnabled,

      getBiometricType,

      enableBiometric,

      disableBiometric,

      loginWithBiometric,

      reloadPermissions: async () => null,

      signOut,
    }),
    [
      status,
      session,
      accounts,
      accountChoicePending,
      switchTo,
      dismissAccountChoice,
      loginWithPassword,
      loginWithPin,
      biometricAvailable,
      biometricEnabled,
      enableBiometric,
      disableBiometric,
      loginWithBiometric,
      signOut,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
