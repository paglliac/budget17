package ru.apukhtin.budget

import java.io.File
import java.security.MessageDigest

/**
 * The server's last answer for every screen, kept on the phone: the app shows it at once and goes on showing it while
 * the server cannot be reached. A screen is its path with its query, one file each, dated by when it was saved.
 */
class Saved(root: File) {
    private val folder = File(root, "saved").apply { mkdirs() }

    init {
        prune()
    }

    /** A copy and when it was saved, in milliseconds. */
    fun read(path: String, query: Map<String, String?>): Pair<String, Long>? {
        val file = file(path, query)
        if (!file.exists()) return null
        return runCatching { file.readText() to file.lastModified() }.getOrNull()
    }

    fun write(data: String, path: String, query: Map<String, String?>) {
        val file = file(path, query)
        val partial = File(folder, "${file.name}.part")
        runCatching {
            partial.writeText(data)
            partial.renameTo(file)
        }
    }

    /** Forgets everything, as when signing out. */
    fun clear() {
        folder.listFiles()?.forEach { it.delete() }
    }

    /** Counted from the newest copy rather than from today, so a server gone for long does not empty the app. */
    private fun prune() {
        val files = folder.listFiles().orEmpty()
        val newest = files.maxOfOrNull { it.lastModified() } ?: return
        files.filter { it.lastModified() < newest - KEEP }.forEach { it.delete() }
    }

    /** Paths carry ids and queries carry searched text, so the name is a hash of them. */
    private fun file(path: String, query: Map<String, String?>): File {
        val items = query.mapNotNull { (name, value) -> value?.let { "$name=$it" } }.sorted()
        val key = (listOf(path) + items).joinToString("&")
        val hash = MessageDigest.getInstance("SHA-256").digest(key.toByteArray()).joinToString("") { "%02x".format(it) }
        return File(folder, "$hash.json")
    }

    companion object {
        /** A copy left unread this long before the newest one goes away, such as a week looked at once. */
        const val KEEP = 60L * 24 * 60 * 60 * 1000
    }
}
