package com.rootmyandroid.rootz

import java.math.BigInteger

/**
 * X25519 (RFC 7748) — Montgomery ladder over GF(2^255-19), BigInteger-based.
 * Same audit-over-speed philosophy as Ed25519.kt: ONE key exchange per E2E
 * relay session, so performance is irrelevant; correctness is pinned by
 * fixtures, not trust.
 *
 * Conventions (RFC 7748 §5): the scalar is clamped internally
 * (decodeScalar25519); the u coordinate's top bit is masked on decode;
 * all integers are little-endian on the wire; base point u=9.
 *
 * The all-zero shared secret is NOT rejected — this mirrors the dalek /
 * @stablelib defaults the protocol is pinned against
 * (apps/rootzd/docs/e2e-protocol.md §1).
 *
 * Validated by E2eVectorTest: the mirrored rootzd/web fixture
 * (app/src/test/resources/e2e-vector.json) plus the RFC 7748 §5.2
 * single-scalar vector.
 */
internal object X25519 {

    private val P: BigInteger = BigInteger.ONE.shiftLeft(255).subtract(BigInteger.valueOf(19))
    private val A24: BigInteger = BigInteger.valueOf(121665)
    private val U_BASE: BigInteger = BigInteger.valueOf(9)

    /** Public key for a 32-byte secret: X25519(secret, 9). */
    fun publicKey(secret: ByteArray): ByteArray = ladder(clamp(secret), U_BASE)

    /** Shared secret: X25519(mySecret, peerPub). */
    fun sharedSecret(secret: ByteArray, peerPub: ByteArray): ByteArray =
        ladder(clamp(secret), decodeU(peerPub))

    /** RFC 7748 decodeScalar25519: k[0] &= 248; k[31] &= 127; k[31] |= 64. */
    private fun clamp(scalar: ByteArray): BigInteger {
        require(scalar.size == 32) { "X25519 scalar must be 32 bytes" }
        val k = scalar.copyOf()
        k[0] = (k[0].toInt() and 248).toByte()
        k[31] = (k[31].toInt() and 127).toByte()
        k[31] = (k[31].toInt() or 64).toByte()
        return leToBigInt(k)
    }

    /** RFC 7748 decodeUCoordinate: mask the most significant bit. */
    private fun decodeU(u: ByteArray): BigInteger {
        require(u.size == 32) { "X25519 u must be 32 bytes" }
        val v = u.copyOf()
        v[31] = (v[31].toInt() and 127).toByte()
        return leToBigInt(v)
    }

    /** Montgomery ladder, RFC 7748 §5 pseudocode transcribed 1:1. */
    private fun ladder(k: BigInteger, u: BigInteger): ByteArray {
        val x1 = u
        var x2 = BigInteger.ONE
        var z2 = BigInteger.ZERO
        var x3 = u
        var z3 = BigInteger.ONE
        var swap = 0
        for (t in 254 downTo 0) {
            val kt = if (k.testBit(t)) 1 else 0
            swap = swap xor kt
            if (swap == 1) {
                x2 = x3.also { x3 = x2 }
                z2 = z3.also { z3 = z2 }
            }
            swap = kt
            val a = x2.add(z2).mod(P)
            val aa = a.multiply(a).mod(P)
            val b = x2.subtract(z2).mod(P)
            val bb = b.multiply(b).mod(P)
            val e = aa.subtract(bb).mod(P)
            val c = x3.add(z3).mod(P)
            val d = x3.subtract(z3).mod(P)
            val da = d.multiply(d).mod(P)
            val cb = c.multiply(c).mod(P)
            x3 = da.add(cb).mod(P).let { it.multiply(it).mod(P) }
            z3 = x1.multiply(da.subtract(cb).mod(P).let { it.multiply(it).mod(P) }).mod(P)
            x2 = aa.multiply(bb).mod(P)
            z2 = e.multiply(aa.add(A24.multiply(e).mod(P)).mod(P)).mod(P)
        }
        if (swap == 1) {
            x2 = x3.also { x3 = x2 }
            z2 = z3.also { z3 = z2 }
        }
        val out = x2.multiply(z2.modInverse(P)).mod(P)
        return bigIntToLe(out)
    }

    private fun leToBigInt(le: ByteArray): BigInteger {
        val be = le.reversedArray()
        return BigInteger(1, be)
    }

    private fun bigIntToLe(v: BigInteger): ByteArray {
        val be = v.toByteArray()
        val le = be.reversedArray()
        return if (le.size >= 32) le.copyOfRange(0, 32) else le + ByteArray(32 - le.size)
    }
}
