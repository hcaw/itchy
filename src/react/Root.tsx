import { Component, Suspense, use, type ReactNode } from 'react';
import type { Daw } from '../daw/boot';
import type { Critter } from '../daw/song';
import { App } from './App';

type Ready = Promise<{ daw: Daw; critter: Critter }>;

/** Waits for openDAW to boot, then shows the app. */
export function Root({ ready }: { ready: Ready }) {
  return (
    <BootError>
      <Suspense fallback={<Waking />}>
        <Booted ready={ready} />
      </Suspense>
    </BootError>
  );
}

function Booted({ ready }: { ready: Ready }) {
  const { daw, critter } = use(ready);
  return <App daw={daw} critter={critter} />;
}

function Waking() {
  return (
    <main className="message" aria-busy="true">
      <p className="wake">Waking up the critters…</p>
    </main>
  );
}

/** If openDAW can't start (an old browser, or a page without isolation), say so kindly. */
class BootError extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown) {
    console.error('Itchy could not start its sound engine.', error);
  }
  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="message" role="alert">
        <p>This device can't run Itchy's music engine.</p>
        <p className="small">Itchy needs Safari or iPadOS 17.4, Chrome 119 or Firefox 121, or newer.</p>
      </main>
    );
  }
}
