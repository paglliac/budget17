package ru.apukhtin.budget

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlin.math.roundToInt
import kotlinx.coroutines.launch

/**
 * The «План» tab: the plan of a week, stepping back and forth from the current one (ios/Budget/HomeView.swift, PlanView).
 * The main page's «Зарезервировано» opens it on the week the main page shows.
 */
@Composable
fun PlanView(week: String?, go: (String?) -> Unit) {
    var sheet by remember { mutableStateOf<BudgetSheet?>(null) }
    Screen<WeekScreen>("week", mapOf("week" to week)) { s ->
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            LilacTitle("План") {
                if (s.phase != "current") LilacChip("Сейчас") { go(null) }
                LilacRoundButton(Icons.Outlined.ChevronLeft, "Раньше") { go(if (s.prev == s.current) null else s.prev) }
                LilacRoundButton(Icons.Outlined.ChevronRight, "Позже", enabled = s.next != null) { s.next?.let { go(if (it == s.current) null else it) } }
            }
            LilacText(s.title, Type.subheadline, Lilac.muted, modifier = Modifier.padding(top = 2.dp))
            Box(Modifier.padding(top = 8.dp)) { PlanContent(s) { sheet = it } }
        }
    }
    BudgetSheets(sheet) { sheet = null }
}

/** A new purchase from a week's page: into that week, or into the current one when it is over. */
fun newPurchase(s: WeekScreen, envelope: String) =
    PurchaseDraft(null, if (s.phase == "past") s.current else s.week, envelope, s.weekChoices, emptyList(), s.symbol)

/**
 * What a week's plan holds: what is reserved, required and flexible, with the purchases from the week's money, then the
 * ones from the extras and the regular payments of the week. What is paid already folds into «Оплачено» at the end,
 * which unfolds on a tap. «+» adds a purchase to the week or to the extras; the wishes have a tab of their own.
 */
@Composable
fun PlanContent(s: WeekScreen, open: (BudgetSheet) -> Unit) {
    val r = s.home.reserved
    // A pale row is one paid already.
    val paid = s.plan.filter { it.row.muted }
    val left = s.plan.filterNot { it.row.muted }
    val fromWeek = left.filter { it.purchase?.envelope == "week" }
    val fromExtras = left.filter { it.purchase?.envelope == "extra" }
    val regular = left.filter { it.regular != null }
    var showPaid by remember { mutableStateOf(false) }
    var adding by remember { mutableStateOf(false) }
    val error = remember { mutableStateOf<String?>(null) }
    Column {
        LilacAmount(r.amount, s.symbol, 44.sp, modifier = Modifier.padding(top = 6.dp))
        LilacBar(r.required.amount, r.flexible.amount, Modifier.padding(top = 20.dp))
        Row(Modifier.fillMaxWidth().padding(top = 18.dp), horizontalArrangement = Arrangement.spacedBy(20.dp)) {
            Share(r.required, r.amount, s.symbol, Modifier.weight(1f))
            Box(Modifier.width(0.5.dp).height(66.dp).background(Lilac.hairline))
            Share(r.flexible, r.amount, s.symbol, Modifier.weight(1f))
        }
        LilacHeading("Планируемые траты") {
            Box {
                Box(Modifier.testTag("add-purchase")) { LilacRoundButton(Icons.Outlined.Add, "Добавить в план") { adding = true } }
                DropdownMenu(adding, { adding = false }, containerColor = Lilac.surface) {
                    DropdownMenuItem(
                        text = { LilacText("В план недели", Type.body) },
                        leadingIcon = { Icon(Icons.Outlined.ShoppingCart, contentDescription = null, tint = Lilac.ink) },
                        onClick = {
                            adding = false
                            open(BudgetSheet.Purchase(newPurchase(s, "week")))
                        },
                    )
                    DropdownMenuItem(
                        text = { LilacText("В дополнительные", Type.body) },
                        leadingIcon = { Icon(Icons.Outlined.ShoppingBag, contentDescription = null, tint = Lilac.ink) },
                        onClick = {
                            adding = false
                            open(BudgetSheet.Purchase(newPurchase(s, "extra")))
                        },
                    )
                }
            }
        }
        if (fromWeek.isEmpty()) LilacAddRow("Добавить в план") { open(BudgetSheet.Purchase(newPurchase(s, "week"))) }
        PlanRows(fromWeek, s, open, error)
        if (fromExtras.isNotEmpty()) {
            LilacHeading("Из дополнительных")
            PlanRows(fromExtras, s, open, error)
        }
        if (regular.isNotEmpty()) {
            LilacHeading("Регулярные платежи")
            PlanRows(regular, s, open, error)
        }
        if (paid.isNotEmpty()) {
            Box(Modifier.testTag("plan-paid").tap { showPaid = !showPaid }) {
                LilacHeading("Оплачено", "${paid.size}") {
                    Icon(
                        Icons.Outlined.ExpandMore, contentDescription = null, tint = Lilac.muted,
                        modifier = Modifier.graphicsLayer { rotationZ = if (showPaid) 180f else 0f },
                    )
                }
            }
            AnimatedVisibility(showPaid, enter = fadeIn() + expandVertically(), exit = fadeOut() + shrinkVertically()) {
                Column { PlanRows(paid, s, open, error) }
            }
        }
    }
    ErrorAlert(error)
}

@Composable
private fun Share(figure: Figure, total: Double, symbol: String, modifier: Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        LilacAmount(figure.amount, symbol, 22.sp)
        LilacText(figure.label, Type.subheadline, Lilac.muted)
        if (total > 0.5) LilacText("${(figure.amount / total * 100).roundToInt()}%", Type.footnote, Lilac.muted, tabular = true)
    }
}

@Composable
private fun PlanRows(items: List<PlanItem>, s: WeekScreen, open: (BudgetSheet) -> Unit, error: androidx.compose.runtime.MutableState<String?>) {
    items.forEachIndexed { index, item -> PlanRow(item, s.symbol, s.weekChoices, index == 0, open, error) }
}

/**
 * A row of a plan: a purchase opens its form and finishes from the menu of a long press, a regular payment opens the
 * regular expense, the money a wish's plan holds opens the wish. A required purchase is a violet dot, a flexible one a
 * ring, a wish's money has the wish's sparkles; a purchase bought and a payment paid are pale with a tick.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun PlanRow(item: PlanItem, symbol: String, choices: List<OptionGroup>, first: Boolean, open: (BudgetSheet) -> Unit, error: androidx.compose.runtime.MutableState<String?>) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    var menu by remember { mutableStateOf(false) }
    val purchase = item.purchase
    val canFinish = item.wish == null && purchase != null && item.finishable
    val marker = when {
        item.wish != null -> LilacMarker.Symbol(WebIcons.icon(item.row.icon), if (item.row.muted) Lilac.muted else Palette.week)
        item.row.muted -> LilacMarker.Symbol(Icons.Outlined.Check, Lilac.muted)
        purchase != null -> if (purchase.kind == "required") LilacMarker.Dot(Lilac.accent) else LilacMarker.Ring(Lilac.accent)
        else -> LilacMarker.Ring(Lilac.muted)
    }
    Box {
        LilacRow(
            marker, item.row.title, item.row.details, item.row.amount, symbol, muted = item.row.muted, first = first,
            modifier = Modifier.testTag(item.id).semantics { contentDescription = item.row.title }.combinedClickable(
                interactionSource = remember { MutableInteractionSource() },
                indication = null,
                onLongClick = if (canFinish) {
                    {
                        haptics.performHapticFeedback(HapticFeedbackType.LongPress)
                        menu = true
                    }
                } else null,
            ) {
                when {
                    item.wish != null -> open(BudgetSheet.Wish(item.wish))
                    purchase != null -> open(BudgetSheet.Purchase(PurchaseDraft(purchase, purchase.week, purchase.envelope, choices, item.actions, symbol)))
                    item.regular != null -> open(BudgetSheet.Regular(item.regular))
                }
            },
        )
        DropdownMenu(menu, { menu = false }, containerColor = Lilac.surface) {
            DropdownMenuItem(
                text = { LilacText("Завершить: остаток вернётся", Type.body) },
                leadingIcon = { Icon(Icons.Outlined.Check, contentDescription = null, tint = Lilac.ink) },
                onClick = {
                    menu = false
                    scope.launch {
                        try {
                            session.send("purchases/${purchase?.id}/done")
                        } catch (failure: Exception) {
                            error.value = failure.message
                        }
                    }
                },
            )
        }
    }
}

/** A bar of two parts, the strong one first, on a track; with nothing in it the track alone shows. */
@Composable
fun LilacBar(first: Double, second: Double, modifier: Modifier = Modifier) {
    val accent = Lilac.accent
    androidx.compose.foundation.layout.BoxWithConstraints(modifier.fillMaxWidth().height(14.dp).background(Lilac.track, androidx.compose.foundation.shape.CircleShape)) {
        val sum = maxOf(first + second, 1.0)
        val gap = if (first > 0.5 && second > 0.5) 3.dp else 0.dp
        val full = maxWidth
        Row(horizontalArrangement = Arrangement.spacedBy(gap)) {
            if (first > 0.5) {
                Box(
                    Modifier.width(maxOf((full - gap) * (first / sum).toFloat(), 12.dp)).height(14.dp)
                        .background(androidx.compose.ui.graphics.Brush.horizontalGradient(listOf(accent.copy(alpha = 0.75f), accent)), androidx.compose.foundation.shape.CircleShape),
                )
            }
            if (second > 0.5) Box(Modifier.weight(1f).height(14.dp).background(Lilac.soft, androidx.compose.foundation.shape.CircleShape))
        }
    }
}
