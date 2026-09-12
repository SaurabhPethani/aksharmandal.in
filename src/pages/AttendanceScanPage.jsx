import { useMemo, useState } from 'react';
import { CalendarCheck } from 'lucide-react';
import { usePermissions, useSabhaDetails } from '../hooks';
import { EmptyState, ErrorState, PageHeader } from '../components/ui';
import { FormField, Select } from '../components/form';
import { Breadcrumbs } from '../components/Navigation';
import AttendanceMarker from '../components/attendance/AttendanceMarker';
import ForbiddenPage from './ForbiddenPage';
import { ACTIONS, MODULES } from '../constants/permissions';
import { pickRows, toOptions } from '../utils/options';

// Attendance scanner — pick a sitting, then mark it.
//
// ⚠ THIS IS THE STANDALONE ROUTE, AND IT IS NO LONGER LINKED FROM ANYWHERE.
// Marking is now started from the Mark link on a sitting's own card, which opens
// /attendance/{sabha_detail_id}/mark (pages/AttendanceMarkPage.jsx) — that page
// already knows which sitting is meant and so needs no dropdown at all. This
// route is kept for bookmarks and for anyone who wants to pick from the whole
// list in one place; the dropdown below is the only thing it adds. Everything
// under it is AttendanceMarker — the same component that page renders, so the
// two can never drift apart.
//
// Gated on ATTENDANCE:CREATE — marking attendance is a write, so READ alone does
// not open this page. As with the user form, the route exists (the module is
// granted) and the grant is checked here, so a manual hit gets a 403 rather than
// a 404.

const ATTENDANCE_PATH = '/attendance';

export default function AttendanceScanPage() {
  const { can } = usePermissions();

  if (!can(MODULES.ATTENDANCE, ACTIONS.CREATE)) {
    return (
      <ForbiddenPage
        title="Permission denied"
        message="Marking attendance requires the Attendance · Create permission."
        backTo={ATTENDANCE_PATH}
        backLabel="Back to attendance"
      />
    );
  }
  return <Scanner />;
}

function Scanner() {
  const [sabhaId, setSabhaId] = useState('');  // sabha_detail_id — the dropdown value
  /** Whether the camera is live; the dropdown gets out of its way. */
  const [scanning, setScanning] = useState(false);

  /**
   * The Sabhas attendance can actually be marked for — regular and special
   * alike, so no `type` filter, but both other filters on:
   *
   *   attendance=1  is_available_for_attendance — the sitting is open for
   *                 marking. Offering a closed one gave a dropdown of Sabhas
   *                 whose every mark the backend would refuse.
   *   status=1      not cancelled.
   */
  const sabhasQ = useSabhaDetails({ attendance: 1, status: true }, true);
  const sabhaRows = useMemo(() => pickRows(sabhasQ.data), [sabhasQ.data]);
  const selected = useMemo(
    () => sabhaRows.find((r) => String(r.id) === String(sabhaId)) ?? null,
    [sabhaRows, sabhaId]
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance Scanner"
        breadcrumbs={<Breadcrumbs items={[{ label: 'Attendance', to: ATTENDANCE_PATH }, { label: 'Attendance Scanner' }]} />}
      />

      <div className="card space-y-5">
        {sabhasQ.error ? (
          <ErrorState error={sabhasQ.error} onRetry={sabhasQ.refetch} title="Could not load Sabhas" />
        ) : !sabhasQ.isLoading && sabhaRows.length === 0 ? (
          <EmptyState
            icon={CalendarCheck}
            title="No Sabha available"
            hint="There is no active Sabha in your scope to take attendance for."
          />
        ) : (
          <>
            {/* Hidden while scanning: the Sabha is chosen, and what is left to
                look at is the camera. The session is named under the frame. */}
            {!scanning && (
              <FormField label="Select Sabha Instance" htmlFor="sabha-select" required>
                <Select
                  id="sabha-select"
                  value={sabhaId}
                  disabled={sabhasQ.isLoading}
                  placeholder={sabhasQ.isLoading ? 'Loading…' : 'Select sabha'}
                  options={toOptions(sabhasQ.data, { labelKey: 'sabha_name' })}
                  onChange={(e) => setSabhaId(e.target.value)}
                />
              </FormField>
            )}

            {/* Keyed on the Sabha so switching tears the camera down and resets
                the session rather than carrying it over. */}
            <AttendanceMarker
              key={sabhaId || 'none'}
              sabhaDetailId={sabhaId}
              sabha={selected}
              onScanningChange={setScanning}
            />
          </>
        )}
      </div>
    </div>
  );
}
