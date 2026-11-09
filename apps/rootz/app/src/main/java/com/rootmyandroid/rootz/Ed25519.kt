package com.rootmyandroid.rootz

import java.math.BigInteger

/**
 * Minimal Edwards25519 arithmetic, BigInteger-based. Performance is
 * irrelevant here (a handful of scalar multiplications during a one-time
 * pairing handshake); correctness and auditability are everything.
 *
 * Formulas: RFC 8032 §5.1 (add-2008-hwcd / dbl-2008-hwcd over extended
 * homogeneous coordinates). Encode/decode conventions mirror BoringSSL's
 * x25519_ge_tobytes / x25519_ge_frombytes_vartime exactly
 * (crypto/curve25519/curve25519.cc) because our peer (adbd's Pairing
 * Server, spake25519.cc) runs that code.
 *
 * Validated against the RFC 8032 §7.1 test vectors in Ed25519Test.
 */
internal object Ed25519 {

    private val P: BigInteger = BigInteger.ONE.shiftLeft(255).subtract(BigInteger.valueOf(19))

    /** Order of the prime-order subgroup (l). */
    internal val L: BigInteger = BigInteger.ONE.shiftLeft(252)
        .add(BigInteger("27742317777372353535851937790883648493"))

    private val D: BigInteger = BigInteger.valueOf(-121665L)
        .multiply(BigInteger.valueOf(121666L).modInverse(P)).mod(P)
    private val D2: BigInteger = D.add(D).mod(P)
    private val SQRT_M1: BigInteger = BigInteger.valueOf(2)
        .modPow(P.subtract(BigInteger.ONE).shiftRight(2), P)

    private fun mul(a: BigInteger, b: BigInteger) = a.multiply(b).mod(P)
    private fun add(a: BigInteger, b: BigInteger) = a.add(b).mod(P)
    private fun sub(a: BigInteger, b: BigInteger) = a.subtract(b).mod(P)
    private fun sqr(a: BigInteger) = mul(a, a)

    /** Extended homogeneous coordinates: x = X/Z, y = Y/Z, T = XY/Z. */
    internal class Point(val x: BigInteger, val y: BigInteger, val z: BigInteger, val t: BigInteger) {

        fun negate(): Point = Point(P.subtract(x).mod(P), y, z, P.subtract(t).mod(P))

        operator fun plus(o: Point): Point {
            val a = mul(sub(y, x), sub(o.y, o.x))
            val b = mul(add(y, x), add(o.y, o.x))
            val c = mul(mul(t, o.t), D2)
            val d = mul(mul(z, o.z), BigInteger.valueOf(2))
            val e = sub(b, a)
            val f = sub(d, c)
            val g = add(d, c)
            val h = add(b, a)
            return Point(mul(e, f), mul(g, h), mul(f, g), mul(e, h))
        }

        fun dbl(): Point {
            val a = sqr(x)
            val b = sqr(y)
            val c = sqr(z).shiftLeft(1).mod(P)
            val d = P.subtract(a).mod(P)
            val e = sub(sub(sqr(add(x, y)), a), b)
            val g = add(d, b)
            val f = sub(g, c)
            val h = sub(d, b)
            return Point(mul(e, f), mul(g, h), mul(f, g), mul(e, h))
        }

        /** Scalar multiplication by a 32-byte little-endian scalar (plain double-and-add). */
        fun scalarMult(s: ByteArray): Point {
            require(s.size == 32)
            var r = IDENTITY
            var i = 255
            while (i >= 0) {
                r = r.dbl()
                if ((s[i ushr 3].toInt() ushr (i and 7)) and 1 == 1) r = r + this
                i -= 1
            }
            return r
        }

        /** BoringSSL x25519_ge_tobytes: y (LE, 255 bits) | (x&1) << 255. */
        fun encode(): ByteArray {
            val zi = z.modInverse(P)
            val ax = mul(x, zi)
            val ay = mul(y, zi)
            val out = bigIntToLe32(ay)
            if (ax.testBit(0)) out[31] = (out[31].toInt() or 0x80).toByte()
            return out
        }

        /** On-curve check: -x² + y² == 1 + d·x²·y² (mod p). */
        fun isOnCurve(): Boolean {
            val zi = z.modInverse(P)
            val ax = mul(x, zi)
            val ay = mul(y, zi)
            val lhs = sub(sqr(ay), sqr(ax))
            val rhs = add(BigInteger.ONE, mul(D, mul(sqr(ax), sqr(ay))))
            return lhs == rhs
        }
    }

    internal val IDENTITY = Point(BigInteger.ZERO, BigInteger.ONE, BigInteger.ONE, BigInteger.ZERO)

    /** The standard base point (constructed by decoding its canonical encoding). */
    internal val B: Point = requireNotNull(
        decode(hexToBytes("5866666666666666666666666666666666666666666666666666666666666666")),
    ) { "base point encoding must decode" }

    /**
     * BoringSSL x25519_ge_frombytes_vartime: recover x from y and the sign
     * bit; null if the encoding is not on the curve. Convention: the parity
     * of x must equal the sign bit (RFC 8032 §5.1.3, same branch structure
     * as BoringSSL — including the x=0 pass-through).
     */
    internal fun decode(s: ByteArray): Point? {
        require(s.size == 32)
        val sign = (s[31].toInt() ushr 7) and 1
        val masked = s.copyOf()
        masked[31] = (masked[31].toInt() and 0x7f).toByte()
        val y = leToBigInt(masked)
        val u = sub(sqr(y), BigInteger.ONE)
        val v = add(mul(D, sqr(y)), BigInteger.ONE)
        val w = mul(u, v)
        var x = mul(u, w.modPow(P.subtract(BigInteger.valueOf(5)).shiftRight(3), P))
        val vxx = mul(v, sqr(x))
        if (sub(vxx, u) != BigInteger.ZERO) {
            if (add(vxx, u) != BigInteger.ZERO) return null
            x = mul(x, SQRT_M1)
        }
        val xSign = if (x.testBit(0)) 1 else 0
        if (xSign != sign) x = P.subtract(x).mod(P)
        return Point(x, y, BigInteger.ONE, mul(x, y))
    }

    /** Affine constructor (for the SPAKE2 precomp table entries, which store x||y). */
    internal fun fromAffine(x: BigInteger, y: BigInteger): Point =
        Point(x.mod(P), y.mod(P), BigInteger.ONE, mul(x, y))

    internal fun leToBigInt(bytes: ByteArray): BigInteger = BigInteger(1, bytes.reversedArray())

    internal fun bigIntToLe32(v: BigInteger): ByteArray {
        val be = v.toByteArray()
        val out = ByteArray(32)
        var i = be.size - 1
        var j = 0
        while (i >= 0 && j < 32) {
            out[j] = be[i]
            i -= 1
            j += 1
        }
        return out
    }

    /** BoringSSL x25519_sc_reduce: interpret 64 bytes LE, reduce mod l. */
    internal fun scReduce(wide: ByteArray): BigInteger {
        require(wide.size == 64)
        return leToBigInt(wide).mod(L)
    }

    private fun hexToBytes(hex: String): ByteArray {
        val out = ByteArray(hex.length / 2)
        var i = 0
        while (i < out.size) {
            out[i] = hex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
            i += 1
        }
        return out
    }
}
