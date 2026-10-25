package ru.apukhtin.budget

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.ExpandMore
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import kotlinx.coroutines.launch

/**
 * Why a week went below zero, opened from the red figure on the main circle (ios/Budget/WeekWhyView.swift), as what to
 * do about it: where the week is; «Что изменилось», the changes made in the app that took from the week, each opening
 * what it changed; «Проверь траты», the expenses the week counts only by default that are a lot, alone or as a run of
 * small ones, each to open and mark or to confirm with «Верно»; then reminders, folded to their rows.
 */
@Composable
fun WeekWhyView(week: String, back: () -> Unit, open: (BudgetSheet) -> Unit, openPlan: () -> Unit) {
    val session = LocalSession.current
    val scope = rememberCoroutineScope()
    val haptics = LocalHapticFeedback.current
    val error = remember { mutableStateOf<String?>(null) }
    // Runs and reminders opened to their rows.
    var opened by remember { mutableStateOf(emptySet<String>()) }
    fun toggle(id: String) {
        opened = if (id in opened) opened - id else opened + id
    }

    /** Says the expenses count right in the week; the screen loads again without them. */
    fun confirm(ids: List<String>) {
        scope.launch {
            try {
                session.send("spending/confirmed", mapOf("ids" to ids.joinToString(",")))
                haptics.performHapticFeedback(HapticFeedbackType.Confirm)
            } catch (failure: Exception) {
                error.value = failure.message
            }
        }
    }

    Column(Modifier.fillMaxSize()) {
        PageBar("Почему неделя ушла в минус", back)
        Screen<WeekWhyScreen>("week-why", mapOf("week" to week)) { s ->
            /** What a change opens: the expense, the purchase's form, the wish, the form of what the week allows, or the plan. */
            fun openChange(item: WhyChange) {
                when {
                    item.spending != null -> open(BudgetSheet.Spending(item.spending))
                    item.wish != null -> open(BudgetSheet.Wish(item.wish))
                    item.purchase != null -> open(
                        BudgetSheet.Purchase(PurchaseDraft(item.purchase, item.purchase.week, item.purchase.envelope, s.weekChoices.orEmpty(), item.actions, s.symbol)),
                    )
                    item.limit && s.limit != null -> open(BudgetSheet.Limit(WeekLimitDraft(s.week, s.subtitle, s.limit, s.symbol)))
                    item.plan -> openPlan()
                }
            }
            Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
                Column(Modifier.padding(top = 6.dp).testTag("why-now"), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    LilacText(s.subtitle, Type.subheadline, Lilac.muted)
                    LilacAmount(s.now.amount, s.symbol, 44.sp, color = if (s.now.amount < -0.5) Lilac.red else null)
                }
                s.changes?.let { changes ->
                    LilacHeading(changes.title)
                    changes.rows.forEachIndexed { index, item ->
                        LilacRow(
                            if (item.spending != null) LilacMarker.expense(item.row) else LilacMarker.icon(item.row),
                            item.row.title, item.row.details, item.row.amount, s.symbol, first = index == 0, chevron = false,
                            modifier = Modifier.testTag(item.row.id).card { openChange(item) },
                        )
                    }
                }
                s.check?.let { check ->
                    LilacHeading(check.title)
                    check.rows.forEachIndexed { index, item ->
                        val run = item.spending == null
                        LilacRow(
                            if (run) LilacMarker.icon(item.row) else LilacMarker.expense(item.row),
                            item.row.title, item.row.details, item.row.amount, s.symbol, first = index == 0, chevron = false,
                            modifier = Modifier.testTag(item.row.id).card { if (item.spending != null) open(BudgetSheet.Spending(item.spending)) else toggle(item.row.id) },
                        ) {
                            LilacInlineAction("Верно", Modifier.padding(top = 4.dp).testTag("${item.row.id}-right")) { confirm(item.confirms) }
                        }
                        if (run && item.row.id in opened) {
                            item.parts.forEach { part ->
                                LilacRow(
                                    LilacMarker.expense(part.row), part.row.title, part.row.details, part.row.amount, s.symbol, chevron = false,
                                    amountColor = if (part.optional) Palette.optional else Lilac.ink,
                                    modifier = Modifier.padding(start = 30.dp).card { open(BudgetSheet.Spending(part.spending)) },
                                )
                            }
                        }
                    }
                }
                if (s.reminders.isNotEmpty()) {
                    Column(Modifier.padding(top = 22.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        s.reminders.forEach { reminder ->
                            Reminder(reminder, s.symbol, reminder.row.id in opened, { toggle(reminder.row.id) }) { item ->
                                if (item.spending != null) open(BudgetSheet.Spending(item.spending)) else if (item.plan) openPlan()
                            }
                        }
                    }
                }
                s.empty?.let { Box(Modifier.padding(top = 12.dp)) { LilacEmpty(it) } }
            }
        }
    }
    ErrorAlert(error)
}

/** A reminder on white: its icon in its colour, what to do and why, the sum, and its rows unfolded under it. */
@Composable
private fun Reminder(reminder: WhyReminder, symbol: String, open: Boolean, toggle: () -> Unit, openRow: (WhyRow) -> Unit) {
    val tone = Palette.color(reminder.row.color)
    Column(Modifier.fillMaxWidth().background(Lilac.surface, RoundedCornerShape(20.dp))) {
        Row(
            Modifier.fillMaxWidth().testTag(reminder.row.id).tap(onClick = toggle).padding(14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Box(Modifier.size(36.dp).background(tone.copy(alpha = 0.14f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(WebIcons.icon(reminder.row.icon), contentDescription = null, tint = tone, modifier = Modifier.size(18.dp))
            }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                LilacText(reminder.row.title, Type.body, weight = FontWeight.SemiBold)
                if (reminder.row.details.isNotEmpty()) LilacText(reminder.row.details, Type.subheadline, Lilac.muted)
            }
            LilacText(Money.text(reminder.row.amount ?: 0.0, symbol), Type.body, tone, FontWeight.SemiBold, lines = 1, tabular = true)
            Icon(
                Icons.Outlined.ExpandMore, contentDescription = null, tint = Lilac.muted.copy(alpha = 0.7f),
                modifier = Modifier.size(18.dp).graphicsLayer { rotationZ = if (open) 180f else 0f },
            )
        }
        if (open) {
            Column(Modifier.padding(horizontal = 14.dp)) {
                reminder.rows.forEachIndexed { index, item ->
                    LilacRow(
                        if (item.spending != null) LilacMarker.expense(item.row) else LilacMarker.icon(item.row),
                        item.row.title, item.row.details, item.row.amount, symbol, first = index == 0, chevron = false,
                        amountColor = if (item.optional) Palette.optional else Lilac.ink,
                        modifier = Modifier.card { openRow(item) },
                    )
                }
            }
        }
    }
}
