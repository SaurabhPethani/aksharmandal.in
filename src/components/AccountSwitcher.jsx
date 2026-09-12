import { useState } from 'react';
import { Users, Check, X, ChevronDown, UserRound, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks';

// Family account switcher. A parent operating login-disabled child accounts
// (children with no phone of their own) sees this in two places:
//   1. A one-time prompt right after login — "which account do you want to
//      open?" — driven by `accountChoicePending`.
//   2. An always-available control in the header, so they can switch profiles
//      at any time. Both call `switchTo`, which re-scopes the whole app to the
//      chosen member (permissions follow the opened profile).
//
// The whole component renders nothing when the person has only their own
// account, so a normal member never sees it.

function AccountRow({ account, isActive, onPick, busy }) {
  const label = account.is_self ? 'You' : (account.relation_name || 'Family member');
  return (
    <button
      type="button"
      disabled={busy || isActive}
      onClick={() => onPick(account)}
      className={`flex w-full items-center gap-3 rounded-control px-3 py-2.5 text-left transition-colors ${
        isActive ? 'bg-accent/10 cursor-default' : 'hover:bg-black/5 dark:hover:bg-white/5'
      } disabled:opacity-100`}
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-accent">
        <UserRound className="h-4.5 w-4.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-gray-900 dark:text-white">
          {account.name || 'Member'}
        </span>
        <span className="block truncate text-xs text-gray-500 dark:text-white/60">{label}</span>
      </span>
      {isActive
        ? <Check className="h-4 w-4 shrink-0 text-accent" />
        : busy ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gray-400" /> : null}
    </button>
  );
}

export default function AccountSwitcher() {
  const { accounts, activeUserId, switchTo, accountChoicePending, dismissAccountChoice } = useAuth();
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  // Nothing to switch between → render nothing at all.
  if (!Array.isArray(accounts) || accounts.length <= 1) return null;

  const active = accounts.find((a) => a.user_id === activeUserId) || null;

  const pick = async (account) => {
    if (account.user_id === activeUserId) { setOpen(false); dismissAccountChoice(); return; }
    setError(null);
    setBusyId(account.user_id);
    try {
      await switchTo(account.user_id);
      setOpen(false);
    } catch (e) {
      setError(e?.message || 'Could not switch account.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {/* Header trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Switch account"
        className="flex items-center gap-1.5 rounded-full py-1.5 pl-2.5 pr-2 text-white/85 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Users className="h-4.5 w-4.5" />
        <span className="hidden max-w-[7rem] truncate text-sm font-medium sm:block">
          {active?.is_self ? 'You' : (active?.name || 'Account')}
        </span>
        <ChevronDown className="h-4 w-4 opacity-70" />
      </button>

      {/* Header dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} aria-hidden="true" />
          <div className="absolute right-3 top-14 z-30 w-72 overflow-hidden rounded-2xl border border-black/10 bg-white p-1.5 shadow-xl dark:border-white/10 dark:bg-gray-900 sm:right-4 lg:right-6">
            <p className="px-3 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Switch account
            </p>
            {accounts.map((a) => (
              <AccountRow key={a.user_id} account={a} isActive={a.user_id === activeUserId} onPick={pick} busy={busyId === a.user_id} />
            ))}
            {error && <p className="px-3 py-2 text-xs text-red-600">{error}</p>}
          </div>
        </>
      )}

      {/* Post-login prompt */}
      {accountChoicePending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl dark:bg-gray-900">
            <div className="flex items-center justify-between border-b border-black/5 px-5 py-4 dark:border-white/10">
              <div>
                <h2 className="text-base font-bold text-gray-900 dark:text-white">Whose account?</h2>
                <p className="text-xs text-gray-500 dark:text-white/60">Choose the profile you want to open.</p>
              </div>
              <button
                type="button"
                onClick={dismissAccountChoice}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full text-gray-400 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            <div className="p-2">
              {accounts.map((a) => (
                <AccountRow key={a.user_id} account={a} isActive={a.user_id === activeUserId} onPick={pick} busy={busyId === a.user_id} />
              ))}
              {error && <p className="px-3 py-2 text-sm text-red-600">{error}</p>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
