// Undo/redo by snapshots. Projects are small JSON, so a stack of strings is simple and safe.
// A gesture (a paint stroke, a slider drag) passes the same `key` for every change and is
// recorded once; call seal() when the gesture ends.

export class History {
  constructor(limit = 100) {
    this.limit = limit;
    this.past = [];
    this.future = [];
    this.openKey = null;
  }

  /** Call *before* changing the project, with its current serialised state. */
  record(snapshot, key = null) {
    if (key !== null && key === this.openKey) return false; // same gesture: already recorded
    this.openKey = key;
    if (this.past[this.past.length - 1] === snapshot) return false;
    this.past.push(snapshot);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    return true;
  }

  seal() {
    this.openKey = null;
  }

  undo(current) {
    this.seal();
    if (!this.past.length) return null;
    this.future.push(current);
    return this.past.pop();
  }

  redo(current) {
    this.seal();
    if (!this.future.length) return null;
    this.past.push(current);
    return this.future.pop();
  }

  clear() {
    this.past = [];
    this.future = [];
    this.openKey = null;
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }
}
