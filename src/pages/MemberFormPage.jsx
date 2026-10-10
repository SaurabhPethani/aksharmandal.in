import React, { useEffect, useRef } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import AppHeader from '../components/AppHeader';
import SiteFooter from '../components/SiteFooter';
import { Text } from '../components/Typography';
import { Stepper, Tabs } from '../components/Navigation';
import { Button, Card, ErrorState, PageLoader } from '../components/ui';
import { Modal } from '../components/Overlays';
import { DialogCancel } from '../components/FormDialog';
import { FormField, Select } from '../components/form';
import {
  FamilyRoster,
  HierarchySection,
  PincodeSection,
  PlainField,
  RepeatableSection,
  isHeadRelation,
} from '../components/user-form';
import { ProfileHero } from '../components/user-detail/ProfileCards';
import { readOnlyTextFor } from '../components/user-detail/ProfileEditor';
import ForbiddenPage from './ForbiddenPage';
import { useMemberForm } from '../hooks/useMemberForm';
import { useMyPermissions } from '../hooks/useMyPermissions';
import { stampPhotoUrl, useProfileImage } from '../hooks/useProfileExtras';
import { absoluteUrl } from '../api/client';
import { TABS, labelOf } from '../utils/userFormSchema';
import { isAttending, statusLabel } from '../utils/memberFlags';
import { pickRows, toOptions } from '../utils/options';
import { LOADING } from '../constants/messages';
import { ACTIONS, MODULES, USER_EDIT_ACTION } from '../constants/permissions';
import { FONT_DISPLAY } from '../constants/typography';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../constants/theme';

// Adding a member, and editing one who is not you — your own record is edited
// on the profile, where some changes go for approval.
//
//   adding    USERS:CREATE
//   editing   USERS:UPDATE

const READ_ONLY_ON_EDIT = ['sabha', 'followup'];

function Shell({ chrome, children }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.safe}>
      <AppHeader
        onBack={chrome.onBack}
        onMenu={chrome.onMenu}
        onHelp={chrome.onHelp}
        onNotifications={chrome.onNotifications}
        onProfile={chrome.onProfile}
      />
      {/* The offset is the status bar: the screen starts below it. */}
      <KeyboardAvoidingView
        behavior="padding"
        keyboardVerticalOffset={insets.top}
        style={styles.flex}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {children}
          <View style={styles.footerBleed}>
            <SiteFooter
              onPrivacy={chrome.onOpenPrivacy}
              onTerms={chrome.onOpenTerms}
              onDeleteAccount={chrome.onOpenDeleteAccount}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

export default function MemberFormPage({
  /** The member to edit; without one the form adds a member. */
  userId,
  onBack,
  /** Called once a save has gone through and the form is done with. */
  onDone,
  onMenu,
  onHelp,
  onNotifications,
  onProfile,
  onOpenPrivacy,
  onOpenTerms,
  onOpenDeleteAccount,
}) {
  const permissionsQ = useMyPermissions();
  const chrome = {
    onBack,
    onMenu,
    onHelp,
    onNotifications,
    onProfile,
    onOpenPrivacy,
    onOpenTerms,
    onOpenDeleteAccount,
  };
  const editing = userId != null;

  if (permissionsQ.isLoading) {
    return (
      <Shell chrome={chrome}>
        <PageLoader label={LOADING.page} />
      </Shell>
    );
  }
  if (!permissionsQ.data) {
    return (
      <Shell chrome={chrome}>
        <Card>
          <ErrorState
            error={permissionsQ.error}
            onRetry={permissionsQ.refetch}
            title="Could not load your permissions"
          />
        </Card>
      </Shell>
    );
  }
  const allowed = permissionsQ.data.can(
    MODULES.USERS,
    editing ? USER_EDIT_ACTION : ACTIONS.CREATE,
  );
  if (!allowed) {
    return (
      <Shell chrome={chrome}>
        <ForbiddenPage
          message={
            editing
              ? 'Editing a member requires the Members · Update permission.'
              : 'Adding a member requires the Members · Create permission.'
          }
          onBack={onBack}
          backLabel="Back to members"
        />
      </Shell>
    );
  }
  return (
    <MemberForm
      userId={editing ? userId : null}
      permissions={permissionsQ.data}
      onDone={onDone ?? onBack}
      chrome={chrome}
    />
  );
}

function MemberForm({ userId, permissions, onDone, chrome }) {
  const form = useMemberForm({ userId, can: permissions.can });
  const rank = Number(permissions.hierarchyRank) || 0;
  const {
    tab,
    step,
    values,
    errors,
    saving,
    lookups,
    address,
    hierarchy,
    collections,
    familyOffer,
  } = form;
  const user = form.record.data;
  const imageQ = useProfileImage(userId, form.editing);

  const leave = () => {
    if (!form.dirty) {
      chrome.onBack?.();
      return;
    }
    Alert.alert('Discard changes?', 'What you have entered has not been saved.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: chrome.onBack },
    ]);
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;

  // Subscribed once something is unsaved — later than AppNavigator's own
  // subscription, so this one is asked first.
  useEffect(() => {
    if (!form.dirty) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leaveRef.current();
      return true;
    });
    return () => sub.remove();
  }, [form.dirty]);

  const saveAndExit = async () => {
    if (await form.save()) onDone?.();
  };

  if (form.editing && form.record.isLoading) {
    return (
      <Shell chrome={chrome}>
        <PageLoader label={LOADING.page} />
      </Shell>
    );
  }
  if (form.editing && form.record.error) {
    return (
      <Shell chrome={chrome}>
        <Card>
          <ErrorState
            error={form.record.error}
            onRetry={form.record.refetch}
            title="Could not load this member"
          />
        </Card>
      </Shell>
    );
  }

  const relations = lookups.relations;
  const relationSelect = label => (
    <Select
      label={label}
      value={form.relationId}
      onChange={form.setRelationId}
      options={toOptions(
        pickRows(relations.data).filter(r => !isHeadRelation(r?.name)),
      )}
      disabled={relations.isLoading}
      placeholder={
        relations.isLoading ? 'Loading…' : 'Select relation (Son / Daughter…)'
      }
    />
  );

  const atLast = step >= form.lastStep;
  const saveLabel = form.exists
    ? 'Save'
    : form.asFamily
      ? 'Register Family Member'
      : 'Create User';
  const openTab = key => form.goTo(TABS.findIndex(t => t.key === key));
  const attending = isAttending(user?.status);

  return (
    <Shell chrome={chrome}>
      <View style={styles.stack}>
        {form.editing ? (
          <>
            <ProfileHero
              photo={
                imageQ.data?.image_url ||
                stampPhotoUrl(absoluteUrl(user?.photo_url), userId)
              }
              name={user?.user_name || 'Member'}
              meta={[
                user?.mobile_number,
                [user?.sabha_name, user?.mandal_name]
                  .filter(Boolean)
                  .join(' · '),
              ]}
              chips={
                <>
                  {user?.role_name ? (
                    <View style={styles.roleChip}>
                      <Text style={styles.roleChipText}>{user.role_name}</Text>
                    </View>
                  ) : null}
                  {user?.status != null && user.status !== '' ? (
                    <View
                      style={[
                        styles.statusChip,
                        attending ? styles.statusOk : styles.statusBad,
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusText,
                          attending
                            ? styles.statusTextOk
                            : styles.statusTextBad,
                        ]}
                      >
                        {statusLabel(user.status)}
                      </Text>
                    </View>
                  ) : null}
                </>
              }
              actions={
                <View style={styles.heroActions}>
                  <Button variant="outline" onPress={leave} disabled={saving}>
                    Cancel
                  </Button>
                  <Button variant="accent" onPress={saveAndExit} busy={saving}>
                    Save
                  </Button>
                </View>
              }
            />
            <Tabs
              tabs={form.tabs.map(t => ({ value: t.key, label: t.label }))}
              value={tab.key}
              onChange={openTab}
            />
          </>
        ) : (
          <>
            <View style={styles.top}>
              <View style={styles.titleRow}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to members"
                  onPress={leave}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.backBtn,
                    pressed && styles.backBtnPressed,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="chevron-left"
                    size={space(5)}
                    color={COLORS.primary}
                  />
                </Pressable>
                <Text style={styles.title}>
                  {form.asFamily ? 'Register Family Member' : 'Add New User'}
                </Text>
              </View>
              <View style={styles.topActions}>
                <Button variant="outline" onPress={leave} disabled={saving}>
                  Cancel
                </Button>
                {form.canSave && (
                  <Button variant="accent" onPress={saveAndExit} busy={saving}>
                    {saveLabel}
                  </Button>
                )}
              </View>
            </View>
            {/* Each circle shows how much of its step is filled in. */}
            <Stepper
              steps={form.tabs.map(t => ({
                key: t.key,
                label: t.label,
                badge: `${form.progressOf(t)}%`,
              }))}
              value={tab.key}
              onChange={openTab}
            />
          </>
        )}

        <Card style={styles.card}>
          <View style={styles.cardHead}>
            <View style={styles.cardCopy}>
              <Text style={styles.heading}>{tab.heading ?? tab.label}</Text>
              {tab.description ? (
                <Text style={styles.description}>{tab.description}</Text>
              ) : null}
            </View>
            {form.editing && READ_ONLY_ON_EDIT.includes(tab.key) ? (
              <View style={styles.readOnly}>
                <Text style={styles.readOnlyText}>Read only</Text>
              </View>
            ) : null}
          </View>

          {(tab.sections ?? []).map((section, i) => {
            if (section.kind === 'hierarchy') {
              return (
                <HierarchySection
                  key="hierarchy"
                  readOnly={form.editing}
                  values={values}
                  errors={errors}
                  access={hierarchy.access}
                  me={hierarchy.me}
                  queries={hierarchy.queries}
                  onChange={form.changeLevel}
                />
              );
            }

            if (section.kind === 'pincode') {
              return (
                <PincodeSection
                  key="pincode"
                  values={values}
                  errors={errors}
                  onChange={(name, value) => {
                    if (name === 'pincode') address.setAreaIndex(null);
                    form.change(name, value);
                  }}
                  query={address.query}
                  rows={address.rows}
                  areaIndex={address.areaIndex}
                  onAreaChange={index => {
                    form.touch();
                    address.setAreaIndex(index);
                  }}
                />
              );
            }

            if (section.kind === 'family') {
              return (
                <FamilyRoster
                  key="family"
                  query={form.family.query}
                  userId={form.memberId}
                  relations={relations}
                  mutations={form.family.mutations}
                  onError={form.onError}
                  busy={saving}
                  // A new member is created first, so there is someone to link.
                  ensureMember={async () =>
                    form.memberId ?? (await form.save())?.id ?? null
                  }
                />
              );
            }

            if (section.kind === 'repeatable') {
              const query = collections[section.collection];
              return (
                <RepeatableSection
                  key={section.collection}
                  section={section}
                  query={query}
                  persist={form.persistFor(section.collection)}
                  onError={form.onError}
                  items={
                    form.exists && query
                      ? pickRows(query.data)
                      : values[section.collection] ?? []
                  }
                  lookups={lookups}
                  onAdd={item => form.addItem(section.collection, item)}
                  onUpdate={(index, item) =>
                    form.updateItem(section.collection, index, item)
                  }
                  onRemove={index => form.removeItem(section.collection, index)}
                />
              );
            }

            return (
              <View key={`fields-${i}`} style={styles.fields}>
                {(section.fields ?? [])
                  .filter(field => !(form.editing && field.hiddenOnEdit))
                  .filter(
                    field => !(field.minRank != null && rank < field.minRank),
                  )
                  .map(field => (
                    <React.Fragment key={field.name}>
                      <PlainField
                        field={{ ...field, label: labelOf(field, values) }}
                        value={
                          values[field.name] ??
                          (field.type === 'checkbox' ? false : '')
                        }
                        error={errors[field.name]}
                        lookup={field.lookup ? lookups[field.lookup] : null}
                        busy={field.name === 'mobile_number' && form.mobileBusy}
                        readOnly={
                          (form.editing && field.readOnlyOnEdit === true) ||
                          (form.asFamily && field.name === 'mobile_number')
                        }
                        readOnlyText={readOnlyTextFor(field, user)}
                        onChange={form.change}
                      />
                      {form.asFamily && field.name === 'sampark_id' ? (
                        <FormField
                          label="Relation to number holder"
                          required
                          compact
                          error={
                            form.pageError && !form.relationId
                              ? 'Select a relation.'
                              : null
                          }
                        >
                          {relationSelect('Relation to number holder')}
                        </FormField>
                      ) : null}
                    </React.Fragment>
                  ))}
              </View>
            );
          })}

          {form.pageError ? (
            <Text accessibilityRole="alert" style={styles.pageError}>
              {form.pageError}
            </Text>
          ) : null}

          <View style={styles.nav}>
            {step === 0 ? (
              <Button variant="outline" onPress={leave} disabled={saving}>
                Cancel
              </Button>
            ) : (
              <Button variant="outline" onPress={form.back} disabled={saving}>
                <MaterialCommunityIcons name="chevron-left" size={space(4)} />
                {TABS[step - 1].label}
              </Button>
            )}
            <View style={styles.navEnd}>
              {!atLast && form.canSave ? (
                <Button variant="outline" onPress={saveAndExit} busy={saving}>
                  Save & Exit
                </Button>
              ) : null}
              {atLast ? (
                <Button variant="primary" onPress={saveAndExit} busy={saving}>
                  Finish & Exit
                  <MaterialCommunityIcons name="check" size={space(4)} />
                </Button>
              ) : (
                <Button variant="primary" onPress={form.next} disabled={saving}>
                  {TABS[step + 1].label}
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={space(4)}
                  />
                </Button>
              )}
            </View>
          </View>
        </Card>
      </View>

      <Modal
        isOpen={familyOffer.open}
        onClose={familyOffer.decline}
        title="Number already registered"
        size="sm"
        footer={
          <>
            <DialogCancel>No</DialogCancel>
            <Button
              variant="primary"
              onPress={familyOffer.accept}
              disabled={!form.relationId}
            >
              Continue
            </Button>
          </>
        }
      >
        <Text style={styles.offer}>
          This number is already registered with{' '}
          <Text style={styles.offerName}>
            {familyOffer.owner?.fullName || 'an existing member'}
          </Text>
          . To register a family member under{' '}
          {familyOffer.owner?.firstName || 'them'}, choose the relation:
        </Text>
        <View style={styles.offerSelect}>
          {relationSelect('Relation to number holder')}
        </View>
      </Modal>
    </Shell>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: space(4), paddingBottom: 0 },
  footerBleed: {
    marginTop: 'auto',
    marginHorizontal: -space(4),
    paddingTop: space(4),
  },
  stack: { gap: space(5) },

  // Title and buttons share a line; the buttons drop under it when both show.
  top: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
  },
  titleRow: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
  },
  backBtn: {
    width: space(10),
    height: space(10),
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineStrong,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnPressed: { backgroundColor: COLORS.primary50 },
  title: {
    flexShrink: 1,
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.lg,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  topActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
  },

  roleChip: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  roleChipText: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  statusChip: {
    borderRadius: RADII.full,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  statusOk: { backgroundColor: COLORS.successBg },
  statusBad: { backgroundColor: COLORS.dangerBg },
  statusText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },
  statusTextOk: { color: COLORS.successFg },
  statusTextBad: { color: COLORS.dangerFg },

  card: { gap: space(4) },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: space(3),
  },
  cardCopy: { flex: 1 },
  heading: {
    fontFamily: FONT_DISPLAY,
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  description: {
    marginTop: space(1),
    fontSize: TEXT.xs,
    color: COLORS.textMuted,
  },
  readOnly: {
    borderRadius: RADII.lg,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(2),
    paddingVertical: space(0.5),
  },
  readOnlyText: {
    fontSize: 10,
    fontWeight: WEIGHT.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.25,
    color: COLORS.textMuted,
  },
  fields: { gap: space(4) },
  pageError: {
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: 'rgba(185,28,28,0.3)',
    backgroundColor: COLORS.dangerBg,
    paddingHorizontal: space(4),
    paddingVertical: space(3),
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.medium,
    color: COLORS.dangerFg,
  },
  nav: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    borderTopWidth: 1,
    borderTopColor: COLORS.lineSoft,
    paddingTop: space(5),
  },
  navEnd: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
  },

  offer: {
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.5,
    color: COLORS.textMuted,
  },
  offerName: { fontWeight: WEIGHT.semibold, color: COLORS.primary },
  offerSelect: { marginTop: space(3) },
});
