import { useState } from 'react';
import { Plus, Minus } from 'lucide-react';
import { Card, Skeleton, ErrorState } from '../ui';
import { useSittingReportHeads, useMe, useToast } from '../../hooks';
import { readPersonRow, weekLabel, isPresent, presentCount } from '../../utils/reportFilters';
import { buildFullMessage, buildAbsentMessage, openSabhaWhatsApp } from '../../utils/sabhaWhatsapp';

// A NEW section shown BELOW the existing single-sitting report. Per follow-up
// head, with their members' present/absent across the last 4 SITTINGS (this
// sitting live + the prior three), and the two WhatsApp buttons. Reads live
// attendance, so a mark made right now is reflected.

const WA_META = {
  periodLabel: 'Sitting of',
  trendLabel: 'Last 4 sittings',
  liveSuffix: ' (live)',
  presentThis: 'this sitting',
};

function WhatsAppBtn({ label, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className="inline-flex items-center gap-1 rounded-full border border-[#25D366] px-2 py-0.5 text-[11px] font-semibold text-[#128C7E] transition-colors hover:bg-[#25D366]/10"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden="true"><path d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.5 0 .2 5.3.2 11.9c0 2.1.6 4.1 1.6 6L0 24l6.3-1.6a11.9 11.9 0 0 0 5.7 1.4c6.5 0 11.9-5.3 11.9-11.9 0-3.2-1.2-6.2-3.4-8.4zM12 21.6a9.9 9.9 0 0 1-5-1.4l-.4-.2-3.8 1 1-3.7-.2-.4a9.9 9.9 0 1 1 8.4 4.7z" /></svg>
      {label}
    </button>
  );
}

function HeadRow({ raw, columns, sabhaName, senderName, colSpan }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const person = readPersonRow(raw);
  const members = (raw.members ?? []).map(readPersonRow).filter(Boolean);
  const latest = columns[0];

  const send = (kind) => {
    const meta = { sabhaName, columns, senderName, ...WA_META };
    const msg = kind === 'absent' ? buildAbsentMessage(person, members, meta) : buildFullMessage(person, members, meta);
    if (!openSabhaWhatsApp(person.whatsapp || person.mobile, msg)) {
      toast.info(`No number on file for ${person.name} — pick the contact in WhatsApp.`);
    }
  };

  const rows = [
    <tr key={raw.user_id} className="border-t border-line-soft bg-bg/40">
      <td className="py-2.5 pl-4 pr-2 align-middle">
        {members.length > 0 && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? `Collapse ${person.name}` : `Expand ${person.name}`}
            className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-line-strong bg-surface text-primary hover:bg-primary-50"
          >
            {open ? <Minus className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
          </button>
        )}
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-sm text-primary">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{person.name}</span>
          {members.length > 0 && (
            <span className="flex items-center gap-1">
              <WhatsAppBtn label="Absent" title={`WhatsApp ${person.name} — absentees`} onClick={() => send('absent')} />
              <WhatsAppBtn label="Full" title={`WhatsApp ${person.name} — full report`} onClick={() => send('full')} />
            </span>
          )}
        </div>
      </td>
      <td className="whitespace-nowrap px-4 py-2.5 text-right text-xs text-text-muted">
        {members.length} {members.length === 1 ? 'member' : 'members'}
      </td>
      {columns.map((c) => (
        <td key={c} className="tnum whitespace-nowrap px-4 py-2.5 text-right text-xs font-semibold text-primary">
          {presentCount(members, c)}
        </td>
      ))}
    </tr>,
  ];

  if (open) {
    if (!members.length) {
      rows.push(
        <tr key={`${raw.user_id}-empty`} className="border-t border-line-soft">
          <td colSpan={colSpan} className="px-6 py-2 pl-16 text-sm text-text-muted">No members assigned.</td>
        </tr>
      );
    } else {
      for (const m of members) {
        rows.push(
          <tr key={`${raw.user_id}-${m.userId}`} className="border-t border-line-soft">
            <td />
            <td className="whitespace-nowrap py-2 pl-12 pr-4 text-sm text-primary">{m.name}</td>
            <td className="tnum whitespace-nowrap px-4 py-2 text-right text-xs text-text-muted">
              {m.present}/{m.total || columns.length}
            </td>
            {columns.map((c) => (
              <td key={c} className="whitespace-nowrap px-4 py-2 text-center">
                <span className={`text-xs font-bold ${isPresent(m, c) ? 'text-success-fg' : 'text-danger-fg'}`}>
                  {isPresent(m, c) ? 'P' : 'A'}
                </span>
              </td>
            ))}
          </tr>
        );
      }
    }
  }
  return rows;
}

export default function SittingHeadsSection({ sabhaDetailId }) {
  const q = useSittingReportHeads(sabhaDetailId);
  const meQ = useMe();
  const senderName = meQ.data
    ? (meQ.data.user_name || [meQ.data.first_name, meQ.data.last_name].filter(Boolean).join(' ') || '').trim()
    : '';

  const d = q.data;
  // Special / Mandal sittings have no single follow-up-head roster — render nothing.
  if (!q.isLoading && (!d || d.sabha_id == null)) return null;

  const columns = d?.columns ?? [];
  const heads = (d?.users ?? []).filter((u) => Array.isArray(u.members)); // heads carry a members array
  const colSpan = 3 + columns.length;

  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-primary">Follow-up heads · last {columns.length || 4} sittings</h3>
          <p className="text-xs text-text-muted">Live — this sitting plus the previous ones. Send each head their list on WhatsApp.</p>
        </div>
        <span className="rounded-full bg-success-bg px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-success-fg">● Live</span>
      </div>

      {q.isLoading ? (
        <div className="p-4"><Skeleton className="h-24 w-full" /></div>
      ) : q.error ? (
        <div className="p-4"><ErrorState error={q.error} onRetry={q.refetch} title="Could not load heads" /></div>
      ) : heads.length === 0 ? (
        <p className="px-4 py-6 text-sm text-text-muted">No follow-up heads for this Sabha.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max border-collapse">
            <thead>
              <tr>
                <th className="table-th w-8 px-2 py-3"><span className="sr-only">Expand</span></th>
                <th className="table-th px-4 py-3 text-left">Head</th>
                <th className="table-th px-4 py-3 !text-right">Members</th>
                {columns.map((c, i) => (
                  <th key={c} className={`table-th px-4 py-3 !text-right ${i === 0 ? 'text-accent' : ''}`}>
                    {weekLabel(c)}{i === 0 ? ' •' : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heads.map((raw) => (
                <HeadRow
                  key={raw.user_id}
                  raw={raw}
                  columns={columns}
                  sabhaName={d.sabha_name}
                  senderName={senderName}
                  colSpan={colSpan}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
