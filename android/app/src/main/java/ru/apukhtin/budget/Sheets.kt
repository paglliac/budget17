package ru.apukhtin.budget

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.outlined.UnfoldMore
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.selected
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

// The sheets the screens open, as ios/Budget/Sheets.swift has them; the sheets of the later screens come with them.

/**
 * A form of the new style as a sheet: a cross that closes it, its name and a destructive action on top, the fields on
 * the page's light, and its main button at the bottom.
 */
@Composable
fun LilacSheet(
    onDismiss: () -> Unit,
    title: String? = null,
    primary: String? = null,
    busy: Boolean = false,
    save: () -> Unit = {},
    destructive: Pair<String, () -> Unit>? = null,
    content: @Composable ColumnScope.() -> Unit,
) {
    LilacSheetFrame(onDismiss) {
        Box(Modifier.fillMaxWidth().padding(horizontal = 12.dp).padding(top = 10.dp), contentAlignment = Alignment.Center) {
            if (title != null) LilacText(title, Type.body, weight = FontWeight.SemiBold, lines = 1, modifier = Modifier.padding(horizontal = 90.dp))
            Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Box(
                    Modifier.size(40.dp).semantics { contentDescription = if (primary == null) "Готово" else "Отмена" }.tap(onClick = onDismiss),
                    contentAlignment = Alignment.Center,
                ) { Icon(Icons.Outlined.Close, contentDescription = null, tint = Lilac.ink) }
                Spacer(Modifier.weight(1f))
                if (destructive != null) LilacText(destructive.first, Type.body, Lilac.red, modifier = Modifier.tap(onClick = destructive.second))
            }
        }
        Column(
            Modifier.weight(1f, fill = false).verticalScroll(rememberScrollState()).fillMaxWidth()
                .padding(horizontal = 24.dp).padding(top = 8.dp, bottom = 24.dp),
            content = content,
        )
        if (primary != null) {
            LilacPrimaryButton(primary, busy, Modifier.padding(horizontal = 20.dp).padding(bottom = 12.dp), save)
        }
    }
}

/** A sheet of the page's light over the dimmed page, as tall as what is in it; a tall one stops under the status bar. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LilacSheetFrame(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        // A strip of the dimmed page stays above a tall sheet, as over an iOS sheet.
        modifier = Modifier.statusBarsPadding().padding(top = 10.dp),
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Lilac.canvas,
        dragHandle = null,
    ) {
        // A sheet is a window of its own, so its tags need saying again for android/screens.sh.
        Column(Modifier.semantics { testTagsAsResourceId = true }.lilacBackground().navigationBarsPadding().imePadding(), content = content)
    }
}

/** Posts a form, keeps the mistakes by field the server names, and what else went wrong for an alert. */
class FormSender(private val scope: CoroutineScope, private val session: Session) {
    val errors = mutableStateMapOf<String, String>()
    val error = mutableStateOf<String?>(null)
    var busy by mutableStateOf(false)
        private set

    fun send(path: String, form: Map<String, String> = emptyMap(), done: () -> Unit) {
        busy = true
        scope.launch {
            try {
                session.send(path, form)
                errors.clear()
                done()
            } catch (invalid: ApiError.Invalid) {
                errors.clear()
                errors.putAll(invalid.errors)
            } catch (failure: Exception) {
                error.value = failure.message
            } finally {
                busy = false
            }
        }
    }
}

@Composable
fun rememberFormSender(): FormSender {
    val scope = rememberCoroutineScope()
    val session = LocalSession.current
    return remember { FormSender(scope, session) }
}

/** What a week allows, to change: its first day, its title and its amount with the usual one. */
data class WeekLimitDraft(val week: String, val title: String, val limit: WeekLimit, val symbol: String)

/** Another amount for a week, such as less when something happened, or the usual one back. */
@Composable
fun WeekLimitSheet(draft: WeekLimitDraft, onDismiss: () -> Unit) {
    val sender = rememberFormSender()
    var amount by remember { mutableStateOf(Money.typing(Money.input(draft.limit.amount))) }
    LilacSheet(onDismiss, "Бюджет недели", "Сохранить", sender.busy, save = {
        sender.send("week-limits/${draft.week}", mapOf("amount" to amount), onDismiss)
    }) {
        LilacText(draft.title, Type.subheadline, Lilac.muted, modifier = Modifier.padding(top = 12.dp))
        BigAmountField(amount, { amount = Money.typing(it) }, Money.input(draft.limit.usual), draft.symbol, Modifier.padding(top = 4.dp))
        sender.errors["amount"]?.let { LilacText(it, Type.footnote, Lilac.red) }
        if (draft.limit.changed) {
            LilacInlineAction("Вернуть ${Money.text(draft.limit.usual, draft.symbol)}", Modifier.padding(top = 16.dp)) {
                sender.send("week-limits/${draft.week}/delete", done = onDismiss)
            }
        }
    }
    ErrorAlert(sender.error)
}

/** A form's amount, large in the heavy face, its thousands apart as it is typed. */
@Composable
fun BigAmountField(value: String, onChange: (String) -> Unit, placeholder: String, symbol: String, modifier: Modifier = Modifier) {
    val style = TextStyle(fontSize = 44.sp, fontWeight = FontWeight.Bold, color = Lilac.ink, fontFeatureSettings = Type.TABULAR)
    // The field hugs the amount, as iOS's fixedSize does, so ₽ stands right after it.
    val measurer = rememberTextMeasurer()
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        val typed = typedValue(value)
        BasicTextField(
            typed.value,
            {
                typed.value = it
                onChange(it.text)
            },
            singleLine = true,
            textStyle = style,
            cursorBrush = SolidColor(Lilac.accent),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
            modifier = Modifier.width(with(LocalDensity.current) { measurer.measure(value.ifEmpty { placeholder }, style).size.width.toDp() } + 4.dp),
            decorationBox = { field ->
                Box {
                    if (value.isEmpty()) LilacText(placeholder, 44.sp, Lilac.muted.copy(alpha = 0.5f), FontWeight.Bold, lines = 1)
                    field()
                }
            },
        )
        LilacText(symbol, 44.sp, weight = FontWeight.Bold)
    }
}

/** A small action inside a row or a form, such as «Принять» or «Вернуть 45 000 ₽». */
@Composable
fun LilacInlineAction(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    LilacText(
        label, Type.footnote, Lilac.accent, FontWeight.SemiBold, lines = 1, textAlign = TextAlign.Center,
        modifier = modifier.card(onClick = onClick).background(Lilac.tint, CircleShape).padding(horizontal = 12.dp, vertical = 6.dp),
    )
}

/** Where the server is and its token, both checked against the server before they are kept; signs in or switches. */
@Composable
fun ServerForm(action: String, address: String = "", token: String = "", done: () -> Unit = {}) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    var typedAddress by remember { mutableStateOf(address) }
    var typedToken by remember { mutableStateOf(token) }
    var checking by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    LilacTextField("Сервер", typedAddress, { typedAddress = it }, "budget.example.ru", keyboard = Keyboard.Url)
    LilacTextField("Токен доступа", typedToken, { typedToken = it }, "Токен", keyboard = Keyboard.Secret)
    LilacText(
        "Адрес сервера бюджета и токен из ACCESS_TOKEN в его .env. Для сервера на Mac в домашней сети — http://имя-мака.local:4317, токен не нужен.",
        Type.footnote, Lilac.muted, modifier = Modifier.padding(top = 10.dp),
    )
    (error ?: session.notice)?.let { LilacText(it, Type.subheadline, Lilac.red, modifier = Modifier.padding(top = 12.dp)) }
    LilacPrimaryButton(if (checking) "Проверяю…" else action, checking || typedAddress.isBlank(), Modifier.padding(top = 24.dp)) {
        checking = true
        scope.launch {
            try {
                session.signIn(typedAddress, typedToken)
                done()
            } catch (failure: Exception) {
                error = failure.message
            } finally {
                checking = false
            }
        }
    }
}

/** The server alone, as the offline pill and a failed screen open it. */
@Composable
fun ServerSheet(onDismiss: () -> Unit) {
    LilacSheet(onDismiss, "Сервер") {
        Spacer(Modifier.size(16.dp))
        ServerPanel(onDismiss)
    }
}

/**
 * The working server or the test one in one tap, where the server is, when it last synced, another server instead of it,
 * and the way out.
 */
@Composable
fun ServerPanel(switched: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    // The server just picked, shown at once while it is checked.
    var picked by remember { mutableStateOf<ServerSlot?>(null) }
    val error = remember { mutableStateOf<String?>(null) }
    var confirmSignOut by remember { mutableStateOf(false) }
    // What the form of another server starts with: the server the app has, or the working one before it is known.
    var form by remember { mutableStateOf<Pair<String, String>?>(null) }

    Column {
        LilacSegmented(
            listOf(ServerSlot.Main to "Рабочий", ServerSlot.Test to "Тестовый"),
            picked ?: session.slot ?: ServerSlot.Main,
            Modifier.fillMaxWidth().padding(bottom = 12.dp),
            enabled = picked == null,
        ) { slot ->
            // A working server never signed in to is typed in the form; one that does not answer leaves the app where it was.
            val kept = session.remembered(slot)
            if (kept == null) {
                form = ServerSlot.INTERNET to ""
            } else if (slot != session.slot) {
                picked = slot
                scope.launch {
                    try {
                        session.switchTo(slot)
                    } catch (failure: Exception) {
                        error.value = "${kept.first} не отвечает: ${failure.message}"
                    }
                    picked = null
                }
            }
        }
        LilacPanel {
            LilacPanelLine("Адрес", first = true) {
                LilacText(if (picked != null) "Проверяю…" else session.address, Type.body, Lilac.muted, lines = 1)
            }
            session.syncedAt?.let { LilacPanelLine("Обновлено") { LilacText(Dates.moment(it), Type.body, Lilac.muted, tabular = true) } }
            LilacPanelLine("Обновить из ZenMoney", titleColor = Lilac.accent, modifier = Modifier.tap(enabled = !session.isSyncing) { scope.launch { session.sync() } }) {
                if (session.isSyncing) LilacText("…", Type.body, Lilac.muted)
            }
            LilacPanelLine("Сменить сервер", titleColor = Lilac.accent, modifier = Modifier.tap { form = session.address to session.token })
        }
        LilacPanel(Modifier.padding(top = 12.dp)) {
            LilacPanelLine("Выйти", first = true, titleColor = Lilac.red, modifier = Modifier.tap { confirmSignOut = true })
        }
    }
    form?.let { (address, token) ->
        LilacSheet({ form = null }, "Другой сервер") {
            ServerForm("Подключить", address, token) {
                form = null
                switched()
            }
        }
    }
    if (confirmSignOut) {
        ConfirmDialog(
            "Выйти из приложения?",
            "Данные останутся на сервере, а сохранённые на телефоне удалятся. Чтобы войти снова, понадобится токен доступа.",
            "Выйти",
            onDismiss = { confirmSignOut = false },
        ) { session.signOut() }
    }
    ErrorAlert(error)
}

/**
 * Behind the gear of «Ещё»: the day a week begins on, round figures and where the extras' widget tells plenty and tight,
 * then whose phone this is, kept on the phone, and the server. They show what the server sent last at once.
 */
@Composable
fun SettingsSheet(onDismiss: () -> Unit) {
    val session = LocalSession.current
    var budget by remember { mutableStateOf(session.saved<BudgetSettingsScreen>("budget-settings")?.first) }
    var who by remember { mutableStateOf(session.who) }
    val error = remember { mutableStateOf<String?>(null) }
    LaunchedEffect(session.version) {
        runCatching { session.get<BudgetSettingsScreen>("budget-settings") }.getOrNull()?.let { budget = it }
    }
    LilacSheet(onDismiss, "Настройки") {
        budget?.let { BudgetSection(it, error) }
        LilacTextField("Чей телефон", who, {
            who = it
            session.name(it)
        }, "Имя")
        LilacFieldLabel("Сервер")
        ServerPanel(onDismiss)
    }
    ErrorAlert(error)
}

/**
 * The day a week begins on, picked in one tap and saved at once, the usual amount of a week, and round figures on the
 * main page, switched the same way; then where the extras' widget tells plenty and tight, changed in a form.
 */
@Composable
private fun BudgetSection(screen: BudgetSettingsScreen, error: androidx.compose.runtime.MutableState<String?>) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    // The day just picked and round figures just switched, shown at once while the server saves them.
    var picked by remember(screen.weekStart) { mutableStateOf<Int?>(null) }
    var round by remember(screen.roundFigures) { mutableStateOf<Boolean?>(null) }
    var levels by remember { mutableStateOf<BudgetSettingsScreen.ExtrasLevels?>(null) }

    fun send(path: String, undo: () -> Unit) {
        scope.launch {
            try {
                session.send(path)
            } catch (failure: Exception) {
                undo()
                error.value = failure.message
            }
        }
    }

    LilacFieldLabel("Неделя начинается")
    LilacSegmented(screen.weekdays.map { it.value to Dates.weekdaysShort[it.value] }, picked ?: screen.weekStart, Modifier.fillMaxWidth()) { day ->
        picked = day
        send("budget/week-start/$day") { picked = null }
    }
    LilacPanel(Modifier.padding(top = 12.dp)) {
        LilacPanelLine("На неделю", first = true) { LilacText(Money.text(screen.limit, screen.symbol), Type.body, Lilac.muted, tabular = true) }
        screen.roundFigures?.let { saved ->
            LilacPanelLine("Круглые цифры") {
                LilacSwitch(round ?: saved) { on ->
                    round = on
                    send("budget/round-figures/${if (on) "on" else "off"}") { round = null }
                }
            }
        }
    }
    screen.extrasLevels?.let { saved ->
        LilacFieldLabel("Прогноз доп. бюджета")
        LilacPanel(Modifier.card { levels = saved }) {
            LilacPanelLine("Есть запас", first = true) { LilacText("от ${Money.text(saved.plenty, screen.symbol)}", Type.body, Lilac.muted, tabular = true) }
            LilacPanelLine("Впритык") { LilacText("меньше ${Money.text(saved.tight, screen.symbol)}", Type.body, Lilac.muted, tabular = true) }
        }
    }
    levels?.let { ExtrasLevelsSheet(it, screen.symbol) { levels = null } }
}

/** What left of the extras at the month's end makes «Есть запас», and what below makes «Впритык». */
@Composable
private fun ExtrasLevelsSheet(levels: BudgetSettingsScreen.ExtrasLevels, symbol: String, onDismiss: () -> Unit) {
    val sender = rememberFormSender()
    var plenty by remember { mutableStateOf(Money.typing(Money.input(levels.plenty))) }
    var tight by remember { mutableStateOf(Money.typing(Money.input(levels.tight))) }
    LilacSheet(onDismiss, "Прогноз доп. бюджета", "Сохранить", sender.busy, save = {
        sender.send("budget/extras-levels", mapOf("plenty" to plenty, "tight" to tight), onDismiss)
    }) {
        LilacTextField("«Есть запас» от, $symbol", plenty, { plenty = Money.typing(it) }, error = sender.errors["plenty"], keyboard = Keyboard.Decimal)
        LilacTextField("«Впритык» меньше, $symbol", tight, { tight = Money.typing(it) }, error = sender.errors["tight"], keyboard = Keyboard.Decimal)
    }
    ErrorAlert(sender.error)
}

/** A purchase to add, into a week and the week's money or the extras, or one to change. */
data class PurchaseDraft(
    val purchase: Purchase?,
    val week: String,
    val envelope: String,
    val choices: List<OptionGroup>,
    val actions: List<PurchaseAction>,
    val symbol: String = "₽",
)

/**
 * A purchase: its name and amount large, whether it is required or flexible, its week and, for a new one, whether it
 * comes from the week's money or the extras; one to change also moves, finishes or goes.
 */
@Composable
fun PurchaseSheet(draft: PurchaseDraft, onDismiss: () -> Unit) {
    val sender = rememberFormSender()
    val purchase = draft.purchase
    var title by remember { mutableStateOf(purchase?.title.orEmpty()) }
    var amount by remember { mutableStateOf(purchase?.let { Money.typing(Money.input(it.amount)) }.orEmpty()) }
    var week by remember { mutableStateOf(draft.week) }
    var envelope by remember { mutableStateOf(draft.envelope) }
    var kind by remember { mutableStateOf(purchase?.kind ?: "flexible") }
    var confirmDelete by remember { mutableStateOf(false) }
    val fields = { mapOf("title" to title, "amount" to amount, "week" to week, "kind" to kind) }
    // The weeks to pick from, with the purchase's own week even when it is out of their range.
    val groups = if (purchase != null && draft.choices.flatMap { it.options }.none { it.value == purchase.week }) {
        listOf(OptionGroup("Сейчас", listOf(Option(purchase.week, purchase.weekLabel)))) + draft.choices
    } else draft.choices
    LilacSheet(
        onDismiss,
        primary = if (purchase == null) "В план" else "Сохранить",
        busy = sender.busy,
        save = {
            if (purchase != null) sender.send("purchases/${purchase.id}", fields(), onDismiss)
            else sender.send("purchases", fields() + ("envelope" to envelope), onDismiss)
        },
        destructive = purchase?.let { "Удалить" to { confirmDelete = true } },
    ) {
        LilacBigFields(title, { title = it }, amount, { amount = Money.typing(it) }, if (draft.envelope == "extra") "Например, куртка" else "Например, ботинки", draft.symbol, sender.errors)
        LilacFieldLabel("Тип траты")
        LilacChoiceTiles(
            listOf(ChoiceTile("required", "Обязательная", "Лучше не трогать"), ChoiceTile("flexible", "Гибкая", "Можно перенести")),
            kind,
        ) { kind = it }
        LilacFieldLabel("Неделя")
        OptionPicker(groups, week) { week = it }
        if (purchase == null) {
            LilacFieldLabel("Откуда")
            LilacSegmented(listOf("week" to "Из недели", "extra" to "Из дополнительных"), envelope, Modifier.fillMaxWidth()) { envelope = it }
        } else {
            Row(Modifier.padding(top = 20.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                draft.actions.forEach { action ->
                    LilacInlineAction(action.label) {
                        // Moving saves the fields too, as on the web form; finishing needs none.
                        sender.send("purchases/${purchase.id}/${action.action}", if (action.action == "move") fields() else emptyMap(), onDismiss)
                    }
                }
            }
        }
    }
    if (confirmDelete && purchase != null) {
        ConfirmDialog("Удалить покупку?", "", "Удалить", onDismiss = { confirmDelete = false }) {
            sender.send("purchases/${purchase.id}/delete", done = onDismiss)
        }
    }
    ErrorAlert(sender.error)
}

/**
 * The name of a purchase or a wish, large and light, and its amount larger and heavy, as the reference's form draws
 * them; the amount keeps its thousands apart as it is typed.
 */
@Composable
fun LilacBigFields(title: String, onTitle: (String) -> Unit, amount: String, onAmount: (String) -> Unit, placeholder: String, symbol: String, errors: Map<String, String>) {
    BasicTextField(
        title,
        onTitle,
        textStyle = TextStyle(fontSize = 32.sp, color = Lilac.ink),
        cursorBrush = SolidColor(Lilac.accent),
        maxLines = 3,
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp).testTag("form-title"),
        decorationBox = { field ->
            Box {
                if (title.isEmpty()) LilacText(placeholder, 32.sp, Lilac.muted.copy(alpha = 0.6f))
                field()
            }
        },
    )
    errors["title"]?.let { LilacText(it, Type.footnote, Lilac.red) }
    BigAmountField(amount, onAmount, "0", symbol, Modifier.padding(top = 6.dp).testTag("form-amount"))
    errors["amount"]?.let { LilacText(it, Type.footnote, Lilac.red) }
}

/** A choice of [LilacChoiceTiles]: its value, its name and what it means. */
data class ChoiceTile(val value: String, val title: String, val hint: String)

/** A choice between two or more options as tiles, each with its name and what it means, the picked one lilac. */
@Composable
fun LilacChoiceTiles(choices: List<ChoiceTile>, selection: String, onSelect: (String) -> Unit) {
    val haptics = LocalHapticFeedback.current
    Row(Modifier.fillMaxWidth().height(IntrinsicSize.Min), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        choices.forEach { choice ->
            val picked = choice.value == selection
            val shape = RoundedCornerShape(18.dp)
            Column(
                Modifier.weight(1f).fillMaxHeight()
                    .semantics { selected = picked }
                    .card {
                        if (!picked) haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                        onSelect(choice.value)
                    }
                    .then(if (picked) Modifier else Modifier.shadow(4.dp, shape, ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f)))
                    .background(if (picked) Lilac.tint else Lilac.surface, shape)
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(3.dp),
            ) {
                LilacText(choice.title, Type.body, if (picked) Lilac.accent else Lilac.ink, FontWeight.SemiBold)
                LilacText(choice.hint, Type.subheadline, if (picked) Lilac.accent.copy(alpha = 0.8f) else Lilac.muted)
            }
        }
    }
}

/** A value picked from a menu of grouped options, as a white field showing the picked one, such as the week of a purchase. */
@Composable
fun OptionPicker(groups: List<OptionGroup>, value: String, onPick: (String) -> Unit) {
    var open by remember { mutableStateOf(false) }
    val label = groups.flatMap { it.options }.firstOrNull { it.value == value }?.label ?: value
    Box {
        Row(
            Modifier.fillMaxWidth().card { open = true }
                .shadow(4.dp, RoundedCornerShape(16.dp), ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f))
                .background(Lilac.surface, RoundedCornerShape(16.dp))
                .defaultMinSize(minHeight = 52.dp).padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            LilacText(label, Type.body, modifier = Modifier.weight(1f))
            Icon(Icons.Outlined.UnfoldMore, contentDescription = null, tint = Lilac.muted, modifier = Modifier.size(18.dp))
        }
        DropdownMenu(open, { open = false }, containerColor = Lilac.surface, modifier = Modifier.heightIn(max = 420.dp)) {
            groups.forEach { group ->
                LilacText(group.label, Type.footnote, Lilac.muted, modifier = Modifier.padding(horizontal = 16.dp, vertical = 6.dp))
                group.options.forEach { option ->
                    DropdownMenuItem(
                        text = { LilacText(option.label, Type.body, if (option.value == value) Lilac.accent else Lilac.ink) },
                        onClick = {
                            open = false
                            onPick(option.value)
                        },
                    )
                }
            }
        }
    }
}

/** A regular expense opened from a week's plan, found among all of them. */
@Composable
fun RegularLoader(id: Int, onDismiss: () -> Unit) {
    val session = LocalSession.current
    var screen by remember { mutableStateOf(session.saved<RegularScreen>("regular")?.first) }
    LaunchedEffect(Unit) { runCatching { session.get<RegularScreen>("regular") }.getOrNull()?.let { screen = it } }
    val s = screen ?: return
    val item = (s.behind + s.ahead + s.later).firstOrNull { it.expense.id == id }
    if (item == null) {
        LilacSheet(onDismiss) { LilacEmpty("Регулярной траты больше нет") }
    } else {
        RegularSheet(item, s.icons, s.symbol, onDismiss)
    }
}

/** A regular expense to add or change: name and amount large, the day, the dates it starts and ends on, and its icon. */
@Composable
fun RegularSheet(item: RegularItem?, icons: List<IconChoice>, symbol: String, onDismiss: () -> Unit) {
    val sender = rememberFormSender()
    val values = item?.values.orEmpty()
    var title by remember { mutableStateOf(values["title"].orEmpty()) }
    var amount by remember { mutableStateOf(Money.typing(values["amount"].orEmpty())) }
    var day by remember { mutableStateOf(values["day"].orEmpty()) }
    var start by remember { mutableStateOf(values["start"]?.takeIf { Dates.date(it) != null }) }
    var end by remember { mutableStateOf(values["end"]?.takeIf { Dates.date(it) != null }) }
    var icon by remember { mutableStateOf(values["icon"].orEmpty()) }
    var confirmDelete by remember { mutableStateOf(false) }
    LilacSheet(
        onDismiss,
        title = if (item == null) "Новая регулярная трата" else null,
        primary = if (item == null) "Добавить" else "Сохранить",
        busy = sender.busy,
        save = {
            val form = mapOf("title" to title, "amount" to amount, "day" to day, "icon" to icon, "start" to start.orEmpty(), "end" to end.orEmpty())
            sender.send(item?.let { "regular/${it.expense.id}" } ?: "regular", form, onDismiss)
        },
        destructive = item?.let { "Удалить" to { confirmDelete = true } },
    ) {
        LilacBigFields(title, { title = it }, amount, { amount = Money.typing(it) }, "Например, аренда", symbol, sender.errors)
        LilacTextField("Число месяца", day, { day = it.filter(Char::isDigit) }, "5", sender.errors["day"], Keyboard.Number)
        LilacText("Если числа нет в месяце, например 31-го, платёж приходится на последний день.", Type.footnote, Lilac.muted, modifier = Modifier.padding(top = 6.dp))
        LilacPanel(Modifier.padding(top = 18.dp)) {
            DateLine("Дата начала", "С", start, first = true) { start = it }
            DateLine("Дата окончания", "По", end) { end = it }
        }
        (sender.errors["start"] ?: sender.errors["end"])?.let { LilacText(it, Type.footnote, Lilac.red) }
        LilacFieldLabel("Иконка")
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            IconTile(null, "По названию", icon.isEmpty()) { icon = "" }
            icons.forEach { choice -> IconTile(WebIcons.icon(choice.icon), choice.label, icon == choice.icon) { icon = choice.icon } }
        }
    }
    if (confirmDelete && item != null) {
        ConfirmDialog("Удалить регулярную трату?", "Траты, привязанные к ней, останутся без привязки.", "Удалить", onDismiss = { confirmDelete = false }) {
            sender.send("regular/${item.expense.id}/delete", done = onDismiss)
        }
    }
    ErrorAlert(sender.error)
}

/** A date a regular expense starts or ends on, switched on and picked under its switch. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateLine(title: String, prefix: String, date: String?, first: Boolean = false, onChange: (String?) -> Unit) {
    var picking by remember { mutableStateOf(false) }
    LilacPanelLine(title, first) { LilacSwitch(date != null) { on -> onChange(if (on) java.time.LocalDate.now().toString() else null) } }
    if (date != null) {
        LilacPanelLine(prefix, modifier = Modifier.tap { picking = true }) {
            LilacText(Dates.date(date)?.format(java.time.format.DateTimeFormatter.ofPattern("d MMMM yyyy", java.util.Locale.forLanguageTag("ru"))) ?: date, Type.body, Lilac.accent)
        }
    }
    if (picking && date != null) {
        val state = rememberDatePickerState(initialSelectedDateMillis = Dates.date(date)?.atStartOfDay(java.time.ZoneOffset.UTC)?.toInstant()?.toEpochMilli())
        DatePickerDialog(
            onDismissRequest = { picking = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { onChange(java.time.Instant.ofEpochMilli(it).atZone(java.time.ZoneOffset.UTC).toLocalDate().toString()) }
                    picking = false
                }) { LilacText("Готово", Type.body, Lilac.accent, FontWeight.SemiBold) }
            },
            dismissButton = { TextButton(onClick = { picking = false }) { LilacText("Отмена", Type.body, Lilac.accent) } },
        ) { DatePicker(state, showModeToggle = false) }
    }
}

/** An icon to pick for a regular expense; null is the one its name gives. */
@Composable
private fun IconTile(icon: ImageVector?, label: String, picked: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        Modifier.size(50.dp).semantics { contentDescription = label; selected = picked }.card(onClick = onClick)
            .background(if (picked) Lilac.tint else Lilac.surface, shape)
            .then(if (picked) Modifier.border(1.5.dp, Lilac.accent, shape) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        if (icon != null) Icon(icon, contentDescription = null, tint = if (picked) Lilac.accent else Lilac.ink, modifier = Modifier.size(22.dp))
        else LilacText("Aa", Type.body, if (picked) Lilac.accent else Lilac.ink, FontWeight.SemiBold)
    }
}

/**
 * What a field holds as the user types it: the selection stays where the user put it, unless the text came back
 * reworded, such as an amount with its thousands apart, and then the cursor goes to the end.
 */
@Composable
fun typedValue(text: String): androidx.compose.runtime.MutableState<androidx.compose.ui.text.input.TextFieldValue> {
    val state = remember { mutableStateOf(androidx.compose.ui.text.input.TextFieldValue(text, androidx.compose.ui.text.TextRange(text.length))) }
    if (state.value.text != text) state.value = androidx.compose.ui.text.input.TextFieldValue(text, androidx.compose.ui.text.TextRange(text.length))
    return state
}

/**
 * A wish, or the debt of a credit card: its name and amount large, and which of the two it is; one to change can go, and
 * `deleted` then closes what it was opened from.
 */
@Composable
fun WishSheet(wish: Wish?, onDismiss: () -> Unit, deleted: () -> Unit = {}) {
    val sender = rememberFormSender()
    var title by remember { mutableStateOf(wish?.title.orEmpty()) }
    var amount by remember { mutableStateOf(wish?.let { Money.typing(Money.input(it.amount)) }.orEmpty()) }
    var kind by remember { mutableStateOf(wish?.kind ?: "wish") }
    var rate by remember { mutableStateOf(wish?.rate?.let { if (it == Math.rint(it)) it.toLong().toString() else it.toString().replace('.', ',') }.orEmpty()) }
    LilacSheet(
        onDismiss,
        primary = if (wish != null) "Сохранить" else if (kind == "card") "Добавить" else "Хочу",
        busy = sender.busy,
        save = {
            sender.send(wish?.let { "wishes/${it.id}" } ?: "wishes", mapOf("title" to title, "amount" to amount, "kind" to kind, "rate" to if (kind == "card") rate else ""), onDismiss)
        },
        destructive = wish?.let { "Удалить" to { sender.send("wishes/${it.id}/delete") { onDismiss(); deleted() } } },
    ) {
        LilacBigFields(title, { title = it }, amount, { amount = Money.typing(it) }, if (kind == "card") "Например, Альфа" else "Например, укладка для волос", "₽", sender.errors)
        LilacFieldLabel("Что это")
        LilacChoiceTiles(listOf(ChoiceTile("wish", "Желание", "Купить к сроку"), ChoiceTile("card", "Кредитка", "Погасить без процентов")), kind) { kind = it }
        if (kind == "card") LilacTextField("Ставка после срока без процентов, %", rate, { rate = it }, "34,9", sender.errors["rate"], Keyboard.Decimal)
    }
    ErrorAlert(sender.error)
}
