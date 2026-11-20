import { getLocale, msg } from '../../../js/locale.js';
import { acts, endings, arrivalEcho } from './chapters.js';

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
function paint() {
  if (!context || !story.open) return;
  const v = context.view,
    act = acts[v.region_index] || acts[0],
    last = mode === 'ending';
  const needed = Math.min(3, v.map.length);
  const card = make('div', 'sc-card');
  const art = new Image();
  art.className = 'sc-image';
  art.alt = '';
  art.src = '/rpg/world/' + (last ? 'saga/orrery' : act.art) + '.webp';
  card.append(art);
  const text = make('section', 'sc-text'),
    choiceLine = make('div', 'sc-options');
  const station = v.map[v.region_index];
  const section = last
    ? shortCampaign(v) ? msg('短途远征结束', 'Short expedition complete') : msg('决战之后', 'After the battle')
    : msg('第 ' + (v.region_index + 1) + ' 章', 'Chapter ' + (v.region_index + 1));
  const result = last
    ? endings.find((e) => e.id === resultId)
    : act.choices.find((c) => c.id === resultId);
  const heading = last
    ? result
      ? endingTitle(result, v)
      : msg('灰冠已落', 'The crown has fallen')
    : t(act.title);
  const title = make('h2', '', heading);
  title.id = 'story-card-title';
  text.append(make('span', 'sc-eyebrow', section), title);
  let copy;
  if (last) {
    copy = result
      ? endingCopy(result, v)
      : shortCampaign(v)
        ? msg('这趟短途远征走到了终点。灰冠败退，铁冠滚到你脚边。赤翎扶着剑坐下：「这一仗打完了。咱们怎么收尾？」', 'Your short expedition ends here. Ashcrown retreats and his crown rolls to your feet. Kestrel sits down beside her sword. “We won this one. What shall we do with it?”')
        : msg('灰冠的胸炉熄了。铁冠从石阶上一路滚到你脚边。赤翎按住它，抬头问你：「砸了它？还是先带人去星门看看？」', 'Ashcrown’s furnace goes dark. His crown rolls down the steps and stops at your feet. Kestrel puts a boot on it. “Smash it? Or take a squad to the gate first?”');
    if (!result)
      for (const end of endings) {
        const locked = end.id === 'wake_towns' && witnessCount(v) < needed;
        const title =
          endingTitle(end, v) +
          (end.id === 'wake_towns'
            ? '　' + msg('联军烽台', 'Allied beacons') + ' ' + witnessCount(v) + '/' + needed
            : '');
        choiceLine.append(btn(title, () => commit(end.id), 'choice', busy || locked));
      }
  } else if (result) {
    copy = t(result.outcome);
  } else {
    const lines = [act.arrival, ...act.beats];
    copy = t(lines[beat]);
    const echo = beat === 0 && arrivalEcho(v);
    if (echo) copy = t(echo) + (getLocale() === 'en' ? ' ' : '') + copy;
    if (beat < lines.length - 1)
      choiceLine.append(
        btn(
          msg('继续', 'Continue') + '　→',
          () => {
            beat++;
            paint();
          },
          'primary',
        ),
      );
    else
      act.choices.forEach((c, i) => {
        const cost =
          i === 0
            ? msg(
                '回复最多 4 点生命，军医将支援决战。',
                'Recover up to 4 HP. Medics will support the final battle.',
              )
            : msg(
                '拿到 2 枚路币，工兵将支援决战。',
                'Take 2 coins. Sappers will support the final battle.',
              );
        const choice = btn(t(c.label), () => commit(c.id), 'choice', busy);
        choice.append(make('small', '', cost));
        choiceLine.append(choice);
      });
  }
  const body = make('p', 'sc-dialogue', copy);
  body.setAttribute('aria-live', 'polite');
  text.append(body);
  if (!last && !result)
    text.append(make('small', 'sc-speaker', (beat === 0 ? msg('抵达' + station.name, 'Arrival') : t(act.speaker)) + '　' + (beat + 1) + '/' + (act.beats.length + 1)));
  if (result && !last)
    text.append(
      make('small', 'sc-speaker', msg('已写入手记', 'Saved in your field journal')),
    );
  if (result)
    choiceLine.append(
      btn(
        last ? msg('查看战绩', 'View campaign results') : msg('回到战场', 'Return to the field'),
        close,
        'primary',
      ),
    );
  if (last && shortCampaign(v)) {
    const restart = btn(msg('用这份资料开始八章主线', 'Start eight chapters with this course'), close, 'choice', busy);
    restart.dataset.do = 'restart-eight';
    restart.dataset.action = 'restart-eight';
    choiceLine.append(restart);
  }
  if (result && !last && context.openParty && [0, 2].includes(v.region_index)) {
    const rally = btn(msg('邀请同伴', 'Invite a companion'), () => {
      const openParty = context.openParty;
      close();
      openParty();
    });
    choiceLine.append(rally);
  }
  text.append(choiceLine);
  if (error) text.append(make('p', 'sc-error', error));
  const dismiss = btn(msg('收起', 'Close') + '　×', close, 'sc-close', busy);
  card.append(text, dismiss);
  story.replaceChildren(card);
  const first = story.querySelector('.sc-options button:not(:disabled)');
  (first || dismiss).focus({ preventScroll: true });
}
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
      return choice ? [t(act.title), t(choice.label), t(choice.outcome)] : null;
    })
    .filter(Boolean);
  const end = endings.find((e) => e.id === view.story_ending);
  if (end) rows.push([msg('战后命令', 'Final order'), endingTitle(end, view), endingCopy(end, view)]);
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
  for (const [chapter, choice, consequence] of rows) {
    const details = make('details');
    details.append(make('summary', '', chapter + '　/　' + choice), make('p', '', consequence));
    section.append(details);
  }
  parent.before(section);
});
