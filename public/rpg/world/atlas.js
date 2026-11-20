import { acts } from './saga/chapters.js';
import { msg } from '../../js/locale.js';

// Each signal is a piece of physical evidence in the continuing story.
// Coordinates on the printed atlas are percentages, separate from scene hotspots.
export const atlas = [
  {
    id: 'willow_ferry',
    name: ['烟柳渡', 'Willow Ferry'],
    at: [15, 67],
    keeper: ['守渡人', 'Ferry keeper'],
    site: ['水尺', 'Flood gauge'],
    signal: ['河灯', 'River lamp'],
    opening: acts[0].arrival,
    dialogue: acts[0].beats[0],
    clue: [
      '三块踏板中，水痕最低的一块还露着干木纹。把绳结系在那里，渡船就有了靠岸的支点。',
      'Of three mooring boards, the lowest mark still shows dry grain. Hitch the line there and the ferry can hold against the current.',
    ],
    tool: ['系紧渡缆', 'Hitch the ferry line'],
    found: [
      '缆绳拉直。木牌背面刻着白汐港的潮记。',
      'The rope draws taut. A tide mark from Salt Harbor is carved on the back.',
    ],
    end: [
      '守渡人把一盏河灯挂上船头。下游有人举灯回应。',
      'The keeper hangs a lamp at the prow. Downstream, someone lifts another in reply.',
    ],
  },
  {
    id: 'salt_harbor',
    name: ['白汐港', 'Salt Harbor'],
    at: [36, 74],
    keeper: ['读潮员', 'Tide reader'],
    site: ['潮汐浮标', 'Tide buoy'],
    signal: ['航灯', 'Harbor light'],
    opening: acts[1].arrival,
    dialogue: acts[1].beats[0],
    clue: [
      '塔影落在长满藤壶的青石上。铜链的第三环仍留着盐霜。',
      'The tower shadow falls across barnacled stone. Salt still dusts the third link of the chain.',
    ],
    tool: ['校准浮标', 'Set the tide buoy'],
    found: [
      '浮标露出一圈红漆。刻度和发往车场的调令刚好颠倒。',
      'A red band emerges. Its graduations are reversed on the order sent to the foundry.',
    ],
    end: [
      '绿灯亮起，盐船离港。你在信袋里找到一把烫手的铜钥匙。',
      'The lamps turn green and the barge sails. A warm copper key rattles in the mailbag.',
    ],
  },
  {
    id: 'copper_yard',
    name: ['赤铆车场', 'Copper Yard'],
    at: [24, 40],
    keeper: ['扳道工', 'Switch tender'],
    site: ['断轨扳机', 'Rail switch'],
    signal: ['炉火', 'Furnace fire'],
    opening: acts[2].arrival,
    dialogue: acts[2].beats[0],
    clue: [
      '风箱和岔轨装在同一根轴上。拉下冷却柄，矿车的安全钩也会落下。',
      'Bellows and switch share a shaft. Pulling the cooling handle will drop the wagon’s safety catch.',
    ],
    tool: ['扣下安全钩', 'Drop the rail catch'],
    found: [
      '车轮停稳，座椅下滚出一袋果树种子。收件地址在山上。',
      'The wheels catch. A pouch of orchard seeds rolls from under the seat, addressed to the highlands.',
    ],
    end: [
      '末班车重新经过接缝，汽笛把消息带过群山。',
      'The last train crosses the repaired joint. Its whistle carries the news over the hills.',
    ],
  },
  {
    id: 'sail_terraces',
    name: ['悬帆梯田', 'Sail Terraces'],
    at: [40, 22],
    keeper: ['风袋师', 'Sail maker'],
    site: ['风索绞盘', 'Sail winch'],
    signal: ['风旗', 'Wind pennant'],
    opening: acts[3].arrival,
    dialogue: acts[3].beats[0],
    clue: [
      '风向袋指向山口。逆着它转绞盘，种子就能顺绳滑下。',
      'The windsock points toward the pass. Wind the winch against it to give the seed sacks a clear descent.',
    ],
    tool: ['拴住侧帆', 'Belay the side sail'],
    found: [
      '一张借书卡从帆袋里滑出。卡上八个地名，共用同一串红字。',
      'A library slip falls from the sail bag. All eight towns are marked with the same red correction.',
    ],
    end: [
      '第一袋种子落地，农人把风旗升到最高处。',
      'The first seeds reach the ground. The farmers hoist their signal pennant.',
    ],
  },
  {
    id: 'palimpsest',
    name: ['复写馆', 'The Palimpsest'],
    at: [53, 47],
    keeper: ['编目员', 'Archivist'],
    site: ['校样透光台', 'Proofing table'],
    signal: ['书灯', 'Reading lamp'],
    opening: acts[4].arrival,
    dialogue: acts[4].beats[0],
    clue: [
      '纸上叠着两层笔迹。透光后，原稿的字从红线间露了出来。',
      'Two hands have written on the sheet. Held to the light, the first appears between the red strokes.',
    ],
    tool: ['透光读底稿', 'Backlight the proof'],
    found: [
      '原稿写着「让各站各自报时」。天台却把八份钟表校成了一份。',
      'The original order reads “Each station keeps local time.” The observatory synchronized eight clocks to one.',
    ],
    end: [
      '馆员把每张借书卡还给原主。你带走一份真正的校时单。',
      'The archivist returns each card to its owner. You carry away the original calibration sheet.',
    ],
  },
  {
    id: 'mirror_pass',
    name: ['镜雪山口', 'Mirror Pass'],
    at: [65, 19],
    keeper: ['雪线测绘员', 'Snow surveyor'],
    site: ['山口木铃', 'Pass chimes'],
    signal: ['雪铃', 'Snow bell'],
    opening: acts[5].arrival,
    dialogue: acts[5].beats[0],
    clue: [
      '回声向两侧散，绳结的震动只沿一条冰脊传到手心。',
      'The echo scatters both ways. The rope’s vibration reaches your palm along a single ice ridge.',
    ],
    tool: ['扣响路铃', 'Ring the trail bell'],
    found: [
      '冰墙后响起应答。巡队把一张七桥的敲钟时刻表塞进你的手套。',
      'An answering bell sounds. The patrol presses a Seven Bridges timetable into your glove.',
    ],
    end: [
      '勘测员沿着一串清楚的铃声回营，雪上的脚印终于有了去处。',
      'The surveyors follow one clear peal home. At last the tracks lead somewhere.',
    ],
  },
  {
    id: 'bell_bridges',
    name: ['七桥钟城', 'Seven Bridges'],
    at: [74, 61],
    keeper: ['修钟匠', 'Bell tender'],
    site: ['铜簧音叉', 'Tuning fork'],
    signal: ['桥钟', 'Bridge bell'],
    opening: acts[6].arrival,
    dialogue: acts[6].beats[0],
    clue: [
      '音叉上磨平了一道铜纹。轻轻抵住第三根簧，重叠的余音渐渐分开。',
      'One groove is worn smooth. Rest the tuning fork against the third reed and the overtones separate.',
    ],
    tool: ['调准第三响', 'Tune the third peal'],
    found: [
      '桥下的水面映出天台的双环。其中一枚比另一枚快了一拍。',
      'Twin rings above the observatory reflect in the water. One runs a beat ahead.',
    ],
    end: [
      '七桥依次落下，婚船从城心穿过。钟匠送来最后一封交班信。',
      'Seven bridges settle in sequence. The barge crosses the city. The tender delivers the last dispatch.',
    ],
  },
  {
    id: 'orrery',
    name: ['日轨天台', 'The Orrery'],
    at: [89, 24],
    keeper: ['日轨守台人', 'Orrery keeper'],
    site: ['黄铜日环', 'Brass meridian'],
    signal: ['日晷', 'Solar dial'],
    opening: acts[7].arrival,
    dialogue: acts[7].beats[0],
    clue: [
      '把铜环上的晨星对准地平线。八个刻度依次亮起，各自对应一座有人守望的城。',
      'Align the brass ring’s morning star with the horizon. Eight marks light in turn, each a town with someone on watch.',
    ],
    tool: ['松开联动铜环', 'Release the linked rings'],
    found: [
      '两枚铜环分开。天际露出真正的第一缕晨光。',
      'The brass rings turn freely. The first true dawn breaks over the rim of the world.',
    ],
    end: [
      '八地依次报来平安。你把最后一封信送回渡口，窗边那盏河灯还为你亮着。',
      'Eight replies arrive in their own time. You carry the last letter back to the ferry. Its lamp is still burning for you.',
    ],
  },
];
export const line = (pair) => msg(...pair);
// Campaign dialogue and quest targets for each region.
const campaignPosts = {
  willow_ferry: {
    meet: ['去渡口调查灵船船首', 'Investigate the ghost ship’s prow'],
    approach: ['循河工栈道清出渡船的航路', 'Clear the patrol blocking the ferry channel'],
    boss: ['击退柳根闸主，开闸下白汐港', 'Beat the Willow Gatekeeper to open the harbor channel'],
    keeper: acts[0].speaker, site: ['渡口水尺', 'Ferry gauge'],
    landmark: ['去水尺旁系好渡缆', 'Secure the ferry line at the gauge'],
    clue: ['高堤的缆桩已经泡松。试试低岸那根，水退以后，木头还咬得住绳。', 'The high mooring post has worked loose. Try the one on the low bank. The wood there still holds a line.'],
    found: ['缆绳绷紧，守渡人提着河灯站到了船头。后面的船看见灯，就知道该在哪儿靠。', 'The line holds. Reed stands at the prow with a lamp so the boats behind can find the mooring.'],
    end: ['闸门开了。赤翎在船尾听了半晌，伸手指向下游。白汐港的钟还在响。', 'The sluice opens. Kestrel listens from the stern and points downstream. The Salt Harbor bell is still ringing.'],
  },
  salt_harbor: {
    scoutFirst: true,
    needSignal: ['弩长指着压得很低的船舷。「伤员船吃水两米。先上灯塔，给它指条过得去的水道。」', 'The captain points at a low-riding boat. “Two metres of draught and wounded aboard. Get to the lighthouse and mark a channel deep enough for her.”'],
    meet: ['去码头找盐港弩长', 'Meet the bow captain on the wharf'],
    approach: ['打通通往潮泵的巡道', 'Clear the harbor patrol on the way to the pump'],
    boss: ['击停逆潮司泵，打开出港水道', 'Stop the Tide Engine to clear the harbor channel'],
    keeper: acts[1].speaker, site: ['灯塔领港台', 'Pilots’ table'], landmark: ['去灯塔读潮，给伤员船点亮航标', 'Read the tide at the lighthouse and mark a channel'],
    clue: ['盐池边一艘伤员船正等着进港，船舷上的吃水标是两米。领港台上挂着三条水道刚测的深度。你点哪盏灯，船就走哪条。', 'A hospital boat waits outside the pans. Her hull draws two metres. The pilot has just sounded all three channels. Light the buoy you want her to follow.'],
    found: ['中槽亮起一盏绿灯。伤员船擦过盐堤，慢慢靠上弩长守的码头。', 'The middle buoy burns green. The hospital boat slides past the salt bank and ties up at the captain’s wharf.'],
    end: ['水道一通，弩长就给山上的赤铆车场打了个旗语。那边半天才回，回的是求援旗。', 'As soon as the channel clears, the captain signals Copper Yard. An answer finally comes. It is a distress flag.'],
  },
  copper_yard: {
    meet: ['找铁匠铆青问清军械车的去向', 'Find Flint and ask where the arms train is headed'],
    approach: ['沿车场轨道逼近熔轨侧门', 'Clear the rail patrol on the way to the furnace'],
    boss: ['打退铆翼炉龙，夺回铁轨', 'Drive off the Rivetwing Drake and reclaim the track'],
    keeper: acts[2].speaker, landmark: ['在断轨旁扣下矿车安全钩', 'Set the ore cart’s safety catch at the switch'],
    clue: ['车轮还贴着火。扳到冷却那一档，水一浇下去，安全钩才能咬住轮轴。', 'The wheels are red hot. Set the lever to Cool. Once the water hits, the safety catch can grip the axle.'],
    found: ['铁钩咬紧车轴，炉火重新亮了起来。留守的炉工抡起锤，给援军赶制第一批护甲。', 'The catch grips the axle and the furnace flares up. The smiths at the yard start hammering out armor for the relief column.'],
    end: ['矿车终于能沿山轨走了。铆青蹬上踏板，朝你拍拍车厢：「上来。追粮船比它快的，就这趟车。」', 'The mountain track is clear. Flint hops on the running board and pats the car. “In you get. Only ride fast enough to catch that grain ship.”'],
  },
  sail_terraces: {
    scoutFirst: true,
    needSignal: ['领航员死死抓着索梯。「先替我稳住那面侧帆！腾出一只手，我就能拉你上船。」', 'The navigator grips the rope ladder. “Catch that loose sail! Free one of my hands and I’ll haul you aboard.”'],
    meet: ['去梯田找粮船领航员', 'Meet the grain ship’s navigator in the terraces'],
    approach: ['清出通往帆索的山路', 'Clear the trail to the sail crossing'],
    boss: ['逼退悬帆渡鸢，把粮船牵回来', 'Drive off the Sailwing Kite and land the grain ship'],
    keeper: acts[3].speaker, landmark: ['去风索绞盘拉稳侧帆', 'Steady the side sail at the winch'],
    clue: ['风从山口灌进来，侧帆拍得桅杆直晃。先拉紧迎风的索，再把铁爪扣进绞盘，才能腾出手来。', 'A gust from the pass slams the sail against its mast. Haul the windward sheet first, then drop the pawl into the winch to hold it.'],
    found: ['铁爪咬住齿轮，侧帆终于停住了。领航员顺着绳梯爬下来，朝你招了招手。山脊上的巨鸢还在拖那艘粮船。', 'The pawl bites and the sail stops thrashing. The navigator climbs down the ladder and waves you over. Above the ridge, the kite still has the grain ship in tow.'],
    end: ['最后一袋粮送到了村里。赤翎收起那张带红印的运单，往复写馆去了。', 'The last sack reaches the village. Kestrel pockets the red-stamped waybill and sets off for the archive.'],
  },
  palimpsest: {
    scoutFirst: true,
    needSignal: ['阿简把一张折过角的战报递过来。「那行小字盖在红印底下。先去透光台读给我听，我就把原册找出来。」', 'Wren hands you a dog-eared dispatch. “There’s a line underneath that red seal. Take it to the proofing table. Tell me what it says and I’ll fetch the original.”'],
    meet: ['找编目员阿简借阅征名底册', 'Ask Wren for the original muster roll'],
    approach: ['穿过书架，去装订房找原稿', 'Get past the stacks to the binding room'],
    boss: ['击败红线总校官，取回底册', 'Defeat the Redline Scribe and reclaim the roll'],
    keeper: acts[4].speaker, landmark: ['去档案厅的透光台，辨认折角战报', 'Read the folded dispatch at the archive light table'],
    clue: ['台上摊着一封旧战报。折角下露出半枚虎符，跟你腰间的正好配成一对。红印压着原来的字，把灯移到纸背看看。', 'An old dispatch lies across the table. Half a seal peeks out from the fold. It matches the one on your belt. A red stamp covers the writing; try the lamp behind the sheet.'],
    found: ['你抄下纸背上的暗号「木铃一响，就是自己人」，拿起桌边的书灯，去找编目员阿简。', 'You copy the line from the back: “One wooden chime means a friend.” You pick up the reading lamp and head for Wren’s desk.'],
    end: ['阿简把原册锁回柜里。你和赤翎各背一捆麻绳，去镜雪山口接母亲的后队。', 'Wren locks the roll away. You and Kestrel each shoulder a coil of rope and leave for the missing scouts at Mirror Pass.'],
  },
  mirror_pass: {
    meet: ['去山口找赤翎，听雪下的动静', 'Meet Kestrel at the pass and listen beneath the ice'],
    approach: ['沿冰脊替斥候清出下山的路', 'Clear a path down the ridge for the scouts'],
    boss: ['赶走雪镜猞猁，带队下山', 'Drive off the Mirror Lynx and get the scouts downhill'],
    keeper: acts[5].speaker, landmark: ['用山口木铃给冰下的人报信', 'Signal the scouts with the pass chimes'],
    clue: ['母亲总把铃绳缠在实木桩上。拉一下木桩那头，震动能顺绳传到冰底。', 'Your mother tied bell lines to solid wood. Pull the line at the timber post to send a vibration under the ice.'],
    found: ['冰底传来三长一短。你把雪铃挂回木桩，落在后面的人也有了路标。', 'Three long knocks, one short, come back through the ice. You hang the bell on the post for the next scout down.'],
    end: ['领队的斥候把绳子卷在肩上。「下了这道梁就能看见七桥。谁先到，替我跟他们说一声，人齐了。」', 'The lead scout shoulders the rope. “Seven Bridges is over that ridge. Whoever gets there first, tell them we’re all here.”'],
  },
  bell_bridges: {
    meet: ['找修钟匠问清落桥的钟声', 'Ask the bell tender for the drawbridge signal'],
    approach: ['穿过钟架，拿下吊桥的桥头', 'Clear the bell galleries to reach the drawbridge'],
    boss: ['击倒七桥铸钟师，放下吊桥', 'Beat the Bellfounder and lower the bridges'],
    keeper: acts[6].speaker, landmark: ['去钟楼鸣钟，让车队让开吊桥', 'Ring the tower bell to clear the bridge for lowering'],
    clue: ['头两响留给车队，第三响才落桥。把音叉抵在第三根簧上，敲一下试试。', 'Two strokes warn the carts. The third lowers the bridge. Rest the fork against the third reed and give it a tap.'],
    found: ['第三响越过屋脊，对岸跟着回了一声。你给下一班援军留好了过桥的信号。', 'The third stroke carries over the roofs. The far bank answers. The arriving troops now have their crossing signal.'],
    end: ['桥板一块块落回桥墩。最后一道铁索松开，天台的城坡就在眼前。', 'One by one the spans settle on their piers. The last chain pays out. The ramp to the Orrery lies ahead.'],
  },
  orrery: {
    meet: ['在天台和赤翎商量最后一击', 'Meet Kestrel at the Orrery to plan the final strike'],
    approach: ['突破天台守军，逼近日环', 'Break through the Orrery guard to reach the solar ring'],
    boss: ['登上日环，迎战灰冠龙将', 'Climb the solar ring and fight Ashcrown'],
    keeper: acts[7].speaker, landmark: ['转动黄铜日环，给联军发信号', 'Turn the brass meridian to signal the allies'],
    clue: ['清早第一道光沿地平线进来。把星纹转到地平刻度，就能把光送回山下。', 'The first light comes along the horizon. Turn the star mark to Horizon to send a flash down the mountain.'],
    found: ['铜环把晨光送下山去。山下旗子一面接一面举起来，全看见你了。', 'The brass ring flashes sunlight down the slope. Standards rise one after another. They can see you.'],
    end: ['天台脚下停了鼓。赤翎收起红旗，抬头等你开口。', 'The drums fall silent below the Orrery. Kestrel rolls up the red flag and waits for your word.'],
  },
};

// Eight-chapter instruments have their own controls. Earlier story saves keep
// the map clues for their three-position dials.
const chapterControls = {
  copper_yard: {
    site: ['矿车分道闸', 'Ore cart points'], tool: ['挂好车轴安全钩', 'Hook the axle ring'],
    clue: ['矿车正往炉口滑。先送进有水的侧线，轮缘冷下来就踩闸，把钩子挂进车轴。', 'The ore cart is rolling toward the furnace. Send it down the siding with the water trough, stamp on the brake, then hook the axle.'],
  },
  mirror_pass: {
    site: ['山口听绳台', 'Bell line post'], tool: ['敲一声木铃报平安', 'Ring once to answer'],
    clue: ['赤翎递给你一枚木铃。冰下的人会拉绳回信。摸到回应以后，就敲一声告诉他们路在哪边。', 'Kestrel hands you a wooden bell. The people below will tug a line in reply. When you feel them, ring once to guide them home.'],
  },
  bell_bridges: {
    site: ['钟楼放桥台', 'Drawbridge signals'], tool: ['拔销放桥', 'Unpin the bridge'],
    clue: ['桥上还有车。第一响让东岸停车，第二响轮到西岸。两边旗手都退开，第三响就拔销落桥。', 'Carts are still crossing. Ring once to stop traffic on the east bank, twice for the west. When both flaggers step clear, pull the pin on the third stroke.'],
  },
  orrery: {
    site: ['日环信镜', 'Meridian signal mirror'], tool: ['打开信镜', 'Uncover signal mirror'],
    clue: ['东边的群山刚露出一线晨光。把瞄准槽朝东，再压低铜环，让光沿地平线射进信镜。', 'First light is breaking over the eastern hills. Face the sight east and lower the ring until the light skims the horizon into the mirror.'],
  },
};

export function regionOf(view) {
  const post = atlas[view?.region_index] || atlas[0];
  if (!view?.campaign_story) return post;
  return { ...post, ...campaignPosts[post.id], ...(view.eight_chapters ? chapterControls[post.id] : {}) };
}

export function atChapterExit(view) {
  return Boolean(view?.eight_chapters && view.phase === 'reward' &&
    view.region_index + 1 < view.map.length &&
    view.scene_index + 1 === view.map[view.region_index].chapters.length);
}

export function fieldQuest(view) {
  const post = regionOf(view);
  const title = line(view?.campaign_story ? acts[view.region_index]?.title || post.name : post.name);
  const step = (target, copy, verb) => ({ title, target, text: line(copy), verb: line(verb) });
  if (atChapterExit(view)) {
    const next = atlas[view.region_index + 1];
    return step('ship', ['去出口领补给，前往' + next.name[0], 'Meet the convoy at the exit for ' + next.name[1]], ['领补给', 'Take supplies']);
  }
  if (view?.phase !== 'route') return { title, target: null, text: '', verb: '' };
  if (view.eight_chapters && post.scoutFirst && !view.story_marks?.[post.id] && !view.field_signals?.includes(post.id))
    return step('site', post.landmark, post.tool);
  if (view.campaign_story && !view.story_marks?.[post.id]) {
    const ship = post.id === 'willow_ferry';
    return step(ship ? 'ship' : 'keeper', post.meet, ship ? ['调查船首', 'Inspect the prow'] : ['交谈', 'Talk']);
  }
  const chapters = view.map?.[view.region_index]?.chapters;
  if (chapters?.[view.scene_index]?.kind === 'exploration') {
    if (!view.field_signals?.includes(post.id)) return step('site', post.landmark, post.tool);
    const next = atlas[view.region_index + 1];
    return step('ship', next ? ['去出口，前往' + next.name[0], 'Head to the exit for ' + next.name[1]] : ['前往出口集合', 'Regroup at the exit'], ['出发', 'Depart']);
  }
  const routes = view.routes || [];
  const route = routes.find((r) => r.id === 'normal') || routes.find((r) => r.id === 'boss_steady') || routes[0];
  if (!route) return { title, target: null, text: '', verb: '' };
  let task = view.campaign_story ? (route.boss ? post.boss : post.approach) : ['前往守卫据守的路口', 'Head for the guarded crossing'];
  if (route.encounter_id === 'ash_crown') task = ['迎战灰冠龙将，打碎征名炉', 'Fight Ashcrown and break the muster furnace'];
  return step(route.id, task, ['迎战', 'Fight']);
}

// Supply stops also occur midway through a region; save the departure line for
// the checkpoint where the player actually changes maps.
export function checkpointAftermath(view) {
  const post = regionOf(view);
  const chapters = view.map?.[view.region_index]?.chapters || [];
  if (!view.campaign_story || view.scene_index + 1 >= chapters.length) return line(post.end);
  return msg('守路的敌人已经退开。领好补给，沿路向前。', 'The patrol has fallen back. Pick up supplies and press on.');
}
