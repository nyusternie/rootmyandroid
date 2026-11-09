package com.rootmyandroid.rootz

import android.util.Base64
import java.math.BigInteger
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.MessageDigest
import java.security.SecureRandom
import java.security.interfaces.RSAPrivateCrtKey
import java.security.interfaces.RSAPublicKey
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * The app's ADB identity: an RSA-2048 keypair, its Android-specific
 * public-key encoding (sent in the pairing PeerInfo), and the
 * self-signed X.509 certificate presented during the TLS handshakes
 * (pairing and connect). Mirrors AOSP adb's own key handling:
 *  - adb/crypto/rsa_2048_key.cpp (keygen params)
 *  - libcrypto_utils/android_pubkey.cpp (public struct layout)
 *  - adb/crypto/x509_generator.cpp (certificate template)
 *
 * The keypair is generated once and persisted (PeerInfo enrollment on the
 * device is bound to THIS key; regenerating = needing to re-pair).
 */
internal class AdbKey private constructor(val keyPair: KeyPair) {

    private val rsaPub: RSAPublicKey = keyPair.public as RSAPublicKey

    /** "rootz@<model>"-style comment suffix for the adb key string. */
    private val comment = "rootz@rootz"

    /**
     * The adb public key string: base64(524-byte struct) + " " + comment,
     * exactly as android_pubkey_encode + adb_auth's userkey formatting
     * produce it. Struct layout (all integers little-endian):
     *   u32 modulus_size_words = 64
     *   u32 n0inv = -1/N0 mod 2^32
     *   u8  modulus[256]  (N, little-endian)
     *   u8  rr[256]       ((2^2048)^2 mod N, little-endian)
     *   u32 exponent = 65537
     */
    internal val adbPublicKeyString: String by lazy {
        val n = rsaPub.modulus
        val e = rsaPub.publicExponent

        val r32 = BigInteger.ONE.shiftLeft(32)
        val n0inv = r32.subtract(n.mod(r32).modInverse(r32)).toLong() and 0xffffffffL
        val rr = BigInteger.ONE.shiftLeft(2048).let { it.multiply(it).mod(n) }

        val struct = ByteArray(ANDROID_PUBKEY_STRUCT_SIZE)
        var o = 0
        fun putLe32(v: Long) {
            struct[o] = (v and 0xff).toByte()
            struct[o + 1] = (v ushr 8 and 0xff).toByte()
            struct[o + 2] = (v ushr 16 and 0xff).toByte()
            struct[o + 3] = (v ushr 24 and 0xff).toByte()
            o += 4
        }
        fun putLe256(v: BigInteger) {
            val be = v.toByteArray()
            var i = be.size - 1
            var j = 0
            while (i >= 0) { struct[o + j] = be[i]; i -= 1; j += 1 }
            o += 256
        }
        putLe32(ANDROID_PUBKEY_MODULUS_SIZE_WORDS.toLong())
        putLe32(n0inv)
        putLe256(n)
        putLe256(rr)
        putLe32(e.toLong())

        Base64.encodeToString(struct, Base64.NO_WRAP) + " " + comment
    }

    /**
     * Self-signed X.509 certificate (DER), mirroring the
     * x509_generator.cpp GenerateX509Certificate template: v3, serial 1,
     * SHA-256withRSA, issuer == subject == C=US/O=Android/CN=Adb,
     * validity now → +10 years, extensions basicConstraints=critical
     * CA:TRUE, keyUsage=critical keyCertSign|cRLSign|digitalSignature,
     * subjectKeyIdentifier=hash (SHA-1 over the SPKI bit-string content
     * — cosmetic; adbd does not check it).
     */
    internal val certificateDer: ByteArray by lazy {
        val n = rsaPub.modulus
        val e = rsaPub.publicExponent

        // --- OIDs (DER content bytes) ---
        val oidSha256WithRsa = byteArrayOf(0x06, 0x09) +
            byteArrayOf(0x2A, 0x86.toByte(), 0x48, 0x86.toByte(), 0xF7.toByte(), 0x0D, 0x01, 0x01, 0x0B)
        val oidRsa = byteArrayOf(0x06, 0x09) +
            byteArrayOf(0x2A, 0x86.toByte(), 0x48, 0x86.toByte(), 0xF7.toByte(), 0x0D, 0x01, 0x01, 0x01)
        val oidC = byteArrayOf(0x06, 0x03, 0x55, 0x04, 0x06)
        val oidO = byteArrayOf(0x06, 0x03, 0x55, 0x04, 0x0A)
        val oidCn = byteArrayOf(0x06, 0x03, 0x55, 0x04, 0x03)
        val oidBasicConstraints = byteArrayOf(0x06, 0x03, 0x55, 0x1D, 0x13)
        val oidKeyUsage = byteArrayOf(0x06, 0x03, 0x55, 0x1D, 0x0F)
        val oidSkid = byteArrayOf(0x06, 0x03, 0x55, 0x1D, 0x0E)

        // RDN ::= SET OF AttributeTypeAndValue; ATV ::= SEQUENCE { type, value }.
        // (First cut missed the inner ATV SEQUENCE — Conscrypt's parser
        // rejected the whole certificate with "No certificate found".)
        fun attribute(oid: ByteArray, stringTag: Int, value: String): ByteArray =
            tlv(
                TAG_SEQUENCE,
                tlv(TAG_SET, tlv(TAG_SEQUENCE, oid + tlv(stringTag, value.toByteArray(Charsets.US_ASCII)))),
            )

        val name = tlv(
            TAG_SEQUENCE,
            attribute(oidC, TAG_PRINTABLE_STRING, "US") +
                attribute(oidO, TAG_UTF8_STRING, "Android") +
                attribute(oidCn, TAG_UTF8_STRING, "Adb"),
        )

        val utc = SimpleDateFormat("yyMMddHHmmss'Z'", Locale.US).apply {
            timeZone = TimeZone.getTimeZone("UTC")
        }
        val now = Date()
        val tenYears = Date(now.time + 10L * 365 * 24 * 3600 * 1000)
        val validity = tlv(
            TAG_SEQUENCE,
            tlv(TAG_UTC_TIME, utc.format(now).toByteArray(Charsets.US_ASCII)) +
                tlv(TAG_UTC_TIME, utc.format(tenYears).toByteArray(Charsets.US_ASCII)),
        )

        val rsaPubDer = tlv(TAG_SEQUENCE, tlv(TAG_INTEGER, n.toByteArray()) + tlv(TAG_INTEGER, e.toByteArray()))
        val spki = tlv(
            TAG_SEQUENCE,
            tlv(TAG_SEQUENCE, oidRsa + tlv(TAG_NULL, ByteArray(0))) +
                tlv(TAG_BIT_STRING, byteArrayOf(0) + rsaPubDer),
        )

        // RFC 5280 §4.2.1.2 method 1: SHA-1 over the subjectPublicKey BITS
        // (excluding tag, length, and the unused-bits byte).
        val skid = MessageDigest.getInstance("SHA-1").digest(rsaPubDer).let {
            tlv(TAG_OCTET_STRING, tlv(TAG_OCTET_STRING, it))
        }
        val extensions = tlv(
            TAG_EXPLICIT_3,
            tlv(
                TAG_SEQUENCE,
                tlv(TAG_SEQUENCE, oidBasicConstraints + tlv(TAG_BOOLEAN, byteArrayOf(0xff.toByte())) +
                    tlv(TAG_OCTET_STRING, tlv(TAG_SEQUENCE, tlv(TAG_BOOLEAN, byteArrayOf(0xff.toByte()))))) +
                    tlv(TAG_SEQUENCE, oidKeyUsage + tlv(TAG_BOOLEAN, byteArrayOf(0xff.toByte())) +
                        tlv(TAG_OCTET_STRING, tlv(TAG_BIT_STRING, byteArrayOf(1, 0x86.toByte())))) +
                    tlv(TAG_SEQUENCE, oidSkid + skid),
            ),
        )

        val tbs = tlv(
            TAG_SEQUENCE,
            tlv(TAG_EXPLICIT_0, tlv(TAG_INTEGER, byteArrayOf(2))) +
                tlv(TAG_INTEGER, byteArrayOf(1)) +
                tlv(TAG_SEQUENCE, oidSha256WithRsa + tlv(TAG_NULL, ByteArray(0))) +
                name +
                validity +
                name +
                spki +
                extensions,
        )

        val signature = java.security.Signature.getInstance("SHA256withRSA").apply {
            initSign(keyPair.private)
            update(tbs)
        }.sign()

        tlv(
            TAG_SEQUENCE,
            tbs +
                tlv(TAG_SEQUENCE, oidSha256WithRsa + tlv(TAG_NULL, ByteArray(0))) +
                tlv(TAG_BIT_STRING, byteArrayOf(0) + signature),
        )
    }

    internal companion object {
        // android_pubkey.h: 3*sizeof(uint32_t) + 2*ANDROID_PUBKEY_MODULUS_SIZE
        private const val ANDROID_PUBKEY_STRUCT_SIZE = 524
        private const val ANDROID_PUBKEY_MODULUS_SIZE_WORDS = 64

        private const val TAG_BOOLEAN = 0x01
        private const val TAG_INTEGER = 0x02
        private const val TAG_BIT_STRING = 0x03
        private const val TAG_OCTET_STRING = 0x04
        private const val TAG_NULL = 0x05
        private const val TAG_UTF8_STRING = 0x0C
        private const val TAG_PRINTABLE_STRING = 0x13
        private const val TAG_UTC_TIME = 0x17
        private const val TAG_SEQUENCE = 0x30
        private const val TAG_SET = 0x31
        private const val TAG_EXPLICIT_0 = 0xA0
        private const val TAG_EXPLICIT_3 = 0xA3

        private fun tlv(tag: Int, content: ByteArray): ByteArray {
            val len = content.size
            val lenBytes = when {
                len < 128 -> byteArrayOf(len.toByte())
                len < 256 -> byteArrayOf(0x81.toByte(), len.toByte())
                else -> byteArrayOf(0x82.toByte(), (len ushr 8).toByte(), (len and 0xff).toByte())
            }
            return byteArrayOf(tag.toByte()) + lenBytes + content
        }

        /** Generate a fresh RSA-2048 identity (e=65537, adb's parameters). */
        internal fun generate(): AdbKey {
            val gen = KeyPairGenerator.getInstance("RSA")
            gen.initialize(2048, SecureRandom())
            return AdbKey(gen.generateKeyPair())
        }

        /** Rebuild from persisted key material (PKCS#8 private + X.509 public). */
        internal fun restore(pkcs8: ByteArray, x509Public: ByteArray): AdbKey {
            val kf = java.security.KeyFactory.getInstance("RSA")
            val priv = kf.generatePrivate(java.security.spec.PKCS8EncodedKeySpec(pkcs8))
                as RSAPrivateCrtKey
            val pub = kf.generatePublic(java.security.spec.X509EncodedKeySpec(x509Public))
            return AdbKey(KeyPair(pub, priv))
        }
    }
}
