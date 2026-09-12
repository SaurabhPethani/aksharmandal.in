import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from './ui';

/**
 * Catches render-time throws so one bad value cannot blank the whole app.
 *
 * A class, because `getDerivedStateFromError` / `componentDidCatch` have no hook
 * equivalent — this is the one place in the codebase where that is true.
 *
 * Two of these are mounted, deliberately:
 *
 *   root      (main.jsx)   the last resort. Everything below it is gone, so it
 *                          offers a reload and nothing else.
 *   per-page  (AppShell)   wraps <Outlet/>, so a page that throws leaves the
 *                          sidebar, header and navigation intact and the user
 *                          can simply go somewhere else. `resetKey` is the
 *                          pathname, so navigating away clears the error
 *                          without a reload.
 *
 * It also catches a failed lazy chunk — React surfaces a rejected dynamic
 * import as a render error — which is the one way the app could previously
 * suspend forever after a mid-session deploy.
 *
 * What it cannot catch (React's own limits, not an oversight): errors thrown in
 * event handlers, in async callbacks, or during SSR. Those are already handled —
 * every request path goes through ApiError and the toast/ErrorState components.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Deliberately the only console call in `src/`. There is no error-reporting
    // service wired up yet, and a crash that leaves no trace anywhere is worse
    // than one line in a console nobody may read. Replace this with the reporter
    // when one is added — see docs/AUDIT.md §9 E4.
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info?.componentStack);
    }
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prevProps) {
    // Navigating away from a broken page clears the error. Without this the
    // boundary would keep rendering the fallback over whatever comes next.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { title = 'Something went wrong', variant = 'page' } = this.props;

    return (
      <div className={variant === 'root' ? 'grid min-h-dvh place-items-center bg-bg p-6' : 'grid min-h-[60vh] place-items-center'}>
        <div className="flex max-w-md flex-col items-center gap-3 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-danger-bg text-danger-fg">
            <AlertTriangle className="h-7 w-7" />
          </span>
          <h1 className="page-title">{title}</h1>
          <p className="text-sm text-text-muted">
            This screen ran into an unexpected problem. Nothing you were viewing has been changed.
          </p>

          {/* The message is for whoever has to diagnose it, so it is shown rather
              than swallowed — but only in dev, since a raw stack means nothing to
              a member and can leak internals. */}
          {import.meta.env.DEV && (
            <pre className="max-w-full overflow-x-auto rounded-control bg-bg px-3 py-2 text-left text-xs text-danger-fg">
              {String(error?.message || error)}
            </pre>
          )}

          <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
            <Button variant="primary" onClick={() => window.location.reload()}>
              Reload the page
            </Button>
            {variant === 'page' && (
              <Button variant="outline" onClick={() => this.setState({ error: null })}>
                Try again
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
