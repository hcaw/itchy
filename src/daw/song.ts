// Setting up a new song.
import { InstrumentFactories } from '@opendaw/studio-adapters';
import type { Project } from '@opendaw/studio-core';
import type { Critter } from './critter';
import { STEP, STEPS } from './grid';

/** Regions last "for ever" (2^30 pulses is weeks at any tempo) and loop over the critter's steps. */
const FOREVER = 2 ** 30;

/**
 * A new song: the tempo and one critter with a grid. Setting up is not undoable: it runs in a bare box-graph
 * transaction, which openDAW's editing history never sees.
 */
export function createSong(project: Project, { bpm = 100 } = {}): Critter {
  const graph = project.boxGraph;
  graph.beginTransaction();
  try {
    project.timelineBox.bpm.setValue(bpm);
    const { audioUnitBox, trackBox } = project.api.createInstrument(InstrumentFactories.Vaporisateur, {
      name: 'Critter',
    });
    const region = project.api.createNoteRegion({
      trackBox,
      position: 0,
      duration: FOREVER,
      loopDuration: STEPS * STEP,
    });
    graph.endTransaction();
    return { unit: audioUnitBox, region };
  } catch (error) {
    if (graph.inTransaction()) graph.abortTransaction();
    throw error;
  }
}
