package ru.apukhtin.budget

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
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
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** A new purchase into a month's extras, from their pages or the month. */
fun extraPurchase(week: String, choices: List<OptionGroup>, symbol: String) = PurchaseDraft(null, week, "extra", choices, emptyList(), symbol)

/** The dot of how the month's extras stand: plenty, calm, tight or short. */
@Composable
fun extrasStateColor(state: String): Color = when (state) {
    "plenty" -> Palette.color("green")
    "tight" -> Palette.optional
    "short" -> Lilac.red
    else -> Lilac.accent
}

/**
 * The extras of a month, after the user's picture of 2026-10-18 (ios/Budget/ExtrasView.swift), opened from their card on
 * the main page and from the month: the month to step through, «Дополнительные» with «+», what is free large «из 100 000
 * ₽» — red «не хватает» when the plan holds more than is left —, the bar of what was spent, what is planned and what is
 * free, «Подробнее» with the dot of how the month stands, and what the plan still holds.
 */
@Composable
fun ExtrasView(start: String?, back: () -> Unit, details: (String?) -> Unit, open: (BudgetSheet) -> Unit) {
    var month by remember { mutableStateOf(start) }
    val error = remember { mutableStateOf<String?>(null) }
    Column(Modifier.fillMaxSize()) {
        PageBar("", back)
        Screen<ExtrasScreen>("extras", mapOf("month" to month)) { s ->
            fun go(target: Option?) {
                if (target != null) month = if (target.value == s.thisMonth) null else target.value
            }
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
                Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(18.dp)) {
                    StepArrow(Icons.Outlined.ChevronLeft, "Раньше", s.prev != null) { go(s.prev) }
                    LilacText(s.title, Type.title3, weight = FontWeight.Medium, tabular = true)
                    StepArrow(Icons.Outlined.ChevronRight, "Позже", s.next != null) { go(s.next) }
                }
                Box(Modifier.padding(top = 10.dp)) {
                    LilacTitle("Дополнительные") {
                        LilacRoundButton(Icons.Outlined.Add, "Добавить в дополнительные") {
                            open(BudgetSheet.Purchase(extraPurchase(s.newPurchaseWeek, s.weekChoices, s.symbol)))
                        }
                    }
                }
                Column(Modifier.padding(top = 6.dp).testTag("extras-free"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    LilacAmount(s.free.amount, s.symbol, 56.sp, FontWeight.ExtraBold, if (s.free.state == "short") Lilac.red else null)
                    LilacText(listOfNotNull(s.free.label, s.free.note).joinToString(" "), Type.title3, Lilac.muted)
                }
                Box(Modifier.padding(top = 18.dp)) { LilacShareBar(s.bar, setOf("Свободно")) }
                Row(Modifier.fillMaxWidth().padding(top = 10.dp)) {
                    Spacer(Modifier.weight(1f))
                    Row(
                        Modifier.testTag("extras-details").tap { details(month) }.padding(vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Box(Modifier.size(8.dp).background(extrasStateColor(s.free.state), CircleShape))
                        LilacText("Подробнее", Type.subheadline, Lilac.muted, FontWeight.Medium)
                        Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = Lilac.muted, modifier = Modifier.size(16.dp))
                    }
                }
                if (s.plan.items.isNotEmpty()) {
                    LilacHeading(s.plan.label)
                    s.plan.items.forEachIndexed { index, item -> PlanRow(item, s.symbol, s.weekChoices, index == 0, open, error) }
                }
            }
        }
    }
    ErrorAlert(error)
}

@Composable
private fun StepArrow(icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, enabled: Boolean, onClick: () -> Unit) {
    Box(Modifier.size(28.dp).semantics { contentDescription = label }.tap(enabled, onClick), contentAlignment = Alignment.Center) {
        Icon(icon, contentDescription = null, tint = if (enabled) Lilac.ink else Lilac.muted.copy(alpha = 0.4f))
    }
}

/**
 * The extras of a month in detail, opened from «Подробнее»: the month to pick with what is free beside it, its dot
 * telling how the month stands, then what was spent, by the plan and without one, the expenses by day, and what the plan
 * still holds. An expense the plan had says what its purchase was planned at, and the one that bought it how far over the
 * plan it went, red, or under it, green; one without a plan has a calendar struck through. «+» adds a purchase.
 */
@Composable
fun ExtrasDetailsView(start: String?, back: () -> Unit, open: (BudgetSheet) -> Unit) {
    var month by remember { mutableStateOf(start) }
    var picking by remember { mutableStateOf(false) }
    val error = remember { mutableStateOf<String?>(null) }
    Screen<ExtrasScreen>("extras", mapOf("month" to month)) { s ->
        Column(Modifier.fillMaxSize()) {
            PageBar("Дополнительные", back) {
                Box(Modifier.size(44.dp).semantics { contentDescription = "Добавить в дополнительные" }.tap {
                    open(BudgetSheet.Purchase(extraPurchase(s.newPurchaseWeek, s.weekChoices, s.symbol)))
                }, contentAlignment = Alignment.Center) { Icon(Icons.Outlined.Add, contentDescription = null, tint = Lilac.ink) }
            }
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
                Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box {
                        Row(Modifier.testTag("extras-month").tap { picking = true }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            LilacText(s.title, 22.sp, weight = FontWeight.Bold, lines = 1)
                            Icon(Icons.Outlined.ExpandMore, contentDescription = null, tint = Lilac.muted, modifier = Modifier.size(20.dp))
                        }
                        DropdownMenu(picking, { picking = false }, containerColor = Lilac.surface) {
                            s.months.forEach { option ->
                                DropdownMenuItem(text = { LilacText(option.label, Type.body, if (option.value == s.month) Lilac.accent else Lilac.ink) }, onClick = {
                                    picking = false
                                    month = if (option.value == s.thisMonth) null else option.value
                                })
                            }
                        }
                    }
                    Spacer(Modifier.weight(1f))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        Box(Modifier.size(8.dp).background(extrasStateColor(s.free.state), CircleShape))
                        LilacText(s.free.label, Type.subheadline, Lilac.muted, lines = 1)
                        LilacText(Money.text(s.free.amount, s.symbol), Type.body, if (s.free.state == "short") Lilac.red else Lilac.ink, FontWeight.Bold, lines = 1, tabular = true)
                    }
                }
                Hairline(Modifier.padding(top = 4.dp))
                Spent(s)
                if (s.days.isEmpty() && s.plan.items.isEmpty()) LilacText("Трат пока нет.", Type.subheadline, Lilac.muted, modifier = Modifier.padding(vertical = 18.dp))
                s.days.forEach { day ->
                    LilacDayHeading(day.title, day.subtitle)
                    day.items.forEachIndexed { index, expense ->
                        LilacRow(
                            LilacMarker.expense(expense.row), expense.row.title, expense.row.details, expense.row.amount, s.symbol,
                            first = index == 0, chevron = false,
                            amountColor = if (expense.optional) Palette.optional else Lilac.ink,
                            unplanned = expense.planned == false,
                            amountNote = expense.over?.let { over -> Note(Money.text(over, s.symbol, sign = true), if (over > 0) Lilac.red else Palette.color("green")) },
                            modifier = Modifier.testTag(expense.id).card { open(BudgetSheet.Spending(expense.spending)) },
                        )
                    }
                }
                if (s.plan.items.isNotEmpty()) {
                    LilacHeading(s.plan.label) { LilacAmount(s.plan.amount, s.symbol, 20.sp) }
                    s.plan.items.forEachIndexed { index, item -> PlanRow(item, s.symbol, s.weekChoices, index == 0, open, error) }
                }
            }
        }
    }
    ErrorAlert(error)
}

/** What was spent, and how much of it by the plan and without one. */
@Composable
private fun Spent(s: ExtrasScreen) {
    Column(Modifier.padding(top = 4.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            LilacText(s.spent.label, 22.sp, weight = FontWeight.Bold)
            Spacer(Modifier.weight(1f))
            LilacAmount(s.spent.amount, s.symbol, 24.sp)
        }
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            SpentPart(s.spent.byPlan, s.symbol)
            Box(Modifier.width(1.dp).height(16.dp).background(Lilac.hairline))
            LilacNoPlan()
            SpentPart(s.spent.unplanned, s.symbol)
        }
    }
}

@Composable
private fun SpentPart(figure: Figure, symbol: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(5.dp)) {
        LilacText(figure.label, Type.subheadline, Lilac.muted, lines = 1)
        LilacText(Money.text(figure.amount, symbol), Type.subheadline, Lilac.muted, FontWeight.SemiBold, lines = 1, tabular = true)
    }
}

/** The mark of what no plan had, after the user's picture of 2026-10-18: a calendar struck through. */
@Composable
fun LilacNoPlan(size: androidx.compose.ui.unit.Dp = 15.dp) {
    val canvas = Lilac.canvas
    val muted = Lilac.muted
    Box(Modifier.size(size).semantics { contentDescription = "без плана" }, contentAlignment = Alignment.Center) {
        Icon(Icons.Outlined.CalendarToday, contentDescription = null, tint = muted, modifier = Modifier.size(size))
        androidx.compose.foundation.Canvas(Modifier.size(size)) {
            val w = this.size.width
            rotate(-45f) {
                // The stroke parts from the calendar by a band of the page's colour.
                drawRoundRect(canvas, topLeft = androidx.compose.ui.geometry.Offset(w / 2 - w * 0.15f, -w * 0.17f), size = androidx.compose.ui.geometry.Size(w * 0.3f, w * 1.35f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(w * 0.15f))
                drawRoundRect(muted, topLeft = androidx.compose.ui.geometry.Offset(w / 2 - w * 0.05f, -w * 0.15f), size = androidx.compose.ui.geometry.Size(w * 0.1f, w * 1.3f), cornerRadius = androidx.compose.ui.geometry.CornerRadius(w * 0.05f))
            }
        }
    }
}
