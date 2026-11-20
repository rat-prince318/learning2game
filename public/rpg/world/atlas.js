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
    opening: [
      '最后一封平安信写着「水到第三阶」。今早，下游八盏报汛灯一起熄了。你的第一封急件送给渡口守灯人。',
      'The last letter home read, “Water at the third step.” This morning all eight signal lamps went dark. Your first dispatch is for the ferry keeper.',
    ],
    dialogue: [
      '「船上还有孩子。你听，闸后有三下敲木声。那是上一班守灯人留给你的回信。」',
      '“There are children still on that boat. Hear the three knocks behind the sluice? The last keeper left you a reply.”',
    ],
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
    opening: [
      '白汐港的潮钟敲响了退潮，潮水却往城里走。一艘盐船驮着给前线的信，搁在灯塔脚下。',
      'The ebb bell rings as seawater enters the town. Beneath the lighthouse a salt barge lies stranded with a sack of front-line mail.',
    ],
    dialogue: [
      '「两根系船柱，一根生着藤壶，一根干净。把浮标放回老水线，我就知道哪张潮表被改了。」',
      '“Two bollards. One has barnacles, the other is clean. Reset my buoy at the old waterline and we can find the altered tide chart.”',
    ],
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
    opening: [
      '运煤车停在半截桥上，铜钥匙恰好插进岔轨箱。炉龙盘在对岸，把断轨当成了翼骨。',
      'A coal wagon hangs over half a bridge. The copper key fits the switch box; a furnace drake wears the missing rail as a wing bone.',
    ],
    dialogue: [
      '「看炉膛的颜色。白热时谁也碰不得；变成樱红，才是落锤的时机。」',
      '“Watch the hearth. Wait until the white glare turns cherry red. That is the moment to strike.”',
    ],
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
    opening: [
      '运种船挂在渡鸢背上，帆影一遍遍掠过空田。风一停，今年的春雨就要到了。',
      'A kite-beast carries the seed ship over empty terraces. The spring rain will arrive the moment the wind drops.',
    ],
    dialogue: [
      '「先收侧帆。你留下的那袋种子，是这片谷地最后一份备种。」',
      '“Furl the side sail first. That pouch you carried is our valley’s last reserve.”',
    ],
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
    opening: [
      '满街的人来查自己的名字。每一本借书册翻开，里面都是同一句错误的调令。',
      'The street fills with people looking up their names. Every lending ledger now repeats the same mistaken order.',
    ],
    dialogue: [
      '「最下面那层墨还在。把水灯移到纸后，你就能读到第一封信。」',
      '“The oldest ink is still there. Hold the water lamp behind the proof and you can read the first letter.”',
    ],
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
    opening: [
      '雪里十几排脚印兜回同一处。木铃声从冰壁后传来，有人在等校时单上的下一班巡队。',
      'A dozen sets of footprints circle back. Behind a wall of ice someone is waiting for the patrol named on the time sheet.',
    ],
    dialogue: [
      '「看冰里的绳影，找系在实木桩上的那一根。我们跟着真铃走。」',
      '“Look at the reflected ropes. Follow the one tied to solid wood. That bell will take us home.”',
    ],
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
    opening: [
      '午夜，七座桥同时升起。送面包的小车停在半空，桥下的婚船等着黎明。',
      'At midnight all seven bridges rise. A bread cart hangs above a wedding barge waiting below for morning.',
    ],
    dialogue: [
      '「第三声才是桥钟。让另外六座先歇一拍，你会听到城里原来的节奏。」',
      '“The bridge bell sounds on three. Let the other six rest a beat and you can hear the city’s old rhythm.”',
    ],
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
    opening: [
      '这是今天第三次日落。天台的值班人握着八封待寄的信，等着一个永远对不齐的交班时刻。',
      'The sun sets for the third time today. The keeper holds eight undelivered letters, waiting for a change of watch that never comes.',
    ],
    dialogue: [
      '「我怕错过一次洪峰，就把所有灯绑在同一只钟上。现在，请帮我把各地的时刻还给各地。」',
      '“I feared missing a flood, so I bound every lamp to one clock. Help me give each station its own time again.”',
    ],
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
