package ru.apukhtin.budget

import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.BarChart
import androidx.compose.material.icons.outlined.CalendarMonth
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.Description
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDefaults
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import android.content.res.Configuration
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.platform.LocalConfiguration
import java.time.LocalDate
import java.util.Locale
import java.time.ZoneOffset
import java.time.temporal.ChronoUnit
import kotlin.math.abs
import kotlin.math.roundToInt
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Where the main page and the month go from their days, footer and extras. */
sealed interface HomeRoute {
    /** The spending of the week, or of one day of it. */
    data class Spending(val day: String?) : HomeRoute

    /** Why the week of that first day went below zero. */
    data class Why(val week: String) : HomeRoute

    /** The extras of a month; null is the current one. */
    data class Extras(val month: String?) : HomeRoute

    /** The extras of a month in detail, with the expenses by day. */
    data class ExtrasDetails(val month: String?) : HomeRoute
}

/** What a tab opens as a sheet over itself, as ios/Budget/Sheets.swift's BudgetSheet. */
sealed interface BudgetSheet {
    /** An expense or an income to mark, with the ones to step through after it. */
    data class Spending(val id: String, val queue: List<String> = emptyList()) : BudgetSheet

    data class Limit(val draft: WeekLimitDraft) : BudgetSheet

    data class Purchase(val draft: PurchaseDraft) : BudgetSheet

    /** A regular expense by its id, from a week's plan. */
    data class Regular(val id: Int) : BudgetSheet

    /** A wish's page by its id, or the form of a new one. */
    data class Wish(val id: Int?) : BudgetSheet
}

/** Shows the sheet a tab opened, and forgets it once closed. */
@Composable
fun BudgetSheets(sheet: BudgetSheet?, close: () -> Unit) {
    when (sheet) {
        is BudgetSheet.Spending -> key(sheet) { MarkingSheet(sheet.id, sheet.queue, close, LocalOpenShop.current) }
        is BudgetSheet.Limit -> WeekLimitSheet(sheet.draft, close)
        is BudgetSheet.Purchase -> key(sheet) { PurchaseSheet(sheet.draft, close) }
        is BudgetSheet.Regular -> key(sheet) { RegularLoader(sheet.id, close) }
        is BudgetSheet.Wish -> key(sheet) { if (sheet.id != null) WishPlanSheet(sheet.id, close) else WishSheet(null, close) }
        null -> {}
    }
}

/** What the main tab's switch shows. */
enum class HomeMode { Week, Month }

/**
 * The main tab: the week or the month, as «Неделя» and «Месяц» switch them, each stepping back and forth, with the pages
 * they open over them. A return (a tap on the open «Главная») brings back the current week with nothing over it.
 */
@Composable
fun BudgetView(returns: Int, extrasOpens: Int, openPending: () -> Unit, openPlan: (String?) -> Unit, openWishes: () -> Unit) {
    var mode by rememberSaveable { mutableStateOf(HomeMode.Week) }
    // null is the current week or month.
    var week by rememberSaveable { mutableStateOf<String?>(null) }
    var month by rememberSaveable { mutableStateOf<String?>(null) }
    val path = remember { mutableStateListOf<HomeRoute>() }
    var sheet by remember { mutableStateOf<BudgetSheet?>(null) }

    LaunchedEffect(returns) {
        path.clear()
        mode = HomeMode.Week
        week = null
    }
    // The extras' widget opens this month on its extras.
    LaunchedEffect(extrasOpens) {
        if (extrasOpens > 0) {
            path.clear()
            path.add(HomeRoute.Extras(null))
        }
    }
    BackHandler(enabled = path.isNotEmpty()) { path.removeAt(path.lastIndex) }
    val back = { path.removeAt(path.lastIndex); Unit }

    when (val route = path.lastOrNull()) {
        is HomeRoute.Spending -> WeekSpendingView(week, route.day, { sheet = it }, back)
        is HomeRoute.Why -> WeekWhyView(route.week, back, { sheet = it }) { openPlan(week) }
        is HomeRoute.Extras -> ExtrasView(route.month, back, { path.add(HomeRoute.ExtrasDetails(it)) }) { sheet = it }
        is HomeRoute.ExtrasDetails -> ExtrasDetailsView(route.month, back) { sheet = it }
        null -> when (mode) {
            HomeMode.Week -> HomeView(
                mode = mode,
                switchMode = { mode = it },
                week = week,
                go = { week = it },
                open = { path.add(it) },
                openPending = openPending,
                openPlan = { openPlan(week) },
                openWishes = openWishes,
                openSheet = { sheet = it },
            )
            HomeMode.Month -> MonthView(mode, { mode = it }, month, { month = it }, { path.add(HomeRoute.Extras(it)) }, { sheet = it }) { opened ->
                week = opened
                mode = HomeMode.Week
            }
        }
    }
    BudgetSheets(sheet) { sheet = null }
}

/** «Неделя» and «Месяц» of the main tab. */
@Composable
fun ModeSwitch(mode: HomeMode, switchMode: (HomeMode) -> Unit) {
    LilacSegmented(listOf(HomeMode.Week to "Неделя", HomeMode.Month to "Месяц"), mode, onSelect = switchMode)
}

/**
 * The main page, the week: the days of the week, a large circle with what is free on its lilac lens and what is reserved
 * beside it, then cards of what was spent today and of what is to be done. It fits the screen: a day or today's spending
 * opens the spending, the circle's chip changes what the week allows, and a swipe across it steps to the next week.
 */
@Composable
private fun HomeView(
    mode: HomeMode,
    switchMode: (HomeMode) -> Unit,
    week: String?,
    go: (String?) -> Unit,
    open: (HomeRoute) -> Unit,
    openPending: () -> Unit,
    openPlan: () -> Unit,
    openWishes: () -> Unit,
    openSheet: (BudgetSheet) -> Unit,
) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var picking by remember { mutableStateOf(false) }
    Screen<WeekScreen>("week", mapOf("week" to week)) { s ->
        BoxWithConstraints(Modifier.fillMaxSize()) {
            val viewport = maxHeight
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                Column(Modifier.heightIn(min = viewport).padding(horizontal = 20.dp).padding(bottom = 12.dp)) {
                    Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        ModeSwitch(mode, switchMode)
                        Spacer(Modifier.weight(1f))
                        LilacIconButton(Icons.Outlined.CalendarMonth, "Выбрать неделю") { picking = true }
                    }
                    if (s.phase != "current") {
                        Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            LilacText(s.title, Type.subheadline, Lilac.muted)
                            Spacer(Modifier.weight(1f))
                            LilacChip("Сейчас") { go(null) }
                        }
                    }
                    Box(Modifier.padding(top = 14.dp)) {
                        LilacDayStrip(s.week, s.today, s.days.map { it.date }.toSet()) { open(HomeRoute.Spending(it)) }
                    }
                    Spacer(Modifier.weight(1f).heightIn(min = 8.dp))
                    HomeHero(
                        home = s.home,
                        limit = s.limit,
                        symbol = s.symbol,
                        editLimit = { openSheet(BudgetSheet.Limit(WeekLimitDraft(s.week, s.title, s.limit, s.symbol))) },
                        openReserved = openPlan,
                        openWhy = { open(HomeRoute.Why(s.week)) },
                        modifier = Modifier.padding(top = 16.dp).swipe { forward ->
                            if (forward) s.next?.let { go(if (it == s.current) null else it) } else go(if (s.prev == s.current) null else s.prev)
                        },
                    )
                    Spacer(Modifier.weight(1f).heightIn(min = 8.dp))
                    HomeFooter(
                        home = s.home,
                        symbol = s.symbol,
                        syncing = session.isSyncing,
                        openSpending = if (s.phase == "ahead") null else { { open(HomeRoute.Spending(null)) } },
                        sync = { scope.launch { session.sync() } },
                        openSort = openPending,
                        openShort = { wish -> if (wish != null) openSheet(BudgetSheet.Wish(wish)) else openWishes() },
                        openExtras = { open(HomeRoute.Extras(it)) },
                        modifier = Modifier.padding(top = 16.dp, bottom = 14.dp),
                    )
                }
            }
        }
        if (picking) WeekPicker(s, { picking = false }) { go(if (it == s.current) null else it) }
    }
}

/** A swipe across steps to the next week (to the left) or the previous one (to the right). */
private fun Modifier.swipe(step: (forward: Boolean) -> Unit): Modifier = pointerInput(Unit) {
    var dx = 0f
    detectHorizontalDragGestures(
        onDragStart = { dx = 0f },
        onDragEnd = { if (abs(dx) > 60.dp.toPx()) step(dx < 0) },
    ) { _, amount -> dx += amount }
}

/**
 * The circle of the main page: what is free on its lilac lens, with what the week allows under it to change, and what is
 * reserved beside it, required and flexible, which opens the plan. On the lens a wave shows how full the week is, and
 * what is free rides above it.
 */
@Composable
fun HomeHero(
    home: WeekHome,
    limit: WeekLimit,
    symbol: String,
    editLimit: () -> Unit,
    openReserved: () -> Unit,
    openWhy: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val level = WaveLevel(home.free)
    // The wave rises from the bottom once the circle shows.
    var risen by remember { mutableStateOf(false) }
    LaunchedEffect(Unit) {
        delay(150)
        risen = true
    }
    val height by animateFloatAsState(if (risen) level.height else 0f, spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessVeryLow), label = "wave")
    var freeHeight by remember { mutableFloatStateOf(0f) }
    val surface = Lilac.surface
    val canvas = Lilac.canvas
    BoxWithConstraints(modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
        val d = minOf(maxWidth, 400.dp)
        val px = with(LocalDensity.current) { d.toPx() }
        // How far what is free rises over the circle's middle to stay above the wave, while it still fits the lens.
        val crest = px * 0.92f - px * 0.84f * height - px * WAVE_AMPLITUDE - with(LocalDensity.current) { 12.dp.toPx() }
        val lift = if (freeHeight > 0) (px / 2 + freeHeight / 2 - crest).coerceIn(0f, px * 0.11f) else 0f
        Box(Modifier.size(d)) {
            Canvas(
                Modifier.size(d).shadow(24.dp, CircleShape, ambientColor = Color.Black.copy(alpha = 0.18f), spotColor = Color.Black.copy(alpha = 0.18f)),
            ) { drawDisc(surface, canvas) }
            WaveLens(level, height, d)
            Row(Modifier.size(d), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.padding(start = d * 0.08f).width(d * 0.41f)) {
                    Free(home, limit, symbol, over = level.state == "over", editLimit, openWhy, Modifier
                        .onSizeChanged { freeHeight = it.height.toFloat() }
                        .offset { androidx.compose.ui.unit.IntOffset(0, -lift.roundToInt()) })
                }
                Box(Modifier.padding(start = d * 0.07f).width(d * 0.44f).card(label = "План недели", onClick = openReserved)) {
                    Reserved(home.reserved, symbol)
                }
            }
        }
    }
}

/**
 * What is free. Past the week's amount the wave says it: the label goes, and the amount is how far past it, in red;
 * it opens why.
 */
@Composable
private fun Free(home: WeekHome, limit: WeekLimit, symbol: String, over: Boolean, editLimit: () -> Unit, openWhy: () -> Unit, modifier: Modifier) {
    Column(modifier.padding(end = 10.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        if (over) {
            Row(Modifier.testTag("week-why").card(onClick = openWhy), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                LilacAmount(-home.free.amount, symbol, 30.sp, color = Lilac.red, modifier = Modifier.weight(1f, fill = false))
                Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = Lilac.red.copy(alpha = 0.7f), modifier = Modifier.size(16.dp))
            }
        } else {
            LilacText(home.free.label, Type.callout, Lilac.ink.copy(alpha = 0.85f))
            LilacAmount(home.free.amount, symbol, 30.sp)
        }
        LilacChip(
            "${if (over) "сверх" else "из"} ${Money.number(limit.amount)}",
            Icons.Outlined.Edit,
            highlighted = limit.changed,
            modifier = Modifier.padding(top = 2.dp).semantics { contentDescription = "Бюджет недели ${Money.text(limit.amount, symbol)}" },
            onClick = editLimit,
        )
    }
}

@Composable
private fun Reserved(r: WeekHome.Reserved, symbol: String) {
    Column(Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            LilacText(r.label, Type.subheadline, Lilac.ink.copy(alpha = 0.85f), lines = 1, modifier = Modifier.weight(1f, fill = false))
            Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = Lilac.muted, modifier = Modifier.size(14.dp))
        }
        LilacAmount(r.amount, symbol, 27.sp, modifier = Modifier.padding(top = 4.dp))
        Hairline()
        Part(r.required, symbol)
        Hairline()
        Part(r.flexible, symbol)
    }
}

@Composable
private fun Part(figure: Figure, symbol: String) {
    Column(verticalArrangement = Arrangement.spacedBy(1.dp)) {
        LilacAmount(figure.amount, symbol, 18.sp, FontWeight.SemiBold)
        LilacText(figure.label, Type.subheadline, Lilac.muted)
    }
}

/**
 * Under the circle, two cards after the user's picture of 2026-10-13: what was spent today (in a past week, in all of
 * it) with when the data came from ZenMoney, which opens the week's spending, and beside it the place of what has to be
 * done, as the server says (`task`): the expenses to sort, a wish short of money, or the extras of the week's month.
 */
@Composable
private fun HomeFooter(
    home: WeekHome,
    symbol: String,
    syncing: Boolean,
    openSpending: (() -> Unit)?,
    sync: () -> Unit,
    openSort: () -> Unit,
    openShort: (Int?) -> Unit,
    openExtras: (String?) -> Unit,
    modifier: Modifier,
) {
    // Both cards as tall as the taller one.
    Row(modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        home.spent?.let { spent ->
            HomeCard(Icons.Outlined.BarChart, Modifier.weight(1f).card { openSpending?.invoke() }) {
                LilacText(spent.label, Type.footnote, Lilac.muted, lines = 2)
                LilacAmount(spent.amount, symbol, 24.sp)
                Dates.instant(home.syncedAt)?.let { synced -> SyncLine(synced, syncing, sync) }
            }
        }
        val short = home.short
        val extras = home.extras
        // A server from before the task leaves the extras to when all is sorted.
        val task = home.task ?: if (home.pending.count == 0 && extras != null) "extras" else "sort"
        when {
            task == "short" && short != null -> HomeCard(
                Icons.Outlined.AutoAwesome, Modifier.weight(1f).card { openShort(short.wish) }, badge = true, highlighted = true, chevron = true,
            ) {
                LilacText(short.label, Type.footnote, Lilac.muted, lines = 1)
                LilacAmount(short.amount, symbol, 20.sp, color = Lilac.red)
                LilacText(short.note, Type.footnote, Lilac.accent, FontWeight.Medium, lines = 1)
            }
            task == "extras" && extras != null -> HomeCard(
                Icons.Outlined.AccountBalanceWallet, Modifier.weight(1f).card { openExtras(extras.month) }, tile = Lilac.track, iconColor = Lilac.ink.copy(alpha = 0.6f),
            ) {
                LilacText(extras.label, Type.footnote, Lilac.muted, lines = 1)
                LilacAmount(extras.amount, symbol, 20.sp, color = if (extras.over) Lilac.red else null)
                LilacText(extras.note, Type.footnote, Lilac.muted, lines = 1)
            }
            else -> {
                // «Разобрать операции» and «3 новые» on lilac; a server from before the cards says how many wait as it did.
                val pending = home.pending
                val waiting = pending.count > 0
                HomeCard(
                    if (waiting) Icons.Outlined.Description else Icons.Outlined.Check, Modifier.weight(1f).card(onClick = openSort),
                    badge = waiting, highlighted = waiting, chevron = true,
                ) {
                    LilacText(pending.title ?: if (waiting) "${pending.count} ${pending.label}" else pending.label, Type.subheadline, weight = FontWeight.SemiBold, lines = 2)
                    if (waiting && pending.note != null) LilacText(pending.note, Type.footnote, Lilac.accent, FontWeight.Medium, tabular = true)
                }
            }
        }
    }
}

/** When the data came from ZenMoney; pressed, the server fetches again, while the card around it opens the spending. */
@Composable
private fun SyncLine(synced: Long, syncing: Boolean, sync: () -> Unit) {
    val turn by rememberInfiniteTransition(label = "sync").animateFloat(0f, 360f, infiniteRepeatable(tween(1000, easing = LinearEasing)), label = "turn")
    Row(
        Modifier.semantics { contentDescription = "Обновлено ${Dates.moment(synced)}, обновить" }.tap(onClick = sync).padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Icon(Icons.Outlined.Sync, contentDescription = null, tint = Lilac.muted, modifier = Modifier.size(13.dp).rotate(if (syncing) turn else 0f))
        LilacText(Dates.moment(synced), Type.caption, Lilac.muted, lines = 1, tabular = true)
    }
}

/** A card under the circle: an icon on a tile and a few lines beside it, on white; on lilac with a red dot when it waits. */
@Composable
private fun HomeCard(
    icon: ImageVector,
    modifier: Modifier,
    tile: Color = Lilac.tint,
    iconColor: Color = Lilac.accent,
    badge: Boolean = false,
    highlighted: Boolean = false,
    chevron: Boolean = false,
    content: @Composable () -> Unit,
) {
    val shape = RoundedCornerShape(22.dp)
    Row(
        modifier.fillMaxHeight()
            .shadow(6.dp, shape, ambientColor = Color.Black.copy(alpha = 0.12f), spotColor = Color.Black.copy(alpha = 0.12f))
            .background(if (highlighted) Lilac.tint.copy(alpha = 0.6f).compositeOver(Lilac.canvas) else Lilac.surface, shape)
            .then(if (highlighted) Modifier.border(1.5.dp, Lilac.surface, shape) else Modifier)
            .padding(horizontal = 12.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Box {
            Box(Modifier.size(40.dp).background(if (highlighted) Lilac.surface else tile, RoundedCornerShape(13.dp)), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = iconColor, modifier = Modifier.size(20.dp))
            }
            if (badge) {
                Box(
                    Modifier.align(Alignment.TopEnd).offset(2.dp, (-2).dp).size(9.dp)
                        .background(Lilac.red, CircleShape).border(1.5.dp, Lilac.surface, CircleShape),
                )
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) { content() }
        if (chevron) Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = Lilac.muted, modifier = Modifier.size(16.dp))
    }
}

private fun Color.compositeOver(background: Color) = Color(
    red = red * alpha + background.red * (1 - alpha),
    green = green * alpha + background.green * (1 - alpha),
    blue = blue * alpha + background.blue * (1 - alpha),
)

/** The spending of the week, opened from a day or from today's spending: the days to pick one, and the rows. */
@Composable
private fun WeekSpendingView(week: String?, start: String?, open: (BudgetSheet) -> Unit, back: () -> Unit) {
    var day by remember { mutableStateOf(start) }
    Column(Modifier.fillMaxSize()) {
        PageBar("Траты", back)
        Screen<WeekScreen>("week", mapOf("week" to week)) { s ->
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
                Box(Modifier.padding(top = 8.dp)) {
                    LilacDayStrip(s.week, s.today, s.days.map { it.date }.toSet(), day) { tapped -> day = if (day == tapped) null else tapped }
                }
                WeekSpendingList(s, day) { open(BudgetSheet.Spending(it)) }
            }
        }
    }
}

/** The spending of a week by days, or of one day, as rows on the page. */
@Composable
fun WeekSpendingList(screen: WeekScreen, day: String?, open: (String) -> Unit) {
    val days = screen.days.filter { day == null || it.date == day }
    if (days.isEmpty()) LilacText("Трат пока нет.", Type.subheadline, Lilac.muted, modifier = Modifier.padding(vertical = 18.dp))
    days.forEach { group ->
        LilacDayHeading(group.title, group.subtitle)
        group.items.forEachIndexed { index, expense ->
            LilacRow(
                LilacMarker.expense(expense.row),
                expense.row.title,
                expense.row.details,
                expense.row.amount,
                screen.symbol,
                chip = markChip(expense.row.mark),
                muted = expense.row.muted,
                first = index == 0,
                chevron = false,
                amountColor = if (expense.optional) Palette.optional else Lilac.ink,
                modifier = Modifier.testTag(expense.id).card { open(expense.spending) },
            )
        }
    }
}

/** Where an expense counts, when it is not the week. */
@Composable
fun markChip(mark: String?): Note? = when (mark) {
    "extra" -> Note("Дополнительные", Lilac.accent)
    "outside" -> Note("Вне бюджета", Lilac.muted)
    "ignored" -> Note("Не учитывается", Lilac.muted)
    else -> null
}

/** A day's heading over its rows: Вчера with 8 октября, четверг, and the day's total. */
@Composable
fun LilacDayHeading(title: String, subtitle: String, total: String? = null) {
    Row(Modifier.fillMaxWidth().padding(top = 18.dp, bottom = 2.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        LilacText(title, Type.subheadline, weight = FontWeight.SemiBold)
        LilacText(subtitle, Type.subheadline, Lilac.muted)
        Spacer(Modifier.weight(1f))
        if (total != null) LilacText(total, Type.subheadline, Lilac.muted, tabular = true)
    }
}

/** The top of a page opened over a tab: back, and the page's title beside it. The phone's back does the same. */
@Composable
fun PageBar(title: String, back: () -> Unit, trailing: @Composable () -> Unit = {}) {
    BackHandler(onBack = back)
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp).padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(44.dp).semantics { contentDescription = "Назад" }.tap(onClick = back), contentAlignment = Alignment.Center) {
            Icon(Icons.AutoMirrored.Outlined.ArrowBack, contentDescription = null, tint = Lilac.accent)
        }
        LilacText(title, Type.title3, weight = FontWeight.SemiBold, lines = 1, modifier = Modifier.weight(1f))
        trailing()
    }
}

/** Picks a week by any of its days, up to a year after the current one, or goes back to the current one. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun WeekPicker(screen: WeekScreen, dismiss: () -> Unit, go: (String) -> Unit) {
    val first = Dates.date(screen.week) ?: LocalDate.now()
    val last = Dates.date(Dates.adding(7 * 52 + 6, screen.current)) ?: LocalDate.now()
    val state = rememberDatePickerState(
        initialSelectedDateMillis = first.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli(),
        selectableDates = object : SelectableDates {
            override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis <= last.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        },
    )
    val colors = DatePickerDefaults.colors(
        containerColor = Lilac.surface,
        selectedDayContainerColor = Lilac.accent,
        todayDateBorderColor = Lilac.accent,
        todayContentColor = Lilac.accent,
    )
    // In Russian whatever the phone's language, with weeks from Monday, as the iPhone's picker is.
    val russian = Configuration(LocalConfiguration.current).apply { setLocale(Locale.forLanguageTag("ru")) }
    CompositionLocalProvider(LocalConfiguration provides russian) {
        DatePickerDialog(
            onDismissRequest = dismiss,
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { millis ->
                        // The first day of the week the date falls in, counted from the shown week's first day.
                        val picked = java.time.Instant.ofEpochMilli(millis).atZone(ZoneOffset.UTC).toLocalDate()
                        val weeks = ChronoUnit.DAYS.between(first, picked).floorDiv(7L)
                        go(first.plusDays(weeks * 7).toString())
                    }
                    dismiss()
                }) { LilacText("Выбрать", Type.body, Lilac.accent, FontWeight.SemiBold) }
            },
            dismissButton = {
                Row {
                    if (screen.phase != "current") TextButton(onClick = { go(screen.current); dismiss() }) { LilacText("Сейчас", Type.body, Lilac.accent) }
                    TextButton(onClick = dismiss) { LilacText("Отмена", Type.body, Lilac.accent) }
                }
            },
            colors = colors,
        ) {
            DatePicker(
                state,
                colors = colors,
                showModeToggle = false,
                title = null,
                headline = { LilacText(screen.title, Type.title3, weight = FontWeight.SemiBold, modifier = Modifier.padding(start = 24.dp, top = 20.dp)) },
            )
        }
    }
}

/** The month: where its income goes, its weeks, each opening its week, and what is left of its extras. */
@Composable
private fun MonthView(
    mode: HomeMode,
    switchMode: (HomeMode) -> Unit,
    month: String?,
    go: (String?) -> Unit,
    openExtras: (String?) -> Unit,
    openSheet: (BudgetSheet) -> Unit,
    openWeek: (String) -> Unit,
) {
    Screen<MonthScreen>("month", mapOf("month" to month)) { s ->
        fun step(target: String) = go(if (target == s.thisMonth) null else target)
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                ModeSwitch(mode, switchMode)
                Spacer(Modifier.weight(1f))
                LilacRoundButton(Icons.Outlined.ChevronLeft, "Раньше") { step(s.prev.value) }
                LilacRoundButton(Icons.Outlined.ChevronRight, "Позже", enabled = s.next != null) { s.next?.let { step(it.value) } }
            }
            Row(Modifier.fillMaxWidth().padding(top = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                LilacText(s.title, Type.title3, weight = FontWeight.SemiBold)
                Spacer(Modifier.weight(1f))
                if (s.month != s.thisMonth) LilacChip("Сейчас") { go(null) }
            }
            s.flow?.let { IncomeFlow(it, s.symbol, Modifier.padding(top = 12.dp)) }
            LilacHeading("Недели")
            s.weeks.forEachIndexed { index, line ->
                LilacRow(
                    LilacMarker.Dot(Palette.color(line.row.color)), line.row.title, line.row.details, line.row.amount, s.symbol, first = index == 0,
                    modifier = Modifier.card { openWeek(line.week) },
                )
            }
            LilacHeading("Дополнительные") {
                LilacRoundButton(Icons.Outlined.Add, "Добавить в дополнительные") {
                    openSheet(BudgetSheet.Purchase(extraPurchase(s.newPurchaseWeek, s.weekChoices, s.symbol)))
                }
            }
            Column(
                Modifier.testTag("month-extras").card { openExtras(if (s.month == s.thisMonth) null else s.month) },
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LilacSummary(null, s.total.amount, s.symbol, s.total.note, 26.sp, Modifier.weight(1f))
                    Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = Lilac.muted.copy(alpha = 0.7f), modifier = Modifier.size(18.dp))
                }
                LilacShareBar(s.total.parts.orEmpty())
            }
        }
    }
}

/**
 * A month's income and where it goes, as lilac ribbons from the income to each part: the regular payments, the weeks'
 * budgets, the extras, and savings, the widest at the bottom. What is short of money has no ribbon and is red.
 */
@Composable
private fun IncomeFlow(flow: Flow, symbol: String, modifier: Modifier = Modifier) {
    // Where the parts end, top to bottom, a step apart, with the income under the last; the iPhone's four parts make
    // 340 high, and a month whose plans take for wishes and cards grows by a step each.
    val step = 69.dp
    val ys = flow.parts.indices.map { 31.dp + step * it }
    val height = ys.last() + 102.dp
    val tint = Lilac.tint
    val soft = Lilac.soft
    val accent = Lilac.accent
    val red = Lilac.red
    BoxWithConstraints(modifier.fillMaxWidth().height(height)) {
        val w = maxWidth
        val nodeX = w * 0.5f
        Canvas(Modifier.fillMaxSize()) {
            val maxThickness = 340.dp.toPx() * 0.36f
            val positive = flow.parts.sumOf { maxOf(it.share, 0.0) }.toFloat()
            var top = (ys.first().toPx() + ys.last().toPx()) / 2 + 20.dp.toPx() - maxThickness * minOf(positive, 1f) / 2
            val x = nodeX.toPx()
            flow.parts.forEachIndexed { index, part ->
                if (part.share <= 0) return@forEachIndexed
                val thickness = maxOf(maxThickness * part.share.toFloat(), 4.dp.toPx())
                val start = Offset(size.width * 0.06f, top)
                top += thickness
                val end = ys[index].toPx()
                val middle = (start.x + x) / 2
                val ribbon = Path().apply {
                    moveTo(start.x, start.y)
                    cubicTo(middle, start.y, middle, end - thickness / 2, x, end - thickness / 2)
                    lineTo(x, end + thickness / 2)
                    cubicTo(middle, end + thickness / 2, middle, top, start.x, top)
                    close()
                }
                drawPath(ribbon, Brush.horizontalGradient(listOf(tint.copy(alpha = 0.3f), soft.copy(alpha = (0.85f - index * 0.1f).coerceAtLeast(0.3f))), start.x, x))
            }
        }
        flow.parts.forEachIndexed { index, part ->
            val last = index == flow.parts.lastIndex && part.share > 0
            val node = if (last) 44.dp else 24.dp
            Box(Modifier.offset(nodeX - node / 2, ys[index] - node / 2).size(node).background(tint, CircleShape), contentAlignment = Alignment.Center) {
                Box(Modifier.size(if (last) 16.dp else 9.dp).background(if (part.share > 0) accent.copy(alpha = 0.8f) else red, CircleShape))
            }
            Column(Modifier.offset(nodeX + 18.dp, ys[index] - 30.dp).width(w * 0.5f - 18.dp).height(60.dp), verticalArrangement = Arrangement.Center) {
                LilacText(part.label, Type.caption, Lilac.muted, lines = 1)
                LilacAmount(part.amount, symbol, 19.sp, color = if (part.amount < 0) Lilac.red else Lilac.ink)
                if (part.share > 0) LilacText("${(part.share * 100).roundToInt()}%", Type.caption, Lilac.muted, tabular = true)
            }
        }
        Column(Modifier.offset(0.dp, height - 88.dp).width(w * 0.46f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            LilacText(flow.income.label, Type.callout)
            LilacAmount(flow.income.amount, symbol, 30.sp)
            LilacText(flow.income.note, Type.subheadline, Lilac.muted)
        }
    }
}
