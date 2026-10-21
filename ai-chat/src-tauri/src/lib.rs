mod backend;
mod commands;
mod sqlite_store;

use backend::BackendState;
use commands::StreamRegistry;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(StreamRegistry::default())
        .manage(BackendState::default())
        .setup(|app| {
            let data_dir = app.path().app_local_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let storage =
                sqlite_store::SqliteStorage::open(data_dir.join("helloagents-chat.sqlite3"))?;
            app.manage(storage);
            if let Err(err) = backend::start(app.handle()) {
                // 后端起不来不应阻塞界面：用户仍可配置远程智能体服务。
                eprintln!("内置后端启动失败：{err}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::chat_stream,
            commands::chat_cancel,
            commands::probe_connection,
            commands::list_models,
            commands::skills_list,
            commands::skills_create,
            commands::skills_upload,
            commands::skills_delete,
            backend::backend_endpoint,
            sqlite_store::storage_get,
            sqlite_store::storage_set,
            sqlite_store::storage_remove
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app_handle, event| {
        if let tauri::RunEvent::Exit = event {
            if let Some(state) = app_handle.try_state::<BackendState>() {
                state.shutdown();
            }
        }
    });
}
