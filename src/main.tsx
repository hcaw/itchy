import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { bootDaw } from './daw/boot';
import { createSong } from './daw/song';
import { Root } from './react/Root';
import './styles.css';

// One AudioContext for the page, made at load so openDAW can boot straight away. Browsers keep it
// suspended until the first tap or key press, which resumes it.
const context = new AudioContext({ latencyHint: 'interactive' });
const resume = () => void context.resume();
addEventListener('pointerdown', resume, { capture: true });
addEventListener('keydown', resume, { capture: true });

const ready = bootDaw(context).then((daw) => {
  const critter = createSong(daw.project);
  // A handle for the browser console and the end-to-end checks. Read-only use only.
  window.itchy = { ...daw, critter };
  return { daw, critter };
});

const container = document.getElementById('root');
if (!container) throw new Error('index.html has no #root');
createRoot(container).render(
  <StrictMode>
    <Root ready={ready} />
  </StrictMode>,
);
