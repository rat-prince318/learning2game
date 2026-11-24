import { animateParcel, cargoFor, cargoMarkup, cargoOption, operateCargo } from './cargo.js';
import { BattleController } from './controller.js';
import { forgetSavedSession, rememberSession, startDemo } from './demo.js';
import { createStage } from './stage.js';
import { receiptBody } from './field-notes.js';
import { briefing, chainPieces, consequence, encounter, glyph, heading, heroInfo, hud, icon, result, showContact, submitName } from './panels.js';
import { displayText, readLocal, saveLocal } from '../../js/utils.js';

import { getLocale, msg, setLocale } from '../../js/locale.js';
import { eventText } from './words.js';
import { createFeedbackTimer, CONFIRMATION_MS, GUIDANCE_MS } from '../feedback.js';

const prefKey = 'l2g.battle.preferences.v1';
const campNoteKey = 'l2g.battle.open-camp-note.v1';

import { openCoursebook } from '../coursebook.js';

export function mountBattle(container, { sessionId, controller: suppliedController, standalone = false, immersive = false, savedEntry = false, packShortcut = false,
  onExit, onViewChange } = {}) {
  if (!container || (!standalone && !sessionId && !suppliedController)) throw new Error(msg('请选择一个远征存档和战场容器。','Choose an expedition and a battle container.'));
  const root = container.ownerDocument.createElement('div');
  root.className = immersive ? 'l2g-battle bf-immersive' : 'l2g-battle';
  root.innerHTML = `<header class="bf-bar"><div class="bf-brand">
      <span class="bf-crest" aria-hidden="true">${icon('compass')}</span><span data-brand></span></div>
      ${immersive ? '<details class="bf-settings"><summary><span aria-hidden="true">⚙</span></summary>' : ''}
      <div class="bf-system"><button type="button" data-act="lang"></button><button type="button" data-act="sound"></button>
        <button type="button" data-act="motion"></button></div>${immersive ? '</details>' : ''}</header>
    <div class="bf-wrap"><div class="bf-location"></div>
      <div class="bf-frame"><div class="bf-stage-slot"><div class="bf-stage" data-testid="battle-arena"></div></div>
        <div class="bf-hud"></div><div class="bf-board"></div></div>
      <div class="bf-status" role="status" aria-live="polite" aria-atomic="true" hidden></div></div>
      ${immersive ? '<dialog class="bf-field-notes" data-testid="battle-field-notes"></dialog>' : ''}`;
  container.append(root);
  const find = (selector) => root.querySelector(selector);
  const board = find('.bf-board'), status = find('.bf-status');
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const stored = readLocal(prefKey) || {};
  let muted = stored.muted !== false, reduceOverride = stored.reducedMotion;
  const prefs = () => ({muted, reducedMotion: reduceOverride ?? media.matches});
  const arena = find('.bf-stage');
  const stage = createStage(arena, prefs());
  const lifetime = new AbortController();
  let controller = suppliedController || (sessionId ? new BattleController(sessionId) : null);
  let view = null, choice = '', skill = 'strike', busy = false, destroyed = false;
  let coursebook;
  let retryAction = '', exiting = false, picked = [], lens = -1;
  let statusText = null, cargo = null;
  const expireStatusAfter = createFeedbackTimer(() => tell());
  const notes = find('.bf-field-notes');
  const dockSize = notes && new ResizeObserver(() => alignNotes());
  let receipt = null;

  function alignNotes() {
    const dock = board.querySelector('.bf-quiz, .bf-result');
    if (!dock || !notes?.open) return;
    notes.style.setProperty('--bf-note-depth', dock.getBoundingClientRect().height + 'px');
    dockSize.observe(dock);
  }

  function preferences() {
    find('[data-brand]').textContent = msg('远征战场','Battlefield');
    find('.bf-hud').setAttribute('aria-label',msg('战斗状态','Combat status'));
    find('.bf-settings summary')?.setAttribute('aria-label',msg('战场设置','Battle settings'));
    notes?.setAttribute('aria-label',msg('回合解析','Turn notes'));
    const lang = find('[data-act="lang"]');
    lang.textContent = msg('EN','中文');
    lang.setAttribute('aria-label',msg('Switch to English','切换至中文'));
    if (standalone) document.title = msg('烟柳渡首领战','Willow Ferry Battle')+' | Learning2Game';
    const sound = find('[data-act="sound"]'), motion = find('[data-act="motion"]');
    sound.setAttribute('aria-pressed', String(!muted));
    sound.setAttribute('aria-label', msg('战斗音效','Battle audio'));
    sound.innerHTML = icon(muted ? 'volume-x' : 'volume-2') + (muted ? msg('音效关','Sound off') : msg('音效开','Sound on'));
    motion.setAttribute('aria-pressed', String(prefs().reducedMotion));
    motion.setAttribute('aria-label', msg('简化动效','Reduced motion'));
    motion.innerHTML = icon('activity') + (prefs().reducedMotion ? msg('简化动效','Reduced motion') : msg('完整动效','Full motion'));
    stage.setPreferences(prefs());
    root.classList.toggle('bf-reduced', prefs().reducedMotion);
  }

  function tell(localize = null, {action = '', kind = '', duration = 0} = {}) {
    expireStatusAfter(duration);
    statusText = localize;
    retryAction = action;
    status.dataset.kind = kind || (duration ? 'confirmation' : '');
    paintStatus();
  }

  function paintStatus() {
    const message = statusText?.() || '';
    status.replaceChildren();
    status.append(displayText(message));
    if (retryAction) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.dataset.act = 'retry';
      retry.textContent = msg('重新连接','Reconnect');
      status.append(retry);
    }
    status.hidden = !message;
  }

  function lock(locked) {
    busy = locked;
    board.inert = locked;
    board.setAttribute('aria-busy', String(locked));
    root.dataset.battleBusy = String(locked);
  }

  function render() {
    root.dataset.battlePhase = view?.phase || (controller ? 'loading' : 'ready');
    root.dataset.battleRevision = view?.revision ?? '';
    find('.bf-location').innerHTML = heading(view);
    find('.bf-hud').innerHTML = hud(view);
    if (!view && controller) {
      board.innerHTML = '<section class="bf-paper bf-loading"><h2>'+msg('读取远征存档','Opening your expedition')+'</h2><p>'+msg('正在与战场会合。','Joining the battlefield…')+'</p></section>';
    } else if (!view) board.innerHTML = briefing();
    else if (view.phase === 'combat' || view.phase === 'sidequest') {
      const planOpen = Boolean(find('.bf-enemy-plan[open]'));
      board.innerHTML = encounter(view, skill, choice, picked, lens, cargo, {immersive, receipt});
      if (planOpen) find('.bf-enemy-plan')?.setAttribute('open', '');
      const camp = find('.bf-camp-notes');
      if (camp && view.battle.prompt) {
        const promptKey = view.session_id + '/' + view.battle.prompt.prompt_id;
        camp.open = readLocal(campNoteKey) === promptKey;
        camp.addEventListener('toggle', () => {
          if (camp.isConnected) saveLocal(campNoteKey, camp.open ? promptKey : '');
        });
      }
    } else board.innerHTML = result(view, standalone, standalone && savedEntry, {immersive, receipt});
    if (notes?.open && receipt) {
      notes.innerHTML = receiptBody(receipt, view);
      notes.querySelector('[data-act="receipt-close"]')?.focus({preventScroll:true});
      dockSize.disconnect();
      alignNotes();
    }
    watchCargo();
    stage.setView(view);
    syncAim();
  }

  function accept(next, attempt) {
    if (destroyed) return;
    const previous = view;
    const event = next.battle?.last_event;
    if (typeof event?.correct === 'boolean') receipt = {event, ...attempt};
    else if (event?.kind === 'hint') {
      const samePrompt = previous?.session_id === next.session_id &&
        previous.battle?.prompt?.prompt_id === next.battle?.prompt?.prompt_id && !controller?.resynced;
      if (!samePrompt || !receipt) receipt = next.battle.prior_answer ? {event:next.battle.prior_answer} : null;
    } else receipt = null;
    view = next;
    if (previous?.session_id !== next.session_id ||
        previous?.battle?.prompt?.prompt_id !== next.battle?.prompt?.prompt_id || previous?.phase !== next.phase) {
      choice = '';
      picked = [];
      cargo = next.phase === 'combat' ? cargoFor(next.battle?.prompt) : null;
      lens = -1;
      skill = 'strike';
    }
    if (skill === 'burst' && !next.player.burst_ready) skill = 'strike';
    render();
    onViewChange?.(next);
  }

  // A long question can put the actors above the viewport. Show the same stage
  // briefly at its top edge, keeping the reader's scroll position and form in place.
  async function playTurn(before, after, action) {
    const rect = arena.getBoundingClientRect();
    const peek = !immersive && !prefs().reducedMotion && rect.bottom < rect.height * .45 &&
      root.clientWidth <= 640 && typeof arena.showPopover === 'function';
    if (peek) {
      arena.setAttribute('popover', 'manual');
      arena.showPopover();
    }
    try {
      await stage.play({before, after, action, technique:heroInfo(before)[1],
        onContact:side => showContact(find('.bf-hud'), after, side)});
    } finally {
      if (peek) {
        if (arena.matches(':popover-open')) arena.hidePopover();
        arena.removeAttribute('popover');
      }
    }
  }

  async function run(type) {
    if (busy || destroyed) return;
    const before = view, fromKeyboard = find(':focus-visible') != null, previousSkill = skill;
    if (['hint', 'submit'].includes(type) && (!before?.battle?.prompt || (type === 'submit' && !choice))) return;
    lock(true);
    const pendingText = () => type === 'start' ? msg('正在准备讲义和渡口存档…','Preparing the field guide…') :
      type === 'load' ? msg('正在读取存档…','Loading the expedition…') : msg('正在确认本回合…','Resolving this turn…');
    tell(pendingText);
    try {
      let next;
      if (type === 'start') {
        next = await startDemo({ heroClass: 'arcanist',
          onProgress: (message) => {
            const locale = getLocale();
            if (!destroyed) tell(() => getLocale() === locale ? message : pendingText());
          } });
        if (destroyed) return;
        controller = new BattleController(next.session_id, {initialView:next});
        rememberSession(next.session_id);
      } else if (type === 'load' || type === 'restore') {
        next = type === 'load' ? await controller.load() : await controller.retry();
      } else {
        const prompt = before?.battle?.prompt;
        const fields = type === 'hint' ? {action:'hint', prompt_id:prompt.prompt_id} :
          {action:'answer', prompt_id:prompt.prompt_id, option_id:choice,
            skill:before.phase === 'sidequest' ? 'strike' : skill};
        next = await controller.send(fields);
      }
      if (destroyed) return;
      const turn = next.battle?.last_event;
      if (type === 'submit' && !controller.resynced && before.phase === 'combat' && turn) {
        tell(() => eventText(turn,next), {kind:'receipt', duration:GUIDANCE_MS});
        // Progress is already saved. A rendering failure must never repeat this answer.
        try { await playTurn(before, next, previousSkill); }
        catch (error) { console.warn('Battle animation skipped', error); }
      }
      if (destroyed) return;
      const prompt = before?.battle?.prompt;
      const attempt = type === 'submit' && !controller.resynced && prompt ?
        {prompt:prompt.text, selected:prompt.options.find(option => option.id === choice)?.text} : undefined;
      accept(next, attempt);
      if (controller.resynced) {
        tell(() => msg('已同步最新战况。','Battle synchronized.'), {duration:CONFIRMATION_MS});
      } else if (type === 'submit') {
        tell(() => {
          const summary = eventText(turn,next) || msg('回合已结算。','Turn resolved.');
          return summary + (next.phase === 'sidequest' ? msg(' 可在营火旁查阅修习笔记。',' Camp notes are available by the fire.') : '');
        }, {kind:'receipt', duration:GUIDANCE_MS});
      } else if (type === 'hint') {
        tell(() => msg('讲义提示已展开。','The field note is open.'), {duration:CONFIRMATION_MS});
      } else tell();
      if (fromKeyboard && type === 'submit') {
        lock(false);
        find('[data-prompt-title]')?.focus({preventScroll:true});
      }
    } catch (error) {
      if (destroyed) return;
      if (type === 'load' && standalone && savedEntry && error.status === 404) {
        forgetSavedSession(sessionId);
        controller = null;
        render();
        tell(() => msg('上次的课程存档已清理，可重新进入渡口。','The old course save has expired. You can begin a new crossing.'));
      } else {
        const locale = getLocale();
        const action = type === 'start' ? 'start' : controller?.hasPending ? 'restore' : !view ? 'load' : '';
        tell(() => locale === getLocale() && error.message ? error.message :
          msg('操作未完成，请重试。','The action could not be completed. Try again.'), {action});
        if (!view && controller) {
          board.innerHTML = `<section class="bf-paper bf-loading"><h2>${msg('等待连接存档','Waiting for your save')}</h2><p>${msg('检查课程服务和远征编号后可重新连接。','Check the server and expedition ID, then reconnect.')}</p>
            ${standalone ? '<a class="bf-linkbtn" href="/rpg/battle/">'+msg('前往独立试玩','Open the demo')+'</a>' : ''}</section>`;
        }
      }
    } finally {
      if (!destroyed) lock(false);
    }
  }

  function syncAim() {
    const options = view?.battle?.prompt?.options || [];
    const index = options.findIndex(option => option.id === choice);
    stage.setAim(skill, index >= 0 && view?.phase === 'combat', glyph(Math.max(0,index)), submitName(view,skill));
  }
  function select(act, element) {
    if (!view?.battle?.prompt) return;
    if (act === 'skill') skill = element.dataset.id;
    else if (act === 'fragment' || act === 'erase') {
      if (act === 'erase') picked.pop();
      else if (picked.length < 2) picked.push(element.dataset.fragment);
      const prompt = view.battle.prompt, pairs = chainPieces(prompt);
      const index = pairs.findIndex(pair => pair.length === picked.length && pair.every((v,i)=>v === picked[i]));
      choice = prompt.options[index]?.id || '';
      render();
      const next = find(picked.length === 2 ? '[data-act="submit"]' : '[data-act="fragment"]');
      next?.focus({preventScroll:true});
      return;
    } else choice = element.dataset.optionId;
    for (const btn of board.querySelectorAll('[data-act="skill"], [data-act="option"]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.act === 'skill' ?
        btn.dataset.id === skill : btn.dataset.optionId === choice));
    }
    const submit = board.querySelector('[data-act="submit"]');
    if (submit) submit.disabled = !choice;
    const label = board.querySelector('[data-submit-label]');
    if (label) label.textContent = submitName(view,skill);
    const exposure = board.querySelector('[data-exposure]');
    if (exposure) exposure.textContent = consequence(view,skill);
    syncAim();
  }

  function watchCargo() {
    const details = find('.bf-cargo');
    if (!details || !cargo) return;
    details.addEventListener('toggle', () => { if (details.isConnected && cargo) cargo.open = details.open; });
  }
  function useCargo(button) {
    if (!cargo || !view?.battle?.prompt) return;
    const {op,value} = button.dataset;
    if (op === 'bind') {
      const id = cargoOption(cargo);
      const option = [...board.querySelectorAll('[data-act="option"]')].find(node=>node.dataset.optionId===id);
      if (option) { select('option',option); find('[data-act="submit"]')?.focus({preventScroll:true}); }
      return;
    }
    const source=op==='load' ? button.querySelector('.bf-crate') : op==='unload' ? find('.bf-bin.bf-next .bf-crate') : null;
    const from=source?.getBoundingClientRect();
    operateCargo(cargo,op,value);
    cargo.open=true;
    find('.bf-cargo').outerHTML=cargoMarkup(cargo);
    watchCargo();
    if (source && !prefs().reducedMotion) {
      const target=op==='load' ? [...board.querySelectorAll('.bf-bin .bf-crate')].at(-1) : find('.bf-cargo-log strong');
      animateParcel(find('.bf-cargo'),source,from,target);
    }
    stage.cargoCue(op);
    const focus = [...board.querySelectorAll('[data-act="cargo"]:enabled')].find(node=>
      node.dataset.op===op && (!value || node.dataset.value===value)) ||
      find('[data-op="load"]:enabled') || find('[data-op="unload"]:enabled') || find('[data-op="bind"]') || find('[data-op="reset"]');
    focus?.focus({preventScroll:true});
  }

  async function click(event) {
    const button = event.target.closest('button[data-act]');
    if (!button || !root.contains(button) || button.disabled || destroyed) return;
    const act = button.dataset.act;
    if (act === 'lang') { setLocale(getLocale() === 'en' ? 'zh' : 'en'); return; }
    if (act === 'motion' || act === 'sound') {
      if (act === 'motion') reduceOverride = !prefs().reducedMotion;
      else muted = !muted;
      saveLocal(prefKey, {muted, reducedMotion:reduceOverride});
      preferences();
      return;
    }
    if (busy || exiting) return;
    if (act === 'coursebook' && view?.course_notes_enabled) {
      if (!coursebook?.open) coursebook = openCoursebook(view, button);
      return;
    }
    if (act === 'receipt-close') { notes?.close(); return; }
    if (act === 'receipt' && notes && receipt) {
      notes.innerHTML = receiptBody(receipt, view);
      notes.showModal();
      alignNotes();
      return;
    }
    if (act === 'retry' && retryAction) return run(retryAction);
    if (controller?.hasPending) return run('restore');
    if (act === 'cargo') return useCargo(button);
    if (act === 'lens') {
      lens = Number(button.dataset.lens);
      render();
      find('[data-lens="'+lens+'"]')?.focus({preventScroll:true});
      return;
    }
    if (['option','skill','fragment','erase'].includes(act)) return select(act, button);
    if (act === 'exit') {
      exiting = true;
      try {
        if (onExit) await onExit(view);
        else if (standalone) location.assign('/');
        else root.dispatchEvent(new CustomEvent('battle-exit', {detail:view, bubbles:true}));
      } finally { exiting = false; }
      return;
    }
    if (act === 'field-cast' && choice && view?.phase === 'combat') return run('submit');
    if (['submit', 'start', 'hint'].includes(act)) return run(act);
  }

  notes?.addEventListener('close', () => {
    dockSize.disconnect();
    if (!destroyed) find('[data-act="receipt"]')?.focus({preventScroll:true});
  }, {signal:lifetime.signal});
  root.addEventListener('click', click, {signal:lifetime.signal});
  root.addEventListener('keydown', event => {
    if (busy || notes?.open || event.target.closest('.bf-settings') || event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.altKey || event.metaKey ||
        !['combat','sidequest'].includes(view?.phase) || event.target.closest('.bf-cargo, input, textarea, select, [contenteditable="true"]')) return;
    const keys = {q:'strike',w:'guard',[packShortcut ? 'r' : 'e']:'burst'};
    let button;
    if (keys[event.key.toLowerCase()]) button = find('[data-id="'+keys[event.key.toLowerCase()]+'"]');
    else if (/^[1-9]$/.test(event.key)) button = [...board.querySelectorAll('[data-act="option"],[data-act="fragment"]')][Number(event.key)-1];
    if (button && !button.disabled) { event.preventDefault(); button.click(); button.focus({preventScroll:true}); }
  }, {signal:lifetime.signal});
  window.addEventListener('learning2game:locale', () => {
    preferences();
    render();
    if (statusText) paintStatus();
  }, {signal:lifetime.signal});
  media.addEventListener('change', preferences, {signal:lifetime.signal});
  preferences();
  render();
  const ready = controller ? run('load') : Promise.resolve();
  return {ready, getView:() => view, destroy() {
    if (destroyed) return;
    destroyed = true;
    coursebook?.close();
    expireStatusAfter();
    dockSize?.disconnect();
    lifetime.abort();
    stage.destroy();
    root.remove();
  }};
}
