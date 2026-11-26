// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/RootzNotifier.kt
package com.rootmyandroid.rootz

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

/**
 * Entry point for the launcher-less Rootz (owner order 2026-11-25, option B:
 * no launcher entry, notifications are how the app is opened).
 *
 * Separate from the relay service's status notification so the app stays
 * reachable even after Disconnect stops the service. Posted whenever the app
 * runs and after a reboot.
 */
internal object RootzNotifier {

    const val CHANNEL_ID = "rootz-entry"
    const val NOTIFICATION_ID = 4500

    fun post(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Rootz", NotificationManager.IMPORTANCE_LOW),
        )
        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.rootz_notif)
            .setContentTitle("Rootz")
            .setContentText("Tap to open")
            .setContentIntent(open)
            .addAction(0, "Open", open)
            .setOngoing(true)
            .setSilent(true)
            .setShowWhen(false)
            .build()
        runCatching { nm.notify(NOTIFICATION_ID, notification) }
    }
}
