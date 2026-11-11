package com.rootmyandroid.rootz

import org.json.JSONObject
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Self-validation for the E2E relay crypto core (DAEMON role — owner ruling
 * 2026-11-11: this APK is the relay daemon; the clients live in
 * apps/web/src/lib/e2e.ts, the Root My Android apps, and apps/desktop) —
 * the same discipline the web client and rootzd follow: the shared
 * cross-implementation fixture is replayed HERE, against OUR primitives,
 * before any networking is trusted. Daemon-side session replay tests land
 * with the daemon session functions (E2eSession.kt).
 *
 * Fixture: app/src/test/resources/e2e-vector.json — a byte-exact COPY of
 * apps/rootzd/tests/fixtures/e2e-vector.json (mirrored with
 * apps/web/src/lib/fixtures/e2e-vector.json; regenerate ALL copies
 * together with apps/web/tools/gen-e2e-vector.mjs — never edit one copy).
 *
 * Independent vectors pinned in addition:
 *  - RFC 7748 §5.2 single-scalar X25519 vector;
 *  - a Node/OpenSSL-generated ChaCha20-Poly1305 seal (second, separate
 *    implementation family from the fixture's stablelib/BoringSSL origin).
 */
class E2eVectorTest {

    private val fixture: JSONObject by lazy {
        val stream = javaClass.getResourceAsStream("/e2e-vector.json")
            ?: error("e2e-vector.json missing from test resources")
        JSONObject(stream.bufferedReader().readText())
    }

    private fun hex(hex: String): ByteArray =
        ByteArray(hex.length / 2) { hex.substring(it * 2, it * 2 + 2).toInt(16).toByte() }

    private fun hexOf(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    // --- fixture replay -----------------------------------------------------

    @Test
    fun `x25519 fixture pubs derive from seeds`() {
        assertEquals(
            fixture.getJSONObject("expect").getString("client_eph_pub_b64"),
            E2eSession.B64.encode(X25519.publicKey(E2eSession.B64.decode(fixture.getString("client_eph_seed_b64"))!!)),
        )
        assertEquals(
            fixture.getJSONObject("expect").getString("daemon_eph_pub_b64"),
            E2eSession.B64.encode(X25519.publicKey(E2eSession.B64.decode(fixture.getString("daemon_eph_seed_b64"))!!)),
        )
    }

    @Test
    fun `device id is sha256 of daemon pubkey`() {
        val pub = E2eSession.B64.decode(fixture.getJSONObject("expect").getString("daemon_pubkey_b64"))!!
        assertEquals(fixture.getJSONObject("expect").getString("device_id"), E2eSession.deviceIdFromPubkey(pub))
    }

    @Test
    fun `welcome signature verifies under fixture pubkey`() {
        val expect = fixture.getJSONObject("expect")
        val pub = E2eSession.B64.decode(expect.getString("daemon_pubkey_b64"))!!
        val sig = E2eSession.B64.decode(expect.getString("welcome_sig_b64"))!!
        val sid = E2eSession.B64.decode(fixture.getString("sid_b64"))!!
        val clientEph = E2eSession.B64.decode(expect.getString("client_eph_pub_b64"))!!
        val daemonEph = E2eSession.B64.decode(expect.getString("daemon_eph_pub_b64"))!!
        val transcript = "rootz-e2e-v1".toByteArray() + sid + clientEph + daemonEph
        assertTrue(Ed25519.verify(pub, transcript, sig))
    }

    @Test
    fun `chacha20 poly1305 fixture open and seal`() {
        val expect = fixture.getJSONObject("expect")
        val key = hex(expect.getString("session_key_hex"))
        val nonce = E2eSession.B64.decode(fixture.getString("nonce_b64"))!!
        val ciphertext = E2eSession.B64.decode(expect.getString("ciphertext_b64"))!!
        val plaintext = fixture.getString("plaintext_inner_json").toByteArray(Charsets.UTF_8)

        assertArrayEquals(plaintext, ChaCha20Poly1305.open(key, nonce, ciphertext))
        assertArrayEquals(ciphertext, ChaCha20Poly1305.seal(key, nonce, plaintext))
    }

    // --- independent vectors --------------------------------------------------

    @Test
    fun `x25519 rfc 7748 single scalar vector`() {
        // RFC 7748 §5.2: scalar / u / expected output.
        assertEquals(
            "4a5d9d5ba4ce2de1728e3bf480350f25e07e21c947d19e3376f09b3c1e161742",
            hexOf(
                X25519.sharedSecret(
                    hex("77076d0a7318a57d3c16c17251b26645df4c2f87ebc0992ab177fba51db92c2a"),
                    hex("de9edb7d7b7dc1b4d35b61c2ece435373f8343c85b78674dadfc7e146f882b4f"),
                ),
            ),
        )
    }

    @Test
    fun `chacha20 poly1305 node openssl vector`() {
        // Generated 2026-11-11 with node (OpenSSL) createCipheriv(
        // 'chacha20-poly1305', key=bytes(0..31), nonce=000102..0b) over the
        // plaintext below — an implementation family INDEPENDENT of the
        // fixture's stablelib/BoringSSL origin.
        val key = ByteArray(32) { it.toByte() }
        val nonce = hex("000102030405060708090a0b")
        val plaintext = "Rootz relay client interop check".toByteArray(Charsets.UTF_8)
        assertEquals(
            "25RndFM31yXb4kbT+3FnBqcEko4/AMjLiecPph2lxVdqixAQVf6jTTtmxA5c64Xg",
            E2eSession.B64.encode(ChaCha20Poly1305.seal(key, nonce, plaintext)),
        )
    }

    // --- failure behavior -----------------------------------------------------

    @Test
    fun `tampered tag is rejected`() {
        val key = ByteArray(32) { it.toByte() }
        val nonce = hex("000102030405060708090a0b")
        val sealed = ChaCha20Poly1305.seal(key, nonce, "guard me".toByteArray())
        sealed[sealed.size - 1] = (sealed[sealed.size - 1].toInt() xor 1).toByte()
        assertNull(ChaCha20Poly1305.open(key, nonce, sealed))
    }

    @Test
    fun `base64 roundtrip and rejection`() {
        val data = ByteArray(64) { (it * 7 + 3).toByte() }
        assertArrayEquals(data, E2eSession.B64.decode(E2eSession.B64.encode(data)))
        assertNull(E2eSession.B64.decode("not!base64!!"))
    }

}
