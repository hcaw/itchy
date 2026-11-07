// The bridge between openDAW and React: openDAW's observables and its editing history become
// React state through useSyncExternalStore. Components read the song from openDAW directly.
import { useCallback, useSyncExternalStore } from 'react';
import type { ObservableValue } from '@opendaw/lib-std';
import type { Project } from '@opendaw/studio-core';

let version = 0;

/** The current value of an openDAW observable value (a field, the transport, the playhead). */
export function useObservableValue<T>(observable: ObservableValue<T>): T {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const subscription = observable.subscribe(onChange);
      return () => subscription.terminate();
    },
    [observable],
  );
  return useSyncExternalStore(subscribe, () => observable.getValue());
}

/**
 * Re-render after every edit, undo or redo, and read the song again. Returns a counter that changes
 * each time, so it can also key memoised reads.
 */
export function useEditingVersion(project: Project): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const subscription = project.editing.subscribe(() => {
        version += 1;
        onChange();
      });
      return () => subscription.terminate();
    },
    [project],
  );
  return useSyncExternalStore(subscribe, () => version);
}
