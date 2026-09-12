import { useState } from 'react';
import FormDialog from '../FormDialog';
import { READ_ONLY_INFO_FIELDS } from '../../services/approvalsService';
import { displayValue, humanizeField } from './ApprovalCards';

/**
 * The three dialogs the Approvals screen opens.
 *
 * All of them collect one thing — a note or a reason — so they share FormDialog
 * rather than each inventing a layout. The difference that matters is whether
 * the text is REQUIRED: a rejection must say why, an approval need not.
 */

const AREA = 'input-field min-h-[7rem] resize-y';

/** Approve, or cancel, with an optional note. */
export function RemarkDialog({
  isOpen, title, label = 'Remarks', optional = true, submitLabel = 'Confirm',
  busy, error, onClose, onConfirm,
}) {
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState(null);

  const close = () => { if (!busy) { setText(''); setLocalError(null); onClose(); } };

  const submit = () => {
    const trimmed = text.trim();
    if (!optional && !trimmed) {
      setLocalError(`${label} is required.`);
      return;
    }
    setLocalError(null);
    onConfirm(trimmed);
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={close}
      title={title}
      submitLabel={submitLabel}
      // Disabled until a required reason is typed, so the button never invites
      // a request the backend will refuse.
      submitDisabled={!optional && !text.trim()}
      onSubmit={submit}
      busy={busy}
      error={localError ?? error}
      size="md"
    >
      <div>
        <label htmlFor="approval-remark" className="mb-1.5 block text-sm font-semibold text-primary">
          {label}{' '}
          {optional && <span className="font-normal text-text-muted">(optional)</span>}
        </label>
        <textarea
          id="approval-remark"
          className={AREA}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={optional ? 'Add a note (optional)…' : 'Enter reason…'}
          autoFocus
        />
      </div>
    </FormDialog>
  );
}

/**
 * Edit & Approve — correct what was submitted, then approve.
 *
 * Only fields the approver actually changed are sent as `overrides`. The
 * endpoint applies them relative to the requester's submission, so posting the
 * whole form back would overwrite fields nobody touched.
 *
 * Address-master fields (country / state / city) are resolved from the pincode
 * server-side and are shown read-only: a hand-typed city would disagree with the
 * pincode it came from.
 */
export function EditApproveDialog({ request, isOpen, busy, error, onClose, onConfirm }) {
  const fields = request?.fields_changed ?? [];
  const editable = fields.filter((f) => !READ_ONLY_INFO_FIELDS.has(f));
  const readOnly = fields.filter((f) => READ_ONLY_INFO_FIELDS.has(f));

  const initial = Object.fromEntries(
    editable.map((f) => [f, displayValue(request?.new_data?.[f]) === '—' ? '' : String(request?.new_data?.[f] ?? '')])
  );

  const [values, setValues] = useState(initial);
  const [remarks, setRemarks] = useState('');

  const close = () => { if (!busy) onClose(); };

  const submit = () => {
    const overrides = {};
    for (const f of editable) {
      const next = String(values[f] ?? '').trim();
      const submitted = String(request?.new_data?.[f] ?? '').trim();
      if (next !== submitted) overrides[f] = next;
    }
    onConfirm({ overrides, remarks: remarks.trim() });
  };

  return (
    <FormDialog
      isOpen={isOpen}
      onClose={close}
      title="Edit & Approve Information Change"
      description="Adjust any requested value before approving. Address-master fields (country / state / city) are read-only here."
      submitLabel="Save & Approve"
      onSubmit={submit}
      busy={busy}
      error={error}
      size="md"
    >
      {editable.map((f) => (
        <div key={f}>
          <label htmlFor={`edit-${f}`} className="mb-1.5 block text-sm font-semibold text-primary">
            {humanizeField(f)}
          </label>
          <input
            id={`edit-${f}`}
            className="input-field"
            value={values[f] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
            autoComplete="off"
          />
          {/* What the record says today, so the approver can see what is being
              replaced without closing the dialog. */}
          <p className="mt-1 text-xs text-text-muted">
            Original: {displayValue(request?.old_data_names?.[f] ?? request?.old_data?.[f])}
          </p>
        </div>
      ))}

      {readOnly.map((f) => (
        <div key={f}>
          <label className="mb-1.5 block text-sm font-semibold text-primary">{humanizeField(f)}</label>
          <p className="rounded-control border border-line-soft bg-bg px-4 py-2.5 text-sm text-text-muted">
            {displayValue(request?.new_data_names?.[f] ?? request?.new_data?.[f])}
            <span className="ml-2 text-xs">(from pincode)</span>
          </p>
        </div>
      ))}

      <div>
        <label htmlFor="edit-remarks" className="mb-1.5 block text-sm font-semibold text-primary">
          Remarks <span className="font-normal text-text-muted">(optional)</span>
        </label>
        <textarea
          id="edit-remarks"
          className={AREA}
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          placeholder="Add a note (optional)…"
        />
      </div>
    </FormDialog>
  );
}
