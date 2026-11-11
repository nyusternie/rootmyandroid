package com.rootmyandroid.rootz

import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Relay transport — the production E2E path (apps/rootzd/docs/
 * e2e-protocol.md v1). Blocking [run] mirrors AdbConnection's shape so
 * MainActivity routes transports symmetrically on its background thread.
 *
 * One command per session: stdin is "<cmd>\nexit\n" — the piped shell
 * EOF-exits and the daemon ends the session with an `exit` frame (the
 * same semantics as the v26.11.8 TCP terminal and the web /terminal).
 * Identity is proven by the handshake itself (device-id binding +
 * transcript signature); account-number auth happens at the relay.
 */
internal class RelayConnection(
    private val deviceId: String,
    private val account: String,
) {

    class Result(
        val name: String?,
        val tier: String,
        val version: String,
        val output: String,
    )

    class RelayException(message: String) : Exception(message)

    fun run(command: String): Result {
        val session = E2eSession.ClientSession()
        val done = CountDownLatch(1)
        val output = StringBuilder()
        var name: String? = null
        var tier = ""
        var version = ""
        var failure: String? = null

        // Set when the daemon ends the session normally (`exit` frame) —
        // the relay's close-frame reply to our close() must NOT be
        // reported as a failure afterwards. All listener callbacks fire on
        // WsClient's single reader thread and run() reads only after the
        // CountDownLatch's happens-before edge, so plain locals suffice.
        var completed = false

        val ws = WsClient(RELAY_HOST, "/connect?device=$deviceId&account=$account")
        ws.connect(object : WsClient.Listener {
            override fun onOpen() {
                ws.send(E2eSession.clientHello(session).second)
            }

            override fun onMessage(text: String) {
                when (val frame = E2eSession.parseFrame(text)) {
                    is E2eSession.Frame.Welcome -> {
                        try {
                            E2eSession.processWelcome(session, frame, deviceId)
                        } catch (e: E2eSession.E2eException) {
                            failure = "handshake failed: ${e.message}"
                            ws.close()
                            done.countDown()
                            return
                        }
                        ws.send(E2eSession.sealInner(session, E2eSession.encodeStdin("$command\nexit\n".toByteArray())))
                    }
                    is E2eSession.Frame.Enc -> {
                        when (val inner = E2eSession.openInner(session, frame)) {
                            null -> {
                                // Spec §2.4: an authentication failure aborts the session.
                                failure = "encrypted frame failed authentication — session aborted"
                                ws.close()
                                done.countDown()
                            }
                            is E2eSession.Inner.SessionInfo -> {
                                name = inner.name
                                tier = inner.tier
                                version = inner.version
                            }
                            is E2eSession.Inner.Stdout -> output.append(String(inner.d))
                            is E2eSession.Inner.Stderr -> output.append(String(inner.d))
                            is E2eSession.Inner.Exit -> {
                                completed = true
                                ws.close()
                                done.countDown()
                            }
                            E2eSession.Inner.Other -> Unit // broadcast for another client — skip
                        }
                    }
                    is E2eSession.Frame.Err -> {
                        failure = "daemon refused the session: ${frame.code}"
                        ws.close()
                        done.countDown()
                    }
                    E2eSession.Frame.Other -> Unit
                }
            }

            override fun onClosed(code: Int, reason: String) {
                if (!completed && failure == null) {
                    failure = closeHint(code, reason)
                }
                done.countDown()
            }

            override fun onFailure(error: Exception) {
                if (!completed && failure == null) {
                    failure = "relay: ${error.message ?: error.javaClass.simpleName}"
                }
                done.countDown()
            }
        })

        if (!done.await(RUN_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
            ws.close()
            throw RelayException("timed out waiting for the device (${RUN_TIMEOUT_MS / 1000}s)")
        }
        failure?.let { throw RelayException(it) }
        return Result(name, tier, version, output.toString())
    }

    private fun closeHint(code: Int, reason: String): String = when (code) {
        // Meanings per apps/rootzd/docs/relay-handoff.md.
        4401 -> "relay rejected the account — check the 16-digit account number"
        4403 -> "device REVOKED by the kill switch — re-pair rootzd on the device"
        4404 -> "device offline — rootzd is not connected to the relay"
        4409 -> "frame too large (relay cap)"
        4429 -> "rate limited by the relay — wait a moment and retry"
        1012 -> "relay is restarting — retry in a moment"
        else -> "relay closed (code $code)${if (reason.isNotEmpty()) ": $reason" else ""}"
    }

    companion object {
        private const val RELAY_HOST = "relay.rootmyandroid.com"
        private const val RUN_TIMEOUT_MS = 30_000L
    }
}
