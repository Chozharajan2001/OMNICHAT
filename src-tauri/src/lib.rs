use std::env;
use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::Mutex;
use tauri::Manager;

// Store the server process to kill it on exit
static SERVER_PROCESS: Mutex<Option<Child>> = Mutex::new(None);

/// Get the user data directory for OmniChat
fn get_data_dir() -> PathBuf {
    // On desktop, use the app's data directory
    // Windows: %APPDATA%/OmniChat
    // macOS: ~/Library/Application Support/OmniChat
    // Linux: ~/.local/share/OmniChat
    let base_dir = dirs::data_local_dir().unwrap_or_else(|| PathBuf::from("."));
    base_dir.join("OmniChat")
}

/// Ensure the data directory exists
fn ensure_data_dir() -> PathBuf {
    let data_dir = get_data_dir();
    if !data_dir.exists() {
        std::fs::create_dir_all(&data_dir).expect("Failed to create data directory");
    }
    data_dir
}

/// Start the Next.js standalone server
fn start_server() -> Result<Child, Box<dyn std::error::Error>> {
    let data_dir = ensure_data_dir();
    let db_path = data_dir.join("omnichat.db");
    
    // Set environment variables for the server
    let port = "3000";
    let db_url = format!("file:{}", db_path.display());
    
    println!("OmniChat Data Directory: {}", data_dir.display());
    println!("Database Path: {}", db_path.display());
    
    #[cfg(target_os = "windows")]
    let server_path = {
        let exe_dir = env::current_exe()?.parent().unwrap().to_path_buf();
        exe_dir.join("server").join("server.js")
    };
    
    #[cfg(not(target_os = "windows"))]
    let server_path = {
        let exe_dir = env::current_exe()?.parent().unwrap().to_path_buf();
        exe_dir.join("server").join("server.js")
    };
    
    println!("Starting Next.js server from: {}", server_path.display());
    
    let child = Command::new("node")
        .arg(&server_path)
        .env("PORT", port)
        .env("DATABASE_URL", &db_url)
        .env("NODE_ENV", "production")
        .spawn()?;
    
    Ok(child)
}

/// Wait for the server to be ready
fn wait_for_server(url: &str, max_attempts: u32) -> bool {
    let client = reqwest::blocking::Client::new();
    for _ in 0..max_attempts {
        if client.get(url).send().is_ok() {
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(100));
    }
    false
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            #[cfg(not(debug_assertions))]
            {
                // Production mode: Start the embedded Next.js server
                let server_url = "http://localhost:3000";
                
                match start_server() {
                    Ok(child) => {
                        // Store the process for cleanup
                        *SERVER_PROCESS.lock().unwrap() = Some(child);
                        
                        // Wait for server to be ready
                        if !wait_for_server(server_url, 100) {
                            eprintln!("Failed to start Next.js server");
                            return Err(Box::new(std::io::Error::new(
                                std::io::ErrorKind::Other,
                                "Server startup timeout",
                            )) as Box<dyn std::error::Error>);
                        }
                        
                        println!("Next.js server started on {}", server_url);
                        
                        // Load the server URL in the window
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.eval(&format!("window.location.href = '{}'", server_url));
                        }
                    }
                    Err(e) => {
                        eprintln!("Failed to start server: {}", e);
                        return Err(e);
                    }
                }
            }
            
            #[cfg(debug_assertions)]
            {
                // Development mode: Connect to dev server
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }
            
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Clean up the server process on window close
                if let Ok(mut process) = SERVER_PROCESS.lock() {
                    if let Some(mut child) = process.take() {
                        let _ = child.kill();
                        println!("Next.js server stopped");
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
