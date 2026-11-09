package com.rootmyandroid.rootz

import android.util.Log
import java.io.DataInputStream
import java.io.DataOutputStream
import java.net.InetSocketAddress
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.KeyManagerFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager

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
        // Same-device pairing quirk (observed on blueline 2026-11-09):
        // connecting to the device's OWN external interface address gets
        // ECONNREFUSED for an app UID, while the adb shell UID and remote
        // LAN hosts connect fine, and adbd's pairing listener is bound to
        // all interfaces. Loopback works for any UID, so substitute it
        // when the mDNS-resolved host is one of our own addresses.
        // (Exact filtering mechanism unverified — Magisk/netd per-UID
        // rules are the suspect.)
        val connectHost = if (isOwnAddress(host)) "127.0.0.1" else host
        Log.i(TAG, "pairing: connecting to $connectHost:$port (resolved as $host)")
        val socket = openTlsSocket(connectHost)
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
     * TLS 1.3 client socket with verification disabled (the ADB design:
     * the channel is authenticated by the PAKE bound to the EKM, not by
     * PKI) and our self-signed cert available when the server requests
     * client authentication.
     */
    private fun isOwnAddress(host: String): Boolean = try {
        java.net.NetworkInterface.getNetworkInterfaces().toList().any { ni ->
            ni.inetAddresses.toList().any { it.hostAddress == host }
        }
    } catch (e: Exception) {
        false
    }

    private fun openTlsSocket(connectHost: String): SSLSocket {
        ensureBundledConscrypt()
        val keyStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null) }
        val cert = CertificateFactory.getInstance("X.509")
            .generateCertificate(adbKey.certificateDer.inputStream()) as X509Certificate
        keyStore.setKeyEntry(KEY_ALIAS, adbKey.keyPair.private, null, arrayOf(cert))

        val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
        kmf.init(keyStore, null)

        val trustAll = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }

        val context = SSLContext.getInstance("TLSv1.3")
        context.init(kmf.keyManagers, arrayOf<TrustManager>(trustAll), null)

        val socket = context.socketFactory.createSocket() as SSLSocket
        socket.enabledProtocols = arrayOf("TLSv1.3")
        socket.connect(InetSocketAddress(connectHost, port), CONNECT_TIMEOUT_MS)
        socket.soTimeout = IO_TIMEOUT_MS
        socket.startHandshake()
        return socket
    }

    /**
     * TLS exporter ("adb-label" INCLUDING the trailing NUL, no context,
     * 64 bytes) via Conscrypt. JSSE does not expose exporters; Conscrypt
     * is the platform TLS provider on Android 10+. If reflection is
     * blocked on some device/API level this throws PairingException and
     * the documented fallback is bundling the conscrypt-android Maven
     * artifact (see wireless-debugging-setup.md §6). PENDING first
     * on-device validation.
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

    /**
     * Installs the bundled Conscrypt as the top-priority provider (once).
     * The platform Conscrypt registers as "AndroidOpenSSL"; the bundled
     * one as "Conscrypt", so a name check is unambiguous.
     */
    private fun ensureBundledConscrypt() {
        if (java.security.Security.getProvider("Conscrypt") != null) return
        synchronized(PairingSession::class.java) {
            if (java.security.Security.getProvider("Conscrypt") != null) return
            val provider = Class.forName("org.conscrypt.Conscrypt")
                .getMethod("newProvider")
                .invoke(null) as java.security.Provider
            java.security.Security.insertProviderAt(provider, 1)
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

        const val CONNECT_TIMEOUT_MS = 10_000
        const val IO_TIMEOUT_MS = 15_000
        const val KEY_ALIAS = "rootz-adb"
    }
}
