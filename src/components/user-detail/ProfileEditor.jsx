import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Text } from '../Typography';
import { Tabs } from '../Navigation';
import { Button, Card } from '../ui';
import {
  ApprovalNotice,
  APPROVAL_NOTICE_BY_TAB,
  HierarchySection,
  PincodeSection,
  PlainField,
  RepeatableSection,
  needsApproval,
} from '../user-form';
import { SELF_EDIT_TABS, labelOf } from '../../utils/userFormSchema';
import { pickRows } from '../../utils/options';
import { readMemberField } from '../../utils/memberFlags';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../../constants/theme';

// The hierarchy levels are never offered here — a member does not move
// themselves between Sabhas — so every level renders as the stated value from
// their record, which is what `access: {}` means.
const NO_HIERARCHY_ACCESS = {};

/**
 * Which read tab each form step belongs to, so opening the editor keeps the
 * member where they were and closing it puts them back. The strip is the same
 * strip either way; only what it renders changes.
 */
export const FORM_TAB_FOR_READ_TAB = {
  Personal: 'personal',
  'Sabha Details': 'sabha',
  Address: 'address',
  Followup: 'followup',
  educations: 'education',
  jobs: 'job',
  // `family` is deliberately absent — it is readable but not editable, so
  // opening the editor from it falls back to the first step.
};

const READ_TAB_FOR_FORM_TAB = Object.fromEntries(
  Object.entries(FORM_TAB_FOR_READ_TAB).map(([read, form]) => [form, read]),
);

/** The form step a read tab maps to — Family and the extras start at the top. */
export const stepForReadTab = key => {
  const formKey = FORM_TAB_FOR_READ_TAB[key];
  const index = SELF_EDIT_TABS.findIndex(t => t.key === formKey);
  return index === -1 ? 0 : index;
};

export const readTabForStep = step =>
  READ_TAB_FOR_FORM_TAB[SELF_EDIT_TABS[step]?.key] ?? 'Personal';

/**
 * The display name behind a field whose stored value is an id.
 *
 * Two spellings are in play: `role_id` is named by `role_name`, but
 * `reference_by_id` and `followup_by_id` are named by `reference_by_id_name`
 * and `followup_by_id_name` — the id is part of the field's name, not a suffix
 * to swap out. Substituting blindly missed both, so the raw id was shown.
 */
function readOnlyTextFor(field, user) {
  if (!user) return null;
  const candidates = [
    `${field.name}_name`,
    field.name.replace(/_id$/, '_name'),
  ];
  for (const key of candidates) {
    if (key === field.name) continue;
    const named = readMemberField(user, key);
    if (named != null && named !== '') return named;
  }
  return null;
}

/**
 * The self-edit form's body — the same tab strip the read view uses, with the
 * record's fields in it. State lives in `useProfileForm`, which the profile
 * page holds so its hero can carry Save and Cancel.
 */
export default function ProfileEditor({ form, onSaveAndExit }) {
  const {
    tab,
    step,
    goTo,
    values,
    errors,
    change,
    user,
    lookups,
    address,
    collections,
    rowMutations,
    onError,
  } = form;

  const notice = APPROVAL_NOTICE_BY_TAB[tab.key];
  // The bottom row names where you came from and where you are going, rather
  // than saying Back and Next at a strip that already shows both.
  const previous = step > 0 ? SELF_EDIT_TABS[step - 1] : null;
  const next =
    step < SELF_EDIT_TABS.length - 1 ? SELF_EDIT_TABS[step + 1] : null;

  return (
    <View style={styles.stack}>
      <Tabs
        tabs={SELF_EDIT_TABS.map((t, i) => ({ value: i, label: t.label }))}
        value={step}
        onChange={goTo}
      />

      <Card style={styles.card}>
        <Text style={styles.heading}>{tab.heading}</Text>
        {tab.description ? (
          <Text style={styles.description}>{tab.description}</Text>
        ) : null}

        {notice ? <ApprovalNotice>{notice}</ApprovalNotice> : null}

        {(tab.sections ?? []).map((section, i) => {
          if (section.kind === 'hierarchy') {
            return (
              <HierarchySection
                key={`hierarchy-${i}`}
                values={values}
                errors={errors}
                access={NO_HIERARCHY_ACCESS}
                me={user}
                queries={{}}
                onChange={change}
                readOnly
              />
            );
          }

          if (section.kind === 'pincode') {
            return (
              <PincodeSection
                key={`pincode-${i}`}
                values={values}
                errors={errors}
                onChange={(name, value) => {
                  if (name === 'pincode') address.setAreaIndex(null);
                  change(name, value);
                }}
                query={address.query}
                rows={address.rows}
                areaIndex={address.areaIndex}
                onAreaChange={address.setAreaIndex}
              />
            );
          }

          if (section.kind === 'repeatable') {
            const query = collections[section.collection];
            const mutations = rowMutations[section.collection];
            return (
              <RepeatableSection
                key={section.collection}
                section={section}
                items={pickRows(query?.data)}
                lookups={lookups}
                query={query}
                onError={onError}
                persist={{
                  create: payload => mutations.create.mutateAsync(payload),
                  update: (id, payload) =>
                    mutations.update.mutateAsync({ id, payload }),
                  remove: id => mutations.remove.mutateAsync(id),
                  busy: mutations.isPending,
                }}
              />
            );
          }

          return (
            <View key={`fields-${i}`} style={styles.fields}>
              {(section.fields ?? [])
                .filter(field => !field.hiddenOnEdit)
                .map(field => (
                  <PlainField
                    key={field.name}
                    field={{ ...field, label: labelOf(field, values) }}
                    value={values[field.name] ?? ''}
                    error={errors[field.name]}
                    lookup={field.lookup ? lookups[field.lookup] : null}
                    readOnly={
                      field.readOnlyOnEdit === true ||
                      field.lockedForSelf === true
                    }
                    readOnlyText={readOnlyTextFor(field, user)}
                    needsApproval={needsApproval(field.name)}
                    onChange={change}
                  />
                ))}
            </View>
          );
        })}
      </Card>

      <View style={styles.actions}>
        {previous ? (
          <Button variant="outline" onPress={() => goTo(step - 1)}>
            <MaterialCommunityIcons name="chevron-left" size={space(4)} />
            {previous.label}
          </Button>
        ) : null}

        <Button
          variant="accent"
          onPress={onSaveAndExit}
          busy={form.saving}
          disabled={!onSaveAndExit}
        >
          Save and Exit
        </Button>

        {next ? (
          <Button variant="primary" onPress={() => goTo(step + 1)}>
            {next.label}
            <MaterialCommunityIcons name="chevron-right" size={space(4)} />
          </Button>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(4) },
  card: { gap: space(5) },
  heading: {
    fontSize: TEXT.xl,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  description: {
    marginTop: -space(3),
    fontSize: TEXT.sm,
    color: COLORS.textMuted,
  },
  fields: { gap: space(4) },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
    borderRadius: RADII.card,
  },
});
