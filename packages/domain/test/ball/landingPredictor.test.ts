import { describe, expect, it } from 'vitest';
import { Ballistics } from '../../src/ball/ballistics.js';
import { isDown, LandingPredictor, type LandingPrediction } from '../../src/ball/landingPredictor.js';
import { ZERO, type Vec3 } from '../../src/vec.js';

// Port of LandingPredictorTests.cs.
const GRAVITY = 9.81;
const RADIUS = 0.11;
const GROUND = 0;
/** Centre height for a ball resting on the ground. */
const CONTACT = GROUND + RADIUS;

const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const predict = (position: Vec3, velocity: Vec3): LandingPrediction =>
  LandingPredictor.predict(position, velocity, GRAVITY, GROUND, RADIUS);

describe('LandingPredictor', () => {
  // Dropped from one metre above contact: t = sqrt(2h / g) = 0.4515 s.
  it('a dropped ball lands after sqrt 2h over g', () => {
    const landing = predict(v3(0, CONTACT + 1, 0), ZERO);

    expect(landing.TimeToLand).toBeCloseTo(0.4515, 4);
    expect(isDown(landing)).toBe(false);
  });

  it.each([
    [4], // launched upward
    [-4], // already falling
    [0], // at the apex
  ])('matches the closed form for any vertical speed (vy %f)', (verticalSpeed) => {
    const height = 1;
    const landing = predict(v3(0, CONTACT + height, 0), v3(0, verticalSpeed, 0));

    const expected = (verticalSpeed + Math.sqrt(verticalSpeed * verticalSpeed + 2 * GRAVITY * height)) / GRAVITY;

    expect(landing.TimeToLand).toBeCloseTo(expected, 4);
  });

  // Straight up from the floor comes straight back down after 2v/g: every standing keep-up.
  it('a bounce from the floor returns after 2v over g', () => {
    const start = v3(3, CONTACT, -2);
    const landing = predict(start, v3(0, 4, 0));

    expect(landing.TimeToLand).toBeCloseTo((2 * 4) / GRAVITY, 4);
    expect(landing.Point).toEqual(start);
  });

  it('horizontal velocity carries the point for the whole flight', () => {
    const landing = predict(v3(1, CONTACT + 1, 2), v3(3, 0, -1.5));

    const t = landing.TimeToLand;
    expect(landing.Point.x).toBeCloseTo(1 + 3 * t, 4);
    expect(landing.Point.z).toBeCloseTo(2 - 1.5 * t, 4);
  });

  // The S4 guarantee: the marker sits where the flight equation says the ball will be.
  it.each([
    [0, 5, 0],
    [2.5, 3, -1],
    [-4, -2, 6],
  ])('the landing point lies on the flight equation (%f, %f, %f)', (vx, vy, vz) => {
    const start = v3(0.5, CONTACT + 2, -0.5);
    const velocity = v3(vx, vy, vz);
    const landing = predict(start, velocity);

    const onCurve = Ballistics.positionAfter(start, velocity, GRAVITY, landing.TimeToLand);

    expect(landing.Point.x).toBeCloseTo(onCurve.x, 4);
    expect(landing.Point.y).toBeCloseTo(onCurve.y, 3);
    expect(landing.Point.z).toBeCloseTo(onCurve.z, 4);
  });

  it('the point is the centre at contact height not the ground', () => {
    const landing = predict(v3(0, 2, 0), ZERO);

    expect(landing.Point.y).toBe(CONTACT);
  });

  it('ground height offsets the whole prediction', () => {
    const raisedGround = 1.5;
    const landing = LandingPredictor.predict(v3(0, raisedGround + RADIUS + 1, 0), ZERO, GRAVITY, raisedGround, RADIUS);

    expect(landing.Point.y).toBe(raisedGround + RADIUS);
    expect(landing.TimeToLand).toBeCloseTo(0.4515, 4);
  });

  // A resting ball, and one Jolt has let sink a hair into the floor, both count as down.
  it.each([
    [CONTACT, 0],
    [CONTACT - 0.002, 0],
    [CONTACT - 0.002, -0.3],
  ])('a ball on or in the floor is down now (y %f, vy %f)', (y, verticalSpeed) => {
    const landing = predict(v3(4, y, 4), v3(1, verticalSpeed, 0));

    expect(isDown(landing)).toBe(true);
    expect(landing.TimeToLand).toBe(0);
    expect(landing.Point).toEqual(v3(4, CONTACT, 4));
  });

  // Sunk into the floor and too slow to climb out is a penetration, not a flight; no NaN.
  it('too slow to climb out of the floor is down now', () => {
    const landing = predict(v3(0, CONTACT - 1, 0), v3(0, 0.5, 0));

    expect(isDown(landing)).toBe(true);
    expect(Number.isFinite(landing.Point.x)).toBe(true);
  });

  // gravity_scale is live-editable and zero is one drag away: the answer stays finite.
  it('zero gravity still gives a finite answer', () => {
    const landing = LandingPredictor.predict(v3(0, 2, 0), v3(1, 1, 0), 0, GROUND, RADIUS);

    expect(Number.isFinite(landing.TimeToLand)).toBe(true);
    expect(Number.isFinite(landing.Point.x)).toBe(true);
  });
});
