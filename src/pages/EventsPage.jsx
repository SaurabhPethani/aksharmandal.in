import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { usePermissions, useToast } from '../hooks';
import { useCategories, useMe } from '../hooks/useLookups';
import { useEvents, useEventMutations, useMyRegistrations } from '../hooks/useEvents';
import { ACTIONS, MODULES } from '../constants/permissions';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui';
import EventCard from '../components/events/EventCard';
import EventFormDialog from '../components/events/EventFormDialog';
import EventRegisterDialog from '../components/events/EventRegisterDialog';
import EventResultsDialog from '../components/events/EventResultsDialog';
import EventRegistrationData from '../components/events/EventRegistrationData';
import RegistrationsByEvent from '../components/events/RegistrationsByEvent';
import EditRegistrationDialog from '../components/events/EditRegistrationDialog';

/**
 * Events — two tabs, each gated by its own EVENTS action.
 *
 *   Events tab      EVENTS:READ      every event, filterable by status
 *   Registered tab  EVENTS:REGISTER  the members this caller has registered
 *
 *   EVENTS:CREATE   creating an event, and editing / deactivating one
 *
 * The four actions are INDEPENDENT — Nimit Sevak and Yuvak hold REGISTER and
 * nothing else, so `GET /events` 403s for them and only the Registered tab
 * appears. The backend enforces this with its own resolver, precisely so a
 * partial grant cannot leak the other actions; the frontend must not undo that
 * by fetching the event list before checking READ.
 *
 * REGISTERING IS A PROPERTY OF AN EVENT, NOT OF THE PAGE. Self-registration and
 * member registration used to be two buttons in the header, each opening a
 * dialog whose first field was a "which event?" dropdown. They are now the two
 * TABS of the popup a card click opens, and the event is the one that was
 * clicked. Same endpoint, same payloads, same validation — see
 * components/events/EventRegisterDialog.
 *
 * ⚠ A REGISTER-only role therefore has no way to register from this screen, and
 * did not really have one before either: the old dropdown was filled from
 * `GET /events`, which 403s for them, so it always opened empty. Fixing that
 * needs a backend list a REGISTER-only caller may read; there is none today.
 *
 * ⚠ `PATCH /events/{id}` is guarded by EVENTS:UPDATE server-side, but Edit and
 * Deactivate are gated here on CREATE as specified. Every role currently holds
 * both, so the two agree in practice — but a role granted CREATE without UPDATE
 * would see the buttons and be refused on save.
 */

const FILTERS = [
  { key: 'all', label: 'All', status: undefined },
  { key: 'active', label: 'Active', status: 'active' },
  { key: 'inactive', label: 'Inactive', status: 'inactive' },
];

export default function EventsPage() {
  const { can, scopeLevel } = usePermissions();
  const toast = useToast();

  const canRead = can(MODULES.EVENTS, ACTIONS.READ);
  // One grant for create AND update — see the note above.
  const canWrite = can(MODULES.EVENTS, ACTIONS.CREATE);
  /**
   * REGISTER **and** READ, by explicit request — registering is treated as
   * something you do to an event you can already see, so no READ means no
   * register.
   *
   * ⚠ This is a deliberate narrowing of what the backend grants, and it is not
   * free. The EVENTS actions are independent server-side, and Nimit Sevak and
   * Yuvak hold REGISTER *without* READ — for them this evaluates false, both
   * tabs disappear and the page falls to the "No access" branch below. Give
   * those roles EVENTS:READ in the backend to restore them; the frontend cannot
   * do it, because the grant genuinely is not there.
   */
  const canRegister = canRead && can(MODULES.EVENTS, ACTIONS.REGISTER);

  // Registered Data is scope-gated, NOT permission-gated: anyone with a band
  // above 'self' (rank >= 20 — Yuva Seva, Sabha/Mandal Heads & DB Managers, …)
  // sees registrant data within their own scope; a plain Yuvak ('self') does
  // not. The backend enforces the same line; this just hides the tab.
  const canSeeData = Boolean(scopeLevel) && scopeLevel !== 'self';

  const TABS = [
    { key: 'events', label: 'Events', show: canRead },
    { key: 'registered', label: 'Registered', show: canRegister },
    // Full registrant data + Excel, scoped by the viewer's band (RBAC).
    { key: 'data', label: 'Registered Data', show: canSeeData },
  ].filter((t) => t.show);

  const [activeTab, setActiveTab] = useState(TABS[0]?.key);
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0];

  const [filter, setFilter] = useState('all');
  const activeFilter = FILTERS.find((f) => f.key === filter) ?? FILTERS[0];

  // Each tab fetches only while it is the one on screen.
  const eventsQ = useEvents(canWrite ? activeFilter.status : 'active', canRead && tab?.key === 'events');
  const registrationsQ = useMyRegistrations(canRegister && tab?.key === 'registered');
  // Own record, for pre-filling self-registration. Fetched only when usable.
  const meQ = useMe(canRegister);

  const { saveEvent, setStatus, register, updateRegistration } = useEventMutations();

  const [dialog, setDialog] = useState(null);
  /** The event whose popup is open — set by clicking its card. */
  const [openEvent, setOpenEvent] = useState(null);
  /** The event whose poll-results dialog is open — organiser only. */
  const [resultsEvent, setResultsEvent] = useState(null);
  const [editingRegistration, setEditingRegistration] = useState(null);

  /**
   * Categories have exactly two readers, and neither is the Registered tab:
   * the event CARDS, which turn `user_category` ids into names, and the event
   * FORM, whose audience picker lists them. So it is fetched for those two and
   * nothing else — it used to hang on `canRead` alone, which meant every visit
   * to Registered pulled a list that tab renders nowhere.
   *
   * `dialog` is in the condition because Add Event can be pressed from either
   * tab. Declared after it for that reason.
   */
  const categoriesQ = useCategories(canRead && (tab?.key === 'events' || Boolean(dialog)));

  const categories = useMemo(
    () => (Array.isArray(categoriesQ.data) ? categoriesQ.data : []),
    [categoriesQ.data]
  );
  const categoryNames = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const events = Array.isArray(eventsQ.data) ? eventsQ.data : [];
  const registrations = Array.isArray(registrationsQ.data) ? registrationsQ.data : [];

  const openCreate = () => { saveEvent.reset(); setDialog({ event: null }); };
  const openEdit = (event) => { saveEvent.reset(); setDialog({ event }); };

  const submitEvent = (payload) =>
    saveEvent.mutate(
      { id: dialog.event?.id ?? null, payload },
      {
        onSuccess: (res) => {
          toast.success(res?.detail ?? 'Event saved.');
          setDialog(null);
        },
      }
    );

  const toggleStatus = (event) =>
    setStatus.mutate(
      { id: event.id, status: event.status === false },
      {
        onSuccess: (res) => toast.success(res?.detail ?? 'Event updated.'),
        onError: (err) => toast.error(err?.message ?? 'Could not update the event.'),
      }
    );

  const saveRegistration = (payload) =>
    updateRegistration.mutate(
      { id: editingRegistration.id, payload },
      {
        onSuccess: (res) => {
          toast.success(res?.detail ?? 'Registration updated.');
          setEditingRegistration(null);
        },
      }
    );

  /**
   * Cancelling a registration is a status flip, not a delete — the endpoint has
   * no delete, and the row stays visible as Denied so it is clear what happened.
   */
  const cancelRegistration = (row) =>
    updateRegistration.mutate(
      { id: row.id, payload: { status: false } },
      {
        onSuccess: (res) => toast.success(res?.detail ?? 'Registration cancelled.'),
        onError: (err) => toast.error(err?.message ?? 'Could not cancel the registration.'),
      }
    );

  /**
   * The mirror of `cancelRegistration` — flip the same status back.
   *
   * Needed because the REGISTER endpoint cannot be used to undo a cancellation:
   * it rejects any existing (event_id, mobile_number) pair with a 409 regardless
   * of that row's status, so a member who cancelled was locked out of the event
   * permanently. There is no delete either, so nothing could clear the way.
   * Flipping the existing row is the only route back, and it keeps the member's
   * original details rather than making them retype them.
   */
  const restoreRegistration = (row) =>
    updateRegistration.mutate(
      { id: row.id, payload: { status: true } },
      {
        onSuccess: (res) => toast.success(res?.detail ?? 'Registration confirmed again.'),
        onError: (err) => toast.error(err?.message ?? 'Could not confirm the registration.'),
      }
    );

  const submitRegistration = (items) =>
    register.mutate(items, {
      onSuccess: (res) => {
        toast.success(res?.detail ?? 'Registration saved.');
        setOpenEvent(null);
      },
    });

  if (!TABS.length) {
    // Reached with no EVENTS grant at all — and now ALSO with REGISTER but no
    // READ, since canRegister requires READ above. The hint therefore says what
    // is missing rather than claiming the role has nothing, which for a
    // REGISTER-only role (Nimit Sevak, Yuvak) would be untrue.
    return (
      <>
        <PageHeader title="Events" />
        <div className="card">
          <EmptyState title="No access" hint="Viewing events requires the Events · Read permission." />
        </div>
      </>
    );
  }

  // Top-right in the page header, as on every other screen. Creating an event is
  // the only page-level ACTION left — registering belongs to a specific event,
  // and is reached by clicking it.
  const actions = canWrite
    ? [
        <Button key="create" variant="primary" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          Create Event
        </Button>,
      ]
    : [];

  return (
    <>
      <PageHeader title="Events" actions={actions} />

      {/* Only rendered when there is a choice to make — a REGISTER-only caller
          has exactly one tab, and a strip of one is just a label. */}
      {TABS.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key)}
              aria-current={t.key === tab.key ? 'page' : undefined}
              className={`rounded-xl px-4 py-2 text-sm transition-all ${
                t.key === tab.key
                  ? 'bg-surface font-bold text-primary shadow-card'
                  : 'font-medium text-text-muted hover:text-primary'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab.key === 'events' && (
        <>
          {/* Status filter for organisers only. `GET /events` returns inactive
              events to a caller with EVENTS:CREATE and active-only to everyone
              else, so for a member "All" and "Active" would be the same list and
              "Inactive" would always be empty — three tabs, one outcome. */}
          {canWrite && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-current={f.key === filter ? 'page' : undefined}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-all ${
                  f.key === filter
                    ? 'border-primary bg-primary text-white'
                    : 'border-line-strong bg-surface text-primary hover:border-primary'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          )}

          {eventsQ.isLoading ? (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className="overflow-hidden rounded-card border border-line-soft bg-surface shadow-card">
                  <Skeleton className="h-36 w-full rounded-none" />
                  <div className="space-y-2 p-4">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : eventsQ.error ? (
            <div className="card">
              <ErrorState error={eventsQ.error} onRetry={eventsQ.refetch} title="Could not load events" />
            </div>
          ) : events.length === 0 ? (
            <div className="card">
              <EmptyState
                title={filter === 'all' ? 'No events yet' : `No ${filter} events`}
                hint={filter === 'all' ? 'Nothing has been created.' : 'Try another filter.'}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              {events.map((event) => (
                <EventCard
                  key={event.id}
                  event={event}
                  categoryNames={categoryNames}
                  canUpdate={canWrite}
                  busy={setStatus.isPending || saveEvent.isPending}
                  // No REGISTER grant, no click: the popup only registers, so
                  // opening one with nothing in it would be worse than a card
                  // that stays a card.
                  onOpen={canRegister ? (e) => { register.reset(); setOpenEvent(e); } : null}
                  onEdit={openEdit}
                  onToggleStatus={toggleStatus}
                  onResults={canWrite ? setResultsEvent : null}
                />
              ))}
            </div>
          )}
        </>
      )}

      {tab.key === 'registered' && (
        <>
          {registrationsQ.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : registrationsQ.error ? (
            <div className="card">
              <ErrorState
                error={registrationsQ.error}
                onRetry={registrationsQ.refetch}
                title="Could not load your registrations"
              />
            </div>
          ) : registrations.length === 0 ? (
            <div className="card">
              <EmptyState
                title="No registrations yet"
                hint="Members you register for an event will appear here."
              />
            </div>
          ) : (
            <RegistrationsByEvent
              rows={registrations}
              canEdit={canRegister}
              busy={updateRegistration.isPending}
              onEdit={(row) => { updateRegistration.reset(); setEditingRegistration(row); }}
              onCancel={cancelRegistration}
              onRestore={restoreRegistration}
            />
          )}
        </>
      )}

      {tab.key === 'data' && (
        <EventRegistrationData enabled={tab.key === 'data'} />
      )}

      {dialog && (
        // Keyed on the event so the form seeds from the row being edited rather
        // than from whichever one opened it first.
        <EventFormDialog
          key={dialog.event?.id ?? 'new-event'}
          event={dialog.event}
          categories={categories}
          isOpen
          busy={saveEvent.isPending}
          error={saveEvent.error?.message ?? null}
          onClose={() => { if (!saveEvent.isPending) setDialog(null); }}
          onSubmit={submitEvent}
        />
      )}

      {openEvent && (
        // Keyed on the event so the member rows and the chosen tab reset between
        // one event's popup and the next.
        <EventRegisterDialog
          key={openEvent.id}
          event={openEvent}
          me={meQ.data}
          canRegister={canRegister}
          isOpen
          busy={register.isPending}
          error={register.error?.message ?? null}
          onResetError={register.reset}
          onClose={() => { if (!register.isPending) setOpenEvent(null); }}
          onSubmit={submitRegistration}
        />
      )}

      {editingRegistration && (
        // Keyed on the row so the form seeds from the registration being edited.
        <EditRegistrationDialog
          key={editingRegistration.id}
          registration={editingRegistration}
          isOpen
          busy={updateRegistration.isPending}
          error={updateRegistration.error?.message ?? null}
          onClose={() => { if (!updateRegistration.isPending) setEditingRegistration(null); }}
          onSubmit={saveRegistration}
        />
      )}

      {resultsEvent && (
        <EventResultsDialog
          key={resultsEvent.id}
          event={resultsEvent}
          isOpen
          onClose={() => setResultsEvent(null)}
        />
      )}
    </>
  );
}
