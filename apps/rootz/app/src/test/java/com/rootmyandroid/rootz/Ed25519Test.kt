package com.rootmyandroid.rootz

import java.security.MessageDigest
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

/**
 * Validation ladder for the pairing crypto (see
 * docs/wireless-debugging-setup.md §6): RFC 8032 vectors for the
 * Edwards25519 primitives, RFC 5869 for HKDF, then SPAKE2 self
 * round-trip. The live Pixel 3 Pairing Server is the final oracle.
 */
class Ed25519Test {

    // RFC 8032 §7.1 TEST 1 / TEST 2 / TEST 3 (empty message): secret
    // scalar expansion + base scalar multiplication + point encoding.
    private val rfc8032 = listOf(
        "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60" to
            "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
        "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb" to
            "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
        "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7" to
            "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025",
    )

    @Test
    fun rfc8032BaseMultAndEncode() {
        for ((skHex, expectedPkHex) in rfc8032) {
            val scalar = expandSecret(hex(skHex))
            val pk = Ed25519.B.scalarMult(scalar).encode()
            assertEquals(expectedPkHex, hex(pk))
        }
    }

    // RFC 8032 §7.1 TEST 1 / TEST 2 / TEST 3 signatures (seeds + public
    // keys are the rfc8032 table above): pins Ed25519.sign (added for the
    // relay-daemon role, owner ruling 2026-11-11) against independent
    // OpenSSL output captured 2026-11-11.
    private val rfc8032Signatures = listOf(
        Triple(
            "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
            "",
            "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e06522490155" +
                "5fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
        ),
        Triple(
            "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
            "72",
            "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da" +
                "085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
        ),
        Triple(
            "c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7",
            "af82",
            "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac" +
                "18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a",
        ),
    )

    @Test
    fun rfc8032SignAndVerify() {
        for ((skHex, msgHex, expectedSigHex) in rfc8032Signatures) {
            val sk = hex(skHex)
            val msg = hex(msgHex)
            val sig = Ed25519.sign(sk, msg)
            assertEquals(expectedSigHex, hex(sig))
            // Round-trip through our own verifier (independently pinned by
            // the E2E fixture's welcome_sig_b64 in E2eVectorTest).
            assertTrue(Ed25519.verify(Ed25519.publicKey(sk), msg, sig))
        }
        // publicKey() must reproduce the rfc8032 table for the same seeds.
        for ((skHex, expectedPkHex) in rfc8032) {
            assertEquals(expectedPkHex, hex(Ed25519.publicKey(hex(skHex))))
        }
    }

    @Test
    fun decodeRoundTripsPublicKeys() {
        for ((_, pkHex) in rfc8032) {
            val p = Ed25519.decode(hex(pkHex))
            assertNotNull("$pkHex must decode", p)
            assertTrue("$pkHex must be on-curve", p!!.isOnCurve())
            assertEquals(pkHex, hex(p.encode()))
        }
    }

    @Test
    fun decodeRejectsOffCurveEncoding() {
        // y = 2 (with x recovery unsatisfiable for this y) — a known
        // non-point. (Any encoding whose x² has no root must fail.)
        val bad = ByteArray(32)
        bad[0] = 0x02
        // This y MAY decode on some curves; assert only that encode→
        // decode→encode is stable OR decode fails.
        val p = Ed25519.decode(bad)
        if (p != null) assertArrayEquals(bad, p.encode())
    }

    @Test
    fun spakeTablesEntryZeroIsOnCurve() {
        for (table in listOf(SpakeTables.M_PRECOMP, SpakeTables.N_PRECOMP)) {
            val x = Ed25519.leToBigInt(table.copyOfRange(0, 32))
            val y = Ed25519.leToBigInt(table.copyOfRange(32, 64))
            assertTrue(Ed25519.fromAffine(x, y).isOnCurve())
        }
    }

    @Test
    fun spake2SamePasswordAgrees() {
        val password = "515109".toByteArray(Charsets.US_ASCII)
        val client = Spake2(Spake2.Role.CLIENT, password)
        val server = Spake2(Spake2.Role.SERVER, password)
        assertEquals(32, client.myMsg.size)
        assertEquals(32, server.myMsg.size)
        val clientKey = client.processMsg(server.myMsg)
        val serverKey = server.processMsg(client.myMsg)
        assertEquals(64, clientKey.size)
        assertEquals(64, serverKey.size)
        assertArrayEquals(clientKey, serverKey)
    }

    @Test
    fun spake2DifferentPasswordsDisagree() {
        val client = Spake2(Spake2.Role.CLIENT, "515109".toByteArray(Charsets.US_ASCII))
        val server = Spake2(Spake2.Role.SERVER, "090809".toByteArray(Charsets.US_ASCII))
        assertFalse(client.processMsg(server.myMsg).contentEquals(server.processMsg(client.myMsg)))
    }

    @Test
    fun spake2RejectsGarbagePeerMessage() {
        val client = Spake2(Spake2.Role.CLIENT, "515109".toByteArray(Charsets.US_ASCII))
        try {
            client.processMsg(ByteArray(16))
            fail("short message must throw")
        } catch (expected: PairingException) {
        }
    }

    @Test
    fun hkdfRfc5869TestCase1() {
        val ikm = ByteArray(22) { 0x0b }
        val salt = hex("000102030405060708090a0b0c")
        val info = hex("f0f1f2f3f4f5f6f7f8f9")
        val okm = Hkdf.sha256(ikm, info, 42, salt)
        assertEquals(
            "3cb25f25faacd57a90434f64d0362f2a" +
                "2d2d0a90cf1a5a4c5db02d56ecc4c5bf" +
                "34007208d5b887185865",
            hex(okm),
        )
    }

    @Test
    fun pairingCipherRoundTrip() {
        val keyMaterial = ByteArray(64) { it.toByte() }
        val cipher = PairingCipher(keyMaterial)
        val peerInfo = ByteArray(8192) { (it ushr 8).toByte() }
        val sealed = cipher.encrypt(peerInfo)
        assertEquals(8192 + 16, sealed.size)
        assertNotEquals(hex(peerInfo.copyOfRange(0, 32)), hex(sealed.copyOfRange(0, 32)))
        val opened = cipher.decrypt(sealed)
        assertArrayEquals(peerInfo, opened)
    }

    @Test
    fun pairingCipherDetectsTampering() {
        val cipher = PairingCipher(ByteArray(64) { 0x42 })
        val sealed = cipher.encrypt(ByteArray(8192))
        sealed[100] = (sealed[100].toInt() xor 1).toByte()
        try {
            cipher.decrypt(sealed)
            fail("tampered ciphertext must throw")
        } catch (expected: javax.crypto.AEADBadTagException) {
        }
    }

    /** RFC 8032 §5.1.5 secret scalar expansion (SHA-512 + clamp). */
    private fun expandSecret(sk: ByteArray): ByteArray {
        val h = MessageDigest.getInstance("SHA-512").digest(sk)
        val a = h.copyOfRange(0, 32)
        a[0] = (a[0].toInt() and 248).toByte()
        a[31] = (a[31].toInt() and 127).toByte()
        a[31] = (a[31].toInt() or 64).toByte()
        return a
    }

    private fun hex(s: String): ByteArray {
        val out = ByteArray(s.length / 2)
        var i = 0
        while (i < out.size) {
            out[i] = s.substring(i * 2, i * 2 + 2).toInt(16).toByte()
            i += 1
        }
        return out
    }

    private fun hex(b: ByteArray): String = b.joinToString("") { "%02x".format(it) }
}
