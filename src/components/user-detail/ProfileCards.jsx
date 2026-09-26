import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  Linking,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import { Card, EmptyState, Loader } from '../ui';
import { Tabs } from '../Navigation';
import { Text } from '../Typography';
import {
  useUserEducations,
  useUserFamily,
  useUserJobs,
} from '../../hooks/useUsers';
import { formatCell, formatDate } from '../../utils/format';
import { GREETING, hasMobile, telUrl, whatsAppUrl } from '../../utils/contact';
import { pickRows } from '../../utils/options';
import {
  DOING_POOJA_LABEL,
  NIMIT_SEVAK_LABEL,
  SWAYAM_SEVAK_LABEL,
  ambrishLabel,
  readMemberField,
} from '../../utils/memberFlags';
import { COLORS, RADII, SHADOWS, WEIGHT, space } from '../../constants/theme';

const FAINT = COLORS.textFaint ?? COLORS.textMuted;
const WHATSAPP_GREEN = '#25D366';

export const PROFILE_CARDS = [
  {
    tab: 'Personal',
    title: 'Personal Details',
    icon: 'account',
    rows: [
      ['first_name', 'First Name'],
      ['middle_name', 'Middle Name'],
      ['last_name', 'Last Name'],
      ['gender', 'Gender'],
      ['dob', 'Date of Birth'],
      ['date_of_joining', 'Date of Joining'],
      ['blood_group', 'Blood Group'],
      ['marital_status', 'Marital Status'],
      ['anniversary_date', 'Anniversary'],
      ['mobile_number', 'Mobile'],
      ['mobile_secondary', 'Secondary Mobile'],
      ['whatsapp_number', 'WhatsApp'],
      ['email', 'Email'],
      ['role_name', 'Role'],
      ['__status', 'Status'],
      ['created_by_name', 'Created By'],
    ],
  },
  {
    tab: 'Sabha Details',
    title: 'Sabha Details',
    icon: 'account-group',
    rows: [
      ['pradesh_name', 'Pradesh'],
      ['mandal_name', 'Mandal'],
      ['sabha_name', 'Sabha'],
      ['category_name', 'Category'],
      ['is_ambrish', user => ambrishLabel(user?.gender)],
      ['is_nimit_sevak', NIMIT_SEVAK_LABEL],
      ['is_swayam_sevak', SWAYAM_SEVAK_LABEL],
      ['doing_pooja', DOING_POOJA_LABEL],
    ],
  },
  {
    tab: 'Address',
    title: 'Address',
    icon: 'home-outline',
    rows: [
      ['flat_no', 'Flat No.'],
      ['building_name', 'Building'],
      ['street_name', 'Street'],
      ['landmark', 'Landmark'],
      ['area', 'Area'],
      ['suburb', 'Suburb'],
      ['city', 'City'],
      ['state', 'State'],
      ['country', 'Country'],
      ['pincode', 'PIN Code'],
    ],
  },
  {
    tab: 'Followup',
    title: 'Followup',
    icon: 'account-check-outline',
    rows: [
      ['reference_by_id_name', 'Reference By'],
      ['followup_by_id_name', 'Followup By'],
      ['followup_id_mobile', 'Followup Mobile', followupContact],
    ],
  },
];

const text = v => (v == null ? '' : String(v).trim());

const LIST_SECTIONS = [
  {
    key: 'educations',
    tab: 'Education',
    title: 'Education',
    icon: 'school-outline',
    empty: 'No education recorded.',
    primary: r => text(r.education_level_name) || text(r.school_college_name),
    secondary: r =>
      text(r.education_level_name) ? text(r.school_college_name) : '',
    meta: r => [text(r.study_field)],
    badge: r => text(r.education_year),
  },
  {
    key: 'jobs',
    tab: 'Job',
    title: 'Job & Business',
    icon: 'briefcase-outline',
    empty: 'No job or business recorded.',
    primary: r => text(r.job_title) || text(r.company_name),
    secondary: r => (text(r.job_title) ? text(r.company_name) : ''),
    meta: r => [
      text(r.job_industry_name) || text(r.nature_of_business_name),
      text(r.years_of_experience) && `${text(r.years_of_experience)} yrs`,
      text(r.city),
    ],
    badge: r => (text(r.nature_of_business_name) ? 'Business' : 'Job'),
  },
  {
    key: 'family',
    tab: 'Family',
    title: 'Family',
    icon: 'account-group',
    empty: 'No family members linked.',
    primary: r => text(r.user_name),
    secondary: () => '',
    meta: () => [],
    badge: r => text(r.relation_name),
  },
];

const isAttendingValue = status =>
  status === true || status === 1 || String(status).toLowerCase() === 'true';

const DATE_KEYS = new Set(['dob', 'date_of_joining', 'anniversary_date']);

export function readValue(user, key) {
  if (key === '__status') {
    if (user?.status == null || user.status === '') return null;
    return isAttendingValue(user.status) ? 'Attending' : 'Not Attending';
  }
  const value = readMemberField(user, key);
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value == null || value === '') return null;
  if (DATE_KEYS.has(key)) return formatDate(value);
  return formatCell(value);
}

function followupContact(user) {
  const mobile = readMemberField(user, 'followup_id_mobile');
  if (!hasMobile(mobile)) return null;
  const whatsapp = readMemberField(user, 'followup_id_whatsapp') || mobile;

  const name =
    readMemberField(user, 'followup_by_id_name') || 'your follow-up person';
  const call = `Call ${name}`;
  const chat = `Message ${name} on WhatsApp`;

  return (
    <View style={styles.contactRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={call}
        onPress={() => Linking.openURL(telUrl(mobile))}
        style={[styles.contactBtn, { backgroundColor: COLORS.primary }]}
      >
        <MaterialCommunityIcons name="phone" size={16} color={COLORS.white} />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={chat}
        onPress={() => Linking.openURL(whatsAppUrl(whatsapp, GREETING))}
        style={[styles.contactBtn, { backgroundColor: WHATSAPP_GREEN }]}
      >
        <MaterialCommunityIcons
          name="whatsapp"
          size={16}
          color={COLORS.white}
        />
      </Pressable>
    </View>
  );
}

export function cellsFor(user, rows) {
  return rows
    .map(([key, label, render]) => ({
      key,
      label: typeof label === 'function' ? label(user) : label,
      value: render ? render(user) : readValue(user, key),
      isControl: Boolean(render),
    }))
    .filter(cell => !(cell.isControl && cell.value == null));
}

export function Field({ label, value }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueWrap}>
        {value == null ? (
          <Text style={styles.dash}>—</Text>
        ) : typeof value === 'string' ? (
          <Text style={styles.value}>{value}</Text>
        ) : (
          value
        )}
      </View>
    </View>
  );
}

function FieldGrid({ cells }) {
  const { width } = useWindowDimensions();
  const columns = width >= 1024 ? 3 : width >= 640 ? 2 : 1;

  const rows = [];
  for (let i = 0; i < cells.length; i += columns) {
    const slice = cells.slice(i, i + columns);
    while (slice.length < columns) slice.push(null);
    rows.push(slice);
  }

  return (
    <View style={styles.grid}>
      {rows.map((row, r) => (
        <View key={r} style={styles.gridRow}>
          {row.map((cell, c) =>
            cell ? (
              <Field key={cell.key} label={cell.label} value={cell.value} />
            ) : (
              <View key={`pad-${c}`} style={styles.field} />
            ),
          )}
        </View>
      ))}
    </View>
  );
}

export function SectionCard({ title, icon, action = null, children }) {
  return (
    <Card style={styles.sectionCard}>
      {title && (
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeaderTitle}>
            {icon && (
              <View style={styles.sectionIcon}>
                <MaterialCommunityIcons
                  name={icon}
                  size={18}
                  color={COLORS.primary}
                />
              </View>
            )}
            <Text style={styles.sectionTitle} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {action}
        </View>
      )}
      <View style={[styles.sectionBody, title && styles.sectionBodyTitled]}>
        {children}
      </View>
    </Card>
  );
}

function EntryRow({ section, item }) {
  const primary = section.primary(item);
  const secondary = section.secondary(item);
  const meta = section.meta(item).filter(Boolean);
  const badge = section.badge(item);

  return (
    <View style={styles.entry}>
      <View style={styles.entryIcon}>
        <MaterialCommunityIcons
          name={section.icon}
          size={18}
          color={COLORS.primary}
        />
      </View>

      <View style={styles.entryBody}>
        {primary ? (
          <Text style={styles.entryPrimary}>{primary}</Text>
        ) : (
          <Text style={styles.dash}>—</Text>
        )}
        {secondary ? (
          <Text style={styles.entrySecondary}>{secondary}</Text>
        ) : null}
        {meta.length > 0 && (
          <View style={styles.metaRow}>
            {meta.map((m, i) => (
              <View key={`${m}-${i}`} style={styles.metaItem}>
                {i > 0 && <Text style={styles.metaDot}>·</Text>}
                <Text style={styles.metaText}>{m}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {badge ? (
        <View style={styles.entryBadge}>
          <Text style={styles.entryBadgeText}>{badge}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ListSection({ section, query }) {
  const items = pickRows(query?.data);

  return (
    <SectionCard>
      {query?.isLoading ? (
        <Loader label={`Loading ${section.title.toLowerCase()}`} />
      ) : query?.error ? (
        <Text style={styles.listError}>
          Could not load {section.title.toLowerCase()}.
        </Text>
      ) : items.length === 0 ? (
        <EmptyState title={section.empty} icon={section.icon} />
      ) : (
        <View style={styles.entries}>
          {items.map((item, i) => (
            <EntryRow key={item.id ?? i} section={section} item={item} />
          ))}
        </View>
      )}
    </SectionCard>
  );
}

export function ProfileHero({
  photo,
  name,
  meta = [],
  chips = null,
  photoSlot = null,
  actions = null,
}) {
  const { width } = useWindowDimensions();
  const wide = width >= 640;

  return (
    <Card style={styles.heroCard}>
      <View style={[styles.hero, wide && styles.heroWide]}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatar}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatarImage} />
            ) : (
              <MaterialCommunityIcons
                name="account"
                size={44}
                color={COLORS.primary}
              />
            )}
          </View>
          {photoSlot}
        </View>

        <View style={[styles.heroCopy, wide && styles.heroCopyWide]}>
          <Text style={[styles.heroName, !wide && styles.centerText]}>
            {name}
          </Text>
          {meta.filter(Boolean).map((line, i) => (
            <Text
              key={`${line}-${i}`}
              style={[styles.heroMeta, !wide && styles.centerText]}
            >
              {line}
            </Text>
          ))}
          {chips && (
            <View style={[styles.chips, !wide && styles.chipsCenter]}>
              {chips}
            </View>
          )}
        </View>

        {actions && <View style={styles.heroActions}>{actions}</View>}
      </View>
    </Card>
  );
}

export const SECTION_TABS = [
  ...PROFILE_CARDS.reduce((tabs, card) => {
    const existing = tabs.find(t => t.key === card.tab);
    if (existing) existing.cards.push(card);
    else tabs.push({ key: card.tab, label: card.tab, cards: [card] });
    return tabs;
  }, []),
  ...LIST_SECTIONS.map(section => ({
    key: section.key,
    label: section.tab,
    section,
  })),
];

export default function ProfileCards({
  user,
  userId,
  omitTabs = [],
  extraTabs = [],
  onTabChange,
  jumpTo,
}) {
  const tabs = [
    ...(userId ? SECTION_TABS : SECTION_TABS.filter(t => t.cards)).filter(
      t => !omitTabs.includes(t.key),
    ),
    ...extraTabs,
  ];
  const [tabKey, setTabKey] = useState(tabs[0].key);
  const active = tabs.find(t => t.key === tabKey) ?? tabs[0];

  const openTab = key => {
    setTabKey(key);
    onTabChange?.(key);
  };

  // A tab opened from OUTSIDE the strip (the hero's Change Password / PIN
  // button, or returning from an edit). `token` is what makes the same tab
  // re-openable — the member may have moved away since the last request.
  const lastJump = useRef(null);
  useEffect(() => {
    if (!jumpTo?.key || jumpTo.token === lastJump.current) return;
    lastJump.current = jumpTo.token;
    if (tabs.some(t => t.key === jumpTo.key)) openTab(jumpTo.key);
    // `tabs` is rebuilt every render, so depending on it would re-fire this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.key, jumpTo?.token]);

  const educationsQ = useUserEducations(
    userId,
    Boolean(userId) && active.key === 'educations',
  );
  const jobsQ = useUserJobs(userId, Boolean(userId) && active.key === 'jobs');
  const familyQ = useUserFamily(
    userId,
    Boolean(userId) && active.key === 'family',
  );
  const queries = { educations: educationsQ, jobs: jobsQ, family: familyQ };

  return (
    <View style={styles.stack}>
      <Tabs
        tabs={tabs.map(({ key, label }) => ({ value: key, label }))}
        value={active.key}
        onChange={openTab}
      />

      {active.render ? (
        active.render()
      ) : active.cards ? (
        active.cards.map(card => (
          <SectionCard key={card.title}>
            <FieldGrid cells={cellsFor(user, card.rows)} />
          </SectionCard>
        ))
      ) : (
        <ListSection
          section={active.section}
          query={queries[active.section.key]}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: space(4) },

  grid: { gap: space(5) },
  gridRow: { flexDirection: 'row', gap: space(8) },
  field: { flex: 1, minWidth: 0 },
  label: { fontSize: 13, lineHeight: 17, color: COLORS.textMuted },
  valueWrap: { marginTop: 6 },
  value: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  dash: { fontSize: 15, color: FAINT },

  contactRow: { flexDirection: 'row', alignItems: 'center', gap: space(2) },
  contactBtn: {
    width: 36,
    height: 36,
    borderRadius: RADII.control,
    alignItems: 'center',
    justifyContent: 'center',
  },

  sectionCard: { padding: 0 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(4),
    paddingHorizontal: space(6),
    paddingTop: space(5),
    paddingBottom: space(4),
  },
  sectionHeaderTitle: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: RADII.control,
    backgroundColor: COLORS.primary50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitle: {
    flexShrink: 1,
    fontSize: 18,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  sectionBody: {
    paddingHorizontal: space(6),
    paddingTop: space(5),
    paddingBottom: space(6),
  },
  sectionBodyTitled: { borderTopWidth: 1, borderTopColor: COLORS.lineSoft },

  entries: { gap: 10 },
  entry: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderRadius: RADII.control,
    borderWidth: 1,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.bg,
    padding: space(4),
  },
  entryIcon: {
    width: 40,
    height: 40,
    borderRadius: RADII.control,
    backgroundColor: COLORS.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...SHADOWS.card,
  },
  entryBody: { flex: 1, minWidth: 0 },
  entryPrimary: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  entrySecondary: { marginTop: 2, fontSize: 14, color: COLORS.textMuted },
  metaRow: {
    marginTop: 6,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 8,
    rowGap: 4,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaDot: { fontSize: 13, color: COLORS.lineStrong },
  metaText: { fontSize: 13, color: FAINT },
  entryBadge: {
    borderRadius: RADII.full,
    backgroundColor: COLORS.primary50,
    paddingHorizontal: space(3),
    paddingVertical: space(1),
  },
  entryBadgeText: {
    fontSize: 12,
    fontWeight: WEIGHT.semibold,
    color: COLORS.primary,
  },
  listError: {
    paddingVertical: space(4),
    fontSize: 14,
    color: COLORS.dangerFg,
  },

  heroCard: { padding: 0 },
  hero: { alignItems: 'center', gap: space(5), padding: space(6) },
  heroWide: { flexDirection: 'row' },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: RADII.full,
    borderWidth: 4,
    borderColor: COLORS.lineSoft,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
  heroCopy: { flexShrink: 1, alignItems: 'center' },
  heroCopyWide: { flex: 1, alignItems: 'flex-start' },
  heroName: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  heroMeta: { marginTop: 4, fontSize: 14, color: COLORS.textMuted },
  centerText: { textAlign: 'center' },
  chips: {
    marginTop: 12,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: space(2),
  },
  chipsCenter: { justifyContent: 'center' },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space(2),
  },
});
