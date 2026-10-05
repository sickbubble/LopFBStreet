import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadAnimatorSettings, loadBallSettings, loadPlayerSettings } from '../../src/tuning/loaders.js';

// The shipped tuning, read as GoldenDump wrote it from godot-final.
type Json = Record<string, unknown>;
const golden = (name: string): Json =>
  JSON.parse(readFileSync(new URL(`../../../../tools/golden/tuning/${name}`, import.meta.url), 'utf8')) as Json;

/** A deep copy to break, so one test's damage never reaches another. */
const copy = (json: Json): Json => structuredClone(json);
const child = (json: Json, key: string): Json => json[key] as Json;

describe('loadBallSettings', () => {
  it('reads the shipped ball as Godot played it', () => {
    const ball = loadBallSettings(golden('ball.json'));

    expect(ball.Body.Bounce).toBe(0.72);
    expect(ball.Body.Radius).toBe(0.11);
    expect(ball.Bounce.Levels.Chest.Apex).toBe(1.63);
    expect(ball.Launch.MaxSpeed).toBe(13);
    expect(ball.Reception.CatchSpeed).toBe(10);
  });

  it('keeps the pass angles in degrees, as the C# record does', () => {
    const ball = loadBallSettings(golden('ball.json'));

    expect(ball.Launch.Parts.Foot.LoftMaxDegrees).toBe(70);
    expect(ball.Launch.Parts.Shoulder.Side).toEqual({ MinDegrees: 20, MaxDegrees: 120 });
    expect(ball.Launch.AimLoftOffset).toBe(40);
  });

  it('a dump missing the bounce names the missing key', () => {
    const json = copy(golden('ball.json'));
    delete child(json, 'Body')['Bounce'];

    expect(() => loadBallSettings(json)).toThrow(/Body\.Bounce/);
  });

  it('a dump missing a whole carry level names the level', () => {
    const json = copy(golden('ball.json'));
    delete child(child(json, 'Bounce'), 'Levels')['Chest'];

    expect(() => loadBallSettings(json)).toThrow(/Bounce\.Levels\.Chest/);
  });

  it('a value that is not a number is refused by name, never played as one', () => {
    const json = copy(golden('ball.json'));
    child(json, 'Launch')['MaxSpeed'] = '13';

    expect(() => loadBallSettings(json)).toThrow(/Launch\.MaxSpeed/);
  });
});

describe('loadPlayerSettings', () => {
  it('reads the shipped body and its scene override', () => {
    const player = loadPlayerSettings(golden('player.json'));

    expect(player.SprintSpeed).toBe(8);
    expect(player.Body.Foot.Lateral).toBe(0.07);
    expect(player.Body.Foot.Reach).toBe(0.55);
    expect(player.Body.Head.Height).toBe(1.45);
  });

  it('the follow tops out at the sprint, as PlayerMotor built it', () => {
    const player = loadPlayerSettings(golden('player.json'));

    expect(player.Follow.TopSpeed).toBe(player.SprintSpeed);
    expect(player.Follow.TopSpeed).toBe(8);
  });

  it('a scene override wins over the script default', () => {
    const json = copy(golden('player.json'));
    child(json, 'values')['HipLateral'] = 0.5;
    child(json, 'values')['WalkSpeed'] = 5;
    json['sceneOverrides'] = { HipLateral: 0.07, WalkSpeed: 3 };

    const player = loadPlayerSettings(json);

    expect(player.Body.Foot.Lateral).toBe(0.07);
    expect(player.Body.Thigh.Lateral).toBe(0.07);
    expect(player.WalkSpeed).toBe(3);
  });

  it('a dump missing the sprint names the missing key', () => {
    const json = copy(golden('player.json'));
    delete child(json, 'values')['SprintSpeed'];

    expect(() => loadPlayerSettings(json)).toThrow(/SprintSpeed/);
  });
});

describe('loadAnimatorSettings', () => {
  it('reads the shipped clip thresholds', () => {
    const animator = loadAnimatorSettings(golden('animator.json'));

    expect(animator).toEqual({ IdleBelow: 0.2, WalkAbove: 0.35, RunAbove: 3.5, SprintAbove: 6.5, Blend: 0.15 });
  });

  it('a dump missing a threshold names it', () => {
    const json = copy(golden('animator.json'));
    delete child(json, 'values')['RunAbove'];

    expect(() => loadAnimatorSettings(json)).toThrow(/RunAbove/);
  });
});
