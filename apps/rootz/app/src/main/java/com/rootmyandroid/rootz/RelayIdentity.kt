// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/RelayIdentity.kt
package com.rootmyandroid.rootz

import android.content.Context
import java.io.File
import java.security.SecureRandom

/**
 * The APK-daemon's persistent Ed25519 identity (relay-DAEMON role, owner
 * ruling 2026-11-11). Mirrors rootzd's identity.rs: the raw 32-byte seed
 * lives in an app-private file (rootzd uses <state>/device.key; the APK
 * uses filesDir/relay/device.key). Android Keystore Ed25519 requires API
 * 33+ and blueline ships Android 12, so app-private storage is the
 * portable tier — the same trade rootzd itself makes.
 *
 * device_id = lowercase hex SHA-256(raw pubkey) — the API's pairing
 * derivation (e2e-protocol.md §1). This is the value the device holder
 * shows/pastes to pair the phone into a Root My Android account.
 *
 * Load cost: one Ed25519 scalar multiplication (BigInteger arithmetic) —
 * run [loadOrGenerate] off the UI thread.
 */
internal class RelayIdentity private constructor(
    val seed: ByteArray,
    val pubkey: ByteArray,
    val deviceId: String,
) {

    fun sign(message: ByteArray): ByteArray = Ed25519.sign(seed, message)

    companion object {
        private const val DIR = "relay"
        private const val KEY_FILE = "device.key"

        fun loadOrGenerate(context: Context): RelayIdentity {
            val dir = File(context.filesDir, DIR).apply { mkdirs() }
            val keyPath = File(dir, KEY_FILE)
            val seed = if (keyPath.isFile) {
                val bytes = keyPath.readBytes()
                require(bytes.size == 32) { "device.key is not 32 bytes" }
                bytes
            } else {
                ByteArray(32).also { SecureRandom().nextBytes(it) }.also { keyPath.writeBytes(it) }
            }
            val pubkey = Ed25519.publicKey(seed)
            return RelayIdentity(seed, pubkey, E2eSession.deviceIdFromPubkey(pubkey))
        }
    }
}
