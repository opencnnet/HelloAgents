"""把演示后端冻结成 sidecar 可执行文件，供 Tauri 打包进安装包。

用法：uv run --extra web --extra mcp --extra anthropic --extra desktop python scripts/desktop/build_backend.py
产物：ai-chat/src-tauri/binaries/helloagents-backend-<target-triple>.exe
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ENTRY = Path(__file__).with_name("backend_entry.py")
TARGET_TRIPLE = "x86_64-pc-windows-msvc"
# 与桌面端共用同一个图标文件（由 pnpm icon 从 prototypes/app-icon.svg 生成）。
ICON = REPO_ROOT / "ai-chat" / "src-tauri" / "icons" / "icon.ico"

# hello_agents 与各模型/MCP SDK 存在延迟导入，显式收集以免运行时缺模块。
# 注意：mcp.cli 在导入时会 sys.exit，只能按需收集 client/server/types 子包。
COLLECT_SUBMODULES = (
    "examples",
    "hello_agents",
    "uvicorn",
    "fastapi",
    "mcp.client",
    "mcp.shared",
    "mcp.types",
    "anthropic",
    "openai",
)
HIDDEN_IMPORTS = (
    "examples._support",
    "examples.agents.runtime_features",
    "examples.web.fastapi_sse_server",
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.loops.asyncio",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.http.h11_impl",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
    "uvicorn.lifespan.off",
)


def build(work_dir: Path, output_dir: Path) -> Path:
    work_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--console",
        "--name",
        "helloagents-backend",
        "--distpath",
        str(work_dir / "dist"),
        "--workpath",
        str(work_dir / "build"),
        "--specpath",
        str(work_dir),
        "--paths",
        str(REPO_ROOT),
    ]
    for module in COLLECT_SUBMODULES:
        command += ["--collect-submodules", module]
    for module in HIDDEN_IMPORTS:
        command += ["--hidden-import", module]
    if ICON.is_file():
        command += ["--icon", str(ICON)]
    command.append(str(ENTRY))

    print("· 构建 sidecar：", " ".join(command[:8]), "…")
    subprocess.run(command, check=True, cwd=REPO_ROOT)

    built = work_dir / "dist" / "helloagents-backend.exe"
    if not built.exists():
        raise SystemExit(f"未生成可执行文件：{built}")

    target = output_dir / f"helloagents-backend-{TARGET_TRIPLE}.exe"
    shutil.copy2(built, target)
    size_mb = target.stat().st_size / (1024 * 1024)
    print(f"✓ sidecar 已输出：{target}（{size_mb:.1f} MB）")
    return target


def main() -> int:
    parser = argparse.ArgumentParser(description="构建桌面端内置后端 sidecar")
    parser.add_argument(
        "--work-dir",
        default=str(REPO_ROOT / "build" / "desktop-backend"),
        help="PyInstaller 中间产物目录",
    )
    parser.add_argument(
        "--output-dir",
        default=str(REPO_ROOT / "ai-chat" / "src-tauri" / "binaries"),
        help="Tauri externalBin 目录",
    )
    args = parser.parse_args()
    build(Path(args.work_dir), Path(args.output_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
