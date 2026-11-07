// Itchy's song, in openDAW's terms. openDAW's project is the single source of truth: these
// functions write it (each user action is one `editing.modify`, so one undo step) and read it back.
// The UI reads through `notesOf` and openDAW's own observables; it keeps no copy of the song.
//
// A critter is an audio unit with an instrument, playing one note region that loops over its steps.
import { PPQN } from '@opendaw/lib-dsp';
import { InstrumentFactories, NoteSignal } from '@opendaw/studio-adapters';
import type { AudioUnitBox, NoteEventBox, NoteEventCollectionBox, NoteRegionBox } from '@opendaw/studio-boxes';
import type { Project } from '@opendaw/studio-core';

/** One grid step: a sixteenth note. */
export const STEP = PPQN.SemiQuaver;
export const STEPS = 16;
/** Regions last "for ever" (2^30 pulses is weeks at any tempo) and loop over the critter's steps. */
const FOREVER = 2 ** 30;
const VELOCITY = 0.8;

export type Critter = { unit: AudioUnitBox; region: NoteRegionBox };
export type Note = { step: number; pitch: number };

/**
 * A new song: the tempo and one critter. Setting up is not undoable: it runs in a bare box-graph
 * transaction, which openDAW's editing history never sees.
 */
export function createSong(project: Project, { bpm = 100 } = {}): Critter {
  const graph = project.boxGraph;
  graph.beginTransaction();
  try {
    project.timelineBox.bpm.setValue(bpm);
    const { audioUnitBox, trackBox } = project.api.createInstrument(InstrumentFactories.Vaporisateur, { name: 'Critter' });
    const region = project.api.createNoteRegion({ trackBox, position: 0, duration: FOREVER, loopDuration: STEPS * STEP });
    graph.endTransaction();
    return { unit: audioUnitBox, region };
  } catch (error) {
    if (graph.inTransaction()) graph.abortTransaction();
    throw error;
  }
}

function eventsOf(critter: Critter): NoteEventBox[] {
  const collection = critter.region.events.targetVertex.unwrap('region has no note events').box as NoteEventCollectionBox;
  return collection.events.pointerHub.incoming().map((pointer) => pointer.box as NoteEventBox);
}

/** The critter's notes, as grid steps and MIDI pitches. */
export function notesOf(critter: Critter): Note[] {
  return eventsOf(critter).map((event) => ({
    step: Math.round(event.position.getValue() / STEP),
    pitch: event.pitch.getValue(),
  }));
}

/** Add the note at this step and pitch, or remove it if it is there. One undo step. */
export function toggleNote(project: Project, critter: Critter, { step, pitch }: Note): void {
  project.editing.modify(() => {
    const existing = eventsOf(critter).find(
      (event) => event.position.getValue() === step * STEP && event.pitch.getValue() === pitch,
    );
    if (existing) existing.delete();
    else project.api.createNoteEvent({ owner: critter.region, position: step * STEP, duration: STEP, pitch, velocity: VELOCITY });
  });
}

/** Sound a note now on the critter's instrument, whether the music is playing or not. */
export function audition(project: Project, critter: Critter, pitch: number): void {
  project.engine.noteSignal(NoteSignal.audition(critter.unit.address.uuid, pitch, STEP * 2, VELOCITY));
}

export function play(project: Project): void {
  project.engine.setPosition(0);
  project.engine.play();
}

/** Pause: held notes are released and tails ring out. */
export function stop(project: Project): void {
  project.engine.stop(false);
}

/** The grid step under the playhead, for a position in pulses. */
export function stepAt(position: number): number {
  return Math.floor(position / STEP) % STEPS;
}
