const exam = [
  'Mechanics Quiz',
  '1. A cart has mass 7 kg and travels at 6 m/s. What is its kinetic energy?',
  '2. An object of mass 8 kg accelerates at 3 m/s². Find the net force.',
  '3. A particle of mass 4 kg moves at 8 m/s. Determine its momentum.',
].join('\n');

export async function prepareExpedition(page) {
  await page.goto('/rpg/');
  return page.evaluate(async (source) => {
    const { ApiClient } = await import('/js/api.js');
    const api = new ApiClient();
    const post = (path, body) => api.request(path, { method: 'POST', body });
    const finish = async (path, body) => (await api.waitForJob((await post(path, body)).job_id)).result;
    const upload = await api.upload(new File([source], 'Mech-training.txt', { type: 'text/plain' }));
    await api.waitForJob(upload.job_id);
    const { volumes } = await post('/rpg/expedition-outline', {
      sources: [{ material_id: upload.material_id }],
      scenes_per_volume: 1,
      question_language: 'zh',
    });
    const plan = await finish('/rpg/plans', volumes[0].plan_request);
    const game = await finish('/rpg/games', { plan_id: plan.plan_id, confirmed: true });
    return post('/rpg/expeditions', {
      game_ids: [game.game_id],
      hero_class: 'vanguard',
      kit: 'ward',
      campaign_story: true,
    });
  }, exam);
}
