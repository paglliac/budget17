package ru.apukhtin.budget

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.CardGiftcard
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.DeleteOutline
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.Undo
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.time.Instant
import java.time.ZoneOffset
import kotlin.math.roundToLong
import kotlinx.coroutines.launch

// The «Желания» tab and a wish's page (ios/Budget/WishesView.swift, WishView.swift): every wish in one place, as cards
// with the ways each one's money comes from, or as the money their plans hold by month; a wish opens its page with the
// ways to afford it as cards to pick together, what they make step by step, and what they gather with the choice. The
// server works the plan out (src/wish-plans.ts) and keeps the one chosen.

/** All wishes, switched between the cards and the months, as the phone remembers; «+» adds one. */
@Composable
fun WishesView() {
    val session = LocalSession.current
    var part by remember { mutableStateOf(session.preference("wishes-part") ?: "cards") }
    var sheet by remember { mutableStateOf<BudgetSheet?>(null) }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            LilacTitle("Желания") { LilacRoundButton(Icons.Outlined.Add, "Добавить желание") { sheet = BudgetSheet.Wish(null) } }
            LilacSegmented(listOf("cards" to "Карточки", "months" to "Месяцы"), part, Modifier.fillMaxWidth().testTag("wishes-part")) {
                part = it
                session.remember("wishes-part", it)
            }
        }
        Screen<WishesScreen>("wishes") { s ->
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 40.dp)) {
                if (part == "months") WishMonths(s) { sheet = it } else WishCards(s) { sheet = it }
            }
        }
    }
    BudgetSheets(sheet) { sheet = null }
}

@Composable
private fun WishCards(s: WishesScreen, open: (BudgetSheet) -> Unit) {
    Column(Modifier.padding(top = 18.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        s.wishes.forEach { wish -> WishCard(wish, s.symbol) { open(BudgetSheet.Wish(wish.id)) } }
        if (s.wishes.isEmpty()) LilacAddRow("Добавить желание") { open(BudgetSheet.Wish(null)) }
    }
}

/**
 * A wish's card: its name, day and amount, then what its plan gathers, what is set aside and the ways its money comes
 * from, with «Изменить» and «Отменить план»; a wish without a plan has «Разложить». A plan buying it after its day shows
 * the week orange, one falling short says by how much in red, and choosing its ways again is a button of its own.
 */
@Composable
private fun WishCard(wish: WishSummary, symbol: String, open: () -> Unit) {
    val send = rememberSend()
    var confirmUnchoose by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(20.dp), ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f))
            .background(Lilac.surface, RoundedCornerShape(20.dp)).padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Row(Modifier.fillMaxWidth().testTag("wish-card-${wish.id}").tap(onClick = open), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
                LilacText(wish.wish.title, Type.body, weight = FontWeight.SemiBold)
                if (wish.time.isNotEmpty()) LilacText(wish.time, Type.subheadline, if (wish.situation == "risk") Palette.color("orange") else Lilac.muted)
            }
            LilacAmount(wish.wish.amount, symbol, 22.sp)
        }
        when (wish.state) {
            "bought" -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Outlined.Check, contentDescription = null, tint = Lilac.accent, modifier = Modifier.size(16.dp))
                LilacText(if (wish.wish.kind == "card") "Погашено" else "Куплено", Type.subheadline, Lilac.accent, FontWeight.SemiBold)
            }
            "planned" -> {
                GatheredBar(wish.wish.amount, wish.covered, wish.ways.map { it.amount to it.color })
                wish.ways.forEach { WayLine(it, symbol) }
                if (wish.short > 0.5 || wish.relay != null) {
                    @OptIn(ExperimentalLayoutApi::class)
                    FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        if (wish.short > 0.5) LilacText("Не хватает ${Money.text(wish.short, symbol)}", Type.subheadline, Lilac.red, FontWeight.SemiBold, modifier = Modifier.align(Alignment.CenterVertically))
                        wish.relay?.let { relay -> LilacInlineAction(relay.label, Modifier.testTag("wish-relay-${wish.id}")) { send("wishes/${wish.id}/ways", mapOf("ways" to relay.ways)) } }
                    }
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    LilacInlineAction("Изменить", onClick = open)
                    LilacInlineAction("Отменить план") { confirmUnchoose = true }
                }
            }
            else -> {
                wish.ways.forEach { WayLine(it, symbol) }
                Row(verticalAlignment = Alignment.CenterVertically) {
                    LilacText("Не разложено", Type.subheadline, Lilac.muted, modifier = Modifier.weight(1f))
                    LilacInlineAction("Разложить", onClick = open)
                }
            }
        }
    }
    if (confirmUnchoose) {
        ConfirmDialog("Отменить план «${wish.wish.title}»?", "", "Отменить план", onDismiss = { confirmUnchoose = false }) {
            send("wishes/${wish.id}/ways/delete", emptyMap())
        }
    }
}

/** Posts a form from a card or a line, with what went wrong in an alert. */
@Composable
private fun rememberSend(): (String, Map<String, String>) -> Unit {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val error = remember { mutableStateOf<String?>(null) }
    ErrorAlert(error)
    return { path, form ->
        scope.launch {
            try {
                session.send(path, form)
            } catch (failure: Exception) {
                error.value = failure.message
            }
        }
    }
}

/** A way the chosen plan takes money from: its tile, its name over what it does, and what it gives in all. */
@Composable
private fun WayLine(way: WishSummary.Way, symbol: String) {
    val color = Palette.color(way.color)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.size(34.dp).background(color.copy(alpha = 0.16f), RoundedCornerShape(10.dp)), contentAlignment = Alignment.Center) {
            Icon(WebIcons.icon(way.icon), contentDescription = null, tint = color, modifier = Modifier.size(16.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            LilacText(way.title, Type.subheadline, weight = FontWeight.SemiBold)
            LilacText(way.line, Type.footnote, Lilac.muted, lines = 2)
        }
        LilacText(Money.text(way.amount, symbol), Type.subheadline, weight = FontWeight.SemiBold, lines = 1, tabular = true)
    }
}

/** The wishes a line each, then what their plans hold by month, each row opening its wish. */
@Composable
private fun WishMonths(s: WishesScreen, open: (BudgetSheet) -> Unit) {
    Column(Modifier.padding(top = 14.dp)) {
        s.wishes.forEachIndexed { index, wish -> WishLine(wish, s.symbol, index == 0) { open(BudgetSheet.Wish(wish.id)) } }
        if (s.wishes.isEmpty()) LilacAddRow("Добавить желание") { open(BudgetSheet.Wish(null)) }
        s.months.forEach { month ->
            LilacHeading(month.title, Money.text(month.total, s.symbol))
            month.rows.forEachIndexed { index, held ->
                LilacRow(
                    LilacMarker.icon(held.row), held.row.title, held.row.details, held.row.amount, s.symbol, first = index == 0,
                    modifier = Modifier.card { open(BudgetSheet.Wish(held.wish)) },
                )
            }
        }
    }
}

/** A wish's line: its name over its day and plan, its amount; a long press takes the plan back or deletes the wish. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun WishLine(wish: WishSummary, symbol: String, first: Boolean, open: () -> Unit) {
    val send = rememberSend()
    val haptics = LocalHapticFeedback.current
    var menu by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }
    Box {
        LilacRow(
            LilacMarker.Symbol(if (wish.row.muted) Icons.Outlined.Check else WebIcons.icon(wish.row.icon), if (wish.row.muted) Lilac.muted else Palette.week),
            wish.row.title, wish.row.details, wish.row.amount, symbol, muted = wish.row.muted, first = first,
            modifier = Modifier.testTag("wish-line-${wish.id}").combinedClickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onLongClick = {
                    haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                    menu = true
                },
                onClick = open,
            ),
        )
        DropdownMenu(menu, { menu = false }, containerColor = Lilac.surface) {
            if (wish.state == "planned") {
                DropdownMenuItem(
                    text = { LilacText("Отменить план", Type.body) },
                    leadingIcon = { Icon(Icons.Outlined.Undo, contentDescription = null, tint = Lilac.ink) },
                    onClick = {
                        menu = false
                        send("wishes/${wish.id}/ways/delete", emptyMap())
                    },
                )
            }
            DropdownMenuItem(
                text = { LilacText("Удалить", Type.body, Lilac.red) },
                leadingIcon = { Icon(Icons.Outlined.DeleteOutline, contentDescription = null, tint = Lilac.red) },
                onClick = {
                    menu = false
                    confirmDelete = true
                },
            )
        }
    }
    if (confirmDelete) {
        ConfirmDialog("Удалить «${wish.wish.title}»?", "", "Удалить", onDismiss = { confirmDelete = false }) { send("wishes/${wish.id}/delete", emptyMap()) }
    }
}

/** The wish's page: its name, amount and day, the ways, and the plan, with «Изменить» for its name and amount. */
@Composable
fun WishPlanSheet(id: Int, onDismiss: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    // The ways picked as the server takes them; null shows the chosen plan.
    var ways by remember { mutableStateOf<String?>(null) }
    var wish by remember { mutableStateOf<Wish?>(null) }
    var editing by remember { mutableStateOf(false) }
    val error = remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf(false) }
    fun post(path: String, form: Map<String, String>, done: () -> Unit = {}) {
        busy = true
        scope.launch {
            try {
                session.send(path, form)
                done()
            } catch (failure: Exception) {
                error.value = failure.message
            } finally {
                busy = false
            }
        }
    }
    LilacSheetFrame(onDismiss) {
        Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(40.dp).semantics { contentDescription = "Готово" }.tap(onClick = onDismiss), contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.Close, contentDescription = null, tint = Lilac.ink)
            }
            Spacer(Modifier.weight(1f))
            if (wish != null) LilacText("Изменить", Type.body, Lilac.accent, modifier = Modifier.tap { editing = true })
        }
        Screen<WishScreen>("wish", mapOf("id" to "$id", "ways" to ways), Modifier.weight(1f), refreshable = false) { s ->
            LaunchedEffect(s.wish) { wish = Wish(s.wish.id, s.wish.title, s.wish.amount, s.wish.kind, s.rate) }
            Column(Modifier.fillMaxSize()) {
                Column(Modifier.weight(1f).verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 24.dp)) {
                    LilacText(s.wish.title, 32.sp, lines = 2, modifier = Modifier.padding(top = 4.dp))
                    LilacAmount(s.wish.amount, s.symbol, 44.sp, modifier = Modifier.padding(top = 2.dp))
                    Box(Modifier.padding(top = 10.dp)) { DueLine(s) { due -> post("wishes/${s.wish.id}/due", mapOf("due" to due)) } }
                    s.saved?.takeIf { it > 0.5 }?.let { Box(Modifier.padding(top = 10.dp)) { SavedLine(s.word.saved, it, s.symbol) } }
                    val scenarios = s.scenarios
                    if (!s.bought && !scenarios.isNullOrEmpty()) Box(Modifier.padding(top = 14.dp)) { ScenarioChips(scenarios) { ways = it } }
                    if (!s.bought) {
                        LilacHeading(s.word.plan ?: "Как собрать")
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            s.ways.forEach { way ->
                                key(way.id) {
                                    WayCardView(way, s.symbol, toggle = { ways = Picks(s.picks).toggled(way.id).text }) { amount ->
                                        ways = Picks(s.picks).giving(amount, way.id).text
                                    }
                                }
                            }
                        }
                    }
                    if (s.steps.isNotEmpty()) {
                        LilacHeading("Как получится")
                        PlanSteps(s)
                    }
                }
                Gathered(
                    s, busy,
                    choose = { post("wishes/${s.wish.id}/ways", mapOf("ways" to s.picks)) { ways = null } },
                    relay = { relay -> post("wishes/${s.wish.id}/ways", mapOf("ways" to relay.ways)) { ways = null } },
                    unchoose = { post("wishes/${s.wish.id}/ways/delete", emptyMap()) { ways = null } },
                )
            }
        }
    }
    if (editing) wish?.let { WishSheet(it, { editing = false }) { onDismiss() } }
    ErrorAlert(error)
}

/** «Нужно» with the day the wish is needed by, to pick; a card's last day without interest. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DueLine(s: WishScreen, change: (String) -> Unit) {
    var picking by remember { mutableStateOf(false) }
    val due = Dates.date(s.wish.due)
    Row(
        Modifier.fillMaxWidth().height(52.dp)
            .shadow(4.dp, RoundedCornerShape(16.dp), ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f))
            .background(Lilac.surface, RoundedCornerShape(16.dp)).tap { picking = true }.padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(Icons.Outlined.Flag, contentDescription = null, tint = Lilac.accent, modifier = Modifier.size(18.dp))
        LilacText(s.word.due, Type.body, modifier = Modifier.weight(1f))
        LilacText(
            due?.format(java.time.format.DateTimeFormatter.ofPattern("d MMM yyyy", java.util.Locale.forLanguageTag("ru"))) ?: s.wish.due,
            Type.body, Lilac.accent.copy(alpha = if (s.wish.dueSet) 1f else 0.55f),
        )
    }
    if (picking) {
        val from = Dates.date(s.dueRange.from)?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli() ?: Long.MIN_VALUE
        val to = Dates.date(s.dueRange.to)?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli() ?: Long.MAX_VALUE
        val state = rememberDatePickerState(
            initialSelectedDateMillis = due?.atStartOfDay(ZoneOffset.UTC)?.toInstant()?.toEpochMilli(),
            selectableDates = object : SelectableDates {
                override fun isSelectableDate(utcTimeMillis: Long) = utcTimeMillis in from..to
            },
        )
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { change(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()) }
                    picking = false
                }) { LilacText("Готово", Type.body, Lilac.accent, FontWeight.SemiBold) }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { LilacText("Отмена", Type.body, Lilac.accent) } },
        ) { DatePicker(state, showModeToggle = false) }
    }
}

/** What expenses set aside for the wish, or repaid of a card, under its day. */
@Composable
private fun SavedLine(title: String, amount: Double, symbol: String) {
    Row(
        Modifier.fillMaxWidth().height(52.dp)
            .shadow(4.dp, RoundedCornerShape(16.dp), ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f))
            .background(Lilac.surface, RoundedCornerShape(16.dp)).padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Icon(WebIcons.icon("piggy"), contentDescription = null, tint = Palette.color("green"), modifier = Modifier.size(18.dp))
        LilacText(title, Type.body, modifier = Modifier.weight(1f))
        LilacText(Money.text(amount, symbol), Type.body, weight = FontWeight.SemiBold, tabular = true)
    }
}

/** The ways picked, in the order picked, each with what it is given by hand or nothing for what the others leave. */
class Picks(text: String) {
    private val items: List<Pair<String, String>> = text.split(",").filter { it.isNotEmpty() }.map {
        val pair = it.split(":", limit = 2)
        pair[0] to pair.getOrElse(1) { "" }
    }

    private constructor(items: List<Pair<String, String>>) : this(items.joinToString(",") { "${it.first}:${it.second}" })

    val text get() = items.joinToString(",") { "${it.first}:${it.second}" }

    /** Picked, it takes what the others leave; picked again, it is put back. */
    fun toggled(id: String) = if (items.any { it.first == id }) Picks(items.filterNot { it.first == id }) else Picks(items + (id to ""))

    fun giving(amount: Double, id: String) = Picks(items.map { if (it.first == id) id to amount.roundToLong().toString() else it })
}

/** A way as a card: tapped, it is picked or put back; picked, a slider sets what it gives. */
@Composable
private fun WayCardView(way: WayCard, symbol: String, toggle: () -> Unit, give: (Double) -> Unit) {
    val color = Palette.color(way.color)
    // What the slider shows while it is moved, until the server answers.
    var moving by remember(way) { mutableStateOf<Double?>(null) }
    val shape = RoundedCornerShape(20.dp)
    Column(
        Modifier.fillMaxWidth()
            .then(if (way.on) Modifier.shadow(4.dp, shape, ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f)) else Modifier)
            .background(if (way.on) Lilac.surface else Lilac.surface.copy(alpha = 0.55f), shape)
            .then(if (way.on) Modifier.border(1.dp, Lilac.accent.copy(alpha = 0.35f), shape) else Modifier)
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().testTag("way-${way.id}").semantics { selected = way.on }.tap(onClick = toggle),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(40.dp).background(color.copy(alpha = 0.16f), RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                Icon(WebIcons.icon(way.icon), contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
            }
            LilacText(way.title, Type.body, weight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
            Icon(
                if (way.on) Icons.Filled.CheckCircle else Icons.Outlined.RadioButtonUnchecked, contentDescription = null,
                tint = if (way.on) Lilac.accent else Lilac.muted.copy(alpha = 0.5f), modifier = Modifier.size(26.dp),
            )
        }
        if (way.on) {
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                LilacAmount(moving ?: way.amount, symbol, 28.sp)
                way.unit?.let { LilacText(it, Type.subheadline, Lilac.muted, modifier = Modifier.padding(bottom = 4.dp)) }
                Spacer(Modifier.weight(1f))
                if (!way.fixed) LilacText(way.rest ?: "остальное", Type.footnote, Lilac.accent, FontWeight.SemiBold, modifier = Modifier.padding(bottom = 4.dp))
            }
        }
        LilacText(way.line, Type.subheadline, if (way.late) Palette.color("orange") else Lilac.muted)
        if (way.on && way.most > 0.5) {
            Slider(
                value = (moving ?: way.amount).coerceIn(0.0, way.most).toFloat(),
                onValueChange = { value ->
                    // By whole steps, the top end reached as it is.
                    moving = if (value >= way.most - way.step / 2) way.most else (value / way.step).roundToLong() * way.step
                },
                onValueChangeFinished = { moving?.let(give) },
                valueRange = 0f..way.most.toFloat(),
                colors = SliderDefaults.colors(thumbColor = Color.White, activeTrackColor = color, inactiveTrackColor = Lilac.track),
                modifier = Modifier.testTag("slider-${way.id}"),
            )
        }
    }
}

/** A card's plans to pick in one tap, side by side: the month each closes it in over the interest it costs. */
@Composable
private fun ScenarioChips(scenarios: List<WishScreen.Scenario>, pick: (String) -> Unit) {
    Row(Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        scenarios.forEach { scenario ->
            val shape = RoundedCornerShape(14.dp)
            Column(
                Modifier.testTag("scenario-${scenario.ways}").card { pick(scenario.ways) }
                    .background(if (scenario.on) Lilac.tint else Lilac.surface, shape)
                    .then(if (scenario.on) Modifier.border(1.dp, Lilac.accent.copy(alpha = 0.35f), shape) else Modifier)
                    .padding(horizontal = 14.dp, vertical = 9.dp),
                verticalArrangement = Arrangement.spacedBy(1.dp),
            ) {
                LilacText(scenario.label, Type.subheadline, if (scenario.on) Lilac.accent else Lilac.ink, FontWeight.SemiBold, lines = 1)
                if (scenario.note.isNotEmpty()) LilacText(scenario.note, Type.footnote, Lilac.muted, lines = 1, tabular = true)
            }
        }
    }
}

/** The plan's steps by date, a line at this week between what is behind and what is ahead, then the buying itself. */
@Composable
private fun PlanSteps(s: WishScreen) {
    val past = s.steps.filter { it.date <= s.current }
    val ahead = s.steps.filter { it.date > s.current }
    Column {
        past.forEachIndexed { index, step -> StepRow(step, s.symbol, index == 0) }
        if (past.isNotEmpty() && ahead.isNotEmpty()) LilacTodayLine("Сейчас")
        ahead.forEachIndexed { index, step -> StepRow(step, s.symbol, index == 0) }
        // A card's last month says it is closed, and the result under the plan when.
        if (s.result == null) {
            LilacRow(
                LilacMarker.Symbol(if (s.wish.kind == "card") WebIcons.icon("card") else Icons.Outlined.CardGiftcard, if (s.buy.late) Palette.color("orange") else Lilac.accent),
                if (s.bought) s.word.bought else s.word.buy, s.buy.label, null, s.symbol, chevron = false,
            )
        }
    }
}

@Composable
private fun StepRow(step: PlanStep, symbol: String, first: Boolean) {
    LilacRow(LilacMarker.icon(step.row), step.row.title, step.row.details, step.row.amount, symbol, first = first, chevron = false)
}

/** What the ways picked gather, kept at the bottom, with the choice. */
@Composable
private fun Gathered(s: WishScreen, busy: Boolean, choose: () -> Unit, relay: (WishRelay) -> Unit, unchoose: () -> Unit) {
    val picked = s.ways.any { it.on }
    Column(
        Modifier.fillMaxWidth().shadow(10.dp).background(Lilac.surface).padding(horizontal = 24.dp).padding(top = 14.dp, bottom = 8.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        val result = s.result
        if (result != null) {
            // A card tells when the ways picked close it, and what that costs.
            Column(Modifier.testTag("card-result"), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                LilacText(result.title, Type.body, if (result.late) Lilac.red else Lilac.ink, FontWeight.SemiBold)
                if (result.note.isNotEmpty()) LilacText(result.note, Type.subheadline, Lilac.muted)
            }
        } else {
            Row(verticalAlignment = Alignment.CenterVertically) {
                LilacText("Собрано", Type.subheadline, Lilac.muted, modifier = Modifier.weight(1f))
                LilacText("${Money.number(s.covered)} из ${Money.text(s.wish.amount, s.symbol)}", Type.body, weight = FontWeight.SemiBold, tabular = true)
            }
            GatheredBar(s.wish.amount, s.covered, s.ways.filter { it.on }.map { it.given to it.color })
        }
        if (result == null && s.short > 0.5 && (picked || s.chosen)) {
            LilacText("Не хватает ${Money.text(s.short, s.symbol)}", Type.subheadline, Lilac.red, FontWeight.SemiBold)
        }
        when {
            s.bought -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Icon(Icons.Outlined.Check, contentDescription = null, tint = Lilac.accent, modifier = Modifier.size(16.dp))
                LilacText(s.word.bought, Type.subheadline, Lilac.accent, FontWeight.SemiBold)
            }
            s.chosen -> {
                val r = s.relay
                if (r != null && r.add) LilacPrimaryButton(r.label, busy, Modifier.testTag("wish-relay")) { relay(r) }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Outlined.Check, contentDescription = null, tint = Lilac.accent, modifier = Modifier.size(16.dp))
                    LilacText("Выбрано", Type.subheadline, Lilac.accent, FontWeight.SemiBold, modifier = Modifier.weight(1f))
                    if (r != null && !r.add) LilacInlineAction(r.label) { relay(r) }
                    LilacInlineAction("Отменить", onClick = unchoose)
                }
            }
            picked -> LilacPrimaryButton("Выбрать", busy, onClick = choose)
        }
    }
}

/**
 * The wish's amount as a track, each way a part of it in its colour; the chosen plan's money before the ways picked now
 * shows violet first.
 */
@Composable
private fun GatheredBar(total: Double, covered: Double, ways: List<Pair<Double, String>>) {
    val parts = ways.filter { it.first > 0.5 }
    val kept = maxOf(0.0, covered - parts.sumOf { it.first })
    val accent = Lilac.accent
    BoxWithConstraints(Modifier.fillMaxWidth().height(12.dp).background(Lilac.track, CircleShape)) {
        val count = parts.size + if (kept > 0.5) 1 else 0
        val width = maxWidth - 3.dp * maxOf(count - 1, 0)
        fun share(amount: Double) = maxOf(width * (amount / maxOf(total, 1.0)).coerceAtMost(1.0).toFloat(), 8.dp)
        Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
            if (kept > 0.5) Box(Modifier.width(share(kept)).height(12.dp).background(accent.copy(alpha = 0.45f), CircleShape))
            parts.forEach { (amount, color) -> Box(Modifier.width(share(amount)).height(12.dp).background(Palette.color(color), CircleShape)) }
        }
    }
}
