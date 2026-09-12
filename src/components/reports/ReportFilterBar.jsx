import { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { readReportFilters } from '../../utils/reportFilters';

/**
 * Pradesh / Mandal / Sabha / Year, for the report screens.
 *
 * The options are the API's own — every report response carries a `filters`
 * block listing what THIS caller may filter by (see utils/reportFilters.js).
 * Nothing is fetched here, and nothing is offered that the response did not
 * name: a Sabha Head gets no Pradesh dropdown because their response carries no
 * Pradesh list, not because the UI decided to hide it.
 *
 * A level that comes back empty renders nothing, and a bar with no levels at all
 * renders nothing at all rather than an empty row of labels.
 *
 * Choosing a level CLEARS the ones below it: a Mandal from the previously
 * selected Pradesh is not a valid filter once the Pradesh changes, and leaving
 * it set would send a contradictory pair.
 */
export default function ReportFilterBar({
  filters, value, onChange, busy = false,
  /** What "no year" means on this screen. Only reaches a bar that shows Year. */
  yearAllLabel = 'All years',
  /**
   * Hide the Year dropdown.
   *
   * Two screens pass `false`, for the same reason: their endpoint does not take
   * a year, so offering one would be a control that changes nothing. The Sabha
   * report never took one; the KPI row above the tabs stopped taking one when
   * all eight figures moved onto the last COMPLETED Sabha week.
   */
  showYear = true,
}) {
  const options = useMemo(() => readReportFilters(filters), [filters]);
  const { pradeshes, mandals, sabhas, years } = options;

  const anything = pradeshes.length || mandals.length || sabhas.length || (showYear && years.length);
  if (!anything) return null;

  const set = (patch) => onChange({ ...value, ...patch });

  return (
    /* Two per row on a phone, then a single row from `sm` up.
       With the captions gone each select is just a control, so on a narrow
       screen they tile two-up and fill the width instead of stacking into a
       column of half-empty rows.

       LEFT-ALIGNED, not right. The bar is a full-width row of its own on every
       screen that uses it, with nothing opposite — so a right-aligned set read
       as controls that had drifted off the end of the page. Flush left, its edge
       is the same edge as the title, the breadcrumbs and the cards below it. */
    <div className="grid grid-cols-2 items-center gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-3">
      {pradeshes.length > 0 && (
        <FilterSelect
          id="report-filter-pradesh"
          label="Pradesh"
          allLabel="All Pradesh"
          options={pradeshes}
          value={value.pradeshId}
          onChange={(v) => set({ pradeshId: v, mandalId: null, sabhaId: null })}
        />
      )}
      {mandals.length > 0 && (
        <FilterSelect
          id="report-filter-mandal"
          label="Mandal"
          allLabel="All Mandals"
          options={mandals}
          value={value.mandalId}
          onChange={(v) => set({ mandalId: v, sabhaId: null })}
        />
      )}
      {sabhas.length > 0 && (
        <FilterSelect
          id="report-filter-sabha"
          label="Sabha"
          allLabel="All Sabhas"
          options={sabhas}
          value={value.sabhaId}
          onChange={(v) => set({ sabhaId: v })}
        />
      )}
      {showYear && years.length > 0 && (
        <FilterSelect
          id="report-filter-year"
          label="Year"
          allLabel={yearAllLabel}
          options={years.map((y) => ({ id: y, name: y }))}
          value={value.year}
          onChange={(v) => set({ year: v })}
        />
      )}

      {/* Last, not first: a spinner ahead of the controls read as a fifth one
          that had failed to load, and it appears and disappears on every
          refetch — at the end of the row nothing before it moves. */}
      {busy && <Loader2 className="h-4 w-4 animate-spin text-primary" aria-label="Updating" />}
    </div>
  );
}

/**
 * One dropdown. `''` is the "all" row and reports back as null — the parameter
 * is then omitted entirely rather than sent as an empty string.
 *
 * Ids stay numbers where they arrived as numbers, so the value that goes into
 * the query string is the type the endpoint documents.
 */
function FilterSelect({ id, label, options, value, allLabel, onChange }) {
  return (
    // NO VISIBLE LABEL. The unselected row already names the dimension — "All
    // Pradesh", "All Mandals", "All Sabhas", "All years" — so a caption beside it
    // said the same word twice and cost a filter bar's worth of width. `label`
    // lives on as the accessible name, which a screen reader still needs
    // because the visible text changes with the selection.
    //
    // TWO WIDTHS, AND NEITHER IS `w-full` ON ITS OWN. `w-full` fills the grid
    // cell on a phone so the two in a row are equal halves — but a bare `w-full`
    // in the flex row above `sm` makes every select 100% of the BAR, and
    // flex-wrap then puts each on a line of its own. That is what stacked the
    // four filters down the left of the Reports page.
    //
    // `sm:w-44` rather than `sm:w-auto`: sized to their content the four came
    // out four different widths, which is what made a tidy row look ragged. One
    // width for all of them reads as a set of controls. Long Sabha names are
    // clipped by the select, and the full text is still there when it opens.
    <select
      id={id}
      aria-label={label}
      title={label}
      className="h-9 w-full rounded-control border border-line-strong bg-surface px-2.5 text-xs font-semibold text-primary outline-none transition-colors focus:border-primary/50 sm:w-44"
      value={value ?? ''}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') { onChange(null); return; }
        onChange(/^\d+$/.test(raw) ? Number(raw) : raw);
      }}
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>{o.name}</option>
      ))}
    </select>
  );
}
