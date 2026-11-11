package com.rootmyandroid.rootz

import org.json.JSONObject
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * Rootz E2E session cryptography, DAEMON role (owner ruling 2026-11-11:
 * the Rootz APK is the relay daemon on non-rooted phones — the device
 * lane). This object carries the SHARED crypto core + wire vocabulary
 * pinned to the canonical spec (apps/rootzd/docs/e2e-protocol.md v1) and
 * the same mirrored fixture (apps/rootzd/tests/fixtures/e2e-vector.json,
 * copied to app/src/test/resources/e2e-vector.json). The daemon-side
 * session functions (welcome build+sign, enc stdin/stdout, session
 * demux) live below.
 *
 * The relay CLIENT implementations live elsewhere: apps/web/src/lib/e2e.ts
 * (the /terminal page — shipped + cross-tested against rootzd), the Root
 * My Android android/ios apps, and the Desktop app (apps/desktop).
 *
 * Field names in the JSON frames are the WIRE CONTRACT — do not rename.
 *
 * JVM-testable by design: base64 is the pure-Kotlin object below (NOT
 * android.util.Base64, which is unavailable on the unit-test JVM), and
 * org.json is provided to tests via testImplementation (build.gradle).
 */
internal object E2eSession {

    private val random = SecureRandom()

    // --- base64 helpers (standard alphabet, padded — spec §2) ----------------

    internal object B64 {
        private const val ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

        fun encode(bytes: ByteArray): String {
            val out = StringBuilder()
            var i = 0
            while (i + 3 <= bytes.size) {
                val v = (bytes[i].toInt() and 0xff shl 16) or
                    (bytes[i + 1].toInt() and 0xff shl 8) or (bytes[i + 2].toInt() and 0xff)
                out.append(ALPHABET[v ushr 18]).append(ALPHABET[v ushr 12 and 63])
                    .append(ALPHABET[v ushr 6 and 63]).append(ALPHABET[v and 63])
                i += 3
            }
            when (bytes.size - i) {
                1 -> {
                    val v = bytes[i].toInt() and 0xff
                    out.append(ALPHABET[v ushr 2]).append(ALPHABET[v shl 4 and 63]).append("==")
                }
                2 -> {
                    val v = (bytes[i].toInt() and 0xff shl 8) or (bytes[i + 1].toInt() and 0xff)
                    out.append(ALPHABET[v ushr 10]).append(ALPHABET[v ushr 4 and 63])
                        .append(ALPHABET[v shl 2 and 63]).append("=")
                }
            }
            return out.toString()
        }

        fun decode(value: String): ByteArray? {
            val clean = value.trimEnd('=')
            if (clean.any { ALPHABET.indexOf(it) < 0 }) return null
            val out = ArrayList<Byte>(clean.length * 3 / 4)
            var acc = 0
            var bits = 0
            for (ch in clean) {
                acc = (acc shl 6) or ALPHABET.indexOf(ch)
                bits += 6
                if (bits >= 8) {
                    bits -= 8
                    out.add((acc ushr bits).toByte())
                }
            }
            // Reject non-canonical lengths (a lone leftover 6-bit sextet
            // cannot encode a whole byte).
            if (bits == 6) return null
            return out.toByteArray()
        }
    }

    private fun hex(bytes: ByteArray): String =
        bytes.joinToString("") { "%02x".format(it) }

    // --- wire frames (spec §2) ------------------------------------------------

    sealed class Frame {
        data class Hello(val sid: ByteArray, val eph: ByteArray) : Frame()
        data class Welcome(val sid: ByteArray, val id: ByteArray, val eph: ByteArray, val sig: ByteArray) : Frame()
        data class Enc(val sid: ByteArray, val n: ByteArray, val d: ByteArray) : Frame()
        data class Err(val code: String) : Frame()

        /** Relay-generated control frame ({"type":"authed",…}) — awaited once at
         *  tunnel auth (spec §0); ignored mid-session by the daemon lane. */
        object Authed : Frame()

        /** Non-protocol / malformed / relay-control — ignored, never fatal. */
        object Other : Frame()
    }

    fun parseFrame(text: String): Frame {
        val p = try {
            JSONObject(text)
        } catch (e: Exception) {
            return Frame.Other
        }
        if (p.optString("type") == "authed") return Frame.Authed // relay control (no "v":1)
        if (p.optInt("v", -1) != 1) return Frame.Other
        return when (p.optString("type")) {
            "hello" -> {
                val sid = p.optString("sid").let { if (it.isEmpty()) null else B64.decode(it) }
                val eph = p.optString("eph").let { if (it.isEmpty()) null else B64.decode(it) }
                if (sid != null && sid.size == 16 && eph != null && eph.size == 32) {
                    Frame.Hello(sid, eph)
                } else {
                    Frame.Other
                }
            }
            "welcome" -> {
                val sid = p.optString("sid").let { if (it.isEmpty()) null else B64.decode(it) }
                val id = p.optString("id").let { if (it.isEmpty()) null else B64.decode(it) }
                val eph = p.optString("eph").let { if (it.isEmpty()) null else B64.decode(it) }
                val sig = p.optString("sig").let { if (it.isEmpty()) null else B64.decode(it) }
                if (sid != null && sid.size == 16 && id != null && id.size == 32 &&
                    eph != null && eph.size == 32 && sig != null && sig.size == 64
                ) {
                    Frame.Welcome(sid, id, eph, sig)
                } else {
                    Frame.Other
                }
            }
            "enc" -> {
                val sid = p.optString("sid").let { if (it.isEmpty()) null else B64.decode(it) }
                val n = p.optString("n").let { if (it.isEmpty()) null else B64.decode(it) }
                val d = p.optString("d").let { if (it.isEmpty()) null else B64.decode(it) }
                if (sid != null && sid.size == 16 && n != null && n.size == 12 && d != null) {
                    Frame.Enc(sid, n, d)
                } else {
                    Frame.Other
                }
            }
            "error" -> Frame.Err(p.optString("error"))
            else -> Frame.Other
        }
    }

    // --- inner frames (spec §3) -----------------------------------------------

    sealed class Inner {
        data class Stdin(val d: ByteArray) : Inner()
        data class Stdout(val d: ByteArray) : Inner()
        data class Stderr(val d: ByteArray) : Inner()
        data class Exit(val code: Int?) : Inner()
        object Close : Inner()
        data class SessionInfo(val name: String?, val tier: String, val version: String) : Inner()
        object Other : Inner()
    }

    // --- crypto core (spec §1/§2.2/§2.4) ----------------------------------------

    fun deviceIdFromPubkey(pubkey: ByteArray): String =
        hex(MessageDigest.getInstance("SHA-256").digest(pubkey))

    /** The signed transcript: "rootz-e2e-v1" || sid || client_eph || daemon_eph. */
    private fun transcript(sid: ByteArray, clientEph: ByteArray, daemonEph: ByteArray): ByteArray =
        "rootz-e2e-v1".toByteArray(Charsets.UTF_8) + sid + clientEph + daemonEph

    /** HKDF-SHA256(ikm=shared, salt=client_eph||daemon_eph, info="rootz-e2e-v1", L=32). */
    internal fun deriveKey(shared: ByteArray, clientEph: ByteArray, daemonEph: ByteArray): ByteArray =
        Hkdf.sha256(
            ikm = shared,
            salt = clientEph + daemonEph,
            info = "rootz-e2e-v1".toByteArray(Charsets.UTF_8),
            length = 32,
        )

    // --- daemon session (spec §2/§3 — the device lane) ------------------------------

    /** Inner `d` payloads chunk at this so wrapped `enc` frames stay under the
     *  relay's 64 KiB cap (spec §2.4; proto.rs MAX_INNER_CHUNK). */
    const val MAX_INNER_CHUNK: Int = 32 * 1024

    /** base64 OR base64url, padded or not — the API's tunnel-auth challenge is
     *  base64URL (spec §2 preamble; proto.rs b64d_any). */
    fun decodeAnyB64(value: String): ByteArray? {
        val std = buildString {
            for (c in value) append(if (c == '-') '+' else if (c == '_') '/' else c)
            while (length % 4 != 0) append('=')
        }
        return B64.decode(std)
    }

    // --- daemon-emitted wire frames (spec §2 — field names are the wire contract) ----

    fun encodeWelcome(sid: ByteArray, id: ByteArray, eph: ByteArray, sig: ByteArray): String =
        JSONObject()
            .put("v", 1).put("type", "welcome")
            .put("sid", B64.encode(sid)).put("id", B64.encode(id))
            .put("eph", B64.encode(eph)).put("sig", B64.encode(sig))
            .toString()

    fun encodeEnc(sid: ByteArray, n: ByteArray, d: ByteArray): String =
        JSONObject()
            .put("v", 1).put("type", "enc")
            .put("sid", B64.encode(sid)).put("n", B64.encode(n)).put("d", B64.encode(d))
            .toString()

    fun encodeError(sid: ByteArray?, error: String): String {
        val o = JSONObject().put("v", 1).put("type", "error")
        if (sid != null) o.put("sid", B64.encode(sid))
        return o.put("error", error).toString()
    }

    // --- daemon-emitted inner frames (spec §3 — proto.rs encode_inner) -----------------

    /** `name` serializes as null when absent (serde Option is emitted, not
     *  skipped — proto.rs Inner::SessionInfo). */
    fun encodeInnerSessionInfo(name: String?, tier: String, version: String): ByteArray =
        JSONObject()
            .put("type", "session_info")
            .put("name", name ?: JSONObject.NULL)
            .put("tier", tier)
            .put("version", version)
            .toString().toByteArray(Charsets.UTF_8)

    fun encodeInnerStdout(d: ByteArray): ByteArray =
        JSONObject().put("type", "stdout").put("d", B64.encode(d))
            .toString().toByteArray(Charsets.UTF_8)

    fun encodeInnerStderr(d: ByteArray): ByteArray =
        JSONObject().put("type", "stderr").put("d", B64.encode(d))
            .toString().toByteArray(Charsets.UTF_8)

    fun encodeInnerExit(code: Int?): ByteArray =
        JSONObject().put("type", "exit").put("code", code ?: JSONObject.NULL)
            .toString().toByteArray(Charsets.UTF_8)

    /** Inner-frame parser, both roles' vocabulary (proto.rs parse_inner) — the
     *  daemon lane ACTS on stdin/close only. Data frames with a missing or
     *  undecodable `d` map to Other (proto.rs None parity). */
    fun parseInnerDaemon(plaintext: ByteArray): Inner {
        val p = try {
            JSONObject(String(plaintext, Charsets.UTF_8))
        } catch (e: Exception) {
            return Inner.Other
        }
        val data: () -> ByteArray? = { if (!p.has("d")) null else B64.decode(p.optString("d")) }
        return when (p.optString("type")) {
            "stdin" -> data()?.let { Inner.Stdin(it) } ?: Inner.Other
            "stdout" -> data()?.let { Inner.Stdout(it) } ?: Inner.Other
            "stderr" -> data()?.let { Inner.Stderr(it) } ?: Inner.Other
            "exit" -> Inner.Exit(if (p.has("code") && !p.isNull("code")) p.optInt("code") else null)
            "close" -> Inner.Close
            "session_info" -> Inner.SessionInfo(
                if (p.has("name") && !p.isNull("name")) p.optString("name") else null,
                p.optString("tier"),
                p.optString("version"),
            )
            else -> Inner.Other
        }
    }

    /** One daemon-side E2E session: sid + derived key + the pre-built, signed
     *  welcome frame (spec §2.2). Constructed by [newDaemonSession] only, so a
     *  session can never exist without its transcript signature. */
    class DaemonSession internal constructor(
        val sid: ByteArray,
        val daemonEphPub: ByteArray,
        val key: ByteArray,
        val welcomeJson: String,
    ) {

        private val random = SecureRandom()

        /** Seal one plaintext inner frame into a ready-to-send `enc` wire frame
         *  (random 12-byte nonce per message, empty AAD — spec §2.4). */
        fun sealInner(innerJson: ByteArray): String {
            val nonce = ByteArray(12).also { random.nextBytes(it) }
            return E2eSession.encodeEnc(sid, nonce, ChaCha20Poly1305.seal(key, nonce, innerJson))
        }

        /** Open one inbound `enc` frame addressed to this session; null on AEAD
         *  auth failure (the caller reaps the session — spec §2.4). Frames
         *  carrying another sid return Other (relay broadcast semantics §0). */
        fun openInner(frame: E2eSession.Frame.Enc): E2eSession.Inner? {
            if (!frame.sid.contentEquals(sid)) return E2eSession.Inner.Other
            val plaintext = ChaCha20Poly1305.open(key, frame.n, frame.d) ?: return null
            return E2eSession.parseInnerDaemon(plaintext)
        }
    }

    /** Build a daemon-side session from a client's `hello`: fresh X25519
     *  ephemeral (injectable for fixture replay), HKDF session key, signed
     *  transcript welcome (spec §2.2/§2.3). */
    fun newDaemonSession(
        sid: ByteArray,
        clientEph: ByteArray,
        identitySeed: ByteArray,
        identityPub: ByteArray,
        daemonEphSeed: ByteArray = randomBytes(32),
    ): DaemonSession {
        val ephPub = X25519.publicKey(daemonEphSeed)
        val key = deriveKey(X25519.sharedSecret(daemonEphSeed, clientEph), clientEph, ephPub)
        val sig = Ed25519.sign(identitySeed, transcript(sid, clientEph, ephPub))
        return DaemonSession(sid, ephPub, key, encodeWelcome(sid, identityPub, ephPub, sig))
    }

    private fun randomBytes(n: Int): ByteArray = ByteArray(n).also { random.nextBytes(it) }

    class E2eException(message: String) : Exception(message)
}
