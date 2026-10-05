import { ballStateName, ballVerbName, limbName, touchKindName } from '@lopfb/domain';
import type { BallController } from '../ball/ballController.js';
import type { LaunchInput } from '../player/launchInput.js';
import type { PlayerMotor } from '../player/playerMotor.js';

/**
 * The readouts the Godot `DebugHud` had, as DOM text: state, level, apex,
 * touches, the balance bar, the plan, and a toast naming each touch. Plus the
 * two charge bars and the camera toast. Reads only.
 */
export class DebugHud {
  private readonly panel: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly cameraToast: HTMLDivElement;
  private readonly bounceBar: HTMLDivElement;
  private readonly launchBar: HTMLDivElement;
  private readonly help: HTMLDivElement;
  private toastLeft = 0;

  constructor(root: HTMLElement) {
    const el = (id: string, css: string): HTMLDivElement => {
      const d = document.createElement('div');
      d.id = id;
      d.style.cssText = css;
      root.appendChild(d);
      return d;
    };
    const mono = "font-family: ui-monospace, Consolas, monospace; font-size: 12px;";
    this.panel = el('ballhud', `position:fixed;top:12px;left:12px;padding:8px 10px;border-radius:4px;background:rgba(23,19,31,.72);${mono}white-space:pre;pointer-events:none;line-height:1.45`);
    this.toast = el('touchtoast', 'position:fixed;left:50%;top:38%;transform:translateX(-50%);font:600 26px system-ui,sans-serif;color:#fff3c4;text-shadow:0 2px 6px #000;pointer-events:none;opacity:0;transition:opacity .15s');
    this.cameraToast = el('cameratoast', 'position:fixed;left:50%;top:96px;transform:translateX(-50%);font:600 22px system-ui,sans-serif;color:#fff;text-shadow:0 2px 6px #000;pointer-events:none');
    const bar = (id: string, bottom: number, color: string): HTMLDivElement => {
      const outer = el(`${id}-outer`, `position:fixed;left:50%;bottom:${bottom}px;width:220px;height:8px;margin-left:-110px;background:rgba(0,0,0,.45);border-radius:4px;overflow:hidden;pointer-events:none`);
      const inner = document.createElement('div');
      inner.id = id;
      inner.style.cssText = `height:100%;width:0;background:${color}`;
      outer.appendChild(inner);
      return inner;
    };
    this.bounceBar = bar('bouncebar', 64, '#8fd18a');
    this.launchBar = bar('launchbar', 50, '#ff9a5c');
    this.help = el('help', `position:fixed;right:12px;bottom:12px;padding:6px 10px;border-radius:4px;background:rgba(23,19,31,.6);${mono}color:#c3b4a3;white-space:pre;pointer-events:none`);
    this.help.textContent =
      'click: capture mouse   Esc: free it\nWASD move  Shift sprint  Space jump\nLMB hold: bounce height  RMB hold: pass power\nR reset ball  C camera  F1 capsule';
  }

  showToast(text: string): void {
    if (!text) return;
    this.toast.textContent = text;
    this.toast.style.opacity = '1';
    this.toastLeft = 0.8;
  }

  update(dt: number, ball: BallController, motor: PlayerMotor, launcher: LaunchInput, camera: { name: string; index: number; count: number; toastLeft: number }, locked: boolean): void {
    this.toastLeft = Math.max(this.toastLeft - dt, 0);
    if (this.toastLeft <= 0) this.toast.style.opacity = '0';

    this.cameraToast.textContent = camera.toastLeft > 0 ? `Camera: ${camera.name} (${camera.index + 1}/${camera.count})  [C]` : '';
    this.cameraToast.style.opacity = String(Math.min(camera.toastLeft / 0.3, 1));

    this.bounceBar.style.width = `${(launcher.bounceRatio * 100).toFixed(0)}%`;
    this.launchBar.style.width = `${(launcher.chargeRatio * 100).toFixed(0)}%`;

    const r = ball.readout;
    const plan = ball.plan;
    const strainBar = '#'.repeat(Math.round(r.strain * 10)).padEnd(10, '.');
    const speed = Math.hypot(motor.velocity.x, motor.velocity.z);
    const lines = [
      `state     ${ballStateName(ball.state)}${ball.ownerId === motor.id ? ' (yours)' : ''}`,
      `level     ${ballVerbName(r.level)}${r.stuck ? '  HELD' : ''}${r.commanded ? '  commanded' : ''}${r.controlled ? '' : '  not controlled'}`,
      `apex      ${r.targetApex.toFixed(2)} m${r.pendingApex !== null ? `  -> ${r.pendingApex.toFixed(2)} queued` : ''}`,
      `balance   [${strainBar}]`,
      `touches   ${r.touches}   breaks ${r.breaks}   last ${touchKindName(r.lastTouch)} (${limbName(r.lastLimb)})`,
      `plan      ${plan.Limb === 0 ? '-' : `${limbName(plan.Limb)} ${touchKindName(plan.Kind)} in ${plan.TimeToContact.toFixed(2)} s${plan.Reachable ? '' : '  MISS'}${plan.Following ? '  follow' : ''}`}`,
      `speed     ${speed.toFixed(1)} m/s  x${motor.carryFactor.toFixed(2)}`,
      `bounce    ${launcher.lastBounce}   bounces ${launcher.bounces}`,
      `pass      ${r.launchPending ? 'queued  ' : ''}${launcher.lastLaunch}`,
      locked ? '' : '\n(click the street to play)',
    ];
    this.panel.textContent = lines.join('\n');
  }
}
