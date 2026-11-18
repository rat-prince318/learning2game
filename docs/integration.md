# D 后端对接说明

## 一轮游戏怎样跑通

生产者和使用者共用同一套 [Python 模型](../backend/models.py)。C 可以在启动后的 `/docs` 查看请求样例和响应字段，通过 `/openapi.json` 获取机器可读的接口说明。开发时用 `GET /health` 区分 `demo`、`integrated` 和还没有适配器的 `unconfigured`。

| 用户动作 | 接口 | 前端接下来做什么 |
| --- | --- | --- |
| 上传课件 | `POST /materials`，multipart 的文件字段名为 `file` | 保存 `material_id`、`job_id`，轮询 `GET /jobs/{job_id}`。失败后可 `POST /materials/{material_id}/retry`。 |
| 看提取结果 | `GET /materials/{material_id}/knowledge` | 处理完成后展示 `knowledge[]` 中的术语、解释、来源。图片也通过相同上传接口交给 B。 |
| 选学习偏好 | `POST /matching-plans` | 提交材料 ID 和偏好；任务到达 `awaiting_confirmation` 后，取 `result.plan_id`、`result.plan`，展示知识点和推荐理由。 |
| 确认或调整方案 | `POST /games` | 提交 `plan_id`、`confirmed: true`，修改过方案时附完整的 `plan`。生成任务完成后取 `result.game_id`。 |
| 开始或重玩 | `GET /games/{game_id}`、`POST /games/{game_id}/sessions` | 显示两组公开卡片；保存新返回的 `session_id`。同一个游戏每次重玩会使用独立会话。 |
| 配对、用提示 | `POST /sessions/{session_id}/attempts`、`POST /sessions/{session_id}/hints` | 根据服务端结果更新界面。配对成功会返回本对解释与出处。 |
| 刷新 | `GET /sessions/{session_id}` | 按 `game_id` 重载关卡，恢复已配对的公开卡片、错误数和提示次数。 |
| 结束或提前交卷 | `POST /sessions/{session_id}/finish` | 返回并保存统计；之后可 `GET /sessions/{session_id}/report` 重读。 |
| 获取学习建议 | `POST /sessions/{session_id}/feedback` | 轮询，完成后展示 `result.feedback`；建议生成失败时仍可查看统计。 |
| 重点再练 | `POST /sessions/{session_id}/practice`，可选 `preferences` | 等待新的待确认方案，继续走确认、建局流程。只有一个薄弱点时加一个已完成的概念作对照。 |

请求个性化方案的示例。学习水平支持 `beginner / familiar`，目标支持 `recognize / distinguish / preview / review / classroom`，难度支持 `easy / medium / hard`，题量为 2–12 对。

```json
{"material_id":"<上传所得 ID>","preferences":{"learner_level":"beginner","goal":"recognize","difficulty":"easy","pair_count":6}}
```

配对时使用公开卡片的 `id`。每次新动作生成新 `event_id`，例如浏览器的 `crypto.randomUUID()`；同一次网络重试复用原 ID 和原请求体。提示只提交 `event_id` 和 `left_id`。

```json
{"event_id":"<本次点击的 UUID>","left_id":"<左卡片 ID>","right_id":"<右卡片 ID>"}
```

耗时请求先返回 HTTP 202。建议每 0.5–1 秒查询一次任务；`completed`、`failed`、`awaiting_confirmation` 都是该请求的轮询终点。确认阶段重复发送同一方案会返回已有任务，生成失败可用同一入口显式重试。服务重启会把中断的工作标成失败，已保存的游戏和会话可继续使用。

HTTP 错误形如 `{"error":{"code":409,"message":"Session has finished"}}`。找不到对象返回 404，状态冲突或复用事件 ID 提交不同动作返回 409，不支持的格式返回 415，超限返回 413，非法输入一般返回 422，未配真实服务返回 503。异步任务已受理后的失败记录在 `job.status` 和 `job.error`。

## A、B 如何接入

[Services 协议](../backend/services.py) 有四个同步方法，适配器可以把它们分别转给 A、B 的模块。无参工厂返回这个适配器，在本机的 `.env` 里把 `EDUGAME_SERVICE_FACTORY` 设为实际可导入的 `包.模块:工厂函数`，并设 `EDUGAME_DEMO=0`。也可以在集成测试中通过 `create_app(data_dir=..., services=...)` 注入对象。

| 方法 | 提供方 | 输入与返回 |
| --- | --- | --- |
| `extract(path)` | B，或 A 调用 B 工具的入口 | 本地已校验的文件路径 → `MaterialResult`；各知识点需有稳定 ID、定义与页码、图号或段落出处。 |
| `plan(knowledge, preferences)` | A | 当前可用的知识点和偏好 → `MatchingPlan`。此时用户尚未确认。 |
| `generate(knowledge, plan, previous=None)` | A | 已确认范围 → 经 A 语义校验的 `GameConfigInternal`。再练时会传上一局内部配置，供改写例子。D 再核对 ID、覆盖范围和来源，并生成公开卡片。 |
| `feedback(report, knowledge)` | A | D 计算的逐项表现和本轮带出处的知识点 → 可给学生阅读的建议。 |

A、B 可用 `backend.provider.trace_tool` 包住真正执行工具的代码。任务响应 `tool_calls` 会留下静态工具名、成功或失败以及毫秒耗时。演示模式的工具记录为空。答案、提示词和课件正文均不进入这份记录。适配器须将材料作为待分析的数据，用供应商客户端设置请求超时；如实现内部重试，应限制次数并计入服务总时限。

```python
from backend.provider import trace_tool

with trace_tool("read_pdf"):
    pages = read_pdf(path)  # B 实现的真实工具
```

## 判分和实验统计

- **首次正确率**是首次配对正确的知识点数除以至少尝试过一次的知识点数。**总尝试正确率**是正确配对次数除以有效尝试次数。分母为零返回 `null`，C 可显示“尚未尝试”。
- **完成率**是已配对数量除以本轮总数。报告用 `concepts[]` 给出每个知识点的尝试数、错误数、首次结果、提示数、解释和来源。首次错误、使用提示或尚未完成都会进入待复习名单。
- 举例而言，四对卡片中，第一对先错后对，第二对首次正确，其余两对没有尝试。首次正确率为 1/2，总尝试正确率为 2/3，完成率为 2/4。这三个数均以 0–1 返回。
- [汇总命令](../backend/metrics.py) 只读指定实验库。它按模式和任务类型给出成功、失败、待处理数量，以及各阶段样本数和平均耗时。生成成功率的分母是已结束的生成任务，重试属于另一次任务。真实实验应从新的集成模式数据目录开始，用小组准备的材料运行，再结合 A/B 的人工语义与来源核验、C 的可用性记录撰写课程报告。

## 部署、隐私和清理

- 课堂原型使用匿名会话，默认绑定本机。每个数据目录运行一个服务进程，SQLite 负责并发写入。开发前端默认可从 `localhost:5173` 和 `127.0.0.1:5173` 跨域访问；端口变化时修改 `EDUGAME_CORS_ORIGINS`。课堂投屏可直接在教师电脑运行。多人公网部署需要另行提供访问控制与 HTTPS。
- 每份上传默认最多 10 MiB；`EDUGAME_MAX_UPLOAD_BYTES` 可在 1 字节至 32 MiB 之间设置。目前接受 UTF-8 TXT、单张 PNG/JPEG（最多 1600 万像素）和未加密 PDF（最多 80 页）。文件使用服务端生成的名称，保存在数据目录的 `uploads/` 中，统计与会话保存在 `edugame.sqlite3` 中。
- 演示模式全程本地处理，默认目录为 `.local/demo`。接入真实模型后默认使用 `.local/live`；资料是否发送给外部服务及发送范围取决于 A/B 的实现。C 在上传界面应说明实际服务和范围，请使用获得授权的课程资料。密钥仅在后端环境配置。
- 每个适配器方法默认限时 60 秒，可通过 `EDUGAME_SERVICE_TIMEOUT` 调整。超时后任务失败，晚到的结果不会写入游戏。底层请求可能继续到供应商超时，后台同时保留最多四个调用，重试由用户发起。
- 如需删除一份上传材料，先停止使用该目录的服务，再执行下面的命令，把目录和 ID 换成相应上传记录。它会清理文件、知识点、关联游戏、会话、报告与任务。内置演示讲义会在下次演示启动时重新建立。

```powershell
.\.venv\Scripts\python.exe -m backend.cleanup --data-dir .local/demo --material <material_id>
```
