// Choice IDs are part of the save format. Each choice also has one line to
// bring its consequences back on the player's arrival at the following post.
export const acts = [
  {
    title: ['把人从船上带回来', 'Bring the rowers home'],
    art: 'saga/ferry',
    speaker: ['守渡人苇舟', 'Reed, the ferryman'],
    arrival: [
      '你来烟柳渡接妹妹赤翎。她的马还拴在柳树下，人却上了灰冠的军船。船逆流而上，每喊出一个名字，岸上就有一人丢下家当，走去划桨。',
      'You came to Willow Ferry to meet your sister Kestrel. Her horse is tied to the willow, but she is aboard Ashcrown’s ship. Each time a name rings out, someone on the bank drops their bags and takes an oar.',
    ],
    beats: [
      [
        '船底传来三长一短的敲击。小时候偷溜回家，赤翎总这么叫你开门。苇舟把母亲留下的半块虎符塞给你，横过小艇。「回她一声。我撑船。」',
        'Three long knocks, one short. Kestrel used to knock like that when she sneaked home late. Reed slips you the half seal your mother left with him and brings his skiff alongside. “Knock back. I’ll hold her here.”',
      ],
      [
        '赤翎隔着木板说：「舱里还有人。锁在你脚下，盖军令的帅印在船头。你够得着哪个？」',
        '“Got people down here,” Kestrel calls through the planks. “Lock at your feet. Up on the prow there’s a seal they stamp the orders with. Take your pick!”',
      ],
    ],
    choices: [
      {
        id: 'ferry_child',
        label: ['砸开船牢', 'Break open the brig'],
        outcome: [
          '锁掉进水里。赤翎把被铐在一起的桨手一个个推上小艇，最后才把手伸给你。「下游白汐港。那口钟一响，他们还得回船。」',
          'The lock splashes overboard. Kestrel helps each shackled rower into the skiff before she reaches for your hand. “Salt Harbor. If that bell rings again, they’ll walk right back.”',
        ],
        echo: [
          '渡口救下的桨手认得水路，趁落潮把你们送到钟楼脚下。',
          'The rowers you freed know these shoals. They bring you to the bell tower at low tide.',
        ],
      },
      {
        id: 'ferry_decree',
        label: ['夺下帅印，命令停船', 'Seize the seal and halt the ship'],
        outcome: [
          '你在停船令上重重一按。桨手齐刷刷松开了手。赤翎爬上来，袖口还滴着水。「留着这玩意儿。下游还有座水寨要过。」',
          'You stamp the order to halt. Every oar drops at once. Kestrel climbs out, water running from her sleeves. “Hang on to that seal. There’s a harbor gate downstream.”',
        ],
        echo: [
          '水寨的哨兵一见船头那枚帅印，立刻给你们开了闸。',
          'One look at the seal on your prow and the watchman opens the harbor gate.',
        ],
      },
    ],
  },
  {
    title: ['让港口的钟停下来', 'Silence the harbor bell'],
    art: 'region-art/salt_harbor',
    speaker: ['盐港弩长', 'The harbor bow captain'],
    arrival: [
      '港钟响了一下。码头上的弩手同时转身，把弩口对准了来接他们的家人。钟楼空着，声音是从浮标下面传来的。',
      'The bell tolls once. Every bow on the pier swings toward the families waiting to take the watchmen home. The bell tower is empty. The sound rises from beneath a buoy.',
    ],
    beats: [
      [
        '老弩长一脚踩住自己的弩。「拿绳子绑我。等会儿手一松，对面站的是我儿子。」他的靴尖在石板上磨出了一道白印。',
        'The captain plants a boot on his own bow. “Tie me up. That lad across the wharf is my son. Can’t have this thing slipping.” His heel scrapes a white line in the stone.',
      ],
      [
        '浮标忽然抬高，水面下露出钟锤。赤翎已经把绳刀咬在嘴里。一个人够得着弩手的腕索，另一个得守在链边。',
        'The buoy lifts and the hammer breaks the surface. Kestrel holds a rigging knife in her teeth. One of you can reach the bowmen’s wrist lines while the other holds the chain.',
      ],
    ],
    choices: [
      {
        id: 'harbor_choir',
        label: ['割断弩手的腕索', 'Cut the bowmen loose'],
        outcome: [
          '弩长收起弩，把儿子抱得两脚离了地。军械员从水里拖出一截钟链，上面打着赤铆车场的厂记。',
          'The captain slings his bow and hugs his boy clean off the ground. His armorer drags a length of bell chain from the water. It carries the Copper Yard stamp.',
        ],
        echo: [
          '盐港弩长亲自领路。他在车场干过学徒，还记得运煤的小门。',
          'The bow captain leads you through the coal gate. He was an apprentice here once.',
        ],
      },
      {
        id: 'harbor_bell',
        label: ['卸下钟锤', 'Take the hammer off the bell'],
        outcome: [
          '你们把铜锤吊上码头。钟彻底哑了。赤翎拿袖子擦掉锤头的盐，下面露出四个字「赤铆车场」。',
          'You haul the hammer onto the wharf and the bell falls quiet. Kestrel rubs the salt off its head. Stamped underneath are the words COPPER YARD.',
        ],
        echo: [
          '盐港的钟锤还搁在你肩上。一个满脸煤灰的人一眼认出了自己的铸记。',
          'You still have the harbor hammer over your shoulder. A man streaked with soot spots his own casting mark.',
        ],
      },
    ],
  },
  {
    title: ['截住灰冠的军械车', 'Stop the arms train'],
    art: 'saga/forge',
    speaker: ['铁匠铆青', 'Flint, the smith'],
    arrival: [
      '车场的矿车正往山上运一批新钟。轨道两边全是空饭盒，炉工们被赶进了最后一节车厢。灰冠打算给沿路每座城都挂一口点名钟。',
      'Ore cars packed with new bells are heading uphill. Empty lunch tins line the track. The smiths have been locked in the rear car. Ashcrown means to put a muster bell in every town along the road.',
    ],
    beats: [
      [
        '铆青指了指守卫胸前亮闪闪的甲片。「我的手艺。左腋下面少钉了一颗铆钉。」他把锤子递给你，「故意的。」',
        'Flint points at a guard’s polished armor. “My work. Missing a rivet under the left arm.” He hands you his hammer. “On purpose.”',
      ],
      [
        '军械车冒起白汽，炉工正在车门上拍出人数。铆青能替你扳一次岔道。把尾车送回站台，或让军械车撞开存图的铁柜。',
        'Steam curls off the train. The smiths tap their headcount against the door. Flint can throw the switch once. Bring the rear car back to the platform, or ram the cabinet that holds the plans.',
      ],
    ],
    choices: [
      {
        id: 'forge_knight',
        label: ['接回装着炉工的尾车', 'Bring the smiths’ car home'],
        outcome: [
          '尾车撞进煤堆，车门弹开。最年长的炉工拎起空饭盒就跑。「悬帆梯田还有人等粮，快跟我来！」',
          'The rear car hits the coal heap and its doors spring open. The oldest smith grabs his lunch tin. “They’re waiting on grain at the Sail Terraces. Come on!”',
        ],
        echo: [
          '炉工用饭盒敲出船工熟悉的节奏。山脊上的粮船朝你们放下了一根绳。',
          'A smith taps a deckhand’s rhythm on his lunch tin. A rope drops from the grain ship overhead.',
        ],
      },
      {
        id: 'forge_mask',
        label: ['撞开铁柜，抢军械图', 'Ram the cabinet and take the plans'],
        outcome: [
          '铁柜倒地，铺开半屋图纸。你卷起灰冠的胸甲图。车票背面还有一条调令，叫飞骑扣下梯田的粮船。',
          'The cabinet scatters plans across the floor. You roll up the drawing of Ashcrown’s breastplate. An order on the back of a waybill sends riders to seize the terraces’ grain ship.',
        ],
        echo: [
          '照着抢来的调令，你们先一步赶到了粮船换帆的地方。',
          'The order you seized tells you exactly where the grain ship stops to change sails.',
        ],
      },
    ],
  },
  {
    title: ['夺回山上的粮船', 'Take back the grain ship'],
    art: 'region-art/sail_terraces',
    speaker: ['领航员阿帆', 'Reef, the navigator'],
    arrival: [
      '悬帆梯田的人已经生了火，锅里还是清水。满载种粮的帆船就飘在他们头顶，拖船的巨鸢正往敌营转向。',
      'At the Sail Terraces, cooking fires are lit under pots of plain water. The seed ship hangs directly overhead. The kite towing it banks toward the enemy camp.',
    ],
    beats: [
      [
        '领航员把绳子在手腕上绕了两圈。「我姑娘刚学会做饭。她说今晚她掌勺。你看，底下最小那一堆火。」',
        'The navigator loops a line twice around his wrist. “My girl’s just learned to cook. Said supper was on her tonight. See that little fire down there?”',
      ],
      [
        '船头擦着山脊转过来。粮舱的门和舵手的图匣都在手边。底下有人喊：「风要转了，趁现在！」',
        'The bow scrapes past the ridge. The grain hatch and the pilot’s chart case are both within reach. Someone on the ground shouts, “Wind’s turning. Now!”',
      ],
    ],
    choices: [
      {
        id: 'sail_seed',
        label: ['守粮舱，放下第一袋粮', 'Hold the hatch and lower the grain'],
        outcome: [
          '粮袋落地，一个孩子赶紧拿碗去舀。袋底缝着运粮人的名牌，每块都被盖上了复写馆的红印。',
          'The first sack lands and a child runs up with her bowl. The grain carriers’ name tags are sewn into the sacking. Each bears the red archive seal.',
        ],
        echo: [
          '姑娘用装过种粮的布给你包了两个饭团。布角的红印，和馆门上的一模一样。',
          'The navigator’s daughter packs you two rice balls in a scrap of sacking. Its red stamp matches the seal on the archive door.',
        ],
      },
      {
        id: 'sail_chart',
        label: ['登上驾驶台，夺航图', 'Board the wheelhouse and take the chart'],
        outcome: [
          '你推开舵手，把船头扳向谷地。航图背面密密麻麻写满了名字，赤翎一下就认出了自己的笔迹。图是从复写馆送来的。',
          'You shove the pilot aside and bring the bow round toward the valley. Names cover the back of the chart. Kestrel spots her own signature at once. The chart came from the archive.',
        ],
        echo: [
          '拿航图去对门口的调令，连墨水洇开的地方都一样。有人在馆里一张张地印。',
          'You hold the flight chart against the notice on the door. Even the inkblots match. Someone inside has been printing them by the stack.',
        ],
      },
    ],
  },
  {
    title: ['找到第一份征名册', 'Find the first muster roll'],
    art: 'region-art/palimpsest',
    speaker: ['编目员阿简', 'Wren, the archivist'],
    arrival: [
      '复写馆藏着灰冠的底册。每印一页，就有一船人听他号令。守着底册的二十七名老兵，胸牌上刻的都是你母亲那支连队的番号。',
      'Here is the master roll. Every copy printed puts another ship’s worth of people under Ashcrown’s orders. Twenty-seven veterans guard it. Every badge carries the number of your mother’s old company.',
    ],
    beats: [
      [
        '阿简认出了你腰间的半块虎符，把灯挪到一封旧战报下面。「她是我连长。这一页，她折了个角。你们俩看看。」',
        'Wren sees the half seal at your belt and slides a lamp under an old dispatch. “She was my captain. See where she folded the corner? You two should read this.”',
      ],
      [
        '你母亲写道：「我在镜雪山口给后队留了路。灰冠胸口那座炉子一开，铁冠就护不住他。来换班的人，记得多带麻绳。」',
        'Your mother wrote, “I left a trail for the rearguard at Mirror Pass. When the furnace in Ashcrown’s chest opens, you have a clear shot. Whoever comes to relieve me, bring extra rope.”',
      ],
    ],
    choices: [
      {
        id: 'archive_names',
        label: ['按原册给老兵点名', 'Call the veterans by their own names'],
        outcome: [
          '头一个名字才出口，一个白头兵便站得笔直。二十七个人答了二十七声到。阿简收起墨笔，去仓库取绳。',
          'At the first name a white-haired soldier snaps to attention. Twenty-seven names, twenty-seven replies. Wren puts down his pen and goes for the rope.',
        ],
        echo: [
          '你叫回来的老兵摸了摸山口木桩，手比眼睛先认出了老连长留下的绳结。',
          'One of the veterans runs a hand along a trail post. His fingers recognize his captain’s knot before his eyes do.',
        ],
      },
      {
        id: 'archive_pact',
        label: ['取走灰冠的换炉令', 'Take the furnace orders'],
        outcome: [
          '赤翎把换炉的时刻抄在护腕内侧。你掀起印板，底下压着一张去山口运人的名单。母亲那一栏还空着。',
          'Kestrel writes the furnace changeover times inside her bracer. Under the printing plate you find a list of soldiers evacuated from the pass. Your mother’s line is blank.',
        ],
        echo: [
          '按换炉令上的时辰出发，你们在山口守军换岗的空当进了山。',
          'The changeover time in the stolen orders lets you slip into the pass between watches.',
        ],
      },
    ],
  },
  {
    title: ['把雪岭的斥候接下山', 'Bring the scouts off the ridge'],
    art: 'saga/mirror',
    speaker: ['斥候队长赤翎', 'Kestrel, scout captain'],
    arrival: [
      '镜雪山口有十几条一模一样的脚印。雪底传来三长一短。赤翎立刻趴下去，把耳朵贴在冰上。「这回是我的人。还活着。」',
      'A dozen identical sets of tracks cross Mirror Pass. Three long knocks, one short, come from beneath the snow. Kestrel drops to the ice. “My scouts this time. Still alive.”',
    ],
    beats: [
      [
        '一面冰壁里映着母亲当年撤退的背影。她把军刀插进崖缝，把绳头绕在刀柄上。十九年过去，那根绳还绷着。',
        'The ice holds an image of your mother on the retreat. She drives her sword into a crack and loops a rope around the hilt. Nineteen years later the rope is still taut.',
      ],
      [
        '冰下的人已经抓住绳子。赤翎喊道：「我拉左边，你去接人。也可以换个绳桩，把娘的刀带走。钟城的闸锁就是她用这把刀劈开的。」',
        'Hands close around the rope below. “I’ve got this end,” Kestrel says. “Help them out, or rig a new anchor and bring Mum’s sword. She cut the bridge lock with it once.”',
      ],
    ],
    choices: [
      {
        id: 'pass_echo',
        label: ['拉斥候上来', 'Pull the scouts up'],
        outcome: [
          '一个，两个，最后一个背着队里的战鼓。他坐在雪地里缓了口气，手里的鼓槌已经敲出了七桥守军的接应鼓点。',
          'One scout, two, then the drummer with his drum still on his back. He sits in the snow to catch his breath. His hands are already beating the Seven Bridges signal.',
        ],
        echo: [
          '获救的鼓手敲响了接应鼓。隔着河，守城人跟着敲了最后两拍。',
          'The drummer you pulled from the ice beats the signal. Across the river, someone answers with the last two strokes.',
        ],
      },
      {
        id: 'pass_blade',
        label: ['换好绳桩，取回军刀', 'Set a new anchor and take the sword'],
        outcome: [
          '木桩吃住绳劲，军刀顺着崖缝滑进你手里。赤翎拉着斥候们爬上来，看了一眼刀柄。「上面那圈皮，还是我给她缠的。」',
          'The post takes the strain. The sword slides free into your hand. As the scouts climb out, Kestrel glances at the hilt. “I put that leather wrap on.”',
        ],
        echo: [
          '母亲的刀楔进第一道桥锁。赤翎踩着刀背翻过去，从里面开了闩。',
          'Your mother’s blade slips into the first bridge lock. Kestrel steps on its spine, vaults over, and lifts the latch.',
        ],
      },
    ],
  },
  {
    title: ['放下通往天台的七座桥', 'Lower the seven bridges'],
    art: 'region-art/bell_bridges',
    speaker: ['修钟匠阿铜', 'Copper, the bell tender'],
    arrival: [
      '七座桥全吊在半空。桥下挤着出城的车，桥头站着灰冠铸出的钟师，锤子每落一下，吊索就收紧一圈。天台就在对岸。',
      'All seven bridges hang in the air. Carts are jammed along the banks. Ashcrown’s iron Bellfounder stands over the winch. Every fall of his hammer takes up another turn of cable. The Orrery is on the far side.',
    ],
    beats: [
      [
        '修钟匠踮起脚，勉强把音叉塞进你手里。「认准第三响。它拉索，我松簧，桥一落你就走。」他转身钻进了齿轮底下。',
        'The bell tender stands on tiptoe to press a tuning fork into your palm. “Listen for the third stroke. When it pulls the cable, I’ll trip the spring. The instant that bridge drops, go.” He crawls under the gears.',
      ],
      [
        '桥板砸在岸边。头一辆车的轮子卡住了，另一头，敌兵正在拽升桥的铁链。你的人都在等你先迈那一步。',
        'The bridge slams onto the bank. The first cart catches a wheel. On the far side, soldiers haul at the chain to raise the span again. Your company waits for you to move.',
      ],
    ],
    choices: [
      {
        id: 'bell_feast',
        label: ['举盾护送车队', 'Escort the carts under shields'],
        outcome: [
          '你把盾塞到轴下，把车抬过了缝。最后一辆是军医的车。过了桥，他连马都没解就调头来接伤员。',
          'You wedge your shield under the axle and lift the wheel over the gap. The surgeon drives the last cart. Once across, he turns straight back for the wounded.',
        ],
        echo: [
          '桥上那辆军医的车一路跟到天台脚下，伤员刚包扎好就有人接过他们的旗。',
          'The surgeon’s cart follows you to the foot of the Orrery. Fresh hands take the standards while he dresses the wounded.',
        ],
      },
      {
        id: 'bell_duel',
        label: ['冲过桥去夺绞盘', 'Rush the winch across the span'],
        outcome: [
          '你顺着晃动的桥板跑到底，把绞盘卡在最低一格。赤翎一挥旗，后面的队伍踩着你的脚印直奔天台。',
          'You sprint the swaying span and jam the winch in its lowest notch. Kestrel waves her flag. The column follows your tracks straight toward the Orrery.',
        ],
        echo: [
          '你夺下的绞盘还咬在最低一格。最后一队增援跑过七桥，在城坡上追上了你。',
          'The captured winch still holds. The last reinforcements run across Seven Bridges and catch you on the slope.',
        ],
      },
    ],
  },
  {
    title: ['打碎灰冠的征名炉', 'Break Ashcrown’s muster furnace'],
    art: 'region-art/orrery',
    speaker: ['斥候队长赤翎', 'Kestrel, scout captain'],
    arrival: [
      '星门大开，成堆的征名册被推向炉口。灰冠低下龙首，甲片合拢，整座天台随他的呼吸一起一伏。你们一路追来的炉子，就在他胸前。',
      'The star gate swings open. Carts tip their muster rolls into a furnace. Ashcrown lowers his dragon head and closes his armor. The whole observatory rises and falls with his breathing. The furnace is in his chest.',
    ],
    beats: [
      [
        '你摊开母亲留下的战报。赤翎用手指敲了敲那一行。「听见他吸气就举盾。等他那一下落空，你看我旗子。」',
        'You unfold your mother’s dispatch. Kestrel taps the line with one finger. “Shield up when he draws breath. When his blow misses, watch my flag.”',
      ],
      [
        '龙翼刮过石台，后队被隔在坡下。灰冠胸前有片甲还挂在军械架上。你有时间把后队接进来，也来得及让那片甲永远挂在那里。',
        'A sweep of the dragon’s wing cuts off your rearguard. One plate from his chest still hangs on the armory rack. There’s time to bring the rearguard in, or to make sure that plate stays where it is.',
      ],
    ],
    choices: [
      {
        id: 'star_girl',
        label: ['接应赤翎的后队', 'Bring Kestrel’s rearguard through'],
        outcome: [
          '你举盾走回坡口。赤翎最后一个进阵，把红旗插在盾沿。「这下好了。你抬头就看得见。」',
          'You walk back to the ramp with your shield raised. Last through the gap, Kestrel plants her red flag on its rim. “There. Just look up and you’ll see it.”',
        ],
      },
      {
        id: 'star_key',
        label: ['卡住敌军的铸甲机', 'Jam the armor press'],
        outcome: [
          '你把半块虎符塞进齿缝。铸甲机咬住了，灰冠侧过胸口，露出一线橙红的炉光。赤翎的旗子猛地挥下。',
          'You drive your half seal between the teeth of the press. It seizes. Ashcrown turns sideways and a line of furnace light shows. Kestrel drops the flag.',
        ],
      },
    ],
  },
];

export const endings = [
  {
    id: 'shatter_crown', title: ['斩冠凯旋', 'Shatter the crown'],
    text: ['赤翎用刀尖把铁冠从灰里拨出来。你抄起锤子，把它砸成八块。几个月后，你又回来坐苇舟的船。艄公把门闩一抽，说那截铁就是你亲手砸下来的。', 'Kestrel prises the crown out of the ash with her sword. You hammer it into eight pieces. Months later you take Reed’s ferry again. He pulls back the cabin bolt and tells you which piece of iron it used to be.'],
    short: ['你把铁冠放在石阶上，一锤砸扁。灰冠的残兵撤走时，守军已经在替你们修回程的船。', 'You put the crown on a stone step and hammer it flat. As the last enemy soldiers retreat, the watch sets to work repairing your boat home.'],
  },
  {
    id: 'keep_watch', title: ['留下镇守星门', 'Stand watch at the gate'],
    shortTitle: ['留下守第一班岗', 'Take the first watch'],
    text: ['赤翎带大伙儿回家，你带一班人接下星门的岗哨。交班册的最后一栏，母亲的字迹已经很淡了。你紧挨着签下自己的名字，写上今天的日子。', 'Kestrel leads the others home. You take a squad to relieve the watch at the star gate. Your mother’s handwriting has faded on the last page of the duty book. You sign next to her and put down today’s date.'],
    short: ['你把回程的船让给伤员，自己留下值第一班岗。天亮时，赤翎提着早饭来换你。', 'You give the wounded your places on the boat and stay for first watch. At dawn Kestrel comes to relieve you, breakfast in hand.'],
  },
  {
    id: 'wake_towns', title: ['举旗追击残军', 'Raise the flag and give chase'],
    text: ['你发出约好的信号。河灯亮了，山下有人敲钟，七桥上的铁索跟着松开。各站赶来的队伍越过星门，一路拆掉了最后一座征名炉。这回点名，人人都能用自己的名字答到。', 'You give the signal. River lamps flare, a bell rings below, and chains pay out along Seven Bridges. Troops from the posts cross the gate and dismantle the last muster forge. At roll call each soldier answers to their own name.'],
    short: ['你举起沿途收下的信物。守站的盟友从侧路包过来，把追兵堵在河弯。回程的船终于可以放心离岸。', 'You raise the signals gathered along the road. Your allies come down the side trail and cut off the pursuit at the river bend. The homeward boats can leave in peace.'],
  },
];

export function arrivalEcho(view) {
  const previous = view.map?.[view.region_index - 1];
  const mark = view.story_marks?.[previous?.region_id];
  if (!mark) return null;
  const prior = acts[view.region_index - 1]?.choices.find((choice) => choice.id === mark);
  return prior?.echo || null;
}
