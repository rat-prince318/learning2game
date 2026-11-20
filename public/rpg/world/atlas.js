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
export const regionOf = (view) => atlas[view?.region_index] || atlas[0];
