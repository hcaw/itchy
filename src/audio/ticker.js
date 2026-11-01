// A steady "wake up" signal for the scheduler. A Web Worker timer keeps ticking even when
// the main thread is busy drawing, and is throttled less in background tabs. It only wakes
// the scheduler; musical timing always comes from the audio clock.
// If the worker can't be made, or never ticks (some embedding pages block it), a plain
// interval takes over.

export function createTicker(callback, intervalMs = 25) {
  let worker = null;
  let timer = null;
  let running = false;
  let heard = false;
  try {
    const src = `let t=null;onmessage=e=>{clearInterval(t);if(e.data>0)t=setInterval(()=>postMessage(0),e.data)}`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = () => { heard = true; callback(); };
    worker.onerror = () => fallBack();
  } catch {
    worker = null;
  }
  function fallBack() {
    if (worker) { worker.terminate(); worker = null; }
    if (running && !timer) timer = setInterval(callback, intervalMs);
  }
  return {
    start() {
      running = true;
      if (worker) {
        worker.postMessage(intervalMs);
        setTimeout(() => { if (running && !heard) fallBack(); }, 250);
      } else if (!timer) timer = setInterval(callback, intervalMs);
    },
    stop() {
      running = false;
      if (worker) worker.postMessage(0);
      clearInterval(timer);
      timer = null;
    },
  };
}
