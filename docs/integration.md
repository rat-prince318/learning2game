# 系统对接与验收

启动器在同一地址提供游戏、静态资源和 FastAPI。启动后可用 `/docs` 试接口，或用 `/openapi.json` 获取结构定义。开发时先查 `GET /health`，它会返回运行模式、上传上限和允许的扩展名。

## 从资料到下一轮练习

| 动作 | 调用 | 下一步 |
| --- | --- | --- |
| 上传 | `POST /materials`，multipart 字段 `file`，可选 `pages`（PDF 页码，如 `1,3`）、`include_images` | 保存材料 ID、任务 ID 和仅在上传时返回的 `delete_token`。用 `GET /jobs/{id}` 轮询。 |
| 看提取结果 | `GET /materials/{id}/knowledge` | 展示术语、定义、证据、页码或段落，以及材料处理提示。提取失败可 `POST /materials/{id}/retry`。 |
| 推荐方案 | `POST /matching-plans`，传 `material_id`、`preferences` | 任务停在 `awaiting_confirmation` 时展示 `result.plan` 与 `result.plan_id`。 |
| 修改和确认 | `POST /games`，传 `plan_id`、`confirmed: true`；有修改则附完整 `plan` | 生成完成后读取 `result.game_id`。不同资料的知识点不能混入同一方案。 |
| 建局 | `GET /games/{id}`、`POST /games/{id}/sessions` | 返回分别打乱的左右卡片与新的匿名会话。重玩使用新的会话 ID。 |
| 配对与提示 | `POST /sessions/{id}/attempts`、`POST /sessions/{id}/hints` | 依据服务端结果锁定卡片、记录用过的提示并展示配对成功后的出处。 |
| 恢复进度 | `GET /sessions/{id}` | 取得已配对的公开 ID、错误数与提示计数。浏览器持有的未确认事件可按原事件 ID 重试。 |
| 交卷与建议 | `POST /sessions/{id}/finish`、`GET /sessions/{id}/report`、`POST /sessions/{id}/feedback` | 前两者返回逐项统计，反馈任务返回来源关联的复习建议。 |
| 重点再练 | `POST /sessions/{id}/practice` | 从薄弱或尚未完成的知识点开始，等待新的方案确认。只剩一个目标时加入一个已学知识点作对照。 |
| 删除 | `DELETE /materials/{id}`，请求头 `X-Material-Token` | 任务结束后，资料、游戏、会话和报告一起清理。 |

请求学习方案时可提交下面的偏好。题量支持 2–12 对，材料可用项少于请求数量时会返回实际题量及提示。

```json
{"material_id":"<材料 ID>","preferences":{"learner_level":"beginner","goal":"recognize","difficulty":"easy","pair_count":6}}
```

配对的请求体如下。提示只需左卡片 ID 和事件 ID。同一动作通过原 ID 重试，返回第一次的判定；复用 ID 提交另一动作返回 409。

```json
{"event_id":"<本次点击的 UUID>","left_id":"<左卡片 ID>","right_id":"<右卡片 ID>"}
```

耗时接口先返回 202。轮询遇到 `completed`、`failed` 或 `awaiting_confirmation` 时应停止。任务还会返回各阶段的 `stages_ms` 和实际工具记录 `tool_calls`。已完成的会话与报告保存在 SQLite，进程重启会把中断的任务标为可重试的失败。

## 学习统计与实验

- 首次正确率 = 首次答对的知识点数 ÷ 至少尝试过一次的知识点数。总尝试正确率 = 正确配对次数 ÷ 有效尝试次数。分母为零时率值为 `null`。
- 完成率 = 已配对数量 ÷ 本轮总数。例：四对中第一对先错后对、第二对首次正确，其余两对未动，三项指标依次为 1/2、2/3 和 2/4。
- `concepts[]` 给出每个知识点的尝试数、错误数、首次结果、提示数、出处和解释。答错、用过提示或尚未完成的知识点进入复习名单。
- 使用 `python -m backend.metrics --data-dir .local/offline` 可汇总当前目录的任务成功率和各阶段耗时。换成 `.local/live` 可查看模型模式的记录。生成成功率按结束的生成任务计算，重试是另一次任务。知识点质量与图示理解需要配套人工核查。

## A、B、C、D 怎样连接

- B 将原文段落、表格或图示关系转换为 `MaterialResult`，保留知识点 ID、来源 ID 和证据。真实模型输入受页数、图片数和文本块数限制。
- A 的 `MatchingAgent` 调用方案、生成、校验及反馈工具。适配器处理选定范围、学习偏好、已确认的设置和上一轮卡片。生成和反馈均可单独失败或重试。
- C 负责浏览器交互与恢复，D 负责上传、持久化和权威判定。浏览器从公开配置获取卡片。答案映射只存于服务端。
- 团队组合入口为 [CourseServices](../backend/integration.py)，共享模型在 [backend/models.py](../backend/models.py)，A 自身的协议在 [PartA/src/matching_agent](../PartA/src/matching_agent/)。已有外部适配器仍可用 `EDUGAME_SERVICE_FACTORY=包.模块:工厂函数` 注入。

## 运行环境与清理

- 默认在本机运行。每个数据目录运行一个服务进程。若对外提供服务，需要为部署环境配置访问控制、HTTPS 和模型调用配额。匿名会话适用于个人演示、教师投屏或受控课堂环境。
- 每份上传默认 10 MiB，PDF 最多 80 页，显式选页单次最多 10 页，单图最多 1600 万像素。Office 文件会校验容器类型、宏和展开大小。数据目录内的 `uploads/` 保存文件，`edugame.sqlite3` 保存业务记录。
- 默认使用 `.local/offline` 或 `.local/live`。设置 `EDUGAME_DATA_DIR` 可更换目录。每个后台服务阶段默认限时为本地 60 秒、模型模式 400 秒，可通过 `EDUGAME_SERVICE_TIMEOUT` 调整。生成阶段包含多次工具调用、校验和必要的修复，浏览器可轮询进度。超时结果会被丢弃。
- B 的服务设置为 `LLM_BASE_URL`、`LLM_API_KEY`、`LLM_TEXT_MODEL`、`LLM_VISION_MODEL`。A 使用 `DEEPSEEK_BASE_URL`、`DEEPSEEK_API_KEY`、`DEEPSEEK_MODEL`，所选服务需支持工具调用与 JSON 输出。组内分发代码时使用配置示例，真实密钥留在本机。
- 管理员需要清理较早上传、缺少浏览器删除凭证的资料时，可停服后运行 `python -m backend.cleanup --data-dir <数据目录> --material <材料ID>`。

## 开发验证

在项目根目录使用同一 Python 环境运行：

```shell
python -m pip install -r requirements-dev.txt
python -m pytest -q
npm ci
npm test
npm run test:e2e
```

Node.js 用于运行网页测试，日常启动只需 Python。Playwright 需要本机有可用的浏览器。常规测试使用临时资料和本地运行模式。带 `live` 标记的 A 端测试需另行启用，运行会产生外部调用。

本次图文验收使用 OpenLux 兼容接口与 GPT-4.1 mini。若使用同一服务，请先在系统环境中设置自己的 `OPENLUX_API_KEY`，再在本机 `.env` 中加入下面的配置。供应商按实际调用计费。

```dotenv
EDUGAME_MODE=live
LLM_BASE_URL=https://api.openlux.ai/v1
LLM_API_KEY=${OPENLUX_API_KEY}
LLM_TEXT_MODEL=gpt-4.1-mini
LLM_VISION_MODEL=gpt-4.1-mini
DEEPSEEK_BASE_URL=https://api.openlux.ai/v1
DEEPSEEK_API_KEY=${OPENLUX_API_KEY}
DEEPSEEK_MODEL=gpt-4.1-mini
LLM_TIMEOUT=75
AGENT_TIMEOUT_SECONDS=75
EDUGAME_SERVICE_TIMEOUT=400
```
