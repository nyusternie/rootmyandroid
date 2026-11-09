package com.rootmyandroid.rootz

import android.content.Context
import android.util.Base64

/**
 * Process-wide access to the app's persistent ADB identity key, shared by
 * MainActivity (in-app pairing) and PairingReplyReceiver (notification
 * inline-reply pairing).
 */
internal object AdbKeyStore {

    @Volatile
    private var cached: AdbKey? = null

    @Synchronized
    fun get(context: Context): AdbKey {
        cached?.let { return it }
        val prefs = context.applicationContext.getSharedPreferences("rootz", Context.MODE_PRIVATE)
        val privB64 = prefs.getString("adb_priv", null)
        val pubB64 = prefs.getString("adb_pub", null)
        // Storage format (PKCS8 private + X.509 public, Base64 NO_WRAP)
        // matches what MainActivity.loadOrCreateAdbKey historically wrote —
        // do not change it, or identities persisted on-device break.
        val key = if (privB64 != null && pubB64 != null) {
            AdbKey.restore(Base64.decode(privB64, Base64.NO_WRAP), Base64.decode(pubB64, Base64.NO_WRAP))
        } else {
            AdbKey.generate().also {
                prefs.edit()
                    .putString("adb_priv", Base64.encodeToString(it.keyPair.private.encoded, Base64.NO_WRAP))
                    .putString("adb_pub", Base64.encodeToString(it.keyPair.public.encoded, Base64.NO_WRAP))
                    .apply()
            }
        }
        cached = key
        return key
    }
}
