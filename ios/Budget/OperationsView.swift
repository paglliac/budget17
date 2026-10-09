import SwiftUI

/// What the operations show: all of them, one kind, or the expenses that wait for a category.
enum OperationsFilter: Hashable {
    case all
    case pending
    /// expense, income or transfer.
    case kind(String)

    var kind: String? {
        if case .kind(let kind) = self { return kind }
        return nil
    }
}

/// Operations of a month by day, filtered by kind, category and text, as on the web page; an expense opens to be
/// marked. «Ждут разбора» shows the expenses that came without a category instead, with suggestions to accept, and
/// what was sorted.
struct OperationsView: View {
    @Binding var filter: OperationsFilter
    @State private var month: String?
    @State private var category: String?
    @State private var query: String?
    @State private var searching = false
    @State private var search = ""
    @State private var showCategories = false
    @State private var sheet: BudgetSheet?
    @FocusState private var searchFocused: Bool

    var body: some View {
        Screen(path: "operations", query: ["month": month, "kind": filter.kind, "category": category, "q": query]) { (s: OperationsScreen) in
            GeometryReader { geometry in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        LilacTitle(text: "Операции") {
                            LilacIconButton(systemImage: "magnifyingglass", label: "Найти") {
                                withAnimation(.snappy) { searching = true }
                                searchFocused = true
                            }
                        }
                        if searching { searchField }
                        controls(s).padding(.top, 10)
                        if filter != .pending {
                            LilacFigures(items: [
                                .init(label: "потрачено", amount: s.totals.expense),
                                .init(label: "получено", amount: s.totals.income, sign: true, color: Palette.color("green")),
                            ], symbol: s.symbol)
                            .padding(.top, 16)
                        }
                        LilacFilterChips(items: chips(s), selection: $filter).padding(.top, 16)
                        if filter == .pending {
                            PendingList(month: month, sheet: $sheet)
                        } else {
                            list(s)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
                .scrollDismissesKeyboard(.interactively)
                .overlay(alignment: .top) { TopFade(height: geometry.safeAreaInsets.top) }
            }
            .sheet(isPresented: $showCategories) {
                CategorySpendingSheet(categories: s.categories, symbol: s.symbol, selected: s.category) { picked in
                    category = picked
                }
            }
        }
        .background(LilacBackground())
        .budgetSheets($sheet)
    }

    private var searchField: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(Lilac.muted)
                TextField("Найти операцию", text: $search)
                    .focused($searchFocused)
                    .submitLabel(.search)
                    .onSubmit { query = search.isEmpty ? nil : search }
            }
            .padding(.horizontal, 14)
            .frame(height: 44)
            .background(Lilac.surface, in: Capsule())
            .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
            Button("Отмена") {
                withAnimation(.snappy) { searching = false }
                search = ""
                query = nil
            }
            .foregroundStyle(Lilac.accent)
        }
        .padding(.top, 10)
    }

    /// The month to pick, the spending by category, and the filters set, each with a cross.
    private func controls(_ s: OperationsScreen) -> some View {
        let index = s.months.firstIndex { $0.value == s.month } ?? 0
        return FlowLayout(spacing: 8) {
            Menu {
                ForEach(Array(s.months.enumerated()), id: \.element.value) { i, option in
                    Button(option.label) { month = i == 0 ? nil : option.value }
                }
            } label: {
                chipLabel(s.months[index].label, systemImage: "chevron.down")
            }
            .accessibilityIdentifier("month")
            Button { showCategories = true } label: { chipLabel("По категориям", systemImage: "chart.pie") }
                .buttonStyle(.plain)
                .accessibilityIdentifier("categories")
            if let title = s.categoryTitle {
                Button { category = nil } label: { chipLabel(title, systemImage: "xmark", highlighted: true) }.buttonStyle(.plain)
            }
            if let q = s.query {
                Button {
                    query = nil
                    search = ""
                } label: { chipLabel("«\(q)»", systemImage: "xmark", highlighted: true) }
                .buttonStyle(.plain)
            }
        }
    }

    private func chipLabel(_ text: String, systemImage: String, highlighted: Bool = false) -> some View {
        HStack(spacing: 6) {
            Text(text)
            Image(systemName: systemImage).font(.caption.weight(.semibold))
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(highlighted ? Lilac.accent : Color.primary)
        .padding(.horizontal, 14)
        .frame(height: 36)
        .background(highlighted ? Lilac.tint : Lilac.surface, in: Capsule())
        .shadow(color: .black.opacity(highlighted ? 0 : 0.05), radius: 6, y: 2)
    }

    private func chips(_ s: OperationsScreen) -> [LilacFilterChips<OperationsFilter>.Item] {
        let all = s.kinds.first { $0.value == nil }
        let kinds = s.kinds.compactMap { kind in kind.value.map { LilacFilterChips<OperationsFilter>.Item(value: .kind($0), label: kind.label, count: kind.count) } }
        return [LilacFilterChips<OperationsFilter>.Item(value: .all, label: all?.label ?? "Все", count: all?.count),
                LilacFilterChips<OperationsFilter>.Item(value: .pending, label: "Ждут разбора", count: s.pending > 0 ? s.pending : nil, badge: true)]
            + kinds
    }

    @ViewBuilder
    private func list(_ s: OperationsScreen) -> some View {
        if s.days.isEmpty { LilacEmpty(text: s.empty) }
        ForEach(s.days) { day in
            LilacDayHeading(title: day.title, subtitle: day.subtitle, total: abs(day.net) >= 0.5 ? Money.text(day.net, s.symbol, sign: true) : nil)
            ForEach(Array(day.items.enumerated()), id: \.element.id) { index, operation in
                OperationLine(operation: operation, symbol: s.symbol, first: index == 0) {
                    if let id = operation.spending { sheet = .spending(id) }
                }
            }
        }
    }
}

/// An operation: whom it went to or came from with what it went for, a minus for an expense and green for an income,
/// what else the bank said, and a chip when an expense is not an ordinary one of the week.
struct OperationLine: View {
    let operation: OperationRow
    let symbol: String
    var first = false
    let open: () -> Void

    var body: some View {
        let row = operation.row
        let notes = [operation.comment, operation.original.map { Money.text($0.amount, $0.symbol) }, operation.hold ? "банк ещё не провёл" : nil].compactMap { $0 }
        Button(action: open) {
            LilacRow(
                marker: .dot(Palette.color(row.color)),
                title: row.title,
                details: row.details,
                amount: operation.kind == "expense" ? -(row.amount ?? 0) : row.amount,
                symbol: symbol,
                chip: operation.chip.map { ($0.label, Palette.color($0.tone)) },
                muted: row.muted,
                first: first,
                chevron: false,
                signed: operation.kind != "transfer",
                amountColor: operation.kind == "income" ? Palette.color("green") : .primary
            ) {
                if !notes.isEmpty {
                    Text(notes.joined(separator: " · ")).font(.caption).foregroundStyle(Lilac.muted).lineLimit(2)
                }
            }
        }
        .buttonStyle(.card)
        .disabled(operation.spending == nil)
        .accessibilityIdentifier(operation.spending.map { "spending-\($0)" } ?? operation.id)
    }
}

/// The expenses of a month that came without a category, with a suggestion to accept in one tap, and what was sorted.
/// An expense opens to be marked, with the next ones after it.
struct PendingList: View {
    let month: String?
    @Binding var sheet: BudgetSheet?
    @Environment(Session.self) private var session
    @State private var error: String?
    @State private var accepted = 0

    var body: some View {
        Screen(path: "uncategorized", query: ["month": month]) { (s: UncategorizedScreen) in
            let queue = s.pending.flatMap { $0.items.map(\.spending) }
            VStack(alignment: .leading, spacing: 0) {
                LilacSummary(label: s.total.label, amount: s.total.amount, symbol: s.symbol, note: s.total.note, size: 30).padding(.top, 16)
                if s.pending.isEmpty { LilacEmpty(text: s.empty) }
                ForEach(s.pending, id: \.date) { day in
                    LilacDayHeading(title: day.title, subtitle: day.subtitle)
                    ForEach(Array(day.items.enumerated()), id: \.element.id) { index, item in
                        // A tap on the row opens it; «Принять» is a button of its own inside the row.
                        LilacRow(marker: .dot(Lilac.red), title: item.row.title, details: item.row.details, amount: item.row.amount, symbol: s.symbol,
                                 first: index == 0) {
                            if let suggestion = item.suggestion {
                                LilacInlineAction(label: "Принять") { accept(item.spending, suggestion.choice) }
                            }
                        }
                        .onTapGesture { sheet = .spending(item.spending, queue: queue) }
                        .accessibilityAddTraits(.isButton)
                        .accessibilityIdentifier(item.id)
                    }
                }
                if !s.sorted.isEmpty {
                    LilacHeading("Разобрано")
                    ForEach(s.sorted, id: \.date) { day in
                        LilacDayHeading(title: day.title, subtitle: day.subtitle)
                        ForEach(Array(day.items.enumerated()), id: \.element.id) { index, expense in
                            Button { sheet = .spending(expense.spending) } label: {
                                LilacRow(marker: .dot(Palette.color(expense.row.color)), title: expense.row.title, details: expense.row.details,
                                         amount: expense.row.amount, symbol: s.symbol, chip: WeekSpendingList.chip(expense.row.mark), first: index == 0,
                                         chevron: false)
                            }
                            .buttonStyle(.card)
                        }
                    }
                }
            }
        }
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

/// The month's spending by category with each one's share; a category filters the operations.
struct CategorySpendingSheet: View {
    let categories: [OperationsScreen.CategorySpending]
    let symbol: String
    let selected: String?
    let pick: (String?) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        LilacForm(title: "Расходы по категориям") {
            if selected != nil {
                LilacAddRow(label: "Все категории") {
                    pick(nil)
                    dismiss()
                }
            }
            ForEach(Array(categories.enumerated()), id: \.element.id) { index, c in
                Button {
                    pick(c.id == selected ? nil : c.id)
                    dismiss()
                } label: {
                    LilacRow(marker: .symbol(Icons.symbol(c.icon), Palette.color(c.color)), title: c.title, details: "", amount: c.amount, symbol: symbol,
                             first: index == 0 && selected == nil, chevron: false) {
                        GeometryReader { geometry in
                            Capsule().fill(Palette.color(c.color)).frame(width: max(4, geometry.size.width * c.share))
                        }
                        .frame(height: 5)
                        .padding(.top, 4)
                    }
                    .overlay(alignment: .trailing) {
                        if c.id == selected { Image(systemName: "checkmark.circle.fill").foregroundStyle(Lilac.accent).offset(x: 4, y: -18) }
                    }
                }
                .buttonStyle(.card)
            }
        }
        .accessibilityIdentifier("categories-sheet")
    }
}
