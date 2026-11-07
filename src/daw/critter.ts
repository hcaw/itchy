// A critter is one voice: an audio unit with an instrument (and, later, its charms). How notes reach it is up to
// the playing surface: the grid writes a looping note region (grid.ts); other surfaces can play it live.
import { NoteSignal } from '@opendaw/studio-adapters';
import type { AudioUnitBox, NoteRegionBox } from '@opendaw/studio-boxes';
import type { Project } from '@opendaw/studio-core';
import { STEP } from './grid';

/**
 * The critter's unit, and the looping region its grid writes into. Carrying the grid's region here is a skeleton
 * shortcut: the next slice looks critters and their regions up from openDAW's adapters instead (docs/ROADMAP.md).
 */
export type Critter = { unit: AudioUnitBox; region: NoteRegionBox };

const VELOCITY = 0.8;

/** Sound a note on the critter now, whether the music is playing or not (a tap, a preview, a live performance). */
export function audition(project: Project, critter: Critter, pitch: number): void {
  project.engine.noteSignal(NoteSignal.audition(critter.unit.address.uuid, pitch, STEP * 2, VELOCITY));
}
