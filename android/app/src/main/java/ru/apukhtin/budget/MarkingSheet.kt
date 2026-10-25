package ru.apukhtin.budget

import android.os.Build
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.Redo
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.KeyboardArrowDown
import androidx.compose.material.icons.outlined.KeyboardArrowUp
import androidx.compose.material.icons.outlined.RadioButtonUnchecked
import androidx.compose.material.icons.outlined.RemoveShoppingCart
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.SouthWest
import androidx.compose.material.icons.outlined.Storefront
import androidx.compose.material.icons.outlined.VisibilityOff
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** The lines of the sheet that unfold their choices. */
private enum class Part { Plan, Place, More }

/**
 * An expense opened to mark it, after the user's picture of 2026-10-22 (ios/Budget/MarkingSheet.swift). On top whom it
 * went to, when and from where, and the exact amount. Then what the user writes about it, large on a lilac cloud, sent
 * once typing pauses. Under it three lines, each with one step: what of the plan it paid; where it counts; and
 * «Категория и другие настройки», which unfolds the categories as tiles, the switch, the shop and what else the bank
 * said. A tap on a line unfolds its choices, and a pick folds them back. While the expense has neither a category nor a
 * payment the last line is unfolded. Opened from the expenses that wait for a category, it steps through them: «1 из 4».
 * An income opens the same way, only it pays nothing, so it has no line of the plan. Choices post to
 * spending/:id/:choice, the description to spending/:id/description.
 */
@Composable
fun MarkingSheet(start: String, queue: List<String>, onDismiss: () -> Unit, openShop: ((Shop) -> Unit)? = null) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val focus = LocalFocusManager.current
    var id by remember { mutableStateOf(start) }
    // A choice made and not yet confirmed by the server, shown as made already.
    var applying by remember { mutableStateOf<String?>(null) }
    var showOthers by remember { mutableStateOf(false) }
    var unfolded by remember { mutableStateOf(emptySet<Part>()) }
    // Whether «Категория и другие настройки» was tapped open or shut; until then it is open while nothing is picked.
    var more by remember { mutableStateOf<Boolean?>(null) }
    var heading by remember { mutableStateOf("Трата") }
    // The description as typed, until the server sends it back, and the draft last sent, so it goes once.
    var draft by remember { mutableStateOf<String?>(null) }
    var sent by remember { mutableStateOf<String?>(null) }
    var kept by remember { mutableStateOf(false) }
    var writing by remember { mutableStateOf(false) }
    var pause by remember { mutableStateOf<Job?>(null) }
    val error = remember { mutableStateOf<String?>(null) }

    /** Sends the description typed, once; an empty one takes it away. It goes on even when the sheet has closed. */
    fun saveDescription() {
        pause?.cancel()
        val text = draft ?: return
        if (text == sent) return
        sent = text
        val spending = id
        session.background.launch {
            try {
                session.send("spending/$spending/description", mapOf("description" to text))
                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                if (id == spending && draft == text) kept = true
            } catch (failure: Exception) {
                sent = null
                error.value = failure.message
            }
        }
    }

    fun choose(choice: String) {
        applying = choice
        haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
        scope.launch {
            try {
                session.send("spending/$id/$choice")
                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            } catch (failure: Exception) {
                applying = null
                error.value = failure.message
            }
        }
    }

    /** Makes a choice, and folds the line it was made on once its tick has shown, unless the sheet has moved on. */
    fun pick(choice: String, folding: Part) {
        if (folding == Part.More) more = true
        choose(choice)
        val spending = id
        scope.launch {
            delay(350)
            if (id != spending) return@launch
            if (folding == Part.More) more = false else unfolded = unfolded - folding
        }
    }

    fun step(other: String) {
        saveDescription()
        id = other
        applying = null
        showOthers = false
        unfolded = emptySet()
        more = null
        draft = null
        sent = null
        kept = false
    }

    val save by rememberUpdatedState(::saveDescription)
    DisposableEffect(Unit) { onDispose { save() } }

    val index = queue.indexOf(id).takeIf { it >= 0 }
    val next = index?.let { queue.getOrNull(it + 1) }
    LilacSheetFrame(onDismiss) {
        TopBar(heading, index, queue.size, onDismiss, up = { index?.let { queue.getOrNull(it - 1) }?.let(::step) }, down = { next?.let(::step) })
        key(id) {
            Screen<SpendingScreen>("spending/$id", modifier = Modifier.weight(1f), refreshable = false) { s ->
                LaunchedEffect(s) {
                    heading = if (s.isIncome) "Доход" else "Трата"
                    applying = null
                    val typed = draft
                    if (!writing && typed != null && oneLine(typed) == s.description.orEmpty()) {
                        draft = null
                        sent = null
                    }
                }
                val marks = Marks(s, applying)
                Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
                    Box(Modifier.padding(horizontal = 20.dp)) { Header(s, marks) }
                    Description(
                        s,
                        text = draft ?: s.description.orEmpty(),
                        kept = kept && (draft ?: s.description).orEmpty().isNotEmpty(),
                        onType = { typed ->
                            draft = typed.replace("\n", " ")
                            kept = false
                            if (typed.contains("\n")) {
                                focus.clearFocus()
                            } else {
                                pause?.cancel()
                                pause = scope.launch {
                                    delay(900)
                                    saveDescription()
                                }
                            }
                        },
                        onFocus = { focused ->
                            writing = focused
                            if (!focused) saveDescription()
                        },
                        done = { focus.clearFocus() },
                    )
                    Column(Modifier.padding(horizontal = 20.dp)) {
                        fun isOpen(part: Part) = if (part == Part.More) more ?: (marks.payment == null && marks.category == null) else part in unfolded
                        fun toggle(part: Part) {
                            val open = isOpen(part)
                            if (part == Part.More) more = !open else unfolded = if (open) unfolded - part else unfolded + part
                        }
                        if (!s.isIncome) {
                            PlanLine(s, marks, isOpen(Part.Plan), showOthers, { showOthers = !showOthers }, { toggle(Part.Plan) }) { pick(it, Part.Plan) }
                        }
                        PlaceLine(s, marks, isOpen(Part.Place), { toggle(Part.Place) }) { pick(it, Part.Place) }
                        SettingsLine(
                            s, marks, isOpen(Part.More), { toggle(Part.More) }, { pick(it, Part.More) }, { choose(it) },
                            openShop?.let { open -> { shop: Shop -> onDismiss(); open(shop) } },
                        )
                    }
                }
            }
        }
        if (next != null) LilacPrimaryButton("Дальше", modifier = Modifier.padding(horizontal = 20.dp).padding(bottom = 12.dp)) { step(next) }
    }
    ErrorAlert(error)
}

/** The description as the server keeps it: in one line, without extra spaces. */
private fun oneLine(text: String) = text.trim().split(Regex("\\s+")).filter { it.isNotEmpty() }.joinToString(" ")

/** What is chosen on the sheet: the choice being made, else the server's. */
private class Marks(val s: SpendingScreen, val applying: String?) {
    /** The choice of a group that counts as made. */
    fun current(choices: List<Choice>, clearedBy: String): String? {
        if (applying != null) {
            if (choices.any { it.choice == applying }) return applying
            if (applying == clearedBy) return null
        }
        return choices.firstOrNull { it.isCurrent }?.choice
    }

    private val paying = applying?.takeIf { a -> listOf("regular-", "purchase-", "wish-", "save-").any { a.startsWith(it) } }

    /** The payment the expense made, among the likely ones or the others: its label, detail and icon. */
    val payment: Triple<String, String?, String>? = run {
        if (paying != null) {
            s.payments.choices.firstOrNull { it.choice == paying }?.let { return@run Triple(it.label, it.detail, it.icon ?: "repeat") }
            s.payments.others.flatMap { it.options }.firstOrNull { it.value == paying }?.let { return@run Triple(it.label, null, it.icon ?: "repeat") }
        }
        val key = current(s.payments.choices, "unlink") ?: return@run null
        s.payments.choices.firstOrNull { it.choice == key }?.let { Triple(it.label, it.detail, it.icon ?: "repeat") }
    }

    val pickedPayment = paying ?: current(s.payments.choices, "unlink")

    val category: Choice? = current(s.categories.choices, "uncategorize")?.let { key -> s.categories.choices.firstOrNull { it.choice == key } }

    /** Whether the expense could have been done without, as switched a moment ago or as the server says. */
    val optional = when (applying) {
        "optional" -> true
        "required" -> false
        else -> s.optional?.current ?: false
    }

    fun canUndo(undo: String) = applying == null && s.undo.any { it.choice == undo }
}

/** Back on the left, the title in the middle, and in a queue «1 из 4» with arrows to the expense before and after. */
@Composable
private fun TopBar(heading: String, index: Int?, count: Int, back: () -> Unit, up: () -> Unit, down: () -> Unit) {
    Box(Modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(top = 8.dp), contentAlignment = Alignment.Center) {
        LilacText(heading, Type.body, weight = FontWeight.SemiBold)
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Box(Modifier.size(44.dp).semantics { contentDescription = "Готово" }.tap(onClick = back), contentAlignment = Alignment.Center) {
                Icon(Icons.Outlined.ChevronLeft, contentDescription = null, tint = Lilac.ink, modifier = Modifier.size(28.dp))
            }
            Spacer(Modifier.weight(1f))
            if (index != null && count > 1) {
                LilacText("${index + 1} из $count", Type.subheadline, Lilac.muted, tabular = true, modifier = Modifier.padding(end = 4.dp))
                QueueArrow(Icons.Outlined.KeyboardArrowUp, "Предыдущая", index > 0, up)
                QueueArrow(Icons.Outlined.KeyboardArrowDown, "Следующая", index + 1 < count, down)
            }
        }
    }
}

@Composable
private fun QueueArrow(icon: ImageVector, label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier.size(34.dp, 44.dp).semantics { contentDescription = label }.tap(enabled, onClick).alpha(if (enabled) 1f else 0.3f),
        contentAlignment = Alignment.Center,
    ) { Icon(icon, contentDescription = null, tint = Lilac.accent) }
}

/**
 * The expense in a line: its shop's logo, or else what it went for, on a disc; its shop, or else its title, over the day
 * and where from; the exact amount at the end.
 */
@Composable
private fun Header(s: SpendingScreen, marks: Marks) {
    val payment = marks.payment
    val category = marks.category
    val (icon, color, photo) = when {
        payment != null -> Triple(payment.third, Palette.color("violet"), null)
        category != null -> Triple(category.icon ?: "tag", Palette.color(category.color ?: "gray"), category.photo)
        s.isIncome -> Triple("arrowDownLeft", Palette.color("green"), null)
        else -> Triple("tag", Palette.color("gray"), null)
    }
    Row(Modifier.fillMaxWidth().padding(top = 14.dp, bottom = 18.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        val logo = s.shop?.logo
        when {
            logo != null -> LilacMarkerView(LilacMarker.Logo(logo), Modifier.size(52.dp))
            photo != null -> CategoryDisc(icon, color, photo, 52.dp)
            else -> Box(Modifier.size(52.dp).background(color.copy(alpha = 0.14f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(WebIcons.icon(icon), contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            LilacText(s.shop?.let { it.title.ifEmpty { it.placeholder } } ?: s.title, 19.sp, weight = FontWeight.Medium, lines = 2)
            LilacText("${s.time.substringBefore(", ")} · ${s.account}", Type.callout, Lilac.muted, lines = 1)
        }
        LilacText(Money.exact(s.amount, s.symbol), 20.sp, weight = FontWeight.Bold, lines = 1, tabular = true)
    }
}

/**
 * What the user wrote about the expense, large on a lilac cloud; it is sent when typing pauses, on «Готово» and when the
 * field or the sheet is left, and says so once the server has it.
 */
@Composable
private fun Description(s: SpendingScreen, text: String, kept: Boolean, onType: (String) -> Unit, onFocus: (Boolean) -> Unit, done: () -> Unit) {
    val tint = Lilac.tint
    Box(Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Box(
            Modifier.matchParentSize()
                .then(if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Modifier.blur(10.dp) else Modifier)
                .background(Brush.linearGradient(listOf(tint.copy(alpha = 0.7f), tint, tint.copy(alpha = 0.8f))), LilacBlob),
        )
        Column(Modifier.fillMaxWidth().padding(horizontal = 40.dp, vertical = 40.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            LilacText(if (s.isIncome) "Что это за доход?" else "Что это за трата?", Type.subheadline, Lilac.muted)
            BasicTextField(
                text,
                onType,
                textStyle = TextStyle(fontSize = 28.sp, color = Lilac.ink),
                cursorBrush = SolidColor(Lilac.accent),
                maxLines = 4,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                keyboardActions = KeyboardActions(onDone = { done() }),
                modifier = Modifier.fillMaxWidth().onFocusChanged { onFocus(it.isFocused) }.semantics { contentDescription = "Описание" },
                decorationBox = { field ->
                    Box {
                        if (text.isEmpty()) LilacText(if (s.isIncome) "Например, долг" else "Например, обед", 28.sp, Lilac.muted.copy(alpha = 0.6f))
                        field()
                    }
                },
            )
            AnimatedVisibility(kept, enter = fadeIn(), exit = fadeOut()) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    Box(Modifier.size(26.dp).background(Lilac.accent.copy(alpha = 0.16f), CircleShape), contentAlignment = Alignment.Center) {
                        Icon(Icons.Outlined.Check, contentDescription = null, tint = Lilac.accent, modifier = Modifier.size(14.dp))
                    }
                    LilacText("Сохранено только что", Type.subheadline, Lilac.muted)
                }
            }
        }
    }
}

/** What unfolds under a line of the sheet, sliding down from it. */
@Composable
private fun Unfolded(open: Boolean, content: @Composable () -> Unit) {
    AnimatedVisibility(open, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
        Column(Modifier.padding(bottom = 18.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) { content() }
    }
}

/**
 * What of the plan the expense paid: the payment with its day or plan, whose step unfolds the others; or, linked to
 * nothing, the payment it looks like with a step that links it, or a step that unfolds the payments.
 */
@Composable
private fun PlanLine(s: SpendingScreen, marks: Marks, open: Boolean, showOthers: Boolean, switchOthers: () -> Unit, toggle: () -> Unit, pick: (String) -> Unit) {
    val payment = marks.payment
    val likely = if (payment == null) s.payments.choices.firstOrNull { it.isSuggested } else null
    LilacStepRow(
        icon = WebIcons.icon(payment?.third ?: "tag"),
        color = if (payment == null) null else Lilac.accent,
        title = payment?.first ?: "Не связано с планом",
        detail = payment?.second ?: likely?.let { listOfNotNull("Похоже на «${it.label}»", it.detail).joinToString(" · ") },
        step = when {
            payment != null -> "Изменить"
            likely != null -> "Связать"
            else -> "Связать с покупкой"
        },
        tag = "plan",
        toggle = toggle,
        act = { if (likely != null) pick(likely.choice) else toggle() },
    )
    Unfolded(open) {
        val picked = marks.pickedPayment
        s.payments.choices.forEachIndexed { index, choice ->
            PaymentCard(choice.label, choice.detail, WebIcons.icon(choice.icon ?: "repeat"), choice.choice == picked, choice.isSuggested, index = index) {
                if (choice.choice != picked) pick(choice.choice)
            }
        }
        if (s.payments.choices.isEmpty() && s.payments.others.isEmpty()) LilacEmpty(s.payments.empty)
        if (s.payments.others.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().height(44.dp).padding(horizontal = 4.dp).tap(onClick = switchOthers), verticalAlignment = Alignment.CenterVertically) {
                LilacText(s.payments.otherLabel, Type.subheadline, Lilac.accent, FontWeight.Medium)
                Spacer(Modifier.weight(1f))
                Icon(Icons.Outlined.ExpandMore, contentDescription = null, tint = Lilac.accent, modifier = Modifier.graphicsLayer { rotationZ = if (showOthers) 180f else 0f })
            }
            AnimatedVisibility(showOthers, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    s.payments.others.filter { it.options.isNotEmpty() }.forEach { group ->
                        LilacText(group.label, Type.subheadline, Lilac.muted, modifier = Modifier.padding(top = 6.dp))
                        group.options.forEach { option ->
                            PaymentCard(option.label, null, WebIcons.icon(option.icon ?: "repeat"), option.value == picked, false, compact = true) {
                                if (option.value != picked) pick(option.value)
                            }
                        }
                    }
                }
            }
        }
        if (marks.canUndo("unlink")) LilacInlineAction(s.undo.firstOrNull { it.choice == "unlink" }?.label ?: "Отвязать") { pick("unlink") }
    }
}

/** Where an expense or an income counts, as the line names it, with what its amount does there. */
private val placeWords = mapOf(
    "week" to ("Учитывается в неделе" to ""),
    "extra" to ("Из дополнительных" to "из доп. бюджета месяца"),
    "outside" to ("Не учитывается в неделе" to "не уменьшают свободное на неделю"),
    "ignored" to ("Не учитывается" to "нет ни в неделе, ни в суммах месяца"),
    "counted" to ("Учитывается в доходах" to "в полученном и накоплениях месяца"),
    "ignored-income" to ("Не учитывается" to "нет в полученном и накоплениях месяца"),
)

private fun envelopeIcon(choice: String): ImageVector = when (choice) {
    "week" -> Icons.Outlined.CalendarToday
    "extra" -> Icons.Outlined.ShoppingBag
    "outside" -> Icons.AutoMirrored.Outlined.Redo
    "ignored" -> Icons.Outlined.VisibilityOff
    "counted" -> Icons.Outlined.SouthWest
    else -> Icons.Outlined.RadioButtonUnchecked
}

/**
 * Where the expense counts and what that means for the week, with a step back into the week when it was moved out of it;
 * an income's step counts it or not. A tap on the line unfolds every place to pick another.
 */
@Composable
private fun PlaceLine(s: SpendingScreen, marks: Marks, open: Boolean, toggle: () -> Unit, pick: (String) -> Unit) {
    val picked = marks.current(s.envelopes, "") ?: s.envelopes.firstOrNull()?.choice ?: "week"
    val (title, detail) = placeWords[if (s.isIncome && picked == "ignored") "ignored-income" else picked]
        ?: ((s.envelopes.firstOrNull { it.choice == picked }?.label ?: "") to "")
    val back = when {
        s.isIncome -> if (picked == "counted") "Не учитывать" to "ignored" else "Учитывать" to "counted"
        picked != "week" && s.envelopes.any { it.choice == "week" } -> "Вернуть в неделю" to "week"
        else -> null
    }
    LilacStepRow(
        icon = envelopeIcon(picked),
        color = if (picked == "ignored") null else Lilac.accent,
        title = title,
        detail = detail.takeIf { it.isNotEmpty() }?.let { "${Money.text(s.amount, s.symbol)} $it" },
        step = back?.first ?: if (picked == "week") "Перенести" else "Изменить",
        tag = "place",
        toggle = toggle,
        act = { if (back != null) pick(back.second) else toggle() },
    )
    Unfolded(open) {
        s.envelopes.forEachIndexed { index, choice ->
            PaymentCard(choice.label, choice.detail, envelopeIcon(choice.choice), choice.choice == picked, false, compact = true, index = index) {
                if (choice.choice != picked) pick(choice.choice)
            }
        }
    }
}

/**
 * The category, by its icon on its colour, and whether the expense could have been done without, in a line that unfolds
 * the categories as tiles, the switch, the shop and what else the bank said; without a category, a grey tag and the one
 * it looks like with a step that takes it.
 */
@Composable
private fun SettingsLine(
    s: SpendingScreen,
    marks: Marks,
    open: Boolean,
    toggle: () -> Unit,
    pick: (String) -> Unit,
    choose: (String) -> Unit,
    openShop: ((Shop) -> Unit)?,
) {
    val category = marks.category
    val likely = if (category == null) s.categories.choices.firstOrNull { it.isSuggested } else null
    val named = category?.label ?: likely?.let { "Похоже на «${it.label}»" } ?: if (s.categories.choices.isEmpty()) null else "Без категории"
    val summary = listOfNotNull(named, if (marks.optional) s.optional?.label else null).joinToString(" · ")
    LilacStepRow(
        icon = WebIcons.icon(category?.icon ?: "tag"),
        color = category?.let { Palette.color(it.color ?: "gray") },
        photo = category?.photo,
        title = "Категория и другие настройки",
        detail = summary.ifEmpty { null },
        step = if (likely == null) null else "Принять",
        open = open,
        tag = "more",
        toggle = toggle,
        act = { likely?.let { pick(it.choice) } },
    )
    Unfolded(open) {
        Categories(s, marks.current(s.categories.choices, "uncategorize"), pick)
        if (marks.canUndo("uncategorize")) LilacInlineAction(s.undo.firstOrNull { it.choice == "uncategorize" }?.label ?: "Убрать категорию") { pick("uncategorize") }
        s.optional?.let { option ->
            val on = marks.optional
            Row(
                Modifier.fillMaxWidth().panel().padding(horizontal = 16.dp, vertical = 6.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(Icons.Outlined.RemoveShoppingCart, contentDescription = null, tint = if (on) Palette.optional else Lilac.muted, modifier = Modifier.size(18.dp))
                LilacText(option.label, Type.body, modifier = Modifier.weight(1f))
                LilacSwitch(on, Palette.optional) { choose(if (it) "optional" else "required") }
            }
        }
        s.shop?.let { found ->
            Row(
                Modifier.fillMaxWidth().card(enabled = openShop != null) { openShop?.invoke(found) }
                    .panel().defaultMinSize(minHeight = 50.dp).padding(horizontal = 16.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Icon(Icons.Outlined.Storefront, contentDescription = null, tint = Lilac.muted, modifier = Modifier.size(18.dp))
                LilacText("Магазин «${found.title.ifEmpty { found.placeholder }}»", Type.body, modifier = Modifier.weight(1f))
                if (openShop != null) Icon(Icons.Outlined.Edit, contentDescription = null, tint = Lilac.muted, modifier = Modifier.size(16.dp))
            }
        }
        (listOf(s.time) + s.notes).forEach { LilacText(it, Type.subheadline, Lilac.muted) }
    }
}

/** A white rounded card of the sheet, with its soft shadow, such as the switch of what could have been done without. */
@Composable
private fun Modifier.panel(): Modifier = this
    .shadow(4.dp, RoundedCornerShape(18.dp), ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f))
    .background(Lilac.surface, RoundedCornerShape(18.dp))

/**
 * The categories as tiles, three to a row, in the server's order, the most popular first: a suggestion goes once a
 * category is picked, and tiles that moved then would jump under the finger.
 */
@Composable
private fun Categories(s: SpendingScreen, picked: String?, pick: (String) -> Unit) {
    if (s.categories.choices.isEmpty()) {
        LilacEmpty(s.categories.empty)
        return
    }
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        s.categories.choices.chunked(3).forEachIndexed { row, choices ->
            Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                choices.forEachIndexed { column, choice ->
                    CategoryTile(choice, choice.choice == picked, row * 3 + column, Modifier.weight(1f).fillMaxHeight()) {
                        if (choice.choice != picked) pick(choice.choice)
                    }
                }
                repeat(3 - choices.size) { Spacer(Modifier.weight(1f)) }
            }
        }
    }
}

/** A category as a tile: its icon on a halo of its colour and its name; the picked one is lilac with a tick, the suggested one sparkles. */
@Composable
private fun CategoryTile(choice: Choice, selected: Boolean, index: Int, modifier: Modifier, onClick: () -> Unit) {
    val color = Palette.color(choice.color ?: "gray")
    val shape = RoundedCornerShape(20.dp)
    Box(
        modifier.unfold(index)
            .semantics { contentDescription = if (choice.isSuggested && !selected) "${choice.label}, похоже" else choice.label; this.selected = selected }
            .card(onClick = onClick)
            .then(if (selected) Modifier else Modifier.shadow(4.dp, shape, ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f)))
            .background(if (selected) Lilac.tint else Lilac.surface, shape)
            .then(if (selected) Modifier.border(1.5.dp, Lilac.accent, shape) else Modifier)
            .defaultMinSize(minHeight = 84.dp)
            .padding(horizontal = 6.dp, vertical = 12.dp),
    ) {
        Column(Modifier.fillMaxWidth().align(Alignment.Center), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(8.dp)) {
            CategoryDisc(choice.icon ?: "tag", color, choice.photo, 44.dp)
            LilacText(choice.label, Type.footnote, weight = FontWeight.Medium, lines = 2, textAlign = TextAlign.Center)
            choice.detail?.let { LilacText(it, Type.caption2, Lilac.muted, textAlign = TextAlign.Center) }
        }
        Corner(selected, choice.isSuggested)
    }
}

/** The tick of what is picked, or the sparkles of what is suggested, in a corner of a tile. */
@Composable
private fun BoxScope.Corner(selected: Boolean, suggested: Boolean) {
    AnimatedVisibility(selected, Modifier.align(Alignment.TopEnd), enter = scaleIn(initialScale = 0.4f) + fadeIn(), exit = scaleOut(targetScale = 0.4f) + fadeOut()) {
        Tick()
    }
    if (!selected && suggested) {
        Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = Palette.week, modifier = Modifier.align(Alignment.TopEnd).padding(2.dp).size(14.dp))
    }
}

/** A white tick on a violet disc. */
@Composable
private fun Tick() {
    Box(Modifier.size(22.dp).background(Color.White, CircleShape), contentAlignment = Alignment.Center) {
        Icon(Icons.Filled.CheckCircle, contentDescription = null, tint = Lilac.accent, modifier = Modifier.size(24.dp))
    }
}

/**
 * A payment the expense could have made: a regular expense or a purchase, with its date or plan and what is left; or a
 * place it can count in, as compact.
 */
@Composable
private fun PaymentCard(
    label: String,
    detail: String?,
    icon: ImageVector,
    selected: Boolean,
    suggested: Boolean,
    compact: Boolean = false,
    index: Int = 0,
    onClick: () -> Unit,
) {
    val shape = RoundedCornerShape(20.dp)
    val tone = if (selected) Lilac.accent else Lilac.muted
    Row(
        Modifier.fillMaxWidth().unfold(index)
            .semantics { this.selected = selected; contentDescription = label }
            .card(onClick = onClick)
            .then(if (selected) Modifier else Modifier.shadow(4.dp, shape, ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f)))
            .background(if (selected) Lilac.tint else Lilac.surface, shape)
            .then(if (selected) Modifier.border(1.5.dp, Lilac.accent, shape) else Modifier)
            .padding(horizontal = 14.dp, vertical = if (compact) 10.dp else 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.size(if (compact) 32.dp else 40.dp).background(tone.copy(alpha = 0.15f), CircleShape), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = tone, modifier = Modifier.size(if (compact) 15.dp else 18.dp))
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            LilacText(label, if (compact) Type.subheadline else Type.body, weight = if (compact) FontWeight.Normal else FontWeight.Medium, lines = 2)
            if (detail != null) LilacText(detail, Type.footnote, Lilac.muted)
        }
        when {
            selected -> Tick()
            suggested -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(Icons.Outlined.AutoAwesome, contentDescription = null, tint = Palette.week, modifier = Modifier.size(14.dp))
                LilacText("похоже", Type.caption, Palette.week, FontWeight.SemiBold)
            }
        }
    }
}

/** Comes in a moment after the one before it, so tiles unfold from the top when they open. */
@Composable
private fun Modifier.unfold(index: Int): Modifier {
    val shown = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(minOf(index, 15) * 18L)
        shown.animateTo(1f, tween(300))
    }
    return graphicsLayer {
        alpha = shown.value
        val scale = 0.88f + 0.12f * shown.value
        scaleX = scale
        scaleY = scale
        translationY = -6.dp.toPx() * (1 - shown.value)
    }
}
