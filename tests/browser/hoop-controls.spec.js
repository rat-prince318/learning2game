import { expect, test } from '@playwright/test';

test('a sighted manual shot from the free-throw area goes through the middle basket', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 660 });
  await page.route('**/manual-shot-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><main style="position:fixed;inset:0"></main>',
    }),
  );
  await page.goto('/manual-shot-fixture');
  // Schedule the real key release at the same power on slow and fast GPUs.
  await page.clock.install({ time: new Date('2024-01-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2024-01-01T12:01:00Z'));
  await page.evaluate(async () => {
    const { mountCourt } = await import('/matching/court.js');
    const host = document.querySelector('main');
    const court = mountCourt(host, {
      onBasket: (id) => {
        host.dataset.scored = id;
      },
      onMiss: () => {
        host.dataset.scored = 'miss';
      },
    });
    court.setRound({
      ball: { id: 'ball', text: 'Mass' },
      hoops: ['A', 'B', 'C'].map((id) => ({ id, text: id })),
      locale: 'en',
      enabled: true,
    });
  });
  await page.clock.runFor(75);
  await page.mouse.move(480, 331);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(480, 299);
  await page.mouse.up({ button: 'right' });
  await page.clock.runFor(350);
  await page.keyboard.down('Space');
  await page.clock.runFor(738);
  await page.keyboard.up('Space');
  await expect(page.locator('.mc-scene')).toHaveAttribute('data-phase', 'flight');
  await page.clock.runFor(4000);
  await expect(page.locator('main')).toHaveAttribute('data-scored', 'B');
});
