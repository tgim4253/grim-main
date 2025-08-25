use crate::bootstrap;
use crate::models::node::NodeWithConnections;
use crate::services::{db, integrity, moa_services};
use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use std::collections::HashMap;
use std::sync::Arc;
use tauri::{Emitter, State};
use tokio::sync::{Mutex, RwLock};

#[derive(Clone, Serialize)]
struct ProgressEvent {
    stage: Stage, // "Migrating", "RefreshingMounts", ...
    percent: u8,  // 0..100 (best-effort)
    note: Option<String>,
}

#[derive(Clone, Serialize, Default)]
pub enum Stage {
    Migrating,
    RefreshingMounts,
    ResolvingAnchors,
    InitialScan,

    #[default]
    Ready,
    Error,
}

#[derive(Clone, Default, Serialize)]
pub struct AppStatus {
    stage: Stage,
    percent: u8,
    last_error: Option<String>,
}

#[derive(Default, Clone)]
pub struct AppState {
    pub statuses: Arc<RwLock<HashMap<String, Arc<Mutex<AppStatus>>>>>,
}

impl AppState {
    pub async fn get_or_insert_status(&self, moa_id: &str) -> Arc<Mutex<AppStatus>> {
        {
            let rd = self.statuses.read().await;
            if let Some(s) = rd.get(moa_id) {
                return s.clone();
            }
        }
        let mut wr = self.statuses.write().await;
        if let Some(s) = wr.get(moa_id) {
            return s.clone();
        }
        let s = Arc::new(Mutex::new(AppStatus::default()));
        wr.insert(moa_id.to_string(), s.clone());
        s
    }
    // pub async fn remove(&self, moa_id: &str) {
    //     let mut wr = self.statuses.write().await;
    //     wr.remove(moa_id);
    // }
}

pub async fn bootstrap_moa_service(
    app_handle: &tauri::AppHandle,
    state: &State<'_, AppState>,
    moa_id: String,
) -> Result<()> {
    let app_handle = app_handle.clone();
    let state = state.inner().clone();

    tauri::async_runtime::spawn(async move {
        if let Err(e) =
            run_bootstrap_pipeline(app_handle.clone(), state.clone(), moa_id.clone()).await
        {
            // set error status
            set_status(&state, &moa_id, Stage::Error, 0, Some(e.to_string())).await;
            emit(
                &app_handle,
                &moa_id,
                ProgressEvent {
                    stage: Stage::Error,
                    percent: 0,
                    note: Some("Bootstrap failed".into()),
                },
            );
        }
    });
    Ok(())
}

async fn run_bootstrap_pipeline(
    app: tauri::AppHandle,
    state: AppState,
    moa_id: String,
) -> anyhow::Result<()> {
    step(&app, &state, &moa_id, Stage::Migrating, 0, Some("Applying DB migrations")).await;
    apply_migrations(&moa_id).await?;

    step(&app, &state, &moa_id, Stage::RefreshingMounts, 15, Some("Enumerating volumes")).await;

    step(&app, &state, &moa_id, Stage::ResolvingAnchors, 40, None).await;

    step(&app, &state, &moa_id, Stage::InitialScan, 60, Some("Indexing files")).await;

    step(&app, &state, &moa_id, Stage::Ready, 100, Some("Done")).await;

    Ok(())
}

async fn step(
    app_handle: &tauri::AppHandle,
    state: &AppState,
    moa_id: &str,
    stage: Stage,
    pct: u8,
    note: Option<&str>,
) {
    set_status(state, moa_id, stage.clone(), pct, note.map(|s| s.to_string())).await;
    emit(
        app_handle,
        moa_id,
        ProgressEvent { stage: stage.clone(), percent: pct, note: note.map(|s| s.to_string()) },
    );
}

async fn set_status(
    state: &AppState,
    moa_id: &str,
    stage: Stage,
    percent: u8,
    note: Option<String>,
) {
    let st = state.get_or_insert_status(&moa_id).await;
    let mut st = st.lock().await;
    if percent > st.percent {
        st.stage = stage;
        st.percent = percent;
        st.last_error = note;
    }
}

fn emit(app_handle: &tauri::AppHandle, moa_id: &str, payload: impl Serialize + Clone) {
    let topic = format!("bootstrap://progress/{}", moa_id);
    let _ = app_handle.emit(&topic, payload);
}

pub async fn fetch_init_data_for_front(moa_id: String) -> Result<NodeWithConnections> {
    let folders = db::fetch_folder_nodes(moa_id.clone()).await?;
    let connections =
        db::fetch_connections(moa_id.clone(), folders.iter().map(|f| f.id.clone()).collect())
            .await?;
    println!("{}", connections.len());
    Ok(NodeWithConnections { nodes: folders, connections: connections })
}

async fn apply_migrations(moa_id: &str) -> anyhow::Result<()> {
    let moa = moa_services::MOA_DATA.read().unwrap().get_by_id(&moa_id).unwrap();

    let name = moa.name;
    let path = moa.path;

    let base = bootstrap::build_paths(&path, &name);
    if !base.exists() || !base.is_dir() {
        return Err(anyhow!("Moa Base Folder not found"));
    }

    let _ = bootstrap::ensure_layout(&base).context("Failed to prepare .moa");

    let pool = db::DB_MANAGER.get_or_open(&moa_id).await?;

    integrity::ensure_schema(&pool)
        .await
        .map_err(|e| anyhow::anyhow!("Failed to ensure database schema: {}", e))?;

    integrity::seed_initial_data(&pool).await.context("Failed to seed initial database data")?;
    Ok(())
}
