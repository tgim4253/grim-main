use std::collections::HashMap;

use anyhow::{Context, Result};
use sqlx::{Sqlite, SqlitePool, Transaction};

use crate::{
    models::app::{AppStartupState, CompleteInitialLaunchPayload},
    utils::{date::get_now_date, identifier::get_unique_id},
};

const INITIAL_LAUNCH_COMPLETED_KEY: &str = "initial_launch_completed";
const TRUE_VALUE: &str = "true";

const TIME_AUTO_TAGS: &[&str] =
    &["0-10초", "11-30초", "31-60초", "1-3분", "3분+"];
const PURPOSE_TAGS: &[&str] =
    &["포즈", "인체", "옷주름", "손", "발", "얼굴", "배경"];
const FORMAT_TAGS: &[&str] =
    &["기본", "암기 드로잉", "면", "제스처", "응용 모작"];

#[derive(Clone)]
pub struct AppService {
    pool: SqlitePool,
}

struct InitialTemplate {
    tag_groups: &'static [TagGroupTemplate],
    time_steps: &'static [TimeStepTemplate],
    session_preset: SessionPresetTemplate,
}

struct TagGroupTemplate {
    name: &'static str,
    tags: &'static [&'static str],
}

#[derive(Clone, Copy)]
struct TagRef {
    group_name: &'static str,
    tag_name: &'static str,
}

struct TimeStepTemplate {
    name: &'static str,
    default_duration_seconds: i64,
    auto_advance: bool,
    record_save_enabled: bool,
    capture_enabled: bool,
    result_required: bool,
    auto_tag_refs: &'static [TagRef],
}

#[derive(Clone, Copy)]
struct SessionPresetTemplate {
    name: &'static str,
    description: &'static str,
    auto_tag_refs: &'static [TagRef],
}

const TAG_GROUPS: &[TagGroupTemplate] = &[
    TagGroupTemplate { name: "시간", tags: TIME_AUTO_TAGS },
    TagGroupTemplate { name: "목적", tags: PURPOSE_TAGS },
    TagGroupTemplate { name: "형식", tags: FORMAT_TAGS },
];

const BASIC_TAG_REF: &[TagRef] =
    &[TagRef { group_name: "형식", tag_name: "기본" }];
const HUMAN_TAG_REF: &[TagRef] =
    &[TagRef { group_name: "목적", tag_name: "인체" }];

const TIME_STEPS: &[TimeStepTemplate] = &[
    TimeStepTemplate {
        name: "10초 준비시간",
        default_duration_seconds: 10,
        auto_advance: true,
        record_save_enabled: false,
        capture_enabled: false,
        result_required: false,
        auto_tag_refs: &[],
    },
    TimeStepTemplate {
        name: "5분 크로키",
        default_duration_seconds: 300,
        auto_advance: false,
        record_save_enabled: true,
        capture_enabled: true,
        result_required: true,
        auto_tag_refs: BASIC_TAG_REF,
    },
];

const TEMPLATE: InitialTemplate = InitialTemplate {
    tag_groups: TAG_GROUPS,
    time_steps: TIME_STEPS,
    session_preset: SessionPresetTemplate {
        name: "5분 크로키",
        description: "10초 준비시간, 5분 크로키",
        auto_tag_refs: HUMAN_TAG_REF,
    },
};

fn is_truthy(value: Option<&str>) -> bool {
    matches!(
        value.map(str::trim).map(str::to_ascii_lowercase).as_deref(),
        Some("1" | "true" | "yes" | "on")
    )
}

fn resolve_initial_template(
    _language: Option<&str>,
) -> &'static InitialTemplate {
    &TEMPLATE
}

impl AppService {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn load_startup_state(&self) -> Result<AppStartupState> {
        let key = INITIAL_LAUNCH_COMPLETED_KEY;
        let completed_value = sqlx::query_scalar!(
            r#"
            SELECT value
            FROM app_setting
            WHERE key = ?1
            "#,
            key
        )
        .fetch_optional(&self.pool)
        .await?;

        Ok(AppStartupState {
            is_initial_launch: !is_truthy(completed_value.as_deref()),
        })
    }

    pub async fn complete_initial_launch(
        &self,
        payload: CompleteInitialLaunchPayload,
    ) -> Result<()> {
        let mut tx = self.pool.begin().await?;

        if is_initial_launch_completed_in_tx(&mut tx).await? {
            tx.commit().await?;
            return Ok(());
        }

        if payload.template_start_enabled {
            let template =
                resolve_initial_template(payload.language.as_deref());
            apply_initial_template_in_tx(&mut tx, template).await?;
        }

        mark_initial_launch_completed_in_tx(&mut tx).await?;
        tx.commit().await?;

        Ok(())
    }
}

async fn is_initial_launch_completed_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
) -> Result<bool> {
    let key = INITIAL_LAUNCH_COMPLETED_KEY;
    let completed_value = sqlx::query_scalar!(
        r#"
            SELECT value
            FROM app_setting
            WHERE key = ?1
            "#,
        key
    )
    .fetch_optional(&mut **tx)
    .await?;

    Ok(is_truthy(completed_value.as_deref()))
}

async fn apply_initial_template_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    template: &InitialTemplate,
) -> Result<()> {
    apply_initial_folder_template_in_tx(tx).await?;

    let mut tag_ids_by_key = HashMap::new();

    for (group_index, group) in template.tag_groups.iter().enumerate() {
        let group_id =
            ensure_tag_group_in_tx(tx, group.name, group_index as i64).await?;
        for (tag_index, tag_name) in group.tags.iter().enumerate() {
            let tag_id = ensure_tag_in_tx(
                tx,
                group_id.as_str(),
                tag_name,
                tag_index as i64,
            )
            .await?;
            tag_ids_by_key.insert(make_tag_key(group.name, tag_name), tag_id);
        }
    }

    let mut time_step_ids_by_name = HashMap::new();
    for time_step in template.time_steps {
        let time_step_id = ensure_time_step_preset_in_tx(tx, time_step).await?;
        for tag_ref in time_step.auto_tag_refs {
            let tag_id = get_template_tag_id(&tag_ids_by_key, tag_ref)?;
            ensure_time_step_preset_tag_in_tx(
                tx,
                time_step_id.as_str(),
                tag_id.as_str(),
            )
            .await?;
        }
        time_step_ids_by_name.insert(time_step.name, time_step_id);
    }

    let session_preset_id =
        ensure_session_preset_in_tx(tx, &template.session_preset).await?;
    for tag_ref in template.session_preset.auto_tag_refs {
        let tag_id = get_template_tag_id(&tag_ids_by_key, tag_ref)?;
        ensure_session_preset_tag_in_tx(
            tx,
            session_preset_id.as_str(),
            tag_id.as_str(),
        )
        .await?;
    }

    for (index, time_step) in template.time_steps.iter().enumerate() {
        let time_step_id =
            time_step_ids_by_name.get(time_step.name).with_context(|| {
                format!("missing time step template id for {}", time_step.name)
            })?;
        ensure_session_preset_step_in_tx(
            tx,
            session_preset_id.as_str(),
            time_step_id.as_str(),
            (index + 1) as i64,
        )
        .await?;
    }

    ensure_session_preset_default_in_tx(tx, session_preset_id.as_str()).await?;

    Ok(())
}

async fn apply_initial_folder_template_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
) -> Result<()> {
    let people_id =
        ensure_virtual_folder_in_tx(tx, "사람", None, "사람", 0).await?;
    let full_body_id = ensure_virtual_folder_in_tx(
        tx,
        "전신",
        Some(people_id.as_str()),
        "사람/전신",
        0,
    )
    .await?;
    ensure_virtual_folder_in_tx(
        tx,
        "누드",
        Some(full_body_id.as_str()),
        "사람/전신/누드",
        0,
    )
    .await?;
    ensure_virtual_folder_in_tx(
        tx,
        "옷",
        Some(full_body_id.as_str()),
        "사람/전신/옷",
        1,
    )
    .await?;
    ensure_virtual_folder_in_tx(
        tx,
        "얼굴",
        Some(people_id.as_str()),
        "사람/얼굴",
        1,
    )
    .await?;
    ensure_virtual_folder_in_tx(
        tx,
        "손",
        Some(people_id.as_str()),
        "사람/손",
        2,
    )
    .await?;
    ensure_virtual_folder_in_tx(
        tx,
        "발",
        Some(people_id.as_str()),
        "사람/발",
        3,
    )
    .await?;

    let clothes_id =
        ensure_virtual_folder_in_tx(tx, "의상", None, "의상", 1).await?;
    ensure_virtual_folder_in_tx(
        tx,
        "옷주름",
        Some(clothes_id.as_str()),
        "의상/옷주름",
        0,
    )
    .await?;

    Ok(())
}

fn make_tag_key(group_name: &str, tag_name: &str) -> String {
    format!("{group_name}/{tag_name}")
}

fn get_template_tag_id(
    tag_ids_by_key: &HashMap<String, String>,
    tag_ref: &TagRef,
) -> Result<String> {
    tag_ids_by_key
        .get(&make_tag_key(tag_ref.group_name, tag_ref.tag_name))
        .cloned()
        .with_context(|| {
            format!(
                "missing template tag {} / {}",
                tag_ref.group_name, tag_ref.tag_name
            )
        })
}

async fn ensure_virtual_folder_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    name: &str,
    parent_id: Option<&str>,
    full_path: &str,
    sort_order: i64,
) -> Result<String> {
    let existing_id = if let Some(parent_id) = parent_id {
        sqlx::query_scalar!(
            r#"
            SELECT id
            FROM virtual_folder
            WHERE parent_id = ?1
              AND name = ?2
            LIMIT 1
            "#,
            parent_id,
            name
        )
        .fetch_optional(&mut **tx)
        .await?
    } else {
        sqlx::query_scalar!(
            r#"
            SELECT id
            FROM virtual_folder
            WHERE parent_id IS NULL
              AND name = ?1
            LIMIT 1
            "#,
            name
        )
        .fetch_optional(&mut **tx)
        .await?
    };

    if let Some(existing_id) = existing_id {
        return Ok(existing_id);
    }

    let id = get_unique_id();
    let now = get_now_date();
    let id_ref = id.as_str();
    let now_ref = now.as_str();
    let kind = "user";

    sqlx::query!(
        r#"
        INSERT INTO virtual_folder
          (id, name, parent_id, full_path, alias, kind, sort_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?6, ?7, ?7)
        "#,
        id_ref,
        name,
        parent_id,
        full_path,
        kind,
        sort_order,
        now_ref
    )
    .execute(&mut **tx)
    .await?;

    Ok(id)
}

async fn ensure_tag_group_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    name: &str,
    sort_order: i64,
) -> Result<String> {
    if let Some(existing_id) = sqlx::query_scalar!(
        r#"
        SELECT id
        FROM tag_group
        WHERE name = ?1
        LIMIT 1
        "#,
        name
    )
    .fetch_optional(&mut **tx)
    .await?
    {
        return Ok(existing_id);
    }

    let id = get_unique_id();
    let now = get_now_date();
    let id_ref = id.as_str();
    let now_ref = now.as_str();

    sqlx::query!(
        r#"
        INSERT INTO tag_group (id, name, sort_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4)
        "#,
        id_ref,
        name,
        sort_order,
        now_ref
    )
    .execute(&mut **tx)
    .await?;

    Ok(id)
}

async fn ensure_tag_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    group_id: &str,
    name: &str,
    sort_order: i64,
) -> Result<String> {
    if let Some(existing_id) = sqlx::query_scalar!(
        r#"
        SELECT id
        FROM tag
        WHERE group_id = ?1
          AND name = ?2
        LIMIT 1
        "#,
        group_id,
        name
    )
    .fetch_optional(&mut **tx)
    .await?
    {
        return Ok(existing_id);
    }

    let id = get_unique_id();
    let now = get_now_date();
    let id_ref = id.as_str();
    let now_ref = now.as_str();

    sqlx::query!(
        r#"
        INSERT INTO tag (id, group_id, name, color, sort_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?5)
        "#,
        id_ref,
        group_id,
        name,
        sort_order,
        now_ref
    )
    .execute(&mut **tx)
    .await?;

    Ok(id)
}

async fn ensure_time_step_preset_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    template: &TimeStepTemplate,
) -> Result<String> {
    if let Some(existing_id) = sqlx::query_scalar!(
        r#"
        SELECT id
        FROM time_step_preset
        WHERE name = ?1
        LIMIT 1
        "#,
        template.name
    )
    .fetch_optional(&mut **tx)
    .await?
    {
        return Ok(existing_id);
    }

    let id = get_unique_id();
    let now = get_now_date();
    let id_ref = id.as_str();
    let now_ref = now.as_str();
    let default_duration_seconds = template.default_duration_seconds;
    let auto_advance = if template.auto_advance { 1_i64 } else { 0_i64 };
    let record_save_enabled =
        if template.record_save_enabled { 1_i64 } else { 0_i64 };
    let capture_enabled = if template.capture_enabled { 1_i64 } else { 0_i64 };
    let grayscale_enabled = 0_i64;
    let result_required = if template.result_required { 1_i64 } else { 0_i64 };

    sqlx::query!(
        r#"
        INSERT INTO time_step_preset
          (
            id,
            name,
            default_duration_seconds,
            auto_advance,
            record_save_enabled,
            capture_enabled,
            grayscale_enabled,
            result_required,
            result_save_path,
            created_at,
            updated_at
          )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, NULL, ?9, ?9)
        "#,
        id_ref,
        template.name,
        default_duration_seconds,
        auto_advance,
        record_save_enabled,
        capture_enabled,
        grayscale_enabled,
        result_required,
        now_ref
    )
    .execute(&mut **tx)
    .await?;

    Ok(id)
}

async fn ensure_session_preset_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    template: &SessionPresetTemplate,
) -> Result<String> {
    if let Some(existing_id) = sqlx::query_scalar!(
        r#"
        SELECT id
        FROM session_preset
        WHERE name = ?1
        LIMIT 1
        "#,
        template.name
    )
    .fetch_optional(&mut **tx)
    .await?
    {
        return Ok(existing_id);
    }

    let id = get_unique_id();
    let now = get_now_date();
    let id_ref = id.as_str();
    let now_ref = now.as_str();
    let is_default = 0_i64;
    let window_width = "960";
    let window_height: Option<&str> = None;
    let is_shuffle = 0_i64;

    sqlx::query!(
        r#"
        INSERT INTO session_preset
          (id, name, description, is_default, window_width, window_height, is_shuffle, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
        "#,
        id_ref,
        template.name,
        template.description,
        is_default,
        window_width,
        window_height,
        is_shuffle,
        now_ref
    )
    .execute(&mut **tx)
    .await?;

    Ok(id)
}

async fn ensure_session_preset_step_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    session_preset_id: &str,
    time_step_preset_id: &str,
    step_order: i64,
) -> Result<()> {
    if sqlx::query_scalar!(
        r#"
        SELECT id
        FROM session_step_preset
        WHERE preset_id = ?1
          AND step_order = ?2
        LIMIT 1
        "#,
        session_preset_id,
        step_order
    )
    .fetch_optional(&mut **tx)
    .await?
    .is_some()
    {
        return Ok(());
    }

    let id = get_unique_id();
    let now = get_now_date();
    let id_ref = id.as_str();
    let now_ref = now.as_str();

    sqlx::query!(
        r#"
        INSERT INTO session_step_preset
          (id, preset_id, time_step_preset_id, step_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?5)
        "#,
        id_ref,
        session_preset_id,
        time_step_preset_id,
        step_order,
        now_ref
    )
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn ensure_time_step_preset_tag_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    time_step_preset_id: &str,
    tag_id: &str,
) -> Result<()> {
    let created_at = get_now_date();
    let created_at_ref = created_at.as_str();

    sqlx::query!(
        "INSERT OR IGNORE INTO time_step_preset_tag (time_step_preset_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
        time_step_preset_id,
        tag_id,
        created_at_ref
    )
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn ensure_session_preset_tag_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    session_preset_id: &str,
    tag_id: &str,
) -> Result<()> {
    let created_at = get_now_date();
    let created_at_ref = created_at.as_str();

    sqlx::query!(
        "INSERT OR IGNORE INTO session_preset_tag (session_preset_id, tag_id, created_at) VALUES (?1, ?2, ?3)",
        session_preset_id,
        tag_id,
        created_at_ref
    )
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn ensure_session_preset_default_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
    session_preset_id: &str,
) -> Result<()> {
    let default_id = sqlx::query_scalar!(
        r#"
        SELECT id
        FROM session_preset
        WHERE is_default = 1
        LIMIT 1
        "#,
    )
    .fetch_optional(&mut **tx)
    .await?;

    if default_id.is_some() {
        return Ok(());
    }

    let now = get_now_date();
    let now_ref = now.as_str();

    sqlx::query!(
        r#"
        UPDATE session_preset
        SET is_default = 1, updated_at = ?2
        WHERE id = ?1
        "#,
        session_preset_id,
        now_ref
    )
    .execute(&mut **tx)
    .await?;

    Ok(())
}

async fn mark_initial_launch_completed_in_tx(
    tx: &mut Transaction<'_, Sqlite>,
) -> Result<()> {
    let key = INITIAL_LAUNCH_COMPLETED_KEY;
    let value = TRUE_VALUE;
    sqlx::query!(
        r#"
        INSERT INTO app_setting (key, value)
        VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = datetime('now')
        "#,
        key,
        value
    )
    .execute(&mut **tx)
    .await
    .context("failed to mark initial launch as completed")?;

    Ok(())
}
