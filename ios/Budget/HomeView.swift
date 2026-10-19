import SwiftUI

/// Where the main page and the month go from their days, footer and extras.
enum HomeRoute: Hashable {
    /// The spending of the week, or of one day of it.
    case spending(String?)
    /// Why the week of that first day went below zero.
    case why(String)
    /// The extras of a month; nil is the current one.
    case extras(String?)
    /// The extras of a month in detail, with the expenses by day.
    case extrasDetails(String?)
}

/// The main page, the week: the days of the week, a large circle with what is free on its lilac lens and what is
/// reserved beside it, then cards of what was spent today and of the expenses that wait for a category, or, once all
/// are sorted, of the extras. It fits the screen: the reserved part opens the plan tab on the shown week, a day or
/// today's spending opens the spending, the extras open their page, and the red figure of a week past its amount tells
/// why it went there. The pages open over it in the main tab's stack (see BudgetView).
struct HomeView: View {
    @Binding var mode: BudgetView.Mode
    @Binding var week: String?
    @Binding var path: [HomeRoute]
    @Binding var sheet: BudgetSheet?
    let openPending: () -> Void
    let openPlan: (String?) -> Void
    /// Opens the «Желания» tab.
    let openWishes: () -> Void
    @Environment(Session.self) private var session
    @Environment(\.tabBarHeight) private var tabBarHeight
    @State private var picking = false

    var body: some View {
        Screen(path: "week", query: ["week": week]) { (s: WeekScreen) in
            page(s)
                .sheet(isPresented: $picking) { WeekPicker(screen: s) { go($0) } }
        }
        // Keeps the page and the offline pill above the tab bar.
        .safeAreaPadding(.bottom, tabBarHeight)
        .background(LilacBackground())
        .hiddenNavigationBar()
    }

    private func page(_ s: WeekScreen) -> some View {
        GeometryReader { geometry in
            ScrollView {
                VStack(spacing: 0) {
                    header(s)
                    if s.phase != "current" {
                        HStack {
                            Text(s.title).font(.subheadline).foregroundStyle(Lilac.muted)
                            Spacer()
                            LilacChip(text: "Сейчас") { go(nil) }
                        }
                        .padding(.top, 10)
                    }
                    LilacDayStrip(start: s.week, today: s.today, active: Set(s.days.map(\.date))) { path.append(.spending($0)) }
                        .padding(.top, 14)
                    Spacer(minLength: 8)
                    HomeHero(home: s.home, limit: s.limit, symbol: s.symbol, editLimit: {
                        sheet = .weekLimit(WeekLimitDraft(week: s.week, title: s.title, limit: s.limit, symbol: s.symbol))
                    }, openReserved: { openPlan(week) }, openWhy: { path.append(.why(s.week)) })
                    .padding(.top, 16)
                    .simultaneousGesture(DragGesture(minimumDistance: 24).onEnded { drag in step(drag, s) })
                    Spacer(minLength: 8)
                    HomeFooter(
                        home: s.home,
                        symbol: s.symbol,
                        syncing: session.isSyncing,
                        openSpending: s.phase == "ahead" ? nil : { path.append(.spending(nil)) },
                        sync: { Task { await session.sync() } },
                        openSort: openPending,
                        openShort: { wish in if let wish { sheet = .wish(wish) } else { openWishes() } },
                        openExtras: { path.append(.extras($0)) }
                    )
                    .padding(.top, 16)
                    // Clear of the raised circle of «Главная».
                    .padding(.bottom, 14)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 12)
                .frame(minHeight: geometry.size.height, alignment: .top)
            }
            .scrollIndicators(.hidden)
            .overlay(alignment: .top) { TopFade(height: geometry.safeAreaInsets.top) }
        }
    }

    private func header(_ s: WeekScreen) -> some View {
        HStack(spacing: 8) {
            ModeSwitch(mode: $mode)
            Spacer(minLength: 8)
            LilacIconButton(systemImage: "calendar", label: "Выбрать неделю") { picking = true }
                .accessibilityIdentifier("pick-week")
        }
        .padding(.top, 6)
    }

    /// A swipe across the circle steps to the next or the previous week.
    private func step(_ drag: DragGesture.Value, _ s: WeekScreen) {
        let dx = drag.translation.width, dy = drag.translation.height
        guard abs(dx) > 60, abs(dx) > abs(dy) * 1.5 else { return }
        if dx < 0, let next = s.next { go(next) } else if dx > 0 { go(s.prev) }
    }

    private func go(_ target: String?) {
        withAnimation(.snappy) { week = target }
    }
}

/// «Неделя» and «Месяц» of the main tab.
struct ModeSwitch: View {
    @Binding var mode: BudgetView.Mode

    var body: some View {
        LilacSegmented(items: [Segment(value: .week, label: "Неделя"), Segment(value: .month, label: "Месяц")], selection: $mode)
    }
}

extension PurchaseDraft {
    /// A new purchase from a week's page: into that week, or into the current one when it is over.
    static func new(_ s: WeekScreen, envelope: String) -> PurchaseDraft {
        PurchaseDraft(purchase: nil, week: s.phase == "past" ? s.current : s.week, envelope: envelope, choices: s.weekChoices, actions: [], symbol: s.symbol)
    }
}

/// The circle of the main page: what is free on its lilac lens, with what the week allows under it to change, and
/// what is reserved beside it, required and flexible, which opens the plan. On the lens a wave shows how full the week
/// is, and what is free rides above it.
struct HomeHero: View {
    let home: WeekHome
    let limit: WeekLimit
    let symbol: String
    let editLimit: () -> Void
    let openReserved: () -> Void
    /// Tells why the week went past its amount, from its red figure.
    let openWhy: () -> Void
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// The wave rises from the bottom once the circle shows.
    @State private var risen = false
    @State private var freeHeight: CGFloat = 0

    var body: some View {
        let level = WaveLevel(home.free)
        GeometryReader { geometry in
            let d = min(geometry.size.width, geometry.size.height)
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [Lilac.surface, Lilac.canvas], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .shadow(color: .black.opacity(0.09), radius: 26, y: 16)
                    .shadow(color: .black.opacity(0.03), radius: 2, y: 1)
                WaveLens(level: level, height: risen ? level.height : 0, d: d)
                HStack(spacing: 0) {
                    free(over: level.state == "over")
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { freeHeight = $0 }
                        .offset(y: -lift(d, level))
                        .padding(.leading, d * 0.08)
                        .frame(width: d * 0.49, alignment: .leading)
                    Button(action: openReserved) { reserved(home.reserved) }
                        .buttonStyle(.card)
                        .padding(.leading, d * 0.07)
                        .frame(width: d * 0.44, alignment: .leading)
                        .accessibilityIdentifier("reserved")
                    Spacer(minLength: 0)
                }
                .frame(width: d, height: d)
            }
            .frame(width: d, height: d)
            .frame(maxWidth: .infinity)
        }
        .aspectRatio(1, contentMode: .fit)
        .frame(maxWidth: 400)
        .animation(.spring(duration: 1.3, bounce: 0.2), value: level)
        .onAppear {
            guard !risen else { return }
            if reduceMotion { risen = true } else { withAnimation(.spring(duration: 1.6, bounce: 0.15).delay(0.15)) { risen = true } }
        }
    }

    /// How far what is free rises over the circle's middle to stay above the wave, while it still fits the lens.
    private func lift(_ d: CGFloat, _ level: WaveLevel) -> CGFloat {
        guard risen, freeHeight > 0 else { return 0 }
        let crest = d * 0.92 - d * 0.84 * level.height - d * WaveLens.amplitude - 12
        return min(max(d / 2 + freeHeight / 2 - crest, 0), d * 0.11)
    }

    /// What is free. Past the week's amount the wave says it: the label goes, and the amount is how far past it, in red;
    /// it opens why.
    private func free(over: Bool) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            if over {
                Button(action: openWhy) {
                    HStack(spacing: 4) {
                        LilacAmount(amount: -home.free.amount, symbol: symbol, size: 30, color: Lilac.red)
                        Image(systemName: "chevron.right").font(.caption.weight(.bold)).foregroundStyle(Lilac.red.opacity(0.7))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.card)
                .accessibilityIdentifier("week-why")
            } else {
                Text(home.free.label).font(.callout).foregroundStyle(Color.primary.opacity(0.85))
                LilacAmount(amount: home.free.amount, symbol: symbol, size: 30)
            }
            LilacChip(text: "\(over ? "сверх" : "из") \(Money.number(limit.amount))", systemImage: "pencil", highlighted: limit.changed, action: editLimit)
                .accessibilityIdentifier("week-limit")
                .accessibilityLabel("Бюджет недели \(Money.text(limit.amount, symbol))")
                .padding(.top, 2)
        }
        .padding(.trailing, 10)
    }

    private func reserved(_ r: WeekHome.Reserved) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 4) {
                Text(r.label).font(.subheadline).foregroundStyle(Color.primary.opacity(0.85))
                Image(systemName: "chevron.right").font(.caption2.weight(.bold)).foregroundStyle(Lilac.muted)
            }
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            LilacAmount(amount: r.amount, symbol: symbol, size: 27).padding(.top, 4)
            divider
            part(r.required)
            divider
            part(r.flexible)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
    }

    private func part(_ figure: Figure) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            LilacAmount(amount: figure.amount, symbol: symbol, size: 18, weight: .semibold)
            Text(figure.label).font(.subheadline).foregroundStyle(Lilac.muted)
        }
    }

    private var divider: some View {
        Rectangle().fill(Lilac.hairline).frame(height: 0.5).padding(.vertical, 10)
    }
}

/// Under the circle, two cards after the user's picture of 2026-10-13: what was spent today (in a past week, in all of
/// it) with when the data came from ZenMoney, which opens the week's spending, and beside it the place of what has to be
/// done, as the server says (`task`): «Разобрать операции» with how many expenses wait for a category, which opens them;
/// once all are sorted, «Не хватает» on a wish short of money, which opens it with «Добрать»; and with nothing to do,
/// the extras of the week's month, which open their page.
struct HomeFooter: View {
    let home: WeekHome
    let symbol: String
    let syncing: Bool
    let openSpending: (() -> Void)?
    let sync: () -> Void
    let openSort: () -> Void
    /// Opens the wish short of money, or «Желания» for several.
    let openShort: (Int?) -> Void
    let openExtras: (String?) -> Void

    var body: some View {
        HStack(spacing: 12) {
            if let spent = home.spent {
                Button { openSpending?() } label: { spentCard(spent) }
                    .buttonStyle(.card)
                    .accessibilityIdentifier("spent")
            }
            // A server from before the task leaves the extras to when all is sorted.
            switch home.task ?? (home.pending.count == 0 && home.extras != nil ? "extras" : "sort") {
            case "short" where home.short != nil:
                Button { openShort(home.short?.wish) } label: { shortCard(home.short!) }
                    .buttonStyle(.card)
                    .accessibilityIdentifier("short")
            case "extras" where home.extras != nil:
                Button { openExtras(home.extras?.month) } label: { extrasCard(home.extras!) }
                    .buttonStyle(.card)
                    .accessibilityIdentifier("extras")
            default:
                Button(action: openSort) { pendingCard }
                    .buttonStyle(.card)
                    .accessibilityIdentifier("pending")
            }
        }
        // Both cards as tall as the taller one.
        .fixedSize(horizontal: false, vertical: true)
    }

    private func spentCard(_ spent: Figure) -> some View {
        HomeCard(icon: "chart.bar.fill") {
            Text(spent.label).font(.footnote).foregroundStyle(Lilac.muted).lineLimit(2)
            LilacAmount(amount: spent.amount, symbol: symbol, size: 24)
            if let synced = home.synced {
                // Pressed, the server fetches from ZenMoney; the card around it opens the spending.
                Button(action: sync) {
                    HStack(spacing: 4) {
                        Image(systemName: "arrow.triangle.2.circlepath")
                            .rotationEffect(.degrees(syncing ? 360 : 0))
                            .animation(syncing ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: syncing)
                        Text(Dates.moment(synced)).monospacedDigit()
                    }
                    .font(.caption)
                    .foregroundStyle(Lilac.muted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .padding(.vertical, 2)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Обновлено \(Dates.moment(synced)), обновить")
            }
        }
    }

    /// «Разобрать операции» and «3 новые» on lilac; a server from before the cards says how many wait as it did.
    @ViewBuilder
    private var pendingCard: some View {
        let pending = home.pending
        let waiting = pending.count > 0
        HomeCard(icon: waiting ? "doc.text" : "checkmark", badge: waiting, highlighted: waiting, chevron: true) {
            Text(pending.title ?? (waiting ? "\(pending.count) \(pending.label)" : pending.label))
                .font(.subheadline.weight(.semibold))
                .lineLimit(2)
                .minimumScaleFactor(0.8)
            if waiting, let note = pending.note {
                Text(note).font(.footnote.weight(.medium)).foregroundStyle(Lilac.accent).monospacedDigit()
            }
        }
    }

    /// «Не хватает» on lilac with a red dot, what is short in red, and the wish or how many.
    private func shortCard(_ short: WeekHome.Short) -> some View {
        HomeCard(icon: "sparkles", badge: true, highlighted: true, chevron: true) {
            Text(short.label).font(.footnote).foregroundStyle(Lilac.muted).lineLimit(1)
            LilacAmount(amount: short.amount, symbol: symbol, size: 20, color: Lilac.red)
            Text(short.note).font(.footnote.weight(.medium)).foregroundStyle(Lilac.accent).lineLimit(1).minimumScaleFactor(0.8)
        }
    }

    private func extrasCard(_ extras: WeekHome.Extras) -> some View {
        HomeCard(icon: LilacSymbol.wallet, tile: Lilac.track, iconColor: Color.primary.opacity(0.6)) {
            Text(extras.label).font(.footnote).foregroundStyle(Lilac.muted).lineLimit(1)
            LilacAmount(amount: extras.amount, symbol: symbol, size: 20, color: extras.over ? Lilac.red : nil)
            Text(extras.note).font(.footnote).foregroundStyle(Lilac.muted).lineLimit(1).minimumScaleFactor(0.8)
        }
    }
}

/// A card under the circle: an icon on a tile and a few lines beside it, on white; on lilac, with a red dot on the
/// tile, when it waits for the user.
struct HomeCard<Content: View>: View {
    let icon: String
    var tile: Color = Lilac.tint
    var iconColor: Color = Lilac.accent
    var badge = false
    var highlighted = false
    var chevron = false
    @ViewBuilder var content: () -> Content

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 18, weight: .medium))
                .foregroundStyle(iconColor)
                .frame(width: 40, height: 40)
                .background(highlighted ? Lilac.surface : tile, in: RoundedRectangle(cornerRadius: 13, style: .continuous))
                .overlay(alignment: .topTrailing) {
                    if badge {
                        Circle().fill(Lilac.red).frame(width: 9, height: 9)
                            .overlay(Circle().strokeBorder(Lilac.surface, lineWidth: 1.5))
                            .offset(x: 2, y: -2)
                    }
                }
            HStack(spacing: 4) {
                VStack(alignment: .leading, spacing: 2) { content() }
                    .frame(maxWidth: .infinity, alignment: .leading)
                if chevron {
                    Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Lilac.muted)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .background {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(highlighted ? Lilac.tint.opacity(0.6) : Lilac.surface)
                .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Lilac.surface, lineWidth: highlighted ? 1.5 : 0))
                .shadow(color: .black.opacity(0.05), radius: 10, y: 4)
        }
        .foregroundStyle(Color.primary)
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

/// The spending of a week by days, or of one day, as rows on the page; an expense opens to be marked.
struct WeekSpendingList: View {
    let screen: WeekScreen
    let day: String?
    @Binding var sheet: BudgetSheet?

    var body: some View {
        let days = screen.days.filter { day == nil || $0.date == day }
        VStack(alignment: .leading, spacing: 0) {
            if days.isEmpty {
                Text("Трат пока нет.").font(.subheadline).foregroundStyle(Lilac.muted).padding(.vertical, 18)
            }
            ForEach(days, id: \.date) { group in
                LilacDayHeading(title: group.title, subtitle: group.subtitle)
                ForEach(Array(group.items.enumerated()), id: \.element.id) { index, expense in
                    Button { sheet = .spending(expense.spending) } label: {
                        LilacRow(
                            marker: .expense(expense.row),
                            title: expense.row.title,
                            details: expense.row.details,
                            amount: expense.row.amount,
                            symbol: screen.symbol,
                            chip: Self.chip(expense.row.mark),
                            muted: expense.row.muted,
                            first: index == 0,
                            chevron: false,
                            amountColor: expense.optional ? Palette.optional : .primary
                        )
                    }
                    .buttonStyle(.card)
                    .accessibilityIdentifier(expense.id)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Where an expense counts, when it is not the week.
    static func chip(_ mark: String?) -> (text: String, color: Color)? {
        switch mark {
        case "extra": ("Дополнительные", Lilac.accent)
        case "outside": ("Вне бюджета", Lilac.muted)
        case "ignored": ("Не учитывается", Lilac.muted)
        default: nil
        }
    }
}

/// The spending of the week, opened from a day or from today's spending: the days to pick one, and the rows.
struct WeekSpendingView: View {
    let week: String?
    @State var day: String?
    @Binding var sheet: BudgetSheet?
    @Environment(\.tabBarHeight) private var tabBarHeight

    var body: some View {
        Screen(path: "week", query: ["week": week]) { (s: WeekScreen) in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    LilacDayStrip(start: s.week, today: s.today, active: Set(s.days.map(\.date)), picked: day) { tapped in
                        withAnimation(.snappy) { day = day == tapped ? nil : tapped }
                    }
                    .padding(.top, 8)
                    WeekSpendingList(screen: s, day: day, sheet: $sheet)
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
        }
        .safeAreaPadding(.bottom, tabBarHeight)
        .background(LilacBackground())
        .lilacTitle("Траты")
    }
}

/// What a week's plan holds: what is reserved, required and flexible, with the purchases from the week's money, then the
/// ones from the extras and the regular payments of the week. What is paid already, bought, finished, set aside or paid
/// as a regular payment, folds into «Оплачено» at the end, which unfolds on a tap. «+» adds a purchase to the week or to
/// the extras; the wishes have a tab of their own.
struct PlanContent: View {
    let screen: WeekScreen
    @Binding var sheet: BudgetSheet?
    @State private var error: String?
    @State private var showPaid = false

    var body: some View {
        let s = screen
        let r = s.home.reserved
        // A pale row is one paid already.
        let paid = s.plan.filter(\.row.muted)
        let left = s.plan.filter { !$0.row.muted }
        let fromWeek = left.filter { $0.purchase?.envelope == "week" }
        let fromExtras = left.filter { $0.purchase?.envelope == "extra" }
        let regular = left.filter { $0.regular != nil }
        VStack(alignment: .leading, spacing: 0) {
            LilacAmount(amount: r.amount, symbol: s.symbol, size: 44).padding(.top, 6)
            LilacBar(first: r.required.amount, second: r.flexible.amount).padding(.top, 20)
            HStack(alignment: .top, spacing: 20) {
                share(r.required, of: r.amount, s.symbol)
                Rectangle().fill(Lilac.hairline).frame(width: 0.5, height: 66)
                share(r.flexible, of: r.amount, s.symbol)
            }
            .padding(.top, 18)

            LilacHeading(title: "Планируемые траты") {
                Menu {
                    Button("В план недели", systemImage: "cart") { sheet = .purchase(PurchaseDraft.new(s, envelope: "week")) }
                    Button("В дополнительные", systemImage: "bag") { sheet = .purchase(PurchaseDraft.new(s, envelope: "extra")) }
                } label: {
                    LilacRoundLabel(systemImage: "plus")
                }
                .accessibilityLabel("Добавить в план")
                .accessibilityIdentifier("add-purchase")
            }
            if fromWeek.isEmpty {
                LilacAddRow(label: "Добавить в план") { sheet = .purchase(PurchaseDraft.new(s, envelope: "week")) }
            }
            plan(fromWeek)
            if !fromExtras.isEmpty {
                LilacHeading("Из дополнительных")
                plan(fromExtras)
            }
            if !regular.isEmpty {
                LilacHeading("Регулярные платежи")
                plan(regular)
            }
            if !paid.isEmpty {
                Button {
                    withAnimation(.snappy) { showPaid.toggle() }
                } label: {
                    LilacHeading(title: "Оплачено", subtitle: "\(paid.count)") {
                        Image(systemName: "chevron.down")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(Lilac.muted)
                            .rotationEffect(.degrees(showPaid ? 180 : 0))
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("plan-paid")
                if showPaid { plan(paid) }
            }
        }
        .errorAlert($error)
    }

    private func share(_ figure: Figure, of total: Double, _ symbol: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            LilacAmount(amount: figure.amount, symbol: symbol, size: 22)
            Text(figure.label).font(.subheadline).foregroundStyle(Lilac.muted)
            if total > 0.5 {
                Text("\(Int((figure.amount / total * 100).rounded()))%").font(.footnote).foregroundStyle(Lilac.muted).monospacedDigit()
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private func plan(_ items: [PlanItem]) -> some View {
        ForEach(Array(items.enumerated()), id: \.element.id) { index, item in
            PlanRow(item: item, symbol: screen.symbol, choices: screen.weekChoices, first: index == 0, sheet: $sheet, error: $error)
        }
    }
}

/// A row of a plan: a purchase opens its form and finishes from its menu, a regular payment opens the regular expense,
/// the money a wish's plan holds opens the wish. A required purchase is a violet dot, a flexible one a ring, a wish's
/// money has the wish's sparkles; a purchase bought and a payment paid are pale with a tick, a wish's money set aside
/// or bought keeps its sparkles, pale.
struct PlanRow: View {
    let item: PlanItem
    let symbol: String
    let choices: [OptionGroup]
    var first = false
    @Binding var sheet: BudgetSheet?
    @Binding var error: String?
    @Environment(Session.self) private var session

    var body: some View {
        Button {
            if let wish = item.wish {
                sheet = .wish(wish)
            } else if let purchase = item.purchase {
                sheet = .purchase(PurchaseDraft(purchase: purchase, week: purchase.week, envelope: purchase.envelope, choices: choices, actions: item.actions, symbol: symbol))
            } else if let regular = item.regular {
                sheet = .regular(regular)
            }
        } label: {
            LilacRow(marker: marker, title: item.row.title, details: item.row.details, amount: item.row.amount, symbol: symbol, muted: item.row.muted, first: first)
        }
        .buttonStyle(.card)
        .accessibilityIdentifier(item.id)
        .contextMenu {
            if item.wish == nil, let purchase = item.purchase, item.finishable {
                Button("Завершить: остаток вернётся", systemImage: "checkmark") {
                    Task {
                        do { try await session.send("purchases/\(purchase.id)/done") } catch { self.error = error.localizedDescription }
                    }
                }
            }
        }
    }

    private var marker: LilacMarker {
        if item.wish != nil { return .symbol("sparkles", item.row.muted ? Lilac.muted : Palette.week) }
        if item.row.muted { return .symbol("checkmark", Lilac.muted) }
        if let purchase = item.purchase { return purchase.kind == "required" ? .dot(Lilac.accent) : .ring(Lilac.accent) }
        return .ring(Lilac.muted)
    }
}

/// The «План» tab: the plan of a week, stepping back and forth from the current one. The main page's «Зарезервировано»
/// opens it on the week the main page shows.
struct PlanView: View {
    @Binding var week: String?
    @State private var sheet: BudgetSheet?

    var body: some View {
        Screen(path: "week", query: ["week": week]) { (s: WeekScreen) in
            GeometryReader { geometry in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        LilacTitle(text: "План") {
                            if s.phase != "current" { LilacChip(text: "Сейчас") { week = nil } }
                            LilacRoundButton(systemImage: "chevron.left", label: "Раньше") { week = s.prev == s.current ? nil : s.prev }
                            LilacRoundButton(systemImage: "chevron.right", label: "Позже") { if let next = s.next { week = next == s.current ? nil : next } }
                                .disabled(s.next == nil)
                        }
                        Text(s.title).font(.subheadline).foregroundStyle(Lilac.muted).padding(.top, 2)
                        PlanContent(screen: s, sheet: $sheet).padding(.top, 8)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
                .overlay(alignment: .top) { TopFade(height: geometry.safeAreaInsets.top) }
            }
        }
        .background(LilacBackground())
        .budgetSheets($sheet)
    }
}

/// Picks a week by any of its days, or steps to the one before or after.
struct WeekPicker: View {
    let screen: WeekScreen
    let go: (String?) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()

    var body: some View {
        NavigationStack {
            VStack(spacing: 12) {
                HStack {
                    LilacRoundButton(systemImage: "chevron.left", label: "Раньше") { pick(screen.prev) }
                        .accessibilityIdentifier("week-prev")
                    Spacer()
                    Text(screen.title).font(.headline)
                    Spacer()
                    LilacRoundButton(systemImage: "chevron.right", label: "Позже") { if let next = screen.next { pick(next) } }
                        .disabled(screen.next == nil)
                        .accessibilityIdentifier("week-next")
                }
                DatePicker("Неделя", selection: $date, in: ...last, displayedComponents: .date)
                    .datePickerStyle(.graphical)
                    .tint(Lilac.accent)
                    .environment(\.locale, Locale(identifier: "ru_RU"))
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 20)
            .navigationTitle("Неделя")
            .inlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Отмена") { dismiss() } }
                if screen.phase != "current" {
                    ToolbarItem(placement: .confirmationAction) { Button("Сейчас") { pick(nil) } }
                }
            }
            .onAppear { date = Dates.date(screen.week) ?? Date() }
            .onChange(of: date) { _, picked in
                guard let week = start(of: picked), week != screen.week else { return }
                pick(week)
            }
        }
        .presentationDetents([.large])
    }

    /// The last day a week can be planned for, a year after the current one.
    private var last: Date {
        Dates.date(Dates.adding(7 * 52 + 6, to: screen.current)) ?? Date()
    }

    /// The first day of the week a date falls in, counted from the shown week's first day.
    private func start(of date: Date) -> String? {
        guard let first = Dates.date(screen.week) else { return nil }
        let days = Calendar(identifier: .gregorian).dateComponents([.day], from: first, to: Calendar(identifier: .gregorian).startOfDay(for: date)).day ?? 0
        let weeks = Int((Double(days) / 7).rounded(.down))
        return Dates.adding(weeks * 7, to: screen.week)
    }

    private func pick(_ week: String?) {
        go(week == screen.current ? nil : week)
        dismiss()
    }
}

/// Under the status bar of a page without a navigation bar, the page's own light, so rows scroll out of sight there.
struct TopFade: View {
    let height: CGFloat

    var body: some View {
        LinearGradient(stops: [.init(color: Lilac.canvas, location: 0), .init(color: Lilac.canvas.opacity(0.9), location: 0.6), .init(color: Lilac.canvas.opacity(0), location: 1)],
                       startPoint: .top, endPoint: .bottom)
            .frame(height: height + 14)
            .offset(y: -height)
            .allowsHitTesting(false)
    }
}

/// The title of a pushed page, beside the back chevron.
struct LilacPageTitle: View {
    let text: String

    var body: some View {
        Text(text).font(.title3.weight(.semibold)).lineLimit(1).fixedSize()
    }
}

extension View {
    /// A pushed page of the new style: its title beside the back chevron, on the page's own light.
    func lilacTitle(_ title: String) -> some View {
        #if os(iOS)
        self
            .toolbar {
                if #available(iOS 26, *) {
                    ToolbarItem(placement: .topBarLeading) { LilacPageTitle(text: title) }
                        .sharedBackgroundVisibility(.hidden)
                } else {
                    ToolbarItem(placement: .topBarLeading) { LilacPageTitle(text: title) }
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbarRole(.editor)
            .toolbar(.visible, for: .navigationBar)
        #else
        self.navigationTitle(title)
        #endif
    }
}
