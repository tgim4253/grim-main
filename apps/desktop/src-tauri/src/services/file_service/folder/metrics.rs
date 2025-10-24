use std::{collections::HashMap, path::Path, time::Duration};

use tracing::info;

#[derive(Default)]
pub(super) struct UpsertFolderMetrics {
    pub total_elapsed: Duration,
    folder_creation: Duration,
    folder_creation_count: u64,
    tree_scanning: Duration,
    tree_scanning_count: u64,
    upsert_file: Duration,
    upsert_file_count: u64,
    file_size_buckets: HashMap<FileSizeBucket, BucketStats>,
}

impl UpsertFolderMetrics {
    pub(super) fn record_folder_creation(&mut self, elapsed: Duration) {
        self.folder_creation += elapsed;
        self.folder_creation_count += 1;
    }

    pub(super) fn record_tree_scanning(&mut self, elapsed: Duration) {
        self.tree_scanning += elapsed;
        self.tree_scanning_count += 1;
    }

    pub(super) fn record_upsert_file(
        &mut self,
        size: Option<i64>,
        elapsed: Duration,
    ) {
        self.upsert_file += elapsed;
        self.upsert_file_count += 1;

        let bucket = FileSizeBucket::from_size(size);
        let entry = self.file_size_buckets.entry(bucket).or_default();
        entry.duration += elapsed;
        entry.count += 1;
    }

    pub(super) fn log(&self, root_dir: &Path) {
        let mut bucket_entries: Vec<_> =
            self.file_size_buckets.iter().collect();
        bucket_entries.sort_by_key(|(bucket, _)| bucket.order());
        let bucket_summary = bucket_entries
            .into_iter()
            .map(|(bucket, stats)| {
                format!(
                    "{}: {}ms/{}",
                    bucket.label(),
                    stats.duration.as_millis(),
                    stats.count
                )
            })
            .collect::<Vec<_>>()
            .join(", ");
        let bucket_summary = if bucket_summary.is_empty() {
            "none".to_string()
        } else {
            bucket_summary
        };

        info!(
            "Upsert Folder Metrics
                dir                : {}
                total_ms           : {}
                tree_scan          : {} ms ({} runs)
                folder_creation    : {} ms ({} runs)
                upsert_file        : {} ms ({} runs)
                file_size_buckets  : {}
            ",
            root_dir.display(),
            self.total_elapsed.as_millis(),
            self.tree_scanning.as_millis(),
            self.tree_scanning_count,
            self.folder_creation.as_millis(),
            self.folder_creation_count,
            self.upsert_file.as_millis(),
            self.upsert_file_count,
            bucket_summary,
        );
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub(super) enum FileSizeBucket {
    Unknown,
    UpTo1Mb,
    OneToTenMb,
    TenToHundredMb,
    OverHundredMb,
}

impl FileSizeBucket {
    fn from_size(size: Option<i64>) -> Self {
        match size {
            None => FileSizeBucket::Unknown,
            Some(bytes) if bytes < 1_000_000 => FileSizeBucket::UpTo1Mb,
            Some(bytes) if bytes < 10_000_000 => FileSizeBucket::OneToTenMb,
            Some(bytes) if bytes < 100_000_000 => {
                FileSizeBucket::TenToHundredMb
            }
            Some(_) => FileSizeBucket::OverHundredMb,
        }
    }

    fn label(self) -> &'static str {
        match self {
            FileSizeBucket::Unknown => "unknown",
            FileSizeBucket::UpTo1Mb => "<1MB",
            FileSizeBucket::OneToTenMb => "1-10MB",
            FileSizeBucket::TenToHundredMb => "10-100MB",
            FileSizeBucket::OverHundredMb => ">=100MB",
        }
    }

    fn order(self) -> u8 {
        match self {
            FileSizeBucket::Unknown => 0,
            FileSizeBucket::UpTo1Mb => 1,
            FileSizeBucket::OneToTenMb => 2,
            FileSizeBucket::TenToHundredMb => 3,
            FileSizeBucket::OverHundredMb => 4,
        }
    }
}

#[derive(Default)]
struct BucketStats {
    duration: Duration,
    count: u64,
}
