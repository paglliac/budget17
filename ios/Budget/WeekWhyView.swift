import SwiftUI

/// Why a week went below zero (prototype/week-why), opened from the red figure on the main circle, in the look of the
/// app's lists: what was free just before the week went there and where it is, side by side; then the sections the
/// server gives, the last expenses, what cost more than planned and the optional ones, as rows of expenses on the
/// page. A long run of last expenses shows its first few and opens to the rest. The prototype has two looks on a
/// switch: «A · Списком» opens every section, «B · Свёрнуто» opens only the last expenses and folds the others into
/// their headings with their sums, to open by a tap.
struct WeekWhyView: View {
    let week: String
    @Binding var sheet: BudgetSheet?
    let openPlan: () -> Void
    @AppStorage(WhyLook.key) private var look = WhyLook.list
    /// Sections opened past their first few rows, or, in the folded look, opened at all.
    @State private var opened: Set<String> = []
    @Environment(\.tabBarHeight) private var tabBarHeight

    /// How many rows a section shows before it opens to the rest.
    private static let folded = 5

    var body: some View {
        Screen(path: "week-why", query: ["week": week]) { (s: WeekWhyScreen) in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    LilacSegmented(items: [Segment(value: WhyLook.list, label: "A · Списком"), Segment(value: WhyLook.folded, label: "B · Свёрнуто")],
                                   selection: $look)
                        .accessibilityIdentifier("why-look")
                        .padding(.top, 6)
                    LilacFigures(items: [
                        .init(label: s.was.label, amount: s.was.amount, sign: true),
                        .init(label: s.now.label, amount: s.now.amount, sign: true, color: s.now.amount < -0.5 ? Lilac.red : .primary),
                    ], symbol: s.symbol)
                    .padding(.top, 22)
                    ForEach(s.sections) { section in self.section(section, symbol: s.symbol) }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
        }
        .safeAreaPadding(.bottom, tabBarHeight)
        .background(LilacBackground())
        .lilacTitle("Почему неделя ушла в минус")
    }

    @ViewBuilder
    private func section(_ section: WhySection, symbol: String) -> some View {
        let foldable = look == WhyLook.folded && section.id != "last"
        let shown = !foldable || opened.contains(section.id)
        let whole = foldable || opened.contains(section.id) || section.rows.count <= Self.folded + 1
        let rows = whole ? section.rows : Array(section.rows.prefix(Self.folded))
        let tone = section.id == "optional" ? Palette.optional : Color.primary
        if foldable {
            Button { toggle(section.id) } label: {
                LilacHeading(title: section.title) {
                    HStack(spacing: 8) {
                        if let total = section.total { Text(Money.text(total, symbol)).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(tone) }
                        Image(systemName: "chevron.down")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Lilac.muted.opacity(0.7))
                            .rotationEffect(.degrees(shown ? 180 : 0))
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("\(section.id)-fold")
        } else {
            LilacHeading(title: section.title) {
                if let total = section.total, section.rows.count > 1 {
                    Text(Money.text(total, symbol)).font(.body.weight(.semibold)).monospacedDigit().foregroundStyle(tone)
                }
            }
        }
        if shown {
            ForEach(Array(rows.enumerated()), id: \.element.id) { index, item in
                let newDay = item.day != nil && item.day != (index > 0 ? rows[index - 1].day : nil)
                if newDay, let day = item.day { LilacDayHeading(title: day, subtitle: "") }
                Button { open(item) } label: {
                    LilacRow(
                        marker: item.spending != nil ? .expense(item.row) : .icon(item.row),
                        title: item.row.title,
                        details: item.row.details,
                        amount: item.row.amount,
                        symbol: symbol,
                        first: index == 0 || newDay,
                        chevron: false,
                        amountColor: item.optional ? Palette.optional : .primary
                    )
                }
                .buttonStyle(.card)
                .accessibilityIdentifier(item.id)
            }
            if !whole {
                Button { toggle(section.id) } label: {
                    Text("Ещё \(section.rows.count - rows.count)")
                        .font(.body)
                        .foregroundStyle(Lilac.accent)
                        .padding(.vertical, 12)
                        .padding(.leading, 44)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .overlay(alignment: .top) { Rectangle().fill(Lilac.hairline).frame(height: 0.5).padding(.leading, 44) }
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("\(section.id)-more")
            }
            if let without = section.without {
                HStack(alignment: .firstTextBaseline) {
                    Text(without.label).foregroundStyle(Lilac.muted)
                    Spacer(minLength: 8)
                    Text(Money.text(without.amount, symbol, sign: true))
                        .font(.body.weight(.semibold))
                        .monospacedDigit()
                        .foregroundStyle(without.amount < -0.5 ? Lilac.red : Palette.color("green"))
                }
                .padding(.vertical, 13)
                .padding(.leading, 44)
                .overlay(alignment: .top) { Rectangle().fill(Lilac.hairline).frame(height: 0.5).padding(.leading, 44) }
            }
        }
    }

    private func toggle(_ id: String) {
        withAnimation(.snappy) {
            if opened.contains(id) { opened.remove(id) } else { opened.insert(id) }
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

/// The look of why a week went below zero picked on its switch, kept on the phone (prototype/week-why).
enum WhyLook {
    static let key = "prototype-week-why-look"
    static let list = "list"
    static let folded = "folded"
}
