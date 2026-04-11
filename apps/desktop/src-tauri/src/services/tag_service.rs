use anyhow::Result;

use crate::{
    models::tag::{
        DeleteTagGroupPayload, DeleteTagPayload, SaveTagGroupPayload,
        SaveTagPayload, Tag, TagGroup, TagIndex,
    },
    repositories::TagRepository,
};

#[derive(Clone)]
pub struct TagService {
    tag_repository: TagRepository,
}

impl TagService {
    pub fn new(tag_repository: TagRepository) -> Self {
        Self { tag_repository }
    }

    pub async fn list_tag_groups(&self) -> Result<Vec<TagGroup>> {
        self.tag_repository.list_groups().await
    }

    pub async fn list_tags(&self) -> Result<Vec<Tag>> {
        self.tag_repository.list_tags().await
    }

    pub async fn load_tag_index(&self) -> Result<TagIndex> {
        self.tag_repository.load_index().await
    }

    pub async fn save_tag_group(
        &self,
        payload: SaveTagGroupPayload,
    ) -> Result<TagIndex> {
        self.tag_repository.save_tag_group(payload).await?;
        self.tag_repository.load_index().await
    }

    pub async fn delete_tag_group(
        &self,
        payload: DeleteTagGroupPayload,
    ) -> Result<TagIndex> {
        self.tag_repository.delete_tag_group(payload).await?;
        self.tag_repository.load_index().await
    }

    pub async fn save_tag(&self, payload: SaveTagPayload) -> Result<TagIndex> {
        self.tag_repository.save_tag(payload).await?;
        self.tag_repository.load_index().await
    }

    pub async fn delete_tag(
        &self,
        payload: DeleteTagPayload,
    ) -> Result<TagIndex> {
        self.tag_repository.delete_tag(payload).await?;
        self.tag_repository.load_index().await
    }
}
