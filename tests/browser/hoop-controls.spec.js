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

test('new four-hoop balls frame the row once without moving the player on a retry', async ({
  page,
}) => {
  await page.setViewportSize({ width: 960, height: 660 });
  await page.route('**/four-hoops-fixture', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><main style="position:fixed;inset:0"></main>',
    }),
  );
  await page.goto('/four-hoops-fixture');
  await page.clock.install({ time: new Date('2024-01-01T12:00:00Z') });
  await page.clock.pauseAt(new Date('2024-01-01T12:01:00Z'));
  await page.evaluate(async () => {
    const { mountCourt } = await import('/matching/court.js');
    const court = mountCourt(document.querySelector('main'));
    window.changeBall = (id, locale) =>
      court.setRound({
        ball: { id, text: 'Mass' },
        hoops: ['A', 'B', 'C', 'D'].map((id) => ({ id, text: id })),
        locale,
        enabled: true,
      });
    window.changeBall('one', 'en');
  });
  const boards = page.locator('.mc-placard');
  const positions = () =>
    boards.evaluateAll((els) =>
      els.map((el) => {
        const { left, right, width } = el.getBoundingClientRect();
        return { left, right, width };
      }),
    );
  await page.clock.runFor(100);
  const opening = await positions();
  expect(opening.every((b) => b.width > 0 && b.left >= 0 && b.right <= 960)).toBeTruthy();
  await page.keyboard.down('KeyD');
  await page.clock.runFor(650);
  await page.keyboard.up('KeyD');
  await page.mouse.move(460, 350);
  await page.mouse.down({ button: 'right' });
  await page.mouse.move(485, 350);
  await page.mouse.up({ button: 'right' });
  await page.clock.runFor(80);
  const turned = await positions();
  await page.evaluate(() => {
    window.changeBall('one', 'en');
    window.changeBall('one', 'zh');
  });
  await page.clock.runFor(80);
  expect(await positions()).toEqual(turned);
  await page.evaluate(() => window.changeBall('two', 'zh'));
  await page.clock.runFor(80);
  const next = await positions();
  expect(next.every((b) => b.width > 0 && b.left >= 0 && b.right <= 960)).toBeTruthy();
  expect(next).not.toEqual(turned);
  // From the right side of the court the nearer right glass spans a larger angle.
  expect(next[3].width).toBeGreaterThan(next[0].width + 5);
});
