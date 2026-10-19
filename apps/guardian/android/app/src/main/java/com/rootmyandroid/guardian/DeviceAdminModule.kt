package com.rootmyandroid.guardian

import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

/**
 * Device administrator control for Guardian Angel. An active admin cannot be
 * uninstalled through the package manager (DELETE_FAILED_DEVICE_POLICY_MANAGER),
 * which is the core tamper protection for a parental-control app.
 *
 * Note: true hiding via DevicePolicyManager.setApplicationHidden requires
 * device/profile OWNER (not a plain admin) and hidden apps cannot run in the
 * background, so the launcher-alias toggle remains the hide mechanism.
 */
class DeviceAdminModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "DeviceAdmin"

  private val adminComponent: ComponentName
    get() = ComponentName(reactApplicationContext, GuardianAdminReceiver::class.java)

  private val dpm: DevicePolicyManager
    get() =
      reactApplicationContext.getSystemService(Context.DEVICE_POLICY_SERVICE)
        as DevicePolicyManager

  @ReactMethod
  fun isActive(promise: Promise) {
    promise.resolve(dpm.isAdminActive(adminComponent))
  }

  /** Opens the system consent screen; the outcome is read back via isActive(). */
  @ReactMethod
  fun requestActivation(promise: Promise) {
    val activity = reactApplicationContext.currentActivity
    if (activity == null) {
      promise.reject("E_NO_ACTIVITY", "No foreground activity")
      return
    }
    // DeviceAdminAdd refuses to start as a new task, so launch from the
    // foreground activity without FLAG_ACTIVITY_NEW_TASK.
    val intent = Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
      putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, adminComponent)
      putExtra(
        DevicePolicyManager.EXTRA_ADD_EXPLANATION,
        "Guardian Angel protects this device: it cannot be removed while protection is on."
      )
    }
    activity.startActivity(intent)
    promise.resolve(true)
  }

  @ReactMethod
  fun deactivate(promise: Promise) {
    if (dpm.isAdminActive(adminComponent)) {
      dpm.removeActiveAdmin(adminComponent)
      promise.resolve(true)
    } else {
      promise.resolve(false)
    }
  }
}
