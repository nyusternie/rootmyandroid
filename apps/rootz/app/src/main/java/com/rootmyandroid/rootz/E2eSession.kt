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
 * demux) land here next.
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
        data class Welcome(val sid: ByteArray, val id: ByteArray, val eph: ByteArray, val sig: ByteArray) : Frame()
        data class Enc(val sid: ByteArray, val n: ByteArray, val d: ByteArray) : Frame()
        data class Err(val code: String) : Frame()

        /** Non-protocol / malformed / relay-control — ignored, never fatal. */
        object Other : Frame()
    }

    fun parseFrame(text: String): Frame {
        val p = try {
            JSONObject(text)
        } catch (e: Exception) {
            return Frame.Other
        }
        if (p.optString("type") == "authed") return Frame.Other // daemon-side relay control
        if (p.optInt("v", -1) != 1) return Frame.Other
        return when (p.optString("type")) {
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
        data class Stdout(val d: ByteArray) : Inner()
        data class Stderr(val d: ByteArray) : Inner()
        data class Exit(val code: Int?) : Inner()
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

    // --- daemon session state (lands next) ----------------------------------------

    private fun randomBytes(n: Int): ByteArray = ByteArray(n).also { random.nextBytes(it) }

    class E2eException(message: String) : Exception(message)
}
