package ru.apukhtin.budget

import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.CurrencyRuble
import androidx.compose.material.icons.outlined.NorthEast
import androidx.compose.material.icons.outlined.SouthEast
import androidx.compose.material.icons.outlined.Sync
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.ContentScale
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

// The widgets in the app's lilac look (ios/BudgetWidget): the week, with what is left of it and its days; today, with
// what was spent and the expenses that wait for a category in a ring; what this month saved, with the months before it;
// the next regular payment; and where this month's extras are headed, with the little ghost. They read /api/widget from
// the server the app signed in to, every half an hour (as often as Android lets a widget) and whenever the app changes
// something; without the server they show what they read last, paler. Android has no widgets on the lock screen.

/** What a widget shows: the data, or nothing before the app has signed in; stale when read earlier. */
data class WidgetEntry(val data: WidgetData?, val stale: Boolean)

/** Reads /api/widget for all the widgets, at most once a minute unless something changed, and keeps it for when the server is away. */
object WidgetLoader {
    @Volatile
    private var fetchedAt = 0L

    /** The widgets redraw together; the first reads the server, and the others take what it read. */
    private val reading = Mutex()

    suspend fun entry(context: Context, fresh: Boolean = false): WidgetEntry = reading.withLock {
        val session = Session.of(context)
        if (session.server == null) return@withLock WidgetEntry(null, false)
        val saved = session.saved<WidgetData>("widget")
        if (!fresh && saved != null && System.currentTimeMillis() - fetchedAt < 60_000) return@withLock WidgetEntry(saved.first, false)
        try {
            WidgetEntry(session.get<WidgetData>("widget"), false).also { fetchedAt = System.currentTimeMillis() }
        } catch (failure: Exception) {
            // Paler only when the server is away; what it sent last is still what it says.
            WidgetEntry(saved?.first, saved != null && failure is ApiError.Unreachable)
        }
    }

    /** Reads the server again and redraws every widget, as after a change in the app. */
    suspend fun refresh(context: Context) {
        entry(context, fresh = true)
        Widgets.all.forEach { it.updateAll(context) }
    }
}

object Widgets {
    val all: List<GlanceAppWidget> get() = listOf(WeekWidget(), TodayWidget(), SavingsWidget(), PaymentWidget(), ExtrasWidget())
}

/** «Обновлено 18:42» pressed: the server syncs with ZenMoney, and every widget reads it again. */
class SyncAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        Session.of(context).sync()
        WidgetLoader.refresh(context)
    }
}

/** A widget of the app: it loads the entry, then draws its face for its size on the card. */
abstract class BudgetWidget(private val link: String) : GlanceAppWidget() {
    override val sizeMode = SizeMode.Exact

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val entry = WidgetLoader.entry(context)
        provideContent { Card(entry, link) }
    }

    @Composable
    abstract fun Face(data: WidgetData, tones: WidgetTones, wide: Boolean)

    /** The card under the face, white, with the week's glow or the extras' light. */
    @Composable
    open fun background(data: WidgetData?, tones: WidgetTones, width: Float, height: Float): Bitmap = WidgetArt.card(width, height, tones, glow = false)

    @Composable
    private fun Card(entry: WidgetEntry, link: String) {
        val context = LocalContext.current
        val size = LocalSize.current
        // Read earlier, as the server could not be reached: the figures paler.
        val tones = WidgetTones(context, faded = entry.stale)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("budget://$link")).setClass(context, MainActivity::class.java)
        Box(
            GlanceModifier.fillMaxSize()
                .background(ImageProvider(background(entry.data, tones, size.width.value, size.height.value)), ContentScale.FillBounds)
                .clickable(actionStartActivity(intent))
                .padding(16.dp),
        ) {
            val data = entry.data
            if (data == null) {
                Column(GlanceModifier.fillMaxSize()) {
                    Image(bitmap(WidgetArt.tile(Icons.Outlined.CurrencyRuble, 34f, tones)), null, GlanceModifier.size(34.dp))
                    Spacer(GlanceModifier.defaultWeight())
                    Label("Войдите в приложении", 13.sp, tones.ink, bold = true)
                }
            } else {
                Box(GlanceModifier.fillMaxSize()) { Face(data, tones, size.width >= 250.dp) }
            }
        }
    }
}

private fun bitmap(image: Bitmap) = ImageProvider(image)

private fun color(argb: Int) = ColorProvider(Color(argb))

/** Words of a widget in its size and colour. */
@Composable
private fun Label(text: String, size: TextUnit, color: Int, bold: Boolean = false, lines: Int = 1, modifier: GlanceModifier = GlanceModifier) {
    Text(text, modifier, TextStyle(color = color(color), fontSize = size, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal), maxLines = lines)
}

/** A figure in the heavy face; red below zero or when asked. */
@Composable
private fun Amount(amount: Double, symbol: String, size: TextUnit, tones: WidgetTones, red: Boolean = false) {
    Label(Money.text(amount, symbol), size, if (amount < -0.5 || red) tones.red else tones.ink, bold = true)
}

class WeekWidget : BudgetWidget("week") {
    @Composable
    override fun background(data: WidgetData?, tones: WidgetTones, width: Float, height: Float) = WidgetArt.card(width, height, tones, glow = true)

    /** «Неделя», what is free large, and the days of the week with today on a violet disc. */
    @Composable
    override fun Face(data: WidgetData, tones: WidgetTones, wide: Boolean) {
        Column(GlanceModifier.fillMaxSize()) {
            Label(data.week.label, 14.sp, tones.ink, bold = true)
            Amount(data.week.free, data.symbol, if (wide) 34.sp else 26.sp, tones)
            Label(data.week.note, if (wide) 14.sp else 12.sp, tones.muted, lines = 2)
            Spacer(GlanceModifier.defaultWeight())
            Row(GlanceModifier.fillMaxWidth()) {
                data.week.days.forEach { day ->
                    Column(GlanceModifier.defaultWeight(), horizontalAlignment = Alignment.CenterHorizontally) {
                        Label(day.label, if (wide) 12.sp else 10.sp, if (day.today) tones.ink else tones.muted, bold = day.today)
                        val marker = if (wide) 24f else 16f
                        Image(bitmap(WidgetArt.dayMarker(day.today, day.spent, marker, tones)), null, GlanceModifier.size(marker.dp))
                    }
                }
            }
        }
    }
}

class TodayWidget : BudgetWidget("week") {
    /** «Сегодня потрачено» with when the data came from ZenMoney, and the ring of the expenses that wait for a category. */
    @Composable
    override fun Face(data: WidgetData, tones: WidgetTones, wide: Boolean) {
        val context = LocalContext.current
        val sort = Intent(Intent.ACTION_VIEW, Uri.parse("budget://sort")).setClass(context, MainActivity::class.java)
        if (wide) {
            Row(GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                Column(GlanceModifier.defaultWeight().fillMaxHeight()) {
                    Label(data.today.label, 14.sp, tones.ink, bold = true)
                    Amount(data.today.amount, data.symbol, 30.sp, tones)
                    Spacer(GlanceModifier.defaultWeight())
                    Synced(data, tones)
                }
                Image(bitmap(WidgetArt.ring(data.pending, 116f, small = false, tones)), null, GlanceModifier.size(116.dp).clickable(actionStartActivity(sort)))
            }
        } else {
            Column(GlanceModifier.fillMaxSize()) {
                Label(data.today.label, 13.sp, tones.ink, bold = true)
                Amount(data.today.amount, data.symbol, 24.sp, tones)
                Spacer(GlanceModifier.defaultWeight())
                Row(verticalAlignment = Alignment.CenterVertically, modifier = GlanceModifier.clickable(actionStartActivity(sort))) {
                    Image(bitmap(WidgetArt.ring(data.pending, 42f, small = true, tones)), null, GlanceModifier.size(42.dp))
                    Spacer(GlanceModifier.width(8.dp))
                    Label(data.pending.label, 12.sp, tones.muted, lines = 2)
                }
            }
        }
    }

    /** «Обновлено 18:42»: when the server last fetched from ZenMoney; pressed, it fetches again. */
    @Composable
    private fun Synced(data: WidgetData, tones: WidgetTones) {
        val synced = Dates.instant(data.today.syncedAt) ?: return
        Row(GlanceModifier.clickable(actionRunCallback<SyncAction>()), verticalAlignment = Alignment.CenterVertically) {
            Image(bitmap(WidgetArt.icon(Icons.Outlined.Sync, 14f, tones.muted)), null, GlanceModifier.size(14.dp))
            Spacer(GlanceModifier.width(6.dp))
            Label("Обновлено ${Dates.moment(synced)}", 13.sp, tones.muted)
        }
    }
}

class SavingsWidget : BudgetWidget("operations") {
    /** «Накопления в этом месяце»: income above spending, against the month before, and the months before it as bars. */
    @Composable
    override fun Face(data: WidgetData, tones: WidgetTones, wide: Boolean) {
        val savings = data.savings
        Column(GlanceModifier.fillMaxSize()) {
            Label(savings.label, 13.sp, tones.ink, bold = true)
            Label(savings.period, 13.sp, tones.muted)
            Amount(savings.amount, data.symbol, 22.sp, tones)
            savings.change?.let { change ->
                val tone = when (change.direction) {
                    "up" -> tones.green
                    "down" -> tones.red
                    else -> tones.muted
                }
                Row(verticalAlignment = Alignment.Top) {
                    Image(bitmap(WidgetArt.icon(if (change.direction == "down") Icons.Outlined.SouthEast else Icons.Outlined.NorthEast, 12f, tone)), null, GlanceModifier.size(12.dp))
                    Spacer(GlanceModifier.width(4.dp))
                    Column {
                        Label(change.label, 11.sp, tones.ink)
                        change.note?.let { Label(it, 10.sp, tones.muted) }
                    }
                }
            }
            Spacer(GlanceModifier.defaultWeight())
            val width = LocalSize.current.width.value - 32
            Image(bitmap(WidgetArt.bars(savings.months, width, 36f, tones)), null, GlanceModifier.fillMaxWidth().height(36.dp), contentScale = ContentScale.FillBounds)
        }
    }
}

class PaymentWidget : BudgetWidget("regular") {
    /** The next regular payment: what it is, how much and when. */
    @Composable
    override fun Face(data: WidgetData, tones: WidgetTones, wide: Boolean) {
        Column(GlanceModifier.fillMaxSize()) {
            Image(bitmap(WidgetArt.tile(Icons.Outlined.CalendarToday, 38f, tones)), null, GlanceModifier.size(38.dp))
            Spacer(GlanceModifier.defaultWeight())
            val payment = data.payment
            if (payment != null) {
                Label(payment.title, 14.sp, tones.ink, bold = true, lines = 2)
                Amount(payment.amount, data.symbol, 22.sp, tones)
                Label("${payment.date}, ${payment.time}", 12.sp, tones.muted)
            } else {
                Label("—", 20.sp, tones.muted, bold = true)
            }
        }
    }
}

class ExtrasWidget : BudgetWidget("extras") {
    @Composable
    override fun background(data: WidgetData?, tones: WidgetTones, width: Float, height: Float): Bitmap {
        val forecast = data?.extras?.forecast ?: return WidgetArt.card(width, height, tones, glow = false)
        return WidgetArt.extrasCard(width, height, OutlookTone(forecast.state, tones), tones)
    }

    /**
     * The financial helper after the user's pictures: the badge, «Финансовый помощник» and «Прогноз ›», the title large,
     * its sentence with the figure, the wallet chip, and the ghost on the line of what the month set aside.
     */
    @Composable
    override fun Face(data: WidgetData, tones: WidgetTones, wide: Boolean) {
        val extras = data.extras
        val forecast = extras?.forecast
        when {
            forecast != null && wide -> Forecast(forecast, data.symbol, tones)
            forecast != null -> SmallForecast(forecast, data.symbol, tones)
            extras != null -> Plain(extras, data.symbol, tones, wide)
            else -> Column(GlanceModifier.fillMaxSize()) {
                Image(bitmap(WidgetArt.tile(Icons.Outlined.AccountBalanceWallet, 34f, tones)), null, GlanceModifier.size(34.dp))
                Spacer(GlanceModifier.defaultWeight())
                Label("—", 20.sp, tones.muted, bold = true)
            }
        }
    }

    @Composable
    private fun Forecast(forecast: WidgetData.Forecast, symbol: String, tones: WidgetTones) {
        val tone = OutlookTone(forecast.state, tones)
        val size = LocalSize.current
        Box(GlanceModifier.fillMaxSize()) {
            // The art spans the card, past its padding, so the ghost and the line stand where the pictures put them.
            Image(
                bitmap(WidgetArt.forecast(forecast, tone, size.width.value - 32, size.height.value - 32)), null,
                GlanceModifier.fillMaxSize(), contentScale = ContentScale.FillBounds,
            )
            Column(GlanceModifier.fillMaxSize()) {
                Row(GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Image(bitmap(WidgetArt.badge(tone, 24f)), null, GlanceModifier.size(24.dp))
                    Spacer(GlanceModifier.width(8.dp))
                    Label(forecast.label, 12.sp, tone.lead, modifier = GlanceModifier.defaultWeight())
                    Row(
                        GlanceModifier.background(color(tones.tint)).padding(horizontal = 10.dp, vertical = 4.dp).cornerRadius(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Label(forecast.action, 12.sp, tones.ink, bold = true)
                        Image(bitmap(WidgetArt.icon(Icons.Outlined.ChevronRight, 12f, tones.ink)), null, GlanceModifier.size(12.dp))
                    }
                }
                Row(verticalAlignment = Alignment.Top) {
                    Label(forecast.title, 24.sp, tones.ink, bold = true)
                    Image(bitmap(WidgetArt.burst(14f, tone.accent)), null, GlanceModifier.size(14.dp))
                }
                Column(GlanceModifier.width((size.width.value * 0.6f).dp)) {
                    Label(forecast.lead, 12.sp, tone.lead, lines = 3)
                    Label(forecast.figure, 13.sp, tone.accent, bold = true)
                }
                Spacer(GlanceModifier.defaultWeight())
                Wallet(forecast.left, symbol, tones, tone)
            }
        }
    }

    @Composable
    private fun SmallForecast(forecast: WidgetData.Forecast, symbol: String, tones: WidgetTones) {
        val tone = OutlookTone(forecast.state, tones)
        Box(GlanceModifier.fillMaxSize(), contentAlignment = Alignment.TopEnd) {
            Image(bitmap(WidgetArt.ghost(tone, 52f, 60f)), null, GlanceModifier.width(52.dp).height(60.dp))
            Column(GlanceModifier.fillMaxSize()) {
                Image(bitmap(WidgetArt.badge(tone, 26f)), null, GlanceModifier.size(26.dp))
                Spacer(GlanceModifier.defaultWeight())
                Label(forecast.title, 19.sp, tones.ink, bold = true, lines = 2)
                Row {
                    Label("${forecast.brief} ", 12.sp, tone.lead)
                    Label(forecast.figure, 12.sp, tone.accent, bold = true)
                }
                Spacer(GlanceModifier.height(6.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Image(bitmap(WidgetArt.icon(Icons.Outlined.AccountBalanceWallet, 12f, 0xFF9B8BE6.toInt())), null, GlanceModifier.size(12.dp))
                    Spacer(GlanceModifier.width(4.dp))
                    Label(Money.text(forecast.left.amount, symbol), 12.sp, if (forecast.left.over) tone.alarm else tones.ink, bold = true)
                }
            }
        }
    }

    /** What is left of the extras now on a chip with the wallet: «82 384 ₽ осталось», red when spent past them. */
    @Composable
    private fun Wallet(left: WidgetData.Forecast.Left, symbol: String, tones: WidgetTones, tone: OutlookTone) {
        Row(GlanceModifier.background(color(tones.tint)).cornerRadius(12.dp).padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            Image(bitmap(WidgetArt.icon(Icons.Outlined.AccountBalanceWallet, 16f, 0xFF9B8BE6.toInt())), null, GlanceModifier.size(16.dp))
            Spacer(GlanceModifier.width(8.dp))
            Column {
                Label(Money.text(left.amount, symbol), 14.sp, if (left.over) tone.alarm else tones.ink, bold = true)
                Label(left.note, 10.sp, tone.lead)
            }
        }
    }

    /** «Доп. бюджет» as the main page's card tells it, for a server from before the forecast. */
    @Composable
    private fun Plain(extras: WidgetData.Extras, symbol: String, tones: WidgetTones, wide: Boolean) {
        Column(GlanceModifier.fillMaxSize()) {
            Image(bitmap(WidgetArt.tile(Icons.Outlined.AccountBalanceWallet, 34f, tones)), null, GlanceModifier.size(34.dp))
            Spacer(GlanceModifier.defaultWeight())
            Label(extras.label, 13.sp, tones.ink, bold = true)
            Amount(extras.amount, symbol, if (wide) 30.sp else 24.sp, tones, red = extras.over)
            Label(extras.note, 12.sp, tones.muted)
            Spacer(GlanceModifier.height(6.dp))
            val width = LocalSize.current.width.value - 32
            Image(bitmap(WidgetArt.extrasBar(extras, width, 6f, tones)), null, GlanceModifier.fillMaxWidth().height(6.dp), contentScale = ContentScale.FillBounds)
        }
    }
}

class WeekWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = WeekWidget()
}

class TodayWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = TodayWidget()
}

class SavingsWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = SavingsWidget()
}

class PaymentWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = PaymentWidget()
}

class ExtrasWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = ExtrasWidget()
}
