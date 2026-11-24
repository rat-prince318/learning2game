# Learning2Game 课程工坊与灯路远征

**灯路远征**是一款俯视像素 RPG。在首页点 **进入远征 RPG**，用 WASD 从烟柳渡的木桥一路走到日轨天台。跟着金色箭头找人、修机关、打守军。你可以带自己的讲义和试卷上路，或用含 32 个知识点的驿站手册。建档时可选中英文。普通巡逻战至少三轮，灰冠龙将至少五轮。打完一仗可以回到交手的位置，章末走到出口领补给，再前往下一站。[八章地图与实机录像](docs/lantern-road.md) | [物理试卷验收与支持范围](docs/exam-question-quality.md)

**第一人称篮球场**把每个知识点变成一次投篮。球上印着题目，篮板上写着候选答案。首页点 **直接上场** 就能打四球热身赛，也可以上传自己的资料，让 DeepSeek Flash 为这节课出题。[观看实机投篮](docs/media/matching-basketball.mp4) | [操作和出题说明](docs/matching-basketball.md)

![手持篮球面对三座篮筐，篮板分别显示牛顿第二定律、动量和功的公式](public/matching/court-preview.webp)

## 在自己的电脑上打开

1. 安装 Python 3.11 或更高版本，下载或克隆这个仓库。
2. Windows 用户双击仓库根目录的 **start.cmd**。在 Windows、macOS 或 Linux 的项目目录，也可运行下面的命令。

```shell
python run.py
```

首次启动会建立项目专用的 Python 环境并安装依赖，需要联网。启动器会打开浏览器并打印本机地址，通常是 `http://127.0.0.1:8000/`。若另一份项目占用了该端口，启动器会自动寻找下一个空闲端口。使用期间请保持终端打开，结束时按 Ctrl+C。指定端口可运行 `python run.py --port 8001`。

## 试一局

1. 首页点 **直接上场**。想练自己的课，点 **使用自己的资料**，上传文件、选择知识点和难度，再确认开局。
2. 看手中篮球上的题目，寻找写着答案的篮板。WASD 移动，按住鼠标左键拖动瞄准，松手投篮。用方向键和空格也能投。
3. 想专注做题时，点 **看篮板** 选择答案，再点 **辅助投篮**。球进筐后才判分。投偏了可以立刻再试。
4. **投篮记录** 可以回看解析和出处。结束训练后查看各知识点的首次正确率，选择需要巩固的内容再开一场。

模型模式可试用[校园打印图文讲义](public/examples/campus-printing.pdf)。系统从文字和图示中提取有依据的内容，篮球和篮板上的题目都以文字和公式呈现。

![一次四对卡片练习的实际报告，首次正确率 50%，总尝试正确率 67%，完成率 50%](docs/media/study-report.png)

## 两种处理方式

| 模式 | 能做什么 | 配置 |
| --- | --- | --- |
| 本地离线 | B 解析真实资料，用规则识别带定义的知识点。A 按资料组题、校验和生成反馈。支持 TXT、Markdown、PDF、DOCX、PPTX 中的文本。 | 默认启用，业务运行全程本地。 |
| 模型模式 | B 分析文字与图像并保留来源。篮球题使用 DeepSeek Flash 出题、盲解和复核。另支持直接上传 PNG/JPEG。 | 复制 `.env.example` 为 `.env`，填写北京地域百炼的 `DASHSCOPE_API_KEY` 后重启。公式校验需要 Node.js 22 或更高版本。已有独立服务配置的组员可显式设置 `EDUGAME_MODE=live`。 |

在首页选择「进入远征 RPG」，上传课程资料即可准备笔记和练习。配置、资料范围和验收样例见[远征课程出题与手记](docs/rpg-course-lessons.md)。

资料、会话和报告保存在本地 `.local/`。模型模式会按配置向服务商发送课程内容，可能产生调用费用。课堂演示可使用自编讲义。凭证由后端读取。

## 组员维护入口

| 模块 | 代码 |
| --- | --- |
| A 配对 Agent | [工具编排与内容校验](PartA/src/matching_agent/)、[应用适配器](backend/agent_adapter.py) |
| B 资料理解 | [文档和图像读取](backend/material_processing.py)、[知识点、证据与质量检查](backend/material_adapter.py) |
| C 网页与游戏交互 | [网页源码](public/)、[浏览器验收](tests/browser/) |
| D 集成与学习记录 | [FastAPI 入口](backend/main.py)、[任务流程](backend/pipeline.py)、[判分和报告](backend/sessions.py) |
| RPG 答题战役后端 | [八章远征、战术首领与进阶周目](docs/rpg-expedition.md)、[单卷战役](docs/rpg-battles.md)、[资料生成和会话对接](docs/rpg-backend-handoff.md) |
| RPG 烟柳渡首领战 | 启动后打开 `/rpg/battle/`，体验答题交战、营地修习和战后结算。[试玩与前端交接手册](docs/rpg-battle-frontend.md) |

运行后的 `/docs` 提供交互式 API 文档，`/health` 显示当前模式。[真实模型与浏览器验收记录](docs/acceptance.md)包括遗漏项、修正和实测耗时。API 调用顺序、配置、统计口径和数据清理方法见[对接与测试说明](docs/integration.md)。
