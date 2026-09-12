import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Download } from 'lucide-react';
import {
  usePermissions, useSabhaReport, useSabhaReportExport, useToast,
} from '../hooks';
import { Button, ErrorState, PageLoader } from '../components/ui';
import SittingHeadsSection from '../components/attendance/SittingHeadsSection';
import ForbiddenPage from './ForbiddenPage';
import { ACTIONS, MODULES } from '../constants/permissions';
import { NIMIT_SEVAK_LABEL } from '../utils/memberFlags';

// One sitting's attendance report — GET /api/v1/sabha-report?sabha_detail_id={id}.
//
// One sitting, REGULAR OR SPECIAL, broken down by the Sabhas whose members were
// invited: how many were registered, how many turned up, and the split by
// category. The totals row is the API's own `total`, not a local sum —
// percentages do not add.
//
//   the page itself       REPORTS:READ
//   Download Attendance   REPORTS:DOWNLOAD  (GET /sabha-report/export)
//
// ⚠ NOT `/special-sabha-report`. That path is a DEPRECATED ALIAS of this one,
// from when the report existed for special sittings only. Both are live and both
// answer, which is exactly why the dead one is easy to reintroduce by copying an
// older line — `sabha-report` is the pair that documents itself as serving both
// kinds of sitting.
//
// REACHED FROM REGULAR SITTINGS TOO. The Report button on the Attendance list is
// offered on any sitting whose date has passed, and both
// `/attendance/sabha/:id/report` and the older `/attendance/special/:id/…` land
// here. Nothing below reads `type`, and the wording is neutral for the same
// reason: the heading used to say "Special Sabha Report" over a regular Sabha's
// numbers.

const ATTENDANCE_PATH = '/attendance';

/** The report's own columns, in the order the API returns them. */
const COLUMNS = [
  { key: 'sabha_name', label: 'Sabha', align: 'left' },
  { key: 'total', label: 'Total' },
  { key: 'registered', label: 'Registered' },
  { key: 'ambrish', label: 'Ambrish' },
  // The key is the API's (`karyakarta` in SpecialSabhaSabhaStat); the column is
  // called Nimit Sevak everywhere it is read, so it takes the shared label
  // rather than spelling it again. `ambrish` above keeps the one word — it
  // counts a Sabha's men and women together, so Sarhadyi would not fit either.
  { key: 'karyakarta', label: NIMIT_SEVAK_LABEL },
  { key: 'yuvak', label: 'Yuvak' },
  { key: 'present', label: 'Present', tone: 'ok' },
  { key: 'absent', label: 'Absent', tone: 'bad' },
  { key: 'present_percentage', label: 'Present %', tone: 'ok', percent: true },
  { key: 'absent_percentage', label: 'Absent %', tone: 'bad', percent: true },
];

const TONES = { ok: 'text-success-fg', bad: 'text-danger-fg' };

/** "2026-09-24" -> "24 September 2026", without a timezone shifting the day. */
function longDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ''));
  if (!m) return null;
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${Number(m[3])} ${months[Number(m[2]) - 1]} ${m[1]}`;
}

const cellValue = (row, column) => {
  const raw = row?.[column.key];
  if (raw == null || raw === '') return '—';
  return column.percent ? `${raw}%` : raw;
};

export default function SpecialSabhaReportPage() {
  const { can } = usePermissions();
  if (!can(MODULES.REPORTS, ACTIONS.READ)) {
    return (
      <ForbiddenPage
        message="Viewing this report requires the Reports · Read permission."
        backTo={ATTENDANCE_PATH}
        backLabel="Back to attendance"
      />
    );
  }
  return <Report />;
}

function Report() {
  const { sabhaDetailId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { can } = usePermissions();

  const { data, isLoading, error, refetch } = useSabhaReport(sabhaDetailId);
  const exportReport = useSabhaReportExport();

  // `special_sabha` is what the response calls the sitting's own block. A
  // regular sitting may name it differently, so the plainer spellings are
  // accepted too rather than leaving the whole header blank.
  const meta = data?.special_sabha ?? data?.sabha ?? data?.sabha_detail ?? null;
  const rows = Array.isArray(data?.data) ? data.data : [];
  const totals = data?.total ?? null;

  /**
   * Two things have to be true before the button is drawn.
   *
   *   REPORTS:DOWNLOAD   the grant `/sabha-report/export` asks for, so it is
   *                      never offered for a request that would 403.
   *   SOMETHING TO EXPORT `GET /sabha-report/export` ERRORS on an empty report
   *                      rather than answering an empty spreadsheet. The same
   *                      response this page is already rendering says whether
   *                      there is anything in it, so the button comes off
   *                      instead of being pressed into a failure — the page
   *                      below already explains that nobody attended.
   *
   * `rows` OR `totals`: a report with only a totals row still has numbers in it,
   * and that is the same test the empty state below is drawn on.
   */
  const canDownload = can(MODULES.REPORTS, ACTIONS.DOWNLOAD);
  const hasReport = rows.length > 0 || Boolean(totals);

  const back = () => {
    if (window.history.length > 1) navigate(-1);
    else navigate(ATTENDANCE_PATH);
  };

  const download = async () => {
    try {
      await exportReport.mutateAsync({
        sabhaDetailId,
        // Named after the Sabha it belongs to, so a folder of these stays readable.
        filename: `${meta?.special_sabha_name ?? meta?.sabha_name ?? 'sabha'} - ${meta?.sabha_date ?? sabhaDetailId}.xlsx`,
      });
      toast.success('Attendance downloaded.');
    } catch (err) {
      toast.error(err?.message);
    }
  };

  if (isLoading) return <PageLoader label="Loading report" />;
  if (error) {
    return (
      <div className="space-y-4">
        <BackLink onClick={back} />
        <div className="card">
          <ErrorState error={error} onRetry={refetch} title="Could not load this report" />
        </div>
      </div>
    );
  }

  const subtitle = [
    meta?.special_sabha_name ?? meta?.sabha_name,
    meta?.mandal_name,
    longDate(meta?.sabha_date ?? meta?.date),
  ].filter(Boolean).join(' · ');

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <button
            type="button"
            onClick={back}
            aria-label="Back"
            className="mt-1 shrink-0 rounded-control p-1 text-text-muted transition-colors hover:bg-primary-50 hover:text-primary"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <div className="min-w-0">
            <h1 className="page-title">Attendance Report</h1>
            {subtitle && <p className="mt-1 text-sm text-text-muted">{subtitle}</p>}
          </div>
        </div>

        {canDownload && hasReport && (
          <Button variant="accent" onClick={download} busy={exportReport.isPending}>
            <Download className="h-4 w-4" />
            Download Attendance
          </Button>
        )}
      </div>

      {rows.length === 0 && !totals ? (
        <div className="card">
          <p className="py-6 text-sm text-text-muted">This Sabha has no attendance to report yet.</p>
        </div>
      ) : (
        // Its own scroll container: ten numeric columns do not fit a phone, and
        // the page itself must never scroll sideways.
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[840px] border-collapse">
            <thead>
              <tr>
                {COLUMNS.map((c) => (
                  <th
                    key={c.key}
                    className={`table-th px-5 py-3.5 ${c.align === 'left' ? '' : '!text-right'}`}
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.sabha_id ?? i} className="border-t border-line-soft">
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-5 py-3.5 text-sm ${
                        c.align === 'left'
                          ? 'text-left font-bold text-primary'
                          : `tnum text-right font-semibold ${TONES[c.tone] ?? 'text-primary'}`
                      }`}
                    >
                      {cellValue(row, c)}
                    </td>
                  ))}
                </tr>
              ))}

              {/* The API's own totals. `count` rather than `total` — the totals
                  object names the first column differently from the rows. */}
              {totals && (
                <tr className="border-t border-line">
                  {COLUMNS.map((c) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-5 py-3.5 text-sm ${
                        c.align === 'left'
                          ? 'text-left font-bold text-primary'
                          : `tnum text-right font-bold ${TONES[c.tone] ?? 'text-primary'}`
                      }`}
                    >
                      {c.align === 'left'
                        ? 'Total'
                        : cellValue({ ...totals, total: totals.count ?? totals.total }, c)}
                    </td>
                  ))}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* NEW section, below the existing report and untouched: per follow-up
          head with their members' live present/absent across this sitting plus
          the prior three, and the two WhatsApp buttons. */}
      <SittingHeadsSection sabhaDetailId={sabhaDetailId} />
    </div>
  );
}

function BackLink({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-text-muted transition-colors hover:text-primary"
    >
      <ChevronLeft className="h-4 w-4" />
      Back
    </button>
  );
}
