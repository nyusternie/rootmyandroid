// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/CommandGuard.kt
package com.rootmyandroid.rootz

import android.content.Context

/**
 * Command safety guard — repo rule 6 ("never wipe third-party app data;
 * any wipe needs a separate, explicit confirmation naming the exact
 * consequence") enforced INSIDE the app as code, not just as a repo rule.
 *
 * Design (synthesized from the 2026-11-10 ecosystem review, recorded in
 * .session-notes/repo-reviews.md):
 *  - Per-command permission tri-state: Allow / Ask / Deny, default ASK for
 *    anything known-risky (pattern 33, Operit; pattern 13, zafiro).
 *  - Approval persistence has a TIME dimension (pattern 61,
 *    AndroidHarness): "always allow" survives runs; CAUTION approvals are
 *    remembered for the session; DESTRUCTIVE commands are NEVER
 *    remembered — every wipe is re-confirmed, run-scoped only.
 *  - Fail-closed with closed reason codes + PII-free receipts (pattern 8,
 *    Argus): every guard decision appends a one-line receipt to the
 *    scrollback, tagged with a code from the fixed [ReceiptCode] set.
 *
 * Classification is conservative by construction: only KNOWN-dangerous
 * verbs are gated; unrecognized commands pass as SAFE (a terminal cannot
 * enumerate the world, and nagging on every unknown command would train
 * the user to dismiss dialogs). The gated list is deliberately small and
 * each entry carries its own reason string shown in the confirm dialog.
 *
 * Pure logic (classify/decide) is JVM-only and unit-tested in
 * CommandGuardTest; SharedPreferences wiring lives in [CommandGuard].
 */

/** Risk classes, ordered SAFE < CAUTION < DANGEROUS < DESTRUCTIVE. */
enum class Risk { SAFE, CAUTION, DANGEROUS, DESTRUCTIVE }

/** Closed receipt-code vocabulary for the scrollback audit trail. */
enum class ReceiptCode(val tag: String) {
    SAFE_AUTO("safe"),
    ASK_ALLOWED_ONCE("asked:allowed-once"),
    ASK_ALLOWED_SESSION("asked:allowed-session"),
    ASK_ALLOWED_ALWAYS("asked:allowed-always"),
    ASK_CANCELLED("asked:cancelled"),
}

/** One classified command segment (a single simple command after the
 *  input is split on shell operators). */
data class Finding(
    val segment: String,
    val risk: Risk,
    /** Stable pattern key the approval store remembers — verb + gated
     *  subcommand/flag, never arguments (so "am force-stop" is remembered
     *  for all packages, which the dialog states explicitly). */
    val patternKey: String,
    /** Human-readable consequence shown in the confirm dialog. */
    val reason: String,
)

/** The guard's verdict for a whole input line. */
data class Decision(
    val risk: Risk,
    val allow: Boolean,
    val needsAsk: Boolean,
    /** Whether the dialog may offer "Always allow" (never for
     *  DESTRUCTIVE — wipes are re-confirmed every time, pattern 61). */
    val offerAlways: Boolean,
    val findings: List<Finding>,
)

/** Split a command line into simple commands on unquoted shell operators
 *  (`;`, `&&`, `||`, `|`) — quotes are honored so `echo "a;b"` stays one
 *  segment. The max-risk segment drives the verdict. */
internal fun splitSegments(cmd: String): List<String> {
    val out = mutableListOf<String>()
    val cur = StringBuilder()
    var quote = 0.toChar() // 0 = unquoted
    var i = 0
    while (i < cmd.length) {
        val c = cmd[i]
        when {
            quote == 0.toChar() && (c == '"' || c == '\'') -> {
                quote = c
                cur.append(c)
            }
            quote != 0.toChar() && c == quote -> {
                quote = 0.toChar()
                cur.append(c)
            }
            quote == 0.toChar() && (c == ';' || c == '|') -> {
                if (cur.isNotBlank()) out.add(cur.toString().trim())
                cur.clear()
                if ((c == '|' && i + 1 < cmd.length && cmd[i + 1] == '|')) i++ // skip "||"
            }
            quote == 0.toChar() && c == '&' && i + 1 < cmd.length && cmd[i + 1] == '&' -> {
                if (cur.isNotBlank()) out.add(cur.toString().trim())
                cur.clear()
                i++ // skip second '&'
            }
            else -> cur.append(c)
        }
        i++
    }
    if (cur.isNotBlank()) out.add(cur.toString().trim())
    return out
}

/** Strip leading environment assignments (`FOO=bar `) so the real verb
 *  is classified; returns the remainder of the segment. */
internal fun stripEnvAssignments(segment: String): String {
    var s = segment
    val env = Regex("^[A-Za-z_][A-Za-z0-9_]*=\\S*\\s+")
    while (env.containsMatchIn(s)) s = s.replace(env, "")
    return s
}

/**
 * The gated-verb table. Order matters: the FIRST matching rule wins.
 * Each rule: matcher on the normalized segment (lowercased verb +
 * flags), the risk, the pattern key, and the shown consequence.
 * KEEP THIS LIST SMALL AND DELIBERATE — unknown verbs fall through to
 * SAFE by design (see file header).
 */
private data class Rule(
    val risk: Risk,
    val patternKey: String,
    val reason: String,
    val matches: (tokens: List<String>, verb: String) -> Boolean,
)

private val RULES = listOf(
    // --- DESTRUCTIVE: irreversible data loss / device state (rule 6) ---
    Rule(Risk.DESTRUCTIVE, "pm clear", "ERASES all data of the target app (settings, accounts, files). This is a wipe.") { t, v ->
        v == "pm" && t.getOrNull(1) == "clear"
    },
    Rule(Risk.DESTRUCTIVE, "pm uninstall", "REMOVES the target app and its data from the device.") { t, v ->
        v == "pm" && t.getOrNull(1) == "uninstall"
    },
    Rule(Risk.DESTRUCTIVE, "rm -r/-f", "DELETES files with -r (recursive) and/or -f (forced, no prompts). Gone means gone.") { t, v ->
        v == "rm" && t.drop(1).any { it.startsWith("-") && (it.contains("r") || it.contains("R") || it.contains("f")) }
    },
    Rule(Risk.DESTRUCTIVE, "dd of=", "Raw block-level WRITE (of=). Can overwrite partitions and brick the device.") { t, v ->
        v == "dd" && t.drop(1).any { it.startsWith("of=") }
    },
    Rule(Risk.DESTRUCTIVE, "mkfs", "FORMATS a filesystem. Irreversible.") { _, v -> v.startsWith("mkfs") },
    Rule(Risk.DESTRUCTIVE, "wipe", "WIPES device data partitions.") { _, v -> v == "wipe" },
    Rule(Risk.DESTRUCTIVE, "fastboot flash/unlock", "Bootloader-level flash/unlock — out of scope for a shell terminal, and unlock WIPES the device.") { _, v ->
        v == "fastboot"
    },
    Rule(Risk.DESTRUCTIVE, "recovery --wipe_data", "Boots into recovery to WIPE user data.") { t, v ->
        v == "recovery" && t.any { it.contains("wipe") }
    },
    // --- DANGEROUS: significant state change, recoverable but painful ---
    Rule(Risk.DANGEROUS, "rm", "DELETES the named file(s).") { _, v -> v == "rm" },
    Rule(Risk.DANGEROUS, "am force-stop", "FORCE-KILLS the target app. Unsaved state in it is lost. (Remembered for ALL packages if approved always.)") { t, v ->
        v == "am" && t.getOrNull(1) == "force-stop"
    },
    Rule(Risk.DANGEROUS, "pm disable-user", "DISABLES the target app for this user — it vanishes from the launcher until re-enabled. (Remembered for ALL packages if approved always.)") { t, v ->
        v == "pm" && t.getOrNull(1) in listOf("disable-user", "disable")
    },
    Rule(Risk.DANGEROUS, "kill", "SENDS a signal to a process — can kill apps or system services.") { _, v ->
        v == "kill" || v == "killall" || v == "pkill"
    },
    Rule(Risk.DANGEROUS, "mount", "MOUNTS/REMOUNTS a filesystem — system modification. (Bare `mount` with no arguments only lists mounts and is NOT gated.)") { t, v ->
        v == "mount" && t.size > 1
    },
    // --- CAUTION: reversible, session-scoped approval is enough ---
    Rule(Risk.CAUTION, "settings put", "CHANGES a system setting (reversible by writing the old value back).") { t, v ->
        v == "settings" && t.getOrNull(1) == "put"
    },
    Rule(Risk.CAUTION, "setprop", "CHANGES a runtime system property.") { _, v -> v == "setprop" },
    Rule(Risk.CAUTION, "device_config put", "CHANGES a DeviceConfig flag.") { t, v ->
        v == "device_config" && t.getOrNull(1) in listOf("put", "delete")
    },
    Rule(Risk.CAUTION, "appops set", "CHANGES an AppOps permission for an app.") { t, v ->
        v == "appops" && t.getOrNull(1) == "set"
    },
    Rule(Risk.CAUTION, "pm enable", "RE-ENABLES a disabled app.") { t, v ->
        v == "pm" && t.getOrNull(1) == "enable"
    },
    Rule(Risk.CAUTION, "pm suspend/trim", "CHANGES package state (suspend/trim-caches).") { t, v ->
        v == "pm" && t.getOrNull(1) in listOf("suspend", "unsuspend", "trim-caches")
    },
    Rule(Risk.CAUTION, "svc", "TOGGLES radios/services (wifi, data, bluetooth…).") { _, v -> v == "svc" },
    Rule(Risk.CAUTION, "reboot", "REBOOTS the device (or into a named mode).") { _, v -> v == "reboot" },
    Rule(Risk.CAUTION, "logcat -c", "CLEARS the log buffer — destroys log evidence Rootz Pro Log Analysis relies on.") { t, v ->
        v == "logcat" && t.drop(1).any { it == "-c" || it == "--clear" }
    },
    Rule(Risk.CAUTION, "input", "INJECTS keys/taps into the foreground app — acts on YOUR behalf in whatever is open.") { _, v -> v == "input" },
    Rule(Risk.CAUTION, "su", "REQUESTS privilege escalation — may trigger the device's root-manager prompt.") { _, v -> v == "su" },
    Rule(Risk.CAUTION, "sh -c/script", "RUNS an arbitrary script — the guard cannot see inside it.") { _, v -> v == "sh" || v == "bash" || v.endsWith(".sh") },
)

/** Classify one input line into per-segment findings. Empty input → no
 *  findings (the caller treats that as SAFE). */
internal fun classify(cmd: String): List<Finding> =
    splitSegments(cmd).map { raw ->
        val segment = stripEnvAssignments(raw)
        val tokens = segment.split(Regex("\\s+")).filter { it.isNotEmpty() }
        val verb = tokens.firstOrNull()?.lowercase() ?: ""
        val rule = RULES.firstOrNull { it.matches(tokens, verb) }
        if (rule != null) {
            Finding(segment, rule.risk, rule.patternKey, rule.reason)
        } else {
            Finding(segment, Risk.SAFE, "", "")
        }
    }

/**
 * Pure decision: given findings and the two approval sets (session =
 * in-memory for this run of the app; always = persisted), produce the
 * verdict. DESTRUCTIVE ignores the always-set by construction — wipes
 * are re-confirmed every time (pattern 61), even if a buggy caller
 * recorded one.
 */
internal fun decide(
    findings: List<Finding>,
    sessionApproved: Set<String>,
    alwaysApproved: Set<String>,
): Decision {
    val risk = findings.maxOfOrNull { it.risk } ?: Risk.SAFE
    return when (risk) {
        Risk.SAFE -> Decision(risk, allow = true, needsAsk = false, offerAlways = false, findings)
        Risk.CAUTION -> {
            val covered = findings.filter { it.risk == Risk.CAUTION }
                .all { it.patternKey in sessionApproved || it.patternKey in alwaysApproved }
            Decision(risk, allow = covered, needsAsk = !covered, offerAlways = true, findings)
        }
        Risk.DANGEROUS -> {
            val covered = findings.filter { it.risk == Risk.DANGEROUS }
                .all { it.patternKey in alwaysApproved }
            Decision(risk, allow = covered, needsAsk = !covered, offerAlways = true, findings)
        }
        Risk.DESTRUCTIVE ->
            Decision(risk, allow = false, needsAsk = true, offerAlways = false, findings)
    }
}

/** Android-backed guard: SharedPreferences for "always" approvals, an
 *  in-memory set for session approvals. */
class CommandGuard(context: Context) {

    private val prefs =
        context.applicationContext.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
    // synchronizedSet: decisionFor also runs on the relay-daemon executor
    // thread while the UI thread writes here (recordRunOnce) — decide()
    // performs only contains() lookups, atomic on a synchronized wrapper.
    private val sessionApproved: MutableSet<String> = java.util.Collections.synchronizedSet(mutableSetOf())

    fun decisionFor(cmd: String): Decision =
        decide(classify(cmd), sessionApproved, prefs.all.keys)

    /** "Run once" on a CAUTION finding: remember it for this session so
     *  repeats don't nag. DANGEROUS "run once" remembers nothing (asks
     *  every time); DESTRUCTIVE never reaches here with approval. */
    fun recordRunOnce(decision: Decision) {
        if (decision.risk == Risk.CAUTION) {
            decision.findings.filter { it.risk == Risk.CAUTION }
                .forEach { sessionApproved.add(it.patternKey) }
        }
    }

    /** "Always allow": persisted. DESTRUCTIVE is refused here too (belt
     *  and braces — decide() already ignores it). */
    fun recordAlways(decision: Decision) {
        if (decision.risk == Risk.DESTRUCTIVE) return
        val e = prefs.edit()
        decision.findings.filter { it.risk != Risk.SAFE }
            .forEach { e.putBoolean(it.patternKey, true) }
        e.apply()
    }

    /** Settings affordance: wipe ALL remembered approvals (both stores). */
    fun clearAllApprovals() {
        prefs.edit().clear().apply()
        sessionApproved.clear()
    }

    companion object {
        const val PREFS_FILE = "command_guard"
    }
}
