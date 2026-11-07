// The bridge between openDAW and React: openDAW's observables and its editing history become
// React state through useSyncExternalStore. Components read the song from openDAW directly.
import { useCallback, useSyncExternalStore } from 'react';
import type { ObservableValue } from '@opendaw/lib-std';
import type { Project } from '@opendaw/studio-core';
import { stepAt } from '../daw/grid';

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

/**
 * The grid step under the playhead, or -1 when stopped. openDAW updates the position every animation frame, but this
 * re-renders only when the step changes (16 times a bar), not 60 times a second.
 */
export function usePlayheadStep(project: Project): number {
  const engine = project.engine;
  const subscribe = useCallback(
    (onChange: () => void) => {
      const position = engine.position.subscribe(onChange);
      const playing = engine.isPlaying.subscribe(onChange);
      return () => {
        position.terminate();
        playing.terminate();
      };
    },
    [engine],
  );
  return useSyncExternalStore(subscribe, () => (engine.isPlaying.getValue() ? stepAt(engine.position.getValue()) : -1));
}
