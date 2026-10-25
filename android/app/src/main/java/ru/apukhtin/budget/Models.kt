@file:OptIn(ExperimentalSerializationApi::class)

package ru.apukhtin.budget

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.KSerializer
import kotlinx.serialization.KeepGeneratedSerializer
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonTransformingSerializer
import kotlinx.serialization.json.jsonObject

// Screens as the server's JSON API sends them (src/web/api.ts), the same as ios/Budget/Models.swift. The server works
// out every figure and phrase, so these are plain data: rows carry an icon by its web name (see Icons), a colour as a
// tone or #rrggbb (see Palette) and where an expense or a purchase counts as `mark`. A field the server may leave out has
// a default or is nullable, as an optional is in Swift; one it always sends has neither, so its absence fails the check.

/** How the app reads the server: what it does not know it skips, what is missing is null. */
val ApiJson = Json {
    ignoreUnknownKeys = true
    explicitNulls = false
}

/** A row of a list: what the web UI draws as entryRow or operationRow. */
@Serializable
data class Row(
    val id: String,
    val title: String,
    val details: String,
    val icon: String,
    val color: String,
    /** A category's photo, drawn instead of the icon on its colour: a path of the server. */
    val photo: String?,
    /** The logo of an expense's shop, drawn on white instead of its dot: a path of the server. */
    val logo: String?,
    val amount: Double?,
    /** week, extra, outside or ignored; null when the row has no dot. */
    val mark: String?,
    val muted: Boolean,
)

/**
 * Reads the shared row fields and the ones of a kind of row from the same object: the server sends them flat, and the
 * models keep the row apart as `row`.
 */
open class FlatRow<T : Any>(serializer: KSerializer<T>) : JsonTransformingSerializer<T>(serializer) {
    override fun transformDeserialize(element: JsonElement): JsonElement = JsonObject(element.jsonObject + ("row" to element))
}

/** A total with what it is out of and the bar under it. */
@Serializable
data class Total(val label: String, val amount: Double, val note: String, val parts: List<Part>?) {
    @Serializable
    data class Part(val label: String, val value: Double, val tone: String)
}

/** A day of a list under its heading: Вчера with 6 октября, вторник. */
@Serializable
data class Day<T>(val date: String, val title: String, val subtitle: String, val items: List<T>)

@Serializable
data class Option(val value: String, val label: String, /** Set for a payment to pick, as its card shows it. */ val icon: String? = null)

@Serializable
data class OptionGroup(val label: String, val options: List<Option>)

/** A figure with what it is. */
@Serializable
data class Figure(val label: String, val amount: Double)

// Budget

/** An expense that opens to be marked by its ZenMoney id. */
@KeepGeneratedSerializer
@Serializable(with = Expense.Flat::class)
data class Expense(
    val row: Row,
    val spending: String,
    /** The user said it could have been done without. */
    val optional: Boolean = false,
    /** In the extras: whether the plan had it, as it paid a purchase or set money aside for a wish; null elsewhere. */
    val planned: Boolean? = null,
    /** In the extras, on the expense that bought or finished a purchase: how far it went over the plan. */
    val over: Double? = null,
) {
    val id get() = row.id

    object Flat : FlatRow<Expense>(generatedSerializer())
}

@Serializable
data class Purchase(
    val id: Int,
    val title: String,
    val amount: Double,
    val week: String,
    /** week or extra. */
    val envelope: String,
    /** required, which had better stay in its week, or flexible, which can move. */
    val kind: String,
    val done: Boolean,
    val weekLabel: String,
)

/** move or done, as /purchases/:id/:action takes it. */
@Serializable
data class PurchaseAction(val action: String, val label: String)

/** A row of a plan: a purchase, a regular payment that falls on the week, or money a wish's plan holds. */
@KeepGeneratedSerializer
@Serializable(with = PlanItem.Flat::class)
data class PlanItem(
    val row: Row,
    val purchase: Purchase? = null,
    val regular: Int? = null,
    /** Money a wish's plan holds: the wish it opens. */
    val wish: Int? = null,
    val finishable: Boolean = false,
    val actions: List<PurchaseAction> = emptyList(),
) {
    val id get() = row.id

    object Flat : FlatRow<PlanItem>(generatedSerializer())
}

@Serializable
data class Wish(
    val id: Int,
    val title: String,
    val amount: Double,
    /** wish, or card for the debt of a credit card. */
    val kind: String? = null,
    /** A card's interest in percent a year, if the user said. */
    val rate: Double? = null,
)

@Serializable
data class WeekScreen(
    val symbol: String,
    val today: String,
    val current: String,
    val week: String,
    /** past, current or ahead. */
    val phase: String,
    val title: String,
    val prev: String,
    val next: String?,
    val total: Total,
    val home: WeekHome,
    val limit: WeekLimit,
    val days: List<Day<Expense>>,
    val plan: List<PlanItem>,
    val weekChoices: List<OptionGroup>,
    val source: String,
)

/**
 * The top of the week: what is free, what the plan holds by kind, what was spent today (in a past week, in all of it;
 * nothing in a week ahead), how many expenses wait for a category, the extras of the week's month, and when the server
 * last synced.
 */
@Serializable
data class WeekHome(
    val free: Free,
    val reserved: Reserved,
    val spent: Figure?,
    val pending: Pending,
    /** Wishes whose chosen plan falls short of them; null when none is. */
    val short: Short?,
    /** In the place of the expenses to sort once all are sorted. */
    val extras: Extras?,
    /** What the card beside today's spending shows: «sort», «short» or «extras». */
    val task: String?,
    /** An ISO moment. */
    val syncedAt: String?,
) {
    /** «Не хватает» with what the plans of wishes lack, and the wish it opens, or how many wishes. */
    @Serializable
    data class Short(val label: String, val amount: Double, val note: String, val wish: Int?)

    @Serializable
    data class Reserved(val label: String, val amount: Double, val required: Figure, val flexible: Figure)

    /** 3 траты ждут разбора, or Всё разобрано; «Разобрать операции» over «3 новые». */
    @Serializable
    data class Pending(val count: Int, val label: String, val title: String?, val note: String?)

    /** Доп. бюджет: what is free of the month's extras, or how far past them; the month it opens, null for this one. */
    @Serializable
    data class Extras(val label: String, val amount: Double, val over: Boolean, val note: String, val month: String?)

    /**
     * What is free, with how full the week is for the wave on the circle: «enough», «low» (less than a day's share of
     * the week left), «empty» or «over»; the share is what is left of the week's amount, or how far past it, 0 to 1.
     */
    @Serializable
    data class Free(val label: String, val amount: Double, val state: String?, val share: Double?)
}

/**
 * Why a week went below zero, as what to do about it: where the week is, what changes made in the app took from it,
 * the expenses to check where they count, and reminders; `empty` when there is nothing of any.
 */
@Serializable
data class WeekWhyScreen(
    val symbol: String,
    val week: String,
    val phase: String,
    val title: String,
    val subtitle: String,
    val now: Figure,
    val changes: Changes?,
    val check: Checks?,
    val reminders: List<WhyReminder>,
    val empty: String?,
    val weekChoices: List<OptionGroup>?,
    val limit: WeekLimit?,
) {
    @Serializable
    data class Changes(val title: String, val rows: List<WhyChange>)

    @Serializable
    data class Checks(val title: String, val rows: List<WhyCheck>)
}

/** A change made in the app that took from the week; it opens an expense, a purchase, a wish, the plan or the limit. */
@KeepGeneratedSerializer
@Serializable(with = WhyChange.Flat::class)
data class WhyChange(
    val row: Row,
    val spending: String? = null,
    val purchase: Purchase? = null,
    val actions: List<PurchaseAction> = emptyList(),
    val wish: Int? = null,
    val limit: Boolean = false,
    val plan: Boolean = false,
) {
    object Flat : FlatRow<WhyChange>(generatedSerializer())
}

/** An expense to check where it counts, or a run of small ones; `confirms` are the expenses «Верно» confirms. */
@KeepGeneratedSerializer
@Serializable(with = WhyCheck.Flat::class)
data class WhyCheck(
    val row: Row,
    val spending: String? = null,
    val confirms: List<String> = emptyList(),
    val parts: List<Expense> = emptyList(),
) {
    object Flat : FlatRow<WhyCheck>(generatedSerializer())
}

/** A reminder, such as to keep to the plan, and the rows it opens to. */
@KeepGeneratedSerializer
@Serializable(with = WhyReminder.Flat::class)
data class WhyReminder(val row: Row, val rows: List<WhyRow> = emptyList()) {
    object Flat : FlatRow<WhyReminder>(generatedSerializer())
}

/** A row a reminder opens to: an expense opens to be marked, a purchase or the plan opens the plan. */
@KeepGeneratedSerializer
@Serializable(with = WhyRow.Flat::class)
data class WhyRow(val row: Row, val spending: String? = null, val plan: Boolean = false, val optional: Boolean = false) {
    object Flat : FlatRow<WhyRow>(generatedSerializer())
}

/** What a week allows and the usual amount. Another amount posts to week-limits/:week, the usual one to its delete. */
@Serializable
data class WeekLimit(val amount: Double, val usual: Double) {
    val changed get() = amount != usual
}

@KeepGeneratedSerializer
@Serializable(with = WeekLine.Flat::class)
data class WeekLine(val row: Row, val week: String) {
    object Flat : FlatRow<WeekLine>(generatedSerializer())
}

@Serializable
data class MonthScreen(
    val symbol: String,
    val month: String,
    val thisMonth: String,
    val title: String,
    val prev: Option,
    val next: Option?,
    val weeks: List<WeekLine>,
    val total: Total,
    /** Where the month's income goes; null without incomes. */
    val flow: Flow?,
    val newPurchaseWeek: String,
    val weekChoices: List<OptionGroup>,
    val source: String,
)

/** A month's extras: what is free, the bar, what was spent by the plan and without, the expenses by day, the plan. */
@Serializable
data class ExtrasScreen(
    val symbol: String,
    val month: String,
    val thisMonth: String,
    val title: String,
    val months: List<Option>,
    val prev: Option?,
    val next: Option?,
    val free: Free,
    val bar: List<Total.Part>,
    val spent: Spent,
    val days: List<Day<Expense>>,
    val plan: Plan,
    val newPurchaseWeek: String,
    val weekChoices: List<OptionGroup>,
    val source: String,
) {
    /** «свободно» with «из 100 000 ₽», or «не хватает»; state is plenty, calm, tight or short. */
    @Serializable
    data class Free(val label: String, val amount: Double, val state: String, val note: String?)

    @Serializable
    data class Spent(val label: String, val amount: Double, val byPlan: Figure, val unplanned: Figure)

    @Serializable
    data class Plan(val label: String, val amount: Double, val items: List<PlanItem>)
}

/** A month's income and where it goes: regular payments, the weeks' budgets, the extras, and savings or what is short. */
@Serializable
data class Flow(val income: Income, val parts: List<Part>) {
    @Serializable
    data class Income(val label: String, val amount: Double, val note: String)

    /** share is of the income, 0.29 for 29%; below zero for what is short. */
    @Serializable
    data class Part(val label: String, val amount: Double, val share: Double)
}

// Marking

/** A choice made in one tap, posted to spending/:id/:choice. */
@Serializable
data class Choice(
    val choice: String,
    val label: String,
    val detail: String?,
    val color: String?,
    /** Set for a category or a payment, as its tile shows it. */
    val icon: String?,
    /** A category's photo, as a path of the server. */
    val photo: String?,
    val current: Boolean?,
    val suggested: Boolean?,
) {
    val isCurrent get() = current ?: false
    val isSuggested get() = suggested ?: false
}

@Serializable
data class SpendingScreen(
    val id: String,
    /** expense, or income: an income pays nothing, so it is sorted only into a category. */
    val kind: String,
    val title: String,
    val amount: Double,
    val symbol: String,
    /** 6 октября, 20:05. */
    @SerialName("when") val time: String,
    val account: String,
    /** What the user wrote about the expense; posted to spending/:id/description. */
    val description: String?,
    /** Its shop, named and dressed for all its expenses; null for one without a shop. */
    val shop: Shop?,
    /** What else the bank said, such as its comment or that it has not settled the expense yet. */
    val notes: List<String>,
    val payments: Payments,
    val categories: Categories,
    /** What is suggested, such as Похоже на «Продукты». */
    val hint: String?,
    /** Whether the expense could have been done without; null for an income or an expense not counted. */
    val optional: OptionalSwitch?,
    val envelopes: List<Choice>,
    val undo: List<Choice>,
) {
    val isIncome get() = kind == "income"

    @Serializable
    data class OptionalSwitch(val label: String, val current: Boolean)

    @Serializable
    data class Payments(val choices: List<Choice>, val others: List<OptionGroup>, val otherLabel: String, val empty: String)

    @Serializable
    data class Categories(val choices: List<Choice>, val empty: String)
}

// Operations

@KeepGeneratedSerializer
@Serializable(with = OperationRow.Flat::class)
data class OperationRow(
    val row: Row,
    /** expense, income or transfer. */
    val kind: String,
    val comment: String? = null,
    val hold: Boolean,
    val original: Original? = null,
    /** Set for an expense or an income, which opens to be marked. */
    val spending: String? = null,
    /** What an expense is when it is not an ordinary one of the week, such as Ждёт разбора. */
    val chip: Chip? = null,
    val optional: Boolean = false,
) {
    @Serializable
    data class Original(val amount: Double, val symbol: String)

    @Serializable
    data class Chip(val label: String, val tone: String)

    object Flat : FlatRow<OperationRow>(generatedSerializer())
}

/** A day of the operations, or a category when they go by category; a server before the categories sends only date. */
@Serializable
data class OperationDay(
    @SerialName("id") val key: String? = null,
    val date: String? = null,
    val title: String,
    val subtitle: String,
    val net: Double,
    val items: List<OperationRow>,
) {
    val id get() = key ?: date.orEmpty()
}

@Serializable
data class OperationsScreen(
    val symbol: String,
    val month: String,
    val months: List<Option>,
    val title: String,
    val kinds: List<Kind>,
    val kind: String?,
    val category: String?,
    val categoryTitle: String?,
    val query: String?,
    val totals: Totals,
    /** The other way the list can go, by day or by category, as its switch names it. */
    val regroup: Option?,
    /** Days, newest first, or categories, the largest first. */
    val days: List<OperationDay>,
    val empty: String,
    val categoriesTitle: String,
    val categories: List<CategorySpending>,
    /** Expenses of the month that wait for a category. */
    val pending: Int,
) {
    @Serializable
    data class Totals(val expense: Double, val income: Double, val count: Int)

    @Serializable
    data class Kind(val value: String?, val label: String, val count: Int)

    @Serializable
    data class CategorySpending(
        val id: String,
        val title: String,
        val icon: String,
        val color: String,
        val photo: String?,
        val amount: Double,
        val share: Double,
    )
}

@KeepGeneratedSerializer
@Serializable(with = PendingExpense.Flat::class)
data class PendingExpense(val row: Row, val spending: String, val suggestion: Suggestion? = null) {
    @Serializable
    data class Suggestion(val choice: String, val name: String)

    object Flat : FlatRow<PendingExpense>(generatedSerializer())
}

@Serializable
data class UncategorizedScreen(
    val symbol: String,
    val month: String,
    val months: List<Option>,
    val total: Total,
    val pending: List<Day<PendingExpense>>,
    val sorted: List<Day<Expense>>,
    val empty: String,
)

// Setup

@Serializable
data class RegularEntry(
    val id: Int,
    val title: String,
    val amount: Double,
    val day: Int,
    val start: String?,
    val end: String?,
    val icon: String?,
)

@KeepGeneratedSerializer
@Serializable(with = RegularItem.Flat::class)
data class RegularItem(
    val row: Row,
    val expense: RegularEntry,
    /** The form's fields as the user would type them. */
    val values: Map<String, String>,
) {
    object Flat : FlatRow<RegularItem>(generatedSerializer())
}

@Serializable
data class IconChoice(val icon: String, val label: String)

/** value is a tone's name, such as violet, or #rrggbb. */
@Serializable
data class ColorChoice(val value: String, val label: String)

@Serializable
data class RegularScreen(
    val symbol: String,
    val total: Total,
    val behind: List<RegularItem>,
    val today: String,
    val ahead: List<RegularItem>,
    val later: List<RegularItem>,
    val icons: List<IconChoice>,
)

@KeepGeneratedSerializer
@Serializable(with = IncomeItem.Flat::class)
data class IncomeItem(val row: Row, val income: Ref, val values: Map<String, String>) {
    @Serializable
    data class Ref(val id: Int, val model: String)

    object Flat : FlatRow<IncomeItem>(generatedSerializer())
}

/** formula is how the amount is worked out, such as 200 000 × 11/22 рабочих дней. */
@KeepGeneratedSerializer
@Serializable(with = IncomePayment.Flat::class)
data class IncomePayment(val row: Row, val formula: String? = null) {
    object Flat : FlatRow<IncomePayment>(generatedSerializer())
}

@Serializable
data class IncomeModel(val id: String, val title: String, val fields: List<Field>, val defaults: Map<String, String>) {
    /** kind is amount or day. */
    @Serializable
    data class Field(val name: String, val label: String, val kind: String, val placeholder: String?)
}

@Serializable
data class IncomeScreen(
    val symbol: String,
    val total: Total,
    val incomes: List<IncomeItem>,
    val upcoming: List<Day<IncomePayment>>,
    val models: List<IncomeModel>,
)

@KeepGeneratedSerializer
@Serializable(with = CategoryItem.Flat::class)
data class CategoryItem(val row: Row, val category: Info) {
    @Serializable
    data class Info(
        val id: String,
        val name: String,
        /** null for one of the user's own. */
        val zenmoneyTitle: String?,
        val hidden: Boolean,
        /** expense or income: what the category sorts. */
        val kind: String,
        /** The icon and colour the user picked; null for the category's own, which `auto` gives. */
        val icon: String?,
        val color: String?,
        val auto: Look?,
    )

    @Serializable
    data class Look(val icon: String, val color: String)

    object Flat : FlatRow<CategoryItem>(generatedSerializer())
}

@Serializable
data class CategoriesScreen(
    /** The icons and colours to pick for a category. */
    val icons: List<IconChoice>?,
    val colors: List<ColorChoice>?,
    val shown: List<CategoryItem>,
    val hidden: List<CategoryItem>,
    /** The income categories the same way. */
    val income: Group,
) {
    @Serializable
    data class Group(val shown: List<CategoryItem>, val hidden: List<CategoryItem>)
}

/** A shop's form, from the tab of shops or an expense of it: posted to shops/:key, its photo/delete and its forget. */
@Serializable
data class Shop(
    val key: String,
    /** The name the user gave it; empty for the one it would have, `placeholder`. */
    val title: String,
    val placeholder: String,
    /** The site its logo comes from that the user gave it; empty for its chain's, `sitePlaceholder`. */
    val site: String,
    val sitePlaceholder: String,
    /** Its logo, or the user's photo, as a path of the server. */
    val logo: String?,
    val photo: Boolean,
    /** Whether the user named or dressed it, which forget takes back. */
    val dressed: Boolean,
    /** Для 43 операций: Lenta-0089, Lenta-0178, Лента и ещё 9 названий. */
    val note: String,
    /** The names the bank gives it, the most frequent first. */
    val names: List<Name>?,
) {
    @Serializable
    data class Name(val name: String, val count: Int)
}

/** The shops of the last three months, the most frequent first, or those a search found. */
@Serializable
data class ShopsScreen(val query: String?, val recent: Int, val items: List<Item>) {
    @KeepGeneratedSerializer
    @Serializable(with = Item.Flat::class)
    data class Item(val row: Row, val shop: Shop) {
        object Flat : FlatRow<Item>(generatedSerializer())
    }
}

/**
 * The day a week begins on (posts to budget/week-start/:day), round figures on the main page (budget/round-figures/on
 * or off) and where the extras' widget tells plenty and tight (budget/extras-levels).
 */
@Serializable
data class BudgetSettingsScreen(
    val symbol: String,
    /** 0 for Monday to 6 for Sunday. */
    val weekStart: Int,
    val roundFigures: Boolean?,
    /** The days to pick from, Monday first. */
    val weekdays: List<Weekday>,
    /** What a week allows unless it has an amount of its own. */
    val limit: Double,
    val extrasLevels: ExtrasLevels? = null,
) {
    @Serializable
    data class Weekday(val value: Int, val label: String)

    @Serializable
    data class ExtrasLevels(val plenty: Double, val tight: Double)
}

@Serializable
data class SessionInfo(val user: String?, val symbol: String, val source: String, val canSync: Boolean, val syncedAt: String?)

// A wish's plan

/**
 * A wish with the ways to afford it as cards to pick together, what they gather, and the plan's steps up to buying it.
 * `chosen` says the plan shown is the one chosen; `picks` go back to the server as the cards change.
 */
@Serializable
data class WishScreen(
    val symbol: String,
    val current: String,
    val wish: Goal,
    val dueRange: DueRange,
    val ways: List<WayCard>,
    val picks: String,
    val covered: Double,
    val short: Double,
    /** What expenses set aside for the wish. */
    val saved: Double?,
    val relay: WishRelay?,
    val steps: List<PlanStep>,
    val buy: Buy,
    val chosen: Boolean,
    val planned: Boolean,
    val bought: Boolean,
    /** What the screen calls the day, the money set aside, buying and bought; a card's are about repaying its debt. */
    val words: Words?,
    val rate: Double?,
    /** A card's: when the ways picked close it and what that costs. */
    val result: CardResult?,
    /** A card's plans to pick in one tap. */
    val scenarios: List<Scenario>?,
) {
    /** The words of the screen, a wish's when the server sends none. */
    val word get() = words ?: Words(due = "Нужно", saved = "Отложено", buy = "Купить", bought = "Куплено", plan = null)

    @Serializable
    data class Goal(
        val id: Int,
        val title: String,
        val amount: Double,
        val due: String,
        /** The user picked the day; otherwise it is a month from now. */
        val dueSet: Boolean,
        val kind: String? = null,
    )

    /** plan is the heading over the ways: «Как собрать», «Как гасить». */
    @Serializable
    data class Words(val due: String, val saved: String, val buy: String, val bought: String, val plan: String?)

    /** «Закроете в декабре» with «переплата ≈ 2 400 ₽»; `late` when the plan does not close the card. */
    @Serializable
    data class CardResult(val title: String, val note: String, val late: Boolean)

    /** A plan to pick in one tap: the month it closes the card and its interest; `ways` go back as the picks. */
    @Serializable
    data class Scenario(val label: String, val note: String, val ways: String, val on: Boolean)

    @Serializable
    data class DueRange(val from: String, val to: String)

    @Serializable
    data class Buy(val label: String, val late: Boolean)
}

/** Choosing the chosen plan's ways again: «Добрать 1 000 ₽» or «Освободить»; posts `ways` to wishes/:id/ways. */
@Serializable
data class WishRelay(val label: String, val amount: Double, val add: Boolean, val ways: String)

/** «Желания»: every wish with its chosen plan, and the money the plans hold by month. */
@Serializable
data class WishesScreen(val symbol: String, val wishes: List<WishSummary>, val months: List<WishMonth>)

/** A wish in «Желания»: its row, its day with the week it is bought, what its plan gathers and where the money comes from. */
@KeepGeneratedSerializer
@Serializable(with = WishSummary.Flat::class)
data class WishSummary(
    val row: Row,
    val wish: Wish,
    /** none, planned or bought. */
    val state: String,
    /** What the card puts first: calm, risk, problem or action; null when bought. */
    val situation: String? = null,
    @SerialName("when") val time: String,
    val covered: Double,
    val short: Double,
    /** What expenses set aside for the wish. */
    val saved: Double = 0.0,
    val relay: WishRelay? = null,
    /** Where the money comes from: what is set aside first, then the ways of the chosen plan. */
    val ways: List<Way>,
) {
    val id get() = wish.id

    @Serializable
    data class Way(val id: String, val title: String, val icon: String, val color: String, val line: String, val amount: Double)

    object Flat : FlatRow<WishSummary>(generatedSerializer())
}

/** What the plans of wishes hold in a month, a row each naming its wish. */
@Serializable
data class WishMonth(val month: String, val title: String, val total: Double, val rows: List<HeldMoney>)

/** Money a wish's plan holds, which opens the wish. */
@KeepGeneratedSerializer
@Serializable(with = HeldMoney.Flat::class)
data class HeldMoney(val row: Row, val wish: Int) {
    object Flat : FlatRow<HeldMoney>(generatedSerializer())
}

/** A way to put money towards a wish: what it can give, and, picked, what it gives. */
@Serializable
data class WayCard(
    val id: String,
    val title: String,
    val icon: String,
    val color: String,
    val on: Boolean,
    /** Given by hand; otherwise it takes what the others leave. */
    val fixed: Boolean,
    /** What it gives: a week's cut for the weeks. */
    val amount: Double,
    /** What it gives in all. */
    val given: Double,
    /** The most it can be given, with what the others given by hand take. */
    val most: Double,
    val step: Double,
    val unit: String?,
    val line: String,
    val late: Boolean,
    /** What the amount says when the way takes all there is: «остальное», «все». */
    val rest: String?,
)

/** A step of a wish's plan on its date. */
@KeepGeneratedSerializer
@Serializable(with = PlanStep.Flat::class)
data class PlanStep(val row: Row, val date: String) {
    object Flat : FlatRow<PlanStep>(generatedSerializer())
}

// Widgets

/**
 * What the widgets show, as /api/widget sends it: the week with its days, what was spent today, the expenses of this
 * month that wait for a category, what this month saved against the months before it, the next regular payment, and the
 * extras of this month with where they are headed (ios/Shared/WidgetData.swift).
 */
@Serializable
data class WidgetData(
    val symbol: String,
    val week: Week,
    val today: Today,
    val pending: Pending,
    val savings: Savings,
    val payment: Payment?,
    val extras: Extras?,
) {
    @Serializable
    data class Week(val label: String, val free: Double, val note: String, val days: List<Day>)

    @Serializable
    data class Day(val label: String, val today: Boolean, val ahead: Boolean, val spent: Boolean)

    /** syncedAt is when the server last synced with ZenMoney, as an ISO moment. */
    @Serializable
    data class Today(val label: String, val amount: Double, val syncedAt: String?)

    /** sorted is the share of this month's expenses that has a category, 0…1. */
    @Serializable
    data class Pending(val count: Int, val amount: Double, val sorted: Double, val label: String, val title: String, val note: String)

    @Serializable
    data class Savings(val label: String, val period: String, val amount: Double, val change: Change?, val months: List<Month>)

    /** direction is up, down or same. */
    @Serializable
    data class Change(val direction: String, val label: String, val note: String?)

    @Serializable
    data class Month(val month: String, val amount: Double)

    @Serializable
    data class Payment(val title: String, val amount: Double, val date: String, @SerialName("when") val time: String)

    @Serializable
    data class Extras(
        val label: String,
        val amount: Double,
        val over: Boolean,
        val note: String,
        val limit: Double,
        val spent: Double,
        val planned: Double,
        val forecast: Forecast? = null,
    )

    /** Where the month's extras are headed: state is plenty, calm, tight or short; path goes from the first day to the end. */
    @Serializable
    data class Forecast(
        val state: String,
        val label: String,
        val action: String,
        val title: String,
        val lead: String,
        val brief: String,
        val figure: String,
        val left: Left,
        val path: List<Point>,
    ) {
        @Serializable
        data class Left(val amount: Double, val over: Boolean, val note: String)

        /** share is where in the month, 0 to 1; week marks the end of a week, drawn as a dot. */
        @Serializable
        data class Point(val share: Double, val amount: Double, val week: Boolean)
    }
}
