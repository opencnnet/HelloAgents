//! 内置后端（sidecar）生命周期：启动、就绪探测、退出回收。

use std::fs;
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, State};

const SIDECAR_STEM: &str = "helloagents-backend";
/// 开发模式下没有 sidecar 时回落到热重载常用的 8000 端口。
const DEV_FALLBACK: &str = "http://127.0.0.1:8000";
const READY_TIMEOUT: Duration = Duration::from_secs(60);

#[derive(Default)]
pub struct BackendState {
    child: Mutex<Option<Child>>,
    endpoint: Mutex<String>,
}

impl BackendState {
    fn set_endpoint(&self, endpoint: String) {
        if let Ok(mut current) = self.endpoint.lock() {
            *current = endpoint;
        }
    }

    fn endpoint(&self) -> String {
        self.endpoint
            .lock()
            .map(|value| value.clone())
            .unwrap_or_default()
    }

    /// 关闭 sidecar；应用退出时调用，避免后台残留进程。
    pub fn shutdown(&self) {
        let child = self.child.lock().ok().and_then(|mut slot| slot.take());
        if let Some(mut child) = child {
            kill_tree(&mut child);
        }
    }
}

/// PyInstaller 单文件模式会由引导进程再拉起子进程，只杀父进程会留下孤儿，
/// 因此按进程树终止。
fn kill_tree(child: &mut Child) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let pid = child.id().to_string();
        let _ = Command::new("taskkill")
            .args(["/PID", &pid, "/T", "/F"])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .creation_flags(0x0800_0000)
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn free_port() -> Option<u16> {
    TcpListener::bind(("127.0.0.1", 0))
        .ok()
        .and_then(|listener| listener.local_addr().ok())
        .map(|addr| addr.port())
}

fn sidecar_path() -> Option<PathBuf> {
    let dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    let name = if cfg!(windows) {
        format!("{SIDECAR_STEM}.exe")
    } else {
        SIDECAR_STEM.to_string()
    };
    let candidate = dir.join(name);
    candidate.is_file().then_some(candidate)
}

/// 把随包分发的默认技能复制到用户数据目录（只补齐缺失项，不覆盖用户改动）。
fn seed_skills(app: &AppHandle, target: &Path) {
    let Ok(resource_dir) = app.path().resource_dir() else {
        return;
    };
    let source = resource_dir.join("skills");
    if !source.is_dir() {
        return;
    }
    if let Err(err) = fs::create_dir_all(target) {
        eprintln!("创建技能目录失败：{err}");
        return;
    }
    let Ok(entries) = fs::read_dir(&source) else {
        return;
    };
    for entry in entries.flatten() {
        let dest = target.join(entry.file_name());
        if dest.exists() {
            continue;
        }
        if let Err(err) = copy_dir(&entry.path(), &dest) {
            eprintln!("复制技能 {} 失败：{err}", entry.path().display());
        }
    }
}

fn copy_dir(source: &Path, target: &Path) -> std::io::Result<()> {
    if source.is_dir() {
        fs::create_dir_all(target)?;
        for entry in fs::read_dir(source)? {
            let entry = entry?;
            copy_dir(&entry.path(), &target.join(entry.file_name()))?;
        }
        Ok(())
    } else {
        fs::copy(source, target).map(|_| ())
    }
}

fn wait_until_ready(port: u16) -> bool {
    let deadline = Instant::now() + READY_TIMEOUT;
    while Instant::now() < deadline {
        if TcpStream::connect(("127.0.0.1", port)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(250));
    }
    false
}

/// 启动内置后端；返回实际使用的地址。
pub fn start(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<BackendState>();

    let Some(sidecar) = sidecar_path() else {
        // tauri dev：使用开发者自己启动的后端。
        state.set_endpoint(DEV_FALLBACK.to_string());
        return Ok(());
    };

    let port = free_port().ok_or_else(|| "无法分配本地端口".to_string())?;
    let data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(|err| format!("无法定位应用数据目录：{err}"))?;
    fs::create_dir_all(&data_dir).map_err(|err| format!("创建应用数据目录失败：{err}"))?;

    let skills_dir = data_dir.join("skills");
    seed_skills(app, &skills_dir);

    let log_path = data_dir.join("backend.log");
    let log = fs::File::create(&log_path).map_err(|err| format!("创建后端日志失败：{err}"))?;

    let mut command = Command::new(&sidecar);
    command
        .env("HELLOAGENTS_HOST", "127.0.0.1")
        .env("HELLOAGENTS_PORT", port.to_string())
        .env("HELLOAGENTS_SKILLS_DIR", &skills_dir)
        // 宿主异常退出时 sidecar 据此自检并退出。
        .env("HELLOAGENTS_PARENT_PID", std::process::id().to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::from(log));
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW：sidecar 是控制台程序，不应弹出黑窗。
        command.creation_flags(0x0800_0000);
    }

    let child = command
        .spawn()
        .map_err(|err| format!("启动内置后端失败：{err}"))?;
    if let Ok(mut slot) = state.child.lock() {
        *slot = Some(child);
    }

    let endpoint = format!("http://127.0.0.1:{port}");
    state.set_endpoint(endpoint);

    if wait_until_ready(port) {
        println!("内置后端已就绪：127.0.0.1:{port}（日志 {}）", log_path.display());
    } else {
        eprintln!("内置后端在 {} 秒内未就绪，日志见 {}", READY_TIMEOUT.as_secs(), log_path.display());
    }
    Ok(())
}

/// 前端初始化时读取内置后端地址；等待就绪后再返回，避免首个请求失败。
#[tauri::command]
pub async fn backend_endpoint(state: State<'_, BackendState>) -> Result<String, String> {
    let endpoint = state.endpoint();
    if endpoint.is_empty() {
        return Err("内置后端尚未启动".to_string());
    }
    let port = endpoint
        .rsplit(':')
        .next()
        .and_then(|value| value.parse::<u16>().ok());
    if let Some(port) = port {
        let ready = tauri::async_runtime::spawn_blocking(move || wait_until_ready(port))
            .await
            .unwrap_or(false);
        if !ready {
            return Err("内置后端尚未就绪".to_string());
        }
    }
    Ok(endpoint)
}
