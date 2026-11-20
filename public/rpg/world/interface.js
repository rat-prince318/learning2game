import { msg, getLocale } from '../../js/locale.js';
import { h } from '../../js/utils.js';
import { line, atlas, regionOf, fieldQuest, checkpointAftermath, atChapterExit } from './atlas.js';
import { landmarksFor } from './overland-districts.js';
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
    ['scene', 'road', msg('旅程', 'Journey')],
    ['atlas', 'map', msg('地图', 'Atlas')],
    ['party', 'party', msg('队伍', 'Party')],
    ['tower', 'tower', msg('回声塔', 'Echo Tower')],
    ['journal', 'book', msg('手记', 'Journal')],
  ];
  return `<div class="lr-head"><button class="lr-wordmark" data-do="home">${ico('lantern')} ${msg('灯路远征', 'The Lantern Road')}</button>
  <nav aria-label="${msg('远征导航', 'Expedition navigation')}">${view ? tabs.map(([key, ic, text]) => button(key, ico(ic) + text, page === key ? 'lr-current' : '', page === key ? 'aria-current="page"' : '')).join('') : ''}</nav>
  <div class="lr-settings">${button('sound', ico('sound') + '<span>' + (sound ? msg('音乐开', 'Sound on') : msg('音乐关', 'Sound off')) + '</span>', '', 'aria-pressed="' + sound + '"')}${button('language', getLocale() === 'en' ? '中文' : 'English', '', 'aria-label="' + msg('切换为英语', 'Switch to Chinese') + '"')}</div></div>`;
}
export function title(hasSave) {
  return `<section class="lr-title"><div class="lr-sparks" aria-hidden="true"></div><div class="lr-titlecopy"><div class="lr-kicker">${msg('灰冠战役', 'The Ashcrown Campaign')}</div>
 <h1>${msg('灯路远征', 'The Lantern<br>Road')}</h1><p>${msg('一艘灵船逆流靠岸。船舱里，失踪的斥候敲响了只有你听得懂的暗号。', 'A ghost ship draws alongside the pier. From below deck, a missing scout taps a code only you would know.')}</p>
 <div class="lr-actions">${hasSave ? button('resume', msg('继续旅程', 'Continue journey') + '　→', 'lr-gold') : ''}${button('setup', msg('启程', 'New journey') + '　→', hasSave ? 'lr-glass' : 'lr-gold')}${button('title-atlas', msg('翻开地图', 'Open the atlas'), 'lr-glass')}</div></div>
 <a class="lr-studio" href="/">← ${msg('课程工坊', 'Learning studio')}</a></section>`;
}
export function setup(role, difficulty, count, pending) {
  const roles = [
    ['arcanist', '高爆发，蓄两格引下陨星。', 'Build two charges to call a meteor.'],
    ['vanguard', '厚护甲，擅长格挡反击。', 'Heavy armor for guards and counters.'],
    ['ranger', '蓄力快，靠连续出击打暴击。', 'Quick charge and frequent critical hits.'],
  ];
  return `<section class="lr-sheet lr-prep"><div class="lr-kicker">${msg('烟柳渡驿站', 'Willow Ferry post')}</div><h1>${msg('准备出发', 'Prepare for the road')}</h1>
 <form id="lr-depart"><fieldset><legend>${msg('选择职业', 'Choose a class')}</legend><div class="lr-roles">${roles.map(([id, zh, en], i) => `<label><input type="radio" name="role" value="${id}" ${role === id ? 'checked' : ''} ${pending ? 'disabled' : ''}><span class="lr-roleface" style="--face:${i}"></span><span><strong>${heroNames(id)[0]}</strong><small>${msg(zh, en)}</small></span></label>`).join('')}</div></fieldset>
 <fieldset><legend>${msg('随身讲义', 'Your fieldbook')}</legend><p>${msg('主线共八章，从烟柳渡出发。上传讲义后，沿途的敌人会用讲义里的知识点出题。短讲义会留出几章给你打探消息、修复驿站。空手出发则使用驿站手册。', 'The eight chapters start at Willow Ferry. Bring your notes to face enemies with questions from your course. Short courses leave some chapters for scouting and repairs. Set out empty-handed to play with the courier fieldbook.')}</p>
 <label class="lr-file">${msg('选取课程文件', 'Choose course files')} <input id="lr-files" type="file" multiple accept=".txt,.md,.pdf,.pptx,.docx,.png,.jpg,.jpeg"> </label><small id="lr-count">${count ? h(count) : msg('当前使用驿站通识手册', 'Using the courier fieldbook')}</small></fieldset>
 <div class="lr-level">${msg('出题语言', 'Question language')} ${button('language', msg('简体中文　⇄', 'English　⇄'), 'lr-glass', 'aria-label="' + msg('切换到英文出题', 'Switch to Chinese questions') + '"')}</div>
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
 <div class="lr-actions"><button type="submit" class="lr-gold">${pending ? msg('继续准备', 'Resume preparation') : msg('带上讲义出发', 'Prepare course and depart')}　→</button>${pending ? button('discard', msg('重选文件', 'Reset preparation'), 'lr-glass') : ''}${button('home', msg('返回', 'Back'), 'lr-glass')}</div></form></section>`;
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
export function stationDialog(view, selection) {
  if (!selection && atChapterExit(view)) return '';
  const reg = regionOf(view),
    done = view.field_signals?.includes(reg.id),
    i = view.region_index,
    phase = view.phase;
  const routes = view.routes || [],
    chosen = routes.find((r) => r.id === selection);
  let speaker = line(reg.keeper),
    copy = line(reg.opening),
    action = '';
  if (selection === 'await-signal') copy = line(reg.needSignal);
  const stop = landmarksFor(i).find((landmark) => landmark.key === selection);
  if (stop) {
    speaker = line(stop.name);
    copy = line(stop.description);
  }
  if (selection === 'exit') {
    const next = atlas[i + 1];
    speaker = msg('驿路出口', 'Road out');
    copy = next
      ? msg('这条路通往' + line(next.name) + '。收拾好就出发。', 'This road leads to ' + line(next.name) + '. Leave when you’re ready.')
      : msg('队伍在路口等你。', 'Your party is waiting at the crossing.');
    action = button('depart-region', next ? msg('前往', 'Travel to ') + line(next.name) : msg('继续前进', 'Set out'), 'lr-gold');
  }
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
        : (chosen.boss ? msg('挑战首领', 'Challenge the boss') : msg('迎战守卫', 'Fight the guard'))) + '　→',
      'lr-gold',
      `data-key="${chosen.id}"`,
    );
  }
  if (!selection)
    action = button('talk-local', msg('和守站人交谈', 'Speak to the keeper') + '　→', 'lr-glass');
  if ((phase === 'reward' && !atChapterExit(view)) || phase === 'victory') {
    copy = checkpointAftermath(view);
    action = button(
      phase === 'reward' ? 'reward' : 'ending',
      msg(
        phase === 'reward' ? '领取补给' : '查看战绩',
        phase === 'reward' ? 'Claim supplies' : 'Read the epilogue',
      ) + '　→',
      'lr-gold',
    );
  }
  if (!selection && phase === 'route') return '';
  return `<div class="lr-dialog" role="region" aria-label="${msg('现场交互', 'Field interaction')}">${plate(i)}<div><div class="lr-kicker">${h(speaker)}</div><p>${h(copy)}</p></div><div class="lr-dialog-act">${action}</div>${phase === 'route' || atChapterExit(view) ? button('walk', chosen?.risk === 'elite' ? msg('绕开陷阱', 'Leave the trap') : msg('继续赶路', 'Back to the trail'), 'lr-glass lr-dismiss') : ''}</div>`;
}
export function fieldLabels(view) {
  const reg = regionOf(view);
  const labels = { keeper: line(reg.keeper), site: line(reg.site) };
  if (!view.region_index) labels.ship = msg('灵船船首', 'Ghost ship prow');
  if (isExploration(view) && (view.region_index || view.story_marks?.[reg.id]))
    labels.ship = msg('驿路出口', 'Road out');
  if (atChapterExit(view)) {
    labels.ship = msg('出口补给车', 'Convoy at the exit');
    if (!view.field_signals?.includes(reg.id)) delete labels.site;
  }
  for (const stop of landmarksFor(view.region_index)) labels[stop.key] = line(stop.name);
  for (const r of view.routes)
    labels[r.id] = r.risk === 'elite' ? line(traps[view.region_index]) : routeName(r, view);
  return labels;
}
export function isExploration(v) {
  return v.eight_chapters && v.map[v.region_index]?.chapters[v.scene_index]?.kind === 'exploration';
}
export function scene(view, selection) {
  const region = regionOf(view),
    labels = fieldLabels(view);
  const quest = fieldQuest(view);
  return `<section class="lr-world" data-region="${region.id}"><div class="lr-viewport" tabindex="0"
 aria-label="${msg('自由探索。WASD 或方向键移动，E 调查。', 'Free exploration. Move with WASD or arrows. Press E to inspect.')}">
 <canvas class="lr-field-canvas" aria-hidden="true"></canvas>
 <div class="lr-field-hud"><div class="lr-field-address"><div class="lr-chapter">${msg('第 ' + (view.region_index + 1) + ' / ' + view.map.length + ' 章', 'Chapter ' + (view.region_index + 1) + ' / ' + view.map.length)}　<h1>${line(region.name)}</h1></div>${quest?.target ? '<p class="lr-field-objective"><span class="lr-field-task-label">' + msg('主线　', 'Quest　') + '</span>' + button('follow-quest', h(quest.text) + '　↗', 'lr-track-quest', 'data-key="' + h(quest.target) + '" title="' + msg('沿路前往任务地点', 'Follow the trail to your objective') + '"') + '</p><p class="lr-quest-detail">' + h(quest.title) + '</p>' : ''}</div>
 <div class="lr-field-stats"><strong>Lv. ${view.player.level}</strong><span aria-label="${msg('生命', 'Health')}">♥ ${view.player.hp}/${view.player.max_hp}</span><span aria-label="${msg('路币', 'Coins')}">◈ ${view.coins}</span></div></div>
 <button type="button" class="lr-radar-link" data-do="atlas" aria-label="${msg('查看地图', 'View atlas')}"><canvas class="lr-radar" width="68" height="46" aria-hidden="true"></canvas></button>
 <div class="lr-walk-hint">${msg('WASD 移动　E 互动', 'WASD Move　E Interact')}</div>
 ${quest?.target ? '<div class="lr-guide" data-target="' + h(quest.target) + '" aria-hidden="true" hidden><b></b><small></small></div>' : ''}
 <button type="button" class="lr-field-action" hidden><kbd>E</kbd> <span></span></button>
 <div class="lr-touchpad" aria-label="${msg('方向控制', 'Movement controls')}">${[
   ['north', '↑', '向上', 'Up'],
   ['west', '←', '向左', 'Left'],
   ['south', '↓', '向下', 'Down'],
   ['east', '→', '向右', 'Right'],
 ]
   .map(
     ([d, i, zh, en]) =>
       `<button type="button" data-walk-dir="${d}" aria-label="${msg(zh, en)}">${i}</button>`,
   )
   .join('')}</div>
 ${
   view.phase === 'route' || atChapterExit(view)
     ? `<details class="lr-travel-list"><summary>${msg('寻路', 'Wayfinder')}</summary><div>${Object.entries(
         labels,
       )
         .map(([key, text]) => button('spot', h(text), '', `data-key="${h(key)}"`))
         .join('')}</div></details>`
     : '<details class="lr-travel-list" hidden></details>'
 }
 <div class="lr-dialog-layer">${stationDialog(view, selection)}</div></div></section>`;
}
export function atlasPage(view, idx) {
  const reg = view ? regionOf({ ...view, region_index: idx }) : atlas[idx],
    count = view?.map.length || 0,
    pos = view?.region_index;
  const district = view?.eight_chapters && view.map[idx];
  const battles = district && district.chapters.filter((c) => c.kind === 'battle').length;
  const assignment = district ? '<p>' + (battles
    ? msg('本章有 ' + battles + ' 场遭遇，涉及 ' + district.knowledge_count + ' 个知识点。', 'This chapter has ' + battles + ' encounters covering ' + district.knowledge_count + ' course concepts.')
    : reg.scoutFirst ? line(reg.landmark) + (getLocale() === 'en' ? '. ' : '。') + line(reg.meet) + (getLocale() === 'en' ? '.' : '。')
    : msg('本章任务是打探军情、修好驿站机关，再从出口前往下一站。', 'Speak to the keeper, repair the station mechanism and take the road out.')) + '</p>' : '';
  return `<section class="lr-atlas-page"><div class="lr-atlas"><img src="${asset('atlas')}" alt="${msg('八座驿站沿河谷、山路与海港分布的地图', 'Illustrated map of eight posts along river valleys, mountains and harbors')}">
 ${atlas.map((r, i) => button('pin', `<b>${String(i + 1).padStart(2, '0')}</b><span>${line(r.name)}</span>`, 'lr-pin ' + (i === idx ? 'selected ' : '') + (i === pos ? 'current' : ''), `data-index="${i}" style="--x:${r.at[0]}%;--y:${r.at[1]}%" aria-label="${line(r.name)}" aria-pressed="${idx === i}"`)).join('')}</div>
 <div class="lr-atlas-legend"><div class="lr-kicker">${msg('驿路地图', 'Courier atlas')}　/　${String(idx + 1).padStart(2, '0')}</div><h1>${line(reg.name)}</h1><img src="${asset(reg.id)}" alt=""><p>${line(reg.opening)}</p>
 ${view ? `<p>${idx === pos ? msg('队伍当前驻地', 'Current station') : idx < pos ? msg('已通过', 'Cleared') : idx < count ? msg('前方驿站', 'Ahead on your itinerary') : msg('本次行程之外', 'Beyond this itinerary')}</p>` : ''}${assignment}${button(view ? 'scene' : 'home', view ? msg('回到队伍', 'Return to the party') : msg('返回标题', 'Title screen'), 'lr-gold')}</div></section>`;
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
  const chapterDone = v.scene_index + 1 === v.map[v.region_index].chapters.length;
  const nextRegion = atlas[v.region_index + 1];
  const onward = v.eight_chapters && (chapterDone && nextRegion
    ? msg('选一份补给，随后前往' + line(nextRegion.name) + '。', 'Choose supplies and set out for ' + line(nextRegion.name) + '.')
    : msg('选一份补给，队伍会回到本章地图。', 'Choose supplies to return to this chapter’s map.'));
  return `<section class="lr-sheet"><div class="lr-kicker">${line(regionOf(v).name)}　/　${ico('coin')} ${v.coins}</div><h1>${msg('驿站补给', 'Wayside supplies')}</h1><p>${onward || line(regionOf(v).end)}</p><div class="lr-grid">${v.rewards
    .map((r) => {
      const [name, desc] = supply(r);
      return `<article><h2>${name}</h2><p>${desc}</p>${r.requires_replacement ? `<label>${msg('交还遗物', 'Trade in a relic')} <select data-swap="${h(r.id)}">${v.relics.map((item) => `<option value="${h(item.relic.id)}">${relicName(item.relic)} ×${item.stacks}</option>`).join('')}</select></label>` : ''}${button('claim', (r.cost ? ico('coin') + ' ' + r.cost + '　' : '') + (atChapterExit(v) ? msg('领取并出发', 'Take and depart') : msg('领取', 'Claim')), 'lr-glass', `data-key="${h(r.id)}" ${r.affordable ? '' : 'disabled'}`)}</article>`;
    })
    .join('')}</div></section>`;
}
function sourceCoverage(coverage) {
  if (!coverage?.sources?.length) return '';
  const rows = coverage.sources.map((source) => {
    const review = source.needs_review_count > 0 ? '<p>' + msg(
      '另有 ' + source.needs_review_count + ' 个题项尚待核验。可以补充参考解答或题图。',
      source.needs_review_count + ' more items await verification. A worked solution or diagram can help.',
    ) + '</p>' : '';
    const warnings = source.warnings?.length ? '<details><summary>' + msg('查看原始解析记录', 'View extraction notes in their original language') + '</summary>' +
      source.warnings.map((s) => '<p>' + h(s) + '</p>').join('') + '</details>' : '';
    return '<article><strong>' + h(source.filename) + '</strong><p>' +
      msg('资料收录 ' + source.extracted_count + ' 项，本次主线使用 ' + source.scheduled_count + ' 项。',
        source.extracted_count + ' items extracted, ' + source.scheduled_count + ' used in this campaign.') + '</p>' + review + warnings + '</article>';
  });
  return '<section class="lr-notes lr-coverage"><h2>' + msg('讲义收录范围', 'Course coverage') + '</h2>' + rows.join('') + '</section>';
}
export function journal(v, pages = [], coverage = null) {
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
  return `<section class="lr-sheet"><div class="lr-kicker">${msg('个人行装', 'Courier log')}　/　Lv. ${v.player.level}</div><h1>${msg('远征手记', 'Field journal')}</h1><p>${progressText(v)}　　XP ${v.player.xp}　　${ico('coin')} ${v.coins}</p>
 <div class="lr-grid"><article><h2>${msg('行装', 'Equipment')}</h2>${gear}<p>ATK ${v.player.attack}　 DEF ${v.player.stats?.defense ?? 0}</p></article>
 <article><h2>${msg('旅途遗物', 'Relics')}</h2>${v.relics.map((x) => `<p>${relicName(x.relic)} ×${x.stacks}</p>`).join('') || '<p>' + msg('可在战后营地换取。', 'Trade at a wayside camp after battle.') + '</p>'}</article></div>
 <div class="lr-route-list">${v.map.map((vol, i) => `<article>${plate(i)}<div><strong>${line(atlas[i].name)}</strong><small>${vol.chapters.filter((c) => c.status === 'cleared').length} / ${vol.chapters.length} ${msg('关', 'stages')}${v.field_signals?.includes(atlas[i].id) ? '　' + ico('signal') + ' ' + line(atlas[i].signal) : ''}</small></div></article>`).join('')}</div>
 ${sourceCoverage(coverage)}<section class="lr-notes"><h2>${msg('沿途学到的事', 'Lessons from the road')}</h2>${evidence || '<p>' + msg('第一次交手后，可在这里翻阅用过的知识和讲义出处。', 'After your first exchange, revisit the concepts and course sources you used here.') + '</p>'}</section></section>`;
}
function progressText(v) {
  if (!v.eight_chapters) return msg('已通过的关卡', 'Stages cleared') + '　' + v.cleared_chapters + ' / ' + v.chapter_count;
  return msg('主线章节', 'Chapters cleared') + '　' + v.cleared_regions + ' / ' + v.map.length +
    '　　' + msg('已练习知识点', 'Concepts practised') + '　' + v.covered_knowledge_count + ' / ' + v.knowledge_count;
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
  const short = !v.eight_chapters && !full;
  const retreated = v.phase === 'retreated';
  const heading = retreated ? msg('队伍回到了营地', 'Back at camp')
    : short ? msg('这段驿路走完了', 'The end of this route')
    : v.campaign_story ? msg('日轨天台，战毕', 'Victory at the Sun Orrery') : msg('八灯归航', 'Eight lights home');
  const copy = retreated ? msg('这一趟的战斗记录保存在手记里。', 'Your field journal holds the record of this trip.')
    : short ? msg('这份旧存档共有 ' + v.chapter_count + ' 关。你可以带着同一份资料从烟柳渡出发，走完八章主线。', 'This earlier save contains ' + v.chapter_count + ' stages. Take the same course back to Willow Ferry to begin the eight-chapter campaign.')
    : !v.campaign_story ? homeLetter
    : v.story_ending ? msg('斥候从天台下山报捷。翻开手记，可以逐站重读你给他们的命令。', 'The scouts leave the orrery with news of victory. Your journal holds the orders you gave at each station.')
    : msg('灰冠断成两截。赤翎收起弩，等你决定下一步往哪走。', 'The crown lies in two pieces. The bow captain lowers her crossbow and waits for your orders.');
  return `<section class="lr-sheet lr-ending" style="--land:url('${asset(last.id)}')"><div class="lr-kicker">${line(last.name)}</div><h1>${heading}</h1><p>${copy}</p>
 <p>${progressText(v)}　　${msg('收集信物', 'Signals found')} ${seals} / ${v.map.length}</p>
 ${report ? `<p>${msg('战斗答对', 'Correct in battle')} ${report.combat_correct} / ${report.combat_attempts}　　${msg('营地修习次数', 'Camp recoveries')} ${report.sidequests_completed}</p>` : ''}
 <div class="lr-actions">${short ? button('restart-eight', msg('用这份资料开始八章主线', 'Start eight chapters with this course'), 'lr-gold') : ''}${button('journal', msg('查看手记', 'Read the journal'), 'lr-glass')}${button('tower', msg('挑战回声塔', 'Climb the Echo Tower'), 'lr-glass')}${v.phase === 'victory' && !short ? button('encore', msg('再次挑战', 'Play again on veteran'), 'lr-gold') : ''}${button('home', msg('回到标题', 'Title screen'), 'lr-glass')}</div></section>`;
}
