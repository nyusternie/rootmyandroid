package com.rootmyandroid.rootz

import android.util.Log
import java.io.DataInputStream
import java.io.DataOutputStream
import java.security.Signature
import javax.net.ssl.SSLSocket

/**
 * ADB wire protocol over a TLS socket (the "_adb-tls-connect._tcp"
 * service), per AOSP docs/dev/protocol.md + OVERVIEW.TXT.
 *
 * Message = 24-byte header, little-endian u32s:
 *   command, arg0, arg1, data_length, data_crc32 (sum of bytes), magic
 *   (command XOR 0xffffffff); data follows.
 *
 * Connect phase auth: host sends CNXN; device replies AUTH(TOKEN) with a
 * 20-byte challenge; host signs it with SHA1withRSA (the key enrolled
 * during pairing) and replies AUTH(SIGNATURE); a device that knows the
 * key answers CNXN — otherwise AUTH(TOKEN) again and the host may fall
 * back to AUTH(RSAPUBLICKEY), which requires the on-device allow dialog.
 *
 * This client is deliberately minimal (preview): classic protocol version
 * 0x01000000 / 4 KiB payload, one "shell:" stream, no stdin, output
 * streamed until CLSE.
 */
internal class AdbConnection(
    private val host: String,
    private val port: Int,
    private val adbKey: AdbKey,
) {

    class Result(val deviceBanner: String, val output: String)

    fun runShell(command: String): Result {
        // The _adb-tls-connect port speaks PLAINTEXT ADB framing until the
        // client sends A_STLS; only then does adbd start SSL_accept
        // (AOSP transport.cpp/adb.cpp — raw ClientHello first gets parsed
        // as an apacket header and the connection dies instantly).
        val connectHost = if (AdbTls.isOwnAddress(host)) "127.0.0.1" else host
        val plain = java.net.Socket()
        plain.connect(java.net.InetSocketAddress(connectHost, port), CONNECT_TIMEOUT_MS)
        plain.soTimeout = IO_TIMEOUT_MS
        Log.i(TAG, "adb: sending A_STLS to $connectHost:$port")
        write(DataOutputStream(plain.getOutputStream()), A_STLS, A_STLS_VERSION, 0, byteArrayOf())
        val socket = AdbTls.wrap(plain, host, port, adbKey, IO_TIMEOUT_MS)
        socket.use { tls ->
            val input = DataInputStream(tls.getInputStream())
            val output = DataOutputStream(tls.getOutputStream())
            val banner = connect(tls, input, output)
            val shell = runShellStream(input, output, command)
            return Result(banner, shell)
        }
    }

    // ---- connect phase ----

    private fun connect(socket: SSLSocket, input: DataInputStream, output: DataOutputStream): String {
        Log.i(TAG, "adb: TLS ${socket.session.protocol} to $host:$port; sending CNXN")
        write(output, A_CNXN, A_VERSION, MAX_PAYLOAD, "host::rootz\u0000".toByteArray())
        var sentPublicKey = false
        while (true) {
            val msg = read(input)
            when (msg.command) {
                // adb.cpp: "All AUTH commands are ignored in TLS mode" —
                // the TLS-layer client-cert check against enrolled keys
                // replaces the token/signature dance. Kept as a defensive
                // fallback for adbd builds that still challenge over TLS.
                A_AUTH -> when (msg.arg0) {
                    AUTH_TOKEN -> {
                        if (!sentPublicKey) {
                            val sig = Signature.getInstance("SHA1withRSA").run {
                                initSign(adbKey.keyPair.private)
                                update(msg.data)
                                sign()
                            }
                            Log.i(TAG, "adb: AUTH TOKEN (${msg.data.size}B) — replying with signature")
                            write(output, A_AUTH, AUTH_SIGNATURE, 0, sig)
                        } else {
                            Log.i(TAG, "adb: second AUTH TOKEN — sending public key")
                            write(output, A_AUTH, AUTH_RSAPUBLICKEY, 0, adbKey.adbPublicKeyString.toByteArray() + 0)
                            sentPublicKey = true
                        }
                    }
                    else -> throw AdbException("unexpected AUTH arg0=${msg.arg0}")
                }
                A_CNXN -> {
                    val banner = String(msg.data).trimEnd('\u0000')
                    Log.i(TAG, "adb: connected — $banner")
                    return banner
                }
                // adb.cpp daemon-side A_CNXN handler: on a TLS transport
                // adbd ALSO answers our CNXN with A_STLS ("to indicate the
                // new protocol") ON TOP of the CNXN from
                // adbd_wifi_secure_connect — a stray packet, safe to ignore
                // (and must NOT be echoed: that would re-trigger
                // adbd_auth_tls_handshake server-side).
                A_STLS -> Log.i(TAG, "adb: ignoring stray A_STLS during connect")
                else -> throw AdbException("expected AUTH/CNXN, got command=0x${msg.command.toString(16)}")
            }
        }
    }

    // ---- shell stream ----

    private fun runShellStream(input: DataInputStream, output: DataOutputStream, command: String): String {
        val localId = 1
        write(output, A_OPEN, localId, 0, "shell:$command\u0000".toByteArray())
        val out = StringBuilder()
        var remoteId = -1
        while (true) {
            val msg = read(input)
            when (msg.command) {
                A_OKAY -> if (remoteId < 0) remoteId = msg.arg0
                A_WRTE -> {
                    out.append(String(msg.data))
                    write(output, A_OKAY, localId, msg.arg0, byteArrayOf())
                }
                A_CLSE -> {
                    write(output, A_CLSE, localId, msg.arg0, byteArrayOf())
                    return out.toString()
                }
                A_STLS -> Log.i(TAG, "adb: ignoring stray A_STLS on stream") // see connect()
                else -> Log.w(TAG, "adb: unexpected stream command=0x${msg.command.toString(16)}")
            }
        }
    }

    // ---- framing ----

    private class Message(val command: Int, val arg0: Int, val arg1: Int, val data: ByteArray)

    private fun read(input: DataInputStream): Message {
        val header = ByteArray(24)
        input.readFully(header)
        fun u32(off: Int) = (header[off].toLong() and 0xff) or
            ((header[off + 1].toLong() and 0xff) shl 8) or
            ((header[off + 2].toLong() and 0xff) shl 16) or
            ((header[off + 3].toLong() and 0xff) shl 24)
        val command = u32(0).toInt()
        val arg0 = u32(4).toInt()
        val arg1 = u32(8).toInt()
        val length = u32(12).toInt()
        val crc = u32(16)
        val magic = u32(20).toInt()
        if (magic != (command xor -1)) {
            throw AdbException("bad magic for command=0x${command.toString(16)}")
        }
        if (length < 0 || length > MAX_PAYLOAD) {
            throw AdbException("bad payload length $length")
        }
        val data = ByteArray(length)
        input.readFully(data)
        if (checksum(data) != crc) throw AdbException("bad payload checksum")
        return Message(command, arg0, arg1, data)
    }

    private fun write(output: DataOutputStream, command: Int, arg0: Int, arg1: Int, data: ByteArray) {
        fun putU32(v: Long) {
            output.writeByte((v and 0xff).toInt())
            output.writeByte(((v shr 8) and 0xff).toInt())
            output.writeByte(((v shr 16) and 0xff).toInt())
            output.writeByte(((v shr 24) and 0xff).toInt())
        }
        putU32(command.toLong() and 0xffffffffL)
        putU32(arg0.toLong() and 0xffffffffL)
        putU32(arg1.toLong() and 0xffffffffL)
        putU32(data.size.toLong())
        putU32(checksum(data))
        putU32((command xor -1).toLong() and 0xffffffffL)
        output.write(data)
        output.flush()
    }

    private fun checksum(data: ByteArray): Long {
        var sum = 0L
        for (b in data) sum = (sum + (b.toLong() and 0xff)) and 0xffffffffL
        return sum
    }

    class AdbException(message: String) : Exception(message)

    companion object {
        private const val TAG = "AdbWifiConn"
        private const val IO_TIMEOUT_MS = 15_000
        private const val CONNECT_TIMEOUT_MS = 3_000

        private const val A_CNXN = 0x4e584e43
        private const val A_AUTH = 0x48545541
        private const val A_OPEN = 0x4e45504f
        private const val A_OKAY = 0x59414b4f
        private const val A_CLSE = 0x45534c43
        private const val A_WRTE = 0x45545257
        private const val A_STLS = 0x534c5453
        private const val A_STLS_VERSION = 0x01000000

        private const val AUTH_TOKEN = 1
        private const val AUTH_SIGNATURE = 2
        private const val AUTH_RSAPUBLICKEY = 3

        private const val A_VERSION = 0x01000000
        private const val MAX_PAYLOAD = 4096
    }
}
