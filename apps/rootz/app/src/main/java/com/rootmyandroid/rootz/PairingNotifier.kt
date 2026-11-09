package com.rootmyandroid.rootz

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput

/**
 * Notification-based same-device pairing entry point.
 *
 * Why a notification: opening the Settings wireless-debugging pairing
 * dialog starts a server that lives ~10 seconds AND dies the instant the
 * Settings activity loses the foreground (measured on blueline,
 * 2026-11-09). Launching our activity to collect the code therefore
 * always kills the very server we need. An inline-reply notification lets
 * the user type the code from the shade while Settings stays in front —
 * the pattern Shizuku uses for the same problem.
 */
internal object PairingNotifier {

    const val CHANNEL_ID = "pairing"
    const val KEY_PAIR_CODE = "pair_code"
    const val REQUEST_CODE = 42
    const val PROMPT_ID = 4200
    const val RESULT_ID = 4201

    private fun manager(context: Context): NotificationManager {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Wireless debugging pairing", NotificationManager.IMPORTANCE_HIGH)
        )
        return nm
    }

    /** Posts (or refreshes) the notification carrying the inline code-entry field. */
    fun postPairingPrompt(context: Context, hint: String? = null) {
        val remoteInput = RemoteInput.Builder(KEY_PAIR_CODE)
            .setLabel("6-digit pairing code")
            .build()
        val replyIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            Intent(context, PairingReplyReceiver::class.java),
            PendingIntent.FLAG_MUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val action = NotificationCompat.Action.Builder(0, "Pair", replyIntent)
            .addRemoteInput(remoteInput)
            .build()
        val text = hint
            ?: "Open Settings → Wireless debugging → “Pair device with pairing code”, then type the 6-digit code here — within ~10 s, without leaving Settings."
        val notification: Notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("Rootz wireless pairing")
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .addAction(action)
            .setOngoing(true)
            .build()
        manager(context).notify(PROMPT_ID, notification)
    }

    fun postResult(context: Context, success: Boolean, message: String) {
        manager(context).cancel(PROMPT_ID)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(
                if (success) android.R.drawable.stat_sys_download_done
                else android.R.drawable.stat_notify_error
            )
            .setContentTitle(if (success) "Rootz: paired" else "Rootz: pairing failed")
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setAutoCancel(true)
            .build()
        manager(context).notify(RESULT_ID, notification)
    }
}
