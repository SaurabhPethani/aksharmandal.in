import axios from 'axios';
import { VITE_API_BASE } from '@env';
import { messageForStatus, toneForStatus } from '../constants/messages';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Axios instance for the Akshar Connect API.
//
// Two API traits every caller would otherwise repeat are absorbed here:
//   1. Responses are a StandardResponse envelope { status_code, detail, data },
//      where `status_code` is a BOOLEAN success flag, not an HTTP status int.
//   2. The refresh token is an HttpOnly cookie rotated by POST /auth/refresh,
//      so every request needs withCredentials. On the phone the native
//      networking layer holds that cookie; the access token lives in memory.

// Keep local debug builds usable even when `.env` has not been created yet or
// Metro is started from a clean checkout. Production/CI builds should always
// provide VITE_API_BASE explicitly.
const BASE = (
  VITE_API_BASE || 'https://uat.aksharmandal.in/aksharconnect'
).replace(/\/+$/, '');

/**
 * An API path as a full URL, for anything that does not go through axios —
 * an <Image source={{ uri }}>, a download link.
 */
export const apiUrl = path => `${BASE}${path}`;

export const AUTH_PATHS = {
  loginInit: '/api/v1/auth/login-init',
  loginPassword: '/api/v1/auth/login/password',
  loginPin: '/api/v1/auth/login/pin',
  verifyOtp: '/api/v1/auth/verify-otp',
  setCredentials: '/api/v1/auth/set-credentials',
  refresh: '/api/v1/auth/refresh',
  logout: '/api/v1/auth/logout',
  // Family account switching: the signed-in person plus any managed child
  // accounts they can open, and the endpoint that opens one.
  myAccounts: '/api/v1/auth/my-accounts',
  switchAccount: '/api/v1/auth/switch-account',
  me: '/api/v1/users/me',
};

/**
 * Every failure the app can see, in one shape. `message` is always presentable —
 * the backend's `detail` when it sent one, otherwise the catalogue's wording for
 * the status — so a caller can surface `err.message` without composing its own
 * fallback. `tone` says which toast it belongs in.
 */
export class ApiError extends Error {
  constructor(message, { status, detail, body } = {}) {
    super(message || messageForStatus(status));
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.body = body;
    this.tone = toneForStatus(status);
    // Login failures carry structure the sign-in screen acts on rather than just
    // text — see readFailure. Null for every other kind of error.
    this.failure = readFailure(body);
    // { field: message } for a 422, so a form can put each message under the
    // control that caused it instead of in one banner. Null otherwise.
    this.fieldErrors = readFieldErrors(body);
  }
}

let accessToken = null;
let onAuthLost = () => {};

export const setAccessToken = t => {
  accessToken = t;
};
export const getAccessToken = () => accessToken;
export const setAuthLostHandler = fn => {
  onAuthLost = fn;
};

// The Token record is held in memory for the life of the app process. The web
// app mirrors it into sessionStorage; there is no storage library here yet, so
// a cold start always begins signed out.
const CLOCK_SKEW_MS = 30_000;
let sessionRecord = null;

/** Millisecond `exp` from a JWT payload, or null when it cannot be read. */
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
 * Make `token` the current bearer and remember it. Fields the refresh response
 * omits (it carries no user_id) are carried over from the held record, so
 * resuming never has to re-resolve the user via /users/me. Returns the merged
 * record.
 */
export async function rememberSession(token) {
  const merged = { ...(sessionRecord ?? {}), ...token };
  setAccessToken(merged.access_token ?? null);
  sessionRecord = merged;
  await AsyncStorage.setItem('token', merged.access_token);
  return merged;
}

export async function forgetSession() {
  setAccessToken(null);
  sessionRecord = null;
  await AsyncStorage.removeItem('token');
}

/**
 * The held Token if its JWT is still comfortably unexpired, else null — and an
 * expired record is dropped on the way out. An unreadable `exp` counts as
 * expired: without proof the token is live, the cookie is the safer path.
 */
export function resumeSession() {
  const record = sessionRecord;
  const exp = record?.access_token ? jwtExpiry(record.access_token) : null;
  if (!exp || exp - CLOCK_SKEW_MS <= Date.now()) {
    if (record) forgetSession();
    return null;
  }
  setAccessToken(record.access_token);
  return record;
}

/**
 * A REQUEST MUST ALWAYS SETTLE. axios defaults `timeout` to 0, which means
 * "wait forever" — and on a phone that is not a theoretical state. A radio
 * handing between cells, a tunnel, a wifi/5G switch mid-flight: the socket goes
 * quiet and the promise neither resolves nor rejects, ever.
 *
 * Nothing downstream can recover from that: any pending flag the caller owns is
 * never cleared, so a spinner spins and a button stays disabled forever.
 *
 * 60s rather than something tight, because this is a BACKSTOP, not a latency
 * budget. It exists to convert "hung forever" into "failed, and here is a
 * message" — callers that need a faster answer pass their own shorter timeout.
 */
export const api = axios.create({
  baseURL: BASE,
  withCredentials: true,
  timeout: 60_000,
  headers: { Accept: 'application/json' },
});

/**
 * `detail` is not always a string. FastAPI validation errors arrive as
 * { detail: [{loc, msg, type}, ...] }, and the login endpoints answer a wrong
 * password/PIN with { detail: { message, failed_attempts, is_locked } } — so all
 * three shapes have to collapse to one presentable line.
 */
function readDetail(body, fallback) {
  const d = body?.detail;
  if (typeof d === 'string') return d;
  if (Array.isArray(d))
    return (
      d
        .map(e => e?.msg)
        .filter(Boolean)
        .join('; ') || fallback
    );
  if (d && typeof d === 'object') return d.message || fallback;
  return fallback;
}

/**
 * FastAPI's 422 body names the field that failed, in `loc`:
 *
 *   { detail: [{ loc: ['body', 'email'], msg: 'value is not a valid email…' }] }
 *
 * `readDetail` collapses that to one line for callers that only want text, which
 * throws the names away — the user then reads a banner and has to work out which
 * control it means. This keeps `{ field: message }` alongside it.
 *
 * The last string segment is the field: `['body', 'educations', 0, 'year']` is a
 * `year`, and the row it belongs to is not something this layer can know. First
 * message per field wins, matching the one-message-per-field rule the forms use.
 */
function readFieldErrors(body) {
  const d = body?.detail;
  if (!Array.isArray(d)) return null;

  const out = {};
  for (const entry of d) {
    const loc = Array.isArray(entry?.loc) ? entry.loc : [];
    const field = [...loc]
      .reverse()
      .find(p => typeof p === 'string' && p !== 'body');
    if (field && entry?.msg && !(field in out)) out[field] = entry.msg;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * The LoginFailureResponse that /auth/login/password and /auth/login/pin put in
 * `detail` on a 400:
 *
 *   { message: 'Invalid Credentials', failed_attempts: 3, is_locked: false }
 *
 * The message alone does not say how close the account is to being locked, or
 * that it already is, so the fields are kept as well. Returns null unless the
 * shape is really there — `err.failure` is never a guess.
 */
function readFailure(body) {
  const d = body?.detail;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  if (!('is_locked' in d) && !('failed_attempts' in d)) return null;
  return {
    message: typeof d.message === 'string' ? d.message : null,
    isLocked: d.is_locked === true,
    failedAttempts: Number.isInteger(d.failed_attempts)
      ? d.failed_attempts
      : null,
  };
}

api.interceptors.request.use(config => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

// Single-flight refresh: concurrent 401s share one /auth/refresh call rather than
// racing to rotate the cookie, where a lost race invalidates the winner's token.
let refreshInFlight = null;

export async function refreshAccessToken() {
  if (!refreshInFlight) {
    refreshInFlight = axios
      .post(`${BASE}${AUTH_PATHS.refresh}`, null, {
        withCredentials: true,
        headers: { Accept: 'application/json' },
      })
      .then(res => {
        const token = res.data?.data;
        if (!token?.access_token)
          throw new ApiError(messageForStatus(401), { status: 401 });
        return rememberSession(token);
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

api.interceptors.response.use(
  res => {
    const body = res.data;
    // Pass through non-envelope payloads (blobs, plain values) untouched.
    if (!body || typeof body !== 'object' || !('status_code' in body))
      return body;
    if (body.status_code === false) {
      throw new ApiError(readDetail(body, messageForStatus(res.status)), {
        status: res.status,
        detail: body.detail,
        body,
      });
    }
    // Write endpoints put their human-readable result in `detail` and leave
    // `data` null, so unwrapping to `data` would throw the message away. Callers
    // that surface it (toasts) ask for the envelope with { envelope: true }.
    return res.config?.envelope ? body : body.data;
  },
  async error => {
    const { response, config } = error;
    // No response at all: offline, DNS, timeout. axios's own message
    // ("Network Error") is not something to show a user.
    if (!response) throw new ApiError(messageForStatus(0), { status: 0 });

    const isAuthCall = config?.url?.startsWith('/api/v1/auth/');
    // One silent refresh, then replay the original request.
    if (response.status === 401 && !config?._retried && !isAuthCall) {
      config._retried = true;
      try {
        await refreshAccessToken();
        return api(config);
      } catch {
        forgetSession();
        onAuthLost();
        throw new ApiError(messageForStatus(401), { status: 401 });
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
