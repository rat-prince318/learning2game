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

英雄朝右、敌人朝左。保持 PNG 透明通道和图内脚部留白，CSS 会以木桥为共同落脚点。更换角色时保留这些边界，并在窄屏和宽屏检查角色完整显示。法师、游侠和先锋的职业技分别增加坠星、箭雨和交叉剑光。

舞台用 CSS 显示场景，Canvas 绘制短促粒子、剑光和飞行弹道，Web Audio 的独立声部合成挥击上扬音、命中低音与高频撞击。音频跟随静音设置，素材均从本站加载。减弱动态后保留静态数字和文字。战斗系统可以跳过整个表演并直接接受服务器回执。

参考作者 Godot 示例中收到伤害后依次调度闪白、震动和粒子的结构，以及六层打击反馈视频中的拆解。网页端根据服务器给出的命中、伤害、格挡、破势分别演出。视频仅用于观察动作节奏。[Godot ActorSprite](https://github.com/pixel-boy/NinjaAdventure/blob/6ac78232d5aedcc85ce5f27d060ea92366f7c24a/system/character/actor_sprite.gd)　[战斗参考视频](https://www.bilibili.com/video/BV1kvWg6aEdP)
