// Storage behind one small async interface, so the app never cares where data lives.
// Today: IndexedDB in this browser (falling back to localStorage, then memory).
// Later: a CloudStorage with the same methods can sync to an account.
//
// interface Storage {
//   listProjects(): Promise<Array<{id, updated, preview}>>   newest first
//   loadProject(id): Promise<project|null>
//   saveProject(project): Promise<void>
//   deleteProject(id): Promise<void>
//   getCurrentId(): Promise<string|null>,  setCurrentId(id): Promise<void>
//   saveRecording(id, {sampleRate, data: Float32Array}): Promise<void>
//   loadRecording(id): Promise<{sampleRate, data}|null>
//   listRecordings(): Promise<Array<{id, created, peaks}>>     newest first ("my sounds")
// }

import { migrate } from '../model/project.js';

const DB_NAME = 'itchy';
const DB_VERSION = 1;

function req(r) {
  return new Promise((ok, fail) => { r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error); });
}

/** A tiny summary used to draw song thumbnails without loading every project. */
export function previewOf(project) {
  return project.layers.map((l) => ({ color: l.color, sound: l.sound, notes: l.notes.map((n) => [n.s, n.r]), steps: l.steps }));
}

export class IDBStorage {
  static async open() {
    const open = indexedDB.open(DB_NAME, DB_VERSION);
    open.onupgradeneeded = () => {
      const db = open.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings');
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
    };
    const db = await req(open);
    return new IDBStorage(db);
  }
  constructor(db) { this.db = db; }
  store(name, mode = 'readonly') { return this.db.transaction(name, mode).objectStore(name); }
  done(store) {
    return new Promise((ok, fail) => { store.transaction.oncomplete = ok; store.transaction.onerror = () => fail(store.transaction.error); });
  }

  async listProjects() {
    const all = await req(this.store('projects').getAll());
    return all.map((p) => ({ id: p.id, updated: p.updated, preview: previewOf(p) })).sort((a, b) => b.updated - a.updated);
  }
  async loadProject(id) {
    const p = await req(this.store('projects').get(id));
    return p ? migrate(p) : null;
  }
  async saveProject(project) {
    const s = this.store('projects', 'readwrite');
    s.put(JSON.parse(JSON.stringify(project)));
    await this.done(s);
  }
  async deleteProject(id) {
    const s = this.store('projects', 'readwrite');
    s.delete(id);
    await this.done(s);
  }
  async getCurrentId() { return (await req(this.store('meta').get('current'))) || null; }
  async setCurrentId(id) {
    const s = this.store('meta', 'readwrite');
    s.put(id, 'current');
    await this.done(s);
  }
  async saveRecording(id, rec) {
    const s = this.store('recordings', 'readwrite');
    s.put({ sampleRate: rec.sampleRate, data: rec.data, peaks: rec.peaks || [], created: rec.created || Date.now() }, id);
    await this.done(s);
  }
  async loadRecording(id) { return (await req(this.store('recordings').get(id))) || null; }
  async listRecordings() {
    const st = this.store('recordings');
    const [keys, vals] = await Promise.all([req(st.getAllKeys()), req(st.getAll())]);
    return keys.map((id, i) => ({ id, created: vals[i].created || 0, peaks: vals[i].peaks || [] })).sort((a, b) => b.created - a.created);
  }
}

/** Memory (and optionally localStorage-backed) storage: used where IndexedDB is unavailable, and in tests. */
export class MemoryStorage {
  constructor(local = null) {
    this.local = local; // a localStorage-like object, or null for pure memory
    this.projects = new Map();
    this.recordings = new Map();
    this.current = null;
    if (local) {
      try {
        const raw = JSON.parse(local.getItem('itchy.projects') || '[]');
        for (const p of raw) this.projects.set(p.id, p);
        this.current = local.getItem('itchy.current');
      } catch { /* corrupted: start fresh, never crash */ }
    }
  }
  persist() {
    if (!this.local) return;
    try {
      this.local.setItem('itchy.projects', JSON.stringify([...this.projects.values()]));
      if (this.current) this.local.setItem('itchy.current', this.current);
    } catch { /* quota: keep working in memory */ }
  }
  async listProjects() {
    return [...this.projects.values()].map((p) => ({ id: p.id, updated: p.updated, preview: previewOf(p) })).sort((a, b) => b.updated - a.updated);
  }
  async loadProject(id) { const p = this.projects.get(id); return p ? migrate(JSON.parse(JSON.stringify(p))) : null; }
  async saveProject(project) { this.projects.set(project.id, JSON.parse(JSON.stringify(project))); this.persist(); }
  async deleteProject(id) { this.projects.delete(id); this.persist(); }
  async getCurrentId() { return this.current; }
  async setCurrentId(id) { this.current = id; this.persist(); }
  async saveRecording(id, rec) { this.recordings.set(id, { created: Date.now(), peaks: [], ...rec }); }
  async loadRecording(id) { return this.recordings.get(id) || null; }
  async listRecordings() {
    return [...this.recordings].map(([id, r]) => ({ id, created: r.created, peaks: r.peaks })).sort((a, b) => b.created - a.created);
  }
}

export async function openStorage() {
  try {
    if (typeof indexedDB !== 'undefined') return await IDBStorage.open();
  } catch { /* private mode etc. */ }
  try {
    if (typeof localStorage !== 'undefined') return new MemoryStorage(localStorage);
  } catch { /* blocked */ }
  return new MemoryStorage();
}
