import { useRef } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bell, FilePenLine, Inbox, Send } from 'lucide-react';
import { useDisclosure, useDismissable } from '../hooks';
import { useNotifications } from '../hooks/useNotifications';
import { badgeLabel, relativeTime } from '../utils/notifications';

/**
 * The header bell and its dropdown — a PREVIEW, not the list.
 *
 * It shows the newest few and sends the reader to /notifications for the rest;
 * a dropdown that tried to hold everything would need its own paging inside a
 * 380px box. Every row is a link into the screen that can actually act on the
 * item, so the popup is a way in rather than a place to work.
 */

const PREVIEW_LIMIT = 6;

/** One glyph per source, so a row's kind reads before its words do. */
const ICONS = { info: FilePenLine, transfer: ArrowRight, 'transfer-mine': Send };

function Row({ entry, onNavigate, className = '' }) {
  const Icon = ICONS[entry.kind] ?? Bell;
  const when = relativeTime(entry.at);

  return (
    <Link
      to={entry.href}
      onClick={onNavigate}
      className={`flex gap-3 px-4 py-3 transition-colors hover:bg-primary-50/50 ${
        entry.unread ? 'bg-accent/[0.04]' : ''
      } ${className}`}
    >
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold leading-snug text-primary">{entry.title}</span>
        {entry.detail && (
          <span className="mt-0.5 block text-xs leading-snug text-text-muted">{entry.detail}</span>
        )}
        {when && <span className="mt-1 block text-xs text-text-faint">{when}</span>}
      </span>
      {/* The unread mark. `aria-label` rather than a bare dot, so it is not a
          purely visual distinction. */}
      {entry.unread && (
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent"
          role="img"
          aria-label="Unread"
        />
      )}
    </Link>
  );
}

export default function NotificationBell() {
  const { isOpen, toggle, close } = useDisclosure();
  const wrap = useRef(null);
  useDismissable(wrap, close, isOpen);

  const { items, unreadCount, isLoading, error, markAllRead, canViewAll } = useNotifications();

  // THE BELL IS UNCONDITIONAL. It renders for every signed-in member, whatever
  // they are granted — it is a fixture of the header, like the profile chip, not
  // a feature that appears and disappears with a role.
  //
  // What each reader SEES inside it is still decided by their grants, in
  // useNotifications: a caller with no readable source simply gets the
  // caught-up state. That is a gate on the data, not on the chrome, and the two
  // must not be confused — hiding the icon would make the header itself change
  // shape between roles.
  const preview = items.slice(0, PREVIEW_LIMIT);

  return (
    <div className="relative" ref={wrap}>
      <button
        type="button"
        onClick={toggle}
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : 'Notifications'}
        aria-expanded={isOpen}
        aria-haspopup="true"
        className="relative grid h-10 w-10 place-items-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-[1.15rem] place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-[1.15rem] text-white">
            {badgeLabel(unreadCount)}
          </span>
        )}
      </button>

      {isOpen && (
        /*
          Anchored to the bell on desktop and pinned to the viewport edges below
          sm: a 380px panel hanging off a button that sits ~50px from the right
          edge of a 360px phone would run off the screen, and the header cannot
          scroll sideways to reach it.
        */
        <div
          className="fixed inset-x-3 top-16 z-40 origin-top rounded-card border border-line-soft bg-surface shadow-card sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[24rem]"
          role="dialog"
          aria-label="Notifications"
        >
          <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
            <h2 className="font-display text-sm font-bold text-primary">Notifications</h2>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-semibold text-accent transition-colors hover:text-accent-hover"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-[min(60vh,26rem)] overflow-y-auto">
            {isLoading && (
              <p className="px-4 py-8 text-center text-sm text-text-muted">Loading…</p>
            )}

            {!isLoading && error && (
              <p className="px-4 py-8 text-center text-sm text-text-muted">
                Couldn’t load notifications.
              </p>
            )}

            {!isLoading && !error && preview.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-primary-50 text-primary">
                  <Inbox className="h-5 w-5" />
                </span>
                <p className="text-sm font-semibold text-primary">You’re all caught up</p>
                <p className="text-xs text-text-muted">Nothing is waiting on you.</p>
              </div>
            )}

            {preview.map((entry) => (
              <Row
                key={entry.id}
                entry={entry}
                onNavigate={close}
                className="border-b border-line-soft last:border-b-0"
              />
            ))}
          </div>

          {/* The footer link is the one part of the bell that IS conditional.
              /notifications is refused without a source, so offering the link
              anyway would walk the reader into a 403 — the popup keeps working
              for everyone, it just stops promising a page they cannot open. */}
          {canViewAll && (
            <Link
              to="/notifications"
              onClick={close}
              className="flex items-center justify-center gap-1.5 border-t border-line-soft px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-50/50"
            >
              View all notifications
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
