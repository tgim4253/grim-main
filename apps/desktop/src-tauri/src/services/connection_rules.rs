use anyhow::{Context, Result};

use crate::{
    bootstrap::PATH_MANAGER,
    config::settings::{
        ConnectionRule, ConnectionRuleAction, ConnectionRuleMatch,
        GraphSettings, MoaSettings,
    },
    db::repository::{
        connection_repository::ConnectionRepository,
        node_repository::NodeRepository,
    },
    models::connection::RelationType,
    services::settings,
    utils::date,
};

use sqlx::{Executor, Sqlite};

#[allow(dead_code)]
/// Prepared connection rule engine that evaluates rules against link contexts.
pub struct ConnectionRuleEngine {
    rules: Vec<ConnectionRule>,
}

#[allow(dead_code)]
impl ConnectionRuleEngine {
    /// Construct an engine from the provided workspace settings.
    pub fn from_settings(settings: &MoaSettings) -> Self {
        Self::from_graph_settings(&settings.graph)
    }

    /// Construct an engine from a graph settings section.
    pub fn from_graph_settings(graph: &GraphSettings) -> Self {
        let mut rules: Vec<ConnectionRule> = graph
            .effective_rules()
            .into_iter()
            .filter(|rule| rule.enabled)
            .collect();

        rules.sort_by(|a, b| {
            a.priority.cmp(&b.priority).then_with(|| a.id.cmp(&b.id))
        });

        Self { rules }
    }

    /// Resolve the first matching rule for the supplied context.
    pub fn resolve(&self, ctx: &RuleContext<'_>) -> Option<ResolvedConnection> {
        self.rules.iter().find_map(|rule| {
            if !rule_applies(&rule.r#match, ctx) {
                return None;
            }

            Some(ResolvedConnection {
                rule_id: rule.id.clone(),
                action: rule.action.clone(),
            })
        })
    }
}

#[allow(dead_code)]
fn rule_applies(
    rule_match: &ConnectionRuleMatch,
    ctx: &RuleContext<'_>,
) -> bool {
    if let Some(src_kind) = &rule_match.src_kind {
        if !kind_matches(src_kind, ctx.src_kind) {
            return false;
        }
    }

    if let Some(dst_kind) = &rule_match.dst_kind {
        if !kind_matches(dst_kind, ctx.dst_kind) {
            return false;
        }
    }

    if let Some(expected_relation) = rule_match.relation_hint {
        if ctx.relation_hint != Some(expected_relation) {
            return false;
        }
    }

    if rule_match.manual_only && !ctx.is_manual {
        return false;
    }

    // Custom predicate evaluation is not yet implemented. Skip rules that
    // declare predicate ids we do not understand.
    rule_match.predicate_id.is_none()
}

#[allow(dead_code)]
fn kind_matches(expected: &str, actual: &str) -> bool {
    // Support "prefix:*" wildcard matching so callers can tag subtypes like
    // "file:image".
    if let Some((prefix, suffix)) = expected.split_once(':') {
        if suffix == "*" {
            return actual.starts_with(prefix);
        }
    }

    if expected.eq_ignore_ascii_case(actual) {
        return true;
    }

    if let Some((actual_prefix, _)) = actual.split_once(':') {
        return expected.eq_ignore_ascii_case(actual_prefix);
    }

    false
}

#[allow(dead_code)]
/// Information required to determine the default relation set for a link.
pub struct RuleContext<'a> {
    pub src_kind: &'a str,
    pub dst_kind: &'a str,
    pub relation_hint: Option<RelationType>,
    pub is_manual: bool,
}

#[allow(dead_code)]
/// Result of applying a connection rule.
pub struct ResolvedConnection {
    pub rule_id: String,
    pub action: ConnectionRuleAction,
}

/// Load connection rules for the given workspace.
pub async fn load_engine_for_moa(moa_id: &str) -> Result<ConnectionRuleEngine> {
    let paths = PATH_MANAGER
        .get_or_add(moa_id)
        .await
        .context("Failed to resolve workspace paths for connection rules")?;

    let settings = settings::load(&paths)
        .await
        .context("Failed to load workspace settings for connection rules")?;

    Ok(ConnectionRuleEngine::from_settings(&settings))
}

/// Resolve the action to take when linking two nodes.
pub async fn resolve_for_nodes<'a, E>(
    executor: &mut E,
    engine: &ConnectionRuleEngine,
    src_node_id: &str,
    dst_node_id: &str,
    relation_hint: Option<RelationType>,
    is_manual: bool,
) -> Result<Option<ConnectionRuleAction>>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    let nodes = NodeRepository::fetch_nodes_by_ids(
        executor,
        vec![src_node_id.to_string(), dst_node_id.to_string()],
    )
    .await?;

    let mut src_kind: Option<String> = None;
    let mut dst_kind: Option<String> = None;

    for node in nodes {
        let label = node.rule_match_kind();
        if node.id == src_node_id {
            src_kind = Some(label.clone());
        }
        if node.id == dst_node_id {
            dst_kind = Some(label);
        }
    }

    match (src_kind, dst_kind) {
        (Some(src_kind), Some(dst_kind)) => {
            let ctx = RuleContext {
                src_kind: &src_kind,
                dst_kind: &dst_kind,
                relation_hint,
                is_manual,
            };

            Ok(engine.resolve(&ctx).map(|resolved| resolved.action))
        }
        _ => Ok(None),
    }
}

/// Ensure appropriate connections exist between two nodes, falling back to the provided relation types.
pub async fn ensure_connections_for_nodes<'a, E>(
    executor: &mut E,
    engine: &ConnectionRuleEngine,
    src_node_id: &str,
    dst_node_id: &str,
    fallback: (Option<RelationType>, Option<RelationType>),
    relation_hint: Option<RelationType>,
    is_manual: bool,
) -> Result<()>
where
    for<'e> &'e mut E: Executor<'e, Database = Sqlite>,
{
    let now = date::get_now_date();
    let (fallback_forward, fallback_reverse) = fallback;

    if let Some(action) = resolve_for_nodes(
        executor,
        engine,
        src_node_id,
        dst_node_id,
        relation_hint,
        is_manual,
    )
    .await?
    {
        ConnectionRepository::insert_pair(
            executor,
            src_node_id.to_string(),
            dst_node_id.to_string(),
            action.forward_relation,
            action.reverse_relation,
            now,
        )
        .await?;
        return Ok(());
    }

    match (fallback_forward, fallback_reverse) {
        (Some(forward), Some(reverse)) => {
            ConnectionRepository::insert_pair(
                executor,
                src_node_id.to_string(),
                dst_node_id.to_string(),
                forward,
                reverse,
                now,
            )
            .await?;
        }
        (Some(forward), None) => {
            ConnectionRepository::insert_connection(
                executor,
                src_node_id.to_string(),
                dst_node_id.to_string(),
                forward,
                now,
            )
            .await?;
        }
        (None, Some(reverse)) => {
            ConnectionRepository::insert_connection(
                executor,
                dst_node_id.to_string(),
                src_node_id.to_string(),
                reverse,
                now,
            )
            .await?;
        }
        (None, None) => {}
    }

    Ok(())
}
