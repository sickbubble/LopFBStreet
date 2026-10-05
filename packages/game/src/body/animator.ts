import { CapsuleGeometry, Mesh, MeshStandardMaterial, Quaternion, Vector3, type AnimationAction, type Object3D } from 'three';
import {
  Limb,
  PosePart,
  posePartOf,
  poseAngle,
  poseWeight,
  swingTimeFor,
  type ContactPlan,
  type TouchPoseSettings,
} from '@lopfb/domain';
import { live } from '../tuning/live.js';
import type { Mannequin } from './mannequin.js';

/** The authored speeds of the walk and run cycles (player.json's stride), so the feet do not skate. */
const CLIPS = { idle: 'Idle_Loop', walk: 'Walk_Loop', jog: 'Jog_Fwd_Loop', sprint: 'Sprint_Loop', jump: 'Jump_Loop' } as const;

/** Which bone each pose part turns, on the UAL1 rig. Engine vocabulary. */
const BONES: Record<PosePart, string | null> = {
  [PosePart.None]: null,
  [PosePart.LeftLeg]: 'thigh_l',
  [PosePart.RightLeg]: 'thigh_r',
  [PosePart.Chest]: 'spine_03',
  [PosePart.Head]: 'Head',
  [PosePart.LeftShoulder]: 'clavicle_l',
  [PosePart.RightShoulder]: 'clavicle_r',
};

/**
 * The body: clips blended by speed (the `PlayerAnimator` thresholds from
 * animator.json) and one procedural bone turn per touch on top: a kick, a
 * knee, a chest, a header, a shoulder. **A stand-in** for Godot's strike
 * paths and IK (CLAUDE.md rule 4): it reads the plan and the last contact and
 * never writes the ball. F1 swaps it for the capsule, as in Godot.
 */
export class Animator {
  private clip = '';
  private action: AnimationAction | null = null;
  private readonly bones = new Map<PosePart, Object3D>();
  private readonly capsule: Mesh;
  private lastContactLimb: Limb = Limb.None;
  private sinceContact: number | null = null;
  private seenContacts = 0;
  private readonly axis = new Vector3();
  private readonly qDelta = new Quaternion();
  private readonly qParent = new Quaternion();
  private readonly qWorld = new Quaternion();

  constructor(
    private readonly mannequin: Mannequin,
    private readonly pose: TouchPoseSettings,
  ) {
    for (const [part, name] of Object.entries(BONES)) {
      if (!name) continue;
      const bone = mannequin.root.getObjectByName(name);
      if (bone) this.bones.set(Number(part) as PosePart, bone);
      else console.warn(`mannequin has no bone '${name}'; that part will not pose`);
    }

    this.capsule = new Mesh(
      new CapsuleGeometry(live.player.BodyRadius, live.player.BodyHeight - 2 * live.player.BodyRadius, 6, 16),
      new MeshStandardMaterial({ color: 0x6aa0d8, roughness: 0.6 }),
    );
    this.capsule.name = 'Capsule';
    this.capsule.position.y = live.player.BodyHeight / 2;
    this.capsule.castShadow = true;
    this.capsule.visible = false;
    mannequin.root.add(this.capsule);
  }

  toggleCapsule(): void {
    this.capsule.visible = !this.capsule.visible;
    const character = this.mannequin.root.getObjectByName('Character');
    if (character) character.visible = !this.capsule.visible;
  }

  /** Once per frame, after the mixer would run. */
  update(dt: number, speed: number, onFloor: boolean, plan: ContactPlan, contacts: number, contactLimb: Limb): void {
    const a = live.animator;
    let clip: string = CLIPS.idle;
    let scale = 1;
    const stride = live.player.Stride;
    if (!onFloor) clip = CLIPS.jump;
    else if (speed >= a.SprintAbove) {
      clip = CLIPS.sprint;
      scale = speed / live.player.SprintSpeed;
    } else if (speed >= a.RunAbove) {
      clip = CLIPS.jog;
      scale = speed / stride.RunSpeed;
    } else if (speed >= a.WalkAbove) {
      clip = CLIPS.walk;
      scale = speed / stride.WalkSpeed;
    }

    if (clip !== this.clip) {
      this.clip = clip;
      this.action = this.mannequin.play(clip);
    }
    if (this.action) this.action.timeScale = Math.min(Math.max(scale, 0.5), 1.6);

    this.mannequin.mixer.update(dt);

    if (contacts !== this.seenContacts) {
      this.seenContacts = contacts;
      this.lastContactLimb = contactLimb;
      this.sinceContact = 0;
    } else if (this.sinceContact !== null) {
      this.sinceContact += dt;
      if (this.sinceContact > this.pose.Recover) this.sinceContact = null;
    }

    this.mannequin.root.updateMatrixWorld(true);
    for (const [part, bone] of this.bones) this.turn(part, bone, plan);
  }

  /** One part's turn: toward the planned contact, away after the last one. In the model's own axes. */
  private turn(part: PosePart, bone: Object3D, plan: ContactPlan): void {
    let limb: Limb = Limb.None;
    let weight = 0;

    if (plan.Limb !== Limb.None && posePartOf(plan.Limb) === part) {
      limb = plan.Limb;
      weight = poseWeight(swingTimeFor(plan, plan.Limb), null, this.pose);
    }
    if (this.sinceContact !== null && posePartOf(this.lastContactLimb) === part) {
      const after = poseWeight(null, this.sinceContact, this.pose);
      if (after > weight) {
        weight = after;
        limb = this.lastContactLimb;
      }
    }
    if (weight <= 0 || limb === Limb.None) return;

    let angle = poseAngle(limb, this.pose) * weight;
    const model = this.mannequin.root;
    // The model faces +Z in its own space. Legs and spine swing about its
    // right-left axis; a shoulder shrugs about its forward axis.
    if (part === PosePart.LeftShoulder || part === PosePart.RightShoulder) {
      this.axis.set(0, 0, 1).transformDirection(model.matrixWorld);
      if (part === PosePart.RightShoulder) angle = -angle;
    } else {
      // A negative turn about the model's +X sends a leg (pointing down)
      // forward to +Z, and a spine or a head (pointing up) back to -Z.
      this.axis.set(1, 0, 0).transformDirection(model.matrixWorld);
      angle = -angle;
    }

    this.qDelta.setFromAxisAngle(this.axis, angle);
    bone.getWorldQuaternion(this.qWorld);
    this.qWorld.premultiply(this.qDelta);
    if (bone.parent) {
      bone.parent.getWorldQuaternion(this.qParent).invert();
      bone.quaternion.copy(this.qParent.multiply(this.qWorld));
    } else {
      bone.quaternion.copy(this.qWorld);
    }
    bone.updateMatrixWorld(true);
  }
}
