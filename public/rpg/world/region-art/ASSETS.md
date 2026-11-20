# 灯路世界美术

标题、舆图、八幅风景和八名驿站居民头像由本项目使用内建 ImageGen 生成，经人工检查布局、分格裁切并转为本地 WebP。游戏运行时直接读取位图。地图坐标由最终图中的地标位置校正。

| 成品 | 绘制指令摘要和加工 |
| --- | --- |
| title.webp | 一幅横构图的像素 RPG 封面，送信人在右侧举起灯笼，临水山城和远方天台迎接日出；左侧树荫留给游戏标题 |
| atlas.webp | 八地属于同一片俯视大陆，绘出渡口、盐港、炉场、梯田、档案馆、冰谷、钟城和天台。地点名、序号和按钮由游戏叠加 |
| willow_ferry.webp、salt_harbor.webp、copper_yard.webp、sail_terraces.webp、palimpsest.webp、mirror_pass.webp、bell_bridges.webp、orrery.webp | 二列四行的同风格地图集。依次绘制晨辉渡桥、灯塔盐田、熔炉、梯田风车、浸水馆阁、冰谷索桥、钟塔群和日轨仪；裁为八幅 768 × 256 图 |
| keepers.webp | 四列两行的人物图集，依次为守渡人、读潮员、扳道工、风袋师、编目员、测绘员、修钟匠和守台人。按头肩裁成八个 144 像素方格，横向合并 |
| couriers.png | 三个职业的地图行走图，取自 Pixel-Boy 和 AAA 的 Ninja Adventure 开源图集朝右三帧，16 像素一格。具体来源和 CC0 许可见下方 |

角色素材固定至上游提交 6ac78232d5aedcc85ce5f27d060ea92366f7c24a。[蓝衣忍者](https://github.com/pixel-boy/NinjaAdventure/blob/6ac78232d5aedcc85ce5f27d060ea92366f7c24a/content/character/ninja_blue/sprite.png) | [蓝衣武士](https://github.com/pixel-boy/NinjaAdventure/blob/6ac78232d5aedcc85ce5f27d060ea92366f7c24a/content/character/samurai_blue/sprite.png) | [绿衣武士](https://github.com/pixel-boy/NinjaAdventure/blob/6ac78232d5aedcc85ce5f27d060ea92366f7c24a/content/character/samurai_green/samurai_green.png) | [CC0 随附全文](../../battle/art/CC0-1.0.txt)

## 可步行场景

| 文件 | 来源与制作 |
| --- | --- |
| walkers.png | 从上方 Ninja Adventure 的三个职业行走原图裁出正面、背面、左侧、右侧，每个朝向保留站姿与两帧行走。图集横向四个朝向，纵向按职业各排三帧。原素材采用 CC0。 |
| village-tiles.png | Pixel-Boy 和 AAA 的 CC0 村落图集，场景内的住宅按地区调色。下载的版本固定至角色图集使用的同一提交。[原图](https://github.com/pixel-boy/NinjaAdventure/blob/6ac78232d5aedcc85ce5f27d060ea92366f7c24a/content/map/tileset_village_abandoned.png) |
| stations.webp | 项目内建 ImageGen，透明背景三分之四俯视。为八个地区绘制渡口木楼、港口灯塔、工场、谷仓风车、档案馆、雪地木屋、钟楼和星轨天台。裁边、统一脚点并缩成八幅横排 112 像素方格。 |
| field-props.webp | 项目内建 ImageGen，透明背景俯视像素道具。柳树、樱树、雪松、枫树、市集摊位、喷泉、水井、木车、芦苇、花丛、鱼篓、花藤拱门共十二种，四列三行，每格 80 像素。 |
| field-keepers.webp | 项目内建 ImageGen，绘制八名村民的三分之四朝南全身像，分别搭配绳索、海员帽、锻工围裙、花篮、书卷、雪镜、黄铜钥匙、星纹头饰。将人物按脚点对齐，每格 64 像素。 |
| ghost-ship.webp | 项目内建 ImageGen，根据渡口剧情绘制幽灵船、红灯、木制船身和鬼火，整理为独立透明像素精灵，绘制时随水面起伏。 |
| war-posts.webp | 项目内建 ImageGen，断旗瞭望塔、先锋军帐篷、裂隙水晶，三幅 96 像素方格。营帐会随第一站救援抉择出现在渡口。 |

游玩时由场景绘制器将透明精灵按脚点纵坐标排序。每个地区有 112 × 72 格可探索范围，两道水系和五座桥。overland-map.js 生成道路、碰撞、场景出口和依次轮换的四组遭遇位置。overland-districts.js 列出八个地区的 24 处可调查地标，包含坐标、中英文地名和玩家可以发现的线索。

外区建筑沿用本目录的驿站、道具与哨塔图集。盐田、货轨、石板院、裂冰等地表和地标上的灯火、水轮、星轨由 overland-art.js 在 Canvas 上绘制，使用相应地区的调色板。各区配乐与确认、调节、警戒、修复提示音由本项目使用 Web Audio 合成。
