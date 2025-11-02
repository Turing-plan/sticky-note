use std::fs;
use tauri::Manager;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
struct TasksPayload {
    tasks: serde_json::Value,
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn save_notes(app_handle: tauri::AppHandle, notes: String) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    // 确保目录存在
    fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app directory: {}", e))?;
    
    let notes_file = app_dir.join("notes.json");
    fs::write(notes_file, notes).map_err(|e| format!("Failed to save notes: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn load_notes(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let notes_file = app_dir.join("notes.json");
    
    if notes_file.exists() {
        fs::read_to_string(notes_file).map_err(|e| format!("Failed to load notes: {}", e))
    } else {
        Ok("[]".to_string()) // 返回空数组
    }
}

#[tauri::command]
fn save_tasks(app_handle: tauri::AppHandle, payload: TasksPayload) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    // 确保目录存在
    fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app directory: {}", e))?;
    
    let tasks_file = app_dir.join("tasks.json");
    let tasks_json = serde_json::to_string(&payload.tasks)
        .map_err(|e| format!("Failed to serialize tasks: {}", e))?;
    fs::write(tasks_file, tasks_json).map_err(|e| format!("Failed to save tasks: {}", e))?;
    
    Ok(())
}

#[tauri::command]
fn load_tasks(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    
    let tasks_file = app_dir.join("tasks.json");
    
    if tasks_file.exists() {
        fs::read_to_string(tasks_file).map_err(|e| format!("Failed to load tasks: {}", e))
    } else {
        Ok("[]".to_string()) // 返回空数组
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{Code, Modifiers, ShortcutState};
                let app_handle = app.handle().clone();
                
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_shortcuts(["CmdOrCtrl+M", "CmdOrCtrl+Q"])?
                        .with_handler(move |app, shortcut, event| {
                            if event.state == ShortcutState::Pressed {
                                if shortcut.matches(Modifiers::CONTROL, Code::KeyM) || 
                                   shortcut.matches(Modifiers::META, Code::KeyM) {
                                    if let Some(window) = app_handle.get_webview_window("main") {
                                        match window.is_visible() {
                                            Ok(true) => {
                                                let _ = window.hide();
                                            }
                                            Ok(false) => {
                                                let _ = window.show();
                                                let _ = window.set_focus();
                                            }
                                            Err(_) => {
                                                let _ = window.show();
                                                let _ = window.set_focus();
                                            }
                                        }
                                    }
                                } else if shortcut.matches(Modifiers::CONTROL, Code::KeyQ) || 
                                          shortcut.matches(Modifiers::META, Code::KeyQ) {
                                    // Ctrl+Q 关闭应用
                                    app.exit(0);
                                }
                            }
                        })
                        .build(),
                )?;
            }
            
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![greet, save_notes, load_notes, save_tasks, load_tasks])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
