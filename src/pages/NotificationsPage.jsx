import { Link } from 'react-router-dom';
import { ArrowRight, Bell, FilePenLine, Send } from 'lucide-react';
import { useNotifications } from '../hooks/useNotifications';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import ForbiddenPage from './ForbiddenPage';
import { groupByDay, relativeTime } from '../utils/notifications';

/**
 * Every notification, grouped by day — the bell's dropdown shows the newest few
 * and links here for the rest.
 *
 * A static route like /profile rather than a module page: notifications are not
 * a module in full-context and carry no grant of their own. What a reader sees
 * here is decided entirely by the grants on the SOURCES (see
 * hooks/useNotifications.js), so a role that reviews nothing gets an empty
 * screen rather than a 403.
 */

const ICONS = { info: FilePenLine, transfer: ArrowRight, 'transfer-mine': Send };

function NotificationRow({ entry }) {
  const Icon = ICONS[entry.kind] ?? Bell;
  const when = relativeTime(entry.at);

  return (
    <Link
      to={entry.href}
      className={`flex gap-3 px-4 py-4 transition-colors hover:bg-primary-50/50 sm:px-5 ${
        entry.unread ? 'bg-accent/[0.04]' : ''
      }`}
    >
      <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-primary">{entry.title}</span>
        {entry.detail && (
          <span className="mt-0.5 block text-sm leading-snug text-text-muted">{entry.detail}</span>
        )}
        {when && <span className="mt-1 block text-xs text-text-faint">{when}</span>}
      </span>
      {entry.unread && (
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" role="img" aria-label="Unread" />
      )}
    </Link>
  );
}

export default function NotificationsPage() {
  const { items, unreadCount, isLoading, error, markAllRead, canViewAll } = useNotifications();

  // Refused rather than shown empty. Both readings are "there is nothing here",
  // but only one of them is true: a caller with no source is not caught up, they
  // are not permitted, and an empty list would tell them the wrong thing.
  // The bell itself stays in the header for everyone — this is the page, not the
  // icon. Nothing is bypassed either way: the sources are gated server-side too.
  if (!canViewAll) {
    return (
      <ForbiddenPage
        title="Notifications unavailable"
        message="Your role does not grant transfer review or information-change approval, so there is no notification list to show."
      />
    );
  }

  const groups = groupByDay(items);

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Transfer approvals, information-change requests and updates on your own requests"
        actions={
          unreadCount > 0
            ? [<Button key="read" onClick={markAllRead}>Mark all read</Button>]
            : []
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="card flex gap-3">
              <Skeleton className="h-10 w-10 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card">
          <ErrorState error={error} title="Could not load notifications" />
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState
            title="You’re all caught up"
            hint="Transfer approvals and information-change requests will appear here."
            icon={Bell}
          />
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className="eyebrow mb-2">{group.label}</h2>
              {/* One card per day, rows divided inside it — matching the
                  reference screen, where a day reads as a single block. */}
              <div className="card divide-y divide-line-soft !p-0">
                {group.items.map((entry) => (
                  <NotificationRow key={entry.id} entry={entry} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
