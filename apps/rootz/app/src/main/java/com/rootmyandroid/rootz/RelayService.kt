// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/RelayService.kt
package com.rootmyandroid.rootz

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import kotlin.concurrent.thread

/**
 * Foreground host for the relay daemon (owner order 2026-11-25: the lane
 * must come back after a reboot and keep running with the app closed).
 *
 * Before this the daemon lived in MainActivity and died with it; Android
 * also freezes backgrounded processes, so the tunnel could not survive a
 * screen-off. A foreground service with a user-visible notification is
 * the only supported way to keep it alive.
 *
 * Lifecycle: started by MainActivity ("PAIR & START RELAY DAEMON") and by
 * BootReceiver after BOOT_COMPLETED / an app update. START_STICKY, so the
 * system restarts it if it is killed. ACTION_STOP stops it (Disconnect).
 * The account number lives in the "relay" prefs; no account → no service.
 */
internal class RelayService : Service() {

    @Volatile
    private var daemon: RelayDaemon? = null

    @Volatile
    private var identity: RelayIdentity? = null

    /** Daemon status → the persistent notification's text. */
    private val statusListener: (String) -> Unit = { text -> updateNotification(text) }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        channel()
        RelayBus.addListener(statusListener)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }
        val account = getSharedPreferences(PREFS_RELAY, MODE_PRIVATE)
            .getString(KEY_ACCOUNT, null)
            ?.trim()
        if (account == null || account.length != 16) {
            // Disconnected (or never paired): nothing to run.
            stopSelf()
            return START_NOT_STICKY
        }
        // Must be foreground within ~5 s of startForegroundService().
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            buildNotification(RelayBus.status),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
        )
        if (daemon == null) startDaemon(account)
        return START_STICKY
    }

    override fun onDestroy() {
        RelayBus.removeListener(statusListener)
        daemon?.stop()
        daemon = null
        super.onDestroy()
    }

    private fun startDaemon(account: String) {
        // The identity load is one BigInteger scalar multiplication — never
        // on the service's main thread (same rule as the activity's QR
        // build).
        thread {
            if (daemon != null) return@thread
            val id = identity ?: RelayIdentity.loadOrGenerate(this).also { identity = it }
            val version = packageManager.getPackageInfo(packageName, 0).versionName ?: "unknown"
            val d = RelayDaemon(
                context = applicationContext,
                account = account,
                identity = id,
                tier = "shell",
                version = version,
                deviceName = android.os.Build.MODEL,
                adbWifi = AdbWifi.get(this),
                guard = CommandGuard(this),
                onStatus = { msg -> RelayBus.set(msg) },
                onReceipt = { line -> android.util.Log.i(TAG, line) },
            )
            daemon = d
            d.start()
        }
    }

    // --- notification -------------------------------------------------------------

    private fun channel() {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Relay tunnel", NotificationManager.IMPORTANCE_LOW)
        )
    }

    private fun buildNotification(status: String): Notification {
        val open = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Rootz relay")
            .setContentText(status)
            .setStyle(NotificationCompat.BigTextStyle().bigText(status))
            .setContentIntent(open)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .build()
    }

    private fun updateNotification(status: String) {
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        runCatching { nm.notify(NOTIFICATION_ID, buildNotification(status)) }
    }

    companion object {
        const val ACTION_STOP = "com.rootmyandroid.rootz.action.STOP_RELAY"
        const val CHANNEL_ID = "relay"
        const val NOTIFICATION_ID = 4300
        const val PREFS_RELAY = "relay"
        const val KEY_ACCOUNT = "account"
        private const val TAG = "RootzRelay"

        /** Starts (or refreshes) the lane; no-op when no account is stored. */
        fun start(context: Context) {
            val intent = Intent(context, RelayService::class.java)
            androidx.core.content.ContextCompat.startForegroundService(context, intent)
        }

        fun stop(context: Context) {
            val intent = Intent(context, RelayService::class.java).setAction(ACTION_STOP)
            context.startService(intent)
        }
    }
}
