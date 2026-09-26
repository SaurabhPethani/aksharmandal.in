import React, { useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { launchImageLibrary } from 'react-native-image-picker';
import AppHeader from '../components/AppHeader';
import SiteFooter from '../components/SiteFooter';
import { Text } from '../components/Typography';
import { useAuth, useToast } from '../hooks/core';
import { useProfile } from '../hooks/useUsers';
import { useFeatures } from '../hooks/useLookups';
import { useMyGroupLeaderships } from '../hooks/useHierarchy';
import { useProfileForm } from '../hooks/useProfileForm';
import {
  useMyResumes,
  useProfileImage,
  useRegenerateQr,
  useRemoveProfileImage,
  useResumeMutations,
  useUploadProfileImage,
  stampPhotoUrl,
} from '../hooks/useProfileExtras';
import {
  Button,
  Card,
  ErrorState,
  PageLoader,
  Skeleton,
} from '../components/ui';
import ProfileCards, {
  ProfileHero,
} from '../components/user-detail/ProfileCards';
import ProfileEditor, {
  readTabForStep,
  stepForReadTab,
} from '../components/user-detail/ProfileEditor';
import SecuritySettings from '../components/user-detail/SecuritySettings';
import ImageCropDialog from '../components/ImageCropDialog';
import { isAttending, statusLabel } from '../utils/memberFlags';
import { formatDate } from '../utils/format';
import { pickRows } from '../utils/options';
import { absoluteUrl } from '../api/client';
import { profileService } from '../services/profileService';
import { saveRemoteImage } from '../utils/saveImage';
import { LOADING } from '../constants/messages';
import { COLORS, RADII, TEXT, WEIGHT, space } from '../constants/theme';

export default function ProfilePage({
  onBack,
  onMenu,
  onHelp,
  onNotifications,
  onOpenPrivacy,
  onOpenTerms,
  onOpenDeleteAccount,
}) {
  const { activeUserId: userId } = useAuth();
  const toast = useToast();
  // Mirrors the tab ProfileCards has open, for the one query that is gated on
  // it — and for handing the editor the tab the member was reading.
  const [tabKey, setTabKey] = useState('Personal');
  // A request to jump the strip to a tab: the Change Password / PIN button, and
  // coming back out of the editor. The token lets the same tab be re-requested.
  const [jumpTo, setJumpTo] = useState(null);
  // Editing happens HERE, on this screen. There is no separate form route any
  // more — the same tab strip swaps its read cards for the record's fields.
  const [editing, setEditing] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } =
    useProfile(userId);

  // Mounted in read mode too, so it is ready the moment Edit is tapped; every
  // query inside it is held behind the same `editing` flag.
  const form = useProfileForm(userId, data, editing);

  const featuresQ = useFeatures();
  const resumeEnabled = featuresQ.data?.resume === true;

  // Group leadership — so a member sees at a glance that they are the Head or
  // DB Manager of a Sabha (or Mandal / Pradesh) group. Auth-only, returns [] for
  // members who lead nothing (the common case), so nothing renders for them.
  const groupLeaderships = useMyGroupLeaderships().data ?? [];

  const resumesQ = useMyResumes(resumeEnabled && tabKey === 'resume');
  const imageQ = useProfileImage(userId);
  const resumeMutations = useResumeMutations();
  const uploadPhoto = useUploadProfileImage(userId);
  const removePhoto = useRemoveProfileImage(userId);
  const regenerateQr = useRegenerateQr(userId);
  // Only a genuinely UPLOADED photo can be removed — the fallback initials
  // avatar has nothing to delete.
  const hasPhoto = Boolean(imageQ.data?.image_url);

  const [qrNonce, setQrNonce] = useState(0);
  const [qrMissing, setQrMissing] = useState(false);
  // Not a mutation — nothing is written — so it carries its own pending flag.
  const [qrSaving, setQrSaving] = useState(false);
  const qrSrc = `${profileService.qrCodeUrl(userId)}${qrNonce ? `?v=${qrNonce}` : ''}`;

  const name = data?.user_name || 'User';
  const role = data?.role_name;
  const attending = isAttending(data?.status);
  // The fallback is stamped as well: it is the same file at the same address, so
  // an unstamped `photo_url` would put the pre-upload image back on screen for
  // as long as the photo query is still in flight.
  const photo =
    imageQ.data?.image_url ||
    stampPhotoUrl(absoluteUrl(data?.photo_url), userId);

  // Picking a photo opens the crop dialog; the cropped square is what gets
  // uploaded.
  const [cropFile, setCropFile] = useState(null);

  const choosePhoto = async () => {
    const res = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
    });
    if (res.didCancel) return;
    if (res.errorCode) {
      toast.error(res.errorMessage || 'Could not open your photos.');
      return;
    }
    const asset = res.assets?.[0];
    if (asset?.uri) setCropFile(asset);
  };

  const uploadCropped = async cropped => {
    try {
      const res = await uploadPhoto.mutateAsync(cropped);
      toast.success(res?.detail || 'Profile photo updated.');
      setCropFile(null);
    } catch (err) {
      toast.error(err?.message);
    }
  };

  const handleRemovePhoto = () => {
    Alert.alert(
      'Remove photo',
      'Remove your profile photo? Your initials will show instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const res = await removePhoto.mutateAsync();
              toast.success(res?.detail || 'Profile photo removed.');
            } catch (err) {
              toast.error(err?.message || 'Could not remove the photo.');
            }
          },
        },
      ],
    );
  };

  const generateResume = async () => {
    try {
      const res = await resumeMutations.create.mutateAsync();
      toast.success(res?.detail || 'Resume generated.');
      // The backend says so itself when it built something thin — no education,
      // no jobs — rather than refusing to build at all.
      if (res?.data?.warning) toast.warning(res.data.warning);
    } catch (err) {
      toast.error(err?.message);
    }
  };

  const downloadQr = async () => {
    setQrSaving(true);
    const cleaned = String(name)
      // eslint-disable-next-line no-control-regex
      .replace(/[\\/:*?"<>|\x00-\x1f]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const res = await saveRemoteImage(
      qrSrc,
      `${cleaned || 'Akshar Connect'} QR.jpeg`,
    );
    setQrSaving(false);

    if (res.ok) {
      toast.success(
        res.mode === 'share' ? 'QR code shared.' : 'QR code downloaded.',
      );
      return;
    }
    // Dismissing the share sheet is a decision, and gets no toast at all.
    if (res.reason !== 'cancelled') toast.error(res.reason);
  };

  const generateQr = async () => {
    try {
      const res = await regenerateQr.mutateAsync();
      setQrMissing(false);
      setQrNonce(Date.now());
      toast.success(res?.detail || 'QR code generated.');
    } catch (err) {
      toast.error(err?.message);
    }
  };

  const deleteResume = async id => {
    try {
      const res = await resumeMutations.remove.mutateAsync(id);
      toast.success(res?.detail || 'Resume deleted.');
    } catch (err) {
      toast.error(err?.message);
    }
  };

  const startEditing = () => {
    // Open on the tab they were reading, so Edit does not move them.
    form.setStep(stepForReadTab(tabKey));
    setEditing(true);
  };

  const stopEditing = () => {
    const back = readTabForStep(form.step);
    setEditing(false);
    setTabKey(back);
    setJumpTo({ key: back, token: Date.now() });
  };

  const cancelEditing = () => {
    if (!form.isDirty) return stopEditing();
    return Alert.alert(
      'Discard changes?',
      'Your edits on this screen have not been saved.',
      [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: stopEditing },
      ],
    );
  };

  const saveEditing = async () => {
    if (await form.submit()) stopEditing();
  };

  // Hardware back closes the EDITOR rather than the screen. Registered on the
  // `editing` flip, which is later than AppNavigator's own subscription, so
  // this one is asked first and swallows the press.
  useEffect(() => {
    if (!editing) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      cancelEditing();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, form.isDirty, form.step]);

  const shell = children => (
    <View style={styles.safe}>
      <AppHeader
        onBack={onBack}
        onMenu={onMenu}
        onHelp={onHelp}
        onNotifications={onNotifications}
      />
      {/* Edge-to-edge is on (see android/gradle.properties), so `adjustResize`
          no longer shrinks the window — the keyboard is drawn OVER the screen
          and would sit on top of the field being typed into. `padding`
          measures the real overlap, so it comes out as 0 anywhere the window
          does still resize. */}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
            />
          }
        >
          {children}
          <View style={styles.footerBleed}>
            <SiteFooter
              onPrivacy={onOpenPrivacy}
              onTerms={onOpenTerms}
              onDeleteAccount={onOpenDeleteAccount}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );

  if (isLoading) return shell(<PageLoader label={LOADING.page} />);
  if (isError) {
    return shell(
      <Card>
        <ErrorState
          error={error}
          onRetry={refetch}
          title="Could not load your profile"
        />
      </Card>,
    );
  }

  return shell(
    <View style={styles.stack}>
      <ProfileHero
        photo={photo}
        name={name}
        meta={[
          data?.mobile_number,
          [data?.sabha_name, data?.mandal_name].filter(Boolean).join(' · '),
        ]}
        photoSlot={
          <>
            {/* Your own photo is yours to change, whatever the edit grant says
                about the record's fields. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Change profile photo"
              onPress={choosePhoto}
              disabled={uploadPhoto.isPending || removePhoto.isPending}
              style={({ pressed }) => [
                styles.photoBtn,
                styles.photoChange,
                pressed && styles.photoPressed,
                (uploadPhoto.isPending || removePhoto.isPending) &&
                  styles.photoDisabled,
              ]}
            >
              <MaterialCommunityIcons
                name="camera"
                size={space(4)}
                color={COLORS.white}
              />
            </Pressable>

            {/* Remove — only when there is an uploaded photo to take down. Sits
                opposite the change button so the two do not crowd. */}
            {hasPhoto && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove profile photo"
                onPress={handleRemovePhoto}
                disabled={uploadPhoto.isPending || removePhoto.isPending}
                style={({ pressed }) => [
                  styles.photoBtn,
                  styles.photoRemove,
                  pressed && styles.photoPressed,
                  (uploadPhoto.isPending || removePhoto.isPending) &&
                    styles.photoDisabled,
                ]}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={space(4)}
                  color={COLORS.white}
                />
              </Pressable>
            )}
          </>
        }
        chips={
          <>
            {role ? (
              <View style={styles.roleChip}>
                <Text style={styles.roleChipText}>{role}</Text>
              </View>
            ) : null}
            {data?.status != null && data.status !== '' ? (
              <View
                style={[
                  styles.statusChip,
                  attending ? styles.statusOk : styles.statusBad,
                ]}
              >
                <View
                  style={[
                    styles.statusDot,
                    attending ? styles.dotOk : styles.dotBad,
                  ]}
                />
                <Text
                  style={[
                    styles.statusText,
                    attending ? styles.statusTextOk : styles.statusTextBad,
                  ]}
                >
                  {statusLabel(data.status)}
                </Text>
              </View>
            ) : null}
            {/* Group Head / DB Manager, under the profile with the role and
                attendance chips. Renders nothing for a member who leads no
                group, which is most of them. */}
            {groupLeaderships.map(g => (
              <View
                key={`${g.group_id}-${g.leader_type}`}
                style={styles.groupChip}
              >
                <MaterialCommunityIcons
                  name="cube-outline"
                  size={space(3.5)}
                  color={GROUP_FG}
                />
                <Text style={styles.groupChipText}>
                  {g.group_name} Group · {groupTypeLabel(g.leader_type)}
                </Text>
              </View>
            ))}
          </>
        }
        actions={
          editing ? (
            <View style={styles.heroButtons}>
              <Button
                variant="outline"
                onPress={cancelEditing}
                disabled={form.saving}
              >
                Cancel
              </Button>
              <Button variant="accent" onPress={saveEditing} busy={form.saving}>
                Save
              </Button>
            </View>
          ) : (
            <View style={styles.heroButtons}>
              <Button variant="accent" onPress={startEditing}>
                Edit Profile
              </Button>
              {/* Jumps the strip to Security rather than opening anything. */}
              <Button
                variant="outline"
                onPress={() =>
                  setJumpTo({ key: 'security', token: Date.now() })
                }
              >
                Change Password / PIN
              </Button>
            </View>
          )
        }
      />

      {editing ? (
        <ProfileEditor form={form} onSaveAndExit={saveEditing} />
      ) : (
        <ProfileCards
          user={data}
          userId={userId}
          onTabChange={setTabKey}
          jumpTo={jumpTo}
          // Family is READ-ONLY here (a list of members + relation, no controls) —
          // a member should be able to SEE their own family, they just cannot
          // maintain it from their own screen.
          omitTabs={[]}
          extraTabs={[
            {
              key: 'security',
              label: 'Security',
              render: () => <SecuritySettings />,
            },
            ...(resumeEnabled
              ? [
                  {
                    key: 'resume',
                    label: 'Resume',
                    render: () => (
                      <View style={styles.stack}>
                        <View style={styles.builder}>
                          <Text style={styles.sectionTitle}>
                            Resume Builder
                          </Text>
                          <Text style={styles.builderCopy}>
                            Generate a PDF resume from your profile, education
                            and job details. Each resume is a frozen snapshot —
                            later profile edits won’t change resumes you’ve
                            already created.
                          </Text>
                          <Button
                            variant="accent"
                            style={styles.builderBtn}
                            onPress={generateResume}
                            busy={resumeMutations.create.isPending}
                          >
                            Generate Resume
                          </Button>
                        </View>

                        <ResumeList
                          query={resumesQ}
                          onDelete={deleteResume}
                          busy={resumeMutations.remove.isPending}
                        />
                      </View>
                    ),
                  },
                ]
              : []),
            {
              key: 'qr',
              label: 'My QR Code',
              render: () => (
                <Card style={styles.qrCard}>
                  {qrMissing ? (
                    <View style={styles.qrEmpty}>
                      <Text style={styles.muted}>
                        No QR code has been generated for your account yet.
                      </Text>
                      <Button
                        variant="accent"
                        style={styles.qrEmptyBtn}
                        onPress={generateQr}
                        busy={regenerateQr.isPending}
                      >
                        Generate QR code
                      </Button>
                    </View>
                  ) : (
                    <>
                      <View style={styles.qrFrame}>
                        <Image
                          key={qrNonce}
                          source={{ uri: qrSrc }}
                          accessibilityLabel="Your attendance QR code"
                          resizeMode="contain"
                          style={styles.qrImage}
                          onError={() => setQrMissing(true)}
                        />
                      </View>
                      <Text style={[styles.muted, styles.qrHint]}>
                        Show this at Sabha to mark your attendance
                      </Text>
                      <View style={styles.qrActions}>
                        <Button
                          variant="accent"
                          onPress={downloadQr}
                          busy={qrSaving}
                        >
                          <MaterialCommunityIcons
                            name="download"
                            size={space(4)}
                          />
                          Download QR Code
                        </Button>
                        <Button
                          variant="outline"
                          onPress={generateQr}
                          busy={regenerateQr.isPending}
                        >
                          <MaterialCommunityIcons
                            name="refresh"
                            size={space(4)}
                          />
                          Regenerate QR Code
                        </Button>
                      </View>
                    </>
                  )}
                </Card>
              ),
            },
          ]}
        />
      )}

      {/* Crop-and-zoom before upload — opens when a photo is picked, uploads
          the cropped square on Save. */}
      <ImageCropDialog
        file={cropFile}
        busy={uploadPhoto.isPending}
        onCancel={() => setCropFile(null)}
        onCropped={uploadCropped}
        onError={err => toast.error(err?.message)}
      />
    </View>,
  );
}

function ResumeList({ query, onDelete, busy }) {
  if (query.isLoading) {
    return (
      <View style={styles.resumeSkeletons}>
        {[0, 1].map(i => (
          <Skeleton key={i} style={styles.resumeSkeleton} />
        ))}
      </View>
    );
  }
  if (query.error) {
    return (
      <Card>
        <ErrorState
          error={query.error}
          onRetry={query.refetch}
          title="Could not load your resumes"
        />
      </Card>
    );
  }

  const rows = pickRows(query.data);
  if (!rows.length) {
    return (
      <Card>
        <Text style={[styles.muted, styles.resumeEmpty]}>
          No resumes yet. Generate your first resume above.
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.resumeList}>
      {rows.map(r => (
        <View key={r.id} style={styles.resumeRow}>
          <View style={styles.resumeCopy}>
            <Text numberOfLines={1} style={styles.resumeVersion}>
              Version {r.version}
            </Text>
            {r.created_at ? (
              <Text style={styles.resumeDate}>{formatDate(r.created_at)}</Text>
            ) : null}
          </View>
          <View style={styles.resumeActions}>
            {r.resume_path ? (
              <Text
                accessibilityRole="link"
                onPress={() => Linking.openURL(r.resume_path)}
                style={styles.resumeOpen}
              >
                Open
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete version ${r.version}`}
              onPress={() => onDelete(r.id)}
              disabled={busy}
              style={({ pressed }) => [
                styles.resumeDelete,
                pressed && styles.resumeDeletePressed,
                busy && styles.photoDisabled,
              ]}
            >
              <MaterialCommunityIcons
                name="trash-can-outline"
                size={space(4)}
                color={COLORS.dangerFg}
              />
            </Pressable>
          </View>
        </View>
      ))}
    </View>
  );
}

const GROUP_BG = '#FFFBEB';
const GROUP_LINE = '#FCD34D';
const GROUP_FG = '#B45309';

const groupTypeLabel = t => (t === 'dbm' ? 'DB Manager' : 'Head');

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, padding: space(4), paddingBottom: 0 },
 footerBleed: { marginTop: 'auto', marginHorizontal: -18, paddingTop: 14 },
  stack: { gap: space(5) },
  muted: { fontSize: TEXT.sm, color: COLORS.textMuted },

  photoBtn: {
    position: 'absolute',
    bottom: 0,
    width: space(9),
    height: space(9),
    borderRadius: RADII.full,
    borderWidth: 4,
    borderColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoChange: { right: 0, backgroundColor: COLORS.accent },
  photoRemove: { left: 0, backgroundColor: COLORS.dangerFg },
  photoPressed: { transform: [{ scale: 1.05 }] },
  photoDisabled: { opacity: 0.6 },

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
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    borderRadius: RADII.full,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  statusOk: { backgroundColor: COLORS.successBg },
  statusBad: { backgroundColor: COLORS.dangerBg },
  statusDot: {
    width: space(1.5),
    height: space(1.5),
    borderRadius: RADII.full,
  },
  dotOk: { backgroundColor: COLORS.successFg },
  dotBad: { backgroundColor: COLORS.dangerFg },
  statusText: { fontSize: TEXT.xs, fontWeight: WEIGHT.semibold },
  statusTextOk: { color: COLORS.successFg },
  statusTextBad: { color: COLORS.dangerFg },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(1.5),
    borderRadius: RADII.full,
    borderWidth: 1,
    borderColor: GROUP_LINE,
    backgroundColor: GROUP_BG,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  groupChipText: {
    fontSize: TEXT.xs,
    fontWeight: WEIGHT.semibold,
    color: GROUP_FG,
  },

  heroButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
  },

  builder: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.bg,
    padding: space(5),
  },
  sectionTitle: {
    fontSize: TEXT.lg,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  builderCopy: {
    marginTop: space(1),
    fontSize: TEXT.sm,
    lineHeight: TEXT.sm * 1.5,
    color: COLORS.textMuted,
  },
  builderBtn: { marginTop: space(4), alignSelf: 'flex-start' },

  qrCard: { alignItems: 'center' },
  qrEmpty: { alignItems: 'center', paddingVertical: space(10) },
  qrEmptyBtn: { marginTop: space(4) },
  qrFrame: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    padding: space(6),
  },
  qrImage: { width: 224, height: 224 },
  qrHint: { marginTop: space(4), textAlign: 'center' },
  qrActions: {
    marginTop: space(4),
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
  },

  resumeSkeletons: { gap: space(2) },
  resumeSkeleton: { height: space(16), width: '100%' },
  resumeEmpty: { paddingVertical: space(6), textAlign: 'center' },
  resumeList: { gap: space(2) },
  resumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(3),
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.surface,
    paddingHorizontal: space(5),
    paddingVertical: space(4),
  },
  resumeCopy: { flex: 1 },
  resumeVersion: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  resumeDate: { fontSize: TEXT.xs, color: COLORS.textMuted },
  resumeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space(3),
  },
  resumeOpen: {
    fontSize: TEXT.sm,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  resumeDelete: { borderRadius: RADII.lg, padding: space(2) },
  resumeDeletePressed: { backgroundColor: COLORS.dangerBg },
});
