// apps/rootz/app/src/main/java/com/rootmyandroid/rootz/Bookmarks.kt
package com.rootmyandroid.rootz

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * User-saved commands (aShell You "bookmarks", pattern 85) persisted in
 * SharedPreferences as a JSON array of {name, command, addedAt}.
 *
 * Names are auto-derived from the command itself (first 32 chars) —
 * asking the user to name every save is friction a terminal doesn't need;
 * saving a command whose derived name already exists REPLACES the old
 * entry (documented behavior, matches "re-run with a single tap" intent).
 *
 * Android-backed by design (org.json is unavailable on plain JVM), so
 * there is no unit test here — the class is a dumb store; all policy
 * lives in MainActivity and the CommandGuard.
 */
data class Bookmark(val name: String, val command: String, val addedAt: Long)

class Bookmarks(context: Context) {

    private val prefs =
        context.applicationContext.getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)

    fun all(): List<Bookmark> {
        val raw = prefs.getString(KEY_LIST, "[]") ?: "[]"
        val arr = JSONArray(raw)
        return (0 until arr.length()).map { i ->
            val o = arr.getJSONObject(i)
            Bookmark(o.getString("name"), o.getString("command"), o.optLong("addedAt", 0L))
        }
    }

    /** Save (or replace) a command; returns the derived name. */
    fun save(command: String): String {
        val name = command.take(32)
        val list = all().filter { it.name != name } +
            Bookmark(name, command, System.currentTimeMillis())
        persist(list)
        return name
    }

    fun remove(name: String) {
        persist(all().filter { it.name != name })
    }

    private fun persist(list: List<Bookmark>) {
        val arr = JSONArray()
        list.forEach { b ->
            arr.put(
                JSONObject()
                    .put("name", b.name)
                    .put("command", b.command)
                    .put("addedAt", b.addedAt)
            )
        }
        prefs.edit().putString(KEY_LIST, arr.toString()).apply()
    }

    companion object {
        const val PREFS_FILE = "rootz_bookmarks"
        const val KEY_LIST = "list"
    }
}
