import type { Project } from '@opendaw/studio-core';

/** Play the song from the start. */
export function play(project: Project): void {
  project.engine.setPosition(0);
  project.engine.play();
}

/** Pause: held notes are released and tails ring out. */
export function stop(project: Project): void {
  project.engine.stop(false);
}
