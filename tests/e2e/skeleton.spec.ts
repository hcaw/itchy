import { expect, test, type Locator, type Page } from '@playwright/test';

/** Open Itchy and wait for openDAW to boot. Returns the console errors seen, which must stay empty. */
async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.goto('/');
  await page.waitForFunction(() => window.itchy !== undefined, null, { timeout: 30_000 });
  return errors;
}

/** Tap on a touch device, click with a mouse otherwise. */
async function press(target: Locator, hasTouch: boolean) {
  if (hasTouch) await target.tap();
  else await target.click();
}

/** The loudest output level (RMS, 0 to 1) seen over the next `ms` milliseconds. */
async function loudest(page: Page, ms = 800): Promise<number> {
  return page.evaluate(async (ms) => {
    let max = 0;
    const end = performance.now() + ms;
    while (performance.now() < end) {
      max = Math.max(max, window.itchy!.level());
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    return max;
  }, ms);
}

const SILENCE = 0.001;

test('the page is cross-origin isolated and openDAW boots', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => crossOriginIsolated)).toBe(true);
  await expect(page.getByRole('grid', { name: 'Music grid' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('tapping a cell sounds at once, and one undo removes the note', async ({ page, hasTouch }) => {
  const errors = await open(page);
  const cell = page.locator('[data-step="0"][data-row="0"]');
  await press(cell, hasTouch);
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  expect(await loudest(page)).toBeGreaterThan(SILENCE);

  await press(page.getByRole('button', { name: 'Undo' }), hasTouch);
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await press(page.getByRole('button', { name: 'Redo' }), hasTouch);
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('Play loops the notes with a moving playhead, and Stop stops', async ({ page, hasTouch }) => {
  const errors = await open(page);
  for (const step of [0, 4, 8, 12]) await press(page.locator(`[data-step="${step}"][data-row="2"]`), hasTouch);
  await page.waitForTimeout(600); // let the taps' own sound die away

  const playButton = page.getByRole('button', { name: 'Play' });
  await press(playButton, hasTouch);
  await expect(page.getByRole('button', { name: 'Stop' })).toBeVisible();
  await expect(page.locator('.cell.now').first()).toBeVisible();
  expect(await page.evaluate(() => window.itchy!.project.engine.isPlaying.getValue())).toBe(true);
  expect(await loudest(page, 1500)).toBeGreaterThan(SILENCE);

  await press(page.getByRole('button', { name: 'Stop' }), hasTouch);
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(page.locator('.cell.now')).toHaveCount(0);
  expect(errors).toEqual([]);
});
