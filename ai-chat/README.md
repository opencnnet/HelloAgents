# HelloAgents 对话（ai-chat）

HelloAgents 的独立聊天前端：Web 静态站点 + Tauri 2 桌面客户端，同一份 Vue 3 代码双端产出。

本目录是**独立新增目录**，不改动仓库里任何原有文件，便于持续跟进上游更新（`git pull` 时不会与本地改动冲突）。原来 `examples/web` 下的演示页保持原样，新界面通过「智能体服务」连接方式对接同一个 FastAPI 后端。

视觉方向参考 ChatGPT 的本地聊天体验：中性浅色侧栏、可折叠图标栏、本地会话列表、居中的新对话输入区。应用不需要登录或用户账号；设置、会话与主题保存在本机。

## 连接设置

- **智能体服务**：对接原项目 `POST /agent/stream`，支持选择 `simple / react / reflection / plan` Agent 类型，并把工具调用事件展示在消息中；最终答案以 `agent_finish.data.result` 为准。
- **直接连接模型**：连接云端或本地 LLM 服务；支持 OpenAI 兼容、本地模型，以及 Anthropic Messages API。自定义地址通过 OpenAI 兼容类型填写。

智能体、模型、MCP 与技能在设置页各自独立成页签，分别保存配置；模型和智能体都需要配置并通过连接检测，底部状态图标才会显示为已连接。模型服务下的 OpenAI 兼容、Anthropic 兼容和本地模型各自保存独立的大模型别名、接口地址、密钥和模型名称；下拉框选择当前模型配置，应用后后续请求使用该配置，切换服务类型不会覆盖其他类型的配置。智能体服务也可设置名称（默认“本地智能体”）。连接详情按“服务、状态、名称、地址、类型”展示，名称用于区分配置。旧版本中已保存的模型配置会迁移到其对应的服务类型。

直接连接模型时，客户端会发送 Temperature、Top P、最大输出 Tokens 和流式开关；系统提示词作为 system 消息发送。OpenAI 兼容服务从 `/models` 获取模型列表；Anthropic 使用 `/v1/models` 和 `/v1/messages`，以 `x-api-key` 和 `anthropic-version` 请求头鉴权。两种模式均可手动输入模型名称。

“保留历史轮数”是客户端的上下文裁剪设置，不是模型参数，适用于直接连接模型和智能体服务。智能体服务模式下，Temperature 和最大输出长度由服务端配置，当前 `/agent/stream` 接口不支持单独设置 Top P。频率/存在惩罚等可选参数未提供，因为各家模型支持情况不同。

连接状态入口位于侧栏底部的主题切换下方；点击后在主内容区打开独立的连接状态页面，展示模型连接、智能体连接和已配置 MCP 服务的详细状态，表格列宽可调整。可通过侧栏选择会话或新建对话返回聊天。已启用的 MCP 服务会参与总状态并显示为「未连接」（尚未做独立探测）；禁用的 MCP 服务不影响总状态。主聊天区不再显示页脚状态栏。

设置页的「MCP」页签可以录入 MCP stdio / Streamable HTTP 服务、命令或地址、工具前缀、工具白名单与连接超时。应用后，启用中的服务会随 `/agent/stream` 请求发送给后端；后端按配置指纹维护**常驻连接池**（首次使用时拉起 stdio 进程或连接 HTTP 地址，后续请求复用，空闲 10 分钟或出错时自动重建/断开），并把工具注册进 ReAct 智能体的工具表；连接失败会在聊天中提示具体服务名。启动命令支持绝对路径、PATH 中的可执行名（如 `python`、`npx`），也支持相对路径（相对于后端服务的工作目录，通常是仓库根目录）。使用前需安装 MCP 依赖（`uv sync --extra web --extra mcp`）。MCP 目前没有独立的连通性探测，所以状态页的 MCP 行仍显示「未连接」；HTTP 认证配置也尚未提供。

设置页的「技能」页签以表格列出后端技能目录（默认仓库根目录 `skills/`）中已安装的技能，表头列宽可拖动。支持两种导入方式：表单填写名称/描述/正文，或直接上传 `.zip` 技能包（包内需含 `SKILL.md`，可带 `scripts/`、`examples/`、`references/` 等附属文件）。导入、列表、删除都走后端接口（`GET/POST /agent/skills`、`POST /agent/skills/upload`、`DELETE /agent/skills/{name}`），开发与预览时经 Vite 的 `/agent` 代理访问，因此需要后端在运行；桌面端（Tauri）暂未实现对应命令，技能管理目前只在 Web 端可用。技能由后端在构建智能体时加载，服务端不需要重启即可生效。

智能体使用的大模型来自「设置 → 模型」中当前选中的那份配置：请求会带上 `llm`（地址、模型名、密钥、协议），后端据此创建 `HelloAgentsLLM`，因此不需要在后端再配 `LLM_*` 环境变量；若未填写模型或密钥，后端回落到离线预设模型（或 `HELLOAGENTS_DEMO_LIVE=1` 时的环境变量模型）。密钥只在当次请求中经本机代理传给本地后端，服务端不持久化。地址按协议归一：OpenAI 会去掉 `/chat/completions` 由 SDK 重新拼接；Anthropic 只去掉 `/v1/messages` 之类的具体路径，保留自定义前缀（例如兼容网关的 `.../chat/completions` 前缀）。

配置入口只有侧边栏底部的「设置」，连接状态只展示在底部状态栏。未配置时界面正常渲染、输入区禁用并说明原因。

## 运行环境

- Node.js 20+ 与 pnpm（`corepack enable` 后即可使用 `pnpm`）
- 桌面端额外需要：Rust 工具链（rustup）、Tauri 系统依赖。Windows 需要 MSVC Build Tools 与 WebView2（Windows 10/11 通常已自带）

```bash
pnpm install
```

## Web 端

```bash
pnpm dev       # 开发：http://127.0.0.1:5173
pnpm build     # 类型检查（vue-tsc）+ 构建，产物在 dist/
pnpm preview   # 预览构建产物：http://127.0.0.1:4173
```

`pnpm lint` 可运行 ESLint。

### 一键跑通（Windows，推荐）

首次安装依赖（后端 Web 依赖 + 前端依赖）：

```powershell
cd D:\HelloAgents\ai-chat
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 -Install
```

之后直接启动：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1
```

脚本会在两个新窗口分别启动后端（8000）和前端（5173），等端口就绪后自动打开浏览器。`ai-chat/.env` 已开启 `VITE_AUTO_CONNECT_HELLOAGENTS=1`：界面默认按 HelloAgents 模式连接当前页面同源地址（Vite 会把 `/agent/*` 代理到 8000），无需手动配置。

预期现象：后端窗口打印「离线模式：预设模型响应，真实执行工具。」与 Uvicorn 启动信息；浏览器底部状态栏显示「已连接 127.0.0.1:5173 · simple」；随便发一句消息可看到流式回复。

- 真实模型：先在仓库根目录 `.env` 配置 `LLM_MODEL_ID`、`LLM_API_KEY`、`LLM_BASE_URL`，再运行 `powershell -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 -Live`。
- 若浏览器里仍是旧配置：设置中各页签的「恢复默认」只重置当前页签，彻底重置需清除浏览器 localStorage 中的 `helloagents.chat.settings`（桌面版删除应用数据目录下的 `helloagents-chat.sqlite3`）。
- 不想默认连接 HelloAgents 时，注释掉 `ai-chat/.env` 里的 `VITE_AUTO_CONNECT_HELLOAGENTS=1`。

### 对接原项目 HelloAgents 后端

终端 A（在仓库根目录启动原项目的 FastAPI 演示服务）：

```bash
python -m pip install -r requirements/web.txt
python -X utf8 -m examples.web.fastapi_sse_server
# 服务监听 http://127.0.0.1:8000
```

需要使用 MCP 工具时，安装 MCP 依赖后再启动（`uv sync --extra web --extra mcp`，或安装 `requirements/web.txt` + `requirements/mcp.txt`）。

需要真实模型时，在仓库根目录配置 `LLM_MODEL_ID`、`LLM_API_KEY`、`LLM_BASE_URL`，并设置 `HELLOAGENTS_DEMO_LIVE=1` 后再启动（详见 `docs/streaming-sse-guide.md`）。

终端 B 启动前端：

```bash
pnpm dev
```

打开设置 → 连接方式选「智能体」→ 接口地址填 `http://127.0.0.1:5173`（开发服务器会把 `/agent/*` 代理到 `http://127.0.0.1:8000`，绕过浏览器跨域限制）→ 测试连接 → 点击「应用」并确认。开启 `VITE_AUTO_CONNECT_HELLOAGENTS=1` 时这些默认值会自动填好。

- 后端不在 8000 端口时：`HELLOAGENTS_SERVER=http://127.0.0.1:9000 pnpm dev`（PowerShell 用 `$env:HELLOAGENTS_SERVER="http://127.0.0.1:9000"; pnpm dev`）。
- 用构建产物时：`pnpm build && pnpm preview`，接口地址填 `http://127.0.0.1:4173`，代理规则相同。
- 桌面端不经过代理，直接填写后端地址（如 `http://127.0.0.1:8000`），由 Rust 侧发起请求。

> 原项目演示服务没有开启 CORS。在浏览器里把接口地址直接填成 `http://127.0.0.1:8000` 会被跨域拦截；请使用上面的同源代理方式，或自行在部署层加反向代理。

### 直连 OpenAI 兼容模型

设置 → 连接方式选「模型」→ 选择模型服务类型「OpenAI 兼容」或「本地模型」→ 填写接口地址（通常以 `/v1` 结尾）、API Key、模型名称 → 测试连接 → 点击「应用」并确认。

- 测试连接会请求 `GET {接口地址}/models`，成功后就地显示延迟。
- 浏览器直连第三方 API 需要对方允许跨域；不允许时请使用桌面端或自建反向代理。
- API Key 只保存在本机（Web 浏览器 localStorage / 桌面端 SQLite），不写入仓库与内置配置，日志与界面不回显明文。桌面端数据库当前不加密，请保护好当前 Windows/macOS/Linux 用户账户。

### 直连 Anthropic Messages

设置 → 连接方式选「模型」→ 服务类型选「Anthropic」→ 填写 Anthropic API Key 与模型名称。接口地址可使用默认的 `https://api.anthropic.com`；可点击「从服务器获取」读取 `/v1/models` 列表。聊天使用 `POST /v1/messages`，并由客户端发送 `x-api-key` 与 `anthropic-version` 请求头。

浏览器直连仍受跨域策略影响；不允许跨域时请使用 Tauri 桌面端或反向代理。

### 静态部署

`dist/` 使用相对路径，可部署到任意静态托管。若仍要对接 HelloAgents 服务，需要在托管层把 `/agent/*` 反向代理到后端（原因同上：后端未开 CORS）。

## 桌面端（Tauri 2）

首次构建前确认已安装 Rust；Windows 还需 MSVC Build Tools 与 WebView2。

```bash
pnpm tauri:dev     # 桌面端热更新开发
pnpm tauri:build   # 产出安装包：src-tauri/target/release/bundle/
```

`tauri dev` / `tauri build` 会通过 `beforeDevCommand` / `beforeBuildCommand` 自动执行 `pnpm icon`，由 `prototypes/app-icon.svg` 生成 `src-tauri/icons/`（图标属于构建产物，已在 `.gitignore` 中忽略），并同步 `public/favicon.svg`。若单独运行 `cargo check`，请先执行一次 `pnpm icon`，否则 Windows 资源编译会因缺少 `icon.ico` 失败。桌面端由 Rust 侧 `reqwest` 发起流式请求并逐段把文本推回前端，不受 WebView 的 CSP / 跨域限制；协议解析仍复用与 Web 端相同的纯函数。

窗口为**无边框模式**（`decorations: false`）：没有系统标题栏，标题栏区域通过 `data-tauri-drag-region` 支持拖动与双击最大化，右上角是最小化 / 最大化 / 关闭三个自绘按钮（`WindowControls.vue`，Web 端不渲染）。相关窗口权限在 `src-tauri/capabilities/default.json` 中显式声明。侧栏收起 / 展开由品牌 logo 点击触发，不再有独立的折叠按钮。

### 一键打包（内置后端 + 离线安装包）

最省事的方式：双击仓库根目录的 **`build-desktop.bat`**（等价于下面的 PowerShell 命令，结束后窗口会停住显示安装包路径）。

```powershell
pwsh scripts/desktop/build-desktop.ps1
```

脚本会依次：检查 Node / corepack / Rust 工具链与仓库 `.venv` → 用 PyInstaller 把 `examples/web` 后端冻结成 sidecar（`ai-chat/src-tauri/binaries/helloagents-backend-<triple>.exe`）→ 构建前端并调用 `tauri build` → 把安装包复制到 `ai-chat/release/helloagents-chat-<version>-setup.exe`。

- 安装包为 NSIS，并通过 `bundle.windows.webviewInstallMode = offlineInstaller` 内嵌 WebView2 离线安装器，目标机器无需联网即可安装（包体约 240 MB）。
- 应用启动时 Rust 会在随机空闲端口拉起 sidecar，把随包分发的 `skills/` 复制到 `%LOCALAPPDATA%\cn.helloagents.chat\skills`（已存在则跳过），并把地址写入设置里的智能体接口；退出时按进程树结束 sidecar，宿主被强杀时 sidecar 通过 `HELLOAGENTS_PARENT_PID` 自检退出。
- 后端日志：`%LOCALAPPDATA%\cn.helloagents.chat\backend.log`。
- 常用参数：`-KeepWork`（保留 sidecar 与 PyInstaller 中间产物）、`-SkipBackend`（复用已构建的 sidecar，只重打安装包）、`-SkipInstall`（跳过依赖安装）、`-CleanAll`（额外清理 cargo target 与 dist）、`-Bundle msi|nsis|all`、`-OutputDir <path>`；`build-desktop.bat` 会把这些参数原样透传，例如 `build-desktop.bat -SkipBackend`。
- 打包成功后会删除中间产物（`build\desktop-backend`、`ai-chat\src-tauri\binaries`）；`cargo target` 默认保留以加速下次增量编译，需要彻底清理时加 `-CleanAll`。
- 首次在构建机执行需要联网一次：Tauri 会下载 NSIS 与 WebView2 离线安装器并缓存到 `%LOCALAPPDATA%\tauri`。
- 安装包默认装到 `%LOCALAPPDATA%\HelloAgents Chat`（NSIS `currentUser` 模式）。若做静默安装测试（`setup.exe /S /D=<目录>`），NSIS 会把该目录记到 `HKCU\Software\helloagents\HelloAgents Chat` 的默认值，下次双击就会默认装到那里；想恢复默认路径，删掉这个键即可。

## Mock 模式（无后端调试界面）

```bash
# PowerShell
$env:VITE_TRANSPORT="mock"; pnpm dev
```

该模式不发起任何网络请求，用模拟流演示逐字渲染、工具事件与错误/停止状态。

## 目录结构

```
ai-chat/
├─ index.html / package.json / vite.config.ts / tsconfig*.json
├─ .env.example                  # 内置默认配置（不含密钥）
├─ prototypes/                   # 视觉基准与图标（不参与打包）
├─ src/
│  ├─ ui/                        # Vue 入口、组件与主题样式
│  │  ├─ components/             # layout / conversation / chat / input / settings
│  │  └─ styles/                 # 主题变量、基础样式、Markdown 排版
│  ├─ app/                       # 应用状态、用例与配置
│  │  ├─ config/                 # 默认值、存储键、清洗与校验
│  │  ├─ stores/                 # settings / conversations / connection
│  │  └─ composables/            # useChat / useAutoScroll / useComposer
│  ├─ adapters/                  # ★ 唯一允许接触环境差异的适配层
│  │  ├─ env.ts                  # Web / Tauri 运行时探测
│  │  ├─ skills.ts               # 技能列表 / 导入 / 删除（走 /agent/skills）
│  │  ├─ storage/                # Web localStorage / Tauri SQLite 适配器
│  │  └─ transport/              # SSE 解析、双协议解码、Web / Tauri / Mock 传输
│  ├─ shared/
│  │  ├─ types/                  # 跨层共享的领域类型
│  │  └─ utils/                  # Markdown、ID、格式化与请求构造
│  └─ env.d.ts
└─ src-tauri/                    # Rust 外壳与流式命令
```

依赖方向保持为 `ui → app → adapters`，跨层通用类型与纯函数放在 `shared`。`ai-chat/` 是独立的前端包，拥有自己的依赖、构建配置与产物；不导入 Python 模块，也不修改仓库原有后端或示例。与 HelloAgents 的连接只通过 `/agent/stream` HTTP SSE 契约完成。

核心约束：`fetch`、`localStorage`、`@tauri-apps/*` 只出现在 `src/adapters/`；其余模块经由适配层。可用下面的命令自查：

```bash
# 在 ai-chat 目录下（rg 或 grep 均可）
rg -n "fetch\(|localStorage|@tauri-apps" src --glob '!**/adapters/**'
```

预期结果：没有输出。

本地存储键：`helloagents.chat.conversations`、`helloagents.chat.active-conversation`、`helloagents.chat.settings`、`helloagents.chat.theme`、`helloagents.chat.sidebar-collapsed`。Web 开发版使用当前浏览器的 `localStorage`；Tauri 桌面版由 Rust 命令写入应用数据目录下的 `helloagents-chat.sqlite3`（Windows 通常位于 `%LOCALAPPDATA%\cn.helloagents.chat\`）。已有桌面版 `store.json` 中的同名键会在首次读取时迁移到 SQLite。消息流式更新防抖落盘（400 ms），会话增删改与设置保存立即落盘。

## 验收要点（对应提示词）

- 未配置：状态栏提示「未连接 · 未配置接口与模型」且整条可点击直达设置；输入区禁用并说明原因；首屏无报错。
- 配置并连通后：状态栏明确显示「智能体服务已连接」或「模型已连接」及主机、Agent/模型；未配置时提示缺少的配置项，并保持发送按钮禁用。
- 智能体服务模式可在输入框旁切换 Agent 类型，选择会保存为后续对话的默认类型。
- 会话新建 / 切换 / 重命名（双击或铅笔） / 删除（行内二次确认）；刷新后完整恢复。
- Enter 发送、Shift+Enter 换行（中文输入法组合期间不误发送）；不在输入框展示快捷键提示；生成中输入区整体禁用，可停止并保留已生成内容。
- 流式逐字渲染、尾随光标、代码高亮与一键复制；失败展示分类错误卡片，可重试且不重复发送用户消息。
- 桌面端侧栏可收起为图标栏，展开后显示新对话、本地会话与设置；偏好保存在本地。
- 窄屏（≤860 px）侧边栏变抽屉并带遮罩，无横向滚动。
- `pnpm build` 通过类型检查；`pnpm tauri:build` 产出安装包。

## 与上游项目的关系

`ai-chat/` 保持为仓库顶层的独立前端子项目：依赖清单、锁文件、构建配置和 UI 代码均留在本目录。它通过稳定的 HTTP SSE 接口与原项目集成，不直接依赖 Python 包内部结构；原有 `examples/web/` 演示页与后端可继续独立演进。根目录 `.gitignore` 已忽略 `dist/`，本目录 `.gitignore` 额外忽略 `node_modules/`、`src-tauri/target/` 等构建产物。
