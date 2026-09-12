import { useId, useMemo, useState } from 'react';
import { LineChart, Table as TableIcon } from 'lucide-react';
import { Skeleton } from '../ui';

// Series colours are brand-derived steps that PASS all six palette checks
// (lightness band, chroma floor, CVD separation, normal-vision floor, contrast
// >= 3:1 on a light surface). The raw brand navy #003158 FAILS as a chart mark —
// too dark for the lightness band and too gray for the chroma floor — so it is
// deliberately not used here. Re-validate before changing these.
export const SERIES = [
  { key: 'present', label: 'Present %', color: '#3389C9' },
  { key: 'average4w', label: '4-week average %', color: '#D96A0A' },
];

const PAD = { top: 16, right: 16, left: 36 };


/**
 * Roughly how wide a label renders, in px, at the 10px axis size.
 *
 * An estimate rather than a measurement: laying the text out to find out costs a
 * DOM round trip per render, and the only decision it feeds is tilt-or-not. 5.6px
 * per character is a little generous for "20 Jul" — erring wide tilts a
 * borderline axis, which is the safer way to be wrong.
 */
const labelWidth = (label) => String(label ?? '').length * 5.6;

/**
 * Line chart for one or more percentage series over time.
 *
 * `points` is [{ label, sortKey, ...values }] keyed by each series' `key`; every
 * value comes from the API. `series` defaults to the Reports pair above; the
 * dashboard's attendance trend passes a single one.
 *
 * THE FIRST SERIES IS THE SUBJECT: it is drawn solid and carries the area fill
 * under it. Every series after it is dashed, so the two are told apart by shape
 * as well as by colour — a chart printed in grey, or read by someone who cannot
 * separate the hues, still says which line is which.
 *
 * A LEGEND ONLY FROM TWO SERIES UP. With one line there is nothing to tell
 * apart, and a legend box naming the single thing the card's own title already
 * names is furniture.
 *
 * `tooltipExtras(point) -> [{ label, value }]` adds rows under the plotted
 * figures on hover — the counts behind a percentage, typically. They live in the
 * TOOLTIP and not on the axis for the reason there is only ever one axis here: a
 * count and a percentage are two scales, and plotting both would need two. On
 * hover there is no scale to disagree with, just the numbers for that week.
 *
 * `pointLabel(point) -> string | string[] | null` writes a small always-visible
 * label above each point on the subject line — e.g. "10/15" for a present/total
 * ratio, or `["10/15", "40%"]` to stack a ratio over its share. It is for
 * numbers that fit alongside the percentage without needing a second axis (the
 * label is prose, not a plotted mark), painted in the series colour so its
 * identity follows the line. Skipped when the callback returns null.
 *
 * Multi-line labels are stacked with a 11px line height. When the stack would
 * clip against the top of the plot area, it flips BELOW the point so the label
 * still reads — the value near 100% is the case that would otherwise be lost.
 *
 * `formatSeriesValue(point, series) -> string | null` overrides how a series'
 * value is rendered in the TOOLTIP and TABLE — the axis and the line itself are
 * always numeric, this only changes the words that report the same fact. Meant
 * for series whose plotted number is a stand-in for a category ("100" means
 * Present, "0" means Absent on the personal 8-week card): the reader is never
 * shown the percentage, only the label it encodes. Returning null falls back to
 * the default `${value.toFixed(1)}%`.
 *
 * `hideYAxis` drops the 0-100 gridlines and axis labels. For a series whose
 * value is a stand-in for a category (see `formatSeriesValue`), the percentage
 * scale is furniture — the label on the point is what the reader reads. The
 * left padding is not reclaimed on purpose, so a chart that turns the axis on
 * and off does not jump sideways.
 *
 * `extraColumns = [{ header, cell(point) -> ReactNode }]` inserts additional
 * columns into the TABLE view between the Week column and the series columns
 * — e.g. a "Present / Total" count column alongside the "Present %" series
 * column. They belong to the same row and are read left-to-right in the order
 * given. Chart view ignores them: extra columns are text about a row, not a
 * second series that would need a second axis.
 */
export default function TrendChart({
  points = [], series = SERIES, height = 260, loading = false, tooltipExtras = null, pointLabel = null, formatSeriesValue = null, hideYAxis = false, extraColumns = null,
}) {
  const gradientId = useId();
  const [hover, setHover] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const geometry = useMemo(() => {
    if (points.length === 0) return null;
    const width = 720; // viewBox width; the SVG scales to its container
    const innerW = width - PAD.left - PAD.right;

    /**
     * THE LABELS ARE ALWAYS VERTICAL — `rotate(-90)`, reading bottom to top, the
     * same as the Reports weekly trend. Turned, a label occupies only its own
     * line height along the axis (~12px) rather than its full width, which is
     * what lets twelve weeks of "20 Jul" fit where they used to collide.
     *
     * ALWAYS, not only when crowded: switching orientation with the window meant
     * the four-week view and the twelve-week view read as two different charts,
     * and this card has a control that flips between exactly those two.
     *
     * A TURNED LABEL IS AS TALL AS IT WAS WIDE, so the space under the plot is
     * the longest label's own length plus a gap rather than a fixed figure — a
     * constant would either clip the long ones or waste height on the short.
     */
    const gap = points.length > 1 ? innerW / (points.length - 1) : innerW;
    const widest = Math.max(...points.map((p) => labelWidth(p.label)));

    const padBottom = Math.ceil(widest) + 22;
    const innerH = height - PAD.top - padBottom;
    // Percentages always plot against a fixed 0–100 axis so charts stay comparable.
    const x = (i) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (v) => PAD.top + innerH - (Math.max(0, Math.min(100, v ?? 0)) / 100) * innerH;

    const line = (key) =>
      points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(p[key]).toFixed(2)}`).join(' ');

    const area = `${line(series[0].key)} L${x(points.length - 1).toFixed(2)},${(PAD.top + innerH).toFixed(2)} L${x(0).toFixed(2)},${(PAD.top + innerH).toFixed(2)} Z`;

    /**
     * Every label, unless even tilted they will not fit.
     *
     * Thinning used to be unconditional — one label in every `ceil(n / 7)` — so
     * a twelve-week axis printed five dates and left the reader counting
     * gridlines for the rest. Turning them buys the room back; this only steps
     * in for a year of weeks, where 52 do not fit at any angle.
     */
    const tickEvery = Math.max(1, Math.ceil(12 / Math.max(gap, 1)));

    return { width, innerW, innerH, x, y, line, area, padBottom, tickEvery };
  }, [points, height, series]);

  if (loading) return <Skeleton className="w-full" style={{ height }} />;

  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-card border border-dashed border-line px-6 text-center" style={{ height }}>
        <p className="text-sm text-text-muted">No attendance recorded for this period.</p>
      </div>
    );
  }

  const { width, innerH, x, y, line, area, padBottom, tickEvery } = geometry;
  /** The point each label hangs down from, and is rotated about. */
  const axisY = height - padBottom + 12;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {/* Legend is always present for >= 2 series — identity is never colour
            alone — and absent for one, where there is nothing to tell apart. The
            empty span keeps "Show table" against the right edge either way. */}
        {series.length > 1 ? (
          <div className="flex flex-wrap items-center gap-4">
            {series.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-xs font-medium text-text-muted">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
            ))}
          </div>
        ) : <span />}
        {/* A bordered control rather than bare blue text: it sits above a card
            with nothing else on that line, and an unadorned link there floats
            free of anything — it reads as a stray caption until you hover it. */}
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className="inline-flex items-center gap-1.5 rounded-control border border-line-soft px-2.5 py-1 text-xs font-semibold text-text-muted transition-colors hover:border-primary/30 hover:text-primary"
        >
          {showTable ? <LineChart className="h-3.5 w-3.5" /> : <TableIcon className="h-3.5 w-3.5" />}
          {showTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {showTable ? (
        /**
         * THE TABLE IS THE CHART'S EQUAL, not its fallback — it is the accessible
         * view of the same numbers, and it was reading like a dump: every value in
         * muted grey, left-aligned, with no sense of magnitude.
         *
         *   right-aligned + `tnum`   percentages line up on the decimal, so a
         *                            column can be scanned rather than read
         *   values in primary ink    the number IS the content; muted grey is for
         *                            the labels that qualify it
         *   an in-cell bar           the one thing the chart had that this did
         *                            not — magnitude at a glance. Drawn for the
         *                            subject series only, in that series' own
         *                            colour, so identity still follows the entity
         *
         * The bar is hidden below `sm`, where the column is too narrow to be
         * anything but noise beside the figure it duplicates.
         */
        <div className="overflow-auto rounded-card border border-line-soft" style={{ maxHeight: height }}>
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0">
              <tr>
                <th className="table-th px-3 py-2">Week</th>
                {extraColumns?.map((c) => (
                  <th key={`x-${c.header}`} className="table-th px-3 py-2 text-right">{c.header}</th>
                ))}
                {series.map((s) => (
                  <th key={s.key} className="table-th px-3 py-2 text-right">{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr
                  key={p.sortKey ?? p.label}
                  className="border-t border-line-soft transition-colors hover:bg-primary-50/40"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-text-muted">{p.label}</td>
                  {extraColumns?.map((c) => (
                    <td key={`x-${c.header}`} className="whitespace-nowrap px-3 py-2 text-right">
                      <span className="tnum font-semibold text-primary">{c.cell(p)}</span>
                    </td>
                  ))}
                  {series.map((s, si) => {
                    const value = p[s.key];
                    return (
                      <td key={s.key} className="px-3 py-2">
                        <div className="flex items-center justify-end gap-2.5">
                          {si === 0 && (
                            <span
                              aria-hidden="true"
                              className="hidden h-1.5 w-20 shrink-0 overflow-hidden rounded-full bg-bg sm:block"
                            >
                              <span
                                className="block h-full rounded-full"
                                style={{
                                  width: `${Math.max(0, Math.min(100, Number(value) || 0))}%`,
                                  background: s.color,
                                }}
                              />
                            </span>
                          )}
                          <span className="tnum w-20 shrink-0 text-right font-semibold text-primary">
                            {(() => {
                              const custom = formatSeriesValue?.(p, s);
                              if (custom != null) return custom;
                              return value == null ? '—' : `${Number(value).toFixed(1)}%`;
                            })()}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full"
            style={{ height }}
            role="img"
            aria-label="Weekly attendance trend"
            onMouseLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={series[0].color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={series[0].color} stopOpacity="0" />
              </linearGradient>
            </defs>

            {/* Recessive gridlines and axis labels. Suppressed when the
                caller hides the axis — see `hideYAxis` in the docstring. */}
            {!hideYAxis && [0, 25, 50, 75, 100].map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="#E2EAF4" strokeWidth="1" />
                <text x={PAD.left - 8} y={y(v) + 4} textAnchor="end" className="fill-[#9BB5CB] text-[10px]">{v}</text>
              </g>
            ))}

            <path d={area} fill={`url(#${gradientId})`} />
            {/* Comparison lines first, so the subject is drawn over them rather
                than under. Dashed — see the note at the top. */}
            {series.slice(1).map((s) => (
              <path
                key={s.key}
                d={line(s.key)}
                fill="none"
                stroke={s.color}
                strokeWidth="2"
                strokeDasharray="4 4"
                strokeLinecap="round"
              />
            ))}
            <path d={line(series[0].key)} fill="none" stroke={series[0].color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

            {/* Always-visible label above each subject point. Rendered only
                when `pointLabel` returns a non-empty value, and only for
                points that carry a value on the subject series (a missing
                value has nothing to sit above). A string renders as one line;
                a string[] renders stacked. If the stack would clip at the top
                of the plot, it flips below the point — 100% would otherwise
                lose its label into the padding. */}
            {pointLabel && points.map((p, i) => {
              const v = p[series[0].key];
              if (v == null) return null;
              const result = pointLabel(p);
              if (result == null || result === '') return null;
              const lines = Array.isArray(result) ? result.filter((l) => l != null && l !== '') : [result];
              if (!lines.length) return null;
              const lineHeight = 11;
              const pointY = y(v);
              const stackHeight = lines.length * lineHeight;
              // Above by default; flip below if the stack would clip the top.
              const above = pointY - stackHeight - 6 >= PAD.top;
              const firstLineY = above
                ? pointY - 6 - (lines.length - 1) * lineHeight
                : pointY + 14;
              return (
                <g key={`pl-${p.sortKey ?? p.label}`}>
                  {lines.map((line, li) => (
                    <text
                      key={li}
                      x={x(i)}
                      y={firstLineY + li * lineHeight}
                      textAnchor="middle"
                      className="tnum text-[10px] font-semibold"
                      fill={series[0].color}
                    >
                      {line}
                    </text>
                  ))}
                </g>
              );
            })}

            {/* Keyed on the week's date, not its label: formatWeekLabel renders
                "05 Jan" with no year, so a series spanning two years would
                produce duplicate keys and React would reconcile the wrong node. */}
            {points.map((p, i) => (
              <g key={p.sortKey ?? p.label}>
                {i % tickEvery === 0 && (
                  /* Anchored at its END and rotated about its own tick: that
                     pairing is what makes the label hang straight DOWN from the
                     tick and read upwards. Anchored any other way it would start
                     there and run off the bottom of the chart. */
                  <text
                    x={x(i)}
                    y={axisY}
                    textAnchor="end"
                    transform={`rotate(-90 ${x(i)} ${axisY})`}
                    className="fill-[#9BB5CB] text-[10px]"
                  >
                    {p.label}
                  </text>
                )}
                {/* Generous invisible hit target, larger than the mark itself. */}
                <rect
                  x={x(i) - 16}
                  y={PAD.top}
                  width={32}
                  height={innerH}
                  fill="transparent"
                  onMouseEnter={() => setHover(i)}
                />
                {hover === i && (
                  <>
                    <line x1={x(i)} x2={x(i)} y1={PAD.top} y2={PAD.top + innerH} stroke="#C5D8E8" strokeWidth="1" />
                    {series.map((s) => (
                      p[s.key] == null ? null : (
                        // 2px surface ring keeps overlapping markers separable.
                        <circle key={s.key} cx={x(i)} cy={y(p[s.key])} r="5" fill={s.color} stroke="#fff" strokeWidth="2" />
                      )
                    ))}
                  </>
                )}
              </g>
            ))}
          </svg>

          {hover != null && (
            <div
              // w-max, not the default shrink-to-fit: the box is anchored at the
              // hovered point, so near the right edge its available width is a
              // sliver and the count rows wrap. translateX moves it back into
              // view but does not restore the width it was sized against.
              className="pointer-events-none absolute top-2 w-max rounded-control border border-line-soft bg-surface px-3 py-2 shadow-card"
              style={{
                left: `${(x(hover) / width) * 100}%`,
                transform: `translateX(${hover > points.length / 2 ? '-105%' : '5%'})`,
              }}
            >
              <p className="text-[11px] font-semibold text-primary">{points[hover].label}</p>
              {series.map((s) => {
                const raw = points[hover][s.key];
                const custom = formatSeriesValue?.(points[hover], s);
                const display = custom != null
                  ? custom
                  : (raw == null ? '—' : `${Number(raw).toFixed(1)}%`);
                return (
                  <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-muted">
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {s.label}:{' '}
                    <span className="tnum font-semibold text-primary">{display}</span>
                  </p>
                );
              })}

              {/* The counts behind the figure above. Separated by a hairline and
                  with no colour dot: these are not plotted, and a dot would say
                  they were a series that had been left off the chart. */}
              {(() => {
                const extras = tooltipExtras?.(points[hover]) ?? [];
                if (!extras.length) return null;
                return (
                  <div className="mt-1.5 space-y-0.5 border-t border-line-soft pt-1.5">
                    {extras.map((e) => (
                      <p key={e.label} className="flex items-center justify-between gap-4 whitespace-nowrap text-[11px] text-text-muted">
                        {e.label}
                        <span className="tnum font-semibold text-primary">{e.value}</span>
                      </p>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
