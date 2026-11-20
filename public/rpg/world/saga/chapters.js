// The order is the physical order of stations. Saved IDs are also validated by the server.
export const acts = [
  {
    title: ['灵船征名', 'The Black Muster'],
    art: 'ferry',
    speaker: ['渡口刀客苇舟', 'Reed of the Ferry'],
    arrival: [
      '江上驶来一艘逆流的灵船。桅杆挂着三十条腕绳，船头的征名册只剩你的名字还在发光。',
      'A ghost ship rows upstream. Thirty prisoners’ wrist cords hang from its mast. Only your name still burns on the muster roll.',
    ],
    beats: [
      [
        '守渡人把半块虎符拍进你手心。船舷下有人敲了三下，又敲一下。那是你们小时候约好的求救暗号。',
        'The ferryman presses half a command seal into your hand. Three knocks, then one, sound below the hull. You invented that distress call together as children.',
      ],
      [
        '「灰冠把守军的名字刻进铜册。点谁的名，谁就得给他拉船。」苇舟砍断缆绳。「我把船拦一刻。你上！」',
        '“Ashcrown binds soldiers on that roll. When he calls, they row.” Reed cuts the towline. “I can hold her a moment. Board her!”',
      ],
    ],
    choices: [
      [
        'ferry_child',
        '砸开船牢',
        'Break the brig',
        '你一脚踹开舱门。斥候赤翎扶着最后一名俘虏上岸，把一面血红的小旗塞给你：「城弩连，随旗听令！」',
        'You kick the hatch open. Kestrel, the scout captain, carries the last prisoner ashore and hands you a red pennant. “My crossbows answer to that flag.”',
      ],
      [
        'ferry_decree',
        '夺帅印，令全船弃桨',
        'Seize the seal and order the oars down',
        '你踩着橹杆登上船楼，当着船尉的面给自己盖了个「阵亡」。亡兵齐齐弃桨。苇舟笑出了声：「死人当先锋？那更好！」',
        'You vault an oar, seize the seal, and stamp yourself FALLEN. Every dead oarsman ships his oar. Reed laughs. “A dead vanguard? Good luck collecting its pay!”',
      ],
    ],
  },
  {
    title: ['盐港断钟', 'The Drowned Bell'],
    art: 'ferry',
    speaker: ['盐港弩长', 'Captain of the Salt Watch'],
    arrival: [
      '潮水涌进盐仓，城门却紧闭着。敌军把第一口点名钟沉在港底，每响一次，守港弩手便向自己人转过一寸。',
      'The harbor gates are barred against a rising tide. A muster bell on the seabed makes the defenders’ crossbows turn toward their own people, inch by inch.',
    ],
    beats: [
      [
        '老弩长用牙咬住坏指头，把弩臂重新扳回去。「下次钟响，我这只手就要叛变。你决定先救人，还是先夺钟。」',
        'The old captain bites his numb fingers and cranks the bow back. “Next bell, this hand deserts. Save the crew or seize the bell. Your call.”',
      ],
      [
        '潮泵换向只需一拍。白浪露出铜链时，潜卫的头盔和钟锤会同时露出水面。',
        'The pump reverses for a single beat. When white water exposes the chain, the diver’s helm and the bell hammer surface together.',
      ],
    ],
    choices: [
      [
        'harbor_choir',
        '解开弩手腕索',
        'Free the crossbow crews',
        '弩手们一齐把弦转向港外。第一排箭擦过你的肩，准确钉死了敌船的舵。',
        'Freed hands swing the bows seaward. A volley grazes your shoulder on its way to pin the enemy rudder.',
      ],
      [
        'harbor_bell',
        '抢钟锤截断号令',
        'Capture the bell hammer',
        '你卸下铜锤。来援的敌船还在按旧钟声转舵，结结实实地撞上了自己的锁链。',
        'You wrench the hammer free. Following the old cadence, the relief galley turns straight into its own chain.',
      ],
    ],
  },
  {
    title: ['熔炉诈降', 'False Surrender'],
    art: 'forge',
    speaker: ['铁匠铆青', 'Flint the Smith'],
    arrival: [
      '车场挂出了降旗。受降官给每个俘虏发了一枚金币，铆青把他的金币按在炉边，金皮下露出一只窃听的铜虫。',
      'Surrender flags hang over the yard. Each prisoner has been given a gold coin. Flint heats his at the forge. A listening beetle crawls from its gilding.',
    ],
    beats: [
      [
        '铆青冲铜虫大声说：「左翼全是醉鬼，今夜集体睡懒觉。」他用炭条在你袖上写了三个字：打、中、军。',
        'Flint shouts into the beetle: “Left flank drunk. Sleeping late.” On your sleeve he writes: HIT THEIR CENTER.',
      ],
      [
        '铆翼炉龙合翼时，热铆缝能被战技扎穿。铆青提着锤往前走：「被他们打了三天铁，今天换我收工钱。」',
        'The drake’s folded wings expose hot rivets to a burst. Flint hefts his hammer. “Three days forging their armor. Time to collect my fee.”',
      ],
    ],
    choices: [
      [
        'forge_knight',
        '放出矿车营救炉工',
        'Roll the ore cars to extract the smiths',
        '炉工们跳上矿车冲出火场。傍晚，新铸的臂盾在你的阵前排成一线。',
        'Smiths ride the ore cars out of the fire. By dusk a rank of newly forged shields stands before your column.',
      ],
      [
        'forge_mask',
        '假传调令，夺攻城图',
        'Spoof the order and steal siege plans',
        '铆青学受降官的嗓子学得太像，连自己人也立了正。图上标红的地方，正是灰冠胸炉的装甲接缝。',
        'Flint mimics the magistrate so well your own troops salute. The stolen drawing marks a seam across Ashcrown’s chest furnace.',
      ],
    ],
  },
  {
    title: ['风帆斩索', 'Raid Above the Terraces'],
    art: 'forge',
    speaker: ['飞骑领航员', 'Sky Cavalry Navigator'],
    arrival: [
      '龙翼拖着满载种粮的飞船压过山脊，梯田下的村庄只剩一夜口粮。船上挂起了请求登舰的红旗。',
      'A winged raider hauls the seed ship over the ridge. The villages have food for one more night. A red boarding pennant rises from the captive ship.',
    ],
    beats: [
      [
        '领航员把最后一副翼装递过来。「跳早了落敌舰，跳晚了落敌舰厨房。都是敌舰，别挑。」',
        'The navigator hands over the last glider. “Jump early, you hit the deck. Jump late, you hit the galley. Both belong to the enemy.”',
      ],
      [
        '山风把桅杆压弯，你从主帆滑落，正好踩断敌旗。船上第一声欢呼，比弩炮还响。',
        'The mast bows under the wind. You slide down the mainsail and land on the enemy standard. The cheer from the deck drowns out the ballista.',
      ],
    ],
    choices: [
      [
        'sail_seed',
        '守住粮舱',
        'Hold the grain deck',
        '粮船顺风落进河谷。村民把空粮车改成担架，沿路接走了断后的伤兵。',
        'The ship lands in the valley. Villagers turn grain carts into stretchers and carry the rearguard home.',
      ],
      [
        'sail_chart',
        '夺取敌军航图',
        'Capture the enemy flight chart',
        '敌军为躲山风标出了所有背风口。你的飞骑在图上圈出一条直通天台背后的航线。',
        'Every sheltered approach is marked on the chart. Your riders circle a route straight behind the observatory.',
      ],
    ],
  },
  {
    title: ['没有名字的连队', 'The Unnamed Company'],
    art: 'mirror',
    speaker: ['档案守门人', 'Keeper of the War Archive'],
    arrival: [
      '复写馆的荣誉墙上，所有战死者都被写成了同一个名字：灰冠。地窖里，一支失踪十九年的连队仍在站岗。',
      'Every name on the archive’s wall of honor has been replaced with Ashcrown’s. Below it a company missing for nineteen years still stands watch.',
    ],
    beats: [
      [
        '老兵摸到你手里的半块虎符，突然敬礼。十九年前，你母亲率这支连队封住星门。她的战报一直夹在投降书里。',
        'A veteran touches your half seal and salutes. Nineteen years ago your mother led this company into the star gate. Her dispatch was hidden inside the surrender papers.',
      ],
      [
        '战报最后一行写着：「铁冠可以再铸。先毁胸炉，再碎冠。我的位置由活人接。」纸角钉着半枚熔穿的箭头。',
        'The last line reads: “A crown can be reforged. Break the furnace first, then the crown. A living soldier takes my post.” A half-melted arrowhead pins the corner.',
      ],
    ],
    choices: [
      [
        'archive_names',
        '给连队恢复军籍',
        'Restore the company roll',
        '你按原册逐一点名。十九年前失踪的第一连，今天答到二十七人。',
        'You call the original roll. After nineteen years, twenty-seven voices answer for First Company.',
      ],
      [
        'archive_pact',
        '撕下敌方铸冠密令',
        'Seize the crown-forging order',
        '你从密令中找到了换炉的时辰。军需官将它抄给每一支准备突击的分队。',
        'The order gives the hour of furnace change. The quartermaster copies it for every assault unit.',
      ],
    ],
  },
  {
    title: ['雪岭留锋', 'The Blade in the Pass'],
    art: 'mirror',
    speaker: ['雪岭斥候', 'Ridge Scout'],
    arrival: [
      '镜壁映出一队走散的士兵。领头的人披着你母亲的红披风。她一遍遍走向裂隙，把追兵引离还活着的人。',
      'A lost company marches in the ice. Its leader wears your mother’s red cloak. Her echo still leads the pursuit away from the living.',
    ],
    beats: [
      [
        '崖侧有两排鞋钉印，一排深一排浅。深的还在渗水。这一次，有活人被困在雪下面。',
        'Two sets of bootprints cross the cliff. Meltwater seeps into the deeper ones. This time there are living soldiers under the snow.',
      ],
      [
        '赤翎把绳子绕过你的肩。「你来选。给人拉一把，或把那把能开城门的剑拔出来。我守绳。」',
        'Kestrel slings a rope over your shoulder. “Your call. Pull the soldiers out, or take the blade that opens the gate. I hold the rope.”',
      ],
    ],
    choices: [
      [
        'pass_echo',
        '从冰崩里拖出斥候营',
        'Haul the scouts out of the avalanche',
        '最后一名斥候出洞时背着战鼓。进攻号响前，你的队伍多了一面能穿过暴风雪的鼓。',
        'The last scout carries a drum. When the attack begins, its beat will reach through the blizzard.',
      ],
      [
        'pass_blade',
        '拔出破门刃',
        'Draw the gatebreaker',
        '刀刃离冰，镜中那道披风终于停下。你接住了它，沿山脊向真正的城门前进。',
        'The blade comes free. The reflected cloak finally stops marching. You shoulder it and turn toward the real gate.',
      ],
    ],
  },
  {
    title: ['七桥总攻', 'The Seven-Bridge Offensive'],
    art: 'orrery',
    speaker: ['七桥守将', 'Marshal of Seven Bridges'],
    arrival: [
      '七座桥在午夜同时升起。留给平民的撤离通道，只够一辆车通过。对岸的龙骑正在重整方阵。',
      'Seven bridges rise at midnight. Just one cart fits through the civilian corridor. Across the river the dragoons form up again.',
    ],
    beats: [
      [
        '铸钟师把三只钟锤摆在桥中央：「两响落桥，第三响总攻。谁替我敲第三下？」你从他手里接过最重的锤。',
        'The bellfounder sets out three hammers. “Two strokes lower the bridge. The third starts the assault. Who strikes three?” You take the heaviest hammer.',
      ],
      [
        '第一响落下，车队开始动。第二响落下，两岸举起红旗。第三响之前，你还有一次调兵的机会。',
        'One stroke, the carts roll. Two, red flags rise on both banks. Before the third you can still move one division.',
      ],
    ],
    choices: [
      [
        'bell_feast',
        '以盾墙护送车队',
        'Form a shield wall for the convoy',
        '最后一辆车过桥，炊事兵把整锅热汤扛回阵地。伤员能端起碗了。',
        'As the last cart crosses, the cooks haul their kettle back to the line. The wounded sit up to eat.',
      ],
      [
        'bell_duel',
        '率尖兵反夺吊桥',
        'Lead the countercharge on the drawbridge',
        '你带头撞上第一列长盾，后队从缺口涌入。第三响落下时，天台的城门已经开了一半。',
        'You hit the first shield rank; your column pours through the breach. At the third stroke, the observatory gate is already halfway open.',
      ],
    ],
  },
  {
    title: ['破晓攻城战', 'Assault at Daybreak'],
    art: 'orrery',
    speaker: ['前锋统领赤翎', 'Vanguard Captain Kestrel'],
    arrival: [
      '黎明迟了整整一刻。灰冠现出龙身，把整座观测台扣在胸口当护甲。城下八面军旗同时转向你。',
      'Dawn is a quarter hour late. Ashcrown sheds his human shape and locks the observatory around his chest as armor. Eight standards turn toward you.',
    ],
    beats: [
      [
        '灰冠把断旗掷进阵前：「谁担得起这八座城？」你把旗杆重新钉进石台。身后八个方向都有人应声。',
        'Ashcrown hurls a broken standard before the line. “Who carries eight cities?” You drive its shaft back into the stone. Voices answer from every side.',
      ],
      [
        '赤翎念出战报：「他蓄势，格挡破甲。他露出胸炉，全队出击。」你扣好最后一道护臂。天光压上城垛。',
        'Kestrel reads your orders: “Guard through his charge. When the furnace opens, every unit strikes.” You fasten your last bracer. Dawn reaches the battlements.',
      ],
    ],
    choices: [
      [
        'star_girl',
        '接应断后的赤翎',
        'Extract Kestrel’s rearguard',
        '赤翎率最后一队弩手冲进护阵。全营高喊她的番号，你们一起踏上攻城坡道。',
        'Kestrel’s final squad dives into the shield ring. The ranks shout her unit number. Together you mount the siege ramp.',
      ],
      [
        'star_key',
        '突袭敌方军械台',
        'Raid the enemy armory',
        '你用半块虎符卡住铸冠机，敌军的备用铠甲全锁死在架上。进攻号响了。',
        'You jam the crown forge with your half seal. Every spare suit of armor locks to its rack. The assault horn sounds.',
      ],
    ],
  },
];

export const endings = [
  {
    id: 'shatter_crown',
    title: ['斩冠凯旋', 'Smash the crown'],
    text: [
      '龙将倒下。你一锤砸碎铁冠，令八城将碎铁熔进城门的门闩。从此每一次开门，都由城里的人自己决定。',
      'The warlord falls. You smash the crown and order its iron forged into eight gate bolts. Henceforth the people inside each city decide when it opens.',
    ],
  },
  {
    id: 'keep_watch',
    title: ['留守星门', 'Hold the star gate'],
    text: [
      '你把得胜旗交给赤翎，率亲卫驻守裂隙。第一夜的点名在晨光中结束。远方响起八城的换岗号，终于轮到你母亲那班人休息。',
      'You entrust the victory standard to Kestrel and garrison the rift. Your first roll call ends at dawn. Eight cities sound the relief. At last your mother’s watch is over.',
    ],
  },
  {
    id: 'wake_towns',
    title: ['八城反攻', 'Lead the allied counteroffensive'],
    text: [
      '你举起驿站的信物。援军沿着亲手修好的烽线越过星门，拆掉敌境最后一座征名炉。归来那天，军籍上每个人都保留着自己的名字。',
      'You raise the station signals. The allies advance along the beacon line you repaired and storm the last muster forge beyond the gate. Every returning soldier still carries their own name.',
    ],
  },
];
