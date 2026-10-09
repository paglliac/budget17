import SwiftUI

/// What the round «+» of the tab bar asked to add.
enum AddRequest: Equatable {
    /// A purchase into the week's money (week) or the extras (extra).
    case purchase(String)
    case wish
}

/// The budget by weeks, as on the web overview: the week and the month, stepping back and forth.
struct BudgetView: View {
    enum Mode: Hashable { case week, month }

    @Binding var add: AddRequest?
    /// Opens «Разобрать», from the expenses that wait for a category.
    let openSort: () -> Void
    @State private var mode = Mode.week
    /// nil is the current week or month.
    @State private var week: String?
    @State private var month: String?
    @State private var sheet: BudgetSheet?

    var body: some View {
        Group {
            switch mode {
            case .week: HomeView(mode: $mode, week: $week, sheet: $sheet, add: $add, openSort: openSort)
            case .month: MonthView(mode: $mode, month: $month, sheet: $sheet, add: $add) { opened in
                week = opened
                mode = .week
            }
            }
        }
        .budgetSheets($sheet)
    }
}

/// «Неделя» and «Месяц» as the header's title, the picked one large.
struct ModeTabs: View {
    @Binding var mode: BudgetView.Mode

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            tab("Неделя", .week)
            tab("Месяц", .month)
        }
    }

    private func tab(_ title: String, _ value: BudgetView.Mode) -> some View {
        Button { withAnimation(.snappy) { mode = value } } label: {
            Text(title)
                .font(mode == value ? .title2.weight(.bold) : .title3.weight(.medium))
                .foregroundStyle(mode == value ? Color.primary : Ink.muted)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(mode == value ? .isSelected : [])
    }
}

/// A card of a plan: a purchase opens its form and finishes from its menu; a regular payment opens the regular expense.
struct PlanCard: View {
    let item: PlanItem
    let symbol: String
    let choices: [OptionGroup]
    @Binding var sheet: BudgetSheet?
    @Binding var error: String?
    @Environment(Session.self) private var session

    var body: some View {
        Button {
            if let purchase = item.purchase {
                sheet = .purchase(PurchaseDraft(purchase: purchase, week: purchase.week, envelope: purchase.envelope, choices: choices, actions: item.actions))
            } else if let regular = item.regular {
                sheet = .regular(regular)
            }
        } label: {
            Card(row: item.row, symbol: symbol)
        }
        .buttonStyle(.card)
        .contextMenu {
            if let purchase = item.purchase, item.finishable {
                Button("Завершить: остаток вернётся", systemImage: "checkmark") {
                    Task {
                        do { try await session.send("purchases/\(purchase.id)/done") } catch { self.error = error.localizedDescription }
                    }
                }
            }
        }
    }
}

struct MonthView: View {
    enum Part: Hashable { case weeks, extras }

    @Binding var mode: BudgetView.Mode
    @Binding var month: String?
    @Binding var sheet: BudgetSheet?
    @Binding var add: AddRequest?
    let openWeek: (String) -> Void
    @State private var part = Part.weeks
    @State private var error: String?

    var body: some View {
        Screen(path: "month", query: ["month": month]) { (s: MonthScreen) in
            SplitScreen {
                TopHeader {
                    ModeTabs(mode: $mode)
                } trailing: {
                    PeriodSteps(
                        back: { month = s.prev.value },
                        forward: s.next.map { next in { month = next.value } },
                        toCurrent: s.month == s.thisMonth ? nil : { month = nil }
                    )
                }
            } summary: {
                MonthStrip(screen: s, openWeek: openWeek)
                VStack(alignment: .leading, spacing: 8) {
                    SummaryLabel(s.total.label)
                    BigAmount(amount: s.total.amount, symbol: s.symbol)
                    SummaryBar(parts: s.total.parts ?? [], total: s.total.amount)
                }
            } band: {
                BandSwitch(
                    items: [
                        BandItem(value: .weeks, label: "Недели \(s.weeks.count)"),
                        BandItem(value: .extras, label: "Дополнительные \(s.purchases.count + s.spending.reduce(0) { $0 + $1.items.count })"),
                    ],
                    selection: $part
                )
            } content: {
                switch part {
                case .weeks:
                    ForEach(s.weeks) { line in
                        Button { openWeek(line.week) } label: { Card(row: line.row, symbol: s.symbol) }
                            .buttonStyle(.card)
                    }
                case .extras:
                    ForEach(s.purchases) { item in PlanCard(item: item, symbol: s.symbol, choices: s.weekChoices, sheet: $sheet, error: $error) }
                    ForEach(s.spending, id: \.date) { group in
                        DayHeading(title: group.title, subtitle: group.subtitle)
                        ForEach(group.items) { expense in
                            Button { sheet = .spending(expense.spending) } label: { Card(row: expense.row, symbol: s.symbol, monogram: true) }
                                .buttonStyle(.card)
                        }
                    }
                    AddCard(label: "Добавить в дополнительные") { sheet = .purchase(draft(s, envelope: "extra")) }
                }
            }
            .onChange(of: add) { _, request in
                guard let request else { return }
                add = nil
                switch request {
                case .purchase(let envelope): sheet = .purchase(draft(s, envelope: envelope))
                case .wish: sheet = .wish(nil)
                }
            }
        }
        .errorAlert($error)
    }

    private func draft(_ s: MonthScreen, envelope: String) -> PurchaseDraft {
        PurchaseDraft(purchase: nil, week: s.newPurchaseWeek, envelope: envelope, choices: s.weekChoices, actions: [])
    }
}

/// The month's weeks as their days, from the day a week begins on, each opening its week; the dot tells how it goes.
struct MonthStrip: View {
    let screen: MonthScreen
    let openWeek: (String) -> Void

    var body: some View {
        HStack(spacing: 0) {
            StripMonth(text: Dates.parts("\(screen.month)-01")?.month ?? "")
            ForEach(screen.weeks) { line in
                Button { openWeek(line.week) } label: {
                    VStack(spacing: 3) {
                        Text(Dates.parts(line.week)?.month ?? "").font(.caption2.weight(.medium)).foregroundStyle(Ink.muted)
                        Text(range(line.week))
                            .font(.footnote.weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .frame(height: 30)
                        Circle().fill(Palette.color(line.row.color)).frame(width: 4, height: 4)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// 5–11 for the week that begins on the 5th.
    private func range(_ start: String) -> String {
        "\(Dates.parts(start)?.day ?? "")–\(Dates.parts(Dates.adding(6, to: start))?.day ?? "")"
    }
}

/// The month at the start of a strip, to tell where the days or weeks are; the year goes without saying.
struct StripMonth: View {
    let text: String

    var body: some View {
        Text(text).font(.subheadline.weight(.bold)).frame(width: 36, alignment: .leading)
    }
}
