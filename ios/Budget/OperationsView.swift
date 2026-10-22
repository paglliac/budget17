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

/// Operations of a month by day, or by category, filtered by kind, category and text, as on the web page; an expense or
/// an income opens to be marked. «Ждут разбора» shows the expenses that came without a category instead, with
/// suggestions to accept, and what was sorted.
struct OperationsView: View {
    @Binding var filter: OperationsFilter
    @State private var month: String?
    @State private var category: String?
    @State private var query: String?
    /// nil goes by day.
    @State private var group: String?
    @State private var searching = false
    @State private var search = ""
    @State private var showCategories = false
    @State private var sheet: BudgetSheet?
    @FocusState private var searchFocused: Bool

    var body: some View {
        Screen(path: "operations", query: ["month": month, "kind": filter.kind, "category": category, "q": query, "group": group]) { (s: OperationsScreen) in
            GeometryReader { geometry in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        header(s)
                        if searching { searchField }
                        filters(s)
                        if filter != .pending, !figures(s).isEmpty {
                            LilacFigures(items: figures(s), symbol: s.symbol).padding(.top, 22)
                        }
                        LilacFilterTabs(items: tabs(s), selection: $filter) { regroup(s) }.padding(.top, 20)
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
                CategorySpendingSheet(title: s.categoriesTitle, categories: s.categories, symbol: s.symbol, selected: s.category) { picked in
                    category = picked
                }
            }
        }
        .background(LilacBackground())
        .budgetSheets($sheet)
    }

    /// The month to pick as the title, search, and the spending by category that filters the operations.
    private func header(_ s: OperationsScreen) -> some View {
        let index = s.months.firstIndex { $0.value == s.month } ?? 0
        return LilacPickerTitle(screen: "Операции", text: s.months[index].label) {
            ForEach(Array(s.months.enumerated()), id: \.element.value) { i, option in
                Button(option.label) { month = i == 0 ? nil : option.value }
            }
        } trailing: {
            HStack(alignment: .top, spacing: 14) {
                LilacIconButton(systemImage: "magnifyingglass", label: "Найти") {
                    withAnimation(.snappy) { searching = true }
                    searchFocused = true
                }
                LilacIconButton(systemImage: "slider.horizontal.3", label: "Категории", caption: "Категории") { showCategories = true }
                    .accessibilityIdentifier("categories")
            }
        }
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

    /// The category and the text the operations are filtered by, each with a cross.
    @ViewBuilder
    private func filters(_ s: OperationsScreen) -> some View {
        if s.categoryTitle != nil || s.query != nil {
            FlowLayout(spacing: 8) {
                if let title = s.categoryTitle {
                    Button { category = nil } label: { chipLabel(title, systemImage: "xmark") }.buttonStyle(.plain)
                }
                if let q = s.query {
                    Button {
                        query = nil
                        search = ""
                    } label: { chipLabel("«\(q)»", systemImage: "xmark") }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 14)
        }
    }

    /// What the operations spent and what they brought; a view of one kind has only its own figure, in orange for the
    /// expenses that could have been done without.
    private func figures(_ s: OperationsScreen) -> [LilacFigures.Item] {
        let spent = LilacFigures.Item(label: "Потрачено", amount: s.totals.expense, color: s.kind == "optional" ? Palette.optional : .primary)
        let received = LilacFigures.Item(label: "Получено", amount: s.totals.income, color: Palette.color("green"))
        switch s.kind {
        case "expense", "optional": return [spent]
        case "income": return [received]
        case "transfer": return []
        default: return [spent, received]
        }
    }

    private func chipLabel(_ text: String, systemImage: String) -> some View {
        HStack(spacing: 6) {
            Text(text)
            Image(systemName: systemImage).font(.caption.weight(.semibold))
        }
        .font(.subheadline.weight(.medium))
        .foregroundStyle(Lilac.accent)
        .padding(.horizontal, 14)
        .frame(height: 36)
        .background(Lilac.tint, in: Capsule())
    }

    private func tabs(_ s: OperationsScreen) -> [LilacFilterTabs<OperationsFilter, AnyView>.Item] {
        typealias Item = LilacFilterTabs<OperationsFilter, AnyView>.Item
        let all = s.kinds.first { $0.value == nil }
        let kinds = s.kinds.compactMap { kind in kind.value.map { Item(value: .kind($0), label: kind.label, count: kind.count) } }
        return [Item(value: .all, label: all?.label ?? "Все", count: all?.count),
                Item(value: .pending, label: "Ждут разбора", count: s.pending > 0 ? s.pending : nil, badge: true)]
            + kinds
    }

    /// The switch between the list by day and by category, at the end of the tabs.
    private func regroup(_ s: OperationsScreen) -> AnyView {
        guard filter != .pending, let regroup = s.regroup else { return AnyView(EmptyView()) }
        return AnyView(
            Button { withAnimation(.snappy) { group = regroup.value == "day" ? nil : regroup.value } } label: {
                HStack(spacing: 5) {
                    Text(regroup.label)
                    Image(systemName: "arrow.up.arrow.down").font(.footnote.weight(.medium))
                }
                .font(.footnote)
                .foregroundStyle(Lilac.muted)
                .frame(height: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .fixedSize()
            .accessibilityIdentifier("regroup")
        )
    }

    @ViewBuilder
    private func list(_ s: OperationsScreen) -> some View {
        if s.days.isEmpty { LilacEmpty(text: s.empty) }
        ForEach(Array(s.days.enumerated()), id: \.element.id) { index, day in
            LilacTimelineGroup(title: day.title, subtitle: day.subtitle, total: abs(day.net) >= 0.5 ? Money.text(day.net, s.symbol, sign: true) : nil,
                               first: index == 0, last: index == s.days.count - 1) {
                ForEach(Array(day.items.enumerated()), id: \.element.id) { index, operation in
                    OperationLine(operation: operation, symbol: s.symbol, first: index == 0) {
                        if let id = operation.spending { sheet = .spending(id) }
                    }
                }
            }
        }
    }
}

/// An operation: whom it went to or came from with what it went for, a minus for an expense and green for an income,
/// orange for an expense that could have been done without, what else the bank said, and a ring with words when an
/// expense is not an ordinary one of the week.
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
                marker: .expense(row),
                title: row.title,
                details: row.details,
                amount: operation.kind == "expense" ? -(row.amount ?? 0) : row.amount,
                symbol: symbol,
                chip: operation.chip.map { ($0.label, Palette.color($0.tone)) },
                muted: row.muted,
                first: first,
                chevron: false,
                signed: operation.kind != "transfer",
                amountColor: operation.kind == "income" ? Palette.color("green") : operation.optional ? Palette.optional : .primary,
                ringChip: true
            ) {
                if !notes.isEmpty {
                    Text(notes.joined(separator: " · ")).font(.footnote).foregroundStyle(Lilac.muted).lineLimit(2)
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
                ForEach(Array(s.pending.enumerated()), id: \.element.date) { index, day in
                    LilacTimelineGroup(title: day.title, subtitle: day.subtitle, first: index == 0, last: index == s.pending.count - 1) {
                        ForEach(Array(day.items.enumerated()), id: \.element.id) { index, item in
                            // A tap on the row opens it; «Принять» is a button of its own inside the row.
                            LilacRow(marker: .expense(item.row, dot: Lilac.red), title: item.row.title, details: item.row.details, amount: item.row.amount, symbol: s.symbol,
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
                }
                if !s.sorted.isEmpty {
                    LilacHeading("Разобрано")
                    ForEach(Array(s.sorted.enumerated()), id: \.element.date) { index, day in
                        LilacTimelineGroup(title: day.title, subtitle: day.subtitle, first: index == 0, last: index == s.sorted.count - 1) {
                            ForEach(Array(day.items.enumerated()), id: \.element.id) { index, expense in
                                Button { sheet = .spending(expense.spending) } label: {
                                    LilacRow(marker: .expense(expense.row), title: expense.row.title, details: expense.row.details,
                                             amount: expense.row.amount, symbol: s.symbol, chip: WeekSpendingList.chip(expense.row.mark), first: index == 0,
                                             chevron: false, amountColor: expense.optional ? Palette.optional : .primary, ringChip: true)
                                }
                                .buttonStyle(.card)
                            }
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

/// The month's spending, or incomes, by category with each one's share; a category filters the operations.
struct CategorySpendingSheet: View {
    let title: String
    let categories: [OperationsScreen.CategorySpending]
    let symbol: String
    let selected: String?
    let pick: (String?) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        LilacForm(title: title) {
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
                    LilacRow(marker: c.photo.map { .photo($0, Palette.color(c.color)) } ?? .symbol(Icons.symbol(c.icon), Palette.color(c.color)),
                             title: c.title, details: "", amount: c.amount, symbol: symbol,
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
