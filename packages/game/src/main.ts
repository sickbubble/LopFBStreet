import { ACESFilmicToneMapping, PCFSoftShadowMap, PerspectiveCamera, Scene, Timer, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FixedStep } from '@lopfb/domain';
import { buildStreet } from './scene/street.js';
import { loadMannequin, type Mannequin } from './body/mannequin.js';
import { installDebugHook } from './debug/hook.js';

// W0: the street, the mannequin idling on it, and the fixed 120 Hz clock that
// W1's solvers will run on. Nothing plays yet.

function need<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`index.html is missing ${selector}`);
  return el;
}

const canvas = need<HTMLCanvasElement>('#view');
const hud = need<HTMLDivElement>('#hud');
const status = need<HTMLDivElement>('#status');

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFSoftShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new Scene();
const camera = new PerspectiveCamera(62, 1, 0.1, 200);
camera.position.set(1.2, 2.2, 2.2);

const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 1.0, -3);
controls.enableDamping = true;

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const street = buildStreet(scene);
let player: Mannequin | undefined;

const debug = installDebugHook(scene);

loadMannequin()
  .then((m) => {
    player = m;
    m.root.position.set(0, 0, -3);
    m.root.rotation.y = Math.PI; // the mannequin faces +Z; the goal is at -Z
    scene.add(m.root);
    m.play('Idle_Loop');
    status.textContent = `Mannequin: ${m.clips.length} clips. Drag to look around.`;
    debug.ready = true;
  })
  .catch((err: unknown) => {
    status.textContent = 'The mannequin did not load. See the console.';
    console.error('mannequin load failed', err);
  });

const clock = new FixedStep(120, 8);
const timer = new Timer();
let fixedSteps = 0;
let frames = 0;
let window0 = 0;
let stepsPerSecond = 0;
let fps = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.25);

  const steps = clock.advance(dt);
  for (let i = 0; i < steps; i++) {
    // W1 puts the solvers here. Every write to the ball happens inside this loop.
    fixedSteps++;
  }

  player?.mixer.update(dt);
  street.update(timer.getElapsed());
  controls.update();
  renderer.render(scene, camera);

  frames++;
  window0 += dt;
  if (window0 >= 0.5) {
    fps = frames / window0;
    stepsPerSecond = fixedSteps / window0;
    frames = 0;
    fixedSteps = 0;
    window0 = 0;
    const info = renderer.info.render;
    hud.textContent = `${fps.toFixed(0)} fps · ${stepsPerSecond.toFixed(0)} steps/s · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris`;
    debug.stepsPerSecond = stepsPerSecond;
  }
}
requestAnimationFrame(frame);
