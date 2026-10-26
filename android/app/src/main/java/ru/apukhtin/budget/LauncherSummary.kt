package ru.apukhtin.budget

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.content.pm.PackageManager
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.MonthDay
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs

/**
 * The week, the expenses that wait for a category and the next regular payment, for the user's own launcher («Горизонт»)
 * to show on the home screen. It answers at once with what the widgets read last, so it works without the server; each
 * question also has the widgets read the server again (at most once a minute), and when that brings something new the
 * launcher hears it through [URI]. Only an app signed with the same key may ask: these are the family's money figures.
 *
 * One row: week (what is left of the week, or spent over it, with the currency), week_free (the same signed, below zero
 * when over), pending (how many expenses wait for a category) and pending_title («3 траты ждут разбора»), the payment's
 * payment_title, payment_amount, payment_when («завтра», «через 3 дня») and payment_days (from today, below zero when
 * late), and saved_at (when the server sent it, in milliseconds). No row before the app has signed in.
 */
class LauncherSummary : ContentProvider() {
    private val background = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onCreate() = true

    override fun query(uri: Uri, projection: Array<out String>?, selection: String?, selectionArgs: Array<out String>?, sortOrder: String?): Cursor {
        val context = requireNotNull(context)
        val caller = callingPackage
        if (caller == null || context.packageManager.checkSignatures(caller, context.packageName) != PackageManager.SIGNATURE_MATCH) {
            throw SecurityException("Only an app signed like Бюджет reads its summary")
        }
        background.launch { runCatching { WidgetLoader.entry(context) } }

        val cursor = MatrixCursor(COLUMNS)
        val (data, savedAt) = Session.of(context).saved<WidgetData>("widget") ?: return cursor
        val payment = data.payment
        cursor.addRow(
            arrayOf(
                Money.text(abs(data.week.free), data.symbol),
                data.week.free,
                data.pending.count,
                data.pending.title,
                payment?.title,
                payment?.let { Money.text(it.amount, data.symbol) },
                payment?.time,
                payment?.let { daysTo(it.date) },
                savedAt,
            ),
        )
        return cursor
    }

    /** «28 октября» as the server words the payment's day, counted from today in the nearer year. */
    private fun daysTo(day: String): Long? {
        val monthDay = runCatching { MonthDay.parse(day, DAY_MONTH) }.getOrNull() ?: return null
        val today = LocalDate.now()
        val date = listOf(-1L, 0L, 1L).map { monthDay.atYear(today.year).plusYears(it) }.minBy { abs(ChronoUnit.DAYS.between(today, it)) }
        return ChronoUnit.DAYS.between(today, date)
    }

    override fun getType(uri: Uri): String? = null

    override fun insert(uri: Uri, values: ContentValues?): Uri? = null

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?) = 0

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?) = 0

    companion object {
        val URI: Uri = Uri.parse("content://ru.apukhtin.budget.summary")

        private val COLUMNS = arrayOf(
            "week", "week_free", "pending", "pending_title",
            "payment_title", "payment_amount", "payment_when", "payment_days", "saved_at",
        )

        private val DAY_MONTH = DateTimeFormatter.ofPattern("d MMMM", Locale.forLanguageTag("ru"))

        /** The widgets read something new from the server: the launcher asks again. */
        fun changed(context: Context) {
            context.contentResolver.notifyChange(URI, null)
        }
    }
}
