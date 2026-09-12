import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, X, Loader2 } from 'lucide-react';
import { Modal } from '../Overlays';
import { Button } from '../ui';
import { Input } from '../form';
import { useToast, useMobileCheck } from '../../hooks';
import { isMobileTaken, mobileTakenLabel } from '../../utils/options';
import { usersService } from '../../services/usersService';

// Promote a parent-managed child to a full, independent member. A child has a
// placeholder number and no SIM; graduating asks for a real, unique 10-digit
// number, then the backend clears managed_by and enables login (the same
// USERS:CREATE right that registered the child). Their history is untouched.

const digits = (s) => String(s || '').replace(/\D/g, '');

export default function GraduateDialog({ member, onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [mobile, setMobile] = useState('');
  const [busy, setBusy] = useState(false);

  // Start clean whenever a different member opens the dialog.
  useEffect(() => { setMobile(''); }, [member?.id]);

  const check = useMobileCheck(mobile);
  const taken = isMobileTaken(check.data);
  const valid = /^\d{10}$/.test(mobile);
  const canSubmit = valid && !taken && !check.isFetching && !busy;

  const submit = async () => {
    if (!canSubmit || !member) return;
    setBusy(true);
    try {
      const res = await usersService.graduateChild(member.id, mobile);
      toast.success(res?.detail || `${member.user_name} is now a full member.`);
      queryClient.invalidateQueries({ queryKey: ['user', String(member.id)] });
      onClose?.();
    } catch (e) {
      toast.error(e?.message || 'Could not graduate this member.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen={Boolean(member)}
      onClose={onClose}
      dismissible={!busy}
      size="sm"
      title="Graduate to full member"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={submit} busy={busy} disabled={!canSubmit}>Graduate</Button>
        </>
      }
    >
      <p className="text-sm text-text-muted">
        <span className="font-semibold text-primary">{member?.user_name}</span> is a parent-managed
        child with no login of their own. Enter their own new mobile number to make them an
        independent member — they sign in with it and set their own password / PIN. Their attendance
        and family links are kept.
      </p>
      <div className="mt-4">
        <label className="mb-1 block text-xs font-semibold text-text-muted">New mobile number</label>
        <Input
          value={mobile}
          inputMode="numeric"
          maxLength={10}
          placeholder="Enter new 10-digit number"
          onChange={(e) => setMobile(digits(e.target.value))}
        />
        <Hint mobile={mobile} check={check} taken={taken} />
      </div>
    </Modal>
  );
}

function Hint({ mobile, check, taken }) {
  if (mobile.length > 0 && mobile.length < 10) {
    return <p className="mt-1.5 text-xs font-semibold text-text-muted">Enter all 10 digits.</p>;
  }
  if (!/^\d{10}$/.test(mobile)) return null;
  if (check.isFetching) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-text-muted">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking…
      </p>
    );
  }
  if (taken) {
    return (
      <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-danger-fg">
        <X className="h-3.5 w-3.5" /> {mobileTakenLabel(check.data)}
      </p>
    );
  }
  return (
    <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-success-fg">
      <Check className="h-3.5 w-3.5" /> Available — not used by any member.
    </p>
  );
}
