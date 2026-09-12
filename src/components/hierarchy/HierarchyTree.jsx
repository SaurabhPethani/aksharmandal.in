import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { EmptyState, ErrorState, Skeleton } from '../ui';
import { useMandals, useSabhas } from '../../hooks/useHierarchy';

/**
 * The Pradesh -> Mandal -> Sabha tree, expanded in place.
 *
 * One row component per level rather than one recursive component: each level
 * has its own list hook, its own permission pair, and its own trailing content
 * (only a Sabha shows member pills, only Pradesh/Mandal show an "add child"
 * link), and a single recursive component ended up as three branches wearing a
 * trench coat.
 *
 * Children load on expand, not up front — a full tree would be one request per
 * Mandal on a page most people open to change one row.
 *
 * ── House style for this screen ───────────────────────────────────────────────
 *
 * Two type sizes and nothing else. A tree is a dense, repeating structure, so
 * every extra size makes the nesting harder to read, not easier:
 *
 *   text-sm    the node's name — the only thing scanned down the page
 *   text-xs    everything secondary: head line, status, actions, pills, counts
 *
 * Colour comes from theme tokens only — `text-primary`, `text-text-muted`,
 * `text-text-faint`, `border-line-soft`, `bg-bg` — never a raw hex. The three
 * level accents (primary / accent / green-500) are the ONE place colour carries
 * meaning here, so nothing else on the row is allowed to compete with them.
 *
 * Alignment is one rule: the name row and the action row share a top edge, and
 * everything below the name hangs off the name's left edge, at every depth.
 */

export const LEVEL_STYLE = {
  pradesh: {
    label: 'Pradesh',
    nameKey: 'pradesh_name',
    initial: 'P',
    dot: 'bg-primary',
    badge: 'bg-primary',
    // Tints the row so nesting is readable without indent guides.
    shell: 'border-line-soft bg-surface',
    childLabel: 'Mandal',
  },
  mandal: {
    label: 'Mandal',
    nameKey: 'mandal_name',
    initial: 'M',
    dot: 'bg-accent',
    badge: 'bg-accent',
    shell: 'border-accent/30 bg-accent/[0.03]',
    childLabel: 'Sabha',
  },
  sabha: {
    label: 'Sabha',
    nameKey: 'sabha_name',
    initial: 'S',
    dot: 'bg-green-500',
    badge: 'bg-green-500',
    shell: 'border-line-soft bg-surface',
    childLabel: null,
  },
};

/** Secondary text — the one size every non-name element on a row uses. */
const META = 'text-xs text-text-muted';
/**
 * Row actions, styled to match the Master Data screens — the app's established
 * pattern for a list of records with the same two verbs on every row:
 *
 *   Edit         navy, semibold. The primary act, so it carries the weight.
 *   Deactivate   muted, regular; only reddens on hover. It is reversible, and a
 *                permanently red control on every row reads as a warning the
 *                page does not mean.
 *   + Child      accent orange, the colour this app uses for "add" everywhere.
 *
 * Neither verb takes an icon there, so neither takes one here.
 */
const ACTION = 'text-xs transition-colors disabled:opacity-50';
const ACTION_EDIT = `${ACTION} font-semibold text-primary hover:text-primary-hover`;
const ACTION_STATUS = `${ACTION} font-medium text-text-muted hover:text-danger-fg`;
const ACTION_ADD = `${ACTION} font-semibold text-accent hover:text-accent-hover`;
/** The neutral pill used for counts and the members link. */
const PILL = 'rounded-full border border-line-soft bg-bg px-2 py-0.5 text-xs font-medium';

const nodeName = (node, level) =>
  node?.[LEVEL_STYLE[level].nameKey] ?? node?.name ?? '—';

/**
 * What each row is called, and where (and when) it is:
 *
 *   Pradesh   Harihriday Pradesh Mumbai - Mumbai
 *   Mandal    Akshar Yuvak Mandal Dahisar - Dahisar East
 *   Sabha     Jeevan - Thursday - Manav kalyan
 *
 * THE DAY IS THE BACKEND'S TO JOIN, not this screen's. A Sabha's day lives on
 * its `sabha_schedule` row, and `SabhaResponse.sabha_display_name` is that join
 * already done — "`<sabha_name> - <day> - <location>`, missing parts skipped".
 * Reading it here rather than fetching the schedule table and matching on
 * `sabha_id` keeps this page to the three requests that draw the tree.
 *
 * `sabha_display_name` is nullable and an older backend does not send it at all,
 * so the parts are composed here when it is absent — without a day, which is the
 * one piece a Sabha row cannot work out on its own.
 *
 * ONLY WHAT IS RECORDED IS PRINTED, either way: a missing location or day is
 * left out along with its separator, so a Sabha with neither reads "Jeevan" —
 * never a name trailing a dash, which looks like a value that failed to load.
 *
 * Returned as parts rather than a joined string so the name can keep the weight
 * it has everywhere else on this page while the rest sits back as secondary
 * text — the name is what the eye runs down a tree looking for.
 */
function titleParts(node, level) {
  const name = nodeName(node, level);

  if (level === 'sabha' && node?.sabha_display_name) {
    // Split off the name the row is keyed by rather than re-deriving it: the
    // label leads with `sabha_name`, so what follows the first " - " is exactly
    // the day and location, in the backend's own order.
    const label = String(node.sabha_display_name);
    const rest = label.startsWith(`${name} - `) ? label.slice(name.length + 3) : null;
    if (rest) return rest.split(' - ').filter(Boolean);
    // A label that does not lead with the name is not ours to take apart.
    if (label !== name) return [label];
  }

  return node?.location ? [node.location] : [];
}

function StatusPill({ active }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${
        active ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-success-fg' : 'bg-danger-fg'}`} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

/**
 * "Pradesh Head: Hitesh Girish Thadeshwar · 9167626121", or "unassigned".
 *
 * `people` is a `HeadUser[]` straight off the row — `head` or `DB_head` from the
 * hierarchy response, already narrowed by the backend to the ACTIVE holders of
 * that role for THIS row. No lookup, so no loading state: the list arrived with
 * the row that is being drawn, and an empty one means unassigned rather than
 * not-known-yet.
 *
 * A ROW MAY HAVE SEVERAL, and the schema says so. All of them are named — one
 * name with a silent "+2 more" is worse than a slightly longer line, and picking
 * one arbitrarily would tell two readers different things about who to call.
 */
function HeadLine({ label, people = [] }) {
  return (
    <p className={`mt-0.5 ${META}`}>
      <span>{label}:</span>{' '}
      {people.length ? (
        people.map((person, i) => (
          <span key={`${person.username}-${person.mobile ?? i}`}>
            {i > 0 && <span className="text-text-faint">, </span>}
            <span className="font-semibold text-primary">{person.username}</span>
            {person.mobile && <span className="text-text-faint"> · {person.mobile}</span>}
          </span>
        ))
      ) : (
        <span className="text-text-faint">unassigned</span>
      )}
    </p>
  );
}

/** Edit / Deactivate / + Child — the same trio at every level, minus what is ungranted. */
function RowActions({ level, node, perms, onEdit, onToggleStatus, onAddChild, busy }) {
  const style = LEVEL_STYLE[level];
  const canEdit = perms.canUpdate(level);
  const canAddChild = style.childLabel && perms.canCreate(style.childLabel.toLowerCase());

  if (!canEdit && !canAddChild) return null;

  return (
    <div className="flex flex-shrink-0 items-center gap-4">
      {/* Edit and Deactivate are the SAME grant (<LEVEL>:UPDATE). They are two
          controls because they are two decisions — the edit form carries no
          status field, so turning a row off is never a side effect of a rename. */}
      {canEdit && (
        <>
          <button
            type="button"
            onClick={() => onEdit(level, node)}
            className={ACTION_EDIT}
            disabled={busy}
          >
            Edit
          </button>
          <button
            type="button"
            onClick={() => onToggleStatus(level, node)}
            className={ACTION_STATUS}
            disabled={busy}
          >
            {node.status ? 'Deactivate' : 'Activate'}
          </button>
        </>
      )}
      {canAddChild && (
        <button
          type="button"
          onClick={() => onAddChild(style.childLabel.toLowerCase(), node)}
          className={ACTION_ADD}
          disabled={busy}
        >
          + {style.childLabel}
        </button>
      )}
    </div>
  );
}

/** The header line shared by all three levels: chevron, badge, name, status, actions. */
function NodeShell({
  level, node, expanded, onToggleExpand, expandable,
  actions, children,
}) {
  const style = LEVEL_STYLE[level];
  const extras = titleParts(node, level);

  return (
    <div className={`rounded-card border p-3 shadow-card ${style.shell}`}>
      <div className="flex items-start gap-2.5">
        {expandable ? (
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${nodeName(node, level)}`}
            className="mt-1 flex-shrink-0 rounded text-text-muted transition-colors hover:text-primary"
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        ) : (
          // Keeps the badge column aligned with expandable siblings.
          <span className="mt-1 h-4 w-4 flex-shrink-0" aria-hidden="true" />
        )}

        <div
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-xs font-bold text-white ${style.badge}`}
        >
          {style.initial}
        </div>

        {/* The name column and the actions sit on one line; everything secondary
            hangs below the name, inside this column, so it stays aligned with the
            name rather than with the badge. */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
            {/* ONE TITLE, ONE WEIGHT. The day and the location used to sit
                behind the name in muted normal text, which read as an aside
                about the row; they are part of what the row IS — "Suvas -
                Friday - Manav kalyan" is the Sabha's name as anyone here says
                it — so the whole line carries the name's weight.
                One <p> and one truncation: a long venue shortens the title
                rather than pushing what follows off the row. */}
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-primary">
              {[nodeName(node, level), ...extras].join(' - ')}
            </p>

            {/* Status moved off the name and in with the actions. On the left it
                was a third thing on a line already carrying a long title, above
                two head lines and a row of pills — and it is a fact about the
                row of the same kind as the control that changes it, so it reads
                better beside Deactivate than in front of the name. */}
            <div className="flex shrink-0 items-center gap-4">
              <StatusPill active={Boolean(node.status)} />
              {actions}
            </div>
          </div>
          {/* Both people the row names: whoever runs it, and whoever keeps its
              records. `DB_head` is the API's own spelling. */}
          <HeadLine label={`${style.label} Head`} people={node.head} />
          <HeadLine label={`${style.label} DB Head`} people={node.DB_head} />
          {children}
        </div>
      </div>
    </div>
  );
}

function SabhaRow({ node, perms, handlers, busy }) {
  return (
    <NodeShell
      level="sabha"
      node={node}
      expandable={false}
      actions={<RowActions level="sabha" node={node} perms={perms} busy={busy} {...handlers} />}
    >
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {/* `member_count` off the row — the active members in this Sabha.
            This was a pill per counted role ("12 Nimit Sevaks", "40 Yuvaks"),
            which only the by-role sweep could produce. The hierarchy endpoints
            carry a total and no breakdown, so a total is what is shown. */}
        {node.member_count != null && (
          <span className={`${PILL} text-text-muted`}>
            {node.member_count} member{node.member_count === 1 ? '' : 's'}
          </span>
        )}
        {/* The members list already filters by Sabha, so "View all" is a link to
            it rather than a second member view living on this page. */}
        {perms.canReadUsers && (
          <Link
            to={`/users?sabha_id=${node.id}`}
            className={`${PILL} text-primary transition-colors hover:border-primary/40 hover:text-primary-hover`}
          >
            → View all
          </Link>
        )}
      </div>
    </NodeShell>
  );
}

function ChildList({ query, emptyLabel, children }) {
  if (query.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="rounded-card border border-line-soft bg-surface p-3">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <Skeleton className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (query.error) {
    return <ErrorState error={query.error} onRetry={query.refetch} title={`Couldn’t load ${emptyLabel}`} />;
  }
  if (!query.data?.length) {
    return (
      <p className={`rounded-card border border-dashed border-line-soft px-3 py-2.5 ${META}`}>
        No {emptyLabel} yet.
      </p>
    );
  }
  return children;
}

function MandalRow({ node, perms, handlers, busy }) {
  const [expanded, setExpanded] = useState(false);
  const sabhas = useSabhas(node.id, expanded);

  return (
    <div className="space-y-2">
      <NodeShell
        level="mandal"
        node={node}
        expandable
        expanded={expanded}
        onToggleExpand={() => setExpanded((v) => !v)}
        actions={<RowActions level="mandal" node={node} perms={perms} busy={busy} {...handlers} />}
      />

      {expanded && (
        <div className="space-y-2 pl-5 sm:pl-8">
          <ChildList query={sabhas} emptyLabel="Sabhas">
            {(sabhas.data ?? []).map((s) => (
              <SabhaRow key={s.id} node={s} perms={perms} handlers={handlers} busy={busy} />
            ))}
          </ChildList>
        </div>
      )}
    </div>
  );
}

function PradeshRow({ node, perms, handlers, busy }) {
  const [expanded, setExpanded] = useState(false);
  const mandals = useMandals(node.id, expanded);

  return (
    <div className="space-y-2">
      <NodeShell
        level="pradesh"
        node={node}
        expandable
        expanded={expanded}
        onToggleExpand={() => setExpanded((v) => !v)}
        actions={<RowActions level="pradesh" node={node} perms={perms} busy={busy} {...handlers} />}
      />

      {expanded && (
        <div className="space-y-2 pl-5 sm:pl-8">
          <ChildList query={mandals} emptyLabel="Mandals">
            {(mandals.data ?? []).map((m) => (
              <MandalRow key={m.id} node={m} perms={perms} handlers={handlers} busy={busy} />
            ))}
          </ChildList>
        </div>
      )}
    </div>
  );
}

export default function HierarchyTree({ pradeshList, perms, handlers, busy }) {
  if (pradeshList.isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="rounded-card border border-line-soft bg-surface p-3 shadow-card">
            <div className="flex items-center gap-2.5">
              <Skeleton className="h-7 w-7 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-44" />
                <Skeleton className="h-2.5 w-28" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (pradeshList.error) {
    return (
      <div className="card">
        <ErrorState error={pradeshList.error} onRetry={pradeshList.refetch} title="Couldn’t load the hierarchy" />
      </div>
    );
  }

  if (!pradeshList.data?.length) {
    return (
      <div className="card">
        <EmptyState title="No Pradesh available" hint="Nothing in your scope at this level." />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {pradeshList.data.map((p) => (
        <PradeshRow key={p.id} node={p} perms={perms} handlers={handlers} busy={busy} />
      ))}
    </div>
  );
}
