# 第一人称篮球配对

打开首页，点 **直接上场**。热身赛用四个力学问题介绍球场，例如“质量为 2 千克的篮球以每秒 3 米的速度运动，它的动能是多少？”找到写着 **9 J** 的篮板，把球投进去。完整开局方式见[项目首页](../README.md)。[观看实机录像](media/matching-basketball.mp4)

## 在场上怎么打

| 操作 | 桌面 | 触屏 |
| --- | --- | --- |
| 走位 | WASD | 左侧方向摇杆 |
| 环视 | 鼠标右键拖动或方向键 | 在场地上拖动瞄准 |
| 手投 | 按住鼠标左键或空格蓄力，参考瞄准轨迹，松开出手 | 在场地按住、拖动，松手投球，也可按住底部投篮按钮 |
| 看清题目和答案 | 球身、篮板和下方读题区都有文字。点「换球」或「看篮板」可读完整内容和公式 | 相同 |
| 辅助出手 | 选择篮板，点「辅助投篮」。系统计算抛物线，球仍需经过篮圈 | 相同 |
| 收球和声音 | R 收球；菜单可切换碰撞与刷网声 | 投偏后球会回到手中；菜单里可调声音 |

每轮支持 2 至 12 个知识点。系统把完整配对均分到一组或多组球架，每组开场有 2 至 4 个可选篮筐。答对的球和篮筐退出本轮。正确配对、选错篮筐和使用提示分别记录。普通打铁和投偏可以反复练习。切换中英界面保留当前进度，选择出题语言应在上传资料、生成方案之前完成。

## 用自己的资料出题

1. 准备后端的 Python 环境。在线出题还需要 Node.js 22 或更高版本来验证数学公式。仓库附带浏览器需要的引擎文件，普通游玩无需安装 npm 依赖。
2. 将百炼北京地域的服务凭证放在本机 `.env` 的 `DASHSCOPE_API_KEY`，将 `EDUGAME_MODE` 设为 `live`，运行 `python run.py`。首页的模式按钮会显示「云端模型」。选择 `offline` 可体验已生成的热身题及本地定义配对。
3. 上传 PPTX、PDF、DOCX、Markdown、TXT 或受支持的图片，选择语言、知识点和题量。资料和所选片段会按配置发送给模型服务，本地数据库保存本轮的出处和学习记录。

百炼上的 `deepseek-v4.1-flash-1017` 生成球题、篮板、提示和讲解。视觉模型可在资料解析阶段读取扫描或图示。组题器优先采用正文、可验证的题目条件和已知解答，过滤课程行政信息、前后句背诵和缺图才能作答的题。题面只发布文字与公式。图示、扫描质量和原题信息不足会影响可用题量。[百炼 DeepSeek 模型说明](https://help.aliyun.com/zh/model-studio/deepseek-api)

发布前，系统用前端同版本的 KaTeX 检查公式，再让模型只看球题和打乱的篮板独立配对。另一次审核对照原始证据，复查条件、答案、单位和解析。遇到歧义会退回重写，连续失败会要求调整知识点。盲审与核对仍使用语言模型，教师可根据报告中的出处复核课堂用题。[生成和审核实现](../backend/basketball_questions.py)

## 工程交接

| 位置 | 维护内容 |
| --- | --- |
| [court.js](../public/matching/court.js)、[gym.js](../public/matching/gym.js) | Three.js 第一人称相机、视野、持球与出手、球馆、手部模型、投射到场景的题字 |
| [physics.js](../public/matching/physics.js)、[court-audio.js](../public/matching/court-audio.js) | cannon-es 刚体、120 Hz 固定步长、分段篮圈、碰板和落地、向下穿圈检测及合成音效 |
| [session.js](../public/matching/session.js)、[engine.js](../public/js/engine.js) | 球架选择、读题、暂停、判分、幂等重试和刷新恢复 |
| [games.py](../backend/games.py)、[sessions.py](../backend/sessions.py) | 按完整配对分场、打乱两边、服务端核对球和篮筐的标识 |
| [court_warmup.py](../backend/court_warmup.py)、[内置球题](../backend/fixtures/) | 每种语言共用一份已审查的热身题，每次开新局有独立的学习记录 |

同一台运行服务的电脑上，`/?court=<game_id>#play` 可直接进入某局，适合课堂演示。链接指向游戏所在服务。另一台设备或另一台服务器需能访问该服务和相应的数据库。

球馆、篮球纹理和音效由项目代码生成。Three.js 和 cannon-es 的版本锁定在 npm 锁文件，附带各自的 MIT 许可证。更新依赖后执行 `npm ci`、`npm run build:court` 重建本地模块。开发时参考了 cannon-es 的第一人称交互示例，以及 OpenTest、EduQG 的基于材料生成试题设计。[cannon-es 示例](https://github.com/pmndrs/cannon-es/blob/master/examples/threejs_fps.html) | [OpenTest](https://github.com/felipepov/opentest) | [EduQG](https://github.com/hadifar/question-generation)

## 已验收范围

- 浏览器中实际操作了持球走位、手投、投偏、投进错误篮筐并改投、提示、刷新恢复、提前结算和重点再练。窄屏验收使用 390 × 844 视口。WebGL2 不可用时，简化画面继续使用相同的物理系统。
- 以自编的 PPTX 数据结构课件、Markdown 物理讲义、DOCX 习题、PDF 英文电路试卷和 TXT 水循环教材走通在线流程。电路题生成的中文答案为 24 V 与 15 W，另一道需要缺失插图的题被跳过。
- 回归入口为 `npm test`、`npm run check`、`python -m pytest` 和 `npx playwright test tests/browser/basketball.spec.js tests/browser/learning-flow.spec.js tests/browser/study.spec.js`。浏览器原生投篮回归仍需能运行 Chromium 或 Edge。
