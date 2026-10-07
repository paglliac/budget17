import SwiftUI

/// The web UI's icons (src/web/icons.ts) as SF Symbols.
enum Icons {
    private static let symbols: [String: String] = [
        "home": "house", "wallet": "wallet.pass", "list": "list.bullet", "pie": "chart.pie", "calendar": "calendar",
        "sliders": "slider.horizontal.3", "bell": "bell", "search": "magnifyingglass", "refresh": "arrow.clockwise",
        "chevronLeft": "chevron.left", "chevronRight": "chevron.right", "chevronDown": "chevron.down", "plus": "plus",
        "x": "xmark", "sparkles": "sparkles", "trendingUp": "chart.line.uptrend.xyaxis",
        "trendingDown": "chart.line.downtrend.xyaxis", "cart": "cart", "coffee": "cup.and.saucer", "bus": "bus",
        "car": "car", "repeat": "repeat", "heart": "heart", "bag": "bag", "shirt": "tshirt", "ticket": "ticket",
        "phone": "iphone", "gift": "gift", "zap": "bolt", "book": "book", "briefcase": "briefcase", "tag": "tag",
        "arrowDownLeft": "arrow.down.left", "arrowUpRight": "arrow.up.right", "arrows": "arrow.left.arrow.right",
        "card": "creditcard", "piggy": "rublesign.circle", "banknote": "banknote", "clock": "clock",
        "receipt": "doc.plaintext", "flag": "flag", "diamond": "diamond", "target": "target",
        "filter": "line.3.horizontal.decrease", "panel": "sidebar.left", "message": "message", "hourglass": "hourglass",
        "layers": "square.3.layers.3d", "more": "ellipsis", "check": "checkmark", "pencil": "pencil",
    ]

    static func symbol(_ name: String) -> String { symbols[name] ?? "tag" }
}

/// Russian words that change with a number.
enum Words {
    /// Picks the form for 1, for 2–4 and for 5 and more: операция, операции, операций.
    static func plural(_ n: Int, _ one: String, _ few: String, _ many: String) -> String {
        let tens = abs(n) % 100, units = tens % 10
        if tens > 10 && tens < 20 { return many }
        if units == 1 { return one }
        if (2...4).contains(units) { return few }
        return many
    }
}

/// Dates as the server sends them: 2026-10-05.
enum Dates {
    static let months = ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"]
    static let weekdays = ["П", "В", "С", "Ч", "П", "С", "В"]

    /// The day of the month, its month in three letters and the year of a date, as the date beside a card shows them.
    static func parts(_ text: String) -> (day: String, month: String, year: String)? {
        let pieces = text.split(separator: "-")
        guard pieces.count == 3, let month = Int(pieces[1]), let day = Int(pieces[2]), (1...12).contains(month) else { return nil }
        return (String(day), months[month - 1], String(pieces[0]))
    }

    /// The date `days` after a date.
    static func adding(_ days: Int, to text: String) -> String {
        guard let date = date(text), let moved = calendar.date(byAdding: .day, value: days, to: date) else { return text }
        return self.text(moved)
    }

    private static let calendar = Calendar(identifier: .gregorian)

    private static let formatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    static func date(_ text: String) -> Date? { formatter.date(from: text) }
    static func text(_ date: Date) -> String { formatter.string(from: date) }
}

// Modifiers that only iOS has; on a Mac, where the sources are only type-checked, they do nothing.
extension View {
    func inlineTitle() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }


    func decimalKeyboard() -> some View {
        #if os(iOS)
        keyboardType(.decimalPad)
        #else
        self
        #endif
    }

    func numberKeyboard() -> some View {
        #if os(iOS)
        keyboardType(.numberPad)
        #else
        self
        #endif
    }

    func plainInput() -> some View {
        #if os(iOS)
        textInputAutocapitalization(.never).autocorrectionDisabled()
        #else
        autocorrectionDisabled()
        #endif
    }

    func urlKeyboard() -> some View {
        #if os(iOS)
        keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
        #else
        autocorrectionDisabled()
        #endif
    }

}
