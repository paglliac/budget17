package ru.apukhtin.budget

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import android.net.Uri
import android.util.Base64
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.outlined.Image
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import java.io.ByteArrayOutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** Opens a shop on the tab of shops of «Ещё», from an expense of it, as the root sets it up. */
val LocalOpenShop = staticCompositionLocalOf<((Shop) -> Unit)?> { null }

/** The parts of «Ещё». */
enum class MorePart { Regular, Income, Categories, Shops }

/**
 * What is set up once in a while, switched under the title (ios/Budget/MoreView.swift): regular expenses, incomes,
 * categories and shops. The budget's setup and the server are behind the gear. A shop an expense opened shows on its tab.
 */
@Composable
fun MoreView(part: MorePart, onPart: (MorePart) -> Unit, opening: Shop?, opened: () -> Unit) {
    var settings by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            LilacTitle("Ещё") { LilacIconButton(Icons.Outlined.Settings, "Настройки") { settings = true } }
            LilacSegmented(
                listOf(MorePart.Regular to "Регулярные", MorePart.Income to "Доходы", MorePart.Categories to "Категории", MorePart.Shops to "Магазины"),
                part, Modifier.fillMaxWidth(), onSelect = onPart,
            )
        }
        when (part) {
            MorePart.Regular -> RegularPanel()
            MorePart.Income -> IncomePanel()
            MorePart.Categories -> CategoriesPanel()
            MorePart.Shops -> ShopsPanel(opening, opened)
        }
    }
    if (settings) SettingsSheet { settings = false }
}

/** A part of «Ещё»: its rows scrolling under the title and the switch. */
@Composable
private fun MorePage(content: @Composable () -> Unit) {
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 20.dp).padding(top = 14.dp, bottom = 24.dp)) { content() }
}

/** A figure with what it counts, large, as the parts of «Ещё» head their lists. */
@Composable
private fun Count(label: String, count: Int, note: String? = null) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        LilacText(label, Type.subheadline, Lilac.muted)
        LilacText("$count", 36.sp, weight = FontWeight.Bold, tabular = true)
        if (note != null) LilacText(note, Type.subheadline, Lilac.muted)
    }
}

/**
 * Regular expenses in the order of the month: what is behind, quieter, a line at today, what is ahead, and those that
 * start later; on top, what is left to pay this month with its bar.
 */
@Composable
private fun RegularPanel() {
    var editing by remember { mutableStateOf<RegularItem?>(null) }
    var adding by remember { mutableStateOf(false) }
    Screen<RegularScreen>("regular") { s ->
        MorePage {
            LilacSummary(s.total.label, s.total.amount, s.symbol, s.total.note)
            s.total.parts?.takeIf { it.isNotEmpty() }?.let { Box(Modifier.padding(top = 14.dp)) { LilacShareBar(it) } }
            Box(Modifier.padding(top = 10.dp)) { Column { RegularRows(s.behind, s.symbol, true) { editing = it } } }
            if (s.behind.isNotEmpty() && s.ahead.isNotEmpty()) LilacTodayLine(s.today)
            RegularRows(s.ahead, s.symbol, s.behind.isEmpty()) { editing = it }
            if (s.later.isNotEmpty()) {
                LilacHeading("Начнутся позже")
                RegularRows(s.later, s.symbol, true) { editing = it }
            }
            LilacAddRow("Добавить регулярную трату") { adding = true }
        }
        editing?.let { item -> key(item.row.id) { RegularSheet(item, s.icons, s.symbol) { editing = null } } }
        if (adding) RegularSheet(null, s.icons, s.symbol) { adding = false }
    }
}

@Composable
private fun RegularRows(items: List<RegularItem>, symbol: String, first: Boolean, open: (RegularItem) -> Unit) {
    items.forEachIndexed { index, item ->
        LilacRow(
            LilacMarker.icon(item.row), item.row.title, item.row.details, item.row.amount, symbol, muted = item.row.muted, first = first && index == 0,
            modifier = Modifier.testTag(item.row.id).card { open(item) },
        )
    }
}

/** Incomes with what they bring a month, and the payments of the coming weeks by date with how each is worked out. */
@Composable
private fun IncomePanel() {
    var editing by remember { mutableStateOf<IncomeItem?>(null) }
    var adding by remember { mutableStateOf(false) }
    Screen<IncomeScreen>("income") { s ->
        MorePage {
            LilacSummary(s.total.label, s.total.amount, s.symbol, s.total.note)
            Column(Modifier.padding(top = 10.dp)) {
                s.incomes.forEachIndexed { index, item ->
                    LilacRow(
                        LilacMarker.icon(item.row), item.row.title, item.row.details, item.row.amount, s.symbol, first = index == 0,
                        modifier = Modifier.testTag(item.row.id).card { editing = item },
                    )
                }
            }
            LilacAddRow("Добавить доход") { adding = true }
            if (s.upcoming.isNotEmpty()) LilacHeading("Ближайшие поступления")
            s.upcoming.forEach { day ->
                LilacDayHeading(day.title, day.subtitle)
                day.items.forEachIndexed { index, payment ->
                    LilacRow(
                        LilacMarker.icon(payment.row), payment.row.title, payment.row.details, payment.row.amount, s.symbol,
                        first = index == 0, chevron = false, signed = true, amountColor = Palette.color("green"),
                        accessory = payment.formula?.let { formula -> { LilacText(formula, Type.caption, Lilac.muted) } },
                    )
                }
            }
        }
        editing?.let { item -> key(item.row.id) { IncomeSheet(item, s.models, s.symbol) { editing = null } } }
        if (adding) IncomeSheet(null, s.models, s.symbol) { adding = false }
    }
}

/** An income to add, following one of the models, or one to change; the fields come from its model. */
@Composable
private fun IncomeSheet(item: IncomeItem?, models: List<IncomeModel>, symbol: String, onDismiss: () -> Unit) {
    val sender = rememberFormSender()
    var model by remember { mutableStateOf(item?.income?.model ?: models.firstOrNull()?.id.orEmpty()) }
    var values by remember { mutableStateOf(item?.values ?: models.firstOrNull()?.defaults.orEmpty()) }
    var confirmDelete by remember { mutableStateOf(false) }
    val current = models.firstOrNull { it.id == model }
    LilacSheet(
        onDismiss,
        title = if (item == null) "Новый доход" else "Доход",
        primary = if (item == null) "Добавить" else "Сохранить",
        busy = sender.busy,
        save = {
            val form = mutableMapOf("title" to values["title"].orEmpty())
            current?.fields?.forEach { form[it.name] = values[it.name].orEmpty() }
            if (item == null) form["model"] = model
            sender.send(item?.let { "income/${it.income.id}" } ?: "income", form, onDismiss)
        },
        destructive = item?.let { "Удалить" to { confirmDelete = true } },
    ) {
        if (item == null) {
            LilacFieldLabel("Как приходят деньги")
            LilacSegmented(models.map { it.id to it.title }, model, Modifier.fillMaxWidth()) { id ->
                model = id
                models.firstOrNull { it.id == id }?.let { picked -> values = picked.defaults + ("title" to values["title"].orEmpty()) }
            }
        }
        LilacTextField("Название", values["title"].orEmpty(), { values = values + ("title" to it) }, "Например, сдача квартиры", sender.errors["title"])
        current?.fields?.forEach { field ->
            LilacTextField(
                if (field.kind == "amount") "${field.label}, $symbol" else field.label,
                values[field.name].orEmpty(),
                { values = values + (field.name to it) },
                field.placeholder.orEmpty(),
                sender.errors[field.name],
                if (field.kind == "amount") Keyboard.Decimal else Keyboard.Number,
            )
        }
    }
    if (confirmDelete && item != null) {
        ConfirmDialog("Удалить доход?", "", "Удалить", onDismiss = { confirmDelete = false }) { sender.send("income/${item.income.id}/delete", done = onDismiss) }
    }
    ErrorAlert(sender.error)
}

/**
 * Categories for marking in the order marking offers them, then the income ones; ZenMoney's can be renamed or hidden,
 * the user's own added and deleted. ZenMoney itself never changes.
 */
@Composable
private fun CategoriesPanel() {
    var editing by remember { mutableStateOf<CategoryItem?>(null) }
    var adding by remember { mutableStateOf<String?>(null) }
    Screen<CategoriesScreen>("categories") { s ->
        MorePage {
            Count(
                "Категории при разметке", s.shown.size,
                s.hidden.size.takeIf { it > 0 }?.let { "ещё $it ${Words.plural(it, "скрыта", "скрыты", "скрыто")}" },
            )
            Box(Modifier.padding(top = 10.dp)) { Column { CategoryRows(s.shown) { editing = it } } }
            LilacAddRow("Добавить категорию") { adding = "expense" }
            LilacHeading("Доходы")
            CategoryRows(s.income.shown) { editing = it }
            LilacAddRow("Добавить категорию дохода") { adding = "income" }
            val hidden = s.hidden + s.income.hidden
            if (hidden.isNotEmpty()) {
                LilacHeading("Скрытые")
                CategoryRows(hidden) { editing = it }
            }
        }
        editing?.let { item -> key(item.row.id) { CategorySheet(item, item.category.kind, s.icons.orEmpty(), s.colors.orEmpty()) { editing = null } } }
        adding?.let { kind -> key(kind) { CategorySheet(null, kind, s.icons.orEmpty(), s.colors.orEmpty()) { adding = null } } }
    }
}

@Composable
private fun CategoryRows(items: List<CategoryItem>, open: (CategoryItem) -> Unit) {
    items.forEachIndexed { index, item ->
        LilacRow(
            LilacMarker.icon(item.row), item.row.title, item.row.details, null, "", muted = item.row.muted, first = index == 0,
            modifier = Modifier.testTag(item.row.id).card { open(item) },
        )
    }
}

/**
 * A category to add, for expenses or incomes, or one to rename, dress, hide or show, and delete when it is the user's own.
 * How it looks shows on top as it is picked: an icon in a colour, or a photo of the phone instead of the icon, on the
 * colour, which shows through a photo with a clear ground.
 */
@Composable
private fun CategorySheet(item: CategoryItem?, kind: String, icons: List<IconChoice>, colors: List<ColorChoice>, onDismiss: () -> Unit) {
    val sender = rememberFormSender()
    val category = item?.category
    var title by remember { mutableStateOf(category?.name.orEmpty()) }
    // The icon and colour picked; empty for the category's own.
    var icon by remember { mutableStateOf(category?.icon.orEmpty()) }
    var color by remember { mutableStateOf(category?.color.orEmpty()) }
    // A photo picked on the phone, as the server takes it; empty takes the category's off, null leaves it as it is.
    var photo by remember { mutableStateOf<String?>(null) }
    var picture by remember { mutableStateOf<ImageBitmap?>(null) }
    val pick = rememberPhotoPicker(sender) { url, image ->
        photo = url
        picture = image
    }
    val autoColor = Palette.color(category?.auto?.color ?: "gray")
    val shownColor = if (color.isEmpty()) autoColor else Palette.color(color)
    val shownIcon = icon.ifEmpty { category?.auto?.icon ?: "tag" }
    val savedPhoto = if (photo == null) item?.row?.photo else null
    val hasPhoto = picture != null || savedPhoto != null
    val custom = color.isNotEmpty() && colors.none { it.value.equals(color, ignoreCase = true) }
    LilacSheet(
        onDismiss,
        title = if (item == null) (if (kind == "income") "Новая категория дохода" else "Новая категория") else "Категория",
        primary = if (item == null) "Добавить" else "Сохранить",
        busy = sender.busy,
        save = {
            val form = mutableMapOf("title" to title, "kind" to kind, "icon" to icon, "color" to color)
            photo?.let { form["photo"] = it }
            sender.send(item?.let { "categories/${it.category.id}" } ?: "categories", form, onDismiss)
        },
        destructive = category?.takeIf { it.zenmoneyTitle == null }?.let { c -> "Удалить" to { sender.send("categories/${c.id}/delete", done = onDismiss) } },
    ) {
        Box(Modifier.fillMaxWidth().padding(top = 6.dp), contentAlignment = Alignment.Center) {
            val shown = picture
            if (shown != null) Image(shown, null, Modifier.size(76.dp).clip(CircleShape).background(shownColor), contentScale = ContentScale.Crop)
            else CategoryDisc(shownIcon, shownColor, savedPhoto, 76.dp)
        }
        LilacTextField("Название", title, { title = it }, category?.zenmoneyTitle ?: if (kind == "income") "Например, кэшбэк" else "Например, дети", sender.errors["title"])
        val hint = when {
            category?.zenmoneyTitle != null -> "В ZenMoney она называется «${category.zenmoneyTitle}»; пустое поле вернёт это название."
            category != null -> "${if (kind == "income") "Доходы" else "Траты"} удалённой категории останутся без категории."
            else -> null
        }
        hint?.let { LilacText(it, Type.footnote, Lilac.muted, modifier = Modifier.padding(top = 6.dp)) }
        LilacFieldLabel("Иконка")
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            PickTile(null, "По названию", icon.isEmpty(), shownColor) { icon = "" }
            icons.forEach { choice -> PickTile(choice.icon, choice.label, icon == choice.icon, shownColor) { icon = choice.icon } }
        }
        LilacFieldLabel("Цвет")
        @OptIn(ExperimentalLayoutApi::class)
        FlowRow(horizontalArrangement = Arrangement.spacedBy(10.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
            Swatch(autoColor, "Как у категории", color.isEmpty(), auto = true) { color = "" }
            colors.forEach { choice -> Swatch(Palette.color(choice.value), choice.label, color.equals(choice.value, ignoreCase = true)) { color = choice.value } }
            if (custom) Swatch(Palette.color(color), "Свой цвет", true) {}
        }
        LilacFieldLabel("Фото вместо иконки")
        PhotoButtons(hasPhoto, pick) {
            photo = ""
            picture = null
        }
        sender.errors["photo"]?.let { LilacText(it, Type.footnote, Lilac.red) }
        if (category != null) {
            LilacInlineAction(if (category.hidden) "Показать при разметке" else "Скрыть при разметке", Modifier.padding(top = 22.dp)) {
                sender.send("categories/${category.id}/${if (category.hidden) "show" else "hide"}", done = onDismiss)
            }
        }
    }
    ErrorAlert(sender.error)
}

/** An icon to pick, in the category's colour when picked; null is the one its name gives. */
@Composable
private fun PickTile(icon: String?, label: String, picked: Boolean, color: Color, onClick: () -> Unit) {
    val shape = RoundedCornerShape(14.dp)
    Box(
        Modifier.size(46.dp).semantics { contentDescription = label; selected = picked }.card(onClick = onClick)
            .background(if (picked) color.copy(alpha = 0.16f) else Lilac.surface, shape)
            .then(if (picked) Modifier.border(1.5.dp, color, shape) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        if (icon != null) Icon(WebIcons.icon(icon), contentDescription = null, tint = if (picked) color else Lilac.ink, modifier = Modifier.size(20.dp))
        else LilacText("Aa", Type.body, if (picked) color else Lilac.ink, FontWeight.SemiBold)
    }
}

/** A colour to pick, ringed when picked; the category's own says «A». */
@Composable
private fun Swatch(color: Color, label: String, picked: Boolean, auto: Boolean = false, onClick: () -> Unit) {
    Box(
        Modifier.size(38.dp).semantics { contentDescription = label; selected = picked }.tap(onClick = onClick)
            .then(if (picked) Modifier.border(2.dp, Lilac.ink, CircleShape) else Modifier).padding(3.dp)
            .background(color, CircleShape),
        contentAlignment = Alignment.Center,
    ) { if (auto) LilacText("A", Type.caption, Color.White, FontWeight.Bold) }
}

/** «Выбрать фото» or «Другое фото» from the phone's gallery, and «Убрать фото» when there is one. */
@Composable
private fun PhotoButtons(hasPhoto: Boolean, pick: () -> Unit, remove: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
            Modifier.card(onClick = pick).height(28.dp).background(Lilac.tint, CircleShape).padding(horizontal = 12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
        ) {
            Icon(Icons.Outlined.Image, contentDescription = null, tint = Lilac.accent, modifier = Modifier.size(15.dp))
            LilacText(if (hasPhoto) "Другое фото" else "Выбрать фото", Type.footnote, Lilac.accent, FontWeight.SemiBold)
        }
        if (hasPhoto) LilacInlineAction("Убрать фото", onClick = remove)
    }
}

/**
 * Picks a photo in the phone's gallery and makes it what the server takes, a square data URL (see [CategoryPhoto]);
 * hands it over with its picture, or says it could not open it.
 */
@Composable
private fun rememberPhotoPicker(sender: FormSender, picked: (String, ImageBitmap) -> Unit): () -> Unit {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    val launcher = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            scope.launch {
                val made = withContext(Dispatchers.Default) { CategoryPhoto.make(context, uri) }
                if (made == null) sender.error.value = "Не получилось открыть фото." else picked(made.first, made.second)
            }
        }
    }
    return { launcher.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
}

/**
 * A photo picked for a category or a shop as the server takes it: a square of [SIDE] pixels as a data URL. A photo is
 * cut to the square and sent as a JPEG; an image with a clear ground, such as an icon, fits into it whole with a margin
 * and stays a PNG, so the category's colour shows through it. The page and the iPhone do the same.
 */
object CategoryPhoto {
    const val SIDE = 240

    fun make(context: Context, uri: Uri): Pair<String, ImageBitmap>? = runCatching {
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        context.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        val sample = generateSequence(1) { it * 2 }.first { maxOf(bounds.outWidth, bounds.outHeight) / (it * 2) < 1024 }
        val image = context.contentResolver.openInputStream(uri)?.use {
            BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
        } ?: return null
        val clear = hasClearGround(image)
        val square = Bitmap.createBitmap(SIDE, SIDE, Bitmap.Config.ARGB_8888)
        val size = SIDE.toFloat()
        val w = image.width.toFloat()
        val h = image.height.toFloat()
        val scale = if (clear) 0.72f * size / maxOf(w, h) else size / minOf(w, h)
        val target = RectF((size - w * scale) / 2, (size - h * scale) / 2, (size + w * scale) / 2, (size + h * scale) / 2)
        Canvas(square).drawBitmap(image, null, target, Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG))
        val out = ByteArrayOutputStream()
        square.compress(if (clear) Bitmap.CompressFormat.PNG else Bitmap.CompressFormat.JPEG, 85, out)
        val type = if (clear) "image/png" else "image/jpeg"
        "data:$type;base64,${Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)}" to square.asImageBitmap()
    }.getOrNull()

    /** Whether some of the image is see-through, judged on a small copy of it. */
    private fun hasClearGround(image: Bitmap): Boolean {
        if (!image.hasAlpha()) return false
        val small = Bitmap.createScaledBitmap(image, 32, 32, true)
        val pixels = IntArray(32 * 32).also { small.getPixels(it, 0, 32, 0, 0, 32, 32) }
        return pixels.any { (it ushr 24) < 250 }
    }
}

/**
 * The shops of the last three months, the most frequent first, or those a search finds by what they are called or a
 * name the bank gives them; a shop opens to be named and dressed for all its operations. An expense opens its shop here.
 */
@Composable
private fun ShopsPanel(opening: Shop?, opened: () -> Unit) {
    var editing by remember { mutableStateOf<Shop?>(null) }
    var search by rememberSaveable { mutableStateOf("") }
    var query by rememberSaveable { mutableStateOf<String?>(null) }
    LaunchedEffect(opening) {
        if (opening != null) {
            editing = opening
            opened()
        }
    }
    Screen<ShopsScreen>("shops", mapOf("q" to query)) { s ->
        MorePage {
            Count("Магазины за три месяца", s.recent)
            Row(
                Modifier.fillMaxWidth().padding(top = 12.dp, bottom = 10.dp).height(44.dp)
                    .shadow(4.dp, CircleShape, ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f))
                    .background(Lilac.surface, CircleShape).padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Icon(Icons.Outlined.Search, contentDescription = null, tint = Lilac.muted, modifier = Modifier.size(18.dp))
                BasicTextField(
                    search, { search = it }, singleLine = true,
                    textStyle = TextStyle(fontSize = Type.body, color = Lilac.ink),
                    cursorBrush = SolidColor(Lilac.accent),
                    keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search, autoCorrectEnabled = false),
                    keyboardActions = KeyboardActions(onSearch = { query = search.ifEmpty { null } }),
                    modifier = Modifier.weight(1f),
                    decorationBox = { field ->
                        Box {
                            if (search.isEmpty()) LilacText("Найти магазин", Type.body, Lilac.muted, lines = 1)
                            field()
                        }
                    },
                )
                if (search.isNotEmpty()) {
                    Icon(
                        Icons.Filled.Cancel, contentDescription = "Очистить", tint = Lilac.muted,
                        modifier = Modifier.size(18.dp).tap {
                            search = ""
                            query = null
                        },
                    )
                }
            }
            if (s.items.isEmpty()) LilacText("Таких магазинов нет", Type.subheadline, Lilac.muted, modifier = Modifier.padding(top = 18.dp))
            s.items.forEachIndexed { index, item ->
                LilacRow(
                    item.row.logo?.let { LilacMarker.Logo(it) } ?: LilacMarker.icon(item.row), item.row.title, item.row.details, null, "", first = index == 0,
                    modifier = Modifier.testTag(item.row.id).card { editing = item.shop },
                )
            }
        }
    }
    editing?.let { shop -> key(shop.key) { ShopSheet(shop) { editing = null } } }
}

/**
 * A shop as the user names and dresses it for all its operations: on top how it will look, then its name, the site its
 * logo comes from and a photo instead of the logo, and under them the names the bank gives it with how many operations
 * went by each; shops are merged on the web. «Сбросить» takes back all the user did to it.
 */
@Composable
private fun ShopSheet(shop: Shop, onDismiss: () -> Unit) {
    val sender = rememberFormSender()
    var title by remember { mutableStateOf(shop.title) }
    var site by remember { mutableStateOf(shop.site) }
    var photo by remember { mutableStateOf<String?>(null) }
    var picture by remember { mutableStateOf<ImageBitmap?>(null) }
    val pick = rememberPhotoPicker(sender) { url, image ->
        photo = url
        picture = image
    }
    val path = "shops/${shop.key}"
    val hasPhoto = picture != null || (shop.photo && photo == null)
    LilacSheet(
        onDismiss,
        title = "Магазин",
        primary = "Сохранить",
        busy = sender.busy,
        save = {
            val form = mutableMapOf("title" to title, "site" to site)
            photo?.let { form["photo"] = it }
            sender.send(path, form, onDismiss)
        },
        destructive = if (shop.dressed) "Сбросить" to { sender.send("$path/forget", done = onDismiss) } else null,
    ) {
        Box(Modifier.fillMaxWidth().padding(top = 6.dp), contentAlignment = Alignment.Center) {
            val shown = picture
            val logo = shop.logo
            when {
                shown != null -> Image(shown, null, Modifier.size(76.dp).clip(CircleShape).background(Color.White), contentScale = ContentScale.Crop)
                logo != null && !(shop.photo && photo == "") -> LilacMarkerView(LilacMarker.Logo(logo), Modifier.size(76.dp))
                else -> CategoryDisc("bag", Palette.color("gray"), null, 76.dp)
            }
        }
        LilacTextField("Название", title, { title = it }, shop.placeholder, sender.errors["title"])
        LilacTextField("Сайт для значка", site, { site = it }, shop.sitePlaceholder, sender.errors["site"], Keyboard.Url)
        LilacFieldLabel("Фото вместо значка")
        PhotoButtons(hasPhoto, pick) {
            photo = ""
            picture = null
        }
        sender.errors["photo"]?.let { LilacText(it, Type.footnote, Lilac.red) }
        val names = shop.names
        if (!names.isNullOrEmpty()) {
            LilacFieldLabel("Из чего состоит")
            LilacPanel {
                names.forEachIndexed { index, name ->
                    LilacPanelLine(name.name, index == 0) { LilacText("${name.count}", Type.body, Lilac.muted, tabular = true) }
                }
            }
        } else {
            LilacText(shop.note, Type.footnote, Lilac.muted, modifier = Modifier.padding(top = 18.dp))
        }
    }
    ErrorAlert(sender.error)
}
