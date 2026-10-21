use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

pub struct SqliteStorage {
    connection: Mutex<Connection>,
}

impl SqliteStorage {
    pub fn open(path: impl AsRef<Path>) -> Result<Self, rusqlite::Error> {
        let connection = Connection::open(path)?;
        Self::initialize(connection)
    }

    fn initialize(connection: Connection) -> Result<Self, rusqlite::Error> {
        connection.busy_timeout(std::time::Duration::from_secs(5))?;
        connection.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS app_storage (
                 key TEXT PRIMARY KEY NOT NULL,
                 value TEXT NOT NULL
             );",
        )?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    fn get(&self, key: &str) -> Result<Option<String>, String> {
        self.connection
            .lock()
            .map_err(|_| "本地数据库锁已失效。".to_owned())?
            .query_row(
                "SELECT value FROM app_storage WHERE key = ?1",
                [key],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| format!("读取本地数据库失败：{error}"))
    }

    fn set(&self, key: &str, value: &str) -> Result<(), String> {
        self.connection
            .lock()
            .map_err(|_| "本地数据库锁已失效。".to_owned())?
            .execute(
                "INSERT INTO app_storage (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![key, value],
            )
            .map(|_| ())
            .map_err(|error| format!("写入本地数据库失败：{error}"))
    }

    fn remove(&self, key: &str) -> Result<(), String> {
        self.connection
            .lock()
            .map_err(|_| "本地数据库锁已失效。".to_owned())?
            .execute("DELETE FROM app_storage WHERE key = ?1", [key])
            .map(|_| ())
            .map_err(|error| format!("删除本地数据失败：{error}"))
    }
}

#[tauri::command]
pub fn storage_get(
    storage: State<'_, SqliteStorage>,
    key: String,
) -> Result<Option<String>, String> {
    storage.get(&key)
}

#[tauri::command]
pub fn storage_set(
    storage: State<'_, SqliteStorage>,
    key: String,
    value: String,
) -> Result<(), String> {
    storage.set(&key, &value)
}

#[tauri::command]
pub fn storage_remove(storage: State<'_, SqliteStorage>, key: String) -> Result<(), String> {
    storage.remove(&key)
}

#[cfg(test)]
mod tests {
    use super::SqliteStorage;

    #[test]
    fn stores_updates_and_removes_json_values() {
        let storage = SqliteStorage::initialize(rusqlite::Connection::open_in_memory().unwrap())
            .unwrap();

        storage
            .set("helloagents.chat.theme", "\"dark\"")
            .unwrap();
        assert_eq!(
            storage.get("helloagents.chat.theme").unwrap(),
            Some("\"dark\"".to_owned())
        );

        storage
            .set("helloagents.chat.theme", "\"light\"")
            .unwrap();
        assert_eq!(
            storage.get("helloagents.chat.theme").unwrap(),
            Some("\"light\"".to_owned())
        );

        storage.remove("helloagents.chat.theme").unwrap();
        assert_eq!(storage.get("helloagents.chat.theme").unwrap(), None);
    }
}
