import { expect, test } from '@playwright/test';

// The build boots, nothing errors, and the scene has what the code expects.
// A green run is not a human looking: the gates are still the developer's.

test('the street boots with the mannequin and the clock ticking', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));

  await page.goto('/');
  await page.waitForFunction(() => window.__lopfb?.ready === true, undefined, { timeout: 45_000 });

  for (const name of ['Street', 'Ground', 'Goal', 'Net', 'Sun', 'Player', 'Character']) {
    expect(await page.evaluate((n) => window.__lopfb?.has(n) ?? false, name), `scene object '${name}'`).toBe(true);
  }

  // Software WebGL in CI renders slowly, but the fixed clock must still tick
  // at its own rate, capped at 8 steps a frame.
  await page.waitForFunction(() => (window.__lopfb?.stepsPerSecond ?? 0) > 0, undefined, { timeout: 15_000 });

  expect(errors).toEqual([]);
});
