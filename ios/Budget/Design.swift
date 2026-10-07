import SwiftUI

// The look of the app, after the reference the user picked: a light top that tells what the screen is about, a dark
// band that switches what is under it, and a sheet of cards below, each with its date or icon beside it.

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
    /// What is picked or today, such as a day of the week: black on light, white on dark.
    static let strong = Color(light: 0x17171C, dark: 0xF4F4F6)
    static let onStrong = Color(light: 0xFFFFFF, dark: 0x17171C)
    static let violet = Palette.extra
}

/// A screen of the app: the header that always stays, the summary under it that the sheet can cover, the band that
/// switches the sheet, and the sheet of cards. Dragging or tapping the grabber gives the sheet the summary's room.
struct SplitScreen<Header: View, Summary: View, Band: View, Content: View>: View {
    @ViewBuilder var header: Header
    @ViewBuilder var summary: Summary
    @ViewBuilder var band: Band
    @ViewBuilder var content: Content
    @State private var expanded = false

    var body: some View {
        VStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 16) {
                header
                if !expanded {
                    summary.transition(.move(edge: .top).combined(with: .opacity))
                }
            }
            .padding(.horizontal, 20)
            .padding(.top, 4)
            .padding(.bottom, 18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background {
                UnevenRoundedRectangle(bottomLeadingRadius: 28, bottomTrailingRadius: 28, style: .continuous)
                    .fill(Ink.surface)
                    .ignoresSafeArea(edges: .top)
            }
            band
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .frame(maxWidth: .infinity, alignment: .leading)
            VStack(spacing: 0) {
                grabber
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 10) { content }
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

    private var grabber: some View {
        Capsule()
            .fill(Ink.muted.opacity(0.35))
            .frame(width: 38, height: 5)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .contentShape(Rectangle())
            .onTapGesture { withAnimation(.snappy) { expanded.toggle() } }
            .gesture(DragGesture(minimumDistance: 8).onEnded { value in
                withAnimation(.snappy) { expanded = value.translation.height < 0 }
            })
            .accessibilityLabel(expanded ? "Показать сводку" : "Развернуть список")
            .accessibilityAddTraits(.isButton)
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
        .frame(minHeight: 44)
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
                .font(.body.weight(.semibold))
                .frame(width: 36, height: 36)
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
                    .frame(height: 36)
                    .background(Ink.canvas, in: Capsule())
                    .buttonStyle(.plain)
            }
            HeaderButton(systemImage: "chevron.left", label: "Раньше", action: back)
            HeaderButton(systemImage: "chevron.right", label: "Позже", action: forward)
        }
    }
}

/// The figure a screen is about, large, with its kopecks and symbol quieter; red when it is below zero.
struct BigAmount: View {
    let amount: Double
    let symbol: String
    var size: CGFloat = 38

    var body: some View {
        let kopecks = Int((abs(amount) * 100).rounded())
        let whole = Double(kopecks / 100) * (amount < 0 ? -1 : 1)
        (Text(Money.number(whole)).foregroundStyle(amount < 0 ? Palette.color("red") : Color.primary)
            + Text(String(format: ",%02d\u{00A0}%@", kopecks % 100, symbol)).foregroundStyle(Ink.muted))
            .font(.system(size: size, weight: .semibold, design: .rounded))
            .monospacedDigit()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
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

/// A total's parts as one bar, with a legend of figures under it.
struct SummaryBar: View {
    let parts: [Total.Part]

    var body: some View {
        let shown = parts.filter { $0.value > 0.5 }
        let sum = shown.reduce(0) { $0 + $1.value }
        VStack(alignment: .leading, spacing: 8) {
            GeometryReader { geometry in
                HStack(spacing: 3) {
                    ForEach(shown, id: \.label) { part in
                        Capsule()
                            .fill(Palette.color(part.tone))
                            .frame(width: max(4, (geometry.size.width - CGFloat(max(shown.count - 1, 0)) * 3) * part.value / max(sum, 1)))
                    }
                }
            }
            .frame(height: 6)
            HStack(spacing: 12) {
                ForEach(parts, id: \.label) { part in
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
struct BandSwitch<Value: Hashable>: View {
    let items: [BandItem<Value>]
    @Binding var selection: Value

    var body: some View {
        HStack(spacing: 8) {
            ForEach(items) { item in
                BandPill(label: item.label, selected: item.value == selection) {
                    withAnimation(.snappy) { selection = item.value }
                }
            }
        }
    }
}

struct BandPill: View {
    var label: String?
    var systemImage: String?
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let systemImage { Image(systemName: systemImage) }
                if let label { Text(label).lineLimit(1) }
            }
            .font(.subheadline.weight(.medium))
            .padding(.horizontal, label == nil ? 11 : 14)
            .frame(height: 36)
            .foregroundStyle(selected ? Ink.band : .white.opacity(0.9))
            .background(selected ? Color.white : Ink.pill, in: Capsule())
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
        .padding(.top, 10)
    }
}

/// A card of the sheet: the title with the amount, then the icon, the details and where it counts.
struct Card<Accessory: View>: View {
    let row: Row
    let symbol: String
    var signed = false
    var amountColor: Color = .primary
    /// The small icon before the details; left out when the icon stands beside the card.
    var showsIcon = true
    @ViewBuilder var accessory: () -> Accessory

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(row.title).font(.body.weight(.medium)).lineLimit(2)
                Spacer(minLength: 8)
                if let amount = row.amount {
                    Text(Money.text(amount, symbol, sign: signed))
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(amountColor)
                        .fixedSize()
                }
            }
            if !row.details.isEmpty || row.mark != nil {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if showsIcon {
                        Image(systemName: Icons.symbol(row.icon))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(Palette.color(row.color))
                    }
                    Text(row.details).font(.footnote).foregroundStyle(Ink.muted).lineLimit(2)
                    Spacer(minLength: 6)
                    MarkDot(mark: row.mark)
                }
            }
            accessory()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Ink.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .opacity(row.muted ? 0.55 : 1)
        .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

extension Card where Accessory == EmptyView {
    init(row: Row, symbol: String, signed: Bool = false, amountColor: Color = .primary, showsIcon: Bool = true) {
        self.init(row: row, symbol: symbol, signed: signed, amountColor: amountColor, showsIcon: showsIcon, accessory: { EmptyView() })
    }
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
