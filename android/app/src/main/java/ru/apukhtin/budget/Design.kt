package ru.apukhtin.budget

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.rememberScrollState
import androidx.compose.material.icons.outlined.Add
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.text.TextAutoSize
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowForward
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.WifiOff
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.rotate
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

// The look of the app, after the reference the user picked on 2026-10-09, as ios/Budget/Design.swift draws it: a warm
// white page with soft lilac light, large figures in a heavy face with ₽ as heavy, rows on the page itself under quiet
// headings, each with a dot in a halo. Choices sit on a light track with the picked one on white; forms put the name and
// the amount large and their main button violet at the bottom. What is touched answers: a card gives under the finger,
// the picked choice slides with a tick, a figure counts to its new value.

/** iOS's text sizes, which the iPhone app is drawn in; a point there is about a dp here. */
object Type {
    val body = 17.sp
    val callout = 16.sp
    val subheadline = 15.sp
    val footnote = 13.sp
    val caption = 12.sp
    val caption2 = 11.sp
    val title3 = 20.sp

    /** Figures keep their width, so a sum that changes does not jump. */
    const val TABULAR = "tnum"
}

/** A card as a button: it gives under the finger and springs back. */
fun Modifier.card(enabled: Boolean = true, label: String? = null, onClick: () -> Unit): Modifier = composed {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.97f else 1f, spring(dampingRatio = 0.7f, stiffness = Spring.StiffnessMedium), label = "card")
    graphicsLayer {
        scaleX = scale
        scaleY = scale
    }.clickable(source, indication = null, enabled = enabled, onClickLabel = label, role = Role.Button, onClick = onClick)
}

/** A plain tap without the ripple, for what draws its own answer. */
fun Modifier.tap(enabled: Boolean = true, onClick: () -> Unit): Modifier = composed {
    clickable(remember { MutableInteractionSource() }, indication = null, enabled = enabled, onClick = onClick)
}

/** The page under the new style: warm white with soft lilac light at its corners. */
fun Modifier.lilacBackground(): Modifier = composed {
    val canvas = Lilac.canvas
    val tint = Lilac.tint
    drawBehind {
        drawRect(canvas)
        val w = size.width
        val h = size.height
        // Two blurred ellipses, as soft gradients: one off the top right, one off the bottom left.
        glow(tint, Offset(w * 1.0f, h * 0.14f), w * 0.9f, h * 0.32f, -28f, h * 0.06f)
        glow(tint.copy(alpha = 0.8f), Offset(w * 0.2f, h * 0.98f), w * 1.1f, h * 0.28f, -12f, h * 0.07f)
    }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.glow(color: Color, center: Offset, width: Float, height: Float, degrees: Float, blur: Float) {
    val radius = width / 2 + blur
    translate(center.x, center.y) {
        rotate(degrees, pivot = Offset.Zero) {
            scale(1f, (height / 2 + blur) / radius, pivot = Offset.Zero) {
                drawCircle(
                    Brush.radialGradient(0f to color, (width / 2 - blur).coerceAtLeast(0f) / radius to color.copy(alpha = color.alpha * 0.6f), 1f to color.copy(alpha = 0f), center = Offset.Zero, radius = radius),
                    radius = radius,
                    center = Offset.Zero,
                )
            }
        }
    }
}

/** A figure in the heavy face, ₽ as heavy as its digits; red below zero. It counts to a new value, and shrinks to fit. */
@Composable
fun LilacAmount(amount: Double, symbol: String, size: TextUnit = 30.sp, weight: FontWeight = FontWeight.Bold, color: Color? = null, modifier: Modifier = Modifier) {
    val shown by animateFloatAsState(amount.toFloat(), spring(dampingRatio = 1f, stiffness = Spring.StiffnessMediumLow), label = "amount")
    val value = if (shown == amount.toFloat()) amount else shown.toDouble()
    val tint = color ?: if (amount < -0.5) Lilac.red else Lilac.ink
    BasicText(
        Money.text(value, symbol),
        modifier = modifier,
        style = TextStyle(fontSize = size, fontWeight = weight, color = tint, fontFeatureSettings = Type.TABULAR),
        maxLines = 1,
        autoSize = TextAutoSize.StepBased(minFontSize = size * 0.55f, maxFontSize = size, stepSize = 0.5.sp),
    )
}

/** Plain text in the app's sizes and colours. */
@Composable
fun LilacText(
    text: String,
    size: TextUnit = Type.body,
    color: Color = Lilac.ink,
    weight: FontWeight = FontWeight.Normal,
    modifier: Modifier = Modifier,
    lines: Int = Int.MAX_VALUE,
    tabular: Boolean = false,
    textAlign: TextAlign? = null,
) {
    Text(
        text,
        modifier = modifier,
        textAlign = textAlign,
        color = color,
        fontSize = size,
        fontWeight = weight,
        maxLines = lines,
        overflow = TextOverflow.Ellipsis,
        style = TextStyle(fontFeatureSettings = if (tabular) Type.TABULAR else null),
    )
}

/** Two or more choices on a track, the picked one on white that slides to the next with a tick, such as «Неделя». */
@Composable
fun <T> LilacSegmented(items: List<Pair<T, String>>, selection: T, modifier: Modifier = Modifier.width(210.dp), enabled: Boolean = true, onSelect: (T) -> Unit) {
    val haptics = LocalHapticFeedback.current
    val index = items.indexOfFirst { it.first == selection }.coerceAtLeast(0)
    BoxWithConstraints(modifier.background(Lilac.track, RoundedCornerShape(16.dp)).padding(3.dp)) {
        val width = maxWidth / items.size
        val x by animateDpAsState(width * index, spring(dampingRatio = 0.8f, stiffness = Spring.StiffnessMedium), label = "segment")
        Box(
            Modifier.offset(x = x).width(width).height(36.dp)
                .shadow(4.dp, RoundedCornerShape(13.dp), ambientColor = Color.Black.copy(alpha = 0.2f), spotColor = Color.Black.copy(alpha = 0.2f))
                .background(Lilac.surface, RoundedCornerShape(13.dp)),
        )
        Row(Modifier.fillMaxWidth()) {
            items.forEach { (value, label) ->
                val picked = value == selection
                Box(
                    Modifier.weight(1f).height(36.dp)
                        .semantics { selected = picked }
                        .tap(enabled) {
                            if (!picked) {
                                haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                                onSelect(value)
                            }
                        },
                    contentAlignment = Alignment.Center,
                ) {
                    BasicText(
                        label,
                        Modifier.padding(horizontal = 2.dp),
                        style = TextStyle(fontSize = Type.subheadline, fontWeight = if (picked) FontWeight.SemiBold else FontWeight.Normal, color = if (picked) Lilac.ink else Lilac.muted),
                        maxLines = 1,
                        autoSize = TextAutoSize.StepBased(minFontSize = Type.subheadline * 0.8f, maxFontSize = Type.subheadline),
                    )
                }
            }
        }
    }
}

/** A plain icon button of a header, such as the calendar, with its name under it when that is not plain from the icon. */
@Composable
fun LilacIconButton(icon: ImageVector, label: String, caption: String? = null, onClick: () -> Unit) {
    Column(
        Modifier.semantics { contentDescription = label }.tap(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(Modifier.size(40.dp), contentAlignment = Alignment.Center) {
            Icon(icon, contentDescription = null, tint = Lilac.accent, modifier = Modifier.size(24.dp))
        }
        if (caption != null) LilacText(caption, Type.footnote, Lilac.muted, modifier = Modifier.offset(y = (-4).dp))
    }
}

/** A small capsule, such as «Сейчас» or what the week allows. */
@Composable
fun LilacChip(text: String, icon: ImageVector? = null, highlighted: Boolean = false, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val color = if (highlighted) Lilac.accent else Lilac.ink.copy(alpha = 0.7f)
    Row(
        modifier.card(onClick = onClick)
            .height(28.dp)
            .background(if (highlighted) Lilac.tint else Lilac.surface.copy(alpha = 0.7f), CircleShape)
            .padding(horizontal = 11.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(5.dp),
    ) {
        LilacText(text, Type.footnote, color, FontWeight.SemiBold, lines = 1, tabular = true)
        if (icon != null) Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(13.dp))
    }
}

/**
 * The days of a week by their short names with a dot under each: today on a violet disc in a halo, a picked day in a
 * halo, a day with spending darker than one without; days ahead do not open.
 */
@Composable
fun LilacDayStrip(start: String, today: String, active: Set<String>, picked: String? = null, onTap: (String) -> Unit) {
    Row(Modifier.fillMaxWidth()) {
        (0 until 7).map { Dates.adding(it, start) }.forEach { day ->
            val isToday = day == today
            val strong = isToday || picked == day
            Column(
                Modifier.weight(1f)
                    .semantics { contentDescription = Dates.spoken(day); selected = picked == day }
                    .tap(enabled = day <= today) { onTap(day) },
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                LilacText(Dates.weekdayShort(day), Type.subheadline, if (strong) Lilac.ink else Lilac.muted, if (strong) FontWeight.SemiBold else FontWeight.Normal)
                Box(Modifier.size(34.dp), contentAlignment = Alignment.Center) {
                    when {
                        isToday -> {
                            Box(Modifier.fillMaxSize().background(Lilac.tint, CircleShape))
                            Box(Modifier.size(22.dp).background(Lilac.accent, CircleShape))
                            Box(Modifier.size(7.dp).background(Color.White, CircleShape))
                            if (picked == day) Box(Modifier.fillMaxSize().border(1.5.dp, Lilac.accent.copy(alpha = 0.5f), CircleShape))
                        }
                        picked == day -> {
                            Box(Modifier.fillMaxSize().background(Lilac.tint, CircleShape))
                            Box(Modifier.size(9.dp).background(Lilac.accent, CircleShape))
                        }
                        else -> Box(Modifier.size(6.dp).background(if (day in active) Lilac.muted else Lilac.muted.copy(alpha = 0.4f), CircleShape))
                    }
                }
            }
        }
    }
}

/** A heading over rows, with something such as a round «+» at its end. */
@Composable
fun LilacHeading(title: String, subtitle: String? = null, trailing: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(top = 22.dp, bottom = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        LilacText(title, Type.title3, weight = FontWeight.SemiBold)
        if (subtitle != null) LilacText(subtitle, Type.subheadline, Lilac.muted)
        Spacer(Modifier.weight(1f))
        trailing()
    }
}

/** A round white button with an icon, such as the «+» of a heading or the arrows between weeks. */
@Composable
fun LilacRoundButton(icon: ImageVector, label: String, enabled: Boolean = true, onClick: () -> Unit) {
    Box(
        Modifier.semantics { contentDescription = label }
            .card(enabled = enabled, onClick = onClick)
            .alpha(if (enabled) 1f else 0.4f)
            .size(42.dp)
            .shadow(5.dp, CircleShape, ambientColor = Color.Black.copy(alpha = 0.25f), spotColor = Color.Black.copy(alpha = 0.25f))
            .background(Lilac.surface, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = Lilac.ink, modifier = Modifier.size(22.dp))
    }
}

/** What leads a row: a dot in a halo of its colour, a ring for something flexible or outside, or an icon. */
sealed interface LilacMarker {
    data class Dot(val color: Color) : LilacMarker
    data class Ring(val color: Color) : LilacMarker
    data class Symbol(val icon: ImageVector, val color: Color) : LilacMarker

    /** A category's photo by its path, on the category's colour. */
    data class Photo(val path: String, val color: Color) : LilacMarker

    /** A shop's logo by its path, on white with a hairline round it, whatever its colours. */
    data class Logo(val path: String) : LilacMarker

    companion object {
        /** An expense's row: its shop's logo, else a dot of its category's colour. */
        fun expense(row: Row, dot: Color? = null): LilacMarker = row.logo?.let(::Logo) ?: Dot(dot ?: Palette.color(row.color))

        /** A row's icon from the server on a halo of its colour, or its category's photo on the colour. */
        fun icon(row: Row): LilacMarker = row.photo?.let { Photo(it, Palette.color(row.color)) } ?: Symbol(WebIcons.icon(row.icon), Palette.color(row.color))
    }
}

@Composable
fun LilacMarkerView(marker: LilacMarker, modifier: Modifier = Modifier.size(30.dp)) {
    Box(modifier, contentAlignment = Alignment.Center) {
        when (marker) {
            is LilacMarker.Dot -> {
                Box(Modifier.fillMaxSize().background(marker.color.copy(alpha = 0.16f), CircleShape))
                Box(Modifier.size(10.dp).background(marker.color, CircleShape))
            }
            is LilacMarker.Ring -> {
                Box(Modifier.fillMaxSize().background(marker.color.copy(alpha = 0.14f), CircleShape))
                Box(Modifier.size(14.dp).border(2.5.dp, marker.color, CircleShape))
            }
            is LilacMarker.Symbol -> {
                Box(Modifier.fillMaxSize().background(marker.color.copy(alpha = 0.16f), CircleShape))
                Icon(marker.icon, contentDescription = null, tint = marker.color, modifier = Modifier.size(15.dp))
            }
            is LilacMarker.Photo -> RemotePhoto(marker.path, Modifier.fillMaxSize().clip(CircleShape).background(marker.color))
            is LilacMarker.Logo -> RemotePhoto(
                marker.path,
                Modifier.fillMaxSize().clip(CircleShape).background(Color.White).border(0.5.dp, Lilac.hairline, CircleShape),
            )
        }
    }
}

/** A line under an amount, in its colour, or a chip of where something counts. */
data class Note(val text: String, val color: Color)

/**
 * A row on the page: its marker, the title over its details and what is added under them, the amount over a chip such
 * as where it counts or a line such as how far over the plan, and a chevron when it opens. A hairline parts it from the
 * row above. The chip can be a ring before its words, without a capsule, as the operations draw where an expense counts.
 */
@Composable
fun LilacRow(
    marker: LilacMarker,
    title: String,
    details: String,
    amount: Double?,
    symbol: String,
    chip: Note? = null,
    muted: Boolean = false,
    first: Boolean = false,
    chevron: Boolean = true,
    signed: Boolean = false,
    amountColor: Color = Lilac.ink,
    amountNote: Note? = null,
    ringChip: Boolean = false,
    /** The struck calendar after the title, of an expense no plan had. */
    unplanned: Boolean = false,
    modifier: Modifier = Modifier,
    accessory: (@Composable () -> Unit)? = null,
) {
    val hairline = Lilac.hairline
    Row(
        modifier.fillMaxWidth()
            .drawBehind { if (!first) drawRect(hairline, Offset(44.dp.toPx(), 0f), androidx.compose.ui.geometry.Size(size.width - 44.dp.toPx(), 0.5.dp.toPx())) }
            .alpha(if (muted) 0.5f else 1f)
            .padding(vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        LilacMarkerView(marker)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                LilacText(title, Type.body, lines = 2, modifier = Modifier.weight(1f, fill = false))
                if (unplanned) LilacNoPlan()
            }
            if (details.isNotEmpty()) LilacText(details, Type.subheadline, Lilac.muted, lines = 2)
            accessory?.invoke()
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(5.dp)) {
            if (amount != null) LilacText(Money.text(amount, symbol, sign = signed), Type.body, amountColor, FontWeight.SemiBold, lines = 1, tabular = true)
            if (amountNote != null) LilacText(amountNote.text, Type.subheadline, amountNote.color, FontWeight.Medium, lines = 1, tabular = true)
            if (chip != null && ringChip) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Box(Modifier.size(9.dp).border(1.2.dp, chip.color, CircleShape))
                    LilacText(chip.text, Type.footnote, chip.color, lines = 1)
                }
            } else if (chip != null) {
                LilacText(
                    chip.text, Type.caption, chip.color, FontWeight.Medium, lines = 1,
                    modifier = Modifier.background(chip.color.copy(alpha = 0.12f), CircleShape).padding(horizontal = 8.dp, vertical = 3.dp),
                )
            }
        }
        if (chevron) Icon(Icons.Outlined.ChevronRight, contentDescription = null, tint = Lilac.muted.copy(alpha = 0.7f), modifier = Modifier.size(18.dp))
    }
}

/** A row that adds something, at the end of its list. */
@Composable
fun LilacAddRow(label: String, onClick: () -> Unit) {
    val hairline = Lilac.hairline
    Row(
        Modifier.fillMaxWidth()
            .drawBehind { drawRect(hairline, Offset(44.dp.toPx(), 0f), androidx.compose.ui.geometry.Size(size.width - 44.dp.toPx(), 0.5.dp.toPx())) }
            .tap(onClick = onClick)
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Box(Modifier.size(30.dp).background(Lilac.tint, CircleShape), contentAlignment = Alignment.Center) {
            Icon(Icons.Outlined.Add, contentDescription = null, tint = Lilac.accent, modifier = Modifier.size(16.dp))
        }
        LilacText(label, Type.body, Lilac.accent)
    }
}

/** A figure of [LilacFigures]: what it is, the amount and its colour. */
data class FigureItem(val label: String, val amount: Double, val color: Color)

/** Figures in a line, each after what it is, with a hairline between, such as what was spent and what came in. */
@Composable
fun LilacFigures(items: List<FigureItem>, symbol: String, modifier: Modifier = Modifier) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
        items.forEachIndexed { index, item ->
            if (index > 0) Box(Modifier.size(1.dp, 22.dp).background(Lilac.hairline))
            Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                LilacText(item.label, Type.callout, Lilac.muted, lines = 1, modifier = Modifier.padding(bottom = 1.dp))
                LilacAmount(item.amount, symbol, 19.sp, color = item.color)
            }
        }
    }
}

/**
 * A screen's title that picks what it shows, such as the month of the operations: the screen's name small, what it shows
 * large with a chevron that opens the choice, and buttons at its end.
 */
@Composable
fun LilacPickerTitle(screen: String, text: String, choices: List<String>, pick: (Int) -> Unit, trailing: @Composable () -> Unit = {}) {
    var open by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.weight(1f)) {
            LilacText(screen, Type.body, Lilac.muted)
            Box {
                Row(Modifier.tap { open = true }, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    BasicText(
                        text,
                        Modifier.weight(1f, fill = false),
                        style = TextStyle(fontSize = 34.sp, fontWeight = FontWeight.Bold, color = Lilac.ink),
                        maxLines = 1,
                        autoSize = TextAutoSize.StepBased(minFontSize = 24.sp, maxFontSize = 34.sp),
                    )
                    Icon(Icons.Outlined.ExpandMore, contentDescription = null, tint = Lilac.ink, modifier = Modifier.size(26.dp))
                }
                androidx.compose.material3.DropdownMenu(open, { open = false }, containerColor = Lilac.surface) {
                    choices.forEachIndexed { index, choice ->
                        androidx.compose.material3.DropdownMenuItem(text = { LilacText(choice, Type.body) }, onClick = {
                            open = false
                            pick(index)
                        })
                    }
                }
            }
        }
        trailing()
    }
}

/**
 * Tabs in a row that scrolls sideways, each with its count, the picked one dark and underlined in violet over a
 * hairline; a count can be a violet badge, as «Ждут разбора» has. A control such as how the list goes stays at the end.
 */
@Composable
fun <T> LilacFilterTabs(items: List<FilterTab<T>>, selection: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier, trailing: @Composable () -> Unit = {}) {
    val haptics = LocalHapticFeedback.current
    val scroll = rememberScrollState()
    val places = remember { mutableStateMapOf<String, Pair<Int, Int>>() }
    val picked = items.firstOrNull { it.value == selection }?.label
    val density = LocalDensity.current
    val accent = Lilac.accent
    val hairline = Lilac.hairline
    val place = places[picked]
    val x by animateDpAsState(with(density) { (place?.first ?: 0).toDp() }, label = "tab")
    val width by animateDpAsState(with(density) { (place?.second ?: 0).toDp() }, label = "tab-width")
    // The picked tab comes into sight, even when picked from elsewhere, as «Ждут разбора» from the main page.
    LaunchedEffect(picked, place) { place?.let { scroll.animateScrollTo((it.first - 200).coerceAtLeast(0)) } }
    Row(
        modifier.fillMaxWidth().drawBehind { drawRect(hairline, Offset(0f, size.height - 1.dp.toPx()), androidx.compose.ui.geometry.Size(size.width, 1.dp.toPx())) },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.weight(1f)
                .graphicsLayer { compositingStrategy = androidx.compose.ui.graphics.CompositingStrategy.Offscreen }
                .drawWithContent {
                    drawContent()
                    // The tabs past the end fade out, so the cut one reads as more to scroll to.
                    drawRect(Brush.horizontalGradient(0.85f to Color.Black, 1f to Color.Transparent), blendMode = androidx.compose.ui.graphics.BlendMode.DstIn)
                }
                .horizontalScroll(scroll),
        ) {
            Row(Modifier.padding(end = 24.dp), horizontalArrangement = Arrangement.spacedBy(22.dp)) {
                items.forEach { item ->
                    val isPicked = item.value == selection
                    Row(
                        Modifier.height(44.dp)
                            .onPlaced { places[item.label] = it.positionInParent().x.toInt() to it.size.width }
                            .semantics { this.selected = isPicked; contentDescription = item.label }
                            .tap {
                                if (!isPicked) {
                                    haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
                                    onSelect(item.value)
                                }
                            },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        LilacText(item.label, Type.subheadline, if (isPicked) Lilac.ink else Lilac.muted, if (isPicked) FontWeight.SemiBold else FontWeight.Normal, lines = 1)
                        item.count?.let { count ->
                            if (item.badge) {
                                LilacText(
                                    "$count", Type.caption, Color.White, FontWeight.Bold, lines = 1, textAlign = TextAlign.Center,
                                    modifier = Modifier.defaultMinSize(minWidth = 20.dp).background(Lilac.accent, CircleShape).padding(horizontal = 6.dp, vertical = 2.dp),
                                )
                            } else {
                                LilacText("$count", Type.subheadline, Lilac.muted.copy(alpha = 0.8f), lines = 1, tabular = true)
                            }
                        }
                    }
                }
            }
            if (place != null) {
                Box(Modifier.align(Alignment.BottomStart).offset(x = x).width(width).height(3.dp).background(accent, CircleShape))
            }
        }
        trailing()
    }
}

/** A tab of [LilacFilterTabs]: its value, its name and its count, which can be a badge. */
data class FilterTab<T>(val value: T, val label: String, val count: Int? = null, val badge: Boolean = false)

/**
 * A group of a list on a line down its left side, as the operations go by day: a violet dot in a halo on the line with
 * the group's title and total beside it, and its rows hung off the line under the title. The line runs from the first
 * group's dot to the end of the last group's rows.
 */
@Composable
fun LilacTimelineGroup(title: String, subtitle: String = "", total: String? = null, first: Boolean = false, last: Boolean = false, content: @Composable () -> Unit) {
    val top = if (first) 18.dp else 26.dp
    val height = 26.dp
    val line = Lilac.soft.copy(alpha = 0.6f)
    val tint = Lilac.tint
    val ring = Lilac.soft.copy(alpha = 0.7f)
    val accent = Lilac.accent
    Column(
        Modifier.fillMaxWidth().drawBehind {
            val x = 9.dp.toPx()
            val dot = (top + height / 2).toPx()
            val from = if (first) dot else 0f
            val to = size.height - if (last) 14.dp.toPx() else 0f
            if (to > from) drawRect(line, Offset(x - 0.75.dp.toPx(), from), androidx.compose.ui.geometry.Size(1.5.dp.toPx(), to - from))
            drawCircle(tint, 9.dp.toPx(), Offset(x, dot))
            drawCircle(ring, 9.dp.toPx() - 0.5.dp.toPx(), Offset(x, dot), style = androidx.compose.ui.graphics.drawscope.Stroke(1.dp.toPx()))
            drawCircle(accent, 3.5.dp.toPx(), Offset(x, dot))
        }.padding(start = 32.dp),
    ) {
        Row(
            Modifier.fillMaxWidth().padding(top = top, bottom = 2.dp).height(height),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            LilacText(title, Type.body, weight = FontWeight.SemiBold, lines = 1)
            // A long day's name gets smaller rather than cut, as on the iPhone.
            FitText(subtitle, Type.body, Lilac.muted, Modifier.weight(1f))
            if (total != null) LilacText(total, Type.body, Lilac.muted, lines = 1, tabular = true)
        }
        content()
    }
}
/** A bar of a total's parts, each in its colour, on a track, with a legend of figures under it. */
@Composable
fun LilacShareBar(parts: List<Total.Part>, unlabeled: Set<String> = emptySet()) {
    val shown = parts.filter { it.value > 0.5 }
    val sum = shown.sumOf { it.value }.coerceAtLeast(1.0)
    val soft = Lilac.soft
    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        BoxWithConstraints(Modifier.fillMaxWidth().height(12.dp).background(Lilac.track, CircleShape)) {
            val free = maxWidth - 3.dp * (shown.size - 1).coerceAtLeast(0)
            Row(horizontalArrangement = Arrangement.spacedBy(3.dp)) {
                shown.forEach { part ->
                    Box(
                        Modifier.width((free * (part.value / sum).toFloat()).coerceAtLeast(8.dp)).height(12.dp)
                            .background(if (part.tone == "gray") soft.copy(alpha = 0.6f) else Palette.color(part.tone), CircleShape),
                    )
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(14.dp)) {
            shown.filter { it.label !in unlabeled }.forEach { part ->
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp)) {
                    Box(Modifier.size(7.dp).background(if (part.tone == "gray") soft else Palette.color(part.tone), CircleShape))
                    LilacText("${part.label.lowercase()} ${Money.number(part.value)}", Type.footnote, Lilac.muted, lines = 1, tabular = true)
                }
            }
        }
    }
}

/** A screen's main figure with what it is over it and what it is out of under it. */
@Composable
fun LilacSummary(label: String?, amount: Double, symbol: String, note: String? = null, size: TextUnit = 36.sp, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
        if (label != null) LilacText(label, Type.subheadline, Lilac.muted)
        LilacAmount(amount, symbol, size)
        if (!note.isNullOrEmpty()) LilacText(note, Type.subheadline, Lilac.muted)
    }
}

/** The main button of a form, violet from edge to edge, such as «Сохранить». */
@Composable
fun LilacPrimaryButton(label: String, busy: Boolean = false, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val violet = Color(0xFF6E52F5)
    Box(
        modifier.fillMaxWidth()
            .card(enabled = !busy, onClick = onClick)
            .alpha(if (busy) 0.6f else 1f)
            .height(54.dp)
            .shadow(10.dp, CircleShape, ambientColor = violet, spotColor = violet)
            .background(Brush.horizontalGradient(listOf(Color(0xFF9C8BF8), violet)), CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        LilacText(label, Type.body, Color.White, FontWeight.SemiBold)
    }
}

/** A quiet label over a field of a form, such as «Тип траты». */
@Composable
fun LilacFieldLabel(text: String) {
    LilacText(text, Type.subheadline, Lilac.muted, modifier = Modifier.padding(top = 22.dp, bottom = 8.dp))
}

enum class Keyboard { Text, Decimal, Number, Url, Secret }

/** A field of a form under its label, white and rounded, with its error under it. */
@Composable
fun LilacTextField(label: String, value: String, onChange: (String) -> Unit, placeholder: String = "", error: String? = null, keyboard: Keyboard = Keyboard.Text) {
    Column {
        LilacFieldLabel(label)
        val ink = Lilac.ink
        val typed = typedValue(value)
        BasicTextField(
            typed.value,
            {
                typed.value = it
                onChange(it.text)
            },
            singleLine = true,
            textStyle = TextStyle(fontSize = Type.body, color = ink),
            cursorBrush = SolidColor(Lilac.accent),
            visualTransformation = if (keyboard == Keyboard.Secret) PasswordVisualTransformation() else VisualTransformation.None,
            keyboardOptions = KeyboardOptions(
                keyboardType = when (keyboard) {
                    Keyboard.Text -> KeyboardType.Text
                    Keyboard.Decimal -> KeyboardType.Decimal
                    Keyboard.Number -> KeyboardType.Number
                    Keyboard.Url -> KeyboardType.Uri
                    Keyboard.Secret -> KeyboardType.Password
                },
                autoCorrectEnabled = keyboard == Keyboard.Text,
            ),
            modifier = Modifier.fillMaxWidth()
                .shadow(4.dp, RoundedCornerShape(16.dp), ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f))
                .background(Lilac.surface, RoundedCornerShape(16.dp))
                .defaultMinSize(minHeight = 52.dp),
            decorationBox = { field ->
                Box(Modifier.padding(horizontal = 16.dp, vertical = 15.dp), contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) LilacText(placeholder, Type.body, Lilac.muted.copy(alpha = 0.7f), lines = 1)
                    field()
                }
            },
        )
        if (error != null) LilacText(error, Type.footnote, Lilac.red, modifier = Modifier.padding(top = 4.dp))
    }
}

/** A white rounded block of a form or a sheet holding a few lines, such as a setting and its value. */
@Composable
fun LilacPanel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier.fillMaxWidth()
            .shadow(4.dp, RoundedCornerShape(18.dp), ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f))
            .background(Lilac.surface, RoundedCornerShape(18.dp))
            .padding(horizontal = 16.dp),
    ) { content() }
}

/** A line of a panel: a name and its value or a control, a hairline above all but the first. */
@Composable
fun LilacPanelLine(title: String, first: Boolean = false, titleColor: Color = Lilac.ink, modifier: Modifier = Modifier, trailing: @Composable () -> Unit = {}) {
    val hairline = Lilac.hairline
    Row(
        modifier.fillMaxWidth()
            .heightIn(min = 52.dp)
            .drawBehind { if (!first) drawRect(hairline, size = androidx.compose.ui.geometry.Size(size.width, 0.5.dp.toPx())) },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        LilacText(title, Type.body, titleColor)
        Spacer(Modifier.weight(1f))
        trailing()
    }
}

/** A screen's title in the new style, large, with buttons at its end such as the gear. */
@Composable
fun LilacTitle(text: String, trailing: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        LilacText(text, 32.sp, weight = FontWeight.Bold)
        Spacer(Modifier.weight(1f))
        trailing()
    }
}

/** Over the sheet while the server cannot be reached: when the shown screen was saved. A tap opens the server. */
@Composable
fun OfflinePill(date: Long, modifier: Modifier = Modifier, onClick: () -> Unit) {
    Row(
        modifier.semantics { contentDescription = "Нет связи с сервером, сохранено ${Dates.moment(date)}" }
            .card(onClick = onClick)
            .height(34.dp)
            .shadow(6.dp, CircleShape)
            .background(Color(0xFF1C1B21), CircleShape)
            .padding(horizontal = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(Icons.Outlined.WifiOff, contentDescription = null, tint = Color.White, modifier = Modifier.size(15.dp))
        LilacText(Dates.moment(date), Type.footnote, Color.White, FontWeight.SemiBold, tabular = true)
    }
}

/** A thin rule between parts of a block. */
@Composable
fun Hairline(modifier: Modifier = Modifier, vertical: Dp = 10.dp) {
    Box(modifier.padding(vertical = vertical).fillMaxWidth().height(0.5.dp).background(Lilac.hairline))
}

/** Clips to a circle, for what sits on a round ground. */
fun Modifier.round(): Modifier = clip(CircleShape)

/** At most this wide, as the circle of the main page. */
fun Modifier.atMost(width: Dp): Modifier = widthIn(max = width)

/** A switch in the app's violet, as a setting of a panel has. */
@Composable
fun LilacSwitch(on: Boolean, color: Color = Lilac.accent, onChange: (Boolean) -> Unit) {
    androidx.compose.material3.Switch(
        on,
        onChange,
        colors = androidx.compose.material3.SwitchDefaults.colors(
            checkedTrackColor = color,
            checkedThumbColor = Color.White,
            uncheckedTrackColor = Lilac.track,
            uncheckedThumbColor = Color.White,
            uncheckedBorderColor = Lilac.track,
        ),
    )
}

/** What a list says when it has nothing to show. */
@Composable
fun LilacEmpty(text: String) {
    LilacText(text, Type.subheadline, Lilac.muted, modifier = Modifier.fillMaxWidth().padding(vertical = 18.dp))
}

/**
 * A soft lilac cloud under the one block of a page that is written in, as the user's picture of 2026-10-22 draws it
 * under what an expense was: rounder at the top left, trailing off at the bottom right.
 */
val LilacBlob = androidx.compose.foundation.shape.GenericShape { size, _ ->
    val w = size.width
    val h = size.height
    fun x(f: Float) = f * w
    fun y(f: Float) = f * h
    moveTo(x(0.04f), y(0.3f))
    cubicTo(x(0.1f), y(0.02f), x(0.36f), y(0.1f), x(0.56f), y(0.04f))
    cubicTo(x(0.76f), y(-0.02f), x(0.99f), y(0.1f), x(0.98f), y(0.34f))
    cubicTo(x(0.97f), y(0.58f), x(0.94f), y(0.84f), x(0.78f), y(0.9f))
    cubicTo(x(0.6f), y(0.97f), x(0.42f), y(0.86f), x(0.22f), y(0.94f))
    cubicTo(x(0.0f), y(1.02f), x(-0.02f), y(0.56f), x(0.04f), y(0.3f))
    close()
}

/**
 * A line of a sheet that tells one thing about what is open and offers one step: its icon or photo on a large disc, grey
 * or in a colour, what it is, a muted line under it, and the step in violet with an arrow. A tap on the line unfolds what
 * is under it, and a chevron says so when there is one. A hairline parts it from the line above.
 */
@Composable
fun LilacStepRow(
    icon: ImageVector,
    color: Color?,
    title: String,
    detail: String? = null,
    step: String? = null,
    photo: String? = null,
    open: Boolean? = null,
    tag: String = title,
    toggle: () -> Unit,
    act: () -> Unit = {},
) {
    val hairline = Lilac.hairline
    val turn by animateFloatAsState(if (open == true) 180f else 0f, label = "chevron")
    Row(
        Modifier.fillMaxWidth().testTag(tag)
            .drawBehind { drawRect(hairline, size = androidx.compose.ui.geometry.Size(size.width, 0.5.dp.toPx())) }
            .semantics { contentDescription = title }
            .tap(onClick = toggle)
            .padding(vertical = 18.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        if (photo != null) {
            RemotePhoto(photo, Modifier.size(50.dp).clip(CircleShape).background(color ?: Lilac.track))
        } else {
            Box(Modifier.size(50.dp).background(color?.copy(alpha = 0.14f) ?: Lilac.track.copy(alpha = 0.7f), CircleShape), contentAlignment = Alignment.Center) {
                Icon(icon, contentDescription = null, tint = color ?: Lilac.muted, modifier = Modifier.size(22.dp))
            }
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            LilacText(title, Type.body, lines = 1)
            if (detail != null) LilacText(detail, Type.callout, Lilac.muted, lines = 3)
            if (step != null) {
                Row(
                    Modifier.padding(top = 6.dp).heightIn(min = 30.dp).tap(onClick = act),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    LilacText(step, Type.body, Lilac.accent, FontWeight.Medium)
                    Icon(Icons.AutoMirrored.Outlined.ArrowForward, contentDescription = null, tint = Lilac.accent, modifier = Modifier.size(18.dp))
                }
            }
        }
        if (open != null) {
            Icon(
                Icons.Outlined.ExpandMore, contentDescription = null, tint = if (open) Lilac.accent else Lilac.muted,
                modifier = Modifier.size(24.dp).graphicsLayer { rotationZ = turn },
            )
        }
    }
}

/** A line of text that gets smaller, down to four fifths of its size, rather than cut, as iOS's minimumScaleFactor. */
@Composable
fun FitText(text: String, size: TextUnit, color: Color, modifier: Modifier = Modifier, weight: FontWeight = FontWeight.Normal) {
    BasicText(
        text,
        modifier,
        style = TextStyle(fontSize = size, fontWeight = weight, color = color),
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        autoSize = TextAutoSize.StepBased(minFontSize = size * 0.8f, maxFontSize = size, stepSize = 0.5.sp),
    )
}

/** A line across a list at today, between what is behind and what is ahead. */
@Composable
fun LilacTodayLine(text: String) {
    Row(Modifier.fillMaxWidth().padding(vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        LilacText(text, Type.footnote, Lilac.accent, FontWeight.SemiBold)
        Box(Modifier.weight(1f).height(1.dp).background(Lilac.accent.copy(alpha = 0.45f)))
    }
}
