package com.rootmyandroid.rootz

import java.math.BigInteger
import java.security.MessageDigest
import java.security.SecureRandom

/**
 * SPAKE2 over Edwards25519, implementing the EXACT BoringSSL flavor used
 * by ADB wireless pairing (BoringSSL crypto/curve25519/spake25519.cc +
 * AOSP pairing_auth/pairing_auth.cpp). This is NOT RFC 9382 SPAKE2 —
 * the mask points, key schedule, identity strings, and a historical
 * cofactor quirk all differ. Differences implemented here:
 *
 *  - Masks: client masks with w'·M, server with w'·N (M/N constants in
 *    SpakeTables.kt, extracted from BoringSSL).
 *  - Key schedule: SHA512 over 8-byte-LE length-prefixed fields, in the
 *    ALICE view: my_name, their_name, my_msg, their_msg, dh,
 *    password_hash (the FULL 64-byte SHA-512 of the password).
 *  - Identity strings: "adb pair client\0" / "adb pair server\0"
 *    (sizeof() in C — trailing NUL INCLUDED).
 *  - Cofactor quirk: the mask scalar is w' = w + b0·l + b1·2l + b2·4l,
 *    where b0..b2 are the low three bits of w. This replicates
 *    BoringSSL's historical missing ×8 on the password scalar; BOTH
 *    sides must apply it or the handshake fails.
 *  - Private scalar: 64 random bytes → sc_reduce (mod l) → ×8 (no
 *    modular reduction after the shift; the group operation absorbs it).
 */
internal class Spake2(
    role: Role,
    password: ByteArray,
    random: SecureRandom = SecureRandom(),
) {

    internal enum class Role { CLIENT, SERVER }

    private val isClient = role == Role.CLIENT

    // BoringSSL pairing_auth: kClientRole = spake2_role_alice.
    private val myName = (if (isClient) "adb pair client" else "adb pair server")
        .toByteArray(Charsets.US_ASCII) + byteOf(0)
    private val theirName = (if (isClient) "adb pair server" else "adb pair client")
        .toByteArray(Charsets.US_ASCII) + byteOf(0)

    // Mask points from the BoringSSL precomp tables: entry 0 is 1·P
    // (x25519_ge_scalarmult_small_precomp stores j·P at j-1, as affine
    // x||y, 32 bytes each, little-endian).
    private val myMaskPoint: Ed25519.Point = tablePoint(if (isClient) SpakeTables.M_PRECOMP else SpakeTables.N_PRECOMP)
    private val theirMaskPoint: Ed25519.Point = tablePoint(if (isClient) SpakeTables.N_PRECOMP else SpakeTables.M_PRECOMP)

    private val priv: BigInteger
    private val wPrime: BigInteger
    private val passwordHash: ByteArray

    /** Our 32-byte SPAKE2 message (SPAKE2_MAX_MSG_SIZE). */
    internal val myMsg: ByteArray

    init {
        val rand = ByteArray(64)
        random.nextBytes(rand)
        priv = Ed25519.scReduce(rand).shiftLeft(3)

        passwordHash = sha512(password)
        val w = Ed25519.scReduce(passwordHash)
        // Cofactor quirk: add back the subgroup order in proportion to
        // the three discarded low bits.
        wPrime = w
            .add(if (w.testBit(0)) Ed25519.L else BigInteger.ZERO)
            .add(if (w.testBit(1)) Ed25519.L.shiftLeft(1) else BigInteger.ZERO)
            .add(if (w.testBit(2)) Ed25519.L.shiftLeft(2) else BigInteger.ZERO)

        val p = Ed25519.B.scalarMult(Ed25519.bigIntToLe32(priv))
        val mask = myMaskPoint.scalarMult(Ed25519.bigIntToLe32(wPrime))
        myMsg = (p + mask).encode()
    }

    /**
     * Consume the peer's 32-byte message and produce the 64-byte shared
     * key material. Throws PairingException on an invalid (off-curve)
     * peer message.
     */
    internal fun processMsg(theirMsg: ByteArray): ByteArray {
        if (theirMsg.size != 32) throw PairingException("bad SPAKE2 message size ${theirMsg.size}")
        val qStar = Ed25519.decode(theirMsg) ?: throw PairingException("peer message off-curve")
        val peersMask = theirMaskPoint.scalarMult(Ed25519.bigIntToLe32(wPrime))
        val q = qStar + peersMask.negate()
        val dh = q.scalarMult(Ed25519.bigIntToLe32(priv)).encode()

        // Key schedule, alice view (both sides emit identical field
        // ORDER — alice first — so roles must swap when bob runs this).
        val firstName: ByteArray
        val secondName: ByteArray
        val firstMsg: ByteArray
        val secondMsg: ByteArray
        if (isClient) {
            firstName = myName; secondName = theirName
            firstMsg = myMsg; secondMsg = theirMsg
        } else {
            firstName = theirName; secondName = myName
            firstMsg = theirMsg; secondMsg = myMsg
        }

        val md = MessageDigest.getInstance("SHA-512")
        fun update(data: ByteArray) {
            val len = ByteArray(8)
            var v = data.size.toLong()
            for (i in 0..7) { len[i] = (v and 0xff).toByte(); v = v ushr 8 }
            md.update(len)
            md.update(data)
        }
        update(firstName)
        update(secondName)
        update(firstMsg)
        update(secondMsg)
        update(dh)
        update(passwordHash)
        return md.digest()
    }

    private fun tablePoint(table: ByteArray): Ed25519.Point {
        val x = Ed25519.leToBigInt(table.copyOfRange(0, 32))
        val y = Ed25519.leToBigInt(table.copyOfRange(32, 64))
        val p = Ed25519.fromAffine(x, y)
        check(p.isOnCurve()) { "SPAKE2 precomp table entry 0 is off-curve" }
        return p
    }

    private fun sha512(data: ByteArray): ByteArray =
        MessageDigest.getInstance("SHA-512").digest(data)
}

internal class PairingException(message: String) : Exception(message)
