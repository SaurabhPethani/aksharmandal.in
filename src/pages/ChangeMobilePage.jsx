import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Search, Check, X, Loader2, Phone } from 'lucide-react';
import { PageHeader, Card, Button, Skeleton, ErrorState } from '../components/ui';
import { Breadcrumbs } from '../components/Navigation';
import { Input, Select } from '../components/form';
import { useToast, useRelations } from '../hooks';
import { userAdminService } from '../services/userAdminService';
import { useMobileChangeLog } from '../hooks/useUserAdmin';
import { isHeadRelation } from '../components/user-form/shared';
import { pickRows, toOptions } from '../utils/options';

// Change a member's login mobile number. Delegable via USER_ADMIN:CHANGE_MOBILE
// (SuperAdmin always); a non-SuperAdmin grantee is clamped by the backend to
// members in their hierarchy scope. Mobile is unique across every Mandal, so
// this is the one place a number is reassigned — find the member by their
// current number, confirm who they are, then set a new one that no other member
// holds. See RequirePermissionOrSuperAdmin in the router.

const digits = (s) => String(s || '').replace(/\D/g, '');
const initials = (name) => String(name || '?').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';
// Pradesh · Mandal · Sabha, skipping any that are missing.
const locality = (m) => [m.pradesh_name, m.mandal_name, m.sabha_name].filter(Boolean).join(' · ');

export default function ChangeMobilePage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const logQ = useMobileChangeLog();

  const [oldMobile, setOldMobile] = useState('');
  const [member, setMember] = useState(null); // null | 'notfound' | member object
  const [finding, setFinding] = useState(false);

  const [newMobile, setNewMobile] = useState('');
  const [avail, setAvail] = useState({ state: 'idle' }); // idle|invalid|checking|available|taken|same
  const [changing, setChanging] = useState(false);

  // Step 2 has two modes: give a NEW number, or MOVE the member onto a family
  // member's number (the inverse of Graduate — they become a managed child).
  const [mode, setMode] = useState('number'); // 'number' | 'family'
  const [parentMobile, setParentMobile] = useState('');
  const [parent, setParent] = useState(null); // null | 'notfound' | member object
  const [findingParent, setFindingParent] = useState(false);
  const [relationId, setRelationId] = useState('');
  const [moving, setMoving] = useState(false);
  const relationsQ = useRelations(true);
  const relationOptions = toOptions(pickRows(relationsQ.data).filter((r) => !isHeadRelation(r?.name)));

  // Reset everything about Step 2 when a fresh member is looked up.
  const resetStep2 = () => {
    setNewMobile('');
    setAvail({ state: 'idle' });
    setMode('number');
    setParentMobile('');
    setParent(null);
    setRelationId('');
  };

  const findMember = async () => {
    const m = digits(oldMobile);
    if (m.length !== 10) { toast.error('Enter a valid 10-digit number'); return; }
    setFinding(true);
    setMember(null);
    resetStep2();
    try {
      const u = await userAdminService.lookupByMobile(m);
      setMember(u);
    } catch (e) {
      if (e?.status === 404) setMember('notfound');
      else toast.error(e?.message || 'Lookup failed');
    } finally {
      setFinding(false);
    }
  };

  // Find the family member (parent) whose number the member will share.
  const findParent = async () => {
    const m = digits(parentMobile);
    if (m.length !== 10) { toast.error('Enter a valid 10-digit number'); return; }
    setFindingParent(true);
    setParent(null);
    try {
      const u = await userAdminService.lookupByMobile(m);
      setParent(u);
    } catch (e) {
      if (e?.status === 404) setParent('notfound');
      else toast.error(e?.message || 'Lookup failed');
    } finally {
      setFindingParent(false);
    }
  };

  const canMove =
    member && member !== 'notfound'
    && parent && parent !== 'notfound'
    && parent.id !== member.id
    && relationId
    && !moving;

  const moveToFamily = async () => {
    if (!canMove) return;
    const relName = relationOptions.find((o) => String(o.value) === String(relationId))?.label || 'family member';
    if (!window.confirm(
      `Move ${member.user_name} onto ${parent.user_name}'s number as their ${relName}? `
      + `${member.user_name} will give up ${digits(member.mobile_number)}, lose their own login, and be reached on `
      + `${digits(parent.mobile_number)}. This can be reversed with "Graduate to full member".`
    )) return;
    setMoving(true);
    try {
      const res = await userAdminService.moveToFamily({
        user_id: member.id,
        parent_id: parent.id,
        relation_id: Number(relationId),
      });
      toast.success(res?.detail || 'Member moved to the family number.');
      setOldMobile('');
      setMember(null);
      resetStep2();
      queryClient.invalidateQueries({ queryKey: ['mobile-change-log'] });
    } catch (e) {
      toast.error(e?.message || 'Could not move this member.');
    } finally {
      setMoving(false);
    }
  };

  // Live availability of the new number: 404 from lookup means "free".
  useEffect(() => {
    const m = digits(newMobile);
    if (m.length !== 10) { setAvail({ state: m.length ? 'invalid' : 'idle' }); return undefined; }
    if (member && member !== 'notfound' && m === digits(member.mobile_number)) {
      setAvail({ state: 'same' });
      return undefined;
    }
    let cancelled = false;
    setAvail({ state: 'checking' });
    const t = setTimeout(async () => {
      try {
        const u = await userAdminService.lookupByMobile(m);
        if (!cancelled) setAvail({ state: 'taken', member: u });
      } catch (e) {
        if (cancelled) return;
        setAvail(e?.status === 404 ? { state: 'available' } : { state: 'idle' });
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [newMobile, member]);

  const canChange = member && member !== 'notfound' && avail.state === 'available' && !changing;

  const change = async () => {
    if (!canChange) return;
    const oldM = digits(member.mobile_number);
    const newM = digits(newMobile);
    if (!window.confirm(`Change ${member.user_name}'s number from ${oldM} to ${newM}? They will sign in with the new number.`)) return;
    setChanging(true);
    try {
      const res = await userAdminService.changeMobile({ old_mobile: oldM, new_mobile: newM });
      toast.success(res?.detail || 'Mobile number changed.');
      setOldMobile('');
      setMember(null);
      resetStep2();
      queryClient.invalidateQueries({ queryKey: ['mobile-change-log'] });
    } catch (e) {
      toast.error(e?.message || 'Could not change the number.');
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        title="Change Mobile Number"
        breadcrumbs={<Breadcrumbs items={[{ label: 'Change Mobile Number' }]} />}
      />
      <p className="text-sm text-text-muted">
        Mobile numbers are unique across every Mandal. Look up a member by their current number,
        confirm it is the right person, then assign a new one that no other member holds.
      </p>

      {/* Step 1 — find the member */}
      <Card>
        <p className="mb-3 text-xs font-bold uppercase tracking-wider text-accent">1 · Find the member</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-semibold text-text-muted">Current mobile number</label>
            <Input
              value={oldMobile}
              inputMode="numeric"
              maxLength={10}
              placeholder="Enter current number"
              onChange={(e) => setOldMobile(digits(e.target.value))}
              onKeyDown={(e) => e.key === 'Enter' && findMember()}
            />
          </div>
          <Button variant="outline" busy={finding} disabled={finding || digits(oldMobile).length !== 10} onClick={findMember}>
            <Search className="h-4 w-4" /> Find member
          </Button>
        </div>

        {member === 'notfound' && (
          <div className="mt-4 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
            No member found with {digits(oldMobile)}.
          </div>
        )}
        {member && member !== 'notfound' && (
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-primary-50 p-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">
              {initials(member.user_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-primary">{member.user_name}</p>
              <p className="truncate text-xs text-text-muted">
                <Phone className="mr-1 inline h-3 w-3" />{member.mobile_number}
                {member.role_name ? ` · ${member.role_name}` : ''}
              </p>
              {locality(member) && <p className="truncate text-xs text-text-muted">{locality(member)}</p>}
            </div>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${member.status ? 'bg-success-bg text-success-fg' : 'bg-danger-bg text-danger-fg'}`}>
              {member.status ? 'Active' : 'Inactive'}
            </span>
          </div>
        )}
      </Card>

      {/* Step 2 — give a new number, or move to a family member's number */}
      {member && member !== 'notfound' && (
        <Card>
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-accent">2 · What to do</p>
          <div className="mb-4 inline-flex rounded-xl border border-line-soft p-0.5">
            {[
              { key: 'number', label: 'Give a new number' },
              { key: 'family', label: 'Move to a family member' },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setMode(o.key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  mode === o.key ? 'bg-primary text-white' : 'text-text-muted hover:text-primary'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {mode === 'number' ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <label className="mb-1 block text-xs font-semibold text-text-muted">New mobile number</label>
                  <Input
                    value={newMobile}
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Enter new number"
                    onChange={(e) => setNewMobile(digits(e.target.value))}
                  />
                  <AvailabilityHint avail={avail} />
                </div>
                <Button variant="accent" busy={changing} disabled={!canChange} onClick={change}>
                  Change number
                </Button>
              </div>
              <p className="mt-3 border-l-2 border-line pl-3 text-xs text-text-muted">
                {member.user_name} will sign in with the new number from now on. The change is recorded in the
                activity log with your name and the time. Their current session stays signed in.
              </p>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm text-text-muted">
                Use this when {member.user_name} has lost or given up their own number and will share a family
                member&apos;s. They become a managed member — reached on the family number, no separate login. This
                is the reverse of <b>Graduate to full member</b>, so it can be undone.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[200px] flex-1">
                  <label className="mb-1 block text-xs font-semibold text-text-muted">Family member&apos;s mobile number</label>
                  <Input
                    value={parentMobile}
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="Enter family member's number"
                    onChange={(e) => setParentMobile(digits(e.target.value))}
                    onKeyDown={(e) => e.key === 'Enter' && findParent()}
                  />
                </div>
                <Button variant="outline" busy={findingParent} disabled={findingParent || digits(parentMobile).length !== 10} onClick={findParent}>
                  <Search className="h-4 w-4" /> Find
                </Button>
              </div>

              {parent === 'notfound' && (
                <div className="mt-3 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
                  No member found with {digits(parentMobile)}.
                </div>
              )}
              {parent && parent !== 'notfound' && parent.id === member.id && (
                <div className="mt-3 rounded-xl bg-danger-bg px-4 py-3 text-sm font-medium text-danger-fg">
                  That is the same member. Enter a different family member&apos;s number.
                </div>
              )}
              {parent && parent !== 'notfound' && parent.id !== member.id && (
                <>
                  <div className="mt-3 flex items-center gap-3 rounded-xl bg-primary-50 p-3">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-white">
                      {initials(parent.user_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-primary">{parent.user_name}</p>
                      <p className="truncate text-xs text-text-muted">
                        <Phone className="mr-1 inline h-3 w-3" />{parent.mobile_number}
                        {parent.role_name ? ` · ${parent.role_name}` : ''}
                      </p>
                      {locality(parent) && <p className="truncate text-xs text-text-muted">{locality(parent)}</p>}
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-end gap-3">
                    <div className="min-w-[200px] flex-1">
                      <label className="mb-1 block text-xs font-semibold text-text-muted">Relation to {parent.user_name}</label>
                      <Select
                        value={relationId}
                        onChange={(e) => setRelationId(e.target.value)}
                        options={relationOptions}
                        disabled={relationsQ.isLoading}
                        placeholder={relationsQ.isLoading ? 'Loading…' : 'Select relation (Son / Daughter…)'}
                      />
                    </div>
                    <Button variant="accent" busy={moving} disabled={!canMove} onClick={moveToFamily}>
                      Move to family
                    </Button>
                  </div>
                  <p className="mt-3 border-l-2 border-line pl-3 text-xs text-text-muted">
                    {member.user_name} gives up {digits(member.mobile_number)} and is reached on {digits(parent.mobile_number)}.
                    Attendance and history are kept. Blocked if they hold a management role or manage their own family accounts.
                  </p>
                </>
              )}
            </>
          )}
        </Card>
      )}

      {/* Recent changes — the trace */}
      <Card className="p-0">
        <div className="border-b border-line-soft px-4 py-3">
          <h3 className="text-sm font-semibold text-primary">Recent changes</h3>
          <p className="text-xs text-text-muted">Every mobile-number change, across all Mandals.</p>
        </div>
        {logQ.isLoading ? (
          <div className="p-4"><Skeleton className="h-16 w-full" /></div>
        ) : logQ.error ? (
          <div className="p-4"><ErrorState error={logQ.error} onRetry={logQ.refetch} title="Could not load the change log" /></div>
        ) : (logQ.data ?? []).length === 0 ? (
          <p className="px-4 py-6 text-sm text-text-muted">No mobile numbers have been changed yet.</p>
        ) : (
          <ul>
            {logQ.data.map((r, i) => (
              <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-line-soft px-4 py-2.5 text-sm first:border-t-0">
                <span className="font-semibold text-primary tnum">{r.old_mobile}</span>
                <span className="font-bold text-accent">→</span>
                <span className="font-semibold text-primary tnum">{r.new_mobile}</span>
                {r.member && <span className="text-text-muted">· {r.member}</span>}
                <span className="ml-auto whitespace-nowrap text-xs text-text-faint">
                  by {r.changed_by}{r.changed_at ? ` · ${new Date(r.changed_at).toLocaleString()}` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function AvailabilityHint({ avail }) {
  if (avail.state === 'checking') {
    return <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…</p>;
  }
  if (avail.state === 'available') {
    return <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-success-fg"><Check className="h-3.5 w-3.5" /> Available — not used by any member</p>;
  }
  if (avail.state === 'taken') {
    const m = avail.member;
    return (
      <div className="mt-1.5 text-xs">
        <p className="flex items-center gap-1.5 font-semibold text-danger-fg">
          <X className="h-3.5 w-3.5" /> In use by {m.user_name} ({m.status ? 'Active' : 'Inactive'})
        </p>
        {locality(m) && <p className="pl-5 text-text-muted">{locality(m)}</p>}
      </div>
    );
  }
  if (avail.state === 'same') {
    return <p className="mt-1.5 text-xs font-semibold text-text-muted">This is already the member&apos;s number.</p>;
  }
  if (avail.state === 'invalid') {
    return <p className="mt-1.5 text-xs font-semibold text-text-muted">Enter all 10 digits.</p>;
  }
  return null;
}
