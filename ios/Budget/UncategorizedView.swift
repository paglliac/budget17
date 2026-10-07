import SwiftUI

/// Expenses of a month that came without a category, with suggestions to accept in one tap, and what was sorted.
struct UncategorizedView: View {
    enum Part: Hashable { case pending, sorted }

    @Environment(Session.self) private var session
    @State private var month: String?
    @State private var part = Part.pending
    @State private var sheet: BudgetSheet?
    @State private var error: String?
    @State private var accepted = 0

    var body: some View {
        Screen(path: "uncategorized", query: ["month": month]) { (s: UncategorizedScreen) in
            let index = s.months.firstIndex { $0.value == s.month } ?? 0
            SplitScreen {
                TopHeader {
                    Text("Разобрать").font(.title2.weight(.bold))
                } trailing: {
                    PeriodSteps(
                        back: index + 1 < s.months.count ? { month = s.months[index + 1].value } : nil,
                        forward: index > 0 ? { month = index == 1 ? nil : s.months[index - 1].value } : nil,
                        toCurrent: nil
                    )
                }
            } summary: {
                VStack(alignment: .leading, spacing: 10) {
                    SummaryLabel("\(s.months[index].label), без категории")
                    BigAmount(amount: s.total.amount, symbol: s.symbol)
                    Text(s.total.note).font(.footnote).foregroundStyle(Ink.muted)
                }
            } band: {
                BandSwitch(
                    items: [
                        BandItem(value: .pending, label: "Разобрать \(s.pending.reduce(0) { $0 + $1.items.count })"),
                        BandItem(value: .sorted, label: "Разобрано \(s.sorted.reduce(0) { $0 + $1.items.count })"),
                    ],
                    selection: $part
                )
            } content: {
                switch part {
                case .pending:
                    if s.pending.isEmpty { EmptyCard(text: s.empty) }
                    ForEach(s.pending, id: \.date) { day in
                        DayHeading(title: day.title, subtitle: day.subtitle)
                        ForEach(day.items) { item in
                            // A tap on the card opens it; «Принять» is a button of its own inside the card.
                            Card(row: item.row, symbol: s.symbol, monogram: true) {
                                if let suggestion = item.suggestion {
                                    CardAction(label: "Принять") { accept(item.spending, suggestion.choice) }
                                }
                            }
                            .onTapGesture { sheet = .spending(item.spending) }
                            .accessibilityAddTraits(.isButton)
                        }
                    }
                case .sorted:
                    if s.sorted.isEmpty { EmptyCard(text: "Пока ничего не разобрано.") }
                    ForEach(s.sorted, id: \.date) { day in
                        DayHeading(title: day.title, subtitle: day.subtitle)
                        ForEach(day.items) { expense in
                            Button { sheet = .spending(expense.spending) } label: { Card(row: expense.row, symbol: s.symbol, monogram: true) }
                                .buttonStyle(.card)
                        }
                    }
                }
            }
        }
        .budgetSheets($sheet)
        .errorAlert($error)
        .sensoryFeedback(.success, trigger: accepted)
    }

    private func accept(_ spending: String, _ choice: String) {
        Task {
            do {
                try await session.send("spending/\(spending)/\(choice)")
                accepted += 1
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
