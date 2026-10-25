package ru.apukhtin.budget

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch
import kotlinx.serialization.KSerializer
import kotlinx.serialization.serializer

/** The app's one session, for every screen. */
val LocalSession = staticCompositionLocalOf<Session> { error("Нет сессии") }

/**
 * Loads a screen from the server, shows it, and loads it again on pull to refresh, after a change anywhere in the app,
 * or when what it shows changes, such as another week. What the server sent last for the screen shows at once while it
 * answers; when it cannot be reached, that copy stays, with the time it was saved on a pill that opens the server. The
 * content scrolls by itself, so the pull reaches it.
 */
@Composable
inline fun <reified T> Screen(
    path: String,
    query: Map<String, String?> = emptyMap(),
    modifier: Modifier = Modifier,
    refreshable: Boolean = true,
    noinline content: @Composable (T) -> Unit,
) = Screen(serializer<T>(), path, query, modifier, refreshable, content)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun <T> Screen(serializer: KSerializer<T>, path: String, query: Map<String, String?>, modifier: Modifier, refreshable: Boolean, content: @Composable (T) -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var value by remember { mutableStateOf<T?>(null) }
    // What the shown value answers, to tell another week from the same one loaded again.
    var shown by remember { mutableStateOf<Pair<String, Map<String, String?>>?>(null) }
    var sentAt by remember { mutableStateOf<Long?>(null) }
    var unreachable by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var refreshing by remember { mutableStateOf(false) }
    var showServer by remember { mutableStateOf(false) }

    suspend fun load() {
        val request = path to query
        if (request != shown) {
            session.saved(serializer, path, query)?.let { (copy, date) ->
                value = copy
                shown = request
                sentAt = date
            }
        }
        try {
            value = session.get(serializer, path, query)
            shown = request
            sentAt = System.currentTimeMillis()
            unreachable = false
            error = null
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (failure: Exception) {
            android.util.Log.w("Budget", "$path: не загрузился", failure)
            // Keep showing what was loaded or saved before; only an empty screen shows the error.
            if (value == null) error = failure.message ?: failure.javaClass.simpleName
            if (failure is ApiError.Unreachable) unreachable = true
        }
    }

    LaunchedEffect(path, query, session.version) { load() }

    val body: @Composable BoxScope.() -> Unit = {
        val current = value
        when {
            current != null -> content(current)
            error != null -> Failure(error.orEmpty(), refreshable, retry = { scope.launch { load() } }, server = { showServer = true })
            else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { CircularProgressIndicator(color = Lilac.accent) }
        }
        val date = sentAt
        if (unreachable && current != null && date != null) {
            OfflinePill(date, Modifier.align(Alignment.BottomCenter).padding(bottom = 26.dp)) { showServer = true }
        }
    }
    if (refreshable) {
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = {
                scope.launch {
                    refreshing = true
                    session.sync()
                    load()
                    refreshing = false
                }
            },
            modifier = modifier.fillMaxSize(),
            content = body,
        )
    } else {
        // A sheet leaves the pull down to closing itself.
        Box(modifier.fillMaxSize(), content = body)
    }
    if (showServer) ServerSheet { showServer = false }
}

/** What a screen the phone has never had shows when the server does not answer. */
@Composable
private fun Failure(message: String, scrolls: Boolean, retry: () -> Unit, server: () -> Unit) {
    // It scrolls, for the pull to reach it, unless it is a part of a page that scrolls already.
    Column(
        Modifier.fillMaxSize().then(if (scrolls) Modifier.verticalScroll(rememberScrollState()) else Modifier).padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterVertically),
    ) {
        Icon(Icons.Outlined.WifiOff, contentDescription = null, tint = Lilac.muted, modifier = Modifier.padding(top = 120.dp).size(40.dp))
        LilacText("Не удалось загрузить", Type.title3, weight = FontWeight.SemiBold)
        LilacText(message, Type.subheadline, Lilac.muted)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = retry) { LilacText("Повторить", Type.body, Lilac.accent) }
            TextButton(onClick = server) { LilacText("Сервер", Type.body, Lilac.accent) }
        }
    }
}

/** Shows what went wrong with a change in an alert, as iOS's errorAlert. */
@Composable
fun ErrorAlert(error: MutableState<String?>) {
    val message = error.value ?: return
    AlertDialog(
        onDismissRequest = { error.value = null },
        confirmButton = { TextButton(onClick = { error.value = null }) { LilacText("OK", Type.body, Lilac.accent) } },
        title = { LilacText("Не получилось", Type.title3, weight = FontWeight.SemiBold) },
        text = { LilacText(message, Type.body) },
        containerColor = Lilac.surface,
    )
}

/** Asks before something that cannot be taken back, such as signing out, with the action in red. */
@Composable
fun ConfirmDialog(title: String, message: String, action: String, onDismiss: () -> Unit, confirm: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                onDismiss()
                confirm()
            }) { LilacText(action, Type.body, Lilac.red) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { LilacText("Отмена", Type.body, Lilac.accent) } },
        title = { LilacText(title, Type.title3, weight = FontWeight.SemiBold) },
        text = { LilacText(message, Type.body) },
        containerColor = Lilac.surface,
    )
}
