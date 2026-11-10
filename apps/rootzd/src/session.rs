//! src/session.rs — one E2E session = one piped /system/bin/sh, the same
//! bridge as the v26.11.8 TCP terminal (crate::pump / handle_terminal),
//! with the relay-encrypted channel instead of a socket. Pump threads push
//! plaintext inner frames onto the daemon's bounded outbound queue (the
//! daemon's single WS pump thread encrypts — docs/e2e-protocol.md §4) —
//! a full queue blocks the pump, so backpressure reaches the shell's pipe
//! buffers and nothing is ever buffered unboundedly.

use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, Sender, SyncSender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Instant;

use crate::proto::Inner;

/// Reaped by the daemon's WS pump thread after this much inbound silence
/// (docs/e2e-protocol.md §4).
pub const IDLE_REAP_SECS: u64 = 600;

pub struct SessionHandle {
    /// Client stdin bytes (decrypted) — the session's stdin thread owns
    /// the receiving end. Dropping this (reap / teardown) closes the
    /// shell's stdin pipe: /system/bin/sh EOF-exits (the v26.11.8 TCP
    /// terminal relies on the same semantics).
    pub to_stdin: Sender<Vec<u8>>,
    pub last_active: Arc<Mutex<Instant>>,
    /// Set by the session's watchdog once the shell is reaped and the
    /// exit frame has been queued; the daemon then forgets the session.
    pub done: Arc<AtomicBool>,
}

/// Outbound queue item: (sid, plaintext inner frame) — encrypted by the
/// daemon's WS pump thread.
pub type Outbound = (Vec<u8>, Inner);

pub fn spawn(
    sid: Vec<u8>,
    outbound: SyncSender<Outbound>,
    tier_name: &'static str,
    version: &'static str,
    device_name: Option<String>,
) -> SessionHandle {
    let (to_stdin, stdin_rx) = sync_channel::<Vec<u8>>(64);
    let last_active = Arc::new(Mutex::new(Instant::now()));
    let done = Arc::new(AtomicBool::new(false));

    let spawn_result = Command::new("/system/bin/sh").stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn();
    let mut child = match spawn_result {
        Ok(c) => c,
        Err(e) => {
            eprintln!("rootzd: session shell spawn failed: {e}");
            // Tell the client the session is over, then mark done — the
            // daemon forgets it on the next reap sweep.
            let _ = outbound.try_send((sid, Inner::Exit { code: None }));
            done.store(true, Ordering::Relaxed);
            return SessionHandle { to_stdin, last_active, done };
        }
    };

    let mut shell_in = child.stdin.take().expect("piped stdin");
    let shell_out = child.stdout.take().expect("piped stdout");
    let shell_err = child.stderr.take().expect("piped stderr");

    // session_info is the FIRST inner frame per session (docs/e2e-protocol.md §3).
    let _ = outbound.try_send((
        sid.clone(),
        Inner::SessionInfo { name: device_name, tier: tier_name.to_string(), version: version.to_string() },
    ));

    // client stdin -> shell
    thread::spawn(move || stdin_loop(stdin_rx, &mut shell_in));

    // shell stdout/stderr -> outbound queue (backpressure: sync_channel blocks)
    let out_sid = sid.clone();
    let out_tx = outbound.clone();
    let out_done = done.clone();
    let out_pump = thread::spawn(move || pump_loop(shell_out, &out_sid, &out_tx, false, &out_done));
    let err_sid = sid.clone();
    let err_tx = outbound.clone();
    let err_done = done.clone();
    let err_pump = thread::spawn(move || pump_loop(shell_err, &err_sid, &err_tx, true, &err_done));

    // Watchdog: parity with handle_terminal — once BOTH pipes EOF the
    // shell is dead (closing one side must NOT kill a session mid-command,
    // e.g. `cat | grep x`); reap it and queue the exit frame.
    let wd_done = done;
    thread::spawn(move || {
        let _ = out_pump.join();
        let _ = err_pump.join();
        let code = child.wait().ok().and_then(|s| s.code());
        let _ = child.kill(); // defensive; already reaped
        eprintln!("rootzd: session shell exited (code {code:?})");
        // Best effort: the queue (or its receiver) may already be gone if
        // the tunnel dropped first.
        let _ = outbound.try_send((sid, Inner::Exit { code }));
        wd_done.store(true, Ordering::Relaxed);
    });

    SessionHandle { to_stdin, last_active, done }
}

fn stdin_loop(rx: Receiver<Vec<u8>>, shell_in: &mut impl std::io::Write) {
    use std::io::Write as _;
    while let Ok(bytes) = rx.recv() {
        if shell_in.write_all(&bytes).is_err() {
            break; // shell died — watchdog reaps
        }
    }
    // rx closed (reap/teardown): dropping shell_in here EOFs the shell.
}

fn pump_loop(
    mut reader: impl std::io::Read,
    sid: &[u8],
    tx: &SyncSender<Outbound>,
    is_err: bool,
    done: &AtomicBool,
) {
    let mut buf = [0u8; crate::proto::MAX_INNER_CHUNK];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => break, // EOF — the shell exited
            Ok(n) => {
                let frame = if is_err { Inner::stderr(&buf[..n]) } else { Inner::stdout(&buf[..n]) };
                if tx.send((sid.to_vec(), frame)).is_err() {
                    break; // daemon WS pump thread gone (tunnel dropped)
                }
            }
            Err(_) if done.load(Ordering::Relaxed) => break,
            Err(_) => break, // read error: end the pump; watchdog reaps
        }
    }
}
