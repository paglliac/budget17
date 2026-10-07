import SwiftUI

// Prototype: the looks being compared, switched by a floating pill. A is the app as it is; B takes the air out of the
// same blocks; C also keeps only what asks for a decision in sight and folds the rest.

enum Variant: String, CaseIterable {
    case a = "A", b = "B", c = "C"

    /// B and C: the same blocks with less air.
    var tight: Bool { self != .a }
    /// C: what needs no decision is folded or left out.
    var essential: Bool { self == .c }

    /// The variant to start with, from a launch argument: -variant C.
    static var launch: Variant { UserDefaults.standard.string(forKey: "variant").flatMap(Variant.init(rawValue:)) ?? .a }
}

extension EnvironmentValues {
    @Entry var variant = Variant.a
    /// Set inside a RowGroup, where a card is a row of the group rather than a card of its own.
    @Entry var inRowGroup = false
}

/// The floating switch between the variants.
struct VariantSwitch: View {
    @Binding var variant: Variant

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Variant.allCases, id: \.self) { item in
                Button { withAnimation(.snappy) { variant = item } } label: {
                    Text(item.rawValue)
                        .font(.caption.weight(.bold))
                        .frame(width: 28, height: 28)
                        .foregroundStyle(item == variant ? Ink.band : .white)
                        .background(item == variant ? Color.white : .clear, in: Circle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("variant-\(item.rawValue)")
            }
        }
        .padding(3)
        .background(Ink.band.opacity(0.92), in: Capsule())
        .shadow(color: .black.opacity(0.2), radius: 6, y: 2)
    }
}

/// Cards of one day or one list as rows of a single rounded block, split by hairlines.
struct RowGroup<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) { content }
            .environment(\.inRowGroup, true)
            .background(Ink.surface)
            // Every row draws a hairline over itself; the first one's is covered.
            .overlay(alignment: .top) { Rectangle().fill(Ink.surface).frame(height: 1) }
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

/// What needs no decision, folded into one quiet row: a tap shows it.
struct FoldRow<Content: View>: View {
    let title: String
    let count: Int
    let amount: Double?
    let symbol: String
    @ViewBuilder var content: Content
    @State private var open = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Button { withAnimation(.snappy) { open.toggle() } } label: {
                HStack(spacing: 6) {
                    Text(title).font(.subheadline.weight(.semibold))
                    Text("\(count)").font(.subheadline).foregroundStyle(Ink.muted)
                    Image(systemName: "chevron.down")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(Ink.muted)
                        .rotationEffect(.degrees(open ? 180 : 0))
                    Spacer()
                    if let amount { Text(Money.text(amount, symbol)).font(.subheadline.monospacedDigit()).foregroundStyle(Ink.muted) }
                }
                .padding(.horizontal, 4)
                .padding(.top, 8)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if open { RowGroup { content }.opacity(0.7) }
        }
    }
}

/// Variant C's summary: the figure with what it is made of beside it rather than under it, then the bar.
struct SideSummary: View {
    let total: Total
    let symbol: String

    var body: some View {
        let parts = total.parts ?? []
        let legend = parts.filter { $0.value >= 0.5 && abs($0.value - total.amount) >= 0.5 }
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                BigAmount(amount: total.amount, symbol: symbol)
                Spacer(minLength: 0)
                VStack(alignment: .trailing, spacing: 2) {
                    ForEach(legend, id: \.label) { part in
                        HStack(spacing: 5) {
                            Text("\(part.label.lowercased()) \(Money.number(part.value))").monospacedDigit()
                            Circle().fill(Palette.color(part.tone)).frame(width: 6, height: 6)
                        }
                    }
                }
                .font(.caption)
                .foregroundStyle(Ink.muted)
                .lineLimit(1)
                .fixedSize()
            }
            if !parts.isEmpty { SummaryBar(parts: parts, total: total.amount, legendShown: false) }
        }
    }
}
