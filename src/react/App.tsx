import type { Daw } from '../daw/boot';
import { audition, type Critter } from '../daw/critter';
import { STEPS, notesOf, toggleNote } from '../daw/grid';
import { play, stop } from '../daw/transport';
import { isHomeRow, rowSemitones } from '../model/scales';
import { useEditingVersion, useObservableValue, usePlayheadStep } from './hooks';

const ROWS = 8;
const KEY = 60; // middle C

/** The walking skeleton: one critter, one grid, Play and Stop, Undo and Redo. */
export function App({ daw, critter }: { daw: Daw; critter: Critter }) {
  const { project } = daw;
  useEditingVersion(project); // re-read the song after every edit, undo and redo
  const playing = useObservableValue(project.engine.isPlaying);
  const playhead = usePlayheadStep(project);
  const notes = new Set(notesOf(project, critter).map(({ step, pitch }) => `${step}:${pitch}`));
  const rows = Array.from({ length: ROWS }, (_, i) => ROWS - 1 - i); // top row first

  return (
    <div className="app">
      <header className="top">
        <button
          type="button"
          className={`play ${playing ? 'is-playing' : ''}`}
          aria-pressed={playing}
          onClick={() => (playing ? stop(project) : play(project))}
        >
          {playing ? 'Stop' : 'Play'}
        </button>
        <button type="button" onClick={() => project.editing.undo()} disabled={!project.editing.canUndo()}>
          Undo
        </button>
        <button type="button" onClick={() => project.editing.redo()} disabled={!project.editing.canRedo()}>
          Redo
        </button>
      </header>

      <main>
        <fieldset className="grid" aria-label="Music grid">
          {rows.map((row) => {
            const pitch = KEY + rowSemitones(row);
            return (
              <fieldset aria-label={`Note ${row + 1}`} className={`row ${isHomeRow(row) ? 'home' : ''}`} key={row}>
                {Array.from({ length: STEPS }, (_, step) => {
                  const on = notes.has(`${step}:${pitch}`);
                  return (
                    <button
                      type="button"
                      key={step}
                      className={`cell ${on ? 'on' : ''} ${step === playhead ? 'now' : ''} ${step % 4 === 0 ? 'beat' : ''}`}
                      aria-pressed={on}
                      aria-label={`Step ${step + 1}, note ${row + 1}`}
                      data-step={step}
                      data-row={row}
                      onClick={() => {
                        if (!on) audition(project, critter, pitch);
                        toggleNote(project, critter, { step, pitch });
                      }}
                    />
                  );
                })}
              </fieldset>
            );
          })}
        </fieldset>
      </main>
    </div>
  );
}
