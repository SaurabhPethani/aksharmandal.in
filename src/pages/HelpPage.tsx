import React, { useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput as RNTextInput,
  View,
} from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import SiteFooter from '../components/SiteFooter';
import AppHeader from '../components/AppHeader';
import { Text } from '../components/Typography';
import { searchMatches } from '../utils/options';

const COLORS = {
  navy: '#003158',
  navyLight: '#004275',
  background: '#F0F4F8',
  surface: '#FFFFFF',
  border: '#DDE9F3',
  muted: '#5C7A96',
  faint: '#9BB5CB',
  text: '#16324B',
  green: '#15803D',
  greenBg: '#DCFCE7',
  amber: '#B45309',
  amberBg: '#FEF3C7',
  sky: '#0F766E',
  skyBg: '#E0F2FE',
  red: '#B91C1C',
  redBg: '#FEE2E2',
};

const ROLE_COLS = [
  { key: 'mh', short: 'MH', label: 'Mandal Head' },
  { key: 'mdb', short: 'MDB', label: 'Mandal DB Mgr' },
  { key: 'sh', short: 'SH', label: 'Sabha Head' },
  { key: 'sdb', short: 'SDB', label: 'Sabha DB Mgr' },
  { key: 'ys', short: 'YS', label: 'Yuva Seva' },
  { key: 'yv', short: 'YV', label: 'Yuvak' },
];

type AccessValue = 'yes' | 'no' | 'limited' | 'approval';

function Cell({ value }: { value?: AccessValue | string }) {
  if (value === 'yes') return <Pill tone="ok" label="Yes" glyph="✓" />;
  if (value === 'no') return <Pill tone="muted" label="No" glyph="–" />;
  if (value === 'limited')
    return <Pill tone="warn" label="Limited (see note)" glyph="◐" />;
  if (value === 'approval')
    return <Pill tone="info" label="Needs approval" glyph="⧗" />;
  return <Text style={styles.mutedDash}>—</Text>;
}

function Pill({
  tone,
  label,
  glyph,
}: {
  tone: 'ok' | 'muted' | 'warn' | 'info';
  label: string;
  glyph: string;
}) {
  const palette = {
    ok: { bg: COLORS.greenBg, color: COLORS.green, border: '#BBF7D0' },
    muted: { bg: '#F1F5F9', color: '#475569', border: '#E2E8F0' },
    warn: { bg: COLORS.amberBg, color: COLORS.amber, border: '#FCD34D' },
    info: { bg: COLORS.skyBg, color: COLORS.sky, border: '#BAE6FD' },
  }[tone];

  return (
    <View
      accessibilityRole="imagebutton"
      accessibilityLabel={label}
      style={[
        styles.pill,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
      ]}
    >
      <Text style={[styles.pillText, { color: palette.color }]}>{glyph}</Text>
    </View>
  );
}

type MatrixRow = {
  label: string;
  mh?: AccessValue | string;
  mdb?: AccessValue | string;
  sh?: AccessValue | string;
  sdb?: AccessValue | string;
  ys?: AccessValue | string;
  yv?: AccessValue | string;
};

function RoleMatrix({ rows }: { rows: MatrixRow[] }) {
  return (
    <View style={styles.matrixWrap}>
      <View style={styles.matrixHeaderRow}>
        <Text style={styles.matrixHeaderActivity}>Activity</Text>
        {ROLE_COLS.map(column => (
          <View key={column.key} style={styles.matrixHeaderCell}>
            <Text style={styles.matrixHeaderShort}>{column.short}</Text>
            <Text style={styles.matrixHeaderLabel}>
              {column.label.split(' ').slice(-1)[0]}
            </Text>
          </View>
        ))}
      </View>
      {rows.map((row, index) => (
        <View key={`${row.label}-${index}`} style={styles.matrixRow}>
          <Text style={styles.matrixLabel}>{row.label}</Text>
          {ROLE_COLS.map(column => (
            <View key={`${row.label}-${column.key}`} style={styles.matrixCell}>
              <Cell value={row[column.key as keyof MatrixRow]} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <View style={styles.steps}>
      {items.map((item, index) => (
        <View key={`${item}-${index}`} style={styles.stepRow}>
          <Text style={styles.stepIndex}>{index + 1}.</Text>
          <Text style={styles.stepText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Q({ children }: { children: React.ReactNode }) {
  return <Text style={styles.qText}>{children}</Text>;
}

function A({ children }: { children: React.ReactNode }) {
  return <Text style={styles.aText}>{children}</Text>;
}

type FaqItem = {
  q: string;
  answer?: string;
  steps?: string[];
  bullets?: string[];
};

type SectionEntry = {
  id: string;
  number: string;
  group: string;
  title: string;
  text: string;
  rows?: MatrixRow[];
  notes?: string[];
  faqs?: FaqItem[];
};

const SECTIONS: SectionEntry[] = [
  {
    id: 'roles',
    number: '1',
    group: 'Overview',
    title: 'The roles covered in this manual',
    text: 'roles mandal head sabha yuva seva yuvak nimit sevak overview',
    rows: [
      {
        label: 'Mandal Head',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'no',
      },
      {
        label: 'Mandal DB Manager',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'no',
      },
      {
        label: 'Sabha Head',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'no',
      },
      {
        label: 'Sabha DB Manager',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'no',
      },
      {
        label: 'Yuva Seva',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'no',
      },
      {
        label: 'Yuvak (member)',
        mh: 'no',
        mdb: 'no',
        sh: 'no',
        sdb: 'no',
        ys: 'no',
        yv: 'yes',
      },
    ],
  },
  {
    id: 'users',
    number: '2',
    group: 'Yuvaks',
    title: 'Who can add, edit, and manage Yuvaks?',
    text: 'add new yuvak edit profile role permission follow-up qr bulk status user management',
    rows: [
      {
        label: 'Add a new Yuvak',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'no',
        yv: 'no',
      },
      {
        label: "Edit a Yuvak's profile",
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'limited',
        yv: 'approval',
      },
      {
        label: 'Change a Yuvak role',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'no',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Assign follow-up person',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Generate or regenerate QR',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Bulk activate or deactivate Yuvaks',
        mh: 'no',
        mdb: 'no',
        sh: 'yes',
        sdb: 'yes',
        ys: 'no',
        yv: 'no',
      },
    ],
    notes: [
      'A new Yuvak is created immediately without approval. The assigned Yuva Seva or a higher Nimit Sevak can approve profile changes, and the hierarchy rules are enforced by the system.',
    ],
  },
  {
    id: 'visibility',
    number: '3',
    group: 'Overview',
    title: 'Which Yuvak details are visible to which role?',
    text: 'visible view scope access yuvak visibility mandal sabha yuva seva',
    rows: [
      {
        label: 'Mandal Head',
        mh: 'yes',
        mdb: 'no',
        sh: 'no',
        sdb: 'no',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Mandal DB Manager',
        mh: 'no',
        mdb: 'yes',
        sh: 'no',
        sdb: 'no',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Sabha Head',
        mh: 'no',
        mdb: 'no',
        sh: 'yes',
        sdb: 'no',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Sabha DB Manager',
        mh: 'no',
        mdb: 'no',
        sh: 'no',
        sdb: 'yes',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Yuva Seva',
        mh: 'no',
        mdb: 'no',
        sh: 'no',
        sdb: 'no',
        ys: 'yes',
        yv: 'no',
      },
      {
        label: 'Yuvak',
        mh: 'no',
        mdb: 'no',
        sh: 'no',
        sdb: 'no',
        ys: 'no',
        yv: 'yes',
      },
    ],
  },
  {
    id: 'org',
    number: '4',
    group: 'Structure',
    title: 'Sabhas, Mandals, and Pradeshs',
    text: 'organisation structure pradesh mandal sabha hierarchy view add edit',
    rows: [
      {
        label: 'See the org structure',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'no',
      },
      {
        label: 'Add a new Pradesh',
        mh: 'no',
        mdb: 'no',
        sh: 'no',
        sdb: 'no',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Add a new Mandal',
        mh: 'no',
        mdb: 'no',
        sh: 'no',
        sdb: 'no',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Add a new Sabha',
        mh: 'yes',
        mdb: 'yes',
        sh: 'no',
        sdb: 'no',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Edit an existing Sabha',
        mh: 'yes',
        mdb: 'yes',
        sh: 'no',
        sdb: 'no',
        ys: 'no',
        yv: 'no',
      },
    ],
  },
  {
    id: 'transfers',
    number: '5',
    group: 'Movements',
    title: 'Transfers and approvals',
    text: 'transfer move sabha request submit accept reject cancel pending approval',
    rows: [
      {
        label: 'View transfers',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Submit a transfer request',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Accept or reject transfer',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'no',
        yv: 'no',
      },
    ],
    notes: [
      'Every Sabha transfer requires approval from the receiving side. A request is effective only once the receiving head or DB Manager accepts it, and the submitter can cancel it while it remains pending.',
    ],
  },
  {
    id: 'events',
    number: '6',
    group: 'Programmes',
    title: 'Events',
    text: 'events create edit register attendance programme',
    rows: [
      {
        label: 'See events',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'yes',
      },
      {
        label: 'Create or edit events',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Register Yuvak for an event',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'yes',
      },
    ],
    notes: ['Events go live immediately and do not require approval.'],
  },
  {
    id: 'jobs',
    number: '7',
    group: 'Programmes',
    title: 'Jobs and the maker-checker flow',
    text: 'jobs job portal pending approve pause reject close maker checker',
    rows: [
      {
        label: 'See job posts',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'yes',
      },
      {
        label: 'Create a job post',
        mh: 'approval',
        mdb: 'approval',
        sh: 'approval',
        sdb: 'approval',
        ys: 'approval',
        yv: 'approval',
      },
      {
        label: 'Approve or reject job post',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'no',
        ys: 'no',
        yv: 'no',
      },
    ],
    notes: [
      'A new post stays pending until a Sabha Head, Mandal DB Manager, or Mandal Head approves it.',
    ],
  },
  {
    id: 'attendance',
    number: '8',
    group: 'Programmes',
    title: 'Attendance',
    text: 'attendance present absent mark update correct records',
    rows: [
      {
        label: 'See attendance records',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'no',
      },
      {
        label: 'Mark attendance',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'no',
        yv: 'no',
      },
      {
        label: 'Correct attendance entry',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'no',
        yv: 'no',
      },
    ],
  },
  {
    id: 'reports',
    number: '9',
    group: 'Programmes',
    title: 'Reports and downloads',
    text: 'reports view export download performance attendance trend',
    rows: [
      {
        label: 'View performance reports',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'limited',
        yv: 'limited',
      },
      {
        label: 'Download or export reports',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'no',
      },
    ],
    notes: [
      'Yuva Seva sees only reports for assigned Yuvaks, and Yuvaks see only their own report data.',
    ],
  },
  {
    id: 'ys-register',
    number: '10',
    group: 'Programmes',
    title: 'Yuva Seva register',
    text: 'yuva seva register interaction calls visits meetings notes',
    rows: [
      {
        label: 'Add or edit a Yuva Seva interaction record',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'no',
      },
    ],
    notes: [
      'A record can be created only for a Yuvak whose follow-up person is set to you.',
    ],
  },
  {
    id: 'master-data',
    number: '11',
    group: 'Admin',
    title: 'System or master data',
    text: 'master data dropdown values education industry state city country job',
    rows: [
      {
        label: 'View system data',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'no',
      },
      {
        label: 'Add or edit system data',
        mh: 'yes',
        mdb: 'yes',
        sh: 'no',
        sdb: 'no',
        ys: 'no',
        yv: 'no',
      },
    ],
  },
  {
    id: 'admin',
    number: '12',
    group: 'Admin',
    title: 'Role and access management',
    text: 'role access permissions admin menu top-level container',
    rows: [
      {
        label: 'Access the Admin menu',
        mh: 'yes',
        mdb: 'no',
        sh: 'yes',
        sdb: 'yes',
        ys: 'yes',
        yv: 'no',
      },
      {
        label: 'Add or edit access roles',
        mh: 'yes',
        mdb: 'yes',
        sh: 'yes',
        sdb: 'no',
        ys: 'no',
        yv: 'no',
      },
    ],
    notes: ['Per-user access overrides are handled by SuperAdmin only.'],
  },
  {
    id: 'faq-users',
    number: '17.1',
    group: 'FAQ',
    title: 'FAQ — Yuvaks',
    text: 'faq yuvak add edit profile change role bulk qr follow-up',
    faqs: [
      {
        q: 'How do I add a new Yuvak?',
        steps: [
          'Open Users and click Add User or New Member.',
          'Fill in the name, mobile number, date of birth, gender, and address details.',
          'Choose a category, role, and optional follow-up person.',
          'Save. You are restricted to your own Pradesh, Mandal, and Sabha.',
        ],
      },
      {
        q: 'Why is my profile edit not visible instantly?',
        answer:
          'Profile edits from a member go through a Nimit Sevak or the assigned Yuva Seva for approval. Once approved, the profile updates immediately.',
      },
      {
        q: 'How do I change someone’s role?',
        steps: [
          'Open Users, select the Yuvak, and choose Change Role.',
          'Pick a role below your own rank.',
          'Save. Existing access overrides are cleared automatically.',
        ],
      },
      {
        q: 'How do I bulk activate or deactivate Yuvaks?',
        steps: [
          'Go to Users, select the relevant records, and click Bulk Status.',
          'Choose Activate or Deactivate and confirm.',
        ],
      },
    ],
  },
  {
    id: 'faq-transfers',
    number: '17.5',
    group: 'FAQ',
    title: 'FAQ — transfers and approvals',
    text: 'faq transfer submit approve reject cancel pending approval',
    faqs: [
      {
        q: 'How do I submit a transfer?',
        steps: [
          'Open Transfers and click New Transfer Request.',
          'Choose the Yuvak and destination Sabha or Mandal.',
          'Submit the request. It moves to the receiving side’s Pending list.',
        ],
      },
      {
        q: 'Can I cancel a transfer I submitted?',
        answer:
          'Yes, while it is still pending. Open My Requests, select the transfer, and click Cancel. Once accepted or rejected, it cannot be cancelled.',
      },
      {
        q: 'Why did my transfer fail?',
        bullets: [
          'The destination Sabha does not belong to the selected Mandal.',
          'The Yuvak is inactive.',
          'The follow-up person selected is not valid for the destination Sabha.',
        ],
      },
    ],
  },
  {
    id: 'faq-jobs',
    number: '17.6',
    group: 'FAQ',
    title: 'FAQ — jobs',
    text: 'faq jobs maker checker pending approve pause reject close',
    faqs: [
      {
        q: 'Why is my new job not visible yet?',
        answer:
          'The job stays pending until a Sabha Head, Mandal DB Manager, or Mandal Head approves it.',
      },
      {
        q: 'Can a job be paused or rejected later?',
        answer:
          'Yes. Approvers can Pause, Reject, or Close a job post at any time.',
      },
    ],
  },
  {
    id: 'faq-admin',
    number: '17.10',
    group: 'FAQ',
    title: 'FAQ — Admin menu',
    text: 'faq admin menu access roles master data logs hierarchy',
    faqs: [
      {
        q: 'What is in the Admin menu?',
        answer:
          'It is a top-level container for pages such as Access Roles, Master Data, Logs, and Hierarchy. The options you see depend on your permissions.',
      },
      {
        q: 'Is it normal not to see the Admin menu?',
        answer:
          'Yes. Mandal DB Managers and Yuvaks do not have access to the Admin container, while other roles do.',
      },
    ],
  },
];

function groupSections(sections: SectionEntry[]) {
  const order: string[] = [];
  const byGroup: Record<string, SectionEntry[]> = {};

  for (const section of sections) {
    if (!byGroup[section.group]) {
      byGroup[section.group] = [];
      order.push(section.group);
    }
    byGroup[section.group].push(section);
  }

  return order.map(group => ({ group, items: byGroup[group] }));
}

export default function HelpPage({
  onMenu = () => {},
  onNotifications = () => {},
  onProfile,
  onBack,
}: {
  onMenu?: () => void;
  onNotifications?: () => void;
  onProfile?: () => void;
  onBack?: () => void;
}) {
  const [query, setQuery] = useState('');
  const sectionRefs = useRef<Record<string, View | null>>({});

  const q = query.trim();
  const visible = useMemo(() => {
    if (!q) return SECTIONS;
    return SECTIONS.filter(section => {
      const haystack = [
        section.number,
        section.title,
        section.group,
        section.text,
        section.notes?.join(' '),
        section.faqs
          ?.map(
            item =>
              `${item.q} ${item.answer ?? ''} ${item.steps?.join(' ') ?? ''}`,
          )
          .join(' '),
      ]
        .filter(Boolean)
        .join(' ');
      return searchMatches(haystack, q);
    });
  }, [q]);

  const grouped = useMemo(() => groupSections(visible), [visible]);

  const jumpToSection = (id: string) => {
    const node = sectionRefs.current[id];
    if (!node) return;

    node.measure((x, y, width, height, pageX, pageY) => {
      if (typeof (globalThis as any)?.requestAnimationFrame === 'function') {
        (globalThis as any).requestAnimationFrame(() => {
          const scrollView = (sectionRefs.current as any).__scrollView;
          if (scrollView && typeof scrollView.scrollTo === 'function') {
            scrollView.scrollTo({
              y: Math.max(pageY - 120, 0),
              animated: true,
            });
          }
        });
      }
    });
  };

  return (
    <View style={styles.screen}>
      <AppHeader
        onMenu={onMenu}
        onNotifications={onNotifications}
        onProfile={onProfile}
        onBack={onBack}
      />

      {/* Edge-to-edge is on (see android/gradle.properties), so the keyboard
          is drawn OVER the screen rather than resizing it. `padding` measures
          the real overlap, so it is 0 wherever the window does still resize. */}
      <KeyboardAvoidingView behavior="padding" style={styles.contentWrap}>
        <ScrollView
          ref={node => {
            (sectionRefs.current as any).__scrollView = node;
          }}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerCard}>
            <View style={styles.headerRow}>
              <View style={styles.headerIconWrap}>
                <MaterialCommunityIcons
                  name="book-open-page-variant"
                  size={22}
                  color={COLORS.navy}
                />
              </View>
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle}>Help & FAQ</Text>
                <Text style={styles.headerSubtitle}>
                  Who can do what — a plain-English guide.
                </Text>
              </View>
            </View>

            <View style={styles.searchBox}>
              <MaterialCommunityIcons
                name="magnify"
                size={18}
                color={COLORS.muted}
                style={styles.searchIcon}
              />
              <RNTextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search sections…"
                placeholderTextColor={COLORS.muted}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search help sections"
              />
              {query ? (
                <Pressable
                  onPress={() => setQuery('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                  style={styles.clearButton}
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={15}
                    color={COLORS.muted}
                  />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <Cell value="yes" />
                <Text style={styles.legendText}>Yes</Text>
              </View>
              <View style={styles.legendItem}>
                <Cell value="no" />
                <Text style={styles.legendText}>No</Text>
              </View>
              <View style={styles.legendItem}>
                <Cell value="limited" />
                <Text style={styles.legendText}>Limited</Text>
              </View>
              <View style={styles.legendItem}>
                <Cell value="approval" />
                <Text style={styles.legendText}>Needs approval</Text>
              </View>
            </View>
          </View>

          <View style={styles.sidebarWrap}>
            {grouped.length === 0 ? (
              <View style={styles.emptyStateBox}>
                <Text style={styles.emptyStateText}>
                  No sections match “{query}”.
                </Text>
              </View>
            ) : (
              grouped.map(group => (
                <View key={group.group} style={styles.groupBlock}>
                  <Text style={styles.groupHeading}>{group.group}</Text>
                  {group.items.map(section => (
                    <Pressable
                      key={section.id}
                      onPress={() => jumpToSection(section.id)}
                      style={styles.navItem}
                    >
                      <Text style={styles.navNumber}>§{section.number}</Text>
                      <Text style={styles.navTitle}>{section.title}</Text>
                    </Pressable>
                  ))}
                </View>
              ))
            )}
          </View>

          {visible.length === 0 ? (
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateText}>
                No sections match “{query}”. Try transfer, attendance, or role.
              </Text>
            </View>
          ) : (
            visible.map(section => (
              <View
                key={section.id}
                ref={node => {
                  sectionRefs.current[section.id] = node;
                }}
                style={styles.sectionCard}
              >
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionNumber}>§{section.number}</Text>
                  <Text style={styles.sectionTitle}>{section.title}</Text>
                </View>

                {section.notes?.length ? (
                  <View style={styles.callout}>
                    {section.notes.map((note, index) => (
                      <Text
                        key={`${section.id}-note-${index}`}
                        style={styles.calloutText}
                      >
                        {note}
                      </Text>
                    ))}
                  </View>
                ) : null}

                {section.rows ? <RoleMatrix rows={section.rows} /> : null}

                {section.faqs
                  ? section.faqs.map(item => (
                      <View key={item.q} style={styles.faqBlock}>
                        <Q>{item.q}</Q>
                        {item.steps ? <Steps items={item.steps} /> : null}
                        {item.answer ? <A>{item.answer}</A> : null}
                        {item.bullets ? (
                          <View style={styles.bulletList}>
                            {item.bullets.map((bullet, index) => (
                              <View
                                key={`${bullet}-${index}`}
                                style={styles.bulletRow}
                              >
                                <Text style={styles.bulletDot}>•</Text>
                                <Text style={styles.bulletText}>{bullet}</Text>
                              </View>
                            ))}
                          </View>
                        ) : null}
                      </View>
                    ))
                  : null}
              </View>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <SiteFooter />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentWrap: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 14,
    paddingBottom: 20,
    paddingHorizontal: 14,
  },
  headerCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#E6EEF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
  },
  headerSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginTop: 2,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    backgroundColor: '#F8FBFF',
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: COLORS.text,
    fontSize: 14,
    paddingVertical: 10,
    minHeight: 42,
  },
  clearButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#EEF4F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 12,
    marginTop: 6,
  },
  legendText: {
    color: COLORS.muted,
    fontSize: 11,
    marginLeft: 6,
  },
  sidebarWrap: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    marginBottom: 14,
    overflow: 'hidden',
  },
  groupBlock: {
    padding: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  groupHeading: {
    color: COLORS.faint,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: 10,
  },
  navNumber: {
    color: COLORS.muted,
    width: 24,
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  navTitle: {
    color: COLORS.text,
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionNumber: {
    color: COLORS.muted,
    fontSize: 12,
    fontWeight: '700',
    marginRight: 8,
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
    flex: 1,
    lineHeight: 24,
  },
  matrixWrap: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
  },
  matrixHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F2F7FB',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  matrixHeaderActivity: {
    flex: 1.3,
    padding: 10,
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  matrixHeaderCell: {
    flex: 0.8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderLeftWidth: 1,
    borderLeftColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  matrixHeaderShort: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.text,
  },
  matrixHeaderLabel: {
    fontSize: 9,
    color: COLORS.muted,
    marginTop: 2,
  },
  matrixRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EDF3FA',
    backgroundColor: '#FFFFFF',
  },
  matrixLabel: {
    flex: 1.3,
    padding: 12,
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '600',
  },
  matrixCell: {
    flex: 0.8,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderLeftWidth: 1,
    borderLeftColor: '#EDF3FA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: {
    fontSize: 12,
    fontWeight: '700',
  },
  mutedDash: {
    color: COLORS.muted,
    fontSize: 13,
  },
  callout: {
    borderWidth: 1,
    borderColor: '#BAE6FD',
    backgroundColor: '#E0F2FE',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 12,
  },
  calloutText: {
    color: '#0F172A',
    fontSize: 13,
    lineHeight: 18,
  },
  steps: {
    marginTop: 10,
    paddingLeft: 18,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  stepIndex: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '700',
    marginRight: 6,
    lineHeight: 18,
  },
  stepText: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  qText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
    lineHeight: 20,
  },
  aText: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
  faqBlock: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF3F8',
    paddingTop: 8,
  },
  bulletList: {
    marginTop: 8,
    paddingLeft: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  bulletDot: {
    color: COLORS.text,
    fontSize: 14,
    marginRight: 8,
    lineHeight: 18,
  },
  bulletText: {
    color: COLORS.text,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  emptyStateBox: {
    backgroundColor: COLORS.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginBottom: 14,
  },
  emptyStateText: {
    color: COLORS.muted,
    fontSize: 13,
    lineHeight: 18,
  },
});
