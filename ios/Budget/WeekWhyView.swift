import SwiftUI

/// Why a week went below zero (prototype/week-why), after the user's picture of 2026-10-14, opened from the red figure
/// on the main circle: on top what was free just before the week went there, where it is and the change between; then
/// a card for each section the server gives, the last expenses, what cost more than planned and the optional ones,
/// each row on a tile red, or orange when optional; then the week's spending and plan. A long run of last expenses
/// shows its first few and opens to the rest.
struct WeekWhyView: View {
    let week: String
    @Binding var sheet: BudgetSheet?
    let openSpending: () -> Void
    let openPlan: () -> Void
    /// Sections opened past their first few rows.
    @State private var unfolded: Set<String> = []
    @Environment(\.tabBarHeight) private var tabBarHeight

    /// How many rows a section shows before it opens to the rest.
    private static let folded = 5

    var body: some View {
        Screen(path: "week-why", query: ["week": week]) { (s: WeekWhyScreen) in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    WhyHero(screen: s)
                    ForEach(s.sections) { section in self.section(section, symbol: s.symbol) }
                    checks
                }
                .padding(.horizontal, 20)
                .padding(.top, 6)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
        }
        .safeAreaPadding(.bottom, tabBarHeight)
        .background(LilacBackground())
        .lilacTitle("Почему неделя ушла в минус")
    }

    private func section(_ section: WhySection, symbol: String) -> some View {
        let whole = unfolded.contains(section.id) || section.rows.count <= Self.folded + 1
        let rows = whole ? section.rows : Array(section.rows.prefix(Self.folded))
        return WhyCard {
            HStack(alignment: .firstTextBaseline) {
                Text(section.title).font(.title3.weight(.semibold))
                Spacer(minLength: 8)
                if let total = section.total {
                    Text(Money.text(total, symbol, sign: true))
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(section.id == "optional" ? Palette.optional : Lilac.red)
                }
            }
            .padding(.bottom, 4)
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, item in
                if let day = item.day, day != (index > 0 ? rows[index - 1].day : nil) {
                    Text(day).font(.subheadline.weight(.medium)).foregroundStyle(Lilac.muted).padding(.top, index > 0 ? 10 : 4)
                }
                Button { open(item) } label: { WhyRowView(item: item, symbol: symbol, first: index == 0 || item.day != rows[index - 1].day) }
                    .buttonStyle(.card)
                    .accessibilityIdentifier(item.id)
            }
            if !whole {
                Button {
                    withAnimation(.snappy) { _ = unfolded.insert(section.id) }
                } label: {
                    Text("Ещё \(section.rows.count - rows.count)")
                        .font(.subheadline.weight(.medium))
                        .foregroundStyle(Lilac.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                        .background(Lilac.tint, in: Capsule())
                }
                .buttonStyle(.card)
                .padding(.top, 6)
                .accessibilityIdentifier("\(section.id)-more")
            }
            if let without = section.without {
                WhyWithout(figure: without, symbol: symbol).padding(.top, 10)
            }
        }
    }

    private var checks: some View {
        WhyCard {
            Text("Что можно проверить").font(.title3.weight(.semibold)).padding(.bottom, 4)
            Button(action: openSpending) { WhyLinkRow(icon: "list.bullet", title: "Траты недели", first: true) }
                .buttonStyle(.card)
                .accessibilityIdentifier("why-spending")
            Button(action: openPlan) { WhyLinkRow(icon: "chart.pie", title: "План недели", first: false) }
                .buttonStyle(.card)
                .accessibilityIdentifier("why-plan")
        }
    }

    private func open(_ item: WhyRow) {
        if let spending = item.spending {
            sheet = .spending(spending)
        } else if item.plan {
            openPlan()
        }
    }
}

/// A white rounded card of the screen, as the picture has them.
private struct WhyCard<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 0) { content() }
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 26, style: .continuous))
            .shadow(color: .black.opacity(0.05), radius: 12, y: 4)
    }
}

/// What the week was headed for and where it is, an arrow between, the change under them on a red or green pill, and
/// lilac and violet waves along the bottom.
private struct WhyHero: View {
    let screen: WeekWhyScreen

    var body: some View {
        let s = screen
        VStack(spacing: 14) {
            HStack(alignment: .center, spacing: 6) {
                figure(s.was, title: "Было")
                Image(systemName: "arrow.right")
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(Lilac.accent)
                    .frame(width: 44, height: 44)
                    .background(Lilac.tint, in: Circle())
                figure(s.now, title: "Стало")
            }
            let falling = s.change.amount < -0.5
            VStack(spacing: 2) {
                Text(s.change.label).font(.subheadline).foregroundStyle(Lilac.muted)
                LilacAmount(amount: s.change.amount, symbol: s.symbol, size: 30, color: falling ? Lilac.red : Palette.color("green"))
            }
            .padding(.horizontal, 26)
            .padding(.vertical, 10)
            .background((falling ? Lilac.red : Palette.color("green")).opacity(0.1), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        }
        .padding(.top, 20)
        .padding(.bottom, 40)
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity)
        .background(alignment: .bottom) {
            // A lilac swell on the left and a violet one on the right, as the picture has them under the change.
            ZStack(alignment: .bottom) {
                Wave(level: 0.42, amplitude: 22, phase: 4.4)
                    .fill(Lilac.soft.opacity(0.55))
                    .mask(LinearGradient(stops: [.init(color: .black, location: 0), .init(color: .black, location: 0.4), .init(color: .clear, location: 0.62)], startPoint: .leading, endPoint: .trailing))
                Wave(level: 0.4, amplitude: 22, phase: 5.6)
                    .fill(LinearGradient(colors: [Lilac.soft, Lilac.wave], startPoint: .leading, endPoint: .trailing))
                    .mask(LinearGradient(stops: [.init(color: .clear, location: 0.55), .init(color: .black, location: 0.78)], startPoint: .leading, endPoint: .trailing))
            }
            .frame(height: 96)
        }
        .background(LinearGradient(colors: [Lilac.surface, Lilac.lensTop], startPoint: .top, endPoint: .bottom))
        .clipShape(RoundedRectangle(cornerRadius: 26, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 26, style: .continuous).strokeBorder(Lilac.surface, lineWidth: 4))
        .shadow(color: .black.opacity(0.06), radius: 14, y: 6)
    }

    private func figure(_ f: Figure, title: String) -> some View {
        VStack(spacing: 4) {
            Text(title).font(.subheadline).foregroundStyle(Lilac.muted)
            Text(Money.text(f.amount, screen.symbol, sign: true))
                .font(.system(size: 28, weight: .bold))
                .monospacedDigit()
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText(value: f.amount))
            Text(f.label).font(.footnote).foregroundStyle(Lilac.muted).lineLimit(1).minimumScaleFactor(0.8)
        }
        .frame(maxWidth: .infinity)
    }
}

/// A row: its icon on a tile red below zero, orange when optional, green above, its title over what tells why, and
/// its signed amount.
private struct WhyRowView: View {
    let item: WhyRow
    let symbol: String
    let first: Bool

    var body: some View {
        let r = item.row
        let tone = item.optional ? Palette.optional : (r.amount ?? 0) < -0.5 ? Lilac.red : Palette.color("green")
        HStack(spacing: 12) {
            Image(systemName: Icons.symbol(r.icon))
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(tone)
                .frame(width: 42, height: 42)
                .background(tone.opacity(0.12), in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(r.title).font(.body.weight(.semibold)).lineLimit(1).minimumScaleFactor(0.85)
                if !r.details.isEmpty { Text(r.details).font(.footnote).foregroundStyle(Lilac.muted).lineLimit(2) }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .layoutPriority(1)
            Text(Money.text(r.amount ?? 0, symbol, sign: true))
                .font(.body.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(tone)
                .fixedSize()
            Image(systemName: "chevron.right")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Lilac.muted.opacity(0.7))
        }
        .padding(.vertical, 11)
        .overlay(alignment: .top) {
            if !first { Rectangle().fill(Lilac.hairline).frame(height: 0.5).padding(.leading, 54) }
        }
        .contentShape(Rectangle())
    }
}

/// Where the week would be without a section's rows, on a quiet panel: green when it would be above zero.
private struct WhyWithout: View {
    let figure: Figure
    let symbol: String

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(figure.label).font(.subheadline).foregroundStyle(Lilac.muted)
            Spacer(minLength: 8)
            Text(Money.text(figure.amount, symbol, sign: true))
                .font(.title3.weight(.semibold))
                .monospacedDigit()
                .foregroundStyle(figure.amount < -0.5 ? Lilac.red : Palette.color("green"))
        }
        .padding(14)
        .background(Lilac.canvas, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

/// A row that opens another page, its icon on a lilac tile.
private struct WhyLinkRow: View {
    let icon: String
    let title: String
    let first: Bool

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(Lilac.accent)
                .frame(width: 42, height: 42)
                .background(Lilac.tint, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
            Text(title).font(.body).frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Lilac.muted.opacity(0.7))
        }
        .padding(.vertical, 10)
        .overlay(alignment: .top) {
            if !first { Rectangle().fill(Lilac.hairline).frame(height: 0.5).padding(.leading, 54) }
        }
        .contentShape(Rectangle())
    }
}
