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

各区配乐与确认、调节、警戒、修复提示音由本项目使用 Web Audio 合成。作品资料与关卡引擎分开维护；替换地图后可调整 atlas.js 的地标位置以及 weather.js 的主光源。
