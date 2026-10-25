package ru.apukhtin.budget

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.unit.Dp
import kotlin.math.PI
import kotlin.math.sin

// The wave on the main page's circle (ios/Budget/HomeWave.swift): a lilac lens on the left half of a white disc, with
// water in it that shows how full the week is.

/** How the wave on the circle stands, after what the server says of the week: its colour and how high it rises. */
data class WaveLevel(val state: String, val share: Double) {
    constructor(free: WeekHome.Free) : this(free.state ?: "empty", free.share ?: 0.0)

    /**
     * From the bottom of the lens, as a share of its height. A little left, or a little past the amount, still shows as
     * a bowl at the bottom; a full week stays low enough for what is free to fit above it.
     */
    val height: Float
        get() = when (state) {
            "empty" -> 0f
            "over" -> (0.14 + 0.28 * share).toFloat()
            else -> (0.12 + 0.32 * share).toFloat()
        }

    @Composable
    fun color(): Color = when (state) {
        "over" -> Lilac.waveOver
        "low" -> Lilac.waveLow
        else -> Lilac.wave
    }
}

/** The wave's height over its middle, as a share of the circle. */
const val WAVE_AMPLITUDE = 0.02f

/** The lens as a rounded rectangle on the left half of a circle of diameter d, and the circle that cuts it. */
private fun lens(d: Float) = Pair(Offset(-0.08f * d, 0.08f * d), Size(0.58f * d, 0.84f * d))

/**
 * Draws the lens with water up to `height` (a share of the lens) and a slow sine on top, cut by the circle inset by
 * `inset` of its diameter.
 */
fun DrawScope.drawLens(lensTop: Color, tint: Color, water: Color, height: Float, amplitude: Float, phase: Float, inset: Float, sheen: Boolean) {
    val d = size.minDimension
    val (origin, lensSize) = lens(d)
    val circle = Path().apply { addOval(androidx.compose.ui.geometry.Rect(Offset(d * inset, d * inset), Size(d * (1 - 2 * inset), d * (1 - 2 * inset)))) }
    val shape = Path().apply {
        addRoundRect(androidx.compose.ui.geometry.RoundRect(androidx.compose.ui.geometry.Rect(origin, lensSize), CornerRadius(d * 0.27f)))
    }
    clipPath(circle) {
        clipPath(shape) {
            drawRect(Brush.verticalGradient(listOf(lensTop, tint), startY = origin.y, endY = origin.y + lensSize.height), origin, lensSize)
            if (sheen) {
                val center = Offset(origin.x + lensSize.width * 0.4f, origin.y + lensSize.height * 0.35f)
                drawRect(Brush.radialGradient(listOf(Color.White.copy(alpha = 0.35f), Color.Transparent), center, d * 0.3f), origin, lensSize)
            }
            if (height > 0.001f) drawPath(wave(origin, lensSize, height, amplitude, phase), water)
        }
    }
}

/** Water up to a level with a slow sine on top, a little longer than the lens is wide. */
private fun wave(origin: Offset, size: Size, level: Float, amplitude: Float, phase: Float) = Path().apply {
    val bottom = origin.y + size.height
    val top = bottom - size.height * level
    val length = size.width * 1.15f
    val y = { x: Float -> top + amplitude * sin((x - origin.x) / length * 2 * PI.toFloat() + phase) }
    moveTo(origin.x, bottom)
    var x = origin.x
    while (x < origin.x + size.width) {
        lineTo(x, y(x))
        x += 3f
    }
    lineTo(origin.x + size.width, y(origin.x + size.width))
    lineTo(origin.x + size.width, bottom)
    close()
}

/** The lilac lens of the circle with the wave drifting slowly sideways, one sway in seven seconds. */
@Composable
fun WaveLens(level: WaveLevel, height: Float, d: Dp) {
    val phase by rememberInfiniteTransition(label = "wave").animateFloat(
        0f, 2 * PI.toFloat(), infiniteRepeatable(tween(7000, easing = LinearEasing)), label = "phase",
    )
    val lensTop = Lilac.lensTop
    val tint = Lilac.tint
    val water = level.color()
    Canvas(Modifier.size(d)) {
        val px = size.minDimension
        drawLens(lensTop, tint, water, height, px * WAVE_AMPLITUDE * (height / 0.1f).coerceAtMost(1f), phase, 0.018f, sheen = true)
    }
}

/** The disc of the circle: white, a little warmer at the bottom right. */
fun DrawScope.drawDisc(surface: Color, canvas: Color) {
    drawCircle(Brush.linearGradient(listOf(surface, canvas), Offset.Zero, Offset(size.width, size.height)))
}

/**
 * The main page's circle small, as the middle of the tab bar shows it: the white disc with its lilac lens and a violet
 * wave standing still.
 */
@Composable
fun Mascot(d: Dp, modifier: Modifier = Modifier) {
    val surface = Lilac.surface
    val canvas = Lilac.canvas
    val lensTop = Lilac.lensTop
    val tint = Lilac.tint
    val wave = Lilac.wave
    Canvas(modifier.size(d)) {
        drawDisc(surface, canvas)
        drawLens(lensTop, tint, wave, 0.36f, size.minDimension * 0.03f, 1.2f, 0.04f, sheen = false)
    }
}
