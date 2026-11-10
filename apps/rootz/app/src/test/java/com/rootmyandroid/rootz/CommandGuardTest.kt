// apps/rootz/app/src/test/java/com/rootmyandroid/rootz/CommandGuardTest.kt
package com.rootmyandroid.rootz

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Pure-JVM pins for the command safety guard (CommandGuard.kt). The
 * classification vocabulary and the persistence semantics are the
 * contract — a regression here means the app either nags users on safe
 * commands or, worse, lets a wipe through without re-confirmation, so CI
 * must catch it (the gated list enforces repo rule 6 INSIDE the app).
 *
 * Only the pure functions are tested (splitSegments / stripEnvAssignments
 * / classify / decide): the CommandGuard class itself is a thin
 * SharedPreferences wrapper whose recordRunOnce/recordAlways semantics
 * are pinned indirectly through decide() (session covers CAUTION only,
 * always covers DANGEROUS, nothing covers DESTRUCTIVE).
 */
class CommandGuardTest {

    // ---- splitSegments ----

    @Test fun `single command stays one segment`() {
        assertEquals(listOf("id"), splitSegments("id"))
        assertEquals(listOf("ls -la /sdcard"), splitSegments("ls -la /sdcard"))
    }

    @Test fun `semicolon and operators split into segments`() {
        assertEquals(listOf("ls", "pm clear com.x"), splitSegments("ls; pm clear com.x"))
        assertEquals(listOf("pm list packages", "grep google"), splitSegments("pm list packages | grep google"))
        assertEquals(listOf("ls", "id"), splitSegments("ls && id"))
        assertEquals(listOf("ls", "id"), splitSegments("ls || id"))
    }

    @Test fun `quoted operators do not split`() {
        assertEquals(listOf("echo \"a;b\""), splitSegments("echo \"a;b\""))
        assertEquals(listOf("echo 'a|b'"), splitSegments("echo 'a|b'"))
    }

    // ---- stripEnvAssignments ----

    @Test fun `env prefixes are stripped to reach the real verb`() {
        assertEquals("id", stripEnvAssignments("FOO=bar id"))
        assertEquals("pm clear com.x", stripEnvAssignments("A=1 B=2 pm clear com.x"))
        assertEquals("id", stripEnvAssignments("id"))
    }

    // ---- classify: SAFE fall-through ----

    @Test fun `read-only commands classify SAFE with empty pattern key`() {
        val safe = listOf(
            "id", "pwd", "ls", "getprop ro.product.model", "pm list packages",
            "dumpsys battery", "logcat -d -t 50", "cat /proc/version",
            "settings get global adb_enabled", "mount", "wm size", "uname -a",
        )
        for (cmd in safe) {
            val findings = classify(cmd)
            assertEquals("expected one segment for '$cmd'", 1, findings.size)
            assertEquals("expected SAFE for '$cmd'", Risk.SAFE, findings[0].risk)
            assertEquals("expected empty pattern key for '$cmd'", "", findings[0].patternKey)
        }
    }

    // ---- classify: DESTRUCTIVE (rule 6 verbs; never remembered) ----

    @Test fun `wipe-class commands classify DESTRUCTIVE`() {
        val destructive = mapOf(
            "pm clear com.example.app" to "pm clear",
            "pm uninstall --user 0 com.example.app" to "pm uninstall",
            "rm -rf /sdcard/Download/old" to "rm -r/-f",
            "rm -f a.txt b.txt" to "rm -r/-f",
            "rm -r /data/local/tmp/x" to "rm -r/-f",
            "dd if=/dev/zero of=/dev/block/bootdevice/by-name/boot" to "dd of=",
            "dd if=/sdcard/boot.img of=/dev/block/x bs=4M" to "dd of=",
            "mkfs.ext4 /dev/block/x" to "mkfs",
            "wipe data" to "wipe",
            "fastboot oem unlock" to "fastboot flash/unlock",
            "fastboot flashing unlock" to "fastboot flash/unlock",
            "recovery --wipe_data" to "recovery --wipe_data",
        )
        for ((cmd, key) in destructive) {
            val findings = classify(cmd)
            assertEquals("expected DESTRUCTIVE for '$cmd'", Risk.DESTRUCTIVE, findings[0].risk)
            assertEquals("expected pattern key for '$cmd'", key, findings[0].patternKey)
            assertTrue("expected a reason string for '$cmd'", findings[0].reason.isNotEmpty())
        }
    }

    @Test fun `rm without flags is DANGEROUS not DESTRUCTIVE`() {
        assertEquals(Risk.DANGEROUS, classify("rm /sdcard/notes.txt")[0].risk)
        assertEquals("rm", classify("rm /sdcard/notes.txt")[0].patternKey)
    }

    @Test fun `dd without of= writes to stdout and is not gated`() {
        assertEquals(Risk.SAFE, classify("dd if=/dev/zero bs=1 count=1")[0].risk)
    }

    // ---- classify: DANGEROUS ----

    @Test fun `state-changing commands classify DANGEROUS`() {
        val dangerous = mapOf(
            "am force-stop com.example.app" to "am force-stop",
            "pm disable-user com.example.app" to "pm disable-user",
            "pm disable com.example.app" to "pm disable-user",
            "kill 1234" to "kill",
            "killall surfaceflinger" to "kill",
            "pkill -9 com.example.app" to "kill",
            "mount -o remount,rw /system" to "mount",
            "mount /dev/block/x /mnt/tmp" to "mount",
        )
        for ((cmd, key) in dangerous) {
            val findings = classify(cmd)
            assertEquals("expected DANGEROUS for '$cmd'", Risk.DANGEROUS, findings[0].risk)
            assertEquals("expected pattern key for '$cmd'", key, findings[0].patternKey)
            assertTrue("expected a reason string for '$cmd'", findings[0].reason.isNotEmpty())
        }
    }

    // ---- classify: CAUTION ----

    @Test fun `reversible commands classify CAUTION`() {
        val caution = mapOf(
            "settings put global development_settings_enabled 1" to "settings put",
            "setprop debug.rootz.verbose 1" to "setprop",
            "device_config put systemui some_flag true" to "device_config put",
            "device_config delete systemui some_flag" to "device_config put",
            "appops set com.example.app SYSTEM_ALERT_WINDOW deny" to "appops set",
            "pm enable com.example.app" to "pm enable",
            "pm suspend com.example.app" to "pm suspend/trim",
            "pm trim-caches 128M" to "pm suspend/trim",
            "svc wifi disable" to "svc",
            "reboot" to "reboot",
            "reboot recovery" to "reboot",
            "logcat -c" to "logcat -c",
            "logcat --clear" to "logcat -c",
            "input keyevent 4" to "input",
            "input tap 500 800" to "input",
            "su" to "su",
            "su -c id" to "su",
            "sh /sdcard/setup.sh" to "sh -c/script",
            "./local.sh" to "sh -c/script",
        )
        for ((cmd, key) in caution) {
            val findings = classify(cmd)
            assertEquals("expected CAUTION for '$cmd'", Risk.CAUTION, findings[0].risk)
            assertEquals("expected pattern key for '$cmd'", key, findings[0].patternKey)
            assertTrue("expected a reason string for '$cmd'", findings[0].reason.isNotEmpty())
        }
    }

    // ---- decide: the persistence contract ----

    @Test fun `all-safe input is allowed silently`() {
        val d = decide(classify("pm list packages | grep google"), emptySet(), emptySet())
        assertTrue(d.allow)
        assertFalse(d.needsAsk)
        assertFalse(d.offerAlways)
        assertEquals(Risk.SAFE, d.risk)
    }

    @Test fun `empty findings are allowed silently`() {
        val d = decide(emptyList(), emptySet(), emptySet())
        assertTrue(d.allow)
        assertFalse(d.needsAsk)
        assertEquals(Risk.SAFE, d.risk)
    }

    @Test fun `CAUTION asks with always offered when unapproved`() {
        val d = decide(classify("settings put global x 1"), emptySet(), emptySet())
        assertFalse(d.allow)
        assertTrue(d.needsAsk)
        assertTrue(d.offerAlways)
        assertEquals(Risk.CAUTION, d.risk)
    }

    @Test fun `CAUTION is covered by session OR always approval`() {
        val cmd = "settings put global x 1"
        assertTrue(decide(classify(cmd), setOf("settings put"), emptySet()).allow)
        assertTrue(decide(classify(cmd), emptySet(), setOf("settings put")).allow)
    }

    @Test fun `DANGEROUS is NOT covered by session approval`() {
        // Session approvals expire with the process; DANGEROUS requires a
        // persisted "always" or a fresh confirmation (pattern 61).
        val d = decide(classify("am force-stop com.x"), setOf("am force-stop"), emptySet())
        assertFalse(d.allow)
        assertTrue(d.needsAsk)
        assertTrue(d.offerAlways)
    }

    @Test fun `DANGEROUS is covered by always approval`() {
        assertTrue(decide(classify("am force-stop com.x"), emptySet(), setOf("am force-stop")).allow)
    }

    @Test fun `two DANGEROUS segments need BOTH patterns approved`() {
        val cmd = "am force-stop com.a; pm disable-user com.y"
        val d = decide(classify(cmd), emptySet(), setOf("am force-stop"))
        assertFalse(d.allow)
        assertTrue(d.needsAsk)
    }

    @Test fun `DESTRUCTIVE ignores always approval by construction and never offers it`() {
        // The wipe pin: even if a buggy caller persisted an approval for a
        // wipe-class pattern, decide() must still re-confirm every time.
        val d = decide(classify("pm clear com.x"), setOf("pm clear"), setOf("pm clear"))
        assertFalse(d.allow)
        assertTrue(d.needsAsk)
        assertFalse(d.offerAlways)
        assertEquals(Risk.DESTRUCTIVE, d.risk)
    }

    @Test fun `max risk of a chain drives the verdict`() {
        assertEquals(Risk.DESTRUCTIVE, decide(classify("id; pm clear com.x"), emptySet(), emptySet()).risk)
        assertEquals(Risk.DANGEROUS, decide(classify("id && am force-stop com.x"), emptySet(), emptySet()).risk)
        assertEquals(Risk.CAUTION, decide(classify("id | grep uid; reboot"), emptySet(), emptySet()).risk)
    }

    @Test fun `env-prefixed wipe is still caught`() {
        val d = decide(classify("A=1 pm clear com.x"), emptySet(), emptySet())
        assertEquals(Risk.DESTRUCTIVE, d.risk)
        assertTrue(d.needsAsk)
    }
}
