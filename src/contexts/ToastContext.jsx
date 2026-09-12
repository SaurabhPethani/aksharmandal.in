import { createContext, useCallback, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X, XCircle } from 'lucide-react';

export const ToastContext = createContext(null);

// Solid, high-contrast tones: white text on a filled background, so the outcome
// reads at a glance without parsing the wording. Warnings are amber rather than
// red — "you can fix this" should not look like "the server fell over".
const TONES = {
  success: { icon: CheckCircle2, cls: 'bg-[#15803D] text-white' },
  error: { icon: XCircle, cls: 'bg-[#B91C1C] text-white' },
  warning: { icon: AlertTriangle, cls: 'bg-[#B45309] text-white' },
  info: { icon: Info, cls: 'bg-primary text-white' },
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const seq = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const push = useCallback((message, { tone = 'info', duration = 4000 } = {}) => {
    const id = ++seq.current;
    setToasts((list) => [...list, { id, message, tone }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const value = useMemo(() => ({
    push,
    dismiss,
    success: (m, o) => push(m, { ...o, tone: 'success' }),
    error: (m, o) => push(m, { ...o, tone: 'error' }),
    warning: (m, o) => push(m, { ...o, tone: 'warning' }),
    info: (m, o) => push(m, { ...o, tone: 'info' }),
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Top-right, above modals and drawers. aria-live so an outcome is
          announced rather than only seen. */}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-[80] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => {
          const tone = TONES[t.tone] ?? TONES.info;
          const Icon = tone.icon;
          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto flex items-start gap-3 overflow-hidden rounded-card p-3.5 shadow-lg ${tone.cls}`}
            >
              <span className="mt-0.5 shrink-0"><Icon className="h-5 w-5" /></span>
              <p className="flex-1 text-sm font-medium">{t.message}</p>
              <button
                onClick={() => dismiss(t.id)}
                className="shrink-0 rounded-lg p-1 text-white/75 transition-colors hover:bg-white/20 hover:text-white"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
