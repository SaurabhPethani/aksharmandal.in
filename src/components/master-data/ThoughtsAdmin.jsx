import { useState } from 'react';
import { Plus, Trash2, ImagePlus, Sparkles, ListPlus } from 'lucide-react';
import { Button, Card, EmptyState, Skeleton } from '../ui';
import { ConfirmDialog } from '../Overlays';
import FormDialog from '../FormDialog';
import { useAllThoughts, useThoughtMutations, usePermissions, useToast } from '../../hooks';

/**
 * Master Data → Today's Thoughts. Admin CRUD for the spiritual quotes, plus the
 * per-quote IMAGE workflow.
 *
 * BACKED BY A JSON FILE, not a DB table (see `thoughts_service.py`). `id` is
 * stable across deletes, which is what makes Delete safe.
 *
 * IMAGE MODEL — one quote, one image. "Generate Image" renders the quote's card
 * to a PNG on the server (headless Chromium) and consumes the quote; the daily
 * scheduler does the same automatically at midnight. A generated quote shows its
 * preview and cannot be regenerated until a Super Admin deletes the image, which
 * frees the quote again.
 *
 * PERMISSIONS (enforced by the backend; the UI only hides what would 403):
 *   Add / Delete quote   THOUGHTS:CREATE (canWrite)
 *   Generate image       rank >= 50
 *   Delete image         rank == 100 (Super Admin) — role id 1 is the UI hint
 */

export default function ThoughtsAdmin({ canWrite }) {
  const toast = useToast();
  const query = useAllThoughts(true);
  const { create, bulk, remove, generate, removeImage } = useThoughtMutations();

  // Super Admin is the only role that may delete a generated image. Backend
  // enforces rank == 100; this is a UI hint keyed on role id 1, matching how the
  // app gates other UI (see constants/roles.js) — a wrong guess only shows a
  // button that answers 403, never a real bypass.
  const { roleId } = usePermissions();
  const isSuperAdmin = Number(roleId) === 1;

  const [addOpen, setAddOpen] = useState(false);
  const [text, setText] = useState('');
  const [addError, setAddError] = useState(null);

  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [bulkError, setBulkError] = useState(null);

  const [deleteTarget, setDeleteTarget] = useState(null);       // quote to delete
  const [deleteImageTarget, setDeleteImageTarget] = useState(null); // image to free
  const [generatingId, setGeneratingId] = useState(null);       // row rendering now

  const rows = Array.isArray(query.data) ? query.data : [];

  const openAdd = () => { setAddError(null); setText(''); setAddOpen(true); };
  const closeAdd = () => { if (!create.isPending) { setAddOpen(false); setAddError(null); } };

  const openBulk = () => { setBulkError(null); setBulkText(''); setBulkOpen(true); };
  const closeBulk = () => { if (!bulk.isPending) { setBulkOpen(false); setBulkError(null); } };

  const submitBulk = () => {
    const trimmed = bulkText.trim();
    if (!trimmed) { setBulkError('Paste at least one quote.'); return; }
    setBulkError(null);
    bulk.mutate(trimmed, {
      onSuccess: (res) => {
        const added = res?.data?.added ?? 0;
        const skipped = res?.data?.skipped ?? 0;
        toast.success(
          res?.detail ?? `Added ${added} quote(s)${skipped ? `, skipped ${skipped}` : ''}.`,
        );
        setBulkOpen(false);
      },
      onError: (err) => setBulkError(err?.message ?? 'Could not add.'),
    });
  };

  const submit = () => {
    const trimmed = text.trim();
    if (!trimmed) { setAddError('Enter a thought.'); return; }
    setAddError(null);
    create.mutate(trimmed, {
      onSuccess: (res) => { toast.success(res?.detail ?? 'Thought added.'); setAddOpen(false); },
      onError: (err) => setAddError(err?.message ?? 'Could not add.'),
    });
  };

  const doGenerate = (row) => {
    setGeneratingId(row.id);
    generate.mutate(row.id, {
      onSuccess: (res) => toast.success(res?.detail ?? 'Image generated.'),
      onError: (err) => toast.error(err?.message ?? 'Could not generate the image.'),
      onSettled: () => setGeneratingId(null),
    });
  };

  const confirmDelete = () => {
    remove.mutate(deleteTarget.id, {
      onSuccess: (res) => { toast.success(res?.detail ?? 'Deleted.'); setDeleteTarget(null); },
      onError: (err) => toast.error(err?.message ?? 'Could not delete.'),
    });
  };

  const confirmDeleteImage = () => {
    removeImage.mutate(deleteImageTarget.id, {
      onSuccess: (res) => { toast.success(res?.detail ?? 'Image deleted; quote freed.'); setDeleteImageTarget(null); },
      onError: (err) => toast.error(err?.message ?? 'Could not delete the image.'),
    });
  };

  return (
    <>
      {canWrite && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-text-muted">
            Generate a quote&rsquo;s image to publish it; the daily scheduler also picks an unused quote each midnight.
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openBulk}>
              <ListPlus className="h-4 w-4" />
              Bulk add
            </Button>
            <Button variant="accent" onClick={openAdd}>
              <Plus className="h-4 w-4" />
              New Thought
            </Button>
          </div>
        </div>
      )}

      {query.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="!p-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-3/4" />
            </Card>
          ))}
        </div>
      ) : query.error ? (
        <Card>
          <p className="py-4 text-sm text-danger-fg">
            Could not load thoughts. {query.error?.message ? `(${query.error.message})` : ''}
          </p>
        </Card>
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState
            title="No thoughts yet"
            hint="Add the first one, then generate its image to show it on every member's dashboard."
          />
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const hasImage = Boolean(row.image_url);
            return (
              <li key={row.id}>
                <Card className="!p-4">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="whitespace-pre-line text-sm leading-relaxed text-primary">
                        {String(row.text ?? '').replace(/\\n/g, '\n')}
                      </p>

                      {hasImage ? (
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          {/* Both rendered cards, thumbnailed — landscape and
                              (when present) portrait, so an admin can confirm
                              both were generated. */}
                          <img
                            src={row.image_url}
                            alt="Landscape"
                            title="Landscape"
                            className="h-16 w-auto rounded-control border border-border"
                            loading="lazy"
                          />
                          {row.image_url_portrait && (
                            <img
                              src={row.image_url_portrait}
                              alt="Portrait"
                              title="Portrait"
                              className="h-16 w-auto rounded-control border border-border"
                              loading="lazy"
                            />
                          )}
                          <div className="flex flex-col gap-1">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                              <Sparkles className="h-3.5 w-3.5 text-accent" />
                              Image ready
                            </span>
                            {isSuperAdmin && (
                              <button
                                type="button"
                                onClick={() => setDeleteImageTarget(row)}
                                className="w-fit text-xs font-medium text-danger-fg hover:underline"
                              >
                                Delete image (free quote)
                              </button>
                            )}
                          </div>
                        </div>
                      ) : (
                        canWrite && (
                          <div className="mt-3">
                            <Button
                              variant="outline"
                              className="h-8 px-3 text-xs"
                              busy={generatingId === row.id}
                              disabled={generate.isPending}
                              onClick={() => doGenerate(row)}
                            >
                              <ImagePlus className="h-4 w-4" />
                              Generate Image
                            </Button>
                          </div>
                        )
                      )}
                    </div>

                    {/* Deleting a quote also deletes its image — Super Admin
                        only, matching the image-delete gate (backend enforces
                        rank == 100). */}
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(row)}
                        title="Delete thought"
                        aria-label="Delete thought"
                        className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-control text-text-muted transition-colors hover:bg-danger-bg hover:text-danger-fg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <FormDialog
        isOpen={addOpen}
        onClose={closeAdd}
        title="Add Thought"
        submitLabel="Add"
        submitVariant="accent"
        onSubmit={submit}
        busy={create.isPending}
        error={addError}
        size="md"
      >
        <div>
          <label htmlFor="new-thought" className="mb-1.5 block text-xs font-semibold text-primary">
            Thought text
          </label>
          <textarea
            id="new-thought"
            className="input-field min-h-[120px]"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            placeholder="Gujarati, Hindi or English. Line breaks are preserved."
          />
        </div>
      </FormDialog>

      <FormDialog
        isOpen={bulkOpen}
        onClose={closeBulk}
        title="Bulk add thoughts"
        submitLabel="Add all"
        submitVariant="accent"
        onSubmit={submitBulk}
        busy={bulk.isPending}
        error={bulkError}
        size="md"
      >
        <div>
          <label htmlFor="bulk-thoughts" className="mb-1.5 block text-xs font-semibold text-primary">
            Separate each quote with a blank line
          </label>
          <textarea
            id="bulk-thoughts"
            className="input-field min-h-[220px]"
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            autoFocus
            placeholder={'First quote — can span\nmultiple lines.\n\nSecond quote here.\n\nThird quote.'}
          />
          <p className="mt-1.5 text-xs text-text-muted">
            A quote may span multiple lines — its line breaks are kept. Put a blank line
            between quotes. Render them into the pool later with &ldquo;Generate new&rdquo; in
            the Today&rsquo;s Thought Pool panel.
          </p>
        </div>
      </FormDialog>

      <ConfirmDialog
        isOpen={Boolean(deleteTarget)}
        onClose={() => { if (!remove.isPending) setDeleteTarget(null); }}
        onConfirm={confirmDelete}
        busy={remove.isPending}
        tone="danger"
        title="Delete this thought?"
        description={
          deleteTarget
            ? String(deleteTarget.text).split('\n')[0].slice(0, 120)
              + (String(deleteTarget.text).length > 120 ? '…' : '')
            : ''
        }
        confirmLabel="Delete"
      />

      <ConfirmDialog
        isOpen={Boolean(deleteImageTarget)}
        onClose={() => { if (!removeImage.isPending) setDeleteImageTarget(null); }}
        onConfirm={confirmDeleteImage}
        busy={removeImage.isPending}
        tone="danger"
        title="Delete this image?"
        description="The image is removed and the quote returns to the pool, so it can be generated again on a new day."
        confirmLabel="Delete image"
      />
    </>
  );
}
