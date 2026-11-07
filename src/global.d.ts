import type { Daw } from './daw/boot';
import type { Critter } from './daw/song';

declare global {
  interface Window {
    /** Itchy's engine and song, for the browser console and the end-to-end checks. */
    itchy?: Daw & { critter: Critter };
  }
}
