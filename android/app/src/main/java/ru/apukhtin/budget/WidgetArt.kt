package ru.apukhtin.budget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BlurMaskFilter
import android.graphics.Canvas
import android.graphics.DashPathEffect
import android.graphics.LinearGradient
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.SweepGradient
import android.graphics.Typeface
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.graphics.vector.VectorGroup
import androidx.compose.ui.graphics.vector.VectorPath
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

// What the widgets draw that a widget's layout cannot: the light of the week's card, the ring of the expenses to sort,
// the months' bars, the line of the extras with the little ghost, and icons on tiles (ios/BudgetWidget). Everything is
// drawn on bitmaps at twice the dp, enough for a widget and light on memory.

/**
 * The colours of the widgets, always the light ones: a widget is drawn ahead into pictures, and Android does not redraw it
 * when the phone turns dark, so a dark one would stay half dark. Faded, the figures are as pale as the words under them.
 */
@Suppress("UNUSED_PARAMETER")
class WidgetTones(context: Context, faded: Boolean = false) {
    val dark = false
    private fun tone(light: Long, dark: Long) = (0xFF000000 or if (this.dark) dark else light).toInt()

    val surface = tone(0xFFFFFF, 0x1C1B21)
    val muted = tone(0x8B8A93, 0x908F99)
    val ink = if (faded) muted else tone(0x111114, 0xF4F3F8)
    val track = tone(0xEDECEF, 0x22212A)
    val accent = tone(0x6B4EF6, 0x8F7CFF)
    val tint = tone(0xEEEAFE, 0x2B2650)
    val soft = tone(0xC9BEFA, 0x5546A6)
    val lensTop = tone(0xF5F2FE, 0x3A3170)
    val red = Palette.color("red").toArgb()
    val green = Palette.color("green").toArgb()
}

/** How a state of the extras looks: violet while there is enough, amber when it is tight, red when short. */
class OutlookTone(val state: String, private val tones: WidgetTones) {
    private fun tone(light: Long, dark: Long) = (0xFF000000 or if (tones.dark) dark else light).toInt()

    val tight get() = state == "tight"
    val short get() = state == "short"
    val amber = tone(0xF5A000, 0xFFB429)
    val alarm = tone(0xF0365C, 0xFF5C77)

    /** The figure, the end of the line and the strokes of the bursts. */
    val accent get() = if (tight) amber else if (short) alarm else tones.accent

    /** The line of what is set aside: violet but when short. */
    val line get() = if (short) alarm else tones.accent
    val halo get() = if (tight) tone(0xFFF1D2, 0x3B2D10) else if (short) tone(0xFFE2E8, 0x3F1620) else tone(0xF1EDFF, 0x2B2650)
    val wash get() = if (short) tone(0xFCEDF2, 0x2A1820) else tone(0xF0ECFD, 0x211E36)
    val lead get() = tone(0x7D7997, 0xA5A1BD)
}

object WidgetArt {
    /** Pixels for a dp on the bitmaps. */
    const val SCALE = 2f

    private fun bitmap(widthDp: Float, heightDp: Float) =
        Bitmap.createBitmap(max(1, (widthDp * SCALE).toInt()), max(1, (heightDp * SCALE).toInt()), Bitmap.Config.ARGB_8888)

    private fun paint(color: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }

    private fun alpha(color: Int, alpha: Float) = (color and 0x00FFFFFF) or ((alpha.coerceIn(0f, 1f) * 255).toInt() shl 24)

    /** White, as the app's cards; the week's has the soft lilac light of the reference in its corner. */
    fun card(widthDp: Float, heightDp: Float, tones: WidgetTones, glow: Boolean): Bitmap = bitmap(widthDp, heightDp).also { image ->
        val canvas = Canvas(image)
        val w = image.width.toFloat()
        val h = image.height.toFloat()
        canvas.drawRoundRect(RectF(0f, 0f, w, h), 24 * SCALE, 24 * SCALE, paint(tones.surface))
        if (glow) {
            canvas.save()
            canvas.clipPath(Path().apply { addRoundRect(RectF(0f, 0f, w, h), 24 * SCALE, 24 * SCALE, Path.Direction.CW) })
            canvas.rotate(-22f, w * 0.84f, h * 0.02f)
            val oval = RectF(w * 0.84f - w * 0.31f, h * 0.02f - h * 0.725f, w * 0.84f + w * 0.31f, h * 0.02f + h * 0.725f)
            canvas.drawOval(oval, Paint(Paint.ANTI_ALIAS_FLAG).apply {
                shader = LinearGradient(oval.left, oval.top, oval.right, oval.centerY(), alpha(tones.tint, 0.7f), alpha(tones.soft, 0.8f), Shader.TileMode.CLAMP)
                maskFilter = BlurMaskFilter(2.5f * SCALE, BlurMaskFilter.Blur.NORMAL)
            })
            canvas.drawOval(oval, paint(tones.lensTop).apply { style = Paint.Style.STROKE; strokeWidth = 2 * SCALE })
            canvas.restore()
        }
    }

    /** The card of the extras: white leaning to lilac, or to pink when short, and a glow under the line. */
    fun extrasCard(widthDp: Float, heightDp: Float, tone: OutlookTone, tones: WidgetTones): Bitmap = bitmap(widthDp, heightDp).also { image ->
        val canvas = Canvas(image)
        val w = image.width.toFloat()
        val h = image.height.toFloat()
        val round = RectF(0f, 0f, w, h)
        val clip = Path().apply { addRoundRect(round, 24 * SCALE, 24 * SCALE, Path.Direction.CW) }
        canvas.clipPath(clip)
        canvas.drawRect(round, paint(tones.surface))
        canvas.drawRect(round, Paint().apply { shader = LinearGradient(0f, 0f, w, h, alpha(tones.surface, 0f), tone.wash, Shader.TileMode.CLAMP) })
        canvas.drawRect(round, Paint().apply {
            shader = RadialGradient(w * 0.75f, h * 0.9f, 170 * SCALE, alpha(tone.line, 0.12f), alpha(tone.line, 0f), Shader.TileMode.CLAMP)
        })
    }

    /** A day's marker under its name: today on a violet disc with a white heart, a day with spending darker. */
    fun dayMarker(today: Boolean, spent: Boolean, sizeDp: Float, tones: WidgetTones): Bitmap = bitmap(sizeDp, sizeDp).also { image ->
        val canvas = Canvas(image)
        val c = image.width / 2f
        if (today) {
            canvas.drawCircle(c, c, c * 0.92f, paint(tones.accent))
            canvas.drawCircle(c, c, c * 0.26f, paint(0xFFFFFFFF.toInt()))
        } else {
            canvas.drawCircle(c, c, c * 0.26f, paint(if (spent) tones.muted else alpha(tones.muted, 0.35f)))
        }
    }

    /**
     * How many expenses wait for a category, in a ring that closes as the month's expenses get theirs; a tick when all
     * have one. Small, only the count inside.
     */
    fun ring(pending: WidgetData.Pending, sizeDp: Float, small: Boolean, tones: WidgetTones): Bitmap = bitmap(sizeDp, sizeDp).also { image ->
        val canvas = Canvas(image)
        val size = image.width.toFloat()
        val line = (if (small) 4f else 9f) * SCALE
        val box = RectF(line / 2, line / 2, size - line / 2, size - line / 2)
        canvas.drawOval(box, paint(alpha(tones.track, 0.7f)).apply { style = Paint.Style.STROKE; strokeWidth = line })
        val share = pending.sorted.coerceIn(0.03, 1.0).toFloat()
        canvas.save()
        canvas.rotate(-90f, size / 2, size / 2)
        canvas.drawArc(box, 0f, 360f * share, false, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = line
            strokeCap = Paint.Cap.ROUND
            shader = SweepGradient(size / 2, size / 2, intArrayOf(alpha(tones.accent, 0.85f), alpha(tones.soft, 0.5f)), floatArrayOf(0f, max(share, 0.01f)))
        })
        canvas.restore()
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply {
            textAlign = Paint.Align.CENTER
            typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        }
        if (pending.count == 0) {
            tick(canvas, size / 2, if (small) size / 2 else size * 0.45f, size * if (small) 0.3f else 0.18f, tones.accent)
        } else {
            text.color = tones.ink
            text.textSize = size * if (small) 0.4f else 0.28f
            canvas.drawText("${pending.count}", size / 2, if (small) size / 2 + text.textSize * 0.36f else size * 0.5f, text)
        }
        if (!small) {
            text.typeface = Typeface.DEFAULT
            text.color = tones.muted
            text.textSize = 12 * SCALE
            val words = pending.label.split(" ")
            val half = (words.size + 1) / 2
            listOf(words.take(half).joinToString(" "), words.drop(half).joinToString(" ")).filter { it.isNotEmpty() }.forEachIndexed { index, part ->
                canvas.drawText(part, size / 2, size * 0.64f + index * 14 * SCALE, text)
            }
        }
    }

    private fun tick(canvas: Canvas, x: Float, y: Float, size: Float, color: Int) {
        val path = Path().apply {
            moveTo(x - size * 0.45f, y)
            lineTo(x - size * 0.12f, y + size * 0.32f)
            lineTo(x + size * 0.5f, y - size * 0.35f)
        }
        canvas.drawPath(path, paint(color).apply { style = Paint.Style.STROKE; strokeWidth = size * 0.16f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND })
    }

    /** The months as bars from a line at zero, this month the deepest: up for a month that saved, down for one that did not. */
    fun bars(months: List<WidgetData.Month>, widthDp: Float, heightDp: Float, tones: WidgetTones): Bitmap = bitmap(widthDp, heightDp).also { image ->
        if (months.isEmpty()) return@also
        val canvas = Canvas(image)
        val w = image.width.toFloat()
        val h = image.height.toFloat()
        val top = max(months.maxOf { it.amount }, 0.0)
        val bottom = max(-months.minOf { it.amount }, 0.0)
        val span = max(top + bottom, 1.0)
        val zero = h * (top / span).toFloat()
        val slot = w / months.size
        val bar = 7 * SCALE
        months.forEachIndexed { index, month ->
            val length = max(4 * SCALE, ((h - 4 * SCALE) * abs(month.amount) / span).toFloat())
            val y = if (month.amount >= 0) max(zero - length, 0f) else min(zero, h - length)
            val last = index == months.lastIndex
            val color = when {
                month.amount < 0 -> alpha(tones.red, if (last) 0.8f else 0.3f)
                last -> tones.accent
                else -> alpha(tones.soft, 0.35f + 0.55f * (index + 1f) / months.size)
            }
            val x = slot * index + (slot - bar) / 2
            canvas.drawRoundRect(RectF(x, y, x + bar, y + length), bar / 2, bar / 2, paint(color))
        }
    }

    /** The months' extras as a bar on a track: what is spent deep, what the plan holds lighter, and what is free left bare. */
    fun extrasBar(extras: WidgetData.Extras, widthDp: Float, heightDp: Float, tones: WidgetTones): Bitmap = bitmap(widthDp, heightDp).also { image ->
        val canvas = Canvas(image)
        val w = image.width.toFloat()
        val h = image.height.toFloat()
        canvas.drawRoundRect(RectF(0f, 0f, w, h), h / 2, h / 2, paint(tones.track))
        val whole = maxOf(extras.limit, extras.spent + extras.planned, 1.0)
        var x = 0f
        if (extras.spent > 0.5) {
            val width = max(w * (extras.spent / whole).toFloat(), 6 * SCALE)
            canvas.drawRoundRect(RectF(0f, 0f, width, h), h / 2, h / 2, paint(tones.accent))
            x = width + 2 * SCALE
        }
        if (extras.planned > 0.5) {
            val width = max(w * (extras.planned / whole).toFloat(), 6 * SCALE)
            canvas.drawRoundRect(RectF(x, 0f, min(x + width, w), h), h / 2, h / 2, paint(tones.soft))
        }
    }

    /** An icon on a tile, as the reference's cards begin. */
    fun tile(icon: ImageVector, sizeDp: Float, tones: WidgetTones, ground: Int = tones.tint, color: Int = tones.accent): Bitmap = bitmap(sizeDp, sizeDp).also { image ->
        val canvas = Canvas(image)
        val size = image.width.toFloat()
        canvas.drawRoundRect(RectF(0f, 0f, size, size), size * 0.3f, size * 0.3f, paint(ground))
        drawIcon(canvas, icon, size * 0.275f, size * 0.275f, size * 0.45f, color)
    }

    /** An icon alone, such as the sync arrows or the wallet of the chip. */
    fun icon(icon: ImageVector, sizeDp: Float, color: Int): Bitmap = bitmap(sizeDp, sizeDp).also { image ->
        drawIcon(Canvas(image), icon, 0f, 0f, image.width.toFloat(), color)
    }

    /** Draws a Material icon's paths, scaled from its viewport into a square. */
    private fun drawIcon(canvas: Canvas, icon: ImageVector, x: Float, y: Float, size: Float, color: Int) {
        val matrix = Matrix().apply {
            setScale(size / icon.viewportWidth, size / icon.viewportHeight)
            postTranslate(x, y)
        }
        fun draw(group: VectorGroup) {
            group.forEach { node ->
                when (node) {
                    is VectorGroup -> draw(node)
                    is VectorPath -> {
                        val path = PathParser().addPathNodes(node.pathData).toPath().asAndroidPath()
                        path.transform(matrix)
                        canvas.drawPath(path, paint(color))
                    }
                }
            }
        }
        draw(icon.root)
    }

    /** The state on a round badge: a sparkle while there is enough, a warning otherwise. */
    fun badge(tone: OutlookTone, sizeDp: Float): Bitmap = bitmap(sizeDp, sizeDp).also { image ->
        val canvas = Canvas(image)
        val size = image.width.toFloat()
        val c = size / 2
        canvas.drawCircle(c, c, c * 0.92f, paint(tone.halo))
        if (tone.tight || tone.short) {
            val path = Path().apply {
                moveTo(c, size * 0.24f)
                lineTo(size * 0.76f, size * 0.72f)
                lineTo(size * 0.24f, size * 0.72f)
                close()
            }
            canvas.drawPath(path, paint(tone.accent).apply { strokeJoin = Paint.Join.ROUND; strokeWidth = size * 0.06f; style = Paint.Style.FILL_AND_STROKE })
            val mark = paint(0xFFFFFFFF.toInt()).apply { strokeWidth = size * 0.07f; strokeCap = Paint.Cap.ROUND }
            canvas.drawLine(c, size * 0.42f, c, size * 0.56f, mark)
            canvas.drawCircle(c, size * 0.64f, size * 0.035f, mark)
        } else {
            sparkle(canvas, c, c, size * 0.26f, tone.accent)
        }
    }

    private fun sparkle(canvas: Canvas, x: Float, y: Float, r: Float, color: Int) {
        val k = r * 0.22f
        val path = Path().apply {
            moveTo(x, y - r)
            quadTo(x + k, y - k, x + r, y)
            quadTo(x + k, y + k, x, y + r)
            quadTo(x - k, y + k, x - r, y)
            quadTo(x - k, y - k, x, y - r)
            close()
        }
        canvas.drawPath(path, paint(color))
    }

    /** Three short strokes flying off a corner, as the pictures draw joy or alarm. */
    private fun burst(canvas: Canvas, x: Float, y: Float, side: Float, color: Int) {
        val stroke = paint(alpha(color, 0.85f)).apply { strokeWidth = side * 0.15f; strokeCap = Paint.Cap.ROUND }
        for (degrees in listOf(-78.0, -42.0, -8.0)) {
            val angle = Math.toRadians(degrees)
            canvas.drawLine(
                x + (cos(angle) * side * 0.42).toFloat(), y + side + (sin(angle) * side * 0.42).toFloat(),
                x + (cos(angle) * side * 0.95).toFloat(), y + side + (sin(angle) * side * 0.95).toFloat(), stroke,
            )
        }
    }

    /** A burst alone, after the title of the forecast. */
    fun burst(sizeDp: Float, color: Int): Bitmap = bitmap(sizeDp, sizeDp).also { burst(Canvas(it), 0f, 0f, it.width.toFloat(), color) }

    /**
     * The art of the medium forecast: the ghost at the right below the sentence, and under it the line of what the month's
     * extras set aside, from its first day to its end.
     */
    fun forecast(forecast: WidgetData.Forecast, tone: OutlookTone, widthDp: Float, heightDp: Float): Bitmap = bitmap(widthDp, heightDp).also { image ->
        val canvas = Canvas(image)
        val w = image.width.toFloat()
        val h = image.height.toFloat()
        ghost(canvas, mood(tone.state), tone, w * (if (tone.short) 0.8f else 0.74f) - h * 0.25f, h * 0.52f - h * 0.3f, h * 0.5f, h * 0.6f)
        line(canvas, forecast.path, tone, RectF(w * 0.71f - w * 0.29f, h * 0.79f - h * 0.21f, w * 0.71f + w * 0.29f, h * 0.79f + h * 0.21f))
    }

    /** The ghost alone, as the small forecast has it at its top right. */
    fun ghost(tone: OutlookTone, widthDp: Float, heightDp: Float): Bitmap = bitmap(widthDp, heightDp).also { image ->
        ghost(Canvas(image), mood(tone.state), tone, 0f, 0f, image.width.toFloat(), image.height.toFloat())
    }

    private enum class Mood { Glad, Calm, Thoughtful, Worried }

    private fun mood(state: String) = when (state) {
        "plenty" -> Mood.Glad
        "tight" -> Mood.Thoughtful
        "short" -> Mood.Worried
        else -> Mood.Calm
    }

    /** What the month's extras set aside: a soft band under a smooth line, a dot at the end of every week, the end large. */
    private fun line(canvas: Canvas, points: List<WidgetData.Forecast.Point>, tone: OutlookTone, frame: RectF) {
        if (points.isEmpty()) return
        val low = points.minOf { it.amount }
        val high = points.maxOf { it.amount }
        val span = max(high - low, 1.0)
        val top = 13 * SCALE
        val bottom = frame.height() * 0.14f
        val right = 13 * SCALE
        val spots = points.map {
            Pair(frame.left + it.share.toFloat() * (frame.width() - right), frame.top + top + ((high - it.amount) / span).toFloat() * (frame.height() - top - bottom))
        }
        val curve = Path().apply {
            moveTo(spots[0].first, spots[0].second)
            for (index in 1 until spots.size) {
                val before = spots[max(index - 2, 0)]
                val from = spots[index - 1]
                val to = spots[index]
                val after = spots[min(index + 1, spots.lastIndex)]
                cubicTo(
                    from.first + (to.first - before.first) / 6, from.second + (to.second - before.second) / 6,
                    to.first - (after.first - from.first) / 6, to.second - (after.second - from.second) / 6,
                    to.first, to.second,
                )
            }
        }
        val band = Path(curve).apply {
            lineTo(spots.last().first, frame.bottom)
            lineTo(spots.first().first, frame.bottom)
            close()
        }
        canvas.drawPath(band, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = LinearGradient(0f, frame.top, 0f, frame.bottom, alpha(tone.line, 0.16f), alpha(tone.line, 0f), Shader.TileMode.CLAMP)
        })
        val dashes = paint(alpha(tone.line, 0.35f)).apply { strokeWidth = SCALE; pathEffect = DashPathEffect(floatArrayOf(2.5f * SCALE, 3 * SCALE), 0f) }
        spots.forEachIndexed { index, spot ->
            if (points[index].week) canvas.drawLine(spot.first, if (index == spots.lastIndex) frame.top else spot.second + 4 * SCALE, spot.first, frame.bottom, dashes)
        }
        canvas.drawPath(curve, paint(alpha(tone.line, 0.2f)).apply { style = Paint.Style.STROKE; strokeWidth = 7 * SCALE; maskFilter = BlurMaskFilter(3 * SCALE, BlurMaskFilter.Blur.NORMAL) })
        canvas.drawPath(curve, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            style = Paint.Style.STROKE
            strokeWidth = 2.2f * SCALE
            strokeCap = Paint.Cap.ROUND
            strokeJoin = Paint.Join.ROUND
            shader = LinearGradient(frame.left, 0f, frame.right, 0f, alpha(tone.line, 0.4f), tone.line, Shader.TileMode.CLAMP)
        })
        spots.forEachIndexed { index, spot ->
            if (points[index].week && index < spots.lastIndex) {
                canvas.drawCircle(spot.first, spot.second, 3.5f * SCALE + 1.5f * SCALE, paint(0xFFFFFFFF.toInt()))
                canvas.drawCircle(spot.first, spot.second, 3.5f * SCALE, paint(tone.line))
            }
        }
        val last = spots.last()
        canvas.drawCircle(last.first, last.second, 13 * SCALE, paint(alpha(tone.accent, 0.14f)))
        canvas.drawCircle(last.first, last.second, 7.5f * SCALE, paint(0xFFFFFFFF.toInt()))
        canvas.drawCircle(last.first, last.second, 5.5f * SCALE, paint(tone.accent))
    }

    /**
     * The little ghost of the pictures: a soft lilac body that fades out below, with arms and a face for its mood — glad
     * and waving, calm, thoughtful with a hand at its chin, worried with its hands on its cheeks — and a burst over it.
     */
    private fun ghost(canvas: Canvas, mood: Mood, tone: OutlookTone, x: Float, y: Float, w: Float, h: Float) {
        canvas.save()
        canvas.translate(x, y)
        val skin = { top: Float, bottom: Float -> LinearGradient(0f, top, 0f, bottom, intArrayOf(0xFFFBFAFF.toInt(), 0xFFE6DFFD.toInt(), 0xFFCBBEF7.toInt()), null, Shader.TileMode.CLAMP) }
        data class Arm(val x: Float, val y: Float, val width: Float, val height: Float, val degrees: Float, val front: Boolean = false)
        val arms = when (mood) {
            Mood.Glad -> listOf(Arm(0.09f, 0.78f, 0.17f, 0.3f, -38f), Arm(0.92f, 0.4f, 0.19f, 0.36f, 26f))
            Mood.Calm -> listOf(Arm(0.08f, 0.76f, 0.17f, 0.3f, -45f), Arm(0.94f, 0.62f, 0.17f, 0.32f, 48f))
            Mood.Thoughtful -> listOf(Arm(0.1f, 0.8f, 0.16f, 0.28f, -22f), Arm(0.63f, 0.76f, 0.2f, 0.16f, -18f, front = true))
            Mood.Worried -> listOf(Arm(0.21f, 0.58f, 0.17f, 0.24f, 18f, front = true), Arm(0.79f, 0.58f, 0.17f, 0.24f, -18f, front = true))
        }
        fun limb(arm: Arm) {
            canvas.save()
            canvas.rotate(arm.degrees, w * arm.x, w * arm.y)
            val oval = RectF(w * (arm.x - arm.width / 2), w * (arm.y - arm.height / 2), w * (arm.x + arm.width / 2), w * (arm.y + arm.height / 2))
            canvas.drawOval(oval, Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = skin(oval.top, oval.bottom) })
            canvas.restore()
        }
        arms.filterNot { it.front }.forEach(::limb)
        // The body: a round head, sides that widen a little down to a broad bottom, fading out below.
        val radius = w * 0.36f
        val cx = w * 0.5f
        val cy = w * 0.4f
        val k = radius * 0.5523f
        val body = Path().apply {
            moveTo(cx - radius, cy)
            cubicTo(cx - radius, cy - k, cx - k, cy - radius, cx, cy - radius)
            cubicTo(cx + k, cy - radius, cx + radius, cy - k, cx + radius, cy)
            cubicTo(cx + radius, cy + radius * 0.9f, w - w * 0.08f, h - h * 0.15f, w - w * 0.04f, h)
            lineTo(w * 0.04f, h)
            cubicTo(w * 0.08f, h - h * 0.15f, cx - radius, cy + radius * 0.9f, cx - radius, cy)
            close()
        }
        canvas.saveLayer(0f, 0f, w, h, null)
        canvas.drawPath(body, Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = skin(0f, h) })
        canvas.drawPath(body, Paint(Paint.ANTI_ALIAS_FLAG).apply {
            shader = RadialGradient(w * 0.36f, h * 0.16f, w * 0.42f, alpha(0xFFFFFFFF.toInt(), 0.95f), 0x00FFFFFF, Shader.TileMode.CLAMP)
        })
        canvas.drawRect(0f, 0f, w, h, Paint().apply {
            shader = LinearGradient(0f, 0f, 0f, h, intArrayOf(0xFF000000.toInt(), 0xFF000000.toInt(), 0x00000000), floatArrayOf(0f, 0.6f, 1f), Shader.TileMode.CLAMP)
            xfermode = android.graphics.PorterDuffXfermode(android.graphics.PorterDuff.Mode.DST_IN)
        })
        canvas.restore()
        // The face.
        val ink = 0xFF2D2766.toInt()
        val stroke = paint(ink).apply { style = Paint.Style.STROKE; strokeWidth = w * 0.036f; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
        fun eye(ex: Float, ey: Float) = canvas.drawOval(RectF(w * (ex - 0.035f), w * (ey - 0.045f), w * (ex + 0.035f), w * (ey + 0.045f)), paint(ink))
        when (mood) {
            Mood.Glad, Mood.Calm -> {
                for (cheek in listOf(0.29f, 0.71f)) canvas.drawOval(RectF(w * (cheek - 0.05f), w * 0.465f, w * (cheek + 0.05f), w * 0.535f), paint(alpha(0xFFF7A8C8.toInt(), 0.35f)))
                val face = Path()
                for (ex in listOf(0.37f, 0.63f)) {
                    face.moveTo(w * (ex - 0.06f), w * 0.42f)
                    face.quadTo(w * ex, w * 0.35f, w * (ex + 0.06f), w * 0.42f)
                }
                face.moveTo(w * 0.44f, w * 0.48f)
                face.quadTo(w * 0.5f, w * if (mood == Mood.Glad) 0.56f else 0.54f, w * 0.56f, w * 0.48f)
                canvas.drawPath(face, stroke)
            }
            Mood.Thoughtful -> {
                eye(0.4f, 0.4f)
                eye(0.61f, 0.38f)
                canvas.drawLine(w * 0.47f, w * 0.53f, w * 0.55f, w * 0.51f, stroke)
            }
            Mood.Worried -> {
                eye(0.41f, 0.43f)
                eye(0.6f, 0.43f)
                val face = Path().apply {
                    moveTo(w * 0.33f, w * 0.36f); lineTo(w * 0.44f, w * 0.32f)
                    moveTo(w * 0.57f, w * 0.32f); lineTo(w * 0.68f, w * 0.36f)
                    moveTo(w * 0.44f, w * 0.56f); quadTo(w * 0.5f, w * 0.5f, w * 0.57f, w * 0.56f)
                }
                canvas.drawPath(face, stroke)
            }
        }
        arms.filter { it.front }.forEach(::limb)
        burst(canvas, w * 0.9f - w * 0.15f, w * 0.04f - w * 0.15f, w * 0.3f, tone.accent)
        canvas.restore()
    }
}
