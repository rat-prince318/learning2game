import { getLocale, msg } from '../../../js/locale.js';
import { acts, endings } from './chapters.js';

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
      '进度已变化或保存中断。返回地图重新打开，可查看当前记录。',
      'The save changed or the connection was lost. Reopen the event to read the current record.',
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
  art.src = '/rpg/world/saga/' + (last ? 'orrery' : act.art) + '.webp';
  card.append(art);
  const text = make('section', 'sc-text'),
    choiceLine = make('div', 'sc-options');
  const section = last ? msg('决战之后', 'After the battle') : msg('战地纪事', 'War chronicle');
  const result = last
    ? endings.find((e) => e.id === resultId)
    : act.choices.find((c) => c[0] === resultId);
  const heading = last
    ? result
      ? t(result.title)
      : msg('灰冠已落', 'The crown has fallen')
    : t(act.title);
  const title = make('h2', '', heading);
  title.id = 'story-card-title';
  text.append(make('span', 'sc-eyebrow', section), title);
  let copy;
  if (last) {
    copy = result
      ? t(result.text)
      : msg(
          '两段铁冠砸进胸炉。龙将跪倒，星门后的敌军还在撤退。先锋队等着你下达战后的第一道命令。',
          'The broken crown falls into the furnace. The warlord drops to his knees. Beyond the star gate his army is retreating. The vanguard awaits your first order.',
        );
    if (!result)
      for (const end of endings) {
        const locked = end.id === 'wake_towns' && witnessCount(v) < needed;
        const title =
          t(end.title) +
          (end.id === 'wake_towns'
            ? '　' + msg('联军烽台', 'Allied beacons') + ' ' + witnessCount(v) + '/' + needed
            : '');
        choiceLine.append(btn(title, () => commit(end.id), 'choice', busy || locked));
      }
  } else if (result) {
    copy = t(result.slice(3));
  } else {
    const lines = [act.arrival, ...act.beats];
    copy = t(lines[beat]);
    const origin = v.story_marks?.willow_ferry;
    if (v.region_index === 1 && beat === 0 && origin) {
      copy +=
        origin === 'ferry_child'
          ? msg(
              ' 获救的弩手把船舷搭成了通往盐仓的桥。',
              ' The bow crews you freed lash the boats into a bridge.',
            )
          : msg(
              ' 你亮出缴获的帅印，骗开了第一道水寨。',
              ' Your captured seal gets the party through the first blockade.',
            );
    }
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
                '现场救护，最多回复 4 HP。决战时派出军医。',
                'Restore up to 4 HP. Send medics to the final battle.',
              )
            : msg(
                '缴获 2 枚路币。决战时派出破甲队。',
                'Capture 2 coins. Send sappers to the final battle.',
              );
        const choice = btn(t(c.slice(1, 3)), () => commit(c[0]), 'choice', busy);
        choice.append(make('small', '', cost));
        choiceLine.append(choice);
      });
  }
  const body = make('p', 'sc-dialogue', copy);
  body.setAttribute('aria-live', 'polite');
  text.append(body);
  if (!last && !result)
    text.append(make('small', 'sc-speaker', t(act.speaker) + '　' + (beat + 1) + '/3'));
  if (result && !last)
    text.append(
      make('small', 'sc-speaker', msg('抉择已记入战地手记', 'Recorded in the war chronicle')),
    );
  if (result)
    choiceLine.append(
      btn(
        last ? msg('查看战绩', 'View campaign results') : msg('回到战场', 'Return to the field'),
        close,
        'primary',
      ),
    );
  if (result && !last && context.openParty && [0, 2].includes(v.region_index)) {
    const rally = btn(msg('召集同行者', 'Rally the party'), () => {
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
      ? msg('重读战后命令', 'Read your final order')
      : msg('下达战后命令', 'Issue your final order'),
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
      const act = acts.find((a) => a.choices.some((c) => c[0] === id));
      const choice = act?.choices.find((c) => c[0] === id);
      return choice ? [t(act.title), t(choice.slice(1, 3)), t(choice.slice(3))] : null;
    })
    .filter(Boolean);
  const end = endings.find((e) => e.id === view.story_ending);
  if (end) rows.push([msg('战后命令', 'Final order'), t(end.title), t(end.text)]);
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
