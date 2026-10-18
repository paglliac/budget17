import SwiftUI

/// The extras of a month, after the user's picture of 2026-10-18, opened from their card on the main page, their widget
/// and the month: the month to step through, «Дополнительные» with «+», what is free large «из 100 000 ₽» — red «не
/// хватает» when the plan holds more than is left —, the bar of what was spent, what is planned and what is free,
/// «Подробнее» with the dot of how the month stands, which opens the expenses (see ExtrasDetailsView), and what the plan
/// still holds, each opening its purchase or wish.
struct ExtrasView: View {
    /// nil is the current month.
    @State var month: String?
    @Binding var sheet: BudgetSheet?
    @State private var error: String?
    @Environment(\.tabBarHeight) private var tabBarHeight

    var body: some View {
        Screen(path: "extras", query: ["month": month]) { (s: ExtrasScreen) in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    stepper(s)
                    LilacTitle(text: "Дополнительные") {
                        LilacRoundButton(systemImage: "plus", label: "Добавить в дополнительные") {
                            sheet = .purchase(PurchaseDraft(purchase: nil, week: s.newPurchaseWeek, envelope: "extra", choices: s.weekChoices, actions: [], symbol: s.symbol))
                        }
                    }
                    .padding(.top, 10)
                    free(s).padding(.top, 6)
                    LilacShareBar(parts: s.bar, unlabeled: ["Свободно"]).padding(.top, 18)
                    HStack {
                        Spacer()
                        NavigationLink(value: HomeRoute.extrasDetails(month)) {
                            HStack(spacing: 6) {
                                Circle().fill(ExtrasDetailsView.stateColor(s.free.state)).frame(width: 8, height: 8)
                                Text("Подробнее").font(.subheadline.weight(.medium)).foregroundStyle(Lilac.muted)
                                Image(systemName: "chevron.right").font(.footnote.weight(.semibold)).foregroundStyle(Lilac.muted)
                            }
                            .padding(.vertical, 6)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("extras-details")
                    }
                    .padding(.top, 10)
                    if !s.plan.items.isEmpty {
                        LilacHeading(s.plan.label)
                        ForEach(Array(s.plan.items.enumerated()), id: \.element.id) { index, item in
                            PlanRow(item: item, symbol: s.symbol, choices: s.weekChoices, first: index == 0, sheet: $sheet, error: $error)
                        }
                    }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
        }
        .safeAreaPadding(.bottom, tabBarHeight)
        .background(LilacBackground())
        .lilacBackBar()
        .errorAlert($error)
    }

    /// The month between the steps to the one before and after.
    private func stepper(_ s: ExtrasScreen) -> some View {
        HStack(spacing: 18) {
            step("chevron.left", label: "Раньше", to: s.prev, s).accessibilityIdentifier("extras-prev")
            Text(s.title).font(.title3.weight(.medium)).monospacedDigit().contentTransition(.numericText())
            step("chevron.right", label: "Позже", to: s.next, s).accessibilityIdentifier("extras-next")
        }
        .padding(.top, 4)
    }

    private func step(_ systemImage: String, label: String, to target: Option?, _ s: ExtrasScreen) -> some View {
        Button {
            if let target { withAnimation(.snappy) { month = target.value == s.thisMonth ? nil : target.value } }
        } label: {
            Image(systemName: systemImage).font(.body.weight(.semibold)).foregroundStyle(target == nil ? Lilac.muted.opacity(0.4) : Color.primary)
                .frame(width: 28, height: 28)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(target == nil)
        .accessibilityLabel(label)
    }

    /// What is free large, «свободно из 100 000 ₽»; what is lacking red.
    private func free(_ s: ExtrasScreen) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            LilacAmount(amount: s.free.amount, symbol: s.symbol, size: 56, weight: .heavy, color: s.free.state == "short" ? Lilac.red : nil)
            Text([s.free.label, s.free.note].compactMap { $0 }.joined(separator: " ")).font(.title3).foregroundStyle(Lilac.muted)
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("extras-free")
    }
}

/// The extras of a month in detail, after the user's picture of 2026-10-18, opened from «Подробнее» of their page: the
/// month to pick with what is free beside it, its dot telling how the month stands, then what was spent, by the plan and
/// without one, the expenses by day, and what the plan still holds. An expense the plan had says what its purchase was
/// planned at, and the one that bought it how far over the plan it went, red, or under it, green; one without a plan has
/// a calendar struck through. «+» adds a purchase to the extras.
struct ExtrasDetailsView: View {
    /// nil is the current month.
    @State var month: String?
    @Binding var sheet: BudgetSheet?
    @State private var error: String?
    @Environment(\.tabBarHeight) private var tabBarHeight

    var body: some View {
        Screen(path: "extras", query: ["month": month]) { (s: ExtrasScreen) in
            ScrollView {
                VStack(alignment: .leading, spacing: 0) {
                    header(s)
                    Rectangle().fill(Lilac.hairline).frame(height: 0.5).padding(.top, 14)
                    spent(s).padding(.top, 14)
                    if s.days.isEmpty && s.plan.items.isEmpty {
                        Text("Трат пока нет.").font(.subheadline).foregroundStyle(Lilac.muted).padding(.vertical, 18)
                    }
                    ForEach(s.days, id: \.date) { day in
                        LilacDayHeading(title: day.title, subtitle: day.subtitle)
                        ForEach(Array(day.items.enumerated()), id: \.element.id) { index, expense in
                            row(expense, symbol: s.symbol, first: index == 0)
                        }
                    }
                    if !s.plan.items.isEmpty { plan(s) }
                }
                .padding(.horizontal, 20)
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .lilacBarButton(systemImage: "plus", label: "Добавить в дополнительные") {
                sheet = .purchase(PurchaseDraft(purchase: nil, week: s.newPurchaseWeek, envelope: "extra", choices: s.weekChoices, actions: [], symbol: s.symbol))
            }
        }
        .safeAreaPadding(.bottom, tabBarHeight)
        .background(LilacBackground())
        .lilacTitle("Дополнительные")
        .errorAlert($error)
    }

    /// The month as a menu of the others, and what is free with the dot of how the month stands; under the month when
    /// they do not fit side by side.
    private func header(_ s: ExtrasScreen) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                monthMenu(s)
                Spacer(minLength: 8)
                free(s)
            }
            VStack(alignment: .leading, spacing: 8) {
                monthMenu(s)
                free(s)
            }
        }
        .padding(.top, 6)
    }

    private func monthMenu(_ s: ExtrasScreen) -> some View {
        Menu {
            Picker("Месяц", selection: Binding(get: { s.month }, set: { picked in
                withAnimation(.snappy) { month = picked == s.thisMonth ? nil : picked }
            })) {
                ForEach(s.months, id: \.value) { option in Text(option.label).tag(option.value) }
            }
        } label: {
            HStack(spacing: 6) {
                Text(s.title).font(.title2.weight(.bold)).foregroundStyle(Color.primary)
                Image(systemName: "chevron.down").font(.subheadline.weight(.semibold)).foregroundStyle(Lilac.muted)
            }
            .lineLimit(1)
            .fixedSize()
        }
        .accessibilityIdentifier("extras-month")
    }

    private func free(_ s: ExtrasScreen) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 6) {
            Circle().fill(Self.stateColor(s.free.state)).frame(width: 8, height: 8).alignmentGuide(.firstTextBaseline) { $0.height }
            Text(s.free.label).font(.subheadline).foregroundStyle(Lilac.muted)
            Text(Money.text(s.free.amount, s.symbol))
                .font(.body.weight(.bold))
                .monospacedDigit()
                .foregroundStyle(s.free.state == "short" ? Lilac.red : Color.primary)
                .contentTransition(.numericText(value: s.free.amount))
        }
        .lineLimit(1)
        .fixedSize()
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("extras-details-free")
    }

    /// The dot of how the month stands: plenty, calm, tight or short.
    static func stateColor(_ state: String) -> Color {
        switch state {
        case "plenty": Palette.color("green")
        case "tight": Palette.optional
        case "short": Lilac.red
        default: Lilac.accent
        }
    }

    /// What was spent, and how much of it by the plan and without one.
    private func spent(_ s: ExtrasScreen) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(s.spent.label).font(.title2.weight(.bold))
                Spacer(minLength: 8)
                LilacAmount(amount: s.spent.amount, symbol: s.symbol, size: 24)
            }
            HStack(spacing: 10) {
                part(s.spent.byPlan, symbol: s.symbol)
                Rectangle().fill(Lilac.hairline).frame(width: 1, height: 16)
                HStack(spacing: 6) {
                    LilacNoPlan()
                    part(s.spent.unplanned, symbol: s.symbol)
                }
            }
            .lineLimit(1)
            .minimumScaleFactor(0.75)
        }
        .accessibilityElement(children: .combine)
    }

    private func part(_ figure: Figure, symbol: String) -> some View {
        HStack(spacing: 5) {
            Text(figure.label).foregroundStyle(Lilac.muted)
            Text(Money.text(figure.amount, symbol)).fontWeight(.semibold).foregroundStyle(Lilac.muted).monospacedDigit()
        }
        .font(.subheadline)
    }

    /// An expense: what its purchase was planned at and how far over or under it went, or the struck calendar.
    private func row(_ expense: Expense, symbol: String, first: Bool) -> some View {
        Button { sheet = .spending(expense.spending) } label: {
            LilacRow(
                marker: .expense(expense.row),
                title: expense.row.title,
                details: expense.row.details,
                amount: expense.row.amount,
                symbol: symbol,
                first: first,
                chevron: false,
                amountColor: expense.optional ? Palette.optional : .primary,
                unplanned: expense.planned == false,
                amountNote: expense.over.map { over in (Money.text(over, symbol, sign: true), over > 0 ? Lilac.red : Palette.color("green")) }
            )
        }
        .buttonStyle(.card)
        .accessibilityIdentifier(expense.id)
    }

    /// What the plan still holds, each opening its purchase or wish.
    @ViewBuilder
    private func plan(_ s: ExtrasScreen) -> some View {
        LilacHeading(title: s.plan.label) {
            LilacAmount(amount: s.plan.amount, symbol: s.symbol, size: 20)
        }
        ForEach(Array(s.plan.items.enumerated()), id: \.element.id) { index, item in
            PlanRow(item: item, symbol: s.symbol, choices: s.weekChoices, first: index == 0, sheet: $sheet, error: $error)
        }
    }
}

extension View {
    /// A pushed page whose title is on the page itself: only the back chevron in its bar.
    func lilacBackBar() -> some View {
        #if os(iOS)
        self
            .navigationBarTitleDisplayMode(.inline)
            .toolbarRole(.editor)
            .toolbar(.visible, for: .navigationBar)
        #else
        self
        #endif
    }

    /// A button at the end of a pushed page's bar, such as «+».
    func lilacBarButton(systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        #if os(iOS)
        toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button(action: action) { Image(systemName: systemImage).font(.system(size: 17, weight: .medium)) }
                    .tint(Color.primary)
                    .accessibilityLabel(label)
                    .accessibilityIdentifier("bar-\(systemImage)")
            }
        }
        #else
        self
        #endif
    }
}
