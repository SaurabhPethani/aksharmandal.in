import { useState } from 'react';
import { PieChart } from 'lucide-react';
import { Skeleton } from '../ui';
import { formatNumber } from '../../utils/format';

/**
 * Member distribution by demographic category, from
 * `user_category_distribution` on /report-overview.
 *
 * A donut because the job is PART-TO-WHOLE: every member falls into exactly one
 * category and the rows sum to `total_users`, so one ring with the total in the
 * middle says "these are the parts of that" in a single shape. Bars would put
 * each category against its own empty track and lose the "of the whole" reading
 * that is the entire point.
 *
 * THE PALETTE IS FIXED-ORDER AND VALIDATED, not picked by eye. These are the
 * first seven slots of the reference categorical theme, checked against this
 * card's white surface: lightness band, chroma floor, adjacent-pair CVD
 * separation (worst ΔE 9.1, protan) and the normal-vision floor (worst ΔE 19.6)
 * all pass. Slot order is the colourblind-safety mechanism, so:
 *
 *   ⚠ ASSIGN BY INDEX, NEVER CYCLE, AND NEVER RE-SORT BY VALUE. A category
 *     keeps its colour whatever its size, and whatever the filter above does to
 *     the other categories — colour follows the entity, not its rank.
 *
 * Three of these slots sit below 3:1 against white, so the palette's relief rule
 * applies: the legend prints each category's own count and percentage beside its
 * swatch, and identity is therefore never carried by colour alone.
 */

const SERIES = [
  '#2A78D6', // blue
  '#EB6834', // orange
  '#1BAF7A', // aqua
  '#EDA100', // yellow
  '#E87BA4', // magenta
  '#008300', // green
  '#4A3AA7', // violet
];
/** An 8th-and-beyond category folds to grey rather than inventing a hue. */
const OVERFLOW = '#8CA0B3';

const colourAt = (i) => SERIES[i] ?? OVERFLOW;

const SIZE = 148;
const STROKE = 18;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** A 2px surface gap between segments, as the mark spec asks. */
const GAP = 2;

export default function CategoryDonut({ rows = [], total, loading, className = '' }) {
  const [hovered, setHovered] = useState(null);

  // Zero-value categories are dropped from the RING (a zero-length arc is not a
  // shape) but kept in the legend, so "Balika: 0" is still stated rather than
  // silently missing. Order is the API's own — the category master's sort_order.
  const drawn = rows
    .map((row, i) => ({ ...row, colour: colourAt(i) }))
    .filter((row) => Number(row.number) > 0);

  let cursor = 0;
  const arcs = drawn.map((row) => {
    const length = (Math.max(0, Math.min(100, Number(row.percentage) || 0)) / 100) * CIRCUMFERENCE;
    const arc = { ...row, length, offset: cursor };
    cursor += length;
    return arc;
  });

  const focus = hovered == null ? null : rows[hovered];

  return (
    <div className={`panel ${className}`}>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
          <PieChart className="h-4 w-4" />
        </span>
        <h3 className="panel-title">Member Distribution</h3>
      </div>

      {loading ? (
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <Skeleton className="h-[148px] w-[148px] flex-shrink-0 rounded-full" />
          <div className="w-full flex-1 space-y-3">
            {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <p className="py-10 text-center text-sm text-text-muted">
          No category breakdown for this scope.
        </p>
      ) : (
        // Stacks below sm: the ring is a fixed 168px and each legend row needs a
        // name, a count and a percentage — they do not fit beside it on a phone.
        <div className="flex flex-col items-center gap-6 sm:flex-row">
          <div className="relative flex-shrink-0">
            <svg
              width={SIZE}
              height={SIZE}
              // -90° so the ring opens at twelve o'clock rather than at three,
              // which is where a reader expects a proportion to begin.
              style={{ transform: 'rotate(-90deg)' }}
              role="img"
              aria-label={
                `Member distribution of ${total == null ? 'unknown' : total} members: `
                + rows.map((r) => `${r.category_name} ${r.number}`).join(', ')
              }
            >
              <circle
                cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                fill="none" stroke="rgba(0,49,88,0.08)" strokeWidth={STROKE}
              />
              {arcs.map((arc, i) => (
                <circle
                  key={arc.category_id ?? `uncategorized-${i}`}
                  cx={SIZE / 2} cy={SIZE / 2} r={RADIUS}
                  fill="none"
                  stroke={arc.colour}
                  strokeWidth={STROKE}
                  strokeLinecap="butt"
                  // The gap is taken off the arc's own length, so the segments
                  // still start where the running total says they do.
                  strokeDasharray={`${Math.max(0, arc.length - GAP)} ${CIRCUMFERENCE}`}
                  strokeDashoffset={-arc.offset}
                  className="cursor-pointer transition-opacity duration-150"
                  style={{ opacity: hovered == null || rows[hovered] === arc ? 1 : 0.35 }}
                  onMouseEnter={() => setHovered(rows.indexOf(arc))}
                  onMouseLeave={() => setHovered(null)}
                />
              ))}
            </svg>

            {/* The centre doubles as the tooltip: hovering a segment or a legend
                row swaps the total for that category, so there is no floating
                card to chase and nothing overlaps the ring. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
              <p className="tnum font-display text-xl font-bold leading-none text-primary">
                {focus
                  ? formatNumber(focus.number)
                  : total == null ? '—' : formatNumber(total)}
              </p>
              <p className="mt-1 max-w-full truncate text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                {focus ? focus.category_name : 'Total'}
              </p>
            </div>
          </div>

          <ul className="w-full flex-1 space-y-1">
            {rows.map((row, i) => (
              <li key={row.category_id ?? `uncategorized-${i}`}>
                <button
                  type="button"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-left transition-colors ${
                    hovered === i ? 'bg-primary-50/60' : 'hover:bg-primary-50/40'
                  }`}
                >
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ background: colourAt(i) }}
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-text-muted">
                    {row.category_name}
                  </span>
                  {/* Count AND percentage, always visible: this is the relief the
                      palette's sub-3:1 slots require, and it is what stops the
                      chart being readable only by hue. Both right-aligned in
                      fixed columns so the numbers form two clean rules rather
                      than ragging with the category names. */}
                  <span className="tnum w-12 flex-shrink-0 text-right text-xs font-semibold text-primary">
                    {formatNumber(row.number)}
                  </span>
                  <span className="tnum w-11 flex-shrink-0 text-right text-xs text-text-faint">
                    {row.percentage == null ? '—' : `${Number(row.percentage).toFixed(0)}%`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
