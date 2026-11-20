import { getLocale, msg } from '../../../js/locale.js';
import { acts, endings, arrivalEcho, speakers, portraitPosition } from './chapters.js';

const story = document.querySelector('#story-dialog');
const t = (pair) => pair[getLocale() === 'en' ? 1 : 0];
let context,
  mode,
  beat = 0,
  resultId = '',
  busy = false,
  error = '';
const make = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
};
function btn(text, onClick, kind = '', disabled = false) {
  const el = make('button', 'sc-action ' + kind, text);
  el.type = 'button';
  el.disabled = disabled;
  el.addEventListener('click', onClick);
  return el;
}
function close() {
  if (busy) return;
  if (story.open) story.close();
}
function open(detail, kind) {
  if (!detail?.view?.campaign_story) return;
  context = detail;
  mode = kind;
  beat = 0;
  error = '';
  resultId = '';
  const v = context.view;
  resultId =
    kind === 'ending'
      ? v.story_ending || ''
      : v.story_marks?.[v.map[v.region_index].region_id] || '';
  if (!story.open) story.showModal();
  context.world?.pause(true);
  paint();
}
function shortCampaign(view) {
  return !view.eight_chapters && view.map.length < acts.length;
}
function endingTitle(end, view) {
  return t(shortCampaign(view) && end.shortTitle ? end.shortTitle : end.title);
}
function endingCopy(end, view) {
  return t(shortCampaign(view) ? end.short : end.text);
}
function witnessCount(v) {
  return v.field_signals.filter((id) => v.story_marks?.[id]).length;
}
async function commit(id) {
  if (busy) return;
  busy = true;
  error = '';
  paint();
  try {
    const next = await context.issue(id);
    if (
      mode === 'ending' ? next.story_ending !== id : !Object.values(next.story_marks).includes(id)
    )
      throw new Error();
    context = { ...context, view: next };
    resultId = id;
  } catch {
    error = msg(
      '这一步还没确认。请回到地图，再打开这里查看存档。',
      'This choice is still unconfirmed. Return to the map and reopen this scene to check your save.',
    );
  } finally {
    busy = false;
    paint();
  }
}
const finalWords = {
  shatter_crown: {
    full: ['下回坐我的船，记得看一眼舱门闩。你砸下来的铁，正好换掉我那根烂木头。', 'Next time you take my ferry, look at the cabin bolt. That iron you hammered off the crown fits better than my old stick.'],
    short: ['锤子给我吧。渡船还差两颗钉子，修好咱们就回家。', 'Hand me that hammer. Two more nails in the ferry and I can take us home.'],
  },
  keep_watch: {
    full: ['娘当年守的也是这一班岗。交班册给你，挨着她那行签吧。我送大伙儿回家。', 'Mother used to take this watch. Here’s the duty book. Sign beside her name. I’ll get everyone home.'],
    short: ['粥还热着。给我腾个地方，天亮该我换你的岗了。', 'The porridge is still hot. Shift over a bit. It’s dawn and it’s my watch.'],
  },
  wake_towns: {
    full: ['看山下，七座桥都放下来了！我带前队过星门。你举着旗，让后面的人看见路。', 'Look down the mountain. All seven bridges are down! I’ll lead through the gate. Hold the flag high so the others can follow.'],
    short: ['河弯那面旗是咱们的人。他们堵住追兵了。给后船打个信号，叫他们起锚！', 'That flag at the bend is ours. They’ve cut off the pursuit. Signal the boats behind us to weigh anchor!'],
  },
};

function moveTo(index) {
  if (busy) return;
  beat = index;
  paint();
}

function paint() {
  if (!context || !story.open) return;
  const v = context.view;
  const act = acts[v.region_index] || acts[0];
  const last = mode === 'ending';
  const result = (last ? endings : act.choices).find(item => item.id === resultId);
  const lastLine = act.conversation.length - 1;
  const reading = !last && !result;
  const choosing = !result && (last || beat === lastLine);
  const short = shortCampaign(v);
  const section = last ? (short ? msg('短途远征结束', 'Expedition complete') : msg('决战之后', 'After the battle'))
    : msg('第 ' + (v.region_index + 1) + ' 章', 'Chapter ' + (v.region_index + 1));
  const heading = last ? (result ? endingTitle(result, v) : msg('灰冠已落', 'The crown has fallen')) : t(act.title);
  const spoken = (last ? null : result?.reply) || act.conversation[beat];
  const speakerId = last ? (result?.id === 'shatter_crown' ? 'reed' : 'kestrel') : spoken.speaker;
  const speaker = speakers[speakerId];
  const card = make('section', 'sc-card');
  const portrait = make('div', 'sc-bust');
  portrait.style.backgroundPosition = portraitPosition(speaker.frame);
  portrait.setAttribute('aria-hidden', 'true');
  const text = make('div', 'sc-text');
  const strip = make('header', 'sc-strip');
  const title = make('h2', '', heading);
  title.id = 'story-card-title';
  strip.append(make('span', 'sc-chapter', section), title);
  const controls = make('div', 'sc-controls');
  if (reading && !choosing) {
    const skip = btn(msg('跳过对话', 'Skip dialogue'), () => moveTo(lastLine), 'sc-quiet');
    controls.append(skip);
  }
  controls.append(btn(msg('收起', 'Close'), close, 'sc-quiet', busy));
  strip.append(controls);
  text.append(strip);
  const name = make('strong', 'sc-speaker', t(speaker.name));
  name.id = 'story-speaker';
  const words = last ? (result
    ? t(finalWords[result.id][short ? 'short' : 'full'])
    : short
      ? msg('这一仗赢了。铁冠在这儿，大伙儿等着。你说，接下来往哪儿走？', 'We won. The crown’s here and everyone’s waiting. Where do we go from here?')
      : msg('把脚抬一下，铁冠滚到你靴子底下了。人都到齐了。你打算拿它怎么办？', 'Lift your boot. The crown rolled right under it. Everyone’s here. What shall we do with it?'))
    : t(spoken.text);
  const echo = reading && beat === 0 && arrivalEcho(v);
  if (echo) text.append(make('p', 'sc-memory', t(echo)));
  const body = make('p', 'sc-dialogue', words);
  body.id = 'story-line';
  story.setAttribute('aria-describedby', 'story-speaker story-line');
  body.tabIndex = -1;
  const voice = make('div', 'sc-voice');
  voice.setAttribute('aria-live', 'polite');
  voice.append(name, body);
  text.append(voice);
  const footer = make('footer', 'sc-footer');
  const choices = make('div', 'sc-options');
  if (reading && !choosing) {
    const next = btn(msg('下一句', 'Next line'), () => moveTo(beat + 1), 'primary sc-next');
    next.setAttribute('aria-describedby', 'story-speaker story-line');
    next.setAttribute('aria-label', msg('继续，下一句', 'Continue to next line'));
    next.append(make('kbd', '', 'F'));
    footer.append(make('span', 'sc-count', (beat + 1) + ' / ' + act.conversation.length));
    choices.append(next);
  } else if (result) {
    footer.append(make('span', 'sc-count', msg('已写入手记', 'Saved in your journal')));
    choices.append(btn(last ? msg('查看战绩', 'View campaign results') : msg('回到战场', 'Return to the field'), close, 'primary sc-next'));
    if (!last && context.openParty && [0, 2].includes(v.region_index)) {
      choices.append(btn(msg('邀请同伴', 'Invite a companion'), () => {
        const openParty = context.openParty;
        close();
        openParty();
      }));
    }
  } else if (last) {
    const needed = Math.min(3, v.map.length);
    const found = witnessCount(v);
    for (const end of endings) {
      const alliance = end.id === 'wake_towns';
      const label = endingTitle(end, v) + (alliance ? '　' + msg('联军烽台', 'Allied beacons') + ' ' + found + '/' + needed : '');
      choices.append(btn(label, () => commit(end.id), 'choice', busy || (alliance && found < needed)));
    }
  } else {
    act.choices.forEach((choice, index) => {
      const action = btn(t(choice.label), () => commit(choice.id), 'choice', busy);
      const cost = index === 0 ? msg('最多回复 4 点生命，军医支援', 'Recover up to 4 HP, enlist medics') : msg('路币 +2，工兵支援', 'Gain 2 coins, enlist sappers');
      action.append(make('small', '', cost));
      choices.append(action);
    });
  }
  if (last && short) {
    const restart = btn(msg('用这份资料开始八章主线', 'Start eight chapters with this course'), close, 'choice', busy);
    restart.dataset.do = 'restart-eight';
    restart.dataset.action = 'restart-eight';
    choices.append(restart);
  }
  if (choosing) footer.append(make('small', 'sc-choice-keys', msg('↑↓ 选择　F 确认', '↑↓ Select　F Confirm')));
  footer.append(choices);
  if (error) text.append(make('p', 'sc-error', error));
  text.append(footer);
  card.append(portrait, text);
  story.replaceChildren(card);
  story.dataset.stage = result ? 'recorded' : choosing ? 'choice' : 'reading';
  story.dataset.speaker = speakerId;
  // Arriving at a decision never grants focus to a choice. Enter held across the
  // final line must not decide the player's order.
  (choosing ? body : choices.querySelector('.sc-next') || body).focus({ preventScroll: true });
}
story.addEventListener('keydown', event => {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (event.key.toLowerCase() === 'f') {
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat || busy) return;
    const selected = document.activeElement;
    if (story.dataset.stage === 'choice') {
      if (selected?.matches('.sc-options button:enabled')) selected.click();
    } else {
      story.querySelector('.sc-next')?.click();
    }
    return;
  }
  if (event.repeat && ['Enter', ' '].includes(event.key)) {
    event.preventDefault();
    return;
  }
  if (story.dataset.stage !== 'choice' || !['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key)) return;
  const choices = [...story.querySelectorAll('.sc-options button:enabled')];
  if (!choices.length) return;
  event.preventDefault();
  const index = choices.indexOf(document.activeElement);
  const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight';
  const next = index < 0 ? (forward ? 0 : choices.length - 1) : (index + (forward ? 1 : -1) + choices.length) % choices.length;
  choices[next].focus();
});
story.addEventListener('cancel', (e) => {
  if (busy) e.preventDefault();
});
story.addEventListener('close', () => {
  const prior = context;
  context = null;
  prior?.resume?.();
});
document.addEventListener('lantern:story', (e) => open(e.detail, 'station'));
document.addEventListener('lantern:ending', (e) => {
  const { view } = e.detail;
  if (!view.campaign_story || view.phase !== 'victory') return;
  const panel = document.querySelector('.lr-ending');
  if (!panel) return;
  const action = btn(
    view.story_ending
      ? msg('重看结局', 'Revisit the ending')
      : msg('决定战后去向', 'Choose what happens next'),
    () => open(e.detail, 'ending'),
    'primary',
  );
  action.dataset.saga = 'ending';
  panel.querySelector('.lr-actions')?.prepend(action);
  if (!view.story_ending && !busy) open(e.detail, 'ending');
});
window.addEventListener('learning2game:locale', paint);
export function chronicle(view) {
  const rows = Object.values(view.story_marks || {})
    .map((id) => {
      const act = acts.find((a) => a.choices.some((c) => c.id === id));
      const choice = act?.choices.find((c) => c.id === id);
      return choice ? [t(act.title), t(choice.label), t(choice.outcome), act.art] : null;
    })
    .filter(Boolean);
  const end = endings.find((e) => e.id === view.story_ending);
  if (end) rows.push([msg('战后命令', 'Final order'), endingTitle(end, view), endingCopy(end, view), 'saga/orrery']);
  return rows;
}
document.addEventListener('lantern:journal', (event) => {
  const view = event.detail?.view;
  const parent = document.querySelector('.lr-notes');
  if (!view?.campaign_story || !parent) return;
  const rows = chronicle(view);
  if (!rows.length) return;
  const section = make('section', 'lr-notes sc-chronicle');
  section.append(make('h2', '', msg('战地纪事', 'War chronicle')));
  for (const [chapter, choice, consequence, art] of rows) {
    const details = make('details');
    details.append(make('summary', '', chapter + '　/　' + choice), make('p', '', consequence));
    const scene = new Image();
    scene.alt = '';
    scene.className = 'sc-journal-art';
    scene.loading = 'lazy';
    scene.src = '/rpg/world/' + art + '.webp';
    details.append(scene);
    section.append(details);
  }
  parent.before(section);
});
