// A steady "wake up" signal for the built-in engine's scheduler (scheduler.js); openDAW's engine needs none.
// A Web Worker timer keeps ticking even when the main thread is busy drawing, and is throttled less in
// background tabs. It only wakes the scheduler; musical timing always comes from the audio clock.

export function createTicker(callback, intervalMs = 25) {
  let worker = null;
  let timer = null;
  try {
    const src = `let t=null;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = callback;
  } catch {
    worker = null; // CSP or old browser: fall back to a plain interval
  }
  return {
    start() {
      if (worker) worker.postMessage(intervalMs);
      else if (!timer) timer = setInterval(callback, intervalMs);
    },
    stop() {
      if (worker) worker.postMessage(0);
      clearInterval(timer);
      timer = null;
    },
  };
}
