import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, CheckCircle2, ScanLine, X } from 'lucide-react';
import { Button } from '../ui';

// QR scanning over a getUserMedia stream, decoded two ways.
//
//   BarcodeDetector  the platform's own, where it exists — Android Chrome,
//                    ChromeOS, recent macOS. Hardware-accelerated, no bundle
//                    cost, so it is preferred when available.
//   jsQR             everywhere else, decoding frames drawn to a canvas.
//
// The second is why this component no longer refuses to run. BarcodeDetector is
// NOT in Chrome on Windows — the browser most of this app's admin work happens
// in — so "use a desktop Chromium browser to scan" was advice that could not be
// followed, and the scanner was effectively dead on every desktop.
//
// jsQR is loaded lazily: the decoder is ~40 KB and only a caller who actually
// starts a camera needs it.

const HAS_NATIVE = typeof window !== 'undefined' && 'BarcodeDetector' in window;
const HAS_CAMERA = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
/** Scanning needs a camera. The decoder is always available — jsQR is bundled. */
const SUPPORTED = HAS_CAMERA;

/** Frames per second handed to jsQR. Full rAF would decode 60 and pin a core. */
const SOFTWARE_FPS = 10;

// A held-up code is decoded many times a second; the same value is ignored for
// this long so one physical scan produces one mark.
const REPEAT_MS = 2500;

export default function QrScanner({
  onScan,
  disabled = false,
  disabledHint,
  /** Named under the frame, so what is being marked is never in doubt. */
  sessionLabel,
  /** What the strip under the frame says after the last scan. */
  status,
  /**
   * Told whenever the camera goes live or stops, so the page can put the
   * session counters up and take the Sabha picker down: while scanning, the
   * screen is the viewfinder and nothing else.
   */
  onActiveChange,
}) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(0);
  const lastRef = useRef({ value: null, at: 0 });
  const flashTimer = useRef(0);
  /**
   * Which start attempt is the live one.
   *
   * React 18 mounts effects twice in development, so the auto-start below runs,
   * is torn down, and runs again. Without this the first attempt's `play()` is
   * still pending when its stream is stopped, and the browser reports "The
   * play() request was interrupted by a new load request" — a banner about a
   * camera that is, by then, working perfectly.
   */
  const runRef = useRef(0);

  const [state, setState] = useState('idle'); // idle | starting | scanning | error
  const [error, setError] = useState(null);
  // Rear camera. There is no flip control any more — a member holds their code
  // up to the device, which is what the back camera is for, and the front one
  // was a wrong turn nobody took twice.
  const [facing] = useState('environment');
  const [flash, setFlash] = useState(false);

  const stop = useCallback(() => {
    runRef.current += 1;   // anything still starting is now stale
    cancelAnimationFrame(rafRef.current);
    clearTimeout(flashTimer.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState('idle');
  }, []);

  // Tearing the camera down on unmount matters: a live track keeps the device
  // light on and the browser's "in use" indicator lit after navigating away.
  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    if (disabled) return;
    const run = (runRef.current += 1);
    const live = () => runRef.current === run;
    setError(null);
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      // Superseded while the permission prompt was open: drop this camera
      // rather than leaving a second track running behind the live one.
      if (!live()) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      // AbortError here means this attempt was replaced mid-play, which is not
      // a failure the user has anything to do about.
      await video.play().catch((err) => { if (err?.name !== 'AbortError') throw err; });
      if (!live()) return;
      setState('scanning');

      // Native where it exists; otherwise jsQR over a canvas the size of the
      // stream. `read` returns the decoded string, or null for this frame.
      let read;
      if (HAS_NATIVE) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
        read = async () => (await detector.detect(videoRef.current))?.[0]?.rawValue ?? null;
      } else {
        const { default: jsQR } = await import('jsqr');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let lastFrameAt = 0;
        read = async () => {
          const now = Date.now();
          if (now - lastFrameAt < 1000 / SOFTWARE_FPS) return null;
          lastFrameAt = now;
          const v = videoRef.current;
          if (!v?.videoWidth) return null;
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          // `attemptBoth` reads codes shown on a screen as well as on paper —
          // a member holding up their phone is the common case here.
          return jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data ?? null;
        };
      }

      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const value = await read();
          const now = Date.now();
          if (value && !(lastRef.current.value === value && now - lastRef.current.at < REPEAT_MS)) {
            lastRef.current = { value, at: now };
            setFlash(true);
            // Held in a ref and cleared by `stop`, so navigating away mid-scan
            // does not leave a timer firing at a component that is gone.
            clearTimeout(flashTimer.current);
            flashTimer.current = setTimeout(() => setFlash(false), 600);
            onScan?.(value);
          }
        } catch {
          // A single failed frame is normal (motion blur, mid-resize); keep going
          // rather than tearing the camera down.
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err) {
      if (!live() || err?.name === 'AbortError') return;
      setState('error');
      setError(
        err?.name === 'NotAllowedError'
          ? 'Camera permission was denied. Allow camera access in your browser, then try again.'
          : err?.name === 'NotFoundError'
            ? 'No camera was found on this device.'
            : err?.message || 'The camera could not be started.'
      );
    }
  }, [disabled, facing, onScan]);


  const active = state === 'scanning' || state === 'starting';
  useEffect(() => { onActiveChange?.(active); }, [active, onActiveChange]);

  // Tearing down on unmount is handled by the effect near `stop`. Starting is a
  // deliberate press: the camera light coming on by itself, on a page someone
  // opened to look at a list, is not something to do without being asked.

  if (!SUPPORTED) {
    return (
      <div className="rounded-card border border-dashed border-line-strong bg-bg px-5 py-8 text-center">
        <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary-50 text-primary">
          <CameraOff className="h-6 w-6" />
        </span>
        <p className="text-sm font-semibold text-primary">No camera is available in this browser</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-text-muted">
          Scanning needs a camera and a secure page (https, or localhost). You can still mark
          attendance from the member list below.
        </p>
      </div>
    );
  }

  // Idle: no camera, no preview — just the one thing to press.
  if (state === 'idle') {
    return (
      <div className="space-y-3">
        <Button
          variant="primary"
          onClick={start}
          disabled={disabled}
          className="w-full !py-3.5"
        >
          <Camera className="h-4 w-4" />
          Start Scanner
        </Button>
        {disabled && (
          <p className="text-center text-sm text-text-muted">
            {disabledHint ?? 'Select a Sabha to enable the scanner.'}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* A square, centred. A QR code is square, so the viewfinder that frames
          it should be too — a wide frame is mostly room either side of the code.
          Capped by the viewport as well as by a maximum, so the whole panel and
          what follows it stay on one screen. */}
      <div
        className="relative mx-auto overflow-hidden rounded-card border border-line-soft bg-primary"
        style={{ width: 'min(52vh, 26rem, 100%)' }}
      >
        <div className="relative aspect-square w-full">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`h-full w-full object-cover ${state === 'scanning' ? '' : 'invisible'}`}
          />

          {state !== 'scanning' && (
            <div className="absolute inset-0 grid place-items-center px-6 text-center">
              <div>
                <span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-white/10 text-white/80">
                  <ScanLine className="h-7 w-7" />
                </span>
                <p className="text-sm font-semibold text-white">
                  {state === 'starting' ? 'Starting camera…' : 'Scanner is off'}
                </p>
                <p className="mt-1 text-xs text-white/70">
                  {disabled
                    ? disabledHint ?? 'Select a Sabha to enable the scanner.'
                    : 'Start the scanner and hold a member’s QR code in view.'}
                </p>
              </div>
            </div>
          )}

          {/* Viewfinder: orange brackets at the edges of the frame, a white
              square in the middle marking where to hold the code. */}
          {state === 'scanning' && (
            <div className="pointer-events-none absolute inset-0">
              <span className="absolute inset-[18%] rounded-sm border-[3px] border-white/90" />
              <div className="absolute inset-[6%]">
                {['left-0 top-0 border-l-4 border-t-4', 'right-0 top-0 border-r-4 border-t-4',
                  'bottom-0 left-0 border-b-4 border-l-4', 'bottom-0 right-0 border-b-4 border-r-4',
                ].map((cls) => (
                  <span key={cls} className={`absolute h-8 w-8 rounded-sm border-accent ${cls}`} />
                ))}
              </div>
            </div>
          )}

          {/* Success flash. */}
          {flash && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center bg-success-fg/25">
              <CheckCircle2 className="h-20 w-20 animate-ping text-white" />
              <CheckCircle2 className="absolute h-20 w-20 text-white" />
            </div>
          )}
        </div>
      </div>

      {/* One line for what the scanner is doing: ready, or whatever the last
          scan produced. Dashed, so it reads as a status rather than a control. */}
      <div className="rounded-control border border-dashed border-line-strong bg-bg px-4 py-3 text-center">
        <p className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
          <span className={`h-2 w-2 rounded-full ${state === 'scanning' ? 'bg-[#3B82F6]' : 'bg-[#C0CDE0]'}`} />
          {state === 'starting'
            ? 'Starting camera…'
            : status || 'Ready — point camera at a QR code'}
        </p>
      </div>

      {error && (
        <p className="rounded-control border border-danger-fg/30 bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <button
          type="button"
          onClick={stop}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-danger-fg transition-colors hover:opacity-80"
        >
          <X className="h-4 w-4" />
          Stop Scanner
        </button>
        {sessionLabel && (
          <div className="text-right">
            <p className="eyebrow">Current session</p>
            <p className="text-sm font-bold text-primary">{sessionLabel}</p>
          </div>
        )}
      </div>

    </div>
  );
}
