import SwiftUI

/// Why a week went below zero (prototype/week-why), after the user's picture of 2026-10-14, opened from the red figure
/// on the main circle: on top what the week was headed for, where it is and the change between; then the causes that
/// add up to the change, each on a red or green tile, with a bar of how much each did; then the week's spending and
/// plan. The switch on top picks how the fall is told, against the plan or since the evening, for the user to compare.
struct WeekWhyView: View {
    let week: String
    @Binding var sheet: BudgetSheet?
    let openSpending: () -> Void
    let openPlan: () -> Void
    @State private var basis = "plan"
    /// Causes opened or closed by hand against how the server shows them, such as the free rest with its categories.
    @State private var toggled: Set<String> = []
    @Environment(\.tabBarHeight) private var tabBarHeight

    var body: some View {
        Screen(path: "week-why", query: ["week": week, "basis": basis]) { (s: WeekWhyScreen) in
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if s.bases.count > 1 {
                        LilacSegmented(items: s.bases.map { Segment(value: $0.value, label: $0.label) }, selection: $basis)
                            .accessibilityIdentifier("why-basis")
                    }
                    WhyHero(screen: s)
                    causes(s)
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

    private func causes(_ s: WeekWhyScreen) -> some View {
        WhyCard {
            Text("Главные факторы").font(.title3.weight(.semibold)).padding(.bottom, 4)
            ForEach(Array(s.causes.enumerated()), id: \.element.id) { index, cause in
                Button { open(cause) } label: { WhyCauseRow(cause: cause, symbol: s.symbol, first: index == 0, opened: isOpen(cause)) }
                    .buttonStyle(.card)
                    .accessibilityIdentifier(cause.id)
                if isOpen(cause) {
                    ForEach(cause.parts, id: \.id) { part in WhyPartRow(part: part, symbol: s.symbol) }
                }
            }
            if s.causes.count > 1 {
                WhyContribution(contribution: s.contribution, symbol: s.symbol).padding(.top, 10)
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

    private func isOpen(_ cause: WhyCause) -> Bool {
        !cause.parts.isEmpty && cause.opened != toggled.contains(cause.id)
    }

    private func open(_ cause: WhyCause) {
        if let spending = cause.spending {
            sheet = .spending(spending)
        } else if !cause.parts.isEmpty {
            withAnimation(.snappy) {
                if toggled.contains(cause.id) { toggled.remove(cause.id) } else { toggled.insert(cause.id) }
            }
        } else if cause.plan {
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

/// A cause: its icon on a tile red below zero and green above, its title over what tells why, and its signed amount.
private struct WhyCauseRow: View {
    let cause: WhyCause
    let symbol: String
    let first: Bool
    let opened: Bool

    var body: some View {
        let r = cause.row
        let tone = (r.amount ?? 0) < -0.5 ? Lilac.red : Palette.color("green")
        HStack(spacing: 12) {
            Image(systemName: r.icon == "wallet" ? LilacSymbol.wallet : Icons.symbol(r.icon))
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
            Image(systemName: cause.parts.isEmpty ? "chevron.right" : "chevron.down")
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Lilac.muted.opacity(0.7))
                .rotationEffect(.degrees(opened && !cause.parts.isEmpty ? 180 : 0))
        }
        .padding(.vertical, 11)
        .overlay(alignment: .top) {
            if !first { Rectangle().fill(Lilac.hairline).frame(height: 0.5).padding(.leading, 54) }
        }
        .contentShape(Rectangle())
    }
}

/// A part of a cause opened, such as a category of the free rest: smaller, under the cause, its amount quiet.
private struct WhyPartRow: View {
    let part: Row
    let symbol: String

    var body: some View {
        HStack(spacing: 12) {
            LilacMarker.dot(Palette.color(part.color)).view.frame(width: 22, height: 22)
            VStack(alignment: .leading, spacing: 1) {
                Text(part.title).font(.subheadline)
                Text(part.details).font(.footnote).foregroundStyle(Lilac.muted)
            }
            Spacer(minLength: 8)
            Text(Money.text(part.amount ?? 0, symbol)).font(.subheadline).monospacedDigit().foregroundStyle(Lilac.muted)
        }
        .padding(.leading, 54)
        .padding(.trailing, 20)
        .padding(.vertical, 6)
    }
}

/// How much each cause did, as parts of one bar, red below zero and green above, with the sums of each under it.
private struct WhyContribution: View {
    let contribution: WeekWhyScreen.Contribution
    let symbol: String

    var body: some View {
        let c = contribution
        let parts = c.parts.filter { $0.value > 0.5 }
        let total = max(parts.reduce(0) { $0 + $1.value }, 1)
        VStack(alignment: .leading, spacing: 12) {
            Text(c.label).font(.subheadline.weight(.medium)).foregroundStyle(Color.primary.opacity(0.8))
            GeometryReader { geometry in
                let width = geometry.size.width - CGFloat(max(parts.count - 1, 0)) * 2
                HStack(spacing: 2) {
                    ForEach(Array(parts.enumerated()), id: \.offset) { index, part in
                        let color = Palette.color(part.tone)
                        Rectangle()
                            .fill(color.opacity(shade(index, parts)))
                            .frame(width: max(width * part.value / total, 4))
                    }
                }
                .clipShape(Capsule())
            }
            .frame(height: 18)
            HStack(alignment: .top, spacing: 12) {
                legend(c.minus, tone: Lilac.red)
                legend(c.plus, tone: Palette.color("green"))
            }
        }
        .padding(14)
        .background(Lilac.canvas, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    /// The largest part of a colour full, the next ones lighter, as the picture shades them.
    private func shade(_ index: Int, _ parts: [WeekWhyScreen.Contribution.Part]) -> Double {
        let before = parts[..<index].filter { $0.tone == parts[index].tone }.count
        return max(0.85 - Double(before) * 0.2, 0.35)
    }

    private func legend(_ f: Figure, tone: Color) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Circle().fill(tone.opacity(0.7)).frame(width: 9, height: 9)
            VStack(alignment: .leading, spacing: 1) {
                Text(Money.text(f.amount, symbol, sign: true)).font(.subheadline.weight(.semibold)).monospacedDigit()
                Text(f.label).font(.footnote).foregroundStyle(Lilac.muted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
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
