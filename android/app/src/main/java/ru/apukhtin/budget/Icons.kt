package ru.apukhtin.budget

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.FormatListBulleted
import androidx.compose.material.icons.automirrored.outlined.MenuBook
import androidx.compose.material.icons.automirrored.outlined.TrendingDown
import androidx.compose.material.icons.automirrored.outlined.TrendingUp
import androidx.compose.material.icons.outlined.AccountBalance
import androidx.compose.material.icons.outlined.AccountBalanceWallet
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.AutoAwesome
import androidx.compose.material.icons.outlined.BeachAccess
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.Build
import androidx.compose.material.icons.outlined.Cabin
import androidx.compose.material.icons.outlined.CalendarToday
import androidx.compose.material.icons.outlined.Cake
import androidx.compose.material.icons.outlined.Calculate
import androidx.compose.material.icons.outlined.CardGiftcard
import androidx.compose.material.icons.outlined.Celebration
import androidx.compose.material.icons.outlined.Chair
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Check
import androidx.compose.material.icons.outlined.Checkroom
import androidx.compose.material.icons.outlined.ChevronLeft
import androidx.compose.material.icons.outlined.ChevronRight
import androidx.compose.material.icons.outlined.ChildCare
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.ConfirmationNumber
import androidx.compose.material.icons.outlined.ContentCut
import androidx.compose.material.icons.outlined.CreditCard
import androidx.compose.material.icons.outlined.Diamond
import androidx.compose.material.icons.outlined.DirectionsBus
import androidx.compose.material.icons.outlined.DirectionsCar
import androidx.compose.material.icons.outlined.Eco
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material.icons.outlined.ExpandMore
import androidx.compose.material.icons.outlined.FavoriteBorder
import androidx.compose.material.icons.outlined.FilterList
import androidx.compose.material.icons.outlined.FitnessCenter
import androidx.compose.material.icons.outlined.Flag
import androidx.compose.material.icons.outlined.Flight
import androidx.compose.material.icons.outlined.Group
import androidx.compose.material.icons.outlined.HourglassEmpty
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.Inventory2
import androidx.compose.material.icons.outlined.Key
import androidx.compose.material.icons.outlined.Laptop
import androidx.compose.material.icons.outlined.Layers
import androidx.compose.material.icons.outlined.LocalCafe
import androidx.compose.material.icons.outlined.LocalFireDepartment
import androidx.compose.material.icons.outlined.LocalGasStation
import androidx.compose.material.icons.outlined.LocalParking
import androidx.compose.material.icons.outlined.LocalPizza
import androidx.compose.material.icons.outlined.Luggage
import androidx.compose.material.icons.outlined.MedicalServices
import androidx.compose.material.icons.outlined.Medication
import androidx.compose.material.icons.outlined.MoreHoriz
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.MusicNote
import androidx.compose.material.icons.outlined.NorthEast
import androidx.compose.material.icons.outlined.Notifications
import androidx.compose.material.icons.outlined.Palette
import androidx.compose.material.icons.outlined.Payments
import androidx.compose.material.icons.outlined.PedalBike
import androidx.compose.material.icons.outlined.Percent
import androidx.compose.material.icons.outlined.Pets
import androidx.compose.material.icons.outlined.PhoneIphone
import androidx.compose.material.icons.outlined.PhotoCamera
import androidx.compose.material.icons.outlined.PieChart
import androidx.compose.material.icons.outlined.Receipt
import androidx.compose.material.icons.outlined.Refresh
import androidx.compose.material.icons.outlined.Repeat
import androidx.compose.material.icons.outlined.Restaurant
import androidx.compose.material.icons.outlined.Savings
import androidx.compose.material.icons.outlined.Schedule
import androidx.compose.material.icons.outlined.School
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Sell
import androidx.compose.material.icons.outlined.ShoppingBag
import androidx.compose.material.icons.outlined.ShoppingBasket
import androidx.compose.material.icons.outlined.ShoppingCart
import androidx.compose.material.icons.outlined.SouthWest
import androidx.compose.material.icons.outlined.SportsEsports
import androidx.compose.material.icons.outlined.SwapHoriz
import androidx.compose.material.icons.outlined.TrackChanges
import androidx.compose.material.icons.outlined.Train
import androidx.compose.material.icons.outlined.Tune
import androidx.compose.material.icons.outlined.ViewSidebar
import androidx.compose.material.icons.outlined.WaterDrop
import androidx.compose.material.icons.outlined.Wifi
import androidx.compose.material.icons.outlined.WineBar
import androidx.compose.material.icons.outlined.Work
import androidx.compose.ui.graphics.vector.ImageVector

/** The web UI's icons (src/web/icons.ts) as Material icons, as the iPhone app has them as SF Symbols. */
object WebIcons {
    private val icons: Map<String, ImageVector> = mapOf(
        "home" to Icons.Outlined.Home, "wallet" to Icons.Outlined.AccountBalanceWallet,
        "list" to Icons.AutoMirrored.Outlined.FormatListBulleted, "pie" to Icons.Outlined.PieChart,
        "calendar" to Icons.Outlined.CalendarToday, "sliders" to Icons.Outlined.Tune, "bell" to Icons.Outlined.Notifications,
        "search" to Icons.Outlined.Search, "refresh" to Icons.Outlined.Refresh, "chevronLeft" to Icons.Outlined.ChevronLeft,
        "chevronRight" to Icons.Outlined.ChevronRight, "chevronDown" to Icons.Outlined.ExpandMore, "plus" to Icons.Outlined.Add,
        "x" to Icons.Outlined.Close, "sparkles" to Icons.Outlined.AutoAwesome,
        "trendingUp" to Icons.AutoMirrored.Outlined.TrendingUp, "trendingDown" to Icons.AutoMirrored.Outlined.TrendingDown,
        "cart" to Icons.Outlined.ShoppingCart, "coffee" to Icons.Outlined.LocalCafe, "bus" to Icons.Outlined.DirectionsBus,
        "car" to Icons.Outlined.DirectionsCar, "repeat" to Icons.Outlined.Repeat, "heart" to Icons.Outlined.FavoriteBorder,
        "bag" to Icons.Outlined.ShoppingBag, "shirt" to Icons.Outlined.Checkroom, "ticket" to Icons.Outlined.ConfirmationNumber,
        "phone" to Icons.Outlined.PhoneIphone, "gift" to Icons.Outlined.CardGiftcard, "zap" to Icons.Outlined.Bolt,
        "book" to Icons.AutoMirrored.Outlined.MenuBook, "briefcase" to Icons.Outlined.Work, "tag" to Icons.Outlined.Sell,
        "arrowDownLeft" to Icons.Outlined.SouthWest, "arrowUpRight" to Icons.Outlined.NorthEast,
        "arrows" to Icons.Outlined.SwapHoriz, "card" to Icons.Outlined.CreditCard, "piggy" to Icons.Outlined.Savings,
        "banknote" to Icons.Outlined.Payments, "clock" to Icons.Outlined.Schedule, "receipt" to Icons.Outlined.Receipt,
        "flag" to Icons.Outlined.Flag, "diamond" to Icons.Outlined.Diamond, "target" to Icons.Outlined.TrackChanges,
        "filter" to Icons.Outlined.FilterList, "panel" to Icons.Outlined.ViewSidebar,
        "message" to Icons.Outlined.ChatBubbleOutline, "hourglass" to Icons.Outlined.HourglassEmpty,
        "layers" to Icons.Outlined.Layers, "more" to Icons.Outlined.MoreHoriz, "check" to Icons.Outlined.Check,
        "pencil" to Icons.Outlined.Edit, "basket" to Icons.Outlined.ShoppingBasket, "carrot" to Icons.Outlined.Eco,
        "utensils" to Icons.Outlined.Restaurant, "pizza" to Icons.Outlined.LocalPizza, "wine" to Icons.Outlined.WineBar,
        "cake" to Icons.Outlined.Cake, "fuel" to Icons.Outlined.LocalGasStation, "parking" to Icons.Outlined.LocalParking,
        "train" to Icons.Outlined.Train, "plane" to Icons.Outlined.Flight, "bike" to Icons.Outlined.PedalBike,
        "key" to Icons.Outlined.Key, "droplet" to Icons.Outlined.WaterDrop, "flame" to Icons.Outlined.LocalFireDepartment,
        "wifi" to Icons.Outlined.Wifi, "sofa" to Icons.Outlined.Chair, "wrench" to Icons.Outlined.Build,
        "package" to Icons.Outlined.Inventory2, "laptop" to Icons.Outlined.Laptop, "pill" to Icons.Outlined.Medication,
        "stethoscope" to Icons.Outlined.MedicalServices, "dumbbell" to Icons.Outlined.FitnessCenter,
        "scissors" to Icons.Outlined.ContentCut, "baby" to Icons.Outlined.ChildCare, "users" to Icons.Outlined.Group,
        "paw" to Icons.Outlined.Pets, "partyPopper" to Icons.Outlined.Celebration, "film" to Icons.Outlined.Movie,
        "gamepad" to Icons.Outlined.SportsEsports, "music" to Icons.Outlined.MusicNote, "palette" to Icons.Outlined.Palette,
        "luggage" to Icons.Outlined.Luggage, "tent" to Icons.Outlined.Cabin, "umbrella" to Icons.Outlined.BeachAccess,
        "graduation" to Icons.Outlined.School, "percent" to Icons.Outlined.Percent, "landmark" to Icons.Outlined.AccountBalance,
        "plusMinus" to Icons.Outlined.Calculate, "camera" to Icons.Outlined.PhotoCamera,
    )

    fun icon(name: String): ImageVector = icons[name] ?: Icons.Outlined.Sell
}
