import { getCourtSoundEnabled, setCourtSoundEnabled } from './court-audio.js';
import { getLocale, setLocale } from '../js/locale.js';
import { studyMarkup } from '../js/study.js';
import { escapeHtml, sourceMarkup } from '../js/utils.js';

const words = {
  soundOn: ['球场音效：开', 'Court sound on'],
  soundOff: ['球场音效：关', 'Court sound off'],
  arena: ['投篮训练场', 'Shooting court'],
  view: ['第一人称篮球场', 'First-person basketball court'],
  made: ['命中配对', 'Pairs scored'],
  menu: ['菜单', 'Menu'],
  held: ['手中篮球', 'In your hands'],
  changeBall: ['换球 ⇄', 'Ball rack ⇄'],
  boards: ['全部篮板', 'All boards'],
  throw: ['按住蓄力', 'Hold to shoot'],
  assist: ['辅助投篮', 'Assisted shot'],
  hint: ['看提示', 'Hint'],
  replay: ['投篮记录', 'Shot notes'],
  finish: ['结束训练', 'Finish'],
  retry: ['重试判分', 'Retry score'],
  sync: ['同步进度', 'Sync progress'],
  wrong: ['投错篮筐', 'Wrong hoops'],
  hints: ['使用提示', 'Hints used'],
  restart: ['重新开局', 'Start over'],
  exit: ['返回工作室', 'Back to studio'],
  close: ['关闭', 'Close'],
  balls: ['选一颗篮球', 'Choose your ball'],
  targets: ['选择要瞄准的篮筐', 'Aim at a hoop'],
  none: ['瞄准一个篮筐，或打开全部篮板。', 'Aim at a hoop or open All boards.'],
  hintLoading: ['正在读这颗球的提示…', 'Finding a hint for this ball…'],
  loading: ['球场准备中…', 'Opening the court…'],
  missed: ['球弹开了，再投一次。', 'Off the rim. Try again.'],
  right: ['配对得分', 'Basket!'],
  wrongShot: ['投中了，试试另一个篮筐。', 'Basket landed. Try a different hoop.'],
  noNotes: [
    '投进一球后，这里会显示解析和出处。',
    'Sink a shot to see the explanation and its source.',
  ],
  help: [
    'WASD 移动，方向键环视。按住空格或在场内按住鼠标，松手投篮。按 R 收回篮球。触屏用左侧摇杆移动，拖动场地瞄准，松手投篮。选好篮板后也可以用辅助投篮。',
    'Move with WASD and look with the arrow keys. Hold Space or press on the court, then release to shoot. R recalls the ball. On touchscreens, walk with the left stick and drag on the court to aim. You can also choose a backboard and use Assisted shot.',
  ],
  first: ['按住场地瞄准，松手投篮', 'Hold on the court to aim. Release to shoot.'],
  unavailable: ['球场载入失败', 'Court loading failed'],
  reload: ['重新载入球场', 'Reload court'],
  completed: ['本轮已完成', 'Round complete'],
  browser: [
    '请开启浏览器图形加速后重新进入球场。',
    'Enable browser graphics acceleration and reopen the court.',
  ],
  assistedView: [
    '简化场地：选篮板，然后辅助投篮。',
    'Simplified court: choose a board and use Assisted shot.',
  ],
};
const tr = (key) => words[key][getLocale() === 'en' ? 1 : 0];
const $ = (id) => document.getElementById(id);
const beforeShot = (phase) => !['flight', 'charging', 'submitting'].includes(phase);

export function createCourtSession({ engine, requestHint, isBusy }) {
  const host = $('court-stage'),
    picker = $('court-picker'),
    settings = $('court-settings'),
    log = $('court-log');
  let visible = false,
    arena = null,
    loading = false,
    epoch = 0,
    latest = null;
  let shot = null,
    phase = 'held',
    roundKey = '',
    ball = null,
    hoops = [],
    activeHoop = null;
  let lastBall = '',
    pickerKind = '',
    feedback = null,
    sessionId = '',
    timer;
  let lastLocale = '',
    assistView = false;

  function soundLabel() {
    const enabled = getCourtSoundEnabled();
    $('court-sound').setAttribute('aria-pressed', String(enabled));
    $('court-sound').textContent = tr(enabled ? 'soundOn' : 'soundOff');
  }
  function localize() {
    soundLabel();
    const message = $('court-signal');
    if (!message.hidden && message.dataset.copy) message.textContent = tr(message.dataset.copy);
    if (!latest?.feedback) $('attempt-feedback').textContent = tr('noNotes');
    for (const node of $('page-play').querySelectorAll('[data-court-copy]'))
      node.textContent = tr(node.dataset.courtCopy);
    for (const close of $('page-play').querySelectorAll('[data-court-close]'))
      close.setAttribute('aria-label', tr('close'));
    $('court-language').textContent = getLocale() === 'en' ? '中文' : 'English';
    $('court-help').textContent = tr('help');
    host.querySelector('canvas')?.setAttribute('aria-label', tr('view'));
    aim(activeHoop?.id);
    $('court-menu').parentElement.setAttribute('aria-label', tr('menu'));
    $('court-ball-text').closest('section').setAttribute('aria-label', tr('arena'));
  }

  function signal(key, kind = '') {
    clearTimeout(timer);
    const box = $('court-signal');
    box.hidden = !key;
    box.dataset.kind = kind;
    box.dataset.copy = key;
    box.textContent = key ? tr(key) : '';
    if (key)
      timer = setTimeout(() => {
        box.hidden = true;
      }, 3200);
  }
  function frozen() {
    return (
      isBusy() ||
      latest?.phase !== 'active' ||
      !visible ||
      document.hidden ||
      Boolean(document.querySelector('dialog[open]'))
    );
  }
  function controls() {
    const disabled = !arena || !ball || frozen();
    for (const id of ['court-balls', 'court-targets', 'hint-button', 'court-assist']) {
      $(id).disabled = disabled || !beforeShot(phase) || (id === 'court-assist' && !activeHoop);
    }
    $('court-release').disabled = disabled || phase === 'flight';
    $('court-language').disabled =
      phase === 'flight' || phase === 'charging' || latest?.phase === 'submitting';
    $('finish-button').disabled = isBusy() || ['submitting', 'retry'].includes(latest?.phase);
    $('restart-button').disabled = isBusy() || latest?.phase === 'submitting';
    $('court-release').classList.toggle('is-charging', phase === 'charging');
  }
  function pause() {
    arena?.setPaused(frozen());
    controls();
  }
  function aim(id) {
    activeHoop = hoops.find((entry) => entry.id === id) || null;
    const index = hoops.indexOf(activeHoop);
    $('court-aim-title').textContent =
      index < 0
        ? tr('targets')
        : (getLocale() === 'en' ? 'Backboard ' : '篮板 ') + String.fromCharCode(65 + index);
    $('court-target-text').innerHTML = activeHoop ? studyMarkup(activeHoop.text) : tr('none');
    controls();
  }
  function open(dialog) {
    if (!dialog.open) dialog.showModal();
    document.exitPointerLock?.();
    pause();
  }
  function list(kind) {
    pickerKind = kind;
    $('court-picker-title').textContent = tr(kind);
    const balls = kind === 'balls';
    const entries = balls
      ? latest.leftCards.filter((c) => !latest.session.matched_left_ids.includes(c.id))
      : hoops;
    $('court-choices').innerHTML = entries
      .map(
        (entry, i) =>
          '<button type="button" ' +
          (balls ? 'data-ball-id' : 'data-hoop-id') +
          '="' +
          escapeHtml(entry.id) +
          '" aria-pressed="' +
          (entry.id === (balls ? ball?.id : activeHoop?.id)) +
          '"><b>' +
          (balls ? String(i + 1).padStart(2, '0') : String.fromCharCode(65 + i)) +
          '</b><span>' +
          studyMarkup(entry.text) +
          '</span></button>',
      )
      .join('');
  }
  function pickerClick(event) {
    const button = event.target.closest('button');
    if (!button || !latest || latest.phase !== 'active') return;
    if (button.dataset.ballId) {
      picker.close();
      if (latest.selectedLeft !== button.dataset.ballId) {
        $('hint-content').hidden = true;
        engine.selectLeft(button.dataset.ballId);
      }
    } else if (button.dataset.hoopId) {
      picker.close();
      pause();
      arena?.aimAt(button.dataset.hoopId);
      aim(button.dataset.hoopId);
    }
  }
  function releaseCourt() {
    epoch++;
    loading = false;
    const old = arena;
    arena = null;
    old?.dispose();
    shot = null;
    roundKey = '';
    phase = 'held';
    host.replaceChildren();
    for (const dialog of [picker, settings, log]) if (dialog.open) dialog.close();
    signal('');
  }
  async function enter() {
    if (!visible || !latest || arena || loading) return;
    loading = true;
    const ticket = ++epoch;
    const status = $('court-loading');
    status.textContent = tr('loading');
    status.hidden = false;
    try {
      const { mountCourt } = await import('./court.js');
      if (epoch !== ticket) return;
      const mod = await mountCourt(host, {
        renderLabel: studyMarkup,
        onAim: (id) => {
          if (epoch === ticket && id !== activeHoop?.id) aim(id);
        },
        onCharge: (value) => {
          if (epoch === ticket)
            $('court-power-fill').style.transform = 'scaleX(' + Math.max(0, Math.min(1, value)) + ')';
        },
        onState: (next) => {
          if (epoch !== ticket) return;
          phase = typeof next === 'string' ? next : next.phase;
          if (phase === 'held') shot = null;
          if (phase === 'flight' && !shot && ball)
            shot = { session: sessionId, left: ball.id, hoops: hoops.map((c) => c.id) };
          controls();
        },
        onMiss: () => {
          if (epoch === ticket) {
            shot = null;
            signal('missed');
          }
        },
        onBasket: (id) => {
          if (
            epoch !== ticket ||
            !visible ||
            !shot ||
            latest?.phase !== 'active' ||
            shot.session !== sessionId ||
            shot.left !== latest.selectedLeft ||
            !shot.hoops.includes(id)
          )
            return;
          shot = null;
          engine.chooseRight(id);
        },
      });
      if (epoch !== ticket) {
        mod.dispose();
        return;
      }
      arena = mod;
      assistView = mod.webgl === false;
      status.hidden = true;
      update(engine.snapshot);
      signal(assistView ? 'assistedView' : 'first');
    } catch (error) {
      if (epoch !== ticket) return;
      status.hidden = false;
      status.textContent = tr('unavailable') + ' / ' + tr('browser') + ' ';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = tr('reload');
      retry.onclick = () => enter();
      status.append(retry);
      console.warn('Court could not be started', error);
    } finally {
      if (epoch === ticket) loading = false;
    }
  }
  function chooseBall(s) {
    if (
      s.phase !== 'active' ||
      (s.selectedLeft && !s.session.matched_left_ids.includes(s.selectedLeft))
    )
      return;
    const next = s.leftCards.find((c) => !s.session.matched_left_ids.includes(c.id));
    if (!next) return;
    queueMicrotask(() => {
      const live = engine.snapshot;
      if (
        visible &&
        live?.session.session_id === s.session.session_id &&
        live.phase === 'active' &&
        (!live.selectedLeft || live.session.matched_left_ids.includes(live.selectedLeft))
      )
        engine.selectLeft(next.id);
    });
  }
  function update(s) {
    latest = s;
    if (!s || !visible) return;
    const localeChanged = lastLocale !== getLocale();
    if (localeChanged) {
      lastLocale = getLocale();
      localize();
      if (picker.open) list(pickerKind);
    }
    if (sessionId !== s.session.session_id) {
      sessionId = s.session.session_id;
      lastBall = '';
      roundKey = '';
      shot = null;
      feedback = null;
      ball = null;
      hoops = [];
      aim(null);
      $('attempt-feedback').textContent = tr('noNotes');
      $('hint-content').hidden = true;
    }
    $('play-title').innerHTML = studyMarkup(s.game.title);
    $('play-progress').textContent = s.session.completed_pairs + ' / ' + s.game.pair_count;
    $('play-errors').textContent = s.session.error_count;
    $('play-hints').textContent = s.session.hint_count;
    $('attempt-retry').hidden = s.phase !== 'retry';
    $('selection-status').textContent = s.error?.message || '';
    if (s.feedback && (s.feedback.event_id !== feedback || localeChanged)) {
      const fresh = feedback !== s.feedback.event_id;
      feedback = s.feedback.event_id;
      if (fresh) roundKey = '';
      const f = s.feedback;
      if (fresh) signal(f.is_correct ? 'right' : 'wrongShot', f.is_correct ? 'made' : 'wrong');
      $('attempt-feedback').innerHTML =
        '<strong class="feedback-result">' +
        tr(f.is_correct ? 'right' : 'wrongShot') +
        '</strong>' +
        studyMarkup(f.explanation || '') +
        sourceMarkup(f.source_ref);
    }
    if (!arena) {
      controls();
      enter();
      return;
    }
    chooseBall(s);
    ball =
      s.leftCards.find(
        (c) => c.id === s.selectedLeft && !s.session.matched_left_ids.includes(c.id),
      ) || null;
    if (lastBall !== ball?.id) {
      lastBall = ball?.id;
      $('hint-content').hidden = true;
    }
    const boards = new Map(s.game.right_cards.map(card => [card.id, card]));
    hoops = ball ? s.game.court_options[ball.id].map(id => boards.get(id)) : [];
    if (activeHoop && !hoops.some(card => card.id === activeHoop.id)) aim(null);
    $('court-targets').textContent = hoops.length ? tr('boards') + ' (' + hoops.length + ') ↗' : tr('boards');
    const key = JSON.stringify([sessionId, ball?.id, hoops.map((c) => c.id)]);
    if (key !== roundKey && ball && hoops.length) {
      roundKey = key;
      shot = null;
      arena.setRound({ ball, hoops, locale: getLocale(), enabled: true });
    }
    $('court-ball-text').innerHTML = ball ? studyMarkup(ball.text) : tr('completed');
    pause();
  }
  function setVisible(next) {
    document.body.classList.toggle('on-court', next);
    if (visible !== next) {
      visible = next;
      if (!next) releaseCourt();
    }
    if (next) update(engine.snapshot);
  }
  $('court-balls').onclick = () => {
    list('balls');
    open(picker);
  };
  $('court-targets').onclick = () => {
    list('targets');
    open(picker);
  };
  $('court-choices').onclick = pickerClick;
  $('court-sound').onclick = () => {
    setCourtSoundEnabled(!getCourtSoundEnabled());
    soundLabel();
  };
  $('court-menu').onclick = () => open(settings);
  $('court-notes').onclick = () => open(log);
  $('court-language').onclick = () => setLocale(getLocale() === 'en' ? 'zh' : 'en');
  $('hint-button').onclick = async () => {
    if (!ball || frozen()) return;
    const content = $('hint-content');
    content.hidden = false;
    content.textContent = tr('hintLoading');
    open(log);
    await requestHint();
    if (!$('global-error').hidden) {
      content.hidden = true;
      if (log.open) log.close();
    }
  };
  $('court-assist').onclick = () => {
    if (!frozen() && activeHoop) arena?.assistedShot(activeHoop.id);
  };
  const trigger = $('court-release');
  trigger.onpointerdown = (e) => {
    if (e.button !== 0 || frozen() || !arena) return;
    e.preventDefault();
    trigger.setPointerCapture(e.pointerId);
    arena.beginCharge();
  };
  trigger.onpointerup = (e) => {
    if (trigger.hasPointerCapture(e.pointerId)) {
      trigger.releasePointerCapture(e.pointerId);
      arena?.release();
    }
  };
  trigger.onpointercancel = () => arena?.grab();
  trigger.onkeydown = (e) => {
    if ([' ', 'Enter'].includes(e.key)) {
      e.preventDefault();
      if (!e.repeat && !frozen()) arena?.beginCharge();
    }
  };
  trigger.onkeyup = (e) => {
    if ([' ', 'Enter'].includes(e.key)) {
      e.preventDefault();
      arena?.release();
    }
  };
  for (const close of $('page-play').querySelectorAll('[data-court-close]'))
    close.onclick = () => close.closest('dialog').close();
  for (const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('close', pause);
  $('restart-button').addEventListener('click', () => settings.close());
  const dialogs = new MutationObserver(pause);
  for (const dialog of document.querySelectorAll('dialog'))
    dialogs.observe(dialog, { attributes: true, attributeFilter: ['open'] });
  document.addEventListener('visibilitychange', pause);
  window.addEventListener('pagehide', releaseCourt);
  window.addEventListener('pageshow', () => {
    if (visible) update(engine.snapshot);
  });
  return { update, setVisible };
}
