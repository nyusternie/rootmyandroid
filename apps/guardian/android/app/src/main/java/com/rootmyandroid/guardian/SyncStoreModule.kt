package com.rootmyandroid.guardian

import android.content.Context
import android.os.Build
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Persists the Rooted-account pairing in app-private SharedPreferences.
 * The 16-digit account number is the credential for PRO features (remote
 * access to this device's encrypted data), so it is stored in full; it never
 * leaves app-private storage except over TLS to the API.
 */
class SyncStoreModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  private val prefs =
    reactApplicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  override fun getName(): String = "SyncStore"

  @ReactMethod
  fun saveSync(accountNumber: String, deviceId: String, promise: Promise) {
    try {
      prefs.edit()
        .putString(KEY_ACCOUNT, accountNumber)
        .putString(KEY_DEVICE, deviceId)
        .apply()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SYNC_STORE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun getSync(promise: Promise) {
    try {
      val account = prefs.getString(KEY_ACCOUNT, null)
      val device = prefs.getString(KEY_DEVICE, null)
      if (account == null || device == null) {
        promise.resolve(null)
      } else {
        val map = Arguments.createMap()
        map.putString("accountNumber", account)
        map.putString("deviceId", device)
        promise.resolve(map)
      }
    } catch (e: Exception) {
      promise.reject("SYNC_STORE_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun clearSync(promise: Promise) {
    try {
      prefs.edit().clear().apply()
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("SYNC_STORE_ERROR", e.message, e)
    }
  }

  /** Human-readable device label sent to the API at sync time. */
  @ReactMethod
  fun getDeviceName(promise: Promise) {
    try {
      promise.resolve("${Build.MANUFACTURER} ${Build.MODEL}".trim())
    } catch (e: Exception) {
      promise.reject("SYNC_STORE_ERROR", e.message, e)
    }
  }

  companion object {
    private const val PREFS_NAME = "sync_store"
    private const val KEY_ACCOUNT = "account_number"
    private const val KEY_DEVICE = "device_id"
  }
}
