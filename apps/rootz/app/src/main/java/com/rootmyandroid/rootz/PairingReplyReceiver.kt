package com.rootmyandroid.rootz

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.RemoteInput
import kotlin.concurrent.thread

/**
 * Receives the 6-digit code typed into the pairing notification's inline
 * reply and runs the pairing flow headless (no activity — foregrounding
 * an activity kills the Settings pairing server).
 */
class PairingReplyReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val code = RemoteInput.getResultsFromIntent(intent)
            ?.getCharSequence(PairingNotifier.KEY_PAIR_CODE)
            ?.toString()
            ?.trim()
            ?: return
        if (!Regex("\\d{6}").matches(code)) {
            PairingNotifier.postResult(context, false, "The code is exactly 6 digits — try again.")
            PairingNotifier.postPairingPrompt(context)
            return
        }
        val pending = goAsync()
        val appContext = context.applicationContext
        thread {
            try {
                pair(appContext, code)
            } finally {
                pending.finish()
            }
        }
    }

    private fun pair(context: Context, code: String) {
        // Fresh discovery instance => fresh NSD session (long-running
        // sessions silently stop delivering callbacks — observed on
        // blueline).
        val discovery = AdbWifiDiscovery(context)
        discovery.start()
        var ep: Pair<String, Int>? = null
        var tries = 0
        while (ep == null && tries < 40) {
            Thread.sleep(100)
            ep = discovery.pairingEndpoint
            tries += 1
        }
        discovery.stop()
        if (ep == null) {
            PairingNotifier.postResult(context, false, "No _adb-tls-pairing service found — open the pairing dialog first.")
            PairingNotifier.postPairingPrompt(context)
            return
        }
        var result: PairingSession.Result? = null
        repeat(3) { i ->
            if (result != null) return@repeat
            if (i > 0) Thread.sleep(400)
            try {
                result = PairingSession(ep.first, ep.second, code, AdbKeyStore.get(context)).run()
            } catch (e: Exception) {
                Log.e("RootzPair", "notification pairing attempt ${i + 1} failed", e)
            }
        }
        if (result != null) {
            PairingNotifier.postResult(context, true, "device guid: ${result!!.deviceGuid}")
        } else {
            PairingNotifier.postResult(context, false, "Wrong code or the server expired (~10 s window) — re-open the dialog and retry.")
            PairingNotifier.postPairingPrompt(context)
        }
    }
}
