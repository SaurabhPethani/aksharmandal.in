import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PartyPopper, X } from 'lucide-react';
import { useMyBirthdayWishes } from '../hooks';
import { STORAGE_KEYS } from '../constants/storage';
import { Button } from './ui';

// "N members sent you birthday wishes" — the greeting the app opens with on the
// one day of the year it applies to.
//
// ⚠ IT ASKS FOR THE WISHES ONLY WHEN IT COULD ACTUALLY SHOW THEM. Two things
// keep the request off pages that have no use for it:
//
//   WHERE   this is mounted by DashboardPage, not by AppShell. In the shell it
//           was mounted on every screen in the app, so /users/my-birthday-wishes
//           went out behind Members, Reports, Attendance — every one of them a
//           request for a popup that had already been dismissed.
//   WHEN    the query is DISABLED once the greeting has been seen this session
//           (`enabled: !dismissed`). After it is closed, returning to the
//           dashboard issues nothing at all.
//
// The Birthdays page's My Wishes tab asks for the same data on its own, and
// shares this cache entry — so whichever comes first, the other is free.
//
// SHOWN ONCE PER SIGN-IN — and again on the next one.
//
// The mark lives in `sessionStorage` AND is cleared by `forgetSession`, and it
// needs both to mean "this login":
//
//   localStorage alone   would be once ever, per device. A member who signed in
//                        again on their own birthday would never see it.
//   sessionStorage alone survives a sign-out, so signing back in on the same tab
//                        would swallow the greeting.
//   no mark at all       would put it back on screen after every reload and
//                        every navigation that remounted the shell.
//
// So: it is set when the popup is dismissed, and dropped when the session ends.
//
// NOTHING IS SHOWN WHEN THERE IS NOTHING TO SAY. No wishes, still loading, or
// the request failed — all render nothing at all. A birthday greeting that
// arrives as an error, or as "0 wishes", is worse than silence, and every other
// day of the year this is silent by definition.

const SEEN_KEY = STORAGE_KEYS.birthdayWishesSeen;

const wasSeen = () => {
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch (e) {
    // Private mode, or storage disabled. Showing it is the better failure.
    return false;
  }
};

const markSeen = () => {
  try {
    sessionStorage.setItem(SEEN_KEY, '1');
  } catch (e) {
    // ignore
  }
};

export default function BirthdayWishesPopup() {
  const navigate = useNavigate();
  // Read BEFORE the query, because it is what decides whether to make one.
  const [dismissed, setDismissed] = useState(() => wasSeen());
  const { rows, isLoading, error } = useMyBirthdayWishes(!dismissed);

  const count = rows.length;
  if (dismissed || isLoading || error || count === 0) return null;

  const close = () => {
    markSeen();
    setDismissed(true);
  };

  const viewAll = () => {
    close();
    // The second tab — the wishes received, which is what was just announced.
    navigate('/birthdays?tab=received');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(10,15,40,0.55)', backdropFilter: 'blur(4px)' }}
        onClick={close}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="birthday-wishes-title"
        className="relative w-full max-w-md overflow-hidden rounded-t-card sm:rounded-card"
        style={{
          background: 'linear-gradient(135deg, #FEF3C7 0%, #FFEDD5 50%, #FFE4CC 100%)',
          border: '1px solid rgba(251,191,36,0.32)',
          boxShadow: '0 20px 48px rgba(251,146,60,0.28)',
        }}
      >
        {/* The same two glows the Yuvak dashboard's Celebrations card uses —
            this is the same occasion, announced in the same colours. */}
        <div
          className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, #FBBF24 0%, transparent 70%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-8 -left-8 h-28 w-28 rounded-full opacity-30"
          style={{ background: 'radial-gradient(circle, #F97316 0%, transparent 70%)' }}
        />

        <button
          type="button"
          onClick={close}
          aria-label="Close"
          className="absolute right-3 top-3 rounded-control p-1.5 text-amber-900/50 transition-colors hover:bg-white/50 hover:text-amber-900"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative p-6 text-center sm:p-7">
          <span
            className="mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white"
            style={{
              background: 'linear-gradient(135deg, #FBBF24, #F97316)',
              boxShadow: '0 8px 20px rgba(251,146,60,0.40)',
            }}
          >
            <PartyPopper className="h-7 w-7" />
          </span>

          <h2 id="birthday-wishes-title" className="mt-4 font-display text-xl font-bold text-primary">
            Happy Birthday!
          </h2>
          {/* The count is the whole message, so it is the thing that is bold. */}
          <p className="mx-auto mt-1.5 max-w-xs text-sm text-amber-900/80">
            <span className="tnum font-bold text-primary">{count}</span>
            {count === 1 ? ' member has' : ' members have'} sent you wishes for your birthday.
          </p>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <Button variant="accent" onClick={viewAll}>View all wishes</Button>
            <Button variant="ghost" onClick={close}>Not now</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
