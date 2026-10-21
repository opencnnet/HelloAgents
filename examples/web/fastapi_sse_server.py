"""运行 python -m examples.web.fastapi_sse_server，浏览 http://127.0.0.1:8000。
默认离线；设置 HELLOAGENTS_DEMO_LIVE=1 并配置 LLM 环境变量后使用真实模型。
"""

import os
import io
import re
import asyncio
import json
import time
import shutil
import zipfile
from pathlib import Path
from contextlib import aclosing, asynccontextmanager
import logging
from typing import Literal
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field
from hello_agents import (
    SimpleAgent,
    ReActAgent,
    ReflectionAgent,
    PlanSolveAgent,
    ToolRegistry,
)
from hello_agents.tools import MCPConnection
from hello_agents.tools.builtin import CalculatorTool
from hello_agents.core.streaming import StreamEvent, StreamEventType
from examples._support import demo_config, demo_llm, response, tool_response

logger = logging.getLogger(__name__)
ROOT = Path(__file__).resolve().parents[2]
# 打包成单文件可执行程序后 __file__ 位于解包目录，技能目录必须可外部指定。
SKILLS_DIR = Path(os.environ.get("HELLOAGENTS_SKILLS_DIR") or ROOT / "skills")
SKILL_NAME_RE = re.compile(r"[A-Za-z0-9_-]{1,64}")


class SkillSummary(BaseModel):
    name: str
    description: str


class SkillPayload(BaseModel):
    name: str
    description: str = ""
    content: str
    overwrite: bool = False


def parse_skill_meta(text: str) -> tuple[str, str]:
    """解析 SKILL.md frontmatter 里的 name / description。"""
    text = text.lstrip("\ufeff")
    if not text.lstrip().startswith("---"):
        raise ValueError("SKILL.md 缺少 frontmatter")
    parts = text.split("---", 2)
    if len(parts) < 3:
        raise ValueError("SKILL.md 的 frontmatter 未闭合")
    meta: dict[str, str] = {}
    for line in parts[1].splitlines():
        key, _, value = line.partition(":")
        if key.strip() in {"name", "description"}:
            meta[key.strip()] = value.strip().strip('"').strip("'")
    if not meta.get("name"):
        raise ValueError("frontmatter 缺少 name")
    return meta["name"], meta.get("description", "")


def ensure_skill_name(name: str) -> str:
    value = name.strip()
    if not SKILL_NAME_RE.fullmatch(value):
        raise HTTPException(400, "技能名只能包含字母、数字、下划线和连字符（1-64 位）")
    return value


def write_skill(name: str, description: str, body: str, overwrite: bool) -> None:
    target = SKILLS_DIR / name
    if target.exists() and not overwrite:
        raise HTTPException(409, f"技能「{name}」已存在")
    target.mkdir(parents=True, exist_ok=True)
    front = json.dumps(description or name, ensure_ascii=False)
    (target / "SKILL.md").write_text(
        f"---\nname: {name}\ndescription: {front}\n---\n\n{body.strip()}\n",
        encoding="utf-8",
    )


def import_skill_zip(data: bytes, overwrite: bool) -> str:
    """从 zip 导入技能：要求包含唯一的 SKILL.md，保留其所在目录内的全部文件。"""
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        entries = [
            item
            for item in archive.namelist()
            if item.endswith("SKILL.md") and not item.startswith("__MACOSX/")
        ]
        if len(entries) != 1:
            raise HTTPException(400, "压缩包中需要且只能包含一个 SKILL.md")
        skill_md = entries[0]
        root = skill_md[: -len("SKILL.md")]
        files = [
            item
            for item in archive.namelist()
            if item.startswith(root) and item != root and not item.endswith("/")
        ]
        try:
            skill_name, _ = parse_skill_meta(archive.read(skill_md).decode("utf-8-sig"))
        except (ValueError, UnicodeDecodeError) as exc:
            raise HTTPException(400, f"SKILL.md 解析失败：{exc}") from exc
        name = ensure_skill_name(skill_name)
        target = SKILLS_DIR / name
        if target.exists() and not overwrite:
            raise HTTPException(409, f"技能「{name}」已存在")
        if target.exists():
            shutil.rmtree(target)
        for entry in files:
            relative = entry[len(root) :]
            if not relative or ".." in Path(relative).parts:
                continue
            destination = target / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(archive.read(entry))
    return name


class MCPServerConfig(BaseModel):
    """前端「设置 → MCP」页签提交的服务配置。"""

    name: str = Field(min_length=1, max_length=80)
    transport: Literal["stdio", "streamable-http"] = "stdio"
    command: str = ""
    args: list[str] = Field(default_factory=list)
    url: str = ""
    prefix: str = ""
    tools: list[str] = Field(default_factory=list)
    timeout: float = Field(default=30, gt=0, le=300)


class LLMConfig(BaseModel):
    """前端「设置 → 模型」页签提交的大模型连接，供智能体直接使用。"""

    endpoint: str = ""
    model: str = ""
    api_key: str = ""
    provider: Literal["openai", "anthropic", "local"] = "openai"


class AgentRequest(BaseModel):
    input: str = Field(min_length=1, max_length=200_000)
    agent_type: Literal["simple", "react", "reflection", "plan"] = "simple"
    mcp_servers: list[MCPServerConfig] = Field(default_factory=list)
    llm: LLMConfig | None = None


def normalize_base_url(endpoint: str, provider: str) -> str:
    """把前端填写的具体接口地址收敛成 SDK 需要的 base_url。

    OpenAI SDK 会自行拼接 /chat/completions；Anthropic 会拼接 /v1/messages。
    兼容网关常把 API 挂在自定义前缀下（例如 .../chat/completions/v1/messages），
    因此 Anthropic 只剥离具体接口路径，保留前缀。
    """
    url = endpoint.strip().rstrip("/")
    suffixes = (
        ("/chat/completions", "/v1/models", "/models")
        if provider == "openai"
        else ("/v1/messages", "/messages", "/v1/models", "/models")
    )
    for suffix in suffixes:
        if url.endswith(suffix):
            return url[: -len(suffix)]
    return url


def resolve_provider(config: LLMConfig) -> str:
    """按前端选择的协议调用；地址里的具体路径在 normalize_base_url 中剥离。"""
    return "anthropic" if config.provider == "anthropic" else "openai"


def build_llm(config: LLMConfig | None, fixtures):
    """前端提供了完整的模型配置时优先使用，否则回落到离线/环境变量模型。"""
    if (
        config is not None
        and config.endpoint.strip()
        and config.model.strip()
        and config.api_key.strip()
    ):
        from hello_agents import HelloAgentsLLM

        provider = resolve_provider(config)
        return HelloAgentsLLM(
            model=config.model.strip(),
            api_key=config.api_key.strip(),
            base_url=normalize_base_url(config.endpoint, provider),
            provider=provider,
        )
    return demo_llm(fixtures, live=os.getenv("HELLOAGENTS_DEMO_LIVE") == "1")


def build_agent(kind, registry=None, llm_config=None):
    # 每次请求独立创建 Agent、工具注册表和模型会话。
    fixtures = [response("离线演示回答：已收到任务。")]
    if kind == "reflection":
        fixtures.append(response("无需改进"))
    elif kind == "plan":
        fixtures.insert(0, tool_response("generate_plan", {"steps": ["回答用户问题"]}))
    if registry is None:
        registry = ToolRegistry()
        registry.register_tool(CalculatorTool())
    cls = dict(
        simple=SimpleAgent,
        react=ReActAgent,
        reflection=ReflectionAgent,
        plan=PlanSolveAgent,
    )[kind]
    return cls(
        "SSE-" + kind,
        build_llm(llm_config, fixtures),
        tool_registry=registry,
        # 规划/执行会多次调用模型，第三方网关单次可能超过默认 120 秒；
        # 远程 MCP（如 DeepWiki）也需要更长的工具超时。
        config=demo_config(
            llm_async_timeout=300,
            tool_async_timeout=120,
            skills_enabled=True,
            skills_dir=str(SKILLS_DIR),
        ),
    )


def build_mcp_connection(config: MCPServerConfig):
    """按前端配置创建 MCP 连接；stdio 由服务端拉起进程，HTTP 直接连地址。"""
    options = {
        "prefix": config.prefix,
        "timeout": config.timeout,
        "tools": tuple(config.tools) if config.tools else None,
    }
    if config.transport == "stdio":
        if not config.command.strip():
            raise ValueError("缺少启动命令")
        return MCPConnection.stdio(config.command.strip(), config.args, **options)
    if not config.url.strip():
        raise ValueError("缺少服务地址")
    return MCPConnection(config.url.strip(), **options)


class MCPPoolEntry:
    """常驻 MCP 连接。

    MCP SDK 的会话绑定在创建它的任务上，因此连接必须在专用任务里长期持有，
    其他请求只能通过 client 调用工具，不能自己进入/退出连接上下文。
    """

    def __init__(self, key: str, config: MCPServerConfig) -> None:
        self.key = key
        self.name = config.name
        self.config = config
        self.connection = None
        self.registry: ToolRegistry | None = None
        self.lock = asyncio.Lock()
        self.last_used = time.monotonic()
        self._ready = asyncio.Event()
        self._stop = asyncio.Event()
        self._task: asyncio.Task | None = None
        self._error: BaseException | None = None

    async def start(self) -> None:
        self._task = asyncio.create_task(self._serve(), name=f"mcp-{self.name}")
        await self._ready.wait()
        if self._error is not None:
            raise self._error

    async def _serve(self) -> None:
        try:
            async with build_mcp_connection(self.config) as connection:
                registry = ToolRegistry()
                registry.register_tool(CalculatorTool())
                connection.register_tools(registry)
                self.connection, self.registry = connection, registry
                self._ready.set()
                await self._stop.wait()
        except BaseException as exc:  # noqa: BLE001 - 记录后交给 acquire 抛出
            self._error = exc if self._error is None else self._error
            self._ready.set()
            logger.exception("MCP 常驻连接异常：%s", self.name)

    async def close(self) -> None:
        self._stop.set()
        if self._task is not None:
            try:
                await self._task
            except Exception:
                logger.exception("关闭 MCP 连接失败：%s", self.name)


class MCPPool:
    """按配置复用 MCP 连接：常驻连接，空闲超时或出错时重建。"""

    def __init__(self, idle_seconds: float = 600) -> None:
        self._entries: dict[str, MCPPoolEntry] = {}
        self._guard = asyncio.Lock()
        self._idle_seconds = idle_seconds

    @staticmethod
    def fingerprint(config: MCPServerConfig) -> str:
        return json.dumps(config.model_dump(), sort_keys=True, ensure_ascii=False)

    async def acquire(self, config: MCPServerConfig) -> MCPPoolEntry:
        key = self.fingerprint(config)
        async with self._guard:
            entry = self._entries.get(key)
            if entry is None:
                entry = MCPPoolEntry(key, config)
                await entry.start()
                self._entries[key] = entry
                print(f"🔌 MCP 已连接：{config.name}（常驻）", flush=True)
            entry.last_used = time.monotonic()
            return entry

    async def discard(self, entry: MCPPoolEntry) -> None:
        async with self._guard:
            if self._entries.get(entry.key) is entry:
                self._entries.pop(entry.key, None)
            else:
                return
        await entry.close()
        print(f"🔌 MCP 已断开：{entry.name}", flush=True)

    async def cleanup(self) -> None:
        now = time.monotonic()
        stale: list[MCPPoolEntry] = []
        async with self._guard:
            for key, entry in list(self._entries.items()):
                if entry.lock.locked():
                    continue
                if now - entry.last_used > self._idle_seconds:
                    stale.append(self._entries.pop(key))
        for entry in stale:
            await entry.close()
            print(f"🧹 MCP 空闲断开：{entry.name}", flush=True)

    async def close_all(self) -> None:
        async with self._guard:
            entries = list(self._entries.values())
            self._entries.clear()
        for entry in entries:
            await entry.close()
            print(f"🔌 MCP 已断开：{entry.name}", flush=True)


mcp_pool = MCPPool()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    try:
        yield
    finally:
        await mcp_pool.close_all()


def create_app(agent_factory=build_agent):
    app = FastAPI(title="HelloAgents SSE", lifespan=lifespan)

    @app.get("/")
    async def root():
        return FileResponse(Path(__file__).with_name("sse_client.html"))

    @app.get("/agent/skills")
    async def list_skills():
        from hello_agents.skills import SkillLoader

        loader = SkillLoader(SKILLS_DIR)
        items: list[SkillSummary] = []
        for name in loader.list_skills():
            skill = loader.get_skill(name)
            items.append(
                SkillSummary(name=name, description=skill.description if skill else "")
            )
        return {"skills": items}

    @app.post("/agent/skills")
    async def import_skill(payload: SkillPayload):
        name = ensure_skill_name(payload.name)
        if not payload.content.strip():
            raise HTTPException(400, "技能内容不能为空")
        write_skill(name, payload.description, payload.content, payload.overwrite)
        print(f"🧩 已导入技能：{name}", flush=True)
        return {"ok": True, "name": name}

    @app.post("/agent/skills/upload")
    async def upload_skill(file: UploadFile = File(...), overwrite: bool = False):
        data = await file.read()
        try:
            name = import_skill_zip(data, overwrite)
        except zipfile.BadZipFile as exc:
            raise HTTPException(400, "不是有效的 zip 文件") from exc
        print(f"🧩 已导入技能包：{name}", flush=True)
        return {"ok": True, "name": name}

    @app.delete("/agent/skills/{name}")
    async def delete_skill(name: str):
        target = SKILLS_DIR / ensure_skill_name(name)
        if not target.is_dir():
            raise HTTPException(404, f"技能「{name}」不存在")
        shutil.rmtree(target)
        print(f"🧩 已删除技能：{name}", flush=True)
        return {"ok": True}

    @app.post("/agent/stream")
    async def agent_stream(request: AgentRequest):
        async def events():
            await mcp_pool.cleanup()
            names = [config.name for config in request.mcp_servers]
            print(f"🧩 收到的 MCP 服务：{names or '无'}", flush=True)
            if request.llm is not None and request.llm.model:
                provider = resolve_provider(request.llm)
                host = normalize_base_url(request.llm.endpoint, provider)
                print(f"🧠 使用前端模型：{request.llm.model} @ {host} ({provider})", flush=True)

            registry = ToolRegistry()
            registry.register_tool(CalculatorTool())
            held: list[MCPPoolEntry] = []
            failed = False
            try:
                for config in request.mcp_servers:
                    try:
                        entry = await mcp_pool.acquire(config)
                    except ImportError:
                        logger.exception("MCP 依赖缺失")
                        yield StreamEvent.create(
                            StreamEventType.ERROR,
                            "SSE-mcp",
                            message="服务端未安装 MCP 依赖，无法加载 MCP 工具。",
                        ).to_sse()
                        return
                    except Exception:
                        # 只回传服务名与错误类型，避免泄露路径、命令输出等细节。
                        logger.exception("MCP 服务 %s 连接失败", config.name)
                        yield StreamEvent.create(
                            StreamEventType.ERROR,
                            "SSE-mcp",
                            message=f"MCP 服务「{config.name}」连接失败，请检查命令或地址。",
                        ).to_sse()
                        return

                    # 同一连接上的请求串行执行，避免 MCP 会话并发冲突。
                    await entry.lock.acquire()
                    held.append(entry)
                    pooled = entry.registry
                    if pooled is not None:
                        for tool_name in pooled.list_tools():
                            if tool_name == "python_calculator":
                                continue
                            if registry.get_tool(tool_name) is not None:
                                print(f"⚠️ MCP 工具重名，已跳过：{tool_name}", flush=True)
                                continue
                            tool = pooled.get_tool(tool_name)
                            if tool is not None:
                                registry.register_tool(tool)

                factory_kwargs = {}
                if request.mcp_servers:
                    factory_kwargs["registry"] = registry
                if request.llm is not None:
                    factory_kwargs["llm_config"] = request.llm
                agent = agent_factory(request.agent_type, **factory_kwargs)
                try:
                    async with aclosing(agent.arun_stream(request.input)) as source:
                        async for event in source:
                            yield event.to_sse()
                except Exception:
                    failed = True
                    # 不把凭据、服务端路径或上游原始错误发送给浏览器。
                    yield StreamEvent.create(
                        StreamEventType.ERROR,
                        agent.name,
                        message="运行失败，请检查服务端配置与日志。",
                    ).to_sse()
                finally:
                    close = getattr(type(agent.llm), "aclose", None)
                    if close is not None:
                        await agent.llm.aclose()
            finally:
                for entry in reversed(held):
                    if entry.lock.locked():
                        entry.lock.release()
                if failed:
                    # 连接可能已失效，丢弃缓存，下次请求重新建立。
                    for entry in held:
                        await mcp_pool.discard(entry)

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host=os.environ.get("HELLOAGENTS_HOST", "127.0.0.1"),
        port=int(os.environ.get("HELLOAGENTS_PORT", "8000")),
    )
