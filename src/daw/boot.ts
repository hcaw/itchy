// Start openDAW's engine on an AudioContext and create an empty project.
//
// The steps follow the SDK README: start openDAW's animation-frame loop, install its worker and
// worklets, install and compile the WebAssembly engine, then create the project and start its
// audio worklet. Vite turns the `?url` imports into same-origin URLs, and vite.config.ts copies
// the engine's .wasm files to /opendaw/wasm/.
import { AnimationFrame } from '@opendaw/lib-dom';
import { BpmDetector } from '@opendaw/studio-adapters';
import type { EngineWorklet, SoundfontService } from '@opendaw/studio-core';
import { AudioWorklets, Project, SampleService, Workers } from '@opendaw/studio-core';
import { WasmEngine } from '@opendaw/studio-core-wasm';
import workersUrl from '@opendaw/studio-core/workers-main.js?worker&url';
import processorsUrl from '@opendaw/studio-core/processors.js?url';
import wasmProcessorUrl from '@opendaw/studio-core-wasm/wasm-processor.js?url';
import wasmOfflineWorkerUrl from '@opendaw/studio-core-wasm/wasm-offline-worker.js?worker&url';
import { MemorySamples, noSoundfonts } from './samples';

export type Daw = {
  context: AudioContext;
  project: Project;
  samples: MemorySamples;
  worklet: EngineWorklet;
  /** The level of the sound leaving the engine, 0 to 1 (an RMS over the last few milliseconds). */
  level(): number;
};

/**
 * openDAW's SoundfontService fetches a remote catalogue as soon as it is constructed, and Itchy uses
 * no soundfonts, so the project gets a stand-in that fails loudly if anything ever touches it.
 *
 * This is Itchy's one type assertion. SoundfontService is a class with private fields, so nothing but a real
 * instance can satisfy its type, and constructing one makes the network request Itchy must avoid.
 */
// oxlint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion -- see above
const noSoundfontService = new Proxy({} as SoundfontService, {
  get(_target, key) {
    throw new Error(`Itchy uses no soundfonts (SoundfontService.${String(key)})`);
  },
});

let pageSetup: Promise<void> | null = null;

/** The once-per-page part: the animation-frame loop, the worker and the engine's files. */
function setUpPage(): Promise<void> {
  pageSetup ??= (async () => {
    AnimationFrame.start(window);
    await Workers.install(workersUrl);
    AudioWorklets.install(processorsUrl);
    WasmEngine.install({
      processorUrl: wasmProcessorUrl,
      offlineWorkerUrl: wasmOfflineWorkerUrl,
      wasmUrl: `${import.meta.env.BASE_URL}opendaw`,
    });
  })();
  return pageSetup;
}

export async function bootDaw(context: AudioContext): Promise<Daw> {
  if (!globalThis.crossOriginIsolated) {
    throw new Error('openDAW needs a cross-origin isolated page (COOP and COEP headers)');
  }
  await setUpPage();
  if (!(await WasmEngine.ensureReady(context))) throw new Error('openDAW engine could not start');
  const audioWorklets = await AudioWorklets.createFor(context);
  const samples = new MemorySamples();
  const project = Project.new({
    audioContext: context,
    audioWorklets,
    sampleManager: samples,
    soundfontManager: noSoundfonts,
    sampleService: new SampleService(context, BpmDetector.Unknown),
    soundfontService: noSoundfontService,
  });
  const worklet = project.startAudioWorklet();
  await project.engine.isReady();

  // A meter on the engine's output: the worklet still plays to the speakers as well.
  const analyser = new AnalyserNode(context, { fftSize: 1024 });
  worklet.connect(analyser);
  const buffer = new Float32Array(analyser.fftSize);
  const level = () => {
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (const x of buffer) sum += x * x;
    return Math.sqrt(sum / buffer.length);
  };

  return { context, project, samples, worklet, level };
}
