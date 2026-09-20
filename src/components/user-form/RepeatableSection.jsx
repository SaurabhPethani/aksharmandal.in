import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Button, ErrorState, Skeleton } from '../ui';
import { Text } from '../Typography';
import PlainField from './PlainField';
import {
  itemDraftFrom,
  itemFieldsFor,
  validateItem,
  variantOf,
} from '../../utils/userFormSchema';
import { labelFor } from './shared';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

/**
 * An add-many list — Education and Job.
 *
 * Two modes, decided by whether `persist` was passed: with it each row is
 * written on its own as it is added, edited or deleted; without it entries wait
 * in `values` and are posted after the member is created.
 */
export default function RepeatableSection({
  section,
  items,
  lookups,
  onAdd,
  onUpdate,
  onRemove,
  query = null,
  persist = null,
  onError,
}) {
  const variants = section.variants ?? null;
  const firstVariant = variants?.[0]?.value ?? null;

  const [draft, setDraft] = useState(
    variants ? { [section.variantField]: firstVariant } : {},
  );
  const [draftErrors, setDraftErrors] = useState({});
  const [open, setOpen] = useState(false);
  // Position rather than id: an entry added on the create form has none yet.
  const [editingIndex, setEditingIndex] = useState(null);
  const editing = editingIndex == null ? null : items[editingIndex] ?? null;

  const reset = () => {
    setDraft(variants ? { [section.variantField]: firstVariant } : {});
    setDraftErrors({});
    setEditingIndex(null);
    setOpen(false);
  };

  const startEdit = (item, index) => {
    setDraft(itemDraftFrom(section, item));
    setDraftErrors({});
    setEditingIndex(index);
    setOpen(true);
  };

  // Switching variant clears the draft: the two field sets barely overlap, and
  // carrying a Job Title into a Business entry would submit a value its own
  // form never showed.
  const chooseVariant = value => {
    setDraft({ [section.variantField]: value });
    setDraftErrors({});
  };

  const draftFields = itemFieldsFor(section, draft);

  const save = async () => {
    const found = validateItem(section, draft);
    if (Object.keys(found).length) {
      setDraftErrors(found);
      return;
    }

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
      // The form stays open so the entry is not lost. A 422 names its fields,
      // so those messages go under the controls that caused them.
      const placed = Object.entries(err?.fieldErrors ?? {}).filter(([name]) =>
        draftFields.some(f => f.name === name),
      );
      if (placed.length) {
        setDraftErrors(e => ({ ...e, ...Object.fromEntries(placed) }));
      }
      if (
        !placed.length ||
        placed.length < Object.keys(err?.fieldErrors ?? {}).length
      ) {
        onError?.(err);
      }
    }
  };

  const removeAt = async (item, index) => {
    if (!persist) {
      onRemove(index);
      return;
    }
    try {
      await persist.remove(item.id);
    } catch (err) {
      onError?.(err);
    }
  };

  if (query?.isLoading) {
    return (
      <View style={styles.skeletons}>
        {[0, 1].map(i => (
          <Skeleton key={i} style={styles.skeleton} />
        ))}
      </View>
    );
  }
  if (query?.error) {
    return (
      <ErrorState
        error={query.error}
        onRetry={query.refetch}
        title="Could not load these records"
      />
    );
  }

  const form = (
    <View style={styles.form}>
      {variants && editingIndex == null ? (
        <View style={styles.variantBar}>
          {variants.map(v => {
            const active =
              (draft[section.variantField] ?? firstVariant) === v.value;
            return (
              <Pressable
                key={v.value}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => chooseVariant(v.value)}
                style={[styles.variant, active && styles.variantActive]}
              >
                <Text
                  style={[
                    styles.variantText,
                    active && styles.variantTextActive,
                  ]}
                >
                  {v.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.fields}>
        {draftFields.map(field => (
          <PlainField
            key={field.name}
            field={field}
            value={draft[field.name] ?? ''}
            error={draftErrors[field.name]}
            lookup={field.lookup ? lookups[field.lookup] : null}
            onChange={(name, value) => {
              setDraft(d => ({ ...d, [name]: value }));
              setDraftErrors(e => (e[name] ? { ...e, [name]: undefined } : e));
            }}
          />
        ))}
      </View>

      <View style={styles.formActions}>
        <Button variant="ghost" onPress={reset} disabled={persist?.busy}>
          Cancel
        </Button>
        <Button variant="accent" onPress={save} busy={persist?.busy}>
          {editingIndex != null ? 'Update' : 'Save'}
        </Button>
      </View>
    </View>
  );

  return (
    <View style={styles.stack}>
      {items.length === 0 && !open ? (
        <Text style={styles.empty}>{section.emptyLabel}</Text>
      ) : null}

      {items.length > 0 ? (
        <View style={styles.list}>
          {items.map((item, index) => {
            // The headline is the first field of whichever variant this entry
            // belongs to, so a Business row leads with its name.
            const headField = itemFieldsFor(section, item)[0];
            const head =
              labelFor(lookups[headField?.lookup], item[headField?.name]) ??
              item[headField?.name] ??
              '—';
            const detail = section.summary
              .map(name => item[name])
              .filter(v => v != null && String(v).trim() !== '')
              .join(' · ');
            const variant = variantOf(section, item);

            // The form takes this row's place while it is being edited.
            if (editingIndex === index) {
              return <View key={`editing-${index}`}>{form}</View>;
            }

            return (
              <View key={`${head}-${index}`} style={styles.row}>
                <View style={styles.rowCopy}>
                  <View style={styles.rowHead}>
                    <Text numberOfLines={1} style={styles.rowTitle}>
                      {String(head)}
                    </Text>
                    {variant ? (
                      <View style={styles.rowBadge}>
                        <Text style={styles.rowBadgeText}>{variant.label}</Text>
                      </View>
                    ) : null}
                  </View>
                  {detail ? (
                    <Text numberOfLines={1} style={styles.rowDetail}>
                      {detail}
                    </Text>
                  ) : null}
                </View>

                <View style={styles.rowActions}>
                  <Text
                    accessibilityRole="button"
                    onPress={
                      persist?.busy ? undefined : () => startEdit(item, index)
                    }
                    style={[styles.edit, persist?.busy && styles.disabled]}
                  >
                    Edit
                  </Text>
                  <Text
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${head}`}
                    onPress={
                      persist?.busy ? undefined : () => removeAt(item, index)
                    }
                    style={[styles.delete, persist?.busy && styles.disabled]}
                  >
                    Delete
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Adding puts the form at the end, where the new entry will land.
          Editing puts it in the row's own place, above. */}
      {open && editingIndex == null ? (
        form
      ) : !open ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={({ pressed }) => [styles.add, pressed && styles.addPressed]}
        >
          <MaterialCommunityIcons
            name="plus"
            size={space(4)}
            color={COLORS.primary}
          />
          <Text style={styles.addText}>{section.addLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(4) },
  skeletons: { gap: space(2) },
  skeleton: { height: space(16), width: '100%' },

  empty: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    paddingHorizontal: space(4),
    paddingVertical: space(6),
    textAlign: 'center',
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
  },

  form: {
    gap: space(4),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    padding: space(4),
  },
  variantBar: {
    flexDirection: 'row',
    gap: space(1),
    borderRadius: RADII.control,
    backgroundColor: COLORS.bg,
    padding: space(1),
  },
  variant: {
    flex: 1,
    borderRadius: RADII.lg,
    paddingVertical: space(2),
    alignItems: 'center',
  },
  variantActive: { backgroundColor: COLORS.surface },
  variantText: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  variantTextActive: { color: COLORS.primary },
  fields: { gap: space(4) },
  formActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: space(2),
  },

  list: { gap: space(2) },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.bg,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  rowCopy: { flex: 1 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  rowTitle: {
    flexShrink: 1,
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  rowBadge: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  rowBadgeText: {
    fontSize: 10,
    fontWeight: WEIGHT.semibold,
    color: COLORS.textMuted,
  },
  rowDetail: { fontSize: TEXT.xs, color: COLORS.textMuted },
  rowActions: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  edit: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  delete: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.dangerFg,
  },
  disabled: { opacity: 0.5 },

  add: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(1.5),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: COLORS.lineStrong,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
  addPressed: { backgroundColor: COLORS.primary50 },
  addText: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
});
