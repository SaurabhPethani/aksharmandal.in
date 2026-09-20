import axios from 'axios';
import { messageForStatus, toneForStatus } from '../constants/messages';
import { API_BASE } from '../config/appConfig';

// Axios instance for the Akshar Connect API.
//
// Authentication model:
//
// 1. Access token -> memory only
// 2. Refresh token -> HttpOnly cookie
// 3. Biometric access token -> react-native-keychain
//
// DO NOT store the access token in AsyncStorage/localStorage.

export const apiUrl = path => `${API_BASE}${path}`;

/**
 * A URL the API handed back, made loadable by `<Image>`.
 *
 * The browser resolves a relative path against the origin it loaded from; the
 * app has no origin, so a relative `image_url` renders as nothing at all.
 * Already-absolute URLs pass through untouched.
 */
export const absoluteUrl = url => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return trimmed;
  return `${API_BASE}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
};

export const AUTH_PATHS = {
  loginInit: '/api/v1/auth/login-init',
  loginPassword: '/api/v1/auth/login/password',
  loginPin: '/api/v1/auth/login/pin',
  verifyOtp: '/api/v1/auth/verify-otp',
  setCredentials: '/api/v1/auth/set-credentials',
  refresh: '/api/v1/auth/refresh',
  logout: '/api/v1/auth/logout',
  myAccounts: '/api/v1/auth/my-accounts',
  switchAccount: '/api/v1/auth/switch-account',
  me: '/api/v1/users/me',
};

export class ApiError extends Error {
  constructor(message, { status, detail, body } = {}) {
    super(message || messageForStatus(status));

    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.body = body;
    this.tone = toneForStatus(status);

    this.failure = readFailure(body);
    this.fieldErrors = readFieldErrors(body);
  }
}

let accessToken = null;
let onAuthLost = () => {};
let onTokenRefreshed = null;

export const setAccessToken = token => {
  accessToken = token;
};

export const getAccessToken = () => accessToken;

export const setAuthLostHandler = fn => {
  onAuthLost = typeof fn === 'function' ? fn : () => {};
};

export const setTokenRefreshedHandler = fn => {
  onTokenRefreshed = typeof fn === 'function' ? fn : null;
};

/*
 * Current authenticated session.
 *
 * This is deliberately memory-only.
 *
 * Biometric persistence is handled separately
 * through react-native-keychain.
 */
let sessionRecord = null;

const CLOCK_SKEW_MS = 30_000;

/**
 * Read JWT expiry.
 */
function jwtExpiry(jwt) {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');

    const { exp } = JSON.parse(global.atob(b64));

    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/**
 * Make token the current application session.
 *
 * IMPORTANT:
 * This does NOT persist the token.
 */
export async function rememberSession(token) {
  const merged = {
    ...(sessionRecord ?? {}),
    ...token,
  };

  if (!merged.access_token) {
    throw new Error('No access token supplied.');
  }

  setAccessToken(merged.access_token);

  sessionRecord = merged;

  return merged;
}

/**
 * Clear the current in-memory session.
 *
 * Biometric credentials are intentionally NOT
 * removed here.
 */
export async function forgetSession() {
  setAccessToken(null);
  sessionRecord = null;
}

/**
 * Resume only an existing in-memory session.
 *
 * A cold application start therefore starts
 * anonymous unless biometric login is used.
 */
export function resumeSession() {
  const record = sessionRecord;

  const exp = record?.access_token ? jwtExpiry(record.access_token) : null;

  if (!exp || exp - CLOCK_SKEW_MS <= Date.now()) {
    if (record) {
      forgetSession();
    }

    return null;
  }

  setAccessToken(record.access_token);

  return record;
}

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  timeout: 60_000,
  headers: {
    Accept: 'application/json',
  },
});

/**
 * Extract readable backend detail.
 */
function readDetail(body, fallback) {
  const d = body?.detail;

  if (typeof d === 'string') {
    return d;
  }

  if (Array.isArray(d)) {
    return (
      d
        .map(e => e?.msg)
        .filter(Boolean)
        .join('; ') || fallback
    );
  }

  if (d && typeof d === 'object') {
    return d.message || fallback;
  }

  return fallback;
}

/**
 * Extract FastAPI field validation errors.
 */
function readFieldErrors(body) {
  const d = body?.detail;

  if (!Array.isArray(d)) {
    return null;
  }

  const out = {};

  for (const entry of d) {
    const loc = Array.isArray(entry?.loc) ? entry.loc : [];

    const field = [...loc]
      .reverse()
      .find(p => typeof p === 'string' && p !== 'body');

    if (field && entry?.msg && !(field in out)) {
      out[field] = entry.msg;
    }
  }

  return Object.keys(out).length ? out : null;
}

/**
 * Extract login failure information.
 */
function readFailure(body) {
  const d = body?.detail;

  if (!d || typeof d !== 'object' || Array.isArray(d)) {
    return null;
  }

  if (!('is_locked' in d) && !('failed_attempts' in d)) {
    return null;
  }

  return {
    message: typeof d.message === 'string' ? d.message : null,

    isLocked: d.is_locked === true,

    failedAttempts: Number.isInteger(d.failed_attempts)
      ? d.failed_attempts
      : null,
  };
}

/**
 * Add access token to every API request.
 */
api.interceptors.request.use(config => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }

  return config;
});

/**
 * Single-flight refresh.
 *
 * Multiple simultaneous 401 responses
 * share the same refresh request.
 */
let refreshInFlight = null;

export async function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(`${API_BASE}${AUTH_PATHS.refresh}`, null, {
        withCredentials: true,
        headers: {
          Accept: 'application/json',
        },
      })
      .then(async res => {
        const token = res.data?.data;

        if (!token?.access_token) {
          throw new ApiError(messageForStatus(401), {
            status: 401,
          });
        }

        const result = await rememberSession(token);

        /*
         * Keep biometric token synchronized
         * with the latest access token.
         */
        if (onTokenRefreshed) {
          try {
            await onTokenRefreshed(result.access_token);
          } catch {
            /*
             * Biometric synchronization must
             * never break normal token refresh.
             */
          }
        }

        return result;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }

  return refreshInFlight;
}

/**
 * Response interceptor.
 */
api.interceptors.response.use(
  res => {
    const body = res.data;

    /*
     * Non-standard responses pass through.
     */
    if (!body || typeof body !== 'object' || !('status_code' in body)) {
      return body;
    }

    /*
     * Backend explicitly reported failure.
     */
    if (body.status_code === false) {
      throw new ApiError(readDetail(body, messageForStatus(res.status)), {
        status: res.status,
        detail: body.detail,
        body,
      });
    }

    /*
     * Return complete envelope when requested.
     */
    if (res.config?.envelope) {
      return body;
    }

    return body.data;
  },

  async error => {
    const { response, config } = error;

    /*
     * No HTTP response:
     * offline / timeout / DNS / network.
     */
    if (!response) {
      throw new ApiError(messageForStatus(0), {
        status: 0,
      });
    }

    const isAuthCall = config?.url?.startsWith('/api/v1/auth/');

    /*
     * One silent refresh for non-auth requests.
     */
    if (response.status === 401 && !config?._retried && !isAuthCall) {
      config._retried = true;

      try {
        await refreshAccessToken();

        return api(config);
      } catch {
        await forgetSession();

        onAuthLost();

        throw new ApiError(messageForStatus(401), {
          status: 401,
        });
      }
    }

    throw new ApiError(
      readDetail(response.data, messageForStatus(response.status)),
      {
        status: response.status,
        detail: readDetail(response.data, null),
        body: response.data,
      },
    );
  },
);
