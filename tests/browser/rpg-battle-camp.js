import { expect } from '@playwright/test';

// Continue the very same two-chapter save that the battle has just handed
// back. This small host stands in for the team's camp and map screens.
export async function verifyCampContinuation(page, rewardView) {
  await page.evaluate(async (first) => {
    const { mountBattle } = await import('/rpg/battle/battle.js');
    const { ApiClient } = await import('/js/api.js');
    const { newId } = await import('/js/utils.js');
    const api = new ApiClient();
    const host = document.querySelector('#host');
    const path = '/rpg/expeditions/' + encodeURIComponent(first.session_id);

    function showChoices(view) {
      host.replaceChildren();
      host.dataset.handoffPhase = view.phase;
      host.dataset.handoffRevision = String(view.revision);
      const camp = view.phase === 'reward';
      for (const entry of camp ? view.rewards : view.routes) {
        const button = document.createElement('button');
        button.dataset.hostChoice = entry.id;
        button.textContent = entry.name;
        button.disabled = camp && (!entry.affordable || entry.requires_replacement);
        button.onclick = async () => {
          const choice = camp
            ? { action: 'choose_reward', reward_id: entry.id }
            : { action: 'choose_route', route_id: entry.id };
          await api.request(path + '/actions', {
            method: 'POST', body: { ...choice, expected_revision: view.revision, event_id: newId() },
          });
          host.replaceChildren();
          const component = mountBattle(host, { sessionId: view.session_id, onExit(latest) {
            component.destroy();
            showChoices(latest);
          } });
          await component.ready;
        };
        host.append(button);
      }
    }
    showChoices(first);
  }, rewardView);

  async function choose(id, action) {
    const next = page.waitForResponse((r) =>
      r.request().method() === 'POST' && r.request().postDataJSON()?.action === action &&
      new URL(r.url()).pathname === '/rpg/expeditions/' + rewardView.session_id + '/actions');
    await page.locator('[data-host-choice="' + id + '"]').click();
    const response = await next;
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result.session_id).toBe(rewardView.session_id);
    await expect(page.locator('[data-battle-phase]')).toHaveAttribute('data-battle-revision', String(result.revision));
    return result;
  }

  const supplies = rewardView.rewards.find((item) => item.kind === 'purse');
  expect(supplies?.affordable).toBe(true);
  const routeView = await choose(supplies.id, 'choose_reward');
  expect(routeView.phase).toBe('route');
  expect(routeView.scene_index).toBe(rewardView.scene_index + 1);
  expect(routeView.coins).toBe(rewardView.coins + supplies.coins - supplies.cost);
  expect(routeView.journal.at(-1).reward_id).toBe(supplies.id);

  // A map can resume at a route checkpoint: the battle yields the current
  // revision without silently selecting a path or advancing another turn.
  await expect(page.getByTestId('battle-result')).toContainText('队伍已到达路口');
  await expect(page.getByTestId('battle-submit')).toHaveCount(0);
  await page.getByTestId('battle-exit').click();
  await expect(page.locator('#host')).toHaveAttribute('data-handoff-phase', 'route');
  await expect(page.locator('#host')).toHaveAttribute('data-handoff-revision', String(routeView.revision));
  const nextPath = routeView.routes.find((route) => route.boss && route.approach === 'steady');
  expect(nextPath).toBeDefined();
  const secondFight = await choose(nextPath.id, 'choose_route');
  expect(secondFight.phase).toBe('combat');
  expect(secondFight.revision).toBe(routeView.revision + 1);
  expect(secondFight.battle.stage.number).toBe(2);
  expect(secondFight.battle.tactics.encounter_id).toBe(nextPath.encounter_id);
  expect(secondFight.player.xp).toBe(rewardView.player.xp);
  await expect(page.getByTestId('battle-submit')).toBeVisible();
  await expect(page.getByTestId('battle-intent')).toContainText(secondFight.battle.tactics.intent.name);
}
