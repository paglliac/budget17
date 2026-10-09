import SwiftUI

// The look of the app, after the reference the user picked: a light top that tells what the screen is about, a dark
// band that switches what is under it, and a sheet of cards below, each with its icon or whom it went to on a tile of
// its colour. The room goes to the cards: the top and the band keep only what tells something. What is touched answers:
// a card gives under the finger, the picked pill slides, the main figure counts to its new value.

enum Ink {
    /// The sheet of cards.
    static let canvas = Color(light: 0xF1F1F4, dark: 0x0B0B0D)
    /// The top and the cards.
    static let surface = Color(light: 0xFFFFFF, dark: 0x1C1C1F)
    /// The band between the top and the sheet, dark in both modes.
    static let band = Color(rgb: 0x17171C)
    static let pill = Color(rgb: 0x2C2C34)
    static let muted = Color(rgb: 0x8E8E98)
    static let hairline = Color(light: 0xE4E4E9, dark: 0x2C2C30)
    /// The empty track of a bar.
    static let track = Color(light: 0xE6E6EB, dark: 0x2C2C30)
    /// What is picked or today, such as a day of the week: black on light, white on dark.
    static let strong = Color(light: 0x17171C, dark: 0xF4F4F6)
    static let onStrong = Color(light: 0xFFFFFF, dark: 0x17171C)
    static let violet = Palette.extra
}

/// A screen of the app: the header that always stays, the summary under it that the sheet can cover, the band that
/// switches the sheet, and the sheet of cards. Dragging the band up gives the sheet the summary's room, down gives it
/// back.
struct SplitScreen<Header: View, Summary: View, Band: View, Content: View>: View {
    @ViewBuilder var header: Header
    @ViewBuilder var summary: Summary
    @ViewBuilder var band: Band
    @ViewBuilder var content: Content
    @State private var expanded = false

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 10) {
                header
                if !expanded {
                    summary.transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 20)
            .padding(.bottom, 14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                UnevenRoundedRectangle(bottomLeadingRadius: 28, bottomTrailingRadius: 28, style: .continuous)
                    .fill(Ink.surface)
                    .ignoresSafeArea(edges: .top)
            }
            band
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .contentShape(Rectangle())
                .gesture(DragGesture(minimumDistance: 8).onEnded { value in
                    withAnimation(.snappy) { expanded = value.translation.height < 0 }
                })
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("band")
                .accessibilityAction(named: expanded ? "Показать сводку" : "Развернуть список") {
                    withAnimation(.snappy) { expanded.toggle() }
                }
            // The gap over the list keeps cards out of the sheet's round corners as they scroll by.
            VStack(spacing: 0) {
                Color.clear.frame(height: 10)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 6) { content }
                        .padding(.horizontal, 16)
                        .padding(.bottom, 24)
                }
            }
            .background {
                UnevenRoundedRectangle(topLeadingRadius: 28, topTrailingRadius: 28, style: .continuous)
                    .fill(Ink.canvas)
                    .ignoresSafeArea(edges: .bottom)
            }
        }
        .background(Ink.band.ignoresSafeArea())
    }
}

/// The header of a screen: its title or a switch on the left, steps or a button on the right.
struct TopHeader<Leading: View, Trailing: View>: View {
    @ViewBuilder var leading: Leading
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 10) {
            leading
            Spacer(minLength: 8)
            trailing
        }
        .frame(minHeight: 34)
    }
}

extension TopHeader where Trailing == EmptyView {
    init(@ViewBuilder leading: () -> Leading) {
        self.init(leading: leading, trailing: { EmptyView() })
    }
}

/// A round button of the header, such as a step back or forth.
struct HeaderButton: View {
    let systemImage: String
    let label: String
    var action: (() -> Void)?

    var body: some View {
        Button { action?() } label: {
            Image(systemName: systemImage)
                .font(.subheadline.weight(.semibold))
                .frame(width: 32, height: 32)
                .background(Ink.canvas, in: Circle())
        }
        .buttonStyle(.plain)
        .foregroundStyle(action == nil ? Ink.muted.opacity(0.5) : Color.primary)
        .disabled(action == nil)
        .accessibilityLabel(label)
    }
}

/// Back, a way to the current period when another one is open, and forth.
struct PeriodSteps: View {
    let back: (() -> Void)?
    let forward: (() -> Void)?
    /// Set when another period than the current one is open.
    let toCurrent: (() -> Void)?

    var body: some View {
        HStack(spacing: 8) {
            if let toCurrent {
                Button("Сейчас", action: toCurrent)
                    .font(.subheadline.weight(.medium))
                    .padding(.horizontal, 12)
                    .frame(height: 32)
                    .background(Ink.canvas, in: Capsule())
                    .buttonStyle(.plain)
            }
            HeaderButton(systemImage: "chevron.left", label: "Раньше", action: back)
            HeaderButton(systemImage: "chevron.right", label: "Позже", action: forward)
        }
    }
}

/// The figure a screen is about, large, in whole rubles with the symbol quieter; red when it is below zero. An expense,
/// whose figure is exact, shows its kopecks.
struct BigAmount: View {
    let amount: Double
    let symbol: String
    var size: CGFloat = 38
    var kopecks = false

    var body: some View {
        let cents = Int((abs(amount) * 100).rounded())
        let whole = Double(cents / 100) * (amount < 0 ? -1 : 1)
        let rest = kopecks ? String(format: ",%02d\u{00A0}%@", cents % 100, symbol) : "\u{00A0}\(symbol)"
        (Text(Money.number(kopecks ? whole : amount)).foregroundStyle(amount < 0 ? Palette.color("red") : Color.primary)
            + Text(rest).foregroundStyle(Ink.muted))
            .font(.system(size: size, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .contentTransition(.numericText(value: amount))
            .animation(.snappy, value: amount)
    }
}

/// A small button beside the figure, such as what the week allows, to change it; violet when it is not the usual.
struct SummaryChip: View {
    let text: String
    var highlighted = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Text(text).monospacedDigit()
                Image(systemName: "pencil").font(.caption2.weight(.bold))
            }
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, 11)
            .frame(height: 30)
            .foregroundStyle(highlighted ? Ink.violet : Ink.muted)
            .background(highlighted ? Ink.violet.opacity(0.12) : Ink.canvas, in: Capsule())
        }
        .buttonStyle(.plain)
        .fixedSize()
    }
}

/// A total's parts as one bar, with a legend of figures under it: the coloured parts fill the bar from the left and a
/// grey part, such as what is free, is the bar's empty track. The legend leaves out a part of nothing and the part that
/// only repeats the figure over the bar, such as what is free under what can be spent.
struct SummaryBar: View {
    let parts: [Total.Part]
    let total: Double

    var body: some View {
        let shown = parts.filter { $0.value > 0.5 }
        let sum = shown.reduce(0) { $0 + $1.value }
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { geometry in
                HStack(spacing: 0) {
                    ForEach(shown, id: \.label) { part in
                        Rectangle()
                            .fill(part.tone == "gray" ? Ink.track : Palette.color(part.tone))
                            .frame(width: geometry.size.width * part.value / max(sum, 1))
                    }
                }
                .clipShape(Capsule())
                .background(Ink.track, in: Capsule())
            }
            .frame(height: 10)
            HStack(spacing: 12) {
                ForEach(parts.filter { $0.value >= 0.5 && abs($0.value - total) >= 0.5 }, id: \.label) { part in
                    HStack(spacing: 5) {
                        Circle().fill(Palette.color(part.tone)).frame(width: 6, height: 6)
                        Text("\(part.label.lowercased()) \(Money.number(part.value))")
                    }
                }
            }
            .font(.caption)
            .foregroundStyle(Ink.muted)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
    }
}

/// A quiet line over the figure, such as what it is or of which month.
struct SummaryLabel<Trailing: View>: View {
    let text: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(text).font(.subheadline.weight(.medium)).foregroundStyle(Ink.muted)
            Spacer()
            trailing()
        }
    }
}

extension SummaryLabel where Trailing == EmptyView {
    init(_ text: String) {
        self.init(text: text, trailing: { EmptyView() })
    }
}

/// An item of the band: a pill that is white when picked.
struct BandItem<Value: Hashable>: Identifiable {
    let value: Value
    let label: String
    var id: String { label }
}

/// Pills on the dark band that switch what the sheet shows.
/// Pills on the dark band that switch what the sheet shows; the white of the picked one slides to the next with a tick.
struct BandSwitch<Value: Hashable>: View {
    let items: [BandItem<Value>]
    @Binding var selection: Value
    @Namespace private var pills

    var body: some View {
        HStack(spacing: 8) {
            ForEach(items) { item in
                BandPill(label: item.label, selected: item.value == selection, namespace: pills) {
                    withAnimation(.snappy) { selection = item.value }
                }
            }
        }
        .sensoryFeedback(.selection, trigger: selection)
    }
}

struct BandPill: View {
    var label: String?
    var systemImage: String?
    let selected: Bool
    /// The pills of one switch, whose white slides between them.
    var namespace: Namespace.ID?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage { Image(systemName: systemImage) }
                if let label { Text(label).lineLimit(1) }
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, label == nil ? 9 : 12)
            .frame(height: 32)
            .foregroundStyle(selected ? Ink.band : .white.opacity(0.9))
            .background {
                Capsule().fill(Ink.pill)
                if selected {
                    if let namespace {
                        Capsule().fill(Color.white).matchedGeometryEffect(id: "picked", in: namespace)
                    } else {
                        Capsule().fill(Color.white)
                    }
                }
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A day's heading across the sheet: Вчера with 6 октября, вторник, and the day's total when there is one.
struct DayHeading: View {
    let title: String
    let subtitle: String
    var total: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(title).font(.subheadline.weight(.semibold))
            Text(subtitle).font(.subheadline).foregroundStyle(Ink.muted)
            Spacer()
            if let total { Text(total).font(.subheadline.monospacedDigit()).foregroundStyle(Ink.muted) }
        }
        .padding(.horizontal, 4)
        .padding(.top, 8)
    }
}

/// A card of the sheet: the icon on a tile at its left, the title with the amount over the details and where it counts.
/// An expense or an operation shows the first letter of whom it went to instead of the icon, as banks do.
struct Card<Accessory: View>: View {
    let row: Row
    let symbol: String
    var signed = false
    var amountColor: Color = .primary
    /// The row is an expense or an operation, and its title is whom the money went to or came from.
    var monogram = false
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            IconTile(icon: row.icon, color: Palette.color(row.color), letter: monogram ? row.title : nil)
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(row.title).font(.body.weight(.medium)).lineLimit(2)
                    Spacer(minLength: 8)
                    if let amount = row.amount {
                        Text(Money.text(amount, symbol, sign: signed))
                            .font(.system(.body, design: .rounded).weight(.semibold))
                            .monospacedDigit()
                            .foregroundStyle(amountColor)
                            .fixedSize()
                    }
                }
                if !row.details.isEmpty || row.mark != nil {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(row.details).font(.footnote).foregroundStyle(Ink.muted).lineLimit(2)
                        Spacer(minLength: 6)
                        // The week is where an expense counts unless the dot says otherwise.
                        if row.mark != "week" { MarkDot(mark: row.mark) }
                    }
                }
                accessory()
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Ink.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 10, y: 3)
        .opacity(row.muted ? 0.55 : 1)
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

extension Card where Accessory == EmptyView {
    init(row: Row, symbol: String, signed: Bool = false, amountColor: Color = .primary, monogram: Bool = false) {
        self.init(row: row, symbol: symbol, signed: signed, amountColor: amountColor, monogram: monogram, accessory: { EmptyView() })
    }
}

/// A card's icon, white on a tile of its colour, or the first letter of a name on a circle of it.
struct IconTile: View {
    let icon: String
    let color: Color
    var letter: String?

    var body: some View {
        if let first = letter?.first(where: { $0.isLetter || $0.isNumber }) {
            Text(String(first).uppercased())
                .font(.system(size: 18, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(color.gradient, in: Circle())
        } else {
            Image(systemName: Icons.symbol(icon))
                .symbolVariant(.fill)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: 40, height: 40)
                .background(color.gradient, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }
}

/// A card as a button: it gives under the finger and springs back.
struct CardButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

extension ButtonStyle where Self == CardButtonStyle {
    static var card: CardButtonStyle { CardButtonStyle() }
}

/// A small button inside a card, such as «Принять».
struct CardAction: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 12)
                .frame(height: 30)
                .foregroundStyle(Ink.violet)
                .background(Ink.violet.opacity(0.12), in: Capsule())
        }
        .buttonStyle(.plain)
        .padding(.top, 2)
    }
}

/// A heading inside the sheet, small and in capitals.
struct SheetLabel: View {
    let text: String

    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.semibold))
            .tracking(0.6)
            .foregroundStyle(Ink.muted)
            .padding(.horizontal, 4)
            .padding(.top, 10)
    }
}

/// A card that adds something, at the end of its list.
struct AddCard: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(label, systemImage: "plus")
                .font(.subheadline.weight(.medium))
                .foregroundStyle(Ink.violet)
                .frame(maxWidth: .infinity, minHeight: 48)
                .background {
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .strokeBorder(Ink.violet.opacity(0.35), style: StrokeStyle(lineWidth: 1.2, dash: [5, 4]))
                }
        }
        .buttonStyle(.plain)
    }
}

/// What the sheet says when it has nothing to show.
struct EmptyCard: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.subheadline)
            .foregroundStyle(Ink.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Ink.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// A line across the sheet at today, between what is behind and what is ahead.
struct TodayLine: View {
    let text: String

    var body: some View {
        HStack(spacing: 8) {
            Text(text).font(.caption.weight(.semibold)).foregroundStyle(Ink.violet)
            Rectangle().fill(Ink.violet.opacity(0.5)).frame(height: 1)
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 4)
    }
}

/// Over the sheet while the server cannot be reached: when the shown screen was saved. A tap opens the server, to try
/// another one.
struct OfflinePill: View {
    let date: Date
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Label(Dates.moment(date), systemImage: "wifi.slash")
                .font(.footnote.weight(.semibold))
                .monospacedDigit()
                .padding(.horizontal, 14)
                .frame(height: 34)
                .foregroundStyle(.white)
                .background(Ink.band, in: Capsule())
                .shadow(color: .black.opacity(0.18), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("offline")
        .accessibilityLabel("Нет связи с сервером, сохранено \(Dates.moment(date))")
    }
}

// MARK: - The new style

// The look the user picked for the main page on 2026-10-09: a warm white page with soft lilac light, a large circle
// that holds what is free on a lilac lens and what is reserved beside it, figures in a heavy face with ₽ as heavy, and
// rows on the page itself under quiet headings, each with a dot in a halo.

extension EnvironmentValues {
    /// The height of the tab bar over the screens, for a page that has to keep its end above it.
    @Entry var tabBarHeight: CGFloat = 0
}

enum Lilac {
    static let canvas = Color(light: 0xF7F6F3, dark: 0x0E0E11)
    static let surface = Color(light: 0xFFFFFF, dark: 0x1C1B21)
    static let muted = Color(light: 0x8B8A93, dark: 0x908F99)
    static let hairline = Color(light: 0xE8E6EB, dark: 0x2A2930)
    /// The track of a switch or a bar.
    static let track = Color(light: 0xEDECEF, dark: 0x22212A)
    /// What is picked or today, and what is required.
    static let accent = Color(light: 0x6B4EF6, dark: 0x8F7CFF)
    /// The ground of a picked tab, a halo or a chip.
    static let tint = Color(light: 0xEEEAFE, dark: 0x2B2650)
    /// What is flexible: the lighter part of a bar.
    static let soft = Color(light: 0xC9BEFA, dark: 0x5546A6)
    /// The lens of the circle, light at its top and deeper at its rim.
    static let lensTop = Color(light: 0xF5F2FE, dark: 0x3A3170)
    static let lensBottom = Color(light: 0xB4A3F7, dark: 0x5E4BC4)
    static let red = Palette.color("red")
}

/// A figure in the heavy face, ₽ as heavy as its digits; red when it is below zero.
struct LilacAmount: View {
    let amount: Double
    let symbol: String
    var size: CGFloat = 30
    var weight: Font.Weight = .bold

    var body: some View {
        Text(Money.text(amount, symbol))
            .font(.system(size: size, weight: weight))
            .monospacedDigit()
            .foregroundStyle(amount < -0.5 ? Lilac.red : Color.primary)
            .lineLimit(1)
            .minimumScaleFactor(0.55)
            .contentTransition(.numericText(value: amount))
            .animation(.snappy, value: amount)
    }
}

/// The page under the new style: warm white with soft lilac light at its corners.
struct LilacBackground: View {
    var body: some View {
        GeometryReader { geometry in
            let size = geometry.size
            ZStack {
                Lilac.canvas
                Ellipse()
                    .fill(Lilac.tint)
                    .frame(width: size.width * 0.9, height: size.height * 0.32)
                    .rotationEffect(.degrees(-28))
                    .offset(x: size.width * 0.5, y: -size.height * 0.36)
                    .blur(radius: 50)
                Ellipse()
                    .fill(Lilac.tint.opacity(0.8))
                    .frame(width: size.width * 1.1, height: size.height * 0.28)
                    .rotationEffect(.degrees(-12))
                    .offset(x: -size.width * 0.3, y: size.height * 0.48)
                    .blur(radius: 60)
            }
        }
        .ignoresSafeArea()
    }
}

/// Two or more choices on a track, the picked one on white that slides to the next with a tick, such as «Неделя» and
/// «Месяц».
struct LilacSegmented<Value: Hashable>: View {
    let items: [BandItem<Value>]
    @Binding var selection: Value
    /// nil takes the width there is.
    var width: CGFloat? = 210
    @Namespace private var segments

    var body: some View {
        HStack(spacing: 0) {
            ForEach(items) { item in
                let picked = item.value == selection
                Button { withAnimation(.snappy) { selection = item.value } } label: {
                    Text(item.label)
                        .font(.subheadline.weight(picked ? .semibold : .regular))
                        .foregroundStyle(picked ? Color.primary : Lilac.muted)
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                        .background {
                            if picked {
                                RoundedRectangle(cornerRadius: 13, style: .continuous)
                                    .fill(Lilac.surface)
                                    .shadow(color: .black.opacity(0.07), radius: 6, y: 2)
                                    .matchedGeometryEffect(id: "picked", in: segments)
                            }
                        }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(picked ? .isSelected : [])
            }
        }
        .padding(3)
        .frame(width: width)
        .background(Lilac.track, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// A plain icon button of the new style's header, such as the calendar.
struct LilacIconButton: View {
    let systemImage: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .symbolVariant(.none)
                .font(.system(size: 21, weight: .light))
                .foregroundStyle(Lilac.accent)
                .frame(width: 40, height: 40)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// A small capsule, such as «Сейчас» or what the week allows.
struct LilacChip: View {
    let text: String
    var systemImage: String?
    var highlighted = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                Text(text).monospacedDigit()
                if let systemImage { Image(systemName: systemImage).font(.caption2.weight(.bold)) }
            }
            .font(.footnote.weight(.semibold))
            .padding(.horizontal, 11)
            .frame(height: 28)
            .foregroundStyle(highlighted ? Lilac.accent : Color.primary.opacity(0.7))
            .background(highlighted ? Lilac.tint : Lilac.surface.opacity(0.7), in: Capsule())
        }
        .buttonStyle(.plain)
        .fixedSize()
    }
}

/// The days of a week by their short names with a dot under each: today on a violet disc in a halo, a picked day in a
/// halo, a day with spending darker than one without, days ahead faint.
struct LilacDayStrip: View {
    let start: String
    let today: String
    /// Days with spending.
    let active: Set<String>
    var picked: String?
    let tap: (String) -> Void

    var body: some View {
        HStack(spacing: 0) {
            ForEach((0..<7).map { Dates.adding($0, to: start) }, id: \.self) { day in
                let isToday = day == today
                let ahead = day > today
                Button { tap(day) } label: {
                    VStack(spacing: 8) {
                        Text(Dates.weekdayShort(day))
                            .font(.subheadline.weight(isToday || picked == day ? .semibold : .regular))
                            .foregroundStyle(isToday || picked == day ? Color.primary : Lilac.muted)
                        marker(day, isToday: isToday, ahead: ahead)
                            .frame(width: 34, height: 34)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                // A day ahead has no spending to show yet; it keeps its look.
                .allowsHitTesting(!ahead)
                .accessibilityLabel(Dates.parts(day).map { "\($0.day) \($0.month)" } ?? day)
                .accessibilityAddTraits(picked == day ? .isSelected : [])
            }
        }
    }

    @ViewBuilder
    private func marker(_ day: String, isToday: Bool, ahead: Bool) -> some View {
        if isToday {
            ZStack {
                Circle().fill(Lilac.tint)
                Circle().fill(Lilac.accent).padding(6)
                Circle().fill(Color.white).frame(width: 7, height: 7)
            }
            .overlay { if picked == day { Circle().strokeBorder(Lilac.accent.opacity(0.5), lineWidth: 1.5) } }
        } else if picked == day {
            ZStack {
                Circle().fill(Lilac.tint)
                Circle().fill(Lilac.accent).frame(width: 9, height: 9)
            }
        } else {
            Circle()
                .fill(active.contains(day) ? Lilac.muted : Lilac.muted.opacity(0.4))
                .frame(width: 6, height: 6)
        }
    }
}

/// A heading over rows, with a round button such as «+» at its end.
struct LilacHeading<Trailing: View>: View {
    let title: String
    var subtitle: String?
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text(title).font(.title3.weight(.semibold))
            if let subtitle { Text(subtitle).font(.subheadline).foregroundStyle(Lilac.muted) }
            Spacer()
            trailing()
        }
        .padding(.top, 22)
        .padding(.bottom, 4)
    }
}

extension LilacHeading where Trailing == EmptyView {
    init(_ title: String, subtitle: String? = nil) {
        self.init(title: title, subtitle: subtitle, trailing: { EmptyView() })
    }
}

/// A day's heading over its rows: Вчера with 8 октября, четверг, and the day's total.
struct LilacDayHeading: View {
    let title: String
    let subtitle: String
    var total: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Text(title).font(.subheadline.weight(.semibold))
            Text(subtitle).font(.subheadline).foregroundStyle(Lilac.muted)
            Spacer()
            if let total { Text(total).font(.subheadline.monospacedDigit()).foregroundStyle(Lilac.muted) }
        }
        .padding(.top, 18)
        .padding(.bottom, 2)
    }
}

/// A round white button with a symbol, such as the «+» of a heading.
struct LilacRoundButton: View {
    let systemImage: String
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Color.primary)
                .frame(width: 42, height: 42)
                .background(Lilac.surface, in: Circle())
                .shadow(color: .black.opacity(0.07), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

/// What leads a row: a dot in a halo of its colour, a ring for something flexible or outside, or a symbol.
enum LilacMarker: Hashable {
    case dot(Color)
    case ring(Color)
    case symbol(String, Color)

    @ViewBuilder
    var view: some View {
        switch self {
        case .dot(let color):
            ZStack {
                Circle().fill(color.opacity(0.16))
                Circle().fill(color).frame(width: 10, height: 10)
            }
        case .ring(let color):
            ZStack {
                Circle().fill(color.opacity(0.14))
                Circle().strokeBorder(color, lineWidth: 2.5).frame(width: 14, height: 14)
            }
        case .symbol(let name, let color):
            Image(systemName: name)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(color)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(color.opacity(0.16), in: Circle())
        }
    }
}

/// A row on the page: its marker, the title over its details, the amount over a chip such as where it counts, and a
/// chevron when it opens. A hairline parts it from the row above.
struct LilacRow<Accessory: View>: View {
    let marker: LilacMarker
    let title: String
    let details: String
    let amount: Double?
    let symbol: String
    var chip: (text: String, color: Color)?
    var muted = false
    var first = false
    var chevron = true
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        HStack(alignment: .center, spacing: 14) {
            marker.view.frame(width: 30, height: 30)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.body).foregroundStyle(Color.primary).lineLimit(2)
                if !details.isEmpty {
                    Text(details).font(.subheadline).foregroundStyle(Lilac.muted).lineLimit(2)
                }
                accessory()
            }
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 5) {
                if let amount {
                    Text(Money.text(amount, symbol))
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(Color.primary)
                        .fixedSize()
                }
                if let chip {
                    Text(chip.text)
                        .font(.caption.weight(.medium))
                        .foregroundStyle(chip.color)
                        .padding(.horizontal, 8)
                        .frame(height: 22)
                        .background(chip.color.opacity(0.12), in: Capsule())
                        .fixedSize()
                }
            }
            if chevron {
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(Lilac.muted.opacity(0.7))
            }
        }
        .padding(.vertical, 13)
        .opacity(muted ? 0.5 : 1)
        .overlay(alignment: .top) {
            if !first { Rectangle().fill(Lilac.hairline).frame(height: 0.5).padding(.leading, 44) }
        }
        .contentShape(Rectangle())
    }
}

extension LilacRow where Accessory == EmptyView {
    init(marker: LilacMarker, title: String, details: String, amount: Double?, symbol: String, chip: (text: String, color: Color)? = nil,
         muted: Bool = false, first: Bool = false, chevron: Bool = true) {
        self.init(marker: marker, title: title, details: details, amount: amount, symbol: symbol, chip: chip, muted: muted, first: first,
                  chevron: chevron, accessory: { EmptyView() })
    }
}

/// A row that adds something, at the end of its list.
struct LilacAddRow: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Lilac.accent)
                    .frame(width: 30, height: 30)
                    .background(Lilac.tint, in: Circle())
                Text(label).font(.body).foregroundStyle(Lilac.accent)
                Spacer()
            }
            .padding(.vertical, 12)
            .overlay(alignment: .top) { Rectangle().fill(Lilac.hairline).frame(height: 0.5).padding(.leading, 44) }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

/// A bar of two parts, the strong one first, on a track; with nothing in it the track alone shows.
struct LilacBar: View {
    let first: Double
    let second: Double

    var body: some View {
        GeometryReader { geometry in
            let sum = max(first + second, 1)
            let gap: CGFloat = first > 0.5 && second > 0.5 ? 3 : 0
            HStack(spacing: gap) {
                if first > 0.5 {
                    Capsule().fill(LinearGradient(colors: [Lilac.accent.opacity(0.75), Lilac.accent], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max((geometry.size.width - gap) * first / sum, 12))
                }
                if second > 0.5 {
                    Capsule().fill(Lilac.soft)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Lilac.track, in: Capsule())
        }
        .frame(height: 14)
    }
}

/// The main button of a form, violet from edge to edge, such as «Сохранить».
struct LilacPrimaryButton: View {
    let label: String
    var busy = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.headline)
                .foregroundStyle(.white)
                .frame(maxWidth: .infinity)
                .frame(height: 54)
                .background(LinearGradient(colors: [Color(rgb: 0x9C8BF8), Color(rgb: 0x6E52F5)], startPoint: .leading, endPoint: .trailing), in: Capsule())
                .shadow(color: Color(rgb: 0x6E52F5).opacity(0.3), radius: 14, y: 6)
                .opacity(busy ? 0.6 : 1)
        }
        .buttonStyle(.card)
        .disabled(busy)
    }
}

/// A choice between two or more options as tiles, each with its name and what it means, the picked one lilac.
struct LilacChoiceTiles: View {
    struct Choice: Identifiable {
        let value: String
        let title: String
        let hint: String
        var id: String { value }
    }

    let choices: [Choice]
    @Binding var selection: String

    var body: some View {
        HStack(spacing: 10) {
            ForEach(choices) { choice in
                let picked = choice.value == selection
                Button { withAnimation(.snappy) { selection = choice.value } } label: {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(choice.title).font(.body.weight(.semibold)).foregroundStyle(picked ? Lilac.accent : Color.primary)
                        Text(choice.hint).font(.subheadline).foregroundStyle(picked ? Lilac.accent.opacity(0.8) : Lilac.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 16)
                    .padding(.vertical, 16)
                    .background(picked ? Lilac.tint : Lilac.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .shadow(color: .black.opacity(picked ? 0 : 0.05), radius: 8, y: 3)
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(picked ? .isSelected : [])
            }
        }
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// A quiet label over a field of a form, such as «Тип траты».
struct LilacFieldLabel: View {
    let text: String

    var body: some View {
        Text(text).font(.subheadline).foregroundStyle(Lilac.muted).padding(.top, 22).padding(.bottom, 8)
    }
}
