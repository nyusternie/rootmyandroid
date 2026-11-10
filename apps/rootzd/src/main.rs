//! src/main.rs — rootzd, the Rootz daemon: a Rust daemon that runs on a rooted Android
//! device. The Rootz PRO professional tools (Terminal Editor, Log Analysis)
//! attach to this daemon. v1 scope is owned by the daemon team (owner ruling
//! 2026-11-07). Binary renamed `rootz` -> `rootzd` (owner ruling 2026-11-08,
//! superseding the 2026-11-07 name freeze): the Rootz brand moves to the
//! no-wipe APK product; the daemon carries the conventional d-suffix.
//!
//! Tiers (detected from our own uid):
//!   root  (uid 0)    — started via `su`, persistable (service.d)      [TODO: verify per root method]
//!   shell (uid 2000) — started via `adb shell`, NOT persistable       [Shizuku-style exec]
//!   app   (other)    — embedded in the Android-edition app, sandboxed [fallback]
//!
//! Transports:
//!   1. Relay tunnel (primary, since v26.11.9): outbound wss:// to
//!      relay.rootmyandroid.com/tunnel — challenge-response auth (Ed25519
//!      device identity, docs/relay-handoff.md §2) carrying E2E-encrypted
//!      client sessions (docs/e2e-protocol.md). Env overrides for dev:
//!      ROOTZD_API / ROOTZD_RELAY / ROOTZD_ACCOUNT / ROOTZD_STATE_DIR.
//!   2. Local listener (fallback + dev): default bind 127.0.0.1:7357 —
//!      reach it from the host with `adb forward tcp:7357 tcp:7357`.
//!      ROOTZD_LAN_BIND=0.0.0.0 exposes it on the LAN: DANGEROUS — the LAN
//!      listener still has NO AUTH.
//!
//! Terminal: piped /system/bin/sh per connection/session (since v26.11.8).
//! A real PTY (libc forkpty) lands in a later release (was planned for
//! v0.2/v26.11.9 — deferred). Remaining security-pass items NOT in this
//! build: the audit log, and an operator-facing revoke path (the kill
//! switch itself IS honored — docs/e2e-protocol.md §5 — but the API
//! endpoint is still open: docs/relay-api-todo-2026-11-10.md).

mod e2e;
mod identity;
mod proto;
mod relay;
mod session;

use std::fs;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::process::{Command, Stdio};
use std::thread;

#[derive(Debug, PartialEq, Clone, Copy)]
enum Tier {
    Root,
    Shell,
    App,
}

impl Tier {
    /// The tier label sent in session_info (docs/e2e-protocol.md §3).
    fn as_str(self) -> &'static str {
        match self {
            Tier::Root => "root",
            Tier::Shell => "shell",
            Tier::App => "app",
        }
    }
}

/// No libc dependency: read our own uid from procfs.
fn tier() -> Tier {
    let status = fs::read_to_string("/proc/self/status").unwrap_or_default();
    let uid = status
        .lines()
        .find_map(|l| l.strip_prefix("Uid:"))
        .and_then(|l| l.split_whitespace().next())
        .and_then(|n| n.parse::<u32>().ok())
        .unwrap_or(u32::MAX);
    match uid {
        0 => Tier::Root,
        2000 => Tier::Shell,
        _ => Tier::App,
    }
}

fn main() {
    let t = tier();
    eprintln!("rootzd: starting, tier={t:?}");

    // Device identity (v26.11.9): Ed25519 keypair persisted in the state
    // dir; its derived device_id is the pairing + relay address.
    let identity = match identity::load_or_generate() {
        Ok(id) => {
            eprintln!("rootzd: device_id={}", id.device_id);
            Some(id)
        }
        Err(e) => {
            // The relay lane is impossible without a stable identity; the
            // local listener below still works.
            eprintln!("rootzd: identity unavailable ({e}) — relay tunnel disabled");
            None
        }
    };

    if t == Tier::Shell {
        eprintln!("rootzd: shell tier cannot persist across reboots (restart via adb)");
    }

    // Primary transport: relay tunnel client (docs/relay-handoff.md,
    // docs/e2e-protocol.md). One thread; backoff/reconnect inside.
    if let Some(id) = identity {
        let cfg = relay::RelayConfig::from_env();
        thread::spawn(move || relay::run(cfg, id, t.as_str(), env!("CARGO_PKG_VERSION")));
    }

    // Fallback transport (dev / no-network): plain TCP shell, same bridge as
    // the relay sessions.
    let bind = std::env::var("ROOTZD_LAN_BIND").unwrap_or_else(|_| "127.0.0.1".into());
    let addr = format!("{bind}:7357");
    let listener = match TcpListener::bind(&addr) {
        Ok(l) => l,
        Err(e) => {
            eprintln!("rootzd: bind {addr} failed: {e}");
            std::process::exit(1);
        }
    };
    eprintln!("rootzd: listening on {addr}");

    for stream in listener.incoming() {
        match stream {
            Ok(s) => {
                thread::spawn(|| handle_terminal(s));
            }
            Err(e) => eprintln!("rootzd: accept failed: {e}"),
        }
    }
}

/// piped shell bridge: connection <-> /system/bin/sh with stdin/stdout/stderr
/// pipes. A PTY (libc forkpty) is the planned upgrade — see the crate docs.
fn handle_terminal(conn: TcpStream) {
    let mut child = match Command::new("/system/bin/sh")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
    {
        Ok(c) => c,
        Err(e) => {
            eprintln!("rootzd: shell spawn failed: {e}");
            return;
        }
    };
    let mut shell_in = child.stdin.take().expect("piped stdin");
    let shell_out = child.stdout.take().expect("piped stdout");
    let shell_err = child.stderr.take().expect("piped stderr");

    let mut rx = match conn.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    let mut tx_out = match conn.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };
    let mut tx_err = match conn.try_clone() {
        Ok(s) => s,
        Err(_) => return,
    };

    // socket -> shell stdin
    let stdin_pump = thread::spawn(move || loop {
        let mut buf = [0u8; 4096];
        match rx.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if shell_in.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
        }
    });
    // shell stdout -> socket
    let out_pump = thread::spawn(move || pump(shell_out, &mut tx_out));
    // shell stderr -> socket (merged into the same stream; the v0.2 PTY makes
    // this a real tty where stderr separation no longer matters)
    let err_pump = thread::spawn(move || pump(shell_err, &mut tx_err));

    let _ = out_pump.join();
    let _ = err_pump.join();
    // The shell is dead (both pipes EOF'd). shutdown() is SOCKET-level: it
    // unblocks stdin_pump's rx.read() even when the client keeps its side
    // open (the Rootz app client reads until EOF and never half-closes), so
    // every clone of this socket can close and the client observes a clean
    // EOF. Without this, wait-for-EOF clients deadlock against stdin_pump
    // (found by the Rootz MVP integration test on redfin).
    let _ = conn.shutdown(std::net::Shutdown::Both);
    drop(conn);
    let _ = child.kill();
    let _ = child.wait();
    drop(stdin_pump);
}

fn pump<R: Read, W: Write>(mut from: R, to: &mut W) {
    let mut buf = [0u8; 4096];
    loop {
        match from.read(&mut buf) {
            Ok(0) => break, // EOF
            Ok(n) => {
                if to.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
            Err(_) => break,
        }
    }
}
