use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::Mutex;
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rand::RngCore;
use tauri::Manager;
use tauri::path::BaseDirectory;

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

/// First-run secrets, persisted beside the database. A desktop user has no
/// `.env` file, and without these the server refuses to boot (Auth.js
/// "Configuration") or to touch the vault. Generated once with a CSPRNG;
/// missing keys are added without touching existing ones, so reinstalls and
/// upgrades keep working against the same database.
fn ensure_secrets(data_dir: &Path) -> Result<HashMap<String, String>, Box<dyn std::error::Error>> {
    let path = data_dir.join("omnichat.env");
    let mut vars: HashMap<String, String> = std::fs::read_to_string(&path)
        .unwrap_or_default()
        .lines()
        .filter_map(|line| {
            let line = line.trim();
            if line.is_empty() || line.starts_with('#') {
                return None;
            }
            let (key, value) = line.split_once('=')?;
            Some((key.trim().to_string(), value.trim().to_string()))
        })
        .collect();

    let mut dirty = false;
    for key in ["AUTH_SECRET", "ENCRYPTION_SECRET_KEY"] {
        let missing = vars.get(key).map(|value| value.len() < 32).unwrap_or(true);
        if missing {
            let mut bytes = [0u8; 32];
            rand::thread_rng().fill_bytes(&mut bytes);
            vars.insert(key.to_string(), BASE64.encode(bytes));
            dirty = true;
        }
    }

    if dirty {
        let mut contents = String::from("# OmniChat desktop secrets. Do not share this file.\n");
        for key in ["AUTH_SECRET", "ENCRYPTION_SECRET_KEY"] {
            contents.push_str(&format!("{}={}\n", key, vars[key]));
        }
        std::fs::write(&path, contents)?;
    }

    Ok(vars)
}

/// The Node runtime for the bundled server. Built installers ship their own
/// (`scripts/build-desktop.mjs` stages it under `node/`); a PATH fallback
/// remains so development builds and exotic installs still start.
fn node_binary(resource_dir: &Path) -> PathBuf {
    #[cfg(target_os = "windows")]
    let bundled = resource_dir.join("node").join("node.exe");
    #[cfg(not(target_os = "windows"))]
    let bundled = resource_dir.join("node").join("node");

    if bundled.exists() {
        return bundled;
    }

    #[cfg(target_os = "windows")]
    return PathBuf::from("node.exe");
    #[cfg(not(target_os = "windows"))]
    return PathBuf::from("node");
}

/// Start the Next.js standalone server
fn start_server(resource_dir: &Path) -> Result<Child, Box<dyn std::error::Error>> {
    let data_dir = ensure_data_dir();
    let db_path = data_dir.join("omnichat.db");
    let secrets = ensure_secrets(&data_dir)?;

    // Set environment variables for the server
    let port = "3000";
    let db_url = format!("file:{}", db_path.display());

    println!("OmniChat Data Directory: {}", data_dir.display());
    println!("Database Path: {}", db_path.display());

    // The standalone bundle is mapped to the resource root
    // (tauri.conf.json `resources`), so server.js sits beside this process's
    // resource directory -- not beside the executable, which the old path
    // assumed and which does not hold on an installed app.
    let server_path = resource_dir.join("server.js");
    let node = node_binary(resource_dir);

    println!("Starting Next.js server from: {}", server_path.display());

    let child = Command::new(&node)
        .arg(&server_path)
        .env("PORT", port)
        .env("DATABASE_URL", &db_url)
        .env("NODE_ENV", "production")
        .env("DESKTOP_MODE", "true")
        // The webview talks to this server over loopback only. Without it,
        // Auth.js rejects every Host header as untrusted and all sign-ins
        // land on /login?error=Configuration (observed in the installed app).
        .env("AUTH_TRUST_HOST", "true")
        .env("AUTH_SECRET", &secrets["AUTH_SECRET"])
        .env("ENCRYPTION_SECRET_KEY", &secrets["ENCRYPTION_SECRET_KEY"])
        .spawn()
        .map_err(|error| {
            if node.file_name().map(|name| name == "node" || name == "node.exe").unwrap_or(false)
                && error.kind() == std::io::ErrorKind::NotFound
            {
                Box::new(std::io::Error::new(
                    error.kind(),
                    "Node.js runtime not found: the installer ships its own, so a missing \
                     bundled runtime means a broken install. Reinstall OmniChat.",
                )) as Box<dyn std::error::Error>
            } else {
                Box::new(error) as Box<dyn std::error::Error>
            }
        })?;

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
                let resource_dir = app.path().resolve(".", BaseDirectory::Resource)?;

                match start_server(&resource_dir) {
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
        .on_window_event(|_window, event| {
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
