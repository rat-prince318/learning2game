# 八章远征

主线经过八个地区，从烟柳渡出发，最终抵达日轨天台。系统沿资料顺序分配学习关卡；每章可以有多场战斗，资料较短时会有剧情探索章。一场战斗里的每道题答对一次即可，最后一题打出终结一击。答错的题排到待答题末尾，回来时标为“错题重试”。三职业和装备延续[短战役设定](rpg-battles.md)，远征成长延伸到 20 级。

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

画面接入时可用 `battle.tactics.encounter_id` 区分 32 个对手，并在图鉴中找到对应名称和特性。已有的 `sprite` 值提供四种通用造型分类。

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

客户端按顶层 `phase` 决定当前操作。选路阶段为 `route`，答题战斗为 `combat`，巩固支线为 `sidequest`，营地选择为 `reward`，最终结果为 `victory` 或 `retreated`。某一卷完成后，嵌套的 `battle.phase` 可以先显示该卷胜利，此时远征通常仍有后续行程。

每个动作均需独立 `event_id` 和**远征顶层**的 `expected_revision`。选路使用 `choose_route` 与当前 `routes[].id`；作答使用 `answer`、当前 `battle.prompt.prompt_id` 和 `option_id`，可传 `skill` 为 `strike`、`guard` 或 `burst`。巩固支线使用默认 `strike`。开战时 `battle.tactics.intent` 显示预告；`strike_exposure` 和 `guard_exposure` 预估本回合答对且敌人存活时的承伤。提示、换装、撤离分别使用 `hint`、`equip`、`retreat`。

选择补给时发送 `choose_reward` 和 `reward_id`。选项中 `cost`、`affordable` 和 `requires_replacement` 给出当前花费与条件；需要腾出遗物栏位时同时提交 `replace_relic_id`。战报中的 `journal` 记录每章选路、收入和补给。每卷分别记录知识点出处、主线首答和巩固练习；八章模式在各卷之间核对重复题目和来源知识点，首次出现的题进入主线。

同一开局编号在同一首卷下可以重试，相同配置会返回当前进度。重复提交同一动作及其原始内容会得到首次回包；同号异内容、过期版本和未解锁的进阶周目返回 409。读档、结算和奖励均由服务器负责。删除任一入选课程的原资料，会一并清理引用该资料的远征存档、回包和战报。

## 设计与验收

敌方预告参考了《陷阵之志》让玩家先读招再行动的设计。普通与精英路线、遗物取舍参考了《杀戮尖塔》，以及社区地图工程将分支、可达性与最终首领分别建模的做法。本项目的课程映射、故事、题目、战斗公式和资源经济均由本项目实现。[Subset Games](https://subsetgames.com/itb.html) | [Mega Crit](https://www.megacrit.com/press-kits/slay-the-spire/) | [社区地图实现](https://github.com/OrangeSensei06/SlayTheSpireMapGeneration/blob/main/README.md)

运行 `python -m pytest -q -k expedition` 可复核选路、敌方意图、首领、格挡破势、资料删除、事件重放与恢复。运行 `python -m scripts.check_expedition_balance` 可用同一份 64 知识点讲义复测三职业、两套行装、两种路线策略、普通和进阶难度的完整远征。程序选择技能时使用玩家能看到的意图与生命，答题正确性由测试裁判控制。测试回合数用于比较配装和节奏，实际游玩时长、难度感受和学习效果需要真人试玩。

早期按卷划分章节的版本通过 24 组满规模模拟，每组走完 32 章与八场区域首领战，覆盖 64 个知识点，并包含一次主动触发的战败、营地修习与重返战场。另用三道自编力学题实测最终首领，三次正确作答即通关，两种形态都在场上出现。

早期版本的独立 HTTP 验收从上传示例讲义、审核发布八份方案开始。术士的首周目打通 32 章，战报记录主线 86/90、巩固 2/2，完成七次锻造并取得八枚悬赏印记。中途在第 16 章重新启动服务，原存档和重复动作回包都能恢复。通关后，游侠继承一件遗物，从零开始锻造，主线 79/79，再次打通 32 章。在同敌、同装备的对照回合中，首次锻刃使实际伤害从 32 点变为 33 点，首次锻甲使同次反击的承伤从 11 点变为 10 点。
