import { useMemo, useState } from 'react';
import { User, Users } from 'lucide-react';
import { Button, ErrorState, Skeleton } from '../ui';
import { Combobox, FormField, Select } from '../form';
import { useMandalUsers } from '../../hooks';
import { pickRows, toOptions } from '../../utils/options';
import { FIELD_CLASS, headRelationIdFrom, isHeadRelation } from './shared';

/**
 * The member's family — `GET /api/v1/users/{id}/family`, written through
 * `POST` / `DELETE /api/v1/users/{id}/family-member`.
 *
 * A family is a real record with exactly one head, not a list of names on this
 * member. Two consequences show up in the UI:
 *
 *   - A member with no family yet has one founded for them, with themselves as
 *     its head, the first time a relative is linked. The form says so before it
 *     happens rather than after.
 *   - The head cannot be removed while anyone else remains — the backend
 *     refuses it — so that row offers no Remove link at all.
 *
 * Two modes, decided by `pending`:
 *
 *   persisted  the member exists, so every change is a request and the list is
 *              whatever `query` returned
 *   pending    the member does not exist yet, so the rows are held by the page
 *              and posted after the create — the same shape the Education and
 *              Job steps use before there is an id to write against
 */

/** A member row's own id, under either spelling the API might use. */
const idOf = (row) => row?.user_id ?? row?.id;

function Avatar({ src }) {
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-white">
      {src
        ? <img src={src} alt="" className="h-full w-full object-cover" />
        : <User className="h-5 w-5" fill="currentColor" strokeWidth={0} />}
    </span>
  );
}

/** Nothing linked yet — the state a new member starts in. */
function EmptyFamily({ message }) {
  return (
    <div className="rounded-control border border-line-soft px-6 py-10 text-center">
      <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-50">
        <Users className="h-6 w-6 text-text-muted" />
      </span>
      <p className="mt-4 font-display text-base font-bold text-primary">No family linked yet</p>
      <p className="mt-1 text-sm text-text-muted">{message}</p>
    </div>
  );
}

/**
 * `ensureMember` resolves to the id to link against, creating the member first
 * if the add form has not saved one yet. Called when the add-family form is
 * submitted — never when it is merely opened.
 */
export default function FamilyRoster({
  query, userId, relations, mutations, onError, ensureMember, busy: pageBusy = false,
  /**
   * Whether this member may take themselves out of the family. False on a page
   * about someone else — nobody should be able to remove a person from their
   * own family from a form about them — but true on your own profile, where
   * leaving a family you were added to is yours to decide. The backend allows
   * it either way; this is only about whose screen is asking.
   */
  allowSelfRemove = false,
  /**
   * View only — the list, and nothing that changes it. The member form is
   * read-only here: a family is a relationship between two people, and the
   * screen that owns it is each of their own profiles, not a form about one of
   * them.
   */
  readOnly = false,
}) {
  const family = query?.data ?? null;
  // `family_id: 0` is how the API says "no family", not a real id.
  const familyId = Number(family?.family_id) || null;
  const members = pickRows(family?.members ?? family);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ member: '', relation: '' });
  const [touched, setTouched] = useState(false);
  /**
   * What the last save came back with. Shown under the Family Member field
   * because that is what these refusals are about — "already assigned to the
   * family of X", "must be in the same Mandal". A toast says it once and then
   * takes it away while the form is still open on the choice that caused it.
   */
  const [saveError, setSaveError] = useState(null);

  // Who can be linked in. The roster names people, so the picker searches the
  // same directory the rest of the app does rather than inventing a source.
  // Rows come back keyed `user_id`; `id` is read too in case that ever changes.
  const candidatesQ = useMandalUsers(open);
  const linked = new Set(members.map((m) => String(idOf(m))));
  const candidates = useMemo(
    () =>
      pickRows(candidatesQ.data)
        .filter((r) => idOf(r) != null && String(idOf(r)) !== String(userId) && !linked.has(String(idOf(r))))
        .map((r) => ({
          value: String(idOf(r)),
          label: r.user_name ?? r.name ?? String(idOf(r)),
          meta: r.mobile_number ?? '',
        })),
    [candidatesQ.data, userId, members]
  );

  // "Family Head" is not offered as a relation: it is what founding a family
  // grants, and the API rejects it for anyone joining an existing one.
  const relationRows = pickRows(relations?.data).filter((r) => !isHeadRelation(r?.name));
  const relationOptions = toOptions(relationRows);
  const headRelationId = headRelationIdFrom(relations);

  const busy = mutations?.isPending || pageBusy;

  const closeForm = () => {
    setOpen(false);
    setDraft({ member: '', relation: '' });
    setTouched(false);
    setSaveError(null);
  };

  const submit = async () => {
    if (busy) return;
    if (!draft.member || !draft.relation) { setTouched(true); return; }
    setSaveError(null);
    try {
      // The link needs a member to hang off. On the add form there is none yet,
      // so this is where the record gets created — the page reports anything
      // that goes wrong with it and lands on the step that needs fixing.
      const subjectId = userId ?? (await ensureMember?.());
      if (!subjectId) return;

      await mutations.add.mutateAsync({
        subjectId,
        memberUserId: draft.member,
        relationId: draft.relation,
        familyId,
        headRelationId,
      });
      closeForm();
    } catch (err) {
      // The form stays open on the choice that was refused, with the reason
      // under it. The page still hears about it for anything it wants to do.
      setSaveError(err?.message ?? 'Could not save this family member.');
      onError?.(err);
    }
  };

  const removeMember = async (memberUserId) => {
    if (busy) return;
    try {
      await mutations.remove.mutateAsync({ subjectId: userId, memberUserId });
    } catch (err) {
      onError?.(err);
    }
  };

  if (query?.isLoading) {
    return <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  }
  if (query?.error) {
    return <ErrorState error={query.error} onRetry={query.refetch} title="Could not load the family" />;
  }

  return (
    <div className="space-y-3">
      {members.length === 0 && !open ? (
        <EmptyFamily
          message={
            readOnly
              ? 'This member has no family linked yet.'
              : userId
                ? 'Add the first relative to start this user’s family tree.'
                : 'Add the first relative to start this user’s family tree. Saving it creates the member.'
          }
        />
      ) : members.length > 0 && (
        <div className="rounded-control border border-line-soft p-4">
          <div className="mb-1 flex items-center justify-between gap-3">
            <p className="eyebrow">Family</p>
            {/* The relatives, which is what was added here — the member whose
                screen this is counts as the subject, not as one of them. */}
            <span className="rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-semibold text-text-muted">
              {relativeCount(members, userId)}
            </span>
          </div>

          <ul className="divide-y divide-line-soft">
            {members.map((m, i) => {
              const name = m.user_name ?? m.name ?? '—';
              const relation = m.relation_name ?? m.relation ?? null;
              const isHead = isHeadRelation(relation);
              // The member whose page this is, labelled rather than listed as
              // someone who could be removed from it.
              const isSelf = String(idOf(m) ?? '') === String(userId);

              return (
                <li key={m.id ?? `${name}-${i}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar src={m.photo_url} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-primary">{name}</p>
                      {isHead && <p className="truncate text-xs text-text-muted">Family Head</p>}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {isSelf && (
                      <span className="rounded-full bg-accent/10 px-2.5 py-1 text-[11px] font-semibold text-accent">
                        This user
                      </span>
                    )}
                    {!isSelf && relation && !isHead && (
                      <span className="rounded-full bg-primary-50 px-2.5 py-1 text-[11px] font-semibold text-text-muted">
                        {relation}
                      </span>
                    )}
                    {/* One action per row: unlink. The head is never offered it
                        while the family has anyone else in it — the API refuses
                        to remove a head — and neither is the member whose record
                        this is. A relation is changed by removing and re-adding,
                        since the API has no update for a membership. */}
                    {!readOnly && (!isSelf || allowSelfRemove) && !isHead && (
                      <button
                        type="button"
                        onClick={() => removeMember(idOf(m))}
                        disabled={busy}
                        className="text-sm font-semibold text-danger-fg transition-colors hover:underline disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {readOnly ? null : open ? (
        <div className="space-y-4 rounded-control border border-line-soft p-4">
          {/* The brand's amber, not the danger red: founding a family is what
              is meant to happen here, it is just worth saying out loud. */}
          {!familyId && (
            <p className="rounded-control border border-accent/30 bg-accent/5 px-4 py-3 text-sm text-accent-hover">
              This member has no family yet — adding the first relative will create their
              family with <strong className="font-bold">this member as the Family Head</strong>.
            </p>
          )}

          <FormField
            label="Family Member"
            htmlFor="fam-member"
            required
            compact
            error={(touched && !draft.member ? 'Please select a member.' : null) ?? saveError}
          >
                        <Combobox
              id="fam-member"
              placement="inline"
              value={draft.member}
              onChange={(v) => { setDraft((d) => ({ ...d, member: v })); setTouched(true); }}
              options={candidates}
              disabled={busy || candidatesQ.isLoading}
              error={Boolean(touched && !draft.member) || Boolean(saveError)}
              placeholder={candidatesQ.isLoading ? 'Loading…' : 'Search Mandal users…'}
              emptyLabel="No one matches that name or number."
            />
          </FormField>

          <FormField
            label="Relation"
            htmlFor="fam-relation"
            required
            compact
            error={touched && !draft.relation ? 'Please select a relation.' : null}
          >
            <Select
              id="fam-relation"
              className={FIELD_CLASS}
              error={touched && !draft.relation}
              value={draft.relation}
              onChange={(e) => { setDraft((d) => ({ ...d, relation: e.target.value })); setTouched(true); }}
              disabled={busy || relations?.isLoading}
              placeholder={relations?.isLoading ? 'Loading…' : 'Select relation'}
              options={relationOptions}
            />
          </FormField>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={closeForm} disabled={busy}>Cancel</Button>
            <Button
              variant="accent"
              onClick={submit}
              busy={busy}
              disabled={!draft.member || !draft.relation}
            >
              Save
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-control border border-dashed border-line-strong px-4 py-4 text-sm font-semibold text-primary transition-colors hover:bg-primary-50"
        >
          + Add family member
        </button>
      )}
    </div>
  );
}

/** "1 member" / "3 members", counting the relatives rather than the subject. */
function relativeCount(members, userId) {
  const n = members.filter((m) => String(idOf(m) ?? '') !== String(userId)).length;
  return `${n} member${n === 1 ? '' : 's'}`;
}
