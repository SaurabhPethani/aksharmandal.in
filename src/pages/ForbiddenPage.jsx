import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';
import { Button } from '../components/ui';

/**
 * 403 for a route that exists but the caller's grants do not cover.
 *
 * Every module full-context describes gets a route, granted or not, and an
 * ungranted one lands here rather than on the 404 — "you may not see this" and
 * "this does not exist" are different answers, and only the first is true.
 *
 * Nothing is bypassed by reaching this page: it decides what is *rendered*, and
 * the backend gates every request independently.
 */
export default function ForbiddenPage({
  title = 'Permission denied',
  message = 'Your role does not grant access to this page.',
  backTo = '/dashboard',
  backLabel = 'Back to dashboard',
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-danger-bg text-danger-fg">
          <ShieldAlert className="h-7 w-7" />
        </span>
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Error 403</p>
        <h1 className="page-title">{title}</h1>
        <p className="text-sm text-text-muted">{message}</p>
        <Link to={backTo}>
          <Button variant="primary">{backLabel}</Button>
        </Link>
      </div>
    </div>
  );
}
