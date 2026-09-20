import { useContext, useCallback, useEffect, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';
import { PermissionContext } from '../contexts/PermissionContext';
import { ToastContext } from '../contexts/ToastContext';

// Context accessors and the UI primitives every domain uses. Nothing here talks
// to the API — that is what makes this the one hook file with no service import.
//
// Mobile port: useTableRows is left out until the app has a table screen to
// need it.

function required(ctx, name) {
  if (!ctx) throw new Error(`${name} must be used inside its provider`);
  return ctx;
}

export const useAuth = () => required(useContext(AuthContext), 'useAuth');
export const usePermissions = () => required(useContext(PermissionContext), 'usePermissions');
export const useToast = () => required(useContext(ToastContext), 'useToast');

/** Open/close state for modals, drawers and dropdowns. */
export function useDisclosure(initial = false) {
  const [isOpen, setIsOpen] = useState(initial);
  return {
    isOpen,
    open: useCallback(() => setIsOpen(true), []),
    close: useCallback(() => setIsOpen(false), []),
    toggle: useCallback(() => setIsOpen((v) => !v), []),
  };
}

export function useDebounced(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Closes on outside click / Escape — shared by Dropdown, Modal and Drawer. */
export function useDismissable(ref, onDismiss, active = true) {
  useEffect(() => {
    // Web-only: there is no document to listen on in the app.
    if (!active || typeof document === 'undefined') return undefined;
    const onKey = (e) => e.key === 'Escape' && onDismiss();
    const onClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onDismiss();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [ref, onDismiss, active]);
}
