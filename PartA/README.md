# Matching Game Agent

本目录保留 A 组员的独立模块与样例。运行完整网站请从[项目首页](../README.md)开始；应用中的真实来源、工具调用和会话统计由四个模块共同提供。

AIE1903 项目的 A 模块。输入 B 提供的结构化知识，经真实工具调用生成个性化方案，用户确认后生成和验证配对游戏，再根据 D 的统计生成反馈与下一轮练习参数。

提供 Python 异步接口与命令行。文档解析、真实图像理解、网页配对、服务端判分和数据库由 B/C/D 接入。项目只生成游戏数据，不生成可执行网页代码。

## 现在可以运行

本目录已经建立 `.venv` 并安装依赖。在 PowerShell 中：

```powershell
# 离线完整演示，包括模拟反馈、下一轮方案和再练习
.\.venv\Scripts\python.exe -m matching_agent demo --mode offline --yes --practice

# 演示重复定义被发现并修复
.\.venv\Scripts\python.exe -m matching_agent demo --mode offline --yes --inject duplicate

# 演示两次修复失败：保存问题报告，不导出游戏
.\.venv\Scripts\python.exe -m matching_agent demo --mode offline --yes --inject persistent_duplicate

# 自动测试，不调用真实 API
.\.venv\Scripts\python.exe -m pytest -q -m "not live"
```

离线模式使用确定性测试替身。它验证程序流程，不能证明真实模型的知识准确性或提示词注入防护效果。`examples/` 内的材料、配置、统计及改写都是人工编写的测试样例。

如需在另一台电脑安装，先安装 Python 3.12，再执行：

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock.txt
.\.venv\Scripts\python.exe -m pip install -e . --no-deps
```

`requirements.lock.txt` 固定本次验证版本；开发依赖声明在 `pyproject.toml`。

## 接入真实 DeepSeek

在本地 `.env` 中设置密钥，不要将文件提交到 Git。如果尚无 `.env`，复制 `.env.example`。默认配置为：

```dotenv
DEEPSEEK_API_KEY=在本地填写
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-flash
AGENT_TIMEOUT_SECONDS=60
```

代码使用官方兼容的 OpenAI SDK、Chat Completions、非流式输出，并显式关闭 thinking。`deepseek-flash` 是官方当前推荐的 V4.1 Flash API 名称，见[官方文档](https://api-docs.deepseek.com/)。

```powershell
.\.venv\Scripts\python.exe -m matching_agent demo --mode live
```

看到方案后输入 `CONFIRM` 才开始生成；输入 `EDIT` 可修改水平、目标、题量、知识范围；其他输入取消。真实模式不接受离线测试用的 `--yes`，也不会在 API 失败时自动回退到固定样例。

若要用真实模型演示反馈与再练习，仍使用明确标注的模拟 D 统计：

```powershell
.\.venv\Scripts\python.exe -m matching_agent demo --mode live --demo-feedback --practice
```

真正的学习统计应通过 `feedback --statistics` 传入。`runs/` 保存每次独立运行的 manifest、方案、确认快照、内部配置、反馈和调用事件。输出目录必须为空，避免覆盖旧结果。内部配置包含正确答案，只交给 D，不能直接下发 C 的浏览器。

## 分步运行与接入

```powershell
# 单独生成方案
.\.venv\Scripts\python.exe -m matching_agent plan --mode offline --count 4 --level familiar --output runs/plan_example

# 读取保存的方案，交互确认后生成游戏
.\.venv\Scripts\python.exe -m matching_agent generate --mode offline --plan runs/plan_example/plan.json

# 使用 D 的统计生成反馈；下面三份文件是相互匹配的样例
.\.venv\Scripts\python.exe -m matching_agent feedback --mode offline --knowledge examples/knowledge/computing.json --game examples/games/computing.json --statistics examples/statistics/computing.json

# 用反馈中的参数生成下一轮方案，确认后改写上一轮表述
.\.venv\Scripts\python.exe -m matching_agent practice --mode offline --knowledge examples/knowledge/computing.json --game examples/games/computing.json --feedback examples/feedback/computing.json
```

`--preferences path.json` 支持完整用户偏好，包括选中、排除和薄弱知识点。正式调用中，D 应保留原轮次的偏好并在生成反馈时继续传入，避免丢失用户限定的范围。

```python
from matching_agent import MatchingAgent, KnowledgeBundle, UserPreferences
from matching_agent.llm import DeepSeekClient

# 在应用启动处读取本地环境；Web 部署由环境变量注入密钥。
client = DeepSeekClient()
agent = MatchingAgent(client, on_event=save_job_event)
plan = await agent.prepare_plan(bundle, UserPreferences())
# D 保存 plan，C 展示并等待用户明确确认。
confirmed = agent.confirm_plan(plan, bundle)
result = await agent.generate_game(bundle, confirmed)
if result.game is not None:
    await save_internal_game(result.game)
# 应用关闭时释放连接
await client.close()
```

`save_job_event` 和 `save_internal_game` 是 D 的实现位置。完整数据字段见 [接口契约](docs/CONTRACTS.md)，流程与工具说明见 [Agent 设计](docs/AGENT_DESIGN.md)，当前验证记录见 [验收报告](docs/VALIDATION_REPORT.md)。

## 证据与协作交付

- `examples/knowledge/`：B → A 的三学科知识样例；`examples/materials/` 是可对照的原始测试材料。
- `examples/games/`：固定 6 对的内部配置，供 D 转换为公开卡片后给 C 使用。
- `examples/statistics/`、`examples/feedback/`：D → A 与 A → D 的配套样例。
- `schemas/`：由 Pydantic 模型导出的 JSON Schema，修改契约后运行 `scripts/build_examples.py` 更新。
- `evidence/offline/`：成功、修复、失败与不足材料的离线记录。用 `scripts/offline_acceptance.py` 可重新生成。
- [团队交接清单](docs/HANDOFF.md)：各成员第一批需要对接的内容。
- [内容核对表](docs/CONTENT_REVIEW.md)：人工审阅方法及目前尚未完成的内容验收。

真实验收显式开启，测试框架作为可信宿主确认测试方案，会产生 API 费用：

```powershell
$env:MATCHING_RUN_LIVE = "1"
.\.venv\Scripts\python.exe -m pytest -q -s -m live
Remove-Item Env:MATCHING_RUN_LIVE
```

四个测试覆盖三学科的实际工具调用、生成、验证和反馈，计算机样例还运行下一轮练习；另一个测试人为注入重复定义，验证真实模型修复且保留有效配对。真实日志写入新的 `runs/live_*` 目录。测试材料与统计仍是样例，故障注入也明确标记。未显式启用或缺少密钥时真实测试跳过。
