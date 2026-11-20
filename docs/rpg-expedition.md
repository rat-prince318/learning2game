# 八章远征

主线沿八区从烟柳渡走到日轨天台。系统按资料顺序分配学习关卡，长讲义每章可以有多场战斗，短讲义会留出剧情探索章。角色的职业、装备和操作沿用[单卷战役](rpg-battles.md)，远征成长延伸到 20 级。想先试玩可从[八章路书](lantern-road.md)开始。

## 从自己的讲义开局

1. 启动后端，上传讲义到 `POST /materials`。轮询 `GET /jobs/{job_id}` 直到提取完成。体验满规模远征可上传仓库内的[计算机基础讲义](rpg-fixtures/expedition/computing-course.txt)，它包含 64 个有定义的不同概念。
2. 将已提取资料的 ID 按学习顺序传给 `POST /rpg/expedition-outline`。也可以为每份资料指定 `selected_knowledge_ids`。接口会按资料顺序把适用概念拆成数个可发布的小卷，并返回每卷可直接使用的 `plan_request`。八章主线向此接口传 `eight_chapters: true`。单份资料的收录上限为 1000 项，实际收录量取决于材料质量和解析模式。长讲义分卷后按顺序编入八个地区。
3. 依次向 `POST /rpg/plans` 发送各卷的 `plan_request`，通过任务结果查看每份方案。确认后向 `POST /rpg/games` 提交 `plan_id` 和 `confirmed: true`。每卷走原有的资料校验、题目生成与发布流程。离线和模型模式使用相同接口。
4. 向 `POST /rpg/expeditions` 提交有序的 `game_ids`、职业 `hero_class` 及行装 `kit`。已经发布过的课程可以直接从这一步开始。完整示例请求如下。

网页新开局传 `eight_chapters: true`。界面以 `map` 的八个地区计算主线章节，以各地区的 `chapters` 显示关卡。若某章的 `kind` 为 `exploration`，需完成本站的 `story_choice` 和 `inspect_landmark` 后在出口提交 `advance_exploration`。按需读取 `GET /rpg/expeditions/{id}/coverage` 可查看每份资料的收录范围。

```json
{"eight_chapters":true,"game_ids":["<第一卷 game_id>","<第二卷 game_id>"],"hero_class":"ranger","kit":"trail","request_id":"group-demo-1"}
```

在仓库根目录也可以批量准备远征。第一条命令会输出各卷方案供核对，第二条命令确认指定方案并打印远征存档。脚本连接已启动的服务；若使用自定义端口，可在子命令前添加 `--server <服务地址>`。

```text
python -m scripts.prepare_expedition --eight-chapters plan <material_id>
python -m scripts.prepare_expedition --eight-chapters publish <plan_id_1> <plan_id_2> --hero-class ranger --request-id my-run
```

## 路线、对手与配装

世界图鉴收录八个原创地区、16 个普通敌人、八个精英和八个双阶段首领。每场战斗前选一条路线。普通路线和精英路线考查本章共同的课程内容，面对的敌人、压力、金币和补给选项会变化。关底可以先整备再挑战，也可以走悬赏路线，多拿路币并争取本区的首领印记。即使一卷只有一个场景，也有两种首领战入口。

画面接入时可用 `battle.tactics.encounter_id` 区分 32 个常规对手，在图鉴查名称和特性。`sprite` 提供四种通用造型分类。主线最终敌人为灰冠龙将。

### 一场要过几轮

| 新开八章主线遭遇 | 至少需要答对的不同回合 |
| --- | ---: |
| 普通巡逻 | 3 |
| 精英或地区首领 | 4 |
| 最终首领灰冠龙将 | 5 |

当前场景已发布的课程题优先保留，数量超过表中值就全部上场。缺少的回合优先取当前知识点的应用题，例如从已核验的向量题派生分量计算，或换一组操作让玩家判断栈顶元素。有可靠材料时也可使用讲义中的应用实例或与原选项相关的概念辨析。资料仍不足时使用标明“战术判断”的题，例如根据护甲算实际伤害。战术回合照常结算敌我攻防与战斗进度。学科正确率和知识点手记记录讲义题与应用题。课程覆盖按已编入的来源知识点去重，每种应用变式仍归到原知识点。

本场题组在接敌时确定并随远征保存。答对一轮就从本场待答队列移除，答错的题回到队尾，下一次出现时标为“错题重试”。换装、看提示或刷新都沿用当前题目。最后一个待答回合答对时才击败敌人。更新前已在进行的交手保留原题面和原血量，这一场仍按开战时的规则结算。已有八章存档下次遇敌起自动采用表中的规则。

敌人用**出击、重击、架盾、蓄势、露隙**预告行动。玩家在提交答案时同时选择普通攻击、格挡或职业蓄力技。答对并及时架住重击可以避免当回合的伤害；识破蓄势可以打断它。削尽架势会打开一个破绽回合。例如柳根闸主蓄势时，精准格挡可以直接破势；七桥铸钟师的第三拍会加强攻击；日蚀巡天狮在第二阶段露隙时更怕职业爆发。每个必修知识点仍须至少正确回答一次。

生命、蓄力、装备、锻造和遗物都能带进下一章。营地每次选一项补给，可回血、赚路币、锻造或购买遗物。锻造分刃口和护甲两线，每次分别增加 2 点攻击或 2 点防御，共用八次上限。价格随已有总次数从 7 枚涨至 35 枚路币。16 种遗物最多同时携带四种；有些可以叠层。满栏后要买新品时，必须指定换掉哪一整组，相应属性会立即重新计算。武器阶数、遗物携带格和锻造次数分别结算。

战败后会在本章的课程出处旁进行巩固，再挑战同一遭遇。战斗可能因战术失误而失败；实战中已经答对的题仍按答对计分。全程通关后可以带一件当前持有的遗物开启进阶周目，重新选职业，从 1 级建立独立学习记录。进阶敌人生命与威力提高，精英和首领增加架势，并改变各阶段的开场动作。

## 接口与回合

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | /rpg/expedition-outline | 预览讲义分卷、知识覆盖和原有规划接口的请求体 |
| GET | /rpg/expedition-catalog | 查询地区、敌人、遗物和意图说明 |
| GET | /rpg/battle-catalog | 查询基础职业、行装与装备 |
| POST | /rpg/expeditions | 使用已发布的课程开启远征，返回 201 |
| GET | /rpg/expeditions/{session_id} | 读取地图、当前位置、行装和最新行动 |
| POST | /rpg/expeditions/{session_id}/actions | 提交选路、战斗、补给或撤离动作 |
| GET | /rpg/expeditions/{session_id}/coverage | 按资料查看收录量、实际排入主线的数量和待核验题项 |
| GET | /rpg/expeditions/{session_id}/report | 通关或撤离后读取已保存的分卷战报 |
| POST | /rpg/expeditions/{session_id}/encore | 成功通关后开启进阶周目，可传 hero_class、kit、inherited_relic_id 和 request_id |

客户端按顶层 `phase` 决定当前操作。选路阶段为 `route`，答题战斗为 `combat`，巩固支线为 `sidequest`，补给待领取为 `reward`，最终结果为 `victory` 或 `retreated`。某卷完成时嵌套的 `battle.phase` 可能先变为 `victory`，还应按远征顶层判断本次旅程是否结束。

`battle.rounds` 在有相应记录时给出 `completed`（已答对的不同回合数）、`total`（本场总数）和 `kind`（当前回合类型）。`source`、`application`、`tactics` 分别对应讲义题、应用题和战术判断。巩固或结算阶段的 `kind` 可为 `null`，旧战斗或其他模式的 `rounds` 可为 `null`。回放上一次作答应读取 `battle.last_event.round_kind`，下一道题可能已经换了类型。

每个动作均需独立 `event_id` 和**远征顶层**的 `expected_revision`。选路使用 `choose_route` 与当前 `routes[].id`。作答使用 `answer`、当前 `battle.prompt.prompt_id` 和 `option_id`，可传 `skill` 为 `strike`、`guard` 或 `burst`。巩固支线使用默认 `strike`。开战时 `battle.tactics.intent` 显示预告，`strike_exposure` 和 `guard_exposure` 预估答对且敌人存活时的承伤。提示、换装、撤离分别使用 `hint`、`equip`、`retreat`。

整理背包同样向本端点提交动作。地图及领奖时可用 `equip` 更换装备、`unequip` 卸下护甲或饰品、`use_item` 使用一份补给、`discard_item` 丢弃物品。四种动作都传 `item_id`，丢弃另外传正整数 `quantity`。以回包中的 `player.loadout`、`player.inventory`、`player.stats` 和 `supplies` 更新界面。绷带与茶的剩余数量及效果分别放在 `quantity`、`heal`、`focus`。

领取补给用 `choose_reward` 和 `reward_id`。字段 `cost`、`affordable` 和 `requires_replacement` 说明花费与购买条件，替换遗物时提交 `replace_relic_id`。在八章主线中，章中胜利可就地领补给，随后从交手处继续走。本章最后一战若还有下一站，地图在 `reward` 阶段恢复当前地点，把主线目标指向出口补给车，到车旁选定补给才提交 `choose_reward` 并换区。探索章从出口提交 `advance_exploration`，最终首领则走结局流程。战报的 `journal` 按关记录选路、收入和补给。

同一开局编号在同一首卷下可以重试，相同配置会返回当前进度。重复提交同一动作及其原始内容会得到首次回包；同号异内容、过期版本和未解锁的进阶周目返回 409。读档、结算和奖励均由服务器负责。删除任一入选课程的原资料，会一并清理引用该资料的远征存档、回包和战报。

## 设计与验收

敌方预告参考了《陷阵之志》让玩家先读招再行动的设计。普通与精英路线、遗物取舍参考了《杀戮尖塔》，以及社区地图工程将分支、可达性与最终首领分别建模的做法。本项目的课程映射、故事、题目、战斗公式和资源经济均由本项目实现。[Subset Games](https://subsetgames.com/itb.html) | [Mega Crit](https://www.megacrit.com/press-kits/slay-the-spire/) | [社区地图实现](https://github.com/OrangeSensei06/SlayTheSpireMapGeneration/blob/main/README.md)

运行 `python -m pytest -q -k expedition` 可复核选路、敌方意图、首领、格挡破势、资料删除、事件重放与恢复。运行 `python -m scripts.check_expedition_balance` 可用同一份 64 知识点讲义复测三职业、两套行装、两种路线策略、普通和进阶难度的完整远征。程序选择技能时使用玩家能看到的意图与生命，答题正确性由测试裁判控制。测试回合数用于比较配装和节奏，实际游玩时长、难度感受和学习效果需要真人试玩。

新八章主线用两份已发布课程的存档副本离线走完全程。物理卷 8 个已核验小问分配到八场首领战，前七场各 4 道、终战 5 道，共 33 道不同的学科题。驿站手册共 32 个知识点，普通路线按每区三场巡逻、一场首领走完 32 场，共 105 道不同的学科题。两次实测都无战术补轮。手册另用中文、英文分别走完全精英路线，24 场精英加 8 场首领，各有 129 道不同的学科题（32 道讲义题、97 道应用题）。其中 31 场各四轮，终章五轮。

早期按卷分章的独立接口曾用 64 个知识点复测 24 组配装与路线，并测试资料删除、营地修习、进阶继承和中途重启后的动作重放。该套件保留原有分章规则。独立单卷接口、早期短途存档和回声塔各自的节奏见[单卷战役](rpg-battles.md)和[塔与伙伴](rpg-tower-party.md)。
