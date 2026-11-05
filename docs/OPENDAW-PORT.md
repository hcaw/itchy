# Plan: port Itchy's audio to the openDAW SDK (final, after adversarial review)

Date: 2026-11-02. Branch: `claude/opendaw-port` (clean at `74c92c0`). SDK target: `@opendaw/studio-sdk` **0.0.180**
(studio-core 0.2.14, studio-adapters 0.3.12, studio-boxes 0.0.118, studio-enums 0.1.10, studio-core-wasm 0.0.25,
lib-std 0.0.89, lib-dsp 0.0.100, lib-box 0.0.102, lib-dom 0.0.95, lib-fusion 0.0.111, lib-runtime 0.0.90), all pinned
exactly.

**Source of truth for openDAW behaviour.** The published packages were built from openDAW commit
**`9306eaab693b96c1e3000bd02b4ce59e3ed0b51e`** (the `gitHead` of studio-sdk, studio-core, studio-core-wasm,
studio-adapters, studio-boxes, lib-dsp, lib-box, lib-fusion, lib-midi and lib-dawproject) and
**`652e6caf759b06e8171f49fb71257884e7cae66e`** (lib-std, lib-dom, lib-jsx, lib-runtime, lib-xml and studio-enums;
corrected in M1 from "lib-std only", checked with `npm view`; nam-wasm, MIT and unused, has none).
The research clone at `3b6a9b8` (1 Nov) is two days newer and differs in 133 files, so it is **not** used as
evidence. Every **[verified]** claim below was re-checked against the installed `dist/` files
(`research/npm/node_modules/@opendaw/*`) or against a checkout of `9306eaab` (`scratchpad/od-9306`). Claims marked
**[spike]** must be confirmed by the M1 probe before code depends on them; M1 also re-runs every [verified] item
against the vendored files themselves.

Inputs: `research/sdk-api.md`, `research/runtime.md`, `research/itchy-audio-map.md`, Itchy's source, the reviewers'
spikes (`review-spike/`, `review-probe/`, `review-suspend/`) and the review findings (Review log, §15).

---

## 0. Summary

- openDAW becomes Itchy's **song engine**: sequencing on the audio thread, the instruments that play the song and
  previews, the effects, mixing and the master limiter. Itchy keeps its UI, its plain-JSON project
  (`src/model/project.js`), `migrate()`, storage, the songbook and its own undo (`store.change` / `store.seal`).
  **Itchy's JSON stays the only source of truth.** After every change a pure "mirror" turns it into a description
  of an openDAW project, which is applied to an in-memory openDAW `Project` that is never saved and keeps no undo.
- **Every sound stays Itchy's own synthesis.** At boot, `instruments.js` renders each built-in sound to PCM in an
  `OfflineAudioContext` with a seeded random source. openDAW's samplers play the PCM: **Playfield** for the drum
  kits (noisy pieces get four seeded variants that alternate) and **Nano** for the tunes (bass and cloud sustain by
  looping a steady segment) and for mic recordings. The stereo reverb impulse is Itchy's own seeded noise, loaded
  into openDAW's **Convolver**. No openDAW presets, samples or soundfonts; nothing is fetched from the network.
- **A bundler is unavoidable, but only at vendoring time.** An import map can't work (1925 of 1928 relative imports
  in `dist/` have no extension or point at a folder; runtime.md §1). A hand-run `scripts/vendor-opendaw.mjs` runs
  pinned esbuild once and commits the output to a **versioned** folder `vendor/opendaw/0.0.180/`. The app keeps no
  build step; `npm start`, Pages and Vercel serve files as they are.
- **The bundle is loaded with a dynamic `import()` only after the capability probe passes**, so first paint, first
  sound and browsers that can never use openDAW are unaffected by its 5.2 MB.
- **Cross-origin isolation is required** (`SharedArrayBuffer`). `serve.js` and `vercel.json` send COOP/COEP;
  GitHub Pages gets a vendored `coi-serviceworker` (MIT), registered only on devices that pass the probe.
- **The hand-written engine stays**, moved to `src/audio/native/`, sharing the one `AudioContext`. It is (a) the
  fallback where isolation or openDAW is unavailable, (b) the bridge while openDAW boots, so the first tap always
  sounds, (c) the **safety net**: any openDAW failure mid-session (a throwing transaction, a worklet error) switches
  to it at once, and (d) the player of the **timed interface phrases** (hello, mood arpeggio, dice preview), which it
  schedules exactly on the audio clock. One facade (`src/audio/engine.js`) keeps today's public `Engine` API.
- **The timing rule is kept, with no exception.** No note is ever released by a timer.
- **Licence:** openDAW is AGPL-3.0-or-later. `LICENSE` stays MIT and unchanged. Any deployment that includes the
  vendored bundle is distributed under AGPL terms (§12). **The owner must accept this before merging to `main`.**

---

## 1. Target architecture

### 1a. What openDAW owns, and what stays Itchy's

| Concern | Owner after the port | Notes |
|---|---|---|
| UI, plugins (`src/ui/**`), layout, critters | Itchy (unchanged) | `app.js` keeps calling `engine.sync()`, `drainEvents()`, `level()`, `playing` |
| Project format, `createLayer`, `createProject`, `migrate` | Itchy (unchanged) | No openDAW data is saved; no new project fields |
| Undo/redo (`store.change`, `store.seal`, `history.js`) | Itchy (unchanged) | openDAW edits keep no history (§1d) |
| Storage (IndexedDB recordings, songbook, autosave) | Itchy (unchanged) | No OPFS: Itchy's own in-memory sample manager (§4e) |
| Song sequencing, tempo, swing, loop lengths, transport | **openDAW** (WASM in the `AudioWorklet`) | Native `Scheduler` drives only the native backend |
| Instruments, effects, mixing, limiter for song and previews | **openDAW** | Playfield, Nano, Revamp, Delay, Zeitgeist, Convolver on an aux bus, master Maximizer |
| Timed interface phrases (hello, mood, dice preview) | **Native engine** on the shared context | Exact `start(t)` on the audio clock (§6b) |
| Sound design | Itchy (`instruments.js`, rendered to PCM) | Original sounds made in code |
| Interface blips (`uiSound`) | Itchy, plain Web Audio on the shared context | Not musical timing |
| Mic capture (`recorder.js`, `capture-worklet.js`) | Itchy, on the shared context | Clip handed to openDAW as in-memory PCM |
| Visual playhead | Itchy (`playhead.js`), from openDAW's `engine.position` | Same event shape as today |
| `AudioContext` | The facade creates it and passes it to openDAW (`ProjectEnv.audioContext`) and to the native engine | `engine.ctx` still reachable |

### 1b. Modules (new and changed)

```
index.html                     + classic <script>: capability probe + window.coi config, then coi-serviceworker.js,
                                 before the module script
coi-serviceworker.js           vendored, MIT, 0.1.7 + Itchy's guarded reload patch (§2)
vendor/opendaw/0.0.180/        generated by scripts/vendor-opendaw.mjs, committed, never edited by hand
  opendaw.js                   esbuild ESM bundle of scripts/opendaw/entry.js (1.87 MB, 424 KB gz)
  workers-main.js              from @opendaw/studio-core/dist (40 KB)
  wasm-processor.js            from @opendaw/studio-core-wasm/dist (1.34 MB, the engine worklet)
  wasm-offline-worker.js       lazy; offline render for checks and a future WAV export (1.36 MB)
  wasm/engine.wasm, wasm/plugins/*.wasm (34 files, all loaded at boot)
  VERSIONS.json                exact versions, each package's gitHead from its installed package.json,
                                 esbuild version, sha256 of every file
  LICENSE, NOTICE.md           AGPL text; notices, per-package source commits, rebuild instructions
scripts/vendor-opendaw.mjs     dev-only: installs pinned packages in a temp dir, bundles, copies, writes VERSIONS
scripts/opendaw/package.json   exact pins (+ esbuild 0.25.0) and package-lock.json
scripts/opendaw/entry.js       re-exports only the symbols Itchy uses
scripts/collect-site.mjs       copies exactly the shipped files into a folder; used by pages.yml and check.mjs;
                                 exports the list that .vercelignore must whitelist
src/audio/engine.js            FACADE: today's public Engine API; owns ctx, unlock, analyser; picks the backend.
                                 NO static import of anything under src/audio/opendaw/ or vendor/
src/audio/native/engine.js     today's engine.js, moved; takes an injected { ctx, out } (§1c)
src/audio/scheduler.js, ticker.js, instruments.js, recorder.js, capture-worklet.js   stay (shared)
src/audio/probe.js             pure capability probe (also inlined in index.html for coi gating; a test keeps
                                 the two identical)
src/audio/opendaw/boot.js      loaded only by `await import()` from the facade; dynamic-imports the bundle (§3)
src/audio/opendaw/engine.js    OpenDawEngine: same interface as the native engine
src/audio/opendaw/samples.js   in-memory SampleLoaderManager + PCM registry + UUID map (§4e)
src/audio/opendaw/apply.js     applies scene ops to the box graph (the only file touching boxes); library holder;
                                 failure detection (§1d)
src/audio/mirror.js            PURE: project JSON + sound info -> scene, diffScene(a, b) -> ops
src/audio/playhead.js          PURE: (position ppqn, tempo, latency, swing, layers) -> step events like today's
src/audio/render-sounds.js     renders Itchy's sounds to PCM with OfflineAudioContext and a seeded rng
```

`mirror.js`, `playhead.js` and `probe.js` import nothing from the SDK or the browser, so `node --test` covers them
with no install. (`phrases.js` from the draft is gone: §6b.)

### 1c. The facade (`src/audio/engine.js`)

It keeps every member the app, the checks and the screenshots script use (itchy-audio-map.md §3): `ensure()`, `ctx`,
`now`, `playing`, `play()`, `stop()`, `sync()`, `voice()`, `playStep()`, `preview()`, `uiSound()`, `drainEvents()`,
`events`, `level()`, `addRecording()`, `hasRecording()`, `buffers`, `on()`, `emit()`. New read-only fields for
checks and debugging: `kind` (`'native' | 'opendaw'`, can change from `'opendaw'` to `'native'` after a failure),
`ready` (a Promise that settles with the first final kind) and `openDaw` (the OpenDawEngine or null).

- **Context and unlock.**
  - If `probe()` passes and `crossOriginIsolated` is true and `?engine=native` is absent, the facade creates the
    context at load with `{ latencyHint: 'interactive' }` (it starts suspended) so openDAW can boot.
  - Otherwise the context is created exactly as today, lazily in the first gesture. Old iPads keep today's path.
  - `facade.ensure()` creates the context if needed, then, keyed on a `gestureUnlocked` flag (not on "context just
    created"), plays the 1-sample iOS unlock buffer **in the first gesture whatever the context's age**, and calls
    `resume()` if not running. It then calls `native.ensure()`, which now only builds its graph if not built.
- **The native engine changes beyond its imports** (stated, not hidden): its constructor takes `{ ctx, out }`;
  `build()` connects its limiter to `out` instead of `analyser → destination`; it creates no context and no
  analyser.
- **Output graph.** `nativeOut` (gain 1) and `uiBus` (gain 0.8) → `destination`, and both → the facade's single
  `AnalyserNode` (fftSize 512, `RMS × 3`). openDAW's `EngineWorklet` connects itself to `destination`
  ([verified] `Project.ts:313` at 9306eaab) and the facade adds `worklet.connect(analyser)` as a side tap.
- `preview()` and phrases call `this.voice(...)`, UI calls `engine.uiSound(...)`, so the check's counting wrapper
  still counts them. **One preview is exactly one `voice()` call.**
- **Routing inside `voice(layer, note, t, dur, preview)`** on the openDAW backend:
  - `t ≤ now + 0.02` → openDAW audition (§5).
  - `t > now + 0.02` → the native engine's `voice()`, which schedules with `start(t)` through that layer's native
    chain. The native engine's `sync()` is called on every facade `sync()` on both backends (it is cheap), so its
    chains always carry the critter's current charms. Its scheduler never runs while openDAW is the backend.
- **`playing` and the play/stop race.** `playing` is a synchronous flag. `play()` sets `playing = true`, takes
  `gen = ++this.gen`, awaits `ctx.resume()` only if suspended, and then sends `setPosition(0)` + `play()` **only if
  `gen === this.gen && this.playing`**, recording `sentPlay = true`. `stop()` sets `playing = false`, bumps `gen`,
  and sends `engine.stop(false)` only if `sentPlay` (then clears it). A stop while already stopped sends nothing,
  because at 9306eaab a stop on a non-transporting engine calls `engine.stop()`, which "rewinds to 0 + resets every
  plugin (voices, tails, detectors)" and would cut preview tails ([verified] `processor.ts:596-600` at 9306eaab).
- **Backend choice.**
  - Starts on **native**.
  - When the context is created at load, the facade calls `await import('./opendaw/boot.js')` inside a try, which
    in turn does `await import(VENDOR + 'opendaw.js')`. A load, parse or evaluation failure is caught there and
    never touches the UI module graph.
  - When boot resolves and the transport is stopped, the facade switches to **openDAW** and runs `sync()`. If music
    is playing, it switches on the next `stop()`.
  - Stays native, logging one `console.info` (never a warning), if: not isolated, probe fails, `?engine=native`,
    the import fails, `ensureReady` is false, a boot watchdog fires (10 s for `engine.isReady()` after the worklet
    starts; downloads themselves are not timed out, because the native bridge plays meanwhile), or the tab's
    `sessionStorage` crash flag is set (§4 of §3).
- **Failure at any time after the switch** (§1d.4): the facade switches to native at once, starts native playback
  if `playing`, terminates the openDAW project, and logs one `console.info`.

### 1d. The mirror: Itchy JSON → openDAW project (one way)

1. **`describe(project, env)`** (pure) builds a *scene* with every value in openDAW units:

   ```js
   { bpm, grooveAmount, units: [{ key: layerId, sound, instrument: 'playfield'|'nano', files: [<sampleKey>...],
       rootKey, volumeDb, loop: {enabled, start, end, fade} | null, regionMute, loopPpqn,
       revamp: { lp: {hz, q}, hp: {hz, q} },
       delay: { wetDb, feedback, filter }, spaceSendDb,
       notes: [{ key: 's,r', position, duration, pitch, velocity }] }], masterDb }
   ```

   `env` carries the catalogue facts: sample lengths, variant counts per drum piece, loop points, and which
   recordings are loaded.
2. **`diffScene(prev, next)`** (pure) returns ops: `addUnit`, `removeUnit`, `setFile` (same instrument type, e.g.
   bells → pluck: re-point `nano.file` and rewrite rootKey/loop), `replaceUnit` (kit ↔ tune: remove and add),
   `setField`, `addNote`, `removeNote`, `setNote`. Notes are keyed by `s,r`, which `migrate()` keeps unique.
3. **`apply.js`** runs the ops in **one `boxGraph.beginTransaction()` … `endTransaction()` per `sync()`**.
   - **The library holder** (fixes the mandatory-edge rule: an `AudioFileBox` with no incoming pointer makes
     `endTransaction()` throw, [verified] `AudioFileBox.js:16 mandatory: true` and `graph-edges.js:128`).
     A hidden unit `__library`, a Playfield with `audioUnitBox.mute = true` that never gets notes, holds one slot
     per `AudioFileBox`. Every file is created **in the same transaction as its holder slot**; built-in files at
     boot, a recording's file in the transaction that follows `addRecording`. The holder is never deleted, so
     critter units can be created, deleted and re-pointed freely and every file stays loaded in the worklet. The
     Space impulse is held by its Convolver, which is never deleted. A second holder is created past 120 slots
     (not expected: about 30 built-in files plus a handful of recordings).
   - **Devices are created so that no box is left orphaned**: `ZeitgeistDeviceBox.create(g, UUID.generate(), b =>
     { b.groove.refer(project.rootBoxAdapter.groove.box); b.index.setValue(0); b.host.refer(unit.midiEffects) })`.
     Never `EffectFactories.Zeitgeist.create` (it always makes a private `GrooveShuffleBox`, `useGlobal = false`
     [verified] `EffectFactories.js:70`; re-pointing would orphan it, `GrooveShuffleBox.js:12 mandatory: true`).
   - [spike, must; M1: passed] `createInstrument`, `createNoteRegion`, `createNoteEvent`, `insertEffect`, direct
     device creation and unit deletion all work in a bare transaction (and leave nothing to undo).
     `deleteAudioUnit` keeps a file that the holder still points at (M1), so apply.js uses it as it is, and the
     `project.editing.modify` fallback isn't needed.
   - When a transaction ends, its updates go to the WASM engine synchronously over the worklet port shared with
     the note signals, so a preview sent straight after `sync()` reaches the engine after the edits [verified
     `WasmEngine.ts:75-109` at 9306eaab: "SyncSource (unchanged) -> SYNCHRONOUS loopback"]. M1 confirmed it in the
     vendored bundle: the sync bytes are posted before `endTransaction()` returns, ahead of the next command.
4. **Failure handling.** apply.js wraps every transaction. If `endTransaction()` (or any op) throws, it calls
   `onFatal(err)`; the facade falls back to native (§1c). The facade also passes
   `startAudioWorklet({ unload: e => onFatal(e), load: () => {} })`: openDAW's own handler for the worklet's
   `error` and `processorerror` events calls `restart.unload`, and because `onFatal` terminates the project first,
   openDAW does not restart the worklet ([verified] `Project.ts:296-312` at 9306eaab). Note that openDAW's handler
   logs `console.warn(event)` first; that one warning is expected only in the forced-failure checks.
5. `sync()` stays cheap: at most 6 units × 256 notes are described and diffed on a charm or tempo drag move, and only
   changed fields are written.

---

## 2. Tooling (the least possible)

- **Import map: not feasible** (runtime.md §1). esm.sh / jsDelivr `+esm` rejected: a third-party runtime
  dependency that sees children's IP addresses, and module workers must be same-origin anyway.
- **One-off vendoring step**, logged in CONCEPT.md:
  - `scripts/vendor-opendaw.mjs` (Node ≥ 18, run by hand only when upgrading):
    1. Copies `scripts/opendaw/package.json` + `package-lock.json` into `os.tmpdir()/itchy-opendaw-<hash>` and runs
       `npm ci --ignore-scripts` there. Itchy never gets a `node_modules`.
    2. esbuild JS API: `bundle, format: 'esm', platform: 'browser', target: 'es2022', minify: true,
       external: ['@ffmpeg/ffmpeg', '@ffmpeg/util'], legalComments: 'eof'`, entry `scripts/opendaw/entry.js`.
    3. Copies `workers-main.js`, `wasm-processor.js`, `wasm-offline-worker.js` and `dist/wasm/{engine.wasm,
       plugins/*.wasm}` into `vendor/opendaw/<sdkVersion>/`, deleting the previous version folder.
       `processors.js` and `stretch_wasm.wasm` are left out (the smoke test booted and played without them).
    4. Writes `VERSIONS.json`: versions, **each package's `gitHead` read from its installed `package.json`**, the
       repo URL, the esbuild version, sha256 per file. Writes `LICENSE` (AGPL text from the package) and
       `NOTICE.md`, which lists the same per-package commits as the Corresponding Source.
    5. Determinism check: a second run must give byte-identical output.
  - `entry.js` exports only what Itchy uses: lib-std `UUID`, `Option`; lib-dsp `PPQN`, `AudioData`; lib-dom
    `AnimationFrame`; studio-adapters `InstrumentFactories`, `NoteSignal`, `AudioBusFactory`, `BpmDetector`;
    studio-boxes `AudioFileBox`, `AuxSendBox`, `ZeitgeistDeviceBox`, `PlayfieldSampleBox`; studio-enums
    `AudioUnitType`, `IconSymbol`, `AudioSendRouting`, `Colors`; studio-core `Project`, `Workers`, `AudioWorklets`,
    `SampleService`, `EffectFactories`, `OfflineEngineRenderer`, `DefaultSampleLoader`; studio-core-wasm
    `WasmEngine`; studio-sdk `OPENDAW_SDK_VERSION`.
- `package.json` gains **no dependencies**; CI's unit job still runs `npm test` with no install. Add
  `"vendor:opendaw": "node scripts/vendor-opendaw.mjs"`.
- `.gitattributes`: `vendor/** -diff linguist-vendored`, `coi-serviceworker.js linguist-vendored`.
- **Dependabot.** GitHub scans every `package-lock.json`, so `scripts/opendaw/package-lock.json` (70 packages,
  including y-websocket's deprecated `level*` tree, none of which reaches the browser) will raise alerts. Update the
  comment in `.github/dependabot.yml` to say so, and add **no** npm ecosystem entry: a lock bump without re-vendoring
  would desync `VERSIONS.json` (and fail `vendor.test.js`). Alerts are handled at the next deliberate upgrade.
- Cost: each SDK upgrade adds about 6.5 MB to git history. Logged.

### Cross-origin isolation and deployment

| Where | Change |
|---|---|
| `scripts/serve.js` | COOP `same-origin` + COEP `require-corp` on every response; `.wasm` → `application/wasm`, `.map`; `startServer(port, { isolate = true, root })` so checks can serve without headers and serve a collected site. |
| `vercel.json` | `headers` block with both headers for `/(.*)`. Checked on the first PR preview. |
| `scripts/collect-site.mjs` | Exports `SHIPPED = ['index.html','manifest.webmanifest','styles.css','src','assets','vendor','coi-serviceworker.js']` and copies them to a folder. |
| `.github/workflows/pages.yml` | Replaces the `cp -r` line with `node scripts/collect-site.mjs _site`. |
| `.vercelignore` | Whitelists `vendor` and `coi-serviceworker.js`; `tests/deploy.test.js` asserts it whitelists every `SHIPPED` entry and that `pages.yml` calls `collect-site.mjs`. |
| GitHub Pages | `coi-serviceworker.js` at the site root (scope `/itchy/`). `index.html` before the module: an inline classic script defining `window.itchyProbe()` (the same body as `src/audio/probe.js`: `Promise.withResolvers`, `AudioWorkletNode`, a SIMD `WebAssembly.validate` probe) and `window.coi = { quiet: true, coepCredentialless: () => false, shouldRegister: () => !crossOriginIsolated && itchyProbe() && !/[?&]engine=native/.test(location.search) }`, then `<script src="coi-serviceworker.js">`. `require-corp` everywhere because Safari lacks `credentialless`. Devices that can never run openDAW are never reloaded and get no service worker. |

**Reloads.** Stock 0.1.7 can already reload twice (`updatefound` and "active but no controller"; the reviewer saw
two reloads in 3 of 6 runs). Itchy's patch adds one more reload **only** in the disjoint case that a controller
exists but the page is still not isolated, guarded by a `sessionStorage` flag (wrapped in try/catch). So a first
visit is at most three loads. M1 measures the navigation count over 20 cold runs and the docs say "one or two
reloads".

**Two safety nets in `index.html` (added in M1).** Playwright's Linux WebKit, on a header-less server, sometimes
broke the first visit: 4 of 140 runs ended on a blank page. Two causes were seen: a reload made while the service
worker starts is dropped (the page stays, its scripts cancelled, and no new page arrives), and, just after the
worker starts, every file it fetches fails ("WebKit encountered an internal error"). Whether real Safari does this
is unknown; the real-iPad checklist (M5) watches for it. So `window.coi.doReload` reloads again if the page is still
there after 1.5 s, 3 s, then 4.5 s (a reload that works replaces the page and its timer), and a capture-phase
`error` listener reloads when one of the page's own scripts or stylesheets fails to load, at most twice per tab (a
`sessionStorage` counter, cleared by a clean `load`). Neither fires on a normal visit.

COEP has no effect on Itchy's own assets (font, Blob-URL ticker worker, capture worklet are same-origin;
runtime.md §3). It rules out cross-origin embeds in future; logged.

**Cache coherence.** Pages serves everything with `max-age=600`. The versioned folder means a new `boot.js` never
mixes with an old worklet or WASM. A stale `boot.js` that asks for a deleted old folder gets 404s and falls back to
native for that visit.

---

## 3. Boot sequence (`src/audio/opendaw/boot.js`)

Started by the facade at page load, only when the context was created at load (§1c), and always through
`await import()`.

1. **Probe** (`probe.js`): `crossOriginIsolated`, `AudioWorkletNode`, SIMD `WebAssembly.validate`,
   `Promise.withResolvers` (roughly Safari/iPadOS 17.4+, Chrome 119+, Firefox 121+). Missing → native.
2. **Crash guard:** if `sessionStorage['itchy-opendaw-booting']` is set, the previous load in this tab died during
   or shortly after boot (for example an iPad memory-pressure reload) → native for this tab. Otherwise set it, and
   clear it 20 s after `ready`.
3. `const od = await import(VENDOR + 'opendaw.js')` where `VENDOR` is the absolute URL of
   `vendor/opendaw/0.0.180/` (works under `/itchy/`).
4. In order: `od.AnimationFrame.start(window)` (otherwise `engine.position` never moves);
   `await Workers.install(VENDOR + 'workers-main.js')`; `audioWorklets = new AudioWorklets(ctx)`;
   `WasmEngine.install({ processorUrl, offlineWorkerUrl, wasmUrl })` (the `{processorUrl, offlineWorkerUrl,
   wasmUrl}` shape is the published one, [verified] `WasmEngine.d.ts` 0.0.25; `wasmUrl` is the folder that contains
   `wasm/`, no trailing slash); `await WasmEngine.ensureReady(ctx)`, false → native.
5. **In parallel with 4:** render Itchy's sounds (`render-sounds.js`, §4) and compute every built-in UUID:
   `await UUID.sha256(new TextEncoder().encode('itchy-sound:<id>:<variant>:<SOUND_VERSION>').buffer)`
   ([verified] `lib-std/dist/uuid.js:8`: async, takes an `ArrayBuffer`). The PCM and UUIDs go into
   `samples.js`'s maps, which apply.js reads synchronously.
6. **Create the project:** `Project.new({ audioContext: ctx, audioWorklets, sampleManager: itchySamples,
   soundfontManager: stub, sampleService: new SampleService(ctx, BpmDetector.Unknown), soundfontService:
   throwingProxy })` (`SoundfontService`'s constructor fetches a remote catalogue; sdk-api.md §3). Then, in one
   transaction: the `__library` holder with every built-in `AudioFileBox` in its slots; the Space aux bus with its
   Convolver and impulse file; master volume; the timeline (§4h). (No metronome step: the metronome is an engine
   preference that defaults to off, [verified] `EnginePreferencesSchema.js:7-17`. The M1 probe asserts
   `project.engine.preferences.settings.metronome.enabled === false`; nothing writes preferences, which would
   persist to localStorage.)
7. `worklet = project.startAudioWorklet(restart)` (§1d.4), `worklet.connect(analyser)`, then
   `await withTimeout(project.engine.isReady(), 10 s)` and `await project.engine.queryLoadingComplete()`.
8. Create **tray units** (§6c) lazily on first use.
9. Resolve. The facade switches on the next stopped moment and runs `sync()`.

**Download.** The boot set is `opendaw.js` 1.87 MB, `wasm-processor.js` 1.34 MB, `workers-main.js` 40 KB,
`engine.wasm` 1.23 MB and plugins 720 KB: **5.2 MB raw, about 1.41 MB gzipped**. GitHub Pages gzips JS but not
`.wasm`, so a first visit there transfers about **0.71 MB of gzipped JS + 1.95 MB of raw WASM ≈ 2.7 MB**, about 65
times today's 41 KB. The offline worker (1.36 MB) is fetched only by `renderOffline`. The browser cache serves
repeat visits. A classroom of 30 devices fetches about 80 MB on first use; logged. There is no loading screen: the
native engine plays until openDAW is ready.

---

## 4. Sounds: what each Itchy sound becomes

**Principle:** `instruments.js` synthesises every built-in sound; openDAW only *plays* the result. Sounds stay
original and made in code.

`render-sounds.js` renders each sound with `OfflineAudioContext(1, n, ctx.sampleRate)`, calling
`playDrum`/`playTune` exactly as the engine does, in well under 100 ms in total, once per boot.

- **Seeding.** `instruments.js` gains an optional `rng` argument (default `Math.random`) used by **both** the noise
  buffer and `noiseSource`'s start offset (`src.start(t, rng() * 0.5)`, today `Math.random()`;
  `instruments.js:21`) and by `makeImpulse`. `render-sounds.js` passes a mulberry32 with a fixed seed per sound and
  variant. The **native engine keeps `Math.random`**, so its hits still vary as today. A check renders every sound
  twice and compares the PCM byte for byte.
- **Noisy drum variants.** Snare, clap and hat use `noiseSource` (`instruments.js:57,76,81,96`), so today every hit
  differs. To avoid a "machine-gun" hat, each noisy piece is rendered as **4 seeded variants**; pieces without noise
  get 1.
- **The impulse is stereo**: `makeImpulse` builds 2 channels of independent noise (`instruments.js:194-201`). It is
  registered as **2-channel** `AudioData` to keep the reverb's width.

| Itchy sound | openDAW instrument | PCM rendered | Notes, velocity, length |
|---|---|---|---|
| `kit` rows 0-3 kick, snare, clap, hat | **Playfield**; slot note `36 + 4·r + v` (v = variant 0..3; kick only v = 0); every slot `gate = 0` (Off: one-shot) and **`polyphone = true`** (default false would cut a retriggered hit, [verified] `PlayfieldSampleBox.js:218-230`, no default value) | `playDrum(kit, r)` at vel 1, 0.6 s, per variant | Sequenced notes use `v = s mod variants`, so neighbouring hits differ; previews rotate a counter. Velocity from the note (M1: Playfield velocity→gain is linear, peaks 1 : 0.5 : 0.25 for velocity 1, 0.5, 0.25, and a slot at 0 dB is unity gain, so no pre-shaping). Length, octave, key, mood ignored, as today. |
| `tinykit` | **Playfield**, its own unit and files | `playDrum(tinykit, r)` | as above |
| `bells` (base 72) | **Nano**, `rootKey` = reference pitch 79 | `playTune('bells', 79)`, 1.8 s | One-shot (§4d). Attack 0.001 s, release 0.05 s. |
| `pluck` (base 60) | **Nano**, rootKey 67 | `playTune('pluck', 67)`, 1.0 s | One-shot. |
| `bass` (base 36) | **Nano**, rootKey 43, **`loop` on** over a steady segment of the hold, `loopFade` 0.05 s | `playTune('bass', 43)` with a 1.5 s hold | **Honours `len` at any pitch and tempo**: duration `max(0.9·len·240, secondsToPulses(0.12))`; the voice cycles the loop until note-off, then releases. Release 0.12 s. |
| `cloud` (base 60) | **Nano**, rootKey 67, `loop` on, `loopFade` 0.1 s | `playTune('cloud', 67)` with a 2.5 s hold | duration `max(len·240, secondsToPulses(0.5))`. Attack 0.001 s (the 120 ms fade-in is baked in), release 1.0 s. |
| `rec:<id>` (mic) | **Nano**, `rootKey` 60 | the recorded clip (§9) | `pitch = 60 + rowSemitones(r) − rowSemitones(3) + 12·octave`; whole clip (§4d). Attack 0.004 s, release 0.03 s. |

**Every Nano unit sets `volume = 0 dB`.** The default is −3 dB ([verified] `NanoDeviceBox.js:146`), which would
make tunes and recordings 3 dB quieter than their PCM (the reviewer's spike: a 0.5 sine peaked at 0.354).

**Why loops for bass and cloud.** Nano repitches by read rate `2^((pitch−rootKey)/12)` [verified at 9306eaab:
`device-nano/src/voice.rs`, unchanged from the clone]. The pitch range relative to row 3 is −7..+21 semitones with
`key` (0..11), and −31..+45 with `octave` (−2..2, `project.js:148`, no UI yet), while `len` can be 32 steps at
60 BPM (8 s). No fixed hold covers that (+21 st needs 27 s of sample). Nano's crossfaded loop (`loop`,
`loopStart`, `loopEnd`, `loopFade` fields, present in the published `NanoDeviceBox`; voice.rs: a voice finishes
only when "the region ran out unlooped, or the release elapsed") sustains any length. [M1: a 4 s note on a 1 s
sample with a crossfaded loop sustains at full level with no sample jump larger than the sine's own, and is silent
after the release; audible loop quality is judged in the listening check.] **Fallback** if the loop is not clean:
a Vaporisateur preset written in code
(saw+sine with filter envelope; detuned saw/triangle unison 3 ± 9 ct, attack 0.12 s, release 1 s).

**Pitch for tunes:** `pitch = base + rowSemitones(r, mood) + key + 12·octave`, clamped to 0..127, as in
`engine.voice()`. Recordings at any sample rate work (Nano corrects with `rate_ratio`). Tune envelopes speed up or
slow down with pitch (×0.6 to ×3.4 across rows and keys); new for bells and pluck, judged in the listening check.
**Fallback for bells:** two reference pitches (rows 0 and 5) as two files, the mirror picking the nearer (`setFile`
per note is not possible, so two Nano units per bells critter).

### 4a. Velocity

Nano's gain is `playback.gain · velocity`, linear like Itchy's [verified at 9306eaab: `device-nano/src/voice.rs:129`].
`vel` (0.05..1) becomes `velocity` unchanged.

### 4b. Volume, mute, octave, key, mood

- `layer.volume` (0..1, no UI) → `audioUnitBox.volume = max(-96, 20·log10(volume))` dB; applies to loop and
  previews, as today.
- `layer.muted` ("asleep") → **`NoteRegionBox.mute = true`**, not `audioUnitBox.mute`. A muted region emits no
  notes, but auditions are emitted before the transport gate and still sound [verified at 9306eaab:
  `note_sequencer.rs:8,195`]. Keeps "Taps and previews skip mute". Difference: loop notes already ringing finish
  instead of a 30 ms duck.
- `octave`, `key` and `mood` fold into each `NoteEventBox.pitch`. A mood or key change rewrites every tune note's
  pitch in one transaction (at most about 1500 field writes).

### 4c. Notes and loop lengths

- One `NoteRegionBox` per unit: position 0, `loopDuration = steps·240` (`PPQN.SemiQuaver` = one step), `duration`
  2^30 pulses (M1: the timeline keeps playing and sounding past `durationInPulses`, 491520 by default, so it is
  left alone).
- The timeline `loopArea` stays **disabled**: a transport wrap releases held notes, region cycles do not, and a note
  keeps its full duration across a cycle end by default (`truncateNotesAtRegionEnd` false) [verified at 9306eaab:
  `note_sequencer.rs:112-115`]. Matches today.
- All regions run off the same global position, so units with different `steps` phase exactly as
  `index % layer.steps` does today.
- Each note: `NoteEventBox { position: s·240, duration, pitch, velocity: vel }`, owner = the region.
- Overflow: int32 pulses last about 9.7 days at 160 BPM.

### 4d. Note duration rules (the mirror computes them)

- **One-shot** (bells, pluck, recordings): `ceil(sampleSeconds / rate · 16·TEMPO_MAX)` pulses with the note's own
  `rate`, so the note never ends before the sample at any tempo.
- **Sustained** (bass, cloud): as in the table; looped, so any length works. Seconds-based minimums are recomputed
  on tempo changes.
- **Drums**: 240 pulses (gate Off ignores note-off).

### 4e. In-memory samples, with no OPFS

`samples.js` implements `SampleLoaderManager` (five methods [verified: `studio-adapters/dist/sample/
SampleLoaderManager.d.ts`]) with the exported `DefaultSampleLoader`, calling `setLoaded(audioData, peaks, meta)`
from a `Map` keyed by UUID string.

- Peaks: the bundle's own empty `SamplePeaks.None` (M1: works; every probe sample loads and sounds with it), so
  `Workers.Peak.generateAsync` isn't needed.
- Avoids `GlobalSampleLoaderManager`, which writes every sample to OPFS, `console.warn`s on failure and never cleans
  up. Fallback: that manager with stable UUIDs plus a boot-time sweep of unknown `samples/v2` entries.
- UUIDs are computed asynchronously **before** any `sync()` needs them: built-ins at boot (§3.5), recordings inside
  the async `addRecording()` before its `sync()` (§9). apply.js only reads the map.
- PCM is copied into `AudioData.create(sampleRate, frames, channels)` (SharedArrayBuffer-backed); 1 channel for
  sounds and recordings, 2 for the impulse.
- An `AudioFileBox` is never created before its PCM is registered (otherwise the loader errors and warns).

### 4f. Effects ("charms")

Chain per critter unit: **Zeitgeist (MIDI) → instrument → Revamp → Delay**, plus an `AuxSendBox` to Space, built
once when the unit is created. **M1 found that toggling `enabled` clicks** (Delay and a Revamp pass, while a tone
sounds), so, like today's native chain, the devices stay enabled at neutral values: the Revamp low-pass at 20 kHz and
high-pass at 20 Hz (Revamp's range is 20 Hz to 20 kHz) when the tone doesn't use them, and the Delay at
`wet = −∞` dB, `feedback = 0` when echo is 0. `enabled` is never toggled.

| Itchy charm | openDAW mapping (same formulas as `applyLayer`) |
|---|---|
| **Tone**, at unit creation | `EffectFactories.Revamp` defaults are order 1 (24 dB/oct) on both passes and the high-pass **on** at 40 Hz ([verified] `EffectParameterDefaults.js:7,9,24`). apply.js sets `highPass.order = 0`, `lowPass.order = 0` (order is 0..3 → 1..4 biquad sections, so 0 = one 12 dB/oct biquad) and `highPass.enabled = true`, `lowPass.enabled = true` explicitly, at their neutral ends (next rows; corrected in M2: the earlier "both disabled" predates M1's finding that `enabled` clicks). |
| **Tone** `tone < 0` (dark) | `lowPass.enabled = true`, `frequency = clamp(180·2^((1+tone)·6.8), 20, 20000)`, `q = 0.7 + 5·(−tone)` |
| **Tone** `tone > 0` (bright) | `highPass.enabled = true`, `frequency = clamp(20·2^(tone·7.3), 20, 20000)`, `q = 0.7 + 4·tone` |
| **Tone** `tone == 0` | both passes stay enabled at neutral (low-pass 20 kHz, high-pass 20 Hz, `q = 0.7`), as native keeps its biquads at 20 kHz / 10 Hz; never toggled (M1: `enabled` clicks) |
| **Echo** `e` | `Delay.delayMusical = 13` (3/16, follows the tempo). `feedback = e > 0 ? 0.3 + 0.42·e : 0`; `wet = 20·log10(0.75·e)` dB; `dry = 0`; `cross = 0` (default 1.0 is ping-pong); `preSyncTimeLeft = preSyncTimeRight = 0` (default left is index 8); `delayMillis = 0`; `filter = log(3500/20)/log(1000) − 1 = −0.2523` (M1 measured: `filter < 0` is a low-pass on the echo at `20·1000^(1+filter)` Hz, Q 0.707, so −0.2523 is 3.5 kHz; −3.4 dB there, −16 dB at 8 kHz). `e == 0` → `wet = −∞`, `feedback = 0`, still enabled (M1: toggling clicks). Index table and defaults re-checked in M1 against the vendored dist (`DelayDeviceBoxAdapter.Fractions`: index 13 = 3/16, 8 = 1/16; defaults `delayMusical` 13, `feedback` 0.5, `cross` 1, `filter` 0, `wet` −6 dB, `dry` 0 dB, `preSyncTimeLeft` 8, `preSyncTimeRight` 0). |
| **Space** `sp` | One aux bus "Space" (`AudioBusFactory.create(skeleton, 'Space', IconSymbol.Effects, AudioUnitType.Aux, Colors.green)`) with a **Convolver** whose file is the stereo seeded impulse (2.4 s): `normalize = true`, `wet = 0 dB`, `dry = −∞`; aux volume `20·log10(0.9)`. Each critter: `AuxSendBox { routing: Post, sendGain: 20·log10(1.1·sp) }`, −∞ when `sp == 0`. The echo also feeds the reverb (post-chain send); logged. ReverbDeviceBox is the fallback. |
| Master | `primaryAudioUnitBox.volume = 20·log10(0.8)` dB. openDAW's default master Maximizer replaces the DynamicsCompressor; its **5 ms lookahead** (a bool field, on by default; [verified at 9306eaab] `device-maximizer/src/lib.rs:7,37`) stays on and is counted in the latency budget (§10b). **Never use the Compressor device** (GPL, outside the commercial licence). |

Charm drags write a few float fields per move. **M1 measured** (largest sample jump on a 440 Hz tone, steady about
0.05): Delay `feedback` and unit `volume` are smoothed (0.05 during six abrupt writes), but Revamp `frequency`
(600 ↔ 2000 Hz: 0.56) and Delay `wet` (−20 ↔ −3 dB: 0.38) are **not**. Drag-sized writes, one per animation frame,
stay close to steady (wet 0.5 dB a frame: 0.075; low-pass 3% a frame: 0.10). So apply.js writes charm fields at most
once per animation frame (never notes), and when a value jumps further than that (undo, dice, opening a song) it
glides Revamp `frequency`/`q` (in octaves) and Delay `wet` (in dB) over about 100 ms of frames, like native's 30 ms
`setTargetAtTime`. Send gain wasn't measured in M1; it gets the same glide unless M3 measures it smoothed. The
listening check (§10c) confirms.

### 4g. Swing

`project.swing` (0..1, no UI) maps to the **Zeitgeist** on every critter unit, whose `groove` points at the box
`project.rootBoxAdapter.groove.box` (`rootBox.groove` is itself a pointer, so its target is used). That global
`GrooveShuffleBox` has `duration = 480` (one eighth) and

  **`amount = (0.5 + swing/4 − 0.01) / 0.98`** (swing 0 → 0.5, 0.5 → 0.627551…, 1 → 0.755102…).

- Why: openDAW squashes the stored amount, `h = squashUnit(amount, 0.01) = 0.01 + 0.98·amount` ([verified]
  `lib-std/dist/math.js:8`, `GrooveShuffleBoxAdapter.js:35`, and `device-zeitgeist/src/lib.rs:53-70` at
  9306eaab), and warps each cell with `moebiusEase(x, h)`, where `moebiusEase(0.5, h) = h`. The inverse mapping
  puts the odd sixteenth at `0.5 + swing/4` of the cell, which is today's `swing·dur·0.5` delay. Without it the
  reviewer measured 3528 samples instead of 3600 at swing 1 (100 BPM, 48 kHz); with it, 3599.
- It works on absolute positions, so it swings on global step parity, as today.
- Swing 0 gives `h = 0.5` exactly (straight). M1 rendered it offline (16 onsets, 100 BPM): straight within 1 sample
  at swing 0, and the corrected formula within 1 sample at swing 0.5 and 1 (the uncorrected amount puts the odd step
  3528 samples late at 1 instead of 3600, as the reviewer found), so the device stays enabled at 0.

### 4h. Tempo and transport

- `project.tempo` → `timelineBox.bpm` on every `sync()` that changes it; takes effect at the next quantum.
- **Play:** `engine.setPosition(0)`, then `engine.play()`, guarded by the generation token (§1c).
- **Stop:** `engine.stop(false)` while transporting pauses: held notes are released and echo and reverb tails ring
  out. In the shipped 0.0.25 worklet, `stop(true)`, or any stop while not transporting, calls `engine.stop()`, which
  rewinds and **resets every plugin at once** (no fade; the clone's `stop_faded` doesn't exist in 0.0.25:
  `grep -c stop_faded dist/wasm-processor.js` = 0). The facade therefore never sends a stop while not transporting.
  M1 confirmed: `stop(false)` holds the position, `setPosition(0)` while paused moves it to 0, `play()` restarts
  from 0, and a Nano tail keeps sounding after the stop.

---

## 5. Instant previews ("every action makes a sound immediately")

- `preview(layer, row, vel)` calls `this.voice(layer, {r: row, vel, len: 2}, now + 0.01, stepDur, true)`, as today.
  On openDAW a `voice()` at `t ≤ now + 0.02` sends `engine.noteSignal(NoteSignal.audition(unitUuid, pitch,
  durationPpqn, vel))` **synchronously**, heard at the next render quantum plus the Maximizer's 5 ms lookahead, with
  the transport stopped or playing and the region muted or not.
- Before the first gesture the context is suspended, so nothing sounds anyway; the first gesture's `ensure()`
  resumes it before the audition.
- **The first tap before openDAW is ready** plays on native.
- **Choosing a new sound and previewing it in one tap** (`panel.js:88-90`): `store.change` → `sync()` re-points the
  file or replaces the unit in one transaction → the audition. Ordering is guaranteed (§1d.3), and the sample is
  already loaded because the library holder keeps every built-in file loaded (§1d.3). [spike, must; M1: passed.
  An audition in the same task as unit creation, and after delete-then-recreate, is heard, so no microtask delay
  is needed.]

---

## 6. Phrases, tray previews

### 6a. Interface layers

`__hello` and `__mood` stay **native-only** chains, exactly as today. No hidden openDAW interface units.

### 6b. Timed phrases (hello, mood arpeggio, dice preview)

They call `voice(layer, note, t0 + k·dt, …, true)` with times up to 0.7 s ahead. openDAW can't schedule a live
note at a future audio time (note signals play at the next block). The facade sends every `voice()` with
`t > now + 0.02` to the **native engine on the shared context**, which schedules it exactly with `start(t)` through
that layer's native chain with the same charms. No timer releases notes; the timing rule holds unchanged.

Trade-off (logged): these phrases are heard through the native mix and limiter rather than openDAW's, so a dice
preview of a critter can differ slightly from the same notes in the song. The §10c parity check bounds it (RMS
within ±3 dB per sound). Long-term: `NoteSignalOn` has a `timeStamp?` field the processor ignores; once honoured
upstream, phrases can move to openDAW.

### 6c. Previews from the sound tray (`panel.js:83`: `{...layer, sound}`)

A tray tap previews a sound the critter doesn't have, through that critter's charms. It is immediate, so it goes to
openDAW. The facade keeps one hidden **tray unit** per sound (same chain as a critter unit, created lazily, its
file held by the library). On a tray preview it copies the critter's `volume`, `fx` and `octave` into the tray unit
in one small transaction, then sends the audition: still one `voice()`. At most 6 tray units for built-in sounds
plus 4 for "my sounds".

---

## 7. Visual sync from openDAW's playhead (`playhead.js` + facade)

- Every animation frame, `drainEvents()` reads `engine.position` (pulses, updated each rAF via `AnimationFrame`),
  subtracts `lat = min(0.2, ctx.outputLatency || ctx.baseLatency || 0)` in pulses at the current tempo, as today.
- Step `i` is due when the compensated position passes `i·240`; odd steps at `i·240 + 120·swing`.
- For each newly due index the facade calls `this.playStep(i, time, dur)`, pushing `{time, index, dur, steps,
  hits}` as today (`hits` from `notesAtStep`, muted layers left out). `app.js` needs no changes.
- Edge cases (unit-tested): several steps in one frame emitted in order; a jump of more than 8 steps emits only the
  latest; a backwards position resets; stop clears.
- `ctx.suspend()` freezes the worklet, so the playhead holds still for `screenshots.mjs` `playTo()` (M1: position
  frozen, `isPlaying` stays true, no warning, moves again after `resume()`).
- `level()` reads the facade's analyser (§1c).

---

## 8. Interface blips

`uiSound(kind)` stays plain Web Audio into `uiBus` (0.8) → destination and the analyser, identical on both
backends; peak ≤ 0.18, so no limiting needed.

---

## 9. Mic recordings

- `recorder.js` and `capture-worklet.js` are unchanged and run on the shared context (`engine.ensure()` returns it);
  the `itchy-capture` module coexists with openDAW's processor. `processClip` stays pure.
- `async addRecording(id, {sampleRate, data})`:
  1. Feeds the native engine (its own `AudioBuffer`), so a fallback never loses a clip.
  2. Copies the PCM into `AudioData`, `await`s `UUID.sha256(new TextEncoder().encode('itchy-rec:' + id).buffer)`,
     registers it in `samples.js`.
  3. Records `buffers.set(id, audioData)`.
  4. Calls `sync()`; that transaction creates the recording's `AudioFileBox` in a new library slot, then any unit
     that uses it.
- A critter whose sound is `rec:<id>` gets a Nano unit (volume 0 dB) pointing at that file. If the PCM isn't
  registered yet (song opened before IndexedDB answered), the mirror creates the unit **without notes** and fills
  them on the `sync()` after `addRecording`, matching today's "silently skipped until loaded".
- "Recording pauses the music" is unchanged UI timing.
- The project JSON still holds only `rec:<id>`; the PCM stays in IndexedDB.

---

## 10. Test strategy

### 10a. `npm test` (node --test, no install)

- `tests/scheduler.test.js` stays (the native engine still uses the scheduler); header reworded.
- **`tests/mirror.test.js`**: `s·240` positions, `loopDuration`, muted regions; drum slot notes `36 + 4r + v` and
  `v = s mod variants`; tune pitches for every mood with key and octave, clamped; recordings (rootKey 60, key
  cancels); dB conversions (volume 0 → −96, space 0 → −∞); Nano volume 0 dB on every Nano unit; Revamp orders 0 and
  both passes enabled at neutral (M2: corrected from "disabled at creation", see §4f); Playfield `polyphone` true on every slot; echo and tone formulas; **swing:
  `amount(0) = 0.5`, `amount(0.5) = 0.6275510…`, `amount(1) = 0.7551020…`, and `squash(amount(s))` puts the odd step
  at `0.5 + s/4`**; one-shot and sustained durations at 60 and 160 BPM; **a len-32 note at 60 BPM on the top row
  with key 11 and octave +2 either has `loop` enabled or never runs past its sample**; `diffScene` (no-op on an
  identical scene, one field write for a charm move, note add/remove, mood change rewrites only pitches (and the one-shot
  lengths that follow them), same-type
  sound change → `setFile`, kit ↔ tune → `replaceUnit`, removing a layer removes the unit); every example song and
  `createProject()` gives a valid scene; **every file a unit references is in the library list** (no orphan
  possible by construction).
- **`tests/playhead.test.js`**: consecutive indices, latency and swing thresholds, per-layer wrap (16, 12, 10),
  large jumps, backwards reset, muted layers get `steps` but no `hits`.
- **`tests/probe.test.js`**: `src/audio/probe.js` and the inline probe in `index.html` have the same body.
- **`tests/vendor.test.js`**: `VERSIONS.json` versions match `scripts/opendaw/package.json`; every package entry
  has a 40-hex `gitHead` and `NOTICE.md` lists the same commits; the folder name equals the SDK version and equals
  `VENDOR` in `boot.js`; every file exists with its sha256; all 34 plugins present; `LICENSE` and `NOTICE.md` exist;
  no `wss://`/`https://` fetch targets besides known unused ones; `index.html` loads the probe and
  `coi-serviceworker.js` before the module, and `window.coi` sets `quiet: true`; **no file under `src/` other than
  `src/audio/opendaw/**` mentions `vendor/`, and `src/audio/engine.js` has no static import from `./opendaw/`**.
- **`tests/deploy.test.js`**: `.vercelignore` whitelists every `SHIPPED` entry; `pages.yml` runs
  `collect-site.mjs`.
- `tests/apply.test.js` (decided in M1: yes). The bundle imports in Node with two stubs (`AudioWorkletNode` and
  `localStorage`), and `Project.new` builds a real box graph there (`tests/vendor.test.js` shows it), so apply.js's
  ops are unit-tested against openDAW's own boxes, with no worklet.

### 10b. `npm run check` (Playwright)

- **Every path that opens or reloads a page** (`openPage()`, `delights()` p2, the reloads in `recording()` and
  `smallScreens()`, `safariLayout()`) goes through one helper that awaits `itchy.engine.ready` and asserts `kind`
  (`'opendaw'` on the isolated server).
- **The sound hook proves sound, not just calls.** It still counts `voice` and `uiSound`. On the openDAW backend,
  when the transport is stopped, `actionCheck` also requires the output to rise above a threshold within 50 ms of the
  counted call, read from a test-only `AudioWorklet` tap (a Blob-URL module, same-origin) on the analyser input that
  reports the `ctx.currentTime` of the first non-silent frame.
- **Latency probe** on both backends: grid tap, tray tap and sound change, from `pointerdown` (its `ctx.currentTime`
  captured in a capture-phase listener) to the first non-silent frame. Budget: **openDAW ≤ native + 10 ms**
  (includes one quantum and the Maximizer's 5 ms lookahead). Numbers go in the PR.
- **`playback()` redesigned:**
  1. Step stream: wrap `e.playStep`; ≥ 20 steps in 3.5 s, consecutive, layer 0 wraps 15 → 0.
  2. Tempo slope: `(ctx.currentTime, engine.position)` over 2 s equals `16·tempo` pulses/s within 0.5%, also after
     a change to 140 BPM.
  3. Sample-exact grid: `itchy.engine.renderOffline(steps)` (also the future WAV export) renders a copy of a test
     song (Playfield click every step, 100 BPM) via `OfflineEngineRenderer.renderSection(project.copy(), …)`. Every
     onset within ±2 samples of `k·stepSamples` (after the measured constant onset latency); with swing 1, odd
     onsets at `+0.5·stepSamples` ±2.
  4. `peakLevel > 0.01`.
  5. Stop: `playing === false` at once, no `playStep` after 150 ms, playhead gone, `level() < 0.01` after 1.5 s;
     Space again → first step index 0.
- **Suspended-context path.** A second browser **without** `--autoplay-policy=no-user-gesture-required`: before any
  gesture `ctx.state === 'suspended'` and `ready` still resolves to `'opendaw'`; the first real `page.click` (and,
  in a touch context, tap) on a cell is audible; Play as the very first gesture starts playback (steps arrive,
  level > 0.01); the unlock buffer is played in the first gesture (spy on `createBufferSource`).
- **Play/Stop race:** on a suspended context, Play then Stop within 20 ms → after 300 ms silence, `playing` false,
  no steps.
- **Previews ignore sleep:** asleep critter, tap a cell while stopped, output within 50 ms.
- **Phrases:** the dice preview and mood arpeggio are audible while stopped; on openDAW they are counted as native
  scheduled sources (spy on the native engine's `voice`) with their exact target times.
- **Robustness:**
  - *Bad op:* the check calls `itchy.engine.openDaw.applyOps([orphaning op])`; then `kind === 'native'`, the next
    tap is audible, Play gives level > 0.01, and the only console output is one `console.info`.
  - *Worklet error:* the check dispatches an `error` event on `itchy.engine.openDaw.worklet`; then `kind ===
    'native'` and the next tap is audible. openDAW's own single `console.warn(event)` is the one allowed warning in
    this scenario.
  - *Bundle unavailable:* isolated server with `page.route('**/vendor/opendaw/**', r => r.abort())` → `kind ===
    'native'`, sound, one `console.info`.
  - *Static-import guard:* on the forced native path (`?engine=native`) and the not-isolated path, **no request to
    `/vendor/` is made**; with `/vendor/` responses delayed 5 s on the isolated server, the app renders and the
    first tap sounds before the bundle arrives.
- **Determinism:** each sound rendered twice by `render-sounds.js` is byte-identical.
- **Recording** (from M3): after recording, output rises when tapping rows 0, 3 and 7 while stopped; a song using
  the recording is audible; after reload `hasRecording` and an audible tap; the injected 22050 Hz clip plays.
- **Isolation and fallback scenarios**, on a second port serving `collect-site.mjs` output with `isolate: false`:
  - *Service-worker path:* the page registers `coi-serviceworker`, ends `crossOriginIsolated === true` and `kind ===
    'opendaw'` within 3 loads (navigations counted); a tap sounds; play gives level > 0.01.
  - *No service worker:* an `addInitScript` makes `navigator.serviceWorker` undefined (closer to a Firefox private
    window than Playwright's `serviceWorkers: 'block'`, which itself logs a warning) → `kind === 'native'`; the
    native subset passes (counted sounds, the old 1e-6 `playStep` timing check, level > 0.01).
  - *Forced:* `?engine=native` on the isolated server runs the same subset.
  - *First-visit safety nets (from M1):* with the first `location.reload()` swallowed once, and with `styles.css`
    aborted once by `page.route`, the page still ends isolated and running within 3 loads.
- **Budgets** (CDP: Fast 3G, 4× CPU, cold cache, serve.js without compression, so worse than Pages): the app
  renders and the first tap is audible within 3 s (native bridge); `ready` resolves within 60 s; vendor bytes
  ≤ 5.5 MB. Warm cache, 4× CPU: `ready` within 4 s. JS heap after boot recorded (CDP `Performance.getMetrics`).
  The measured numbers go in the PR and the README.
- **No console errors or warnings**, everywhere, except the one documented warning in the worklet-error scenario.
- **WebKit:** `safariLayout()` gains console collection and, in CI, a boot step that asserts `ready` settles and that
  a tap gives `level() > 0.01` on whichever backend is chosen. M0 found that Playwright's Linux WebKit does run an
  `AudioContext` with no sound card, so the level assertion stays (M0 already asserts it for the native engine); the
  real-iPad checklist (M5) remains the gate.
- Extend `check.mjs` for every new interaction (the port adds no gestures).

### 10c. Listening and parity checks (M3, written up in the PR)

Render each sound on both backends (native via `OfflineAudioContext`, openDAW via `renderOffline` with one-note
songs); RMS within ±3 dB; inspect spectra; two hits of the same drum 50 ms apart must overlap (polyphony); a long
bass and cloud note at the top row and bottom row must sustain without audible loop clicks; listen to the three
example songs on both and note differences.

---

## 11. Screenshots and docs

- **Screenshots.** `scripts/screenshots.mjs` `openApp()` awaits `window.itchy.engine.ready` and asserts `kind ===
  'opendaw'` before posing, so every shot is taken on one named backend. This is a change to the pipeline CLAUDE.md
  governs, listed in the PR. Run `npm run screenshots` at the end of M3 and M5; open every rewritten PNG. The
  playhead step is identical (`playTo()` waits for the tick); the play button's `--glow` (from `level()`) may change
  once because the mix and limiter differ; then it is stable run to run (seeded renders, one backend). Commit
  reviewed changes in the same PR with the reason. No new `SHOTS` entry (nothing new is visible).
- **README.md:** architecture tree (`vendor/opendaw/<version>/`, `src/audio/opendaw/`, `mirror.js`, `playhead.js`,
  `probe.js`, `native/`, `scripts/collect-site.mjs`); Timing paragraph (openDAW sequences the song on the audio
  thread; the native engine schedules on the audio clock for the fallback and the interface phrases); "Run it
  yourself" (nothing to install; `npm start` serves the headers; a plain static server gives the built-in engine);
  new "Engine and browsers" (needs isolation; Safari/iPadOS 17.4+; older or locked-down browsers get the built-in
  engine; first visit about 2.7 MB on GitHub Pages, 1.4 MB where everything is compressed; one or two reloads on
  the first Pages visit); Licence (§12); Next steps #7 Export can use `renderOffline`.
- **docs/CONCEPT.md:** technology block and tree; fix "Echo and Space are shared buses" → "Echo is per critter;
  Space is one shared reverb with a per-critter send". Decisions log, one line each with a reason:
  1. **openDAW SDK is the song engine** — the owner asked for the port, and it adds offline rendering for export;
     costs: about 2.7 MB first load on Pages (about 65× today's JS), AGPL for the deployed app, required cross-origin
     isolation, and two engines to maintain. This is the strong reason for the dependency and tooling.
  2. **Vendored as a prebuilt bundle in a versioned folder by a hand-run esbuild script** — npm files can't load
     unbundled; the app keeps no runtime build; versioned paths avoid mixed caches.
  3. **Cross-origin isolation: headers on Vercel and `npm start`, coi-serviceworker on Pages, registered only on
     capable devices** — `SharedArrayBuffer` is required; Pages can't set headers; incapable devices aren't
     reloaded.
  4. **The native engine stays: fallback, boot bridge, failure net and player of timed phrases** — never silent,
     works without isolation.
  5. **Itchy's JSON is mirrored one way into an openDAW project with no openDAW undo** — plain JSON and
     `store.change` stay the only truth.
  6. **Sounds are Itchy's own synthesis rendered to PCM with seeded noise; noisy drums get four alternating
     variants** — original, deterministic, no machine-gun hats.
  7. **Bass and cloud sustain with a crossfaded loop** — any length at any pitch.
  8. **A hidden library unit holds every sample file** — openDAW requires every file to be referenced; it also keeps
     every sound loaded so a new sound plays on the first tap.
  9. **Asleep critters mute their region, not their channel** — taps and previews still sound.
  10. **Swing uses Zeitgeist with `amount = (0.5 + swing/4 − 0.01)/0.98`** — undoes openDAW's squash margin so the
      odd step lands exactly where today's swing puts it.
  11. **Timed interface phrases play on the native engine** — openDAW can't schedule a live note in the future;
      native schedules them exactly on the audio clock; they go through the native mix.
  12. **Tray previews use hidden tray units with the critter's charms** — openDAW units hold one instrument each.
  13. **Space feeds from after the echo** — openDAW sends are post-chain; slightly wetter.
  14. **No openDAW Compressor** — GPL, outside the commercial licence; the Maximizer limits the master.
  15. **COEP rules out cross-origin embeds and assets** — everything must stay same-origin.
  16. **Any openDAW failure switches to the native engine for the session** — a child never meets silence.
  17. **Dependabot alerts for `scripts/opendaw/` are expected and handled at upgrade time** — the lock only feeds
      the vendoring script; nothing in it reaches the browser unvendored.
  Mark as amended: "No framework, no build" (still no runtime build and nothing to install; openDAW is a committed
  prebuilt bundle; a plain static server without COOP/COEP gives the built-in engine only) and "Timer is a Web
  Worker tick" (still true for the native engine; openDAW sequences the song on the audio thread).
- **CONTRIBUTING.md:** "Set up" unchanged (nothing to install); new "Upgrading openDAW"
  (`npm run vendor:opendaw`, review `VERSIONS.json`, run all checks and screenshots); add "Never use the openDAW
  Compressor" and "Everything the app loads must be same-origin (COEP)". The timing rule keeps its substance with
  no exception; only its pointer to where timing lives is updated (next bullet).
- **CLAUDE.md:** the timing rule stays "Never use timers for note timing"; its parenthetical becomes "(openDAW's
  engine, or `src/audio/scheduler.js` in the built-in engine)" so it stays accurate. Add `npm run vendor:opendaw`
  to Commands. Both edits listed explicitly in the PR.
- **`.github/dependabot.yml`** comment updated (§2).
- **Comments:** headers of `engine.js`, `native/engine.js`, `scheduler.js`, `ticker.js`, `tests/scheduler.test.js`.

---

## 12. Licence implications (for the owner; not legal advice; `LICENSE` is not changed)

- All `@opendaw/*` packages are **AGPL-3.0-or-later** (`nam-wasm` is MIT and unused). Bundled third-party code is
  permissive: zod, yjs, lib0, soundfont2, pako, dropbox MIT; jszip MIT/GPL (MIT chosen); coi-serviceworker MIT.
- Shipping `vendor/opendaw/*` to browsers **conveys** AGPL object code (§6), and the app is used over a network
  (§13). The deployed Itchy is a combined work under **AGPL-3.0** terms. Itchy's own files stay MIT; `LICENSE` and
  `package.json` `license: MIT` keep describing Itchy's own code.
- **Obligations:** keep openDAW's notices (`vendor/opendaw/<v>/LICENSE`, `NOTICE.md`); make the Corresponding Source
  available: the public repository with `scripts/vendor-opendaw.mjs`, the pinned `scripts/opendaw/package*.json`,
  and **the per-package openDAW commits from the published `gitHead`s** (`9306eaab…` for ten packages,
  `652e6caf…` for lib-std, lib-dom, lib-jsx, lib-runtime, lib-xml and studio-enums) in `VERSIONS.json` and
  `NOTICE.md`, not the research clone's HEAD; say in the README that
  the app includes AGPL components; optionally a "source" link outside the children's UI.
- **Consequences:** forks that ship the engine must stay AGPL-compliant; a closed fork would remove openDAW (the
  native engine makes that easy) or buy openDAW's commercial licence, which excludes the Compressor
  (`device_compressor.wasm`, GPL-3.0, is still loaded by the engine; GPL-3.0 and AGPL-3.0 combine under their §13).
- **The owner should confirm acceptance before merging to `main`.** Work stays on the local branch until then.

---

## 13. Risks and fallback

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| 1 | No isolation (service workers off, iframes, the owner's Claude web page, old devices) | High somewhere / high | Native is a first-class backend with its own check subset; coi only on capable devices |
| 2 | Safari/iPad untested here: 17.4+, 36 WASM modules, memory, page-load context vs iOS unlock | Medium / high | Probe → native; today's lazy context on incapable devices; gesture-keyed unlock; crash flag; WebKit CI with sound; **real-iPad checklist is a merge gate (M5)** |
| 3 | API churn (0.0.x; four releases in Oct 2026) | High / medium | Exact pins, versioned vendor folder, hashes, gitHeads, one boundary file (`apply.js`), `vendor.test.js` |
| 4 | Download weight ≈ 2.7 MB on Pages, 80 MB per classroom | Certain / medium | Dynamic import after probe; native bridge; no loading screen; offline worker lazy; budgets measured |
| 5 | A throwing transaction or worklet error mid-session | Low-medium / high | Library holder and direct device creation avoid known orphan rules; every failure → native at once (§1d.4), checked |
| 6 | `stop(false)` + `setPosition(0)` misbehaves | Low / low | M1: works (restarts at 0, tails ring); closed |
| 7 | Charm drags click, tempo writes glitch | Medium / medium | M1: abrupt Revamp frequency, Delay wet and `enabled` writes click; one write per frame, glides for jumps, `enabled` never toggled (§4f) |
| 8 | CPU with up to ~18 units (6 critters, ≤ 10 tray, library, aux) on tablets | Medium / medium | Lazy tray units; idle units carry no notes; measure `engine.cpuLoad`; overload → surface as a stop |
| 9 | SDK console warnings fail checks | Medium / low | Never create a file without its PCM; never orphan a box; checks catch regressions |
| 10 | Repitching changes tune envelopes; loops audible | Certain / low-medium | Listening check; Vaporisateur or two-root bells fallbacks |
| 11 | Chromium half-speed worklet clock after bfcache restore | Low / medium | `pageshow` with `persisted` → reload (autosaved) |
| 12 | Two engines to maintain | Certain / medium | Native frozen; decisions log records when it could go |
| 13 | Git history +6.5 MB per upgrade | Certain / low | Upgrade rarely; `.gitattributes` |
| 14 | AGPL | Certain / owner's call | §12; sign-off before merge |
| 15 | Hidden tab: `AnimationFrame` stops, playhead freezes | Certain / none | Tracker drops large jumps |
| 16 | Phrases sound slightly different from the song (native mix) | Certain / low | Parity check; logged |
| 17 | WebKit only verifiable in CI and on an iPad (this container needs `playwright install-deps webkit` first) | Certain / medium | M0 enables WebKit in CI first; iPad checklist |

**Project-level fallback.** M1 has go/no-go "must" spikes. If one fails, or M3's parity and timing checks can't
pass, stop and report; the app stays native. The facade keeps the native backend intact at every milestone.

---

## 14. Milestones

Each milestone leaves the app working with `npm test` and `npm run check` passing, and is committed on the local
branch after looking at `test-output/`. WebKit and Vercel items can only be verified when the owner pushes the
branch; locally they are skipped as today.

### M0. WebKit in CI (separable groundwork)

Goal: existing WebKit checks run and pass in CI before the port depends on them.

Steps:
1. `ci.yml`: `npx playwright install --with-deps chromium webkit`.
2. `safariLayout()` collects console errors and warnings like `openPage()`.
3. Find out whether Playwright's Linux WebKit runs an `AudioContext` (record it; it decides §10b's WebKit level
   assertion).
4. Kept as its own commit so the owner can land it as a separate early PR.

Acceptance: locally unchanged (WebKit skipped); in CI the existing `safariLayout()` checks pass or their failures
are fixed independently of the port.

Done, with two additions to the plan:
- **Finding:** Playwright 1.63's Linux WebKit (26.6, build 2359) runs a real `AudioContext` with no sound card or
  sound server. Tested in this container after `npx playwright install-deps webkit` (on a separate browsers path, so
  the local `npm run check` still skips WebKit): the context starts `suspended`, `resume()` runs it, `currentTime`
  advances in real time, `audioWorklet.addModule` works, `OfflineAudioContext` renders, and Itchy's analyser level
  reaches 1.0 while the drums play. `SharedArrayBuffer` is undefined there (no isolation), as expected. So §10b keeps
  the `level() > 0.01` assertion for WebKit.
- **Added:** `safariLayout()` now also asserts, on today's native engine, that a tap starts the audio clock and that
  playing puts sound through the mix, so CI confirms the finding on GitHub's runner too. And when `CI` is set (GitHub
  sets it), a WebKit that won't launch is a failure instead of a silent skip; locally it is still skipped.
- With WebKit available, the whole `npm run check` passed here (300 checks, 0 failures), so no fixes were needed.

### M1. Groundwork: vendored SDK, isolation, notices, in-memory samples and a boot spike (Itchy still native)

Goal: openDAW is in the repo, reproducibly built, served with isolation everywhere, and proven to boot and sound
inside Itchy's server with Itchy's own sample manager.

Steps:
1. `scripts/opendaw/package.json` (exact pins + esbuild 0.25.0), `package-lock.json`, `entry.js`,
   `scripts/vendor-opendaw.mjs` (§2, gitHeads into VERSIONS/NOTICE); run it to produce `vendor/opendaw/0.0.180/`;
   `vendor:opendaw` script; `.gitattributes`; dependabot comment.
2. `serve.js`: headers, types, `startServer(port, {isolate, root})`. `scripts/collect-site.mjs`; `pages.yml` uses
   it; `.vercelignore`; `vercel.json` headers; `tests/deploy.test.js`.
3. `src/audio/probe.js` + inline probe and `window.coi` (`quiet: true`, gated `shouldRegister`) in `index.html`;
   vendored `coi-serviceworker.js` 0.1.7 with the disjoint guarded reload.
4. `src/audio/opendaw/samples.js` (in-memory manager, async UUID scheme, mono and stereo AudioData) and
   `src/audio/opendaw/boot.js` (§3, with a test sound instead of Itchy's renders), loaded only by `import()`, not
   wired into the app.
5. Check-only probe in `check.mjs` (`page.evaluate(() => import('/src/audio/opendaw/boot.js'))`).
   **Must pass:** boot via dynamic import; Playfield note and Nano audition audible through the custom manager;
   library holder (a lone `AudioFileBox` throws, files held by the holder load, re-pointing a Nano file works,
   delete a unit then recreate it and audition in the same task is audible, no throw); direct `ZeitgeistDeviceBox`
   with the global groove (no throw, audible); bare-transaction edits; muted-region audition while stopped;
   audition in the same task as unit creation; a forced throw is caught and reported; a dispatched worklet `error`
   reaches `restart.unload` with no restart after `terminate()`.
   **Report:** `stop(false)` → `setPosition(0)` → `play()` restart; playing past `durationInPulses`; `ctx.suspend()`
   freezes position without warnings; swing offline render with the corrected formula (±2 samples) and 0 = straight;
   `enabled` toggles; Nano loop sustain; Nano volume 0 dB gives unity; Playfield `polyphone` overlap; Revamp order 0
   slope; metronome preference false; Delay `filter` cutoff; Playfield velocity curve; synchronous sync loopback in
   the vendored bundle.
6. Re-check every [verified] item in this plan against the vendored files (and `od-9306` for Rust); fix the plan
   where they differ.
7. `tests/vendor.test.js`, `tests/probe.test.js`; try the bundle in Node with stubs (decides `apply.test.js`).
8. Measure coi navigations over 20 cold runs on a header-less server; record.
9. Decisions-log entries 1-3, 15, 17 and the two amendments; README Licence paragraph; CONCEPT echo/space fix.

Acceptance:
- `npm run vendor:opendaw` twice gives byte-identical output; `VERSIONS.json` hashes and gitHeads match.
- `npm test` passes with no install.
- `npm run check` passes everything that passed before, plus the probe: `crossOriginIsolated === true`,
  `ensureReady` true, Playfield and Nano peaks > 0.01, every "must" item passes, every "report" item reports, no
  console errors or warnings.
- Header-less server: isolated in all 20 runs within 3 loads; counts recorded.
- App behaviour, sounds and screenshots unchanged (`npm run screenshots` leaves `git status` clean).
- Go/no-go recorded; a failed "must" stops the port and is reported.

Done. **Go/no-go: GO.** Every "must" item passed in Chromium and in WebKit (`npm run check`, 312 checks locally,
317 with WebKit as CI runs it), so the port continues. Findings and changes to the plan:
- **Must items** (all pass): `crossOriginIsolated`; boot through `import()` with `ensureReady` true (about 0.6 s
  warm); Playfield peak 0.64 and Nano peak 0.50 through Itchy's in-memory manager (stereo Nano 0.39); the library
  holder (a lone `AudioFileBox` throws "requires an edge" and the transaction rolls back; held files load;
  re-pointing a Nano file works and keeps the old file; deleting a unit keeps the held file, and recreating it and
  auditioning in the same task is heard); a direct `ZeitgeistDeviceBox` on the global groove (no new groove box,
  audible); every edit in a bare transaction, leaving nothing to undo; a muted-region audition while stopped is
  heard (and the muted region plays nothing while playing); an audition in the same task as unit creation; a forced
  throw is caught, rolled back, and the engine **keeps sounding** (Itchy still switches to native on any failure,
  to be safe); a dispatched worklet `error` reaches `restart.unload` with no restart, and openDAW's
  `console.warn(event)` is the only output.
- **Report items** (`test-output/opendaw-probe.json`): restart at 0 after `stop(false)` → `setPosition(0)` →
  `play()`, with tails ringing (§4h); playing past `durationInPulses` (§4c); `ctx.suspend()` freezes with no
  warning (§7); swing within 1 sample offline, straight at 0 (§4g); `enabled` toggles and abrupt Revamp frequency
  and Delay wet writes click, feedback and unit volume don't (§4f, risk 7: **changed**: devices stay enabled at
  neutral values, jumps glide); Nano loop sustains cleanly (§4); Nano at 0 dB and a Playfield slot at 0 dB are
  unity gain, Nano's default is −3 dB; Playfield `polyphone` overlap 1.40 (≈ √2); Revamp order 0 is 12 dB/oct
  (−3 dB at the cutoff), order 1 24 dB/oct; Revamp factory defaults as cited; the metronome preference is false;
  the master holds one Maximizer at 0 dB; the Delay `filter` is a low-pass at `20·1000^(1+f)` Hz (§4f: −0.2523 for
  3.5 kHz); Playfield velocity is linear (§4); the sync loopback is synchronous in the vendored bundle (§1d.3).
- **[verified] re-check:** every citation was re-read in the installed 0.0.180 `dist/` (the same versions the
  vendoring script pins) and in `od-9306`; all hold. Corrected: six packages, not only lib-std, come from
  `652e6caf…` (header and §12); the Delay index table and defaults are now quoted from the dist (§4f).
- **Node:** the bundle imports in Node with two stubs and builds a real box graph, so `tests/apply.test.js` goes
  ahead in M3 (§10a).
- **coi navigations** on a server without headers (`collect-site.mjs` output, `isolate: false`), cold runs, counted
  until the page is isolated **and** the app has started. Chromium, 20 runs: 2 loads in all 20 (an earlier batch of
  20: 2 in 16, 3 in 4). WebKit, 120 runs with the final code: 2 loads in 114, 3 in 6, all isolated and running; the
  dropped-reload retry rescued 2 of them, within 2.5 s. Before the safety nets, WebKit left 4 of 140 runs blank (see
  "Two safety nets" in §2). The only console output in those rare runs is WebKit's own "Failed to load resource";
  normal runs log nothing. With `?engine=native`, or when the probe fails, coi never registers (1 load, no worker).
- `npm run vendor:opendaw` run twice gives byte-identical files, equal to the committed ones.
- **Screenshots:** serving the page cross-origin isolated moves 12 pixels of one cell edge in
  `assets/social-card.png` (invisible, the same on every run; main's server without the headers renders the old
  card), so the card was re-rendered and committed. The tablet shot's play-button glow follows the live output
  level, varies between runs, and differs from the committed shot on `main` too, so it is left as committed; that
  flake predates the port.
- **Deviations:** the probe lives in `tests/e2e/opendaw-probe.js`, imported by `check.mjs` in the page, rather than
  inline in `check.mjs`; `tests/probe.test.js` landed with the isolation commit; the coi count was a one-off script
  (its results are recorded here and in the decisions log, and M4's isolation checks cover the same path in CI).
  **New:** the two first-visit safety nets in `index.html` (§2), because WebKit failed the "all runs isolated"
  acceptance without them.

### M2. Facade, injected native engine and pure mirror (still native)

Goal: the seams exist and are unit-tested; the app behaves as before.

Steps:
1. Move `src/audio/engine.js` to `src/audio/native/engine.js`; constructor takes `{ ctx, out }`, `build()` connects
   to `out`, no context or analyser of its own, `ensure()` only builds.
2. New facade: today's API plus `kind`, `ready`, `openDaw`; owns ctx creation (load-time only when capable,
   otherwise lazy as today), gesture-keyed unlock, `nativeOut`, `uiBus`, analyser; play/stop generation token;
   `voice()` routing stub (all native for now).
3. `mirror.js`, `playhead.js` with `tests/mirror.test.js` and `tests/playhead.test.js` (§10a).
4. `instruments.js` optional `rng` (noise buffer, `noiseSource` start offset, `makeImpulse`); native keeps
   `Math.random`. `render-sounds.js` with seeded variants, loop points for bass and cloud, stereo impulse; browser
   check that each render is non-silent and byte-identical on a second render.
5. Comment rewording in `scheduler.js`, `ticker.js`, `tests/scheduler.test.js`.

Acceptance:
- `npm test` passes, the new tests covering every formula in §4 and §7.
- `npm run check` passes unchanged (sound counts, the 1e-6 native timing check, no warnings), plus: unlock buffer
  played in the first gesture; `kind === 'native'`.
- `npm run screenshots` leaves the tree clean (native still uses `Math.random`, as today).

Done. Everything still plays on the built-in engine; the seams exist and are tested. `npm test`: 62 passed
(36 before, plus 20 mirror and 6 playhead tests). `npm run check`: 343 passed locally, 348 with WebKit as CI runs
it; the sound counts, the 1e-6 timing check and the no-warnings checks are unchanged. Notes and deviations:
- **Facade** (`src/audio/engine.js`): `kind` is `'native'`, `ready` resolves `'native'`, `openDaw` is null. The
  context is made at load when `canUseOpenDaw()` (the check server is isolated, so the checks now run that path)
  and lazily in the first gesture otherwise. The unlock buffer is keyed on a plain `unlocked` flag and plays in
  the first `ensure()`; the app's first `ensure()` is always a gesture. New check `audioFacade()`: on the isolated
  page and with `?engine=native`, by mouse and by finger, the backend is native, the context is made at load or
  in the first gesture, the first tap sounds, and the 1-sample buffer starts exactly once, in the first gesture
  (with `navigator.userActivation.isActive` true for the mouse). Chromium logs nothing when a context is made
  before a gesture (tested without the autoplay flag), so the M3 no-flag browser won't trip the warnings check on
  that. `playStep()`, the visual queue, `uiSound()` (now into `uiBus`, no longer through the native limiter; its
  peak is far below the limiter's threshold), `level()` and `drainEvents()` live in the facade. `playing` is a
  plain flag; `gen` is bumped by play and stop, for M3's async play.
- **Native engine** (`src/audio/native/engine.js`): `new NativeEngine(getProject, { ctx, out, onStep })`. Its
  scheduler calls the facade's `playStep` through `onStep`, so wrapping `itchy.engine.playStep` (as the checks do)
  still sees every step, and every note still goes through the facade's `voice()`. It keeps `buffers` for
  recordings; the facade holds recordings that arrive before there is a context.
- **Seeded renders** (`src/audio/render-sounds.js`): 25 files (kit 1+4+4+4, tinykit 1+4+1+1, four tunes, the stereo
  impulse) in about 75 ms. File ids are `kit.snare.2`, `bells`, `space` (and `rec:<id>` for recordings); boot maps
  them to `samples.js` keys in M3. Loop points are snapped to whole periods of the root: bass 0.6–1.396 s of 1.85 s
  (fade 0.05 s), cloud 0.25–2.207 s of 3.0 s, four beats of its ±9-cent detune (fade 0.1 s). `soundCatalogue()` is
  pure, so the mirror tests use the same facts. **New:** renders were not byte-identical at first: Chromium sums a
  node's inputs in no fixed order and three or more inputs round differently (up to 2e-7). `instruments.js` now
  routes the bells' shimmer and knock, and the cloud's two saws, through a small bus so no node has more than two
  inputs (two floats add up the same either way). 20 renders of every file in Chromium and 5 in WebKit were all
  identical. The browser check `renderedSounds()` also checks that only the noisy pieces have variants (a
  one-variant piece rendered with another seed is identical; variants differ from each other) and that each loop
  lies on a steady part of the hold (level at its two ends within 1 dB).
- **Mirror** (`src/audio/mirror.js`): a unit's `instrument` is `{ type: 'playfield', slots: [{ note, file, gate: 0,
  polyphone: true }], variants }` or `{ type: 'nano', file, rootKey, volumeDb: 0, attack, release, loop, sustain,
  seconds }`; Nano `loopStart`/`loopEnd` are fractions of the sample (as `voice.rs` reads them), so the mirror
  divides the loop seconds by the sample length. Ops add `addFile` (for the library holder) and `setField` with
  `key: null` for project fields; `diffScene(null, scene)` builds everything. Envelopes: bells and pluck attack
  0.001 s, release 0.05 s (pluck's were unstated); bass 0.001/0.12; cloud 0.001/1.0; recordings 0.004/0.03.
  **Corrections:** Revamp passes stay enabled at neutral (the §4f creation row and §10a said "disabled", which
  predates M1); a one-shot note's length follows its pitch (`oneShotPulses`), so a mood or key change also rewrites
  one-shot lengths, not only pitches; a charm move writes that charm's fields (space and volume one, echo two:
  feedback and wet; tone two: frequency and Q), not always exactly one.
- **Playhead** (`src/audio/playhead.js`): `StepTracker.advance(position, { tempo, latency, swing })` returns `{ index,
  ago }` (seconds since the engine played it, so its audio time is `now − ago`); `stepEvent()` builds today's event
  and the facade's `playStep` uses it.
- **Docs:** the README and CONCEPT trees now list `native/engine.js` (the full tree update stays in M3).
- **Screenshots:** with the context made at load, `assets/social-card.png` renders byte for byte as on `main` again
  (three runs alike), so M1's re-render is undone and committed. The tablet shot's play-button glow still varies
  between runs (the flake that predates the port); a run that hits it is not committed.

### M3. openDAW plays everything: sounds, recordings, notes, charms, tempo, swing, transport, previews, playhead

Goal: on an isolated page openDAW is the song and preview engine, including recordings; every interaction sounds
immediately (proven by output, not call counts) and undoes in one step; any openDAW failure falls back to native.

Steps:
1. Full boot (§3): renders, UUIDs, library holder, Space aux with stereo Convolver, master; crash flag; watchdog.
2. `apply.js`: ops in one bare transaction; direct Zeitgeist creation; Nano volume 0; Playfield polyphone; Revamp
   orders; loop fields; library slots; failure → `onFatal`.
3. `src/audio/opendaw/engine.js`: `sync()`, `play()`/`stop()` (§4h, token), `voice()` (auditions; future times to
   native), tray units, `drainEvents()` with the playhead tracker, `level()`, `uiSound`, `renderOffline(steps)`,
   `async addRecording()` (§9), `rec:` units with deferred notes, tray units for "my sounds".
4. Facade switches to openDAW when ready and stopped; `?engine=native`; native sync kept running; failure path.
5. `check.mjs`: the ready helper on every open/reload path; output-based sound hook; latency probe; redesigned
   `playback()`; suspended-context browser; Play/Stop race; previews ignore sleep; phrases; bad-op, worklet-error
   and bundle-unavailable scenarios; static-import guard; recording output checks (§10b).
6. `screenshots.mjs` `openApp()` awaits `ready` and asserts `kind`.
7. Listening and parity pass (§10c); choose loop vs Vaporisateur and one- vs two-root bells; log the choice.
8. `npm run screenshots`, review every PNG, commit reviewed changes with a note.
9. Decisions-log entries 4-14, 16; README Timing and Architecture; CLAUDE.md and CONTRIBUTING parenthetical.

Acceptance:
- On `serve.js`, `kind === 'opendaw'` once ready, in both the autoplay-flag and the no-flag browsers.
- Full `npm run check` passes: every `actionCheck` (sound proven by output while stopped, change, one-step undo) at
  all four sizes with mouse and touch; exactly one sound for a finger tap in the tray; steps consecutive, loop wraps,
  tempo slope within 0.5% at 100 and 140 BPM; offline onsets within ±2 samples and swung onsets at +½ step ±2;
  after Stop no steps and silence within 1.5 s; first tap and first Play audible on a suspended context; Play/Stop
  race silent; latency within native + 10 ms; recording suite (fake mic, denied permission, `+` menu, persistence,
  "my sounds", undo/redo) with output checks; bad-op, worklet-error and bundle-unavailable scenarios end native and
  audible; no `/vendor/` request on native paths; examples, keyboard 1-6, Ctrl+Z/Y, delights; no console errors or
  warnings except the documented one.
- Mirror and render determinism checks pass; adding and removing critters adds and removes units (counted via
  `project.rootBoxAdapter.audioUnits`), the library unit stays.
- `npm test` passes; `tests/surprise.test.js` still imports `processClip` in Node.
- `npm run screenshots`: clean, or reviewed glow-only changes committed.
- The PR describes parity and latency per sound.

### M4. Isolation paths, budgets and hardening

Goal: every way a child can arrive is checked, and the cost is measured.

Steps:
1. `check.mjs` scenarios on the collected site with `isolate: false`: service-worker path (navigations counted),
   no-service-worker via `addInitScript`, and `?engine=native` (§10b).
2. Budgets under CDP throttling (§10b), numbers recorded.
3. bfcache `pageshow` reload guard; CPU-overload → stop surfaced; crash-flag check (set the flag, reload → native).
4. WebKit boot-and-sound assertion in `safariLayout()` (per M0's finding).

Acceptance:
- Service-worker scenario ends isolated on openDAW within 3 loads; no-service-worker and forced scenarios run native
  with their timing and level checks passing, and no service-worker registration on incapable or forced pages.
- Budgets met: render and first tap within 3 s, `ready` within 60 s on Fast 3G + 4× CPU cold; within 4 s warm;
  vendor bytes ≤ 5.5 MB.
- `npm test` and `npm run check` pass; in CI (when pushed) the WebKit step passes.

### M5. Docs, licence wrap-up and the merge gate

Goal: documentation and notices are complete and the owner has what they need to decide.

Steps:
1. README ("Engine and browsers" with measured numbers, Licence, Known rough edges: one or two reloads on the first
   Pages visit, phrases through the native mix; Next steps #7), CONTRIBUTING, CONCEPT final tree, CLAUDE.md
   Commands, `NOTICE.md` final text.
2. Final `npm run screenshots`, reviewed.
3. Owner hand-off in the PR description: AGPL acceptance; the Vercel preview header check; the **real-iPad
   checklist** below; the decision to keep or later drop the native engine.

Acceptance:
- `npm test` and `npm run check` pass locally, and in CI with WebKit when pushed.
- The PR preview on Vercel shows `crossOriginIsolated === true` and `kind === 'opendaw'` (by hand, once pushed).
- **Merge gate (owner):** on a real iPad with iPadOS ≥ 17.4, from a cold start on the Pages build: isolated via the
  service worker after at most two reloads; `kind === 'opendaw'`; the first tap sounds; play and stop; a mic
  recording plays on the grid; ten minutes of play with no tab reload; boot time noted. Plus one older iPad (< 17.4)
  showing no reload and the built-in engine with sound.
- README, CONCEPT, CONTRIBUTING, CLAUDE.md and dependabot changes listed in the PR; `LICENSE` unchanged.
- `npm run screenshots` leaves the tree clean, or reviewed images are committed.

---

## 15. Review log

Each finding was checked against the installed 0.0.180 `dist/`, a checkout of `9306eaab` (`scratchpad/od-9306`),
Itchy's source and the reviewers' spikes.

| # | Finding | Verdict | Why / what changed |
|---|---|---|---|
| 1 | Unreferenced library AudioFileBoxes throw; re-point and delete hit the same rule (blocker) | **Accepted** | `AudioFileBox.js:16 mandatory: true`, `graph-edges.js:128` confirmed. Added the `__library` holder unit (§1d.3), files created with their slot, delete fallback, and three new M1 must-pass spikes. |
| 2 | Swing ignores `squashUnit`, ~72 samples late | **Accepted** | `math.js:8`, `GrooveShuffleBoxAdapter.js:35`, zeitgeist `lib.rs:53-70` confirmed. Formula now `(0.5 + swing/4 − 0.01)/0.98`; tests and decision 10 reworded. |
| 3 | Re-pointing a factory Zeitgeist throws; a throwing transaction silences the engine | **Accepted** | `EffectFactories.js:70 useGlobal = false`, `GrooveShuffleBox.js:12 mandatory` confirmed. Direct `ZeitgeistDeviceBox` with `rootBoxAdapter.groove.box`; every transaction wrapped, failure → native (§1d.4); bad-op check. |
| 4 | [verified] citations and Corresponding Source from the wrong commit | **Accepted** | gitHeads confirmed (`9306eaab…`, lib-std `652e6caf…`); clone has 1 commit; `stop_faded` absent from dist; `WasmEngineUrls` has no `extraDevices`. Claims re-checked against dist and `od-9306`; VERSIONS/NOTICE take gitHeads; §4h corrected. |
| 5 | `UUID.sha256` is async and takes bytes | **Accepted** | `uuid.js:8` confirmed. UUIDs computed at boot and in async `addRecording()`, read synchronously from a map; TextEncoder. |
| 6 | Nano default volume −3 dB | **Accepted** | `NanoDeviceBox.js:146` confirmed. Every Nano unit sets 0 dB; mirror test. |
| 7 | Playfield slots monophonic by default | **Accepted** | `polyphone` field 43 has no default (false). Set true on every slot; overlap parity check. |
| 8 | Revamp factory defaults 24 dB/oct, HP on | **Accepted** | `EffectParameterDefaults.js:7,9,24` confirmed. Orders and enables set explicitly; spike dropped. |
| 9 | Metronome is a preference, not a box | **Accepted** | `EnginePreferencesSchema.js:7` default off. Step dropped; probe asserts it. |
| 10 | Blocked-SW scenario fails the no-warnings rule; coi logs `console.error` unless `quiet` | **Accepted** | coi 0.1.7 `!e.quiet&&console.error(...)` confirmed; check.mjs counts warnings. `quiet: true`; scenario uses `addInitScript` instead of `serviceWorkers:'block'`. |
| 11 | Stereo impulse; unseeded noise start offset | **Accepted** | `instruments.js:21,194-201` confirmed. Stereo AudioData; `rng` covers the start offset; byte-identical render check. |
| 12 | Interface phrases break the timing rule needlessly | **Accepted** | The native engine already schedules exactly with `start(t)` on the shared context. Future-timed `voice()` goes native; `phrases.js`, the 5 ms ticker mode, the rule rewording and old decision 9 removed; trade-off logged (decision 11). |
| 13 | Engine failure mid-session leaves Itchy silent | **Accepted** | 9306eaab `processor.ts:347-379,395,614` and `Project.ts:296-312` confirmed. `restart.unload` and apply failures switch to native; crash flag; worklet-error check (openDAW's own `console.warn` documented). |
| 14 | Static bundle load would block first paint | **Accepted** | Facade has no static import of opendaw/vendor; `boot.js` and the bundle via `import()` after the probe; checks for no `/vendor/` request and render-before-bundle. |
| 15 | Sound hook counts calls, not output; no latency measure; Maximizer lookahead omitted | **Accepted** | Output-based assertion within 50 ms via a worklet tap; latency probe with budget native + 10 ms including the 5 ms lookahead (confirmed in maximizer `lib.rs:37`). |
| 16 | Checks force autoplay, so the suspended path is untested | **Accepted** | `--autoplay-policy` flag confirmed in check.mjs:31. Added a no-flag browser: suspended before gesture, ready, first tap and first Play audible, unlock spy. |
| 17 | Screenshots nondeterministic between backends | **Accepted** | `openApp()` waits only 400 ms (confirmed). `openApp()` awaits `ready` and asserts `kind`; listed as a pipeline change. |
| 18 | iPad never gates the merge; WebKit CI asserts no sound | **Accepted** | Real-iPad checklist is an M5 merge gate; WebKit CI asserts output (M0 found Linux WebKit runs an `AudioContext`, so the level is asserted). |
| 19 | Download figures wrong; no budget | **Accepted** | Recomputed from runtime.md §5: 5.2 MB raw, 1.41 MB gz, ≈ 2.7 MB on Pages; budgets under CDP throttling in M4; classroom cost logged. The fixed 15 s boot timeout was replaced by a 10 s `isReady` watchdog, since slow downloads are harmless with the bridge. |
| 20 | coi reloads devices that can never run openDAW | **Accepted** | `shouldRegister` gated on the same probe (and `?engine=native`); a test keeps the inline and module probes identical. |
| 21 | Sustained notes outlast their samples | **Accepted** | Range −7..+21 st with key, more with octave, len up to 32. Bass and cloud now loop a steady segment (Nano loop fields exist in 0.0.118 boxes and 9306eaab voice.rs); mirror test for the extreme note; Vaporisateur fallback kept. |
| 22 | Decisions log overstates benefits, leaves contradicted entries | **Accepted** | Entry 1 reworded with costs; "No framework, no build" and "Timer" marked amended. |
| 23 | Rendering each drum once makes noisy hits identical | **Accepted** | Snare, clap, hat use `noiseSource`. Four seeded variants alternating by step; native keeps live randomness. |
| 24 | Quick Play-then-Stop can leave music playing; stops cut tails | **Accepted** | Confirmed that 0.0.25 resets plugins on a non-transporting stop. Generation token; no stop sent unless play was sent; race check. |
| 25 | (Duplicate of 4) wrong commit; `stop(true)` behaviour | **Accepted** | Merged with 4; also `vendor.test.js` checks gitHeads in VERSIONS and NOTICE. |
| 26 | (Duplicate of 17) screenshots race; also check.mjs reload paths | **Accepted** | Merged with 17; one ready helper on every open/reload path in check.mjs. |
| 27 | (Duplicate of 15) silent openDAW passes every check; recordings silent in M3 | **Accepted** | Merged with 15; recordings moved into M3 with output checks, so no milestone ships silent recordings. |
| 28 | (Duplicate of 10) Playwright SW-block warning | **Accepted** | Merged with 10. |
| 29 | Page-load context breaks the iOS unlock in `ensure()`; native engine must change beyond imports | **Accepted** | `engine.js:31-41` confirmed. Facade-level gesture-keyed unlock; native takes `{ctx, out}`, stated in M2; unlock spy check. Additionally, incapable devices keep today's lazy context creation. |
| 30 | coi already reloads twice; "one reload" claims wrong | **Accepted** | Stock code has two reload paths (confirmed). Patch limited to the disjoint case; navigations measured over 20 runs; docs say "one or two"; acceptance counts loads (≤ 3). |
| 31 | M1 needs samples.js, built only in M3 | **Accepted** | samples.js moved to M1. |
| 32 | Unversioned vendor files can mix after an upgrade | **Accepted** | Pages `max-age=600` noted by reviewer. Versioned folder `vendor/opendaw/0.0.180/`; test ties it to VERSIONS and `boot.js`. |
| 33 | Enabling WebKit runs untested safariLayout; can't verify locally | **Accepted** | New M0 as a separable commit; console collection added. Since work stays on a local branch, WebKit results come only when the owner pushes; noted. |
| 34 | Deploy copy lists untested; no Pages-like `_site` tool | **Accepted** | `scripts/collect-site.mjs` used by pages.yml and the checks; `tests/deploy.test.js`. |
| 35 | No check for isolated-but-openDAW-fails; dynamic import not required | **Accepted** | Merged with 14; `page.route` abort scenario. |
| 36 | ±5 ms phrase claim unsupported | **Accepted (superseded)** | Moot: phrases now schedule exactly on the native engine (12). |
| 37 | Committed lock brings Dependabot alerts | **Accepted** | Comment updated, decision 17 logged; an npm ecosystem entry was rejected because a lock-only bump would desync the vendored files. |

No finding was rejected outright. Two were accepted with a different fix from the one suggested: (12) future-timed
notes go to the native engine rather than to a hidden openDAW phrase unit; (37) no npm Dependabot entry. One
partial deviation: the CLAUDE.md timing rule keeps its substance and has no exception, but its parenthetical is
updated to name openDAW's engine, because leaving it pointing only at `scheduler.js` would be inaccurate after the
port.

**Proceed:** yes. No finding makes the port infeasible, and nothing must go to the owner before code is written.
AGPL acceptance and the real-iPad checklist are required before merging to `main`.
