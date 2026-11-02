// Can this browser ever run openDAW's engine? It needs an AudioWorklet, WebAssembly with SIMD (the engine is
// built with simd128) and Promise.withResolvers (used in the engine's worklet): roughly Safari and iPadOS 17.4,
// Chrome 119 and Firefox 121. It also needs cross-origin isolation, which is checked separately because the
// service worker in coi-serviceworker.js can provide it.
//
// index.html inlines exactly the same function (tests/probe.test.js keeps the two identical), so that
// coi-serviceworker never reloads a device that could not use openDAW anyway. Pure: no imports, no side effects.

export function itchyProbe() {
  try {
    return typeof AudioWorkletNode === 'function'
      && typeof Promise.withResolvers === 'function'
      && typeof WebAssembly === 'object'
      && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]));
  } catch (e) {
    return false;
  }
}

/** True when openDAW can boot on this page right now: capable, isolated, and not forced to the built-in engine. */
export function canUseOpenDaw(win = globalThis) {
  return itchyProbe() && win.crossOriginIsolated === true && !/[?&]engine=native/.test(win.location?.search ?? '');
}
