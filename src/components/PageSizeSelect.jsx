import { PAGE_SIZE_OPTIONS } from '../constants/pagination';

/**
 * "Show 25" — how many records a page holds.
 *
 * Rendered by both pagers, so the control is identical wherever a list is paged.
 * Nothing appears unless the screen passes `onChange`: a list that cannot honour
 * a different size must not offer one.
 *
 * Changing it resets to page 1 — the hooks do that, not this component. Page 7
 * of 10-row pages is not page 7 of 100-row pages, and staying on the number
 * would land the reader somewhere unrelated in the list.
 */
export default function PageSizeSelect({ value, onChange, id = 'page-size' }) {
  if (!onChange) return null;

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-text-muted">Show</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 rounded-control border border-line-strong bg-surface px-2 text-xs font-semibold text-primary outline-none transition-colors focus:border-primary/50"
      >
        {PAGE_SIZE_OPTIONS.map((size) => (
          <option key={size} value={size}>{size}</option>
        ))}
      </select>
    </div>
  );
}
