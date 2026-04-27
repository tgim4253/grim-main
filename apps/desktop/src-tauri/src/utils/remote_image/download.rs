use std::{
    io::Cursor,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, ToSocketAddrs},
    path::Path,
    time::Duration,
};

use anyhow::{anyhow, bail, Context, Result};
use futures::StreamExt;
use image::ImageReader;
use reqwest::{
    header::{ACCEPT, CONTENT_TYPE, LOCATION},
    redirect::Policy,
    Response, Url,
};
use tokio::task;

use crate::utils::{
    file_ops::{decode_data_url, extension_from_mime},
    media,
};

use super::preferred_urls::expand_preferred_urls;

const MAX_REMOTE_IMAGE_BYTES: u64 = 50 * 1024 * 1024;
const MAX_REMOTE_IMAGE_DIMENSION: u32 = 16_384;
const MAX_REMOTE_IMAGE_PIXELS: u64 = 100_000_000;
const MAX_REMOTE_IMAGE_REDIRECTS: usize = 10;
const REMOTE_IMAGE_TIMEOUT_SECONDS: u64 = 30;
const USER_AGENT: &str = "Grim/0.1 remote-image-import";

pub struct RemoteImageDownload {
    pub bytes: Vec<u8>,
    pub file_name: String,
}

pub async fn download_remote_image(
    source: &str,
) -> Result<RemoteImageDownload> {
    let source = source.trim();
    if source.to_ascii_lowercase().starts_with("data:image/") {
        return decode_remote_data_image(source);
    }

    let url = Url::parse(source)
        .with_context(|| format!("Invalid remote image URL: {source}"))?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(REMOTE_IMAGE_TIMEOUT_SECONDS))
        .redirect(Policy::none())
        .user_agent(USER_AGENT)
        .build()
        .context("Failed to create remote image HTTP client")?;

    let mut last_error = None;
    for candidate in expand_preferred_urls(&url) {
        match download_remote_image_url(&client, candidate.clone()).await {
            Ok(download) => return Ok(download),
            Err(error) => {
                last_error = Some(anyhow!(
                    "Failed remote image candidate {candidate}: {error}"
                ));
            }
        }
    }

    Err(last_error.unwrap_or_else(|| anyhow!("No remote image URL candidates")))
}

async fn download_remote_image_url(
    client: &reqwest::Client,
    url: Url,
) -> Result<RemoteImageDownload> {
    let (final_url, response) = request_remote_image(client, url).await?;

    let status = response.status();
    if !status.is_success() {
        bail!("Remote image request failed with status {status}");
    }

    if let Some(content_length) = response.content_length() {
        ensure_within_size_limit(content_length)?;
    }

    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(|value| value.to_string());
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk =
            chunk.context("Failed to read remote image response body")?;
        ensure_within_size_limit(bytes.len() as u64 + chunk.len() as u64)?;
        bytes.extend_from_slice(&chunk);
    }
    if bytes.is_empty() {
        bail!("Remote image response was empty");
    }
    ensure_remote_image_dimensions(&bytes)?;

    let file_name =
        remote_file_name(&final_url, content_type.as_deref(), &bytes)?;

    Ok(RemoteImageDownload { bytes, file_name })
}

fn decode_remote_data_image(source: &str) -> Result<RemoteImageDownload> {
    ensure_data_url_encoded_size_within_limit(source, MAX_REMOTE_IMAGE_BYTES)?;
    let (bytes, extension_hint) = decode_data_url(source)?;
    ensure_within_size_limit(bytes.len() as u64)?;
    if bytes.is_empty() {
        bail!("Remote image data URL was empty");
    }
    ensure_remote_image_dimensions(&bytes)?;

    let extension = infer_image_extension(&bytes)
        .or_else(|| extension_hint.as_deref().and_then(supported_extension))
        .ok_or_else(|| anyhow!("Remote data URL is not a supported image"))?;

    Ok(RemoteImageDownload {
        bytes,
        file_name: format!("remote-image.{extension}"),
    })
}

async fn request_remote_image(
    client: &reqwest::Client,
    initial_url: Url,
) -> Result<(Url, Response)> {
    let mut url = initial_url;

    for redirect_count in 0..=MAX_REMOTE_IMAGE_REDIRECTS {
        validate_remote_image_url(&url).await?;

        let response = client
            .get(url.clone())
            .header(ACCEPT, "image/*,*/*;q=0.8")
            .send()
            .await
            .with_context(|| {
                format!("Failed to request remote image: {url}")
            })?;
        if let Some(remote_addr) = response.remote_addr() {
            ensure_allowed_ip(remote_addr.ip())?;
        }

        if !response.status().is_redirection() {
            return Ok((url, response));
        }

        if redirect_count == MAX_REMOTE_IMAGE_REDIRECTS {
            bail!(
                "Remote image redirect limit exceeded ({MAX_REMOTE_IMAGE_REDIRECTS})"
            );
        }

        let location = response
            .headers()
            .get(LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| anyhow!("Remote image redirect missing Location"))?;
        url = url.join(location).with_context(|| {
            format!("Invalid remote image redirect: {location}")
        })?;
    }

    unreachable!("redirect loop returns or bails before this point")
}

async fn validate_remote_image_url(url: &Url) -> Result<()> {
    ensure_remote_image_scheme(url)?;

    let host = url
        .host_str()
        .ok_or_else(|| anyhow!("Remote image URL is missing a host"))?;
    ensure_allowed_hostname(host)?;

    if let Ok(ip) = host.parse::<IpAddr>() {
        ensure_allowed_ip(ip)?;
        return Ok(());
    }

    let port = url
        .port_or_known_default()
        .ok_or_else(|| anyhow!("Remote image URL is missing a port"))?;
    let addrs = resolve_host(host.to_string(), port).await?;
    if addrs.is_empty() {
        bail!("Remote image host did not resolve: {host}");
    }

    for ip in addrs {
        ensure_allowed_ip(ip)?;
    }

    Ok(())
}

fn ensure_remote_image_scheme(url: &Url) -> Result<()> {
    match url.scheme() {
        "http" | "https" => Ok(()),
        scheme => bail!("Unsupported remote image URL scheme: {scheme}"),
    }
}

fn ensure_allowed_hostname(host: &str) -> Result<()> {
    let normalized = host.trim_end_matches('.').to_ascii_lowercase();
    if normalized == "localhost"
        || normalized.ends_with(".localhost")
        || normalized.ends_with(".local")
    {
        bail!("Remote image host is not allowed: {host}");
    }
    Ok(())
}

async fn resolve_host(host: String, port: u16) -> Result<Vec<IpAddr>> {
    task::spawn_blocking(move || {
        (host.as_str(), port)
            .to_socket_addrs()
            .map(|addrs| addrs.map(|addr| addr.ip()).collect::<Vec<_>>())
    })
    .await
    .map_err(|err| anyhow!("Failed to join remote image DNS task: {err}"))?
    .context("Failed to resolve remote image host")
}

fn ensure_allowed_ip(ip: IpAddr) -> Result<()> {
    let blocked = match ip {
        IpAddr::V4(ipv4) => is_blocked_ipv4(ipv4),
        IpAddr::V6(ipv6) => ipv6
            .to_ipv4_mapped()
            .map(is_blocked_ipv4)
            .unwrap_or_else(|| is_blocked_ipv6(ipv6)),
    };

    if blocked {
        bail!("Remote image host resolved to a disallowed address: {ip}");
    }

    Ok(())
}

fn is_blocked_ipv4(ip: Ipv4Addr) -> bool {
    let octets = ip.octets();
    ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_private()
        || ip.is_link_local()
        || ip.is_broadcast()
        || ip.is_documentation()
        || ip.is_multicast()
        || octets[0] == 0
        || octets[0] >= 240
        || (octets[0] == 100 && (64..=127).contains(&octets[1]))
        || (octets[0] == 192 && octets[1] == 0 && octets[2] == 0)
        || (octets[0] == 198 && (18..=19).contains(&octets[1]))
}

fn is_blocked_ipv6(ip: Ipv6Addr) -> bool {
    let segments = ip.segments();
    ip.is_unspecified()
        || ip.is_loopback()
        || ip.is_multicast()
        || (segments[0] & 0xfe00) == 0xfc00
        || (segments[0] & 0xffc0) == 0xfe80
        || (segments[0] == 0x2001 && segments[1] == 0x0db8)
}

fn ensure_within_size_limit(size: u64) -> Result<()> {
    if size > MAX_REMOTE_IMAGE_BYTES {
        bail!(
            "Remote image exceeds the {} MB limit",
            MAX_REMOTE_IMAGE_BYTES / 1024 / 1024
        );
    }
    Ok(())
}

fn ensure_remote_image_dimensions(bytes: &[u8]) -> Result<()> {
    let (width, height) = ImageReader::new(Cursor::new(bytes))
        .with_guessed_format()
        .context("Failed to inspect remote image format")?
        .into_dimensions()
        .context("Failed to inspect remote image dimensions")?;

    if width == 0 || height == 0 {
        bail!("Remote image has invalid dimensions: {width}x{height}");
    }

    if width > MAX_REMOTE_IMAGE_DIMENSION || height > MAX_REMOTE_IMAGE_DIMENSION
    {
        bail!(
            "Remote image dimensions exceed the {}px limit: {}x{}",
            MAX_REMOTE_IMAGE_DIMENSION,
            width,
            height
        );
    }

    let pixels = u64::from(width) * u64::from(height);
    if pixels > MAX_REMOTE_IMAGE_PIXELS {
        bail!(
            "Remote image exceeds the {} megapixel limit: {}x{}",
            MAX_REMOTE_IMAGE_PIXELS / 1_000_000,
            width,
            height
        );
    }

    Ok(())
}

fn ensure_data_url_encoded_size_within_limit(
    source: &str,
    max_decoded_bytes: u64,
) -> Result<()> {
    let (header, data) = source
        .split_once(',')
        .ok_or_else(|| anyhow!("invalid data url payload"))?;
    if !header.contains(";base64") {
        return Err(anyhow!("unsupported data url encoding"));
    }

    let encoded_len =
        data.bytes().filter(|byte| !byte.is_ascii_whitespace()).count() as u64;
    let padding =
        data.trim_end().bytes().rev().take_while(|byte| *byte == b'=').count()
            as u64;
    let decoded_size = encoded_len
        .div_ceil(4)
        .saturating_mul(3)
        .saturating_sub(padding.min(2));

    if decoded_size > max_decoded_bytes {
        bail!(
            "Remote image exceeds the {} MB limit",
            max_decoded_bytes / 1024 / 1024
        );
    }

    Ok(())
}

fn remote_file_name(
    url: &Url,
    content_type: Option<&str>,
    bytes: &[u8],
) -> Result<String> {
    let path_segment = url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|segment| !segment.trim().is_empty())
        .unwrap_or("remote-image");
    let extension = infer_image_extension(bytes)
        .or_else(|| content_type.and_then(content_type_image_extension))
        .or_else(|| path_extension(path_segment))
        .ok_or_else(|| anyhow!("Remote source is not a supported image"))?;

    Ok(file_name_with_extension(path_segment, &extension))
}

fn content_type_image_extension(content_type: &str) -> Option<String> {
    let mime = content_type
        .split(';')
        .next()
        .map(|value| value.trim().to_ascii_lowercase())?;
    if !mime.starts_with("image/") {
        return None;
    }
    extension_from_mime(&mime).and_then(|ext| supported_extension(&ext))
}

fn infer_image_extension(bytes: &[u8]) -> Option<String> {
    let kind = infer::get(bytes)?;
    if !kind.mime_type().starts_with("image/") {
        return None;
    }
    supported_extension(kind.extension())
        .or_else(|| content_type_image_extension(kind.mime_type()))
}

fn path_extension(path_segment: &str) -> Option<String> {
    Path::new(path_segment)
        .extension()
        .and_then(|extension| extension.to_str())
        .and_then(supported_extension)
}

fn supported_extension(extension: &str) -> Option<String> {
    let normalized = extension.trim_start_matches('.').to_ascii_lowercase();
    media::SUPPORTED_IMAGE_EXTENSIONS
        .contains(&normalized.as_str())
        .then_some(normalized)
}

fn file_name_with_extension(raw_name: &str, extension: &str) -> String {
    let sanitized = sanitize_file_name(raw_name);
    let stem = Path::new(&sanitized)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .filter(|stem| !stem.trim_matches('.').is_empty())
        .unwrap_or("remote-image");
    format!("{stem}.{extension}")
}

fn sanitize_file_name(raw_name: &str) -> String {
    let mut sanitized = String::with_capacity(raw_name.len().min(160));
    for ch in raw_name.chars().take(160) {
        if ch.is_ascii_alphanumeric() || matches!(ch, '.' | '-' | '_') {
            sanitized.push(ch);
        } else {
            sanitized.push('_');
        }
    }

    let sanitized = sanitized.trim_matches('.').trim();
    if sanitized.is_empty() {
        "remote-image".to_string()
    } else {
        sanitized.to_string()
    }
}

#[cfg(test)]
mod tests {
    use reqwest::Url;

    use super::{
        ensure_data_url_encoded_size_within_limit,
        ensure_remote_image_dimensions, validate_remote_image_url,
        MAX_REMOTE_IMAGE_DIMENSION,
    };

    const BMP_1X1: &[u8] = &[
        66, 77, 58, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0, 40, 0, 0, 0, 1, 0, 0, 0,
        1, 0, 0, 0, 1, 0, 24, 0, 0, 0, 0, 0, 4, 0, 0, 0, 19, 11, 0, 0, 19, 11,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 0, 0, 0,
    ];

    fn bmp_header_with_dimensions(width: u32, height: u32) -> Vec<u8> {
        let mut bytes = vec![0_u8; 54];
        bytes[0] = b'B';
        bytes[1] = b'M';
        bytes[2..6].copy_from_slice(&(54_u32).to_le_bytes());
        bytes[10..14].copy_from_slice(&(54_u32).to_le_bytes());
        bytes[14..18].copy_from_slice(&(40_u32).to_le_bytes());
        bytes[18..22].copy_from_slice(&width.to_le_bytes());
        bytes[22..26].copy_from_slice(&height.to_le_bytes());
        bytes[26..28].copy_from_slice(&(1_u16).to_le_bytes());
        bytes[28..30].copy_from_slice(&(24_u16).to_le_bytes());
        bytes
    }

    #[test]
    fn data_url_size_check_runs_before_decode() {
        let source = "data:image/png;base64,AAAA";

        assert!(ensure_data_url_encoded_size_within_limit(source, 2).is_err());
        assert!(ensure_data_url_encoded_size_within_limit(source, 3).is_ok());
    }

    #[test]
    fn accepts_remote_image_dimensions_under_limits() {
        assert!(ensure_remote_image_dimensions(BMP_1X1).is_ok());
    }

    #[test]
    fn rejects_remote_image_dimensions_over_limit() {
        let bytes =
            bmp_header_with_dimensions(MAX_REMOTE_IMAGE_DIMENSION + 1, 1);

        assert!(ensure_remote_image_dimensions(&bytes).is_err());
    }

    #[tokio::test]
    async fn rejects_localhost_remote_image_urls() {
        let url = Url::parse("http://127.0.0.1/image.png").expect("valid url");

        assert!(validate_remote_image_url(&url).await.is_err());
    }
}
