import { getLocale, msg } from '../../js/locale.js';

import { atlas, line } from '../world/atlas.js';

const heroes = {
  arcanist: [['星纹术士', 'Starweaver'], ['坠星术', 'Starfall']],
  vanguard: [['誓盾先锋', 'Oathguard'], ['破阵斩', 'Sundering Blade']],
  ranger: [['岚弓游侠', 'Galebow'], ['穿云箭', 'Cloudpiercer']],
};
const regions = new Map(atlas.map(region => [region.id,region]));
const foes = {
  ash_crown:'Ashcrown, Warlord of the Rift',
  reed_runner:'Reedcap Otter', pollen_lantern:'Lanternfly', ferry_ram:'Ferry Ram', willow_lock:'Willow Gatekeeper',
  salt_skate:'Saltwing Ray', buoy_crab:'Buoy Claw', reef_diver:'Sunken Bell Diver', tidal_engine:'Tide Engine',
  ember_tick:'Ember Hopper', kiln_carrier:'Kilnback Cart', anvil_knight:'Anvil Knight', copper_drake:'Rivetwing Drake',
  seed_glider:'Seed Glider', wicker_stag:'Wicker Stag', storm_thresher:'Storm Thresher', wind_schooner:'Sailwing Kite',
  ink_nib:'Walking Quill', shelf_tortoise:'Bookshelf Tortoise', index_duelist:'Index Duelist', redline_scribe:'Redline Scribe',
  snowmoth:'Snowmoth', moraine_goat:'Moraine Goat', crevasse_sentry:'Crevasse Sentry', mirror_lynx:'Mirror Lynx',
  bronze_wren:'Bronze Wren', escapement:'Escapement Golem', carillon_hand:'Carillon Hand', bellfounder:'Bellfounder',
  star_sieve:'Starsand Moth', prism_sailor:'Prism Ferryman', broken_epicycle:'Broken Epicycle', eclipse_lion:'Eclipse Lion',
};
const stances = {
  strike:['Strike', 'The foe lowers its body to spring forward.', 'Watch its poise before committing to an attack.'],
  heavy:['Heavy blow', 'The foe braces its feet and winds up.', 'A correctly timed guard catches this blow.'],
  charge:['Charging', 'The foe draws in energy for its next attack.', 'Guard to interrupt the charge, or spend the opening on an attack.'],
  ward:['Ward', 'The foe draws its defenses tight.', 'A charged class skill can pierce this stance.'],
  expose:['Exposed', 'The guard opens and its weakness comes within reach.', 'Strike now or spend a charged skill.'],
};
const gear = {
  twig_focus:'Twig Staff', amber_focus:'Amber Staff', rain_focus:'Rain Staff', moon_focus:'Moon Staff', dawn_focus:'Dawn Staff',
  camp_blade:'Camp Blade', copper_blade:'Copper Broadsword', tide_blade:'Tideblade', cliff_blade:'Cliff Greatsword', sun_blade:'Sun Oathblade',
  reed_bow:'Reed Bow', elm_bow:'Elm Hunting Bow', gale_bow:'Galebow', cloud_bow:'Cloud Hornbow', comet_bow:'Comet Bow',
  trail_coat:'Trail Coat', echo_charm:'Echo Pendant', ward_vest:'Moss Vest', hearth_charm:'Hearth Charm',
};

export const heroNames = (role) => (heroes[role] || heroes.arcanist).map(pair => msg(...pair));
export const gearName = (item) => item ? msg(item.name, gear[item.id] || item.name) : msg('嫩枝法杖','Twig Staff');
export const regionId = (view) => view?.map?.[view.region_index]?.region_id || 'willow_ferry';
export const hasRegionalArt = (id) => id !== 'willow_ferry' && regions.has(id);
export const regionName = (view) => {
  if (view?.mode === 'tower') return msg('星轨无尽塔', 'The Astral Spire');
  const name = view?.map?.[view.region_index]?.name || '烟柳渡';
  const region = regions.get(regionId(view));
  return region ? line(region.name) : name;
};
export const enemyName = (view) => {
  const name = view?.battle?.enemy?.name || '柳根闸主';
  return msg(name, foes[view?.battle?.tactics?.encounter_id || 'willow_lock'] || name);
};
export function intentCopy(intent) {
  if (!intent) return [msg('观察敌情','Read the field'), '', ''];
  const en = stances[intent.id] || [intent.name, intent.telegraph, intent.advice];
  return [msg(intent.name, en[0]), msg(intent.telegraph, en[1]), msg(intent.advice, en[2])];
}

const receiptText = {
  '判断偏离了线索，敌人发动反击。':'The seal failed. The enemy counters.',
  '攻击命中了敌人。':'Your strike lands.',
  '连击命中要害！':'Your combo finds a weak point!',
  '稳住架势，完成防守反击。':'Your guard holds. Counterstrike!',
  '你退回营地。复盘本次交手的讲义记录，即可整队再战。':'Back at camp. Restore the missed notes to challenge this foe again.',
  '翻回营地摘记，再核对这张档案卡。':'Check the camp notes and try the field record again.',
  '档案修复成功，继续下一条营地记录。':'Record restored. The next camp note is ready.',
  '营地修习完成，体力已恢复。重新挑战本章守关者！':'Notes restored and health recovered. The guardian awaits!',
};
export function eventText(event, view) {
  if (!event) return '';
  if (getLocale() !== 'en') return event.message;
  if (event.kind === 'hint') return lessonText(event.message);
  if (receiptText[event.message]) return receiptText[event.message];
  if (event.kind === 'victory' || event.kind === 'stage_clear') return enemyName(view) + ' falls. The way opens.';
  if (event.skill === 'burst' && event.correct) return heroNames(view?.player?.hero_class)[1] + ' hits!';
  return event.message;
}

// Known demo notes and fixed authoring scaffolds. User-authored evidence always
// retains its source spelling, punctuation and mathematical notation.
const demo = new Map([
  ['细胞核','Nucleus'],['线粒体','Mitochondrion'],['细胞膜','Cell membrane'],['核糖体','Ribosome'],
  ['叶绿体','Chloroplast'],['细胞壁','Cell wall'],['液泡','Vacuole'],['细胞质','Cytoplasm'],
  ['储存遗传信息，参与调控细胞的生长与活动','Stores genetic information and helps regulate cell growth and activity'],
  ['进行有氧呼吸，为细胞活动提供 ATP','Performs aerobic respiration to supply ATP for cell activity'],
  ['选择性地控制物质进入和离开细胞','Selectively controls the movement of materials into and out of the cell'],
  ['读取信使 RNA 的信息，合成蛋白质','Reads messenger RNA and synthesizes proteins'],
  ['在植物细胞中进行光合作用，将光能转为化学能','Performs photosynthesis in plant cells, converting light to chemical energy'],
  ['位于细胞膜外，提供结构支撑与保护','Sits outside the cell membrane and provides support and protection'],
  ['储存水和溶质，参与维持植物细胞膨压','Stores water and solutes and helps maintain plant cell turgor'],
  ['容纳细胞器，为多种化学反应提供场所','Holds organelles and provides a site for many chemical reactions'],
  ['先圈出描述中的动作、对象或位置，再逐项比较选项','Identify the action, object or location in the clue, then compare the inscriptions'],
  ['先圈出记录中的动作和对象，再比较各个选项','Mark the action and object in the record, then compare the inscriptions'],
  ['先核对第一栏，再用第二栏排除次序相反的候选项','Check the first column, then use the second to eliminate reversed entries'],
  ['把最相近的两个标签放在一起，找出区分它们的原文线索','Compare the two closest labels. Which clue in the source tells them apart?'],
  ['留意资料里的动作、对象和条件，再逐项比较','Look for actions, objects and conditions in the notes before comparing the inscriptions'],
]);
export function lessonText(raw) {
  if (!raw || getLocale() !== 'en') return raw || '';
  const lookup = (value) => demo.get(value.replace(/。$/u, '')) || value;
  const hintLines=raw.split('\n');
  if (hintLines.length>1 && hintLines.every(line=>demo.has(line.replace(/。$/u,'')))) return hintLines.map(lookup).join('\n');
  let matched;
  // Fixed introductions are authored by the course agent. Translate only its
  // known surrounding sentences, leaving the extracted clues in their language.
  const report = raw.replace(/^(?:值班台收到紧急工单，你负责安排交接。|装订时有几张标签散落了，你负责把它们放回相应的记录页。|两名同伴交来的登记各缺一栏，你负责签发复核结果。|展台马上开放，你需要选好展签，交给正在布展的同伴。|档案准备入库，你负责从候选标签中完成最后一次分拣。)/u,'');
  if ((matched = /^(?:图示|资料)记录的第一栏是「([\s\S]+?)」，第二栏是「([\s\S]+?)」。两栏标签要按顺序送出，你签发哪一组？$/u.exec(report)))
    return 'Seal the entries in order. The first column reads “'+lookup(matched[1])+'”. The second reads “'+lookup(matched[2])+'”.';
  if ((matched = /^(?:图示|资料)记录注明「([\s\S]+)」。(?:你会把这张标签归到哪一项？|应领取哪张标签？)$/u.exec(report)))
    return 'The record reads “'+lookup(matched[1])+'”. Which label belongs here?';
  if ((matched = /^这次要登记的条目是「([\s\S]+)」。你选择哪条资料描述随它一起交接？$/u.exec(report)))
    return 'Choose the description to file with “'+lookup(matched[1])+'”.';
  if ((matched = /^你领到了「([\s\S]+)」标签。请选择与讲义相符的说明，补全.+。$/u.exec(raw)))
    return 'The field guide needs an entry for “' + lookup(matched[1]) + '”. Which inscription matches your notes?';
  if ((matched = /^同伴为「([\s\S]+)」留下了几份记录。根据讲义，哪一份可以收入.+？$/u.exec(raw)))
    return 'Your companion left records for “' + lookup(matched[1]) + '”. Which belongs in the field guide?';
  if ((matched = /^(?:登记页留下线索|图示记录写着|复核员拿到一条匿名记录：)「([\s\S]+)」[\s\S]+$/u.exec(raw)))
    return 'The field guide reads “' + lookup(matched[1]) + '”. Which inscription names it?';
  if ((matched = /^为「([\s\S]+)」修复档案页。哪一条记录与本章讲义相符？$/u.exec(raw)))
    return 'Restore the page for “' + lookup(matched[1]) + '”. Which note matches the chapter?';
  if (raw.startsWith('补给站的索引卡缺少标题。请根据这条资料说明选出标题：'))
    return 'Restore the missing heading for this record.\n' + lookup(raw.slice(raw.indexOf('：')+1).trim());
  if (raw.startsWith('补给站交回一份待核对的作业。先读资料摘记，再重新判断：'))
    return 'Read the field notes, then restore this record.\n' + lessonText(raw.slice(raw.indexOf('：')+1).trim());
  return lookup(raw);
}
