//! src/relay.rs — the relay tunnel client (docs/relay-handoff.md §2,
//! docs/e2e-protocol.md): pair once per account, then loop challenge ->
//! wss dial-out -> first-message auth -> E2E session multiplex. The tunnel
//! is the daemon's PRIMARY transport (the LAN listener stays as fallback).
//!
//! Reconnect policy (docs/relay-api-todo-2026-11-07.md §4): exponential
//! backoff 1s -> 60s cap + jitter; reset after a successful `authed`.
//! Kill switch: a 403/4403 (revoked) or 409 (key bound to another
//! account) disables this lane until daemon restart.

use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::process::Command;
use std::sync::mpsc::{sync_channel, Receiver, SyncSender};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use ed25519_dalek::Signer;
use rand::{rngs::OsRng, Rng};
use rustls::pki_types::ServerName;
use rustls::{ClientConfig, ClientConnection, RootCertStore, StreamOwned};
use tungstenite::{client as ws_client, Message, WebSocket};
use x25519_dalek::{EphemeralSecret, PublicKey as X25519Public};

use crate::e2e::{self, SessionCipher};
use crate::identity::{self, Identity};
use crate::proto::{self, Frame, Inner};
use crate::session::{self, Outbound, SessionHandle};

const DEFAULT_API: &str = "https://rootmyandroid.com/v1";
const DEFAULT_RELAY: &str = "wss://relay.rootmyandroid.com/tunnel";
const MAX_SESSIONS: usize = 8;
const READ_TIMEOUT: Duration = Duration::from_millis(50);
const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(15);
/// Stay under the relay's 100 frames/s/socket cap (tunnel.js).
const SEND_PACE_PER_SEC: u32 = 90;
const BACKOFF_INIT: Duration = Duration::from_secs(1);
const BACKOFF_MAX: Duration = Duration::from_secs(60);
const JITTER_MS: u64 = 250;

pub struct RelayConfig {
    api_base: String,
    relay_ws: String,
    account: Option<String>,
}

impl RelayConfig {
    /// Env overrides for dev (ROOTZD_API / ROOTZD_RELAY / ROOTZD_ACCOUNT).
    pub fn from_env() -> RelayConfig {
        RelayConfig {
            api_base: std::env::var("ROOTZD_API").ok().filter(|v| !v.is_empty()).unwrap_or_else(|| DEFAULT_API.to_string()),
            relay_ws: std::env::var("ROOTZD_RELAY").ok().filter(|v| !v.is_empty()).unwrap_or_else(|| DEFAULT_RELAY.to_string()),
            account: std::env::var("ROOTZD_ACCOUNT").ok().filter(|v| !v.is_empty()),
        }
    }
}

enum Outcome {
    /// Transient failure or clean close — backoff and dial again.
    Retry,
    /// Kill switch honored (403 / 4403): stop the lane until restart.
    Revoked,
    /// 409: this key is paired to a DIFFERENT account — operator action
    /// required (clear the state dir or revoke + re-pair).
    FatalConfig,
}

/// The relay lane: runs forever; every failure path loops or parks.
pub fn run(cfg: RelayConfig, identity: Identity, tier_name: &'static str, version: &'static str) {
    let account = match &cfg.account {
        Some(a) => a.clone(),
        None => {
            eprintln!("rootzd: ROOTZD_ACCOUNT not set — relay tunnel disabled, LAN only");
            park();
        }
    };
    let device_name = device_model();
    let mut backoff = BACKOFF_INIT;

    loop {
        let (authed, outcome) = once(&cfg, &identity, &account, tier_name, version, &device_name);
        match outcome {
            Outcome::Retry => {
                if authed {
                    backoff = BACKOFF_INIT;
                } else {
                    backoff = (backoff * 2).min(BACKOFF_MAX);
                }
                let jitter = Duration::from_millis(OsRng.random_range(0..=JITTER_MS));
                thread::sleep(backoff + jitter);
            }
            Outcome::Revoked => {
                eprintln!("rootzd: device revoked (kill switch) — relay lane disabled until restart");
                park();
            }
            Outcome::FatalConfig => {
                eprintln!(
                    "rootzd: this device key is paired to a different account — \
                     clear {} or revoke + re-pair; relay lane disabled until restart",
                    identity::state_dir().display()
                );
                park();
            }
        }
    }
}

fn park() -> ! {
    loop {
        thread::sleep(Duration::from_secs(3600));
    }
}

/// Read-only device label for session_info (docs/e2e-protocol.md §3).
fn device_model() -> Option<String> {
    let out = Command::new("/system/bin/getprop").arg("ro.product.model").output().ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if s.is_empty() {
        None
    } else {
        Some(s)
    }
}

/// One tunnel attempt. Returns (reached `authed`, outcome).
fn once(
    cfg: &RelayConfig,
    identity: &Identity,
    account: &str,
    tier_name: &'static str,
    version: &'static str,
    device_name: &Option<String>,
) -> (bool, Outcome) {
    // 1. Pair (once per account; idempotent server-side — handoff §1).
    if let Some(outcome) = ensure_paired(cfg, identity, account) {
        return (false, outcome);
    }

    // 2. Challenge (single-use, 300s TTL).
    let challenge = match post_json(
        cfg,
        "/relay/challenge",
        &serde_json::json!({ "account_number": account, "device_id": identity.device_id }),
    ) {
        Ok(body) => match body.get("challenge").and_then(|c| c.as_str()) {
            Some(c) => c.to_string(),
            None => {
                eprintln!("rootzd: relay challenge response missing challenge");
                return (false, Outcome::Retry);
            }
        },
        Err(outcome) => return (false, outcome),
    };
    let challenge_bytes = match proto::b64d_any(&challenge) {
        Some(b) if b.len() == 32 => b,
        _ => {
            eprintln!("rootzd: relay challenge is not 32 bytes of base64");
            return (false, Outcome::Retry);
        }
    };

    // 3. Dial the tunnel (wss; ROOTZD_RELAY may override to ws:// for dev).
    let url = format!("{}?device={}", cfg.relay_ws, identity.device_id);
    let (mut ws, sock_opts) = match connect_ws(&url) {
        Ok(pair) => pair,
        Err(e) => {
            eprintln!("rootzd: relay connect failed: {e}");
            return (false, Outcome::Retry);
        }
    };

    // 4. First-message auth: Ed25519 signature over the raw challenge
    //    bytes (relay verifyDeviceSignature — base64url OR base64 on the
    //    wire is fine, the relay decodes both).
    let sig = identity.signing_key.sign(&challenge_bytes);
    let auth = serde_json::json!({
        "type": "auth",
        "device_id": identity.device_id,
        "challenge": challenge,
        "signature": proto::b64e(&sig.to_bytes()),
    });
    if ws.send(Message::text(auth.to_string())).is_err() {
        return (false, Outcome::Retry);
    }
    match read_one(&mut ws, HANDSHAKE_TIMEOUT) {
        ReadOne::Frame(Frame::Authed) => {
            eprintln!("rootzd: relay tunnel up (device {})", &identity.device_id[..12]);
        }
        ReadOne::Closed(Some(4403)) => return (false, Outcome::Revoked),
        ReadOne::Closed(code) => {
            eprintln!("rootzd: relay auth refused (close {code:?})");
            return (false, Outcome::Retry);
        }
        ReadOne::Frame(_) => {
            eprintln!("rootzd: relay auth: unexpected first frame");
            return (false, Outcome::Retry);
        }
        ReadOne::Failed(e) => {
            eprintln!("rootzd: relay auth read failed: {e}");
            return (false, Outcome::Retry);
        }
    }

    // 5. Session multiplex until the tunnel drops.
    (true, session_loop(&mut ws, &sock_opts, identity, tier_name, version, device_name))
}

/// POST {api_base}{path} with a 15s global timeout. Ok(body) on 2xx;
/// Err(outcome) mapping the status codes we act on.
fn post_json(cfg: &RelayConfig, path: &str, body: &serde_json::Value) -> Result<serde_json::Value, Outcome> {
    let agent = ureq::Agent::new_with_config(
        ureq::config::Config::builder().timeout_global(Some(HANDSHAKE_TIMEOUT)).build(),
    );
    let url = format!("{}{}", cfg.api_base, path);
    match agent.post(&url).send_json(body) {
        Ok(mut resp) => match resp.body_mut().read_json::<serde_json::Value>() {
            Ok(v) => Ok(v),
            Err(e) => {
                eprintln!("rootzd: {path}: bad response body: {e}");
                Err(Outcome::Retry)
            }
        },
        Err(ureq::Error::StatusCode(code)) => {
            eprintln!("rootzd: {path}: HTTP {code}");
            match code {
                403 => Err(Outcome::Revoked),
                409 => Err(Outcome::FatalConfig),
                // 404 (unknown account — may be created later), 410
                // (challenge race), 429 (rate limit), 5xx: all transient.
                _ => Err(Outcome::Retry),
            }
        }
        Err(e) => {
            eprintln!("rootzd: {path}: request failed: {e}");
            Err(Outcome::Retry)
        }
    }
}

/// Paired-marker: the state dir holds `paired` containing the account
/// number this key was paired to (docs/e2e-protocol.md §5). Returns
/// Some(outcome) when pairing is needed and failed.
fn ensure_paired(cfg: &RelayConfig, identity: &Identity, account: &str) -> Option<Outcome> {
    let marker = identity::state_dir().join("paired");
    if let Ok(contents) = std::fs::read_to_string(&marker) {
        if contents.trim() == account {
            return None;
        }
    }
    match post_json(
        cfg,
        "/relay/devices",
        &serde_json::json!({ "account_number": account, "device_pubkey": proto::b64e(&identity.pubkey) }),
    ) {
        Ok(_) => {
            if let Err(e) = std::fs::write(&marker, format!("{account}\n")) {
                eprintln!("rootzd: paired marker write failed ({e}) — will re-pair next dial");
            } else {
                eprintln!("rootzd: paired to account (marker written)");
            }
            None
        }
        Err(outcome) => Some(outcome),
    }
}

// --- WebSocket plumbing ---------------------------------------------------

/// Both stream kinds (ws:// dev override vs wss:// production) behind one
/// trait object so the session loop has a single concrete WebSocket type.
trait ReadWrite: Read + Write {}
impl<T: Read + Write> ReadWrite for T {}

type Ws = WebSocket<Box<dyn ReadWrite>>;

/// Returns the WebSocket plus a second handle to the underlying socket —
/// read-timeout changes are socket options (SO_RCVTIMEO), so the clone
/// adjusts them for the stream the WebSocket owns.
fn connect_ws(url: &str) -> Result<(Ws, TcpStream), String> {
    // Minimal URL split (no url crate): scheme://authority/path
    let (tls, rest) = if let Some(r) = url.strip_prefix("wss://") {
        (true, r)
    } else if let Some(r) = url.strip_prefix("ws://") {
        (false, r)
    } else {
        return Err(format!("unsupported scheme (need wss:// or ws://): {url}"));
    };
    let authority = rest.split('/').next().unwrap_or(rest);
    let (host, port) = match authority.split_once(':') {
        Some((h, p)) => (h.to_string(), p.parse::<u16>().map_err(|e| format!("bad port: {e}"))?),
        None => (authority.to_string(), if tls { 443 } else { 80 }),
    };

    let tcp = TcpStream::connect((host.as_str(), port)).map_err(|e| format!("tcp connect {host}:{port}: {e}"))?;
    tcp.set_read_timeout(Some(HANDSHAKE_TIMEOUT)).map_err(|e| e.to_string())?;
    tcp.set_nodelay(true).ok();
    let sock_opts = tcp.try_clone().map_err(|e| e.to_string())?;

    let stream: Box<dyn ReadWrite> = if tls {
        let mut roots = RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let config = ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        let server_name = ServerName::try_from(host.as_str()).map_err(|e| format!("bad server name {host}: {e}"))?.to_owned();
        let conn = ClientConnection::new(Arc::new(config), server_name).map_err(|e| e.to_string())?;
        Box::new(StreamOwned::new(conn, tcp))
    } else {
        Box::new(tcp)
    };

    let (ws, _response) = ws_client(url, stream).map_err(|e| format!("ws handshake: {e}"))?;
    Ok((ws, sock_opts))
}

enum ReadOne {
    Frame(Frame),
    Closed(Option<u16>),
    Failed(String),
}

/// Blocking read of one TEXT frame with an overall deadline; pings/pongs
/// are handled by tungstenite internally.
fn read_one(ws: &mut Ws, deadline: Duration) -> ReadOne {
    let start = Instant::now();
    loop {
        if start.elapsed() > deadline {
            return ReadOne::Failed("timeout".into());
        }
        match ws.read() {
            Ok(Message::Text(text)) => return ReadOne::Frame(proto::parse_frame(&text)),
            Ok(Message::Close(frame)) => {
                return ReadOne::Closed(frame.map(|f| f.code.into()));
            }
            Ok(_) => continue,
            Err(tungstenite::Error::Io(e))
                if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut =>
            {
                continue;
            }
            Err(e) => return ReadOne::Failed(e.to_string()),
        }
    }
}

// --- session multiplex -----------------------------------------------------

struct SessionEntry {
    cipher: SessionCipher,
    handle: SessionHandle,
}

/// The steady state: one thread owns the WebSocket and multiplexes
/// inbound frames / outbound queue / reap sweeps. Read timeouts tick the
/// loop (READ_TIMEOUT); all crypto happens here (docs/e2e-protocol.md §4).
fn session_loop(
    ws: &mut Ws,
    sock_opts: &TcpStream,
    identity: &Identity,
    tier_name: &'static str,
    version: &'static str,
    device_name: &Option<String>,
) -> Outcome {
    // The read timeout shrinks from the handshake budget to the tick.
    if let Err(e) = sock_opts.set_read_timeout(Some(READ_TIMEOUT)) {
        eprintln!("rootzd: set read timeout failed: {e}");
        return Outcome::Retry;
    }

    let mut sessions: HashMap<[u8; 16], SessionEntry> = HashMap::new();
    let (out_tx, out_rx): (SyncSender<Outbound>, Receiver<Outbound>) = sync_channel(1024);
    let mut last_sweep = Instant::now();
    let mut window_start = Instant::now();
    let mut sent_in_window: u32 = 0;

    loop {
        // Inbound.
        match ws.read() {
            Ok(Message::Text(text)) => {
                handle_frame(&text, identity, &mut sessions, &out_tx, ws, tier_name, version, device_name);
            }
            Ok(Message::Close(frame)) => {
                eprintln!("rootzd: relay closed (code {:?})", frame.map(|f| f.code.into() as u16));
                return Outcome::Retry;
            }
            Ok(_) => {}
            Err(tungstenite::Error::Io(e))
                if e.kind() == std::io::ErrorKind::WouldBlock || e.kind() == std::io::ErrorKind::TimedOut => {}
            Err(e) => {
                eprintln!("rootzd: relay read failed: {e}");
                return Outcome::Retry;
            }
        }

        // Outbound (pace-capped; docs/e2e-protocol.md §4).
        loop {
            if sent_in_window >= SEND_PACE_PER_SEC {
                let elapsed = window_start.elapsed();
                if elapsed < Duration::from_secs(1) {
                    thread::sleep(Duration::from_secs(1) - elapsed);
                }
                window_start = Instant::now();
                sent_in_window = 0;
            }
            let (sid, inner) = match out_rx.try_recv() {
                Ok(item) => item,
                Err(_) => break,
            };
            let sid_arr: [u8; 16] = match sid.try_into() {
                Ok(a) => a,
                Err(_) => continue,
            };
            let frame = match sessions.get(&sid_arr) {
                Some(entry) => {
                    let (nonce, ct) = entry.cipher.seal(&proto::encode_inner(&inner));
                    Frame::Enc { sid: sid_arr.to_vec(), n: nonce.to_vec(), d: ct }
                }
                // Session already reaped/forgotten — drop its late frames.
                None => continue,
            };
            if ws.send(Message::text(proto::encode_frame(&frame))).is_err() {
                eprintln!("rootzd: relay send failed");
                return Outcome::Retry;
            }
            sent_in_window += 1;
        }
        if window_start.elapsed() >= Duration::from_secs(1) {
            window_start = Instant::now();
            sent_in_window = 0;
        }

        // Reap sweep (~5s cadence): forget finished sessions; reap idle
        // ones (dropping to_stdin EOFs the shell — docs/e2e-protocol.md §4).
        if last_sweep.elapsed() >= Duration::from_secs(5) {
            last_sweep = Instant::now();
            sessions.retain(|sid, entry| {
                if entry.handle.done.load(std::sync::atomic::Ordering::Relaxed) {
                    return false;
                }
                let idle = entry.handle.last_active.lock().map(|t| t.elapsed()).unwrap_or_default();
                if idle >= Duration::from_secs(session::IDLE_REAP_SECS) {
                    eprintln!("rootzd: reaping idle session {}", proto::b64e(sid));
                    return false;
                }
                true
            });
        }
    }
}

fn handle_frame(
    text: &str,
    identity: &Identity,
    sessions: &mut HashMap<[u8; 16], SessionEntry>,
    out_tx: &SyncSender<Outbound>,
    ws: &mut Ws,
    tier_name: &'static str,
    version: &'static str,
    device_name: &Option<String>,
) {
    match proto::parse_frame(text) {
        Frame::Hello { sid, eph } => {
            let sid_arr: [u8; 16] = sid.as_slice().try_into().expect("parse_frame checks sid length");
            if sessions.contains_key(&sid_arr) {
                send_plain(ws, &Frame::Error { sid: Some(sid), error: "session_exists".into() });
                return;
            }
            if sessions.len() >= MAX_SESSIONS {
                send_plain(ws, &Frame::Error { sid: Some(sid), error: "session_limit".into() });
                return;
            }
            let client_eph: [u8; 32] = eph.as_slice().try_into().expect("parse_frame checks eph length");
            let daemon_eph_secret = EphemeralSecret::random_from_rng(OsRng);
            let daemon_eph = X25519Public::from(&daemon_eph_secret).to_bytes();
            let shared = daemon_eph_secret.diffie_hellman(&X25519Public::from(client_eph));
            let key = e2e::derive_key(shared.as_bytes(), &client_eph, &daemon_eph);
            let sig = e2e::sign_transcript(&identity.signing_key, &sid_arr, &client_eph, &daemon_eph);
            send_plain(
                ws,
                &Frame::Welcome { sid: sid.clone(), id: identity.pubkey.to_vec(), eph: daemon_eph.to_vec(), sig: sig.to_vec() },
            );
            let handle = session::spawn(sid, out_tx.clone(), tier_name, version, device_name.clone());
            sessions.insert(sid_arr, SessionEntry { cipher: SessionCipher::new(&key), handle });
            eprintln!("rootzd: session {} up ({} live)", proto::b64e(&sid_arr), sessions.len());
        }
        Frame::Enc { sid, n, d } => {
            let sid_arr: [u8; 16] = match sid.try_into() {
                Ok(a) => a,
                Err(_) => return,
            };
            let entry = match sessions.get(&sid_arr) {
                Some(e) => e,
                None => return,
            };
            let nonce: [u8; 12] = match n.try_into() {
                Ok(a) => a,
                Err(_) => return,
            };
            // Authentication failure aborts the session (docs/e2e-protocol.md §2.4).
            let plaintext = match entry.cipher.open(&nonce, &d) {
                Some(p) => p,
                None => {
                    eprintln!("rootzd: session {}: enc auth failure — reaping", proto::b64e(&sid_arr));
                    sessions.remove(&sid_arr);
                    return;
                }
            };
            let (inner, dbytes) = match proto::parse_inner(&plaintext) {
                Some(v) => v,
                None => return,
            };
            if let Some(t) = entry.handle.last_active.lock().ok() {
                *t = Instant::now();
            }
            match inner {
                Inner::Stdin { .. } => {
                    if let Some(bytes) = dbytes {
                        let _ = entry.handle.to_stdin.send(bytes);
                    }
                }
                // Authenticated close: reap (docs/e2e-protocol.md §3).
                Inner::Close => {
                    eprintln!("rootzd: session {} closed by client", proto::b64e(&sid_arr));
                    sessions.remove(&sid_arr);
                }
                _ => {} // client->daemon carries stdin/close only; ignore the rest
            }
        }
        Frame::Authed | Frame::Other | Frame::Welcome { .. } | Frame::Error { .. } => {}
    }
}

fn send_plain(ws: &mut Ws, frame: &Frame) {
    // Best effort: handshake-phase frames; a failure here surfaces as a
    // broken tunnel on the next read/send anyway.
    let _ = ws.send(Message::text(proto::encode_frame(frame)));
}
