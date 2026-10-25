package ru.apukhtin.budget

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.defaultMinSize
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.FormatListBulleted
import androidx.compose.material.icons.automirrored.outlined.FormatListBulleted
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.MoreHoriz
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.testTagsAsResourceId
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.zIndex
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch

/**
 * The app's one window. An intent may carry a link of a widget (budget://week, sort, operations, regular, extras), and
 * on the emulator a server to use, `-e server http://10.0.2.2:4318`, as the iPhone takes `-server` from a test run.
 */
class MainActivity : ComponentActivity() {
    /** The last link opened, counted so the same one twice still opens. */
    private var link by mutableStateOf<Pair<String, Int>?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val clear = android.graphics.Color.TRANSPARENT
        enableEdgeToEdge(SystemBarStyle.auto(clear, clear), SystemBarStyle.auto(clear, clear))
        val session = Session.of(this)
        useTestServer(session, intent)
        open(intent)
        pinWidget(intent)
        setContent {
            CompositionLocalProvider(LocalSession provides session) {
                // Tags of rows and lines show to UI Automator as ids, for android/screens.sh to find them.
                Box(Modifier.semantics { testTagsAsResourceId = true }) { RootView(link) }
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        useTestServer(Session.of(this), intent)
        open(intent)
        pinWidget(intent)
    }

    /**
     * On a test run, `-e pin week` asks the launcher to put that widget on the home screen, for android/screens.sh to
     * look at; the launcher asks first, as when a person adds one.
     */
    private fun pinWidget(intent: Intent) {
        val name = intent.getStringExtra("pin") ?: return
        val receiver = mapOf(
            "week" to WeekWidgetReceiver::class.java, "today" to TodayWidgetReceiver::class.java, "savings" to SavingsWidgetReceiver::class.java,
            "payment" to PaymentWidgetReceiver::class.java, "extras" to ExtrasWidgetReceiver::class.java,
        )[name] ?: return
        getSystemService(android.appwidget.AppWidgetManager::class.java)?.requestPinAppWidget(android.content.ComponentName(this, receiver), null, null)
    }

    private fun open(intent: Intent) {
        val host = intent.data?.takeIf { it.scheme == "budget" }?.host ?: return
        link = host to (link?.second ?: 0) + 1
    }

    /** Only the Mac as the emulator sees it: nothing else can switch the phone's server this way. */
    private fun useTestServer(session: Session, intent: Intent) {
        val server = intent.getStringExtra("server")?.takeIf { it.startsWith("http://10.0.2.2:") } ?: return
        if (session.address == server) return
        lifecycleScope.launch { runCatching { session.signIn(server, "") } }
    }
}

enum class Tab { Wishes, Operations, Home, Plan, More }

/**
 * The login until a server is set, then the screens over the tab bar. Each tab keeps its place while another shows; a
 * tap on the open «Главная» brings the main page back. Coming back to the app asks the server to sync with ZenMoney.
 */
@Composable
fun RootView(link: Pair<String, Int>?) {
    val session = LocalSession.current
    if (session.server == null) {
        LoginScreen()
        return
    }
    var tab by rememberSaveable { mutableStateOf(Tab.Home) }
    // What the operations show: all of them, a kind, or the expenses that wait for a category.
    var filter by remember { mutableStateOf<OperationsFilter>(OperationsFilter.All) }
    // The week the plan shows; null is the current one. The main page's «Зарезервировано» opens the plan on its week.
    var planWeek by rememberSaveable { mutableStateOf<String?>(null) }
    var morePart by rememberSaveable { mutableStateOf(MorePart.Regular) }
    // A shop an expense opened, which «Ещё» shows on its tab of shops.
    var shop by remember { mutableStateOf<Shop?>(null) }
    // Counts the returns to the main page: a tap on the open «Главная» and a link from the week's widget.
    var homeReturns by remember { mutableIntStateOf(0) }
    // Counts the links from the extras' widget, which open this month on its extras.
    var extrasOpens by remember { mutableIntStateOf(0) }

    val scope = rememberCoroutineScope()
    LaunchedEffect(session.version) { session.refreshPending() }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { scope.launch { session.sync() } }
    LaunchedEffect(link) {
        when (link?.first ?: return@LaunchedEffect) {
            "sort" -> {
                filter = OperationsFilter.Pending
                tab = Tab.Operations
            }
            "operations" -> {
                filter = OperationsFilter.All
                tab = Tab.Operations
            }
            "regular" -> {
                morePart = MorePart.Regular
                tab = Tab.More
            }
            "extras" -> {
                tab = Tab.Home
                extrasOpens += 1
            }
            else -> {
                tab = Tab.Home
                homeReturns += 1
            }
        }
    }

    val openShop = { opened: Shop ->
        shop = opened
        morePart = MorePart.Shops
        tab = Tab.More
    }
    CompositionLocalProvider(LocalOpenShop provides openShop) {
        Column(Modifier.fillMaxSize().lilacBackground()) {
            Box(Modifier.weight(1f).fillMaxWidth().statusBarsPadding()) {
                // Every tab stays composed, so it keeps its place; only the open one shows, on top, and takes every touch.
                Tab.entries.forEach { value ->
                    val open = tab == value
                    Box(
                        Modifier.fillMaxSize().zIndex(if (open) 1f else 0f).alpha(if (open) 1f else 0f)
                            .then(if (open) Modifier.pointerInput(Unit) {} else Modifier.clearAndSetSemantics {}),
                    ) {
                        when (value) {
                            Tab.Wishes -> WishesView()
                            Tab.Operations -> OperationsView(filter) { filter = it }
                            Tab.Home -> BudgetView(homeReturns, extrasOpens, openPending = {
                                filter = OperationsFilter.Pending
                                tab = Tab.Operations
                            }, openPlan = {
                                planWeek = it
                                tab = Tab.Plan
                            }, openWishes = { tab = Tab.Wishes })
                            Tab.Plan -> PlanView(planWeek) { planWeek = it }
                            Tab.More -> MoreView(morePart, { morePart = it }, shop) { shop = null }
                        }
                    }
                }
            }
            TabBar(tab, session.pending, select = { tab = it }) { if (it == Tab.Home) homeReturns += 1 }
        }
    }
}

/**
 * The tabs after the user's picture of 2026-10-12: a white bar with round top corners, «Желания» and «Операции» on one
 * side, «План» and «Ещё» on the other, and «Главная» raised between them as the main page's circle, the user's mascot.
 * The picked tab is violet and filled, the circle gets a violet ring; the operations carry how many expenses wait.
 */
@Composable
private fun TabBar(tab: Tab, pending: Int, select: (Tab) -> Unit, reselect: (Tab) -> Unit) {
    val haptics = LocalHapticFeedback.current
    fun pick(value: Tab) {
        if (value == tab) {
            reselect(value)
        } else {
            haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
            select(value)
        }
    }
    val shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)
    Box(Modifier.fillMaxWidth()) {
        Row(
            Modifier.fillMaxWidth()
                .shadow(14.dp, shape, ambientColor = Color.Black.copy(alpha = 0.25f), spotColor = Color.Black.copy(alpha = 0.25f))
                .background(Lilac.surface, shape)
                .windowInsetsPadding(WindowInsets.navigationBars)
                .padding(horizontal = 6.dp)
                .padding(top = 10.dp, bottom = 6.dp),
        ) {
            TabItem(Icons.Outlined.AutoAwesome, Icons.Filled.AutoAwesome, "Желания", tab == Tab.Wishes, Modifier.weight(1f)) { pick(Tab.Wishes) }
            TabItem(Icons.AutoMirrored.Outlined.FormatListBulleted, Icons.AutoMirrored.Filled.FormatListBulleted, "Операции", tab == Tab.Operations, Modifier.weight(1f), pending) {
                pick(Tab.Operations)
            }
            Spacer(Modifier.width(84.dp))
            TabItem(Icons.Outlined.CalendarToday, Icons.Filled.CalendarToday, "План", tab == Tab.Plan, Modifier.weight(1f)) { pick(Tab.Plan) }
            TabItem(Icons.Outlined.MoreHoriz, Icons.Filled.MoreHoriz, "Ещё", tab == Tab.More, Modifier.weight(1f)) { pick(Tab.More) }
        }
        // «Главная»: the main page's circle in a lilac halo, standing above the bar's edge.
        val picked = tab == Tab.Home
        Box(
            Modifier.align(Alignment.TopCenter).offset(y = (-15).dp)
                .semantics { contentDescription = "Главная"; selected = picked }
                .card { pick(Tab.Home) }
                .background(Lilac.tint, CircleShape)
                .padding(7.dp),
        ) {
            Mascot(56.dp, Modifier.shadow(5.dp, CircleShape).then(if (picked) Modifier.border(2.dp, Lilac.accent, CircleShape) else Modifier))
        }
    }
}

@Composable
private fun TabItem(icon: ImageVector, filled: ImageVector, label: String, picked: Boolean, modifier: Modifier, badge: Int = 0, onClick: () -> Unit) {
    val color = if (picked) Lilac.accent else Lilac.muted
    Column(
        modifier.semantics { contentDescription = if (badge > 0) "$label, $badge" else label; selected = picked }.tap(onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Box(Modifier.size(44.dp, 26.dp), contentAlignment = Alignment.Center) {
            Icon(if (picked) filled else icon, contentDescription = null, tint = color, modifier = Modifier.size(24.dp))
            if (badge > 0) {
                LilacText(
                    "$badge", Type.caption2, Color.White, FontWeight.Bold, lines = 1,
                    modifier = Modifier.align(Alignment.TopEnd).offset(2.dp, (-5).dp)
                        .defaultMinSize(minWidth = 17.dp, minHeight = 17.dp)
                        .background(Lilac.accent, CircleShape)
                        .padding(horizontal = 5.dp),
                )
            }
        }
        LilacText(label, 11.sp, color, if (picked) FontWeight.SemiBold else FontWeight.Medium, lines = 1)
    }
}

/** The first screen, until a server is set. */
@Composable
private fun LoginScreen() {
    Column(
        Modifier.fillMaxSize().lilacBackground().windowInsetsPadding(WindowInsets.safeDrawing)
            .verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).padding(bottom = 24.dp),
    ) {
        LilacText("Бюджет", 40.sp, weight = FontWeight.Bold, modifier = Modifier.padding(top = 40.dp))
        ServerForm("Войти")
    }
}
