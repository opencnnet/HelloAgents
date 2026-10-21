"""桌面端内置后端入口。

由 PyInstaller 打包为 sidecar（helloagents-backend.exe），由 Tauri 在应用启动时拉起：
端口与技能目录通过 HELLOAGENTS_PORT / HELLOAGENTS_SKILLS_DIR 传入，避免与开发环境冲突。
"""

from __future__ import annotations

import os
import sys
import threading
import time


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if sys.platform == "win32":
        import ctypes

        process_query_limited_information = 0x1000
        still_active = 259
        kernel32 = ctypes.windll.kernel32
        handle = kernel32.OpenProcess(process_query_limited_information, False, pid)
        if not handle:
            return False
        try:
            code = ctypes.c_ulong()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(code)):
                return False
            return code.value == still_active
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def _watch_parent(parent_pid: int) -> None:
    """宿主进程被强杀时不会走到退出回调，这里主动退出避免留下孤儿后端。"""
    while True:
        time.sleep(5)
        if not _pid_alive(parent_pid):
            os._exit(0)


def main() -> None:
    # 冻结后的控制台默认走 GBK，日志里的 emoji 会抛 UnicodeEncodeError，先统一成 UTF-8。
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is not None:
            reconfigure(encoding="utf-8", errors="replace")

    host = os.environ.get("HELLOAGENTS_HOST", "127.0.0.1")
    port = int(os.environ.get("HELLOAGENTS_PORT", "8000"))

    # 打包后 __file__ 位于解包目录，技能目录必须由外部指定（Tauri 传用户数据目录）。
    if not os.environ.get("HELLOAGENTS_SKILLS_DIR"):
        base = getattr(sys, "_MEIPASS", os.getcwd())
        os.environ["HELLOAGENTS_SKILLS_DIR"] = os.path.join(base, "skills")

    parent_pid = int(os.environ.get("HELLOAGENTS_PARENT_PID", "0") or 0)
    if parent_pid > 0:
        threading.Thread(target=_watch_parent, args=(parent_pid,), daemon=True).start()

    import uvicorn

    from examples.web.fastapi_sse_server import app

    uvicorn.run(app, host=host, port=port, log_level="info", access_log=False)


if __name__ == "__main__":
    main()
