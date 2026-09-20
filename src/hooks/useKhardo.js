import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { khardoService } from '../services/khardoService';

/** The signed-in member's own Seva % (drives the dashboard ring). No permission
 *  needed — a member only ever gets their own number. */
export function useMyKhardo(enabled = true) {
  return useQuery({
    queryKey: ['khardo', 'me'],
    queryFn: () => khardoService.me(),
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** Admin: current Khardo rows (+ names). Gate on KHARDO:DOWNLOAD. */
export function useKhardoList(enabled = true) {
  return useQuery({
    queryKey: ['khardo', 'list'],
    queryFn: () => khardoService.list(),
    enabled,
  });
}

/** Admin: MERGE the uploaded sheet; refreshes the list and every member's ring. */
export function useUploadKhardo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file) => khardoService.upload(file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['khardo'] }),
  });
}

/** Admin: delete one member's Seva row by Sampark ID. */
export function useDeleteKhardoRow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (samparkId) => khardoService.deleteRow(samparkId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['khardo'] }),
  });
}

/** Admin: clear ALL Khardo data (fresh start). */
export function useClearKhardo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => khardoService.clearAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['khardo'] }),
  });
}
