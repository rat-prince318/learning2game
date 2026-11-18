# EduGame Agent

将课程资料变成可确认、可游玩、可追溯到原资料的配对练习。本分支提供 D 的 FastAPI 后端、SQLite 存储、判分、学习报告和 A/B/C 共用的数据格式。

## 本地启动

在仓库根目录运行以下 PowerShell 命令。已验证 Python 3.11；如果系统将 Python 命令命名为 `python`，首行可以使用 `python -m venv .venv`。

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --env-file .env --host 127.0.0.1 --port 8000
```

打开 [交互式 API 文档](http://127.0.0.1:8000/docs)。[健康检查](http://127.0.0.1:8000/health) 中的 `mode` 会显示当前服务模式。

| 现在要做的事 | 入口 |
| --- | --- |
| C 开发游戏界面 | 获取[六组配对的演示关卡](http://127.0.0.1:8000/demo/game)，用返回的 `game_id` 创建会话。判分、提示、刷新恢复和报告都走真实后端。 |
| 全组演示从上传到再练习 | 下载[示例讲义](http://127.0.0.1:8000/demo/material)，在 API 文档上传它，按对接说明完成方案确认、游玩和再练习。 |
| A、B 接入真实 Agent 和多模态解析 | 实现服务协议，在本机配置 `EDUGAME_SERVICE_FACTORY`，将 `EDUGAME_DEMO` 设为 `0`。 |

演示模式只识别随附讲义，使用预先编写的六个知识点，可离线使用业务 API。Swagger 文档界面的静态资源默认从 CDN 加载。真实课件和图示的理解由 B 的适配器提供，实际模型工具调用、出题和语义校验由 A 提供，网页由 C 提供。

调用顺序、请求示例、错误处理、统计口径和数据清理见[团队对接说明](docs/integration.md)。运行测试和汇总本地实验记录可用以下命令。

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-dev.txt
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m backend.metrics --data-dir .local/demo
```
