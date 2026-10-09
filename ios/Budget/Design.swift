import SwiftUI

// The look of the app, after the reference the user picked on 2026-10-09: a warm white page with soft lilac light, large
// figures in a heavy face with ₽ as heavy, a large soft circle holding what is free and what is reserved, and rows on
// the page itself under quiet headings, each with a dot in a halo. Choices sit on a light track with the picked one on
// white; forms put the name and the amount large and their main button violet at the bottom. What is touched answers:
// a row gives under the finger, the picked choice slides with a tick, a figure counts to its new value.

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
    let items: [Segment<Value>]
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
    @Environment(\.isEnabled) private var enabled

    var body: some View {
        Button(action: action) { LilacRoundLabel(systemImage: systemImage).opacity(enabled ? 1 : 0.4) }
            .buttonStyle(.plain)
            .accessibilityLabel(label)
    }
}

/// What a round white button looks like, for a menu's label too.
struct LilacRoundLabel: View {
    let systemImage: String

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: 17, weight: .medium))
            .foregroundStyle(Color.primary)
            .frame(width: 42, height: 42)
            .background(Lilac.surface, in: Circle())
            .shadow(color: .black.opacity(0.07), radius: 8, y: 3)
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
    /// A plus or a minus before the amount, as operations show it.
    var signed = false
    var amountColor: Color = .primary
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
                    Text(Money.text(amount, symbol, sign: signed))
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(amountColor)
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
         muted: Bool = false, first: Bool = false, chevron: Bool = true, signed: Bool = false, amountColor: Color = .primary) {
        self.init(marker: marker, title: title, details: details, amount: amount, symbol: symbol, chip: chip, muted: muted, first: first,
                  chevron: chevron, signed: signed, amountColor: amountColor, accessory: { EmptyView() })
    }
}

extension LilacMarker {
    /// A row's icon from the server on a halo of its colour.
    static func icon(_ row: Row) -> LilacMarker {
        .symbol(Icons.symbol(row.icon), Palette.color(row.color))
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

/// A screen's title in the new style, large, with buttons at its end such as search or the gear.
struct LilacTitle<Trailing: View>: View {
    let text: String
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(alignment: .center, spacing: 8) {
            Text(text).font(.system(size: 32, weight: .bold))
            Spacer(minLength: 8)
            trailing()
        }
        .padding(.top, 6)
    }
}

extension LilacTitle where Trailing == EmptyView {
    init(_ text: String) {
        self.init(text: text, trailing: { EmptyView() })
    }
}

/// A screen's main figure with what it is over it and what it is out of under it.
struct LilacSummary: View {
    /// nil when a heading over it already says what it is.
    let label: String?
    let amount: Double
    let symbol: String
    var note: String?
    var size: CGFloat = 36

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let label { Text(label).font(.subheadline).foregroundStyle(Lilac.muted) }
            LilacAmount(amount: amount, symbol: symbol, size: size)
            if let note, !note.isEmpty { Text(note).font(.subheadline).foregroundStyle(Lilac.muted) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Two figures side by side with a hairline between, such as what was spent and what came in.
struct LilacFigures: View {
    struct Item: Hashable {
        let label: String
        let amount: Double
        var sign = false
        var color: Color = .primary
        var note: String?
    }

    let items: [Item]
    let symbol: String

    var body: some View {
        HStack(alignment: .top, spacing: 20) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if index > 0 { Rectangle().fill(Lilac.hairline).frame(width: 0.5, height: 52) }
                VStack(alignment: .leading, spacing: 2) {
                    Text(Money.text(item.amount, symbol, sign: item.sign))
                        .font(.system(size: 22, weight: .bold))
                        .monospacedDigit()
                        .foregroundStyle(item.color)
                        .lineLimit(1)
                        .minimumScaleFactor(0.6)
                    Text(item.label).font(.subheadline).foregroundStyle(Lilac.muted)
                    if let note = item.note { Text(note).font(.footnote).foregroundStyle(Lilac.muted) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

/// A bar of a total's parts, each in its colour, on a track, with a legend of figures under it that leaves out the parts
/// of nothing.
struct LilacShareBar: View {
    let parts: [Total.Part]

    var body: some View {
        let shown = parts.filter { $0.value > 0.5 }
        let sum = max(shown.reduce(0) { $0 + $1.value }, 1)
        VStack(alignment: .leading, spacing: 10) {
            GeometryReader { geometry in
                HStack(spacing: 3) {
                    ForEach(shown, id: \.label) { part in
                        Capsule()
                            .fill(part.tone == "gray" ? Lilac.soft.opacity(0.6) : Palette.color(part.tone))
                            .frame(width: max((geometry.size.width - CGFloat(shown.count - 1) * 3) * part.value / sum, 8))
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Lilac.track, in: Capsule())
            }
            .frame(height: 12)
            HStack(spacing: 14) {
                ForEach(shown, id: \.label) { part in
                    HStack(spacing: 5) {
                        Circle().fill(part.tone == "gray" ? Lilac.soft : Palette.color(part.tone)).frame(width: 7, height: 7)
                        Text("\(part.label.lowercased()) \(Money.number(part.value))").monospacedDigit()
                    }
                }
            }
            .font(.footnote)
            .foregroundStyle(Lilac.muted)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
        }
    }
}

/// A line across a list at today, between what is behind and what is ahead.
struct LilacTodayLine: View {
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            Text(text).font(.footnote.weight(.semibold)).foregroundStyle(Lilac.accent)
            Rectangle().fill(Lilac.accent.opacity(0.45)).frame(height: 1)
        }
        .padding(.vertical, 8)
    }
}

/// A small action inside a row, such as «Принять» or «Запланировать».
struct LilacInlineAction: View {
    let label: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(label)
                .font(.footnote.weight(.semibold))
                .padding(.horizontal, 12)
                .frame(height: 28)
                .foregroundStyle(Lilac.accent)
                .background(Lilac.tint, in: Capsule())
        }
        .buttonStyle(.plain)
        .padding(.top, 4)
    }
}

/// What a list says when it has nothing to show.
struct LilacEmpty: View {
    let text: String

    var body: some View {
        Text(text).font(.subheadline).foregroundStyle(Lilac.muted).padding(.vertical, 18).frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Chips in a row that scrolls sideways, the picked one on white, each with its count; a count can be a violet badge,
/// as «Ждут разбора» has.
struct LilacFilterChips<Value: Hashable>: View {
    struct Item: Identifiable {
        let value: Value
        let label: String
        var count: Int?
        var badge = false
        var id: String { label }
    }

    let items: [Item]
    @Binding var selection: Value

    var body: some View {
        ScrollView(.horizontal) {
            HStack(spacing: 8) {
                ForEach(items) { item in
                    let picked = item.value == selection
                    Button { withAnimation(.snappy) { selection = item.value } } label: {
                        HStack(spacing: 6) {
                            Text(item.label)
                            if let count = item.count {
                                if item.badge {
                                    Text("\(count)")
                                        .font(.caption.weight(.bold))
                                        .foregroundStyle(.white)
                                        .padding(.horizontal, 6)
                                        .frame(minWidth: 20, minHeight: 20)
                                        .background(Lilac.accent, in: Capsule())
                                } else {
                                    Text("\(count)").foregroundStyle(Lilac.muted).monospacedDigit()
                                }
                            }
                        }
                        .font(.subheadline.weight(picked ? .semibold : .regular))
                        .foregroundStyle(picked ? Color.primary : Color.primary.opacity(0.7))
                        .padding(.horizontal, 14)
                        .frame(height: 38)
                        .background(picked ? Lilac.surface : Lilac.track, in: Capsule())
                        .shadow(color: .black.opacity(picked ? 0.07 : 0), radius: 6, y: 2)
                    }
                    .buttonStyle(.plain)
                    .accessibilityIdentifier("filter-\(item.label)")
                    .accessibilityAddTraits(picked ? .isSelected : [])
                }
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 4)
        }
        .scrollIndicators(.hidden)
        .padding(.horizontal, -20)
        .sensoryFeedback(.selection, trigger: selection)
    }
}

/// A form of the new style: a cross that closes it, its name and a destructive action on top, the fields on the page's
/// light, and its main button at the bottom.
struct LilacForm<Content: View>: View {
    var title: String?
    var destructive: (label: String, action: () -> Void)?
    var primary: String?
    var busy = false
    var save: () -> Void = {}
    @ViewBuilder var content: () -> Content
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            ZStack {
                if let title { Text(title).font(.headline).lineLimit(1).padding(.horizontal, 90) }
                HStack {
                    Button { dismiss() } label: {
                        Image(systemName: "xmark").font(.system(size: 18, weight: .medium)).frame(width: 40, height: 40).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(primary == nil ? "Готово" : "Отмена")
                    Spacer()
                    if let destructive {
                        Button(destructive.label, action: destructive.action).foregroundStyle(Lilac.red)
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) { content() }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, 24)
                    .padding(.top, 8)
                    .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            if let primary {
                LilacPrimaryButton(label: primary, busy: busy, action: save)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 12)
                    .accessibilityIdentifier("form-save")
            }
        }
        .background(LilacBackground())
    }
}

/// A field of a form under its label, white and rounded, with its error under it.
struct LilacTextField: View {
    let label: String
    @Binding var text: String
    var placeholder = ""
    var error: String?
    var keyboard: Keyboard = .text

    enum Keyboard { case text, decimal, number, url, secret }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            LilacFieldLabel(text: label)
            field
                .padding(.horizontal, 16)
                .frame(minHeight: 52)
                .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
            FieldError(text: error).padding(.top, 4)
        }
    }

    @ViewBuilder
    private var field: some View {
        switch keyboard {
        case .text: TextField(placeholder, text: $text)
        case .decimal: TextField(placeholder, text: $text).decimalKeyboard()
        case .number: TextField(placeholder, text: $text).numberKeyboard()
        case .url: TextField(placeholder, text: $text).urlKeyboard()
        case .secret: SecureField(placeholder, text: $text).plainInput()
        }
    }
}

/// A white rounded block of a form or a sheet holding a few lines, such as a setting and its value.
struct LilacPanel<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content() }
            .padding(.horizontal, 16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
    }
}

/// A line of a panel: a name and its value or a control, a hairline above all but the first.
struct LilacPanelLine<Trailing: View>: View {
    let title: String
    var first = false
    var titleColor: Color = .primary
    @ViewBuilder var trailing: () -> Trailing

    var body: some View {
        HStack(spacing: 12) {
            Text(title).foregroundStyle(titleColor)
            Spacer(minLength: 8)
            trailing()
        }
        .frame(minHeight: 52)
        .overlay(alignment: .top) { if !first { Rectangle().fill(Lilac.hairline).frame(height: 0.5) } }
    }
}

/// A choice of a switch: its value and its name.
struct Segment<Value: Hashable>: Identifiable {
    let value: Value
    let label: String
    var id: String { label }
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
                .background(Color(rgb: 0x1C1B21), in: Capsule())
                .shadow(color: .black.opacity(0.18), radius: 8, y: 3)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("offline")
        .accessibilityLabel("Нет связи с сервером, сохранено \(Dates.moment(date))")
    }
}

