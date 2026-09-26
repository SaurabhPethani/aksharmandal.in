import { api, AUTH_PATHS } from '../api/client';

// Auth flow per the OpenAPI spec. There is no /auth/login, no /auth/me, and no
// separate "send OTP" endpoint — login-init sends the OTP itself:
//
//   login-init  -> { action: 'OTP_REQUIRED' | 'PASSWORD_REQUIRED', message,
//                    purpose: 'SETUP' | 'RESET' | null, is_locked, failed_attempts }
//   login/pin | login/password -> full ACCESS token
//   verify-otp  -> a SETUP/RESET-SCOPED token (not an access token), which must be
//                  sent as the Bearer for set-credentials
//   set-credentials -> persists password + PIN, bumps token_version and
//                      invalidates other sessions, so the user must log in again

export const authService = {
  /** Step 1. Also sends the OTP when the account needs setup or reset. */
  loginInit: (mobile_number, is_forgot_password = false) =>
    api.post(AUTH_PATHS.loginInit, { mobile_number, is_forgot_password }),

  loginWithPassword: (mobile_number, password) =>
    api.post(AUTH_PATHS.loginPassword, { mobile_number, password }),

  loginWithPin: (mobile_number, pin) =>
    api.post(AUTH_PATHS.loginPin, { mobile_number, pin }),

  /** `purpose` is required and comes from login-init's response. */
  verifyOtp: (mobile_number, otp, purpose) =>
    api.post(AUTH_PATHS.verifyOtp, { mobile_number, otp, purpose }),

  /** Requires the scoped token from verify-otp to be the current bearer. */
  setCredentials: (mobile_number, password, pin) =>
    api.post(AUTH_PATHS.setCredentials, { mobile_number, password, pin }),

  logout: () => api.post(AUTH_PATHS.logout),

  /** Change the password from inside the app — no OTP, session survives. */
  changePassword: (current_password, new_password) =>
    api.post(AUTH_PATHS.changePassword, { current_password, new_password }, { envelope: true }),

  changePin: (current_pin, new_pin) =>
    api.post(AUTH_PATHS.changePin, { current_pin, new_pin }, { envelope: true }),

  me: () => api.get(AUTH_PATHS.me),

  /** The accounts this person may open: themselves + any managed children. */
  getMyAccounts: () => api.get(AUTH_PATHS.myAccounts),

  /** Open one of those accounts — returns a fresh ACCESS token for it. */
  switchAccount: (user_id) => api.post(AUTH_PATHS.switchAccount, { user_id }),
};
