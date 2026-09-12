import { useRef, useState } from 'react';
import { Check, ChevronDown, Search as SearchIcon, X } from 'lucide-react';
import { useDismissable } from '../../hooks';
import { searchMatches } from '../../utils/options';

/**
 * `compact` shrinks the label and tightens the stack — for long multi-step forms
 * where a page of full-size labels becomes a wall. Opt-in, so dialogs and short
 * forms keep the default scale.
 */
export function FormField({
  label, htmlFor, error, hint, required, badge = null, compact = false, children,
}) {
  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {label && (
        // The badge sits on the label's own line, pushed to the far end. Its
        // container is a flex row only when there is a badge to place, so a
        // field without one keeps the plain block label it always had.
        <div className={badge ? 'flex items-center justify-between gap-2' : undefined}>
          <label
            htmlFor={htmlFor}
            className={`block font-bold text-text-muted ${compact ? 'text-xs' : 'text-sm'}`}
          >
            {label}
            {required && <span className="ml-0.5 text-danger-fg">*</span>}
          </label>
          {badge}
        </div>
      )}
      {children}
      {error ? (
        // `break-words` + normal wrapping so a long message (e.g. the mobile
        // "already registered with Name : Sabha : Mandal") flows onto the next
        // line on a narrow phone rather than truncating or overflowing the field.
        <p className="whitespace-normal break-words text-xs font-medium text-danger-fg">{error}</p>
      ) : (
        hint && <p className="text-xs text-text-muted">{hint}</p>
      )}
    </div>
  );
}

export function Input({ className = '', error, ...rest }) {
  return <input className={`input-field ${error ? '!border-danger-fg' : ''} ${className}`} {...rest} />;
}

export function Textarea({ className = '', rows = 4, error, ...rest }) {
  return (
    <textarea
      rows={rows}
      className={`input-field resize-y ${error ? '!border-danger-fg' : ''} ${className}`}
      {...rest}
    />
  );
}

/**
 * Native select, styled to match `.input-field` with a custom chevron.
 *
 * `error` is consumed rather than spread, for the same two reasons DatePicker
 * does it: it draws the red border every other control draws, and it keeps a
 * non-DOM prop off the <select> element.
 *
 * It is truthiness, not a message — the wording is FormField's job. Passing the
 * error string itself is therefore fine and is what most callers do.
 */
export function Select({ options = [], placeholder = 'Select…', className = '', error, ...rest }) {
  return (
    <div className="relative">
      <select
        className={`input-field appearance-none pr-10 ${error ? '!border-danger-fg' : ''} ${className}`}
        {...rest}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
    </div>
  );
}

/**
 * Checkbox with its label to the right — the label belongs to the control here
 * rather than sitting above it, so these are rendered without a FormField.
 */
export function Checkbox({ label, checked = false, onChange, disabled = false, id, className = '' }) {
  return (
    <label
      htmlFor={id}
      className={`flex cursor-pointer items-center gap-2.5 py-2 ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${className}`}
    >
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 shrink-0 cursor-pointer rounded border-line-input text-primary accent-primary focus:ring-primary/40"
      />
      <span className="text-sm font-bold text-text-muted">{label}</span>
    </label>
  );
}

/**
 * Native date input — no extra dependency, and it gets the platform picker.
 *
 * `min` / `max` pass straight through: the picker greys out anything outside
 * them, which is how Date of Birth stops offering future days. They bound the
 * calendar only — a typed or pasted date still needs a rule to reject it.
 *
 * `error` is consumed here rather than spread, both to draw the same red border
 * the other controls use and to keep a non-DOM prop off the element.
 */
export function DatePicker({ className = '', error, ...rest }) {
  return (
    <input
      type="date"
      className={`input-field ${error ? '!border-danger-fg' : ''} ${className}`}
      {...rest}
    />
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className = '' }) {
  return (
    <div className={`relative ${className}`}>
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-faint" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field !py-2.5 pl-10 pr-9"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-muted transition-colors hover:bg-primary-50 hover:text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/**
 * Searchable single-select.
 *
 * The native <Select> stops being usable somewhere around a few dozen options —
 * a member list runs to hundreds — so this filters as you type. Options may
 * carry a `meta` (a mobile number, say), which is both shown under the label and
 * searched alongside it, so "search by name or mobile" is one field.
 *
 * Controlled and stateless about its value: it renders `value` and calls
 * `onChange`, never selecting anything itself.
 */
export function Combobox({
  value, onChange, options = [], placeholder = 'Search…', disabled = false,
  id, error, emptyLabel = 'No matches',
  /**
   * The open list's search box. Defaults to `placeholder`, which is right when
   * the closed control is itself worded as a search. Give it separately when
   * the closed control says what is being chosen ("Select a follow-up person")
   * — reusing that wording would print the same sentence twice, once in the
   * control and again in the box directly below it.
   */
  searchPlaceholder,
  /**
   * Where the option list goes when open.
   *
   *   'overlay' (default) floats it over the page — right for a normal form.
   *   'inline'            puts it in the normal flow, growing the container.
   *
   * Inside a dialog it must be 'inline': the modal body is a scroll container,
   * and an absolutely positioned list is clipped by it, so the options end up
   * invisible no matter how far you scroll.
   */
  placement = 'overlay',
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const ref = useRef(null);
  useDismissable(ref, () => setOpen(false), open);

  const selected = options.find((o) => String(o.value) === String(value)) ?? null;
  // Search by anything: each typed word must appear in the label or meta, in any
  // order — so "Amit Limbasia" and "Limbasia Amit" both find "Amit Gordhan
  // Limbasia". See searchMatches.
  const term = query.trim();
  const filtered = term
    ? options.filter((o) => searchMatches(`${o.label ?? ''} ${o.meta ?? ''}`, term))
    : options;

  const choose = (option) => {
    onChange(option.value);
    setQuery('');
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`input-field flex w-full items-center justify-between gap-2 text-left ${
          error ? '!border-danger-fg' : ''
        } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      >
        <span className={`truncate ${selected ? 'text-primary' : 'text-text-faint'}`}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && !disabled && (
        <div
          className={`mt-1.5 w-full overflow-hidden rounded-card border border-line-soft bg-surface ${
            placement === 'inline' ? 'relative' : 'absolute z-40 shadow-card'
          }`}
        >
          <div className="border-b border-line-soft p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder ?? placeholder}
              className="input-field !py-2 text-sm"
            />
          </div>
          <ul role="listbox" className={`overflow-y-auto py-1 ${placement === 'inline' ? 'max-h-52' : 'max-h-60'}`}>
            {filtered.length === 0 && (
              <li className="px-3.5 py-3 text-sm text-text-muted">{emptyLabel}</li>
            )}
            {filtered.map((o) => {
              const active = String(o.value) === String(value);
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => choose(o)}
                    className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left transition-colors ${
                      active ? 'bg-primary-50' : 'hover:bg-primary-50'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className={`block truncate text-sm ${active ? 'font-semibold text-primary' : 'text-primary'}`}>
                        {o.label}
                      </span>
                      {o.meta && <span className="block truncate text-xs text-text-muted">{o.meta}</span>}
                    </span>
                    {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Custom dropdown for menus and multi-option filters. */
export function Dropdown({ label, options = [], value, onSelect, align = 'left', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useDismissable(ref, () => setOpen(false), open);

  const selected = options.find((o) => (o.value ?? o) === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-control border border-line-strong bg-surface px-3.5 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary-50"
      >
        {selected?.label ?? selected ?? label}
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          className={`absolute z-40 mt-1.5 min-w-[12rem] overflow-hidden rounded-card border border-line-soft bg-surface py-1 shadow-card ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {options.map((o) => {
            const val = o.value ?? o;
            const active = val === value;
            return (
              <button
                key={val}
                onClick={() => { onSelect(val); setOpen(false); }}
                className={`flex w-full items-center justify-between gap-3 px-3.5 py-2 text-left text-sm transition-colors ${
                  active ? 'bg-primary-50 font-semibold text-primary' : 'text-text-muted hover:bg-primary-50 hover:text-primary'
                }`}
              >
                {o.label ?? o}
                {active && <Check className="h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
