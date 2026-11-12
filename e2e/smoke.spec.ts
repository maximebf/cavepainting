import { expect, test, type Page } from '@playwright/test';

interface CaveDebug {
  selection?: unknown;
  sim: {
    ticks: number;
    doc: { actions: { k: string; ticks?: number }[] };
  };
}

const debug = (page: Page) => page.evaluate(() => (window as unknown as { cave: CaveDebug }).cave.sim.doc.actions.map((a) => a.k));

async function enter(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto('/?fresh&seed=7&debug');
  await page.locator('#play:not([disabled])').click();
  await expect(page.locator('#loader')).toBeHidden();
  return errors;
}

test('paints a stroke, blows a stencil, undoes', async ({ page }) => {
  const errors = await enter(page);
  const box = (await page.locator('#game canvas').boundingBox())!;
  const x = box.x + box.width * 0.4;
  const y = box.y + box.height * 0.4;

  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(x + i * 10, y + i * 4);
  await page.mouse.up();

  await page.getByRole('button', { name: /^Main/ }).click();
  await page.mouse.move(x, y + 150);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await page.mouse.up();

  await expect.poll(() => debug(page)).toEqual(['stroke', 'stamp']);
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect.poll(() => debug(page)).toEqual(['stroke']);
  expect(errors).toEqual([]);
});

test('the torch springs back home when dropped', async ({ page }) => {
  await enter(page);
  const box = (await page.locator('#game canvas').boundingBox())!;
  const torchPos = () =>
    page.evaluate(() => {
      const scene = (window as unknown as { cave: { game: { scene: { getScene(k: string): { torch: { x: number; y: number } } } } } }).cave.game.scene.getScene('cave');
      return { x: Math.round(scene.torch.x), y: Math.round(scene.torch.y) };
    });
  const home = await torchPos();
  const sx = box.x + (home.x / 1600) * box.width;
  const sy = box.y + (home.y / 1000) * box.height;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx - 300, sy - 200, { steps: 10 });
  const moved = await torchPos();
  expect(moved.x).toBeLessThan(home.x - 200);
  await page.mouse.up();
  await expect.poll(torchPos, { timeout: 5000 }).toEqual(home);
});

test('stencil rotates a quarter turn per click', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: /^Main/ }).click();
  const angle = () =>
    page.evaluate(() => (window as unknown as { cave: { selection: { value: { angle: number } } } }).cave.selection.value.angle);
  const rotate = page.getByRole('button', { name: "Tourner d'un quart de tour" });
  await rotate.click();
  expect(await angle()).toBeCloseTo(Math.PI / 2);
  await rotate.click();
  expect(await angle()).toBeCloseTo(Math.PI);
  await expect(page.getByRole('button', { name: /miroir/i })).toHaveCount(0);
});

test('tracing paper can be laid on the wall, moved and removed', async ({ page }) => {
  await enter(page);
  type Sel = { tracing: string | null; tracingX: number; tracingY: number };
  const sel = () => page.evaluate(() => (window as unknown as { cave: { selection: { value: Sel } } }).cave.selection.value);
  const mammoth = page.getByRole('button', { name: 'Mammouth' });
  await mammoth.click();
  await expect(mammoth).toHaveAttribute('aria-pressed', 'true');
  const before = await sel();
  expect(before.tracing).toBe('mammoth');

  // Drag the pin at the top of the paper.
  const box = (await page.locator('#game canvas').boundingBox())!;
  const k = box.width / 1600;
  const pinY = before.tracingY - (760 * 260) / 400 / 2 - 28 + 22;
  await page.mouse.move(box.x + before.tracingX * k, box.y + pinY * k);
  await page.mouse.down();
  await page.mouse.move(box.x + (before.tracingX + 150) * k, box.y + (pinY + 80) * k, { steps: 8 });
  await page.mouse.up();
  const after = await sel();
  expect(after.tracingX).toBeGreaterThan(before.tracingX + 100);
  expect(await debug(page)).toEqual([]); // moving the paper paints nothing

  await page.getByRole('button', { name: 'Bison' }).click();
  expect((await sel()).tracing).toBe('bison');
  await page.getByRole('button', { name: 'Bison' }).click();
  expect((await sel()).tracing).toBeNull();
});

test('pause menu opens and the painting survives a reload', async ({ page }) => {
  await enter(page);
  const box = (await page.locator('#game canvas').boundingBox())!;
  await page.mouse.move(box.x + 300, box.y + 200);
  await page.mouse.down();
  await page.mouse.move(box.x + 400, box.y + 260, { steps: 8 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(page.getByRole('button', { name: 'Retour à la paroi' })).toBeVisible();
  await page.waitForTimeout(1500); // autosave
  await page.goto('/?debug');
  await page.locator('#play:not([disabled])').click();
  await expect.poll(() => debug(page)).toEqual(['stroke']);
});
