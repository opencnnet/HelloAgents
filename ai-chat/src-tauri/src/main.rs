// 发布构建时隐藏 Windows 控制台窗口。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    helloagents_chat_lib::run();
}
