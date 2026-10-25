package ru.apukhtin.budget

import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

// Money, dates and words as the iPhone app writes them (ios/Shared/Format.swift, Dates.swift, Theme.swift).

/** Money as the web UI writes it: 12 340 ₽, a real minus, no kopecks unless asked. */
object Money {
    private fun format(cents: Boolean) = DecimalFormat(if (cents) "#,##0.00" else "#,##0", DecimalFormatSymbols(Locale.ROOT).apply {
        groupingSeparator = ' '
        decimalSeparator = ','
    })

    private val whole = format(cents = false)
    private val cents = format(cents = true)

    /** An amount to the kopeck, as an expense's sheet shows it: 1 500,00 ₽. */
    fun exact(amount: Double, symbol: String) = "${if (amount < 0) "−" else ""}${cents.format(abs(amount))} $symbol"

    fun number(amount: Double, sign: Boolean = false): String {
        val rounded = amount.roundToLong()
        val text = whole.format(abs(rounded))
        return when {
            rounded == 0L -> text
            rounded < 0 -> "−$text"
            sign -> "+$text"
            else -> text
        }
    }

    fun text(amount: Double, symbol: String, sign: Boolean = false) = "${number(amount, sign)} $symbol"

    /** An amount as it is being typed, its thousands apart: 7000 becomes 7 000, 1500,5 becomes 1 500,5. */
    fun typing(text: String): String {
        val kept = text.replace('.', ',').filter { it.isDigit() || it == ',' }
        val parts = kept.split(',', limit = 2)
        val grouped = parts[0].reversed().chunked(3).joinToString(" ").reversed()
        return if (parts.size > 1) "$grouped,${parts[1].filter(Char::isDigit).take(2)}" else grouped
    }

    /** An amount as the user would type it into a form: 1500 or 1500,5. */
    fun input(amount: Double) = if (amount == Math.rint(amount)) amount.toLong().toString() else amount.toString().replace('.', ',')
}

/** Dates as the server sends them: 2026-10-05. */
object Dates {
    val months = listOf("Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек")
    val weekdaysShort = listOf("Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс")
    private val russian = Locale.forLanguageTag("ru")

    fun date(text: String): LocalDate? = runCatching { LocalDate.parse(text) }.getOrNull()

    /** The short name of a date's day of the week, as the week strip heads its days: Пн for Monday. */
    fun weekdayShort(text: String) = date(text)?.let { weekdaysShort[it.dayOfWeek.value - 1] }.orEmpty()

    /** The date `days` after a date. */
    fun adding(days: Int, text: String) = date(text)?.plusDays(days.toLong())?.toString() ?: text

    /** The day of the month and its month in three letters, as a day's name for the screen reader says them. */
    fun spoken(text: String) = date(text)?.let { "${it.dayOfMonth} ${months[it.monthValue - 1]}" } ?: text

    /** A moment as the time alone today, with the day otherwise: 14:05, 6 окт., 14:05. */
    fun moment(millis: Long): String {
        val time = Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault())
        val today = time.toLocalDate() == LocalDate.now()
        return time.format(DateTimeFormatter.ofPattern(if (today) "HH:mm" else "d MMM, HH:mm", russian))
    }

    /** An ISO moment from the server, such as when it last synced, in milliseconds. */
    fun instant(text: String?): Long? = text?.let { runCatching { Instant.parse(it).toEpochMilli() }.getOrNull() }
}

/** Russian words that change with a number. */
object Words {
    /** Picks the form for 1, for 2–4 and for 5 and more: операция, операции, операций. */
    fun plural(n: Int, one: String, few: String, many: String): String {
        val tens = abs(n) % 100
        val units = tens % 10
        return when {
            tens in 11..19 -> many
            units == 1 -> one
            units in 2..4 -> few
            else -> many
        }
    }
}
