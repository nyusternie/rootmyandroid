// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/RelayDaemon.kt
package com.rootmyandroid.rootz

import android.content.Context
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URL
import java.security.SecureRandom
import java.util.ArrayDeque
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.RejectedExecutionException
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import javax.net.ssl.HttpsURLConnection

/**
 * The relay DAEMON lane (owner ruling 2026-11-11: the Rootz APK IS the
 * daemon on non-rooted phones — the device lane). Kotlin mirror of
 * rootzd's relay.rs: pair once per account (POST /v1/relay/devices,
 * marker file in filesDir/relay/paired), then loop
 * challenge (POST /v1/relay/challenge) → wss dial-out → first-message
 * auth → E2E session multiplex (e2e-protocol.md §0/§4).
 *
 * Execution semantics (DIVERGENCE from rootzd, documented honestly):
 * rootzd pipes one persistent /system/bin/sh per session; the APK daemon
 * runs each stdin command LINE as a one-shot through the app's existing
 * wireless-ADB loop (AdbConnection — uid 2000, owner ruling 2026-11-11).
 * A local Runtime sh would execute as the app's own sandboxed uid — a
 * DIFFERENT, lesser privilege than the advertised "shell" tier — so the
 * wireless-ADB path is the only honest executor. Consequence: sessions
 * are stateless per line (no cwd/env persistence across commands).
 *
 * stdin semantics: newline-terminated command lines (the /terminal web
 * client sends one frame per "cmd\n"). A trailing '\r' is stripped;
 * keystroke-streaming clients are unsupported — same as rootzd's piped
 * sh, which would treat a bare '\r' as a literal byte. A line that is
 * exactly `exit` (trimmed) maps rootzd's persistent-sh death onto the
 * one-shot model: emit exit{code:0} and close the session server-side
 * (owner ruling 2026-11-11); lines merely CONTAINING exit stay ordinary
 * one-shot text (no shell-grammar parsing, rule 3).
 *
 * CommandGuard (A6): every inbound line passes guard.decisionFor BEFORE
 * execution. allow → execute; anything gated is REFUSED with an stderr
 * frame + an on-device receipt line — interactive approval of remote
 * commands is a later build (repo rule 6: the guard never executes a
 * gated command without the device holder).
 *
 * Threading: a single-thread ScheduledExecutorService is the event loop —
 * WsClient reader-thread callbacks are posted onto it, so sessions /
 * backoff / pacing state are only ever touched on that one thread. Per-
 * session single-thread workers run the ADB round-trips (ordered per
 * session, like rootzd's sh) and push plaintext inner frames onto the
 * synchronized outbound deque; the event loop's 50 ms drain encrypts +
 * sends them (pacing 90/s, under the relay's 100/s cap — spec §0).
 * [onStatus]/[onReceipt] fire from background threads — the caller posts
 * to the UI thread itself.
 *
 * Reconnect: exponential backoff 1 s → 60 s (+0–250 ms jitter), reset on
 * `authed` (relay.rs). Kill switch: pairing/challenge 403 or close 4403
 * (revoked) parks the lane; pairing 409 (key bound to another account)
 * parks it as operator-fatal. [start] after [stop] is an explicit user
 * restart and clears the park.
 */
internal class RelayDaemon(
    private val context: Context,
    private val account: String,
    private val identity: RelayIdentity,
    private val tier: String,
    private val version: String,
    private val deviceName: String?,
    private val adbWifi: AdbWifiDiscovery,
    private val guard: CommandGuard,
    private val onStatus: (String) -> Unit,
    private val onReceipt: (String) -> Unit,
) {

    private class SessionEntry(
        val session: E2eSession.DaemonSession,
        @Volatile var lastActiveMs: Long,
        val stdinBuf: ByteArrayOutputStream = ByteArrayOutputStream(),
        val worker: ExecutorService = Executors.newSingleThreadExecutor { r ->
            Thread(r).apply { isDaemon = true; name = "relay-session" }
        },
    ) {
        /** Set by the exact-exit path (owner ruling 2026-11-11): the exit
         *  frame must drain BEFORE the session is removed — the drain drops
         *  frames for unknown sessions. Further stdin is dropped meanwhile
         *  (rootzd parity: stdin after sh death goes nowhere). */
        @Volatile var closing = false
    }

    private val random = SecureRandom()
    private val outbound = ArrayDeque<Pair<String, ByteArray>>()
    private val sessions = LinkedHashMap<String, SessionEntry>()

    private var executor: ScheduledExecutorService? = null
    private var ws: WsClient? = null
    private var pendingAuth: String? = null

    @Volatile private var started = false
    @Volatile private var stopped = false
    @Volatile private var parked = false

    private var backoffMs = BACKOFF_INIT_MS
    private var windowStartMs = 0L
    private var sentInWindow = 0
    private var lastSweepMs = 0L

    // --- lifecycle ---------------------------------------------------------------

    fun start() {
        if (started) return
        started = true
        stopped = false
        parked = false
        backoffMs = BACKOFF_INIT_MS
        val loop = Executors.newSingleThreadScheduledExecutor { r ->
            Thread(r).apply { isDaemon = true; name = "relay-daemon" }
        }
        executor = loop
        loop.execute { connectLane() }
        loop.scheduleWithFixedDelay(
            { drainAndSweep() },
            DRAIN_INTERVAL_MS,
            DRAIN_INTERVAL_MS,
            TimeUnit.MILLISECONDS,
        )
    }

    /** Full teardown: tunnel closed, sessions + queues dropped, event loop
     *  shut down. [start] afterwards is an explicit user restart. */
    fun stop() {
        if (!started) return
        stopped = true
        started = false
        teardownTunnel()
        executor?.shutdown()
        executor = null
    }

    // --- tunnel connection (event-loop thread) -------------------------------------

    private fun connectLane() {
        if (stopped || parked) return
        onStatus("relay: pairing…")
        when (ensurePaired()) {
            is PostOutcome.Retry -> return scheduleRetry("relay: pairing failed")
            PostOutcome.Revoked ->
                return park("relay: the account revoked this device (403) — unpair it in account settings to reuse this identity")
            PostOutcome.FatalConfig ->
                return park("relay: this device identity is paired to another account (409) — delete app data to mint a new one")
            is PostOutcome.Ok -> Unit
        }
        if (stopped || parked) return
        onStatus("relay: authorizing…")
        val challengeBody = when (val out = fetchChallenge()) {
            is PostOutcome.Retry -> return scheduleRetry("relay: challenge failed")
            PostOutcome.Revoked ->
                return park("relay: the account revoked this device (403) — unpair it in account settings to reuse this identity")
            PostOutcome.FatalConfig ->
                return park("relay: this device identity is paired to another account (409) — delete app data to mint a new one")
            is PostOutcome.Ok -> out.body
        }
        val challenge = try {
            JSONObject(challengeBody).getString("challenge")
        } catch (e: Exception) {
            return scheduleRetry("relay: malformed challenge response")
        }
        val challengeBytes = E2eSession.decodeAnyB64(challenge)
        if (challengeBytes == null || challengeBytes.size != 32) {
            return scheduleRetry("relay: challenge is not 32 bytes")
        }
        if (stopped || parked) return
        pendingAuth = JSONObject()
            .put("type", "auth")
            .put("device_id", identity.deviceId)
            .put("challenge", challenge) // echo the API's string verbatim
            .put("signature", E2eSession.B64.encode(identity.sign(challengeBytes)))
            .toString()
        onStatus("relay: connecting…")
        val socket = WsClient(RELAY_HOST, "/tunnel?device=${identity.deviceId}")
        ws = socket
        socket.connect(listener)
    }

    private val listener = object : WsClient.Listener {
        override fun onOpen() = post {
            val auth = pendingAuth ?: return@post
            pendingAuth = null
            try {
                ws?.send(auth)
            } catch (e: Exception) {
                teardownTunnel()
                scheduleRetry("relay: auth send failed")
            }
        }

        override fun onMessage(text: String) = post { handleFrame(text) }

        override fun onClosed(code: Int, reason: String) = post {
            teardownTunnel()
            if (code == CLOSE_REVOKED) {
                park("relay: the account revoked this device (4403) — unpair it in account settings to reuse this identity")
            } else {
                scheduleRetry("relay: tunnel closed ($code${if (reason.isNotEmpty()) ": $reason" else ""})")
            }
        }

        override fun onFailure(error: Exception) = post {
            teardownTunnel()
            scheduleRetry("relay: tunnel failed (${error.message ?: error.javaClass.simpleName})")
        }
    }

    private fun post(block: () -> Unit) {
        try {
            executor?.execute { block() }
        } catch (_: RejectedExecutionException) {
            // Event loop already shut down (stop raced a callback).
        }
    }

    /** Sessions and queued frames are bound to the tunnel's lifetime (the
     *  client re-hellos after a reconnect — e2e-protocol.md §4). */
    private fun teardownTunnel() {
        try {
            ws?.close()
        } catch (_: Exception) {
            // Already gone — nothing left to do.
        }
        ws = null
        pendingAuth = null
        sessions.values.forEach { it.worker.shutdownNow() }
        sessions.clear()
        synchronized(outbound) { outbound.clear() }
    }

    private fun scheduleRetry(why: String) {
        if (stopped || parked) return
        val delay = backoffMs + random.nextLong(JITTER_MAX_MS + 1)
        onStatus("$why — retrying in ${delay / 1000 + 1}s")
        backoffMs = (backoffMs * 2).coerceAtMost(BACKOFF_MAX_MS)
        try {
            executor?.schedule({ connectLane() }, delay, TimeUnit.MILLISECONDS)
        } catch (_: RejectedExecutionException) {
            // Event loop already shut down.
        }
    }

    private fun park(message: String) {
        parked = true
        teardownTunnel()
        onStatus(message)
    }

    // --- session multiplex (event-loop thread) --------------------------------------

    private fun handleFrame(text: String) {
        when (val frame = E2eSession.parseFrame(text)) {
            is E2eSession.Frame.Hello -> onHello(frame)
            is E2eSession.Frame.Enc -> onEnc(frame)
            E2eSession.Frame.Authed -> {
                backoffMs = BACKOFF_INIT_MS
                onStatus("relay: up — device reachable through the relay ✓")
                onReceipt("✓ relay tunnel authenticated (device ${identity.deviceId.take(12)}…)")
            }
            else -> Unit // Welcome/Err/Other: daemon-originated or noise — ignored
        }
    }

    private fun onHello(hello: E2eSession.Frame.Hello) {
        val sidKey = E2eSession.B64.encode(hello.sid)
        if (sessions.containsKey(sidKey)) {
            enqueueInnerRaw(sidKey, E2eSession.encodeError(hello.sid, "session_exists").toByteArray(Charsets.UTF_8))
            return
        }
        if (sessions.size >= MAX_SESSIONS) {
            enqueueInnerRaw(sidKey, E2eSession.encodeError(hello.sid, "session_limit").toByteArray(Charsets.UTF_8))
            return
        }
        val session = E2eSession.newDaemonSession(
            sid = hello.sid,
            clientEph = hello.eph,
            identitySeed = identity.seed,
            identityPub = identity.pubkey,
        )
        sessions[sidKey] = SessionEntry(session, nowMs())
        // welcome goes out unencrypted FIRST (the client derives the session
        // key from it); session_info is the first ENCRYPTED inner frame
        // (e2e-protocol.md §2.2/§3) — enqueued, sent by the 50 ms drain.
        try {
            ws?.send(session.welcomeJson)
        } catch (e: Exception) {
            sessions.remove(sidKey)?.worker?.shutdownNow()
            teardownTunnel()
            scheduleRetry("relay: welcome send failed")
            return
        }
        enqueueInner(sidKey, E2eSession.encodeInnerSessionInfo(deviceName, tier, version))
        onReceipt("✓ relay session opened (${sessions.size} active)")
    }

    private fun onEnc(frame: E2eSession.Frame.Enc) {
        val sidKey = E2eSession.B64.encode(frame.sid)
        val entry = sessions[sidKey] ?: return // unknown sid: drop (relay.rs parity)
        if (entry.closing) return // exit already queued: the session is over
        when (val inner = entry.session.openInner(frame)) {
            null -> removeSession(sidKey) // AEAD auth failure: reap the session (spec §2.4)
            is E2eSession.Inner.Stdin -> {
                entry.lastActiveMs = nowMs()
                feedStdin(sidKey, entry, inner.d)
            }
            E2eSession.Inner.Close -> removeSession(sidKey) // client closed: silent teardown
            else -> Unit // stdout/stderr/exit/session_info/Other: daemon-originated — ignored
        }
    }

    private fun removeSession(sidKey: String) {
        sessions.remove(sidKey)?.worker?.shutdownNow()
    }

    /** Buffer inbound bytes; run each complete '\n'-terminated line. */
    private fun feedStdin(sidKey: String, entry: SessionEntry, bytes: ByteArray) {
        entry.stdinBuf.write(bytes)
        val buf = entry.stdinBuf.toByteArray()
        var start = 0
        for (i in buf.indices) {
            if (buf[i] != 0x0A.toByte()) continue // '\n' never appears inside a UTF-8 multibyte sequence
            var end = i
            if (end > start && buf[end - 1] == 0x0D.toByte()) end-- // strip one trailing '\r'
            val line = String(buf, start, end - start, Charsets.UTF_8)
            if (line.isNotBlank()) execLine(sidKey, line)
            start = i + 1
        }
        entry.stdinBuf.reset()
        if (start < buf.size) entry.stdinBuf.write(buf, start, buf.size - start)
    }

    // --- command execution (session worker threads) -----------------------------------

    private fun execLine(sidKey: String, line: String) {
        val decision = guard.decisionFor(line)
        if (!decision.allow) {
            enqueueInner(
                sidKey,
                E2eSession.encodeInnerStderr(
                    (
                        "blocked by on-device CommandGuard (risk: ${decision.risk}) — gated " +
                            "commands need the device holder's interactive approval (a later build)\n"
                        ).toByteArray(Charsets.UTF_8),
                ),
            )
            onReceipt("! relay-daemon blocked: $line")
            return
        }
        if (line.trim() == "exit") { // owner ruling 2026-11-11 — see class doc
            enqueueInner(sidKey, E2eSession.encodeInnerExit(0))
            sessions[sidKey]?.closing = true // drain sends exit, THEN removes
            return
        }
        val endpoint = adbWifi.connectEndpoint
        if (endpoint == null) {
            enqueueInner(
                sidKey,
                E2eSession.encodeInnerStderr(
                    "wireless adb not ready on the device — open Rootz and wait for \"wireless adb: ready\"\n"
                        .toByteArray(Charsets.UTF_8),
                ),
            )
            return
        }
        val worker = sessions[sidKey]?.worker ?: return
        try {
            worker.execute {
                val output = try {
                    AdbConnection(endpoint.first, endpoint.second, AdbKeyStore.get(context)).runShell(line).output
                } catch (e: Exception) {
                    enqueueInner(
                        sidKey,
                        E2eSession.encodeInnerStderr(
                            "adb exec failed: ${e.message ?: e.javaClass.simpleName}\n".toByteArray(Charsets.UTF_8),
                        ),
                    )
                    return@execute
                }
                val bytes = output.toByteArray(Charsets.UTF_8)
                var off = 0
                while (bytes.size - off > 0) {
                    val end = (off + E2eSession.MAX_INNER_CHUNK).coerceAtMost(bytes.size)
                    enqueueInner(sidKey, E2eSession.encodeInnerStdout(bytes.copyOfRange(off, end)))
                    off = end
                }
            }
        } catch (_: RejectedExecutionException) {
            // Session reaped between enqueue and execute — drop the work.
        }
    }

    // --- outbound drain + idle reaper (event-loop thread, every 50 ms) ------------------

    private fun drainAndSweep() {
        if (stopped || parked) return
        val now = nowMs()
        if (now - windowStartMs >= 1000) {
            windowStartMs = now
            sentInWindow = 0
        }
        while (sentInWindow < SEND_PACE_PER_SEC) {
            val (sidKey, inner) = synchronized(outbound) {
                if (outbound.isEmpty()) null else outbound.pollFirst()
            } ?: break
            val socket = ws ?: break
            // Raw queued items are already-complete wire frames (the pre-
            // session error frames) — no session exists to seal them with.
            if (inner.isNotEmpty() && inner[0] == RAW_FRAME_SENTINEL[0]) {
                try {
                    socket.send(String(inner, RAW_FRAME_SENTINEL.size, inner.size - RAW_FRAME_SENTINEL.size, Charsets.UTF_8))
                } catch (e: Exception) {
                    teardownTunnel()
                    scheduleRetry("relay: send failed")
                    return
                }
                sentInWindow++
                continue
            }
            val entry = sessions[sidKey] ?: continue // session reaped before drain: drop
            try {
                socket.send(entry.session.sealInner(inner))
            } catch (e: Exception) {
                teardownTunnel()
                scheduleRetry("relay: send failed")
                return
            }
            sentInWindow++
            if (entry.closing) sessions.remove(sidKey)?.worker?.shutdownNow()
        }
        if (now - lastSweepMs >= SWEEP_INTERVAL_MS) {
            lastSweepMs = now
            sessions.entries.removeIf { now - it.value.lastActiveMs > IDLE_REAP_MS }
        }
    }

    private fun enqueueInner(sidKey: String, innerJson: ByteArray) {
        synchronized(outbound) { outbound.addLast(sidKey to innerJson) }
    }

    /** Queue an already-complete (unencrypted) wire frame — the session-limit
     *  errors that must reach the client before any session exists. */
    private fun enqueueInnerRaw(sidKey: String, frameJson: ByteArray) {
        synchronized(outbound) { outbound.addLast(sidKey to (RAW_FRAME_SENTINEL + frameJson)) }
    }

    // --- HTTP (pairing + challenge — rootmyandroid-api contract, handoff §1) -----------

    private sealed class PostOutcome {
        data class Ok(val body: String) : PostOutcome()
        object Retry : PostOutcome()
        object Revoked : PostOutcome()
        object FatalConfig : PostOutcome()
    }

    private fun ensurePaired(): PostOutcome {
        val marker = File(File(context.filesDir, "relay"), "paired")
        val saved = if (marker.isFile) marker.readText().trimEnd('\n') else null
        if (saved == account) return PostOutcome.Ok("")
        val out = postJson(
            "/relay/devices",
            JSONObject()
                .put("account_number", account)
                .put("device_pubkey", E2eSession.B64.encode(identity.pubkey)),
        )
        if (out is PostOutcome.Ok) marker.writeText("$account\n")
        return out
    }

    private fun fetchChallenge(): PostOutcome =
        postJson(
            "/relay/challenge",
            JSONObject()
                .put("account_number", account)
                .put("device_id", identity.deviceId),
        )

    private fun postJson(path: String, body: JSONObject): PostOutcome {
        val conn = try {
            (URL(API_BASE + path).openConnection() as HttpsURLConnection).apply {
                connectTimeout = HTTP_TIMEOUT_MS
                readTimeout = HTTP_TIMEOUT_MS
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/json")
                doOutput = true
            }
        } catch (e: Exception) {
            return PostOutcome.Retry
        }
        return try {
            conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
            when (conn.responseCode) {
                in 200..299 -> PostOutcome.Ok(conn.inputStream.use { it.readBytes().toString(Charsets.UTF_8) })
                403 -> PostOutcome.Revoked
                409 -> PostOutcome.FatalConfig
                else -> PostOutcome.Retry
            }
        } catch (e: Exception) {
            PostOutcome.Retry
        } finally {
            conn.disconnect()
        }
    }

    private fun nowMs(): Long = System.currentTimeMillis()

    companion object {
        private const val API_BASE = "https://rootmyandroid.com/v1"
        private const val RELAY_HOST = "relay.rootmyandroid.com"

        /** relay.rs: MAX_SESSIONS. */
        private const val MAX_SESSIONS = 8

        /** session.rs: IDLE_REAP_SECS (10 min) — swept every 5 s. */
        private const val IDLE_REAP_MS = 600_000L
        private const val SWEEP_INTERVAL_MS = 5_000L

        /** relay.rs: READ_TIMEOUT-equivalent drain tick + SEND_PACE_PER_SEC
         *  (under the relay's 100 frames/s/socket cap — spec §0). */
        private const val DRAIN_INTERVAL_MS = 50L
        private const val SEND_PACE_PER_SEC = 90

        /** relay.rs: exponential backoff 1 s → 60 s + 0–250 ms jitter. */
        private const val BACKOFF_INIT_MS = 1_000L
        private const val BACKOFF_MAX_MS = 60_000L
        private const val JITTER_MAX_MS = 250L

        /** e2e-protocol.md §0 close codes: 4403 = revoked. */
        private const val CLOSE_REVOKED = 4403

        private const val HTTP_TIMEOUT_MS = 15_000

        /** Prefix marking outbound items that are already wire frames (skip
         *  sealing). A lone 0x00 byte can never begin valid JSON. */
        private val RAW_FRAME_SENTINEL = byteArrayOf(0)
    }
}
