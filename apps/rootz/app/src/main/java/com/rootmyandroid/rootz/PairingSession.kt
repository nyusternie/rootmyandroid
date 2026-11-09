package com.rootmyandroid.rootz

import android.util.Log
import java.io.DataInputStream
import java.io.DataOutputStream
import javax.net.ssl.SSLSocket

/**
 * Drives the ADB wireless pairing handshake against a device's on-board
 * Pairing Server (spec: apps/rootz/docs/wireless-debugging-setup.md §3):
 *
 *   TCP → TLS 1.3 (mutual, verification OFF — channel authenticated by
 *   the PAKE) → password = 6-digit code || EKM(64B, "adb-label"+NUL) →
 *   SPAKE2 msg exchange (header-framed) → AES-128-GCM PeerInfo exchange
 *   (we send ADB_RSA_PUB_KEY, device replies ADB_DEVICE_GUID).
 *
 * Runs on whatever thread calls [run] — callers must use a background
 * thread. Throws [PairingException] (or IOException/SSLException) on any
 * failure; the caller reports and lets the user retry (the device-side
 * server tolerates 20 attempts before quitting).
 */
internal class PairingSession(
    private val host: String,
    private val port: Int,
    private val pairCode: String,
    private val adbKey: AdbKey,
) {

    internal class Result(val deviceGuid: String)

    internal fun run(): Result {
        // Same-device quirk (own external address refused from an app
        // UID — see AdbTls): loopback substitution happens inside open().
        Log.i(TAG, "pairing: connecting to $host:$port")
        val socket = AdbTls.open(host, port, adbKey, IO_TIMEOUT_MS)
        try {
            Log.i(TAG, "pairing: TLS ${socket.session.protocol} established; exporting EKM")
            val ekm = exportKeyingMaterial(socket)

            val password = pairCode.toByteArray(Charsets.US_ASCII) + ekm
            val spake2 = Spake2(Spake2.Role.CLIENT, password)

            val input = DataInputStream(socket.getInputStream())
            val output = DataOutputStream(socket.getOutputStream())

            // --- SPAKE2 exchange ---
            writePacket(output, TYPE_SPAKE2_MSG, spake2.myMsg)
            val theirMsg = readPacket(input, TYPE_SPAKE2_MSG)
            Log.i(TAG, "pairing: SPAKE2 messages exchanged (${theirMsg.size}B peer msg)")
            val cipher = PairingCipher(spake2.processMsg(theirMsg))

            // --- PeerInfo exchange (encrypted) ---
            val myInfo = ByteArray(PEER_INFO_DATA_SIZE + 1)
            myInfo[0] = PEER_INFO_TYPE_RSA_PUB_KEY
            val keyBytes = adbKey.adbPublicKeyString.toByteArray(Charsets.US_ASCII)
            System.arraycopy(keyBytes, 0, myInfo, 1, keyBytes.size)
            writePacket(output, TYPE_PEER_INFO, cipher.encrypt(myInfo))

            val theirInfo = cipher.decrypt(readPacket(input, TYPE_PEER_INFO))
            if (theirInfo[0] != PEER_INFO_TYPE_DEVICE_GUID) {
                throw PairingException("unexpected PeerInfo type ${theirInfo[0]}")
            }
            val guid = theirInfo.copyOfRange(1, theirInfo.size).let { raw ->
                val end = raw.indexOf(0).let { if (it < 0) raw.size else it }
                String(raw, 0, end, Charsets.US_ASCII)
            }
            Log.i(TAG, "pairing: SUCCESS, device guid=$guid")
            return Result(guid)
        } finally {
            try {
                socket.close()
            } catch (ignored: Exception) {
            }
        }
    }

    /**
     * TLS exporter ("adb-label" INCLUDING the trailing NUL, no context,
     * 64 bytes) via the bundled Conscrypt's public API (JSSE exposes no
     * exporters; the platform's hidden Conscrypt class is not
     * app-loadable — see wireless-debugging-setup.md §6). Proven on
     * blueline 2026-11-09.
     */
    private fun exportKeyingMaterial(socket: SSLSocket): ByteArray {
        try {
            // EKM comes from the bundled Conscrypt's public static API.
            // (The platform's hidden com.android.org.conscrypt.Conscrypt
            // is not loadable by apps — observed on blueline: Class.forName
            // fails for both names — so we ship our own provider.)
            val conscrypt = Class.forName("org.conscrypt.Conscrypt")
            val method = conscrypt.getMethod(
                "exportKeyingMaterial",
                SSLSocket::class.java,
                String::class.java,
                ByteArray::class.java,
                Int::class.java,
            )
            // "adb-label" + trailing NUL (AOSP passes sizeof() of the C
            // literal — 10 bytes). A Java/Kotlin string carries the NUL
            // through the charset conversion unharmed.
            val ekm = method.invoke(null, socket, "adb-label\u0000", null, 64) as ByteArray
            if (ekm.size != 64) throw PairingException("bad EKM size ${ekm.size}")
            return ekm
        } catch (e: PairingException) {
            throw e
        } catch (e: Exception) {
            throw PairingException("Conscrypt EKM unavailable: ${e.message}")
        }
    }

    /** PairingPacketHeader: u8 version, u8 type, u32 payload length (big-endian). */
    private fun writePacket(output: DataOutputStream, type: Byte, payload: ByteArray) {
        output.writeByte(PACKET_VERSION.toInt())
        output.writeByte(type.toInt())
        output.writeInt(payload.size)
        output.write(payload)
        output.flush()
    }

    private fun readPacket(input: DataInputStream, expectedType: Byte): ByteArray {
        val version = input.readByte()
        val type = input.readByte()
        val length = input.readInt()
        if (version != PACKET_VERSION) throw PairingException("bad packet version $version")
        if (type != expectedType) throw PairingException("bad packet type $type (expected $expectedType)")
        if (length <= 0 || length > MAX_PACKET_PAYLOAD) {
            throw PairingException("bad packet payload length $length")
        }
        val payload = ByteArray(length)
        input.readFully(payload)
        return payload
    }

    private companion object {
        const val TAG = "AdbWifiPair"

        // pairing_connection/pairing_connection.h + proto/pairing.proto
        const val PACKET_VERSION: Byte = 1
        const val TYPE_SPAKE2_MSG: Byte = 0
        const val TYPE_PEER_INFO: Byte = 1
        const val PEER_INFO_TYPE_RSA_PUB_KEY: Byte = 0
        const val PEER_INFO_TYPE_DEVICE_GUID: Byte = 1
        const val PEER_INFO_DATA_SIZE = 8191
        const val MAX_PACKET_PAYLOAD = 8192 * 2

        const val IO_TIMEOUT_MS = 15_000
    }
}
