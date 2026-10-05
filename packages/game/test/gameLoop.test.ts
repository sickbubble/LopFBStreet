import { describe, expect, it } from 'vitest';
import { BallState, BallVerb, TouchKind, streetWorld } from '@lopfb/domain';
import { BallController } from '../src/ball/ballController.js';
import type { InputSnapshot } from '../src/input/actions.js';
import { LaunchInput } from '../src/player/launchInput.js';
import { PlayerMotor } from '../src/player/playerMotor.js';

/**
 * The adapters wired as main.ts wires them, stepped with scripted input and
 * no renderer: the whole Godot loop (input, motor, possession, solver,
 * integrator) on the street. What the smoke test cannot press, this does.
 */
const STEP = 1 / 120;
const IDLE: InputSnapshot = {
  moveX: 0,
  moveY: 0,
  sprint: false,
  bounceHeld: false,
  launchHeld: false,
  jumpPressed: false,
  resetPressed: false,
};

function street() {
  const world = streetWorld();
  const motor = new PlayerMotor(0);
  motor.place(0, -3, 0);
  const ball = new BallController([motor], world);
  ball.spawn({ x: 0, y: 1.2, z: -3.3 });
  // Looking down the street at the goal, a little down: the chase camera at rest.
  const launcher = new LaunchInput(motor, ball, () => ({ x: 0, y: -0.14, z: -0.99 }));
  const run = (seconds: number, input: InputSnapshot = IDLE): void => {
    for (let i = 0; i < Math.round(seconds / STEP); i++) {
      launcher.step(input, STEP);
      motor.step(input, 0, ball, STEP, world);
      ball.physicsProcess(STEP);
      ball.integrate(STEP);
    }
  };
  return { motor, ball, run };
}

describe('the street, played', () => {
  it('a ball dropped on the instep is trapped and then kept up with no buttons pressed', () => {
    const { ball, run } = street();
    run(2);
    expect(ball.ownerId).toBe(0);
    expect(ball.state).toBe(BallState.Possession);
    expect(ball.readout.touches).toBeGreaterThanOrEqual(3);
    expect(ball.readout.lastTouch).toBe(TouchKind.KeepUp);
    expect(ball.body.py).toBeLessThan(1);
  });

  it('a full bounce hold takes the ball to the head and it stalls there', () => {
    const { ball, run } = street();
    run(2);
    run(0.6, { ...IDLE, bounceHeld: true });
    run(2.5);
    expect(ball.readout.level).toBe(BallVerb.Head);
    expect(ball.readout.stuck).toBe(true);
  });

  it('walking with the ball on the head goes at the head pace, and the ball stays on', () => {
    const { ball, motor, run } = street();
    run(2);
    run(0.6, { ...IDLE, bounceHeld: true });
    run(2.5);
    const z0 = motor.position.z;
    run(2, { ...IDLE, moveY: 1 });
    const speed = (z0 - motor.position.z) / 2;
    expect(ball.readout.stuck).toBe(true);
    expect(speed).toBeGreaterThan(0.5);
    expect(speed).toBeLessThan(5 * 0.4);
  });

  it('a full pass off the head leaves the player and lands loose up the street', () => {
    const { ball, motor, run } = street();
    run(2);
    run(0.6, { ...IDLE, bounceHeld: true });
    run(2.5);
    run(1, { ...IDLE, launchHeld: true });
    run(3);
    expect(ball.ownerId).toBe(-1);
    expect(ball.state).toBe(BallState.Loose);
    expect(ball.body.pz).toBeLessThan(motor.position.z - 5);
  });

  it('R puts the ball back 1.5 m in front of the player, 1.2 m up, at rest', () => {
    const { ball, motor, run } = street();
    run(2);
    run(STEP, { ...IDLE, resetPressed: true });
    // Inside the possession radius, so it is the player's again at once, as in Godot.
    expect(ball.body.pz).toBeCloseTo(motor.position.z - 1.5, 1);
    expect(ball.body.py).toBeCloseTo(1.2, 1);
    expect(Math.hypot(ball.body.vx, ball.body.vz)).toBeLessThan(0.01);
  });
});
