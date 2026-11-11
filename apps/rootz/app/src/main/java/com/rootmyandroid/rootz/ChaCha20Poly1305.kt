package com.rootmyandroid.rootz

import java.math.BigInteger

/**
 * ChaCha20-Poly1305 AEAD (RFC 8439), pure Kotlin. Hand-rolled because the
 * e2e relay session cipher must work identically on every API level
 * (minSdk 24 — javax.crypto ChaCha20-Poly1305 is not guaranteed below
 * API 28) and in JVM unit tests. Performance is irrelevant (terminal
 * traffic, ≤ 32 KiB frames); correctness is pinned by fixtures.
 *
 * Validated by E2eVectorTest against TWO independent vectors:
 *  - the mirrored rootzd/web e2e fixture (BoringSSL-derived via the
 *    Rust daemon + @stablelib web client), and
 *  - a Node/OpenSSL-generated seal pinned in the test itself.
 *
 * Empty AAD only — the e2e protocol (apps/rootzd/docs/e2e-protocol.md
 * §2.4) uses none; the API is kept minimal on purpose.
 */
internal object ChaCha20Poly1305 {

    private val POLY_P: BigInteger = BigInteger.ONE.shiftLeft(130).subtract(BigInteger.valueOf(5))
    private val TWO_128: BigInteger = BigInteger.ONE.shiftLeft(128)
    private val R_CLAMP = BigInteger("0ffffffc0ffffffc0ffffffc0fffffff", 16)

    /** Encrypt + authenticate. Returns ciphertext || 16-byte tag. */
    fun seal(key: ByteArray, nonce: ByteArray, plaintext: ByteArray): ByteArray {
        checkParams(key, nonce)
        val ct = crypt(key, nonce, plaintext)
        return ct + tag(key, nonce, ct)
    }

    /** Verify + decrypt. Returns null on ANY authentication failure. */
    fun open(key: ByteArray, nonce: ByteArray, ciphertextAndTag: ByteArray): ByteArray? {
        checkParams(key, nonce)
        if (ciphertextAndTag.size < 16) return null
        val ct = ciphertextAndTag.copyOfRange(0, ciphertextAndTag.size - 16)
        val given = ciphertextAndTag.copyOfRange(ciphertextAndTag.size - 16, ciphertextAndTag.size)
        if (!constantTimeEq(given, tag(key, nonce, ct))) return null
        return crypt(key, nonce, ct)
    }

    private fun checkParams(key: ByteArray, nonce: ByteArray) {
        require(key.size == 32) { "ChaCha20-Poly1305 key must be 32 bytes" }
        require(nonce.size == 12) { "ChaCha20-Poly1305 nonce must be 12 bytes" }
    }

    // --- ChaCha20 (RFC 8439 §2.3) -------------------------------------------

    /** ChaCha20 stream with block counter starting at 1 (RFC 8439 §2.4). */
    private fun crypt(key: ByteArray, nonce: ByteArray, input: ByteArray): ByteArray {
        val out = ByteArray(input.size)
        var offset = 0
        var counter = 1
        while (offset < input.size) {
            val stream = block(key, counter, nonce)
            val n = minOf(64, input.size - offset)
            for (i in 0 until n) out[offset + i] = (input[offset + i].toInt() xor stream[i].toInt()).toByte()
            offset += n
            counter++
        }
        return out
    }

    /** 64-byte keystream block (RFC 8439 §2.3.2). */
    private fun block(key: ByteArray, counter: Int, nonce: ByteArray): ByteArray {
        val state = IntArray(16)
        // Constants "expand 32-byte k"
        state[0] = 0x61707865
        state[1] = 0x3320646e
        state[2] = 0x79622d32
        state[3] = 0x6b206574
        for (i in 0 until 8) state[4 + i] = leWord(key, i * 4)
        state[12] = counter
        for (i in 0 until 3) state[13 + i] = leWord(nonce, i * 4)

        val work = state.copyOf()
        repeat(10) {
            // Column rounds
            qr(work, 0, 4, 8, 12)
            qr(work, 1, 5, 9, 13)
            qr(work, 2, 6, 10, 14)
            qr(work, 3, 7, 11, 15)
            // Diagonal rounds
            qr(work, 0, 5, 10, 15)
            qr(work, 1, 6, 11, 12)
            qr(work, 2, 7, 8, 13)
            qr(work, 3, 4, 9, 14)
        }

        val out = ByteArray(64)
        for (i in 0 until 16) {
            val v = work[i] + state[i]
            out[i * 4] = v.toByte()
            out[i * 4 + 1] = (v ushr 8).toByte()
            out[i * 4 + 2] = (v ushr 16).toByte()
            out[i * 4 + 3] = (v ushr 24).toByte()
        }
        return out
    }

    /** Quarter round (RFC 8439 §2.1). */
    private fun qr(s: IntArray, a: Int, b: Int, c: Int, d: Int) {
        s[a] += s[b]; s[d] = (s[d] xor s[a]).rotateLeft(16)
        s[c] += s[d]; s[b] = (s[b] xor s[c]).rotateLeft(12)
        s[a] += s[b]; s[d] = (s[d] xor s[a]).rotateLeft(8)
        s[c] += s[d]; s[b] = (s[b] xor s[c]).rotateLeft(7)
    }

    // --- Poly1305 (RFC 8439 §2.5) -------------------------------------------

    /** AEAD tag over mac_data = aad∅ || ct || pad16 || le64(0) || le64(|ct|) (§2.8). */
    private fun tag(key: ByteArray, nonce: ByteArray, ct: ByteArray): ByteArray {
        val otk = block(key, 0, nonce).copyOfRange(0, 32)
        val r = leToBigInt(otk.copyOfRange(0, 16)).and(R_CLAMP)
        val s = leToBigInt(otk.copyOfRange(16, 32))

        // mac_data with empty AAD: ciphertext, zero-padded to 16, then two
        // little-endian u64 lengths (aad length 0, then ct length).
        val padded = ct + ByteArray((16 - ct.size % 16) % 16) + ByteArray(16)
        for (i in 0 until 8) padded[padded.size - 8 + i] = (ct.size ushr (8 * i)).toByte()

        var acc = BigInteger.ZERO
        var offset = 0
        while (offset < padded.size) {
            val n = leToBigInt(padded.copyOfRange(offset, offset + 16)).add(TWO_128)
            acc = acc.add(n).multiply(r).mod(POLY_P)
            offset += 16
        }
        return bigIntToLe16(acc.add(s).mod(TWO_128))
    }

    // TEMPORARY DEBUG (2026-11-11, CI tag-mismatch hunt) — exposes Poly1305
    // internals as a printable string. REMOVE with the debug test.
    internal fun debugTag(key: ByteArray, nonce: ByteArray, ct: ByteArray): String {
        val otk = block(key, 0, nonce).copyOfRange(0, 32)
        val r = leToBigInt(otk.copyOfRange(0, 16)).and(R_CLAMP)
        val s = leToBigInt(otk.copyOfRange(16, 32))
        val padded = ct + ByteArray((16 - ct.size % 16) % 16) + ByteArray(16)
        for (i in 0 until 8) padded[padded.size - 8 + i] = (ct.size ushr (8 * i)).toByte()
        var acc = BigInteger.ZERO
        var offset = 0
        val sb = StringBuilder()
        sb.append("otk=").append(otk.joinToString("") { "%02x".format(it) })
        sb.append(" r=").append(r.toString(16))
        sb.append(" s=").append(s.toString(16))
        while (offset < padded.size) {
            val n = leToBigInt(padded.copyOfRange(offset, offset + 16)).add(TWO_128)
            acc = acc.add(n).multiply(r).mod(POLY_P)
            sb.append(" acc[$offset]=").append(acc.toString(16))
            offset += 16
        }
        sb.append(" final=").append(bigIntToLe16(acc.add(s).mod(TWO_128)).joinToString("") { "%02x".format(it) })
        return sb.toString()
    }

    private fun constantTimeEq(a: ByteArray, b: ByteArray): Boolean {
        if (a.size != b.size) return false
        var diff = 0
        for (i in a.indices) diff = diff or (a[i].toInt() xor b[i].toInt())
        return diff == 0
    }

    private fun leWord(bytes: ByteArray, offset: Int): Int =
        (bytes[offset].toInt() and 0xff) or
            ((bytes[offset + 1].toInt() and 0xff) shl 8) or
            ((bytes[offset + 2].toInt() and 0xff) shl 16) or
            ((bytes[offset + 3].toInt() and 0xff) shl 24)

    private fun leToBigInt(le: ByteArray): BigInteger = BigInteger(1, le.reversedArray())

    private fun bigIntToLe16(v: BigInteger): ByteArray {
        val le = v.toByteArray().reversedArray()
        return if (le.size >= 16) le.copyOfRange(0, 16) else le + ByteArray(16 - le.size)
    }
}
