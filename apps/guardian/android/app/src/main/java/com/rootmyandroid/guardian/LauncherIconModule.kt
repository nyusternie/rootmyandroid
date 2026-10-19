package com.rootmyandroid.guardian

import android.content.ComponentName
import android.content.pm.PackageManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LauncherIconModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LauncherIcon"

  @ReactMethod
  fun setLauncherIconVisible(visible: Boolean, promise: Promise) {
    try {
      val context = reactApplicationContext
      val alias = ComponentName(context.packageName, "${context.packageName}.LauncherAlias")
      val state = if (visible) {
        PackageManager.COMPONENT_ENABLED_STATE_ENABLED
      } else {
        PackageManager.COMPONENT_ENABLED_STATE_DISABLED
      }
      context.packageManager.setComponentEnabledSetting(
        alias,
        state,
        PackageManager.DONT_KILL_APP
      )
      promise.resolve(visible)
    } catch (e: Exception) {
      promise.reject("LAUNCHER_ICON_ERROR", e.message, e)
    }
  }

  @ReactMethod
  fun isLauncherIconVisible(promise: Promise) {
    try {
      val context = reactApplicationContext
      val alias = ComponentName(context.packageName, "${context.packageName}.LauncherAlias")
      val state = context.packageManager.getComponentEnabledSetting(alias)
      // COMPONENT_ENABLED_STATE_DEFAULT means "manifest default" (we ship enabled=true)
      promise.resolve(state != PackageManager.COMPONENT_ENABLED_STATE_DISABLED)
    } catch (e: Exception) {
      promise.reject("LAUNCHER_ICON_ERROR", e.message, e)
    }
  }
}
