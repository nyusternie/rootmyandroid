package com.rootmyandroid.rootz

import java.net.InetSocketAddress
import java.security.KeyStore
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.TrustManager
import javax.net.ssl.X509TrustManager
import javax.net.ssl.KeyManagerFactory

/**
 * Shared TLS setup for adbd wireless connections (pairing AND connect
 * phases). Rules, all from the AOSP pairing/tls sources + blueline
 * measurements:
 *
 * - Exactly TLS 1.3, mutual auth, verification OFF — the channel is
 *   authenticated by SPAKE2 (pairing) or the ADB key handshake (connect),
 *   never by PKI.
 * - The client presents the app's persistent RSA-2048 identity.
 * - The bundled Conscrypt provider ("Conscrypt") is installed at priority
 *   1; the platform provider is "AndroidOpenSSL" — no name collision.
 * - Same-device connects must target 127.0.0.1 when the resolved host is
 *   one of our own interface addresses (app-UID → own external IP is
 *   refused on blueline; mechanism unverified).
 */
internal object AdbTls {

    private const val CONNECT_TIMEOUT_MS = 3_000
    private const val IO_TIMEOUT_MS = 5_000

    fun isOwnAddress(host: String): Boolean = try {
        java.net.NetworkInterface.getNetworkInterfaces().toList().any { ni ->
            ni.inetAddresses.toList().any { it.hostAddress == host }
        }
    } catch (e: Exception) {
        false
    }

    fun ensureBundledConscrypt() {
        if (java.security.Security.getProvider("Conscrypt") != null) return
        synchronized(AdbTls::class.java) {
            if (java.security.Security.getProvider("Conscrypt") != null) return
            val provider = Class.forName("org.conscrypt.Conscrypt")
                .getMethod("newProvider")
                .invoke(null) as java.security.Provider
            java.security.Security.insertProviderAt(provider, 1)
        }
    }

    fun open(host: String, port: Int, adbKey: AdbKey, ioTimeoutMs: Int = IO_TIMEOUT_MS): SSLSocket {
        ensureBundledConscrypt()
        val keyStore = KeyStore.getInstance(KeyStore.getDefaultType()).apply { load(null) }
        val cert = CertificateFactory.getInstance("X.509")
            .generateCertificate(adbKey.certificateDer.inputStream()) as X509Certificate
        keyStore.setKeyEntry("adb", adbKey.keyPair.private, null, arrayOf(cert))

        val kmf = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm())
        kmf.init(keyStore, null)

        val trustAll = object : X509TrustManager {
            override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
            override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
        }

        val context = SSLContext.getInstance("TLSv1.3")
        context.init(kmf.keyManagers, arrayOf<TrustManager>(trustAll), null)

        val connectHost = if (isOwnAddress(host)) "127.0.0.1" else host
        val socket = context.socketFactory.createSocket() as SSLSocket
        socket.enabledProtocols = arrayOf("TLSv1.3")
        socket.connect(InetSocketAddress(connectHost, port), CONNECT_TIMEOUT_MS)
        socket.soTimeout = ioTimeoutMs
        socket.startHandshake()
        return socket
    }
}
