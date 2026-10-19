package com.rootmyandroid.guardian

import android.app.admin.DeviceAdminReceiver

/**
 * Receives device-admin lifecycle callbacks. The protective behavior comes
 * from the declared policies (res/xml/device_admin_policies.xml) plus the
 * mere fact of being an active admin: the package manager refuses to
 * uninstall an app with an active device administrator.
 */
class GuardianAdminReceiver : DeviceAdminReceiver()
