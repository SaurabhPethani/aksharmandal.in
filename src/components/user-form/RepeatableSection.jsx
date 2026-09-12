import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { Button, ErrorState, Skeleton } from '../ui';
import PlainField from './PlainField';
import { itemDraftFrom, itemFieldsFor, validateItem, variantOf } from '../../utils/userFormSchema';
import { labelFor } from './shared';

/**
 * An add-many list — Education and Job.
 *
 * Entries already added are listed above; the add form appears on demand and
 * validates its own required fields, so a half-filled entry never joins the
 * list. Each entry is removable.
 *
 * Two modes, decided by whether `persist` was passed:
 *   with it    the member exists, so each row is written on its own as it is
 *              added, edited or deleted
 *   without it the member does not exist yet, so entries wait in `values` and
 *              are posted to their own endpoints after the create succeeds
 */
export default function RepeatableSection({
  section, items, lookups, onAdd, onUpdate, onRemove, query = null, persist = null, onError,
}) {
  const variants = section.variants ?? null;
  const firstVariant = variants?.[0]?.value ?? null;

  const [draft, setDraft] = useState(
    variants ? { [section.variantField]: firstVariant } : {}
  );
  const [draftErrors, setDraftErrors] = useState({});
  const [open, setOpen] = useState(false);
  /**
   * Which entry the form is open over, by position, or null when it is adding a
   * new one.
   *
   * Position rather than id, because an entry added on the create form has no id
   * yet — it lives in the page's `values` until the member exists. Editing works
   * in both modes; only where the change is written differs.
   */
  const [editingIndex, setEditingIndex] = useState(null);
  const editing = editingIndex == null ? null : items[editingIndex] ?? null;

  const reset = () => {
    setDraft(variants ? { [section.variantField]: firstVariant } : {});
    setDraftErrors({});
    setEditingIndex(null);
    setOpen(false);
  };

  /**
   * Reopens the form over an existing entry, in that entry's own variant.
   *
   * Through `itemDraftFrom` rather than spreading the row directly: a field the
   * API stores under one key and edits under another (Nature of Business, which
   * returns a resolved id alongside its name) has to open on the editable one.
   */
  const startEdit = (item, index) => {
    setDraft(itemDraftFrom(section, item));
    setDraftErrors({});
    setEditingIndex(index);
    setOpen(true);
  };

  /**
   * Switching variant clears the draft rather than keeping what was typed: the
   * two field sets barely overlap, and carrying a Job Title into a Business
   * entry would submit a value its own form never showed.
   */
  const chooseVariant = (value) => {
    setDraft({ [section.variantField]: value });
    setDraftErrors({});
  };

  const draftFields = itemFieldsFor(section, draft);

  const save = async () => {
    const found = validateItem(section, draft);
    if (Object.keys(found).length) { setDraftErrors(found); return; }

    // No `persist` means the member does not exist yet — the entry waits in
    // `values` and is submitted with the rest of the form.
    if (!persist) {
      if (editingIndex != null) onUpdate?.(editingIndex, draft);
      else onAdd(draft);
      reset();
      return;
    }

    try {
      if (editing?.id != null) await persist.update(editing.id, draft);
      else await persist.create(draft);
      reset();
    } catch (err) {
      // The form stays open so the entry is not lost and can be retried.
      //
      // A 422 names its fields, so those messages go under the controls that
      // caused them rather than into a toast the user reads once and then has to
      // match up by hand. Anything with no field of its own here still surfaces.
      const placed = Object.entries(err?.fieldErrors ?? {})
        .filter(([name]) => draftFields.some((f) => f.name === name));

      if (placed.length) setDraftErrors((e) => ({ ...e, ...Object.fromEntries(placed) }));
      if (!placed.length || placed.length < Object.keys(err?.fieldErrors ?? {}).length) onError?.(err);
    }
  };

  const removeAt = async (item, index) => {
    if (!persist) { onRemove(index); return; }
    try {
      await persist.remove(item.id);
    } catch (err) {
      onError?.(err);
    }
  };

  if (query?.isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
      </div>
    );
  }
  if (query?.error) {
    return <ErrorState error={query.error} onRetry={query.refetch} title="Could not load these records" />;
  }

  /**
   * The add/edit form. Rendered in one of two places: directly under the row
   * being edited, or at the bottom of the list when adding a new entry.
   *
   * Editing the second of six entries used to open the form at the very bottom,
   * far from the row it was about and often below the fold.
   */
  const form = (
    <div className="space-y-4 rounded-control border border-line-soft p-4">
      {variants && editingIndex == null && (
        <div className="flex gap-1 rounded-control bg-bg p-1">
          {variants.map((v) => {
            const active = (draft[section.variantField] ?? firstVariant) === v.value;
            return (
              <button
                key={v.value}
                type="button"
                onClick={() => chooseVariant(v.value)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                  active
                    ? 'bg-surface text-primary shadow-sm'
                    : 'text-text-muted hover:text-primary'
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {draftFields.map((field) => (
          <PlainField
            key={field.name}
            field={field}
            value={draft[field.name] ?? ''}
            error={draftErrors[field.name]}
            lookup={field.lookup ? lookups[field.lookup] : null}
            onChange={(name, value) => {
              setDraft((d) => ({ ...d, [name]: value }));
              setDraftErrors((e) => (e[name] ? { ...e, [name]: undefined } : e));
            }}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={reset} disabled={persist?.busy}>Cancel</Button>
        <Button variant="accent" onClick={save} busy={persist?.busy}>
          {editingIndex != null ? 'Update' : 'Save'}
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {items.length === 0 && !open && (
        <p className="rounded-control border border-line-soft px-4 py-6 text-center text-sm text-text-muted">
          {section.emptyLabel}
        </p>
      )}

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, index) => {
            // The headline is the first field of whichever variant this entry
            // belongs to, so a Business row leads with its name and a Job row
            // with its title.
            const headField = itemFieldsFor(section, item)[0];
            const head =
              labelFor(lookups[headField?.lookup], item[headField?.name]) ?? item[headField?.name] ?? '—';
            const detail = section.summary
              .map((name) => item[name])
              .filter((v) => v != null && String(v).trim() !== '')
              .join(' · ');
            const variant = variantOf(section, item);

            // The form takes this row's place while it is being edited, so the
            // entry is not shown twice — once as a summary, once as the fields.
            if (editingIndex === index) {
              return <li key={`editing-${index}`}>{form}</li>;
            }

            return (
              <li
                key={`${head}-${index}`}
                className="flex items-center justify-between gap-3 rounded-control border border-line-soft bg-bg px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-primary">{head}</p>
                    {variant && (
                      <span className="shrink-0 rounded-full bg-primary-50 px-2 py-0.5 text-[10px] font-semibold text-text-muted">
                        {variant.label}
                      </span>
                    )}
                  </div>
                  {detail && <p className="truncate text-xs text-text-muted">{detail}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {/* Offered in both modes: a typo in an entry added a moment
                      ago should not mean deleting it and typing it again. */}
                  <button
                    type="button"
                    onClick={() => startEdit(item, index)}
                    disabled={persist?.busy}
                    className="text-sm font-semibold text-primary transition-colors hover:text-accent disabled:opacity-50"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => removeAt(item, index)}
                    disabled={persist?.busy}
                    aria-label={`Remove ${head}`}
                    className={`font-semibold text-danger-fg transition-colors hover:underline disabled:opacity-50 ${
                      persist ? 'text-sm' : 'rounded-lg p-2 hover:bg-danger-bg'
                    }`}
                  >
                    {persist ? 'Delete' : <Trash2 className="h-4 w-4" />}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Adding puts the form at the end, where the new entry will land.
          Editing puts it in the row's own place, above — so this slot is empty
          and the Add button stays hidden until that edit is finished. */}
      {open && editingIndex == null ? form : !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-1.5 rounded-control border border-dashed border-line-strong px-4 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary-50"
        >
          <Plus className="h-4 w-4" />
          {section.addLabel}
        </button>
      )}
    </div>
  );
}
