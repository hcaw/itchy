// The grid: Itchy's step sequencer, one playing surface for a critter. Its notes are note events in a region
// that loops over the critter's steps. Writes go through openDAW's editing (one undo step each); reads go through
// openDAW's typed adapters.
import { PPQN } from '@opendaw/lib-dsp';
import { NoteRegionBoxAdapter, type NoteEventBoxAdapter } from '@opendaw/studio-adapters';
import type { Project } from '@opendaw/studio-core';
import type { Critter } from './critter';

/** One grid step: a sixteenth note. */
export const STEP = PPQN.SemiQuaver;
export const STEPS = 16;
const VELOCITY = 0.8;

export type Note = { step: number; pitch: number };

function eventsOf(project: Project, critter: Critter): ReadonlyArray<NoteEventBoxAdapter> {
  const region = project.boxAdapters.adapterFor(critter.region, NoteRegionBoxAdapter);
  return region.optCollection.unwrap('the grid region has no note events').events.asArray();
}

/** The critter's grid notes, as steps and MIDI pitches. */
export function notesOf(project: Project, critter: Critter): Note[] {
  return eventsOf(project, critter).map((event) => ({ step: Math.round(event.position / STEP), pitch: event.pitch }));
}

/** Add the note at this step and pitch, or remove it if it is there. One undo step. */
export function toggleNote(project: Project, critter: Critter, { step, pitch }: Note): void {
  project.editing.modify(() => {
    const existing = eventsOf(project, critter).find(
      (event) => event.position === step * STEP && event.pitch === pitch,
    );
    if (existing) existing.box.delete();
    else
      project.api.createNoteEvent({
        owner: critter.region,
        position: step * STEP,
        duration: STEP,
        pitch,
        velocity: VELOCITY,
      });
  });
}

/** The grid step under the playhead, for a position in pulses. */
export function stepAt(position: number): number {
  return Math.floor(position / STEP) % STEPS;
}
