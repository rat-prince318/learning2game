import { ApiClient } from '../../js/api.js';
import { msg, getLocale, setLocale } from '../../js/locale.js';
import { newId, readLocal, saveLocal } from '../../js/utils.js';
import { BattleController } from '../battle/controller.js';
import { mountBattle } from '../battle/battle.js';
import { atlas, line, regionOf, fieldQuest, atChapterExit, encounterPrerequisite } from './atlas.js';
import {
  header,
  hasPack,
  title,
  setup,
  scene,
  stationDialog,
  fieldLabels,
  isExploration,
  atlasPage,
  journal,
  rewardPage,
  epilogue,
  button,
} from './interface.js';
import { commission, savedBuild, discardBuild } from './provision.js';
import { createMusic } from './music.js';
import { mountOverland } from './overland.js';
import { mountGuide } from './wayfinder.js';
import { stationInstrument } from './station-tools.js';
import { openDistrictTool, operateDistrictTool, districtToolReady } from './district-tools.js';
import { reuploadNotice } from './exam-recovery.js';
import { openPack } from './pack.js';

const main = document.querySelector('#journey'),
  top = document.querySelector('#top'),
  notice = document.querySelector('#notice');
const api = new ApiClient(),
  music = createMusic(),
  saveKey = 'l2g.lantern.last.1';
let page = 'home',
  view = null,
  controller = null,
  mounted = null,
  world = null,
  guide = null,
  pack = null,
  epoch = 0,
  locked = false;
let pin = 0,
  pick = '',
  role = 'arcanist',
  difficulty = 'medium',
  files = [],
  report = null,
  notes = [],
  coverage = null,
  dial = 0,
  districtTool = null;
let sound = readLocal('l2g.lantern.sound') === true;
const dials = [
  [['低岸', 'Low'], ['中堤', 'Middle'], ['高堤', 'High'], 0],
  [['一环', 'Link I'], ['二环', 'Link II'], ['三环', 'Link III'], 2],
  [['进料', 'Feed'], ['冷却', 'Cool'], ['送风', 'Draft'], 1],
  [['顺风', 'Downwind'], ['横风', 'Crosswind'], ['逆风', 'Upwind'], 2],
  [['正照', 'Front'], ['透光', 'Backlight'], ['侧光', 'Side'], 1],
  [['实桩', 'Timber'], ['冰壁', 'Ice wall'], ['雪面', 'Snow'], 0],
  [['一响', 'First'], ['二响', 'Second'], ['三响', 'Third'], 2],
  [['天顶', 'Zenith'], ['地平', 'Horizon'], ['北极', 'Pole'], 1],
];
const controlNames = [
  ['选缆桩', 'Choose a post'], ['换链环', 'Move the chain'], ['扳道岔', 'Throw the switch'], ['调帆向', 'Trim the sail'],
  ['移灯', 'Move the lamp'], ['试铃绳', 'Test a bell line'], ['拨音簧', 'Select a reed'], ['转日环', 'Turn the meridian'],
];
function tell(text = '') {
  notice.textContent = text;
  notice.hidden = !text;
  const supplyStatus = main.querySelector('.lr-field-supplies [role="status"]');
  if (supplyStatus) supplyStatus.textContent = text;
}
function errorText(e) {
  if (e.message?.includes('旧版试卷题库')) return reuploadNotice();
  if (e.message === 'RESELECT_FILES')
    return msg(
      '请重新选择相同的课程文件，以接续准备。',
      'Select the original course files to resume preparation.',
    );
  if (
    e.message &&
    !['JOB_RESULT', 'JOB_FAILED'].includes(e.message) &&
    (getLocale() === 'zh' ||
      ((e.code === 'JOB_FAILED' || e.status === 422) && !/[\u3400-\u9fff]/u.test(e.message)))
  )
    return e.message;
  if (e.status === 404)
    return msg(
      '这份存档或课程已过期，可重新启程。',
      'This save or course has expired. Start a new journey.',
    );
  if (e.status === 422)
    return msg(
      '请检查讲义是否包含至少三个带出处的概念。',
      'Check that your notes contain at least three distinct concepts with sources.',
    );
  if (e.status === 409)
    return msg('存档有更新，请重新进入当前地点。', 'The save has changed. Reopen this location.');
  return msg(
    '连接中断或课程准备遇到问题。请重试。',
    'The connection or course job was interrupted. Try again.',
  );
}
function mem(next) {
  view = next;
  saveLocal(saveKey, next.session_id);
  const url = new URL(location.href);
  url.searchParams.delete('prepare');
  url.searchParams.set('session', next.session_id);
  history.replaceState(null, '', url);
}
function bookmark() {
  return new URL(location.href).searchParams.get('session') || readLocal(saveKey);
}
function drawHeader() {
  top.innerHTML = header(page, view, sound);
  document.title = msg('灯路远征', 'The Lantern Road');
}
function clearField() {
  guide?.destroy?.();
  guide = null;
  world?.destroy();
  world = null;
}
function release() {
  epoch++;
  closePackOnNavigation();
  clearField();
  mounted?.destroy?.();
  mounted = null;
}
function closePackOnNavigation() {
  const previous = pack;
  pack = null;
  previous?.destroy();
}
function showPack(trigger = document.activeElement) {
  if (pack || locked || !view || !hasPack(page) ||
      document.querySelector('dialog[open], .bf-board[aria-busy="true"], .rpg-expansion[aria-busy="true"]')) return;
  if (document.querySelector('.game-menu-open')) document.querySelector('#game-menu-toggle')?.click();
  const before = view;
  world?.pause(true);
  pack = openPack({
    view: mounted?.packView?.() || view,
    send: command,
    onClose() {
      pack = null;
      world?.pause(false);
      if (before.revision !== view.revision) {
        if (before.phase !== view.phase || before.region_index !== view.region_index) {
          pick = '';
          return run(() => goto(stationPhase()));
        }
        if (['battle', 'party', 'tower'].includes(page)) return run(() => goto(page));
        draw();
      }
      if (trigger?.isConnected && trigger.getClientRects().length && trigger !== document.body)
        trigger.focus({ preventScroll: true });
      else world?.focus();
    },
  });
}
function stationPhase() {
  if (view?.campaign_story && view.phase === 'victory') return 'ending';
  if (atChapterExit(view)) return 'scene';
  return ['combat', 'sidequest', 'reward'].includes(view?.phase)
    ? 'battle'
    : view?.phase === 'retreated'
      ? 'ending'
      : 'scene';
}
async function active(id) {
  controller = new BattleController(id);
  mem(await controller.load());
  report = null;
  pick = '';

  await goto(stationPhase());
  if (view.legacy_exam_cover) tell(reuploadNotice());
}
function statusPage(text) {
  main.innerHTML =
    '<section class="lr-sheet lr-loading"><div class="lr-compass" aria-hidden="true">✧</div><h1>' +
    text +
    '</h1><p role="status" id="lr-progress"></p></section>';
}
function openFieldSupplies(host) {
  const dialog = document.createElement('dialog');
  dialog.className = 'lr-field-supplies';
  dialog.setAttribute('aria-label', msg('驿站补给', 'Wayside supplies'));
  dialog.innerHTML = rewardPage(view);
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'lr-glass lr-supply-close';
  close.textContent = atChapterExit(view) ? msg('继续探索', 'Keep exploring') : msg('返回战场', 'Back to the field');
  close.addEventListener('click', () => dialog.close());
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const sheet = dialog.querySelector('.lr-sheet');
  sheet.insertBefore(close, sheet.querySelector('.lr-grid'));
  dialog.append(status);
  host.append(dialog);
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (world) world.focus();
    else host.querySelector('[data-act="exit"]')?.focus({ preventScroll: true });
  }, { once: true });
  dialog.showModal();
}
function signalPanel() {
  const r = regionOf(view),
    list = dials[view.region_index],
    fixed = view.field_signals?.includes(r.id);
  if (pick !== 'site' || fixed || view.phase !== 'route') return;
  const box = main.querySelector('.lr-dialog-act');
  box.innerHTML = stationInstrument(view, dial, districtTool) || `<div class="lr-dial"><button type="button" data-do="tune">${line(controlNames[view.region_index])}　${line(list[dial])}</button>${button('inspect', line(r.tool), 'lr-gold')}</div>`;
}
function draw() {
  clearField();
  drawHeader();
  music.scene(
    view?.region_index || 0,
    page === 'battle' && view?.phase === 'sidequest' ? 'camp' : page,
  );
  if (page === 'home') main.innerHTML = title(Boolean(bookmark()));
  if (page === 'setup') {
    const build = savedBuild();
    main.innerHTML = setup(
      build?.role || role,
      build?.difficulty || difficulty,
      files.map((f) => f.name).join(', ') || build?.names?.map((f) => f[0]).join(', '),
      Boolean(build),
    );
  }
  if (page === 'scene') {
    main.innerHTML = scene(view, pick);
    signalPanel();
    const spot = main.querySelector('.lr-world');
    guide = mountGuide(spot, fieldQuest(view));
    world = mountOverland(spot, view, {
      labels: fieldLabels(view),
      onStation: choose,
      onContact: (key) => run(() => engage(key)),
      onGuideFrame: guide.frame,
      onLeaveDialogue: resumeField,
      canMove: () => (view.phase === 'route' || atChapterExit(view)) && !pick,
      blocked: () => locked,
    });
    spot.dispatchEvent(
      new CustomEvent('lantern:scene-ready', { bubbles: true, detail: storyContext() }),
    );
  }
  if (page === 'atlas') main.innerHTML = atlasPage(view, pin);
  if (page === 'journal') {
    main.innerHTML = journal(view, notes, coverage);
    main.dispatchEvent(
      new CustomEvent('lantern:journal', { bubbles: true, detail: storyContext() }),
    );
  }
  if (page === 'reward') main.innerHTML = rewardPage(view);
  if (page === 'ending') {
    main.innerHTML = epilogue(view, report);
    main.dispatchEvent(
      new CustomEvent('lantern:ending', { bubbles: true, detail: storyContext() }),
    );
  }
}
async function goto(dest) {
  const ticket = ++epoch;
  closePackOnNavigation();
  clearField();
  mounted?.destroy?.();
  mounted = null;
  page = dest;
  tell();
  if (dest === 'scene' && ['combat', 'sidequest'].includes(view?.phase)) page = dest = 'battle';
  if (dest === 'scene' && view?.phase === 'retreated') page = dest = 'ending';
  if (dest === 'battle' || dest === 'tower' || dest === 'party') {
    drawHeader();
    music.scene(view.region_index, dest === 'battle' && view.phase === 'sidequest' ? 'camp' : dest);
    main.innerHTML = '<section class="lr-host" id="lr-component"></section>';
    const host = main.firstElementChild;
    const options = {
      sessionId: view.session_id,
      packShortcut: true,
      onExit: () => run(async () => {
        if (ticket !== epoch) return;
        mem(await controller.load());
        if (ticket !== epoch) return;
        if (dest === 'battle' && view.phase === 'reward' && !atChapterExit(view)) return openFieldSupplies(host);
        pick = '';

        await goto(stationPhase());
      }),
      onViewChange: (next) => {
        if (ticket !== epoch || !next?.map) return;
        mem(next);
        if (dest === 'battle')
          music.scene(view.region_index, view.phase === 'sidequest' ? 'camp' : 'battle');
      },
    };
    if (dest === 'battle') mounted = mountBattle(host, { ...options, immersive: true });
    else {
      const mod =
        dest === 'tower' ? await import('../tower/tower.js') : await import('../tower/party.js');
      if (ticket !== epoch) return;
      mounted = (dest === 'tower' ? mod.mountTower : mod.mountParty)(host, options);
    }
  } else {
    if (dest === 'journal') {
      const base = '/rpg/expeditions/' + encodeURIComponent(view.session_id);
      const [notebook, sources] = await Promise.allSettled([
        api.request(base + '/notebook'), api.request(base + '/coverage'),
      ]);
      if (ticket !== epoch) return;
      notes = notebook.status === 'fulfilled' ? notebook.value : [];
      coverage = sources.status === 'fulfilled' ? sources.value : null;
      if (notebook.status === 'rejected') tell(errorText(notebook.reason));
      else if (sources.status === 'rejected') tell(errorText(sources.reason));
    }
    if (dest === 'ending' && view && !report) {
      try {
        report = await api.request(
          '/rpg/expeditions/' + encodeURIComponent(view.session_id) + '/report',
        );
      } catch (e) {
        tell(errorText(e));
      }
      if (ticket !== epoch) return;
    }
    draw();
  }
  window.scrollTo(0, 0);
}
async function command(fields) {
  controller = new BattleController(view.session_id, { initialView: view });
  const next = await controller.send(fields);
  mem(next);
  if (controller.resynced) {
    if (pack) {
      pack.update(next);
      throw Object.assign(new Error(msg('已读入最新存档，请再选一次。', 'Your save has changed. Check your pack and try again.')), { status: 409 });
    }
    pick = '';
    await goto(stationPhase());
    throw Object.assign(new Error('存档已同步，请再次选择。'), { status: 409 });
  }
  return next;
}
async function engage(key) {
  const path = view.routes.find((r) => r.id === key);
  if (!path) return;
  if (encounterPrerequisite(view)) return choose(key);
  music.cue('danger');
  if (path.risk === 'elite') {
    const field = main.querySelector('.lr-viewport');
    field?.classList.add('lr-tripped');
    tell(msg('机关响了，近路守卫现身！', 'The trap snaps. The shortcut guardian emerges!'));
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await new Promise((resolve) => setTimeout(resolve, 380));
    }
  }
  await command({ action: 'choose_route', route_id: key });
  pick = '';
  await goto('battle');
}
function storyContext() {
  return {
    view,
    world,
    interact: choose,
    resume: resumeField,
    openParty: () => run(() => goto('party')),
    issue: async (choice) => {
      const result = await command({ action: 'story_choice', choice });
      pick = '';
      draw();
      return result;
    },
  };
}
function refreshDialogue() {
  const layer = main.querySelector('.lr-dialog-layer');
  if (layer) {
    layer.innerHTML = stationDialog(view, pick);
    signalPanel();
  }
}
function resumeField() {
  pick = '';
  refreshDialogue();
  world?.pause(false);
  world?.focus();
}
function choose(key) {
  music.cue('pick');
  if (key === 'ship' && atChapterExit(view)) {
    openFieldSupplies(main.querySelector('.lr-world'));
    return;
  }
  if (key === 'ship' && isExploration(view) && (view.region_index || view.story_marks?.[regionOf(view).id])) {
    if (view.story_marks?.[regionOf(view).id] && view.field_signals.includes(regionOf(view).id)) {
      pick = 'exit';
      refreshDialogue();
    } else {
      tell(fieldQuest(view).text);
      resumeField();
    }
    return;
  }
  if (view.campaign_story && (key === 'keeper' || key === 'ship')) {
    if (key === 'keeper' && view.eight_chapters && regionOf(view).scoutFirst && fieldQuest(view).target === 'site' &&
        !view.story_marks?.[regionOf(view).id]) {
      pick = 'await-signal';
      refreshDialogue();
      return;
    }
    main
      .querySelector('.lr-world')
      ?.dispatchEvent(new CustomEvent('lantern:story', { bubbles: true, detail: storyContext() }));
    return;
  }
  pick = key === 'ship' ? 'keeper' : key;
  districtTool = key === 'site' ? openDistrictTool(view) : null;
  dial = view.campaign_story && [1, 3, 4].includes(view.region_index) ? -1 : (dials[view.region_index][3] + 1) % 3;
  refreshDialogue();
}
async function recordSignal() {
  const hp = view.player.hp;
  await command({ action: 'inspect_landmark' });
  music.cue('seal');
  draw();
  const healed = view.player.hp - hp;
  tell(line(regionOf(view).signal) + msg('已记入手记。', ' recorded in your journal.') +
    (healed > 0 ? '　HP +' + healed : ''));
}
async function run(fn) {
  if (locked) return;
  locked = true;
  main.setAttribute('aria-busy', 'true');
  try {
    await fn();
  } catch (e) {
    if (page === 'loading') {
      page = 'setup';
      draw();
    }
    tell(errorText(e));
  } finally {
    locked = false;
    main.removeAttribute('aria-busy');
  }
}
async function act(action, b) {
  switch (action) {
    case 'home':
      return goto('home');
    case 'setup':
      return goto('setup');
    case 'resume':
      return active(bookmark());
    case 'discard':
      discardBuild();
      files = [];
      return goto('setup');
    case 'title-atlas':
      pin = 0;
      return goto('atlas');
    case 'atlas':
      pin = view?.region_index || 0;
      return goto('atlas');
    case 'pin':
      pin = Number(b.dataset.index);
      draw();
      main.querySelector('[data-index="' + pin + '"]')?.focus({ preventScroll: true });
      return;
    case 'scene':
      if (controller) mem(await controller.load());
      pick = '';
      return goto(stationPhase());
    case 'tower':
    case 'party':
    case 'reward':
    case 'journal':
    case 'ending':
      return goto(action);
    case 'talk-local':
      return choose('keeper');
    case 'equip':
      await command({ action: 'equip', item_id: b.dataset.key });
      music.cue('pick');
      draw();
      return;
    case 'walk':
      return resumeField();
    case 'depart-region':
      await command({ action: 'advance_exploration' });
      pick = '';
      return goto(stationPhase());
    case 'engage':
      return engage(b.dataset.key);
    case 'set-control': {
      if (b.dataset.tool && districtTool) {
        districtTool = operateDistrictTool(districtTool, b.dataset.tool);
        music.cue(b.dataset.tool === 'ring' ? 'bridge-bell' : 'pick');
        signalPanel();
        const panel = main.querySelector('.lr-field-instrument');
        const same = panel?.querySelector('[data-tool="' + CSS.escape(b.dataset.tool) + '"]');
        const focus = same?.disabled
          ? panel.querySelector('[data-do="inspect"]:enabled') || panel.querySelector('[data-tool]:enabled')
          : same;
        focus?.focus({ preventScroll: true });
        return;
      }
      dial = Number(b.dataset.index);
      if (view.region_index === 1 && dial === 1) return recordSignal();
      music.cue('pick');
      signalPanel();
      main.querySelector(`[data-do="set-control"][data-index="${dial}"]`)?.focus({preventScroll:true});
      return;
    }
    case 'tune':
      dial = (dial + 1) % 3;
      music.cue('pick');
      signalPanel();
      main.querySelector('[data-do="tune"]')?.focus();
      tell();
      return;
    case 'inspect':
      if (districtTool) {
        if (districtToolReady(districtTool)) return recordSignal();
        return;
      }
      if (dial !== (view.campaign_story && view.region_index === 3 ? 0 : dials[view.region_index][3]))
        return tell(
          msg(
            '机关发出一声轻响。再对照守站人留下的线索调整刻度。',
            'The mechanism clicks. Compare its setting with the keeper’s clue.',
          ),
        );
      return recordSignal();
    case 'claim': {
      const swap = main.querySelector('[data-swap="' + CSS.escape(b.dataset.key) + '"]');
      await command({
        action: 'choose_reward',
        reward_id: b.dataset.key,
        ...(swap ? { replace_relic_id: swap.value } : {}),
      });
      pick = '';

      return goto(stationPhase());
    }
    case 'encore': {
      const key = 'l2g.encore.' + view.session_id;
      const id = readLocal(key) || newId();
      saveLocal(key, id);
      const next = await api.request(
        '/rpg/expeditions/' + encodeURIComponent(view.session_id) + '/encore',
        { method: 'POST', body: { request_id: id } },
      );
      return active(next.session_id);
    }
    case 'restart-eight': {
      const key = 'l2g.eight-chapters.' + view.session_id;
      const id = readLocal(key) || newId();
      saveLocal(key, id);
      const next = await api.request('/rpg/expeditions', {
        method: 'POST',
        body: {
          game_ids: [...new Set(view.map.map((r) => r.game_id))],
          hero_class: view.player.hero_class,
          kit: view.player.kit || 'trail',
          eight_chapters: true,
          campaign_story: true,
          request_id: id,
        },
      });
      return active(next.session_id);
    }
  }
}
document.addEventListener('keydown', (event) => {
  if (event.code !== 'KeyE' || event.defaultPrevented || event.repeat || event.isComposing ||
      event.ctrlKey || event.metaKey || event.altKey || event.shiftKey ||
      event.target.closest?.('input, textarea, select, [contenteditable="true"], dialog')) return;
  if (!view || !hasPack(page) || document.querySelector('dialog[open]')) return;
  event.preventDefault();
  showPack();
});
document.addEventListener('click', (event) => {
  const b = event.target.closest('[data-do]');
  if (!b) return;
  if (b.dataset.do === 'pack') return showPack(b);
  // The tide reading can still be saving when a player closes its field note.
  if (b.dataset.do === 'walk' && pick === 'site') return resumeField();
  if (b.dataset.do === 'spot' || b.dataset.do === 'follow-quest') {
    if (!world || locked) return;
    if (pick) resumeField();
    return world.navigate(b.dataset.key);
  }
  if (b.dataset.do === 'sound') {
    sound = !sound;
    saveLocal('l2g.lantern.sound', sound);
    music.setEnabled(sound);
    drawHeader();
    return;
  }
  if (b.dataset.do === 'language') {
    setLocale(getLocale() === 'zh' ? 'en' : 'zh');
    return;
  }
  run(() => act(b.dataset.do, b));
});
main.addEventListener('change', (e) => {
  if (e.target.id === 'lr-files') {
    files = [...e.target.files];
    main.querySelector('#lr-count').textContent = files.map((f) => f.name).join(', ');
  }
  if (e.target.name === 'role') role = e.target.value;
  if (e.target.name === 'difficulty') difficulty = e.target.value;
});
main.addEventListener('submit', (event) => {
  if (event.target.id !== 'lr-depart') return;
  event.preventDefault();
  if (files.length > 8)
    return tell(
      msg('每趟远征可携带最多八份讲义。', 'Bring up to eight course files per expedition.'),
    );
  run(async () => {
    page = 'loading';
    tell();
    drawHeader();
    statusPage(msg('正在编制远征', 'Preparing the expedition'));
    const next = await commission({
      files,
      role,
      difficulty,
      locale: getLocale(),
      onStep: (step, i, n, exercises) => {
        const label = {
          source: msg('读取讲义', 'Reading sources'),
          book: msg('编排地区遭遇', 'Preparing regional encounters'),
          depart: msg('接通驿路', 'Opening the road'),
        }[step];
        const coverage = exercises
          ? msg('　共 ' + exercises + ' 道练习', '　' + exercises + ' exercises in total')
          : '';
        document.querySelector('#lr-progress').textContent =
          label + '　' + i + ' / ' + n + coverage;
      },
    });
    files = [];
    await active(next.session_id);
  });
});
window.addEventListener('learning2game:locale', () => {
  if (['battle', 'tower', 'party', 'loading'].includes(page)) drawHeader();
  else draw();
});
if (sound)
  document.addEventListener(
    'pointerdown',
    () => {
      if (sound) music.setEnabled(true);
    },
    { once: true },
  );
window.addEventListener('pagehide', release);
window.addEventListener('pageshow', (e) => {
  if (e.persisted && view) run(() => active(view.session_id));
});
draw();
const requested = new URL(location.href).searchParams.get('session');
if (requested) run(() => active(requested));
else if (new URL(location.href).searchParams.get('prepare') === '1') run(() => goto('setup'));
