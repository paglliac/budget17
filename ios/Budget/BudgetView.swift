import SwiftUI

/// The main tab: the week or the month, as «Неделя» and «Месяц» switch them, each stepping back and forth.
struct BudgetView: View {
    enum Mode: Hashable { case week, month }

    /// Opens the expenses that wait for a category, among the operations.
    let openPending: () -> Void
    @State private var mode = Mode.week
    /// nil is the current week or month.
    @State private var week: String?
    @State private var month: String?
    @State private var sheet: BudgetSheet?

    var body: some View {
        Group {
            switch mode {
            case .week: HomeView(mode: $mode, week: $week, sheet: $sheet, openPending: openPending)
            case .month: MonthView(mode: $mode, month: $month, sheet: $sheet) { opened in
                week = opened
                mode = .week
            }
            }
        }
        .budgetSheets($sheet)
    }
}

/// The month: where its income goes, its weeks, each opening its week, and its extras with their purchases and the
/// spending moved there.
struct MonthView: View {
    @Binding var mode: BudgetView.Mode
    @Binding var month: String?
    @Binding var sheet: BudgetSheet?
    let openWeek: (String) -> Void

    var body: some View {
        Screen(path: "month", query: ["month": month]) { (s: MonthScreen) in
            GeometryReader { geometry in
                ScrollView {
                    VStack(alignment: .leading, spacing: 0) {
                        HStack(spacing: 8) {
                            ModeSwitch(mode: $mode)
                            Spacer(minLength: 8)
                            LilacRoundButton(systemImage: "chevron.left", label: "Раньше") { go(s.prev.value, s) }
                            LilacRoundButton(systemImage: "chevron.right", label: "Позже") { if let next = s.next { go(next.value, s) } }
                                .disabled(s.next == nil)
                        }
                        .padding(.top, 6)
                        HStack {
                            Text(s.title).font(.title3.weight(.semibold))
                            Spacer()
                            if s.month != s.thisMonth { LilacChip(text: "Сейчас") { month = nil } }
                        }
                        .padding(.top, 14)
                        if let flow = s.flow {
                            IncomeFlow(flow: flow, symbol: s.symbol).padding(.top, 12)
                        }
                        weeks(s)
                        extras(s)
                    }
                    .padding(.horizontal, 20)
                    .padding(.bottom, 24)
                }
                .scrollIndicators(.hidden)
                .overlay(alignment: .top) { TopFade(height: geometry.safeAreaInsets.top) }
            }
        }
        .background(LilacBackground())
    }

    private func go(_ target: String, _ s: MonthScreen) {
        withAnimation(.snappy) { month = target == s.thisMonth ? nil : target }
    }

    @ViewBuilder
    private func weeks(_ s: MonthScreen) -> some View {
        LilacHeading("Недели")
        ForEach(Array(s.weeks.enumerated()), id: \.element.id) { index, line in
            Button { openWeek(line.week) } label: {
                LilacRow(marker: .dot(Palette.color(line.row.color)), title: line.row.title, details: line.row.details, amount: line.row.amount,
                         symbol: s.symbol, first: index == 0)
            }
            .buttonStyle(.card)
            .accessibilityIdentifier(line.id)
        }
    }

    @ViewBuilder
    private func extras(_ s: MonthScreen) -> some View {
        LilacHeading(title: "Дополнительные") {
            LilacRoundButton(systemImage: "plus", label: "Добавить в дополнительные") {
                sheet = .purchase(PurchaseDraft(purchase: nil, week: s.newPurchaseWeek, envelope: "extra", choices: s.weekChoices, actions: [], symbol: s.symbol))
            }
        }
        LilacSummary(label: nil, amount: s.total.amount, symbol: s.symbol, note: s.total.note, size: 26)
        LilacShareBar(parts: s.total.parts ?? []).padding(.top, 12).padding(.bottom, 4)
        ForEach(Array(s.purchases.enumerated()), id: \.element.id) { index, item in
            PlanRow(item: item, symbol: s.symbol, choices: s.weekChoices, first: index == 0, sheet: $sheet, error: .constant(nil))
        }
        ForEach(s.spending, id: \.date) { group in
            LilacDayHeading(title: group.title, subtitle: group.subtitle)
            ForEach(Array(group.items.enumerated()), id: \.element.id) { index, expense in
                Button { sheet = .spending(expense.spending) } label: {
                    LilacRow(marker: .dot(Palette.color(expense.row.color)), title: expense.row.title, details: expense.row.details,
                             amount: expense.row.amount, symbol: s.symbol, first: index == 0, chevron: false)
                }
                .buttonStyle(.card)
            }
        }
    }
}

/// A month's income and where it goes, as lilac ribbons from the income to each part: the regular payments, the weeks'
/// budgets, the extras, and savings, the widest at the bottom. What is short of money has no ribbon and is red.
struct IncomeFlow: View {
    let flow: Flow
    let symbol: String

    private let height: CGFloat = 340

    var body: some View {
        GeometryReader { geometry in
            let w = geometry.size.width
            let nodeX = w * 0.5
            let ys = nodeYs
            ZStack(alignment: .topLeading) {
                Canvas { context, _ in
                    var top = sourceTop
                    for (index, part) in flow.parts.enumerated() where part.share > 0 {
                        let thickness = max(maxThickness * part.share, 4)
                        let start = CGPoint(x: w * 0.06, y: top)
                        top += thickness
                        let end = ys[index]
                        let middle = (start.x + nodeX) / 2
                        var path = Path()
                        path.move(to: start)
                        path.addCurve(to: CGPoint(x: nodeX, y: end - thickness / 2), control1: CGPoint(x: middle, y: start.y), control2: CGPoint(x: middle, y: end - thickness / 2))
                        path.addLine(to: CGPoint(x: nodeX, y: end + thickness / 2))
                        path.addCurve(to: CGPoint(x: start.x, y: top), control1: CGPoint(x: middle, y: end + thickness / 2), control2: CGPoint(x: middle, y: top))
                        path.closeSubpath()
                        context.fill(path, with: .linearGradient(
                            Gradient(colors: [Lilac.tint.opacity(0.3), Lilac.soft.opacity(0.85 - Double(index) * 0.1)]),
                            startPoint: CGPoint(x: start.x, y: 0), endPoint: CGPoint(x: nodeX, y: 0)
                        ))
                    }
                }
                ForEach(Array(flow.parts.enumerated()), id: \.offset) { index, part in
                    node(index: index, part: part)
                        .position(x: nodeX, y: ys[index])
                    label(part)
                        .frame(width: w * 0.5 - 18, alignment: .leading)
                        .position(x: nodeX + 18 + (w * 0.5 - 18) / 2, y: ys[index])
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(flow.income.label).font(.callout)
                    LilacAmount(amount: flow.income.amount, symbol: symbol, size: 30)
                    Text(flow.income.note).font(.subheadline).foregroundStyle(Lilac.muted)
                }
                .frame(width: w * 0.46, alignment: .leading)
                .position(x: w * 0.23, y: height * 0.86)
            }
        }
        .frame(height: height)
        .accessibilityElement(children: .combine)
    }

    /// Where the parts end, top to bottom, the last one lower for its wider ribbon.
    private var nodeYs: [CGFloat] { [0.09, 0.30, 0.50, 0.70].map { $0 * height } }

    private var maxThickness: CGFloat { height * 0.36 }

    /// The ribbons start stacked on the left, around the middle.
    private var sourceTop: CGFloat {
        let positive = flow.parts.reduce(0) { $0 + max($1.share, 0) }
        return height * 0.46 - maxThickness * min(positive, 1) / 2
    }

    @ViewBuilder
    private func node(index: Int, part: Flow.Part) -> some View {
        let last = index == flow.parts.count - 1 && part.share > 0
        ZStack {
            Circle().fill(Lilac.tint).frame(width: last ? 44 : 24, height: last ? 44 : 24)
            Circle().fill(part.share > 0 ? Lilac.accent.opacity(0.8) : Lilac.red).frame(width: last ? 16 : 9, height: last ? 16 : 9)
        }
    }

    private func label(_ part: Flow.Part) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(part.label).font(.caption).foregroundStyle(Lilac.muted).lineLimit(1).minimumScaleFactor(0.8)
            Text(Money.text(part.amount, symbol))
                .font(.system(size: 19, weight: .bold))
                .monospacedDigit()
                .foregroundStyle(part.amount < 0 ? Lilac.red : Color.primary)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
            if part.share > 0 {
                Text("\(Int((part.share * 100).rounded()))%").font(.caption).foregroundStyle(Lilac.muted).monospacedDigit()
            }
        }
    }
}
