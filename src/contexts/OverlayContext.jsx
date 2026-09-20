import React, {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
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
    /** Adds the overlay, or replaces its content — keeping its place in the stack. */
    set(id, entry) {
      const at = entries.findIndex(e => e.id === id);
      const next = entries.slice();
      if (at === -1) next.push({ id, ...entry });
      else next[at] = { id, ...entry };
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
  return useSyncExternalStore(
    store.subscribe,
    () => store.getEntries().length > 0,
  );
}

/**
 * Renders `content` on the overlay layer for as long as `active` is true.
 * `onRequestClose` is what Android's back button calls on the topmost overlay.
 */
export function useOverlayPortal(active, content, onRequestClose) {
  const store = useContext(OverlayStoreContext);
  const id = useId();

  // No dependency list: the content is fresh on every render while open, and
  // `set` keeps the overlay where it is in the stack.
  useEffect(() => {
    if (active) store.set(id, { content, onRequestClose });
  });

  useEffect(() => {
    if (!active) store.remove(id);
    return () => store.remove(id);
  }, [active, id, store]);
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
      const top = store.getEntries()[store.getEntries().length - 1];
      top?.onRequestClose?.();
      return true;
    });
    return () => sub.remove();
  }, [open, store]);

  if (!open) return null;

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {entries.map(entry => (
        <React.Fragment key={entry.id}>{entry.content}</React.Fragment>
      ))}
    </View>
  );
}
