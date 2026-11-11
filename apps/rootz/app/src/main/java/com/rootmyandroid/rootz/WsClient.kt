package com.rootmyandroid.rootz

import java.io.EOFException
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.net.InetSocketAddress
import java.security.MessageDigest
import java.security.SecureRandom
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory

/**
 * Minimal RFC 6455 WebSocket client over TLS — just enough for the relay
 * (wss://relay.rootmyandroid.com/tunnel?device=…): text messages, ping/pong,
 * close codes, continuation reassembly. Hand-rolled (no OkHttp) to match
 * the app's from-scratch identity and keep the APK lean.
 *
 * Wire rules honored: client frames are masked; server frames must not be;
 * extended 16/64-bit payload lengths are supported (relay caps frames at
 * 64 KiB — e2e-protocol.md §0).
 *
 * Threading: one reader thread delivers listener callbacks; [send]/[close]
 * are safe from any thread (serialized on an internal lock). Callers
 * (MainActivity) post to the UI thread themselves.
 *
 * Known v1 limitation: no read timeout — a silently-dead relay is only
 * detected on the next send (documented; idle sessions are the daemon's
 * 600 s reaper's business, not ours).
 */
internal class WsClient(
    private val host: String,
    private val path: String,
) {

    interface Listener {
        fun onOpen()
        fun onMessage(text: String)
        fun onClosed(code: Int, reason: String)
        fun onFailure(error: Exception)
    }

    private val random = SecureRandom()
    private val sendLock = Any()

    private var socket: SSLSocket? = null
    private var input: InputStream? = null
    private var output: OutputStream? = null

    @Volatile
    private var closeSent = false

    @Volatile
    private var callbackDelivered = false

    fun connect(listener: Listener) {
        Thread {
            try {
                val s = SSLSocketFactory.getDefault().createSocket() as SSLSocket
                s.connect(InetSocketAddress(host, 443), CONNECT_TIMEOUT_MS)
                s.startHandshake()
                socket = s
                input = s.getInputStream()
                output = s.outputStream
                handshake(listener)
                readLoop(listener)
                try {
                    socket?.close()
                } catch (_: IOException) {
                    // Already closing — nothing left to do.
                }
            } catch (e: Exception) {
                try {
                    socket?.close()
                } catch (_: IOException) {
                    // Already broken — nothing left to do.
                }
                fail(listener, e)
            }
        }.apply { isDaemon = true; name = "ws-reader" }.start()
    }

    fun send(text: String) {
        val payload = text.toByteArray(Charsets.UTF_8)
        synchronized(sendLock) {
            val out = output ?: throw IOException("not connected")
            out.write(frame(0x1, payload))
            out.flush()
        }
    }

    fun close(code: Int = 1000, reason: String = "") {
        synchronized(sendLock) {
            if (closeSent) return
            closeSent = true
            val body = byteArrayOf((code ushr 8).toByte(), code.toByte()) + reason.toByteArray(Charsets.UTF_8)
            try {
                output?.write(frame(0x8, body))
                output?.flush()
            } catch (_: IOException) {
                // The peer is already gone — nothing left to do.
            }
        }
    }

    // --- HTTP upgrade (RFC 6455 §4) -------------------------------------------

    private fun handshake(listener: Listener) {
        val key = ByteArray(16).also { random.nextBytes(it) }
        val keyB64 = E2eSession.B64.encode(key)
        val request = (
            "GET $path HTTP/1.1\r\n" +
                "Host: $host\r\n" +
                "Upgrade: websocket\r\n" +
                "Connection: Upgrade\r\n" +
                "Sec-WebSocket-Key: $keyB64\r\n" +
                "Sec-WebSocket-Version: 13\r\n" +
                "\r\n"
            ).toByteArray(Charsets.US_ASCII)
        synchronized(sendLock) {
            output!!.write(request)
            output!!.flush()
        }

        val statusLine = readHttpLine()
        if (!statusLine.startsWith("HTTP/1.1 101") && !statusLine.startsWith("HTTP/1.0 101")) {
            throw IOException("websocket upgrade refused: $statusLine")
        }
        var acceptOk = false
        while (true) {
            val line = readHttpLine()
            if (line.isEmpty()) break
            if (line.startsWith("Sec-WebSocket-Accept:", ignoreCase = true)) {
                val expect = E2eSession.B64.encode(
                    MessageDigest.getInstance("SHA-1")
                        .digest((keyB64 + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").toByteArray(Charsets.US_ASCII)),
                )
                acceptOk = line.substringAfter(':').trim() == expect
            }
        }
        if (!acceptOk) throw IOException("bad Sec-WebSocket-Accept")
        listener.onOpen()
    }

    /** Reads one CRLF-terminated header line; "" on the blank terminator. */
    private fun readHttpLine(): String {
        val sb = StringBuilder()
        while (true) {
            val b = input!!.read()
            if (b < 0) throw EOFException("connection closed during upgrade")
            if (b == '\r'.code) continue
            if (b == '\n'.code) return sb.toString()
            sb.append(b.toChar())
        }
    }

    // --- frame codec (RFC 6455 §5) ---------------------------------------------

    private fun frame(opcode: Int, payload: ByteArray): ByteArray {
        val mask = ByteArray(4).also { random.nextBytes(it) }
        val header = ArrayList<Byte>(14)
        header.add((0x80 or opcode).toByte()) // FIN + opcode
        when {
            payload.size < 126 -> header.add((0x80 or payload.size).toByte())
            payload.size < 65536 -> {
                header.add((0x80 or 126).toByte())
                header.add((payload.size ushr 8).toByte())
                header.add(payload.size.toByte())
            }
            else -> {
                header.add((0x80 or 127).toByte())
                for (i in 7 downTo 0) header.add((payload.size.toLong() ushr (8 * i)).toByte())
            }
        }
        header.addAll(mask.toList())
        val masked = ByteArray(payload.size) { (payload[it].toInt() xor mask[it % 4].toInt()).toByte() }
        return header.toByteArray() + masked
    }

    private fun readLoop(listener: Listener) {
        var fragments = ByteArray(0)
        var fragmentedOpcode = -1
        while (true) {
            val b0 = readByte()
            val b1 = readByte()
            val fin = b0 and 0x80 != 0
            val opcode = b0 and 0x0f
            val masked = b1 and 0x80 != 0
            var length = (b1 and 0x7f).toLong()
            if (length == 126L) {
                length = (readByte() shl 8 or readByte()).toLong()
            } else if (length == 127L) {
                length = 0
                repeat(8) { length = length shl 8 or readByte().toLong() }
            }
            if (length > MAX_PAYLOAD) throw IOException("frame payload too large: $length")
            if (masked) {
                // Servers MUST NOT mask (RFC 6455 §5.1) — skip the mask key
                // and treat the frame as protocol-broken.
                repeat(4) { readByte() }
                throw IOException("masked frame from server")
            }
            val payload = ByteArray(length.toInt()) { readByte().toByte() }

            when (opcode) {
                0x0 -> { // continuation
                    if (fragmentedOpcode < 0) throw IOException("unexpected continuation frame")
                    fragments += payload
                    if (fin) {
                        val complete = fragments
                        val op = fragmentedOpcode
                        fragments = ByteArray(0)
                        fragmentedOpcode = -1
                        deliverData(listener, op, complete)
                    }
                }
                0x1, 0x2 -> { // text / binary
                    if (fin) {
                        deliverData(listener, opcode, payload)
                    } else {
                        if (fragmentedOpcode >= 0) throw IOException("interleaved data frames")
                        fragmentedOpcode = opcode
                        fragments = payload
                    }
                }
                0x8 -> { // close
                    val code = if (payload.size >= 2) {
                        (payload[0].toInt() and 0xff shl 8) or (payload[1].toInt() and 0xff)
                    } else {
                        1005
                    }
                    val reason = if (payload.size > 2) {
                        String(payload, 2, payload.size - 2, Charsets.UTF_8)
                    } else {
                        ""
                    }
                    if (!closeSent) close(code)
                    if (!callbackDelivered) {
                        callbackDelivered = true
                        listener.onClosed(code, reason)
                    }
                    return
                }
                0x9 -> synchronized(sendLock) { // ping → pong (same payload)
                    output?.write(frame(0xA, payload))
                    output?.flush()
                }
                0xA -> Unit // pong — ignore
                else -> throw IOException("unknown opcode: $opcode")
            }
        }
    }

    private fun deliverData(listener: Listener, opcode: Int, payload: ByteArray) {
        if (opcode == 0x1) {
            listener.onMessage(String(payload, Charsets.UTF_8))
        } else {
            listener.onFailure(IOException("binary frames unsupported (relay sends text only)"))
        }
    }

    private fun readByte(): Int {
        val b = input!!.read()
        if (b < 0) throw EOFException("connection closed by peer")
        return b
    }

    private fun fail(listener: Listener, e: Exception) {
        if (!callbackDelivered) {
            callbackDelivered = true
            listener.onFailure(if (e is Exception) e else IOException(e.toString()))
        }
    }

    companion object {
        private const val CONNECT_TIMEOUT_MS = 15_000
        private const val MAX_PAYLOAD = 1L shl 20 // 1 MiB — far above the relay's 64 KiB cap
    }
}
