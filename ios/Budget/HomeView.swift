import SwiftUI

/// Where the main page goes from its circle, its days and its footer.
enum HomeRoute: Hashable {
    /// What the plan holds: the purchases by kind, the regular payments and the wishes.
    case reserved
    /// The spending of the week, or of one day of it.
    case spending(String?)
}

/// The main page, the week: the days of the week, a large circle with what is free on its lilac lens and what is
/// reserved beside it, then what was spent today and how many expenses wait for a category. It fits the screen: the
/// reserved part opens the plan, and a day or today's spending opens the spending.
struct HomeView: View {
    @Binding var mode: BudgetView.Mode
    @Binding var week: String?
    @Binding var sheet: BudgetSheet?
    let openPending: () -> Void
    @Environment(Session.self) private var session
    @Environment(\.tabBarHeight) private var tabBarHeight
    @State private var path: [HomeRoute] = []
    @State private var picking = false

    var body: some View {
        NavigationStack(path: $path) {
            Screen(path: "week", query: ["week": week]) { (s: WeekScreen) in
                page(s)
                    .sheet(isPresented: $picking) { WeekPicker(screen: s) { go($0) } }
            }
            // Keeps the page and the offline pill above the tab bar.
            .safeAreaPadding(.bottom, tabBarHeight)
            .background(LilacBackground())
            .hiddenNavigationBar()
            .navigationDestination(for: HomeRoute.self) { route in
                switch route {
                case .reserved: ReservedView(week: week, sheet: $sheet)
                case .spending(let day): WeekSpendingView(week: week, day: day, sheet: $sheet)
                }
            }
        }
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
                    HomeHero(screen: s, editLimit: {
                        sheet = .weekLimit(WeekLimitDraft(week: s.week, title: s.title, limit: s.limit, symbol: s.symbol))
                    }, openReserved: { path.append(.reserved) })
                    .padding(.top, 16)
                    .simultaneousGesture(DragGesture(minimumDistance: 24).onEnded { drag in step(drag, s) })
                    Spacer(minLength: 8)
                    HomeFooter(
                        home: s.home,
                        symbol: s.symbol,
                        syncing: session.isSyncing,
                        openSpending: s.phase == "ahead" ? nil : { path.append(.spending(nil)) },
                        sync: { Task { await session.sync() } },
                        openSort: openPending
                    )
                    .padding(.top, 12)
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
/// what is reserved beside it, required and flexible, which opens the plan.
struct HomeHero: View {
    let screen: WeekScreen
    let editLimit: () -> Void
    let openReserved: () -> Void

    var body: some View {
        GeometryReader { geometry in
            let d = min(geometry.size.width, geometry.size.height)
            let home = screen.home
            ZStack {
                Circle()
                    .fill(LinearGradient(colors: [Lilac.surface, Lilac.canvas], startPoint: .topLeading, endPoint: .bottomTrailing))
                    .shadow(color: .black.opacity(0.09), radius: 26, y: 16)
                    .shadow(color: .black.opacity(0.03), radius: 2, y: 1)
                lens(d)
                HStack(spacing: 0) {
                    free(home)
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
    }

    /// The lilac lens on the circle's left, deeper towards its rim, cut by the circle.
    private func lens(_ d: CGFloat) -> some View {
        let shape = RoundedRectangle(cornerRadius: d * 0.27, style: .continuous)
        return shape
            .fill(LinearGradient(colors: [Lilac.lensTop, Lilac.lensBottom], startPoint: UnitPoint(x: 0.2, y: 0.05), endPoint: UnitPoint(x: 0.9, y: 0.95)))
            .overlay {
                shape.fill(RadialGradient(colors: [.white.opacity(0.6), .clear], center: UnitPoint(x: 0.4, y: 0.4), startRadius: 0, endRadius: d * 0.3))
            }
            .overlay {
                shape.strokeBorder(LinearGradient(colors: [.clear, Lilac.lensBottom], startPoint: UnitPoint(x: 0.45, y: 0.5), endPoint: .trailing), lineWidth: 3)
            }
            .frame(width: d * 0.58, height: d * 0.84)
            .offset(x: -d * 0.29)
            .frame(width: d, height: d)
            .clipShape(Circle().inset(by: d * 0.018))
            .allowsHitTesting(false)
    }

    private func free(_ home: WeekHome) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(home.free.label).font(.callout).foregroundStyle(Color.primary.opacity(0.85))
            LilacAmount(amount: home.free.amount, symbol: screen.symbol, size: 30)
            LilacChip(text: "из \(Money.number(screen.limit.amount))", systemImage: "pencil", highlighted: screen.limit.changed, action: editLimit)
                .accessibilityIdentifier("week-limit")
                .accessibilityLabel("Бюджет недели \(Money.text(screen.limit.amount, screen.symbol))")
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
            LilacAmount(amount: r.amount, symbol: screen.symbol, size: 27).padding(.top, 4)
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
            LilacAmount(amount: figure.amount, symbol: screen.symbol, size: 18, weight: .semibold)
            Text(figure.label).font(.subheadline).foregroundStyle(Lilac.muted)
        }
    }

    private var divider: some View {
        Rectangle().fill(Lilac.hairline).frame(height: 0.5).padding(.vertical, 10)
    }
}

/// Under the circle: what was spent today (in a past week, in all of it) with when the data came from ZenMoney, and how
/// many expenses wait for a category, which opens «Разобрать».
struct HomeFooter: View {
    let home: WeekHome
    let symbol: String
    let syncing: Bool
    let openSpending: (() -> Void)?
    let sync: () -> Void
    let openSort: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Rectangle().fill(Lilac.hairline).frame(height: 0.5)
            HStack(alignment: .center, spacing: 18) {
                if let spent = home.spent {
                    VStack(alignment: .leading, spacing: 8) {
                        Button { openSpending?() } label: {
                            VStack(alignment: .leading, spacing: 4) {
                                Text(spent.label).font(.subheadline).foregroundStyle(Lilac.muted)
                                LilacAmount(amount: spent.amount, symbol: symbol, size: 24)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("spent")
                        if let synced = home.synced {
                            Button(action: sync) {
                                HStack(spacing: 6) {
                                    Image(systemName: "arrow.triangle.2.circlepath")
                                        .rotationEffect(.degrees(syncing ? 360 : 0))
                                        .animation(syncing ? .linear(duration: 1).repeatForever(autoreverses: false) : .default, value: syncing)
                                    Text("Обновлено \(Dates.moment(synced))").monospacedDigit()
                                }
                                .font(.footnote)
                                .foregroundStyle(Lilac.muted)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Обновлено \(Dates.moment(synced)), обновить")
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    Rectangle().fill(Lilac.hairline).frame(width: 0.5, height: 72)
                }
                Button(action: openSort) {
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            if home.pending.count > 0 {
                                Text("\(home.pending.count)").font(.system(size: 30, weight: .bold)).monospacedDigit()
                            } else {
                                Image(systemName: "checkmark.circle.fill").font(.system(size: 26)).foregroundStyle(Lilac.accent)
                            }
                            Text(home.pending.label)
                                .font(.subheadline)
                                .foregroundStyle(Lilac.muted)
                                .lineLimit(2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        Spacer(minLength: 0)
                        Image(systemName: "chevron.right").font(.body.weight(.medium)).foregroundStyle(Lilac.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("pending")
            }
            .padding(.vertical, 16)
        }
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
                            marker: .dot(Palette.color(expense.row.color)),
                            title: expense.row.title,
                            details: expense.row.details,
                            amount: expense.row.amount,
                            symbol: screen.symbol,
                            chip: Self.chip(expense.row.mark),
                            muted: expense.row.muted,
                            first: index == 0,
                            chevron: false
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

/// The plan of the week opened on the main page, as «Зарезервировано».
struct ReservedView: View {
    let week: String?
    @Binding var sheet: BudgetSheet?
    @Environment(\.tabBarHeight) private var tabBarHeight

    var body: some View {
        Screen(path: "week", query: ["week": week]) { (s: WeekScreen) in
            ScrollView {
                PlanContent(screen: s, sheet: $sheet)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
        }
        .safeAreaPadding(.bottom, tabBarHeight)
        .background(LilacBackground())
        .lilacTitle("Зарезервировано")
    }
}

/// What a week's plan holds: what is reserved, required and flexible, with the purchases from the week's money, then the
/// ones from the extras, the regular payments of the week and, in the current week, the wishes. «+» adds a purchase to
/// the week or to the extras, or a wish.
struct PlanContent: View {
    let screen: WeekScreen
    @Binding var sheet: BudgetSheet?
    @Environment(Session.self) private var session
    @State private var error: String?

    var body: some View {
        let s = screen
        let r = s.home.reserved
        let fromWeek = s.plan.filter { $0.purchase?.envelope == "week" }
        let fromExtras = s.plan.filter { $0.purchase?.envelope == "extra" }
        let regular = s.plan.filter { $0.regular != nil }
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
            if let wishes = s.wishes {
                LilacHeading(title: "Хочу купить") {
                    LilacRoundButton(systemImage: "plus", label: "Добавить желание") { sheet = .wish(nil) }
                }
                ForEach(Array(wishes.enumerated()), id: \.element.id) { index, item in
                    Button { sheet = .wish(item) } label: {
                        LilacRow(marker: .symbol("sparkles", Palette.week), title: item.row.title, details: item.row.details, amount: item.row.amount,
                                 symbol: s.symbol, first: index == 0) {
                            if item.plannable {
                                LilacInlineAction(label: "Запланировать") { run { try await session.send("wishes/\(item.wish.id)/plan") } }
                            }
                        }
                    }
                    .buttonStyle(.card)
                }
                if wishes.isEmpty { LilacAddRow(label: "Добавить желание") { sheet = .wish(nil) } }
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

    private func run(_ change: @escaping () async throws -> Void) {
        Task {
            do { try await change() } catch { self.error = error.localizedDescription }
        }
    }
}

/// A row of a plan: a purchase opens its form and finishes from its menu, a regular payment opens the regular expense.
/// A required purchase is a violet dot, a flexible one a ring; what is bought or paid has a tick.
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
            if let purchase = item.purchase {
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
            if let purchase = item.purchase, item.finishable {
                Button("Завершить: остаток вернётся", systemImage: "checkmark") {
                    Task {
                        do { try await session.send("purchases/\(purchase.id)/done") } catch { self.error = error.localizedDescription }
                    }
                }
            }
        }
    }

    private var marker: LilacMarker {
        if let purchase = item.purchase {
            if item.row.muted { return .symbol("checkmark", Lilac.muted) }
            return purchase.kind == "required" ? .dot(Lilac.accent) : .ring(Lilac.accent)
        }
        return item.row.icon == "check" ? .symbol("checkmark", Palette.color("green")) : .ring(Lilac.muted)
    }
}

/// The «План» tab: the plan of a week, stepping back and forth from the current one.
struct PlanView: View {
    @State private var week: String?
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
