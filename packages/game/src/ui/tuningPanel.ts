import GUI from 'lil-gui';
import { live, shipped } from '../tuning/live.js';

/**
 * The lil-gui panel over the live settings (C1.10): the Godot build's Remote
 * tab. Every field edits `live` in place, which every fixed step reads.
 * "Copy as JSON" puts the current values on the clipboard for TUNING_LOG;
 * "Reset" goes back to the shipped files. Closed by default; H toggles it.
 */
export function installTuningPanel(): GUI {
  const gui = new GUI({ title: 'Tuning (H)', width: 300 });
  gui.close();

  type Obj = Record<string, unknown>;
  const addAll = (folder: GUI, obj: Obj): void => {
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'number') folder.add(obj, key).listen();
      else if (typeof value === 'object' && value !== null) addAll(folder.addFolder(key).close(), value as Obj);
    }
  };

  addAll(gui.addFolder('Ball').close(), live.ball as unknown as Obj);
  addAll(gui.addFolder('Player').close(), live.player as unknown as Obj);
  addAll(gui.addFolder('Animator').close(), live.animator as unknown as Obj);
  addAll(gui.addFolder('Contact (web)').close(), live.contact as unknown as Obj);
  addAll(gui.addFolder('World').close(), live.world as unknown as Obj);

  const actions = {
    'Copy as JSON': (): void => {
      const text = JSON.stringify(live, null, 2);
      void navigator.clipboard?.writeText(text).catch(() => console.log(text));
    },
    Reset: (): void => {
      const copy = (to: Obj, from: Obj): void => {
        for (const [k, v] of Object.entries(from)) {
          if (typeof v === 'object' && v !== null) copy(to[k] as Obj, v as Obj);
          else to[k] = v;
        }
      };
      copy(live as unknown as Obj, shipped as unknown as Obj);
    },
  };
  gui.add(actions, 'Copy as JSON');
  gui.add(actions, 'Reset');

  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyH' && !e.repeat) gui._closed ? gui.open() : gui.close();
  });
  return gui;
}
