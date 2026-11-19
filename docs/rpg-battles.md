# RPG 战役后端

同一份讲义生成并确认 RPG 关卡后，可以用 game_id 开一场战役。一场战役沿原方案的章节推进，玩家通过本章题目攻击敌人，失败后进入围绕失误知识点的补给支线，再挑战同一关。最后一个场景是首领战。

## 从已有游戏开局

按[现有资料与关卡契约](rpg-contract.md)完成上传、确认和生成。战斗直接读取已发布的关卡、题目和知识来源，行动判定在本地服务端完成。已保存的在线关卡也可以直接开战。系统能力接口 `GET /health` 的 `rpg_play_modes` 返回支持创建的 RPG 游玩方式。

| 方法与路径 | 用途 |
| --- | --- |
| GET /rpg/battle-catalog | 读取职业、初始行装、装备属性和等级经验表，可在选角色时调用。 |
| POST /rpg/games/{game_id}/battles | 201，返回第一关战况。可省略请求体，也可以指定 hero_class、kit 和用来安全重试的 request_id。 |
| GET /rpg/battles/{session_id} | 读取当前战况，含正在作答的题目、可用选项和最近一次事件。 |
| POST /rpg/battles/{session_id}/actions | 提交一次操作，200 返回服务器确认后的战况。 |
| GET /rpg/battles/{session_id}/report | 读取通关或撤离时保存的报告。战役进行中返回 409。 |

开局时重复提交同一个 game_id 和 request_id 会回到同一场战役的**最新状态**。重新游玩时使用新的 request_id。每个动作都带 event_id 和 expected_revision。相同事件、相同内容的重试会得到首次执行的**原始回包**，其中 revision 可能早于最新战况。同一个 event_id 改传其他内容、或用旧的版本号提交新动作，都返回 409。客户端可随时重新读取当前战况。请求例子如下，ID 和版本取自上一条服务端响应。

```json
{"action":"answer","event_id":"input-004","expected_revision":3,"prompt_id":"<当前题目标识>","option_id":"<所选选项标识>"}
```

| action | 额外字段 | 含义 |
| --- | --- | --- |
| answer | prompt_id、option_id，可选 skill | 回答本回合的题。普通攻击为 strike（默认），职业蓄力技为 burst。支线题使用默认值。 |
| hint | prompt_id | 领取当前题目的提示。 |
| equip | item_id | 穿戴已经获得的装备。物品的 slot 决定更换哪个部位，其余部位保留。 |
| next_stage | 无 | 击败守关敌人后进入下一章。 |
| retreat | 无 | 主动结束本轮并保存当前学习记录。 |

## 选角色与行装

开局可发送 `{"hero_class":"vanguard","kit":"ward","request_id":"team-demo-01"}`。省略职业和行装时使用星纹术士与巡途行装。重试时可以只传原 request_id；同一编号显式改选职业或行装会收到 409。

| 职业 | 武器 | 初始选择会怎样改变战斗 |
| --- | --- | --- |
| 星纹术士 arcanist | 法杖 | 两格蓄力，坠星术按 210% 威力结算。三职业中单次蓄力倍率最高。 |
| 誓盾先锋 vanguard | 剑 | 生命和防御成长最快，可以多承受几次判断失误。三格蓄力释放 185% 威力的破阵斩。 |
| 岚弓游侠 ranger | 弓 | 一次普通命中就能准备 145% 威力的穿云箭。巡途行装下每连续两次命中有一次暴击机会。 |

角色有武器、护甲、饰物三个部位。巡途行装（trail）的短衣提高攻击，节拍坠缩短暴击间隔。守营行装（ward）的护甲和护符提高生命上限与防御。多章战役第一关胜利后解锁另一套护甲与饰物，可以混搭；单章战役开局就能换装。换上高生命装备时，当前体力按原值保留。

## 一场战斗如何推进

玩家用普通攻击答对一题，敌人扣血，自己获得一格蓄力。蓄满后可以留到下一章，也可以在某一题提交 `"skill":"burst"`。答对时按职业倍率计算攻击，答错时敌人反击，蓄力同样消耗。连续命中达到角色的暴击间隔时可触发暴击，当题使用提示则按普通命中结算。每个章节知识点都要至少答对一次才能击败守关者。

战斗回包里的 `last_event.damage_dealt` 和 `damage_received` 是本回合实际扣除的生命值，`damage_blocked` 记录防御抵消的伤害。`critical` 和 `skill` 标记暴击与职业蓄力技，`enemy.enraged` 标记首领进入半血阶段，此时答错会受到更强的反击。

守关胜利会回满生命，发放章节经验，掉落并自动穿上本职业的新武器。1 至 6 级的累计经验门槛为 0、30、65、105、150、205。升级按职业提高生命、攻击与防御，达到 6 级后保留总经验，`xp_to_next_level` 为 0。装备效果在 `player.stats` 中可见，`player.loadout` 记录三个装备部位。奖励详情见同一回包的 `last_event.xp_gained`、`levels_gained` 和 `loot_items`；`loot` 单列本章武器。

战败后，每个本次交手答错的知识点对应一个营地任务。`sidequest.lesson` 给出术语、解释和讲义出处，`prompt` 给出一道巩固题。答错留在该任务，答对推进，全部完成后满血重挑战同一章。先前章节的等级和装备继续生效。

## 状态和存档

`combat` 为战斗阶段。主角生命耗尽进入 `sidequest`，战役保留当前章节；完成支线后恢复战斗。普通关胜利进入 `stage_clear`，玩家可以在此准备下一关；最后一关获胜直接进入 `victory`。主动撤离为 `retreated`。通关和撤离的报告均可再次读取。

服务端持有当前敌我血量、章节、经验、装备、连击和题目判定。每次操作在一个 SQLite 写事务里同时保存战况、事件回包及需要结算的报告。重新启动服务后可以继续，重复请求只发一次奖励。删除原资料时，相关战役、回合和报告随游戏级联删除。

报告将主线战斗的作答、首次正确与提示，和支线复习的作答分别统计。重战保留上次战败前的学习记录。章节完成率按已击败守关敌人的章节数计算；提示后完成的学习活动可以在报告中辨认。角色成长和装备属于本次战役，重新开局从起点开始。

启动本机服务后可通过 `/docs` 调用这些接口。可下载的 JSON Schema 覆盖[职业与装备目录](../schemas/rpg/HeroCatalog.schema.json)、[战况](../schemas/rpg/BattleView.schema.json)、[动作](../schemas/rpg/BattleAction.schema.json)和[战报](../schemas/rpg/BattleReport.schema.json)。

## 设计依据

《勇者斗恶龙 III HD-2D 重制版》的官方平衡更新分别调整了职业的暴击、技能威力和可用装备。本项目从中借鉴一个具体做法，让职业通过反击承伤、暴击节奏和蓄力收益形成不同的作答策略。[Square Enix 官方更新说明](https://www.square-enix-games.com/en_GB/documents/dragon-quest-iii-hd-2d-remake-update-notice)

RPG Maker MZ 把职业成长、累计经验与装备加成拆开配置。开源项目 EasyRPG Player 也逐级检查经验门槛并处理满级。本项目采用能在四章内走完的原创经验表，伤害和装备统一从公开目录推导。[RPG Maker MZ 职业设置](https://rpgmakerofficial.com/product/MZ_help-en/01_08_02.html) | [EasyRPG Player 角色实现](https://github.com/EasyRPG/Player/blob/master/src/game_actor.cpp)

RPG Maker 社区的平衡指南建议先列出各职业擅长和较弱的属性，再设成长幅度。这里把这个经验落实为同关对照测试，实际记录同一反击造成的伤害，以及触发第一次暴击所需的连续答对数。[社区作者的平衡笔记](https://www.reddit.com/r/RPGMaker/comments/1c55g3v/how_to_balance_your_game_a_comprehensive_guide/)

## 后端验收

| 经真实 HTTP 服务运行的资料 | 实测结果 |
| --- | --- |
| 新上传的细胞生物学 TXT | 三职业分别通关同一份三章讲义，先锋用 8 次作答、术士和游侠各用 6 次。三者均获得 150 经验、达到 5 级，共获得三把职业武器和两件可混搭装备。 |
| 此前由视觉模型处理的净水站示意图 | 术士以守营行装开局，战败后完成两个出处为「图 1」的复习任务，重战后打通两章。战报保留主线 3/8、支线 2/2，累计 95 经验，达到 3 级。 |

同一关的先锋只更换护甲，防御从 6 变为 9，同样的反击从扣 9 点生命降为扣 7 点，换装前后当前生命均为 39。

在仓库根目录运行 `python -m pytest -q -k "battle or hero_catalog"` 可复测职业、装备、并发防重、重启恢复和学习报告。`python -m scripts.check_battle_balance` 遍历 78 种题量、章节数与难度组合，交叉验证三个职业、两套行装、三种通关路线（保留初始武器、使用新武器和蓄力技、战败后复习）。共通关 1,404 场，其中 468 场走过战败支线。
