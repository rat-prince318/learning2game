# 烟柳渡战场美术与音效

## 像素图的来源

上游作品为 Pixel-Boy 和 AAA 制作的 **Ninja Adventure Asset Pack**。作者在发布页“License”中明确将包内美术以 CC0 1.0 发布。此处随附 [CC0 1.0 全文](CC0-1.0.txt)。[作者发布页](https://pixel-boy.itch.io/ninja-adventure-asset-pack)　[许可证原文](https://creativecommons.org/publicdomain/zero/1.0/)

下表链接固定到实际采用的上游提交 `6ac78232d5aedcc85ce5f27d060ea92366f7c24a`。所有游戏所需的位图随本仓库提供。

| 本地 PNG | 原作与加工 |
| --- | --- |
| `hero-arcanist.png` | 截取原图第一行第四格的朝右角色，按最邻近方式放大，绘制星纹斗篷、琥珀枝杖和光芯。[原图 ninja_blue](https://github.com/pixel-boy/NinjaAdventure/blob/6ac78232d5aedcc85ce5f27d060ea92366f7c24a/content/character/ninja_blue/sprite.png) |
| `hero-vanguard.png` | 截取朝右待机姿势，绘制剑身、高光与护手。[原图 samurai_blue](https://github.com/pixel-boy/NinjaAdventure/blob/6ac78232d5aedcc85ce5f27d060ea92366f7c24a/content/character/samurai_blue/sprite.png) |
| `hero-ranger.png` | 截取朝右待机姿势，追加披风、弓身和弓弦。[原图 samurai_green](https://github.com/pixel-boy/NinjaAdventure/blob/6ac78232d5aedcc85ce5f27d060ea92366f7c24a/content/character/samurai_green/samurai_green.png) |
| `willow-ferry.png` | 右岸的小屋截自废村图集的 64×64 区域，按山林倒影重新配色。画面的柳树、山脊、太阳、水闸、飞鸟、江面与木栈桥均为本次绘制。[原图 abandoned village](https://github.com/pixel-boy/NinjaAdventure/blob/6ac78232d5aedcc85ce5f27d060ea92366f7c24a/content/map/tileset_village_abandoned.png) |
| `willow-keeper.png` | 本次绘制的柳根闸主。以水闸飞轮作为背甲，枝冠遮住面具，下方根须支撑躯体，胸口是青色闸芯。 |
| `foe-sprout.png`、`foe-moth.png`、`foe-golem.png`、`foe-warden.png` | 本次绘制的四种可复用敌方立绘，对应后端 `battle.enemy.sprite`。 |
| `campfire.png` | 本次绘制的营地篷布、床卷、火堆。用于战败后学习支线。 |

## 动效和声音

战斗分帧图集的尺寸、脚部对齐方式和角色来源见[角色姿势说明](POSES.md)。指令栏的像素肖像、战技徽章和许可见[界面素材说明](../ui/ASSETS.md)。柳条、碎波、远鸟、乌篷船、船影及炉火的动景由本项目在原画坐标上绘制。天气和时间色彩从同一张渡口原图映射，保留灯笼、木桥、水和天空各自的色调。

英雄朝右、敌人朝左。保持 PNG 透明通道和图内脚部留白，CSS 会以木桥为共同落脚点。更换角色时保留这些边界，并在窄屏和宽屏检查角色完整显示。术士从倾斜星仪引下陨星，游侠拉开反曲弓射出贯穿箭，先锋踏步追近目标后挥出交错剑弧。

舞台用 CSS 显示场景。角色后方的 Canvas 绘制桥面和江面反光，前景 Canvas 绘制星仪、弹道、铜闸碎片与水浪。这些招式在本项目内逐帧绘制。Web Audio 合成法杖的高低声部、弓弦声、刀风与破势时的金属余音，默认静音。简化动效保留静态数字和文字。时间线、文件入口和回放方法见[战场交接手册](../../../../docs/rpg-battle-frontend.md)。

参考作者 Godot 示例中收到伤害后依次调度闪白、震动和粒子的结构，以及六层打击反馈视频中的拆解。网页端根据服务器给出的命中、伤害、格挡、破势分别演出。视频仅用于观察动作节奏。[Godot ActorSprite](https://github.com/pixel-boy/NinjaAdventure/blob/6ac78232d5aedcc85ce5f27d060ea92366f7c24a/system/character/actor_sprite.gd)　[战斗参考视频](https://www.bilibili.com/video/BV1kvWg6aEdP)
