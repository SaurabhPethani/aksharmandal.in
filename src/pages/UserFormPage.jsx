import React, { useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import AppHeader from '../components/AppHeader';
import SiteFooter from '../components/SiteFooter';
import { Text } from '../components/Typography';
import { Tabs } from '../components/Navigation';
import { Button, Card, ErrorState, PageLoader } from '../components/ui';
import {
  ApprovalNotice,
  APPROVAL_NOTICE_BY_TAB,
  FamilyRoster,
  HierarchySection,
  PincodeSection,
  PlainField,
  RepeatableSection,
  needsApproval,
  readAddress,
  toAddressRows,
} from '../components/user-form';
import { useAuth, useToast } from '../hooks/core';
import {
  useProfile,
  useUserEducations,
  useUserFamily,
  useUserJobs,
  useEducationMutations,
  useJobMutations,
  useFamilyMutations,
} from '../hooks/useUsers';
import {
  useAddressByPincode,
  useCategories,
  useEducationLevels,
  useFollowupPersons,
  useJobIndustries,
  useMandalUsers,
  useNaturesOfBusiness,
  useRelations,
  useRoles,
} from '../hooks/useLookups';
import { useSelfSave } from '../hooks/useProfileExtras';
import {
  TABS,
  buildPayload,
  labelOf,
  toFormValues,
  validateTab,
} from '../utils/userFormSchema';
import { selfChanges } from '../utils/selfUpdate';
import { pickRows } from '../utils/options';
import { LOADING } from '../constants/messages';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../constants/theme';

// Editing your OWN record. The hierarchy levels are never offered here — a
// member does not move themselves between Sabhas — so every level renders as
// the stated value from their record, which is what `access: {}` means.
const NO_HIERARCHY_ACCESS = {};

export default function UserFormPage({
  onBack,
  onMenu,
  onHelp,
  onNotifications,
  onProfile,
  onSaved,
}) {
  const { activeUserId: userId } = useAuth();
  const toast = useToast();

  const profileQ = useProfile(userId);
  const user = profileQ.data;

  const [step, setStep] = useState(0);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [areaIndex, setAreaIndex] = useState(null);

  const tab = TABS[step];
  const mode = { editing: true, self: true };

  useEffect(() => {
    if (user) setValues(toFormValues(user));
  }, [user]);

  const educationsQ = useUserEducations(userId, Boolean(userId));
  const jobsQ = useUserJobs(userId, Boolean(userId));
  const familyQ = useUserFamily(userId, tab?.key === 'family');

  const educationMutations = useEducationMutations(userId);
  const jobMutations = useJobMutations(userId);
  const familyMutations = useFamilyMutations(userId);
  const relationsQ = useRelations(tab?.key === 'family');
  const save = useSelfSave(userId);

  const lookups = {
    categories: useCategories(tab?.key === 'personal'),
    roles: useRoles(tab?.key === 'sabha'),
    mandalUsers: useMandalUsers(tab?.key === 'sabha'),
    educationLevels: useEducationLevels(tab?.key === 'education'),
    jobIndustries: useJobIndustries(tab?.key === 'job'),
    naturesOfBusiness: useNaturesOfBusiness(tab?.key === 'job'),
    followupPersons: useFollowupPersons(
      tab?.key === 'followup',
      values.sabha_id,
    ),
  };

  const addressQ = useAddressByPincode(values.pincode, tab?.key === 'address');
  const addressRows = useMemo(
    () => toAddressRows(addressQ.data),
    [addressQ.data],
  );

  // The picked area fills the other four; picking nothing clears them.
  useEffect(() => {
    if (addressRows.length === 0) return;
    const index = areaIndex ?? (addressRows.length === 1 ? 0 : null);
    if (index == null) return;
    const address = readAddress(addressRows[index]);
    setValues(v => ({ ...v, ...address }));
    if (areaIndex == null) setAreaIndex(index);
  }, [addressRows, areaIndex]);

  const change = (name, value) => {
    setValues(v => ({ ...v, [name]: value }));
    setErrors(e => (e[name] ? { ...e, [name]: undefined } : e));
  };

  const goTo = next => {
    const found = validateTab(tab, values, mode);
    // Going back is always allowed; going on is not.
    if (next > step && Object.keys(found).length) {
      setErrors(found);
      toast.warning('Please complete this step before moving on.');
      return;
    }
    setErrors({});
    setStep(next);
  };

  const submit = async () => {
    const found = validateTab(tab, values, mode);
    if (Object.keys(found).length) {
      setErrors(found);
      return;
    }

    // Only what actually changed is sent — an untouched field would otherwise
    // file an approval request for the value it already holds.
    const original = toFormValues(user);
    const changed = {};
    for (const [name, value] of Object.entries(values)) {
      if (Array.isArray(value)) continue;
      if (String(value ?? '') !== String(original[name] ?? '')) {
        changed[name] = value;
      }
    }

    const { direct, request, unsupported } = selfChanges(changed);
    const directPayload = buildPayload(direct);
    const requestPayload = buildPayload(request);

    if (unsupported.length) {
      toast.warning(
        `${unsupported.length} field${unsupported.length === 1 ? '' : 's'} cannot be changed from here.`,
      );
    }
    if (!Object.keys(directPayload).length && !Object.keys(requestPayload).length) {
      toast.info('Nothing to save — no changes were made.');
      return;
    }

    try {
      const res = await save.mutateAsync({
        direct: directPayload,
        request: requestPayload,
      });
      if (Object.keys(directPayload).length) {
        toast.success(res?.applied?.detail || 'Profile updated.');
      }
      if (Object.keys(requestPayload).length) {
        toast.info(
          res?.requested?.detail ||
            'Your changes were sent to your sabha leadership for approval.',
        );
      }
      onSaved?.();
    } catch (err) {
      const fieldErrors = err?.fieldErrors ?? null;
      if (fieldErrors) setErrors(fieldErrors);
      toast.error(err?.message || 'Could not save your profile.');
    }
  };

  const shell = children => (
    <View style={styles.safe}>
      <AppHeader
        onBack={onBack}
        onMenu={onMenu}
        onHelp={onHelp}
        onNotifications={onNotifications}
        onProfile={onProfile}
      />
      <ScrollView
        style={styles.flex}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={profileQ.isFetching && !profileQ.isLoading}
            onRefresh={profileQ.refetch}
          />
        }
      >
        {children}
      </ScrollView>
      <SiteFooter />
    </View>
  );

  if (profileQ.isLoading) return shell(<PageLoader label={LOADING.page} />);
  if (profileQ.isError) {
    return shell(
      <Card>
        <ErrorState
          error={profileQ.error}
          onRetry={profileQ.refetch}
          title="Could not load your profile"
        />
      </Card>,
    );
  }

  const notice = APPROVAL_NOTICE_BY_TAB[tab.key];
  const collections = { educations: educationsQ, jobs: jobsQ };
  const rowMutations = {
    educations: educationMutations,
    jobs: jobMutations,
  };

  return shell(
    <View style={styles.stack}>
      <Tabs
        tabs={TABS.map((t, i) => ({ value: i, label: t.label }))}
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
                  if (name === 'pincode') setAreaIndex(null);
                  change(name, value);
                }}
                query={addressQ}
                rows={addressRows}
                areaIndex={areaIndex}
                onAreaChange={setAreaIndex}
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
                onError={err => toast.error(err?.message)}
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

          if (section.kind === 'family') {
            return (
              <FamilyRoster
                key="family"
                query={familyQ}
                userId={userId}
                relations={relationsQ}
                mutations={familyMutations}
                onError={err => toast.error(err?.message)}
                allowSelfRemove
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
        <Button
          variant="outline"
          onPress={() => goTo(step - 1)}
          disabled={step === 0}
        >
          Back
        </Button>
        {step < TABS.length - 1 ? (
          <Button variant="primary" onPress={() => goTo(step + 1)}>
            Next
          </Button>
        ) : null}
        <Button variant="accent" onPress={submit} busy={save.isPending}>
          Save Changes
        </Button>
      </View>
    </View>,
  );
}

/** The display name behind a field whose stored value is an id. */
function readOnlyTextFor(field, user) {
  if (!user) return null;
  const named = field.name.replace(/_id$/, '_name');
  return named === field.name ? null : user[named] ?? null;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  content: { padding: space(4) },
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
    justifyContent: 'flex-end',
    gap: space(2),
    borderRadius: RADII.card,
  },
});
