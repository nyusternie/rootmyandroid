// apps/guardian-angel/android/app/src/main/java/com/rootmyandroid/guardian_angel/GuardianNotifier.kt
package com.rootmyandroid.guardian_angel

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

/**
 * The app's only entry point (owner order 2026-11-25, option B: no launcher
 * entry at all, notifications are how the app is opened).
 *
 * A Guardian Angel that sits in the drawer is not a Guardian Angel — the
 * managed phone should not advertise the monitor. The notification is the
 * deliberate, visible handle: tap it (or its Open action) and the app comes
 * up. It is posted at boot and whenever the app runs.
 */
internal object GuardianNotifier {

    const val CHANNEL_ID = "guardian"
    const val NOTIFICATION_ID = 4400

    fun post(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Guardian Angel",
                NotificationManager.IMPORTANCE_LOW,
            ),
        )
        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Guardian Angel")
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
