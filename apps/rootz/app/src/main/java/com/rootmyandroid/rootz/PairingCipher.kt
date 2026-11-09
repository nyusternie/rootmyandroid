package com.rootmyandroid.rootz

import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * AES-128-GCM message protection for the post-SPAKE2 PeerInfo exchange
 * (AOSP pairing_auth/aes_128_gcm.cpp).
 *
 *  - Key: HKDF-SHA256(SPAKE2 64-byte key material, salt empty,
 *    info "adb pairing_auth aes-128-gcm key" WITHOUT trailing NUL,
 *    length 16).
 *  - Nonce: 12 zero bytes, first 8 = u64 LE sequence counter starting
 *    at 0, one counter per direction.
 *  - Tag: 16 bytes, appended to the ciphertext (javax.crypto's GCM
 *    output layout already matches EVP_AEAD's seal). No AAD.
 */
internal class PairingCipher(keyMaterial: ByteArray) {

    private val key = SecretKeySpec(
        Hkdf.sha256(keyMaterial, INFO.toByteArray(Charsets.US_ASCII), 16),
        "AES",
    )

    private var encSeq = 0L
    private var decSeq = 0L

    internal fun encrypt(plain: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(TAG_BITS, nonce(encSeq)))
        encSeq += 1
        return c.doFinal(plain)
    }

    internal fun decrypt(ciphertextAndTag: ByteArray): ByteArray {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, nonce(decSeq)))
        decSeq += 1
        return c.doFinal(ciphertextAndTag)
    }

    private fun nonce(seq: Long): ByteArray {
        val out = ByteArray(12)
        var v = seq
        for (i in 0..7) { out[i] = (v and 0xff).toByte(); v = v ushr 8 }
        return out
    }

    private companion object {
        const val INFO = "adb pairing_auth aes-128-gcm key"
        const val TAG_BITS = 128
    }
}
