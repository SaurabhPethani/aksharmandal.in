import { PAGE_SIZE_OPTIONS } from '../constants/pagination';

export default function PageSizeSelect({ value, onChange, id = 'page-size' }) {
  if (!onChange) return null;

  return (
    <div className="flex items-center gap-1.5">
      <label htmlFor={id} className="text-xs font-semibold text-text-muted">
        Show
      </label>
      <select
        id={id}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="h-9 rounded-control border border-line-strong bg-surface px-2 text-xs font-semibold text-primary outline-none transition-colors focus:border-primary/50"
      >
        {PAGE_SIZE_OPTIONS.map(size => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </select>
    </div>
  );
}
