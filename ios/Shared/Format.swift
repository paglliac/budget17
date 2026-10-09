import SwiftUI

// What the app and its widget both draw with: the palette and money as the web UI writes it.

/// The web UI's tones (src/web/styles.css); categories may bring a colour of their own as #rrggbb.
enum Palette {
    static let tones: [String: UInt32] = [
        "yellow": 0xF2BE45, "violet": 0x8C6CEF, "teal": 0x4FC4A2, "blue": 0x5BB5EE, "orange": 0xEE7B3C,
        "pink": 0xE2678B, "green": 0x3FA46A, "red": 0xE5484D, "gray": 0xA3A39E,
    ]

    static func color(_ name: String) -> Color {
        if let rgb = tones[name] { return Color(rgb: rgb) }
        if name.hasPrefix("#"), let rgb = UInt32(name.dropFirst(), radix: 16) { return Color(rgb: rgb) }
        return Color(rgb: tones["gray"]!)
    }

    static let week = color("yellow")
    static let extra = color("violet")
}

extension Color {
    nonisolated init(rgb: UInt32) {
        self.init(red: Double((rgb >> 16) & 0xFF) / 255, green: Double((rgb >> 8) & 0xFF) / 255, blue: Double(rgb & 0xFF) / 255)
    }

    /// One colour in light mode and another in dark. UIKit picks between them on SwiftUI's render thread, so the
    /// choice is tied to no actor: one tied to the main actor traps there.
    nonisolated init(light: UInt32, dark: UInt32) {
        #if os(iOS)
        self.init(uiColor: UIColor { @Sendable traits in
            let rgb = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(red: CGFloat((rgb >> 16) & 0xFF) / 255, green: CGFloat((rgb >> 8) & 0xFF) / 255, blue: CGFloat(rgb & 0xFF) / 255, alpha: 1)
        })
        #else
        self.init(rgb: light)
        #endif
    }
}

/// Money as the web UI writes it: 12 340 руб., a real minus, no kopecks unless asked.
enum Money {
    private static func formatter(cents: Bool) -> NumberFormatter {
        let formatter = NumberFormatter()
        formatter.locale = Locale(identifier: "ru_RU")
        formatter.numberStyle = .decimal
        formatter.groupingSeparator = "\u{00A0}"
        formatter.decimalSeparator = ","
        formatter.minimumFractionDigits = cents ? 2 : 0
        formatter.maximumFractionDigits = cents ? 2 : 0
        return formatter
    }

    private static let whole = formatter(cents: false)
    private static let cents = formatter(cents: true)

    /// An amount to the kopeck, as an expense's sheet shows it: 1 500,00 ₽.
    static func exact(_ amount: Double, _ symbol: String) -> String {
        let text = cents.string(from: NSNumber(value: abs(amount))) ?? String(format: "%.2f", abs(amount))
        return "\(amount < 0 ? "−" : "")\(text)\u{00A0}\(symbol)"
    }

    static func number(_ amount: Double, sign: Bool = false) -> String {
        let rounded = amount.rounded()
        let text = whole.string(from: NSNumber(value: abs(rounded))) ?? "\(Int(abs(rounded)))"
        if rounded == 0 { return text }
        if rounded < 0 { return "−\(text)" }
        return sign ? "+\(text)" : text
    }

    static func text(_ amount: Double, _ symbol: String, sign: Bool = false) -> String {
        "\(number(amount, sign: sign))\u{00A0}\(symbol)"
    }

    /// An amount as it is being typed, its thousands apart: 7000 becomes 7 000, 1500,5 becomes 1 500,5.
    static func typing(_ text: String) -> String {
        let kept = text.replacingOccurrences(of: ".", with: ",").filter { $0.isNumber || $0 == "," }
        let parts = kept.split(separator: ",", maxSplits: 1, omittingEmptySubsequences: false)
        var grouped = ""
        for (index, digit) in (parts.first ?? "").reversed().enumerated() {
            if index > 0 && index % 3 == 0 { grouped.append("\u{00A0}") }
            grouped.append(digit)
        }
        grouped = String(grouped.reversed())
        return parts.count > 1 ? "\(grouped),\(parts[1].filter(\.isNumber).prefix(2))" : grouped
    }

    /// An amount as the user would type it into a form: 1500 or 1500,5.
    static func input(_ amount: Double) -> String {
        amount == amount.rounded() ? String(Int(amount)) : String(amount).replacingOccurrences(of: ".", with: ",")
    }
}
