// Itchy's sample store for openDAW: audio held in memory, never written anywhere.
//
// openDAW asks a SampleLoaderManager for the audio behind every AudioFileBox. Its own
// GlobalSampleLoaderManager copies each sample into the browser's private file system and never
// cleans up; Itchy's samples are made in code or recorded in the session, so this one serves them
// from a Map. Add a sample here before creating the AudioFileBox that points at it.
import type { Terminable, UUID as UUIDType } from '@opendaw/lib-std';
import { UUID } from '@opendaw/lib-std';
import { AudioData } from '@opendaw/lib-dsp';
import { SamplePeaks } from '@opendaw/lib-fusion';
import type { SampleLoaderManager, SampleMetaData, SoundfontLoaderManager } from '@opendaw/studio-adapters';
import { DefaultSampleLoader } from '@opendaw/studio-core';

type Entry = { data: AudioData; meta: SampleMetaData };

export class MemorySamples implements SampleLoaderManager {
  readonly #entries = new Map<string, Entry>();
  readonly #loaders = new Map<string, DefaultSampleLoader>();

  /** Add mono or stereo PCM under a UUID. Adding the same UUID again replaces its audio. */
  add(uuid: UUIDType.Bytes, sampleRate: number, channels: ReadonlyArray<Float32Array>, name: string): void {
    const frames = channels[0]?.length ?? 0;
    const data = AudioData.create(sampleRate, frames, channels.length);
    channels.forEach((channel, i) => data.frames[i]?.set(channel));
    const meta: SampleMetaData = { name, bpm: 0, duration: frames / sampleRate, sample_rate: sampleRate, origin: 'import' };
    const id = UUID.toString(uuid);
    this.#entries.set(id, { data, meta });
    this.#loaders.get(id)?.invalidate();
    const loader = this.#loaders.get(id);
    if (loader) this.#fill(loader, id);
  }

  getOrCreate(uuid: UUIDType.Bytes): DefaultSampleLoader {
    const id = UUID.toString(uuid);
    let loader = this.#loaders.get(id);
    if (!loader) {
      loader = new DefaultSampleLoader(uuid);
      this.#loaders.set(id, loader);
      this.#fill(loader, id);
    }
    return loader;
  }

  record(loader: DefaultSampleLoader): void {
    this.#loaders.set(UUID.toString(loader.uuid), loader);
  }

  invalidate(uuid: UUIDType.Bytes): void {
    const id = UUID.toString(uuid);
    const loader = this.#loaders.get(id);
    if (!loader) return;
    loader.invalidate();
    this.#fill(loader, id);
  }

  remove(uuid: UUIDType.Bytes): void {
    this.#loaders.delete(UUID.toString(uuid));
  }

  /** openDAW counts references to drop unused loaders; the audio stays in memory for the session. */
  register(): Terminable {
    return { terminate() {} };
  }

  #fill(loader: DefaultSampleLoader, id: string): void {
    const entry = this.#entries.get(id);
    if (entry) loader.setLoaded(entry.data, SamplePeaks.None, entry.meta);
    else loader.setError(`Itchy has no sample ${id}`);
  }
}

/** Itchy uses no soundfonts. */
export const noSoundfonts: SoundfontLoaderManager = {
  getOrCreate() { throw new Error('Itchy uses no soundfonts'); },
  remove() {},
  invalidate() {},
};
