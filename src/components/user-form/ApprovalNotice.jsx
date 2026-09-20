import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../Typography';
import { REQUEST_FIELDS } from '../../utils/selfUpdate';
import { formatCell, humanize } from '../../utils/format';
import { COLORS, RADII, WEIGHT, space } from '../../constants/theme';

// Editing your OWN record, some fields are proposals rather than edits: a
// Sabha-level approver reviews them and the `users` row is not touched until
// they act. Nothing here is shown to someone editing SOMEBODY ELSE's record.

const WARNING_BG = '#FFFBEB';
const WARNING_BORDER = '#FDE68A';
const WARNING_FG = '#B45309';
const WARNING_BADGE = '#FEF3C7';

const NAME_FIELDS = ['first_name', 'middle_name', 'last_name'];

export const APPROVAL_FIELDS_BY_TAB = {
  personal: REQUEST_FIELDS.filter(f => NAME_FIELDS.includes(f)),
  address: REQUEST_FIELDS.filter(f => !NAME_FIELDS.includes(f)),
};

export const APPROVAL_NOTICE_BY_TAB = {
  personal:
    'Name changes (First / Middle / Last) require approval from your sabha ' +
    'leadership before they take effect.',
  address:
    'All address changes (including City / State / Country auto-resolved from ' +
    'pincode) require approval from your sabha leadership before they take effect.',
};

/** Does this field go through approval on a self-edit? */
export const needsApproval = name => REQUEST_FIELDS.includes(name);

/** The pill beside a field's label — an aside about the field, not a shout. */
export function NeedsApprovalBadge() {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>needs approval</Text>
    </View>
  );
}

/** The step-level explanation, above the fields it is about. */
export function ApprovalNotice({ children }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  );
}

/**
 * The open request, if there is one. Only ever one: the endpoint refuses a
 * second while one is pending, so this is a card rather than a list.
 */
export function PendingApprovalCard({ request, onCancel, cancelling = false }) {
  if (!request) return null;

  const fields = String(request.fields_changed ?? '')
    .split(',')
    .map(f => f.trim())
    .filter(Boolean);

  // formatCell, not String(): a cleared field arrives as null and has to read
  // as an em dash rather than as the word "null".
  const requested = f =>
    formatCell(request.new_data_names?.[f] ?? request.new_data?.[f]);

  return (
    <View style={styles.notice}>
      <View style={styles.pendingRow}>
        <View style={styles.pendingCopy}>
          <Text style={styles.pendingTitle}>
            PENDING APPROVAL ({fields.length || 1})
          </Text>
          <Text style={styles.pendingLead}>Fields awaiting approval:</Text>
          {fields.length ? (
            <View style={styles.pendingList}>
              {fields.map(f => (
                <View key={f} style={styles.pendingItem}>
                  <Text style={styles.pendingLabel}>{humanize(f)}:</Text>
                  <Text style={styles.pendingValue}>{requested(f)}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={styles.pendingValue}>Your submitted changes</Text>
          )}
        </View>

        {/* Cancelling withdraws the request; nothing was written to the
            member's row in the first place. */}
        <Pressable
          accessibilityRole="button"
          onPress={onCancel}
          disabled={cancelling}
          style={cancelling ? styles.cancelDisabled : undefined}
        >
          <Text style={styles.cancel}>
            {cancelling ? 'Cancelling…' : 'Cancel'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexShrink: 0,
    borderRadius: RADII.lg,
    backgroundColor: WARNING_BADGE,
    paddingHorizontal: space(2.5),
    paddingVertical: space(1),
  },
  badgeText: { fontSize: 11, color: WARNING_FG },

  notice: {
    borderRadius: RADII.card,
    borderWidth: 1,
    borderColor: WARNING_BORDER,
    backgroundColor: WARNING_BG,
    paddingHorizontal: space(5),
    paddingVertical: space(4),
  },
  noticeText: { fontSize: 11.8, lineHeight: 19, color: WARNING_FG },

  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space(4),
  },
  pendingCopy: { flex: 1 },
  pendingTitle: {
    fontSize: 13.125,
    fontWeight: WEIGHT.bold,
    letterSpacing: 0.5,
    color: WARNING_FG,
  },
  pendingLead: {
    marginTop: space(3),
    fontSize: 13.125,
    color: COLORS.textMuted,
  },
  pendingList: { marginTop: space(1), gap: space(1) },
  pendingItem: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    columnGap: space(2),
  },
  pendingLabel: { fontSize: 13.125, color: COLORS.textMuted },
  pendingValue: {
    flexShrink: 1,
    fontSize: 13.125,
    fontWeight: WEIGHT.bold,
    color: COLORS.primary,
  },
  cancel: {
    fontSize: 13.125,
    fontWeight: WEIGHT.bold,
    color: COLORS.dangerFg,
  },
  cancelDisabled: { opacity: 0.5 },
});
