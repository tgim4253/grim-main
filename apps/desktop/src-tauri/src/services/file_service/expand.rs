use once_cell::sync::Lazy;
use regex::Regex;
use std::collections::HashSet;

/// Build a prioritized list of candidate URLs that (likely) point to higher-res/original assets.
/// The first successful candidate will be used; we always include the original URL as the last fallback.
pub fn expand_preferred_urls(original: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    // Helper to push and deduplicate while preserving order
    let mut push = |s: String| {
        if !s.is_empty() && seen.insert(s.clone()) {
            out.push(s);
        }
    };

    let parsed = reqwest::Url::parse(original);
    if parsed.is_err() {
        // Not a valid URL (e.g., file path) — just return as-is
        push(original.to_string());
        return out;
    }
    let u = parsed.unwrap();

    // Domain-specific expanders
    for c in expand_pinterest(&u) {
        push(c);
    }
    for c in expand_wikimedia(&u) {
        push(c);
    }
    for c in expand_youtube_thumb(&u) {
        push(c);
    }
    for c in expand_twitter_x(&u) {
        push(c);
    }
    for c in expand_wordpress_thumbnail(&u) {
        push(c);
    }
    for c in expand_shopify_cdn(&u) {
        push(c);
    }
    for c in expand_cloudinary(&u) {
        push(c);
    }
    for c in expand_reddit_preview(&u) {
        push(c);
    }
    for c in expand_unsplash(&u) {
        push(c);
    }
    for c in expand_flickr(&u) {
        push(c);
    }

    // Always include the original as the final fallback
    push(original.to_string());

    out
}

// ---- INTERNAL UTILITIES ----

/// Safer query override while preserving existing pairs (percent-encoding handled by url crate)
fn set_query_kv(mut u: reqwest::Url, kv: &[(&str, &str)]) -> reqwest::Url {
    // collect existing pairs
    let mut pairs: Vec<(String, String)> = u
        .query_pairs()
        .map(|(k, v)| (k.into_owned(), v.into_owned()))
        .collect();

    // override / append
    for (k, v) in kv {
        match pairs.iter_mut().find(|(kk, _)| kk == k) {
            Some((_, vv)) => *vv = (*v).to_string(),
            None => pairs.push(((*k).to_string(), (*v).to_string())),
        }
    }

    // rebuild query
    u.set_query(None);
    {
        let mut qp = u.query_pairs_mut();
        for (k, v) in pairs {
            qp.append_pair(&k, &v);
        }
    }
    u
}

// ---- DOMAIN EXPANDERS ----

/// Pinterest: prefer /originals/, then big sizes (1200x, 736x)
fn expand_pinterest(u: &reqwest::Url) -> Vec<String> {
    let host = u.host_str().unwrap_or("");
    if !host.contains("pinimg.com") && !host.contains("media-cache") {
        return vec![];
    }
    let segs: Vec<String> = u
        .path_segments()
        .map(|it| it.map(|s| s.to_string()).collect())
        .unwrap_or_else(|| vec![]);
    if segs.len() < 2 {
        return vec![];
    }
    // Pinterest typical path: /{size}/e8/5a/0c/<hash>.jpg or /originals/...
    let tail = segs[1..].join("/");
    let mut candidates = Vec::new();
    // Keep short list to reduce unnecessary attempts
    let sizes = ["originals", "1200x", "736x"];
    for size in sizes {
        let mut u2 = u.clone();
        let new_path = format!("/{}/{}", size, tail);
        u2.set_path(&new_path);
        candidates.push(u2.to_string());
    }
    candidates
}

/// Wikimedia/Wikipedia thumbs → original.
/// Example:
///   /wikipedia/commons/thumb/a/ab/File.jpg/1200px-File.jpg
/// → /wikipedia/commons/a/ab/File.jpg
fn expand_wikimedia(u: &reqwest::Url) -> Vec<String> {
    let host = u.host_str().unwrap_or("");
    if !(host.ends_with("wikimedia.org") || host.ends_with("wikipedia.org")) {
        return vec![];
    }
    let segs_opt = u.path_segments().map(|it| it.collect::<Vec<_>>());
    if segs_opt.is_none() {
        return vec![];
    }
    let mut segs = segs_opt.unwrap();
    let Some(pos) = segs.iter().position(|s| *s == "thumb") else {
        return vec![];
    };
    if segs.len() < pos + 2 {
        return vec![];
    }
    // remove "thumb"
    segs.remove(pos);
    // remove last segment (e.g., "1200px-File.jpg")
    segs.pop();
    let new_path = format!("/{}", segs.join("/"));
    let mut u2 = u.clone();
    u2.set_path(&new_path);
    vec![u2.to_string()]
}

/// YouTube thumbnails: try maxresdefault → sddefault → hqdefault → mqdefault → default.
fn expand_youtube_thumb(u: &reqwest::Url) -> Vec<String> {
    let host = u.host_str().unwrap_or("");
    if !host.ends_with("ytimg.com") {
        return vec![];
    }
    let segs: Vec<String> = u
        .path_segments()
        .map(|it| it.map(|s| s.to_string()).collect())
        .unwrap_or_default();
    // Expecting /vi/<id>/ or /vi_webp/<id>/
    let Some(vi_index) = segs.iter().position(|s| s == "vi" || s == "vi_webp")
    else {
        return vec![];
    };
    if segs.len() <= vi_index + 1 {
        return vec![];
    }
    let id = &segs[vi_index + 1];
    let names = [
        "maxresdefault.jpg",
        "sddefault.jpg",
        "hqdefault.jpg",
        "mqdefault.jpg",
        "default.jpg",
    ];
    let mut out = Vec::new();
    for n in names {
        let mut u2 = u.clone();
        u2.set_path(&format!("/vi/{}/{}", id, n));
        out.push(u2.to_string());
    }
    out
}

/// Twitter/X images: enforce higher quality candidates.
/// We try ?name=orig, then ?name=4096x4096, and lastly also with format=png.
fn expand_twitter_x(u: &reqwest::Url) -> Vec<String> {
    let host = u.host_str().unwrap_or("");
    if !host.ends_with("twimg.com") {
        return vec![];
    }
    if !u.path().starts_with("/media/") {
        return vec![];
    }
    let mut out = Vec::new();
    // candidate 1: name=orig
    out.push(set_query_kv(u.clone(), &[("name", "orig")]).to_string());
    // candidate 2: name=4096x4096
    out.push(set_query_kv(u.clone(), &[("name", "4096x4096")]).to_string());
    // candidate 3: name=4096x4096&format=png (lossless, sometimes larger)
    out.push(
        set_query_kv(u.clone(), &[("name", "4096x4096"), ("format", "png")])
            .to_string(),
    );
    out
}

/// WordPress thumbnails: remove "-{w}x{h}" before extension (e.g., image-150x150.jpg → image.jpg).
fn expand_wordpress_thumbnail(u: &reqwest::Url) -> Vec<String> {
    static RE: Lazy<Regex> = Lazy::new(|| {
        // Matches "-123x456" before the extension.
        Regex::new(r"(?i)(?P<base>.+)-\d+x\d+(\.(?P<ext>[a-z0-9]+))$").unwrap()
    });
    let mut segs: Vec<String> = u
        .path_segments()
        .map(|it| it.map(|s| s.to_string()).collect())
        .unwrap_or_default();
    if segs.is_empty() {
        return vec![];
    }
    let file = segs.last().unwrap().clone();
    if let Some(caps) = RE.captures(&file) {
        let base = caps.name("base").map(|m| m.as_str()).unwrap_or(&file);
        let ext = caps.name("ext").map(|m| m.as_str()).unwrap_or("");
        let new_file = if ext.is_empty() {
            base.to_string()
        } else {
            format!("{}.{}", base, ext)
        };
        segs.pop();
        segs.push(new_file);
        let mut u2 = u.clone();
        u2.set_path(&format!("/{}", segs.join("/")));
        return vec![u2.to_string()];
    }
    vec![]
}

/// Shopify CDN: file_360x.jpg → file_2048x.jpg and → file.jpg (no size).
fn expand_shopify_cdn(u: &reqwest::Url) -> Vec<String> {
    let host = u.host_str().unwrap_or("");
    if !host.contains("cdn.shopify.com") {
        return vec![];
    }
    static RE: Lazy<Regex> = Lazy::new(|| {
        // Matches "_123x" or "_123x456" before extension
        Regex::new(r"(?i)(?P<base>.+)_(\d+x\d*|\d+x)(\.(?P<ext>[a-z0-9]+))$")
            .unwrap()
    });
    let segs: Vec<String> = u
        .path_segments()
        .map(|it| it.map(|s| s.to_string()).collect())
        .unwrap_or_default();
    if segs.is_empty() {
        return vec![];
    }
    let file = segs.last().unwrap().clone();
    let mut out = Vec::new();
    if let Some(caps) = RE.captures(&file) {
        let base = caps.name("base").map(|m| m.as_str()).unwrap_or(&file);
        let ext = caps.name("ext").map(|m| m.as_str()).unwrap_or("");
        // 2048x candidate
        {
            let mut segs2 = segs.clone();
            segs2.pop();
            let new_file = if ext.is_empty() {
                format!("{}_2048x", base)
            } else {
                format!("{}_2048x.{}", base, ext)
            };
            segs2.push(new_file);
            let mut u2 = u.clone();
            u2.set_path(&format!("/{}", segs2.join("/")));
            out.push(u2.to_string());
        }
        // no size candidate
        {
            let mut segs3 = segs.clone();
            segs3.pop();
            let new_file = if ext.is_empty() {
                base.to_string()
            } else {
                format!("{}.{}", base, ext)
            };
            segs3.push(new_file);
            let mut u3 = u.clone();
            u3.set_path(&format!("/{}", segs3.join("/")));
            out.push(u3.to_string());
        }
    }
    out
}

/// Cloudinary: strip transformation segments after "/image/upload/" but preserve version (v123...) and public_id.
/// We drop leading transformation segments until the first non-transform; if the next is a version (v[digits]), keep it.
/// Example:
///   /image/upload/c_fill,w_800,q_auto/v1699999999/folder/file.jpg
/// → /image/upload/v1699999999/folder/file.jpg
fn expand_cloudinary(u: &reqwest::Url) -> Vec<String> {
    let host = u.host_str().unwrap_or("");
    if !host.contains("res.cloudinary.com")
        || !u.path().contains("/image/upload/")
    {
        return vec![];
    }
    let path = u.path();
    let (prefix, after) = match path.split_once("/image/upload/") {
        Some(t) => t,
        None => return vec![],
    };
    let mut segs: Vec<&str> = after.split('/').collect();
    if segs.is_empty() {
        return vec![];
    }

    // helper: detect Cloudinary transformation segments
    fn is_transform(seg: &str) -> bool {
        // transform segments often contain commas or start with known prefixes
        seg.contains(',')
            || [
                "c_", "w_", "h_", "q_", "f_", "g_", "e_", "dpr_", "ar_", "x_",
                "y_", "r_", "b_",
            ]
            .iter()
            .any(|p| seg.starts_with(p))
            || seg.starts_with("t_") // named transformation
    }

    // Drop leading transformation segments
    while !segs.is_empty() && is_transform(segs[0]) {
        segs.remove(0);
    }
    if segs.is_empty() {
        return vec![];
    }

    // If next segment is a version like v1234567890, keep it (not a transformation)
    let mut rebuilt: Vec<&str> = Vec::new();
    if let Some(&first) = segs.first() {
        if first.starts_with('v')
            && first[1..].chars().all(|c| c.is_ascii_digit())
        {
            rebuilt.push(first);
            segs.remove(0);
        }
    }
    // Append remaining public_id path (must exist)
    if segs.is_empty() {
        return vec![];
    }
    rebuilt.extend(segs.iter().copied());

    let new_path = format!("{}/image/upload/{}", prefix, rebuilt.join("/"));
    let mut u2 = u.clone();
    u2.set_path(&new_path);
    vec![u2.to_string()]
}

/// Reddit preview → i.redd.it when possible (strip query).
fn expand_reddit_preview(u: &reqwest::Url) -> Vec<String> {
    let host = u.host_str().unwrap_or("");
    if !(host.starts_with("preview.redd.it")
        || host.starts_with("external-preview.redd.it"))
    {
        return vec![];
    }
    let mut u2 = u.clone();
    let _ = u2.set_host(Some("i.redd.it")); // ignore error if invalid
    u2.set_query(None);
    vec![u2.to_string()]
}

/// Unsplash: boost width & auto=format, keep other query params (don't force q=100 to avoid huge files).
fn expand_unsplash(u: &reqwest::Url) -> Vec<String> {
    let host = u.host_str().unwrap_or("");
    if !host.ends_with("unsplash.com") && !host.ends_with("images.unsplash.com")
    {
        return vec![];
    }
    let u2 = set_query_kv(u.clone(), &[("w", "4096"), ("auto", "format")]);
    vec![u2.to_string()]
}

/// Flickr: upgrade size suffix to bigger ones (_k, _h, _b, _c, _z).
/// Note: some largest sizes may require a different secret and can 404; that's expected as a "try-next" strategy.
fn expand_flickr(u: &reqwest::Url) -> Vec<String> {
    let host = u.host_str().unwrap_or("");
    if !host.ends_with("staticflickr.com") {
        return vec![];
    }
    static RE: Lazy<Regex> = Lazy::new(|| {
        // ..._q.jpg, ..._m.jpg, ..._n.jpg, ..._z.jpg, ..._c.jpg, ..._b.jpg, ..._h.jpg, ..._k.jpg, ..._o.jpg
        Regex::new(r"(?i)(?P<base>.+)_(?P<sz>[a-z])(\.(?P<ext>[a-z0-9]+))$")
            .unwrap()
    });
    let segs: Vec<String> = u
        .path_segments()
        .map(|it| it.map(|s| s.to_string()).collect())
        .unwrap_or_default();
    if segs.is_empty() {
        return vec![];
    }
    let file = segs.last().unwrap().clone();
    let mut out = Vec::new();
    let choices = ['k', 'h', 'b', 'c', 'z'];
    if let Some(caps) = RE.captures(&file) {
        let base = caps.name("base").map(|m| m.as_str()).unwrap_or(&file);
        let ext = caps.name("ext").map(|m| m.as_str()).unwrap_or("jpg");
        for ch in choices {
            let mut segs2 = segs.clone();
            segs2.pop();
            segs2.push(format!("{}_{}.{}", base, ch, ext));
            let mut u2 = u.clone();
            u2.set_path(&format!("/{}", segs2.join("/")));
            out.push(u2.to_string());
        }
    }
    out
}
