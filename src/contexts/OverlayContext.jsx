import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';

function createOverlayStore() {
  let entries = [];
  const listeners = new Set();
  const emit = () => listeners.forEach(listener => listener());

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getEntries: () => entries,
    /** An overlay on its way out no longer counts. */
    isOpen: () => entries.some(e => !e.leaving),
    /** Adds the overlay, or replaces its content — keeping its place in the stack. */
    set(id, entry) {
      const at = entries.findIndex(e => e.id === id);
      const next = entries.slice();
      if (at === -1) next.push({ id, ...entry });
      else next[at] = { id, ...entry };
      entries = next;
      emit();
    },
    /** Stays drawn while it animates away, but is no longer open. */
    retire(id) {
      const at = entries.findIndex(e => e.id === id);
      if (at === -1 || entries[at].leaving) return;
      const next = entries.slice();
      next[at] = { ...next[at], leaving: true };
      entries = next;
      emit();
    },
    remove(id) {
      if (!entries.some(e => e.id === id)) return;
      entries = entries.filter(e => e.id !== id);
      emit();
    },
  };
}

const OverlayStoreContext = createContext(null);

export function OverlayProvider({ children }) {
  const store = useMemo(createOverlayStore, []);
  return (
    <OverlayStoreContext.Provider value={store}>
      {children}
    </OverlayStoreContext.Provider>
  );
}

/** True while any overlay is open — what the app shell blurs on. */
export function useOverlayOpen() {
  const store = useContext(OverlayStoreContext);
  return useSyncExternalStore(store.subscribe, store.isOpen);
}

/**
 * One component's place on the overlay layer.
 *
 *   show({ content, onRequestClose, leaving })  draws it, or redraws it where
 *       it already is in the stack. `onRequestClose` is what Android's back
 *       button calls on the topmost overlay.
 *   retire()  leaves it drawn while it animates away, but no longer open: the
 *       screen behind is sharp again and takes touches.
 *   remove()  takes it down. Unmounting does the same.
 */
export function useOverlay() {
  const store = useContext(OverlayStoreContext);
  const id = useId();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      store.remove(id);
    };
  }, [id, store]);

  return useMemo(
    () => ({
      show: entry => {
        if (mounted.current) store.set(id, entry);
      },
      retire: () => store.retire(id),
      remove: () => store.remove(id),
    }),
    [id, store],
  );
}

/**
 * The layer itself. `box-none` so it never swallows a touch meant for the
 * screen underneath while it is empty, and the newest overlay draws last —
 * a dialog opened from a dialog sits on top of it.
 */
export function OverlayHost() {
  const store = useContext(OverlayStoreContext);
  const entries = useSyncExternalStore(store.subscribe, store.getEntries);
  const open = entries.length > 0;

  useEffect(() => {
    if (!open) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      // Read at press time: the top of the stack may have changed since.
      const top = store
        .getEntries()
        .filter(e => !e.leaving)
        .pop();
      top?.onRequestClose?.();
      return true;
    });
    return () => sub.remove();
  }, [open, store]);

  if (!open) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* Each overlay gets the whole layer to itself. As plain siblings two
          open overlays shared the height, one in each half of the screen. */}
      {entries.map(entry => (
        <View
          key={entry.id}
          pointerEvents={entry.leaving ? 'none' : 'box-none'}
          style={StyleSheet.absoluteFill}
        >
          {entry.content}
        </View>
      ))}
    </View>
  );
}
