// Choice IDs are part of the save format. Each choice also has one line to
// bring its consequences back on the player's arrival at the following post.
const spoken = (speaker, zh, en) => ({ speaker, text: [zh, en] });

export const acts = [
  {
    title: ['把人从船上带回来', 'Bring the rowers home'],
    art: 'saga/ferry',
    speaker: ['守渡人苇舟', 'Reed, the ferryman'],
    arrival: [
      '你来烟柳渡接妹妹赤翎。她的马还拴在柳树下，人却上了灰冠的军船。船逆流而上，每喊出一个名字，岸上就有一人丢下家当，走去划桨。',
      'You came to Willow Ferry to meet your sister Kestrel. Her horse is tied to the willow, but she is aboard Ashcrown’s ship. Each time a name rings out, someone on the bank drops their bags and takes an oar.',
    ],
    conversation: [
      spoken("reed", "赤翎把马拴在柳树下，跳上了灰冠的军船。听船底，三长一短。你妹妹小时候喊你开门，也是这么敲的吧？", "Kestrel tied her horse to that willow and jumped aboard Ashcrown’s ship. Listen under the hull. Three long knocks, one short. Is that how your sister used to knock at home?"),
      spoken("reed", "拿着。你娘把这半块虎符交给我的那天，说总有孩子会回来要它。我撑船，你敲回去。", "Take the half seal. Your mother left it with me. Said one of her children would come asking for it. I’ll hold the skiff. Knock back."),
      spoken("kestrel", "我在底下！他们把桨手铐成了一排。你脚边有把锁，船头有枚帅印。你够得着哪一个？", "Down here! The rowers are chained to the same bench. There’s a lock at your feet and an officer’s seal up on the prow. Which can you reach?"),
    ],
    choices: [
      {
        id: 'ferry_child',
        reply: spoken("kestrel", "最后一个桨手也上来了。把手给我！咱们得赶到白汐港，那口钟再响，他们还会被召回船上。", "That’s the last rower aboard. Give me your hand! We need to reach Salt Harbor before the bell calls them back."),
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
        reply: spoken("reed", "桨停了。好，把帅印收好。下游有人问这船归谁管，你就把它亮给他看。", "Oars up all along the ship. Good. Keep that seal handy. If the harbor watch asks who commands this boat, show them."),
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
    conversation: [
      spoken("bow", "听见水底那口钟了吗？每响一次，我的弩手就朝岸上举弩。对面来接班的，是他们的家里人。", "Hear that bell under the buoy? Each time it rings, my bowmen aim at the quay. Those are their families across the water."),
      spoken("bow", "把我的手绑上，绑紧。穿黄布衫的小子是我儿子。上回教他拉弓，他两只手才够着弦。", "Tie my hands. Tighter. That lad in yellow is my son. Last time I taught him to shoot, it took both his hands to draw the string."),
      spoken("kestrel", "退潮了，钟锤露出来了。我守住这根链。你去割弩手的腕索，还是跟我一块儿把锤子卸了？", "Tide’s going out. There’s the hammer. I’ll hold the chain. Can you cut those bowmen loose, or shall we haul the hammer out together?"),
    ],
    choices: [
      {
        id: 'harbor_choir',
        reply: spoken("bow", "绳子都割开了。他认得我了！快去赤铆车场，钟上那道铸缝是我学徒时天天修的。", "The wrist lines are cut. My lad knows me again! Go to Copper Yard. I used to dress a casting seam just like that as an apprentice."),
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
        reply: spoken("kestrel", "替我托住钟锤。瞧这底下，盐一擦就看得清了。赤铆车场。咱们去找铸它的人。", "Hold the hammer steady. Look underneath, where the salt rubbed off. Copper Yard. Let’s find whoever cast it."),
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
    conversation: [
      spoken("flint", "看那列往山上跑的军械车。前面几节装满点名钟，后面那节装的是我们炉上的伙计。", "See the train climbing out of the yard? Muster bells up front. My entire furnace crew is locked in the rear car."),
      spoken("flint", "守卫胸口那片新甲是我打的，左腋少了一颗铆钉。把这锤子拿好。那颗钉子我故意留着。", "I made the guard’s breastplate. One rivet short under the left arm. Here, take my hammer. I kept that rivet for a reason."),
      spoken("flint", "听，他们在敲车门报数。我只扳得动一次岔道。让尾车回站台，还是拿它撞开藏军械图的铁柜？", "Hear them tapping the door? That’s the crew counting heads. I can throw this switch once. Bring the rear car home, or send it through the cabinet with the armor plans?"),
    ],
    choices: [
      {
        id: 'forge_knight',
        reply: spoken("flint", "尾车停稳了！老邱连饭盒都攥在手里。先带他们出车场，我们坐下一趟车去追山上的粮船。", "Rear car’s stopped! Old Qiu still has his lunch tin in his fist. Get them out of the yard. We’ll catch the next train up after the grain ship."),
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
        reply: spoken("kestrel", "军械图到手了。票背上还有一道调令，叫飞骑去悬帆梯田扣粮船。抢在他们前头上山！", "Got the armor plans. There’s another order on the back of the ticket. Riders are heading to Sail Terraces to seize the grain ship. Let’s beat them there!"),
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
    conversation: [
      spoken("reef", "闻见柴火味儿了吗？底下家家都生了火，锅里还全是水。咱们的粮就在头顶那条船上。", "Smell the woodsmoke? Every stove below is lit. All they’ve got to boil is water. Our grain’s on that ship overhead."),
      spoken("reef", "看见最小那堆火了吧？我姑娘说今晚她掌勺。我得给她弄点能下锅的东西。", "See the smallest fire down there? My little girl says she’s cooking supper tonight. I’d like to bring her something she can put in that pot."),
      spoken("kestrel", "风转了！粮舱正好在脚下，舵手的图匣在那头。要我守住舱盖，还是跟你去抢航图？", "Wind’s turning! Grain hatch under our feet, pilot’s chart case up by the wheel. Shall I hold the hatch or come with you for the chart?"),
    ],
    choices: [
      {
        id: 'sail_seed',
        reply: spoken("reef", "接住啦！小丫头拿碗来舀了。咦，这些名牌怎么缝在袋子底下？上头盖的是复写馆的章。", "They’ve got it! There’s my girl with her bowl. What are these name tags doing sewn into the sacks? That’s the archive seal on them."),
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
        reply: spoken("kestrel", "船头转过来了。把图翻过来给我看看……这是我的签名。我可没签过这张纸。走，去复写馆。", "The bow’s coming round. Let me see the back of that chart. That’s my signature. I never signed this sheet. We’re going to the archive."),
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
    conversation: [
      spoken("wren", "这就是征名底册。灰冠每多印一页，就多一船人替他划桨。门外那二十七个人，都是我当年的战友。", "This is the master roll. Every time Ashcrown prints a page, another boatload of people takes his oars. Those twenty-seven guards outside served with me."),
      spoken("wren", "你腰间那半块虎符，我认得。你娘是我连长。她把这份战报折了个角，你们看看她写了什么。", "I know that half seal at your belt. Your mother was my captain. She folded the corner of this dispatch. Here, read what she left you."),
      spoken("mother", "我在镜雪山口给后队留了路。等灰冠胸炉一开，朝炉心打。来换班的弟兄，记得多带几捆麻绳。", "I left a trail for the rearguard at Mirror Pass. When Ashcrown opens his chest furnace, strike the core. Whoever comes to relieve me, bring a few extra coils of rope."),
    ],
    choices: [
      {
        id: 'archive_names',
        reply: spoken("wren", "二十七声到，一个都齐了。你先带他们出去，我知道仓库里那几捆绳搁在哪儿。", "Twenty-seven replies. Every last one accounted for. Lead them out. I know where we put those coils of rope."),
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
        reply: spoken("kestrel", "换炉的时辰我抄好了。印板下还有张运人名单，娘那一栏空着。去镜雪山口，咱们自己找。", "I’ve copied the furnace times. There’s an evacuation list under the plate, too. Mum’s line is blank. Come on, we’ll look for her at Mirror Pass."),
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
    conversation: [
      spoken("kestrel", "先别踩。把耳朵贴在这儿。三长一短……是我的队员，他们还在冰底下！", "Watch your step. Put your ear right here. Three long knocks, one short. That’s my signal. My scouts are still under the ice!"),
      spoken("kestrel", "这圈皮绳是我小时候缠的。娘把刀楔在这里当绳桩，十九年了，底下还有人靠它撑着。", "I wrapped this sword grip when I was a kid. Mum wedged the blade into this crack for an anchor. Nineteen years later it’s still holding someone up."),
      spoken("kestrel", "他们抓住绳了！我拉这头，你接人。要是能换根绳桩，就把娘的刀也带回去，钟城那道锁吃过它的苦头。", "They’ve got the rope! I’ll haul, you catch. If you can rig a fresh anchor, bring Mum’s blade too. She cut the city’s bridge lock with it once."),
    ],
    choices: [
      {
        id: 'pass_echo',
        reply: spoken("kestrel", "全上来了。听听！我们那鼓手冻得拿不住碗，一摸鼓槌，七桥那段接应鼓点还是一拍都没错。", "Everyone’s up. Hear that? Our drummer can barely hold a cup. Put sticks in his hands and he can still play the Seven Bridges signal without missing a beat."),
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
        reply: spoken("kestrel", "把刀给我瞧瞧。嗯，这地方还是缠歪的。当年娘说握着正合手，就这么带上了山。", "Let me see the grip. Still crooked there, where I wound it. Mum said it fit her hand perfectly. Took it up the mountain just like that."),
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
    conversation: [
      spoken("copper", "七座桥都吊着呢。瞧桥头那家伙，它每砸一下锤，吊索就收一圈。再收半圈，我这些齿轮就得崩。", "All seven spans are up. Look at that thing at the winch. Each hammer stroke takes up another turn of cable. Half a turn more and my gears will snap."),
      spoken("copper", "拿稳音叉。第三响它会换手，我就能钻到底下松簧。桥板一落，你带人过，别等我爬出来。", "Hold that fork steady. On the third note it changes hands. I’ll get under the wheel and trip the spring. When the bridge drops, get your people across."),
      spoken("kestrel", "桥落了！头一辆车卡在板缝上，对岸的人已经摸到绞盘了。我举盾护车，还是跟你去抢盘？", "Span’s down! The lead cart’s wedged in a seam. Their men are at the winch already. Want my shield on the cart or my bow at the winch?"),
    ],
    choices: [
      {
        id: 'bell_feast',
        reply: spoken("copper", "军医的马车全过了。瞧，他连缰绳都没解就掉头回来接伤员了。你们赶紧上天台吧！", "There goes the surgeon’s cart. He hasn’t even unhitched the horses and he’s coming back for the wounded. The Orrery’s yours to reach now!"),
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
        reply: spoken("kestrel", "绞盘卡稳了。后队，看我的旗！踩着我们的脚印走，一口气跑上天台！", "The winch is holding. Rearguard, eyes on my flag! Follow our tracks. Straight up to the Orrery!"),
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
    conversation: [
      spoken("kestrel", "你看灰冠脚边那些车。每车一叠征名册，都要喂进他胸前的炉子。那层胸甲打开的时候，就是机会。", "See those carts at Ashcrown’s feet? Each stack of muster rolls goes straight into his chest furnace. We get our opening when those plates part."),
      spoken("kestrel", "娘的战报上还留着手指印，就在这一行。听见他吸气就举盾。等那一下落空，抬头看我的旗。", "Mum left a thumbprint beside this line. Shield up when he draws breath. When his blow misses, look up for my flag."),
      spoken("kestrel", "我的后队还在坡下，铸甲机上剩一片胸甲。你去接人，还是卡住压机？把手势给我，我跟你上。", "My rearguard’s still on the slope. His last chest plate is in the press. Are we bringing them in or jamming those teeth? Give me the sign and I’ll follow you."),
    ],
    choices: [
      {
        id: 'star_girl',
        reply: spoken("kestrel", "人到齐了。把盾举高点……好，旗就插在这儿。等我往下一挥，你带大家冲。", "All here. Lift your shield a little. There, the flag sits nicely on the rim. When I bring it down, lead the charge."),
        label: ['接应赤翎的后队', 'Bring Kestrel’s rearguard through'],
        outcome: [
          '你举盾走回坡口。赤翎最后一个进阵，把红旗插在盾沿。「这下好了。你抬头就看得见。」',
          'You walk back to the ramp with your shield raised. Last through the gap, Kestrel plants her red flag on its rim. “There. Just look up and you’ll see it.”',
        ],
      },
      {
        id: 'star_key',
        reply: spoken("kestrel", "你的半块虎符咬住了压机！他胸口那条缝，已经能看见炉火了。看旗，冲！", "Your half seal’s jammed the press! Look at that gap. The furnace is showing through. On my flag, charge!"),
        label: ['卡住敌军的铸甲机', 'Jam the armor press'],
        outcome: [
          '你把半块虎符塞进齿缝。铸甲机咬住了，灰冠侧过胸口，露出一线橙红的炉光。赤翎的旗子猛地挥下。',
          'You drive your half seal between the teeth of the press. It seizes. Ashcrown turns sideways and a line of furnace light shows. Kestrel drops the flag.',
        ],
      },
    ],
  },
];

export const speakers = Object.fromEntries(
  ['reed', 'bow', 'flint', 'reef', 'wren', 'kestrel', 'copper', 'mother'].map((id, frame) => [
    id,
    { frame, name: id === 'mother' ? ['先锋连长的手令', 'The captain’s dispatch'] : acts[frame].speaker },
  ]),
);

export function portraitPosition(frame) {
  return (frame % 4) * 100 / 3 + '% ' + Math.floor(frame / 4) * 100 + '%';
}

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
