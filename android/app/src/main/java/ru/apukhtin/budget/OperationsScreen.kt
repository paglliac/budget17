package ru.apukhtin.budget

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.SwapVert
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import kotlin.math.abs
import kotlinx.coroutines.launch

/** What the operations show: all of them, the expenses that wait for a category, or one kind. */
sealed interface OperationsFilter {
    data object All : OperationsFilter

    data object Pending : OperationsFilter

    /** expense, income, transfer or optional. */
    data class Kind(val name: String) : OperationsFilter

    val kind get() = (this as? Kind)?.name
}

/**
 * Operations of a month by day, or by category, filtered by kind, category and text, as on the web page
 * (ios/Budget/OperationsView.swift); an expense or an income opens to be marked. «Ждут разбора» shows the expenses that
 * came without a category instead, with suggestions to accept, and what was sorted.
 */
@Composable
fun OperationsView(filter: OperationsFilter, onFilter: (OperationsFilter) -> Unit) {
    var month by rememberSaveable { mutableStateOf<String?>(null) }
    var category by rememberSaveable { mutableStateOf<String?>(null) }
    var query by rememberSaveable { mutableStateOf<String?>(null) }
    // null goes by day.
    var group by rememberSaveable { mutableStateOf<String?>(null) }
    var searching by remember { mutableStateOf(false) }
    var search by remember { mutableStateOf("") }
    var showCategories by remember { mutableStateOf(false) }
    var sheet by remember { mutableStateOf<BudgetSheet?>(null) }
    val focus = remember { FocusRequester() }

    Screen<OperationsScreen>("operations", mapOf("month" to month, "kind" to filter.kind, "category" to category, "q" to query, "group" to group)) { s ->
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(start = 20.dp, end = 20.dp, bottom = 24.dp)) {
            item {
                val index = s.months.indexOfFirst { it.value == s.month }.coerceAtLeast(0)
                LilacPickerTitle("Операции", s.months.getOrNull(index)?.label.orEmpty(), s.months.map { it.label }, { picked ->
                    month = if (picked == 0) null else s.months[picked].value
                }) {
                    Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                        LilacIconButton(Icons.Outlined.Search, "Найти") { searching = true }
                        LilacIconButton(Icons.Outlined.Tune, "Категории", caption = "Категории") { showCategories = true }
                    }
                }
            }
            if (searching) {
                item {
                    LaunchedEffect(Unit) { focus.requestFocus() }
                    SearchField(search, { search = it }, focus, submit = { query = search.ifEmpty { null } }) {
                        searching = false
                        search = ""
                        query = null
                    }
                }
            }
            if (s.categoryTitle != null || s.query != null) {
                item {
                    // The category and the text the operations are filtered by, each with a cross.
                    @OptIn(ExperimentalLayoutApi::class)
                    FlowRow(Modifier.padding(top = 14.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        s.categoryTitle?.let { FilterChip(it) { category = null } }
                        s.query?.let {
                            FilterChip("«$it»") {
                                query = null
                                search = ""
                            }
                        }
                    }
                }
            }
            if (filter != OperationsFilter.Pending && s.kind != "transfer") item { LilacFigures(figures(s), s.symbol, Modifier.padding(top = 22.dp)) }
            item {
                LilacFilterTabs(tabs(s), filter, onFilter, Modifier.padding(top = 20.dp)) {
                    val regroup = s.regroup
                    if (filter != OperationsFilter.Pending && regroup != null) {
                        Row(
                            Modifier.height(44.dp).testTag("regroup").tap { group = if (regroup.value == "day") null else regroup.value },
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(5.dp),
                        ) {
                            LilacText(regroup.label, Type.footnote, Lilac.muted, lines = 1)
                            Icon(Icons.Outlined.SwapVert, contentDescription = null, tint = Lilac.muted, modifier = Modifier.size(15.dp))
                        }
                    }
                }
            }
            if (filter == OperationsFilter.Pending) {
                item { PendingList(month) { sheet = it } }
            } else {
                if (s.days.isEmpty()) item { LilacEmpty(s.empty) }
                itemsIndexed(s.days, key = { _, day -> day.id }) { index, day ->
                    LilacTimelineGroup(
                        day.title, day.subtitle, if (abs(day.net) >= 0.5) Money.text(day.net, s.symbol, sign = true) else null,
                        first = index == 0, last = index == s.days.lastIndex,
                    ) {
                        day.items.forEachIndexed { line, operation ->
                            OperationLine(operation, s.symbol, line == 0) { operation.spending?.let { sheet = BudgetSheet.Spending(it) } }
                        }
                    }
                }
            }
        }
        if (showCategories) {
            CategorySpendingSheet(s.categoriesTitle, s.categories, s.symbol, s.category, { showCategories = false }) { category = it }
        }
    }
    BudgetSheets(sheet) { sheet = null }
}

@Composable
private fun SearchField(text: String, onChange: (String) -> Unit, focus: FocusRequester, submit: () -> Unit, cancel: () -> Unit) {
    Row(Modifier.fillMaxWidth().padding(top = 10.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Row(
            Modifier.weight(1f).height(44.dp).shadow(4.dp, CircleShape, ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f))
                .background(Lilac.surface, CircleShape).padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(Icons.Outlined.Search, contentDescription = null, tint = Lilac.muted, modifier = Modifier.size(18.dp))
            BasicTextField(
                text,
                onChange,
                singleLine = true,
                textStyle = TextStyle(fontSize = Type.body, color = Lilac.ink),
                cursorBrush = SolidColor(Lilac.accent),
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
                keyboardActions = KeyboardActions(onSearch = { submit() }),
                modifier = Modifier.weight(1f).focusRequester(focus),
                decorationBox = { field ->
                    Box {
                        if (text.isEmpty()) LilacText("Найти операцию", Type.body, Lilac.muted, lines = 1)
                        field()
                    }
                },
            )
        }
        LilacText("Отмена", Type.body, Lilac.accent, modifier = Modifier.tap(onClick = cancel))
    }
}

/** A filter the operations are under, which a tap takes away. */
@Composable
private fun FilterChip(text: String, onClick: () -> Unit) {
    Row(
        Modifier.card(onClick = onClick).height(36.dp).background(Lilac.tint, CircleShape).padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        LilacText(text, Type.subheadline, Lilac.accent, FontWeight.Medium, lines = 1)
        Icon(Icons.Outlined.Close, contentDescription = null, tint = Lilac.accent, modifier = Modifier.size(14.dp))
    }
}

/**
 * What the operations spent and what they brought; a view of one kind has only its own figure, in orange for the
 * expenses that could have been done without.
 */
@Composable
private fun figures(s: OperationsScreen): List<FigureItem> {
    val spent = FigureItem("Потрачено", s.totals.expense, if (s.kind == "optional") Palette.optional else Lilac.ink)
    val received = FigureItem("Получено", s.totals.income, Palette.color("green"))
    return when (s.kind) {
        "expense", "optional" -> listOf(spent)
        "income" -> listOf(received)
        "transfer" -> emptyList()
        else -> listOf(spent, received)
    }
}

private fun tabs(s: OperationsScreen): List<FilterTab<OperationsFilter>> {
    val all = s.kinds.firstOrNull { it.value == null }
    return listOf(
        FilterTab<OperationsFilter>(OperationsFilter.All, all?.label ?: "Все", all?.count),
        FilterTab<OperationsFilter>(OperationsFilter.Pending, "Ждут разбора", s.pending.takeIf { it > 0 }, badge = true),
    ) + s.kinds.mapNotNull { kind -> kind.value?.let { FilterTab<OperationsFilter>(OperationsFilter.Kind(it), kind.label, kind.count) } }
}

/**
 * An operation: whom it went to or came from with what it went for, a minus for an expense and green for an income,
 * orange for an expense that could have been done without, what else the bank said, and a ring with words when an
 * expense is not an ordinary one of the week.
 */
@Composable
fun OperationLine(operation: OperationRow, symbol: String, first: Boolean, open: () -> Unit) {
    val row = operation.row
    val notes = listOfNotNull(operation.comment, operation.original?.let { Money.text(it.amount, it.symbol) }, if (operation.hold) "банк ещё не провёл" else null)
    LilacRow(
        LilacMarker.expense(row),
        row.title,
        row.details,
        if (operation.kind == "expense") -(row.amount ?: 0.0) else row.amount,
        symbol,
        chip = operation.chip?.let { Note(it.label, Palette.color(it.tone)) },
        muted = row.muted,
        first = first,
        chevron = false,
        signed = operation.kind != "transfer",
        amountColor = when {
            operation.kind == "income" -> Palette.color("green")
            operation.optional -> Palette.optional
            else -> Lilac.ink
        },
        ringChip = true,
        modifier = Modifier.testTag(operation.spending?.let { "spending-$it" } ?: operation.row.id)
            .card(enabled = operation.spending != null, onClick = open),
        accessory = if (notes.isEmpty()) null else { { LilacText(notes.joinToString(" · "), Type.footnote, Lilac.muted, lines = 2) } },
    )
}

/**
 * The expenses of a month that came without a category, with a suggestion to accept in one tap, and what was sorted. An
 * expense opens to be marked, with the next ones after it.
 */
@Composable
private fun PendingList(month: String?, open: (BudgetSheet) -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val error = remember { mutableStateOf<String?>(null) }
    Screen<UncategorizedScreen>("uncategorized", mapOf("month" to month), refreshable = false) { s ->
        val queue = s.pending.flatMap { day -> day.items.map { it.spending } }
        Column {
            LilacSummary(s.total.label, s.total.amount, s.symbol, s.total.note, Type.title3 * 1.5f, Modifier.padding(top = 16.dp))
            if (s.pending.isEmpty()) LilacEmpty(s.empty)
            s.pending.forEachIndexed { index, day ->
                LilacTimelineGroup(day.title, day.subtitle, first = index == 0, last = index == s.pending.lastIndex) {
                    day.items.forEachIndexed { line, item ->
                        // A tap on the row opens it; «Принять» is a button of its own inside the row.
                        LilacRow(
                            LilacMarker.expense(item.row, dot = Lilac.red), item.row.title, item.row.details, item.row.amount, s.symbol, first = line == 0,
                            modifier = Modifier.testTag(item.row.id).card { open(BudgetSheet.Spending(item.spending, queue)) },
                            accessory = item.suggestion?.let { suggestion ->
                                {
                                    LilacInlineAction("Принять", Modifier.padding(top = 4.dp)) {
                                        scope.launch {
                                            try {
                                                session.send("spending/${item.spending}/${suggestion.choice}")
                                                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
                                            } catch (failure: Exception) {
                                                error.value = failure.message
                                            }
                                        }
                                    }
                                }
                            },
                        )
                    }
                }
            }
            if (s.sorted.isNotEmpty()) {
                LilacHeading("Разобрано")
                s.sorted.forEachIndexed { index, day ->
                    LilacTimelineGroup(day.title, day.subtitle, first = index == 0, last = index == s.sorted.lastIndex) {
                        day.items.forEachIndexed { line, expense ->
                            LilacRow(
                                LilacMarker.expense(expense.row), expense.row.title, expense.row.details, expense.row.amount, s.symbol,
                                chip = markChip(expense.row.mark), first = line == 0, chevron = false,
                                amountColor = if (expense.optional) Palette.optional else Lilac.ink, ringChip = true,
                                modifier = Modifier.card { open(BudgetSheet.Spending(expense.spending)) },
                            )
                        }
                    }
                }
            }
        }
    }
    ErrorAlert(error)
}

/** The month's spending, or incomes, by category with each one's share; a category filters the operations. */
@Composable
private fun CategorySpendingSheet(
    title: String,
    categories: List<OperationsScreen.CategorySpending>,
    symbol: String,
    selected: String?,
    onDismiss: () -> Unit,
    pick: (String?) -> Unit,
) {
    LilacSheet(onDismiss, title) {
        if (selected != null) {
            LilacAddRow("Все категории") {
                pick(null)
                onDismiss()
            }
        }
        categories.forEachIndexed { index, c ->
            val color = Palette.color(c.color)
            Box {
                LilacRow(
                    c.photo?.let { LilacMarker.Photo(it, color) } ?: LilacMarker.Symbol(WebIcons.icon(c.icon), color),
                    c.title, "", c.amount, symbol, first = index == 0 && selected == null, chevron = false,
                    modifier = Modifier.card {
                        pick(if (c.id == selected) null else c.id)
                        onDismiss()
                    },
                ) {
                    Box(Modifier.padding(top = 4.dp).fillMaxWidth(c.share.toFloat().coerceIn(0.02f, 1f)).height(5.dp).background(color, CircleShape))
                }
                if (c.id == selected) {
                    Icon(
                        Icons.Filled.CheckCircle, contentDescription = null, tint = Lilac.accent,
                        modifier = Modifier.align(Alignment.TopEnd).offset(x = 4.dp, y = 8.dp).size(20.dp),
                    )
                }
            }
        }
    }
}
