package ru.apukhtin.budget

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color

// The colours of the new style, after the reference the user picked on 2026-10-09 (ios/Shared/Lilac.swift), each in
// light and dark.

@Composable
@ReadOnlyComposable
private fun tone(light: Long, dark: Long) = Color(0xFF000000 or if (isSystemInDarkTheme()) dark else light)

object Lilac {
    val canvas @Composable @ReadOnlyComposable get() = tone(0xF7F6F3, 0x0E0E11)
    val surface @Composable @ReadOnlyComposable get() = tone(0xFFFFFF, 0x1C1B21)

    /** The text's own colour, as iOS's primary. */
    val ink @Composable @ReadOnlyComposable get() = tone(0x111114, 0xF4F3F8)
    val muted @Composable @ReadOnlyComposable get() = tone(0x8B8A93, 0x908F99)
    val hairline @Composable @ReadOnlyComposable get() = tone(0xE8E6EB, 0x2A2930)

    /** The track of a switch or a bar. */
    val track @Composable @ReadOnlyComposable get() = tone(0xEDECEF, 0x22212A)

    /** What is picked or today, and what is required. */
    val accent @Composable @ReadOnlyComposable get() = tone(0x6B4EF6, 0x8F7CFF)

    /** The ground of a picked tab, a halo or a chip. */
    val tint @Composable @ReadOnlyComposable get() = tone(0xEEEAFE, 0x2B2650)

    /** What is flexible: the lighter part of a bar. */
    val soft @Composable @ReadOnlyComposable get() = tone(0xC9BEFA, 0x5546A6)

    /** The top of the lens on the circle, which deepens into the tint below. */
    val lensTop @Composable @ReadOnlyComposable get() = tone(0xF5F2FE, 0x3A3170)
    val red = Palette.color("red")

    /** The wave on the circle: violet while the week has enough, pale when little is left, red past its amount. */
    val wave @Composable @ReadOnlyComposable get() = tone(0x8B62F6, 0x7A62F0)
    val waveLow @Composable @ReadOnlyComposable get() = tone(0xD7C5FB, 0x4B3E95)
    val waveOver @Composable @ReadOnlyComposable get() = tone(0xFF5D5A, 0xE5484D)
}

/** The web UI's tones (src/web/styles.css); categories may bring a colour of their own as #rrggbb. */
object Palette {
    private val tones = mapOf(
        "yellow" to 0xF2BE45, "violet" to 0x8C6CEF, "teal" to 0x4FC4A2, "blue" to 0x5BB5EE, "orange" to 0xEE7B3C,
        "pink" to 0xE2678B, "green" to 0x3FA46A, "red" to 0xE5484D, "gray" to 0xA3A39E,
    )

    fun color(name: String): Color {
        val rgb = tones[name] ?: name.takeIf { it.startsWith("#") }?.drop(1)?.toIntOrNull(16) ?: tones.getValue("gray")
        return Color(0xFF000000 or rgb.toLong())
    }

    val week = color("yellow")
    val extra = color("violet")

    /** The amount of an expense that could have been done without. */
    val optional = color("orange")
}
