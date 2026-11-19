# RPG 后端交接给组员二

同一个已发布 game_id 可以开启答题战役。先从 `GET /rpg/battle-catalog` 读取三个职业和两套初始行装。战役存档记录角色、装备、章节敌人、首领与战败后的复习支线。具体开局请求、经验门槛、战况字段与重试约定见[战役接口与规则](rpg-battles.md)。

分支 `rpg-backend` 提供完整的内容生成、会话、报告和再练 API。接网页时从 [接口契约](rpg-contract.md) 开始，再将 [六题三场景的真实响应](rpg-fixtures/normal) 作为页面开发数据。网页入口、场景画面、NPC 交互、操作说明和浏览器 RPG 验收属于组员二的交付。

## 本机启动与复现

1. 在仓库根目录运行 `python run.py`，Windows 也可双击 `start.cmd`。启动器会准备依赖并启动本机服务。服务启动后打开终端打印的地址，在同一地址的 `/docs` 可以直接操作 API。默认 offline。查询 `GET /health`，内置后端的 supported_game_types 中应有 `rpg_quest`。
2. 在 `POST /materials` 上传仓库中的 [细胞讲义](../public/examples/cell-notes.txt)。保存 material_id 和 delete_token。用 `GET /jobs/{id}` 确认提取完成。接着按契约请求推荐、方案和生成。前端和 FastAPI 同源运行，也可通过已有 API 客户端使用开发端口。
3. 在公开配置内找到起点场景、任务与挑战标识，创建会话、接受任务，再选一个选项。断线时保留 event_id，重连先恢复会话。本轮结束后调用 finish，再取学习建议；任一薄弱点都可单独再练。
4. 运行后端验证用 `python -m pytest -q`。只复核 RPG 时用 `python -m pytest -q -k rpg`。从仓库根目录执行并使用项目的虚拟环境。根据真实工作目录读取任务指标可用 `python -m backend.metrics --data-dir .local/offline`。输出中 generation_by_mode_and_game_type 的分母为已结束的生成任务，重试计作新任务。逐题对照讲义的开发复核结果另见[内容核查](rpg-content-review.md)。

### 真实模型配置

按仓库根目录的 [.env.example](../.env.example) 创建本机 .env。把 `EDUGAME_MODE` 设为 `live`。资料理解使用 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_TEXT_MODEL`、`LLM_VISION_MODEL`，图示须使用支持图像输入的模型。RPG 使用项目已有的兼容客户端，其环境变量名为 `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`，目标模型须支持 function calling。验收通过 OpenLux 的 `https://api.openlux.ai/v1` 运行。资料识别使用 `gpt-4.1-mini`，最终 RPG 内容编排与语义校验使用 `gpt-5.1`。凭证填在本机运行环境。运行服务时，每份任务只向所配置的服务商提交该阶段所需的课程内容和偏好。

内置 offline 用规则从上传的词条生成题目。live 执行真实工具调用。两者的任务 mode 和工具名可在轮询响应区分。旧的演示服务或只提供 Matching 的自定义工厂继续提供配对玩法；未配置服务时能力列表为空。外部工厂如需发布 RPG，需实现下表四个同步方法并从模型校验过的配置中返回结果。

## 代码和数据归属

| 文件 | 职责 |
| --- | --- |
| backend/rpg/models.py | 偏好、方案、内外两套配置、动作、进度、报告和文字约束 |
| backend/rpg/agent.py、prompts.py、authoring.py、offline.py、service.py | 工具调用和预算、在线剧情与挑战编排、内容修复、按资料生成本地关卡、绑定可信字段 |
| backend/rpg/validation.py、reviewer.py、games.py | 证据、范围、场景与选项校验，打乱选项后的独立解题及公开发布 |
| backend/rpg/sessions.py、reports.py、session_routes.py | 状态推进、判分和奖励、幂等、恢复、结束与统计 |
| backend/rpg/router.py、backend/pipeline.py | 确认、任务状态、推荐、建议和再练 |
| backend/integration.py、db.py、schema.sql、metrics.py | 服务委托、迁移、事务和实验指标 |
| schemas/rpg/、docs/rpg-fixtures/、tests/test_rpg_* | 前后端契约、对接样例和 Python 验收 |

| 服务方法 | 启动条件 | 返回 |
| --- | --- | --- |
| recommend_game_type(knowledge, preferences) | 用户请求玩法建议 | GameRecommendation |
| plan_rpg(knowledge, preferences, previous_report=None) | 常规 RPG 或从已结束的报告再练 | RPGPlan |
| generate_rpg(knowledge, plan, previous=None) | 后端已记录用户确认 | 经过校验的 RPGGameInternal |
| feedback_rpg(report, knowledge) | 用户已结束会话 | 带出处的文字建议 |

复用上传资料的 KnowledgeItem。term 与 definition 形成教学依据，example 可支持情境，evidence 是原文或可观察的像素线索，source_ref 为可读出处，source_type 区分文字、图示或混合来源，source_ids 和 page 记录定位。资料模块先合并候选和剔除冲突，RPG 再核对证据、重复项和范围。没有单独的 quality 字段。关卡内部保留 knowledge_id、evidence、source_ref，反馈引用由宿主绑定。客户端只从公开配置开始；游戏过程中的答后揭示受服务端动作控制。

工具按阶段允许调用 recommend_game_type、design_rpg_plan、generate_rpg_config、validate_rpg_config、repair_rpg_config 和 write_rpg_feedback。check_rpg_config 执行程序校验。独立的模型审核检查题目、正确选项、材料证据和剧情。每阶段最多 12 次模型工具调度，生成最多 2 轮修复，失败后终止发布。工具跟踪只公开名称、状态、耗时。调用在线程中执行，超时后的旧结果无法写入数据库。确认、奖励、重试次数和数学统计由宿主控制。

在线出题采用有边界的内容编排。模型根据资料和学习偏好选择剧情目标、分场任务、每题发生的事件、线索来源、干扰项、提示和完成回应。后端用选定的资料字段组织题干和选项，并将玩家作答前可见的 NPC 台词限制在内置叙事文本。困难关可以提供两条分别有出处的记录，让玩家决定两张标签的交接顺序。每题仍只给指定的主要知识点记分，另一条线索用于辨别选项。缺少适用对照时，生成结果会说明相应题目采用单条线索。

### 存储与升级

启动时 SQLite 事务为 plans、games 增加 game_type，旧行读取为 matching；plans.confirmed_at 记录首次可信确认。旧玩法任务标为 matching；通用提取和新推荐任务的类型保留 null。每个 RPG 事件含唯一的 (session_id,event_id)，回包随判定和奖励同事务提交。旧的配对事件表继续独立使用。资料删除沿用原来的持有令牌与本机文件回收机制，可级联清除两种游戏、会话、事件、报告和任务。升级已有资料库前可使用 SQLite backup API 或在服务关闭后保存完整备份。

本次升级在原课堂资料库的本地备份上连续运行两次，已有的 1 份资料、2 个方案、1 个游戏、1 次会话、6 条事件和 1 份报告均保留，外键检查通过。课程使用场景为本机单用户；现有本机服务按持有的标识访问会话，对外多用户部署还需要账户与按用户授权。

## 参考过的社区实现

- boardgame.io 将允许的动作绑定到游戏阶段，并在发给玩家前裁剪保密状态。项目据此将接任务、依次答题、解锁和公开配置写成独立的服务端规则。[Phases](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/phases.md) | [Secret State](https://github.com/boardgameio/boardgame.io/blob/main/docs/documentation/secret-state.md)
- Ink 用具名节点和显式跳转组织剧情。这里采用有限的场景 ID 与下一站关系，发布前走完整条路线，确保学生能抵达结局。[Writing with ink](https://github.com/inkle/ink/blob/master/Documentation/WritingWithInk.md)
- H5P 的单选内容模型区分作答前提示、选择反馈与选项排序。本项目将发布时间的打乱、提示次数以及首次错误和讲解完成分别处理。[H5P MultiChoice](https://github.com/h5p/h5p-multi-choice/blob/master/semantics.json)
- Pydantic AI 的结构化输出示例将工具参数交给模型类型验证。这里复用现有模型客户端，以严格类型验证工具输出，并给修复设置上限。[Structured Output](https://github.com/pydantic/pydantic-ai/blob/main/docs/output.md)
- SQLite 的写事务在动作判断前取得写权限，防止两个并发请求各自发奖。[SQLite Isolation](https://www.sqlite.org/isolation.html)

## 课程贡献与验收

| 分工文档验收项 | 复核入口与结果 |
| --- | --- |
| R01、R03、R15、R19 | 实际讲义生成、缺少确认时拒绝、独立一题再练、无效内容经修复或停止发布。见 [生成测试](../tests/test_rpg_generation.py) 和[工作流测试](../tests/test_rpg_workflow.py)。 |
| R04–R11、R16 | 服务端检查动作与题目顺序，核对 10/6/0 XP、一次任务奖励、同 ID 重放、异内容冲突与独立的新会话。见[会话测试](../tests/test_rpg_sessions.py)。 |
| R12–R15 | 数据库重启后恢复进度，空分母、提前退出与讲解完成单独统计。三题手工例得到 1/3、2/5 和 3/3。见[报告测试](../tests/test_rpg_reports.py)。 |
| R17、R18、R23、R24 | 对同一上传在两种玩法间切换，类型冲突返回 409，两类游戏和相关文件按资料删除；反馈失败后单独重试，报告仍可读。见[工作流测试](../tests/test_rpg_workflow.py)。 |
| R20、R22 | 真实像素提取与出题见[联网验收](rpg-live-acceptance.md)。升级与重复启动见[迁移测试](../tests/test_rpg_migration.py)。 |

R02 的网页确认状态、R12 的网页恢复、R17 的页面切换、R21 的手机和键盘体验及 R25 的页面过期回包处理，由组员二在游戏界面接入后验收。接口中已提供 plan_id、session_id、revision、公开配置和错误响应。

组员一交付了 RPG 工具链和离线内容生成、服务端玩法与报告、数据迁移、公开契约、可复用样例和验收。可在课程报告中引用[真实图示运行记录](rpg-live-acceptance.md)、[两门学科的逐题检查](rpg-content-review.md)及[可下载的响应样例](rpg-fixtures)。组员二可据此开展 RPG 网页联调、键盘和手机操作验收，并记录玩家体验。

交付版本实测为 182 项 Python 测试通过，4 项原 Matching 可选联网用例在默认测试配置下跳过。另有 11 项网页单元测试和 4 项 Matching 浏览器回归通过。将待提交文件导出到干净目录后，通过实际 HTTP 启动离线服务，重新上传讲义并完成三场景六题，读回了同一份结局报告。
