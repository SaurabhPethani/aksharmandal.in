import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { usePermissions, useToast } from '../hooks';
import {
  useAddressMutations, useAddressUpdate, useMasterDataList, useMasterDataMutations, isRowActive,
} from '../hooks/useMasterData';
import { MASTER_DATA_TABS } from '../services/masterDataService';
import { ACTIONS, MODULES } from '../constants/permissions';
import { searchMatches } from '../utils/options';
import { Button, EmptyState, PageHeader } from '../components/ui';
import { SearchInput } from '../components/form';
import { ConfirmDialog } from '../components/Overlays';
import FormDialog from '../components/FormDialog';
import { AddressMasterTable } from '../components/master-data/MasterDataTable';
import MasterDataGrid from '../components/master-data/MasterDataGrid';
import AddressFormDialog from '../components/master-data/AddressFormDialog';

/**
 * Master Data — the lookup lists the Add/Edit User form depends on.
 *
 * Tabs over the lookup endpoints. Most are the same screen with a different URL,
 * so they are rendered from MASTER_DATA_TABS rather than written out one by one;
 * Address Master has its own shape and its own renderer.
 * (Today's Thoughts used to live here as a tab — it now lives in the SuperAdmin
 * Control Panel → Today's Thought.)
 *
 * Permissions:
 *   MASTER_DATA:READ     opens the screen and fetches the lists. Without it the
 *                        page renders a refusal and issues no request at all.
 *   MASTER_DATA:CREATE   every write — "+ New …", Edit, and Deactivate/Activate.
 *
 * ONE write action, not two. MASTER_DATA declares READ and CREATE only; there is
 * deliberately no MASTER_DATA:UPDATE, so adding and editing a lookup are the same
 * grant (the module's own label for it is "Add / Edit System Data"). Do not
 * reintroduce an UPDATE check here — it can never come back true.
 *
 * READ gates this SCREEN, not the underlying endpoints: five of the six GET
 * routes are deliberately ungated in the backend because the Add/Edit User form
 * needs its dropdowns before anyone has been granted anything. `/address-master`
 * is the exception and does require MASTER_DATA:READ — so gating here matches the
 * strictest of the six and keeps the tabs consistent with one another.
 *
 * Renaming happens on the tile itself — these are one-field records, so a dialog
 * to change that one field would be a step for nothing. The dialog is reserved
 * for creating, where there is no tile to edit yet.
 *
 * As on the Hierarchy screen, neither path carries a status field. Status is
 * changed only by the tile's Deactivate/Activate link, which PATCHes the status
 * flag alone — so a rename can never switch a lookup off as a side effect.
 */

/**
 * The columns the Address Master's search looks through — every column the table
 * actually shows, so a term visible on screen always matches the row it is on.
 *
 * ADDRESS MASTER ONLY. The other five tabs are one-field lookups ("Graduate",
 * "Engineering") laid out as a grid of tiles; a search box over a dozen short
 * names is a control that costs a row of space to save a glance. Address Master
 * is the one list long enough and wide enough to need finding rather than
 * reading — hundreds of rows, seven columns.
 */
const ADDRESS_SEARCH_FIELDS = ['pincode', 'area', 'suburb', 'city', 'state', 'country'];

/** Tab strip: the active tab is a raised white pill, the rest are quiet text. */
function Tabs({ tabs, activeKey, onChange }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-1">
      {tabs.map((t) => {
        const active = t.key === activeKey;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-current={active ? 'page' : undefined}
            className={`rounded-xl px-4 py-2 text-sm transition-all ${
              active
                ? 'bg-surface font-bold text-primary shadow-card'
                : 'font-medium text-text-muted hover:text-primary'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export default function MasterDataPage() {
  const { can } = usePermissions();
  const toast = useToast();

  // Hide tabs the caller has no read grant for. A tab may declare its own
  // `readModule`; otherwise it falls back to MASTER_DATA:READ, which covers
  // every generic name/status list.
  const mayReadMasterData = can(MODULES.MASTER_DATA, ACTIONS.READ);
  const visibleTabs = MASTER_DATA_TABS.filter((t) => {
    if (t.readModule) return can(t.readModule, ACTIONS.READ);
    return mayReadMasterData;
  });

  const [activeKey, setActiveKey] = useState(visibleTabs[0]?.key ?? MASTER_DATA_TABS[0].key);

  const tab = visibleTabs.find((t) => t.key === activeKey)
    ?? visibleTabs[0]
    ?? MASTER_DATA_TABS[0];

  // Alias of `mayReadMasterData` above — used by the queries and JSX for
  // the generic tabs. Kept for readability: `mayRead` is the shorter name
  // this block has always used.
  const mayRead = mayReadMasterData;
  // One grant for add AND edit — see the note at the top of this file.
  const canWrite = can(MODULES.MASTER_DATA, ACTIONS.CREATE);

  // Always `include_inactive: true`, with no control to turn it off.
  //
  // This is a management screen, not a dropdown: it is the only place a
  // deactivated entry can be switched back on, so hiding those rows would make
  // Deactivate a one-way door and leave the Status column permanently reading
  // "Active". The plain lookups elsewhere still omit the flag and so still get
  // active rows only — the user form's dropdowns are unaffected.
  //
  // `enabled` rather than a guard around the JSX: without READ the screen must
  // not even issue the request.
  const query = useMasterDataList(tab, {
    includeInactive: true,
    enabled: mayRead,
  });
  const { save, setStatus } = useMasterDataMutations(tab);
  const addAddress = useAddressMutations();
  const editAddress = useAddressUpdate();
  // null = closed. { row: null } = create, { row } = edit that row.
  const [addressDialog, setAddressDialog] = useState(null);

  // Truthy while the "New …" dialog is open.
  const [dialog, setDialog] = useState(null);
  const [name, setName] = useState('');
  const [formError, setFormError] = useState(null);
  const [statusTarget, setStatusTarget] = useState(null);

  const rows = useMemo(() => {
    const all = Array.isArray(query.data) ? query.data : [];
    if (tab.kind !== 'address') return all;

    // The endpoint nests areas inside their pincode; the table wants ONE ROW PER
    // AREA, so the nesting is flattened here and the pincode's own columns repeat
    // down its areas.
    //
    // A pincode with no areas still gets a row, or registering one and not yet
    // mapping an area would make it vanish from the master it belongs to.
    return all.flatMap((p) => {
      const base = {
        pincodeId: p.id,
        pincode: p.pincode,
        suburb: p.suburb,
        city: p.city,
        state: p.state,
        country: p.country,
        pincodeStatus: p.status,
      };
      if (!p.areas?.length) {
        return [{ ...base, key: `p${p.id}`, areaId: null, area: null }];
      }
      // `areaId` is kept (Edit needs it to know whether to PATCH an area or POST
      // a new one); the area's own `status` is not — the table shows the
      // pincode's status only.
      return p.areas.map((a) => ({
        ...base,
        key: `p${p.id}-a${a.id}`,
        areaId: a.id,
        area: a.area ?? a.name,
      }));
    });
  }, [query.data, tab.kind]);

  /**
   * The Address Master's search term. Local, not a query param: the endpoint
   * takes no `search`, and the whole master arrives in one response anyway — so
   * filtering here answers instantly and costs no request.
   */
  const [search, setSearch] = useState('');

  const visibleRows = useMemo(() => {
    if (tab.kind !== 'address') return rows;
    if (!search.trim()) return rows;
    // Search by anything: each word must appear in some searchable field, any order.
    return rows.filter((row) => searchMatches(ADDRESS_SEARCH_FIELDS.map((f) => row[f] ?? '').join(' '), search));
  }, [rows, search, tab.kind]);

  // Clearing the term on a tab change: a search typed for addresses would
  // otherwise still be in the box on a tab that does not use it, and be waiting
  // there when the reader came back.
  const switchTab = (key) => { setActiveKey(key); setSearch(''); };

  // Create only. Renaming happens on the tile, so there is no edit path here.
  const openCreate = () => { setFormError(null); setName(''); setDialog({}); };
  const closeDialog = () => { if (!save.isPending) { setDialog(null); setFormError(null); } };

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) { setFormError('Enter a name.'); return; }
    setFormError(null);

    save.mutate(
      { row: null, name: trimmed },
      {
        onSuccess: (res) => {
          toast.success(res?.detail ?? 'Saved.');
          setDialog(null);
        },
        onError: (err) => setFormError(err?.message ?? 'Could not save.'),
      }
    );
  };

  const confirmStatus = () => {
    const active = isRowActive(statusTarget, tab);
    setStatus.mutate(
      { row: statusTarget, active: !active },
      {
        onSuccess: (res) => {
          toast.success(res?.detail ?? 'Status updated.');
          setStatusTarget(null);
        },
        onError: (err) => toast.error(err?.message ?? 'Could not update the status.'),
      }
    );
  };

  const targetActive = statusTarget ? isRowActive(statusTarget, tab) : false;

  // Refuse the page only when nothing on it is visible — the caller lacks
  // MASTER_DATA:READ (for the generic tabs) and any tab-specific grant that
  // could still surface a tab.
  if (!mayRead && visibleTabs.length === 0) {
    return (
      <>
        <PageHeader title="Master Data" />
        <div className="card">
          <EmptyState
            title="No read access"
            hint="Your role does not grant access to any Master Data list."
          />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Master Data" />

      <Tabs tabs={visibleTabs} activeKey={activeKey} onChange={switchTab} />

      {/* Search on the left, "New …" on the right — one row, so the toolbar is
          the same height whether the tab has a search or not. */}
      {(canWrite || tab.kind === 'address') && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {tab.kind === 'address' ? (
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search pincode, area, city…"
              className="w-full sm:w-80"
            />
          ) : <span />}

          {canWrite && (
            <Button
              variant="accent"
              onClick={() => {
                if (tab.kind !== 'address') return openCreate();
                // Clear any error left from a previous attempt, or the dialog
                // opens already showing a failure that has not happened yet.
                addAddress.reset();
                return setAddressDialog({ row: null });
              }}
            >
              <Plus className="h-4 w-4" />
              {tab.newLabel}
            </Button>
          )}
        </div>
      )}

      {tab.kind === 'address' ? (
        <AddressMasterTable
          rows={visibleRows}
          query={query}
          canWrite={canWrite}
          busy={editAddress.isPending}
          onEdit={(row) => { editAddress.reset(); setAddressDialog({ row }); }}
          // Says which of the two empty tables this is — nothing registered, or
          // nothing matching what was typed.
          emptyState={
            search.trim()
              ? { title: 'No matches', hint: `No address matches “${search.trim()}”.` }
              : undefined
          }
        />
      ) : (
        <MasterDataGrid
          tab={tab}
          rows={rows}
          query={query}
          canWrite={canWrite}
          // Renaming happens on the tile; the dialog is only for creating.
          onSaveName={(row, name) =>
            save.mutate(
              { row, name },
              {
                onSuccess: (res) => toast.success(res?.detail ?? 'Saved.'),
                onError: (err) => toast.error(err?.message ?? 'Could not save.'),
              }
            )
          }
          onToggleStatus={setStatusTarget}
          busy={save.isPending || setStatus.isPending}
        />
      )}

      <FormDialog
        isOpen={Boolean(dialog)}
        onClose={closeDialog}
        title={tab.newLabel ?? 'Add'}
        submitLabel="Add"
        submitVariant="accent"
        onSubmit={submit}
        busy={save.isPending}
        error={formError}
        size="sm"
      >
        <div>
          <label htmlFor="master-data-name" className="mb-1.5 block text-xs font-semibold text-primary">
            Name
          </label>
          <input
            id="master-data-name"
            className="input-field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            autoComplete="off"
          />
          {/* No status control here — see the note at the top of this file. */}
        </div>
      </FormDialog>

      {/* Keyed on the row so switching between rows (or between edit and create)
          remounts the form with the right starting values. */}
      <AddressFormDialog
        key={addressDialog?.row?.key ?? 'new-address'}
        isOpen={Boolean(addressDialog)}
        row={addressDialog?.row ?? null}
        onClose={() => setAddressDialog(null)}
        busy={addAddress.isPending || editAddress.isPending}
        error={(addressDialog?.row ? editAddress.error : addAddress.error)?.message ?? null}
        onSubmit={(payload, reset) => {
          const editingRow = addressDialog?.row ?? null;
          const done = (res) => {
            toast.success(res?.detail ?? (editingRow ? 'Address updated.' : 'Address added.'));
            reset();
            setAddressDialog(null);
          };
          // On failure the dialog stays open and keeps what was typed; the
          // message is printed above its footer by FormDialog.
          if (editingRow) {
            editAddress.mutate({ row: editingRow, values: payload }, { onSuccess: done });
          } else {
            addAddress.mutate(payload, { onSuccess: done });
          }
        }}
      />

      <ConfirmDialog
        isOpen={Boolean(statusTarget)}
        onClose={() => { if (!setStatus.isPending) setStatusTarget(null); }}
        onConfirm={confirmStatus}
        busy={setStatus.isPending}
        // Not `destructive`: the row stays listed once deactivated and the same
        // link switches it back on, so "cannot be undone" would be false.
        tone={targetActive ? 'danger' : 'primary'}
        title={targetActive ? 'Deactivate this entry?' : 'Activate this entry?'}
        description={
          statusTarget
            ? `${statusTarget.name} will be marked ${targetActive ? 'inactive' : 'active'}.`
            : ''
        }
        confirmLabel={targetActive ? 'Deactivate' : 'Activate'}
      />
    </>
  );
}
