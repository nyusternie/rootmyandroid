package com.rootmyandroid.rootz

import javax.crypto.Mac
import javax.crypto.spec.SecretKeySpec

/**
 * HKDF-SHA256 (RFC 5869), exactly the shape AOSP's
 * pairing_auth/aes_128_gcm.cpp uses: empty salt (→ hash-length zero
 * salt per RFC), single 16-byte output block (one expand round).
 */
internal object Hkdf {

    internal fun sha256(
        ikm: ByteArray,
        info: ByteArray,
        length: Int,
        salt: ByteArray = ByteArray(32),
    ): ByteArray {
        require(length <= 255 * 32)
        val prk = hmac(salt, ikm)
        val out = ByteArray(length)
        var prev = ByteArray(0)
        var offset = 0
        var counter = 1
        while (offset < length) {
            val mac = Mac.getInstance("HmacSHA256")
            mac.init(SecretKeySpec(prk, "HmacSHA256"))
            mac.update(prev)
            mac.update(info)
            mac.update(counter.toByte())
            prev = mac.doFinal()
            val n = minOf(prev.size, length - offset)
            System.arraycopy(prev, 0, out, offset, n)
            offset += n
            counter += 1
        }
        return out
    }

    private fun hmac(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data)
    }
}
