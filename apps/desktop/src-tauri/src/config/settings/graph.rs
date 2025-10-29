use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::models::connection::RelationType;

/// Namespaced graph configuration.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(default, rename_all = "camelCase")]
pub struct GraphSettings {
    /// Default relations to create when linking two nodes.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub default_connections: Vec<ConnectionRule>,
}

impl GraphSettings {
    pub const fn is_default(&self) -> bool {
        self.default_connections.is_empty()
    }

    pub fn to_overrides(&self) -> Value {
        if self.default_connections.is_empty() {
            return Value::Object(Map::new());
        }

        serde_json::to_value(self).unwrap_or_else(|_| Value::Object(Map::new()))
    }

    /// Return the effective rule set, falling back to builtin defaults.
    pub fn effective_rules(&self) -> Vec<ConnectionRule> {
        if self.default_connections.is_empty() {
            builtin_connection_rules()
        } else {
            self.default_connections.clone()
        }
    }
}

/// Declarative rule describing how to create forward and reverse relations for a link.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRule {
    pub id: String,
    pub priority: i32,
    #[serde(default = "ConnectionRule::default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub r#match: ConnectionRuleMatch,
    pub action: ConnectionRuleAction,
}

impl ConnectionRule {
    fn default_enabled() -> bool {
        true
    }
}

/// Matching predicates used to decide whether a rule applies.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRuleMatch {
    /// Node kind of the source node (e.g. "file", "folder", or extended kind like "file:image").
    pub src_kind: Option<String>,
    /// Node kind of the destination node.
    pub dst_kind: Option<String>,
    /// Optional hint about an existing relation we want to decorate.
    pub relation_hint: Option<RelationType>,
    /// Restrict the rule to manual link operations only.
    #[serde(default)]
    pub manual_only: bool,
    /// Identifier for additional predicates that require runtime evaluation.
    pub predicate_id: Option<String>,
}

/// Action performed when a rule matches.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionRuleAction {
    pub forward_relation: RelationType,
    pub reverse_relation: RelationType,
    /// Opaque metadata so frontends can decorate links (labels, colors, etc.).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub metadata: Option<Value>,
}

/// Built-in connection rules applied when a workspace has not customised the graph settings.
pub fn builtin_connection_rules() -> Vec<ConnectionRule> {
    vec![
        ConnectionRule {
            id: "folder-contains-file".into(),
            priority: 100,
            enabled: true,
            r#match: ConnectionRuleMatch {
                src_kind: Some("folder".into()),
                dst_kind: Some("file".into()),
                relation_hint: None,
                manual_only: false,
                predicate_id: None,
            },
            action: ConnectionRuleAction {
                forward_relation: RelationType::ContainsFile,
                reverse_relation: RelationType::BelongToFolder,
                metadata: None,
            },
        },
        ConnectionRule {
            id: "folder-hierarchy".into(),
            priority: 110,
            enabled: true,
            r#match: ConnectionRuleMatch {
                src_kind: Some("folder".into()),
                dst_kind: Some("folder".into()),
                relation_hint: None,
                manual_only: false,
                predicate_id: None,
            },
            action: ConnectionRuleAction {
                forward_relation: RelationType::ParentFolder,
                reverse_relation: RelationType::ChildFolder,
                metadata: None,
            },
        },
        ConnectionRule {
            id: "file-to-crop".into(),
            priority: 200,
            enabled: true,
            r#match: ConnectionRuleMatch {
                src_kind: Some("file".into()),
                dst_kind: Some("crop".into()),
                relation_hint: None,
                manual_only: false,
                predicate_id: None,
            },
            action: ConnectionRuleAction {
                forward_relation: RelationType::Cropped,
                reverse_relation: RelationType::CroppedOrigin,
                metadata: None,
            },
        },
        ConnectionRule {
            id: "file-to-memo".into(),
            priority: 300,
            enabled: true,
            r#match: ConnectionRuleMatch {
                src_kind: Some("file".into()),
                dst_kind: Some("memo".into()),
                relation_hint: None,
                manual_only: false,
                predicate_id: None,
            },
            action: ConnectionRuleAction {
                forward_relation: RelationType::Memo,
                reverse_relation: RelationType::MemoTarget,
                metadata: None,
            },
        },
        ConnectionRule {
            id: "crop-to-memo".into(),
            priority: 310,
            enabled: true,
            r#match: ConnectionRuleMatch {
                src_kind: Some("crop".into()),
                dst_kind: Some("memo".into()),
                relation_hint: None,
                manual_only: false,
                predicate_id: None,
            },
            action: ConnectionRuleAction {
                forward_relation: RelationType::Memo,
                reverse_relation: RelationType::MemoTarget,
                metadata: None,
            },
        },
        ConnectionRule {
            id: "croquis-result".into(),
            priority: 405,
            enabled: true,
            r#match: ConnectionRuleMatch {
                src_kind: Some("file:image".into()),
                dst_kind: Some("file:image".into()),
                relation_hint: Some(RelationType::CroquisResLink),
                manual_only: false,
                predicate_id: None,
            },
            action: ConnectionRuleAction {
                forward_relation: RelationType::CroquisResLink,
                reverse_relation: RelationType::CroquisRefLink,
                metadata: None,
            },
        },
        ConnectionRule {
            id: "image-related-image".into(),
            priority: 410,
            enabled: true,
            r#match: ConnectionRuleMatch {
                src_kind: Some("file:image".into()),
                dst_kind: Some("file:image".into()),
                relation_hint: None,
                manual_only: false,
                predicate_id: None,
            },
            action: ConnectionRuleAction {
                forward_relation: RelationType::RelatedImage,
                reverse_relation: RelationType::RelatedImage,
                metadata: None,
            },
        },
        ConnectionRule {
            id: "document-reference-file".into(),
            priority: 420,
            enabled: true,
            r#match: ConnectionRuleMatch {
                src_kind: Some("file:document".into()),
                dst_kind: Some("file".into()),
                relation_hint: None,
                manual_only: false,
                predicate_id: None,
            },
            action: ConnectionRuleAction {
                forward_relation: RelationType::ReferenceFile,
                reverse_relation: RelationType::ReferenceBy,
                metadata: None,
            },
        },
        ConnectionRule {
            id: "file-relative-link".into(),
            priority: 450,
            enabled: true,
            r#match: ConnectionRuleMatch {
                src_kind: Some("file".into()),
                dst_kind: Some("file".into()),
                relation_hint: None,
                manual_only: false,
                predicate_id: None,
            },
            action: ConnectionRuleAction {
                forward_relation: RelationType::RelativeFile,
                reverse_relation: RelationType::RelativeFile,
                metadata: None,
            },
        },
    ]
}
