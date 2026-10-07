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
    @State private var mode = Mode.week
    /// nil is the current week or month.
    @State private var week: String?
    @State private var month: String?
    @State private var sheet: BudgetSheet?

    var body: some View {
        Group {
            switch mode {
            case .week: WeekView(mode: $mode, week: $week, sheet: $sheet, add: $add)
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
    @Environment(\.variant) private var variant

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 14) {
            tab("Неделя", .week)
            tab("Месяц", .month)
        }
    }

    private func tab(_ title: String, _ value: BudgetView.Mode) -> some View {
        Button { withAnimation(.snappy) { mode = value } } label: {
            Text(title)
                .font(mode == value ? (variant.tight && !variant.cards ? Font.title3 : .title2).weight(.bold) : (variant.tight && !variant.cards ? Font.body : .title3).weight(.medium))
                .foregroundStyle(mode == value ? Color.primary : Ink.muted)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(mode == value ? .isSelected : [])
    }
}

/// The days of a week under its month and year; today is dark, a picked day shows only its spending.
struct WeekStrip: View {
    let monday: String
    let today: String
    /// Days that have spending, marked with a dot.
    let busy: Set<String>
    /// Variant C: what each day spent from the week's money, in place of the dot.
    var spent: [String: Double] = [:]
    @Binding var selected: String?
    @Environment(\.variant) private var variant

    var body: some View {
        let days = (0..<7).map { Dates.adding($0, to: monday) }
        let thursday = Dates.parts(days[3])
        HStack(spacing: 0) {
            if variant.tight {
                // The year goes without saying; the month only orients.
                Text(thursday?.month ?? "").font(.subheadline.weight(.bold)).frame(width: 36, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    Text(thursday?.year ?? "").font(.caption).foregroundStyle(Ink.muted)
                    Text(thursday?.month ?? "").font(.title3.weight(.bold))
                }
                .frame(width: 52, alignment: .leading)
                Rectangle().fill(Ink.hairline).frame(width: 1, height: 40).padding(.trailing, 4)
            }
            ForEach(Array(days.enumerated()), id: \.offset) { index, day in
                dayButton(day, letter: Dates.weekdays[index])
            }
        }
    }

    private func dayButton(_ day: String, letter: String) -> some View {
        let picked = selected == day || (selected == nil && day == today)
        let ahead = day > today
        return Button {
            // A day ahead has no spending to show yet.
            guard !ahead else { return }
            withAnimation(.snappy) { selected = selected == day ? nil : day }
        } label: {
            VStack(spacing: variant.tight ? 3 : 5) {
                Text(letter).font(.caption2.weight(.medium)).foregroundStyle(Ink.muted)
                Text(Dates.parts(day)?.day ?? "")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(picked ? Ink.onStrong : ahead ? Ink.muted : Color.primary)
                    .frame(width: variant.tight ? 30 : 32, height: variant.tight ? 30 : 32)
                    .background(picked ? Ink.strong : .clear, in: RoundedRectangle(cornerRadius: 9, style: .continuous))
                if variant.essential {
                    Text(spent[day].map { $0 >= 0.5 ? Money.number($0) : "" } ?? "")
                        .font(.system(size: 10, weight: .medium).monospacedDigit())
                        .foregroundStyle(Ink.muted)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .frame(height: 12)
                } else if !variant.tight {
                    Circle().fill(busy.contains(day) ? Palette.week : .clear).frame(width: 4, height: 4)
                }
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Dates.parts(day).map { "\($0.day) \($0.month)" } ?? day)
    }
}

struct WeekView: View {
    enum Part: Hashable { case spending, plan, wishes }

    @Binding var mode: BudgetView.Mode
    @Binding var week: String?
    @Binding var sheet: BudgetSheet?
    @Binding var add: AddRequest?
    @Environment(Session.self) private var session
    @Environment(\.variant) private var variant
    @State private var part = Part.spending
    /// A day picked in the strip, whose spending alone shows.
    @State private var day: String?
    @State private var error: String?

    var body: some View {
        Screen(path: "week", query: ["week": week]) { (s: WeekScreen) in
            let shown = shownPart(s)
            SplitScreen {
                TopHeader {
                    ModeTabs(mode: $mode)
                } trailing: {
                    PeriodSteps(
                        back: { go(s.prev) },
                        forward: s.next.map { next in { go(next) } },
                        toCurrent: s.phase == "current" ? nil : { go(nil) }
                    )
                }
            } summary: {
                WeekStrip(monday: s.week, today: s.today, busy: Set(s.days.map(\.date)), spent: weekSpent(s), selected: $day)
                VStack(alignment: .leading, spacing: variant.tight ? 8 : 10) {
                    // In the current week the figure is what can still be spent, which goes without saying.
                    if s.phase != "current" { SummaryLabel(s.total.label) }
                    if variant.essential {
                        SideSummary(total: s.total, symbol: s.symbol)
                    } else {
                        BigAmount(amount: s.total.amount, symbol: s.symbol)
                        SummaryBar(parts: s.total.parts ?? [], total: s.total.amount)
                    }
                }
            } band: {
                BandSwitch(items: parts(s), selection: Binding(get: { shown }, set: { part = $0 }))
            } content: {
                switch shown {
                case .spending: spending(s)
                case .plan: plan(s)
                case .wishes: wishes(s)
                }
            }
            .onChange(of: add) { _, request in handle(request, s) }
        }
        .errorAlert($error)
    }

    private func go(_ target: String?) {
        day = nil
        week = target
    }

    private func parts(_ s: WeekScreen) -> [BandItem<Part>] {
        if s.phase == "ahead" { return [BandItem(value: .plan, label: "План \(s.plan.count)")] }
        let count = s.days.reduce(0) { $0 + $1.items.count }
        // Variant C: a count of nothing says nothing.
        let wishes = s.wishes.map { variant.essential && $0.isEmpty ? "Хочу" : "Хочу \($0.count)" }
        return [BandItem(value: .spending, label: "Траты \(count)"), BandItem(value: .plan, label: "План \(s.plan.count)")]
            + (wishes.map { [BandItem(value: .wishes, label: $0)] } ?? [])
    }

    /// A week ahead has only its plan, and only the current week has wishes.
    private func shownPart(_ s: WeekScreen) -> Part {
        if s.phase == "ahead" { return .plan }
        if part == .wishes && s.wishes == nil { return .spending }
        return part
    }

    @ViewBuilder
    private func spending(_ s: WeekScreen) -> some View {
        let days = s.days.filter { day == nil || $0.date == day }
        if days.isEmpty { EmptyCard(text: "Трат пока нет.") }
        if variant.tight {
            // Variant C: what counts outside the budget asks for nothing here, so it folds under the days.
            let outside = days.flatMap(\.items).filter { variant.essential && Self.outside($0.row) }
            ForEach(days, id: \.date) { group in
                let items = group.items.filter { !(variant.essential && Self.outside($0.row)) }
                if !items.isEmpty {
                    DayHeading(title: group.title, subtitle: group.subtitle)
                    RowGroup { ForEach(items) { expense in expenseCard(expense, s) } }
                }
            }
            if !outside.isEmpty {
                FoldRow(title: "Вне бюджета", count: outside.count, amount: outside.reduce(0) { $0 + ($1.row.amount ?? 0) }, symbol: s.symbol) {
                    ForEach(outside) { expense in expenseCard(expense, s) }
                }
            }
        } else {
            ForEach(days, id: \.date) { group in
                DayHeading(title: group.title, subtitle: group.subtitle)
                ForEach(group.items) { expense in expenseCard(expense, s) }
            }
        }
    }

    private func expenseCard(_ expense: Expense, _ s: WeekScreen) -> some View {
        // Variant C: the icon tells the category; only a missing one is spelled out, since it asks to be picked.
        let missing = expense.row.details == "без категории"
        return Button { sheet = .spending(expense.spending) } label: {
            Card(row: expense.row, symbol: s.symbol, detailsShown: missing, attention: missing)
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(expense.id)
    }

    static func outside(_ row: Row) -> Bool { row.mark == "outside" || row.mark == "ignored" }

    /// What each day spent from the week's money, for the strip of variant C.
    private func weekSpent(_ s: WeekScreen) -> [String: Double] {
        Dictionary(uniqueKeysWithValues: s.days.map { day in
            (day.date, day.items.filter { $0.row.mark == "week" }.reduce(0) { $0 + ($1.row.amount ?? 0) })
        })
    }

    @ViewBuilder
    private func plan(_ s: WeekScreen) -> some View {
        if variant.essential {
            // What is bought or paid asks for nothing more; it folds under what still waits.
            let done = s.plan.filter(PlanCard.done)
            let open = s.plan.filter { !PlanCard.done($0) }
            if !open.isEmpty {
                RowGroup { ForEach(open) { item in PlanCard(item: item, symbol: s.symbol, choices: s.weekChoices, sheet: $sheet, error: $error) } }
            }
            if !done.isEmpty {
                FoldRow(title: "Готово", count: done.count, amount: done.reduce(0) { $0 + ($1.row.amount ?? 0) }, symbol: s.symbol) {
                    ForEach(done) { item in PlanCard(item: item, symbol: s.symbol, choices: s.weekChoices, sheet: $sheet, error: $error) }
                }
            }
        } else if variant.tight {
            RowGroup { ForEach(s.plan) { item in PlanCard(item: item, symbol: s.symbol, choices: s.weekChoices, sheet: $sheet, error: $error) } }
            AddCard(label: "Добавить в план") { sheet = .purchase(draft(s, envelope: "week")) }
        } else {
            ForEach(s.plan) { item in PlanCard(item: item, symbol: s.symbol, choices: s.weekChoices, sheet: $sheet, error: $error) }
            AddCard(label: "Добавить в план") { sheet = .purchase(draft(s, envelope: "week")) }
        }
    }

    @ViewBuilder
    private func wishes(_ s: WeekScreen) -> some View {
        let cards = ForEach(s.wishes ?? []) { item in
            Card(row: item.row, symbol: s.symbol) {
                if item.plannable {
                    CardAction(label: "Запланировать") { run { try await session.send("wishes/\(item.wish.id)/plan") } }
                }
            }
            .onTapGesture { sheet = .wish(item) }
            .accessibilityAddTraits(.isButton)
        }
        if variant.tight, !(s.wishes ?? []).isEmpty { RowGroup { cards } } else { cards }
        // Variant C: the round «+» adds a wish already.
        if !variant.essential || (s.wishes ?? []).isEmpty { AddCard(label: "Добавить желание") { sheet = .wish(nil) } }
    }

    /// A purchase for this week, or for the current one when this one is over.
    private func draft(_ s: WeekScreen, envelope: String) -> PurchaseDraft {
        PurchaseDraft(purchase: nil, week: s.phase == "past" ? s.current : s.week, envelope: envelope, choices: s.weekChoices, actions: [])
    }

    private func handle(_ request: AddRequest?, _ s: WeekScreen) {
        guard let request else { return }
        add = nil
        switch request {
        case .purchase(let envelope): sheet = .purchase(draft(s, envelope: envelope))
        case .wish: sheet = .wish(nil)
        }
    }

    private func run(_ change: @escaping () async throws -> Void) {
        Task {
            do { try await change() } catch { self.error = error.localizedDescription }
        }
    }
}

/// A card of a plan: a purchase opens its form and finishes from its menu; a regular payment opens the regular expense.
struct PlanCard: View {
    /// Bought, finished or paid: nothing left to do about it this week.
    static func done(_ item: PlanItem) -> Bool { item.row.muted || item.row.icon == "check" }

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
            // Variant C: «ждёт покупки» is what every purchase in the plan does; only news is spelled out.
            Card(row: item.row, symbol: symbol, detailsShown: !["ждёт покупки", "в плане"].contains(item.row.details))
        }
        .buttonStyle(.plain)
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
    @Environment(\.variant) private var variant

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
                VStack(alignment: .leading, spacing: variant.tight ? 8 : 10) {
                    SummaryLabel(s.total.label)
                    if variant.essential {
                        SideSummary(total: s.total, symbol: s.symbol)
                    } else {
                        BigAmount(amount: s.total.amount, symbol: s.symbol)
                        SummaryBar(parts: s.total.parts ?? [], total: s.total.amount)
                    }
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
                    let weeks = ForEach(s.weeks) { line in
                        Button { openWeek(line.week) } label: { Card(row: line.row, symbol: s.symbol) }
                            .buttonStyle(.plain)
                    }
                    if variant.tight { RowGroup { weeks } } else { weeks }
                case .extras:
                    let purchases = ForEach(s.purchases) { item in PlanCard(item: item, symbol: s.symbol, choices: s.weekChoices, sheet: $sheet, error: $error) }
                    if variant.tight { if !s.purchases.isEmpty { RowGroup { purchases } } } else { purchases }
                    ForEach(s.spending, id: \.date) { group in
                        DayHeading(title: group.title, subtitle: group.subtitle)
                        let cards = ForEach(group.items) { expense in
                            Button { sheet = .spending(expense.spending) } label: { Card(row: expense.row, symbol: s.symbol, detailsShown: expense.row.details == "без категории", attention: expense.row.details == "без категории") }
                                .buttonStyle(.plain)
                        }
                        if variant.tight { RowGroup { cards } } else { cards }
                    }
                    if !variant.essential { AddCard(label: "Добавить в дополнительные") { sheet = .purchase(draft(s, envelope: "extra")) } }
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

/// The month's weeks as days from Monday to Sunday, each opening its week; the dot tells how it goes.
struct MonthStrip: View {
    let screen: MonthScreen
    let openWeek: (String) -> Void
    @Environment(\.variant) private var variant

    var body: some View {
        let parts = Dates.parts("\(screen.month)-01")
        HStack(spacing: 0) {
            if variant.tight {
                Text(parts?.month ?? "").font(.subheadline.weight(.bold)).frame(width: 36, alignment: .leading)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    Text(parts?.year ?? "").font(.caption).foregroundStyle(Ink.muted)
                    Text(parts?.month ?? "").font(.title3.weight(.bold))
                }
                .frame(width: 52, alignment: .leading)
                Rectangle().fill(Ink.hairline).frame(width: 1, height: 40).padding(.trailing, 4)
            }
            ForEach(screen.weeks) { line in
                Button { openWeek(line.week) } label: {
                    VStack(spacing: 5) {
                        Text(Dates.parts(line.week)?.month ?? "").font(.caption2.weight(.medium)).foregroundStyle(Ink.muted)
                        Text(range(line.week))
                            .font(.footnote.weight(.semibold))
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .frame(height: variant.tight ? 28 : 32)
                        Circle().fill(Palette.color(line.row.color)).frame(width: 4, height: 4)
                    }
                    .frame(maxWidth: .infinity)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// 5–11 for the week of Monday the 5th.
    private func range(_ monday: String) -> String {
        "\(Dates.parts(monday)?.day ?? "")–\(Dates.parts(Dates.adding(6, to: monday))?.day ?? "")"
    }
}
