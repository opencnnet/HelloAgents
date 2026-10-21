use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use std::time::{Duration, Instant};

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager, State};
use tokio_util::sync::CancellationToken;

const EVENT_CHANNEL: &str = "chat-stream";

/// 登记表状态：进行中的请求与「先于请求到达」的取消墓碑。
#[derive(Default)]
pub struct RegistryState {
    pub tokens: HashMap<String, CancellationToken>,
    pub cancelled: HashSet<String>,
}

/// 活跃流登记表：请求 ID -> 取消令牌。
#[derive(Default)]
pub struct StreamRegistry(pub Mutex<RegistryState>);

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequestPayload {
    pub request_id: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub body: String,
}

#[derive(Debug, Deserialize)]
pub struct ProbeRequestPayload {
    pub url: String,
    pub headers: HashMap<String, String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProbeResponse {
    pub status: u16,
    pub latency_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StreamEventPayload {
    request_id: String,
    kind: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    chunk: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    status: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

fn emit_stream_event(app: &AppHandle, payload: StreamEventPayload) {
    let _ = app.emit(EVENT_CHANNEL, payload);
}

fn build_headers(headers: &HashMap<String, String>) -> reqwest::header::HeaderMap {
    let mut map = reqwest::header::HeaderMap::new();
    for (key, value) in headers {
        let name = reqwest::header::HeaderName::from_bytes(key.as_bytes());
        let parsed = reqwest::header::HeaderValue::from_str(value);
        if let (Ok(name), Ok(value)) = (name, parsed) {
            map.insert(name, value);
        }
    }
    map
}

/// 发起流式 HTTP 请求并向前端推送原始文本片段。
#[tauri::command]
pub async fn chat_stream(
    app: AppHandle,
    state: State<'_, StreamRegistry>,
    request: ChatRequestPayload,
) -> Result<(), String> {
    let token = CancellationToken::new();
    let request_id = request.request_id.clone();
    {
        let mut registry = state.0.lock().map_err(|_| "内部状态锁失败".to_string())?;
        if registry.cancelled.remove(&request_id) {
            // 取消先于请求到达：直接取消并返回，不再发起 HTTP。
            token.cancel();
        } else {
            registry.tokens.insert(request_id.clone(), token.clone());
        }
    }
    if token.is_cancelled() {
        return Ok(());
    }

    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        run_chat_stream(handle.clone(), request, token).await;
        if let Some(registry) = handle.try_state::<StreamRegistry>() {
            if let Ok(mut registry) = registry.0.lock() {
                registry.tokens.remove(&request_id);
            }
        }
    });
    Ok(())
}

/// 中止指定请求：取消令牌触发后，Rust 侧立即停止读取并释放连接。
#[tauri::command]
pub fn chat_cancel(state: State<'_, StreamRegistry>, request_id: String) -> Result<(), String> {
    let mut registry = state.0.lock().map_err(|_| "内部状态锁失败".to_string())?;
    if let Some(token) = registry.tokens.remove(&request_id) {
        token.cancel();
    } else {
        // 请求尚未注册完成：留下墓碑，chat_stream 注册时会立即取消。
        if registry.cancelled.len() > 64 {
            registry.cancelled.clear();
        }
        registry.cancelled.insert(request_id);
    }
    Ok(())
}

/// 连接探测：只报告状态码与延迟，避免把大响应体传回前端。
#[tauri::command]
pub async fn probe_connection(request: ProbeRequestPayload) -> Result<ProbeResponse, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|err| format!("HTTP 客户端初始化失败：{err}"))?;
    let started = Instant::now();
    let response = client
        .get(&request.url)
        .headers(build_headers(&request.headers))
        .send()
        .await
        .map_err(|err| {
            if err.is_timeout() {
                "连接超时，请检查接口地址与网络。".to_string()
            } else {
                format!("网络请求失败：{err}")
            }
        })?;
    let status = response.status().as_u16();
    let latency_ms = u64::try_from(started.elapsed().as_millis()).unwrap_or(u64::MAX);
    let message = if (200..300).contains(&status) {
        None
    } else {
        let text = response.text().await.unwrap_or_default();
        let preview: String = text.trim().chars().take(300).collect();
        if preview.is_empty() {
            None
        } else {
            Some(preview)
        }
    };
    Ok(ProbeResponse {
        status,
        latency_ms,
        message,
    })
}

/// Fetch available model identifiers from an OpenAI-compatible /models endpoint.
#[tauri::command]
pub async fn list_models(request: ProbeRequestPayload) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|err| format!("HTTP 客户端初始化失败：{err}"))?;
    let response = client
        .get(&request.url)
        .headers(build_headers(&request.headers))
        .send()
        .await
        .map_err(|err| {
            if err.is_timeout() {
                "获取模型列表超时，请检查接口地址与网络。".to_string()
            } else {
                format!("获取模型列表失败：{err}")
            }
        })?;
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("读取模型列表失败：{err}"))?;
    if !status.is_success() {
        let preview: String = body.trim().chars().take(300).collect();
        return Err(if preview.is_empty() {
            format!("获取模型列表失败（HTTP {}）。", status.as_u16())
        } else {
            format!("获取模型列表失败（HTTP {}）：{preview}", status.as_u16())
        });
    }
    Ok(body)
}

async fn run_chat_stream(app: AppHandle, request: ChatRequestPayload, token: CancellationToken) {
    let ChatRequestPayload {
        request_id,
        url,
        headers,
        body,
    } = request;
    let header_map = build_headers(&headers);

    let client = match reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .build()
    {
        Ok(client) => client,
        Err(err) => {
            emit_stream_event(
                &app,
                StreamEventPayload {
                    request_id,
                    kind: "error",
                    chunk: None,
                    status: None,
                    message: Some(format!("HTTP 客户端初始化失败：{err}")),
                },
            );
            return;
        }
    };

    let response = tokio::select! {
        _ = token.cancelled() => return,
        result = client.post(&url).headers(header_map).body(body).send() => result,
    };

    let response = match response {
        Ok(response) => response,
        Err(err) => {
            let message = if err.is_timeout() {
                "连接超时，请检查接口地址与网络。".to_string()
            } else {
                format!("网络请求失败：{err}")
            };
            emit_stream_event(
                &app,
                StreamEventPayload {
                    request_id,
                    kind: "error",
                    chunk: None,
                    status: None,
                    message: Some(message),
                },
            );
            return;
        }
    };

    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        let preview: String = detail.trim().chars().take(300).collect();
        emit_stream_event(
            &app,
            StreamEventPayload {
                request_id,
                kind: "error",
                chunk: None,
                status: Some(status.as_u16()),
                message: if preview.is_empty() { None } else { Some(preview) },
            },
        );
        return;
    }

    // 响应头已到达：通知前端退出等待态，开始流式接收。
    emit_stream_event(
        &app,
        StreamEventPayload {
            request_id: request_id.clone(),
            kind: "start",
            chunk: None,
            status: Some(status.as_u16()),
            message: None,
        },
    );

    let mut stream = response.bytes_stream();
    let mut utf8 = Utf8Accumulator::default();

    loop {
        tokio::select! {
            _ = token.cancelled() => return,
            item = stream.next() => {
                match item {
                    Some(Ok(bytes)) => {
                        let chunk = utf8.push(&bytes);
                        if !chunk.is_empty() {
                            emit_stream_event(
                                &app,
                                StreamEventPayload {
                                    request_id: request_id.clone(),
                                    kind: "chunk",
                                    chunk: Some(chunk),
                                    status: None,
                                    message: None,
                                },
                            );
                        }
                    }
                    Some(Err(err)) => {
                        emit_stream_event(
                            &app,
                            StreamEventPayload {
                                request_id,
                                kind: "error",
                                chunk: None,
                                status: None,
                                message: Some(format!("接收响应失败：{err}")),
                            },
                        );
                        return;
                    }
                    None => {
                        if let Some(tail) = utf8.finish() {
                            emit_stream_event(
                                &app,
                                StreamEventPayload {
                                    request_id: request_id.clone(),
                                    kind: "chunk",
                                    chunk: Some(tail),
                                    status: None,
                                    message: None,
                                },
                            );
                        }
                        emit_stream_event(
                            &app,
                            StreamEventPayload {
                                request_id,
                                kind: "done",
                                chunk: None,
                                status: None,
                                message: None,
                            },
                        );
                        return;
                    }
                }
            }
        }
    }
}

/// 增量 UTF-8 解码：网络分片可能截断多字节字符，先保留半截字节再拼接。
#[derive(Default)]
struct Utf8Accumulator {
    pending: Vec<u8>,
}

impl Utf8Accumulator {
    fn push(&mut self, bytes: &[u8]) -> String {
        self.pending.extend_from_slice(bytes);
        let mut output = String::new();
        loop {
            match std::str::from_utf8(&self.pending) {
                Ok(text) => {
                    output.push_str(text);
                    self.pending.clear();
                    break;
                }
                Err(err) => {
                    let valid = err.valid_up_to();
                    if valid > 0 {
                        if let Ok(prefix) = std::str::from_utf8(&self.pending[..valid]) {
                            output.push_str(prefix);
                        }
                    }
                    match err.error_len() {
                        None => {
                            // 尾部是合法的多字节前缀，等待下一片。
                            self.pending.drain(..valid);
                            break;
                        }
                        Some(len) => {
                            output.push('\u{FFFD}');
                            self.pending.drain(..valid + len);
                        }
                    }
                }
            }
        }
        output
    }

    fn finish(&mut self) -> Option<String> {
        if self.pending.is_empty() {
            return None;
        }
        let text = String::from_utf8_lossy(&self.pending).into_owned();
        self.pending.clear();
        Some(text)
    }
}

// ---- 技能管理：桌面端没有浏览器同源限制，统一由 Rust 转发到内置后端 ----

#[derive(Debug, Deserialize)]
pub struct SkillDraftPayload {
    pub name: String,
    pub description: String,
    pub content: String,
    pub overwrite: bool,
}

fn skills_url(endpoint: &str, suffix: &str) -> String {
    format!("{}/agent/skills{suffix}", endpoint.trim().trim_end_matches('/'))
}

fn client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .build()
        .map_err(|err| format!("HTTP 客户端初始化失败：{err}"))
}

/// 技能接口把失败原因放在 detail 里，直接取出来给界面展示。
fn skill_error(status: reqwest::StatusCode, body: &str) -> String {
    let detail = serde_json::from_str::<serde_json::Value>(body)
        .ok()
        .and_then(|value| value.get("detail").and_then(|detail| detail.as_str()).map(str::to_string))
        .filter(|text| !text.trim().is_empty())
        .unwrap_or_else(|| body.trim().chars().take(300).collect());
    if detail.is_empty() {
        format!("请求失败（HTTP {}）。", status.as_u16())
    } else {
        detail
    }
}

async fn read_body(response: reqwest::Response) -> Result<String, String> {
    let status = response.status();
    let body = response
        .text()
        .await
        .map_err(|err| format!("读取响应失败：{err}"))?;
    if status.is_success() {
        Ok(body)
    } else {
        Err(skill_error(status, &body))
    }
}

#[tauri::command]
pub async fn skills_list(endpoint: String) -> Result<String, String> {
    let response = client()?
        .get(skills_url(&endpoint, ""))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|err| format!("获取技能列表失败：{err}"))?;
    read_body(response).await
}

#[tauri::command]
pub async fn skills_create(endpoint: String, draft: SkillDraftPayload) -> Result<(), String> {
    let response = client()?
        .post(skills_url(&endpoint, ""))
        .json(&serde_json::json!({
            "name": draft.name,
            "description": draft.description,
            "content": draft.content,
            "overwrite": draft.overwrite,
        }))
        .send()
        .await
        .map_err(|err| format!("导入技能失败：{err}"))?;
    read_body(response).await.map(|_| ())
}

#[tauri::command]
pub async fn skills_upload(
    endpoint: String,
    file_name: String,
    bytes: Vec<u8>,
    overwrite: bool,
) -> Result<(), String> {
    let part = reqwest::multipart::Part::bytes(bytes).file_name(file_name);
    let form = reqwest::multipart::Form::new().part("file", part);
    let response = client()?
        .post(skills_url(&endpoint, &format!("/upload?overwrite={overwrite}")))
        .multipart(form)
        .send()
        .await
        .map_err(|err| format!("上传技能包失败：{err}"))?;
    read_body(response).await.map(|_| ())
}

#[tauri::command]
pub async fn skills_delete(endpoint: String, name: String) -> Result<(), String> {
    let encoded: String = name
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '~') {
                ch.to_string()
            } else {
                ch.to_string()
                    .as_bytes()
                    .iter()
                    .map(|byte| format!("%{byte:02X}"))
                    .collect()
            }
        })
        .collect();
    let response = client()?
        .delete(skills_url(&endpoint, &format!("/{encoded}")))
        .send()
        .await
        .map_err(|err| format!("删除技能失败：{err}"))?;
    read_body(response).await.map(|_| ())
}
