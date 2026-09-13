import { useEffect, useRef } from 'react';
import { AlertCircle, Check } from 'lucide-react';

// Login-specific field chrome, matching the reference screen: an icon, a small
// label stacked above the input, a green tick once the value is valid, and a red
// border when it is not.

export function LoginField({ label, icon, valid = false, error = false, children }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-2xl bg-white px-4 py-3 transition-all duration-200 ${
        error ? '' : 'focus-within:border-primary/50 focus-within:shadow-[0_0_0_3px_rgba(0,49,88,0.08)]'
      }`}
      style={{ border: error ? '1.5px solid #EF4444' : '1.5px solid #E0EAF4' }}
    >
      <div className="flex-shrink-0 text-[#9BB5CB]">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="mb-0.5 text-[11px] font-semibold leading-none text-[#9BB5CB]">{label}</p>
        {children}
      </div>
      {valid && (
        <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-success-fg text-white">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
    </div>
  );
}

export const loginInputClass =
  'w-full bg-transparent text-sm font-semibold text-primary placeholder:text-[#C5D8E8] focus:outline-none disabled:opacity-60';

/** Backend error banner. Messages are shown verbatim — never rewritten. */
export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3">
      <AlertCircle className="h-4 w-4 flex-shrink-0 text-[#EF4444]" />
      <p className="text-sm font-medium text-[#EF4444]">{message}</p>
    </div>
  );
}

/**
 * Segmented numeric input. Advances on entry, steps back on Backspace, accepts a
 * pasted code, and calls onComplete once every box is filled.
 */
export function DigitInput({ length = 6, value, onChange, onComplete, masked = false, disabled = false, autoFocus = false }) {
  const refs = useRef([]);
  const digits = Array.from({ length }, (_, i) => value[i] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const commit = (next) => {
    const joined = next.join('');
    onChange(joined);
    if (joined.length === length && next.every(Boolean)) onComplete?.(joined);
  };

  const setDigit = (i, raw) => {
    // A paste lands in one box — spread it across the remaining boxes.
    const only = raw.replace(/\D/g, '');
    if (only.length > 1) {
      const next = [...digits];
      for (let k = 0; k < only.length && i + k < length; k += 1) next[i + k] = only[k];
      commit(next);
      refs.current[Math.min(i + only.length, length - 1)]?.focus();
      return;
    }
    if (!/^\d?$/.test(only)) return;
    const next = [...digits];
    next[i] = only;
    commit(next);
    if (only && i < length - 1) refs.current[i + 1]?.focus();
  };

  const onKeyDown = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < length - 1) refs.current[i + 1]?.focus();
  };

  return (
    /* PHONE: the boxes divide the row between them, so the group is exactly as
       wide as the fields above it — `flex-1` on each, `w-full` here.
       `sm` AND UP: unchanged — `flex-none` hands each box back to its fixed
       3rem width and the group centres, which is what the wider panel was
       designed around. */
    <div className="flex w-full gap-2 sm:justify-center sm:gap-3">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          type={masked ? 'password' : 'text'}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length}
          value={d}
          disabled={disabled}
          onChange={(e) => setDigit(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          className="pin-digit min-w-0 flex-1 sm:flex-none"
          aria-label={`Digit ${i + 1}`}
        />
      ))}
    </div>
  );
}
