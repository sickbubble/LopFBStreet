import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  type Scene,
} from 'three';
import { ballOverlaps, LaunchSolver, planExists, TrajectorySampler, type BallWorld, type Vec3 } from '@lopfb/domain';
import type { BallController } from '../ball/ballController.js';
import { live } from '../tuning/live.js';
import type { LaunchInput } from './launchInput.js';
import type { PlayerMotor } from './playerMotor.js';

/** `PassPreview` exports, unchanged. */
const PREVIEW_SECONDS = 3.0;
const SAMPLES = 60;
const ARC_WIDTH = 0.05;
const QUEUED_TRANSPARENCY = 0.6;
/** The sweep uses a ball this much smaller, so a ball launched off the floor does not find the floor. */
const SWEEP_MARGIN = 0.02;

/**
 * The arc preview (S4, S28): the port of `PassPreview`. While the pass is
 * charging it solves the request the release would queue; while one is
 * queued it re-solves the queued one, both with the plan's limb now and the
 * body's facing now, so the arc and the pass cannot disagree. The points are
 * `TrajectorySampler`'s, the same step as the ball; the sweep that cuts them
 * runs the ball's own collision against the street.
 */
export class PassPreview {
  private readonly arc: Mesh;
  private readonly impact: Mesh;
  private readonly arcMaterial: MeshBasicMaterial;
  private readonly impactMaterial: MeshBasicMaterial;
  private readonly positions = new Float32Array(SAMPLES * 2 * 3);
  private readonly points: Vec3[] = new Array<Vec3>(SAMPLES).fill({ x: 0, y: 0, z: 0 });

  constructor(
    scene: Scene,
    private readonly motor: PlayerMotor,
    private readonly ball: BallController,
    private readonly launcher: LaunchInput,
    private readonly world: BallWorld,
  ) {
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    const index: number[] = [];
    for (let i = 0; i < SAMPLES - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geometry.setIndex(index);
    this.arcMaterial = new MeshBasicMaterial({ color: 0xfff0a0, transparent: true, side: DoubleSide, depthWrite: false });
    this.arc = new Mesh(geometry, this.arcMaterial);
    this.arc.name = 'PassArc';
    this.arc.frustumCulled = false;

    this.impactMaterial = new MeshBasicMaterial({ color: 0xff7a4a, transparent: true });
    this.impact = new Mesh(new SphereGeometry(0.07, 12, 8), this.impactMaterial);
    this.impact.name = 'PassImpact';

    this.arc.visible = this.impact.visible = false;
    scene.add(this.arc, this.impact);
  }

  /** Once per fixed step, after the solver: the arc for the contact as now planned. */
  update(): void {
    const ball = this.ball;
    if (ball.ownerId !== this.motor.id) return this.hide();

    const charging = this.launcher.held === 'launch';
    const source = charging ? this.launcher.currentRequest() : ball.pendingLaunch;
    if (!source) return this.hide();

    const plan = ball.plan;
    const launch = LaunchSolver.solve({ ...source, Limb: plan.Limb, Facing: this.motor.facing }, live.ball.Launch, live.ball.Bands);
    const start = planExists(plan) ? plan.Point : ball.position;

    TrajectorySampler.sample(start, launch.Velocity, ball.effectiveGravity, ball.effectiveDamp, 1 / 120, PREVIEW_SECONDS, this.points);
    const { count, impact } = TrajectorySampler.truncate(this.points, (a, b) => this.firstHit(a, b));

    this.draw(count, launch.Velocity);
    this.impact.position.set(impact.x, impact.y, impact.z);

    const opacity = charging ? 1 : 1 - QUEUED_TRANSPARENCY;
    this.arcMaterial.opacity = 0.85 * opacity;
    this.impactMaterial.opacity = opacity;
    this.arc.visible = this.impact.visible = true;
  }

  private hide(): void {
    this.arc.visible = this.impact.visible = false;
  }

  /** A flat ribbon, its width across the flat direction of travel. */
  private draw(count: number, velocity: Vec3): void {
    const fl = Math.hypot(velocity.x, velocity.z);
    const ax = fl > 0.01 ? (-velocity.z / fl) * ARC_WIDTH * 0.5 : ARC_WIDTH * 0.5;
    const az = fl > 0.01 ? (velocity.x / fl) * ARC_WIDTH * 0.5 : 0;
    const pos = this.positions;
    for (let i = 0; i < SAMPLES; i++) {
      const p = this.points[Math.min(i, count - 1)] as Vec3;
      const o = i * 6;
      pos[o] = p.x - ax;
      pos[o + 1] = p.y;
      pos[o + 2] = p.z - az;
      pos[o + 3] = p.x + ax;
      pos[o + 4] = p.y;
      pos[o + 5] = p.z + az;
    }
    const geometry = this.arc.geometry;
    (geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    geometry.setDrawRange(0, Math.max(count - 1, 0) * 6);
  }

  /**
   * The sweep between two samples, for `TrajectorySampler.truncate`: a ball a
   * little smaller than the real one, stepped in short hops against the same
   * world the ball collides with. The last clear point before contact is the impact.
   */
  private firstHit(from: Vec3, to: Vec3): Vec3 | null {
    const radius = Math.max(live.ball.Body.Radius - SWEEP_MARGIN, 0.01);
    const hops = 4;
    let last = from;
    for (let h = 1; h <= hops; h++) {
      const t = h / hops;
      const p = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, z: from.z + (to.z - from.z) * t };
      if (ballOverlaps(p.x, p.y, p.z, radius, this.world)) return last;
      last = p;
    }
    return null;
  }
}
