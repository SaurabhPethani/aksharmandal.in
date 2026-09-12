import { Link } from 'react-router-dom';
import { Skeleton } from '../ui';
import { formatNumber } from '../../utils/format';

/**
 * One headline figure, on either dashboard tab — /dashboard-overview's
 * `overall` block or its `self` block.
 *
 * THREE LINES, NOT FOUR. The icon sits ON the label line rather than in a block
 * above it: nine of these stack up fast, and an icon with its own row cost every
 * tile ~40px of height and gave the grid four bands of different weight to read
 * through. Inline, the tile reads label → number → context, top to bottom, once.
 *
 * The number is the only large thing in the tile. Label and context are
 * deliberately small and grey — they qualify the figure, and sizing them near it
 * is what made the row look busy.
 *
 * `tone` colours the context line, and only that. It says whether the line is
 * neutral ("42% of total"), good ("+12 this month") or worth acting on ("Need
 * attention"). It never colours the value: a figure is not good or bad on its
 * own, and tinting it would make the grid read as a set of alerts.
 *
 * `to` makes the WHOLE tile a link to the screen the figure is pursued on — a
 * count that names a worklist is a thing you click, and asking the reader to
 * find the same screen in the menu is a step for nothing. Tiles without it stay
 * plain divs: most of these figures have no single screen behind them, and a
 * link that goes nowhere in particular is worse than no link.
 */

const TONES = {
  muted: 'text-text-faint',
  good: 'text-success-fg',
  attention: 'text-accent',
};

/**
 * The context line on a tile that IS a link — pass it as `sub`.
 *
 * A span, not an anchor. The whole tile is already the link, and an <a> inside
 * an <a> is invalid HTML — browsers close the outer one early and the tile stops
 * being clickable past that point. So this only has to LOOK like a link; the
 * click is the tile's.
 *
 * `group-hover` rather than `hover`, so the underline responds to the pointer
 * being anywhere on the tile — the same surface that will actually navigate. The
 * `group` class is put on the link below for exactly this.
 *
 * It lives HERE, beside the component it is passed to, because both dashboard
 * tabs now draw linked tiles. It was local to AdminDashboard until the birthday
 * tiles were split across the two.
 */
export function TileAction({ children }) {
  return (
    <span className="font-semibold underline decoration-accent/40 underline-offset-2 transition-colors group-hover:decoration-accent">
      {children}
    </span>
  );
}

/**
 * `!p-4`, up from `p-3.5`, and the two rules under it are what make the tile sit
 * square: the icon row, the figure and any context line are the whole content,
 * so the card's own padding is the only thing setting the space above and below
 * them. At 14px with an empty line reserved underneath, the figure sat high in a
 * box that was airy at the bottom and tight at the top.
 */
const PANEL = 'panel !p-4 transition-colors duration-200';

/**
 * @param phrase  the value is WORDS rather than a figure ("Not Attended"), so it
 *   is set one step down.
 *
 *   It lives here rather than as a `<span className="text-sm">` around the value
 *   at the call site, which is what it was: a tile's type is this component's
 *   business, and a local override is how two dashboards drawn from one
 *   component start looking like two components. Anything about how a tile reads
 *   — size, colour, alignment, the icon chip — is decided in this file and
 *   nowhere else, so both tabs are identical by construction rather than by
 *   somebody remembering to keep them so.
 *
 *   Why a step down at all: `text-lg` is sized for two or three digits that have
 *   to carry a tile. A phrase at that size fills the width and reads as louder
 *   than the counts beside it, which are the figures a row is scanned for.
 */
export default function OverviewStat({
  label, value, sub, tone = 'muted', loading, className = '', to, phrase = false,
  icon: Icon, iconClass = 'bg-primary-50 text-primary', wrapLabel = false,
}) {
  // One body, two wrappers — the tile looks identical either way, so a linked
  // figure and a plain one never drift apart.
  const body = (
    <>
      {/* `items-start` when the label may wrap, so the icon sits on the first
          line rather than centring against a two-line label. */}
      <div className={`mb-2 flex gap-2 ${wrapLabel ? 'items-start' : 'items-center'}`}>
        <span className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          <Icon className="h-4 w-4" />
        </span>
        {/* `wrapLabel` lets a long label (e.g. "Total Sabha Attended") break to
            a second line on a narrow tile instead of clipping to "…". */}
        <span className={`min-w-0 text-xs font-semibold text-text-muted ${wrapLabel ? 'break-words leading-tight' : 'truncate'}`}>{label}</span>
      </div>

      {loading ? (
        /* Matched to the figure it stands in for — the same `h-6` box on the
           same floor, so nothing shifts when the value lands. No second bar for
           the context line: not every tile has one, and a skeleton promising a
           line that never arrives makes the card shrink as it loads. */
        <div className="flex h-6 items-end">
          <Skeleton className="h-5 w-16" />
        </div>
      ) : (
        <>
          {/*
            NUMBERS GET GROUPED; EVERYTHING ELSE IS PASSED THROUGH.

            `formatNumber` runs Intl.NumberFormat over its argument, which
            answers "NaN" for anything that is not one. My Dashboard's tiles are
            a word ("Present"), a formatted tenure ("2y 3m 20d") and a ratio
            element (`20 / 30`) — all of which arrive already in the form they
            should be read in. Only an actual number needs the separator.
          */}
          {/*
            `text-lg`, down from `text-xl`. The figure is still the largest thing
            in the tile and still the first thing read — it does not need to be
            the largest thing on the PAGE, which at `xl` it was: eight of these
            in a grid, each shouting a number, made the row read as a headline
            block rather than as a set of readings. One step down keeps the
            hierarchy (label → figure → context) and lets a long value —
            "14y 7m 10d" — sit on one line in a half-width tile.
          */}
          {/*
            A FIXED-HEIGHT LINE, WITH THE VALUE SITTING ON ITS FLOOR.

            The two sizes are what made this necessary. A `phrase` tile sets its
            value at `text-sm` and a figure tile at `text-lg`, so as plain text
            the two lines were 4px different in height — and every tile's context
            line inherited that difference, leaving "Your next step awaits" and
            "Send wishes" sitting at visibly different heights in the same row.

            `h-6` is the taller of the two rounded up; `items-end` puts both
            sizes on the same floor rather than centring them, so the figures
            still line up with each other as well as the lines beneath them.
          */}
          <p
            className={`tnum flex h-6 items-end font-display font-bold leading-none text-primary ${
              phrase ? 'text-sm' : 'text-lg'
            }`}
          >
            {value == null ? '—' : typeof value === 'number' ? formatNumber(value) : value}
          </p>
          {/*
            DRAWN ONLY WHEN THERE IS SOMETHING TO SAY.

            It used to be reserved unconditionally — an empty `h-4` line under
            every figure — so that tiles in a row kept the same height and their
            numbers sat on one baseline. That was the right trade when most
            tiles carried a context line and a few did not. It is the wrong one
            now that most carry none: the reserved line plus its margin left
            ~22px of dead space under the value in every tile, and a card padded
            14px at the top and 36px at the bottom reads as broken rather than
            as aligned.

            Heights still match without it. These tiles live in a grid, and grid
            items stretch to their row — so a row where one tile has a line and
            another does not comes out level anyway, with both figures starting
            from the same top edge.
          */}
          {sub != null && sub !== '' && (
            /* Wraps rather than truncates: `sub` is prose (a whole encouraging
               sentence on some tiles), and a phone-width tile clipped that to
               "One step ahead in spiritual g…". Grid items still stretch to
               the tallest row, so a two-line sub on one tile does not leave
               its neighbours short. `break-words` guards against a single long
               token pushing the tile wider than the grid cell. */
            <p className={`mt-1.5 break-words text-[11px] leading-4 ${TONES[tone] ?? TONES.muted}`}>
              {sub}
            </p>
          )}
        </>
      )}
    </>
  );

  if (to) {
    return (
      <Link
        to={to}
        // `block` because `panel` is not a block-level class and an inline <a>
        // would not fill its grid cell — the tile would stop being clickable
        // wherever the text does not reach. `group` is what lets the context
        // line underline on hover ANYWHERE on the tile rather than only over
        // its own few words; the caller styles it (see TileAction).
        className={`${PANEL} group block hover:border-primary/40 hover:shadow-card focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${className}`}
      >
        {body}
      </Link>
    );
  }

  return <div className={`${PANEL} hover:border-primary/20 ${className}`}>{body}</div>;
}
