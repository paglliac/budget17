package ru.apukhtin.budget

import android.content.Context
import android.content.SharedPreferences
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.core.content.edit
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.KSerializer
import kotlinx.serialization.serializer
import okhttp3.HttpUrl

/**
 * The server the app works with and what all screens share: every change bumps `version`, so screens on view load
 * again with it, and syncing with ZenMoney does the same. Every screen the server sends is kept on the phone, for when
 * the server cannot be reached. The server, its token and whose phone this is stay in the app's own preferences, where
 * the widgets will read them too.
 */
class Session private constructor(private val context: Context) {
    private val prefs: SharedPreferences = context.getSharedPreferences("session", Context.MODE_PRIVATE)
    private val copies = Saved(context.filesDir)

    /** For what must go on when the screen that started it closes, such as a description sent as its sheet goes. */
    val background = kotlinx.coroutines.CoroutineScope(kotlinx.coroutines.SupervisorJob() + Dispatchers.Main)

    /** Photos of categories and logos of shops, kept on the phone. */
    val photos = PhotoCache(java.io.File(context.cacheDir, "photos"))

    var server by mutableStateOf(prefs.getString(SERVER, null)?.let(ApiClient::url))
        private set
    var token by mutableStateOf(prefs.getString(TOKEN, "").orEmpty())
        private set

    /** Bumped by every change and sync; screens reload when it moves. */
    var version by mutableIntStateOf(0)
        private set
    var isSyncing by mutableStateOf(false)
        private set

    /** When this phone last had the server fetch from ZenMoney, in milliseconds. */
    var syncedAt by mutableStateOf<Long?>(null)
        private set

    /** Expenses of this month without a category, for the badge of their tab. */
    var pending by mutableIntStateOf(0)
        private set

    /** Why the app signed out by itself, for the login screen. */
    var notice by mutableStateOf<String?>(null)
        private set

    /** Whose phone this is, as the user named it; the server says by it who made a change. */
    var who by mutableStateOf(prefs.getString(WHO, "").orEmpty())
        private set

    /** The server as the user would type it, without the slash the URL ends with. */
    val address get() = server?.toString()?.trimEnd('/').orEmpty()

    /** Which of the two servers the app is on. */
    val slot get() = server?.let(ServerSlot::of)

    val client get() = server?.let { ApiClient(it, token, who) }

    /** The server last signed in to in a slot, with its token; the test one is the Mac's until another is. */
    fun remembered(slot: ServerSlot): Pair<String, String>? {
        val kept = prefs.getString(slot.key, null)?.split("\n", limit = 2)
        val address = kept?.firstOrNull()
        if (!address.isNullOrEmpty()) return address to kept.getOrElse(1) { "" }
        return if (slot == ServerSlot.Test) ServerSlot.MAC to "" else null
    }

    /** Goes over to the other server with what was kept for it, checked first like any other server. */
    suspend fun switchTo(slot: ServerSlot) {
        val (address, token) = remembered(slot) ?: throw ApiError.Server("Рабочий сервер ещё не подключали.")
        signIn(address, token)
    }

    /** A choice the phone keeps between launches, such as how «Желания» show. */
    fun preference(key: String): String? = prefs.getString("pref.$key", null)

    fun remember(key: String, value: String) = prefs.edit { putString("pref.$key", value) }

    /** Names the phone; an empty name says nothing about who made a change. */
    fun name(who: String) {
        this.who = who.trim()
        prefs.edit { putString(WHO, this@Session.who) }
    }

    /** Checks the server and the token before keeping them, so a wrong address leaves the working one and what it saved. */
    suspend fun signIn(address: String, token: String) {
        val url = ApiClient.url(address) ?: throw ApiError.Server("Не похоже на адрес сервера.")
        val client = ApiClient(url, token.trim())
        ApiJson.decodeFromString(SessionInfo.serializer(), client.data("session"))
        prefs.edit {
            putString(SERVER, url.toString())
            putString(TOKEN, client.token)
            putString(ServerSlot.of(url).key, "${url.toString().trimEnd('/')}\n${client.token}")
        }
        server = url
        this.token = client.token
        notice = null
        changed()
    }

    /** Forgets the server, its token and the screens saved from it. */
    fun signOut(notice: String? = null) {
        prefs.edit {
            remove(SERVER)
            remove(TOKEN)
        }
        copies.clear()
        server = null
        token = ""
        this.notice = notice
    }

    suspend inline fun <reified T> get(path: String, query: Map<String, String?> = emptyMap()): T = get(serializer<T>(), path, query)

    suspend fun <T> get(serializer: KSerializer<T>, path: String, query: Map<String, String?>): T {
        val client = client ?: throw ApiError.Unauthorized()
        try {
            val data = client.data(path, query)
            return withContext(Dispatchers.Default) {
                ApiJson.decodeFromString(serializer, data).also { copies.write(data, path, query) }
            }
        } catch (error: ApiError.Unauthorized) {
            signOut("Сервер больше не принимает токен. Войдите заново.")
            throw error
        }
    }

    /** A screen as the server last sent it, and when, in milliseconds. */
    inline fun <reified T> saved(path: String, query: Map<String, String?> = emptyMap()): Pair<T, Long>? = saved(serializer<T>(), path, query)

    fun <T> saved(serializer: KSerializer<T>, path: String, query: Map<String, String?>): Pair<T, Long>? {
        val (data, date) = copies.read(path, query) ?: return null
        return runCatching { ApiJson.decodeFromString(serializer, data) }.getOrNull()?.let { it to date }
    }

    /** Posts a form to the server; on success every screen loads again. */
    suspend fun send(path: String, form: Map<String, String> = emptyMap()) {
        val client = client ?: throw ApiError.Unauthorized()
        try {
            client.post(path, form)
            changed()
        } catch (error: ApiError.Unauthorized) {
            signOut("Сервер больше не принимает токен. Войдите заново.")
            throw error
        }
    }

    /** Asks the server to fetch what ZenMoney has new; quietly keeps the old data when it cannot. */
    suspend fun sync() {
        val client = client ?: return
        if (isSyncing) return
        isSyncing = true
        try {
            client.post("sync")
            syncedAt = System.currentTimeMillis()
            changed()
        } catch (_: Exception) {
            // The screens show what the server has; a failed sync is not worth an alert.
        } finally {
            isSyncing = false
        }
    }

    /** Every screen loads again, and so do the widgets. */
    private fun changed() {
        version += 1
        background.launch { runCatching { WidgetLoader.refresh(context) } }
    }

    /** The saved count at once, the server's when it answers. */
    suspend fun refreshPending() {
        saved<UncategorizedScreen>("uncategorized")?.let { pending = count(it.first) }
        val screen = runCatching { get<UncategorizedScreen>("uncategorized") }.getOrNull() ?: return
        pending = count(screen)
    }

    private fun count(screen: UncategorizedScreen) = screen.pending.sumOf { it.items.size }

    companion object {
        private const val SERVER = "server"
        private const val TOKEN = "token"
        private const val WHO = "who"

        @Volatile
        private var shared: Session? = null

        /** The one session of the app, for its screens and, later, its widgets. */
        fun of(context: Context): Session = shared ?: synchronized(this) {
            shared ?: Session(context.applicationContext).also { shared = it }
        }
    }
}

/**
 * The two servers the app switches between: the working one on the internet and the test one on the Mac, told apart by
 * plain http. Each keeps its address and token, so going back and forth needs no typing.
 */
enum class ServerSlot(val key: String) {
    Main("server.main"),
    Test("server.test");

    companion object {
        /** The Mac's server of a worktree, the test one until another plain-http server is signed in to. */
        const val MAC = "http://MacBook-Pro-kir.local:4318"

        /** The server on the internet, offered in the form when the working one has not been signed in to here. */
        const val INTERNET = "https://budget.gang.su"

        fun of(server: HttpUrl) = if (server.scheme == "http") Test else Main
    }
}
