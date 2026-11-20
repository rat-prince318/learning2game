import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

const battle = JSON.parse(readFileSync(
  new URL('../../docs/rpg-fixtures/battle-ui/willow-boss.public.json', import.meta.url), 'utf8',
));
const formulas = [
  String.raw`\frac{2F}{3Mg}`,
  String.raw`\frac{F}{Mg}`,
  String.raw`\frac{F}{3Mg}`,
  '\\underbrace{' + Array(32).fill('\\frac{2x_i}{3Mg}').join('+') + '}_{S}',
];

// Native scrollbar gutters must be measurable even in a headless browser.
test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } });

for (const screen of [
  { name: 'desktop at 125% zoom', width: 1280, height: 800, scale: 1.5, zoom: 1.25 },
  { name: 'phone', width: 390, height: 844, scale: 3, zoom: 1 },
]) {
  test.describe(screen.name, () => {
    test.use({
      viewport: { width: screen.width, height: screen.height },
      deviceScaleFactor: screen.scale,
      hasTouch: screen.name === 'phone',
    });

    test('fitting fractions stay on one line and a wide answer remains readable', async ({ page }) => {
      await page.goto('/rpg/');
      await page.evaluate(async ({ view, formulas, zoom }) => {
        document.documentElement.style.zoom = zoom;
        const host = document.createElement('section');
        host.className = 'lr-host';
        document.querySelector('#journey').replaceChildren(host);
        view.battle.prompt = {
          prompt_id: 'fractions',
          text: '请选择对应的表达式。',
          options: formulas.map((formula, i) => ({ id: 'f' + i, text: '\\(' + formula + '\\)' })),
        };
        const { mountBattle } = await import('/rpg/battle/battle.js');
        await mountBattle(host, { controller: { load: async () => view }, immersive: true }).ready;
        await document.fonts.ready;
      }, { view: battle, formulas, zoom: screen.zoom });

      const fractions = page.locator('[data-option-id] .study-math');
      await expect(fractions).toHaveCount(4);
      const sizes = await fractions.evaluateAll(nodes => nodes.map(node => ({
        gutter: node.offsetHeight - node.clientHeight,
        overflow: node.scrollWidth - node.clientWidth,
        optionRight: node.closest('button').getBoundingClientRect().right,
      })));
      for (const size of sizes.slice(0, 3)) {
        expect(size.gutter).toBe(0);
        expect(size.overflow).toBe(0);
      }
      expect(sizes[3].overflow).toBeGreaterThan(100);
      expect(sizes[3].optionRight).toBeLessThanOrEqual(screen.width + 1);
      const long = fractions.last();
      await page.locator('[data-option-id="f3"]').focus();
      await page.keyboard.press('Tab');
      await expect(long).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => long.evaluate(node => node.scrollLeft)).toBeGreaterThan(0);

      if (screen.name === 'phone') {
        await long.scrollIntoViewIfNeeded();
        const before = await long.evaluate(node => node.scrollLeft);
        const bounds = await long.boundingBox();
        const x = bounds.x + bounds.width * 0.8, y = bounds.y + bounds.height / 2;
        const touch = await page.context().newCDPSession(page);
        await touch.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
        for (const offset of [24, 55, 90, 120]) {
          await touch.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x - offset, y }] });
        }
        await touch.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        await expect.poll(() => long.evaluate(node => node.scrollLeft)).toBeGreaterThan(before + 55);
        await expect(page.locator('[data-option-id="f3"]')).toHaveAttribute('aria-pressed', 'false');
      }
    });
  });
}
