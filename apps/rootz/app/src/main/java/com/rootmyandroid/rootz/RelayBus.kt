// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/RelayBus.kt
package com.rootmyandroid.rootz

import java.util.concurrent.CopyOnWriteArraySet

/**
 * Process-wide relay status, shared by the foreground service (which owns
 * the daemon since 2026-11-25) and MainActivity's daemon card.
 *
 * Before the service existed the daemon lived in the activity and posted
 * its status straight into a TextView. The daemon now outlives the
 * activity (reboot + background survival), so the status is published
 * here and whoever is showing it listens. The last value is kept so a
 * freshly opened activity paints the current state immediately.
 */
internal object RelayBus {

    @Volatile
    var status: String = "relay: idle — scan the QR or enter your 16-digit account number"
        private set

    private val listeners = CopyOnWriteArraySet<(String) -> Unit>()

    /** Called from daemon background threads. */
    fun set(text: String) {
        status = text
        for (listener in listeners) listener(text)
    }

    /** Registers [listener] and immediately delivers the current status. */
    fun addListener(listener: (String) -> Unit) {
        listeners.add(listener)
        listener(status)
    }

    fun removeListener(listener: (String) -> Unit) {
        listeners.remove(listener)
    }
}
