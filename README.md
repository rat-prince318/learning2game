# Learning2Game：成员 C 前端与 Matching Game 引擎

原生 HTML/CSS/JavaScript 实现的学习配对工作室，覆盖详细分工中的 C1–C7。用户路径为：选择资料 → 查看知识与方案 → 确认生成 → 点击配对 → 学习报告 → 薄弱点再练习。

## 快速启动

需要 Node.js 22 或更新版本。应用运行不需要安装第三方依赖。

```powershell
cd 'C:\Users\15870\Desktop\大二上\AIE1903\小组final\AI工作文件夹\learning2game'
npm.cmd start
```

浏览器打开 `http://127.0.0.1:5173`。点击“试用细胞结构教学样例”，然后点击“分析资料并推荐方案”。查看知识点后勾选确认，再生成并开始配对。

不要直接双击 `public/index.html`；ES Modules、上传和接口调用需要 HTTP 服务。

## 两种运行模式

### 教学演示（默认）

- 使用 `/demo-api`，展示预先编写的 8 个细胞知识点。
- 选择的文件用于前端预览；上传内容不保存、不发送外部模型，也不被分析。
- 判分、事件去重和统计在本地 Node 演示服务中运行，浏览器不接收答案映射。
- 练习记录保存在 `.data/demo.json`，重启服务后仍可恢复；该目录被 Git 忽略。
- 阶段、推荐和学习建议明确标为演示内容，不能作为真实多模态或 Function Calling 的实验结果。

### 接入成员 D 的真实后端

在启动前设置后端地址；当前页面、引擎和 API 层均可复用：

```powershell
$env:BACKEND_URL = 'http://127.0.0.1:8000'
$env:DEMO_MODE = 'false'
npm.cmd start
```

`DEMO_MODE=false` 关闭演示端点，并强制使用真实模式。也可以保留演示能力，在右上角“选择运行模式”中切换。

- 浏览器的 `/api/materials` 会代理到 `${BACKEND_URL}/materials`，其他端点同理。
- 若后端有统一前缀，例如 `/v1`，设置 `BACKEND_URL=http://127.0.0.1:8000/v1`。
- 真实接口失败会显示错误，**不会自动使用演示结果**。
- 前端不接触模型 API Key。代理可转发既有 Authorization/Cookie；本项目没有新增登录系统。
- 真实后端需要满足 [API 契约](docs/API_CONTRACT.md)，尤其是公开游戏、会话恢复、幂等事件和报告字段。

当前工作区没有 A/B/D 的真实实现。真实 HTTP 模式已用独立契约服务检查，但仍需要与团队的 FastAPI、数据库和 Agent 做联合验收。

## 文件结构

```text
learning2game/
  public/
    index.html             三个页面、表单、对话框
    styles.css             响应式布局、键盘焦点和状态样式
    js/
      app.js               页面流程、任务轮询、恢复、重试和路由
      api.js               全部 HTTP 接口、超时与错误码
      engine.js            点击配对、提交锁、独立乱序与过期响应隔离
      views.js             卡片、知识来源和报告渲染
      utils.js             页码解析、安全文本、文件检查、本地引用
    examples/              固定教学文字与原生 SVG 图示
  server/
    index.js               静态服务与真实后端代理
    demo-service.js        独立演示接口、服务端判分和统计
    seed.js                仅服务端可读取的教学配置
  tests/
    engine.test.js         状态机与乱序检查
    api.test.js            HTTP、错误与轮询检查
    server.test.js         接口、幂等、统计和再练习检查
    browser/               C7 可重复的浏览器检查
    fixtures/              PDF 和图像检查资料
  docs/                    接口、贡献、演示及检查记录
```

## 运行检查

```powershell
npm.cmd run check
npm.cmd test
```

浏览器检查使用官方 Playwright 开发依赖：

```powershell
npm.cmd ci
npm.cmd run test:e2e
```

Windows 默认调用已安装的 Microsoft Edge。其他环境可以设置：

```powershell
$env:BROWSER_CHANNEL = 'chrome'
npm.cmd run test:e2e
```

也可移除 channel 配置，安装 Playwright Chromium 后运行。检查产物写入 `artifacts/`，包含截图、JSON 结果及失败时的 trace；均不进入 Git。

## 成员 C 的实现边界

1. 前端只提交左卡片 ID、右卡片 ID、事件 ID；正确率取自服务端。
2. 卡片不使用数组索引作为答案依据，也不共享 pair_id；未配对时不会下发解释或答案关系。
3. 未确认的配对事件重试时复用原 ID；刷新后先恢复真实会话统计。
4. 页面里的资料/模型错误提示对应后端错误码。文件真实格式检查、图像质量判断、模型调用与知识验证由 B/A/D 实现。
5. 学习水平与目标会传给方案和生成接口；演示中的表达变化为固定规则，真实个性化效果需用 A 的真实输出评估。
6. 删除入口会调用后端 DELETE /materials/{id}。若真实后端没有实现，页面会报告失败，不会宣称远程记录已删除。

详见 [成员 C 交付说明](docs/MEMBER_C_DELIVERY.md)、[API 契约](docs/API_CONTRACT.md)、[检查结果](docs/TEST_RESULTS.md)。
