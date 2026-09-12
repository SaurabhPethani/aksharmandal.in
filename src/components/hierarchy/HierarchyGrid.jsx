import { ChevronRight } from 'lucide-react';
import { EmptyState, ErrorState, Skeleton } from '../ui';

// One reusable grid for all three hierarchy levels. Card anatomy matches the
// reference Users page: a coloured initial badge, the name, the level in small
// caps, a chevron that shifts on hover, and a member-count pill.

export const LEVEL_META = {
  pradesh: { label: 'Pradesh', nameKey: 'pradesh_name', badge: 'bg-primary', ring: 'hover:border-primary/40' },
  mandal: { label: 'Mandal', nameKey: 'mandal_name', badge: 'bg-accent', ring: 'hover:border-accent/40' },
  sabha: { label: 'Sabha', nameKey: 'sabha_name', badge: 'bg-green-500', ring: 'hover:border-green-400/60' },
};

// The list routes have shipped this count under several names; read whichever is
// present rather than showing "—" because of a field rename.
const COUNT_KEYS = ['member_count', 'members_count', 'total_members', 'user_count', 'total_users'];
function readMemberCount(node) {
  for (const key of COUNT_KEYS) {
    const v = node?.[key];
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  }
  return null;
}

// Ids/names likewise vary by route, so never assume `item.id` — a row keyed on
// undefined collapses into its sibling and looks like the API returned less.
export const nodeId = (item, level) => item?.id ?? item?.[`${level}_id`] ?? null;
export const nodeName = (item, level) => item?.[LEVEL_META[level].nameKey] ?? item?.name ?? '';

export default function HierarchyGrid({
  items = [], level, onSelect, loading, error, onRetry,
  emptyTitle = 'Nothing to show', emptyHint,
}) {
  const meta = LEVEL_META[level];

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="card p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-11 w-11 rounded-xl" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
            <Skeleton className="mt-3 h-6 w-24 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="card"><ErrorState error={error} onRetry={onRetry} title="Couldn’t load this list" /></div>;
  }

  if (items.length === 0) {
    return <div className="card"><EmptyState title={emptyTitle} hint={emptyHint} /></div>;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item, index) => {
        const name = nodeName(item, level);
        const count = readMemberCount(item);
        const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';

        return (
          <button
            key={`${nodeId(item, level) ?? 'n'}-${index}`}
            type="button"
            onClick={() => onSelect(item)}
            className={`card group border-2 border-transparent p-4 text-left transition-all duration-200 hover:-translate-y-0.5 ${meta.ring}`}
          >
            <div className="flex items-start gap-3">
              <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl text-base font-bold text-white ${meta.badge}`}>
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-primary">{name || '—'}</p>
                <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-wider text-[#8A9AB8]">{meta.label}</p>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-[#C0CDE0] transition-all group-hover:translate-x-0.5 group-hover:text-accent" />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <span className="rounded-full border border-[#E2EAF4] bg-[#EEF2FA] px-2.5 py-1 text-xs font-semibold text-[#6B7FA3]">
                {count == null ? '—' : `${count} ${count === 1 ? 'member' : 'members'}`}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
