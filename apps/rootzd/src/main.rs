//! rootzd — the Rootz daemon: a Rust daemon that runs on a rooted Android
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
//! Transport: outbound tunnel to the relay (primary, stub) + local listener
//! (fallback + dev). Default bind is 127.0.0.1 — reach it from the host with
//! `adb forward tcp:7357 tcp:7357`. ROOTZD_LAN_BIND=0.0.0.0 exposes it on the
//! LAN: DANGEROUS until the pairing/security pass (there is no auth yet).
//!
//! Terminal v0.1: piped /system/bin/sh per connection. std-only by design so
//! the first remote build needs no crates.io access; a real PTY (libc
//! forkpty) lands in v0.2. Security pass (pairing, E2E crypto, kill switch,
//! audit log) is NOT in this build.

use std::{
    env, fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    process::{self, Command, Stdio},
    thread,
    time::Duration,
};

#[derive(Debug, PartialEq)]
enum Tier {
    Root,
    Shell,
    App,
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

fn pump<R: Read, W: Write>(mut from: R, to: &mut W) {
    let mut buf = [0u8; 4096];
    loop {
        match from.read(&mut buf) {
            Ok(0) | Err(_) => break,
            Ok(n) => {
                if to.write_all(&buf[..n]).is_err() {
                    break;
                }
            }
        }
    }
}

/// Bridge one TCP connection to a piped /system/bin/sh (terminal v0.1).
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

fn main() {
    let t = tier();
    eprintln!("rootzd: starting, tier={t:?}");
    if t == Tier::Shell {
        eprintln!("rootzd: shell tier cannot persist across reboots (restart via adb)");
    }

    // Primary transport: dial OUTBOUND to the relay.
    // TODO(security): mTLS or Noise session, pairing-bound device key, reconnect
    // backoff, kill-switch handling on remote revoke.
    if let Ok(relay) = env::var("ROOTZD_RELAY") {
        thread::spawn(move || loop {
            eprintln!("rootzd: relay dial-out stub -> {relay}");
            thread::sleep(Duration::from_secs(30));
        });
    }

    // Fallback + dev transport: local listener, localhost by default.
    let bind = env::var("ROOTZD_LAN_BIND").unwrap_or_else(|_| "127.0.0.1".into());
    let port: u16 = env::var("ROOTZD_LAN_PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(7357);
    let listener = TcpListener::bind((bind.as_str(), port)).unwrap_or_else(|e| {
        eprintln!("rootzd: bind failed on {bind}:{port}: {e}");
        process::exit(1);
    });
    eprintln!("rootzd: terminal listening on {bind}:{port}");
    for conn in listener.incoming() {
        match conn {
            Ok(c) => {
                thread::spawn(move || handle_terminal(c));
            }
            Err(e) => eprintln!("rootzd: accept error: {e}"),
        }
    }
}
