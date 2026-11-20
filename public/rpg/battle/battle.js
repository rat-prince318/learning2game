import { BattleController } from './controller.js';
import { forgetSavedSession, rememberSession, startDemo } from './demo.js';
import { createStage } from './stage.js';
import { briefing, encounter, heading, hud, icon, result } from './panels.js';
import { displayText, readLocal, saveLocal } from '../../js/utils.js';

const prefKey = 'l2g.battle.preferences.v1';

export function mountBattle(container, { sessionId, standalone = false, savedEntry = false,
  onExit, onViewChange } = {}) {
  if (!container || (!standalone && !sessionId)) throw new Error('请选择一个远征存档和战场容器。');
  const root = container.ownerDocument.createElement('div');
  root.className = 'l2g-battle';
  root.innerHTML = `<header class="bf-bar"><div class="bf-brand">
      <span class="bf-crest" aria-hidden="true">${icon('compass')}</span><span>远征战场</span></div>
      <div class="bf-system"><button type="button" data-act="sound"></button>
        <button type="button" data-act="motion"></button></div></header>
    <div class="bf-wrap"><div class="bf-location"></div>
      <div class="bf-frame"><div class="bf-stage-slot"><div class="bf-stage" data-testid="battle-arena"></div></div>
        <div class="bf-hud" aria-label="战斗状态"></div></div>
      <div class="bf-board"></div>
      <div class="bf-status" role="status" aria-live="polite" aria-atomic="true"></div></div>`;
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
  let controller = sessionId ? new BattleController(sessionId) : null;
  let view = null, choice = '', skill = 'strike', busy = false, destroyed = false;
  let retryAction = '', exiting = false;

  function preferences() {
    const sound = find('[data-act="sound"]'), motion = find('[data-act="motion"]');
    sound.setAttribute('aria-pressed', String(!muted));
    sound.setAttribute('aria-label', '战斗音效');
    sound.innerHTML = icon(muted ? 'volume-x' : 'volume-2') + (muted ? '音效关' : '音效开');
    motion.setAttribute('aria-pressed', String(prefs().reducedMotion));
    motion.setAttribute('aria-label', '简化动效');
    motion.innerHTML = icon('activity') + (prefs().reducedMotion ? '简化动效' : '完整动效');
    stage.setPreferences(prefs());
    root.classList.toggle('bf-reduced', prefs().reducedMotion);
  }

  function tell(message = '', action = '') {
    retryAction = action;
    status.replaceChildren();
    status.append(displayText(message));
    if (action) {
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.dataset.act = 'retry';
      retry.textContent = '重新连接';
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
      board.innerHTML = '<section class="bf-paper bf-loading"><h2>读取远征存档</h2><p>正在与战场会合。</p></section>';
    } else if (!view) board.innerHTML = briefing();
    else if (view.phase === 'combat' || view.phase === 'sidequest') board.innerHTML = encounter(view, skill, choice);
    else board.innerHTML = result(view, standalone, standalone && savedEntry);
    stage.setView(view);
  }

  function accept(next) {
    if (destroyed) return;
    const previous = view;
    view = next;
    if (previous?.session_id !== next.session_id ||
        previous?.battle?.prompt?.prompt_id !== next.battle?.prompt?.prompt_id || previous?.phase !== next.phase) {
      choice = '';
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
    const peek = !prefs().reducedMotion && rect.bottom < rect.height * .45 &&
      root.clientWidth <= 640 && typeof arena.showPopover === 'function';
    if (peek) {
      arena.setAttribute('popover', 'manual');
      arena.showPopover();
    }
    try {
      await stage.play({before, after, action});
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
    lock(true);
    tell(type === 'start' ? '正在准备讲义和渡口存档…' :
      type === 'load' ? '正在读取存档…' : '正在确认本回合…');
    try {
      let next;
      if (type === 'start') {
        next = await startDemo({ heroClass: 'arcanist',
          onProgress: (message) => { if (!destroyed) tell(message); } });
        if (destroyed) return;
        controller = new BattleController(next.session_id, {initialView:next});
        rememberSession(next.session_id);
      } else if (type === 'load' || type === 'restore') {
        next = type === 'load' ? await controller.load() : await controller.retry();
      } else {
        const prompt = before?.battle?.prompt;
        if (!prompt || (type === 'submit' && !choice)) return;
        const fields = type === 'hint' ? {action:'hint', prompt_id:prompt.prompt_id} :
          {action:'answer', prompt_id:prompt.prompt_id, option_id:choice,
            skill:before.phase === 'sidequest' ? 'strike' : skill};
        next = await controller.send(fields);
      }
      if (destroyed) return;
      const receipt = next.battle?.last_event;
      if (type === 'submit' && !controller.resynced && before.phase === 'combat' && receipt) {
        tell(receipt.message);
        // Progress is already saved. A rendering failure must never repeat this answer.
        try { await playTurn(before, next, previousSkill); }
        catch (error) { console.warn('Battle animation skipped', error); }
      }
      if (destroyed) return;
      accept(next);
      const progress = next.phase === 'sidequest' ? ' 营地讲义已展开。' : '';
      tell(controller.resynced ? '已同步最新战况。' :
        type === 'submit' ? displayText(receipt?.message || '回合已结算。') + progress :
        type === 'hint' ? '讲义提示已展开。' : '');
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
        tell('上次的课程存档已清理，可重新进入渡口。');
      } else {
        const msg = displayText(error.message, '连接遇到问题，请再试一次。');
        tell(msg, type === 'start' ? 'start' : controller?.hasPending ? 'restore' : !view ? 'load' : '');
        if (!view && controller) {
          board.innerHTML = `<section class="bf-paper bf-loading"><h2>等待连接存档</h2><p>检查课程服务和远征编号后可重新连接。</p>
            ${standalone ? '<a class="bf-linkbtn" href="/rpg/battle/">前往独立试玩</a>' : ''}</section>`;
        }
      }
    } finally {
      if (!destroyed) lock(false);
    }
  }

  function select(act, element) {
    if (!view?.battle?.prompt) return;
    if (act === 'skill') skill = element.dataset.id;
    else choice = element.dataset.optionId;
    for (const btn of board.querySelectorAll('[data-act="skill"], [data-act="option"]')) {
      btn.setAttribute('aria-pressed', String(btn.dataset.act === 'skill' ?
        btn.dataset.id === skill : btn.dataset.optionId === choice));
    }
    const submit = board.querySelector('[data-act="submit"]');
    if (submit) submit.disabled = !choice;
  }

  async function click(event) {
    const button = event.target.closest('button[data-act]');
    if (!button || !root.contains(button) || button.disabled || destroyed) return;
    const act = button.dataset.act;
    if (act === 'motion' || act === 'sound') {
      if (act === 'motion') reduceOverride = !prefs().reducedMotion;
      else muted = !muted;
      saveLocal(prefKey, {muted, reducedMotion:reduceOverride});
      preferences();
      return;
    }
    if (busy || exiting) return;
    if (act === 'retry' && retryAction) return run(retryAction);
    if (controller?.hasPending) return run('restore');
    if (act === 'option' || act === 'skill') return select(act, button);
    if (act === 'exit') {
      exiting = true;
      try {
        if (onExit) await onExit(view);
        else if (standalone) location.assign('/');
        else root.dispatchEvent(new CustomEvent('battle-exit', {detail:view, bubbles:true}));
      } finally { exiting = false; }
      return;
    }
    if (['submit', 'start', 'hint'].includes(act)) return run(act);
  }

  root.addEventListener('click', click, {signal:lifetime.signal});
  media.addEventListener('change', preferences, {signal:lifetime.signal});
  preferences();
  render();
  const ready = controller ? run('load') : Promise.resolve();
  return {ready, getView:() => view, destroy() {
    if (destroyed) return;
    destroyed = true;
    lifetime.abort();
    stage.destroy();
    root.remove();
  }};
}
