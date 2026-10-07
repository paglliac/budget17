import SwiftUI

/// Operations of a month by day, filtered by kind, category and text, as on the web page; an expense opens to be marked.
struct OperationsView: View {
    @State private var month: String?
    @State private var kind: String?
    @State private var category: String?
    @State private var query: String?
    @State private var searching = false
    @State private var search = ""
    @State private var showCategories = false
    @State private var sheet: BudgetSheet?
    @FocusState private var searchFocused: Bool

    var body: some View {
        Screen(path: "operations", query: ["month": month, "kind": kind, "category": category, "q": query]) { (s: OperationsScreen) in
            let index = s.months.firstIndex { $0.value == s.month } ?? 0
            SplitScreen {
                TopHeader {
                    Text("Операции").font(.title2.weight(.bold))
                } trailing: {
                    PeriodSteps(
                        back: index + 1 < s.months.count ? { month = s.months[index + 1].value } : nil,
                        forward: index > 0 ? { month = index == 1 ? nil : s.months[index - 1].value } : nil,
                        toCurrent: nil
                    )
                }
            } summary: {
                VStack(alignment: .leading, spacing: 10) {
                    SummaryLabel(text: "\(s.months[index].label), потрачено") {
                        Button { showCategories = true } label: {
                            Label("По категориям", systemImage: "chart.pie").font(.subheadline.weight(.medium))
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(Ink.violet)
                        .accessibilityIdentifier("categories")
                    }
                    BigAmount(amount: s.totals.expense, symbol: s.symbol)
                    HStack(spacing: 12) {
                        Text("получено \(Money.text(s.totals.income, s.symbol, sign: true))")
                        Text("\(s.totals.count) \(Words.plural(s.totals.count, "операция", "операции", "операций"))")
                    }
                    .font(.footnote)
                    .foregroundStyle(Ink.muted)
                }
                if s.categoryTitle != nil || s.query != nil {
                    HStack(spacing: 8) {
                        if let title = s.categoryTitle { FilterTag(label: title) { category = nil } }
                        if let q = s.query {
                            FilterTag(label: "«\(q)»") {
                                query = nil
                                search = ""
                            }
                        }
                    }
                }
            } band: {
                if searching {
                    HStack(spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: "magnifyingglass").foregroundStyle(.white.opacity(0.6))
                            TextField("", text: $search, prompt: Text("Найти операцию").foregroundStyle(.white.opacity(0.5)))
                                .foregroundStyle(.white)
                                .focused($searchFocused)
                                .submitLabel(.search)
                                .onSubmit { query = search.isEmpty ? nil : search }
                        }
                        .padding(.horizontal, 12)
                        .frame(height: 36)
                        .background(Ink.pill, in: Capsule())
                        BandPill(label: "Отмена", selected: false) {
                            searching = false
                            search = ""
                            query = nil
                        }
                    }
                } else {
                    HStack(spacing: 8) {
                        BandSwitch(items: s.kinds.map { BandItem(value: $0.value, label: "\($0.label) \($0.count)") }, selection: $kind)
                        Spacer(minLength: 0)
                        BandPill(systemImage: "magnifyingglass", selected: false) {
                            searching = true
                            searchFocused = true
                        }
                        .accessibilityLabel("Найти")
                    }
                }
            } content: {
                if s.days.isEmpty { EmptyCard(text: s.empty) }
                ForEach(s.days) { day in
                    DayHeading(title: day.title, subtitle: day.subtitle, total: abs(day.net) >= 0.5 ? Money.text(day.net, s.symbol, sign: true) : nil)
                    ForEach(day.items) { operation in
                        OperationCard(operation: operation, symbol: s.symbol) {
                            if let id = operation.spending { sheet = .spending(id) }
                        }
                    }
                }
            }
            .sheet(isPresented: $showCategories) {
                CategorySpendingSheet(categories: s.categories, symbol: s.symbol, selected: s.category) { picked in
                    category = picked
                }
            }
        }
        .budgetSheets($sheet)
    }
}

/// An operation: what it went for and from where, a minus for an expense and green for an income, and what else the
/// bank said.
struct OperationCard: View {
    let operation: OperationRow
    let symbol: String
    let open: () -> Void

    var body: some View {
        let row = operation.kind == "expense" ? operation.row.with(amount: -(operation.row.amount ?? 0)) : operation.row
        let notes = [operation.comment, operation.original.map { Money.text($0.amount, $0.symbol) }, operation.hold ? "банк ещё не провёл" : nil].compactMap { $0 }
        Button(action: open) {
            Card(
                row: row,
                symbol: symbol,
                signed: operation.kind != "transfer",
                amountColor: operation.kind == "income" ? Palette.color("green") : .primary,
                monogram: true
            ) {
                if !notes.isEmpty {
                    Text(notes.joined(separator: " · ")).font(.caption).foregroundStyle(Ink.muted).lineLimit(2)
                }
            }
        }
        .buttonStyle(.card)
        .disabled(operation.spending == nil)
    }
}

private struct FilterTag: View {
    let label: String
    let remove: () -> Void

    var body: some View {
        Button(action: remove) {
            HStack(spacing: 4) {
                Text(label)
                Image(systemName: "xmark").font(.caption2.weight(.bold))
            }
            .font(.subheadline)
            .padding(.horizontal, 12)
            .frame(height: 32)
            .background(Ink.canvas, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

/// The month's spending by category with each one's share; a category filters the operations.
struct CategorySpendingSheet: View {
    let categories: [OperationsScreen.CategorySpending]
    let symbol: String
    let selected: String?
    let pick: (String?) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            List {
                if selected != nil {
                    Button("Все категории") {
                        pick(nil)
                        dismiss()
                    }
                }
                ForEach(categories) { c in
                    Button {
                        pick(c.id == selected ? nil : c.id)
                        dismiss()
                    } label: {
                        HStack(spacing: 12) {
                            IconBadge(icon: c.icon, color: Palette.color(c.color))
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(c.title)
                                    Spacer()
                                    Text(Money.text(c.amount, symbol)).monospacedDigit()
                                }
                                GeometryReader { geometry in
                                    Capsule().fill(Palette.color(c.color)).frame(width: max(3, geometry.size.width * c.share))
                                }
                                .frame(height: 4)
                            }
                            if c.id == selected { Image(systemName: "checkmark").foregroundStyle(Color.accentColor) }
                        }
                    }
                    .tint(.primary)
                }
            }
            .navigationTitle("Расходы по категориям")
            .inlineTitle()
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Готово") { dismiss() } } }
        }
    }
}
