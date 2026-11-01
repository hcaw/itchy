// App state: the current project (saved, undoable) plus a little view state (not saved in
// the project). Every edit goes through change(), which records undo, notifies the UI,
// updates the audio engine and schedules an autosave.

import { History } from '../model/history.js';
import { migrate, findLayer } from '../model/project.js';

export const BACKUP_KEY = 'itchy.backup';

export class Store {
  constructor({ project, storage }) {
    this.project = project;
    this.storage = storage;
    this.history = new History(100);
    this.view = { selected: project.layers[project.layers.length - 1]?.id };
    this.listeners = new Set();
    this.saveTimer = null;
    this.saving = Promise.resolve();
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify(what = 'project') { for (const fn of this.listeners) fn(what); }

  get layer() {
    return findLayer(this.project, this.view.selected) || this.project.layers[0];
  }

  select(id) {
    if (this.view.selected === id) return;
    this.view.selected = id;
    this.notify('select');
  }

  /**
   * Change the project. `key` groups a whole gesture (drag, paint stroke) into one undo step.
   * Returns whatever fn returns.
   */
  change(fn, key = null) {
    if (key === null || key !== this.history.openKey) this.history.record(JSON.stringify(this.project), key);
    const result = fn(this.project);
    this.project.updated = Date.now();
    this.notify('project');
    this.scheduleSave();
    return result;
  }

  /** End of a gesture: the next change starts a new undo step. */
  seal() { this.history.seal(); }

  undo() { return this.restore(this.history.undo(JSON.stringify(this.project))); }
  redo() { return this.restore(this.history.redo(JSON.stringify(this.project))); }

  restore(snapshot) {
    if (!snapshot) return false;
    this.project = migrate(JSON.parse(snapshot));
    if (!findLayer(this.project, this.view.selected)) this.view.selected = this.project.layers[0].id;
    this.notify('project');
    this.scheduleSave();
    return true;
  }

  /** Swap in a different song (from the songbook). Its undo history starts fresh. */
  async open(project) {
    await this.flush();
    this.project = project;
    this.history.clear();
    this.view.selected = project.layers[project.layers.length - 1]?.id;
    await this.storage.saveProject(project);
    await this.storage.setCurrentId(project.id);
    this.notify('open');
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 150);
  }

  /**
   * Synchronous safety copy for when the page is closing: an IndexedDB write started now
   * may not finish, but localStorage writes always do. Boot picks whichever is newer.
   */
  backup() {
    try { localStorage.setItem(BACKUP_KEY, JSON.stringify(this.project)); } catch { /* full or blocked */ }
  }

  /** Save now (also used on page hide). */
  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    const p = this.project;
    this.saving = this.saving
      .then(() => this.storage.saveProject(p))
      .then(() => this.storage.setCurrentId(p.id))
      .catch((e) => console.warn('Itchy: could not save', e));
    return this.saving;
  }
}
