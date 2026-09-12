import { api } from '../api/client';

// SuperAdmin-only: manually trigger the daily Sabha spawner and read the status
// of its last run. The spawner normally fires at 12:00 IST on its own; this is
// the fallback for a missed run (server down / deploy over the noon window).
export const sabhaSpawnService = {
  // The most recent 'Sabha' cron_logs row, or null if the job has never run.
  // Reuses GET /cron-logs (SuperAdmin sees global scope + full execution_logs).
  lastRun: async () => {
    const page = await api.get('/api/v1/cron-logs', { params: { type: 'Sabha', page: 1 } });
    return page?.items?.[0] ?? null;
  },

  // Run the spawner now. `force` bypasses the "already ran successfully" guard
  // so a missed noon run can still be recovered. Envelope on so the caller gets
  // the human-readable `detail` alongside the run summary in `data`.
  run: (force = false) =>
    api.post('/api/v1/test/run-sabha-spawn', { force }, { envelope: true }),
};
