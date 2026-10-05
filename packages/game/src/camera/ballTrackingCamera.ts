import { Object3D, PerspectiveCamera, Vector3 } from 'three';
import {
  CameraBias,
  CameraBlend,
  CameraFraming,
  CameraModes,
  clamp,
  lerpf,
  type BallWorld,
  type CameraMode,
  type Vec3,
} from '@lopfb/domain';

const DEG = Math.PI / 180;

/**
 * Exports of `BallTrackingCamera` that GoldenDump did not reach: copied from
 * the C# defaults at godot-final and logged in TUNING_LOG as such.
 */
export const CAMERA_RIG = {
  Sensitivity: 0.0022,
  MinPitch: -70,
  MaxPitch: 75,
  BiasHeight: 1.6,
  BiasSpeed: 4.0,
  /** Where the aim rests, degrees. */
  RestPitch: -8,
  /** The rig's pivot above the player's origin: player.tscn's CamYaw at y = 1.5. */
  PivotHeight: 1.5,
  /** The SpringArm3D's margin. */
  ArmMargin: 0.2,
  BlendTime: CameraBlend.DefaultDuration,
  ToastSeconds: 1.5,
} as const;

/**
 * The mouse-look rig that leans toward the ball without taking the camera off
 * the player, with the five trial framings cycled by C: the port of
 * `BallTrackingCamera`. **Aim and view are separate**: `aimDirection` reads
 * yaw and pitch exactly as the mouse set them; the view's lag, lean and
 * offsets never move a pass. The hierarchy mirrors Godot's CamYaw → (CamPitch)
 * → Arm → Camera3D, built in the yaw node's flat frame so a side view never
 * rolls.
 */
export class BallTrackingCamera {
  yaw = 0;
  /** The aim pitch, degrees. */
  pitch: number = CAMERA_RIG.RestPitch;
  modeIndex = 0;
  toastLeft: number = CAMERA_RIG.ToastSeconds;

  private viewPitch = 0;
  private blendFrom: CameraMode;
  private blendElapsed = Number.POSITIVE_INFINITY;
  private readonly modes: readonly CameraMode[] = CameraModes.default;
  private readonly yawNode = new Object3D();
  private readonly armNode = new Object3D();
  private readonly tmpA = new Vector3();
  private readonly tmpB = new Vector3();

  constructor(
    readonly camera: PerspectiveCamera,
    private readonly world: BallWorld,
  ) {
    const problems = CameraModes.problems(this.modes);
    if (problems.length > 0) console.error('camera modes:', problems.join(' '));
    this.blendFrom = this.modes[0] ?? CameraModes.Chase;
    this.yawNode.name = 'CamYaw';
    this.armNode.name = 'Arm';
    this.armNode.rotation.order = 'YXZ';
    this.yawNode.add(this.armNode);
  }

  get modeName(): string {
    return this.currentMode().Name;
  }

  get modeCount(): number {
    return this.modes.length;
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx * CAMERA_RIG.Sensitivity;
    this.pitch = clamp(this.pitch - (dy * CAMERA_RIG.Sensitivity) / DEG, CAMERA_RIG.MinPitch, CAMERA_RIG.MaxPitch);
  }

  cycleMode(): void {
    this.blendFrom = this.currentMode();
    this.modeIndex = CameraModes.next(this.modeIndex, this.modes.length);
    this.blendElapsed = 0;
    this.toastLeft = CAMERA_RIG.ToastSeconds;
  }

  /** Full 3D aim off yaw and pitch, never the rendered camera: forward is -Z. */
  aimDirection(): Vec3 {
    const p = this.pitch * DEG;
    return { x: -Math.sin(this.yaw) * Math.cos(p), y: Math.sin(p), z: -Math.cos(this.yaw) * Math.cos(p) };
  }

  /** Once per frame, with the drawn player origin and ball. */
  update(dt: number, playerOrigin: Vector3, ball: Vector3): void {
    if (Number.isFinite(this.blendElapsed)) this.blendElapsed += dt;
    this.toastLeft = Math.max(this.toastLeft - dt, 0);
    const mode = this.currentMode();

    const k = clamp(CAMERA_RIG.BiasSpeed * dt, 0, 1);
    this.yawNode.position.set(playerOrigin.x, playerOrigin.y + CAMERA_RIG.PivotHeight, playerOrigin.z);
    this.viewPitch = lerpf(this.viewPitch, this.viewTarget(mode, ball), k);

    this.yawNode.rotation.set(0, this.yaw, 0);
    this.armNode.position.set(mode.LateralOffset, mode.PivotRise, 0);
    this.armNode.rotation.set(this.viewPitch * DEG, mode.YawOffset * DEG, 0);
    this.yawNode.updateMatrixWorld(true);

    // The SpringArm3D: the arm runs along its +Z, pulled in by the walls.
    const origin = this.armNode.getWorldPosition(this.tmpA);
    const end = this.tmpB.set(0, 0, mode.ArmLength).applyMatrix4(this.armNode.matrixWorld);
    const length = this.springLength(origin, end, mode.ArmLength);

    this.camera.position.set(0, 0, length).applyMatrix4(this.armNode.matrixWorld);
    this.armNode.getWorldQuaternion(this.camera.quaternion);
    if (this.camera.fov !== mode.Fov) {
      this.camera.fov = mode.Fov;
      this.camera.updateProjectionMatrix();
    }
  }

  private currentMode(): CameraMode {
    const target = this.modes[this.modeIndex] ?? CameraModes.Chase;
    const t = CameraBlend.progress(this.blendElapsed, CAMERA_RIG.BlendTime);
    return t >= 1 ? target : CameraBlend.between(this.blendFrom, target, t);
  }

  /** The aim, leaned toward an overhead ball by this mode's bias, framed by this mode. */
  private viewTarget(mode: CameraMode, ball: Vector3): number {
    let pitch = this.pitch;
    if (mode.BallBias > 0) {
      const toY = ball.y - this.yawNode.position.y;
      const strength = CameraBias.strength(toY, CAMERA_RIG.BiasHeight, mode.BallBias);
      if (strength > 0) {
        const flat = Math.max(Math.hypot(ball.x - this.yawNode.position.x, ball.z - this.yawNode.position.z), 0.001);
        const ballPitch = Math.atan2(toY, flat) / DEG;
        pitch = CameraBias.pitchToward(pitch, ballPitch, strength, CAMERA_RIG.MinPitch, CAMERA_RIG.MaxPitch);
      }
    }
    return CameraFraming.viewPitch(pitch, mode);
  }

  /** The arm's length after the walls: the first box hit along the arm, less the margin. Never the net. */
  private springLength(from: Vector3, to: Vector3, full: number): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    let best = 1;
    for (const c of this.world.colliders) {
      if (c.kind !== 'box' || c.restitution !== undefined) continue;
      const t = rayBox(from.x, from.y, from.z, dx, dy, dz, c.minX, c.minY, c.minZ, c.maxX, c.maxY, c.maxZ);
      if (t !== null && t < best) best = t;
    }
    if (best >= 1) return full;
    return Math.max(best * full - CAMERA_RIG.ArmMargin, 0.1);
  }
}

/** Slab test: the first t in 0..1 where the segment enters the box, or null. */
function rayBox(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): number | null {
  let t0 = 0;
  let t1 = 1;
  const axes: [number, number, number, number][] = [
    [ox, dx, minX, maxX],
    [oy, dy, minY, maxY],
    [oz, dz, minZ, maxZ],
  ];
  for (const [o, d, lo, hi] of axes) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    let a = (lo - o) / d;
    let b = (hi - o) / d;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 > t1) return null;
  }
  return t0;
}
