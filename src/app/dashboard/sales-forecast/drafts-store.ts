export type DraftsStore = {
  subscribe: (onStoreChange: () => void) => () => void;
  getSnapshot: () => number;
  notifyDebounced: () => void;
  notifyNow: () => void;
};

/**
 * Versioned store so totals UI can update without re-rendering the SKU grid.
 * Uses trailing debounce so header/target recalculation waits until typing pauses.
 */
export function createDraftsStore(delayMs = 350): DraftsStore {
  let version = 0;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    version += 1;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      return version;
    },
    notifyDebounced() {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    notifyNow() {
      if (timer != null) {
        clearTimeout(timer);
        timer = null;
      }
      flush();
    },
  };
}

export function storeServerSnapshot(): number {
  return 0;
}
