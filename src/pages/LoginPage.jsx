import { useState } from 'react';
import { Eye, EyeOff, KeyRound, Lock, MessageCircle, Phone, ShieldCheck } from 'lucide-react';
import aksharConnectLogo from '../assets/Akshar-Connect-Blue-logo.png';
import satsangMandalLogo from '../assets/akshar-satsang-mandal.png';
import loginSideImage from '../assets/login-side.jpeg';
import { useAuth } from '../hooks';
import { AUTH, LOGIN_LOCKOUT_LIMIT } from '../constants/messages';
import { DigitInput, ErrorBanner, LoginField, loginInputClass } from '../components/form/LoginField';
import SiteFooter from '../components/SiteFooter';

// Split-screen login matching the reference: imagery on the left at lg+, the form
// on a white panel to the right. Steps: main (PIN | Password tabs) -> otp -> setup.
//
// Backend messages are surfaced verbatim; the only frontend-authored copy is
// client-side validation and the network-failure fallback.

const PIN_LENGTH = 6;

const STEP = { MAIN: 'main', OTP: 'otp', SETUP: 'setup' };

/**
 * Ask the browser to offer "Save password?" after a successful password login.
 *
 * A single-page app submits with preventDefault and never navigates, so Chrome's
 * passive heuristic often stays silent; this fires the save prompt explicitly.
 * Chromium only (guarded by feature detection) — elsewhere the `name` +
 * `autocomplete` attributes on the fields let the browser's own detection do it.
 * Never for the PIN: it is a one-time-code field by design.
 */
function offerToSavePassword(mobile, password) {
  try {
    if (typeof window !== 'undefined' && window.PasswordCredential && navigator.credentials) {
      const cred = new window.PasswordCredential({ id: mobile, password, name: mobile });
      navigator.credentials.store(cred).catch(() => {});
    }
  } catch { /* unsupported or declined — the passive prompt still applies */ }
}

export default function LoginPage() {
  const { loginInit, loginWithPassword, loginWithPin, verifyOtp, completeSetup } = useAuth();

  const [step, setStep] = useState(STEP.MAIN);
  const [tab, setTab] = useState('pin'); // PIN is the default tab
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Last LoginFailureResponse for the number in the box: { isLocked, failedAttempts }.
  const [failure, setFailure] = useState(null);

  const [mobile, setMobile] = useState('');
  const [pin, setPin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [otp, setOtp] = useState('');
  const [purpose, setPurpose] = useState('SETUP');

  const [setup, setSetup] = useState({ password: '', confirmPassword: '', pin: '', confirmPin: '' });
  // Reveal toggles for the setup step, so the person can check what they typed.
  const [showSetupPass, setShowSetupPass] = useState(false);
  const [showSetupPin, setShowSetupPin] = useState(false);

  const mobileValid = mobile.length === 10;
  const pinValid = pin.length === PIN_LENGTH;

  // Both login endpoints share one lockout counter, so a wrong PIN and a wrong
  // password move the same number — switching tabs does not reset anything.
  const isLocked = failure?.isLocked === true;
  const attemptsLeft =
    !isLocked && failure?.failedAttempts != null
      ? Math.max(0, LOGIN_LOCKOUT_LIMIT - failure.failedAttempts)
      : null;

  /** Single guard for every request: one in flight at a time, errors surfaced. */
  const run = async (fn) => {
    if (busy) return; // prevents duplicate submissions
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (err) {
      // A wrong password/PIN comes back as a LoginFailureResponse. Its message is
      // shown like any other, but the attempt count and lock flag are kept too —
      // they are the only warning before the 5th failure locks the account.
      if (err?.failure) setFailure(err.failure);
      // Backend detail verbatim; generic text only when there was no response.
      setError(err?.status === 0 ? 'Network error. Please check your connection.' : err?.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const resetErrors = () => { setError(''); setNotice(''); };

  /** A different number is a different account — its predecessor's attempt count
   *  and lock state no longer apply. */
  const onMobileChange = (e) => {
    setMobile(e.target.value.replace(/\D/g, ''));
    setFailure(null);
    resetErrors();
  };

  const submitMain = (e) => {
    e.preventDefault();
    resetErrors();
    if (!mobileValid) return setError('Enter a valid 10-digit mobile number');
    // A locked account is refused by the backend anyway; spending the attempt
    // only burns rate limit and re-shows the message already on screen.
    if (isLocked) return;
    if (tab === 'pin') {
      if (!pinValid) return setError(`Enter all ${PIN_LENGTH} PIN digits`);
      return run(() => loginWithPin(mobile, pin));
    }
    if (!password) return setError('Enter your password');
    return run(async () => {
      await loginWithPassword(mobile, password);
      // Login succeeded — prompt the browser to remember it before the session
      // redirects away from this screen.
      offerToSavePassword(mobile, password);
    });
  };

  // PIN auto-submits once every digit is entered, matching the reference.
  const onPinComplete = (value) => {
    if (!mobileValid || busy || isLocked) return;
    resetErrors();
    run(() => loginWithPin(mobile, value));
  };

  const startForgot = () => {
    resetErrors();
    if (!mobileValid) return setError('Enter your mobile number first');
    return run(async () => {
      // login-init sends the OTP itself; there is no separate send-OTP endpoint.
      //
      // A locked account is deliberately *not* turned away here: the backend
      // still issues the RESET OTP for one, and this is the documented way out
      // of a lockout. Refusing on `is_locked` left locked users with no recovery
      // path at all short of an admin unlock.
      const res = await loginInit(mobile, true);
      setPurpose(res?.purpose || 'RESET');
      setNotice(res?.message || '');
      setOtp('');
      setStep(STEP.OTP);
    });
  };

  const submitOtp = (e) => {
    e?.preventDefault();
    resetErrors();
    if (otp.length !== 6) return setError('Enter all 6 OTP digits');
    return run(async () => {
      // Returns a SETUP/RESET-scoped token, which authorises set-credentials.
      await verifyOtp(mobile, otp, purpose);
      setSetup({ password: '', confirmPassword: '', pin: '', confirmPin: '' });
      setStep(STEP.SETUP);
    });
  };

  const submitSetup = (e) => {
    e.preventDefault();
    resetErrors();
    if (setup.password.length < 6) return setError('Password must be at least 6 characters');
    if (setup.password !== setup.confirmPassword) return setError('Passwords do not match');
    if (setup.pin.length !== PIN_LENGTH) return setError(`PIN must be exactly ${PIN_LENGTH} digits`);
    if (setup.pin !== setup.confirmPin) return setError('PINs do not match');
    return run(async () => {
      await completeSetup(mobile, setup.password, setup.pin);
      // Offer to save the password the person just chose, here at setup time —
      // the setup form has no username field for the browser to key on, so the
      // explicit store (id = mobile) is what makes the prompt appear now rather
      // than only on the next password sign-in.
      offerToSavePassword(mobile, setup.password);
      // The backend invalidates existing sessions, so sign in again. Setting new
      // credentials also clears the lockout, so the warning goes with it.
      setFailure(null);
      setStep(STEP.MAIN);
      setTab('pin');
      setPin('');
      setPassword('');
      setNotice('Setup complete. Please sign in with your new credentials.');
    });
  };

  const switchTab = (next) => {
    setTab(next);
    setPin('');
    setPassword('');
    resetErrors();
  };

  const submitDisabled =
    busy || isLocked || !mobileValid || (tab === 'password' ? !password : !pinValid);

  // `disabled:` resets the lift and the shadow as well as the opacity — a button
  // that still rises to meet the cursor reads as pressable when it is not.
  const primaryButton =
    'w-full rounded-2xl py-3 text-sm font-semibold text-white shadow-[0_4px_16px_rgba(0,49,88,0.30)] transition-all duration-200'
    + ' hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(0,49,88,0.36)]'
    + ' active:translate-y-0 active:scale-[0.98]'
    + ' disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0'
    + ' disabled:hover:shadow-[0_4px_16px_rgba(0,49,88,0.30)]';
  const primaryStyle = {
    // Three stops rather than two: the accent at the tail keeps the button in the
    // brand's pairing instead of reading as flat navy.
    background: 'linear-gradient(100deg,#003158 0%,#00436f 55%,#0a5688 100%)',
  };

  const spinner = <span className="mx-auto block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />;

  return (
    // A column, so the copyright bar can sit across the full width beneath both
    // panels. The row that was here is now the flexible middle of it: `min-h-0`
    // is what lets that row shrink instead of pushing the footer off a short
    // viewport, which is the usual way a `h-dvh` layout loses its last child.
    <div className="flex h-dvh flex-col overflow-hidden bg-[#F0F4F8]">
      <div className="flex min-h-0 flex-1 overflow-hidden">
      {/* Imagery panel — desktop only, so everything in it is free: none of it
          exists at the widths where the form is fighting for vertical room. */}
      <div className="relative hidden overflow-hidden lg:block lg:w-[48%] xl:w-1/2">
        <img src={loginSideImage} alt="" className="absolute inset-0 h-full w-full object-cover object-center" />
        {/* Deeper at the foot than before, and warmed with the brand accent, so
            the caption below sits on its own contrast rather than on whatever
            the photograph happens to be doing there. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#001F3D]/85 via-[#00223f]/25 to-transparent" />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 60% 45% at 15% 100%, rgba(255,134,42,0.28) 0%, transparent 70%)' }}
        />

        <div className="absolute inset-x-0 bottom-0 p-10 xl:p-12">
          <span className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.25em] text-white/85 backdrop-blur-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
            Akshar Connect
          </span>
          <h2 className="font-display text-3xl font-bold leading-tight text-white xl:text-4xl">
            Jai Swaminarayan
          </h2>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-white/75">
            Sign in to continue to your Mandal — attendance, events and seva, in one place.
          </p>
        </div>
      </div>

      {/* `relative` for the decorative glow below, which is absolutely placed and
          therefore costs no layout height on a phone. */}
      <div className="relative flex h-full flex-1 flex-col overflow-hidden bg-white">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-64"
          style={{ background: 'radial-gradient(ellipse 75% 100% at 50% 0%, rgba(255,134,42,0.10) 0%, transparent 70%)' }}
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-48"
          style={{ background: 'radial-gradient(ellipse 70% 100% at 50% 100%, rgba(0,49,88,0.07) 0%, transparent 70%)' }}
          aria-hidden="true"
        />
        {/* THE FULL CREDIT — "Akshar Satsang Mandal presents Akshar Connect" —
            on ONE ROW.
            This header has been three things. It began as the two marks and a
            "Presents" rule STACKED: three rows and ~170px of a viewport the
            form needs, which pushed the tallest step (Setup — two passwords and
            two PIN grids) off a laptop screen. The Mandal mark was then moved
            out to the imagery panel, leaving one logo here.

            The imagery panel is `lg:block`, so that arrangement showed the
            Mandal nothing below lg: a phone saw only the product's mark and the
            organisation behind it went unnamed on the one screen every member
            starts from.

            SIDE BY SIDE COSTS NOTHING THE STACK COST. Both files are square
            (400×400), so a row of them is exactly as tall as the taller one —
            the same height this header already had with a single logo. The
            credit is back, in full, at no vertical price, and the Setup step
            still clears a laptop screen.

            The version pill that briefly sat below this row is still gone: a
            build number is provenance for whoever is debugging, not something
            the person signing in has any use for. It lives in the footer. */}
        <div className="relative flex flex-shrink-0 items-center justify-center gap-2.5 px-4 pb-2 pt-4 sm:gap-4 sm:pt-5">
          {/* The PRESENTER, so it is the smaller of the two — the sentence reads
              "X presents Y", and Y is what this screen is. */}
          <img
            src={satsangMandalLogo}
            alt="Akshar Satsang Mandal"
            className="h-11 w-auto shrink-0 sm:h-12 lg:h-14"
          />
          {/* `aria-hidden`: the two `alt` texts already read as the sentence, and
              a screen reader announcing "presents" between two logos that are
              not links reads as a stray word. Kept visible because sighted
              readers are exactly who the lockup is a sentence for. */}
          <span
            aria-hidden="true"
            className="shrink-0 text-[9px] font-bold uppercase tracking-[0.2em] text-text-muted sm:text-[10px]"
          >
            presents
          </span>
          <img
            src={aksharConnectLogo}
            alt="Akshar Connect"
            className="h-14 w-auto shrink-0 sm:h-16 lg:h-20"
          />
        </div>

        {/* overflow-y-auto stays as a safety net rather than a layout choice: on a
            genuinely short viewport (a phone in landscape, a 600px window) the
            form must still be reachable, and clipping it would be worse than a
            scrollbar. At normal heights it now has nothing to scroll. */}
        <div className="relative mx-auto flex w-full min-h-0 max-w-[520px] flex-1 flex-col justify-start overflow-y-auto px-5 pb-3 pt-2 sm:px-12 lg:justify-center lg:py-2 xl:px-16">
          {step === STEP.MAIN && (
            <>
              <div className="mb-4 text-center">
                <h1 className="mb-1 font-display text-[1.5rem] font-bold leading-tight text-primary sm:text-[1.75rem]">Welcome Back</h1>
                <p className="text-sm font-medium text-[#9BB5CB]">Welcome back, please enter your details</p>
              </div>

              <form onSubmit={submitMain} className="space-y-3.5">
                <div
                  className="mb-2 flex gap-1 rounded-2xl border border-[#E4EBF3] p-1"
                  style={{ background: '#F0F4F8' }}
                >
                  {['pin', 'password'].map((key) => {
                    const on = tab === key;
                    const Glyph = key === 'pin' ? Lock : KeyRound;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={busy}
                        onClick={() => switchTab(key)}
                        aria-pressed={on}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-all duration-200 disabled:opacity-60 ${
                          on ? 'bg-white text-primary' : 'text-[#9BB5CB] hover:text-primary'
                        }`}
                        style={on ? { boxShadow: '0 2px 8px rgba(0,49,88,0.10)' } : {}}
                      >
                        <Glyph className="h-3.5 w-3.5" />
                        {key === 'pin' ? 'PIN' : 'Password'}
                      </button>
                    );
                  })}
                </div>

                <LoginField label="Mobile Number" icon={<Phone className="h-5 w-5" />} valid={mobileValid}>
                  <input
                    id="login-mobile"
                    name="username"
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    autoFocus
                    autoComplete="username"
                    disabled={busy}
                    value={mobile}
                    onChange={onMobileChange}
                    placeholder="Enter mobile number"
                    className={loginInputClass}
                  />
                </LoginField>
                {mobile.length > 0 && !mobileValid && (
                  <p className="error-text -mt-2 pl-1">Enter a valid 10-digit number</p>
                )}

                {tab === 'password' ? (
                  <LoginField label="Password" icon={<Lock className="h-5 w-5" />} valid={password.length >= 6}>
                    <div className="flex items-center gap-1">
                      <input
                        id="login-password"
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        disabled={busy}
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); resetErrors(); }}
                        placeholder="Enter your password"
                        className={loginInputClass}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        className="ml-1 flex-shrink-0 text-[#9BB5CB] transition-colors hover:text-primary"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </LoginField>
                ) : (
                  <div>
                    <p className="mb-2 pl-1 text-xs font-semibold text-[#9BB5CB]">{PIN_LENGTH}-digit PIN</p>
                    <DigitInput
                      length={PIN_LENGTH}
                      value={pin}
                      onChange={(v) => { setPin(v); resetErrors(); }}
                      onComplete={onPinComplete}
                      masked
                      disabled={busy}
                      // Jump the cursor here the moment the 10-digit number is
                      // complete, so the PIN can be typed without reaching for
                      // the field. Re-fires if the number is edited back to ten.
                      autoFocus={mobileValid}
                    />
                  </div>
                )}

                <ErrorBanner message={error} />
                {/* The backend's own message is in the banner above; these add only
                    what it does not say — the way back in, and how much room is
                    left before the account locks. */}
                {isLocked && <p className="pl-1 text-[11px] font-medium text-danger-fg">{AUTH.locked}</p>}
                {!isLocked && attemptsLeft != null && attemptsLeft > 0 && (
                  <p className="pl-1 text-[11px] font-medium text-accent">{AUTH.attemptsLeft(attemptsLeft)}</p>
                )}
                {notice && !error && <p className="pl-1 text-xs font-medium text-text-muted">{notice}</p>}

                <button type="submit" className={primaryButton} style={primaryStyle} disabled={submitDisabled}>
                  {busy ? spinner : 'Continue →'}
                </button>

                <button
                  type="button"
                  onClick={startForgot}
                  disabled={busy}
                  className="w-full text-center text-sm font-semibold text-accent transition-colors hover:text-accent-hover disabled:opacity-60"
                >
                  Forgot Password / First Time Setup
                </button>
              </form>
            </>
          )}

          {step === STEP.OTP && (
            <>
              <div className="mb-4">
                <div
                  className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ background: 'rgba(255,134,42,0.10)' }}
                >
                  <MessageCircle className="h-6 w-6 text-accent" />
                </div>
                <h1 className="mb-1 font-display text-[1.5rem] font-bold leading-tight text-primary sm:text-[1.75rem]">Check WhatsApp</h1>
                <p className="text-sm font-medium text-[#9BB5CB]">
                  OTP sent to <span className="font-bold text-accent">+91 {mobile}</span>
                </p>
              </div>

              <form onSubmit={submitOtp} className="space-y-3.5">
                <DigitInput
                  length={6}
                  value={otp}
                  onChange={(v) => { setOtp(v); resetErrors(); }}
                  onComplete={() => submitOtp()}
                  disabled={busy}
                  autoFocus
                />

                <ErrorBanner message={error} />
                {notice && !error && <p className="text-center text-xs font-medium text-text-muted">{notice}</p>}

                <button type="submit" className={primaryButton} style={primaryStyle} disabled={busy || otp.length !== 6}>
                  {busy ? spinner : 'Verify OTP'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep(STEP.MAIN); resetErrors(); }}
                  disabled={busy}
                  className="w-full text-center text-sm font-semibold text-accent transition-colors hover:text-accent-hover disabled:opacity-60"
                >
                  Back to sign in
                </button>
              </form>
            </>
          )}

          {step === STEP.SETUP && (
            <>
              <div className="mb-4">
                <div
                  className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ background: 'rgba(255,134,42,0.10)' }}
                >
                  <ShieldCheck className="h-6 w-6 text-accent" />
                </div>
                <h1 className="mb-1 font-display text-[1.5rem] font-bold leading-tight text-primary sm:text-[1.75rem]">Account Setup</h1>
                <p className="text-sm font-medium text-[#9BB5CB]">Choose a password and a {PIN_LENGTH}-digit PIN</p>
              </div>

              <form onSubmit={submitSetup} className="space-y-3.5">
                <LoginField label="New Password" icon={<Lock className="h-5 w-5" />} valid={setup.password.length >= 6}>
                  <div className="flex items-center gap-1">
                    <input
                      type={showSetupPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      disabled={busy}
                      value={setup.password}
                      onChange={(e) => { setSetup((s) => ({ ...s, password: e.target.value })); resetErrors(); }}
                      placeholder="At least 6 characters"
                      className={loginInputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSetupPass((v) => !v)}
                      className="ml-1 flex-shrink-0 text-[#9BB5CB] transition-colors hover:text-primary"
                      aria-label={showSetupPass ? 'Hide password' : 'Show password'}
                    >
                      {showSetupPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </LoginField>

                <LoginField
                  label="Confirm Password"
                  icon={<Lock className="h-5 w-5" />}
                  valid={Boolean(setup.confirmPassword) && setup.confirmPassword === setup.password}
                >
                  <div className="flex items-center gap-1">
                    <input
                      type={showSetupPass ? 'text' : 'password'}
                      autoComplete="new-password"
                      disabled={busy}
                      value={setup.confirmPassword}
                      onChange={(e) => { setSetup((s) => ({ ...s, confirmPassword: e.target.value })); resetErrors(); }}
                      placeholder="Re-enter password"
                      className={loginInputClass}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSetupPass((v) => !v)}
                      className="ml-1 flex-shrink-0 text-[#9BB5CB] transition-colors hover:text-primary"
                      aria-label={showSetupPass ? 'Hide password' : 'Show password'}
                    >
                      {showSetupPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </LoginField>

                <div>
                  <div className="mb-2 flex items-center justify-between pl-1">
                    <p className="text-xs font-semibold text-[#9BB5CB]">{PIN_LENGTH}-digit PIN</p>
                    <button
                      type="button"
                      onClick={() => setShowSetupPin((v) => !v)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#9BB5CB] transition-colors hover:text-primary"
                      aria-label={showSetupPin ? 'Hide PIN' : 'Show PIN'}
                    >
                      {showSetupPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {showSetupPin ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <DigitInput
                    length={PIN_LENGTH}
                    value={setup.pin}
                    onChange={(v) => { setSetup((s) => ({ ...s, pin: v })); resetErrors(); }}
                    masked={!showSetupPin}
                    disabled={busy}
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between pl-1">
                    <p className="text-xs font-semibold text-[#9BB5CB]">Confirm PIN</p>
                    <button
                      type="button"
                      onClick={() => setShowSetupPin((v) => !v)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-[#9BB5CB] transition-colors hover:text-primary"
                      aria-label={showSetupPin ? 'Hide PIN' : 'Show PIN'}
                    >
                      {showSetupPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {showSetupPin ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <DigitInput
                    length={PIN_LENGTH}
                    value={setup.confirmPin}
                    onChange={(v) => { setSetup((s) => ({ ...s, confirmPin: v })); resetErrors(); }}
                    masked={!showSetupPin}
                    disabled={busy}
                  />
                </div>

                <ErrorBanner message={error} />

                <button
                  type="submit"
                  className={primaryButton}
                  style={primaryStyle}
                  disabled={busy || !setup.password || !setup.confirmPassword || setup.pin.length !== PIN_LENGTH || setup.confirmPin.length !== PIN_LENGTH}
                >
                  {busy ? spinner : 'Complete Setup'}
                </button>
              </form>
            </>
          )}
        </div>

        {/* NO LOGO DOWN HERE, and none on the imagery panel either. Both marks
            live in the one lockup above the form, which is the only place on
            this screen that exists at every width — so a phone and a desktop
            now show the same credit rather than the desktop showing more.
            An `lg:hidden` copy used to stand in here for the imagery panel on a
            phone; the lockup replaced the need for it. */}
      </div>
      </div>

      {/* Transparent here: this screen has no dark header for a blue bar to
          answer to, so it sits on the panel's own pale ground. */}
      <SiteFooter transparent />
    </div>
  );
}
