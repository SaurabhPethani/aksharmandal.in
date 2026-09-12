import { REQUEST_FIELDS } from '../../utils/selfUpdate';
import { formatCell, humanize } from '../../utils/format';

// Editing your OWN record, some fields are proposals rather than edits: a
// Sabha-level approver reviews them and the `users` row is not touched until
// they act. See utils/selfUpdate.js, which owns the list and the routing.
//
// Nothing here is shown to someone editing SOMEBODY ELSE's record. For them
// these fields save immediately and an "awaiting approval" note would be a
// statement about a workflow they are not in.

/**
 * Which approval-gated fields each step holds, keyed by the tab's own key.
 *
 * Derived from REQUEST_FIELDS rather than restated, so a field moving in or out
 * of the approval set cannot leave a badge behind on a field that now saves
 * directly — the worse of the two failures, since it would tell a member their
 * change is pending when nothing is.
 */
const NAME_FIELDS = ['first_name', 'middle_name', 'last_name'];

export const APPROVAL_FIELDS_BY_TAB = {
  personal: REQUEST_FIELDS.filter((f) => NAME_FIELDS.includes(f)),
  address: REQUEST_FIELDS.filter((f) => !NAME_FIELDS.includes(f)),
};

/**
 * The banner each step opens with — said once, up front, rather than only after
 * a save comes back as "sent for approval".
 *
 * The address wording names City / State / Country explicitly because those
 * three are filled by the PIN-code lookup rather than typed: without saying so,
 * a member who only picked an Area would not connect the approval to anything
 * they did.
 */
export const APPROVAL_NOTICE_BY_TAB = {
  personal:
    'Name changes (First / Middle / Last) require approval from your sabha '
    + 'leadership before they take effect.',
  address:
    'All address changes (including City / State / Country auto-resolved from '
    + 'pincode) require approval from your sabha leadership before they take effect.',
};

/** Does this field go through approval on a self-edit? */
export const needsApproval = (name) => REQUEST_FIELDS.includes(name);

/**
 * The pill beside a field's label.
 *
 * Lower case, deliberately. It is an aside about the field, not a status the
 * field is in — SHOUTING it would compete with the label it belongs to.
 * `whitespace-nowrap` because it shares a line with that label and wrapping to
 * "needs / approval" over two lines drags the input down with it.
 */
export function NeedsApprovalBadge() {
  return (
    // `!text-[11px]`: `.content-type` would step a plain `text-[11px]` up to
    // 12.33px, so the `!` override is what holds it a point below that. See the
    // note on ApprovalNotice below for why an override rather than an unlisted
    // size. Normal weight — bold made it as loud as the label it annotates.
    <span className="shrink-0 whitespace-nowrap rounded-md bg-warning-badge px-2.5 py-1 !text-[11px] font-normal leading-none text-warning-fg">
      needs approval
    </span>
  );
}

/**
 * The step-level explanation, above the fields it is about.
 *
 * TWO POINTS SMALLER THAN THE FORM AROUND IT, and `!text-` is how that is asked
 * for rather than an accident. `.content-type` adds 1pt to every text size in
 * the content area (see index.css), so a plain `text-sm` here would match the
 * fields exactly; the `!` variant is the documented way to opt a deliberate
 * local override out of that scale.
 *
 * The arithmetic, in that file's own terms — 1pt = 0.08889rem:
 *
 *   fields    .content-type .text-sm   0.96389rem
 *   here      0.96389 - 2 x 0.08889  = 0.78611rem
 *
 * Written as an override instead of an unlisted arbitrary size on purpose: an
 * unlisted size would land a point smaller by OMISSION, and the next person
 * reading index.css would correctly "fix" it by adding it to the scale.
 *
 * Normal weight. This is an aside about the step, and bold made it read as the
 * heading of one.
 */
export function ApprovalNotice({ children }) {
  return (
    <div className="rounded-card border border-warning-border bg-warning-bg px-5 py-4">
      <p className="!text-[0.78611rem] font-normal leading-relaxed text-warning-fg">{children}</p>
    </div>
  );
}

/**
 * The open request, if there is one.
 *
 * Only ever one: the endpoint refuses a second while one is pending (409), so
 * this is a single card rather than a list. The count is still shown — it is
 * what the member is being told is outstanding, and reads as a queue they can
 * act on rather than as a state they are stuck in.
 *
 * `fields_changed` arrives as the API's own column names — an array, or a
 * comma-separated string on older responses; `String()` flattens both to
 * `flat_no,street_name`. They are humanised for display: every other message in
 * this app names a field the way the form labels it, and a member has no reason
 * to know what a column is called.
 *
 * EACH FIELD IS SHOWN WITH THE VALUE THAT WAS REQUESTED, from `new_data`. A bare
 * list of names told the member WHICH of their fields is waiting but not WHAT
 * they had asked it to become — and since the form goes on showing the
 * still-current value underneath, "First Name" alone reads as though the request
 * had lost their edit. `new_data_names` carries a resolved label wherever the
 * column held an id; it is usually empty, so the raw value is the fallback.
 * Same pairing the approver sees on their own queue (see ApprovalCards).
 */
export function PendingApprovalCard({ request, onCancel, cancelling = false }) {
  if (!request) return null;

  const fields = String(request.fields_changed ?? '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);

  // formatCell, not String(): a cleared field arrives as null and has to read as
  // an em dash rather than as the word "null".
  const requested = (f) => formatCell(request.new_data_names?.[f] ?? request.new_data?.[f]);

  return (
    <div className="rounded-card border border-warning-border bg-warning-bg px-5 py-4">
      {/* `items-center`, so Cancel sits against the middle of the block rather
          than riding up level with the heading. */}
      {/* Every line here is `!text-[0.875rem]` — Tailwind's own `text-sm`, which
          is a point below the `.content-type` version the form around it gets.
          Same override mechanism, and the same reason, as ApprovalNotice above. */}
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="!text-[0.875rem] font-bold uppercase tracking-wide text-warning-fg">
            Pending approval ({fields.length || 1})
          </h3>
          <p className="mt-3 !text-[0.875rem] text-text-muted">Fields awaiting approval:</p>
          {fields.length ? (
            /* One row per field: the name in muted text, the requested value in
               bold beside it. `items-baseline` keeps the two sitting on the same
               line even when a long value wraps, and `flex-wrap` lets the value
               drop below its own label on a narrow phone rather than squeezing
               the label into a column of single characters. */
            <dl className="mt-1 space-y-1">
              {fields.map((f) => (
                <div key={f} className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="!text-[0.875rem] text-text-muted">{humanize(f)}:</dt>
                  <dd className="min-w-0 break-words !text-[0.875rem] font-bold text-primary">
                    {requested(f)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-0.5 break-words !text-[0.875rem] font-bold text-primary">
              Your submitted changes
            </p>
          )}
        </div>
        {/* Cancelling withdraws the request; it does not undo anything, since
            nothing was written to the member's row in the first place. */}
        <button
          type="button"
          onClick={onCancel}
          disabled={cancelling}
          className="shrink-0 !text-[0.875rem] font-bold text-danger-fg underline-offset-2 hover:underline disabled:opacity-50"
        >
          {cancelling ? 'Cancelling…' : 'Cancel'}
        </button>
      </div>
    </div>
  );
}
