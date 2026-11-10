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

fn tier() -> Tier {
    // SAFETY: getuid is always safe.
    match unsafe { libc::getuid() } {
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
fn handle_terminal(stream: TcpStream) {
    let spawn_result = Command::new("/system/bin/sh")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn();

    let mut child = match spawn_result {
        Ok(c) => c,
        Err(e) => {
            eprintln!("rootzd: shell spawn failed: {e}");
            return;
        }
    };

    let mut shell_in = child.stdin.take().expect("piped stdin");
    let shell_out = child.stdout.take().expect("piped stdout");
    let shell_err = child.stderr.take().expect("piped stderr");

    let mut conn_in = match stream.try_clone() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("rootzd: stream clone failed: {e}");
            let _ = child.kill();
            return;
        }
    };
    let mut conn_out = stream;
    let mut conn_err = match stream.try_clone() {
        Ok(s) => s,
        Err(e) => {
            eprintln!("rootzd: stream clone failed: {e}");
            let _ = child.kill();
            return;
        }
    };

    // connection -> shell
    let stdin_pump = thread::spawn(move || {
        pump(&mut conn_in, &mut shell_in);
        // Client disconnected: close shell stdin so the shell exits.
    });

    // shell -> connection (stdout and stderr on separate clones of the socket
    // so a blocked reader on one doesn't stall the other)
    let stdout_pump = thread::spawn(move || pump(&mut shell_out, &mut conn_out));
    let stderr_pump = thread::spawn(move || pump(&mut shell_err, &mut conn_err));

    // Reap the shell when it exits. The watchdog joins on the OUTPUT pumps
    // (stdout+stderr EOF) — not stdin — so a half-close from the client
    // doesn't kill a long-running command that's still producing output.
    // NOTE: this waits for BOTH pipes to EOF. `nc` on the host may hold the
    // socket open briefly after the shell dies; the client observes a clean
    // EOF regardless. Closing ONE side (client or shell) must NOT kill the
    // session — e.g. `cat | grep x` needs stdin EOF while output continues.
    let watchdog = thread::spawn(move || {
        let _ = stdout_pump.join();
        let _ = stderr_pump.join();
        // The shell is dead (both pipes EOF'd) — kill and reap it.
        let _ = child.kill();
        let _ = child.wait();
        eprintln!("rootzd: shell exited and reaped");
        drop(stdin_pump); // detach; its thread ends when the socket closes
    });
    drop(watchdog); // detach watchdog; it cleans up asynchronously
}

fn pump(from: &mut impl Read, to: &mut impl Write) {
    let mut buf = [0u8; 8192];
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
