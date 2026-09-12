import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Modal } from '../Overlays';
import { Button } from '../ui';
import { FormField, Select } from '../form';
import { useMandals, useProfile, useQuickTransfer, useSabhas, useToast } from '../../hooks';
import { toOptions } from '../../utils/options';

/**
 * Transfer a member — `POST /notifications/transfer-request`.
 *
 * TWO KINDS, and `type` is what tells them apart:
 *
 *   sabha   another Sabha inside the member's OWN Mandal. Only the Sabha is
 *           chosen; Pradesh and Mandal come from the member's record.
 *   mandal  another Mandal inside the member's own Pradesh, and a Sabha within
 *           whichever Mandal was picked.
 *
 * `TransferRequestCreate` requires `user_id`, `type` and `to_pradesh_id`;
 * `to_mandal_id` is wanted for both, and `to_sabha_id` is mandatory for a Sabha
 * transfer and optional for a Mandal one. This dialog sends a Sabha for both,
 * because landing a member in a Mandal without one leaves them somewhere no
 * attendance list reaches — the exception is a destination Mandal that has no
 * Sabhas yet, where the API's own tolerance is what lets the request through.
 *
 * It REQUESTS the move rather than making it: a `requested` record goes to the
 * destination side's queue, so nothing about the member changes here and the
 * row behind the dialog is left showing where they still are.
 *
 * ONE dialog, opened from two places: the row icon on the members list and the
 * Transfer button on a member's page. Same fields, same submit, same result —
 * only the grant that reveals each button differs (QUICK_TRANSFER on the list,
 * CREATE on the member page), which is the caller's business, not this
 * component's.
 *
 * THE PLACEMENT IDS ARE NOT ON THE LIST ROW. GET /users/list returns only
 * `id, user_name, mobile_number, status, role_name, followup_by_id_name,
 * sabha_name` — no pradesh_id, mandal_id or sabha_id — so the member's record is
 * fetched when the dialog opens (GET /users/{id}, already cached by the details
 * page) and every destination call is held until it answers. Reading
 * `member.mandal_id` straight off the row left the queries permanently disabled
 * and the dropdowns permanently empty.
 *
 * While the write is in flight the dialog is sealed (no Escape, no backdrop
 * click, no close button) and both buttons are disabled, so a double submit is
 * impossible.
 */

const MODES = [
  { key: 'sabha', label: 'Sabha Transfer', hint: 'Another Sabha in the same Mandal' },
  { key: 'mandal', label: 'Mandal Transfer', hint: 'Another Mandal in the same Pradesh' },
];

export default function QuickTransferDialog({ member, onClose }) {
  const toast = useToast();
  const transfer = useQuickTransfer();

  const [mode, setMode] = useState('sabha');
  const [mandalId, setMandalId] = useState('');
  const [sabhaId, setSabhaId] = useState('');
  const [touched, setTouched] = useState(false);

  const isOpen = Boolean(member);
  // Opened from a list row (`id`), from a directory row (`user_id`) or from a
  // member's own record — all three spell it differently.
  const memberId = member?.user_id ?? member?.id ?? null;

  const recordQ = useProfile(memberId);
  const record = recordQ.data;
  const pradeshId = record?.pradesh_id ?? member?.pradesh_id ?? null;
  const homeMandalId = record?.mandal_id ?? member?.mandal_id ?? null;
  const currentSabhaId = record?.sabha_id ?? member?.sabha_id ?? null;

  const isMandalMode = mode === 'mandal';

  /**
   * Which Mandal the Sabha list belongs to.
   *
   * The member's own on a Sabha transfer, and whichever was picked on a Mandal
   * transfer — one query serving both, so the Sabha dropdown reloads by itself
   * when the destination Mandal changes.
   */
  const destMandalId = isMandalMode ? mandalId : homeMandalId;

  // Only fetched in Mandal mode: a Sabha transfer never offers a Mandal choice,
  // so asking for the list would be a request nothing renders.
  const mandalQ = useMandals(pradeshId, isOpen && isMandalMode && Boolean(pradeshId));
  // Held until the Mandal is known: useSabhas falls back to the unscoped list
  // when handed no id, which would offer Sabhas from every other Mandal.
  const sabhaQ = useSabhas(destMandalId, isOpen && Boolean(destMandalId));

  // Reset per member, so reopening on a different row never inherits the last
  // selection or a stale validation state.
  useEffect(() => {
    setMode('sabha');
    setMandalId('');
    setSabhaId('');
    setTouched(false);
  }, [memberId]);

  const switchMode = (key) => {
    if (key === mode) return;
    setMode(key);
    // Both selections belong to the mode that made them: a Sabha chosen inside
    // the member's own Mandal is not a valid destination once the Mandal is
    // being changed, and carrying it over would submit a mismatched pair.
    setMandalId('');
    setSabhaId('');
    setTouched(false);
  };

  const chooseMandal = (value) => {
    setMandalId(value);
    // The Sabha list is about to become a different list.
    setSabhaId('');
    setTouched(true);
  };

  // `mandal_name` / `sabha_name` are named explicitly rather than discovered:
  // the rows also carry the names of the levels above, and which one discovery
  // picks depends on key order.
  const mandalOptions = toOptions(mandalQ.data, { labelKey: 'mandal_name' }).filter(
    // Their own Mandal is not a destination for a Mandal transfer.
    (o) => String(o.value) !== String(homeMandalId ?? '')
  );
  const sabhaOptions = toOptions(sabhaQ.data, { labelKey: 'sabha_name' }).filter(
    // Their current Sabha is not a destination — but only within their own
    // Mandal. In another Mandal it is a different Sabha that happens to share
    // no id, so nothing is excluded there.
    (o) => isMandalMode || String(o.value) !== String(currentSabhaId ?? '')
  );

  const busy = transfer.isPending;
  // Fetching the record is part of loading the destinations, as far as the
  // dropdowns are concerned — it is the step that produces the ids.
  const recordLoading = recordQ.isLoading;
  const mandalsLoading = recordLoading || mandalQ.isLoading;
  const mandalsError = recordQ.error || mandalQ.error;
  const sabhasLoading = recordLoading || sabhaQ.isLoading;
  const sabhasError = recordQ.error || sabhaQ.error;

  // A destination Mandal with no Sabhas at all is the one case where the API's
  // "optional for a Mandal transfer" applies — there is nothing to choose.
  const noSabhasHere =
    isMandalMode && Boolean(mandalId) && !sabhasLoading && !sabhasError && sabhaOptions.length === 0;

  const missingMandal = touched && isMandalMode && !mandalId;
  const missingSabha = touched && !sabhaId && !noSabhasHere;
  const canSubmit = (!isMandalMode || Boolean(mandalId)) && (Boolean(sabhaId) || noSabhasHere);

  const close = () => {
    if (busy) return;
    onClose();
  };

  const submit = async () => {
    if (busy) return;
    if (!canSubmit) {
      setTouched(true);
      return;
    }
    try {
      const res = await transfer.mutateAsync({
        userId: memberId,
        type: mode,
        // Required for both types, and always the member's own — neither kind
        // of transfer crosses a Pradesh.
        toPradeshId: pradeshId,
        toMandalId: destMandalId,
        // Empty means "not chosen", which only happens for a Mandal with no
        // Sabhas. Passing '' would post `to_sabha_id: 0`.
        toSabhaId: sabhaId || null,
      });
      toast.success(res?.detail || 'Transfer request submitted.');
      onClose();
    } catch (err) {
      // The popup stays open so the selection is not lost and can be retried.
      // api/client.js has already resolved this to presentable wording.
      toast.error(err?.message);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={close}
      dismissible={!busy}
      // `lg` (max-w-2xl), as the other form dialogs use. At `md` the two mode
      // cards and their hint lines wrapped, and the cascading Mandal -> Sabha
      // pair had to stack even on a desktop.
      size="lg"
      title="Transfer Member"
      footer={
        <>
          <Button onClick={close} disabled={busy}>Cancel</Button>
          <Button variant="accent" onClick={submit} busy={busy} disabled={!canSubmit}>
            Send Transfer Request
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="eyebrow">User</p>
          <p className="mt-0.5 text-lg font-bold text-primary">{member?.user_name || '—'}</p>
        </div>

        {/* The record names all three levels; the row only ever names the
            Sabha, so it is the fallback while the record is in flight. */}
        <CurrentPlacement member={record ?? member} />

        <div>
          <p className="eyebrow mb-2">Transfer type</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="tablist">
            {MODES.map((m) => {
              const selected = m.key === mode;
              return (
                <button
                  key={m.key}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  disabled={busy}
                  onClick={() => switchMode(m.key)}
                  className={`rounded-control border-2 px-3.5 py-3 text-left transition-all disabled:opacity-50 ${
                    selected
                      ? 'border-primary bg-primary-50/60 shadow-card'
                      : 'border-line-soft bg-surface hover:border-primary/40'
                  }`}
                >
                  <span className={`block text-sm font-bold leading-snug ${selected ? 'text-primary' : 'text-text-muted'}`}>
                    {m.label}
                  </span>
                  {/* min-h so both cards are the same height whether or not the
                      hint wraps — two buttons of different heights side by side
                      is what made this row look unfinished. */}
                  <span className="mt-0.5 block min-h-[2rem] text-xs leading-snug text-text-faint">
                    {m.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/*
          The destination, as its own panel.

          Grouped rather than left as loose fields under the type cards: the
          type chooser and the destination are two steps, and without an edge
          around the second the dialog read as four unrelated controls stacked.

          NO PER-FIELD HINTS. They were one line under each box, of different
          lengths — so the two columns rendered at different heights and the row
          went ragged the moment one of them wrapped or showed an error. What
          they said is said once, below, where it applies to both.
        */}
        <div className="rounded-control border border-line-soft bg-bg/50 p-4">
          <p className="eyebrow mb-3">Destination</p>

          {/* Side by side on a Mandal transfer, so the cascade reads left to
              right in the order it is filled. A Sabha transfer has one box and
              gives it the full width. */}
          <div className={isMandalMode ? 'grid grid-cols-1 gap-4 sm:grid-cols-2' : undefined}>
            {isMandalMode && (
              <FormField
                label="Mandal"
                htmlFor="qt-mandal"
                required
                compact
                error={missingMandal ? 'Please select a Mandal.' : null}
              >
                <Select
                  id="qt-mandal"
                  value={mandalId}
                  onChange={(e) => chooseMandal(e.target.value)}
                  onBlur={() => setTouched(true)}
                  disabled={busy || mandalsLoading || Boolean(mandalsError)}
                  error={missingMandal}
                  placeholder={
                    mandalsLoading
                      ? 'Loading Mandals…'
                      : mandalsError
                        ? 'Mandal list unavailable'
                        : 'Select Mandal'
                  }
                  options={mandalOptions}
                />
              </FormField>
            )}

            <FormField
              label="Sabha"
              htmlFor="qt-sabha"
              required={!noSabhasHere}
              compact
              error={missingSabha ? 'Please select a Sabha.' : null}
            >
              <Select
                id="qt-sabha"
                value={sabhaId}
                onChange={(e) => { setSabhaId(e.target.value); setTouched(true); }}
                onBlur={() => setTouched(true)}
                disabled={busy || sabhasLoading || Boolean(sabhasError) || (isMandalMode && !mandalId)}
                error={missingSabha}
                placeholder={
                  isMandalMode && !mandalId
                    ? 'Select a Mandal first'
                    : sabhasLoading
                      ? 'Loading Sabhas…'
                      : sabhasError
                        ? 'Sabha list unavailable'
                        : noSabhasHere
                          ? 'No Sabhas in this Mandal yet'
                          : 'Select Sabha'
                }
                options={sabhaOptions}
              />
            </FormField>
          </div>

          <p className="mt-3 text-xs leading-relaxed text-text-muted">
            {isMandalMode
              ? 'Mandals within the user’s current Pradesh, and Sabhas within the Mandal chosen. '
              : 'Only Sabhas within the user’s current Mandal can be chosen. '}
            The member moves once the destination accepts.
          </p>
        </div>
      </div>
    </Modal>
  );
}

/**
 * "Currently in: Pradesh › Mandal › Sabha", from the names the list row already
 * carries — this costs no request. Levels the row does not name are dropped
 * rather than printed as a dash, and with none of them the panel does not render.
 */
function CurrentPlacement({ member }) {
  const trail = [member?.pradesh_name, member?.mandal_name, member?.sabha_name].filter(Boolean);
  if (!trail.length) return null;

  return (
    <div className="rounded-control bg-primary-50 px-3.5 py-2.5 text-sm leading-relaxed text-text-muted">
      Currently in:{' '}
      {trail.map((name, i) => (
        <span key={`${name}-${i}`} className="inline-flex items-center">
          {i > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 shrink-0 text-[#9BB5CB]" />}
          <span className="font-bold text-primary">{name}</span>
        </span>
      ))}
    </div>
  );
}
