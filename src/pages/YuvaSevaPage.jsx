import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { MaterialDesignIcons as Icon } from '@react-native-vector-icons/material-design-icons/static';
import AppHeader from '../components/AppHeader';
import SiteFooter from '../components/SiteFooter';
import { Modal } from '../components/Overlays';
import { Text } from '../components/Typography';
import { dashboardService } from '../services/dashboardService';

const C = {
  navy: '#003158',
  muted: '#5C7A96',
  faint: '#7894AA',
  background: '#F0F4F8',
  surface: '#FFFFFF',
  border: '#DDE9F3',
  accent: '#FF862A',
  red: '#B42318',
  green: '#15803D',
  amber: '#B45309',
};

const SOULS = {
  mission_double: ['Mission Double', '#8B5CF6'],
  divine: ['Divine', '#16A34A'],
  climber: ['Climber', '#3B82F6'],
  steady: ['Steady', '#CA8A04'],
  seeking: ['Seeking', '#D97706'],
  sleeping: ['Sleeping', '#10B981'],
};

function dateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return null;
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${Number(match[3])} ${months[Number(match[2]) - 1]} ${match[1]}`;
}

function priorityStyle(priority) {
  const value = String(priority || '').toLowerCase();
  if (value.includes('high') || value.includes('urgent'))
    return { color: C.red, bg: '#FEE4E2' };
  if (value.includes('medium') || value.includes('mid'))
    return { color: C.amber, bg: '#FEF3E2' };
  if (value.includes('low')) return { color: C.green, bg: '#DCFCE7' };
  return { color: C.navy, bg: '#E6EEF5' };
}

function summary(rows) {
  return rows.reduce(
    (total, row) => {
      const last15 = Number(row.last_15_days) || 0;
      const last30 = Number(row.last_1_month) || 0;
      return {
        members: total.members + 1,
        distinct15: total.distinct15 + (last15 > 0 ? 1 : 0),
        distinct30: total.distinct30 + (last30 > 0 ? 1 : 0),
        yesterday: total.yesterday + (Number(row.yesterday_count) || 0),
      };
    },
    { members: 0, distinct15: 0, distinct30: 0, yesterday: 0 },
  );
}

function Kpi({ label, value, unit }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
      <Text style={styles.kpiUnit}>{unit}</Text>
    </View>
  );
}

function MemberRow({ row, canAdd, onHistory, onAdd, showAssigned, showSabha }) {
  const [open, setOpen] = useState(false);
  const tone = priorityStyle(row.priority);
  const last = dateOnly(row.date);
  const soul = SOULS[row.soul_band];
  const creator = row.followup_user_name;
  const compact = last ? [last, creator].filter(Boolean).join(' · ') : 'Never';

  return (
    <View style={styles.memberCard}>
      <Pressable
        onPress={() => setOpen(value => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={styles.memberHeader}
      >
        <View style={[styles.priorityDot, { backgroundColor: tone.color }]} />
        <View style={styles.memberMain}>
          <View style={styles.memberNameLine}>
            <Text style={styles.memberName} numberOfLines={1}>
              {row.user_name || 'Member'}
            </Text>
            {soul ? (
              <Text
                style={[
                  styles.tag,
                  { color: soul[1], backgroundColor: `${soul[1]}18` },
                ]}
              >
                {soul[0]}
              </Text>
            ) : null}
            {showAssigned && row.is_mine ? (
              <Text style={styles.youTag}>You</Text>
            ) : null}
            {showSabha && row.sabha_name ? (
              <Text style={styles.sabhaTag} numberOfLines={1}>
                {row.sabha_name}
              </Text>
            ) : null}
          </View>
          <Text
            style={[styles.compact, !last && styles.never]}
            numberOfLines={1}
          >
            {compact}
          </Text>
        </View>
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={20}
          color={C.faint}
        />
      </Pressable>
      {open ? (
        <View style={styles.memberDetails}>
          {showSabha ? (
            <Fact label="Sabha" value={row.sabha_name || '—'} />
          ) : null}
          {showAssigned ? (
            <Fact
              label="Assigned to"
              value={row.is_mine ? 'You' : row.assigned_to || '—'}
            />
          ) : null}
          <Fact label="Last seva" value={last || 'Never'} danger={!last} />
          {showAssigned ? (
            <Fact label="Last logged by" value={creator || '—'} />
          ) : null}
          <Fact
            label="Days ago"
            value={row.days_prior ?? '—'}
            color={tone.color}
          />
          <Fact
            label="Last 15 days"
            value={row.last_15_days ?? 0}
            color={tone.color}
          />
          <Fact
            label="Last 30 days"
            value={row.last_1_month ?? 0}
            color={tone.color}
          />
          <Fact
            label="Priority"
            value={row.priority || '—'}
            color={tone.color}
          />
          <Pressable style={styles.secondaryButton} onPress={onHistory}>
            <Text style={styles.secondaryText}>View recent meets</Text>
          </Pressable>
          {canAdd ? (
            <Pressable style={styles.addButton} onPress={onAdd}>
              <Text style={styles.addText}>+ Add Yuva Seva</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Fact({ label, value, danger, color }) {
  return (
    <View style={styles.fact}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text
        style={[styles.factValue, danger && styles.never, color && { color }]}
      >
        {String(value)}
      </Text>
    </View>
  );
}

export default function YuvaSevaPage({
  onBack,
  onMenu,
  onHelp,
  onNotifications,
  onProfile,
}) {
  const canAdd = true;
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [scope, setScope] = useState('all');
  const [query, setQuery] = useState('');
  const [openHistory, setOpenHistory] = useState(null);
  const [history, setHistory] = useState(null);
  const [adding, setAdding] = useState(null);
  const [form, setForm] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await dashboardService.yuvaSevaReport();
      const nextRows = Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result)
          ? result
          : [];
      setRows(nextRows);
      setTotals(result || {});
      setError('');
    } catch (caught) {
      setError(caught?.message || 'Could not load the Yuva Seva report.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const hasOthers = rows.some(row => !row.is_mine);
  const visibleRows = useMemo(() => {
    const scoped =
      hasOthers && scope === 'mine' ? rows.filter(row => row.is_mine) : rows;
    const needle = query.trim().toLowerCase();
    return needle
      ? scoped.filter(row =>
          String(row.user_name || '')
            .toLowerCase()
            .includes(needle),
        )
      : scoped;
  }, [hasOthers, query, rows, scope]);
  const stats = summary(
    hasOthers && scope === 'mine' ? rows.filter(row => row.is_mine) : rows,
  );
  const showSabha =
    hasOthers &&
    new Set(rows.map(row => row.sabha_name).filter(Boolean)).size > 1;

  const viewHistory = async row => {
    setOpenHistory(row);
    try {
      setHistory(await dashboardService.yuvaSevaMemberHistory(row.user_id, 3));
    } catch (caught) {
      setHistory({ error: caught?.message || 'Unable to load recent meets.' });
    }
  };

  const openAdd = row => {
    setAdding(row);
    setForm({ date: new Date().toISOString().slice(0, 10) });
    setFormError('');
  };

  const saveAdd = async () => {
    if (!form.mode || !String(form.duration || '').trim() || !form.date) {
      setFormError('Mode, duration, and date are required.');
      return;
    }
    if (form.date > new Date().toISOString().slice(0, 10)) {
      setFormError('A seva cannot be logged for a future date.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      await dashboardService.addYuvaSeva({
        user_id: Number(adding.user_id ?? adding.id),
        mode: form.mode,
        date: form.date,
        time: new Date().toTimeString().slice(0, 5),
        duration: Number(form.duration),
        ...(String(form.remark || '').trim()
          ? { remark: form.remark.trim() }
          : {}),
      });
      setAdding(null);
      await load(true);
    } catch (caught) {
      setFormError(caught?.message || 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.safe}>
      <AppHeader
        onMenu={onMenu}
        onHelp={onHelp}
        onNotifications={onNotifications}
        onProfile={onProfile}
        onBack={onBack}
        breadcrumbs={['Dashboard', 'Yuva Seva']}
      />
      {/* Edge-to-edge is on (see android/gradle.properties), so the keyboard
          is drawn OVER the screen rather than resizing it. `padding` measures
          the real overlap, so it is 0 wherever the window does still resize. */}
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={C.navy}
            />
          }
        >
          <Text style={styles.title}>Yuva Seva</Text>
          <Text style={styles.subtitle}>
            Follow up with members and help them stay connected.
          </Text>
          {loading ? (
            <ActivityIndicator size="large" color={C.navy} />
          ) : error ? (
            <View style={styles.state}>
              <Text style={styles.stateText}>{error}</Text>
              <Pressable onPress={() => load()}>
                <Text style={styles.retry}>Retry</Text>
              </Pressable>
            </View>
          ) : (
            <>
              {hasOthers ? (
                <View style={styles.scopeToggle}>
                  {['all', 'mine'].map(value => (
                    <Pressable
                      key={value}
                      onPress={() => setScope(value)}
                      style={[
                        styles.scopeOption,
                        scope === value && styles.scopeSelected,
                      ]}
                    >
                      <Text
                        style={[
                          styles.scopeText,
                          scope === value && styles.scopeTextSelected,
                        ]}
                      >
                        {value === 'all' ? 'All in scope' : 'My follow-ups'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              <View style={styles.kpiGrid}>
                <Kpi
                  label="Total Members"
                  value={stats.members}
                  unit="On follow-up"
                />
                <Kpi
                  label="Unique Yuvak · 15 days"
                  value={stats.distinct15}
                  unit="Contacted"
                />
                <Kpi
                  label="Unique Yuvak · 30 days"
                  value={stats.distinct30}
                  unit="Contacted"
                />
                <Kpi
                  label="Yuva Seva Yesterday"
                  value={stats.yesterday}
                  unit="Follow-up records"
                />
                <Kpi
                  label="Yuva Seva On Field"
                  value={totals.total_distinct_followup_yesterday ?? 0}
                  unit="Follow-ups active"
                />
                <Kpi
                  label="Yuva Seva Rate"
                  value={`${stats.members ? Math.round((stats.distinct30 / stats.members) * 100) : 0}%`}
                  unit="30-day reach"
                />
              </View>
              {visibleRows.length > 25 ? (
                <TextInput
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search member name"
                  placeholderTextColor={C.faint}
                  style={styles.search}
                />
              ) : null}
              {visibleRows.length ? (
                visibleRows.map(row => (
                  <MemberRow
                    key={row.user_id || row.user_name}
                    row={row}
                    canAdd={canAdd}
                    showAssigned={hasOthers && scope !== 'mine'}
                    showSabha={showSabha}
                    onHistory={() => viewHistory(row)}
                    onAdd={() => openAdd(row)}
                  />
                ))
              ) : (
                <Text style={styles.stateText}>No members need follow-up.</Text>
              )}
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
      <SiteFooter />
      <Modal
        isOpen={Boolean(openHistory)}
        onClose={() => {
          setOpenHistory(null);
          setHistory(null);
        }}
        title={`Recent meets · ${openHistory?.user_name || 'Member'}`}
        description={
          history && !history.error && (history.total || 0) > 0
            ? history.total > (history.meets || []).length
              ? `last ${(history.meets || []).length} of ${history.total} meets`
              : `${history.total} ${history.total === 1 ? 'meet' : 'meets'}`
            : undefined
        }
      >
        {history?.error ? (
          <Text style={styles.stateText}>{history.error}</Text>
        ) : history ? (
          <View style={styles.historyList}>
            {(history.meets || []).map((meet, index) => (
              <View key={meet.id || index} style={styles.historyRow}>
                <View style={styles.historyHeader}>
                  <Text style={styles.historyDate}>
                    {dateOnly(meet.date) || meet.date || '—'}
                  </Text>
                  <Text style={styles.historyDot}>·</Text>
                  <Text style={styles.historyMode}>{meet.mode || '—'}</Text>
                  {meet.duration != null ? (
                    <>
                      <Text style={styles.historyDot}>·</Text>
                      <Text style={styles.meta}>{meet.duration} min</Text>
                    </>
                  ) : null}
                  {meet.logged_by ? (
                    <Text style={styles.loggedBy}>by {meet.logged_by}</Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.historyRemark,
                    !meet.remark && styles.noRemark,
                  ]}
                >
                  {meet.remark || 'No description recorded.'}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <ActivityIndicator color={C.navy} />
        )}
      </Modal>
      <Modal
        isOpen={Boolean(adding)}
        onClose={() => !saving && setAdding(null)}
        title={`Add Yuva Seva · ${adding?.user_name || 'Member'}`}
        footer={
          <View style={styles.modalFooter}>
            <Pressable
              disabled={saving}
              onPress={() => setAdding(null)}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              disabled={saving}
              onPress={saveAdd}
              style={styles.submitButton}
            >
              <Text style={styles.submitText}>
                {saving ? 'Saving…' : 'Add Yuva Seva'}
              </Text>
            </Pressable>
          </View>
        }
      >
        <Text style={styles.fieldLabel}>Mode *</Text>
        <View style={styles.modeRow}>
          {['Phone', 'Outside', 'Home'].map(mode => (
            <Pressable
              key={mode}
              onPress={() => setForm(value => ({ ...value, mode }))}
              style={[
                styles.modeOption,
                form.mode === mode && styles.modeSelected,
              ]}
            >
              <Text
                style={[
                  styles.modeText,
                  form.mode === mode && styles.modeTextSelected,
                ]}
              >
                {mode}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.fieldLabel}>Duration (min) *</Text>
        <TextInput
          value={form.duration || ''}
          onChangeText={duration => setForm(value => ({ ...value, duration }))}
          keyboardType="number-pad"
          placeholder="e.g. 30"
          placeholderTextColor={C.faint}
          style={styles.formInput}
        />
        <Text style={styles.fieldLabel}>Date *</Text>
        <TextInput
          value={form.date || ''}
          onChangeText={date => setForm(value => ({ ...value, date }))}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={C.faint}
          style={styles.formInput}
        />
        <Text style={styles.fieldLabel}>Remark</Text>
        <TextInput
          value={form.remark || ''}
          onChangeText={remark => setForm(value => ({ ...value, remark }))}
          placeholder="Follow-up notes (optional)"
          placeholderTextColor={C.faint}
          multiline
          style={[styles.formInput, styles.remarkInput]}
        />
        {formError ? <Text style={styles.formError}>{formError}</Text> : null}
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.background },
  flex: { flex: 1 },
  content: { padding: 18, gap: 12 },
  title: { color: C.navy, fontSize: 26, fontWeight: '800' },
  subtitle: { color: C.muted, lineHeight: 20 },
  scopeToggle: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    padding: 2,
    backgroundColor: C.surface,
  },
  scopeOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  scopeSelected: { backgroundColor: C.navy },
  scopeText: { color: C.muted, fontWeight: '600', fontSize: 13 },
  scopeTextSelected: { color: C.surface },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpi: {
    width: '31%',
    minWidth: 100,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 10,
  },
  kpiLabel: { color: C.muted, fontSize: 11, lineHeight: 14 },
  kpiValue: { color: C.navy, fontSize: 22, fontWeight: '800', marginTop: 6 },
  kpiUnit: { color: C.faint, fontSize: 10, marginTop: 2 },
  search: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: C.navy,
  },
  memberCard: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 14,
    overflow: 'hidden',
  },
  memberHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  priorityDot: { width: 10, height: 10, borderRadius: 5 },
  memberMain: { flex: 1, minWidth: 0 },
  memberNameLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  memberName: { color: C.navy, fontSize: 15, fontWeight: '700' },
  compact: { color: C.muted, fontSize: 12, marginTop: 3 },
  never: { color: C.red, fontWeight: '700' },
  tag: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  youTag: {
    color: C.accent,
    backgroundColor: '#FFF0E5',
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  sabhaTag: {
    color: C.navy,
    backgroundColor: '#E6EEF5',
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: 120,
  },
  memberDetails: {
    borderTopWidth: 1,
    borderTopColor: C.border,
    padding: 14,
    gap: 8,
  },
  fact: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  factLabel: { color: C.muted, fontSize: 12 },
  factValue: {
    color: C.navy,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 1,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 5,
  },
  secondaryText: { color: C.navy, fontWeight: '700' },
  addButton: {
    borderWidth: 1,
    borderColor: '#FFB27C',
    borderRadius: 9,
    paddingVertical: 10,
    alignItems: 'center',
  },
  addText: { color: C.accent, fontWeight: '700' },
  state: { alignItems: 'center', gap: 10, padding: 28 },
  stateText: { color: C.muted, textAlign: 'center' },
  retry: { color: C.navy, fontWeight: '700' },
  historyList: { gap: 10 },
  historyRow: {
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingBottom: 10,
    gap: 3,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  historyDate: { color: C.navy, fontSize: 12, fontWeight: '700' },
  historyDot: { color: C.muted, fontSize: 12 },
  historyMode: {
    color: C.navy,
    backgroundColor: '#E6EEF5',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 11,
    fontWeight: '700',
  },
  loggedBy: { color: C.muted, fontSize: 11, marginLeft: 'auto' },
  historyRemark: { color: C.navy, fontSize: 14, marginTop: 8 },
  noRemark: { color: C.muted, fontStyle: 'italic' },
  modalFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    flexWrap: 'wrap',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  cancelText: { color: C.navy, fontWeight: '700' },
  submitButton: {
    backgroundColor: C.accent,
    borderRadius: 9,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  submitText: { color: C.surface, fontWeight: '700' },
  fieldLabel: { color: C.navy, fontSize: 13, fontWeight: '700', marginTop: 8 },
  modeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginTop: 6 },
  modeOption: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  modeSelected: { backgroundColor: C.navy, borderColor: C.navy },
  modeText: { color: C.navy, fontWeight: '600' },
  modeTextSelected: { color: C.surface },
  formInput: {
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 9,
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: C.navy,
    marginTop: 6,
  },
  remarkInput: { minHeight: 80, textAlignVertical: 'top' },
  formError: { color: C.red, fontSize: 12, marginTop: 8 },
  meta: { color: C.muted, fontSize: 13 },
});
