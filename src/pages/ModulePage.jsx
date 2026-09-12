import { useState } from 'react';
import { useModuleList, usePermissions, useToast } from '../hooks';
import { Button, EmptyState, PageHeader } from '../components/ui';
import { DataTable, Pagination } from '../components/DataTable';
import { Breadcrumbs } from '../components/Navigation';
import { SearchInput } from '../components/form';
import { ACTIONS } from '../constants/permissions';

// Generic module screen. It knows nothing about any specific module: action
// buttons are whatever full-context granted, and table columns are inferred from
// the first row the list endpoint returns.

// Creating is the accent (orange) call-to-action; other verbs render as outline.
const ACCENT_ACTIONS = new Set([ACTIONS.CREATE, 'ADD']);
// READ is a visibility gate, not a button.
const NON_BUTTON_ACTIONS = new Set([ACTIONS.READ]);

export default function ModulePage({ module }) {
  const { grantedActions, can } = usePermissions();
  const toast = useToast();
  const [search, setSearch] = useState('');

  // Module visibility is "any granted action", so a module can be reachable
  // without READ. Only fetch when reading is permitted — or when the module
  // defines no READ action at all (the endpoint is open).
  const hasReadAction = Boolean(module.actions?.READ);
  const mayRead = hasReadAction ? can(module.name, ACTIONS.READ) : true;
  const endpoint = mayRead ? module.listEndpoint : null;

  const {
    pageRows, page, setPage, pageSize, setPageSize, pageCount, total, isLoading, isFetching, error, refetch,
  } = useModuleList(endpoint, { search });

  const actionButtons = grantedActions(module.name)
    .filter((a) => !NON_BUTTON_ACTIONS.has(a.name))
    .map((a) => (
      <Button
        key={a.name}
        variant={ACCENT_ACTIONS.has(a.name) ? 'accent' : 'outline'}
        // Per-action handlers are the next step; the button set itself is already
        // fully driven by the API.
        onClick={() => toast.info(`${a.label} is not wired up yet.`)}
      >
        {a.label}
      </Button>
    ));

  return (
    <>
      <PageHeader
        breadcrumbs={<Breadcrumbs items={[{ label: module.label }]} />}
        title={module.label}
        actions={actionButtons}
      />

      {module.unregistered && (
        <div className="mb-4 rounded-card border border-accent/40 bg-accent/10 p-4">
          <p className="text-sm text-primary">
            <span className="font-semibold">{module.name}</span> is granted by the API but has no entry in the frontend
            module registry, so it has no dedicated screen yet.
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-card border border-line-soft bg-surface shadow-card">
        {!mayRead ? (
          <EmptyState
            title="No read access"
            hint={`Your role can act on ${module.label} but cannot list its records.`}
          />
        ) : !endpoint ? (
          <EmptyState
            title="No list endpoint configured"
            hint={`Add a listEndpoint for ${module.name} in src/utils/moduleRegistry.js.`}
          />
        ) : (
          <>
            {/* `|| search` keeps the box on screen when a search returns nothing —
                hiding it would strand the user with no way to clear the term. */}
            {(total > 0 || search) && (
              <div className="border-b border-line p-3">
                <SearchInput value={search} onChange={setSearch} className="max-w-xs" />
              </div>
            )}
            <DataTable
              rows={pageRows}
              loading={isLoading}
              busy={isFetching && !isLoading}
              error={error}
              onRetry={refetch}
            />
            <Pagination page={page} pageCount={pageCount} total={total} onChange={setPage} pageSize={pageSize} onPageSize={setPageSize} />
          </>
        )}
      </div>
    </>
  );
}
