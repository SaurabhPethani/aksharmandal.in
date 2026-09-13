import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { thoughtsService } from '../services/thoughtsService';

// Query keys, kept as a small object so an invalidation from the mutations
// below cannot go out of sync with the readers above.
const KEYS = {
  random: ['thoughts', 'random'],
  list: ['thoughts', 'list'],
  todayImage: ['thoughts', 'today-image'],
  overview: ['thoughts', 'overview'],
};

/**
 * One random thought for the My Dashboard card.
 *
 * NO staleTime override: the point of "fresh per page load" is that each
 * dashboard visit picks a new thought. React Query's own default (30s
 * stale) is enough to stop a double-mount in dev from firing two requests
 * and swapping the thought under the reader mid-open.
 */
export function useRandomThought() {
  return useQuery({
    queryKey: KEYS.random,
    queryFn: thoughtsService.random,
  });
}

/**
 * The pre-rendered image for the My Dashboard card — today's (random among
 * today's) or the last available, or null when none exist yet. Replaces
 * useRandomThought for the dashboard: the quote is baked into the image.
 */
export function useTodaysThoughtImage() {
  return useQuery({
    queryKey: KEYS.todayImage,
    queryFn: thoughtsService.todayImage,
  });
}

/**
 * The full store — admin master-data tab.
 *
 * Backend refuses this with a 403 for role_id > 7, so callers should hide
 * the tab behind the same role check rather than showing it and rendering
 * an error state.
 */
export function useAllThoughts(enabled = true) {
  return useQuery({
    queryKey: KEYS.list,
    queryFn: thoughtsService.list,
    enabled,
  });
}

/**
 * Add and Delete for the admin tab. On success both invalidate the LIST
 * query (so the admin sees the change immediately) and the RANDOM query
 * (so the dashboard card refreshes on the next visit).
 */
export function useThoughtMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: KEYS.list });
    queryClient.invalidateQueries({ queryKey: KEYS.random });
    // Generating / deleting an image changes what the dashboard shows.
    queryClient.invalidateQueries({ queryKey: KEYS.todayImage });
    queryClient.invalidateQueries({ queryKey: KEYS.overview });
  };
  const create = useMutation({ mutationFn: thoughtsService.create, onSuccess: invalidate });
  // Bulk-add many quotes at once (one per line). Same invalidations as create.
  const bulk = useMutation({ mutationFn: thoughtsService.bulk, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: thoughtsService.remove, onSuccess: invalidate });
  // Render an image for one unused quote (rank >= 50) / delete an image and free
  // the quote (rank == 100). Both refresh the admin list and the dashboard.
  const generate = useMutation({ mutationFn: thoughtsService.generate, onSuccess: invalidate });
  const removeImage = useMutation({ mutationFn: thoughtsService.removeImage, onSuccess: invalidate });
  return {
    create,
    bulk,
    remove,
    generate,
    removeImage,
    isPending:
      create.isPending || bulk.isPending || remove.isPending
      || generate.isPending || removeImage.isPending,
  };
}

/**
 * SuperAdmin control-panel snapshot of the per-user image pool: sizes,
 * consumption, low-buffer alert, top-10 bucket, and live job status. Pass
 * `refetchInterval` (e.g. while a generate/regenerate job is running) to poll.
 */
export function useThoughtsOverview({ enabled = true, refetchInterval = false } = {}) {
  return useQuery({
    queryKey: KEYS.overview,
    queryFn: thoughtsService.overview,
    enabled,
    refetchInterval,
    staleTime: 5_000,
  });
}
