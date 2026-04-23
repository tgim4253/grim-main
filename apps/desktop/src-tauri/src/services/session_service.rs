use anyhow::{anyhow, Result};

use crate::{
    models::session::{
        DeleteSessionPresetPayload, SaveSessionPresetPayload, SessionDetail,
        SessionPreset, SessionSummary,
    },
    repositories::{
        NewSessionInput, SaveSessionPresetStepInput, SessionRepository,
        SettingsRepository, TagRepository, UpsertSessionPresetInput,
    },
    services::RecordService,
    utils::{date::get_now_date, identifier::get_unique_id},
};

#[derive(Clone)]
pub struct SessionService {
    session_repository: SessionRepository,
    settings_repository: SettingsRepository,
    tag_repository: TagRepository,
    record_service: RecordService,
}

impl SessionService {
    pub fn new(
        session_repository: SessionRepository,
        settings_repository: SettingsRepository,
        tag_repository: TagRepository,
        record_service: RecordService,
    ) -> Self {
        Self {
            session_repository,
            settings_repository,
            tag_repository,
            record_service,
        }
    }

    pub async fn list_recent_sessions(
        &self,
        limit: i64,
    ) -> Result<Vec<SessionSummary>> {
        self.session_repository.list_recent(limit).await
    }

    pub async fn get_session_detail(
        &self,
        session_id: &str,
    ) -> Result<SessionDetail> {
        let summary = self.session_repository.get_summary(session_id).await?;
        let records =
            self.record_service.list_records_by_session(session_id).await?;
        let preset = match summary.preset_id.as_deref() {
            Some(target_id) => self
                .session_repository
                .list_presets()
                .await?
                .into_iter()
                .find(|candidate| candidate.id == target_id),
            None => None,
        };

        Ok(SessionDetail { summary, preset, records })
    }

    pub async fn list_session_presets(&self) -> Result<Vec<SessionPreset>> {
        self.session_repository.list_presets().await
    }

    pub async fn save_session_preset(
        &self,
        payload: SaveSessionPresetPayload,
    ) -> Result<Vec<SessionPreset>> {
        let now = get_now_date();
        let preset_id = payload.id.clone().unwrap_or_else(get_unique_id);
        let mut tx = self.session_repository.begin().await?;

        if payload.is_default {
            self.session_repository
                .clear_default_flags_in_tx(&mut tx, &now)
                .await?;
        }

        self.session_repository
            .upsert_preset_in_tx(
                &mut tx,
                &UpsertSessionPresetInput {
                    id: &preset_id,
                    name: &payload.name,
                    description: payload.description.as_deref(),
                    is_default: payload.is_default,
                    timestamp: &now,
                    is_update: payload.id.is_some(),
                },
            )
            .await?;

        if payload.id.is_some() {
            self.session_repository
                .delete_preset_steps_in_tx(&mut tx, &preset_id)
                .await?;
        }

        for step in &payload.steps {
            let step_id = step.id.clone().unwrap_or_else(get_unique_id);
            let tags = self
                .tag_repository
                .ensure_tags_by_names_in_tx(&mut tx, &step.auto_tag_names)
                .await?;

            self.session_repository
                .insert_step_in_tx(
                    &mut tx,
                    &SaveSessionPresetStepInput {
                        id: &step_id,
                        preset_id: &preset_id,
                        step_order: step.step_order,
                        name: &step.name,
                        default_duration_seconds: step.default_duration_seconds,
                        result_required: step.result_required,
                        result_external_path: step
                            .result_external_path
                            .as_deref(),
                    },
                    &now,
                )
                .await?;
            self.session_repository
                .link_step_tags_in_tx(
                    &mut tx,
                    &step_id,
                    &tags.iter().map(|tag| tag.id.clone()).collect::<Vec<_>>(),
                    &now,
                )
                .await?;
        }

        let should_promote_current = payload.is_default
            || self
                .session_repository
                .find_default_id_in_tx(&mut tx)
                .await?
                .is_none();
        if should_promote_current {
            self.session_repository
                .set_default_in_tx(&mut tx, &preset_id, &now)
                .await?;
            self.settings_repository
                .set_active_session_preset_in_tx(
                    &mut tx,
                    Some(&preset_id),
                    &now,
                )
                .await?;
        }

        tx.commit().await?;
        self.session_repository.list_presets().await
    }

    pub async fn delete_session_preset(
        &self,
        payload: DeleteSessionPresetPayload,
    ) -> Result<Vec<SessionPreset>> {
        let mut tx = self.session_repository.begin().await?;
        let active_preset_id = self
            .settings_repository
            .load_active_session_preset_id_in_tx(&mut tx)
            .await?;
        self.session_repository
            .delete_preset_in_tx(&mut tx, &payload.preset_id)
            .await?;

        let remaining_default =
            self.session_repository.find_default_id_in_tx(&mut tx).await?;

        if let Some(default_preset_id) = remaining_default {
            if active_preset_id.is_none()
                || active_preset_id.as_deref()
                    == Some(payload.preset_id.as_str())
            {
                let now = get_now_date();
                self.settings_repository
                    .set_active_session_preset_in_tx(
                        &mut tx,
                        Some(&default_preset_id),
                        &now,
                    )
                    .await?;
            }
        } else if let Some(first_preset_id) =
            self.session_repository.find_first_id_in_tx(&mut tx).await?
        {
            let now = get_now_date();
            self.session_repository
                .set_default_in_tx(&mut tx, &first_preset_id, &now)
                .await?;
            self.settings_repository
                .set_active_session_preset_in_tx(
                    &mut tx,
                    Some(&first_preset_id),
                    &now,
                )
                .await?;
        } else {
            let now = get_now_date();
            self.settings_repository
                .set_active_session_preset_in_tx(&mut tx, None, &now)
                .await?;
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

    pub async fn create_session(
        &self,
        title: &str,
        preset_id: Option<&str>,
    ) -> Result<String> {
        let now = get_now_date();
        let session_id = get_unique_id();
        self.session_repository
            .create_session(&NewSessionInput {
                id: &session_id,
                title,
                preset_id,
                started_at: &now,
            })
            .await?;
        Ok(session_id)
    }

    pub async fn delete_session(&self, session_id: &str) -> Result<()> {
        self.session_repository.delete(session_id).await
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
            DeleteSessionPresetPayload, SaveSessionPresetPayload,
            SessionPreset, SessionPresetStepDraft,
        },
        repositories::{
            AssetRepository, RecordRepository, SessionRepository,
            SettingsRepository, TagRepository,
        },
        services::RecordService,
        state::bootstrap::{ensure_schema, open_or_create_db, seed_defaults},
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
        let settings_repository = SettingsRepository::new(pool.clone());
        let tag_repository = TagRepository::new(pool.clone());
        let record_service = RecordService::new(
            RecordRepository::new(pool.clone()),
            AssetRepository::new(pool.clone()),
        );

        SessionService::new(
            SessionRepository::new(pool),
            settings_repository,
            tag_repository,
            record_service,
        )
    }

    fn to_save_payload(
        preset: &SessionPreset,
        is_default: bool,
    ) -> SaveSessionPresetPayload {
        SaveSessionPresetPayload {
            id: Some(preset.id.clone()),
            name: preset.name.clone(),
            description: preset.description.clone(),
            is_default,
            steps: preset
                .steps
                .iter()
                .map(|step| SessionPresetStepDraft {
                    id: Some(step.id.clone()),
                    name: step.name.clone(),
                    step_order: step.step_order,
                    default_duration_seconds: step.default_duration_seconds,
                    auto_tag_names: step
                        .auto_tags
                        .iter()
                        .map(|tag| tag.name.clone())
                        .collect(),
                    result_required: step.result_required,
                    result_external_path: step.result_external_path.clone(),
                })
                .collect(),
        }
    }

    #[tokio::test]
    async fn save_session_preset_keeps_a_default_preset() {
        let dir = make_temp_dir("default-invariant");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

        let service = build_service(pool.clone());
        let settings_repository = SettingsRepository::new(pool);
        let existing = service
            .list_session_presets()
            .await
            .expect("failed to list presets")
            .into_iter()
            .next()
            .expect("expected seeded preset");

        let presets = service
            .save_session_preset(to_save_payload(&existing, false))
            .await
            .expect("failed to save preset");

        assert_eq!(
            presets.iter().filter(|preset| preset.is_default).count(),
            1
        );
        assert!(
            presets
                .iter()
                .find(|preset| preset.id == existing.id)
                .expect("expected saved preset")
                .is_default
        );

        let settings = settings_repository
            .load()
            .await
            .expect("failed to reload settings");
        assert_eq!(settings.active_session_preset_id, Some(existing.id));

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn delete_last_session_preset_clears_active_preset() {
        let dir = make_temp_dir("delete-last");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");
        seed_defaults(&pool).await.expect("failed to seed defaults");

        let service = build_service(pool.clone());
        let settings_repository = SettingsRepository::new(pool);
        let existing = service
            .list_session_presets()
            .await
            .expect("failed to list presets")
            .into_iter()
            .next()
            .expect("expected seeded preset");

        let presets = service
            .delete_session_preset(DeleteSessionPresetPayload {
                preset_id: existing.id.clone(),
            })
            .await
            .expect("failed to delete preset");

        assert!(presets.is_empty());

        let settings = settings_repository
            .load()
            .await
            .expect("failed to reload settings");
        assert_eq!(settings.active_session_preset_id, None);

        let _ = fs::remove_dir_all(dir);
    }
}
