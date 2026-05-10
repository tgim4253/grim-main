use std::path::Path;

use anyhow::{Context, Result};
use sqlx::{
    pool::PoolOptions,
    sqlite::{
        SqliteConnectOptions, SqliteConnection, SqliteJournalMode,
        SqliteSynchronous,
    },
    Pool, Sqlite,
};

use crate::utils::{date::get_now_date, identifier::get_unique_id};

const DEFAULT_TAG_GROUPS: &[DefaultTagGroup] = &[
    DefaultTagGroup {
        name: "Time / Auto",
        sort_order: 0,
        tags: &["0-10s", "11-30s", "31-60s", "1-3m", "3m+"],
    },
    DefaultTagGroup {
        name: "Purpose",
        sort_order: 10,
        tags: &[
            "Pose",
            "Full body",
            "Clothes folds",
            "Hands",
            "Feet",
            "Face",
            "Background",
        ],
    },
    DefaultTagGroup {
        name: "Format",
        sort_order: 20,
        tags: &["Basic", "Memory", "Plane", "Gesture", "Applied Copy"],
    },
];

struct DefaultTagGroup {
    name: &'static str,
    sort_order: i64,
    tags: &'static [&'static str],
}

pub async fn open_or_create_db(db_path: &Path) -> Result<Pool<Sqlite>> {
    let options = SqliteConnectOptions::new()
        .filename(db_path)
        .create_if_missing(true)
        .read_only(false)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .busy_timeout(std::time::Duration::from_secs(15));

    let pool = PoolOptions::new()
        .max_connections(4)
        .after_connect(|conn: &mut SqliteConnection, _meta| {
            Box::pin(async move {
                sqlx::query!("PRAGMA foreign_keys = ON;")
                    .execute(&mut *conn)
                    .await?;
                sqlx::query!("PRAGMA synchronous = NORMAL;")
                    .execute(&mut *conn)
                    .await?;
                Ok::<_, sqlx::Error>(())
            })
        })
        .connect_with(options)
        .await
        .with_context(|| {
            format!("Failed to open/create sqlite at {}", db_path.display())
        })?;

    Ok(pool)
}

pub async fn ensure_schema(pool: &Pool<Sqlite>) -> Result<()> {
    sqlx::migrate!().run(pool).await?;
    Ok(())
}

pub async fn seed_defaults(pool: &Pool<Sqlite>) -> Result<()> {
    let now = get_now_date();
    let now_ref = now.as_str();

    let row =
        sqlx::query!(r#"SELECT COUNT(*) AS "count!: i64" FROM session_preset"#)
            .fetch_one(pool)
            .await?;
    if row.count == 0 {
        let time_step_id = get_unique_id();
        let time_step_id_ref = time_step_id.as_str();
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
            VALUES (?1, 'Croquis', 180, 1, 1, 0, 0, 0, NULL, ?2, ?2)
            "#,
            time_step_id_ref,
            now_ref
        )
        .execute(pool)
        .await?;

        let preset_id = get_unique_id();
        let preset_id_ref = preset_id.as_str();
        sqlx::query!(
            r#"
            INSERT INTO session_preset
            (
                id,
                name,
                description,
                is_default,
                window_width,
                window_height,
                is_shuffle,
                created_at,
                updated_at
            )
            VALUES (?1, 'Quick Croquis', 'Default single-step croquis preset', 1, '960', NULL, 0, ?2, ?2)
            "#,
            preset_id_ref,
            now_ref
        )
        .execute(pool)
        .await?;

        let step_id = get_unique_id();
        let step_id_ref = step_id.as_str();
        sqlx::query!(
            r#"
            INSERT INTO session_step_preset
            (id, preset_id, time_step_preset_id, step_order, created_at, updated_at)
            VALUES (?1, ?2, ?3, 1, ?4, ?4)
            "#,
            step_id_ref,
            preset_id_ref,
            time_step_id_ref,
            now_ref
        )
        .execute(pool)
        .await?;
    }

    seed_default_tags(pool, now_ref).await?;

    Ok(())
}

async fn seed_default_tags(pool: &Pool<Sqlite>, now: &str) -> Result<()> {
    let mut tx = pool.begin().await?;

    for group in DEFAULT_TAG_GROUPS {
        let group_id = get_unique_id();
        let group_id_ref = group_id.as_str();
        sqlx::query!(
            r#"
            INSERT OR IGNORE INTO tag_group
            (id, name, sort_order, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?4)
            "#,
            group_id_ref,
            group.name,
            group.sort_order,
            now
        )
        .execute(&mut *tx)
        .await?;

        let row = sqlx::query!(
            r#"
            SELECT id
            FROM tag_group
            WHERE name = ?1
            "#,
            group.name
        )
        .fetch_one(&mut *tx)
        .await?;
        let saved_group_id = row.id;
        let saved_group_id_ref = saved_group_id.as_str();

        for (index, tag_name) in group.tags.iter().enumerate() {
            let tag_id = get_unique_id();
            let tag_id_ref = tag_id.as_str();
            let sort_order = (index as i64) * 10;
            sqlx::query!(
                r#"
                INSERT OR IGNORE INTO tag
                (id, group_id, name, color, sort_order, created_at, updated_at)
                VALUES (?1, ?2, ?3, NULL, ?4, ?5, ?5)
                "#,
                tag_id_ref,
                saved_group_id_ref,
                tag_name,
                sort_order,
                now
            )
            .execute(&mut *tx)
            .await?;
        }
    }

    tx.commit().await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use std::{env, fs, path::PathBuf};

    use super::*;

    fn make_temp_dir(name: &str) -> PathBuf {
        let dir = env::temp_dir()
            .join(format!("grim-bootstrap-{name}-{}", get_unique_id()));
        fs::create_dir_all(&dir).expect("failed to create temp dir");
        dir
    }

    #[tokio::test]
    async fn seed_defaults_creates_default_tag_groups_and_tags_once() {
        let dir = make_temp_dir("default-tags");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");

        seed_defaults(&pool).await.expect("failed to seed defaults");
        seed_defaults(&pool).await.expect("failed to seed defaults again");

        let group_rows = sqlx::query!(
            r#"
            SELECT name, sort_order
            FROM tag_group
            WHERE name IN ('Time / Auto', 'Purpose', 'Format')
            ORDER BY sort_order ASC, name ASC
            "#
        )
        .fetch_all(&pool)
        .await
        .expect("failed to load tag groups");
        let group_names =
            group_rows.iter().map(|row| row.name.as_str()).collect::<Vec<_>>();
        assert_eq!(group_names, vec!["Time / Auto", "Purpose", "Format"]);

        let tag_row = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM tag t
            INNER JOIN tag_group tg ON tg.id = t.group_id
            WHERE tg.name IN ('Time / Auto', 'Purpose', 'Format')
            "#
        )
        .fetch_one(&pool)
        .await
        .expect("failed to count default tags");
        assert_eq!(tag_row.count, 17);

        let purpose_tags = sqlx::query!(
            r#"
            SELECT t.name
            FROM tag t
            INNER JOIN tag_group tg ON tg.id = t.group_id
            WHERE tg.name = 'Purpose'
            ORDER BY t.sort_order ASC, t.name ASC
            "#
        )
        .fetch_all(&pool)
        .await
        .expect("failed to load purpose tags")
        .into_iter()
        .map(|row| row.name)
        .collect::<Vec<_>>();

        assert_eq!(
            purpose_tags,
            vec![
                "Pose",
                "Full body",
                "Clothes folds",
                "Hands",
                "Feet",
                "Face",
                "Background",
            ]
        );

        let _ = fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn seed_defaults_adds_missing_tags_to_existing_default_group() {
        let dir = make_temp_dir("existing-default-tag-group");
        let db_path = dir.join("grim.db");
        let pool =
            open_or_create_db(&db_path).await.expect("failed to open db");
        ensure_schema(&pool).await.expect("failed to apply schema");

        sqlx::query!(
            r#"
            INSERT INTO tag_group
            (id, name, sort_order, created_at, updated_at)
            VALUES ('existing-purpose-group', 'Purpose', 999, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
            "#,
        )
        .execute(&pool)
        .await
        .expect("failed to insert existing default group");

        seed_defaults(&pool).await.expect("failed to seed defaults");

        let purpose_tag_row = sqlx::query!(
            r#"
            SELECT COUNT(*) AS "count!: i64"
            FROM tag t
            INNER JOIN tag_group tg ON tg.id = t.group_id
            WHERE tg.name = 'Purpose'
            "#
        )
        .fetch_one(&pool)
        .await
        .expect("failed to count purpose tags");

        assert_eq!(purpose_tag_row.count, 7);

        let _ = fs::remove_dir_all(dir);
    }
}
