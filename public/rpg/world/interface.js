import { msg, getLocale } from '../../js/locale.js';
import { h } from '../../js/utils.js';
import { line, atlas, regionOf } from './atlas.js';
import { gearName, heroNames } from '../battle/words.js';
import { studyMarkup } from '../../js/study.js';

const glyphs = {
  trap: '⚠',
  lantern: '✧',
  home: '⌂',
  map: '⌖',
  road: '↠',
  party: '♙',
  tower: '♜',
  book: '▤',
  sound: '♫',
  language: '文',
  back: '‹',
  next: '›',
  signal: '✧',
  talk: '❖',
  coin: '◈',
};
export const ico = (key) => `<span class="lr-icon" aria-hidden="true">${glyphs[key] || '◇'}</span>`;
export const button = (action, label, cl = '', extra = '') =>
  `<button type="button" data-do="${action}" class="${cl}" ${extra}>${label}</button>`;
const asset = (name) => '/rpg/world/region-art/' + name + '.webp';
export const roleIndex = (id) => ['arcanist', 'vanguard', 'ranger'].indexOf(id);
export const plate = (index) =>
  `<span aria-hidden="true" class="lr-portrait" style="--face:${index}"></span>`;
export function header(page, view, sound) {
  const tabs = [
    ['scene', 'road', msg('行旅', 'Journey')],
    ['atlas', 'map', msg('舆图', 'Atlas')],
    ['party', 'party', msg('同行', 'Party')],
    ['tower', 'tower', msg('回声塔', 'Echo Tower')],
    ['journal', 'book', msg('手记', 'Journal')],
  ];
  return `<div class="lr-head"><button class="lr-wordmark" data-do="home">${ico('lantern')} ${msg('灯路远征', 'The Lantern Road')}</button>
  <nav aria-label="${msg('远征导航', 'Expedition navigation')}">${view ? tabs.map(([key, ic, text]) => button(key, ico(ic) + text, page === key ? 'lr-current' : '', page === key ? 'aria-current="page"' : '')).join('') : ''}</nav>
  <div class="lr-settings">${button('sound', ico('sound') + '<span>' + (sound ? msg('音乐开', 'Sound on') : msg('音乐关', 'Sound off')) + '</span>', '', 'aria-pressed="' + sound + '"')}${button('language', getLocale() === 'en' ? '中文' : 'English', '', 'aria-label="' + msg('切换为英语', 'Switch to Chinese') + '"')}</div></div>`;
}
export function title(hasSave) {
  return `<section class="lr-title"><div class="lr-sparks" aria-hidden="true"></div><div class="lr-titlecopy"><div class="lr-kicker">${msg('八站送灯之旅', 'An eight-station adventure')}</div>
 <h1>${msg('灯路远征', 'The Lantern<br>Road')}</h1><p>${msg('守灯人的信断了。沿着河灯、桥钟与星轨，把八个驿站的消息带回家。', 'The keepers have gone silent. Follow river lamps, bridge bells and star paths to bring their letters home.')}</p>
 <div class="lr-actions">${hasSave ? button('resume', msg('继续旅程', 'Continue journey') + '　→', 'lr-gold') : ''}${button('setup', msg('启程', 'New journey') + '　→', hasSave ? 'lr-glass' : 'lr-gold')}${button('title-atlas', msg('翻开舆图', 'Open the atlas'), 'lr-glass')}</div></div>
 <a class="lr-studio" href="/">← ${msg('课程工坊', 'Learning studio')}</a></section>`;
}
export function setup(role, difficulty, count, pending) {
  const roles = [
    ['arcanist', '高爆发，蓄两格引下陨星。', 'Build two charges to call a meteor.'],
    ['vanguard', '厚护甲，擅长格挡反击。', 'Heavy armor for guards and counters.'],
    ['ranger', '蓄力快，靠连续出击打暴击。', 'Quick charge and frequent critical hits.'],
  ];
  return `<section class="lr-sheet lr-prep"><div class="lr-kicker">${msg('烟柳渡驿站', 'Willow Ferry post')}</div><h1>${msg('领取行装', 'Prepare for the road')}</h1>
 <form id="lr-depart"><fieldset><legend>${msg('选择职业', 'Choose a class')}</legend><div class="lr-roles">${roles.map(([id, zh, en], i) => `<label><input type="radio" name="role" value="${id}" ${role === id ? 'checked' : ''} ${pending ? 'disabled' : ''}><span class="lr-roleface" style="--face:${i}"></span><span><strong>${heroNames(id)[0]}</strong><small>${msg(zh, en)}</small></span></label>`).join('')}</div></fieldset>
 <fieldset><legend>${msg('随身讲义', 'Your fieldbook')}</legend><p>${msg('直接出发可玩八地、十六章的驿站通识故事。也可带入自己的课程，地区数和章节数随讲义内容生成。', 'Set out with the bundled eight-region, sixteen-chapter campaign, or bring a course of your own. Its concepts determine the number of regions and chapters.')}</p>
 <label class="lr-file">${msg('选取课程文件', 'Choose course files')} <input id="lr-files" type="file" multiple accept=".txt,.md,.pdf,.pptx,.docx,.png,.jpg,.jpeg"> </label><small id="lr-count">${count ? h(count) : msg('当前使用驿站通识手册', 'Using the courier fieldbook')}</small></fieldset>
 <label class="lr-level">${msg('题目难度', 'Question difficulty')} <select name="difficulty" ${pending ? 'disabled' : ''}>${[
   ['easy', '入门', 'Easy'],
   ['medium', '标准', 'Standard'],
   ['hard', '进阶', 'Hard'],
 ]
   .map(
     ([v, zh, en]) =>
       `<option value="${v}" ${difficulty === v ? 'selected' : ''}>${msg(zh, en)}</option>`,
   )
   .join('')}</select></label>
 <div class="lr-actions"><button type="submit" class="lr-gold">${pending ? msg('继续准备', 'Resume preparation') : msg('编入讲义并出发', 'Prepare course and depart')}　→</button>${pending ? button('discard', msg('重新选材', 'Reset preparation'), 'lr-glass') : ''}${button('home', msg('返回', 'Back'), 'lr-glass')}</div></form></section>`;
}
const roadNames = [
  ['Riverside boardwalk', 'Lantern reed path', 'Horn moorings', 'Levee teahouse', 'Sluice channel'],
  ['Salt terrace', 'Buoy beach', 'Sunken bell shaft', 'Lighthouse lee', 'Tide pump'],
  ['Cinder siding', 'Kiln slope', 'Heavy forge', 'Cooling house', 'Furnace gate'],
  ['Windsock trail', 'Orchard ropeway', 'Threshing loft', 'Drying field', 'Sail crossing'],
  ['Copyists’ gallery', 'Traveling shelves', 'Column court', 'Librarian’s room', 'Binding belt'],
  ['Wind-cut corridor', 'Scree walk', 'Fault survey', 'Snowline hearth', 'Mirror ridge'],
  ['Pipe eaves', 'Pendulum alley', 'Carillon gallery', 'Bell watchroom', 'Clockwork bridge'],
  ['Meridian walk', 'Astral terrace', 'Eclipse platform', 'Keeper’s shelter', 'Solar ring'],
];
function routeName(r, v) {
  if (getLocale() === 'zh') return h(r.name);
  const slot = { normal: v.scene_index % 2, elite: 2, boss_steady: 3, boss_daring: 4 }[r.id];
  return roadNames[v.region_index]?.[slot] || 'Crossing';
}
const routeCost = (r) =>
  r.boss
    ? r.approach === 'steady'
      ? msg(
          '休整后交锋，恢复三成生命并蓄力',
          'Rest before battle. Recover 30% maximum HP and one focus.',
        )
      : msg(
          '直面首领，胜利增获两枚路币和印记',
          'Face the keeper directly for two extra coins and a seal.',
        )
    : r.risk === 'elite'
      ? msg('强敌据守，胜利获得五枚路币', 'An elite holds this route. Earn five coins.')
      : msg('巡守出没，胜利获得三枚路币', 'A roaming foe guards this path. Earn three coins.');
function spot(key, label, icon, x, y, cls = '') {
  return button(
    'spot',
    `<b aria-hidden="true">${ico(icon)}</b><span>${label}</span>`,
    'lr-spot ' + cls,
    `data-key="${key}" style="--x:${x}%;--y:${y}%"`,
  );
}
const traps = [
  ['缆绳绊索', 'Mooring snare'],
  ['沉钟浮索', 'Bell buoy trap'],
  ['炉轨压板', 'Rail pressure plate'],
  ['逆风索网', 'Wind net'],
  ['折页活板', 'Folding trapdoor'],
  ['裂冰暗板', 'Ice shelf trap'],
  ['钟槌绊线', 'Bellwire'],
  ['星环光栅', 'Solar tripwire'],
];
export function scene(view, selection, px) {
  const reg = regionOf(view),
    done = view.field_signals?.includes(reg.id),
    i = view.region_index,
    phase = view.phase;
  const routes = view.routes || [],
    chosen = routes.find((r) => r.id === selection);
  let speaker = line(reg.keeper),
    copy = line(reg.opening),
    action = '';
  if (selection === 'keeper') {
    copy = line(reg.dialogue);
    action = button('party', msg('结识同行者', 'Meet the company') + '　→', 'lr-gold');
  }
  if (selection === 'site') {
    speaker = line(reg.site);
    copy = line(done ? reg.found : reg.clue);
    action = done
      ? ico('signal') + ' ' + msg('已记入手记', 'Recorded in journal')
      : button('inspect', line(reg.tool) + '　→', 'lr-gold');
  }
  if (chosen) {
    speaker = chosen.risk === 'elite' ? line(traps[i]) : routeName(chosen, view);
    copy =
      (chosen.risk === 'elite'
        ? msg(
            '触动机关会惊动守在近路的精英。',
            'Springing this trap draws the elite guarding the shortcut. ',
          )
        : '') + routeCost(chosen);
    action = button(
      'engage',
      (chosen.risk === 'elite'
        ? msg('触动机关迎战', 'Spring the trap')
        : msg('前往遭遇地点', 'Enter encounter')) + '　→',
      'lr-gold',
      `data-key="${chosen.id}"`,
    );
  }
  if (!selection)
    action = button('talk-local', msg('和守站人交谈', 'Speak to the keeper') + '　→', 'lr-glass');
  if (phase === 'reward' || phase === 'victory') {
    copy = line(reg.end);
    action = button(
      phase === 'reward' ? 'reward' : 'ending',
      msg(
        phase === 'reward' ? '领取行路补给' : '打开归航手记',
        phase === 'reward' ? 'Claim supplies' : 'Read the epilogue',
      ) + '　→',
      'lr-gold',
    );
  }
  return `<section class="lr-world" data-region="${reg.id}"><div class="lr-viewport" tabindex="0" aria-label="${msg('可探索的驿站，方向键移动，回车互动', 'Explorable post. Arrow keys move. Press Enter to interact.')}" style="--land:url('${asset(reg.id)}')">
 <div class="lr-sparks" aria-hidden="true"></div><div class="lr-caption"><span class="lr-kicker">${msg('驿站', 'Station')} ${String(i + 1).padStart(2, '0')} / ${String(view.map.length).padStart(2, '0')}</span><h1>${line(reg.name)}</h1></div>
 <div class="lr-vitals"><span>Lv. ${view.player.level}</span><span>♥ ${view.player.hp}/${view.player.max_hp}</span><span>${ico('coin')} ${view.coins}</span></div>
 ${phase === 'route' ? spot('keeper', line(reg.keeper), 'talk', 18, 53) + spot('site', line(reg.site), 'signal', 41, 75, 'lr-site') + routes.map((r, j) => spot(r.id, r.risk === 'elite' ? line(traps[i]) : routeName(r, view), r.risk === 'elite' ? 'trap' : 'road', j ? 85 : 65, j ? 46 : 63, 'lr-risk')).join('') : ''}
 <div class="lr-courier" style="--px:${px}%;--role:${roleIndex(view.player.hero_class)}" aria-hidden="true"><i></i></div></div>
 <div class="lr-dialog">${plate(i)}<div><div class="lr-kicker">${h(speaker)}</div><p>${h(copy)}</p></div><div class="lr-dialog-act">${action}</div></div></section>`;
}
export function atlasPage(view, idx) {
  const reg = atlas[idx],
    count = view?.map.length || 0,
    pos = view?.region_index;
  return `<section class="lr-atlas-page"><div class="lr-atlas"><img src="${asset('atlas')}" alt="${msg('八座驿站沿河谷、山路与海港分布的舆图', 'Illustrated map of eight posts along river valleys, mountains and harbors')}">
 ${atlas.map((r, i) => button('pin', `<b>${String(i + 1).padStart(2, '0')}</b><span>${line(r.name)}</span>`, 'lr-pin ' + (i === idx ? 'selected ' : '') + (i === pos ? 'current' : ''), `data-index="${i}" style="--x:${r.at[0]}%;--y:${r.at[1]}%" aria-label="${line(r.name)}" aria-pressed="${idx === i}"`)).join('')}</div>
 <div class="lr-atlas-legend"><div class="lr-kicker">${msg('驿路舆图', 'Courier atlas')}　/　${String(idx + 1).padStart(2, '0')}</div><h1>${line(reg.name)}</h1><img src="${asset(reg.id)}" alt=""><p>${line(reg.opening)}</p>
 ${view ? `<p>${idx === pos ? msg('队伍当前驻地', 'Current station') : idx < pos ? msg('已通过', 'Cleared') : idx < count ? msg('航线前方', 'Ahead on your itinerary') : msg('本次行程之外', 'Beyond this itinerary')}</p>` : ''}${button(view ? 'scene' : 'home', view ? msg('回到队伍', 'Return to the party') : msg('返回标题', 'Title screen'), 'lr-gold')}</div></section>`;
}
const relics = {
  ferryman_knot: 'Ferryman’s knot',
  willow_pin: 'Willow pin',
  brine_lens: 'Brine lens',
  shell_tally: 'Shell tally',
  rivet_wedge: 'Rivet wedge',
  kiln_glove: 'Kiln glove',
  kite_spool: 'Kite spool',
  orchard_ration: 'Orchard ration',
  margin_rule: 'Margin rule',
  red_quill: 'Red quill',
  ice_chisel: 'Ice chisel',
  felt_boot: 'Felt boots',
  striker_spring: 'Striker spring',
  silent_clapper: 'Cork clapper',
  epicycle: 'Epicycle',
  dawn_prism: 'Dawn prism',
};
const relicName = (r) => msg(h(r.name), relics[r.id] || h(r.id));
const bonusNames = {
  attack: 'ATK',
  defense: 'DEF',
  guard: 'Guard',
  break_power: 'Break',
  burst_percent: 'Burst %',
  counter: 'Enemy power',
  opening_focus: 'Starting focus',
  heal_on_win: 'Victory HP',
};
function supply(r) {
  if (r.relic)
    return [
      relicName(r.relic),
      msg(
        h(r.description),
        Object.entries(r.relic.bonuses)
          .filter(([, n]) => n)
          .map(([k, n]) => bonusNames[k] + ' ' + (n > 0 ? '+' : '') + n)
          .join(', '),
      ),
    ];
  return r.id === 'purse'
    ? [msg('护送钱箱', 'Escort the strongbox'), msg('获得 3 枚路币', 'Gain 3 coins')]
    : r.id === 'rest'
      ? [msg('营火歇脚', 'Rest at the fire'), msg('恢复生命', 'Recover HP') + ' +' + r.heal]
      : [
          r.id === 'forge_edge' ? msg('锻刃', 'Forge an edge') : msg('锻甲', 'Forge plating'),
          r.id === 'forge_edge' ? 'ATK +2' : 'DEF +2',
        ];
}
export function rewardPage(v) {
  return `<section class="lr-sheet"><div class="lr-kicker">${line(regionOf(v).name)}　/　${ico('coin')} ${v.coins}</div><h1>${msg('驿站补给', 'Wayside supplies')}</h1><p>${line(regionOf(v).end)}</p><div class="lr-grid">${v.rewards
    .map((r) => {
      const [name, desc] = supply(r);
      return `<article><h2>${name}</h2><p>${desc}</p>${r.requires_replacement ? `<label>${msg('交还遗物', 'Trade in a relic')} <select data-swap="${h(r.id)}">${v.relics.map((item) => `<option value="${h(item.relic.id)}">${relicName(item.relic)} ×${item.stacks}</option>`).join('')}</select></label>` : ''}${button('claim', (r.cost ? ico('coin') + ' ' + r.cost + '　' : '') + msg('领取', 'Claim'), 'lr-glass', `data-key="${h(r.id)}" ${r.affordable ? '' : 'disabled'}`)}</article>`;
    })
    .join('')}</div></section>`;
}
export function journal(v, pages = []) {
  const evidence = pages
    .flatMap((p) =>
      p.entries.map(
        (
          row,
        ) => `<details><summary>${studyMarkup(row.term)} <small>${line(atlas[p.region_index].name)}　 ${row.combat_correct}/${row.combat_attempts}</small></summary>
 <p>${studyMarkup(row.explanation)}</p><small>${msg('讲义出处', 'Course source')}　${studyMarkup(row.source_ref)}</small></details>`,
      ),
    )
    .join('');
  const gear = v.player.inventory
    .map((g) => {
      const worn = v.player.loadout[g.slot] === g.id;
      const stats = [
        ['ATK', g.attack_bonus],
        ['DEF', g.defense_bonus],
        ['HP', g.hp_bonus],
      ]
        .filter(([, n]) => n)
        .map(([k, n]) => k + ' +' + n)
        .join('　');
      return `<div class="lr-gear"><span>${h(gearName(g))}<small>${stats}</small></span>${worn ? msg('已装备', 'Equipped') : ['reward', 'route', 'combat', 'sidequest'].includes(v.phase) ? button('equip', msg('装备', 'Equip'), 'lr-glass', `data-key="${h(g.id)}"`) : ''}</div>`;
    })
    .join('');
  return `<section class="lr-sheet"><div class="lr-kicker">${msg('个人行装', 'Courier log')}　/　Lv. ${v.player.level}</div><h1>${msg('远征手记', 'Field journal')}</h1><p>${msg('已走过的章节', 'Chapters cleared')}　${v.cleared_chapters} / ${v.chapter_count}　　XP ${v.player.xp}　　${ico('coin')} ${v.coins}</p>
 <div class="lr-grid"><article><h2>${msg('行装', 'Equipment')}</h2>${gear}<p>ATK ${v.player.attack}　 DEF ${v.player.stats?.defense ?? 0}</p></article>
 <article><h2>${msg('旅途遗物', 'Relics')}</h2>${v.relics.map((x) => `<p>${relicName(x.relic)} ×${x.stacks}</p>`).join('') || '<p>' + msg('可在战后营地换取。', 'Trade at a wayside camp after battle.') + '</p>'}</article></div>
 <div class="lr-route-list">${v.map.map((vol, i) => `<article>${plate(i)}<div><strong>${line(atlas[i].name)}</strong><small>${vol.chapters.filter((c) => c.status === 'cleared').length} / ${vol.chapters.length} ${msg('章', 'chapters')}${v.field_signals?.includes(atlas[i].id) ? '　' + ico('signal') + ' ' + line(atlas[i].signal) : ''}</small></div></article>`).join('')}</div>
 <section class="lr-notes"><h2>${msg('沿途学到的事', 'Lessons from the road')}</h2>${evidence || '<p>' + msg('第一次交手后，可在这里翻阅用过的知识和讲义出处。', 'After your first exchange, revisit the concepts and course sources you used here.') + '</p>'}</section></section>`;
}
export function epilogue(v, report) {
  const last = regionOf(v),
    full = v.map.length === 8,
    seals = v.field_signals?.length || 0;
  const homeLetter = full
    ? seals === 8
      ? msg(
          '晚饭时，八位守站人各自点亮一盏灯。河面上能数出八道倒影。有人把你的空信袋挂在门边，等明天的新信。',
          'At supper eight keepers light their own lamps. Eight reflections lie across the river. Your empty satchel hangs by the door, ready for tomorrow’s mail.',
        )
      : msg(
          '邮船赶上了早潮。那些来不及亲手修整的站点，已由返程的守灯人接班。',
          'The mail boat catches the morning tide. Returning keepers take the remaining signal repairs on their own watches.',
        )
    : msg(
        '你把本站的平安信交给下一班邮船。船离了岸，留给你的回执上盖着这一程最后一枚邮戳。',
        'You pass the letters to the next mail boat. As it casts off, the stationmaster stamps the receipt that closes this stretch of your journey.',
      );
  return `<section class="lr-sheet lr-ending" style="--land:url('${asset(last.id)}')"><div class="lr-kicker">${msg('归航手记', 'Journey’s end')}</div><h1>${v.phase === 'retreated' ? msg('平安返营', 'Home from the road') : full ? msg('八灯归航', 'Eight lights home') : msg('这一程，灯已亮', 'A light for the journey')}</h1><p>${v.phase === 'retreated' ? msg('队伍把路上收到的消息带回了驿站。', 'The party returns to the post with its dispatches.') : line(last.end)}</p><p>${msg('收集信物', 'Signals found')} ${seals} / ${v.map.length}　　${msg('攻克章节', 'Chapters cleared')} ${v.cleared_chapters} / ${v.chapter_count}</p>
 ${v.phase === 'victory' ? '<p>' + homeLetter + '</p>' : ''}
 ${report ? `<p>${msg('战斗答对', 'Correct in battle')} ${report.combat_correct} / ${report.combat_attempts}　　${msg('完成修习', 'Camp recoveries')} ${report.sidequests_completed}</p>` : ''}
 <div class="lr-actions">${button('journal', msg('查看手记', 'Read the journal'), 'lr-glass')}${button('tower', msg('挑战回声塔', 'Climb the Echo Tower'), 'lr-glass')}${v.phase === 'victory' ? button('encore', msg('开启进阶周目', 'Start a veteran run'), 'lr-gold') : ''}${button('home', msg('回到标题', 'Title screen'), 'lr-glass')}</div></section>`;
}
