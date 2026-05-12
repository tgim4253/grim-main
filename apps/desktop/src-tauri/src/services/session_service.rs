use anyhow::{anyhow, ensure, Result};
use sqlx::{Sqlite, Transaction};

use crate::{
    models::session::{
        DeleteSessionPresetPayload, DeleteTimeStepPresetPayload,
        SaveSessionPresetPayload, SaveTimeStepPresetPayload, SessionPreset,
        TimeStepPreset,
    },
    repositories::{
        SaveSessionPresetStepInput, SessionRepository, TagRepository,
        UpsertSessionPresetInput, UpsertTimeStepPresetInput,
    },
    utils::{date::get_now_date, identifier::get_unique_id},
};

#[derive(Clone)]
pub struct SessionService {
    session_repository: SessionRepository,
    tag_repository: TagRepository,
}

fn normalize_tag_ids(tag_ids: &[String]) -> Vec<String> {
    tag_ids.iter().fold(Vec::<String>::new(), |mut acc, tag_id| {
        let tag_id = tag_id.trim();
        if !tag_id.is_empty() && !acc.iter().any(|existing| existing == tag_id)
        {
            acc.push(tag_id.to_string());
        }
        acc
    })
}

impl SessionService {
    pub fn new(
        session_repository: SessionRepository,
        tag_repository: TagRepository,
    ) -> Self {
        Self { session_repository, tag_repository }
    }

    pub async fn list_session_presets(&self) -> Result<Vec<SessionPreset>> {
        self.session_repository.list_presets().await
    }

    pub async fn list_time_step_presets(&self) -> Result<Vec<TimeStepPreset>> {
        self.session_repository.list_time_step_presets().await
    }

    pub async fn save_session_preset(
        &self,
        payload: SaveSessionPresetPayload,
    ) -> Result<Vec<SessionPreset>> {
        let now = get_now_date();
        let mut tx = self.session_repository.begin().await?;
        self.save_session_preset_in_tx(&mut tx, &payload, &now).await?;
        tx.commit().await?;
        self.session_repository.list_presets().await
    }

    async fn save_session_preset_in_tx(
        &self,
        tx: &mut Transaction<'_, Sqlite>,
        payload: &SaveSessionPresetPayload,
        now: &str,
    ) -> Result<String> {
        ensure!(
            !payload.steps.is_empty(),
            "Session preset must have at least one time step"
        );

        let preset_id = payload.id.clone().unwrap_or_else(get_unique_id);

        if payload.is_default {
            self.session_repository.clear_default_flags_in_tx(tx, now).await?;
        }

        self.session_repository
            .upsert_preset_in_tx(
                tx,
                &UpsertSessionPresetInput {
                    id: &preset_id,
                    name: &payload.name,
                    description: payload.description.as_deref(),
                    is_default: payload.is_default,
                    window_width: payload.window_width.as_deref(),
                    window_height: payload.window_height.as_deref(),
                    is_shuffle: payload.is_shuffle,
                    timestamp: now,
                    is_update: payload.id.is_some(),
                },
            )
            .await?;

        let auto_tag_ids = normalize_tag_ids(&payload.auto_tag_ids);
        self.session_repository
            .replace_session_preset_tags_in_tx(
                tx,
                &preset_id,
                &auto_tag_ids,
                now,
            )
            .await?;

        if payload.id.is_some() {
            self.session_repository
                .delete_preset_steps_in_tx(tx, &preset_id)
                .await?;
        }

        for step in &payload.steps {
            let step_id = step.id.clone().unwrap_or_else(get_unique_id);
            self.session_repository
                .insert_step_in_tx(
                    tx,
                    &SaveSessionPresetStepInput {
                        id: &step_id,
                        preset_id: &preset_id,
                        time_step_preset_id: &step.time_step_preset_id,
                        step_order: step.step_order,
                    },
                    now,
                )
                .await?;
        }

        if self.session_repository.find_default_id_in_tx(tx).await?.is_none() {
            self.session_repository
                .set_default_in_tx(tx, &preset_id, now)
                .await?;
        }

        Ok(preset_id)
    }

    pub async fn save_time_step_preset(
        &self,
        payload: SaveTimeStepPresetPayload,
    ) -> Result<Vec<TimeStepPreset>> {
        let now = get_now_date();
        let preset_id = payload.id.clone().unwrap_or_else(get_unique_id);
        let mut tx = self.session_repository.begin().await?;
        let tag_ids = if payload.auto_tag_ids.is_empty() {
            self.tag_repository
                .ensure_tags_by_names_in_tx(&mut tx, &payload.auto_tag_names)
                .await?
                .iter()
                .map(|tag| tag.id.clone())
                .collect::<Vec<_>>()
        } else {
            normalize_tag_ids(&payload.auto_tag_ids)
        };

        self.session_repository
            .upsert_time_step_preset_in_tx(
                &mut tx,
                &UpsertTimeStepPresetInput {
                    id: &preset_id,
                    name: &payload.name,
                    default_duration_seconds: payload.default_duration_seconds,
                    auto_advance: payload.auto_advance,
                    record_save_enabled: payload.record_save_enabled,
                    capture_enabled: payload.capture_enabled,
                    grayscale_enabled: payload.grayscale_enabled,
                    result_required: payload.result_required,
                    result_save_path: payload.result_save_path.as_deref(),
                    timestamp: &now,
                    is_update: payload.id.is_some(),
                },
            )
            .await?;
        self.session_repository
            .replace_time_step_preset_tags_in_tx(
                &mut tx, &preset_id, &tag_ids, &now,
            )
            .await?;

        tx.commit().await?;
        self.session_repository.list_time_step_presets().await
    }

    pub async fn delete_time_step_preset(
        &self,
        payload: DeleteTimeStepPresetPayload,
    ) -> Result<Vec<TimeStepPreset>> {
        let mut tx = self.session_repository.begin().await?;
        self.session_repository
            .delete_time_step_preset_in_tx(&mut tx, &payload.preset_id)
            .await?;
        tx.commit().await?;
        self.session_repository.list_time_step_presets().await
    }

    pub async fn delete_session_preset(
        &self,
        payload: DeleteSessionPresetPayload,
    ) -> Result<Vec<SessionPreset>> {
        let mut tx = self.session_repository.begin().await?;
        self.session_repository
            .delete_preset_in_tx(&mut tx, &payload.preset_id)
            .await?;

        if self
            .session_repository
            .find_default_id_in_tx(&mut tx)
            .await?
            .is_none()
        {
            if let Some(first_preset_id) =
                self.session_repository.find_first_id_in_tx(&mut tx).await?
            {
                let now = get_now_date();
                self.session_repository
                    .set_default_in_tx(&mut tx, &first_preset_id, &now)
                    .await?;
            }
        }

        tx.commit().await?;
        self.session_repository.list_presets().await
    }

    pub async fn load_session_preset(
        &self,
        preset_id: Option<&str>,
    ) -> Result<SessionPreset> {
        let presets = self.session_repository.list_presets().await?;
        if let Some(target_id) = preset_id {
            if let Some(preset) =
                presets.iter().find(|preset| preset.id == target_id)
            {
                return Ok(preset.clone());
            }
        }

        presets
            .iter()
            .find(|preset| preset.is_default)
            .cloned()
            .or_else(|| presets.into_iter().next())
            .ok_or_else(|| anyhow!("No session presets available"))
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::PathBuf,
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::{
        models::session::{
            DeleteTimeStepPresetPayload, SaveSessionPresetPayload,
            SaveTimeStepPresetPayload, SessionPresetStepDraft, TimeStepPreset,
        },
        repositories::{SessionRepository, TagRepository},
        state::bootstrap::{ensure_schema, open_or_create_db},
    };

    use super::SessionService;

    fn make_temp_dir(prefix: &str) -> PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after unix epoch")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "grim-session-service-{prefix}-{}-{nanos}",
            std::process::id()
        ));
        fs::create_dir_all(&dir).expect("failed to create temp dir");
        dir
    }

    fn build_service(pool: sqlx::SqlitePool) -> SessionService {
        let tag_repository = TagRepository::new(pool.clone());
        SessionService::new(SessionRepository::new(pool), tag_repository)
    }

    async fn build_empty_service(prefix: &str) -> (PathBuf, SessionService) {
        let dir = make_temp_dir(prefix);
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        (dir, build_service(pool))
    }

    async fn create_time_step(
        service: &SessionService,
        name: &str,
    ) -> TimeStepPreset {
        service
            .save_time_step_preset(SaveTimeStepPresetPayload {
                id: None,
                name: name.to_string(),
                default_duration_seconds: Some(180),
                auto_advance: true,
                record_save_enabled: true,
                capture_enabled: false,
                grayscale_enabled: false,
                result_required: false,
                result_save_path: None,
                auto_tag_ids: Vec::new(),
                auto_tag_names: Vec::new(),
            })
            .await
            .expect("failed to create time step preset")
            .into_iter()
            .find(|preset| preset.name == name)
            .expect("expected created time step")
    }

    #[tokio::test]
    async fn save_session_preset_keeps_only_time_step_refs() {
        let (dir, service) = build_empty_service("refs-only").await;
        let time_step = create_time_step(&service, "Reference Step").await;

        let presets = service
            .save_session_preset(SaveSessionPresetPayload {
                id: None,
                name: "Reference Only".to_string(),
                description: None,
                is_default: false,
                window_width: Some("800".to_string()),
                window_height: None,
                is_shuffle: true,
                auto_tag_ids: Vec::new(),
                steps: vec![SessionPresetStepDraft {
                    id: None,
                    time_step_preset_id: time_step.id.clone(),
                    step_order: 1,
                }],
            })
            .await
            .expect("failed to save session preset");

        let saved = presets
            .into_iter()
            .find(|preset| preset.name == "Reference Only")
            .expect("expected saved session preset");

        assert_eq!(saved.window_width.as_deref(), Some("800"));
        assert!(saved.is_shuffle);
        assert_eq!(saved.steps.len(), 1);
        assert_eq!(saved.steps[0].time_step_preset_id, time_step.id);
        assert_eq!(saved.steps[0].time_step.name, time_step.name);

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn session_preset_read_hydrates_time_step_fields_and_tags() {
        let (dir, service) = build_empty_service("hydrate").await;
        let time_steps = service
            .save_time_step_preset(SaveTimeStepPresetPayload {
                id: None,
                name: "Tagged Pose".to_string(),
                default_duration_seconds: Some(45),
                auto_advance: true,
                record_save_enabled: true,
                capture_enabled: true,
                grayscale_enabled: true,
                result_required: true,
                result_save_path: Some("/tmp/result.png".to_string()),
                auto_tag_ids: Vec::new(),
                auto_tag_names: vec!["Warmup".to_string(), "Pose".to_string()],
            })
            .await
            .expect("failed to save time step");
        let time_step = time_steps
            .into_iter()
            .find(|preset| preset.name == "Tagged Pose")
            .expect("expected created time step");

        service
            .save_session_preset(SaveSessionPresetPayload {
                id: None,
                name: "Hydrated Session".to_string(),
                description: None,
                is_default: false,
                window_width: None,
                window_height: None,
                is_shuffle: false,
                auto_tag_ids: vec![time_step.auto_tags[0].id.clone()],
                steps: vec![SessionPresetStepDraft {
                    id: None,
                    time_step_preset_id: time_step.id.clone(),
                    step_order: 1,
                }],
            })
            .await
            .expect("failed to save session preset");

        let session = service
            .list_session_presets()
            .await
            .expect("failed to list session presets")
            .into_iter()
            .find(|preset| preset.name == "Hydrated Session")
            .expect("expected session preset");
        let hydrated = &session.steps[0].time_step;

        assert_eq!(hydrated.name, "Tagged Pose");
        assert_eq!(hydrated.default_duration_seconds, Some(45));
        assert!(hydrated.auto_advance);
        assert!(hydrated.record_save_enabled);
        assert!(hydrated.capture_enabled);
        assert!(hydrated.grayscale_enabled);
        assert!(hydrated.result_required);
        assert_eq!(
            hydrated.result_save_path.as_deref(),
            Some("/tmp/result.png")
        );
        assert_eq!(
            hydrated
                .auto_tags
                .iter()
                .map(|tag| tag.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Pose", "Warmup"]
        );
        assert_eq!(session.auto_tags.len(), 1);
        assert_eq!(session.auto_tags[0].id, time_step.auto_tags[0].id);

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn updating_time_step_updates_linked_session_read_result() {
        let (dir, service) = build_empty_service("live-hydrate").await;
        let time_step = service
            .save_time_step_preset(SaveTimeStepPresetPayload {
                id: None,
                name: "Short Pose".to_string(),
                default_duration_seconds: Some(30),
                auto_advance: true,
                record_save_enabled: true,
                capture_enabled: false,
                grayscale_enabled: false,
                result_required: false,
                result_save_path: None,
                auto_tag_ids: Vec::new(),
                auto_tag_names: vec!["Warmup".to_string()],
            })
            .await
            .expect("failed to create time step preset")
            .into_iter()
            .find(|preset| preset.name == "Short Pose")
            .expect("expected created time step preset");

        service
            .save_session_preset(SaveSessionPresetPayload {
                id: None,
                name: "Linked Session".to_string(),
                description: None,
                is_default: false,
                window_width: None,
                window_height: None,
                is_shuffle: false,
                auto_tag_ids: Vec::new(),
                steps: vec![SessionPresetStepDraft {
                    id: None,
                    time_step_preset_id: time_step.id.clone(),
                    step_order: 1,
                }],
            })
            .await
            .expect("failed to create linked session preset");

        service
            .save_time_step_preset(SaveTimeStepPresetPayload {
                id: Some(time_step.id.clone()),
                name: "Long Pose".to_string(),
                default_duration_seconds: Some(120),
                auto_advance: false,
                record_save_enabled: false,
                capture_enabled: true,
                grayscale_enabled: true,
                result_required: true,
                result_save_path: Some("/tmp/result.png".to_string()),
                auto_tag_ids: Vec::new(),
                auto_tag_names: vec!["Hold".to_string()],
            })
            .await
            .expect("failed to update time step preset");

        let linked_session = service
            .list_session_presets()
            .await
            .expect("failed to list session presets")
            .into_iter()
            .find(|preset| preset.name == "Linked Session")
            .expect("expected linked session preset");
        let linked_step = &linked_session.steps[0].time_step;

        assert_eq!(linked_step.name, "Long Pose");
        assert_eq!(linked_step.default_duration_seconds, Some(120));
        assert!(!linked_step.auto_advance);
        assert!(!linked_step.record_save_enabled);
        assert!(linked_step.capture_enabled);
        assert!(linked_step.grayscale_enabled);
        assert!(linked_step.result_required);
        assert_eq!(
            linked_step.result_save_path.as_deref(),
            Some("/tmp/result.png")
        );
        assert_eq!(
            linked_step
                .auto_tags
                .iter()
                .map(|tag| tag.name.as_str())
                .collect::<Vec<_>>(),
            vec!["Hold"]
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn deleting_referenced_time_step_fails() {
        let (dir, service) = build_empty_service("delete-referenced").await;
        let time_step = create_time_step(&service, "Referenced Step").await;

        service
            .save_session_preset(SaveSessionPresetPayload {
                id: None,
                name: "Uses Referenced Step".to_string(),
                description: None,
                is_default: false,
                window_width: None,
                window_height: None,
                is_shuffle: false,
                auto_tag_ids: Vec::new(),
                steps: vec![SessionPresetStepDraft {
                    id: None,
                    time_step_preset_id: time_step.id.clone(),
                    step_order: 1,
                }],
            })
            .await
            .expect("failed to save referencing session preset");

        let result = service
            .delete_time_step_preset(DeleteTimeStepPresetPayload {
                preset_id: time_step.id,
            })
            .await;

        assert!(result.is_err());

        let _ = fs::remove_dir_all(dir);
    }
}
