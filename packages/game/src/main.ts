import { ACESFilmicToneMapping, PCFShadowMap, PerspectiveCamera, Scene, Timer, Vector3, WebGLRenderer } from 'three';
import { FixedStep, loadTouchPoseSettings, streetWorld } from '@lopfb/domain';
import playerJson from '../../../tools/golden/tuning/player.json';
import { BallController } from './ball/ballController.js';
import { BallView } from './ball/ballMarkers.js';
import { Animator } from './body/animator.js';
import { loadMannequin } from './body/mannequin.js';
import { BallTrackingCamera } from './camera/ballTrackingCamera.js';
import { installDebugHook } from './debug/hook.js';
import { installInput } from './input/actions.js';
import { LaunchInput } from './player/launchInput.js';
import { PassPreview } from './player/passPreview.js';
import { PlayerMotor } from './player/playerMotor.js';
import { buildStreet } from './scene/street.js';
import { DebugHud } from './ui/debugHud.js';
import { installTuningPanel } from './ui/tuningPanel.js';

// The Godot build's carry, bounce, stall, trap, reception and pass on the
// street, at 120 fixed steps a second. Every rule is packages/domain's; this
// file wires the adapters in Godot's per-step order.

function need<T extends Element>(selector: string): T {
  const el = document.querySelector<T>(selector);
  if (!el) throw new Error(`index.html is missing ${selector}`);
  return el;
}

const canvas = need<HTMLCanvasElement>('#view');
const hudStats = need<HTMLDivElement>('#hud');
const status = need<HTMLDivElement>('#status');

const renderer = new WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
renderer.toneMapping = ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new Scene();
const camera = new PerspectiveCamera(75, 1, 0.05, 200);

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
const world = streetWorld();
const debug = installDebugHook(scene);
const input = installInput(canvas);
const hud = new DebugHud(document.body);
installTuningPanel();

const motor = new PlayerMotor(0);
motor.place(0, -3, 0); // facing -Z, toward the goal
const ball = new BallController([motor], world);
// Dropped onto the instep, inside the foot's reach: the first touch is the trap (S24).
ball.spawn({ x: 0, y: 1.2, z: -3.3 });
const ballView = new BallView(scene);
const rig = new BallTrackingCamera(camera, world);
const launcher = new LaunchInput(motor, ball, () => rig.aimDirection());
const preview = new PassPreview(scene, motor, ball, launcher, world);

let animator: Animator | undefined;
let playerRoot: import('three').Group | undefined;

loadMannequin()
  .then((m) => {
    playerRoot = m.root;
    scene.add(m.root);
    animator = new Animator(m, loadTouchPoseSettings(playerJson));
    status.textContent = 'Click the street to play.';
    debug.ready = true;
  })
  .catch((err: unknown) => {
    status.textContent = 'The mannequin did not load. See the console.';
    console.error('mannequin load failed', err);
  });

debug.state = () => ({
  ball: ball.position,
  ballState: ball.state,
  owner: ball.ownerId,
  player: motor.origin,
  touches: ball.readout.touches,
});

const clock = new FixedStep(120, 8);
const timer = new Timer();
const drawnPlayer = new Vector3();
const drawnBall = new Vector3();
let fixedSteps = 0;
let frames = 0;
let window0 = 0;

function frame(now: number): void {
  requestAnimationFrame(frame);
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 0.25);

  const mouse = input.takeMouse();
  rig.look(mouse.dx, mouse.dy);
  for (const key of input.takeFramePresses()) {
    if (key === 'KeyC') rig.cycleMode();
    if (key === 'F1') animator?.toggleCapsule();
  }

  const steps = clock.advance(dt);
  const step = clock.step;
  for (let i = 0; i < steps; i++) {
    // Godot's order: the nodes' _PhysicsProcess (player, its LaunchInput, the
    // ball), then the physics step that calls the ball's _IntegrateForces.
    const snapshot = input.poll();
    launcher.step(snapshot, step);
    motor.step(snapshot, rig.yaw, ball, step, world);
    ball.physicsProcess(step);
    ball.integrate(step);
    preview.update();
    fixedSteps++;
  }
  for (const e of ball.events.splice(0)) hud.showToast(e);

  // Draw between the last two steps.
  const a = clock.alpha;
  drawnPlayer.set(
    motor.previous.x + (motor.position.x - motor.previous.x) * a,
    motor.previous.y + (motor.position.y - motor.previous.y) * a,
    motor.previous.z + (motor.position.z - motor.previous.z) * a,
  );
  drawnBall.set(
    ball.previous.x + (ball.body.px - ball.previous.x) * a,
    ball.previous.y + (ball.body.py - ball.previous.y) * a,
    ball.previous.z + (ball.body.pz - ball.previous.z) * a,
  );

  if (playerRoot) {
    playerRoot.position.copy(drawnPlayer);
    // The mannequin faces +Z; the motor's yaw is Godot's, whose forward is -Z.
    playerRoot.rotation.y = motor.yaw + Math.PI;
  }
  animator?.update(dt, Math.hypot(motor.velocity.x, motor.velocity.z), motor.onFloor, ball.plan, ball.contacts, ball.lastContact?.limb ?? 0);
  ballView.update(drawnBall, ball, dt);
  rig.update(dt, drawnPlayer, drawnBall);
  street.update(timer.getElapsed());
  renderer.render(scene, camera);

  hud.update(dt, ball, motor, launcher, { name: rig.modeName, index: rig.modeIndex, count: rig.modeCount, toastLeft: rig.toastLeft }, input.locked);
  status.style.display = input.locked ? 'none' : '';

  frames++;
  window0 += dt;
  if (window0 >= 0.5) {
    const fps = frames / window0;
    const stepsPerSecond = fixedSteps / window0;
    frames = 0;
    fixedSteps = 0;
    window0 = 0;
    const info = renderer.info.render;
    hudStats.textContent = `${fps.toFixed(0)} fps · ${stepsPerSecond.toFixed(0)} steps/s · ${info.calls} draws · ${(info.triangles / 1000).toFixed(0)}k tris`;
    debug.stepsPerSecond = stepsPerSecond;
  }
}
requestAnimationFrame(frame);
