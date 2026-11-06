// Boot openDAW's engine on Itchy's AudioContext.
//
// Load this file only with `await import()`, and only after the capability probe passes: it pulls in the vendored
// openDAW bundle (about 5 MB with its engine), which must never delay Itchy's first paint or first sound, and must
// never be fetched by a browser that can't run it. A failure anywhere here rejects the returned promise, so the
// caller stays on the built-in engine. See docs/OPENDAW-PORT.md §3.
//
// ./engine.js boots it for the app (startOpenDaw); tests/e2e/opendaw-probe.js boots it on its own to probe openDAW.
import { canUseOpenDaw } from '../probe.js';
import { ItchySamples, noSoundfonts } from './samples.js';

/** The vendored openDAW SDK version: the folder name under vendor/opendaw/ (tests/vendor.test.js checks it). */
export const OPENDAW_VERSION = '0.0.180';
/** Absolute URL of the vendored files, so it works under any base path (such as /itchy/ on GitHub Pages). */
export const VENDOR = new URL(`../../../vendor/opendaw/${OPENDAW_VERSION}/`, import.meta.url).href;

let pageSetup = null; // the once-per-page part of the boot

/** Load the bundle and do the once-per-page setup. Resolves with the bundle's module namespace. */
export function loadOpenDaw() {
  pageSetup ||= (async () => {
    const od = await import(`${VENDOR}opendaw.js`);
    od.AnimationFrame.start(window); // otherwise engine.position never moves on the main thread
    await od.Workers.install(`${VENDOR}workers-main.js`);
    od.WasmEngine.install({
      processorUrl: `${VENDOR}wasm-processor.js`,
      offlineWorkerUrl: `${VENDOR}wasm-offline-worker.js`,
      wasmUrl: VENDOR.replace(/\/$/, ''), // the folder that contains wasm/, with no trailing slash
    });
    return od;
  })();
  pageSetup.catch(() => { pageSetup = null; });
  return pageSetup;
}

/**
 * Fetch (and compile) the bundle without running it: a `<link rel="modulepreload">`. Resolves once it has loaded or
 * failed (the import that follows reports a failure). The download can then go on while the music plays, and only
 * running the bundle, a long task, waits for `quiet()`.
 */
function preloadOpenDaw() {
  if (!document.createElement('link').relList?.supports?.('modulepreload')) return Promise.resolve();
  return new Promise((done) => {
    const link = Object.assign(document.createElement('link'), { rel: 'modulepreload', href: `${VENDOR}opendaw.js` });
    link.setAttribute('data-optional', ''); // a failure is the boot's to handle: index.html doesn't reload for it
    link.onload = link.onerror = () => done();
    document.head.append(link);
  });
}

/** A service that must never be used: openDAW's SoundfontService fetches a remote catalogue when constructed. */
const noSoundfontService = new Proxy({}, { get(_, key) { throw new Error(`Itchy uses no soundfonts (${String(key)})`); } });

/**
 * Boot openDAW on `ctx` (which may still be suspended). Resolves with
 *   { od, project, samples, worklet, env, terminate() }
 * once the engine is running and every sample created by `prepare` has loaded.
 *
 * - `prepare(handle)`: optional, awaited after the project exists and before the engine starts. Add samples to
 *   `handle.samples` and build boxes here (in a bare transaction: `project.boxGraph.beginTransaction()` …
 *   `endTransaction()`), so the engine receives the whole project at once.
 * - `onFatal(reason)`: called at most once if the engine fails later (a worklet `error` or `processorerror`). The
 *   project is terminated first, so openDAW does not restart the worklet.
 * - `readyTimeoutMs`: how long to wait for the engine to report ready once the worklet has started.
 * - `quiet()`: awaited before each step that keeps the main thread busy for long (loading the bundle, `prepare`,
 *   starting the worklet), so the caller can hold them back while the built-in engine plays the music: on a slow
 *   tablet each is a long task of a few hundred ms, which would make the built-in engine's beat stumble.
 */
export async function bootOpenDaw(ctx, { prepare, onFatal = () => {}, readyTimeoutMs = 10000, quiet = async () => {} } = {}) {
  if (!canUseOpenDaw(window)) throw new Error('openDAW needs a capable, cross-origin isolated page');
  if (!pageSetup) await preloadOpenDaw();
  await quiet();
  const od = await loadOpenDaw();
  if (!(await od.WasmEngine.ensureReady(ctx))) throw new Error('openDAW engine is unavailable');

  const samples = new ItchySamples(od);
  const env = {
    audioContext: ctx,
    audioWorklets: new od.AudioWorklets(ctx),
    sampleManager: samples,
    soundfontManager: noSoundfonts,
    sampleService: new od.SampleService(ctx, od.BpmDetector.Unknown),
    soundfontService: noSoundfontService,
  };
  const project = od.Project.new(env);
  let terminated = false;
  const handle = {
    od, project, samples, env, worklet: null,
    get terminated() { return terminated; },
    terminate() {
      if (terminated) return;
      terminated = true;
      try { handle.worklet?.disconnect(); } catch { /* already disconnected */ }
      project.terminate();
    },
  };
  try {
    await quiet();
    if (prepare) await prepare(handle);
    await quiet();
    let failed = false;
    handle.worklet = project.startAudioWorklet({
      unload: (reason) => {
        if (failed) return;
        failed = true;
        handle.terminate(); // before returning, so openDAW sees a terminated project and doesn't restart
        onFatal(reason);
      },
      load: () => {},
    });
    let timer;
    const ready = await Promise.race([
      project.engine.isReady().then(() => true),
      new Promise((ok) => { timer = setTimeout(() => ok(false), readyTimeoutMs); }),
    ]);
    clearTimeout(timer);
    if (!ready) throw new Error(`openDAW engine was not ready within ${readyTimeoutMs} ms`);
    if (!(await project.engine.queryLoadingComplete())) throw new Error('openDAW could not load every sample');
    return handle;
  } catch (e) {
    handle.terminate();
    throw e;
  }
}
