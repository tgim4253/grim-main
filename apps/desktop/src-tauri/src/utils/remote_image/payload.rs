use regex::Regex;
use reqwest::Url;

pub fn extract_remote_image_sources(payload: &str) -> Vec<String> {
    let mut candidates = Vec::new();
    let trimmed = payload.trim();

    if is_remote_image_candidate(trimmed) {
        add_candidate(&mut candidates, trimmed);
    }

    for line in payload.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        add_candidate(&mut candidates, line);
    }

    let mut html_candidates = Vec::new();
    collect_html_image_candidates(payload, &mut html_candidates);
    if !html_candidates.is_empty() {
        candidates.extend(html_candidates);
        return dedupe(candidates);
    }

    collect_url_candidates(payload, &mut candidates);
    dedupe(candidates)
}

fn collect_html_image_candidates(payload: &str, candidates: &mut Vec<String>) {
    let tag_re = Regex::new(r"(?is)<img\b[^>]*>").expect("valid img regex");
    for tag in tag_re.find_iter(payload) {
        let tag = tag.as_str();
        let mut has_src = false;
        for attr in ["src", "data-src"] {
            for value in html_attr_values(tag, attr) {
                if add_candidate(candidates, &value) {
                    has_src = true;
                    break;
                }
            }
            if has_src {
                break;
            }
        }
        if has_src {
            continue;
        }
        if let Some(value) = html_attr_values(tag, "srcset")
            .into_iter()
            .find_map(|srcset| select_srcset_candidate(&srcset))
        {
            add_candidate(candidates, &value);
        }
    }
}

fn html_attr_values(tag: &str, attr_name: &str) -> Vec<String> {
    let pattern = format!(
        r#"(?is)\b{}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#,
        regex::escape(attr_name)
    );
    let attr_re = Regex::new(&pattern).expect("valid html attr regex");

    attr_re
        .captures_iter(tag)
        .filter_map(|captures| {
            captures
                .get(1)
                .or_else(|| captures.get(2))
                .or_else(|| captures.get(3))
                .map(|value| html_unescape_minimal(value.as_str()))
        })
        .collect()
}

fn select_srcset_candidate(srcset: &str) -> Option<String> {
    srcset
        .split(',')
        .filter_map(parse_srcset_candidate)
        .max_by(|left, right| left.1.total_cmp(&right.1))
        .map(|(url, _)| url.to_string())
}

fn parse_srcset_candidate(candidate: &str) -> Option<(&str, f64)> {
    let mut parts = candidate.split_whitespace();
    let url = parts.next()?;
    let score = parts.find_map(srcset_descriptor_score).unwrap_or(1.0_f64);
    Some((url, score))
}

fn srcset_descriptor_score(descriptor: &str) -> Option<f64> {
    descriptor
        .strip_suffix('w')
        .or_else(|| descriptor.strip_suffix('x'))
        .and_then(|value| value.parse::<f64>().ok())
}

fn collect_url_candidates(payload: &str, candidates: &mut Vec<String>) {
    let url_re =
        Regex::new(r#"(?i)\bhttps?://[^\s"'<>]+"#).expect("valid url regex");
    for value in url_re.find_iter(payload) {
        add_candidate(candidates, trim_url_punctuation(value.as_str()));
    }
}

fn add_candidate(candidates: &mut Vec<String>, value: &str) -> bool {
    let value = html_unescape_minimal(value.trim());
    if is_remote_image_candidate(&value) {
        candidates.push(value);
        return true;
    }
    false
}

fn is_remote_image_candidate(value: &str) -> bool {
    let value = value.trim();
    if value.to_ascii_lowercase().starts_with("data:image/") {
        return true;
    }

    Url::parse(value)
        .map(|url| matches!(url.scheme(), "http" | "https"))
        .unwrap_or(false)
}

fn dedupe(values: Vec<String>) -> Vec<String> {
    let mut deduped = Vec::with_capacity(values.len());
    for value in values {
        if !deduped.iter().any(|existing| existing == &value) {
            deduped.push(value);
        }
    }
    deduped
}

fn trim_url_punctuation(value: &str) -> &str {
    value.trim_end_matches(['.', ',', ';', ')', ']'])
}

fn html_unescape_minimal(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#34;", "\"")
        .replace("&#39;", "'")
        .replace("&apos;", "'")
}

#[cfg(test)]
mod tests {
    use super::extract_remote_image_sources;

    #[test]
    fn extracts_img_src_from_browser_drag_html() {
        let sources = extract_remote_image_sources(
            r#"<a href="https://example.test/page"><img src="https://cdn.example.test/image.jpg?size=large&amp;token=1" /></a>"#,
        );

        assert_eq!(
            sources,
            vec!["https://cdn.example.test/image.jpg?size=large&token=1"
                .to_string()]
        );
    }

    #[test]
    fn extracts_text_uri_list_urls() {
        let sources = extract_remote_image_sources(
            "# dragged image\nhttps://cdn.example.test/image.webp\n",
        );

        assert_eq!(sources, vec!["https://cdn.example.test/image.webp"]);
    }

    #[test]
    fn srcset_does_not_add_multiple_candidates_when_src_exists() {
        let sources = extract_remote_image_sources(
            r#"<img src="https://cdn.example.test/current.jpg" srcset="https://cdn.example.test/small.jpg 1x, https://cdn.example.test/large.jpg 2x">"#,
        );

        assert_eq!(sources, vec!["https://cdn.example.test/current.jpg"]);
    }

    #[test]
    fn srcset_without_src_selects_largest_candidate() {
        let sources = extract_remote_image_sources(
            r#"<img srcset="https://cdn.example.test/small.jpg 640w, https://cdn.example.test/large.jpg 1280w">"#,
        );

        assert_eq!(sources, vec!["https://cdn.example.test/large.jpg"]);
    }
}
