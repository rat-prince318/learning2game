# C ↔ D 前端接口契约

本文件把“详细分工”中的建议接口落实成当前 C 代码所消费的字段。它是供 D 对接的契约，不表示 D 已实现或已接受字段。D 若采用不同字段，统一修改 public/js/api.js 的返回适配，避免每个页面各自猜测。

## 通用约定

- 真实接口根路径：前端 `/api`，由 Node 代理到 `BACKEND_URL`。演示接口根路径：`/demo-api`。
- JSON 使用 snake_case。公开卡片 ID 是不含答案意义的独立字符串。
- POST 请求携带 `Idempotency-Key`；事件请求 body 同时包含 `event_id`。同 ID 的重复请求必须返回第一次的结果，不能重复计数或创建会话。
- HTTP 错误统一为 `{ "error": { "code": "MODEL_TIMEOUT", "message": "可给用户看的补充信息" } }`。兼容 FastAPI `detail`，但推荐明确 code。
- 未提供 Bearer Token 的应用不应把模型密钥放进前端。生产用户鉴权、授权、CORS、访问隔离由 D 负责。
- 图片和 source.url 应为浏览器可访问的 HTTP(S) URL 或同源路径；后端资源建议使用 `/api/materials/.../source`，不能直接返回本地磁盘路径。

## 学习偏好 UserPreferences

```json
{
  "level": "beginner",
  "goal": "definitions",
  "pair_count": 6,
  "time_limit_seconds": null
}
```

level：beginner / intermediate / advanced。goal：definitions / functions / english。创建页面提供 4/6/8 对；再练习可以由薄弱点数决定为 1–12 对。时间为空表示不限时；页面提供 120/180/300 秒。

## 端点与调用顺序

| 接口 | 请求 | 返回关键字段 | 前置条件及重复请求 |
|---|---|---|---|
| POST /materials | multipart：file、page_numbers（JSON 数组）、include_image（字符串布尔） | material_id、job_id | 文件已选；相同 Idempotency-Key 不重复创建 |
| GET /jobs/{job_id} | 无 | status、progress、result、error、tool_calls | 轮询直到终态，GET 不改变业务计数 |
| GET /materials/{id}/knowledge | 无 | material_id、topic、knowledge_items、warnings、tool_calls | 资料解析完成 |
| POST /matching-plans | material_id、preferences | plan_id、title、rationale、preferences、knowledge_ids | 资料已有可靠知识；参数变动时更新方案 |
| POST /games | plan_id、preferences、confirmed=true | job_id | 明确用户确认；同 key 返回原任务 |
| GET /games/{id} | 无 | GameConfigPublic | 生成并验证完成；不下发答案 |
| POST /games/{id}/sessions | event_id | SessionPublic | 每次重开新 event；重试同 event 不重复创建 |
| GET /sessions/{id} | 无 | SessionPublic | **刷新恢复需要此新增端点**；返回当前权威统计 |
| POST /sessions/{id}/attempts | event_id、left_card_id、right_card_id | is_correct、explanation、source（按反馈规则）、session | 活跃会话；同 event 返回原判分 |
| POST /sessions/{id}/hints | event_id、left_card_id | hint、term、hint_count、session | 活跃且未完成的概念；同 event 不重复提示计数 |
| POST /sessions/{id}/finish | reason、event_id | session、report_ready；报告异步时 job_id | reason=completed/exit/restart/timeout；重复结束不改变统计 |
| GET /sessions/{id}/report | 无 | LearningReport | 本轮结束，异步报告完成后读取 |
| POST /sessions/{id}/practice | preferences、confirmed=true、event_id | job_id | 有薄弱点且明确点击再练；同 event 不重复生成 |
| DELETE /materials/{id} | 无 | deleted=true（或 204） | 用户确认删除；D 负责清理材料及关联数据 |

## Job

```json
{
  "job_id": "job-opaque-id",
  "status": "validating",
  "progress": 0.75,
  "result": null,
  "tool_calls": [
    { "call_id": "call-1", "name": "validate_game", "status": "completed", "summary": "检查数量、来源与配对歧义", "elapsed_ms": 425 }
  ]
}
```

状态支持 queued、parsing、extracting、awaiting_confirmation、generating、validating、repairing、completed、failed。progress 可省略。材料终态 result={material_id}；游戏/再练习终态 result={game_id}。failed 必须提供 error；页面等待最长 120 秒，超时允许重新查询已有任务。

tool_calls 必须来自 A/D 实际运行记录，不能编造。演示服务返回空数组并明确标记 demo=true。

异步学习报告可在 finish 返回 job_id；前端等待该任务完成后读取 report。report 尚未准备好时也可返回 {job_id}，前端等待后重新读取。刷新恢复时同样支持这条路径。

## KnowledgeItem 与来源

```json
{
  "knowledge_id": "knowledge-opaque-id",
  "term": "细胞核",
  "definition": "储存遗传信息，协调细胞的生长与活动。",
  "quality": "reliable",
  "source": {
    "file_name": "细胞结构课件.pdf",
    "page": 3,
    "snippet": "与当前知识点直接相关的原文片段",
    "url": "/api/materials/material-id/source?page=3",
    "image_url": "/api/materials/material-id/images/image-id",
    "image_alt": "图中细胞核与相关细胞结构的关系"
  }
}
```

source.page / image_label / image_url 是可选字段。quality 不为 reliable 的项目会标记“待核对”，A/D 必须决定能否进入游戏。warnings 用于图像模糊、低置信度、资料不足等说明。

## GameConfigPublic

```json
{
  "game_id": "game-opaque-id",
  "title": "细胞结构配对",
  "rules": "先选概念，再选释义。提示使用情况会记录。",
  "pair_count": 2,
  "time_limit_seconds": null,
  "left_label": "概念",
  "right_label": "主要功能",
  "left_cards": [
    { "id": "a7f0-left", "text": "细胞核" },
    { "id": "b3e1-left", "text": "线粒体" }
  ],
  "right_cards": [
    { "id": "x9c2-right", "text": "参与细胞呼吸，为细胞提供 ATP。" },
    { "id": "y8d5-right", "text": "储存遗传信息，协调细胞活动。" }
  ]
}
```

禁止公开 answers、answer_map、pairs、pair_id、correct_*、卡片 knowledge_id、hint 或 explanation；服务端内部配置单独保存。卡片可以附加 image_url/image_alt；text 仍必须有可访问的文字说明。

所有左右 ID 全局唯一。引擎独立打乱左右数组，提交 ID，不提交索引。

## SessionPublic 与判分

```json
{
  "session_id": "session-opaque-id",
  "game_id": "game-opaque-id",
  "status": "active",
  "started_at": "2026-11-18T03:00:00.000Z",
  "deadline_at": null,
  "finished_at": null,
  "matched_left_ids": [],
  "matched_right_ids": [],
  "completed_pairs": 0,
  "attempt_count": 0,
  "error_count": 0,
  "hint_count": 0
}
```

status 支持 active / completed（全部配对完成）/ finished（提前结束）。deadline_at 是服务端给出的绝对时间。客户端显示倒计时并请求结束；D 必须独立校验时间。

提交示例：

```json
{ "event_id": "event-unique-id", "left_card_id": "a7f0-left", "right_card_id": "y8d5-right" }
```

判分返回：

```json
{
  "is_correct": true,
  "explanation": "细胞核储存遗传信息，与该功能描述对应。",
  "source": { "file_name": "细胞结构课件.pdf", "page": 3, "snippet": "原文片段" },
  "session": { "session_id": "session-opaque-id", "game_id": "game-opaque-id", "status": "active", "started_at": "2026-11-18T03:00:00.000Z", "deadline_at": null, "matched_left_ids": ["a7f0-left"], "matched_right_ids": ["y8d5-right"], "completed_pairs": 1, "attempt_count": 1, "error_count": 0, "hint_count": 0 }
}
```

网络失败后页面保留原 event_id。即使服务端已经处理、响应丢失，重试仍必须返回原 result。不能因会话已结束而拒绝返回已存在事件的原结果。

## LearningReport

必须提供：session_id、game_id、material_id、title、status、finish_reason、total_pairs、completed_pairs、completion_rate、attempted_concepts、unattempted_concepts、first_attempt_accuracy、overall_accuracy、attempt_count、error_count、hint_count、duration_seconds、knowledge_items、weak_knowledge_items、preferences、ai_feedback。attempts / hint_events 可选。

正确率为 0–1 的数值；没有分母时用 null，页面显示“—”。

- first_attempt_accuracy：首次就配对正确的知识点数 / 至少尝试过一次的知识点数。
- overall_accuracy：正确配对尝试数 / 有效尝试总数。
- completion_rate：完成配对数 / 总配对数。
- weak_knowledge_items：首次错误、多次尝试、使用提示或未完成的知识点。

每条知识结果：knowledge_id、term、definition、explanation、source、completed、attempted、first_attempt_correct（无尝试为 null）、attempt_count、error_count、hint_count、weak_reasons（字符串数组）。

AI 建议格式：

```json
{
  "origin": "llm",
  "summary": "基于本轮真实统计的简短建议",
  "suggestions": ["先复习某个概念的来源", "下一轮不使用提示尝试完成"]
}
```

演示 origin=prewritten_demo；页面据此明确展示“固定演示建议”。

## 错误码

UNSUPPORTED_FILE_TYPE、FILE_TOO_LARGE、EMPTY_FILE、FILE_UNREADABLE、IMAGE_BLURRY、KNOWLEDGE_INSUFFICIENT、MODEL_TIMEOUT、VALIDATION_FAILED、NETWORK_ERROR、REQUEST_TIMEOUT、JOB_TIMEOUT、SESSION_ENDED、ALREADY_MATCHED、NOT_FOUND、INVALID_CONFIG、INVALID_REQUEST、NO_WEAK_POINTS。

失败任务重试需新任务；未知结果的 HTTP 重试需同一幂等 ID。两种情况不能混淆。
