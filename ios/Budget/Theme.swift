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
        "basket": "basket", "carrot": "carrot", "utensils": "fork.knife", "pizza": "takeoutbag.and.cup.and.straw",
        "wine": "wineglass", "cake": "birthday.cake", "fuel": "fuelpump", "parking": "parkingsign", "train": "tram",
        "plane": "airplane", "bike": "bicycle", "key": "key", "droplet": "drop", "flame": "flame", "wifi": "wifi",
        "sofa": "sofa", "wrench": "wrench.and.screwdriver", "package": "shippingbox", "laptop": "laptopcomputer",
        "pill": "pills", "stethoscope": "stethoscope", "dumbbell": "dumbbell", "scissors": "scissors",
        "baby": "figure.and.child.holdinghands", "users": "person.2", "paw": "pawprint", "partyPopper": "party.popper",
        "film": "film", "gamepad": "gamecontroller", "music": "music.note", "palette": "paintpalette",
        "luggage": "suitcase", "tent": "tent", "umbrella": "umbrella", "graduation": "graduationcap",
        "percent": "percent", "landmark": "building.columns", "plusMinus": "plusminus", "camera": "camera",
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

// Modifiers that only iOS has; on a Mac, where the sources are only type-checked, they do nothing.
extension View {
    func inlineTitle() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }


    func hiddenNavigationBar() -> some View {
        #if os(iOS)
        toolbar(.hidden, for: .navigationBar)
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
