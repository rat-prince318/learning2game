# RPG 前后端接口契约 1.0

已发布的 RPG 关卡支持两种游玩方式。本文记录 NPC 任务会话；答题攻击、关底首领、装备和战败复习使用[独立的战役接口](rpg-battles.md)。

组员二可从 [六题三场景响应](rpg-fixtures/normal/game-public.json) 和 [单题再练响应](rpg-fixtures/practice/game-public.json) 开始接地图、任务和报告。每组的 JSON 来自同一次 API 验收。完整类型以 [Pydantic 导出的 JSON Schema](../schemas/rpg/) 为准。后端启动方式和模型配置见[后端交接](rpg-backend-handoff.md)。

## 从上传到出题

沿用原站的请求前缀，同源部署时从站点根路径请求。所有 202 响应都有 `job_id`，使用 `GET /jobs/{job_id}` 轮询。任务的 `mode` 标明运行环境，`game_type` 标明玩法，提取与通用推荐为 null。终态 `failed` 带 `error`，大部分成功任务为 `completed`，方案和再练为 `awaiting_confirmation`。

| 方法和路径 | 前端提交 | 成功响应 |
| --- | --- | --- |
| GET /health | 无 | supported_game_types，内置 offline 和 live 服务均支持 matching、rpg_quest |
| POST /materials | multipart 的 file，可选 pages、include_images | 202，material_id、job_id、delete_token |
| GET /materials/{id}/knowledge | 无 | knowledge、warnings，知识点含 knowledge_id、释义与来源 |
| POST /game-recommendations | material_id、preferences，可仅含 goal、learner_level、difficulty | 202，轮询 result.recommendation，含 recommended_type、rationale、warnings、supported_types、mode |
| POST /rpg/plans | material_id、preferences | 202，轮询 result.plan_id、result.plan |
| POST /rpg/games | plan_id、confirmed（布尔值 true） | 202，轮询 result.game_id |
| GET /rpg/games/{id} | 无 | 玩家公开配置 |
| POST /rpg/games/{id}/sessions | 无 | 201，全新会话进度 |
| GET /rpg/sessions/{id} | 无 | 当前会话进度 |
| POST /rpg/sessions/{id}/actions | 严格动作对象，见下节 | event_id、action、feedback、progress |
| POST /rpg/sessions/{id}/finish | 无 | 保存并返回报告，再次提交返回原报告 |
| GET /rpg/sessions/{id}/report | 无 | 已结束的报告 |
| POST /rpg/sessions/{id}/feedback | 无 | 202，轮询 result.feedback |
| POST /rpg/sessions/{id}/practice | 无，或含 preferences 的对象 | 202，轮询新 plan_id、plan，重新确认 |
| DELETE /materials/{id} | X-Material-Token 请求头 | 204 完成；202 表示文件等待释放，数据库记录已删除 |

常规练习至少 3 个知识点，每轮最多 8 个。单题再练使用原资料中其他知识构造备选项。默认 6 题、3 个场景；可选 1 至 4 个场景。实际数量写在方案里。每个选中的知识点恰好考一次。显式范围允许少于期望题量；选中数量超过题量时请调高题量。主题取 `laboratory`、`campus`、`fantasy`。难度取 `easy`、`medium`、`hard`，基础取 `beginner`、`familiar`。学习目标取 `review`、`preview`、`classroom`、`recognize`、`distinguish`。示例请求如下。

```json
{"material_id":"<上传得到的 ID>","preferences":{"goal":"review","learner_level":"beginner","difficulty":"medium","challenge_count":6,"scene_count":3,"theme":"laboratory","selected_knowledge_ids":null}}
```

修改偏好，请重新 POST 方案并让用户确认新的 plan_id。再练时用同一个 `/practice` 接口提交修改后的偏好，保留服务端认定的薄弱范围。同一份方案的重复确认返回同一个生成任务；任务失败后重试会得到新的 job_id。推荐只给出建议，用户可以改选。

## 关卡与动作

按 `start_scene_id` 绘制起点，按各场景 `next_scene_id` 绘制路线。页面能画出全图，可进入的节点取会话中的 `unlocked_scene_ids`。场景使用内置资源键 lab、campus、forest。每个场景有一位 NPC 和一个任务，按 quest.challenge_ids 的次序呈现题目，每题 3 至 4 个选项。题干、选项和剧情按纯文本渲染。遇到未来版本，先核对 schema_version 再打开。

| action | 除 event_id 和 action 外的字段 | 允许时机 |
| --- | --- | --- |
| enter_scene | scene_id | 目标场景已解锁 |
| accept_quest | quest_id | 已进入所属场景 |
| attempt | challenge_id、option_id | 当前已接任务的下一道未解决题 |
| hint | challenge_id | 同上，每题可领一次 |

```json
{"event_id":"<本次操作生成的 UUID>","action":"attempt","challenge_id":"<题目 ID>","option_id":"<所选 ID>"}
```

首次答错返回重试指引。答对或第二次答错会返回出处、解释、正确选项和奖励变化。第二次答错时 `remediated=true`，推进剧情并将该知识点记入再练。提示计入 `hints_by_challenge`；刷新后从 `revealed_hints` 读取原文。最近一次教学反馈保存在 `last_feedback`，包括对应题目的 ID。

首次独立答对得 10 XP，第二次答对或使用提示后答对得 6 XP，讲解后完成得 0 XP。任务完成另加 20 XP 并发放物品，动作反馈 `reward_delta` 包含该次所有奖励。服务端发放奖励后解锁下一场景。最后一个任务完成后 `all_quests_completed=true`，页面提交 finish；提前离开也用 finish。重复游玩用同一 game_id 新建会话。

网络重试复用原 event_id 和完全相同的请求体。同 ID 改选项返回 409。重放返回原动作当时的进度，包括 finish 后重放；比较 `session_id` 与 `revision`，需要时 GET 最新会话。新建会话 revision=0，以后单调增长，序号可能跳跃。进度含 started_at 和 elapsed_seconds。客户端可用本地计时器显示经过时间，结局时间取已保存报告。

## 统计与错误

首次正确率按首次答对的知识点数除以至少答过一次的知识点数。总尝试正确率按正确作答次数除以有效作答次数。分母为零时返回 null；第一次答题前看过提示仍可记首次正确，报告另列提示数。完成率计入答对与讲解后完成两类。首次出错、用过提示或尚未解决的知识点进入 weak_knowledge_ids。XP 单列展示。[报告样例](rpg-fixtures/normal/report.json)

读不到资源时返回 404；会话状态、玩法、事件重用或解锁顺序冲突返回 409；请求字段、确认标志或题目引用的选项有误返回 422。未配置对应服务时返回 503。HTTP 错误位于 `error.message`；已受理的后台任务失败，则从轮询结果的 `error` 字符串取说明。反馈任务可单独重试。[错误和失败样例](rpg-fixtures/errors)

## 样例使用约定

- [normal](rpg-fixtures/normal) 是同一会话的 6 道题，第一题经历两次答错，其余五题首次答对。session-restored 采集于第一次答错后。反馈和报告都来自该会话。
- [practice](rpg-fixtures/practice) 只练上轮的第一个薄弱点。主示例循两次错误后完成的路径；action-correct 来自同一游戏的新会话，展示另一条结局。
- [profiles](rpg-fixtures/profiles) 是另一种难度或学科的方案与发布结果；[recommendations](rpg-fixtures/recommendations) 展示两种建议。文件名带 private 的答案配置仅供后端开发和教学核查。浏览器请求 game-public 或 GET 游戏接口。
- [自动导出](../scripts/export_rpg_schemas.py) 使用实现中的类型重新生成 Schema，运行 `python -m scripts.export_rpg_schemas` 即可。
