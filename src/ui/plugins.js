// Features that plug into the core screen. Each may add controls to the top bar or the
// panel (init), hook up after the screen exists (attach), and refresh on changes (render).
// New depth (song sections, more charms, export…) can arrive the same way.

import { moodPlugin, dicePlugin } from './experiments.js';
import { charmsPlugin } from './charms.js';
import { micPlugin } from './mic.js';
import { songbookPlugin } from './songbook.js';
import { delightPlugin } from './delight.js';

export function plugins(storage) {
  return [delightPlugin(), moodPlugin(), dicePlugin(), charmsPlugin(), micPlugin(storage), songbookPlugin(storage)];
}
