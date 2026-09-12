import { useLayoutEffect, useRef, useState } from 'react';

// Weekly attendance, drawn by hand in SVG.
//
// No chart library: three series over a handful of points needs a polyline and
// some axis labels, and the smallest chart package is larger than this whole
// app's vendor bundle. Every value comes from /weekly-reports — nothing is
// smoothed, interpolated or estimated.

// `showAllValues` prints this series' number on EVERY week, not just the hovered
// one. Only Present and Monthly Once carry it: they sit ~300 apart vertically so
// their labels never collide, whereas 4-wk average runs right along Present and
// would smear into it — that one stays hover-only.
//
// "Monthly Once" is `grt_1_in_4_week` — members present in at least one of the
// last four weeks. The legend/tooltip label is the Mandal's own wording for it.
const SERIES = [
  { key: 'present', pctKey: 'presentPct', label: 'Present', colour: '#2563EB', fill: true, showAllValues: true },
  { key: 'average4w', pctKey: 'average4wPct', label: '4-wk average', colour: '#F97316', dashed: true },
  { key: 'reach4w', pctKey: 'reach4wPct', label: 'Monthly Once', colour: '#3B0F70', showAllValues: true },
];

/**
 * Absent is in the tooltip but not on the chart: it is the mirror of Present
 * against the same total, so plotting it would add a line that says nothing the
 * first one does not. Its swatch is a filled square rather than a stroke, which
 * is how the tooltip shows it is not a line you can point at.
 */
const ABSENT = { key: 'absent', pctKey: 'absentPct', label: 'Absent', colour: '#DCE7F3' };

const PAD = { top: 24, right: 24, bottom: 44, left: 44 };
const H = 320;

/**
 * THE CHART IS DRAWN AT ITS CONTAINER'S OWN WIDTH, measured at runtime — the
 * viewBox is not a fixed 720 any more.
 *
 * It was, and that is what left the plot floating in the middle of the card with
 * empty gutters either side on any wide screen. An SVG with a viewBox and a
 * fixed height scales its contents to FIT that box: at `h-[320px] w-full` in a
 * 1200px card, 720×320 content was scaled to the height and centred, so 720px
 * of chart sat inside 1200px of element and the remaining 480px was padding
 * nobody asked for.
 *
 * The alternative — `preserveAspectRatio="none"` — stretches the drawing
 * instead, which would have smeared every label, dot and stroke width
 * horizontally by the same factor. Measuring is what keeps 1 user unit === 1
 * CSS pixel, so text stays 11px and a 2px line stays 2px at every width.
 *
 * `MIN_W` is the floor: below it the SVG stays this wide and the wrapper
 * scrolls, because a dozen week labels cannot be squeezed into a phone.
 */
const MIN_W = 560;

/**
 * Roughly how wide a label renders, in px, at the 11px axis size.
 *
 * An estimate rather than a measurement: laying the text out to find out costs a
 * DOM round trip per render, and the only thing it decides is tilt-or-not. 6.2px
 * per character is a shade generous for "05 Jan" — erring wide tilts a
 * borderline axis, which is the safer way to be wrong.
 */
const labelWidth = (label) => String(label ?? '').length * 6.2;

/** A round-ish upper bound, so the axis reads 80 rather than 76. */
function niceMax(value) {
  if (value <= 0) return 10;
  const step = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / step) * step;
}

const pct = (value) => (value == null ? null : `${value}%`);

export default function TrendChart({ points = [], monthLabel }) {
  const [hover, setHover] = useState(null);

  /**
   * The scroll wrapper's content width, which is what the chart is drawn at.
   *
   * `useLayoutEffect` + an immediate read, so the first paint is already the
   * right width — measuring in `useEffect` would show one frame at `MIN_W` and
   * then snap wider. The observer keeps it true through window resizes and
   * through the sidebar opening and closing, neither of which fires a resize on
   * `window`.
   */
  const wrapRef = useRef(null);
  const [measured, setMeasured] = useState(0);
  // `hasPoints` is in the deps because the empty state below returns BEFORE the
  // wrapper is rendered — with an empty dep list the observer would attach to
  // nothing on a first load that arrives without weeks, and the chart would stay
  // stuck at MIN_W once the weeks landed.
  const hasPoints = points.length > 0;
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const read = () => setMeasured(Math.round(el.clientWidth));
    read();
    // Guarded: jsdom and older Safari have no ResizeObserver, and a chart that
    // never resizes is better than one that throws on mount.
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasPoints]);

  const W = Math.max(measured || MIN_W, MIN_W);

  if (!points.length) {
    return (
      <p className="py-12 text-center text-sm text-text-muted">
        No completed weeks in this period yet.
      </p>
    );
  }

  const max = niceMax(Math.max(...points.flatMap((p) => SERIES.map((s) => Number(p[s.key]) || 0))));
  const innerW = W - PAD.left - PAD.right;
  /** Half the gap between points — the reach of one column's hover band. */
  const band = points.length === 1 ? innerW : innerW / (points.length - 1);

  /**
   * THE WEEK LABELS ARE ALWAYS VERTICAL — `rotate(-90)`, reading bottom to top.
   *
   * Upright and unthinned, a quarter of weeks ran "05 Jan12 Jan19 Jan" into one
   * another. Turned, a label takes up only its own line height along the axis —
   * about 12px — so as many weeks fit as there are ticks to hang them from.
   *
   * ALWAYS, not only when they would collide. That was the first version of
   * this, and it meant the axis changed orientation as the period changed: five
   * weeks read across, thirteen read up, and the chart looked like two different
   * charts depending on the filter. One axis, one direction, whatever is on it.
   *
   * THE PADDING GROWS WITH THE LABELS. A turned label is as TALL as it used to
   * be wide, so the 44px this chart reserved would have clipped "05 Jan" in half
   * — `padBottom` is the longest label's own length plus room for the month
   * caption under it, and the plot gives up that height rather than overflowing.
   */
  const widest = Math.max(...points.map((p) => labelWidth(p.label)));
  const padBottom = Math.ceil(widest) + 34;
  /** The point each label hangs down from, and is rotated about. */
  const axisY = H - padBottom + 14;

  const innerH = H - PAD.top - padBottom;
  // A single point sits in the middle rather than hard against the axis.
  const x = (i) => (points.length === 1 ? PAD.left + innerW / 2 : PAD.left + (i * innerW) / (points.length - 1));
  const y = (v) => PAD.top + innerH - ((Number(v) || 0) / max) * innerH;

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(max * f));
  const active = hover == null ? null : points[hover];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-end gap-4">
        {SERIES.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-2 text-xs font-semibold text-text-muted">
            <span
              className="inline-block h-0.5 w-6 rounded"
              style={{ background: s.colour, opacity: s.dashed ? 0.9 : 1 }}
            />
            {s.label}
          </span>
        ))}
      </div>

      {/* Scrolls rather than squashes on a phone. `relative` because the tooltip
          is an HTML card positioned over it — text in SVG cannot wrap, align or
          use the app's own type scale.

          THIS ELEMENT IS WHAT GETS MEASURED, so the SVG inside it is exactly as
          wide as the card's content area — the chart runs end to end instead of
          sitting centred in it. */}
      <div ref={wrapRef} className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width={W}
          height={H}
          /* No `w-full`: the width attribute above IS the measured width, and
             letting CSS stretch it past that would reintroduce the scaling this
             change exists to remove. */
          className="block h-[320px]"
          role="img"
          aria-label="Weekly attendance trend"
          onMouseLeave={() => setHover(null)}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="#E8EEF6" strokeWidth="1" />
              <text x={PAD.left - 10} y={y(t) + 4} textAnchor="end" className="fill-[#9BB5CB] text-[11px]">{t}</text>
            </g>
          ))}

          {/* The hovered week's column, behind everything. */}
          {hover != null && (
            <rect
              x={x(hover) - band / 2}
              y={PAD.top}
              width={band}
              height={innerH}
              fill="#2563EB"
              opacity="0.06"
            />
          )}

          {/* The Present series is also shaded, which is what makes it read as
              the subject and the other two as context. */}
          {SERIES.filter((s) => s.fill).map((s) => (
            <polygon
              key={`${s.key}-fill`}
              points={`${x(0)},${y(0)} ${points.map((p, i) => `${x(i)},${y(p[s.key])}`).join(' ')} ${x(points.length - 1)},${y(0)}`}
              fill={s.colour}
              opacity="0.08"
            />
          ))}

          {SERIES.map((s) => (
            <polyline
              key={s.key}
              points={points.map((p, i) => `${x(i)},${y(p[s.key])}`).join(' ')}
              fill="none"
              stroke={s.colour}
              strokeWidth="2"
              strokeDasharray={s.dashed ? '7 5' : undefined}
              strokeLinejoin="round"
            />
          ))}

          {SERIES.map((s) =>
            points.map((p, i) => (
              <g key={`${s.key}-${i}`}>
                <circle cx={x(i)} cy={y(p[s.key])} r={hover === i ? 5 : 3.5} fill={s.colour} />
                {/* Every week for a `showAllValues` series (Present, 4-wk reach),
                    otherwise only the HOVERED week. 4-wk average would smear into
                    Present if shown on every week, so it stays hover-only; the
                    tooltip always carries the full set. */}
                {(s.showAllValues || hover === i) && (
                  <text x={x(i)} y={y(p[s.key]) - 9} textAnchor="middle" className="fill-primary text-[10px] font-semibold">
                    {p[s.key]}
                  </text>
                )}
              </g>
            ))
          )}

          {/* Anchored at the END and rotated about its own tick: that pairing is
              what makes the label hang straight DOWN from the week it belongs to
              and read upwards. Anchored any other way it would start at the tick
              and run off the bottom of the chart. */}
          {points.map((p, i) => (
            <text
              key={p.label}
              x={x(i)}
              y={axisY}
              textAnchor="end"
              transform={`rotate(-90 ${x(i)} ${axisY})`}
              className="fill-[#9BB5CB] text-[11px]"
            >
              {p.label}
            </text>
          ))}

          {/* The month sits under the dates, so it clears them whichever angle
              they are drawn at. */}
          {monthLabel && (
            <text
              x={PAD.left + innerW / 2}
              y={H - 8}
              textAnchor="middle"
              className="fill-text-muted text-[12px]"
            >
              {monthLabel}
            </text>
          )}

          {/* One invisible column per week, on top, so the whole height of a
              week is hoverable rather than the four dots on its lines. */}
          {points.map((p, i) => (
            <rect
              key={`hit-${p.label}`}
              x={x(i) - band / 2}
              y={PAD.top}
              width={band}
              height={innerH}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              tabIndex={0}
              role="button"
              aria-label={`Week of ${p.weekLabel ?? p.label}`}
            />
          ))}
        </svg>

        {/* Positioned as a percentage of the chart's own width, so it tracks the
            column at any size. Flipped to the left of the point once past
            halfway, which keeps it inside the card. */}
        {active && (
          <div
            className="pointer-events-none absolute top-6 z-10 w-[260px] rounded-card border border-line-soft bg-surface p-4 shadow-card"
            style={
              (x(hover) / W) > 0.55
                ? { right: `${100 - (x(hover) / W) * 100 + 2}%` }
                : { left: `${(x(hover) / W) * 100 + 2}%` }
            }
          >
            <p className="font-display text-base font-bold text-primary">
              Week of {active.weekLabel ?? active.label}
            </p>
            {active.month && <p className="mt-0.5 text-sm text-text-muted">{active.month}</p>}

            <ul className="mt-2.5 space-y-1.5">
              {[SERIES[0], ABSENT, SERIES[1], SERIES[2]].map((s) => (
                <li key={s.key} className="flex items-center gap-2.5">
                  {/* A line for a plotted series, a filled square for Absent. */}
                  {s === ABSENT ? (
                    <span className="inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: s.colour }} />
                  ) : (
                    <span
                      className="inline-block h-0.5 w-6 shrink-0 rounded"
                      style={{ background: s.colour }}
                    />
                  )}
                  <span className="tnum text-sm font-bold text-primary">{active[s.key] ?? 0}</span>
                  {active[s.pctKey] != null && (
                    <span className="tnum text-sm text-text-muted">{pct(active[s.pctKey])}</span>
                  )}
                  <span className="ml-auto text-sm text-text-muted">{s.label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
