use std::collections::HashSet;

use once_cell::sync::Lazy;
use regex::Regex;
use reqwest::Url;

pub(super) fn expand_preferred_urls(original: &Url) -> Vec<Url> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();

    let expanders: &[fn(&Url) -> Vec<Url>] = &[
        expand_pinterest,
        expand_wikimedia,
        expand_youtube_thumb,
        expand_twitter_x,
        expand_wordpress_thumbnail,
        expand_shopify_cdn,
        expand_cloudinary,
        expand_reddit_preview,
        expand_unsplash,
        expand_flickr,
    ];

    for expander in expanders {
        for candidate in expander(original) {
            if candidate.as_str() == original.as_str() {
                continue;
            }
            push_unique_url(&mut out, &mut seen, candidate);
        }
    }

    push_unique_url(&mut out, &mut seen, original.clone());

    out
}

fn push_unique_url(out: &mut Vec<Url>, seen: &mut HashSet<String>, url: Url) {
    if seen.insert(url.as_str().to_string()) {
        out.push(url);
    }
}

fn set_query_kv(mut url: Url, kv: &[(&str, &str)]) -> Url {
    let mut pairs = url
        .query_pairs()
        .filter(|(key, _)| {
            !kv.iter().any(|(target_key, _)| key.as_ref() == *target_key)
        })
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();

    for (key, value) in kv {
        pairs.push(((*key).to_string(), (*value).to_string()));
    }

    url.set_query(None);
    if !pairs.is_empty() {
        let mut query = url.query_pairs_mut();
        for (key, value) in pairs {
            query.append_pair(&key, &value);
        }
    }
    url.set_fragment(None);

    url
}

fn remove_query_keys(mut url: Url, keys: &[&str]) -> Url {
    let pairs = url
        .query_pairs()
        .filter(|(key, _)| {
            !keys
                .iter()
                .any(|target_key| key.as_ref().eq_ignore_ascii_case(target_key))
        })
        .map(|(key, value)| (key.into_owned(), value.into_owned()))
        .collect::<Vec<_>>();

    url.set_query(None);
    if !pairs.is_empty() {
        let mut query = url.query_pairs_mut();
        for (key, value) in pairs {
            query.append_pair(&key, &value);
        }
    }
    url.set_fragment(None);

    url
}

fn host_matches(host: &str, domain: &str) -> bool {
    let host = host.trim_end_matches('.').to_ascii_lowercase();
    let domain = domain.trim_end_matches('.').to_ascii_lowercase();

    host == domain
        || (host.len() > domain.len()
            && host.ends_with(&domain)
            && host.as_bytes()[host.len() - domain.len() - 1] == b'.')
}

fn host_matches_any(host: &str, domains: &[&str]) -> bool {
    domains.iter().any(|domain| host_matches(host, domain))
}

fn build_url_with_segments(url: &Url, segments: &[String]) -> Url {
    let mut candidate = url.clone();
    candidate.set_path(&format!("/{}", segments.join("/")));
    candidate.set_fragment(None);
    candidate
}

fn set_clean_path(mut url: Url, path: String) -> Url {
    url.set_path(&path);
    url.set_fragment(None);
    url
}

fn has_query_key(url: &Url, keys: &[&str]) -> bool {
    url.query_pairs().any(|(key, _)| {
        keys.iter()
            .any(|target_key| key.as_ref().eq_ignore_ascii_case(target_key))
    })
}

fn query_value(url: &Url, key: &str) -> Option<String> {
    url.query_pairs()
        .find(|(candidate_key, _)| candidate_key.as_ref() == key)
        .map(|(_, value)| value.into_owned())
}

fn query_u32(url: &Url, key: &str) -> Option<u32> {
    query_value(url, key)?.parse().ok()
}

fn expand_pinterest(url: &Url) -> Vec<Url> {
    let host = url.host_str().unwrap_or_default();
    if !host_matches(host, "pinimg.com") {
        return Vec::new();
    }

    let segments = url
        .path_segments()
        .map(|segments| segments.map(str::to_string).collect::<Vec<_>>())
        .unwrap_or_default();
    if segments.len() < 2 || segments[0].is_empty() {
        return Vec::new();
    }

    let sizes = ["originals", "1200x", "736x"];
    let current_position =
        sizes.iter().position(|size| *size == segments[0].as_str());
    let tail = segments[1..].join("/");
    sizes
        .into_iter()
        .enumerate()
        .filter_map(|(index, size)| {
            if current_position.is_some_and(|position| index >= position) {
                return None;
            }

            let mut candidate = url.clone();
            candidate.set_path(&format!("/{size}/{tail}"));
            candidate.set_fragment(None);
            Some(candidate)
        })
        .collect()
}

fn expand_wikimedia(url: &Url) -> Vec<Url> {
    let host = url.host_str().unwrap_or_default();
    if !host_matches_any(host, &["wikimedia.org", "wikipedia.org"]) {
        return Vec::new();
    }

    let Some(mut segments) = url
        .path_segments()
        .map(|segments| segments.map(str::to_string).collect::<Vec<_>>())
    else {
        return Vec::new();
    };
    let Some(position) = segments.iter().position(|segment| segment == "thumb")
    else {
        return Vec::new();
    };
    if segments.len() < position + 3 {
        return Vec::new();
    }

    segments.remove(position);
    segments.pop();

    let mut candidate = url.clone();
    candidate.set_path(&format!("/{}", segments.join("/")));
    candidate.set_fragment(None);
    vec![candidate]
}

fn expand_youtube_thumb(url: &Url) -> Vec<Url> {
    let host = url.host_str().unwrap_or_default();
    if !host_matches(host, "ytimg.com") {
        return Vec::new();
    }

    let segments = url
        .path_segments()
        .map(|segments| segments.map(str::to_string).collect::<Vec<_>>())
        .unwrap_or_default();
    let Some(position) = segments
        .iter()
        .position(|segment| segment == "vi" || segment == "vi_webp")
    else {
        return Vec::new();
    };
    let Some(video_id) = segments.get(position + 1) else {
        return Vec::new();
    };

    let names = [
        "maxresdefault.jpg",
        "sddefault.jpg",
        "hqdefault.jpg",
        "mqdefault.jpg",
        "default.jpg",
    ];
    let current_position = segments.get(position + 2).and_then(|name| {
        names.iter().position(|candidate| *candidate == name.as_str())
    });

    names
        .into_iter()
        .enumerate()
        .filter_map(|(index, name)| {
            if current_position.is_some_and(|position| index >= position) {
                return None;
            }

            let mut candidate = url.clone();
            candidate.set_path(&format!("/vi/{video_id}/{name}"));
            candidate.set_fragment(None);
            Some(candidate)
        })
        .collect()
}

fn expand_twitter_x(url: &Url) -> Vec<Url> {
    let host = url.host_str().unwrap_or_default();
    if !host_matches(host, "twimg.com") || !url.path().starts_with("/media/") {
        return Vec::new();
    }

    let current_name =
        query_value(url, "name").map(|value| value.to_ascii_lowercase());
    match current_name.as_deref() {
        Some("orig") => Vec::new(),
        Some("4096x4096") => {
            vec![set_query_kv(url.clone(), &[("name", "orig")])]
        }
        _ => vec![
            set_query_kv(url.clone(), &[("name", "orig")]),
            set_query_kv(url.clone(), &[("name", "4096x4096")]),
            set_query_kv(
                url.clone(),
                &[("name", "4096x4096"), ("format", "png")],
            ),
        ],
    }
}

fn expand_wordpress_thumbnail(url: &Url) -> Vec<Url> {
    static WORDPRESS_DIMENSIONS_RE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)^(?P<base>.+)-\d+x\d+(\.(?P<ext>[a-z0-9]+))$")
            .expect("valid wordpress dimensions regex")
    });
    static WORDPRESS_SCALED_RE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)^(?P<base>.+)-scaled(\.(?P<ext>[a-z0-9]+))$")
            .expect("valid wordpress scaled regex")
    });

    let mut out = Vec::new();
    let mut segments = url
        .path_segments()
        .map(|segments| segments.map(str::to_string).collect::<Vec<_>>())
        .unwrap_or_default();

    if let Some(file_name) = segments.last().cloned() {
        let replacement = WORDPRESS_DIMENSIONS_RE
            .captures(&file_name)
            .or_else(|| WORDPRESS_SCALED_RE.captures(&file_name))
            .map(|captures| {
                let base = captures
                    .name("base")
                    .map(|value| value.as_str())
                    .unwrap_or(file_name.as_str());
                let extension = captures
                    .name("ext")
                    .map(|value| value.as_str())
                    .unwrap_or_default();
                if extension.is_empty() {
                    base.to_string()
                } else {
                    format!("{base}.{extension}")
                }
            });

        if let Some(new_file_name) = replacement {
            segments.pop();
            segments.push(new_file_name);
            out.push(build_url_with_segments(url, &segments));
        }
    }

    let host = url.host_str().unwrap_or_default();
    let resize_keys = ["resize", "w", "h", "fit", "crop"];
    let is_likely_wordpress_media = url.path().contains("/wp-content/uploads/")
        || host_matches_any(host, &["wp.com", "wordpress.com"]);

    if is_likely_wordpress_media && has_query_key(url, &resize_keys) {
        out.push(remove_query_keys(url.clone(), &resize_keys));
    }

    out
}

fn expand_shopify_cdn(url: &Url) -> Vec<Url> {
    let host = url.host_str().unwrap_or_default();
    if !host_matches(host, "cdn.shopify.com") {
        return Vec::new();
    }

    static SHOPIFY_SIZE_RE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(
            r"(?i)^(?P<base>.+)_(?P<size>(?:\d+x\d*|\d*x\d+|pico|icon|thumb|small|compact|medium|large|grande|master))(?:@(?P<scale>\d+x))?\.(?P<ext>[a-z0-9]+)$",
        )
            .expect("valid shopify size regex")
    });

    let segments = url
        .path_segments()
        .map(|segments| segments.map(str::to_string).collect::<Vec<_>>())
        .unwrap_or_default();
    let mut out = Vec::new();
    let transform_query_keys = ["width", "height", "crop"];

    if let Some(file_name) = segments.last() {
        if let Some(captures) = SHOPIFY_SIZE_RE.captures(file_name) {
            let base = captures
                .name("base")
                .map(|value| value.as_str())
                .unwrap_or(file_name.as_str());
            let size = captures
                .name("size")
                .map(|value| value.as_str())
                .unwrap_or_default();
            let extension = captures
                .name("ext")
                .map(|value| value.as_str())
                .unwrap_or("jpg");

            if shopify_size_is_smaller_than_2048(size) {
                let mut next_segments = segments.clone();
                next_segments.pop();
                next_segments.push(format!("{base}_2048x.{extension}"));
                out.push(remove_query_keys(
                    set_clean_path(
                        url.clone(),
                        format!("/{}", next_segments.join("/")),
                    ),
                    &transform_query_keys,
                ));
            }

            let mut next_segments = segments.clone();
            next_segments.pop();
            next_segments.push(format!("{base}.{extension}"));
            out.push(remove_query_keys(
                set_clean_path(
                    url.clone(),
                    format!("/{}", next_segments.join("/")),
                ),
                &transform_query_keys,
            ));
        }
    }

    if has_query_key(url, &transform_query_keys) {
        out.push(remove_query_keys(url.clone(), &transform_query_keys));
    }

    out
}

fn shopify_size_is_smaller_than_2048(size: &str) -> bool {
    let size = size.to_ascii_lowercase();
    if size == "master" {
        return false;
    }

    let max_dimension =
        size.split('x').filter_map(|part| part.parse::<u32>().ok()).max();

    max_dimension.is_none_or(|dimension| dimension < 2048)
}

fn expand_cloudinary(url: &Url) -> Vec<Url> {
    let host = url.host_str().unwrap_or_default();
    if !host_matches(host, "res.cloudinary.com")
        || !url.path().contains("/image/upload/")
    {
        return Vec::new();
    }

    let Some((prefix, after_upload)) = url.path().split_once("/image/upload/")
    else {
        return Vec::new();
    };
    let segments = after_upload.split('/').collect::<Vec<_>>();
    if segments.is_empty() {
        return Vec::new();
    }

    let mut start = 0;
    while start < segments.len() && is_cloudinary_transform(segments[start]) {
        start += 1;
    }

    if start == 0 || start >= segments.len() {
        return Vec::new();
    }

    let mut candidate = url.clone();
    candidate.set_path(&format!(
        "{prefix}/image/upload/{}",
        segments[start..].join("/")
    ));
    candidate.set_fragment(None);
    vec![candidate]
}

fn is_cloudinary_transform(segment: &str) -> bool {
    segment.contains(',')
        || [
            "c_", "w_", "h_", "q_", "f_", "g_", "e_", "dpr_", "ar_", "x_",
            "y_", "r_", "b_",
        ]
        .iter()
        .any(|prefix| segment.starts_with(prefix))
        || segment.starts_with("t_")
}

fn expand_reddit_preview(url: &Url) -> Vec<Url> {
    let host = url.host_str().unwrap_or_default();
    if !host_matches(host, "preview.redd.it") {
        return Vec::new();
    }

    let mut candidate = url.clone();
    if candidate.set_host(Some("i.redd.it")).is_err() {
        return Vec::new();
    }
    candidate.set_query(None);
    candidate.set_fragment(None);
    vec![candidate]
}

fn expand_unsplash(url: &Url) -> Vec<Url> {
    let host = url.host_str().unwrap_or_default();
    if !host_matches_any(host, &["images.unsplash.com", "plus.unsplash.com"]) {
        return Vec::new();
    }

    let should_set_width = query_u32(url, "w").is_none_or(|width| width < 4096);
    let should_set_auto = query_value(url, "auto").as_deref() != Some("format");

    match (should_set_width, should_set_auto) {
        (true, true) => {
            vec![set_query_kv(
                url.clone(),
                &[("w", "4096"), ("auto", "format")],
            )]
        }
        (true, false) => vec![set_query_kv(url.clone(), &[("w", "4096")])],
        (false, true) => {
            vec![set_query_kv(url.clone(), &[("auto", "format")])]
        }
        (false, false) => Vec::new(),
    }
}

fn expand_flickr(url: &Url) -> Vec<Url> {
    let host = url.host_str().unwrap_or_default();
    if !host_matches(host, "staticflickr.com") {
        return Vec::new();
    }

    static FLICKR_SIZE_RE: Lazy<Regex> = Lazy::new(|| {
        Regex::new(r"(?i)(?P<base>.+)_(?P<sz>[a-z])(\.(?P<ext>[a-z0-9]+))$")
            .expect("valid flickr size regex")
    });

    let segments = url
        .path_segments()
        .map(|segments| segments.map(str::to_string).collect::<Vec<_>>())
        .unwrap_or_default();
    let Some(file_name) = segments.last().cloned() else {
        return Vec::new();
    };
    let Some(captures) = FLICKR_SIZE_RE.captures(&file_name) else {
        return Vec::new();
    };

    let base = captures
        .name("base")
        .map(|value| value.as_str())
        .unwrap_or(file_name.as_str());
    let current_size = captures
        .name("sz")
        .and_then(|value| value.as_str().chars().next())
        .map(|value| value.to_ascii_lowercase());
    let extension =
        captures.name("ext").map(|value| value.as_str()).unwrap_or("jpg");

    let size_order =
        ['o', 'k', 'h', 'b', 'c', 'z', 'w', 'n', 'm', 't', 'q', 's'];
    let choices = ['k', 'h', 'b', 'c', 'z'];
    let current_position = current_size.and_then(|current| {
        size_order.iter().position(|candidate| *candidate == current)
    });

    choices
        .into_iter()
        .filter_map(|size| {
            let choice_position =
                size_order.iter().position(|candidate| *candidate == size)?;
            if current_position
                .is_some_and(|position| choice_position >= position)
            {
                return None;
            }

            let mut next_segments = segments.clone();
            next_segments.pop();
            next_segments.push(format!("{base}_{size}.{extension}"));

            Some(build_url_with_segments(url, &next_segments))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use reqwest::Url;

    use super::{expand_preferred_urls, expand_twitter_x};

    #[test]
    fn expands_pinterest_to_originals_before_fallback() {
        let url = Url::parse("https://i.pinimg.com/236x/e8/5a/0c/hash.jpg")
            .expect("valid url");
        let candidates = expand_preferred_urls(&url)
            .into_iter()
            .map(|url| url.to_string())
            .collect::<Vec<_>>();

        assert_eq!(
            candidates,
            vec![
                "https://i.pinimg.com/originals/e8/5a/0c/hash.jpg",
                "https://i.pinimg.com/1200x/e8/5a/0c/hash.jpg",
                "https://i.pinimg.com/736x/e8/5a/0c/hash.jpg",
                "https://i.pinimg.com/236x/e8/5a/0c/hash.jpg",
            ]
        );
    }

    #[test]
    fn expands_twitter_to_orig_query_before_fallback() {
        let url = Url::parse(
            "https://pbs.twimg.com/media/example.jpg?format=jpg&name=small",
        )
        .expect("valid url");
        let candidates = expand_preferred_urls(&url)
            .into_iter()
            .map(|url| url.to_string())
            .collect::<Vec<_>>();

        assert_eq!(
            candidates,
            vec![
                "https://pbs.twimg.com/media/example.jpg?format=jpg&name=orig",
                "https://pbs.twimg.com/media/example.jpg?format=jpg&name=4096x4096",
                "https://pbs.twimg.com/media/example.jpg?name=4096x4096&format=png",
                "https://pbs.twimg.com/media/example.jpg?format=jpg&name=small",
            ]
        );
    }

    #[test]
    fn expands_wordpress_thumbnail_before_fallback() {
        let url = Url::parse(
            "https://example.com/wp-content/uploads/2026/04/image-150x150.jpg",
        )
        .expect("valid url");
        let candidates = expand_preferred_urls(&url)
            .into_iter()
            .map(|url| url.to_string())
            .collect::<Vec<_>>();

        assert_eq!(
            candidates,
            vec![
                "https://example.com/wp-content/uploads/2026/04/image.jpg",
                "https://example.com/wp-content/uploads/2026/04/image-150x150.jpg",
            ]
        );
    }

    #[test]
    fn pinterest_original_does_not_generate_lower_sizes() {
        let url =
            Url::parse("https://i.pinimg.com/originals/aa/bb/cc/file.jpg")
                .expect("valid url");
        let candidates = expand_preferred_urls(&url)
            .into_iter()
            .map(|url| url.to_string())
            .collect::<Vec<_>>();

        assert_eq!(
            candidates,
            vec!["https://i.pinimg.com/originals/aa/bb/cc/file.jpg"]
        );
    }

    #[test]
    fn youtube_does_not_try_smaller_known_sizes_before_original() {
        let url = Url::parse("https://i.ytimg.com/vi/abc123/hqdefault.jpg")
            .expect("valid url");
        let candidates = expand_preferred_urls(&url)
            .into_iter()
            .map(|url| url.to_string())
            .collect::<Vec<_>>();

        assert_eq!(
            candidates.last().map(String::as_str),
            Some("https://i.ytimg.com/vi/abc123/hqdefault.jpg")
        );
        assert!(candidates
            .iter()
            .any(|url| url.ends_with("/maxresdefault.jpg")));
        assert!(candidates.iter().any(|url| url.ends_with("/sddefault.jpg")));
        assert!(!candidates.iter().any(|url| url.ends_with("/mqdefault.jpg")));
        assert!(!candidates.iter().any(|url| url.ends_with("/default.jpg")));
    }

    #[test]
    fn duplicate_query_keys_are_replaced() {
        let url = Url::parse(
            "https://pbs.twimg.com/media/example.jpg?format=jpg&name=small&name=large",
        )
        .expect("valid url");
        let candidates = expand_twitter_x(&url)
            .into_iter()
            .map(|url| url.to_string())
            .collect::<Vec<_>>();

        assert!(candidates[0].contains("format=jpg"));
        assert!(candidates[0].contains("name=orig"));
        assert!(!candidates[0].contains("name=small"));
        assert!(!candidates[0].contains("name=large"));
    }

    #[test]
    fn flickr_does_not_try_smaller_than_current_size() {
        let url = Url::parse(
            "https://live.staticflickr.com/65535/123456789_abcdef_b.jpg",
        )
        .expect("valid url");
        let candidates = expand_preferred_urls(&url)
            .into_iter()
            .map(|url| url.to_string())
            .collect::<Vec<_>>();

        assert_eq!(
            candidates.last().map(String::as_str),
            Some("https://live.staticflickr.com/65535/123456789_abcdef_b.jpg")
        );
        assert!(candidates.iter().any(|url| url.ends_with("_k.jpg")));
        assert!(candidates.iter().any(|url| url.ends_with("_h.jpg")));
        assert!(!candidates.iter().any(|url| url.ends_with("_c.jpg")));
        assert!(!candidates.iter().any(|url| url.ends_with("_z.jpg")));
    }

    #[test]
    fn unsplash_does_not_reduce_existing_width() {
        let url = Url::parse(
            "https://images.unsplash.com/photo-1?w=5000&auto=format",
        )
        .expect("valid url");
        let candidates = expand_preferred_urls(&url)
            .into_iter()
            .map(|url| url.to_string())
            .collect::<Vec<_>>();

        assert_eq!(
            candidates,
            vec!["https://images.unsplash.com/photo-1?w=5000&auto=format"]
        );
    }
}
