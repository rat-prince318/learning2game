import { chapters } from './chapter-plans.js';

const ferryLandmarks = [[20, 57], [93, 14], [95, 53]];

// The three branches of each trail use a different landmark and a local clue.
const districts = [
  [
    ['wheel', '旧水车房', 'Old mill', '水轮空转了好几圈，最后吐出一截断缆。缆头还滴着水，渡船应该离岸没多久。', 'The wheel turns twice and spits out a length of wet line. The ferry left in a hurry.'],
    ['beacon', '乌篷哨楼', 'Boatmen’s lookout', '哨窗正对北桥。窗台上的碗还有余温，守桥的人刚换过班。', 'The window overlooks the north bridge. The bowl on the sill is still warm. The guards just changed shifts.'],
    ['wharf', '芦荡卸货场', 'Reed wharf', '芦席下面压着一张货单。二十箱箭簇，全送往东岸。', 'A bill of lading sticks out from under a reed mat. Twenty crates of arrowheads, all bound for the eastern bank.'],
  ],
  [
    ['salt', '结晶池', 'Salt pans', '盐面上留着两行脚印，一深一浅。挑盐的人在池边卸了担，空着手跑回港口。', 'One trail of footprints sinks deep into the salt. The much lighter return trail heads for the harbor. Someone left their load here.'],
    ['beacon', '鱼骨灯塔', 'Fishbone light', '灯罩朝内转了半圈。站上台阶才看得见，发给船队的灯号全照在了岸上。', 'From the stairs you can see the trouble. Someone turned the lamp inland. The ships offshore are sailing blind.'],
    ['wharf', '搁浅船坞', 'Dry dock', '几条新凿痕从船腹一直划到龙骨。有人趁退潮偷走了舵。', 'Fresh chisel marks run from the belly of the ship to its keel. Someone took the rudder at low tide.'],
  ],
  [
    ['rail', '换轨场', 'Switchyard', '扳手还卡在道岔上。工人来得及把载满人的矿车扳回支线，自己却只留下半只手套。', 'A wrench is wedged in the switch. The crew diverted the crowded cart in time. Half a glove is still caught under the handle.'],
    ['kiln', '三号熔炉', 'Kiln Three', '炉膛已经冷了。你敲了三下炉壁，远处的管道里传回三下敲击。', 'The furnace is cold. You tap its shell three times. Three knocks come back through a distant pipe.'],
    ['rail', '废车编组台', 'Freight sidings', '空车全挤在上坡那条轨上。松开最前面的刹车，它们就会冲向东岗。', 'The empty wagons have been coupled on the uphill track. Release the lead brake and the whole string will roll toward the east post.'],
  ],
  [
    ['terrace', '背风苗圃', 'Sheltered nursery', '篱笆豁开一道口。几排秧苗全往一侧倒，昨夜有人拖着重帆从这里上山。', 'There is a gap in the fence. The seedlings lean uphill where someone dragged a heavy sail through them last night.'],
    ['wheel', '高坡风磨', 'Highland windmill', '磨盘停着，风叶却转得飞快。农人拆了传动轴，用它顶住通往谷仓的大门。', 'The sails spin above a silent millstone. The farmers pulled the drive shaft out and used it to bar the granary.'],
    ['terrace', '晒谷坪', 'Threshing terraces', '谷垛中间让出一条窄道，刚好够一副担架通过。村里人一直在从前线接伤员。', 'A gap runs through the grain stacks, just wide enough for a stretcher. The villagers have been bringing people back from the front.'],
  ],
  [
    ['press', '晒纸院', 'Papermakers’ court', '纸帘被风掀起。最下面一张还印着半枚军印，墨水顺着帘角往下淌。', 'A drying sheet lifts in the wind. Half a military seal shows on the page beneath, its ink still running.'],
    ['ring', '抄图回廊', 'Map gallery', '旧地图被钉反了。你掀起一角，纸背上密密麻麻写的都是撤离的人名。', 'The old map hangs backward. You lift a corner and find the names of the evacuees covering its back.'],
    ['press', '藏版库', 'Plate vault', '架上留下一个方形的灰印。带走母版的人抱得太急，连垫在底下的油纸都扯破了。', 'A clean rectangle stands out in the dust. Whoever took the master plate tore its oilcloth wrapper in their haste.'],
  ],
  [
    ['cairn', '雪崩避难棚', 'Avalanche shelter', '炉边摆着六双靴子，门口有七串脚印。最后一个人光着脚进了风雪。', 'Six pairs of boots stand by the stove. Seven sets of tracks leave the hut. The last person went out barefoot.'],
    ['beacon', '冰脊烽台', 'Ice ridge beacon', '积雪下面藏着干柴。巡山队把引火绳一直牵到避风的石头后面。', 'Dry kindling lies under the snow. The surveyors ran the fuse behind a sheltering rock so they could light it in a gale.'],
    ['cairn', '蓝冰裂谷', 'Blue ice cleft', '扁石底下压着一根旧绳。轻轻一拉，对面山壁上的铜铃响了。', 'An old rope runs under a flat stone. One tug sets a brass bell ringing on the far wall of the cleft.'],
  ],
  [
    ['kiln', '铸铃坊', 'Bell foundry', '地上滚着一只碎钟舌。断口刚磨过，铁屑还粘在油布上。', 'A broken clapper lies on the paving. Someone filed the break smooth. Iron filings still cling to the oilcloth.'],
    ['beacon', '夜巡钟塔', 'Watch bell tower', '塔顶的拉绳系在一把长凳上。值夜人想小睡一会儿，长凳却已经被拖到窗边。', 'The night watch tied the bell rope to a bench for a quick nap. The bench has been dragged all the way to the window.'],
    ['wharf', '吊桥机房', 'Drawbridge works', '绞盘上有一道新画的白线。把线对准桥墩，船桅就能擦着桥底过去。', 'A fresh white line crosses the winch. Line it up with the pier and a mast will just clear the bridge.'],
  ],
  [
    ['ring', '月影测场', 'Moonshadow court', '地上一长一短两道影子交错。你蹲下才看清，短的那道来自北面倒折的指针。', 'Two shadows cross the paving. From a crouch you can see the shorter one comes from a bent pointer on the north rim.'],
    ['cairn', '坠星台', 'Starfall platform', '坑底的黑玻璃还是温的。碎片上映着天台的金光，东面那一圈转得尤其快。', 'Black glass at the bottom of the crater is still warm. In its reflection, the eastern ring above the observatory spins fastest.'],
    ['ring', '定日环阵', 'Heliostat court', '八枚铜钉里只有一枚磨得发亮。守台人一直站在这里，盯着龙将盘踞的高台。', 'One of the eight brass studs is polished by boots. The keeper stood here, watching the high platform where Ashcrown waits.'],
  ],
];

export function landmarksFor(region) {
  const positions = region === 0 ? ferryLandmarks : chapters[region].landmarks;
  return districts[region].map(([motif, zh, en, zhDetail, enDetail], i) => ({
    key: ['south-yard', 'north-post', 'east-court'][i],
    col: positions[i][0], row: positions[i][1], motif, name: [zh, en], description: [zhDetail, enDetail],
  }));
}
