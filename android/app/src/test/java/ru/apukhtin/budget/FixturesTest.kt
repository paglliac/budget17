package ru.apukhtin.budget

import java.io.File
import kotlinx.serialization.KSerializer
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.serializer
import org.junit.Assert.assertTrue
import org.junit.Assume.assumeTrue
import org.junit.Test

/**
 * Reads the screens the server's API produced from demo data (ios/fixtures.ts) with the app's models, so a change of the
 * JSON the app could not read fails make android-check, as ios/FixtureCheck does for the iPhone.
 */
class FixturesTest {
    private val folder = System.getProperty("fixtures").orEmpty()

    private val screens: List<Pair<String, KSerializer<*>>> = listOf(
        "session" to serializer<SessionInfo>(),
        "week" to serializer<WeekScreen>(),
        "week-past" to serializer<WeekScreen>(),
        "week-ahead" to serializer<WeekScreen>(),
        "week-why" to serializer<WeekWhyScreen>(),
        "week-why-ahead" to serializer<WeekWhyScreen>(),
        "month" to serializer<MonthScreen>(),
        "month-without-incomes" to serializer<MonthScreen>(),
        "extras" to serializer<ExtrasScreen>(),
        "extras-ahead" to serializer<ExtrasScreen>(),
        "spending" to serializer<SpendingScreen>(),
        "spending-income" to serializer<SpendingScreen>(),
        "operations" to serializer<OperationsScreen>(),
        "operations-income" to serializer<OperationsScreen>(),
        "operations-optional" to serializer<OperationsScreen>(),
        "operations-categories" to serializer<OperationsScreen>(),
        "uncategorized" to serializer<UncategorizedScreen>(),
        "regular" to serializer<RegularScreen>(),
        "income" to serializer<IncomeScreen>(),
        "categories" to serializer<CategoriesScreen>(),
        "shops" to serializer<ShopsScreen>(),
        "budget-settings" to serializer<BudgetSettingsScreen>(),
        "wish" to serializer<WishScreen>(),
        "card" to serializer<WishScreen>(),
        "wish-picking" to serializer<WishScreen>(),
        "wishes" to serializer<WishesScreen>(),
        "widget" to serializer<WidgetData>(),
    )

    @Test
    fun modelsReadEveryScreen() {
        assumeTrue("Нет папки с экранами API: запустите android/check.sh", folder.isNotEmpty())
        val failed = screens.mapNotNull { (name, serializer) ->
            runCatching { ApiJson.decodeFromString(serializer, File(folder, "$name.json").readText()) }
                .exceptionOrNull()?.let { "$name: ${it.message}" }
        }
        assertTrue("Модели приложения не читают экраны API:\n${failed.joinToString("\n")}", failed.isEmpty())
    }

    @Test
    fun rowsKeepTheirOwnFields() {
        assumeTrue(folder.isNotEmpty())
        val week = ApiJson.decodeFromString<WeekScreen>(File(folder, "week.json").readText())
        val expense = week.days.flatMap { it.items }.first()
        assertTrue("У траты недели нет названия", expense.row.title.isNotEmpty())
        assertTrue("У траты недели нет id ZenMoney", expense.spending.isNotEmpty())
    }
}
