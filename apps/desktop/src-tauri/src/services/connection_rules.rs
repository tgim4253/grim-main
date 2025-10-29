use crate::config::settings::{
    ConnectionRule, ConnectionRuleAction, ConnectionRuleMatch, GraphSettings,
    MoaSettings,
};

use crate::models::connection::RelationType;

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

    expected.eq_ignore_ascii_case(actual)
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
