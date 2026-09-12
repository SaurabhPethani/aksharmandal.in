import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { usersService } from '../../services/usersService';

// A type-to-search picker for viewing another member's dashboard. Sits on the
// caller's own "My Dashboard" (rank >= 20 only). Searches the hierarchy-scoped
// member list (GET /users/list?search=), so the results are already limited to
// people the caller may see; picking one opens their stats modal.
//
// Its own react-query key space (['member-search']) — deliberately NOT the
// ['members'] paged list MembersPage owns, so the two never evict each other.

export default function MemberStatsSearch({ onPick }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  // Debounce so a fast typist fires one request, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const query = useQuery({
    queryKey: ['member-search', debounced],
    queryFn: () => usersService.list({ search: debounced, limit: 8 }),
    enabled: debounced.length >= 2,
    staleTime: 30_000,
  });
  const results = query.data?.items ?? [];

  // Close the results when the reader clicks away.
  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const pick = (m) => {
    onPick(m.id);
    setQ('');
    setDebounced('');
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="View a member's dashboard — search by name or mobile…"
          aria-label="Search a member to view their dashboard"
          className="w-full rounded-control border border-line-soft bg-surface py-2 pl-9 pr-9 text-sm text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />
        {q ? (
          <button
            type="button"
            onClick={() => { setQ(''); setDebounced(''); }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-text-muted transition-colors hover:text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {open && debounced.length >= 2 ? (
        <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-card border border-line-soft bg-surface shadow-card">
          {query.isLoading ? (
            <p className="px-3 py-3 text-sm text-text-muted">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-sm text-text-muted">No members found.</p>
          ) : (
            <ul className="py-1">
              {results.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => pick(m)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-bg"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-primary">{m.user_name}</span>
                      <span className="block truncate text-xs text-text-muted">
                        {[m.sabha_name, m.mobile_number].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
