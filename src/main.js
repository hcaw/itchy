// Itchy — boot: open storage, load the last song (or start a new one), start the app.

import { Engine } from './audio/engine.js';
import { openStorage } from './storage/storage.js';
import { createProject, migrate } from './model/project.js';
import { Store, BACKUP_KEY } from './ui/store.js';
import { App } from './ui/app.js';
import { plugins } from './ui/plugins.js';

async function boot() {
  const storage = await openStorage();
  let project = null;
  try {
    const id = await storage.getCurrentId();
    if (id) project = await storage.loadProject(id);
  } catch (e) {
    console.warn('Itchy: could not load the last song, starting a new one', e);
  }
  // A newer safety copy from a page that closed mid-save wins.
  try {
    const backup = JSON.parse(localStorage.getItem(BACKUP_KEY) || 'null');
    if (backup && (!project || (backup.id === project.id && backup.updated > project.updated))) {
      project = migrate(backup);
      await storage.saveProject(project);
    }
  } catch { /* no backup */ }
  if (!project) {
    project = createProject();
    await storage.saveProject(project).catch(() => {});
    await storage.setCurrentId(project.id).catch(() => {});
  }
  const store = new Store({ project, storage });
  const engine = new Engine(() => store.project);
  const app = new App({ store, engine, plugins: plugins(storage) });
  // Handy for debugging and for automated checks. Not used by the app itself.
  window.itchy = { store, engine, app, storage };
}

boot();
