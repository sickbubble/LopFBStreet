import {
  CanvasTexture,
  CircleGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RingGeometry,
  SRGBColorSpace,
  type Scene,
  type Vector3,
} from 'three';
import { LandingPredictor, isDown } from '@lopfb/domain';
import { toThree } from '../bridge/vec.js';
import type { BallController } from './ballController.js';
import { live } from '../tuning/live.js';

/** Hide the ring when the ball will not land within this many seconds (`BallMarkers.MaxPredictSeconds`). */
const MAX_PREDICT_SECONDS = 4.0;
/** The shadow grows as the ball rises (`BallMarkers.ShadowScalePerMetre`). */
const SHADOW_SCALE_PER_METRE = 0.22;
/** Keeps both markers clear of the ground's own surface. */
const LIFT = 0.01;

/**
 * The ball mesh and its two ground markers, both mandatory (GDD 7): the
 * shadow where the ball is now, the ring where it will come down. The port of
 * `BallMarkers`; the prediction is `LandingPredictor`'s.
 */
export class BallView {
  readonly mesh: Mesh;
  private readonly shadow: Mesh;
  private readonly landing: Mesh;

  constructor(scene: Scene) {
    const radius = live.ball.Body.Radius;
    this.mesh = new Mesh(new IcosahedronGeometry(radius, 3), new MeshStandardMaterial({ map: panelTexture(), roughness: 0.55 }));
    this.mesh.name = 'Ball';
    this.mesh.castShadow = true;

    this.shadow = new Mesh(
      new CircleGeometry(radius * 1.1, 24),
      new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.shadow.name = 'BallShadow';
    this.shadow.rotation.x = -Math.PI / 2;

    this.landing = new Mesh(
      new RingGeometry(0.16, 0.21, 32),
      new MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.landing.name = 'LandingRing';
    this.landing.rotation.x = -Math.PI / 2;

    const root = new Group();
    root.name = 'BallMarkers';
    root.add(this.shadow, this.landing);
    scene.add(this.mesh, root);
  }

  /** Draw the ball at `at` (interpolated between steps), and its markers from the live state. */
  update(at: Vector3, ball: BallController, dt: number): void {
    this.mesh.position.copy(at);
    // Spin is the body's; the mesh only shows it.
    this.mesh.rotation.x += ball.body.wx * dt;
    this.mesh.rotation.y += ball.body.wy * dt;
    this.mesh.rotation.z += ball.body.wz * dt;

    const groundY = 0;
    const height = Math.max(at.y - groundY, 0);
    this.shadow.position.set(at.x, groundY + LIFT, at.z);
    const size = 1 + height * SHADOW_SCALE_PER_METRE;
    this.shadow.scale.set(size, size, 1);

    const landing = LandingPredictor.predict(ball.position, ball.velocity, ball.effectiveGravity, groundY, live.ball.Body.Radius);
    const inFlight = !isDown(landing) && landing.TimeToLand <= MAX_PREDICT_SECONDS;
    this.landing.visible = inFlight;
    if (inFlight) {
      toThree(landing.Point, this.landing.position);
      this.landing.position.y = groundY + 2 * LIFT;
    }
  }
}

/** A street ball's panels, so the spin reads. */
function panelTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const g = c.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.fillStyle = '#f2efe6';
  g.fillRect(0, 0, 256, 128);
  g.fillStyle = '#d2482f';
  for (let i = 0; i < 8; i++) g.fillRect(i * 32, 0, 14, 128);
  g.fillStyle = '#1e1e24';
  g.fillRect(0, 60, 256, 8);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}
