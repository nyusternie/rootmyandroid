//! src/proto.rs — wire frames for the relay-bridged E2E sessions
//! (docs/e2e-protocol.md v1). Both roles live here: the daemon parses
//! `hello`/`enc` and emits `welcome`/`enc`/`error`; the web client
//! (apps/web/src/lib/e2e.ts) is the mirror image. Frames without `"v":1`
//! are relay-control (`authed`) — never parsed beyond the type tag.

use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use serde::{Deserialize, Serialize};

pub const PROTOCOL_VERSION: u8 = 1;
/// Inner `d` payloads are chunked to this so wrapped `enc` frames stay
/// under the relay's 64 KiB cap (docs/e2e-protocol.md §2.4).
pub const MAX_INNER_CHUNK: usize = 32 * 1024;

pub fn b64e(bytes: &[u8]) -> String {
    B64.encode(bytes)
}

pub fn b64d(value: &str) -> Option<Vec<u8>> {
    B64.decode(value).ok()
}

/// base64 OR base64url, padded or not — needed for the API-issued tunnel
/// challenge (base64url; docs/e2e-protocol.md §2 preamble). Mirrors the
/// relay worker's decodeBase64.
pub fn b64d_any(value: &str) -> Option<Vec<u8>> {
    let std: String = value.chars().map(|c| if c == '-' { '+' } else if c == '_' { '/' } else { c }).collect();
    let padded = match std.len() % 4 {
        0 => std,
        r => {
            let mut s = std;
            for _ in 0..(4 - r) {
                s.push('=');
            }
            s
        }
    };
    B64.decode(padded).ok()
}

#[derive(Debug, Clone, PartialEq)]
pub enum Frame {
    Hello { sid: Vec<u8>, eph: Vec<u8> },
    Welcome { sid: Vec<u8>, id: Vec<u8>, eph: Vec<u8>, sig: Vec<u8> },
    Enc { sid: Vec<u8>, n: Vec<u8>, d: Vec<u8> },
    Error { sid: Option<Vec<u8>>, error: String },
    /// Relay-generated control frame ({"type":"authed",...}).
    Authed,
    /// Anything else (wrong/unknown type) — ignored by both roles.
    Other,
}

// Serde mirrors: field names are the wire contract — do not rename.
#[derive(Serialize)]
struct HelloOut<'a> {
    v: u8,
    #[serde(rename = "type")]
    kind: &'a str,
    sid: String,
    eph: String,
}

#[derive(Serialize)]
struct WelcomeOut<'a> {
    v: u8,
    #[serde(rename = "type")]
    kind: &'a str,
    sid: String,
    id: String,
    eph: String,
    sig: String,
}

#[derive(Serialize)]
struct EncOut<'a> {
    v: u8,
    #[serde(rename = "type")]
    kind: &'a str,
    sid: String,
    n: String,
    d: String,
}

#[derive(Serialize)]
struct ErrorOut<'a> {
    v: u8,
    #[serde(rename = "type")]
    kind: &'a str,
    #[serde(skip_serializing_if = "Option::is_none")]
    sid: Option<String>,
    error: &'a str,
}

#[derive(Deserialize)]
struct FrameIn {
    v: Option<u8>,
    #[serde(rename = "type")]
    kind: String,
    sid: Option<String>,
    id: Option<String>,
    eph: Option<String>,
    sig: Option<String>,
    n: Option<String>,
    d: Option<String>,
    error: Option<String>,
}

pub fn encode_frame(frame: &Frame) -> String {
    let json = match frame {
        Frame::Hello { sid, eph } => serde_json::to_string(&HelloOut {
            v: PROTOCOL_VERSION,
            kind: "hello",
            sid: b64e(sid),
            eph: b64e(eph),
        }),
        Frame::Welcome { sid, id, eph, sig } => serde_json::to_string(&WelcomeOut {
            v: PROTOCOL_VERSION,
            kind: "welcome",
            sid: b64e(sid),
            id: b64e(id),
            eph: b64e(eph),
            sig: b64e(sig),
        }),
        Frame::Enc { sid, n, d } => serde_json::to_string(&EncOut {
            v: PROTOCOL_VERSION,
            kind: "enc",
            sid: b64e(sid),
            n: b64e(n),
            d: b64e(d),
        }),
        Frame::Error { sid, error } => serde_json::to_string(&ErrorOut {
            v: PROTOCOL_VERSION,
            kind: "error",
            sid: sid.as_ref().map(|s| b64e(s)),
            error,
        }),
        // Control/unknown frames are inbound-only; the daemon never emits them.
        Frame::Authed | Frame::Other => return String::new(),
    };
    json.expect("frame serialization is infallible")
}

pub fn parse_frame(text: &str) -> Frame {
    let parsed: FrameIn = match serde_json::from_str(text) {
        Ok(p) => p,
        Err(_) => return Frame::Other,
    };
    if parsed.kind == "authed" {
        return Frame::Authed;
    }
    // Everything below carries v:1 (docs/e2e-protocol.md §0).
    if parsed.v != Some(PROTOCOL_VERSION) {
        return Frame::Other;
    }
    match parsed.kind.as_str() {
        "hello" => match (parsed.sid.and_then(|s| b64d(&s)), parsed.eph.and_then(|e| b64d(&e))) {
            (Some(sid), Some(eph)) if sid.len() == 16 && eph.len() == 32 => Frame::Hello { sid, eph },
            _ => Frame::Other,
        },
        "welcome" => {
            match (
                parsed.sid.and_then(|s| b64d(&s)),
                parsed.id.and_then(|i| b64d(&i)),
                parsed.eph.and_then(|e| b64d(&e)),
                parsed.sig.and_then(|s| b64d(&s)),
            ) {
                (Some(sid), Some(id), Some(eph), Some(sig))
                    if sid.len() == 16 && id.len() == 32 && eph.len() == 32 && sig.len() == 64 =>
                {
                    Frame::Welcome { sid, id, eph, sig }
                }
                _ => Frame::Other,
            }
        }
        "enc" => {
            match (
                parsed.sid.and_then(|s| b64d(&s)),
                parsed.n.and_then(|n| b64d(&n)),
                parsed.d.and_then(|d| b64d(&d)),
            ) {
                (Some(sid), Some(n), Some(d)) if sid.len() == 16 && n.len() == 12 => {
                    Frame::Enc { sid, n, d }
                }
                _ => Frame::Other,
            }
        }
        "error" => Frame::Error {
            sid: parsed.sid.and_then(|s| b64d(&s)),
            error: parsed.error.unwrap_or_default(),
        },
        _ => Frame::Other,
    }
}

/// Inner frames (encrypted channel, docs/e2e-protocol.md §3).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Inner {
    Stdin { d: String },
    Stdout { d: String },
    Stderr { d: String },
    Exit { code: Option<i32> },
    Close,
    SessionInfo { name: Option<String>, tier: String, version: String },
}

impl Inner {
    pub fn stdin(bytes: &[u8]) -> Inner {
        Inner::Stdin { d: b64e(bytes) }
    }
    pub fn stdout(bytes: &[u8]) -> Inner {
        Inner::Stdout { d: b64e(bytes) }
    }
    pub fn stderr(bytes: &[u8]) -> Inner {
        Inner::Stderr { d: b64e(bytes) }
    }
}

pub fn encode_inner(inner: &Inner) -> Vec<u8> {
    serde_json::to_vec(inner).expect("inner serialization is infallible")
}

/// Returns the parsed inner frame plus its raw `d` payload (for the data
/// frames); `d` stays base64 inside the struct (wire contract) so callers
/// that need bytes ask for them explicitly.
pub fn parse_inner(plaintext: &[u8]) -> Option<(Inner, Option<Vec<u8>>)> {
    let inner: Inner = serde_json::from_slice(plaintext).ok()?;
    let d = match &inner {
        Inner::Stdin { d } | Inner::Stdout { d } | Inner::Stderr { d } => b64d(d),
        _ => None,
    };
    match (&inner, &d) {
        (Inner::Stdin { .. } | Inner::Stdout { .. } | Inner::Stderr { .. }, None) => None,
        _ => Some((inner, d)),
    }
}
