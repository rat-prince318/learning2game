# A 与 B C D 的接口契约

契约版本为 `1.0`，Python 定义在 `src/matching_agent/models.py`，机器可读版本在 `schemas/`。当前由 A 起草，接入后由 D 维护单一来源；其他模块直接导入或使用导出的 JSON Schema。

## B 提供的知识

`KnowledgeBundle` 包含 `material_id`、`language`（`zh/en/mixed`）、`provenance`（`fixture/extracted`）、`knowledge`、`sources` 和 `warnings`。

每个 `KnowledgeItem` 包含：

| 字段 | 约定 |
|---|---|
| `knowledge_id` | 材料内唯一稳定 ID，禁止将数组下标作为长期标识 |
| `concept` / `definition` | 概念及可区分的定义或功能；概念最多 60 字符才能进入本版游戏 |
| `relation_type` | B/A 共同约定的关系标识；同轮只能使用一个关系 |
| `difficulty` | `basic` 或 `advanced` |
| `learning_objective` | 学习目标说明 |
| `source_refs` | 当前 bundle 的有效 `source_id` 列表 |
| `evidence` | 支持知识的文字或图示关系说明 |
| `modality` | `text/image/mixed` |
| `quality` | `reliable/uncertain/conflict`；后两者不进入游戏 |
| `warnings` | 面向用户的质量说明；是否可用由 quality 决定 |

`Source` 含 `source_id`、`material_id`、`locator`、`evidence`、`modality`。`locator` 可描述页码、段落、图片；A 不访问任意 URL 或文件路径。来源原文/原图的读取和权限由 B/D 实现。图像知识的 evidence 必须来自 B 的真实图像分析，单纯把 `modality` 写成 image 不能证明多模态能力。

知识或来源 ID 重复时拒绝整个 bundle；知识缺证据、无有效来源、不可靠或文字无法显示时排除该条。完全重复的概念/定义仅保留一条，优先保留需复习的记录。语义近义和交叉歧义由后续语义验证检查。

## 用户偏好与方案

`UserPreferences` 默认 `level=beginner`、`learning_goal=recognize`、`pair_count=6`。可确认 2–12 对。短练习可明确选择 2 或 3 对。`level=familiar` 对应更凝练的表达，`learning_goal=distinguish` 对应区分相近概念。可选 `difficulty` 接受 easy、medium 或 hard。

- `selected_knowledge_ids=null` 表示不额外限制；空列表表示没有可选知识，不会隐式改成全选。
- `excluded_knowledge_ids` 表示排除范围；与显式选择重叠视为错误。
- `weak_knowledge_ids` 是 D 提供的复习优先级列表，不允许凭空添加未知 ID。
- 每轮从至少含 4 条可靠知识的关系中选择：优先覆盖最多薄弱点，其次选择知识较多的关系，最后按关系标识稳定排序。
- 在该关系中优先纳入允许范围内的薄弱点，题量超过可靠知识数量时减少，并提示重新确认。无法覆盖的薄弱点列出警告。

`MatchingPlan` 在生成建议外保留 `plan_id`、`material_id`、知识快照摘要、实际题量与完整偏好。`check_plan` 会检查候选集合、题量、难度、语言和薄弱点覆盖。

`confirm_plan(plan, bundle)` **只能由可信宿主在用户确认之后调用**。它创建 `ConfirmedPlan`，记录方案摘要与深拷贝。该函数不在 LLM 工具列表中。D 必须将确认与真实会话和请求绑定；本模块的摘要用于检测修改，不是登录授权或数字签名。

资料改变或确认后的方案改变时，生成被拒绝。用户改参数应重新调用 `prepare_plan` 并再次确认。

## Python 服务入口

```python
async def prepare_plan(bundle: KnowledgeBundle,
                       preferences: UserPreferences | None = None) -> MatchingPlan

def confirm_plan(plan: MatchingPlan, bundle: KnowledgeBundle) -> ConfirmedPlan

async def generate_game(bundle: KnowledgeBundle, confirmed: ConfirmedPlan,
                        *, previous_game: GameConfigInternal | None = None) -> GenerationResult

async def generate_feedback(statistics: LearningStatistics, bundle: KnowledgeBundle,
                            game: GameConfigInternal,
                            preferences: UserPreferences | None = None) -> LearningFeedback
```

`MatchingAgent` 无全局游戏状态；每次调用创建独立上下文，可由 D 调度多个任务。`DeepSeekClient` 复用连接，应用关闭时调用 `await client.close()`。

## 游戏配置与验证

`GameConfigInternal` 含标题、规则、游戏/材料/方案标识、语言、关系类型、warnings 和 `pairs`。每对含：

| 字段 | 约定 |
|---|---|
| `pair_id` | `pair_` + `knowledge_id`，仅供服务端内部使用 |
| `knowledge_id` | 必须来自已确认方案，每条恰好出现一次 |
| `left` | 原概念名称，最多 60 字符 |
| `right` | 定义/功能描述，最多 180 字符 |
| `explanation` | 来源支持的解释，最多 400 字符 |
| `source_refs` | 支持本对内容的来源 ID |

字符长度按 Python Unicode 字符计数。标题最多 120 字符，规则最多 400 字符。

`GenerationResult` 返回 `status`、`game`、`validation`、`repair_count` 和 `warnings`。成功时 `game` 非空且已经通过结构及语义检查；内容失败时 `game=null`。`needs_confirmation` 为接入预留状态，本版不自动提出新范围：两次修复失败后返回 `failed`，由用户调整偏好并从方案阶段重新开始。

`ValidationReport` 包含 `passed`、`semantic_checked` 和逐条 `issues`。每条问题有受影响的 pair/knowledge ID、code、reason 和 suggestion。语义自检通过表示模型未发现问题，不能作为人工准确率指标。

**D → C 的公开配置由 D 定义。** D 生成互不关联的公开左右卡片 ID，保存内部映射，并独立打乱两侧顺序。不公开 `pair_id`、`knowledge_id`、正确关系或完整解释；判分后按约定返回解释与来源。A 不实现浏览器判分或公开卡片 API。

## 学习统计与再练习

`LearningStatistics.status` 为 `active/completed/exited`，活动中的会话不能请求最终反馈。统计必须覆盖游戏内全部知识点；未尝试知识也要有记录，`first_attempt_correct=null`。

`metrics` 由 D 计算：

- `first_attempt_accuracy`：首次正确知识数 / 至少尝试一次的知识数；零次尝试为 null。
- `total_attempt_accuracy`：正确尝试次数 / 有效尝试总次数；零次尝试为 null。
- `completion_rate`、`total_attempts`、`total_errors`、`hints_used`：按 D 的记录提供。

A 校验数值范围与关联身份，原样复制统计，不重新计算、不修正 D 的结果。每项表现含 `knowledge_id`、`first_attempt_correct`、`attempts`、`errors`、`hints`、`completed`。薄弱点判定仍由 D 完成，建议包括首次错误、多次尝试、用过提示或未完成。

`LearningFeedback` 包含定性 summary、逐知识 reviews、原统计 statistics、完成情况说明与 `PracticeRequest`。模型不接收汇总数字，程序还会拒绝明显数值表现声明；复习解释须使用真实知识 ID 和来源。数字只应从 `statistics` 展示。自然语言的所有事实仍需抽样核对。

`PracticeRequest` 保留材料、上一轮游戏 ID、原用户范围和 D 的薄弱点，`requires_confirmation=true`。D 重新调用 `prepare_plan`，确认后把 `previous_game` 传给 `generate_game`。未能生成安全新表述时游戏 warnings 明确列出保留原文的知识。

## B 的可选工具适配

已有 KnowledgeBundle 时直接调用 `prepare_plan`。若要由 A 编排资料工具，则注入实现以下三个 async 方法的对象，调用 `prepare_from_material`：

```python
async def read_material(material_id: str) -> dict
async def analyze_image(material_id: str, image_id: str) -> dict
async def extract_knowledge(material_id: str, material: dict,
                            image_analyses: dict[str, dict]) -> KnowledgeBundle
```

`read_material` 返回 `text_blocks` 等 B 定义的数据，以及 `images=[{"image_id": "...", "needs_analysis": true}]`。图像 ID 必须唯一。必需图像完成分析后才能提取知识；无文字但有图像时同样适用。A 限定工具只能读取当前授权材料，B/D 仍须检查文件访问权限。单阶段工具上限为 12，因此 B 应只提供选定且值得分析的少量图像。

## 事件与错误

`on_event(record)` 可同步或异步；回调异常不触发重复业务操作。D 应记录其自身存储失败并监控。事件包含 run_id、阶段、live/offline 模式、工具 call_id、参数字段摘要、结果状态/数量、耗时和下一动作，不包含证据全文、API 密钥或隐藏推理。

`AgentError.as_dict()` 提供 `code/message/retryable/details`。常用错误包括 `insufficient_knowledge`、`confirmation_required`、`stale_plan`、`invalid_plan`、`model_timeout`、`model_request_rejected`、`model_call_limit`、`session_not_finished`。D 决定 HTTP 映射及任务状态，切勿把 `result.game is None` 当成可玩游戏。
