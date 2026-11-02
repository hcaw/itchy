// Itchy's own sample store for openDAW: PCM held in memory, never written anywhere.
//
// openDAW asks a SampleLoaderManager for every AudioFileBox's audio. Its GlobalSampleLoaderManager copies each
// sample into the browser's private file system (OPFS) and never cleans up; Itchy's sounds are made in code at
// every boot and its recordings already live in IndexedDB, so this manager serves PCM straight from a Map.
//
// Rules (see docs/OPENDAW-PORT.md §4e):
// - Every sample gets a stable UUID derived from a text key ("itchy-sound:<id>:<variant>:<version>" for built-in
//   sounds, "itchy-rec:<id>" for recordings) with openDAW's UUID.sha256, which is async. So keys are added (and
//   their UUIDs computed) before any synchronous edit needs them; uuidOf() then answers synchronously.
// - Never create an AudioFileBox before its PCM has been added here: openDAW would ask for a sample we don't have.
//
// This module never imports the openDAW bundle itself: pass in the module namespace that boot.js loaded.

/** Bump when a built-in sound's synthesis changes, so its sample UUID changes too. */
export const SOUND_VERSION = 1;

export const soundKey = (id, variant = 0) => `itchy-sound:${id}:${variant}:${SOUND_VERSION}`;
export const recordingKey = (id) => `itchy-rec:${id}`;

/** The UUID (UUID.Bytes) for a text key: the first 16 bytes of the SHA-256 of its UTF-8 bytes. */
export function uuidForKey(od, key) {
  return od.UUID.sha256(new TextEncoder().encode(key).buffer);
}

export class ItchySamples {
  #od;
  #byKey = new Map(); // key -> { uuid, data, meta }
  #byUuid = new Map(); // uuid string -> the same entry
  #loaders = new Map(); // uuid string -> SampleLoader

  constructor(od) { this.#od = od; }

  /**
   * Add PCM under a key and return its UUID. `channels` is an array of Float32Array (1 for mono, 2 for stereo, all
   * the same length). Adding a key again replaces its audio (and reloads it in openDAW if it was loaded).
   */
  async add(key, { sampleRate, channels, name = key }) {
    const { AudioData } = this.#od;
    const frames = channels[0].length;
    if (!channels.every((c) => c.length === frames)) throw new Error(`samples: channels of ${key} differ in length`);
    const data = AudioData.create(sampleRate, frames, channels.length);
    channels.forEach((c, i) => data.frames[i].set(c));
    const uuid = await uuidForKey(this.#od, key);
    const id = this.#od.UUID.toString(uuid);
    const entry = { key, uuid, data, meta: { name, bpm: 0, duration: frames / sampleRate, sample_rate: sampleRate, origin: 'import' } };
    const known = this.#byUuid.has(id);
    this.#byKey.set(key, entry);
    this.#byUuid.set(id, entry);
    if (known) this.invalidate(uuid);
    return uuid;
  }

  /** The UUID of a key that has been added, or undefined. Synchronous. */
  uuidOf(key) { return this.#byKey.get(key)?.uuid; }
  has(key) { return this.#byKey.has(key); }
  /** The AudioData of a key, or undefined. */
  audioOf(key) { return this.#byKey.get(key)?.data; }
  /** Length in seconds of a key's audio, or undefined. */
  secondsOf(key) { return this.#byKey.get(key)?.meta.duration; }

  // ---- SampleLoaderManager (studio-adapters/dist/sample/SampleLoaderManager.d.ts) ----

  getOrCreate(uuid) {
    const id = this.#od.UUID.toString(uuid);
    let loader = this.#loaders.get(id);
    if (!loader) {
      loader = new this.#od.DefaultSampleLoader(uuid);
      this.#loaders.set(id, loader);
      this.#fill(loader, id);
    }
    return loader;
  }

  record(loader) { this.#loaders.set(this.#od.UUID.toString(loader.uuid), loader); }

  invalidate(uuid) {
    const id = this.#od.UUID.toString(uuid);
    const loader = this.#loaders.get(id);
    if (!loader) return;
    loader.invalidate();
    if (loader instanceof this.#od.DefaultSampleLoader) this.#fill(loader, id);
  }

  remove(uuid) { this.#loaders.delete(this.#od.UUID.toString(uuid)); }

  /** openDAW counts references to drop unused loaders; the PCM stays in memory for the whole session anyway. */
  register() { return { terminate() {} }; }

  #fill(loader, id) {
    const entry = this.#byUuid.get(id);
    if (entry) loader.setLoaded(entry.data, this.#od.SamplePeaks.None, entry.meta);
    else loader.setError(`Itchy has no sample ${id}`);
  }
}

/** A soundfont manager for a project that never uses soundfonts. */
export const noSoundfonts = {
  getOrCreate() { throw new Error('Itchy uses no soundfonts'); },
  record() {}, invalidate() {}, remove() {},
  register() { return { terminate() {} }; },
};
