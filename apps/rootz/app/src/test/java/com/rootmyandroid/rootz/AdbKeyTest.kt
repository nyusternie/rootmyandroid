package com.rootmyandroid.rootz

import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import javax.security.auth.x500.X500Principal
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The hand-rolled DER X.509 certificate in AdbKey is presented to adbd in
 * the pairing/connect TLS handshakes — if it fails to parse, pairing dies
 * before SPAKE2 (observed on blueline 2026-11-09: Conscrypt
 * "No certificate found" caused by a missing AttributeTypeAndValue
 * SEQUENCE in the RDN). These tests pin the certificate's structure and
 * self-signature so a regression fails in CI, not on-device.
 *
 * Pure-JVM: certificateDer touches only java.security/java.text, never
 * android.* (adbPublicKeyString uses android.util.Base64 and is therefore
 * intentionally not exercised here — it does not affect the TLS handshake).
 */
class AdbKeyTest {

    private fun parse(key: AdbKey): X509Certificate {
        val cf = CertificateFactory.getInstance("X.509")
        return cf.generateCertificate(key.certificateDer.inputStream()) as X509Certificate
    }

    @Test
    fun certificateParsesAsX509V3() {
        val cert = parse(AdbKey.generate())
        assertEquals(3, cert.version)
        assertEquals("SHA256withRSA", cert.sigAlgName)
        cert.checkValidity() // throws if now is outside the validity window
    }

    @Test
    fun certificateIsSelfSignedWithAdbName() {
        val key = AdbKey.generate()
        val cert = parse(key)
        val expected = X500Principal("CN=Adb,O=Android,C=US")
        assertEquals(expected, cert.subjectX500Principal)
        assertEquals(expected, cert.issuerX500Principal)
        // Throws SignatureException/InvalidKeyException if the signature
        // over the TBSCertificate does not verify against the enclosed key.
        cert.verify(key.keyPair.public)
    }

    @Test
    fun certificateCarriesAdbExtensions() {
        val cert = parse(AdbKey.generate())
        // basicConstraints: CA=true, no path-length constraint.
        assertEquals(Integer.MAX_VALUE, cert.basicConstraints)
        // keyUsage: digitalSignature(0) | keyCertSign(5) | cRLSign(6).
        val usage = cert.keyUsage
        assertNotNull(usage)
        assertTrue(usage[0])
        assertTrue(usage[5])
        assertTrue(usage[6])
        // subjectKeyIdentifier present (content is cosmetic for adbd).
        assertNotNull(cert.subjectKeyIdentifier)
    }

    @Test
    fun certificateDerIsDeterministicForSameKey() {
        // The lazy property must encode the same key identically on each
        // access within the process (the TLS stack and the PeerInfo both
        // consume it).
        val key = AdbKey.generate()
        assertArrayEquals(key.certificateDer, key.certificateDer)
    }
}
