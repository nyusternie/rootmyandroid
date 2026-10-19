package com.rootmyandroid.guardian

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Triggers the system uninstall dialog for this app. While Guardian Angel's
 * device administrator is active the package manager would refuse removal
 * (DELETE_FAILED_DEVICE_POLICY_MANAGER), so refuse up front with E_PROTECTED
 * and let the JS side explain that protection must be turned off first.
 */
class UninstallModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "Uninstall"

  @ReactMethod
  fun requestUninstall(promise: Promise) {
    val dpm =
      reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE)
        as DevicePolicyManager
    val admin = ComponentName(reactApplicationContext, GuardianAdminReceiver::class.java)
    if (dpm.isAdminActive(admin)) {
      promise.reject("E_PROTECTED", "Device administrator is active")
      return
    }
    val intent = Intent(Intent.ACTION_DELETE).apply {
      data = Uri.parse("package:" + reactApplicationContext.packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    reactApplicationContext.startActivity(intent)
    promise.resolve(true)
  }
}
