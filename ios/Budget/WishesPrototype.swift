import SwiftUI

// Prototype (branch prototype/wish-list): one place for every wish, how its money is laid out and its plan to take back,
// in three looks switched on the «План» tab. A puts the wishes first on the plan of any week, a line each; B opens
// «Желания», a card for each wish with the ways its money comes from; C opens the same screen with the money held by
// month. It reads /api/week and /api/wish as the server has them, so it works against the server on the VDS.

/// The look picked on the «План» tab, kept on the phone.
enum WishesLook {
    static let key = "prototype-wishes-look"
    static let inPlan = "a"
    static let cards = "b"
    static let months = "c"
}

/// A, B or C under the plan's title.
struct WishesLookSwitch: View {
    @AppStorage(WishesLook.key) private var look = WishesLook.cards

    var body: some View {
        LilacSegmented(
            items: [Segment(value: WishesLook.inPlan, label: "A · В плане"), Segment(value: WishesLook.cards, label: "B · Экран"),
                    Segment(value: WishesLook.months, label: "C · По месяцам")],
            selection: $look,
            width: nil
        )
        .accessibilityIdentifier("wishes-look")
    }
}

/// A wish with its page as the server works it out; nil when the page did not load.
struct WishEntry: Identifiable {
    let item: WishItem
    let page: WishScreen?
    var id: Int { item.wish.id }
    var chosen: Bool { page?.chosen == true }
}

/// Loads every wish, from the current week, then each one's page; again after any change in the app.
struct WishesLoader<Content: View>: View {
    @ViewBuilder let content: ([WishEntry], String) -> Content
    @Environment(Session.self) private var session
    @State private var entries: [WishEntry]?
    @State private var symbol = "₽"
    @State private var error: String?

    var body: some View {
        Group {
            if let entries {
                content(entries, symbol)
            } else if let error {
                LilacEmpty(text: error)
            } else {
                ProgressView().frame(maxWidth: .infinity).padding(.vertical, 24)
            }
        }
        .task(id: session.version) { await load() }
    }

    private func load() async {
        do {
            let week: WeekScreen = try await session.get("week")
            var loaded: [WishEntry] = []
            for item in week.wishes ?? [] {
                let page: WishScreen? = try? await session.get("wish", ["id": String(item.wish.id)])
                loaded.append(WishEntry(item: item, page: page))
            }
            symbol = week.symbol
            entries = loaded
            error = nil
        } catch is CancellationError {
        } catch {
            if entries == nil { self.error = error.localizedDescription }
        }
    }
}

/// A: the wishes first on the plan of any week, a line each with what its plan does; a long press takes the plan back
/// or deletes the wish.
struct WishesInPlan: View {
    @Binding var sheet: BudgetSheet?

    var body: some View {
        WishesLoader { entries, symbol in
            VStack(alignment: .leading, spacing: 0) {
                LilacHeading(title: "Желания") {
                    LilacRoundButton(systemImage: "plus", label: "Добавить желание") { sheet = .wish(nil) }
                }
                ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                    WishLine(entry: entry, symbol: symbol, first: index == 0) { sheet = .wish(entry.id) }
                }
                if entries.isEmpty { LilacAddRow(label: "Добавить желание") { sheet = .wish(nil) } }
            }
        }
    }
}

/// A wish's line: its name, `details` or the server's line of its day and plan, its amount; a long press takes the plan
/// back or deletes the wish.
struct WishLine: View {
    let entry: WishEntry
    let symbol: String
    let first: Bool
    var details: String?
    let open: () -> Void
    @Environment(Session.self) private var session
    @State private var confirmDelete = false
    @State private var error: String?

    var body: some View {
        Button(action: open) {
            LilacRow(marker: .symbol("sparkles", Palette.week), title: entry.item.row.title, details: details ?? entry.item.row.details,
                     amount: entry.item.wish.amount, symbol: symbol, first: first)
        }
        .buttonStyle(.card)
        .accessibilityIdentifier("wishes-\(entry.id)")
        .contextMenu {
            if entry.chosen {
                Button("Отменить план", systemImage: "arrow.uturn.backward") { send("wishes/\(entry.id)/ways/delete") }
            }
            Button("Удалить", systemImage: "trash", role: .destructive) { confirmDelete = true }
        }
        .confirmationDialog("Удалить «\(entry.item.wish.title)»?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Удалить", role: .destructive) { send("wishes/\(entry.id)/delete") }
        }
        .errorAlert($error)
    }

    private func send(_ path: String) {
        Task {
            do { try await session.send(path) } catch { self.error = error.localizedDescription }
        }
    }
}

/// B and C: «Желания» over the plan, cards or months.
struct WishesSheet: View {
    @AppStorage(WishesLook.key) private var look = WishesLook.cards
    @State private var sheet: BudgetSheet?
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Button { dismiss() } label: {
                    Image(systemName: "xmark").font(.system(size: 18, weight: .medium)).frame(width: 40, height: 40).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Готово")
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.top, 10)
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    LilacTitle(text: "Желания") {
                        LilacRoundButton(systemImage: "plus", label: "Добавить желание") { sheet = .wish(nil) }
                    }
                    LilacSegmented(items: [Segment(value: WishesLook.cards, label: "B · Карточки"), Segment(value: WishesLook.months, label: "C · Месяцы")],
                                   selection: $look, width: nil)
                        .padding(.top, 12)
                    WishesLoader { entries, symbol in
                        if look == WishesLook.months {
                            WishesByMonth(entries: entries, symbol: symbol, sheet: $sheet)
                        } else {
                            WishCards(entries: entries, symbol: symbol, sheet: $sheet)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 40)
            }
            .scrollIndicators(.hidden)
        }
        .background(LilacBackground())
        .presentationDetents([.large])
        .budgetSheets($sheet)
        .accessibilityIdentifier("wishes-sheet")
    }
}

/// B: a card for each wish.
struct WishCards: View {
    let entries: [WishEntry]
    let symbol: String
    @Binding var sheet: BudgetSheet?

    var body: some View {
        VStack(spacing: 14) {
            ForEach(entries) { entry in
                WishCard(entry: entry, symbol: symbol) { sheet = .wish(entry.id) }
            }
            if entries.isEmpty { LilacAddRow(label: "Добавить желание") { sheet = .wish(nil) } }
        }
        .padding(.top, 18)
    }
}

/// A wish's card: its name, day and amount, then the ways its chosen plan takes money from and when it is bought, with
/// «Изменить» and «Отменить план»; a wish without a plan has «Разложить».
struct WishCard: View {
    let entry: WishEntry
    let symbol: String
    let open: () -> Void
    @Environment(Session.self) private var session
    @State private var confirmUnchoose = false
    @State private var error: String?

    var body: some View {
        let wish = entry.item.wish
        VStack(alignment: .leading, spacing: 12) {
            Button(action: open) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(wish.title).font(.headline).multilineTextAlignment(.leading)
                        if let when = WishWhen.text(entry) { Text(when).font(.subheadline).foregroundStyle(Lilac.muted) }
                    }
                    Spacer(minLength: 8)
                    LilacAmount(amount: wish.amount, symbol: symbol, size: 22).fixedSize()
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("wish-card-\(entry.id)")
            if let page = entry.page, page.bought {
                Label("Куплено", systemImage: "checkmark").font(.subheadline.weight(.semibold)).foregroundStyle(Lilac.accent)
            } else if let page = entry.page, page.chosen {
                GatheredBar(screen: page)
                VStack(spacing: 10) {
                    ForEach(page.ways.filter { $0.on }) { way in WayLine(way: way, symbol: symbol) }
                }
                if page.short > 0.5 {
                    Text("Не хватает \(Money.text(page.short, symbol))").font(.subheadline.weight(.semibold)).foregroundStyle(Lilac.red)
                }
                HStack(spacing: 8) {
                    LilacInlineAction(label: "Изменить", action: open)
                    LilacInlineAction(label: "Отменить план") { confirmUnchoose = true }
                    Spacer()
                }
            } else {
                HStack {
                    Text("Не разложено").font(.subheadline).foregroundStyle(Lilac.muted)
                    Spacer()
                    LilacInlineAction(label: "Разложить", action: open)
                }
            }
        }
        .padding(16)
        .background(Lilac.surface, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .shadow(color: .black.opacity(0.05), radius: 8, y: 3)
        .confirmationDialog("Отменить план «\(wish.title)»?", isPresented: $confirmUnchoose, titleVisibility: .visible) {
            Button("Отменить план", role: .destructive) {
                Task {
                    do { try await session.send("wishes/\(entry.id)/ways/delete") } catch { self.error = error.localizedDescription }
                }
            }
        }
        .errorAlert($error)
    }
}

/// A way a chosen plan takes money from: its tile, its name over what it does, and what it gives in all.
struct WayLine: View {
    let way: WayCard
    let symbol: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: Icons.symbol(way.icon))
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Palette.color(way.color))
                .frame(width: 34, height: 34)
                .background(Palette.color(way.color).opacity(0.16), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            VStack(alignment: .leading, spacing: 2) {
                Text(way.title).font(.subheadline.weight(.semibold))
                Text(way.line).font(.footnote).foregroundStyle(Lilac.muted).lineLimit(2)
            }
            Spacer(minLength: 8)
            Text(Money.text(way.given, symbol)).font(.subheadline.weight(.semibold)).monospacedDigit().fixedSize()
        }
    }
}

/// C: the wishes a line each with their day and when they are bought, then the money their plans hold by month.
struct WishesByMonth: View {
    let entries: [WishEntry]
    let symbol: String
    @Binding var sheet: BudgetSheet?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(entries.enumerated()), id: \.element.id) { index, entry in
                WishLine(entry: entry, symbol: symbol, first: index == 0, details: WishWhen.text(entry) ?? (entry.chosen ? "" : "не разложено")) {
                    sheet = .wish(entry.id)
                }
            }
            if entries.isEmpty { LilacAddRow(label: "Добавить желание") { sheet = .wish(nil) } }
            ForEach(months, id: \.month) { group in
                LilacHeading(MonthNames.name(group.month), subtitle: Money.text(group.total, symbol))
                ForEach(Array(group.steps.enumerated()), id: \.offset) { index, held in
                    LilacRow(marker: .icon(held.step.row), title: held.wish, details: [held.step.row.title, held.step.row.details].filter { !$0.isEmpty }.joined(separator: " · "),
                             amount: held.step.row.amount, symbol: symbol, first: index == 0, chevron: false)
                }
            }
        }
        .padding(.top, 14)
    }

    private struct Held {
        let wish: String
        let step: PlanStep
    }

    /// The steps of the chosen plans by the month their week belongs to, by date within it.
    private var months: [(month: String, total: Double, steps: [Held])] {
        let held = entries.flatMap { entry in
            entry.chosen ? (entry.page?.steps ?? []).map { Held(wish: entry.item.wish.title, step: $0) } : []
        }
        let grouped = Dictionary(grouping: held) { MonthNames.month(ofWeek: $0.step.date) }
        return grouped.keys.sorted().map { month in
            let steps = grouped[month]!.sorted { $0.step.date < $1.step.date }
            return (month, steps.reduce(0) { $0 + ($1.step.row.amount ?? 0) }, steps)
        }
    }
}

/// A wish's day and, with a plan, the week it is bought: «к 1 ноября · купить 31 октября – 6 ноября».
enum WishWhen {
    static func text(_ entry: WishEntry) -> String? {
        guard let page = entry.page else { return nil }
        let due = page.wish.dueSet ? Dates.date(page.wish.due).map { "к \($0.formatted(.dateTime.day().month(.wide).locale(Locale(identifier: "ru_RU"))))" } : nil
        let buy = page.chosen && !page.bought ? "купить \(page.buy.label)" : nil
        let parts = [due, buy].compactMap { $0 }
        return parts.isEmpty ? nil : parts.joined(separator: " · ")
    }
}

/// Months as the plan counts them.
enum MonthNames {
    static let names = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"]

    /// The month a week belongs to: the one most of its days fall in, so 31 октября – 6 ноября is November's.
    static func month(ofWeek start: String) -> String {
        String(Dates.adding(3, to: start).prefix(7))
    }

    static func name(_ month: String) -> String {
        guard let number = Int(month.suffix(2)), (1...12).contains(number) else { return month }
        return names[number - 1]
    }
}
